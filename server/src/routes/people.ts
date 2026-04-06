import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { people } from '../db/schema';
import type { Person } from '../../../shared/types';

const router = Router();

// GET /api/people
router.get('/', (req, res) => {
  const rows = db.select().from(people).all();
  res.json(rows.map(deserialize));
});

// POST /api/people
router.post('/', (req, res) => {
  const { name, color, startHour, endHour, workDays, timezone, maxMinutesPerDay, daySchedules } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  const id = uuidv4();
  db.insert(people).values({
    id,
    name: name.trim(),
    color: color ?? '#6366f1',
    startHour: startHour ?? 9,
    endHour: endHour ?? 18,
    workDays: JSON.stringify(workDays ?? [1, 2, 3, 4, 5]),
    timezone: timezone ?? 'America/Chicago',
    maxMinutesPerDay: maxMinutesPerDay ?? 240,
    daySchedules: daySchedules ? JSON.stringify(daySchedules) : null,
  }).run();

  const created = db.select().from(people).where(eq(people.id, id)).get()!;
  res.json(deserialize(created));
});

// PATCH /api/people/:id
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { name, color, startHour, endHour, workDays, timezone, maxMinutesPerDay, daySchedules } = req.body;
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (color !== undefined) update.color = color;
  if (startHour !== undefined) update.startHour = startHour;
  if (endHour !== undefined) update.endHour = endHour;
  if (workDays !== undefined) update.workDays = JSON.stringify(workDays);
  if (timezone !== undefined) update.timezone = timezone;
  if (maxMinutesPerDay !== undefined) update.maxMinutesPerDay = maxMinutesPerDay;
  if (daySchedules !== undefined) update.daySchedules = daySchedules ? JSON.stringify(daySchedules) : null;

  db.update(people).set(update as any).where(eq(people.id, id)).run();
  const updated = db.select().from(people).where(eq(people.id, id)).get()!;
  res.json(deserialize(updated));
});

// DELETE /api/people/:id
router.delete('/:id', (req, res) => {
  db.delete(people).where(eq(people.id, req.params.id)).run();
  res.json({ ok: true });
});

function deserialize(row: typeof people.$inferSelect): Person {
  return {
    ...row,
    workDays: JSON.parse(row.workDays),
    daySchedules: row.daySchedules ? JSON.parse(row.daySchedules) : undefined,
  };
}

export default router;
