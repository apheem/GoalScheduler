import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { parseGoals, createTask, deleteTask, deleteProject, confirmProject, rejectProject, scheduleTasks, updateTask, unscheduleProject } from '../api/client';
import TaskEditModal from '../components/TaskEditModal';
import Layout from '../components/Layout';
import PeopleManager from '../components/PeopleManager';
import type { Project, Person, Task } from '../../../shared/types';

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Needs review',  color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  confirmed: { label: 'Confirmed',     color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  rejected:  { label: 'Rejected',      color: 'bg-slate-100 dark:bg-gray-800 text-slate-400 dark:text-gray-600' },
  complete:  { label: 'Complete',      color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' },
};

const PRIORITY_COLOR: Record<string, string> = {
  high:   'text-red-500',
  medium: 'text-amber-500',
  low:    'text-slate-400',
};

export default function InputPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showInput, setShowInput] = useState(false);
  const [rawInput, setRawInput] = useState('');

  // Load all persisted projects from DB
  const { data: allProjects = [], refetch: refetchProjects } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then((r) => r.json()),
  });

  const { data: people = [] } = useQuery<Person[]>({
    queryKey: ['people'],
    queryFn: () => fetch('/api/people').then((r) => r.json()),
  });

  const activeProjects = allProjects.filter((p) => p.status !== 'rejected');
  const hasProjects = activeProjects.length > 0;
  const confirmedProjectIds = activeProjects
    .filter((p) => p.status === 'confirmed' || p.tasks.some((t) => t.status === 'scheduled' || t.status === 'rescheduled'))
    .map((p) => p.id);

  // Show input form directly if no projects exist
  const inputVisible = showInput || !hasProjects;

  const parseMutation = useMutation({
    mutationFn: () => parseGoals({ rawInput, workingHours: {
      startHour: 9, endHour: 18, workDays: [1,2,3,4,5],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }}),
    onSuccess: (data) => {
      queryClient.setQueryData(['projects', 'parsed'], data.projects);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setRawInput('');
      setShowInput(false);
      refetchProjects();
    },
  });

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Team Members */}
        <PeopleManager />

        {/* Existing projects */}
        {hasProjects && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your projects</h2>
              <div className="flex items-center gap-3">
                {confirmedProjectIds.length > 0 && (
                  <ScheduleAllButton
                    projectIds={confirmedProjectIds}
                    onDone={() => { queryClient.invalidateQueries({ queryKey: ['projects'] }); navigate('/schedule'); }}
                  />
                )}
                <button
                  onClick={() => navigate('/schedule')}
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                >
                  View schedule →
                </button>
              </div>
            </div>

            {activeProjects.map((project) => (
              <ProjectDashboardCard
                key={project.id}
                project={project}
                people={people}
                allConfirmedProjectIds={confirmedProjectIds}
                onRefresh={refetchProjects}
              />
            ))}
          </div>
        )}

        {/* Add new goals */}
        {hasProjects && !inputVisible && (
          <button
            onClick={() => setShowInput(true)}
            className="w-full py-3 border-2 border-dashed border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-2xl text-sm font-medium transition-colors"
          >
            + Add new goals or projects
          </button>
        )}

        {/* Input form */}
        {inputVisible && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  {hasProjects ? 'Add new goals' : 'What do you need to get done?'}
                </h1>
                <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
                  Describe your goals, projects, and tasks — as messy as you want.
                </p>
              </div>
              {hasProjects && (
                <button
                  onClick={() => setShowInput(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 text-xl leading-none flex-shrink-0"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="px-5">
              <textarea
                autoFocus
                className="w-full h-44 p-4 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-slate-900 dark:text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all leading-relaxed"
                placeholder="This week I need to finish the user auth — login, logout, and password reset. Also prep slides for Thursday's client meeting, roughly 20 slides…"
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
              />
            </div>

            {parseMutation.isError && (
              <div className="mx-5 mt-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl space-y-2">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                  ⚠️ {(parseMutation.error as Error).message}
                </p>
                {(parseMutation.error as Error).message.includes('server') && (
                  <div className="bg-red-100 dark:bg-red-900/40 rounded-lg px-3 py-2">
                    <p className="text-xs text-red-600 dark:text-red-300 font-medium mb-1">How to start the server:</p>
                    <ol className="text-xs text-red-600 dark:text-red-300 space-y-1 list-decimal list-inside">
                      <li>Double-click <code className="bg-red-200 dark:bg-red-900 px-1 rounded">Start GoalScheduler.bat</code> on your desktop</li>
                      <li>Wait ~5 seconds for the server to start, then try again</li>
                    </ol>
                  </div>
                )}
              </div>
            )}

            <div className="px-5 py-5">
              <button
                type="button"
                disabled={!rawInput.trim() || parseMutation.isPending}
                onClick={() => parseMutation.mutate()}
                className="w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-300 dark:disabled:bg-indigo-800 text-white font-semibold rounded-xl transition-colors shadow-sm text-sm flex items-center justify-center gap-2"
              >
                {parseMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Claude is organizing your tasks…</span>
                  </>
                ) : (
                  <>
                    <span>Break it down</span>
                    <span>→</span>
                  </>
                )}
              </button>
              {!rawInput.trim() && (
                <p className="text-center text-xs text-slate-400 dark:text-gray-500 mt-2">
                  Type something above to get started
                </p>
              )}
            </div>
          </div>
        )}

        {!hasProjects && (
          <div className="flex items-center gap-3 px-1">
            <div className="flex-1 h-px bg-slate-200 dark:bg-gray-800" />
            <p className="text-xs text-slate-400 dark:text-gray-600 flex-shrink-0">
              After this → Review tasks → Schedule to calendar
            </p>
            <div className="flex-1 h-px bg-slate-200 dark:bg-gray-800" />
          </div>
        )}
      </div>
    </Layout>
  );
}

