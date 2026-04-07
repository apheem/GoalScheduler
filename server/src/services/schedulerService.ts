import {
  addMinutes,
  isAfter,
  isBefore,
  parseISO,
  formatISO,
  addDays,
  getDay,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
} from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import type { FreeSlot, Priority, WorkingHours } from '../../../shared/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  start: string;
  end: string;
}

export interface TaskToSchedule {
  id: string;
  estimatedMinutes: number;
  maxBlockMinutes: number | null;  // null = no splitting; when set, caps per-day minutes for this task
  priority: Priority;
  deadline: string | null;         // ISO date
  startDate?: string | null;      // ISO date — earliest scheduling date
  dependsOnTaskId: string | null;
  order: number;
  allowedDays?: number[] | null;
  allowedStartHour?: number | null;
  allowedEndHour?: number | null;
  // Per-person tracking
  assigneeKeys?: string[];          // all assignee IDs — used for daily minutes tracking per person
  maxMinutesPerDay?: number | null;  // person's daily cap
  projectPriority?: number;         // 1=most important, 5=least important (default 3)
}

export interface ScheduledBlock {
  taskId: string;
  blockIndex: number;    // 0-based
  totalBlocks: number;
  start: string;
  end: string;
}

// ─── Working window generation ────────────────────────────────────────────

function generateWorkingWindows(
  workingHours: WorkingHours,
  fromDate: Date,
  days: number,
  overrideDays?: number[] | null,
  overrideStartHour?: number | null,
  overrideEndHour?: number | null
): Array<{ start: Date; end: Date }> {
  const windows: Array<{ start: Date; end: Date }> = [];
  const { timezone, daySchedules } = workingHours;
  const globalStartHour = overrideStartHour ?? workingHours.startHour;
  const globalEndHour = overrideEndHour ?? workingHours.endHour;
  const workDays = overrideDays ?? workingHours.workDays;

  for (let i = 0; i < days; i++) {
    const day = addDays(fromDate, i);
    const zonedDay = toZonedTime(day, timezone);
    const dayOfWeek = getDay(zonedDay);

    if (!workDays.includes(dayOfWeek)) continue;

    // Use per-day schedule if available, else fall back to global hours
    const perDay = daySchedules?.[dayOfWeek];
    const startHour = perDay?.start ?? globalStartHour;
    const endHour = perDay?.end ?? globalEndHour;

    const winStartZoned = setMilliseconds(
      setSeconds(setMinutes(setHours(zonedDay, startHour), 0), 0),
      0
    );
    const winEndZoned = setMilliseconds(
      setSeconds(setMinutes(setHours(zonedDay, endHour), 0), 0),
      0
    );

    const winStart = fromZonedTime(winStartZoned, timezone);
    const winEnd = fromZonedTime(winEndZoned, timezone);

    const now = new Date();
    if (isBefore(winEnd, now)) continue;

    windows.push({
      start: isAfter(winStart, now) ? winStart : now,
      end: winEnd,
    });
  }

  return windows;
}

// ─── Interval subtraction ─────────────────────────────────────────────────

function subtractEvents(
  windows: Array<{ start: Date; end: Date }>,
  events: CalendarEvent[]
): Array<{ start: Date; end: Date }> {
  let slots = [...windows];

  for (const event of events) {
    const evStart = parseISO(event.start);
    const evEnd = parseISO(event.end);
    const result: Array<{ start: Date; end: Date }> = [];

    for (const slot of slots) {
      if (!isBefore(slot.start, evEnd) || !isAfter(slot.end, evStart)) {
        result.push(slot);
        continue;
      }
      if (isBefore(slot.start, evStart)) result.push({ start: slot.start, end: evStart });
      if (isAfter(slot.end, evEnd)) result.push({ start: evEnd, end: slot.end });
    }

    slots = result;
  }

  // Drop gaps under 10 minutes
  return slots.filter((s) => s.end.getTime() - s.start.getTime() >= 10 * 60 * 1000);
}

// ─── Topological sort ─────────────────────────────────────────────────────

function topoSort(tasks: TaskToSchedule[], defaultWorkDayCount: number): TaskToSchedule[] {
  const sorted: TaskToSchedule[] = [];
  const visited = new Set<string>();
  const idMap = new Map(tasks.map((t) => [t.id, t]));

  function visit(task: TaskToSchedule) {
    if (visited.has(task.id)) return;
    if (task.dependsOnTaskId) {
      const dep = idMap.get(task.dependsOnTaskId);
      if (dep) visit(dep);
    }
    visited.add(task.id);
    sorted.push(task);
  }

  // Sort by: project priority first (lower = more important), then most constrained
  // (fewest allowed days), then task priority, deadline, order.
  // This ensures higher-priority projects get scheduled first.
  const priorityRank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  const byConstraint = [...tasks].sort((a, b) => {
    const aProjPri = a.projectPriority ?? 3;
    const bProjPri = b.projectPriority ?? 3;
    if (aProjPri !== bProjPri) return aProjPri - bProjPri; // lower number = higher priority
    const aDays = a.allowedDays?.length ?? defaultWorkDayCount;
    const bDays = b.allowedDays?.length ?? defaultWorkDayCount;
    if (aDays !== bDays) return aDays - bDays; // fewer days = schedule first
    const pdiff = priorityRank[a.priority] - priorityRank[b.priority];
    if (pdiff !== 0) return pdiff;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return a.order - b.order;
  });

  for (const t of byConstraint) visit(t);
  return sorted;
}

