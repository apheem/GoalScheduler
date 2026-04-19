import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { addDays, formatISO } from 'date-fns';
import { db } from '../db';
import { tasks, taskBlocks, workingHours, projects, people } from '../db/schema';
import { scheduleTasks } from '../services/schedulerService';
import { getEventsInRange, createEvent } from '../services/calendarService';
import { getConnectedCalendars, MAIN_CALENDAR } from '../services/googleAuthService';
import type { Priority, WorkingHours } from '../../../shared/types';

// ─── Helpers ─────────────────────────────────────────────────────────────

// Date string (YYYY-MM-DD) for the user's local timezone of "now"
function todayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Spawner ─────────────────────────────────────────────────────────────

/**
 * Find every recurring template whose recurrenceDays include today's weekday
 * and which hasn't been spawned today. Clone each into a one-off task instance
 * scoped to today, then run the scheduler to slot them into the calendar.
 */
export async function spawnDailyRecurringTasks(now: Date = new Date()): Promise<void> {
  const today = todayIsoDate(now);
  const dayOfWeek = now.getDay(); // 0=Sun..6=Sat

  console.log(`[recurring] Checking recurring templates for ${today} (day ${dayOfWeek})...`);

  const templates = db
    .select()
    .from(tasks)
    .all()
    .filter((t) => t.isRecurringTemplate && t.recurrenceDays);

  const dueTemplates = templates.filter((t) => {
    const days: number[] = JSON.parse(t.recurrenceDays!);
    if (!days.includes(dayOfWeek)) return false;
    if (t.lastSpawnedDate === today) return false;
    return true;
  });

  if (!dueTemplates.length) {
    console.log('[recurring] No templates due today.');
    return;
  }

  console.log(`[recurring] Spawning ${dueTemplates.length} instance(s).`);

  const newInstanceIds: string[] = [];

  for (const template of dueTemplates) {
    const instanceId = uuidv4();
    db.insert(tasks).values({
      id: instanceId,
      projectId: template.projectId,
      title: template.title,
      estimatedMinutes: template.estimatedMinutes,
      maxBlockMinutes: template.maxBlockMinutes,
      priority: template.priority,
      status: 'confirmed',
      order: template.order,
      dependsOnTaskId: null, // instances stand alone
      deadline: today,       // must fit today
      startDate: today,      // can't start earlier
      assigneeIds: template.assigneeIds,
      allowedDays: null,     // already scoped to today via startDate/deadline
      allowedStartHour: template.allowedStartHour,
      allowedEndHour: template.allowedEndHour,
      rescheduleCount: 0,
      recurrenceDays: null,
      isRecurringTemplate: 0,
      recurringTemplateId: template.id,
    }).run();

    db.update(tasks)
      .set({ lastSpawnedDate: today })
      .where(eq(tasks.id, template.id))
      .run();

    newInstanceIds.push(instanceId);
  }

  await scheduleInstances(newInstanceIds);
}

/**
 * Run the scheduler for the given newly-spawned instance IDs and create
 * calendar events / task blocks for the slots it finds.
 */
