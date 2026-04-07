import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import * as schema from './schema';

// In production, use an absolute path for the Railway persistent volume
// In dev, use relative path from project root
const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/app/server/data/app.db'
  : path.join(__dirname, '../../data/app.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export function initDb() {
  // Step 1: Create base tables (without new columns — migrations handle those)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      raw_input TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      week_of TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      estimated_minutes INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'pending',
      "order" INTEGER NOT NULL DEFAULT 0,
      depends_on_task_id TEXT,
      scheduled_start TEXT,
      scheduled_end TEXT,
      google_calendar_event_id TEXT,
      completed_at INTEGER,
      reschedule_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS task_blocks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      block_index INTEGER NOT NULL,
      total_blocks INTEGER NOT NULL,
      scheduled_start TEXT NOT NULL,
      scheduled_end TEXT NOT NULL,
      google_calendar_event_id TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled'
    );

    CREATE TABLE IF NOT EXISTS working_hours (
      id INTEGER PRIMARY KEY DEFAULT 1,
      start_hour INTEGER NOT NULL DEFAULT 9,
      end_hour INTEGER NOT NULL DEFAULT 18,
      work_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
      timezone TEXT NOT NULL DEFAULT 'America/Chicago'
    );

    CREATE TABLE IF NOT EXISTS parse_sessions (
      id TEXT PRIMARY KEY,
      raw_input TEXT NOT NULL,
      claude_response TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      start_hour INTEGER NOT NULL DEFAULT 9,
      end_hour INTEGER NOT NULL DEFAULT 18,
      work_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
      timezone TEXT NOT NULL DEFAULT 'America/Chicago',
      max_minutes_per_day INTEGER NOT NULL DEFAULT 240
    );

    CREATE TABLE IF NOT EXISTS google_tokens (
      id INTEGER PRIMARY KEY DEFAULT 1,
      access_token TEXT,
      refresh_token TEXT,
      expiry_date INTEGER
    );
  `);

  // Step 2: Run migrations to add new columns (safe to re-run — errors ignored)
  const migrations = [
    `ALTER TABLE projects ADD COLUMN deadline TEXT`,
    `ALTER TABLE projects ADD COLUMN allowed_days TEXT`,
    `ALTER TABLE projects ADD COLUMN allowed_start_hour INTEGER`,
    `ALTER TABLE projects ADD COLUMN allowed_end_hour INTEGER`,
    `ALTER TABLE tasks ADD COLUMN max_block_minutes INTEGER`,
    `ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'`,
    `ALTER TABLE working_hours ADD COLUMN max_minutes_per_day INTEGER DEFAULT 240`,
    `ALTER TABLE tasks ADD COLUMN assignee_id TEXT`,
    `ALTER TABLE tasks ADD COLUMN allowed_days TEXT`,
    `ALTER TABLE people ADD COLUMN day_schedules TEXT`,
    `ALTER TABLE tasks ADD COLUMN assignee_ids TEXT`,
    `ALTER TABLE google_tokens ADD COLUMN person_id TEXT NOT NULL DEFAULT '__main__'`,
    `ALTER TABLE tasks ADD COLUMN allowed_start_hour INTEGER`,
    `ALTER TABLE tasks ADD COLUMN allowed_end_hour INTEGER`,
    `ALTER TABLE projects ADD COLUMN project_priority INTEGER NOT NULL DEFAULT 3`,
    `ALTER TABLE projects ADD COLUMN owner_id TEXT`,
    `ALTER TABLE projects ADD COLUMN start_date TEXT`,
  ];

  for (const sql of migrations) {
    try {
      sqlite.exec(sql);
    } catch {
      // Column already exists — ignore
    }
  }

  // Step 3: Seed default working hours row (after migrations so all columns exist)
  sqlite.exec(`
    INSERT OR IGNORE INTO working_hours (id, start_hour, end_hour, work_days, timezone, max_minutes_per_day)
    VALUES (1, 9, 18, '[1,2,3,4,5]', 'America/Chicago', 240);
  `);
}
