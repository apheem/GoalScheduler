import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initDb } from './db';
import parseRouter from './routes/parse';
import tasksRouter from './routes/tasks';
import projectsRouter from './routes/projects';
import scheduleRouter from './routes/schedule';
import authRouter from './routes/auth';
import peopleRouter from './routes/people';
import { startReschedulerCron } from './jobs/endOfDayRescheduler';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ──────────────────────────────────────────────────────────────
const clientDist = path.resolve(__dirname, '../../client/dist');
const isProduction = fs.existsSync(clientDist);

if (isProduction) {
  // In production the client is served from the same origin — no CORS needed
  app.use(cors());
} else {
  // In dev, allow localhost origins for the Vite dev server
  app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));
}
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

// ─── Static file serving (production) ────────────────────────────────────────
if (isProduction) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

// ─── Startup ──────────────────────────────────────────────────────────────────
initDb();
startReschedulerCron();

app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
});
