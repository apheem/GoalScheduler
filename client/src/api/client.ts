import type {
  Project,
  ParseRequest,
  ScheduleRequest,
  WorkingHours,
} from '../../../shared/types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error(
      'Cannot reach the server. Open a terminal in the project folder and run: npm run dev'
    );
  }

  if (!res.ok) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(
        'The backend server is not running. Open a terminal in the project folder and run: npm run dev'
      );
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Parse ────────────────────────────────────────────────────────────────

export function parseGoals(payload: ParseRequest): Promise<{ projects: Project[] }> {
  return request('/parse', { method: 'POST', body: JSON.stringify(payload) });
}

// ─── Projects ─────────────────────────────────────────────────────────────

export function getProjects(): Promise<Project[]> {
  return request('/projects');
}

export function confirmProject(projectId: string): Promise<Project> {
  return request(`/projects/${projectId}/confirm`, { method: 'PATCH' });
}

export function rejectProject(projectId: string): Promise<void> {
  return request(`/projects/${projectId}/reject`, { method: 'PATCH' });
}

// ─── Tasks ────────────────────────────────────────────────────────────────

export function updateTask(taskId: string, updates: Record<string, unknown>): Promise<unknown> {
  return request(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

export function updateProject(
  projectId: string,
  updates: { deadline?: string | null; allowedDays?: number[] | null; allowedStartHour?: number | null; allowedEndHour?: number | null; projectPriority?: number }
): Promise<unknown> {
  return request(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

export function completeTask(taskId: string): Promise<unknown> {
  return request(`/tasks/${taskId}/complete`, { method: 'POST' });
}

// ─── Schedule ─────────────────────────────────────────────────────────────

export function scheduleTasks(
  payload: ScheduleRequest
): Promise<{ scheduled: unknown[]; unschedulable: Array<{ taskId: string; reason: string }> }> {
  return request('/schedule', { method: 'POST', body: JSON.stringify(payload) });
}

export function getScheduled(): Promise<unknown[]> {
  return request('/schedule');
}

export function getWorkingHours(): Promise<WorkingHours> {
  return request('/schedule/settings');
}

export function saveWorkingHours(wh: WorkingHours): Promise<void> {
  return request('/schedule/settings', { method: 'PUT', body: JSON.stringify(wh) });
}

// ─── Auth ─────────────────────────────────────────────────────────────────

export function createTask(data: { projectId: string; title: string; estimatedMinutes?: number; priority?: string }): Promise<unknown> {
  return request('/tasks', { method: 'POST', body: JSON.stringify(data) });
}

export function deleteTask(taskId: string): Promise<unknown> {
  return request(`/tasks/${taskId}`, { method: 'DELETE' });
}

export function deleteProject(projectId: string): Promise<unknown> {
  return request(`/projects/${projectId}`, { method: 'DELETE' });
}

export function createManualProject(payload: {
  title: string;
  deadline?: string | null;
  projectPriority?: number;
  tasks: Array<{ title: string; estimatedMinutes: number }>;
}): Promise<Project> {
  return request('/projects/manual', { method: 'POST', body: JSON.stringify(payload) });
}

export function createQuickTask(payload: {
  title: string;
  estimatedMinutes: number;
}): Promise<Project> {
  return request('/projects/quick-task', { method: 'POST', body: JSON.stringify(payload) });
}

export function unscheduleProject(projectId: string): Promise<{ ok: boolean; removed: number }> {
  return request(`/schedule/project/${projectId}`, { method: 'DELETE' });
}

export function getAuthStatus(personId?: string): Promise<{ configured: boolean; connected: boolean }> {
  const qs = personId ? `?personId=${encodeURIComponent(personId)}` : '';
  return request(`/auth/status${qs}`);
}

export function getAuthConnections(): Promise<string[]> {
  return request('/auth/connections');
}

// ─── Dev ──────────────────────────────────────────────────────────────────

export function triggerRescheduler(): Promise<void> {
  return request('/dev/reschedule-now', { method: 'POST' });
}
