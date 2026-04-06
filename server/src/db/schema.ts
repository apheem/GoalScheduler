import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  rawInput: text('raw_input').notNull().default(''),
  status: text('status').notNull().default('pending'),
  weekOf: text('week_of').notNull(),
  createdAt: integer('created_at').notNull(),
  deadline: text('deadline'),
  projectPriority: integer('project_priority').notNull().default(3),
  allowedDays: text('allowed_days'),       // JSON array or null
  allowedStartHour: integer('allowed_start_hour'),
  allowedEndHour: integer('allowed_end_hour'),
  ownerId: text('owner_id'),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  estimatedMinutes: integer('estimated_minutes').notNull().default(30),
  maxBlockMinutes: integer('max_block_minutes'),   // null = no splitting
  priority: text('priority').notNull().default('medium'), // high|medium|low
  status: text('status').notNull().default('pending'),
  order: integer('order').notNull().default(0),
  dependsOnTaskId: text('depends_on_task_id'),
  assigneeId: text('assignee_id'),       // legacy — use assigneeIds
  assigneeIds: text('assignee_ids'),     // JSON string[] — multi-assignee
  allowedDays: text('allowed_days'),    // JSON array or null (task-level override)
  allowedStartHour: integer('allowed_start_hour'),  // e.g. 18 = "after 6 PM"
  allowedEndHour: integer('allowed_end_hour'),      // e.g. 22 = "before 10 PM"
  scheduledStart: text('scheduled_start'),
  scheduledEnd: text('scheduled_end'),
  googleCalendarEventId: text('google_calendar_event_id'),
  completedAt: integer('completed_at'),
  rescheduleCount: integer('reschedule_count').notNull().default(0),
});

export const taskBlocks = sqliteTable('task_blocks', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id),
  blockIndex: integer('block_index').notNull(),
  totalBlocks: integer('total_blocks').notNull(),
  scheduledStart: text('scheduled_start').notNull(),
  scheduledEnd: text('scheduled_end').notNull(),
  googleCalendarEventId: text('google_calendar_event_id'),
  status: text('status').notNull().default('scheduled'), // scheduled|complete
});

export const workingHours = sqliteTable('working_hours', {
  id: integer('id').primaryKey().default(1),
  startHour: integer('start_hour').notNull().default(9),
  endHour: integer('end_hour').notNull().default(18),
  workDays: text('work_days').notNull().default('[1,2,3,4,5]'),
  timezone: text('timezone').notNull().default('America/Chicago'),
  maxMinutesPerDay: integer('max_minutes_per_day').default(240),
});

export const parseSessions = sqliteTable('parse_sessions', {
  id: text('id').primaryKey(),
  rawInput: text('raw_input').notNull(),
  claudeResponse: text('claude_response').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  startHour: integer('start_hour').notNull().default(9),
  endHour: integer('end_hour').notNull().default(18),
  workDays: text('work_days').notNull().default('[1,2,3,4,5]'),
  timezone: text('timezone').notNull().default('America/Chicago'),
  maxMinutesPerDay: integer('max_minutes_per_day').notNull().default(240),
  daySchedules: text('day_schedules'),  // JSON: Record<number, {start, end}>
});

export const googleTokens = sqliteTable('google_tokens', {
  id: integer('id').primaryKey(),
  personId: text('person_id').notNull().default('__main__'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiryDate: integer('expiry_date'),
});
