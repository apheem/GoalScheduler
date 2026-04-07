import { useLocation, useNavigate } from 'react-router-dom';

const STEPS = [
  { path: '/', label: 'Plan', description: 'Dump your goals', icon: '✏️' },
  { path: '/review', label: 'Review', description: 'Confirm tasks', icon: '✅' },
  { path: '/schedule', label: 'Schedule', description: 'See your calendar', icon: '📅' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentIndex = STEPS.findIndex((s) => s.path === location.pathname);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 flex flex-col">
      {/* Top bar */}
      <header className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Logo */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 flex-shrink-0"
          >
            <span className="text-xl">🗓️</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm hidden sm:block">
              GoalScheduler
            </span>
          </button>

          {/* Step indicator */}
          <div className="flex items-center gap-1 sm:gap-2 flex-1 justify-center">
            {STEPS.map((step, i) => {
              const isDone = i < currentIndex;
              const isActive = i === currentIndex;
              const isLocked = i > currentIndex;

              return (
                <div key={step.path} className="flex items-center">
                  <button
                    onClick={() => isDone && navigate(step.path)}
                    disabled={isLocked}
                    className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : isDone
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 cursor-pointer hover:bg-green-200 dark:hover:bg-green-900/50'
                        : 'text-slate-400 dark:text-gray-600'
                    }`}
                  >
                    <span>{isDone ? '✓' : step.icon}</span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`w-6 sm:w-8 h-0.5 mx-0.5 sm:mx-1 rounded-full ${
                        i < currentIndex
                          ? 'bg-green-400 dark:bg-green-600'
                          : 'bg-slate-200 dark:bg-gray-700'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Settings link — always visible */}
          <div className="flex-shrink-0 flex justify-end">
            <button
              onClick={() => navigate('/setup')}
              className={`text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
                location.pathname === '/setup'
                  ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300'
              }`}
            >
              <span>⚙️</span>
              <span className="hidden sm:inline"> Setup</span>
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-400 dark:text-gray-600 py-4 border-t border-slate-100 dark:border-gray-800">
        GoalScheduler · Powered by Claude AI
      </footer>
    </div>
  );
}
