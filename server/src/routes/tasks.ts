import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { tasks, taskBlocks } from '../db/schema';

const router = Router();

function deserializeTask(row: typeof tasks.$inferSelect) {
  return {
    ...row,
    assigneeIds: row.assigneeIds ? JSON.parse(row.assigneeIds) : [],
    allowedDays: row.allowedDays ? JSON.parse(row.allowedDays) : null,
    recurrenceDays: row.recurrenceDays ? JSON.parse(row.recurrenceDays) : null,
    isRecurringTemplate: !!row.isRecurringTemplate,
  };
}

// POST /api/tasks — create a new task in an existing project
router.post('/', (req, res) => {
  const { projectId, title, estimatedMinutes, priority, recurrenceDays } = req.body;
  if (!projectId || !title?.trim()) {
    return res.status(400).json({ error: 'projectId and title are required' });
  }

  // Find the max current order in this project
  const existing = db.select().from(tasks).where(eq(tasks.projectId, projectId)).all();
  const maxOrder = existing.reduce((max, t) => Math.max(max, t.order), -1);

  const isRecurring = Array.isArray(recurrenceDays) && recurrenceDays.length > 0;

  const id = randomUUID();
  db.insert(tasks).values({
    id,
    projectId,
    title: title.trim(),
    estimatedMinutes: estimatedMinutes ?? 30,
    priority: priority ?? 'medium',
    status: 'pending',
    order: maxOrder + 1,
    rescheduleCount: 0,
    recurrenceDays: isRecurring ? JSON.stringify(recurrenceDays) : null,
    isRecurringTemplate: isRecurring ? 1 : 0,
  }).run();

  const created = db.select().from(tasks).where(eq(tasks.id, id)).get()!;
  res.json(deserializeTask(created));
});

// GET /api/tasks
router.get('/', (req, res) => {
  const { projectId } = req.query;
  const rows = projectId
    ? db.select().from(tasks).where(eq(tasks.projectId, String(projectId))).all()
    : db.select().from(tasks).all();
  res.json(rows.map(deserializeTask));
});

// PATCH /api/tasks/:id
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { title, estimatedMinutes, maxBlockMinutes, priority, status, assigneeIds, allowedDays, dependsOnTaskId, allowedStartHour, allowedEndHour, deadline, startDate, recurrenceDays } = req.body;

  const update: Partial<typeof tasks.$inferInsert> = {};
  if (title !== undefined) update.title = title;
  if (estimatedMinutes !== undefined) update.estimatedMinutes = estimatedMinutes;
  if ('maxBlockMinutes' in req.body) update.maxBlockMinutes = maxBlockMinutes ?? null;
  if (priority !== undefined) update.priority = priority;
  if (status !== undefined) update.status = status;
  if ('assigneeIds' in req.body) update.assigneeIds = Array.isArray(assigneeIds) ? JSON.stringify(assigneeIds) : null;
  if ('allowedDays' in req.body) update.allowedDays = allowedDays ? JSON.stringify(allowedDays) : null;
  if ('dependsOnTaskId' in req.body) update.dependsOnTaskId = dependsOnTaskId ?? null;
  if ('allowedStartHour' in req.body) update.allowedStartHour = allowedStartHour ?? null;
  if ('allowedEndHour' in req.body) update.allowedEndHour = allowedEndHour ?? null;
  if ('deadline' in req.body) update.deadline = deadline ?? null;
  if ('startDate' in req.body) update.startDate = startDate ?? null;
  if ('recurrenceDays' in req.body) {
    const isRecurring = Array.isArray(recurrenceDays) && recurrenceDays.length > 0;
    update.recurrenceDays = isRecurring ? JSON.stringify(recurrenceDays) : null;
    update.isRecurringTemplate = isRecurring ? 1 : 0;
    if (!isRecurring) update.lastSpawnedDate = null;
  }

  if (status === 'complete') {
    update.completedAt = Date.now();
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  db.update(tasks).set(update).where(eq(tasks.id, id)).run();
  const updated = db.select().from(tasks).where(eq(tasks.id, id)).get()!;
  res.json(deserializeTask(updated));
});

// DELETE /api/tasks/:id — permanently delete a task and its blocks
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.delete(taskBlocks).where(eq(taskBlocks.taskId, id)).run();
  db.delete(tasks).where(eq(tasks.id, id)).run();
  res.json({ ok: true });
});

// POST /api/tasks/:id/complete
router.post('/:id/complete', (req, res) => {
  const { id } = req.params;
  db.update(tasks)
    .set({ status: 'complete', completedAt: Date.now() })
    .where(eq(tasks.id, id))
    .run();
  const updated = db.select().from(tasks).where(eq(tasks.id, id)).get()!;
  res.json(deserializeTask(updated));
});

export default router;
