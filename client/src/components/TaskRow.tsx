import { useState } from 'react';
import type { Task, Priority, Person } from '../../../shared/types';
import TaskEditModal from './TaskEditModal';

const PRIORITY_BADGE: Record<Priority, string> = {
  high:   'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  low:    'bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400',
};

interface Props {
  task: Task & { notes?: string | null };
  index: number;
  people: Person[];
  onUpdate: (id: string, updates: Partial<Task>) => void;
}

export default function TaskRow({ task, index, people, onUpdate }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const assignees = people.filter((p) => (task.assigneeIds ?? []).includes(p.id));
  const splitCount = task.maxBlockMinutes && task.maxBlockMinutes < task.estimatedMinutes
    ? Math.ceil(task.estimatedMinutes / task.maxBlockMinutes)
    : null;

  return (
    <>
      <div
        className="flex items-start gap-2 py-2 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-gray-800/50 group cursor-pointer transition-colors"
        onClick={() => setModalOpen(true)}
      >
        <span className="text-xs text-slate-300 dark:text-gray-600 font-mono w-5 text-right flex-shrink-0 mt-0.5">
          {index}.
        </span>
        <div className="w-4 h-4 rounded-full border-2 border-slate-200 dark:border-gray-700 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800 dark:text-gray-200 leading-snug">{task.title}</p>
          {task.notes && (
            <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{task.notes}</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {task.dependsOnTaskId && (
              <p className="text-xs text-amber-500 dark:text-amber-400">↳ after previous task</p>
            )}
            {splitCount && (
              <p className="text-xs text-indigo-500 dark:text-indigo-400">
                ✂️ {splitCount} × {task.maxBlockMinutes} min sessions
              </p>
            )}
            {task.allowedDays && (
              <p className="text-xs text-slate-400 dark:text-gray-500">
                📅 specific days only
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {assignees.length > 0 && (
            <div className="flex -space-x-1">
              {assignees.map((a) => (
                <div
                  key={a.id}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-white dark:border-gray-900"
                  style={{ backgroundColor: a.color }}
                  title={a.name}
                >
                  {a.name[0].toUpperCase()}
                </div>
              ))}
            </div>
          )}
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[task.priority ?? 'medium']}`}>
            {task.priority ?? 'medium'}
          </span>
          <span className="text-xs text-slate-400 dark:text-gray-500 bg-slate-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
            {task.estimatedMinutes} min
          </span>
          <span className="text-xs text-slate-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
            ✎
          </span>
        </div>
      </div>

      {modalOpen && (
        <TaskEditModal
          task={task}
          people={people}
          onSave={onUpdate}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