async function scheduleInstances(instanceIds: string[]): Promise<void> {
  if (!instanceIds.length) return;

  const instances = db.select().from(tasks).all().filter((t) => instanceIds.includes(t.id));
  if (!instances.length) return;

  const wh = db.select().from(workingHours).get();
  const workingHoursConfig: WorkingHours = wh
    ? {
        startHour: wh.startHour,
        endHour: wh.endHour,
        workDays: JSON.parse(wh.workDays),
        timezone: wh.timezone,
        maxMinutesPerDay: wh.maxMinutesPerDay ?? 240,
      }
    : { startHour: 9, endHour: 18, workDays: [0, 1, 2, 3, 4, 5, 6], timezone: 'America/Chicago', maxMinutesPerDay: 240 };

  const projectMap = new Map(db.select().from(projects).all().map((p) => [p.id, p]));
  const peopleMap = new Map(db.select().from(people).all().map((p) => [p.id, p]));

  const now = new Date();
  const rangeEnd = addDays(now, 2); // we only care about today, but buffer a bit
  const existingEvents = await getEventsInRange(formatISO(now), formatISO(rangeEnd));

  const toSchedule = instances.map((t) => {
    const proj = projectMap.get(t.projectId);
    const taskAssigneeIds: string[] = t.assigneeIds ? JSON.parse(t.assigneeIds) : t.assigneeId ? [t.assigneeId] : [];
    const allAssignees = taskAssigneeIds.map((id) => peopleMap.get(id)).filter(Boolean);

    let effectiveDays: number[] | null = null; // don't restrict by weekday — deadline/startDate already pin to today
    let effectiveStartHour = proj?.allowedStartHour ?? null;
    let effectiveEndHour = proj?.allowedEndHour ?? null;
    let effectiveMaxPerDay: number | null = null;

    if (allAssignees.length > 0) {
      if (effectiveStartHour == null) effectiveStartHour = Math.max(...allAssignees.map((a) => a!.startHour));
      if (effectiveEndHour == null) effectiveEndHour = Math.min(...allAssignees.map((a) => a!.endHour));
      effectiveMaxPerDay = Math.min(...allAssignees.map((a) => a!.maxMinutesPerDay));
    }

    if (t.allowedStartHour != null) effectiveStartHour = t.allowedStartHour;
    if (t.allowedEndHour != null) effectiveEndHour = t.allowedEndHour;

    return {
      id: t.id,
      estimatedMinutes: t.estimatedMinutes,
      maxBlockMinutes: t.maxBlockMinutes ?? null,
      priority: (t.priority as Priority) ?? 'medium',
      deadline: t.deadline,
      startDate: t.startDate,
      dependsOnTaskId: null,
      order: t.order,
      allowedDays: effectiveDays,
      allowedStartHour: effectiveStartHour,
      allowedEndHour: effectiveEndHour,
      assigneeKeys: taskAssigneeIds.length ? taskAssigneeIds : undefined,
      maxMinutesPerDay: effectiveMaxPerDay,
      projectPriority: proj?.projectPriority ?? 3,
    };
  });

  // Use a scheduler config that allows every day of the week — startDate/deadline already pin us to today
  const allDaysConfig: WorkingHours = { ...workingHoursConfig, workDays: [0, 1, 2, 3, 4, 5, 6] };

  const { scheduled, unschedulable } = scheduleTasks(toSchedule, existingEvents, allDaysConfig, now, 2);

  const connectedCalendars = await getConnectedCalendars();

  const blocksByTask = new Map<string, typeof scheduled>();
  for (const b of scheduled) {
    if (!blocksByTask.has(b.taskId)) blocksByTask.set(b.taskId, []);
    blocksByTask.get(b.taskId)!.push(b);
  }

  for (const [taskId, blocks] of blocksByTask) {
    const task = instances.find((t) => t.id === taskId)!;
    const taskAssigneeIds: string[] = task.assigneeIds ? JSON.parse(task.assigneeIds) : task.assigneeId ? [task.assigneeId] : [];
    const blockLabel = (i: number, total: number) => (total > 1 ? ` (part ${i + 1}/${total})` : '');

    const targetCalendars = taskAssigneeIds.length ? taskAssigneeIds.filter((id) => connectedCalendars.includes(id)) : [];
    if (!targetCalendars.length && connectedCalendars.includes(MAIN_CALENDAR)) targetCalendars.push(MAIN_CALENDAR);

    for (const b of blocks) {
      const calEventMap: Record<string, string> = {};
      if (targetCalendars.length) {
        for (const personId of targetCalendars) {
          try {
            const eventId = await createEvent({
              summary: `${task.title}${blockLabel(b.blockIndex, b.totalBlocks)}`,
              start: b.start,
              end: b.end,
              description: 'Daily recurring task (GoalScheduler)',
              personId,
            });
            if (eventId) calEventMap[personId] = eventId;
          } catch {
            /* skip */
          }
        }
      }
      const calEventJson = Object.keys(calEventMap).length > 0 ? JSON.stringify(calEventMap) : null;

      db.insert(taskBlocks).values({
        id: uuidv4(),
        taskId,
        blockIndex: b.blockIndex,
        totalBlocks: b.totalBlocks,
        scheduledStart: b.start,
        scheduledEnd: b.end,
        googleCalendarEventId: calEventJson,
        status: 'scheduled',
      }).run();
    }

    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    db.update(tasks)
      .set({ status: 'scheduled', scheduledStart: first.start, scheduledEnd: last.end })
      .where(eq(tasks.id, taskId))
      .run();

    console.log(`[recurring] Scheduled "${task.title}" at ${first.start}`);
  }

  for (const entry of unschedulable) {
    db.update(tasks).set({ status: 'needs_attention' }).where(eq(tasks.id, entry.taskId)).run();
    console.log(`[recurring] No slot for task ${entry.taskId} (${entry.reason}) — needs_attention`);
  }
}

// ─── Cron ────────────────────────────────────────────────────────────────

export function startDailyRecurrenceCron() {
  // Fire at 00:00 every day
  cron.schedule('0 0 * * *', () => {
    spawnDailyRecurringTasks().catch((err) =>
      console.error('[recurring] Cron error:', err)
    );
  });
  console.log('[recurring] Cron job registered (00:00 daily)');
}
