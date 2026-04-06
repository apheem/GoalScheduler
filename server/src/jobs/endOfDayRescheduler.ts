import cron from 'node-cron';
import { eq, lt, and } from 'drizzle-orm';
import { db } from '../db';
import { tasks, workingHours } from '../db/schema';
import { scheduleTasks } from '../services/schedulerService';
import { getEventsInRange, updateEvent } from '../services/calendarService';
import { addDays, endOfDay, formatISO } from 'date-fns';
import type { WorkingHours } from '../../../shared/types';

const MAX_RESCHEDULES = 3;

export async function runRescheduler() {
  console.log('[rescheduler] Running end-of-day reschedule check...');

  const todayEnd = endOfDay(new Date()).getTime();

  // Find tasks that were scheduled for today or earlier and are still 'scheduled'
  const overdueTasks = db
    .select()
    .from(tasks)
    .where(eq(tasks.status, 'scheduled'))
    .all()
    .filter((t) => {
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
      }
    : { startHour: 9, endHour: 18, workDays: [1, 2, 3, 4, 5], timezone: 'America/Chicago' };

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
  const allScheduledTasks = db.select().from(tasks).where(eq(tasks.status, 'scheduled')).all();

  // Walk dependency chains forward
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

  // Fetch calendar events for the next 14 days
  const now = new Date();
  const rangeEnd = addDays(now, 14);
  const existingEvents = await getEventsInRange(formatISO(now), formatISO(rangeEnd));

  // Filter out events belonging to tasks we're about to reschedule
  const reschedulingEventIds = new Set(
    tasksToReschedule.map((t) => t.googleCalendarEventId).filter(Boolean)
  );
  const otherEvents = existingEvents.filter(
    (e) => !reschedulingEventIds.has(e.start) // can't filter by id here, just keep all for safety
  );

  const { scheduled, unschedulable } = scheduleTasks(
    tasksToReschedule.map((t) => ({
      id: t.id,
      estimatedMinutes: t.estimatedMinutes,
      maxBlockMinutes: t.maxBlockMinutes ?? null,
      priority: (t.priority as 'high' | 'medium' | 'low') ?? 'medium',
      deadline: null,
      dependsOnTaskId: t.dependsOnTaskId,
      order: t.order,
    })),
    existingEvents,
    workingHoursConfig,
    now
  );

  // Group blocks by task
  const blocksByTask = new Map<string, typeof scheduled>();
  for (const b of scheduled) {
    if (!blocksByTask.has(b.taskId)) blocksByTask.set(b.taskId, []);
    blocksByTask.get(b.taskId)!.push(b);
  }

  for (const [taskId, blocks] of blocksByTask) {
    const task = tasksToReschedule.find((t) => t.id === taskId)!;
    const firstBlock = blocks[0];
    const lastBlock = blocks[blocks.length - 1];

    // Update Google Calendar event in-place if it exists
    if (task.googleCalendarEventId) {
      await updateEvent({
        eventId: task.googleCalendarEventId,
        start: firstBlock.start,
        end: lastBlock.end,
      });
    }

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
