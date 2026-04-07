import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
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
  const { deadline, startDate, allowedDays, allowedStartHour, allowedEndHour, projectPriority, ownerId } = req.body;
  const update: Record<string, unknown> = {};
  if ('deadline' in req.body) update.deadline = deadline ?? null;
  if ('startDate' in req.body) update.startDate = startDate ?? null;
  if ('allowedDays' in req.body) update.allowedDays = allowedDays ? JSON.stringify(allowedDays) : null;
  if ('allowedStartHour' in req.body) update.allowedStartHour = allowedStartHour ?? null;
  if ('allowedEndHour' in req.body) update.allowedEndHour = allowedEndHour ?? null;
  if ('projectPriority' in req.body) update.projectPriority = projectPriority ?? 3;
  if ('ownerId' in req.body) update.ownerId = ownerId ?? null;
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

// POST /api/projects/:id/assign-all — assign a person to every task in a project
router.post('/:id/assign-all', (req, res) => {
  const { id } = req.params;
  const { personId } = req.body as { personId: string };

  if (!personId) {
    return res.status(400).json({ error: 'personId is required' });
  }

  const projectTasks = db.select().from(tasks).where(eq(tasks.projectId, id)).all();

  for (const t of projectTasks) {
    const currentIds: string[] = t.assigneeIds ? JSON.parse(t.assigneeIds) : [];
    if (!currentIds.includes(personId)) {
      currentIds.push(personId);
    }
    db.update(tasks)
      .set({ assigneeIds: JSON.stringify(currentIds) })
      .where(eq(tasks.id, t.id))
      .run();
  }

  // Also set as project owner if not already set
  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (project && !project.ownerId) {
    db.update(projects).set({ ownerId: personId } as any).where(eq(projects.id, id)).run();
  }

  const updatedTasks = db.select().from(tasks).where(eq(tasks.projectId, id)).all().map(deserializeTask);
  res.json({ ok: true, tasks: updatedTasks });
});

// POST /api/projects/manual — create a project with user-defined steps (skip AI)
router.post('/manual', (req, res) => {
  const { title, deadline, startDate, projectPriority, ownerId, tasks: inputTasks } = req.body as {
    title: string;
    deadline?: string | null;
    startDate?: string | null;
    projectPriority?: number;
    ownerId?: string | null;
    tasks: Array<{ title: string; estimatedMinutes: number }>;
  };

  if (!title || !Array.isArray(inputTasks) || inputTasks.length === 0) {
    res.status(400).json({ error: 'title and at least one task are required' });
    return;
  }

  const projectId = randomUUID();
  const now = Date.now();
  const weekOf = new Date().toISOString().slice(0, 10);

  db.insert(projects).values({
    id: projectId,
    title,
    rawInput: '',
    status: 'confirmed',
    weekOf,
    createdAt: now,
    deadline: deadline ?? null,
    startDate: startDate ?? null,
    projectPriority: projectPriority ?? 3,
    ownerId: ownerId ?? null,
  }).run();

  const taskIds: string[] = [];
  for (let i = 0; i < inputTasks.length; i++) {
    const taskId = randomUUID();
    taskIds.push(taskId);
    db.insert(tasks).values({
      id: taskId,
      projectId,
      title: inputTasks[i].title,
      estimatedMinutes: inputTasks[i].estimatedMinutes,
      status: 'confirmed',
      order: i,
      dependsOnTaskId: i > 0 && inputTasks.length > 1 ? taskIds[i - 1] : null,
    }).run();
  }

  const created = db.select().from(projects).where(eq(projects.id, projectId)).get();
  const createdTasks = db.select().from(tasks).where(eq(tasks.projectId, projectId)).all().map(deserializeTask);
  res.json({ ...created, tasks: createdTasks });
});

// POST /api/projects/quick-task — create a single-task project instantly
router.post('/quick-task', (req, res) => {
  const { title, estimatedMinutes, ownerId, startDate } = req.body as { title: string; estimatedMinutes: number; ownerId?: string | null; startDate?: string | null };

  if (!title || !estimatedMinutes) {
    res.status(400).json({ error: 'title and estimatedMinutes are required' });
    return;
  }

  const projectId = randomUUID();
  const taskId = randomUUID();
  const now = Date.now();
  const weekOf = new Date().toISOString().slice(0, 10);

  db.insert(projects).values({
    id: projectId,
    title,
    rawInput: '',
    status: 'confirmed',
    weekOf,
    createdAt: now,
    ownerId: ownerId ?? null,
    startDate: startDate ?? null,
  }).run();

  db.insert(tasks).values({
    id: taskId,
    projectId,
    title,
    estimatedMinutes,
    status: 'confirmed',
    order: 0,
  }).run();

  const created = db.select().from(projects).where(eq(projects.id, projectId)).get();
  const createdTasks = db.select().from(tasks).where(eq(tasks.projectId, projectId)).all().map(deserializeTask);
  res.json({ ...created, tasks: createdTasks });
});

export default router;
