import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db';
import parseRouter from './routes/parse';
import tasksRouter from './routes/tasks';
import projectsRouter from './routes/projects';
import scheduleRouter from './routes/schedule';
import authRouter from './routes/auth';
import peopleRouter from './routes/people';
import { startReschedulerCron } from './jobs/endOfDayRescheduler';

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));
app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/parse', parseRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/auth', authRouter);
app.use('/api/people', peopleRouter);

// Manual trigger for testing the rescheduler without waiting for 23:00
app.post('/api/dev/reschedule-now', async (req, res) => {
  const { runRescheduler } = await import('./jobs/endOfDayRescheduler');
  await runRescheduler();
  res.json({ ok: true });
});

// Clear all maxBlockMinutes values (dev utility)
app.post('/api/dev/clear-max-block', async (req, res) => {
  const { db } = await import('./db');
  const { tasks } = await import('./db/schema');
  db.update(tasks).set({ maxBlockMinutes: null }).run();
  res.json({ ok: true, message: 'Cleared maxBlockMinutes on all tasks' });
});

// ─── Startup ──────────────────────────────────────────────────────────────────
initDb();
startReschedulerCron();

app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
});
