import { useEffect, useState } from 'react';
import {
  FileText,
  Ticket,
  Code2,
  BookOpen,
  ArrowUpRight,
  FileUp,
  Sparkles,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { listPrdJobs } from '@/lib/api/prd';
import { listUnitTestJobs } from '@/lib/api/tests';
import { listDocsJobs } from '@/lib/api/docs';
import { ApiError } from '@/lib/api/client';
import type { PageId } from '@/lib/nav';

/**
 * Phase 7 — Dashboard uses all three list APIs.
 */

interface Props {
  onNavigate: (id: PageId) => void;
}

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: 'brd' | 'tests' | 'docs';
};

const QUICK_ACTIONS: {
  label: string;
  desc: string;
  icon: typeof FileUp;
  page: PageId;
  tint: string;
}[] = [
  {
    label: 'Upload PRD',
    desc: 'Analyze a business requirement doc',
    icon: FileUp,
    page: 'brd',
    tint: 'from-blue-500 to-blue-600',
  },
  {
    label: 'Generate Jira Stories',
    desc: 'Turn requirements into tickets',
    icon: Ticket,
    page: 'brd',
    tint: 'from-emerald-500 to-emerald-600',
  },
  {
    label: 'Generate Unit Tests',
    desc: 'Cover your source code',
    icon: Code2,
    page: 'tests',
    tint: 'from-sky-500 to-cyan-600',
  },
  {
    label: 'Generate Documentation',
    desc: 'README, API docs & diagrams',
    icon: BookOpen,
    page: 'docs',
    tint: 'from-teal-500 to-emerald-600',
  },
];

const ACTIVITY_ICON = {
  brd: FileText,
  tests: Code2,
  docs: BookOpen,
} as const;

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function DashboardPage({ onNavigate }: Props) {
  const [prdTotal, setPrdTotal] = useState(0);
  const [prdCompleted, setPrdCompleted] = useState(0);
  const [prdStories, setPrdStories] = useState(0);
  const [prdEpics, setPrdEpics] = useState(0);
  const [testTotal, setTestTotal] = useState(0);
  const [testCompleted, setTestCompleted] = useState(0);
  const [docsTotal, setDocsTotal] = useState(0);
  const [docsCompleted, setDocsCompleted] = useState(0);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.allSettled([
          listPrdJobs(),
          listUnitTestJobs(),
          listDocsJobs(),
        ]);

        const items: ActivityItem[] = [];
        let softFail = 0;

        if (results[0].status === 'fulfilled') {
          const jobs = results[0].value.jobs;
          if (!cancelled) {
            setPrdTotal(jobs.length);
            setPrdCompleted(jobs.filter((j) => j.status === 'completed').length);
            setPrdStories(jobs.reduce((s, j) => s + (j.story_count || 0), 0));
            setPrdEpics(jobs.reduce((s, j) => s + (j.epic_count || 0), 0));
          }
          for (const j of jobs) {
            items.push({
              id: `prd-${j.job_id}`,
              title: j.project_name || j.original_filename,
              detail: `BRD · ${j.status} · ${j.epic_count} epics · ${j.story_count} stories`,
              time: j.updated_at,
              kind: 'brd',
            });
          }
        } else {
          softFail += 1;
        }

        if (results[1].status === 'fulfilled') {
          const jobs = results[1].value.jobs;
          if (!cancelled) {
            setTestTotal(jobs.length);
            setTestCompleted(jobs.filter((j) => j.status === 'completed').length);
          }
          for (const j of jobs) {
            items.push({
              id: `tests-${j.job_id}`,
              title: (j.original_filenames || []).join(', ') || 'Unit test job',
              detail: `Tests · ${j.status} · ${j.test_file_count} test file(s)`,
              time: j.updated_at,
              kind: 'tests',
            });
          }
        } else {
          softFail += 1;
        }

        if (results[2].status === 'fulfilled') {
          const jobs = results[2].value.jobs;
          if (!cancelled) {
            setDocsTotal(jobs.length);
            setDocsCompleted(jobs.filter((j) => j.status === 'completed').length);
          }
          for (const j of jobs) {
            items.push({
              id: `docs-${j.job_id}`,
              title: j.project_name || (j.original_filenames || []).join(', ') || 'Docs job',
              detail: `Docs · ${j.status} · ${j.file_count} file(s)`,
              time: j.updated_at,
              kind: 'docs',
            });
          }
        } else {
          softFail += 1;
        }

        items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        if (!cancelled) {
          setActivity(items.slice(0, 10));
          if (softFail === 3) {
            setError('Could not load job lists. Restart backend with Phase 7 routes.');
          } else if (softFail > 0) {
            setError('Some job lists failed to load (partial data shown).');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load dashboard data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = [
    {
      label: 'PRD jobs',
      value: String(prdTotal),
      detail: loading ? 'Loading…' : `${prdCompleted} completed · ${prdStories} stories · ${prdEpics} epics`,
      icon: FileText,
      soft: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Stories generated',
      value: String(prdStories),
      detail: `${prdEpics} epics from completed/analyzed PRD jobs`,
      icon: Ticket,
      soft: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Unit test jobs',
      value: String(testTotal),
      detail: loading ? 'Loading…' : `${testCompleted} completed`,
      icon: Code2,
      soft: 'bg-sky-50 text-sky-600',
    },
    {
      label: 'Documentation jobs',
      value: String(docsTotal),
      detail: loading ? 'Loading…' : `${docsCompleted} completed`,
      icon: BookOpen,
      soft: 'bg-teal-50 text-teal-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live counts from in-memory backend jobs (BRD, unit tests, documentation).
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="glass card-hover rounded-2xl p-5 animate-fade-in-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.soft}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-4 text-2xl font-bold text-slate-800">{s.value}</p>
              <p className="mt-0.5 text-sm text-slate-500">{s.label}</p>
              <p className="mt-1 text-xs text-slate-400">{s.detail}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="glass rounded-2xl p-5">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-800">Quick Actions</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {QUICK_ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.label}
                    onClick={() => onNavigate(a.page)}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${a.tint} text-white shadow-sm`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">{a.label}</p>
                      <p className="text-xs text-slate-500">{a.desc}</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-slate-500" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-800">Recent Activity</h2>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : activity.length === 0 ? (
            <p className="text-sm text-slate-400">
              No jobs yet. Run a feature, or the backend was restarted (in-memory store).
            </p>
          ) : (
            <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-1 before:bottom-1 before:w-px before:bg-slate-200">
              {activity.map((a) => {
                const Icon = ACTIVITY_ICON[a.kind];
                return (
                  <li key={a.id} className="relative flex gap-3">
                    <div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
                      <Icon className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm font-medium text-slate-800 truncate">{a.title}</p>
                      <p className="text-xs text-slate-500">{a.detail}</p>
                      <p className="text-[11px] text-slate-400">{formatTime(a.time)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <button
            onClick={() => onNavigate('history')}
            className="mt-4 text-xs font-medium text-blue-600 hover:underline"
          >
            Open full history
          </button>
        </div>
      </div>
    </div>
  );
}
