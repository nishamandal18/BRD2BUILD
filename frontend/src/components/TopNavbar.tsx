import { useState, useEffect } from 'react';
import { Search, Bell, ChevronDown, FolderKanban, Activity } from 'lucide-react';
import { getHealth } from '@/lib/api/health';
import { ApiError } from '@/lib/api/client';
import type { HealthResponse } from '@/lib/types/api';

const PROJECTS = ['Atlas Payments', 'Nimbus CRM', 'Orbit Logistics'];

type BackendStatus = 'checking' | 'online' | 'offline';

interface Props {
  onSearch: (q: string) => void;
}

export default function TopNavbar({ onSearch }: Props) {
  const [project, setProject] = useState(PROJECTS[0]);
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    const close = () => {
      setOpen(false);
      setNotifOpen(false);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  /**
   * Phase 0 smoke test:
   * On mount, call GET /health through our API client.
   * AbortController cancels the request if the component unmounts (React StrictMode safe).
   */
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      setBackendStatus('checking');
      setHealthError(null);
      try {
        const data = await getHealth(controller.signal);
        if (controller.signal.aborted) return;
        setHealth(data);
        setBackendStatus(data.status === 'ok' ? 'online' : 'offline');
      } catch (err) {
        if (controller.signal.aborted) return;
        // Ignore abort errors from StrictMode remount / unmount
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setHealth(null);
        setBackendStatus('offline');
        setHealthError(err instanceof ApiError ? err.message : 'Backend unreachable');
      }
    })();

    return () => controller.abort();
  }, []);

  return (
    <header className="sticky top-0 z-30 glass-strong border-b border-slate-200/70">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        {/* Search */}
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search projects, tickets, docs…"
            onChange={(e) => onSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white/70 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {/* Backend connection badge (Phase 0) */}
          <div
            className={`hidden items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium sm:flex ${
              backendStatus === 'online'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : backendStatus === 'checking'
                  ? 'border-slate-200 bg-slate-50 text-slate-500'
                  : 'border-red-200 bg-red-50 text-red-600'
            }`}
            title={
              backendStatus === 'online' && health
                ? `${health.app} v${health.version} · ${health.environment}`
                : healthError || 'Checking backend…'
            }
          >
            <Activity
              className={`h-3.5 w-3.5 ${
                backendStatus === 'checking' ? 'animate-pulse' : ''
              }`}
            />
            <span>
              {backendStatus === 'online' && 'API online'}
              {backendStatus === 'checking' && 'API checking…'}
              {backendStatus === 'offline' && 'API offline'}
            </span>
          </div>

          {/* Project selector */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
            >
              <FolderKanban className="h-4 w-4 text-blue-600" />
              <span className="hidden sm:inline">{project}</span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl glass-strong p-1 shadow-lg animate-fade-in-up">
                {PROJECTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setProject(p);
                      setOpen(false);
                    }}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      p === project ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative rounded-xl border border-slate-200 bg-white/70 p-2 text-slate-600 transition hover:border-slate-300 hover:bg-white"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500 pulse-ring" />
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl glass-strong p-2 shadow-lg animate-fade-in-up">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Notifications
                </p>
                {[
                  'BRD analysis complete for Atlas Payments',
                  '14 Jira tickets synced to Orbit Logistics',
                  'New model available: Claude 3.5 Sonnet',
                ].map((n) => (
                  <div
                    key={n}
                    className="rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                  >
                    {n}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Profile */}
          <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 py-1.5 pl-1.5 pr-3 transition hover:border-slate-300 hover:bg-white">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-emerald-500 text-xs font-bold text-white">
              N
            </div>
            <span className="hidden text-sm font-medium text-slate-700 sm:inline">Nisha</span>
          </button>
        </div>
      </div>
    </header>
  );
}
