import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { parseGoals } from '../services/claudeService';
import { db } from '../db';
import { parseSessions, projects, tasks } from '../db/schema';
import type { ParseRequest } from '../../../shared/types';
import { formatISO, startOfWeek } from 'date-fns';

const router = Router();

router.post('/', async (req, res) => {
  const { rawInput, workingHours } = req.body as ParseRequest & { ownerId?: string | null; startDate?: string | null };
  const ownerId = req.body.ownerId ?? null;
  const startDate = req.body.startDate ?? null;

  if (!rawInput?.trim()) {
    return res.status(400).json({ error: 'rawInput is required' });
  }

  try {
    const parseResult = await parseGoals(rawInput, workingHours);

    // Persist parse session for debugging
    const sessionId = uuidv4();
    db.insert(parseSessions).values({
      id: sessionId,
      rawInput,
      claudeResponse: JSON.stringify(parseResult),
      createdAt: Date.now(),
    }).run();

    // Persist projects and tasks as 'pending' drafts
    const weekOf = formatISO(startOfWeek(new Date(), { weekStartsOn: 1 }), {
      representation: 'date',
    });

    const createdProjects = [];

    for (const parsedProject of parseResult.projects) {
      const projectId = uuidv4();

      db.insert(projects).values({
        id: projectId,
        title: parsedProject.title,
        rawInput,
        status: 'pending',
        weekOf,
        createdAt: Date.now(),
        projectPriority: 3,
        ownerId,
        startDate,
      }).run();

      const createdTasks = [];
      const taskIds: string[] = [];

      // First pass: create IDs
      for (const _ of parsedProject.tasks) {
        taskIds.push(uuidv4());
      }

      // Second pass: insert with resolved dependency IDs
      for (let i = 0; i < parsedProject.tasks.length; i++) {
        const t = parsedProject.tasks[i];
        const taskId = taskIds[i];
        const dependsOnTaskId =
          t.dependsOnIndex !== null && t.dependsOnIndex < i
            ? taskIds[t.dependsOnIndex]
            : null;

        db.insert(tasks).values({
          id: taskId,
          projectId,
          title: t.title,
          estimatedMinutes: t.estimatedMinutes,
          priority: t.priority ?? 'medium',
          status: 'pending',
          order: i,
          dependsOnTaskId,
          rescheduleCount: 0,
        }).run();

        createdTasks.push({
          id: taskId,
          projectId,
          title: t.title,
          estimatedMinutes: t.estimatedMinutes,
          priority: t.priority ?? 'medium',
          assigneeIds: [],
          status: 'pending',
          order: i,
          dependsOnTaskId,
          allowedDays: null,
          maxBlockMinutes: null,
          scheduledStart: null,
          scheduledEnd: null,
          googleCalendarEventId: null,
          completedAt: null,
          rescheduleCount: 0,
          notes: t.notes,
        });
      }

      createdProjects.push({
        id: projectId,
        title: parsedProject.title,
        rawInput,
        status: 'pending',
        weekOf,
        tasks: createdTasks,
      });
    }

    res.json({ projects: createdProjects });
  } catch (err) {
    console.error('[parse] Error:', err);
    res.status(500).json({ error: 'Failed to parse goals. Please try again.' });
  }
});

export default router;
