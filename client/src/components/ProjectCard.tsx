import { useState } from 'react';
import type { Project, Person, Task } from '../../../shared/types';
import TaskRow from './TaskRow';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  project: Project;
  people: Person[];
  onConfirm: (projectId: string) => void;
  onReject: (projectId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onUpdateProject: (projectId: string, updates: { deadline?: string | null; allowedDays?: number[] | null; allowedStartHour?: number | null; allowedEndHour?: number | null }) => void;
  isConfirmed: boolean;
  isRejected: boolean;
}

export default function ProjectCard({
  project,
  people,
  onConfirm,
  onReject,
  onUpdateTask,
  onUpdateProject,
  isConfirmed,
  isRejected,
}: Props) {
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [deadline, setDeadline] = useState(project.deadline ?? '');
  const [useCustomDays, setUseCustomDays] = useState(!!project.allowedDays);
  const [allowedDays, setAllowedDays] = useState<number[]>(project.allowedDays ?? [1, 2, 3, 4, 5]);
  const [startHour, setStartHour] = useState(project.allowedStartHour ?? '');
  const [endHour, setEndHour] = useState(project.allowedEndHour ?? '');

  const totalMinutes = project.tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const totalLabel = hours > 0 ? `${hours}h ${mins > 0 ? `${mins}m` : ''}` : `${mins}m`;

  const borderClass = isConfirmed ? 'border-green-300 dark:border-green-700' : 'border-slate-200 dark:border-gray-800';
  const bgClass = isConfirmed
    ? 'bg-green-50 dark:bg-green-900/10'
    : isRejected
    ? 'bg-slate-50 dark:bg-gray-800/50 opacity-50'
    : 'bg-white dark:bg-gray-900';

  function saveProjectSettings() {
    onUpdateProject(project.id, {
      deadline: deadline || null,
      allowedDays: useCustomDays ? allowedDays : null,
      allowedStartHour: useCustomDays && startHour !== '' ? Number(startHour) : null,
      allowedEndHour: useCustomDays && endHour !== '' ? Number(endHour) : null,
    });
    setShowProjectSettings(false);
  }

  function toggleDay(day: number) {
    setAllowedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  return (
    <div className={`rounded-2xl border shadow-sm transition-all ${borderClass} ${bgClass}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight">
              {project.title}
            </h3>
            {isConfirmed && (
              <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-semibold">✓ Confirmed</span>
            )}
            {isRejected && (
              <span className="text-xs bg-slate-100 dark:bg-gray-800 text-slate-400 px-2 py-0.5 rounded-full font-medium">Rejected</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <p className="text-xs text-slate-400 dark:text-gray-500">
              {project.tasks.length} task{project.tasks.length !== 1 ? 's' : ''} · {totalLabel}
            </p>
            {project.deadline && (
              <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                📅 Due {project.deadline}
              </span>
            )}
            {project.allowedDays && (
              <span className="text-xs text-indigo-600 dark:text-indigo-400">
                🗓 {project.allowedDays.map((d) => DAYS[d]).join(', ')} only
              </span>
            )}
          </div>
        </div>

        {!isConfirmed && !isRejected && (
          <div className="flex gap-2 flex-shrink-0 mt-0.5">
            <button
              onClick={() => onReject(project.id)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-gray-400 border border-slate-200 dark:border-gray-700 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
            >
              Reject
            </button>
            <button
              onClick={() => onConfirm(project.id)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              Confirm ✓
            </button>
          </div>
        )}
        {isConfirmed && (
          <span className="text-sm text-green-600 dark:text-green-400 font-medium flex-shrink-0">✓ Confirmed</span>
        )}
      </div>

      {/* Task list */}
      <div className="px-3 pb-2 space-y-0.5">
        {project.tasks.map((task, i) => (
          <TaskRow key={task.id} task={task} index={i + 1} people={people} onUpdate={onUpdateTask} />
        ))}
      </div>

      {/* Project settings expander */}
      {!isRejected && (
        <div className="px-5 pb-4">
          <button
            onClick={() => setShowProjectSettings((s) => !s)}
            className="text-xs text-slate-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium"
          >
            {showProjectSettings ? '▲ Hide' : '▼ Project settings'} (deadline, specific days, hours)
          </button>

          {showProjectSettings && (
            <div className="mt-3 p-4 bg-slate-50 dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 space-y-4">
              {/* Deadline */}
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-gray-300 font-medium">
                Deadline (optional)
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-48 border border-slate-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm"
                />
                <span className="text-slate-400 font-normal">Tasks are prioritized to finish before this date.</span>
              </label>

              {/* Custom work days toggle */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-gray-300 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomDays}
                    onChange={(e) => setUseCustomDays(e.target.checked)}
                    className="rounded"
                  />
                  Schedule this project on specific days only
                </label>

                {useCustomDays && (
                  <div className="space-y-3 pl-5">
                    <div className="flex gap-1.5 flex-wrap">
                      {DAYS.map((day, i) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(i)}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                            allowedDays.includes(i)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white dark:bg-gray-700 text-slate-500 dark:text-gray-400 border-slate-200 dark:border-gray-600'
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-gray-400">
                        Start hour (optional)
                        <input
                          type="number" min={0} max={23} placeholder="e.g. 9"
                          value={startHour}
                          onChange={(e) => setStartHour(e.target.value)}
                          className="w-20 border border-slate-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-sm text-slate-900 dark:text-white"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-gray-400">
                        End hour (optional)
                        <input
                          type="number" min={0} max={23} placeholder="e.g. 12"
                          value={endHour}
                          onChange={(e) => setEndHour(e.target.value)}
                          className="w-20 border border-slate-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-sm text-slate-900 dark:text-white"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={saveProjectSettings}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Save project settings
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
