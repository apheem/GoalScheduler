import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/Layout';
import type { Person } from '../../../shared/types';

interface AuthStatus { configured: boolean; connected: boolean; }

async function getAuthStatus(): Promise<AuthStatus> {
  const res = await fetch('/api/auth/status');
  return res.json();
}

async function getConnections(): Promise<string[]> {
  const res = await fetch('/api/auth/connections');
  return res.json();
}

const SETUP_STEPS = [
  {
    number: '1',
    title: 'Go to Google Cloud Console',
    detail: 'Open console.cloud.google.com in your browser. Sign in with your Google account.',
  },
  {
    number: '2',
    title: 'Create a new project',
    detail: 'Click the project dropdown at the top → "New Project" → give it any name (e.g. "GoalScheduler") → Create.',
  },
  {
    number: '3',
    title: 'Enable the Calendar API',
    detail: 'In the left menu go to "APIs & Services" → "Library" → search "Google Calendar API" → click it → Enable.',
  },
  {
    number: '4',
    title: 'Create OAuth credentials',
    detail: 'Go to "APIs & Services" → "Credentials" → "+ Create Credentials" → "OAuth client ID" → Application type: "Web application".',
  },
  {
    number: '5',
    title: 'Add the redirect URI',
    detail: 'Under "Authorized redirect URIs" click "+ Add URI" and paste exactly:',
    code: 'http://localhost:3001/api/auth/google/callback',
  },
  {
    number: '6',
    title: 'Copy your credentials',
    detail: 'After saving, copy the Client ID and Client Secret. Open the file below in Notepad and paste them in:',
    code: 'server\\.env',
    extraDetail: 'Set GOOGLE_CLIENT_ID=... and GOOGLE_CLIENT_SECRET=... then save the file.',
  },
  {
    number: '7',
    title: 'Restart the app',
    detail: 'Close the terminal running the app, then double-click "Start GoalScheduler.bat" again.',
  },
];

export default function SetupPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const connected = searchParams.get('connected') === 'true';
  const connectedPersonId = searchParams.get('personId');
  const error = searchParams.get('error');

  const { data: status, isLoading } = useQuery<AuthStatus>({
    queryKey: ['auth-status'],
    queryFn: getAuthStatus,
  });

  const { data: connections = [], refetch: refetchConnections } = useQuery<string[]>({
    queryKey: ['auth-connections'],
    queryFn: getConnections,
  });

  const { data: people = [] } = useQuery<Person[]>({
    queryKey: ['people'],
    queryFn: () => fetch('/api/people').then((r) => r.json()),
  });

  const mainConnected = connections.includes('__main__');

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings & Setup</h1>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
            Connect Google Calendar so tasks can be scheduled automatically.
          </p>
        </div>

        {/* Success banner */}
        {connected && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-2xl flex items-center gap-3">
            <span className="text-xl">🎉</span>
            <div>
              {connectedPersonId ? (
                <>
                  <p className="font-semibold text-green-800 dark:text-green-300">
                    {people.find((p) => p.id === connectedPersonId)?.name ?? 'Team member'}'s calendar connected!
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-400">Their assigned tasks will be scheduled directly to their calendar.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-green-800 dark:text-green-300">Google Calendar connected!</p>
                  <p className="text-sm text-green-700 dark:text-green-400">Tasks will now be scheduled directly to your calendar.</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-2xl">
            <p className="font-semibold text-red-700 dark:text-red-400">⚠️ Connection failed</p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              {error === 'missing_credentials'
                ? 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing from server/.env. Follow the steps below.'
                : error === 'oauth_failed'
                ? 'Google rejected the connection. Make sure the redirect URI is set correctly (step 5 below).'
                : 'Something went wrong. Check that the app is running and try again.'}
            </p>
          </div>
        )}

        {/* Calendar connections */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-gray-800">
            <h2 className="font-bold text-slate-900 dark:text-white">Google Calendar connections</h2>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
              Connect your calendar and each team member's calendar independently.
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-gray-800">
            {/* Main calendar row */}
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-gray-800 flex items-center justify-center text-slate-500 dark:text-gray-400 text-lg">
                  📅
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">Main calendar</p>
                  <p className="text-xs text-slate-400 dark:text-gray-500">
                    {isLoading ? 'Checking…' : mainConnected ? 'Connected — used for tasks with no assignee' : status?.configured ? 'Ready to connect' : 'Not configured'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${mainConnected ? 'bg-green-500' : 'bg-slate-300 dark:bg-gray-600'}`} />
                {status?.configured && !mainConnected && (
                  <a
                    href="/api/auth/google"
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Connect →
                  </a>
                )}
                {mainConnected && (
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Connected</span>
                )}
              </div>
            </div>

            {/* Team member rows */}
            {people.map((person) => {
              const personConnected = connections.includes(person.id);
              return (
                <div key={person.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: person.color }}
                    >
                      {person.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">{person.name}</p>
                      <p className="text-xs text-slate-400 dark:text-gray-500">
                        {personConnected ? 'Connected — tasks go to their calendar' : 'Not connected'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${personConnected ? 'bg-green-500' : 'bg-slate-300 dark:bg-gray-600'}`} />
                    {status?.configured && !personConnected && (
                      <a
                        href={`/api/auth/google?personId=${encodeURIComponent(person.id)}`}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        Connect →
                      </a>
                    )}
                    {personConnected && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Connected</span>
                    )}
                  </div>
                </div>
              );
            })}

            {people.length === 0 && (
              <div className="px-5 py-4 text-xs text-slate-400 dark:text-gray-500 italic">
                Add team members on the main page to connect their calendars here.
              </div>
            )}
          </div>

          {!status?.configured && !isLoading && (
            <div className="px-5 py-4 border-t border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-800/50">
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Calendar credentials are not configured. Follow the steps below, then restart the app.
              </p>
            </div>
          )}
        </div>

        {/* Setup guide */}
        {!status?.configured && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-gray-800">
              <h2 className="font-bold text-slate-900 dark:text-white">How to connect Google Calendar</h2>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">One-time setup — takes about 5 minutes.</p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-gray-800">
              {SETUP_STEPS.map((step) => (
                <div key={step.number} className="px-5 py-4 flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {step.number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{step.title}</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 leading-relaxed">{step.detail}</p>
                    {step.code && (
                      <code className="mt-2 inline-block text-xs bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 px-2.5 py-1.5 rounded-lg text-indigo-700 dark:text-indigo-300 font-mono break-all">
                        {step.code}
                      </code>
                    )}
                    {step.extraDetail && (
                      <p className="text-xs text-slate-500 dark:text-gray-400 mt-2">{step.extraDetail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            ← Back to app
          </button>
        </div>
      </div>
    </Layout>
  );
}
