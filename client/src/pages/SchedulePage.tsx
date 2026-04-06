import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, isToday, isTomorrow, isPast } from 'date-fns';
import { getScheduled, completeTask, triggerRescheduler, getAuthStatus, getAuthConnections } from '../api/client';
import Layout from '../components/Layout';
import type { Task, TaskBlock, Person } from '../../../shared/types';

type ScheduledTask = Task & { blocks: TaskBlock[] };
type BlockEntry = { task: ScheduledTask; block: TaskBlock | null };

export default function SchedulePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filterPerson, setFilterPerson] = useState<string | null>(null);

  const { data: tasks = [], isLoading } = useQuery<ScheduledTask[]>({
    queryKey: ['scheduled-tasks'],
    queryFn: getScheduled as () => Promise<ScheduledTask[]>,
    refetchInterval: 30_000,
  });

  const { data: people = [] } = useQuery<Person[]>({
    queryKey: ['people'],
    queryFn: () => fetch('/api/people').then((r) => r.json()),
  });

  const { data: authStatus } = useQuery({
    queryKey: ['auth-status'],
    queryFn: () => getAuthStatus(),
  });

  const { data: connections = [] } = useQuery<string[]>({
    queryKey: ['auth-connections'],
    queryFn: getAuthConnections,
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => completeTask(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduled-tasks'] }),
  });

  const rescheduleMutation = useMutation({
    mutationFn: triggerRescheduler,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduled-tasks'] }),
  });

  const anyCalendarConnected = connections.length > 0;

  // Filter tasks by selected person's assigneeIds
  const filteredTasks = filterPerson
    ? tasks.filter((t) => (t.assigneeIds ?? []).includes(filterPerson))
    : tasks;

  // Group by day — explode multi-block tasks into individual block entries
  const byDay = filteredTasks.reduce<Record<string, BlockEntry[]>>((acc, task) => {
    if (task.blocks && task.blocks.length > 0) {
      for (const block of task.blocks) {
        const day = format(parseISO(block.scheduledStart), 'yyyy-MM-dd');
        if (!acc[day]) acc[day] = [];
        acc[day].push({ task, block });
      }
    } else if (task.scheduledStart) {
      const day = format(parseISO(task.scheduledStart), 'yyyy-MM-dd');
      if (!acc[day]) acc[day] = [];
      acc[day].push({ task, block: null });
    }
    return acc;
  }, {});

  const sortedDays = Object.keys(byDay).sort();
  const needsAttention = filteredTasks.filter((t) => t.status === 'needs_attention');
  const completedCount = filteredTasks.filter((t) => t.status === 'complete').length;
  const scheduledCount = filteredTasks.filter((t) => t.status === 'scheduled' || t.status === 'rescheduled').length;

  function dayLabel(dateStr: string) {
    const d = parseISO(dateStr);
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    return format(d, 'EEEE, MMMM d');
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Your schedule</h1>
            <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
              {anyCalendarConnected
                ? 'Tasks are synced to Google Calendar. Check them off as you go.'
                : 'Connect Google Calendar to sync tasks automatically.'}
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="flex-shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            + New goals
          </button>
        </div>

        {/* Person filter pills */}
        {people.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilterPerson(null)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filterPerson === null
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-700'
              }`}
            >
              All
            </button>
            {people.map((person) => (
              <button
                key={person.id}
                onClick={() => setFilterPerson(filterPerson === person.id ? null : person.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  filterPerson === person.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-700'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: person.color }}
                />
                {person.name}
              </button>
            ))}
          </div>
        )}

        {/* Calendar connection banner */}
        {!anyCalendarConnected && authStatus?.configured && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">📅</span>
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Google Calendar not connected</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Tasks are scheduled but won't appear on your calendar until you connect.</p>
              </div>
            </div>
            <a
              href="/api/auth/google"
              className="flex-shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              Connect →
            </a>
          </div>
        )}

        {!anyCalendarConnected && !authStatus?.configured && (
          <div className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">📅</span>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Google Calendar not set up</p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">Follow the setup guide to sync tasks to your calendar.</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/setup')}
              className="flex-shrink-0 px-4 py-2 border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-gray-300 text-xs font-semibold rounded-xl hover:bg-white dark:hover:bg-gray-700 transition-colors"
            >
              Set up →
            </button>
          </div>
        )}

        {/* Instruction card */}
        {filteredTasks.length > 0 && anyCalendarConnected && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl p-4">
            <div className="flex gap-3">
              <span className="text-lg flex-shrink-0">📅</span>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">Your tasks are on your calendar</p>
                <ul className="mt-1.5 space-y-1">
                  {[
                    '🔘 Click the circle on the left of a task to mark it complete',
                    '🔄 If you don\'t check off a task, it auto-reschedules itself at 11 PM',
                    '⚠️ Tasks rescheduled 3+ times appear in the "Needs attention" section',
                  ].map((tip) => (
                    <li key={tip} className="text-xs text-slate-500 dark:text-gray-400 flex gap-2">
                      <span className="flex-shrink-0">{tip.slice(0, 2)}</span>
                      <span>{tip.slice(3)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        {filteredTasks.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Scheduled', value: scheduledCount, color: 'text-indigo-600 dark:text-indigo-400' },
              { label: 'Completed', value: completedCount, color: 'text-green-600 dark:text-green-400' },
              { label: 'Need attention', value: needsAttention.length, color: needsAttention.length > 0 ? 'text-red-500' : 'text-slate-400 dark:text-gray-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-3 text-center shadow-sm">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Needs attention */}
        {needsAttention.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">⚠️</span>
              <p className="text-sm font-bold text-red-800 dark:text-red-300">
                {needsAttention.length} task{needsAttention.length > 1 ? 's' : ''} need your attention
              </p>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400 mb-3">
              These tasks have been auto-rescheduled too many times. Please manually reschedule them or mark them complete.
            </p>
            <div className="space-y-2">
              {needsAttention.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 bg-white dark:bg-gray-900 rounded-lg px-3 py-2">
                  <p className="text-sm text-slate-700 dark:text-gray-200">{t.title}</p>
                  <button
                    onClick={() => completeMutation.mutate(t.id)}
                    className="text-xs text-green-600 dark:text-green-400 hover:underline flex-shrink-0"
                  >
                    Mark done
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Task list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400 dark:text-gray-500">Loading your schedule…</p>
            </div>
          </div>
        ) : sortedDays.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-10 text-center shadow-sm">
            <div className="text-5xl mb-4">📭</div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">No tasks scheduled yet</h3>
            <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">
              Start by typing your goals, then review and confirm the projects you want scheduled.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate('/')}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
              >
                ✏️ Type your goals
              </button>
              <button
                onClick={() => navigate('/review')}
                className="px-5 py-2.5 border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
              >
                ✅ Review existing plan
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {sortedDays.map((day) => {
              const dayTasks = byDay[day].sort((a, b) => {
                const aStart = a.block?.scheduledStart ?? a.task.scheduledStart ?? '';
                const bStart = b.block?.scheduledStart ?? b.task.scheduledStart ?? '';
                return aStart.localeCompare(bStart);
              });
              const allDone = dayTasks.every((e) => e.task.status === 'complete');
              const isPastDay = isPast(parseISO(day)) && !isToday(parseISO(day));

              return (
                <div key={day}>
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className={`text-sm font-bold uppercase tracking-wide ${
                      isToday(parseISO(day))
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : isPastDay
                        ? 'text-slate-400 dark:text-gray-600'
                        : 'text-slate-600 dark:text-gray-300'
                    }`}>
                      {dayLabel(day)}
                    </h2>
                    {allDone && (
                      <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">All done ✓</span>
                    )}
                    {isToday(parseISO(day)) && !allDone && (
                      <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-medium">Today</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {dayTasks.map(({ task, block }) => (
                      <ScheduledTaskCard
                        key={block ? `${task.id}-b${block.blockIndex}` : task.id}
                        task={task}
                        block={block}
                        people={people}
                        onComplete={(id) => completeMutation.mutate(id)}
                        completing={completeMutation.isPending && completeMutation.variables === task.id}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Dev tools */}
        <div className="pt-4 border-t border-slate-200 dark:border-gray-800 flex items-center justify-between">
          <p className="text-xs text-slate-400 dark:text-gray-600">Auto-rescheduler runs at 11 PM daily</p>
          <button
            onClick={() => rescheduleMutation.mutate()}
            disabled={rescheduleMutation.isPending}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 underline"
          >
            {rescheduleMutation.isPending ? 'Running…' : 'Trigger now (dev)'}
          </button>
        </div>
      </div>
    </Layout>
  );
}

function ScheduledTaskCard({
  task,
  block,
  people,
  onComplete,
  completing,
}: {
  task: ScheduledTask;
  block: TaskBlock | null;
  people: Person[];
  onComplete: (id: string) => void;
  completing: boolean;
}) {
  const blockStart = block?.scheduledStart ?? task.scheduledStart;
  const blockEnd = block?.scheduledEnd ?? task.scheduledEnd;

  const isComplete = task.status === 'complete';
  const isRescheduled = task.status === 'rescheduled';
  const isOverdue =
    !isComplete &&
    blockStart &&
    isPast(parseISO(blockStart)) &&
    !isToday(parseISO(blockStart));

  const startLabel = blockStart ? format(parseISO(blockStart), 'h:mm a') : '';
  const endLabel = blockEnd ? format(parseISO(blockEnd), 'h:mm a') : '';

  // Show actual block duration, not estimatedMinutes
  const blockDurationMin = (blockStart && blockEnd)
    ? Math.round((parseISO(blockEnd).getTime() - parseISO(blockStart).getTime()) / 60_000)
    : task.estimatedMinutes;

  const totalBlocks = block?.totalBlocks ?? 1;
  const partLabel = totalBlocks > 1 ? ` · part ${(block?.blockIndex ?? 0) + 1}/${totalBlocks}` : '';

  const assignees = people.filter((p) => (task.assigneeIds ?? []).includes(p.id));

  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all group ${
      isComplete
        ? 'bg-slate-50 dark:bg-gray-800/30 border-slate-100 dark:border-gray-800'
        : isOverdue
        ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/40 shadow-sm'
        : 'bg-white dark:bg-gray-900 border-slate-200 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800'
    }`}>
      {/* Complete button */}
      <button
        onClick={() => !isComplete && onComplete(task.id)}
        disabled={isComplete || completing}
        title={isComplete ? 'Completed' : 'Mark as complete'}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          isComplete
            ? 'bg-green-500 border-green-500'
            : completing
            ? 'border-indigo-400 animate-pulse'
            : 'border-slate-300 dark:border-gray-600 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer'
        }`}
      >
        {isComplete && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Task info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug ${
          isComplete
            ? 'line-through text-slate-400 dark:text-gray-500'
            : isOverdue
            ? 'text-red-700 dark:text-red-400'
            : 'text-slate-900 dark:text-white'
        }`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <p className="text-xs text-slate-400 dark:text-gray-500">
            {startLabel} – {endLabel}
            <span className="mx-1">·</span>
            {blockDurationMin} min{partLabel}
            {isRescheduled && (
              <span className="ml-2 text-amber-500 dark:text-amber-400 font-medium">
                rescheduled ×{task.rescheduleCount}
              </span>
            )}
            {isOverdue && <span className="ml-2 text-red-500 font-medium">overdue</span>}
          </p>
          {/* Assignee avatars */}
          {assignees.length > 0 && (
            <div className="flex -space-x-1" title={assignees.map((a) => a.name).join(', ')}>
              {assignees.map((a) => (
                <div
                  key={a.id}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold border border-white dark:border-gray-900"
                  style={{ backgroundColor: a.color }}
                >
                  {a.name[0].toUpperCase()}
                </div>
              ))}
              <span className="ml-1.5 text-xs text-slate-400 dark:text-gray-500">
                {assignees.map((a) => a.name).join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {!isComplete && (
        <p className="text-xs text-slate-400 dark:text-gray-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          Click ○ to complete
        </p>
      )}
    </div>
  );
}
