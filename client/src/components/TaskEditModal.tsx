import { useState, useEffect } from 'react';
import type { Task, Priority, Person } from '../../../shared/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: 'high',   label: '🔴 High — urgent or deadline-driven',  color: 'border-red-400 bg-red-50 dark:bg-red-900/20' },
  { value: 'medium', label: '🟡 Medium — normal importance',         color: 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' },
  { value: 'low',    label: '⚪ Low — nice to have',                  color: 'border-slate-300 bg-slate-50 dark:bg-slate-800' },
];

interface Props {
  task: Task & { notes?: string | null };
  siblingTasks?: Task[];
  people: Person[];
  onSave: (id: string, updates: Partial<Task>) => void;
  onClose: () => void;
}

export default function TaskEditModal({ task, siblingTasks = [], people, onSave, onClose }: Props) {
  const [title, setTitle]         = useState(task.title);
  const [minutes, setMinutes]     = useState(task.estimatedMinutes);
  const [maxBlock, setMaxBlock]   = useState<string>(task.maxBlockMinutes?.toString() ?? '');
  const [priority, setPriority]   = useState<Priority>(task.priority ?? 'medium');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task.assigneeIds ?? []);
  const [dependsOnTaskId, setDependsOnTaskId] = useState<string | null>(task.dependsOnTaskId ?? null);
  const [deadline, setDeadline] = useState(task.deadline ?? '');
  const [startDate, setStartDate] = useState(task.startDate ?? '');
  const [useCustomDays, setUseCustomDays] = useState(!!task.allowedDays);
  const [allowedDays, setAllowedDays] = useState<number[]>(task.allowedDays ?? [1,2,3,4,5]);
  const [useTimeWindow, setUseTimeWindow] = useState(task.allowedStartHour != null || task.allowedEndHour != null);
  const [taskStartHour, setTaskStartHour] = useState(task.allowedStartHour ?? 9);
  const [taskEndHour, setTaskEndHour] = useState(task.allowedEndHour ?? 22);

  // Tasks that can be dependencies (earlier in order, not itself)
  const eligibleDeps = siblingTasks.filter((t) => t.id !== task.id && t.order < task.order);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function toggleDay(day: number) {
    setAllowedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function save() {
    onSave(task.id, {
      title,
      estimatedMinutes: minutes,
      maxBlockMinutes: maxBlock ? Number(maxBlock) : null,
      priority,
      assigneeIds,
      dependsOnTaskId,
      deadline: deadline || null,
      startDate: startDate || null,
      allowedDays: useCustomDays ? allowedDays : null,
      allowedStartHour: useTimeWindow ? taskStartHour : null,
      allowedEndHour: useTimeWindow ? taskEndHour : null,
    });
    onClose();
  }

  const primaryAssignee = people.find((p) => assigneeIds[0] === p.id);
  const splitCount = maxBlock && Number(maxBlock) < minutes
    ? Math.ceil(minutes / Number(maxBlock))
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-gray-700 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-gray-800">
            <h2 className="font-bold text-slate-900 dark:text-white text-lg">Edit task</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 text-xl leading-none"
            >
              ✕
            </button>
          </div>

          <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[70vh]">

            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
                Task name
              </label>
              <input
                autoFocus
                className="w-full border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
              />
            </div>

            {/* Time row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
                  Total time (minutes)
                </label>
                <input
                  type="number" min={5} max={480} step={5}
                  className="w-full border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                  value={minutes}
                  onChange={(e) => setMinutes(+e.target.value)}
                />
                <p className="text-xs text-slate-400 dark:text-gray-500">
                  {minutes >= 60
                    ? `${Math.floor(minutes/60)}h ${minutes%60 > 0 ? `${minutes%60}m` : ''}`
                    : `${minutes} min`}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
                  Max per day (optional)
                </label>
                <input
                  type="number" min={10} max={minutes} step={5}
                  placeholder="No limit"
                  className="w-full border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center placeholder-slate-300 dark:placeholder-gray-600"
                  value={maxBlock}
                  onChange={(e) => setMaxBlock(e.target.value)}
                />
                {splitCount ? (
                  <p className="text-xs text-indigo-600 dark:text-indigo-400">
                    ✂️ Spread across {splitCount} days (one block per day)
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-gray-500">
                    e.g. 30 = max 30 min/day on this task
                  </p>
                )}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
                  Start date <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="date"
                  className="w-full border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <p className="text-xs text-slate-400 dark:text-gray-500">Won't schedule before this date</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
                  Deadline <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="date"
                  className="w-full border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
                <p className="text-xs text-slate-400 dark:text-gray-500">Must finish by this date</p>
              </div>
            </div>

            {/* Dependency */}
            {eligibleDeps.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
                  Must complete first (optional)
                </label>
                <select
                  className="w-full border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={dependsOnTaskId ?? ''}
                  onChange={(e) => setDependsOnTaskId(e.target.value || null)}
                >
                  <option value="">— No dependency —</option>
                  {eligibleDeps.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                {dependsOnTaskId && (
                  <p className="text-xs text-indigo-600 dark:text-indigo-400">
                    This task won't start until the day after the above task finishes.
                  </p>
                )}
              </div>
            )}

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
                Priority
              </label>
              <div className="space-y-2">
                {PRIORITY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      priority === opt.value
                        ? opt.color + ' border-opacity-100'
                        : 'border-slate-100 dark:border-gray-800 hover:border-slate-200 dark:hover:border-gray-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="priority"
                      value={opt.value}
                      checked={priority === opt.value}
                      onChange={() => setPriority(opt.value)}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      priority === opt.value ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 dark:border-gray-600'
                    }`}>
                      {priority === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-sm text-slate-700 dark:text-gray-200">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Assignees */}
            {people.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
                  Assigned to <span className="normal-case font-normal">(select one or more)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {people.map((p) => {
                    const selected = assigneeIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleAssignee(p.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-colors ${
                          selected
                            ? 'text-white border-transparent'
                            : 'bg-white dark:bg-gray-800 text-slate-600 dark:text-gray-300 border-slate-200 dark:border-gray-700'
                        }`}
                        style={selected ? { backgroundColor: p.color, borderColor: p.color } : { borderColor: p.color + '60' }}
                      >
                        {selected && <span className="text-white text-xs">✓</span>}
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                {assigneeIds.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-gray-500">No assignee — uses global schedule</p>
                )}
                {primaryAssignee && (
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    Scheduled within {primaryAssignee.name}'s hours
                    {assigneeIds.length > 1 && ` · ${assigneeIds.length - 1} more assigned`}
                  </p>
                )}
              </div>
            )}

            {/* Specific days */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setUseCustomDays((s) => !s)}
                  className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${useCustomDays ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-gray-700'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${useCustomDays ? 'left-4' : 'left-0.5'}`} />
                </div>
                <span className="text-xs font-semibold text-slate-600 dark:text-gray-300">
                  Only schedule on specific days
                </span>
              </label>

              {useCustomDays && (
                <div className="pl-11 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((day, i) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(i)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${
                          allowedDays.includes(i)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-gray-800 text-slate-500 dark:text-gray-400 border-slate-200 dark:border-gray-700'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 dark:text-gray-500">
                    Task will only be scheduled on the selected days
                  </p>
                </div>
              )}
            </div>

            {/* Preferred time of day */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setUseTimeWindow((s) => !s)}
                  className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${useTimeWindow ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-gray-700'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${useTimeWindow ? 'left-4' : 'left-0.5'}`} />
                </div>
                <span className="text-xs font-semibold text-slate-600 dark:text-gray-300">
                  Only schedule during specific hours
                </span>
              </label>

              {useTimeWindow && (
                <div className="pl-11 flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-slate-500 dark:text-gray-400">From</label>
                    <select
                      className="border border-slate-200 dark:border-gray-700 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white"
                      value={taskStartHour}
                      onChange={(e) => setTaskStartHour(+e.target.value)}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-slate-500 dark:text-gray-400">To</label>
                    <select
                      className="border border-slate-200 dark:border-gray-700 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white"
                      value={taskEndHour}
                      onChange={(e) => setTaskEndHour(+e.target.value)}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 border-t border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-800/50">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-white dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!title.trim()}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
