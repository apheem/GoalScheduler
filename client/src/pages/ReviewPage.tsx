import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Project, Person, Task, WorkingHours } from '../../../shared/types';
import ProjectCard from '../components/ProjectCard';
import Layout from '../components/Layout';
import { confirmProject, rejectProject, updateTask, updateProject, scheduleTasks } from '../api/client';

const DEFAULT_WH: WorkingHours = {
  startHour: 9,
  endHour: 18,
  workDays: [1, 2, 3, 4, 5],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export default function ReviewPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const projects: Project[] =
    (queryClient.getQueryData(['projects', 'parsed']) as Project[]) ?? [];

  const { data: people = [] } = useQuery<Person[]>({
    queryKey: ['people'],
    queryFn: () => fetch('/api/people').then((r) => r.json()),
  });

  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [localProjects, setLocalProjects] = useState<Project[]>(projects);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const confirmMutation = useMutation({
    mutationFn: (projectId: string) => confirmProject(projectId),
    onSuccess: (_, projectId) => setConfirmedIds((prev) => new Set([...prev, projectId])),
  });

  const rejectMutation = useMutation({
    mutationFn: (projectId: string) => rejectProject(projectId),
    onSuccess: (_, projectId) => setRejectedIds((prev) => new Set([...prev, projectId])),
  });

  function handleUpdateTask(taskId: string, updates: Partial<Task>) {
    updateTask(taskId, updates);
    setLocalProjects((prev) =>
      prev.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
      }))
    );
  }

  function handleUpdateProject(projectId: string, updates: Partial<Project>) {
    updateProject(projectId, updates);
    setLocalProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, ...updates } : p))
    );
  }

  async function handleScheduleAll() {
    const toSchedule = [...confirmedIds];
    if (!toSchedule.length) {
      setScheduleError('Confirm at least one project before scheduling.');
      return;
    }
    setScheduling(true);
    setScheduleError(null);
    try {
      const result = await scheduleTasks({ projectIds: toSchedule, workingHours: DEFAULT_WH });
      if (result.unschedulable?.length > 0) {
        const reasons = result.unschedulable.map((u: { reason: string }) => u.reason).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
        setScheduleError(
          `${result.unschedulable.length} task(s) couldn't be scheduled: ${reasons.join('; ')}`
        );
      }
      navigate('/schedule');
    } catch (err) {
      setScheduleError((err as Error).message);
    } finally {
      setScheduling(false);
    }
  }

  if (!localProjects.length) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="text-5xl mb-4">🤔</div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Nothing to review</h2>
          <p className="text-slate-500 dark:text-gray-400 mb-6 text-sm">
            Go back to the first step and type your goals.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            ← Start over
          </button>
        </div>
      </Layout>
    );
  }

  const pending = localProjects.filter((p) => !confirmedIds.has(p.id) && !rejectedIds.has(p.id));
  const totalConfirmedTasks = localProjects
    .filter((p) => confirmedIds.has(p.id))
    .flatMap((p) => p.tasks).length;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Instruction banner */}
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-2xl p-5">
          <div className="flex gap-3">
            <span className="text-xl flex-shrink-0">✅</span>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-base">
                Review your AI-generated plan
              </h2>
              <p className="text-sm text-slate-600 dark:text-gray-300 mt-1 leading-relaxed">
                Claude has broken your goals into projects and tasks. Here's what to do:
              </p>
              <ul className="mt-2 space-y-1">
                {[
                  '👆 Hover over any task and click Edit to rename it or adjust the time estimate',
                  '✅ Click Confirm on projects you want scheduled — rejected ones are ignored',
                  '🚀 Hit "Schedule" when ready to push everything to your Google Calendar',
                ].map((tip) => (
                  <li key={tip} className="text-xs text-slate-600 dark:text-gray-400 flex gap-2">
                    <span className="flex-shrink-0">{tip.slice(0, 2)}</span>
                    <span>{tip.slice(3)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Projects', value: localProjects.length, color: 'text-slate-700 dark:text-slate-200' },
            { label: 'Confirmed', value: confirmedIds.size, color: 'text-green-600 dark:text-green-400' },
            { label: 'Tasks ready', value: totalConfirmedTasks, color: 'text-indigo-600 dark:text-indigo-400' },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-3 text-center shadow-sm"
            >
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Project cards */}
        <div className="space-y-4">
          {localProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              people={people}
              onConfirm={(id) => confirmMutation.mutate(id)}
              onReject={(id) => rejectMutation.mutate(id)}
              onUpdateTask={handleUpdateTask}
              onUpdateProject={handleUpdateProject}
              isConfirmed={confirmedIds.has(project.id)}
              isRejected={rejectedIds.has(project.id)}
            />
          ))}
        </div>

        {/* Error */}
        {scheduleError && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-sm text-amber-800 dark:text-amber-300">
            <span className="font-semibold">⚠️ Note:</span> {scheduleError}
          </div>
        )}

        {/* Action bar */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-4 shadow-sm">
          {pending.length > 0 && (
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100 dark:border-gray-800">
              <p className="text-xs text-slate-500 dark:text-gray-400">
                {pending.length} project{pending.length > 1 ? 's' : ''} still need a decision
              </p>
              <button
                onClick={() => pending.forEach((p) => confirmMutation.mutate(p.id))}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
              >
                Confirm all remaining
              </button>
            </div>
          )}

          <button
            onClick={handleScheduleAll}
            disabled={confirmedIds.size === 0 || scheduling}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-200 dark:disabled:bg-gray-800 disabled:text-slate-400 dark:disabled:text-gray-600 text-white font-semibold rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            {scheduling ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Finding free slots in your calendar…</span>
              </>
            ) : confirmedIds.size === 0 ? (
              'Confirm at least one project to schedule'
            ) : (
              <>
                <span>📅 Schedule {totalConfirmedTasks} task{totalConfirmedTasks !== 1 ? 's' : ''} to calendar</span>
                <span>→</span>
              </>
            )}
          </button>
        </div>

      </div>
    </Layout>
  );
}
