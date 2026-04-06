import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Person, DaySchedule } from '../../../shared/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6',
];

async function fetchPeople(): Promise<Person[]> {
  const res = await fetch('/api/people');
  return res.json();
}

async function createPerson(data: Partial<Person>): Promise<Person> {
  const res = await fetch('/api/people', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function updatePerson(id: string, data: Partial<Person>): Promise<Person> {
  const res = await fetch(`/api/people/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function deletePerson(id: string): Promise<void> {
  await fetch(`/api/people/${id}`, { method: 'DELETE' });
}

// Default schedule when adding a new day
const DEFAULT_START = 9;
const DEFAULT_END = 17;

function PersonForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Person>;
  onSave: (data: Partial<Person>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [timezone] = useState(initial?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  // maxHoursPerDay shown in hours; stored internally as minutes
  const [maxHoursPerDay, setMaxHoursPerDay] = useState(
    Math.round((initial?.maxMinutesPerDay ?? 480) / 60)
  );

  // Per-day schedule: Record<dayIndex, {start, end} | null> where null = day off
  // Build initial state from existing data
  function buildInitialDayMap(): Record<number, DaySchedule | null> {
    const map: Record<number, DaySchedule | null> = {};
    for (let d = 0; d < 7; d++) {
      const inWorkDays = (initial?.workDays ?? [1, 2, 3, 4, 5]).includes(d);
      if (inWorkDays) {
        // Use per-day override if available, else fall back to global start/end
        const override = initial?.daySchedules?.[d];
        map[d] = override ?? {
          start: initial?.startHour ?? DEFAULT_START,
          end: initial?.endHour ?? DEFAULT_END,
        };
      } else {
        map[d] = null;
      }
    }
    return map;
  }

  const [dayMap, setDayMap] = useState<Record<number, DaySchedule | null>>(buildInitialDayMap);

  function toggleDay(d: number) {
    setDayMap((prev) => ({
      ...prev,
      [d]: prev[d] === null
        ? { start: DEFAULT_START, end: DEFAULT_END }
        : null,
    }));
  }

  function setDayHour(d: number, field: 'start' | 'end', value: number) {
    setDayMap((prev) => ({
      ...prev,
      [d]: prev[d] ? { ...prev[d]!, [field]: value } : prev[d],
    }));
  }

  function handleSave() {
    const workDays = Object.keys(dayMap)
      .map(Number)
      .filter((d) => dayMap[d] !== null)
      .sort();

    const activeDaySchedules: Record<number, DaySchedule> = {};
    for (const d of workDays) {
      activeDaySchedules[d] = dayMap[d]!;
    }

    // Derive global start/end as fallback (min start, max end across active days)
    const startHour = workDays.length
      ? Math.min(...workDays.map((d) => activeDaySchedules[d].start))
      : DEFAULT_START;
    const endHour = workDays.length
      ? Math.max(...workDays.map((d) => activeDaySchedules[d].end))
      : DEFAULT_END;

    onSave({
      name,
      color,
      startHour,
      endHour,
      workDays,
      timezone,
      maxMinutesPerDay: maxHoursPerDay * 60,
      daySchedules: activeDaySchedules,
    });
  }

  return (
    <div className="space-y-4">
      {/* Name + color */}
      <div className="flex gap-3 items-end">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Name</label>
          <input
            autoFocus
            placeholder="e.g. Alex"
            className="w-full border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Color</label>
          <div className="flex gap-1.5 flex-wrap w-44">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                style={{ backgroundColor: c, outline: color === c ? `3px solid ${c}` : 'none', outlineOffset: '2px' }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Max hrs/day */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
          Max task hours/day
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number" min={1} max={16} step={1}
            className="w-20 border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center"
            value={maxHoursPerDay}
            onChange={(e) => setMaxHoursPerDay(Math.min(16, Math.max(1, +e.target.value)))}
          />
          <span className="text-xs text-slate-400 dark:text-gray-500">hrs per day (caps scheduled task time)</span>
        </div>
      </div>

      {/* Per-day schedule */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
          Schedule
        </label>
        <div className="rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden">
          {DAYS.map((dayName, d) => {
            const schedule = dayMap[d];
            const isActive = schedule !== null;
            return (
              <div
                key={dayName}
                className={`flex items-center gap-3 px-3 py-2 border-b last:border-b-0 border-slate-100 dark:border-gray-700 ${
                  isActive ? 'bg-white dark:bg-gray-800' : 'bg-slate-50 dark:bg-gray-900'
                }`}
              >
                {/* Toggle */}
                <button
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    isActive
                      ? 'border-transparent'
                      : 'border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                  }`}
                  style={isActive ? { backgroundColor: color, borderColor: color } : {}}
                >
                  {isActive && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                      <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>

                {/* Day name */}
                <span className={`text-xs font-semibold w-7 flex-shrink-0 ${isActive ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-gray-600'}`}>
                  {dayName}
                </span>

                {/* Time inputs */}
                {isActive ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="number" min={0} max={23}
                      className="w-14 border border-slate-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={schedule.start}
                      onChange={(e) => setDayHour(d, 'start', +e.target.value)}
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <input
                      type="number" min={0} max={23}
                      className="w-14 border border-slate-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={schedule.end}
                      onChange={(e) => setDayHour(d, 'end', +e.target.value)}
                    />
                    <span className="text-xs text-slate-400 dark:text-gray-500">
                      ({schedule.end - schedule.start}h)
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-gray-600 italic flex-1">Off</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 dark:text-gray-500">Click the checkbox to toggle a day on/off</p>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2 border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          disabled={!name.trim()}
          onClick={handleSave}
          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-xl text-xs font-semibold transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

export default function PeopleManager() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: people = [] } = useQuery<Person[]>({
    queryKey: ['people'],
    queryFn: fetchPeople,
  });

  const createMutation = useMutation({
    mutationFn: createPerson,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['people'] }); setAdding(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Person> }) => updatePerson(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['people'] }); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePerson,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] }),
  });

  function describePerson(p: Person): string {
    const days = p.workDays.map((d) => DAYS[d]);
    if (p.daySchedules && Object.keys(p.daySchedules).length > 0) {
      // Show condensed per-day summary
      const parts = p.workDays.map((d) => {
        const ds = p.daySchedules![d];
        return ds ? `${DAYS[d]} ${ds.start}–${ds.end}` : null;
      }).filter(Boolean);
      return `${parts.join(', ')} · max ${Math.round(p.maxMinutesPerDay / 60)}h/day`;
    }
    return `${p.startHour}:00–${p.endHour}:00 · ${days.join(', ')} · max ${Math.round(p.maxMinutesPerDay / 60)}h/day`;
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded((s) => !s)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">👥</span>
          <span className="font-semibold text-slate-800 dark:text-white text-sm">
            Team members
          </span>
          {people.length > 0 && (
            <div className="flex -space-x-1">
              {people.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="w-5 h-5 rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: p.color }}
                >
                  {p.name[0].toUpperCase()}
                </div>
              ))}
            </div>
          )}
          {people.length === 0 && (
            <span className="text-xs text-slate-400 dark:text-gray-500">Add people to assign tasks</span>
          )}
        </div>
        <span className="text-slate-400 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 dark:border-gray-800 px-5 pb-5">
          {/* Person cards */}
          {people.length > 0 && (
            <div className="mt-4 space-y-3">
              {people.map((person) => (
                <div key={person.id}>
                  {editingId === person.id ? (
                    <div className="p-4 bg-slate-50 dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700">
                      <PersonForm
                        initial={person}
                        onSave={(data) => updateMutation.mutate({ id: person.id, data })}
                        onCancel={() => setEditingId(null)}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-gray-800 group">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                        style={{ backgroundColor: person.color }}
                      >
                        {person.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">{person.name}</p>
                        <p className="text-xs text-slate-400 dark:text-gray-500 truncate">
                          {describePerson(person)}
                        </p>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={() => setEditingId(person.id)}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(person.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add new person */}
          {adding ? (
            <div className="mt-4 p-4 bg-slate-50 dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700">
              <p className="text-sm font-semibold text-slate-800 dark:text-white mb-4">New team member</p>
              <PersonForm
                onSave={(data) => createMutation.mutate(data)}
                onCancel={() => setAdding(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="mt-4 w-full py-2.5 border-2 border-dashed border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl text-sm font-medium transition-colors"
            >
              + Add team member
            </button>
          )}

          {people.length > 0 && !adding && (
            <p className="text-xs text-slate-400 dark:text-gray-500 mt-3 text-center">
              Assign tasks to people in the Review step. Each person's tasks are scheduled around their own availability.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
