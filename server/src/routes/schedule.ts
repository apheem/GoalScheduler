import { Router } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { tasks, projects, workingHours, taskBlocks, people } from '../db/schema';
import { scheduleTasks } from '../services/schedulerService';
import { getEventsInRange, createEvent } from '../services/calendarService';
import { getConnectedCalendars, MAIN_CALENDAR } from '../services/googleAuthService';
import { addDays, formatISO } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import type { ScheduleRequest, Priority } from '../../../shared/types';

const router = Router();

// POST /api/schedule
router.post('/', async (req, res) => {
  const { projectIds, workingHours: wh }: ScheduleRequest = req.body;

  if (!projectIds?.length) {
    return res.status(400).json({ error: 'projectIds is required' });
  }

  try {
    // Include both confirmed and already-scheduled tasks (re-schedule replaces old blocks)
    const allProjectTasks = db
      .select()
      .from(tasks)
      .all()
      .filter((t) => projectIds.includes(t.projectId) && ['confirmed', 'scheduled', 'rescheduled'].includes(t.status));

    if (!allProjectTasks.length) {
      return res.status(400).json({ error: 'No confirmed tasks found' });
    }

    // Clear existing blocks for these tasks before re-scheduling
    // IMPORTANT: also delete the Google Calendar events so they don't leave orphans
    const connectedCalendars = await getConnectedCalendars();
    const { deleteEvent } = await import('../services/calendarService');
    for (const t of allProjectTasks) {
      const existingBlocks = db.select().from(taskBlocks).where(eq(taskBlocks.taskId, t.id)).all();
      for (const block of existingBlocks) {
        if (block.googleCalendarEventId) {
          let eventMap: Record<string, string> | null = null;
          try {
            const parsed = JSON.parse(block.googleCalendarEventId);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              eventMap = parsed;
            }
          } catch { /* legacy format */ }

          if (eventMap) {
            for (const [personId, eventId] of Object.entries(eventMap)) {
              try { await deleteEvent(eventId, personId); } catch { /* already deleted */ }
            }
          } else {
            for (const personId of connectedCalendars) {
              try { await deleteEvent(block.googleCalendarEventId, personId); break; } catch { /* not here */ }
            }
          }
        }
      }
      db.delete(taskBlocks).where(eq(taskBlocks.taskId, t.id)).run();
      if (t.status === 'scheduled' || t.status === 'rescheduled') {
        db.update(tasks).set({ status: 'confirmed', scheduledStart: null, scheduledEnd: null }).where(eq(tasks.id, t.id)).run();
      }
    }

    // Re-read tasks after status reset
    const confirmedTasks = db
      .select()
      .from(tasks)
      .all()
      .filter((t) => projectIds.includes(t.projectId) && t.status === 'confirmed');

    // Load project overrides and people
    const projectMap = new Map(
      db.select().from(projects).all().map((p) => [p.id, p])
    );
    const peopleMap = new Map(
      db.select().from(people).all().map((p) => [p.id, p])
    );

    // Fetch existing calendar events
    const now = new Date();
    const rangeEnd = addDays(now, 42);
    const existingEvents = await getEventsInRange(formatISO(now), formatISO(rangeEnd));

    const defaultWh = wh ?? {
      startHour: 9,
      endHour: 18,
      workDays: [1, 2, 3, 4, 5],
      timezone: 'America/Chicago',
      maxMinutesPerDay: 240,
    };

    const { scheduled, unschedulable } = scheduleTasks(
      confirmedTasks.map((t) => {
        const proj = projectMap.get(t.projectId);
        // Parse assigneeIds — fall back to legacy assigneeId for old rows
        const taskAssigneeIds: string[] = t.assigneeIds
          ? JSON.parse(t.assigneeIds)
          : t.assigneeId
          ? [t.assigneeId]
          : [];
        const taskAllowedDays = t.allowedDays ? JSON.parse(t.allowedDays) : null;
        const projAllowedDays = proj?.allowedDays ? JSON.parse(proj.allowedDays) : null;


        // For multi-assignee tasks: find the INTERSECTION of all assignees' availability
        const allAssignees = taskAssigneeIds.map((id) => peopleMap.get(id)).filter(Boolean);

        let effectiveDays = taskAllowedDays ?? projAllowedDays;
        let effectiveStartHour = proj?.allowedStartHour ?? null;
        let effectiveEndHour = proj?.allowedEndHour ?? null;
        let effectiveMaxPerDay: number | null = null;

        // Task-level hour overrides (from allowedStartHour/allowedEndHour on task itself)
        const taskStartHour = t.allowedStartHour ?? null;
        const taskEndHour = t.allowedEndHour ?? null;

        if (allAssignees.length > 0) {
          // Intersect work days across all assignees
          if (!effectiveDays) {
            let daysSets = allAssignees.map((a) => JSON.parse(a!.workDays) as number[]);
            effectiveDays = daysSets[0].filter((d: number) => daysSets.every((ds) => ds.includes(d)));
          }
          // Use the most restrictive start/end hours (latest start, earliest end)
          if (effectiveStartHour == null) {
            effectiveStartHour = Math.max(...allAssignees.map((a) => a!.startHour));
          }
          if (effectiveEndHour == null) {
            effectiveEndHour = Math.min(...allAssignees.map((a) => a!.endHour));
          }
          // Use the smallest maxMinutesPerDay
          effectiveMaxPerDay = Math.min(...allAssignees.map((a) => a!.maxMinutesPerDay));
        }

        // Task-level hour overrides take precedence
        if (taskStartHour != null) effectiveStartHour = taskStartHour;
        if (taskEndHour != null) effectiveEndHour = taskEndHour;

        return {
          id: t.id,
          estimatedMinutes: t.estimatedMinutes,
          maxBlockMinutes: t.maxBlockMinutes ?? null,
          priority: (t.priority as Priority) ?? 'medium',
          deadline: proj?.deadline ?? null,
          startDate: proj?.startDate ?? null,
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
      defaultWh
    );

    // Persist blocks and create calendar events
    // Group blocks by taskId to set the task's first block as scheduledStart
    const blocksByTask = new Map<string, typeof scheduled>();
    for (const b of scheduled) {
      if (!blocksByTask.has(b.taskId)) blocksByTask.set(b.taskId, []);
      blocksByTask.get(b.taskId)!.push(b);
    }

    // connectedCalendars and deleteEvent already loaded above (pre-cleanup)

    for (const [taskId, blocks] of blocksByTask) {
      const task = confirmedTasks.find((t) => t.id === taskId)!;
      const taskAssigneeIds: string[] = task.assigneeIds
        ? JSON.parse(task.assigneeIds)
        : task.assigneeId
        ? [task.assigneeId]
        : [];
      const blockLabel = (i: number, total: number) =>
        total > 1 ? ` (part ${i + 1}/${total})` : '';

      // Determine which calendars to write to:
      // assignees with connected calendars, else fall back to main user
      const targetCalendars = taskAssigneeIds.length
        ? taskAssigneeIds.filter((id) => connectedCalendars.includes(id))
        : [];
      if (!targetCalendars.length && connectedCalendars.includes(MAIN_CALENDAR)) {
        targetCalendars.push(MAIN_CALENDAR);
      }

      for (const b of blocks) {
        // Map of personId → calendarEventId so we can delete from ALL calendars later
        const calEventMap: Record<string, string> = {};
        if (targetCalendars.length) {
          for (const personId of targetCalendars) {
            try {
              const eventId = await createEvent({
                summary: `${task.title}${blockLabel(b.blockIndex, b.totalBlocks)}`,
                start: b.start,
                end: b.end,
                description: 'Scheduled by GoalScheduler',
                personId,
              });
              if (eventId) calEventMap[personId] = eventId;
            } catch (err) {
              console.warn(`[schedule] Failed to create event for person ${personId}:`, err);
            }
          }
        }

        // Store as JSON map so deletion knows each person's event ID
        const calEventJson = Object.keys(calEventMap).length > 0
          ? JSON.stringify(calEventMap)
          : null;

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

      // Update the task record with first block time
      const firstBlock = blocks[0];
      const lastBlock = blocks[blocks.length - 1];
      db.update(tasks)
        .set({
          status: 'scheduled',
          scheduledStart: firstBlock.start,
          scheduledEnd: lastBlock.end,
        })
        .where(eq(tasks.id, taskId))
        .run();
    }

    res.json({
      scheduled: scheduled.length,
      blocks: scheduled,
      unschedulable,
      calendarConnected: connectedCalendars.length > 0,
    });
  } catch (err) {
    console.error('[schedule] Error:', err);
    res.status(500).json({ error: 'Scheduling failed. Please try again.' });
  }
});

// DELETE /api/schedule/project/:projectId — remove all scheduled blocks and calendar events for a project
router.delete('/project/:projectId', async (req, res) => {
  const { projectId } = req.params;

  try {
    const projectTasks = db.select().from(tasks).where(eq(tasks.projectId, projectId)).all();
    if (!projectTasks.length) return res.json({ ok: true, removed: 0 });

    const taskIds = projectTasks.map((t) => t.id);
    const blocks = db.select().from(taskBlocks).where(inArray(taskBlocks.taskId, taskIds)).all();
    const connectedCalendars = await getConnectedCalendars();
    const { deleteEvent } = await import('../services/calendarService');

    let removed = 0;
    for (const block of blocks) {
      if (block.googleCalendarEventId) {
        // Try parsing as JSON map first (new format: { personId: eventId })
        let eventMap: Record<string, string> | null = null;
        try {
          const parsed = JSON.parse(block.googleCalendarEventId);
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            eventMap = parsed;
          }
        } catch {
          // Not JSON — legacy single event ID format
        }

        if (eventMap) {
          // New format: delete each person's event by their specific event ID
          for (const [personId, eventId] of Object.entries(eventMap)) {
            try {
              await deleteEvent(eventId, personId);
              removed++;
            } catch {
              // Event may already be deleted
            }
          }
        } else {
          // Legacy format: single event ID, try each connected calendar
          for (const personId of connectedCalendars) {
            try {
              await deleteEvent(block.googleCalendarEventId, personId);
              removed++;
              break;
            } catch {
              // Not in this calendar, try next
            }
          }
        }
      }
    }

    // Remove blocks from DB and reset task status
    for (const taskId of taskIds) {
      db.delete(taskBlocks).where(eq(taskBlocks.taskId, taskId)).run();
      db.update(tasks)
        .set({ status: 'confirmed', scheduledStart: null, scheduledEnd: null })
        .where(eq(tasks.id, taskId))
        .run();
    }

    res.json({ ok: true, removed });
  } catch (err) {
    console.error('[unschedule] Error:', err);
    res.status(500).json({ error: 'Failed to remove from calendar. Please try again.' });
  }
});

// GET /api/schedule — list scheduled tasks with their blocks
router.get('/', async (req, res) => {
  const scheduledTasks = db
    .select()
    .from(tasks)
    .where(eq(tasks.status, 'scheduled'))
    .all();

  const allBlocks = db.select().from(taskBlocks).all();

  const result = scheduledTasks.map((t) => ({
    ...t,
    assigneeIds: t.assigneeIds ? JSON.parse(t.assigneeIds) : t.assigneeId ? [t.assigneeId] : [],
    allowedDays: t.allowedDays ? JSON.parse(t.allowedDays) : null,
    blocks: allBlocks
      .filter((b) => b.taskId === t.id)
      .sort((a, b) => a.blockIndex - b.blockIndex),
  }));

  res.json(result);
});

// GET /api/schedule/settings
router.get('/settings', (req, res) => {
  const settings = db.select().from(workingHours).get();
  if (!settings) return res.json({});
  res.json({
    startHour: settings.startHour,
    endHour: settings.endHour,
    workDays: JSON.parse(settings.workDays),
    timezone: settings.timezone,
    maxMinutesPerDay: settings.maxMinutesPerDay,
  });
});

// PUT /api/schedule/settings
router.put('/settings', (req, res) => {
  const { startHour, endHour, workDays, timezone, maxMinutesPerDay } = req.body;
  db.update(workingHours)
    .set({
      startHour,
      endHour,
      workDays: JSON.stringify(workDays),
      timezone,
      maxMinutesPerDay: maxMinutesPerDay ?? 240,
    })
    .where(eq(workingHours.id, 1))
    .run();
  res.json({ ok: true });
});

export default router;