// ─── Per-project dashboard card ───────────────────────────────────────────────

function ProjectDashboardCard({
  project,
  people,
  allConfirmedProjectIds,
  onRefresh,
}: {
  project: Project;
  people: Person[];
  allConfirmedProjectIds: string[];
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(project.status === 'pending');
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskMins, setNewTaskMins] = useState(30);
  const [savingTask, setSavingTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const badge = STATUS_BADGE[project.status] ?? STATUS_BADGE.pending;

  const confirmMutation = useMutation({
    mutationFn: () => confirmProject(project.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const deleteProjMutation = useMutation({
    mutationFn: () => deleteProject(project.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    onError: (err: Error) => {
      setConfirmDelete(false);
      setDeleteError(err.message);
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    onError: (err: Error) => setDeleteError(err.message),
  });

  const unscheduleMutation = useMutation({
    mutationFn: () => unscheduleProject(project.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    onError: (err: Error) => setDeleteError(err.message),
  });

  async function handleSchedule() {
    try {
      const result = await scheduleTasks({
        projectIds: [project.id],
        workingHours: {
          startHour: 9, endHour: 18, workDays: [1,2,3,4,5],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (result.unschedulable?.length > 0) {
        const reasons = result.unschedulable.map((u) => u.reason).filter((v, i, a) => a.indexOf(v) === i);
        setDeleteError(`${result.unschedulable.length} task(s) couldn't be scheduled: ${reasons.join('; ')}`);
      } else {
        navigate('/schedule');
      }
    } catch (err) {
      setDeleteError((err as Error).message);
    }
  }

  async function handleAddTask() {
    if (!newTaskTitle.trim()) return;
    setSavingTask(true);
    try {
      await createTask({ projectId: project.id, title: newTaskTitle.trim(), estimatedMinutes: newTaskMins });
      setNewTaskTitle('');
      setNewTaskMins(30);
      setAddingTask(false);
      onRefresh();
    } finally {
      setSavingTask(false);
    }
  }

  function handleSaveTask(taskId: string, updates: Partial<Task>) {
    updateTask(taskId, updates as Record<string, unknown>);
    onRefresh();
  }

  function goToReview() {
    queryClient.setQueryData(['projects', 'parsed'], [project]);
    navigate('/review');
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3.5">
          <button
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
            onClick={() => setExpanded((s) => !s)}
          >
            <span className="text-slate-300 dark:text-gray-600 text-xs">{expanded ? '▲' : '▼'}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{project.title}</p>
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
                {project.tasks.length} task{project.tasks.length !== 1 ? 's' : ''}
                {project.deadline && ` · due ${project.deadline}`}
              </p>
            </div>
          </button>

          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badge.color}`}>
            {badge.label}
          </span>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {project.status === 'pending' && (
              <button
                onClick={goToReview}
                className="text-xs px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
              >
                Review →
              </button>
            )}
            {project.status === 'confirmed' && (
              <button
                onClick={handleSchedule}
                className="text-xs px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                Schedule →
              </button>
            )}
            {project.tasks.some((t) => t.status === 'scheduled') && (
              <button
                onClick={() => unscheduleMutation.mutate()}
                disabled={unscheduleMutation.isPending}
                className="text-xs px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                title="Remove all calendar events for this project"
              >
                {unscheduleMutation.isPending ? '…' : 'Remove from Calendar'}
              </button>
            )}
            {/* Delete project */}
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-red-500">Delete project?</span>
                <button
                  onClick={() => deleteProjMutation.mutate()}
                  className="text-xs px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-2 py-1 border border-slate-200 dark:border-gray-700 text-slate-500 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs p-1.5 text-slate-300 dark:text-gray-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title="Delete project"
              >
                🗑
              </button>
            )}
          </div>
        </div>

        {/* Delete error */}
        {deleteError && (
          <div className="mx-4 mb-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl flex items-center justify-between gap-2">
            <p className="text-xs text-red-600 dark:text-red-400">⚠️ {deleteError}</p>
            <button onClick={() => setDeleteError(null)} className="text-red-400 hover:text-red-600 text-sm leading-none">✕</button>
          </div>
        )}

        {/* Expanded task list */}
        {expanded && (
          <div className="border-t border-slate-100 dark:border-gray-800">
            {project.tasks.length === 0 && !addingTask && (
              <p className="px-5 py-4 text-xs text-slate-400 dark:text-gray-500 italic">No tasks yet.</p>
            )}

            {project.tasks.map((task, i) => {
              const assignees = people.filter((p) => (task.assigneeIds ?? []).includes(p.id));
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-50 dark:border-gray-800/50 last:border-b-0 group hover:bg-slate-50 dark:hover:bg-gray-800/40 transition-colors"
                >
                  <span className="text-xs text-slate-300 dark:text-gray-600 font-mono w-4 text-right flex-shrink-0">{i + 1}.</span>

                  {/* Clickable task info → opens edit modal */}
                  <button
                    className="flex-1 min-w-0 text-left"
                    onClick={() => setEditingTask(task)}
                  >
                    <p className="text-sm text-slate-800 dark:text-gray-200 leading-snug truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400 dark:text-gray-500">{task.estimatedMinutes} min</span>
                      {task.maxBlockMinutes != null && (
                        <span className="text-xs text-indigo-500 dark:text-indigo-400">✂ {task.maxBlockMinutes}m/day</span>
                      )}
                      <span className={`text-xs font-medium ${PRIORITY_COLOR[task.priority ?? 'medium']}`}>
                        {task.priority === 'high' ? '● high' : task.priority === 'low' ? '○ low' : ''}
                      </span>
                      {/* Assignee avatars */}
                      {assignees.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <div className="flex -space-x-1">
                            {assignees.map((a) => (
                              <div
                                key={a.id}
                                className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold border border-white dark:border-gray-900"
                                style={{ backgroundColor: a.color }}
                                title={a.name}
                              >
                                {a.name[0].toUpperCase()}
                              </div>
                            ))}
                          </div>
                          <span className="text-xs text-slate-500 dark:text-gray-400">
                            {assignees.map((a) => a.name).join(', ')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-gray-600 italic opacity-0 group-hover:opacity-100 transition-opacity">
                          click to assign
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Edit hint + delete task */}
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingTask(task)}
                      className="text-xs px-2 py-1 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteTaskMutation.mutate(task.id)}
                      className="text-xs p-1 text-slate-300 dark:text-gray-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Delete task"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add task form */}
            {addingTask ? (
              <div className="px-5 py-3 bg-slate-50 dark:bg-gray-800/50 border-t border-slate-100 dark:border-gray-800 space-y-2">
                <input
                  autoFocus
                  placeholder="Task name…"
                  className="w-full border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                />
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 dark:text-gray-400">Minutes:</label>
                    <input
                      type="number" min={5} max={480} step={5}
                      className="w-16 border border-slate-200 dark:border-gray-700 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={newTaskMins}
                      onChange={(e) => setNewTaskMins(+e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={() => { setAddingTask(false); setNewTaskTitle(''); }}
                      className="text-xs px-3 py-1.5 border border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!newTaskTitle.trim() || savingTask}
                      onClick={handleAddTask}
                      className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg font-medium transition-colors"
                    >
                      {savingTask ? '…' : 'Add task'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingTask(true)}
                className="w-full flex items-center gap-2 px-5 py-2.5 text-xs text-slate-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors border-t border-slate-100 dark:border-gray-800"
              >
                <span>+</span>
                <span>Add a task</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Task edit modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          siblingTasks={project.tasks}
          people={people}
          onSave={handleSaveTask}
          onClose={() => { setEditingTask(null); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Schedule-all button ──────────────────────────────────────────────────────

function ScheduleAllButton({ projectIds, onDone }: { projectIds: string[]; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const result = await scheduleTasks({
        projectIds,
        workingHours: {
          startHour: 9, endHour: 18, workDays: [1,2,3,4,5],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      if (result.unschedulable?.length > 0) {
        const reasons = result.unschedulable.map((u) => u.reason).filter((v, i, a) => a.indexOf(v) === i);
        setError(`${result.unschedulable.length} task(s) couldn't be scheduled: ${reasons.join('; ')}`);
      }
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-500">⚠️ {error}</span>}
      <button
        onClick={handleClick}
        disabled={loading}
        className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors"
      >
        {loading ? '…' : `Schedule all (${projectIds.length})`}
      </button>
    </div>
  );
}
