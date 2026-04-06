// ─── Shared types used by both client and server ───────────────────────────

export type ProjectStatus = 'pending' | 'confirmed' | 'rejected' | 'complete';
export type TaskStatus =
  | 'pending'
  | 'confirmed'
  | 'scheduled'
  | 'complete'
  | 'rescheduled'
  | 'needs_attention';
export type Priority = 'high' | 'medium' | 'low';

export interface DaySchedule {
  start: number;  // hour 0–23
  end: number;    // hour 0–23
}

export interface WorkingHours {
  startHour: number;
  endHour: number;
  workDays: number[];        // [1,2,3,4,5] Mon–Fri (0=Sun)
  timezone: string;
  maxMinutesPerDay?: number; // cap daily task load (e.g. 240 = 4 hrs)
  daySchedules?: Record<number, DaySchedule>; // per-day overrides keyed by day index (0=Sun)
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  estimatedMinutes: number;
  maxBlockMinutes: number | null;
  priority: Priority;
  status: TaskStatus;
  order: number;
  dependsOnTaskId: string | null;
  assigneeIds: string[];             // people responsible (empty = anyone)
  allowedDays: number[] | null;     // task-level day override
  allowedStartHour: number | null;  // e.g. 18 = "only after 6 PM"
  allowedEndHour: number | null;    // e.g. 22 = "only before 10 PM"
  scheduledStart: string | null;
  scheduledEnd: string | null;
  googleCalendarEventId: string | null;
  completedAt: number | null;
  rescheduleCount: number;
}

export interface Project {
  id: string;
  title: string;
  rawInput: string;
  status: ProjectStatus;
  weekOf: string;
  deadline: string | null;       // ISO date "2026-04-15"
  allowedDays: number[] | null;  // override global workDays for this project
  allowedStartHour: number | null;
  allowedEndHour: number | null;
  tasks: Task[];
}

// ─── Claude parse result ───────────────────────────────────────────────────

export interface ParsedTask {
  title: string;
  estimatedMinutes: number;
  dependsOnIndex: number | null;
  notes: string | null;
  priority: Priority;
}

export interface ParsedProject {
  title: string;
  tasks: ParsedTask[];
}

export interface ParseResult {
  projects: ParsedProject[];
}

// ─── API shapes ────────────────────────────────────────────────────────────

export interface ParseRequest {
  rawInput: string;
  workingHours: WorkingHours;
}

export interface ScheduleRequest {
  projectIds: string[];
  workingHours: WorkingHours;
}

export interface FreeSlot {
  start: string;
  end: string;
}

// ─── People ───────────────────────────────────────────────────────────────

export interface Person {
  id: string;
  name: string;
  color: string;        // hex e.g. "#6366f1"
  startHour: number;
  endHour: number;
  workDays: number[];
  timezone: string;
  maxMinutesPerDay: number;
  daySchedules?: Record<number, DaySchedule>; // per-day overrides
}

// ─── Task blocks (for split scheduling) ───────────────────────────────────

export interface TaskBlock {
  id: string;
  taskId: string;
  blockIndex: number;
  totalBlocks: number;
  scheduledStart: string;
  scheduledEnd: string;
  googleCalendarEventId: string | null;
  status: 'scheduled' | 'complete';
}
