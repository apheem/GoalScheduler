import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { tasks, taskBlocks, workingHours, projects, people } from '../db/schema';
import { scheduleTasks } from '../services/schedulerService';
import { getEventsInRange, createEvent, deleteEvent } from '../services/calendarService';
import { getConnectedCalendars, MAIN_CALENDAR } from '../services/googleAuthService';
import { addDays, endOfDay, formatISO } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import type { WorkingHours, Priority } from '../../../shared/types';

const MAX_RESCHEDULES = 3;

export async function runRescheduler() {
  console.log('[rescheduler] Running end-of-day reschedule check...');

  const todayEnd = endOfDay(new Date()).getTime();

  // Find tasks that were scheduled for today or earlier and are still 'scheduled'
  const overdueTasks = db
    .select()
    .from(tasks)
    .all()
    .filter((t) => {
      if (t.status !== 'scheduled' && t.status !== 'rescheduled') return false;
      if (!t.scheduledStart) return false;
      return new Date(t.scheduledStart).getTime() < todayEnd;
    });

  if (!overdueTasks.length) {
    console.log('[rescheduler] No overdue tasks.');
    return;
  }

  console.log(`[rescheduler] Found ${overdueTasks.length} overdue tasks.`);

  // Get working hours config
  const wh = db.select().from(workingHours).get();
  const workingHoursConfig: WorkingHours = wh
    ? {
        startHour: wh.startHour,
        endHour: wh.endHour,
        workDays: JSON.parse(wh.workDays),
        timezone: wh.timezone,
        maxMinutesPerDay: wh.maxMinutesPerDay ?? 240,
      }
    : { startHour: 9, endHour: 18, workDays: [1, 2, 3, 4, 5], timezone: 'America/Chicago', maxMinutesPerDay: 240 };

  // Separate tasks that have hit the reschedule cap
  const needsAttention = overdueTasks.filter((t) => t.rescheduleCount >= MAX_RESCHEDULES);
  const toReschedule = overdueTasks.filter((t) => t.rescheduleCount < MAX_RESCHEDULES);

  // Mark needs_attention tasks
  for (const t of needsAttention) {
    db.update(tasks)
      .set({ status: 'needs_attention' })
      .where(eq(tasks.id, t.id))
      .run();
    console.log(`[rescheduler] Task "${t.title}" marked needs_attention after ${t.rescheduleCount} reschedules.`);
  }

  if (!toReschedule.length) return;

  // Expand dependency chains: also reschedule tasks that depend on these
  const allTaskIds = new Set(toReschedule.map((t) => t.id));
  const allScheduledTasks = db.select().from(tasks).all()
    .filter((t) => t.status === 'scheduled' || t.status === 'rescheduled');

  let changed = true;
  while (changed) {
    changed = false;
    for (const t of allScheduledTasks) {
      if (t.dependsOnTaskId && allTaskIds.has(t.dependsOnTaskId) && !allTaskIds.has(t.id)) {
        allTaskIds.add(t.id);
        changed = true;
      }
    }
  }

  const tasksToReschedule = allScheduledTasks.filter((t) => allTaskIds.has(t.id));

  // Delete existing calendar events and blocks for these tasks
  const connectedCalendars = await getConnectedCalendars();

  for (const t of tasksToReschedule) {
    const existingBlocks = db.select().from(taskBlocks).where(eq(taskBlocks.taskId, t.id)).all();
    for (const block of existingBlocks) {
      if (block.googleCalendarEventId) {
        let eventMap: Record<string, string> | null = null;
        try {
          const parsed = JSON.parse(block.googleCalendarEventId);
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) eventMap = parsed;
        } catch { /* legacy */ }

        if (eventMap) {
          for (const [personId, eventId] of Object.entries(eventMap)) {
            try { await deleteEvent(eventId, personId); } catch { /* already gone */ }
          }
        } else if (block.googleCalendarEventId) {
          for (const personId of connectedCalendars) {
            try { await deleteEvent(block.googleCalendarEventId, personId); break; } catch { /* try next */ }
          }
        }
      }
    }
    db.delete(taskBlocks).where(eq(taskBlocks.taskId, t.id)).run();
    db.update(tasks).set({ status: 'confirmed', scheduledStart: null, scheduledEnd: null }).where(eq(tasks.id, t.id)).run();
  }

  // Re-read as confirmed
  const confirmedTasks = tasksToReschedule.map((t) => t.id);
  const toScheduleNow = db.select().from(tasks).all()
    .filter((t) => confirmedTasks.includes(t.id) && t.status === 'confirmed');

  // Load project and people data
  const projectMap = new Map(db.select().from(projects).all().map((p) => [p.id, p]));
  const peopleMap = new Map(db.select().from(people).all().map((p) => [p.id, p]));

  // Fetch calendar events for the next 42 days
  const now = new Date();
  const rangeEnd = addDays(now, 42);
  const existingEvents = await getEventsInRange(formatISO(now), formatISO(rangeEnd));

  const { scheduled, unschedulable } = scheduleTasks(
    toScheduleNow.map((t) => {
      const proj = projectMap.get(t.projectId);
      const taskAssigneeIds: string[] = t.assigneeIds ? JSON.parse(t.assigneeIds) : t.assigneeId ? [t.assigneeId] : [];
      const taskAllowedDays = t.allowedDays ? JSON.parse(t.allowedDays) : null;
      const projAllowedDays = proj?.allowedDays ? JSON.parse(proj.allowedDays) : null;
      const allAssignees = taskAssigneeIds.map((id) => peopleMap.get(id)).filter(Boolean);

      let effectiveDays = taskAllowedDays ?? projAllowedDays;
      let effectiveStartHour = proj?.allowedStartHour ?? null;
      let effectiveEndHour = proj?.allowedEndHour ?? null;
      let effectiveMaxPerDay: number | null = null;

      if (allAssignees.length > 0) {
        if (!effectiveDays) {
          let daysSets = allAssignees.map((a) => JSON.parse(a!.workDays) as number[]);
          effectiveDays = daysSets[0].filter((d: number) => daysSets.every((ds) => ds.includes(d)));
        }
        if (effectiveStartHour == null) effectiveStartHour = Math.max(...allAssignees.map((a) => a!.startHour));
        if (effectiveEndHour == null) effectiveEndHour = Math.min(...allAssignees.map((a) => a!.endHour));
        effectiveMaxPerDay = Math.min(...allAssignees.map((a) => a!.maxMinutesPerDay));
      }

      const taskStartHour = t.allowedStartHour ?? null;
      const taskEndHour = t.allowedEndHour ?? null;
      if (taskStartHour != null) effectiveStartHour = taskStartHour;
      if (taskEndHour != null) effectiveEndHour = taskEndHour;

      return {
        id: t.id,
        estimatedMinutes: t.estimatedMinutes,
        maxBlockMinutes: t.maxBlockMinutes ?? null,
        priority: (t.priority as Priority) ?? 'medium',
        deadline: t.deadline ?? proj?.deadline ?? null,
        startDate: t.startDate ?? proj?.startDate ?? null,
        dependsOnTaskId: t.dependsOnTaskId,
        order: t.order,
        allowedDays: effectiveDays,
        allowedStartHour: effectiveStartHour,
        allowedEndHour: effectiveEndHour,
        assigneeKeys: taskAssigneeIds.length ? taskAssigneeIds : undefined,
        maxMinutesPerDay: effectiveMaxPerDay,
        projectPriority: proj?.projectPriority ?? 3,
      };
    }),
    existingEvents,
    workingHoursConfig
  );

  // Persist blocks and create calendar events
  const blocksByTask = new Map<string, typeof scheduled>();
  for (const b of scheduled) {
    if (!blocksByTask.has(b.taskId)) blocksByTask.set(b.taskId, []);
    blocksByTask.get(b.taskId)!.push(b);
  }

  for (const [taskId, blocks] of blocksByTask) {
    const task = toScheduleNow.find((t) => t.id === taskId)!;
    const taskAssigneeIds: string[] = task.assigneeIds ? JSON.parse(task.assigneeIds) : task.assigneeId ? [task.assigneeId] : [];
    const blockLabel = (i: number, total: number) => total > 1 ? ` (part ${i + 1}/${total})` : '';

    const targetCalendars = taskAssigneeIds.length ? taskAssigneeIds.filter((id) => connectedCalendars.includes(id)) : [];
    if (!targetCalendars.length && connectedCalendars.includes(MAIN_CALENDAR)) targetCalendars.push(MAIN_CALENDAR);

    for (const b of blocks) {
      const calEventMap: Record<string, string> = {};
      if (targetCalendars.length) {
        for (const personId of targetCalendars) {
          try {
            const eventId = await createEvent({ summary: `${task.title}${blockLabel(b.blockIndex, b.totalBlocks)}`, start: b.start, end: b.end, description: 'Rescheduled by GoalScheduler', personId });
            if (eventId) calEventMap[personId] = eventId;
          } catch { /* skip */ }
        }
      }
      const calEventJson = Object.keys(calEventMap).length > 0 ? JSON.stringify(calEventMap) : null;
      db.insert(taskBlocks).values({ id: uuidv4(), taskId, blockIndex: b.blockIndex, totalBlocks: b.totalBlocks, scheduledStart: b.start, scheduledEnd: b.end, googleCalendarEventId: calEventJson, status: 'scheduled' }).run();
    }

    const firstBlock = blocks[0];
    const lastBlock = blocks[blocks.length - 1];
    db.update(tasks)
      .set({
        status: 'rescheduled',
        scheduledStart: firstBlock.start,
        scheduledEnd: lastBlock.end,
        rescheduleCount: (task.rescheduleCount ?? 0) + 1,
      })
      .where(eq(tasks.id, taskId))
      .run();

    console.log(`[rescheduler] Rescheduled "${task.title}" to ${firstBlock.start}`);
  }

  for (const entry of unschedulable) {
    const id = typeof entry === 'string' ? entry : entry.taskId;
    const reason = typeof entry === 'string' ? 'no slots' : entry.reason;
    db.update(tasks)
      .set({ status: 'needs_attention' })
      .where(eq(tasks.id, id))
      .run();
    console.log(`[rescheduler] Could not find slot for task ${id} (${reason}) — marked needs_attention`);
  }
}

export function startReschedulerCron() {
  // Fire at 23:00 every night
  cron.schedule('0 23 * * *', () => {
    runRescheduler().catch((err) =>
      console.error('[rescheduler] Cron error:', err)
    );
  });
  console.log('[rescheduler] Cron job registered (23:00 daily)');
}
