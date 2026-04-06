import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { projects, tasks, taskBlocks } from '../db/schema';

const router = Router();

function deserializeTask(row: typeof tasks.$inferSelect) {
  return {
    ...row,
    assigneeIds: row.assigneeIds ? JSON.parse(row.assigneeIds) : [],
    allowedDays: row.allowedDays ? JSON.parse(row.allowedDays) : null,
  };
}

// GET /api/projects — list all projects with their tasks
router.get('/', (req, res) => {
  const allProjects = db.select().from(projects).all();
  const allTasks = db.select().from(tasks).all();

  const result = allProjects.map((p) => ({
    ...p,
    tasks: allTasks
      .filter((t) => t.projectId === p.id)
      .sort((a, b) => a.order - b.order)
      .map(deserializeTask),
  }));

  res.json(result);
});

// PATCH /api/projects/:id — update project settings
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { deadline, allowedDays, allowedStartHour, allowedEndHour } = req.body;
  const update: Record<string, unknown> = {};
  if ('deadline' in req.body) update.deadline = deadline ?? null;
  if ('allowedDays' in req.body) update.allowedDays = allowedDays ? JSON.stringify(allowedDays) : null;
  if ('allowedStartHour' in req.body) update.allowedStartHour = allowedStartHour ?? null;
  if ('allowedEndHour' in req.body) update.allowedEndHour = allowedEndHour ?? null;
  if (Object.keys(update).length) {
    db.update(projects).set(update as any).where(eq(projects.id, id)).run();
  }
  res.json({ ok: true });
});

// PATCH /api/projects/:id/confirm — confirm all pending tasks in a project
router.patch('/:id/confirm', (req, res) => {
  const { id } = req.params;

  db.update(tasks)
    .set({ status: 'confirmed' })
    .where(eq(tasks.projectId, id))
    .run();

  db.update(projects)
    .set({ status: 'confirmed' })
    .where(eq(projects.id, id))
    .run();

  const updated = db.select().from(projects).where(eq(projects.id, id)).get();
  const updatedTasks = db.select().from(tasks).where(eq(tasks.projectId, id)).all().map(deserializeTask);
  res.json({ ...updated, tasks: updatedTasks });
});

// PATCH /api/projects/:id/reject — reject a project
router.patch('/:id/reject', (req, res) => {
  const { id } = req.params;
  db.update(projects).set({ status: 'rejected' }).where(eq(projects.id, id)).run();
  res.json({ ok: true });
});

// DELETE /api/projects/:id — permanently delete project, tasks, and blocks
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  // Delete blocks for tasks in this project
  const projectTasks = db.select().from(tasks).where(eq(tasks.projectId, id)).all();
  for (const t of projectTasks) {
    db.delete(taskBlocks).where(eq(taskBlocks.taskId, t.id)).run();
  }
  db.delete(tasks).where(eq(tasks.projectId, id)).run();
  db.delete(projects).where(eq(projects.id, id)).run();
  res.json({ ok: true });
});

export default router;