// ─── Main scheduling function ─────────────────────────────────────────────

export function scheduleTasks(
  tasks: TaskToSchedule[],
  existingEvents: CalendarEvent[],
  workingHours: WorkingHours,
  fromDate: Date = new Date(),
  lookAheadDays = 42
): { scheduled: ScheduledBlock[]; unschedulable: Array<{ taskId: string; reason: string }> } {
  const scheduled: ScheduledBlock[] = [];
  const unschedulable: Array<{ taskId: string; reason: string }> = [];
  const unschedulableSet = new Set<string>();
  const taskEndTimes = new Map<string, Date>(); // latest block end per task
  // Track daily minutes per person (all assignees on a multi-person task share the cap)
  const personDayMinutes = new Map<string, number>(); // `${personKey}:${dayKey}` → minutes used
  const taskDayMinutes = new Map<string, number>();   // `${taskId}:${dayKey}` → minutes used this day

  const globalMaxPerDay = workingHours.maxMinutesPerDay ?? Infinity;

  const ordered = topoSort(tasks, workingHours.workDays.length);

  for (const task of ordered) {
    const wantsSplitting = task.maxBlockMinutes != null && task.maxBlockMinutes < task.estimatedMinutes;
    const blockSize = wantsSplitting ? task.maxBlockMinutes! : task.estimatedMinutes;

    // Build free slots for this task (respects overrides)
    const windows = generateWorkingWindows(
      workingHours,
      fromDate,
      lookAheadDays,
      task.allowedDays,
      task.allowedStartHour,
      task.allowedEndHour
    );
    let freeSlots = subtractEvents(windows, existingEvents);

    // Enforce startDate: tasks must not start before the start date
    if (task.startDate) {
      const startCutoff = parseISO(task.startDate);
      freeSlots = freeSlots.filter((s) => !isBefore(s.end, startCutoff));
      freeSlots = freeSlots.map((s) =>
        isBefore(s.start, startCutoff) ? { ...s, start: startCutoff } : s
      ).filter((s) => s.end.getTime() - s.start.getTime() >= 10 * 60 * 1000);
    }

    // Enforce deadline: tasks must finish by end of deadline day
    if (task.deadline) {
      const deadlineCutoff = addDays(parseISO(task.deadline), 1);
      freeSlots = freeSlots.filter((s) => isBefore(s.start, deadlineCutoff));
      freeSlots = freeSlots.map((s) =>
        isAfter(s.end, deadlineCutoff) ? { ...s, end: deadlineCutoff } : s
      ).filter((s) => s.end.getTime() - s.start.getTime() >= 10 * 60 * 1000);
    }

    // Also account for already-scheduled blocks (treat them as busy)
    const bookedEvents: CalendarEvent[] = scheduled.map((b) => ({
      start: b.start,
      end: b.end,
    }));
    freeSlots = subtractEvents(freeSlots, bookedEvents);

    // Dependency: can't start before the dependency's last block finishes
    // If dependency is unschedulable, this task is also unschedulable
    let earliestStart: Date | undefined;
    if (task.dependsOnTaskId) {
      if (unschedulableSet.has(task.dependsOnTaskId)) {
        unschedulable.push({ taskId: task.id, reason: 'Depends on a task that could not be scheduled' });
        unschedulableSet.add(task.id);
        continue;
      }
      const depEnd = taskEndTimes.get(task.dependsOnTaskId);
      if (depEnd) earliestStart = depEnd;
    }

    // All assignee keys for this task (for tracking daily caps per person)
    const assigneeKeys = task.assigneeKeys?.length ? task.assigneeKeys : ['__global__'];

    let remainingMinutes = task.estimatedMinutes;
    let blockIndex = 0;
    const totalBlocks = wantsSplitting ? Math.ceil(task.estimatedMinutes / blockSize) : 1;
    let taskFullyScheduled = true;

    while (remainingMinutes > 0) {
      const thisBlockSize = Math.min(blockSize, remainingMinutes);
      let placed = false;

      for (let i = 0; i < freeSlots.length; i++) {
        const slot = freeSlots[i];
        const slotStart =
          earliestStart && isAfter(earliestStart, slot.start)
            ? earliestStart
            : slot.start;

        const slotAvailableMs = slot.end.getTime() - slotStart.getTime();
        if (slotAvailableMs < 10 * 60 * 1000) continue;

        const dayKey = formatISO(slotStart, { representation: 'date' });
        const taskDayKey = `${task.id}:${dayKey}`;
        const maxPerDay = task.maxMinutesPerDay ?? globalMaxPerDay;

        // Check per-person daily cap — use the MOST constrained assignee
        let worstPersonAvailable = Infinity;
        for (const key of assigneeKeys) {
          const personKey = `${key}:${dayKey}`;
          const used = personDayMinutes.get(personKey) ?? 0;
          worstPersonAvailable = Math.min(worstPersonAvailable, maxPerDay - used);
        }
        if (worstPersonAvailable <= 0) continue;

        // Check per-task per-day cap (only when maxBlockMinutes is set)
        let taskAvailableToday = Infinity;
        if (wantsSplitting) {
          const taskUsedToday = taskDayMinutes.get(taskDayKey) ?? 0;
          if (taskUsedToday >= task.maxBlockMinutes!) continue;
          taskAvailableToday = task.maxBlockMinutes! - taskUsedToday;
        }

        const slotMinutes = Math.floor(slotAvailableMs / 60_000);

        if (wantsSplitting) {
          // Splitting mode: place up to blockSize per day
          const placeable = Math.min(thisBlockSize, slotMinutes, worstPersonAvailable, taskAvailableToday);
          if (placeable < Math.min(10, thisBlockSize)) continue;

          const blockStart = slotStart;
          const blockEnd = addMinutes(blockStart, placeable);

          scheduled.push({
            taskId: task.id,
            blockIndex,
            totalBlocks,
            start: formatISO(blockStart),
            end: formatISO(blockEnd),
          });

          taskEndTimes.set(task.id, blockEnd);
          for (const key of assigneeKeys) {
            const pk = `${key}:${dayKey}`;
            personDayMinutes.set(pk, (personDayMinutes.get(pk) ?? 0) + placeable);
          }
          taskDayMinutes.set(taskDayKey, (taskDayMinutes.get(taskDayKey) ?? 0) + placeable);

          // Update free slots
          const newSlots = [...freeSlots];
          newSlots.splice(i, 1);
          if (blockEnd.getTime() < slot.end.getTime()) {
            newSlots.splice(i, 0, { start: blockEnd, end: slot.end });
          }
          freeSlots = newSlots;

          remainingMinutes -= placeable;
          blockIndex++;
          placed = true;
          break;
        } else {
          // No splitting: must fit the ENTIRE task in one contiguous slot
          if (slotMinutes < thisBlockSize) continue;
          if (worstPersonAvailable < thisBlockSize) continue;

          const blockStart = slotStart;
          const blockEnd = addMinutes(blockStart, thisBlockSize);

          scheduled.push({
            taskId: task.id,
            blockIndex: 0,
            totalBlocks: 1,
            start: formatISO(blockStart),
            end: formatISO(blockEnd),
          });

          taskEndTimes.set(task.id, blockEnd);
          for (const key of assigneeKeys) {
            const pk = `${key}:${dayKey}`;
            personDayMinutes.set(pk, (personDayMinutes.get(pk) ?? 0) + thisBlockSize);
          }

          // Update free slots
          const newSlots = [...freeSlots];
          newSlots.splice(i, 1);
          if (blockEnd.getTime() < slot.end.getTime()) {
            newSlots.splice(i, 0, { start: blockEnd, end: slot.end });
          }
          freeSlots = newSlots;

          remainingMinutes = 0;
          placed = true;
          break;
        }
      }

      if (!placed) {
        taskFullyScheduled = false;
        break;
      }
    }

    if (!taskFullyScheduled) {
      const days = task.allowedDays?.length ?? workingHours.workDays.length;
      const reason = days <= 1
        ? `No available slots on the ${days === 1 ? 'one allowed day' : 'allowed days'} within ${lookAheadDays} days (check assignee availability overlap and daily caps)`
        : `Could not find enough free time within ${lookAheadDays} days`;
      unschedulable.push({ taskId: task.id, reason });
      unschedulableSet.add(task.id);
    }
  }

  return { scheduled, unschedulable };
}

export function getFreeSlots(
  existingEvents: CalendarEvent[],
  workingHours: WorkingHours,
  fromDate: Date = new Date(),
  lookAheadDays = 14
): FreeSlot[] {
  const windows = generateWorkingWindows(workingHours, fromDate, lookAheadDays);
  const slots = subtractEvents(windows, existingEvents);
  return slots.map((s) => ({ start: formatISO(s.start), end: formatISO(s.end) }));
}
