import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  CheckCircle2,
  Loader2,
  XCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { listPrdJobs } from '@/lib/api/prd';
import { listUnitTestJobs } from '@/lib/api/tests';
import { listDocsJobs } from '@/lib/api/docs';
import { ApiError } from '@/lib/api/client';

/**
 * Phase 7 — Unified History
 *
 * Loads three list endpoints in parallel:
 *   GET /prd/jobs
 *   GET /jobs
 *   GET /documentation/jobs
 *
 * Merges into one table sorted by date (newest first).
 * Jobs are still in-memory on the server (cleared on restart).
 */

type FeatureKind = 'BRD Upload' | 'Unit Test Generator' | 'Documentation Generator';
type UiStatus = 'Completed' | 'Processing' | 'Failed' | 'Uploaded';

interface HistoryRow {
  id: string;
  date: string;
  project: string;
  feature: FeatureKind;
  fileLabel: string;
  status: UiStatus;
  details: string;
  rawStatus: string;
}

function mapStatus(s: string): UiStatus {
  if (s === 'completed') return 'Completed';
  if (s === 'failed') return 'Failed';
  if (s === 'uploaded') return 'Uploaded';
  return 'Processing'; // extracting | analyzing | generating
}

const STATUS_STYLE: Record<UiStatus, { cls: string; icon: typeof CheckCircle2 }> = {
  Completed: { cls: 'bg-emerald-50 text-emerald-600 ring-emerald-200', icon: CheckCircle2 },
  Processing: { cls: 'bg-blue-50 text-blue-600 ring-blue-200', icon: Loader2 },
  Failed: { cls: 'bg-red-50 text-red-600 ring-red-200', icon: XCircle },
  Uploaded: { cls: 'bg-slate-50 text-slate-600 ring-slate-200', icon: CheckCircle2 },
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function HistoryPage() {
  const [q, setQ] = useState('');
  const [featureFilter, setFeatureFilter] = useState<'all' | FeatureKind>('all');
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    setPartialErrors([]);

    const results = await Promise.allSettled([
      listPrdJobs(),
      listUnitTestJobs(),
      listDocsJobs(),
    ]);

    const next: HistoryRow[] = [];
    const softErrors: string[] = [];

    const prd = results[0];
    if (prd.status === 'fulfilled') {
      for (const j of prd.value.jobs) {
        next.push({
          id: `prd-${j.job_id}`,
          date: j.created_at,
          project: j.project_name || '—',
          feature: 'BRD Upload',
          fileLabel: j.original_filename,
          status: mapStatus(j.status),
          details: `${j.epic_count} epics · ${j.story_count} stories · ${j.job_id}`,
          rawStatus: j.status,
        });
      }
    } else {
      softErrors.push(
        `PRD list: ${prd.reason instanceof ApiError ? prd.reason.message : 'failed'}`,
      );
    }

    const tests = results[1];
    if (tests.status === 'fulfilled') {
      for (const j of tests.value.jobs) {
        next.push({
          id: `tests-${j.job_id}`,
          date: j.created_at,
          project: '—',
          feature: 'Unit Test Generator',
          fileLabel: (j.original_filenames || []).join(', ') || `${j.file_count} file(s)`,
          status: mapStatus(j.status),
          details: `${j.test_file_count} test file(s) · ${j.job_id}`,
          rawStatus: j.status,
        });
      }
    } else {
      softErrors.push(
        `Unit tests list: ${
          tests.reason instanceof ApiError ? tests.reason.message : 'failed'
        }`,
      );
    }

    const docs = results[2];
    if (docs.status === 'fulfilled') {
      for (const j of docs.value.jobs) {
        next.push({
          id: `docs-${j.job_id}`,
          date: j.created_at,
          project: j.project_name || '—',
          feature: 'Documentation Generator',
          fileLabel: (j.original_filenames || []).join(', ') || `${j.file_count} file(s)`,
          status: mapStatus(j.status),
          details: `${j.file_count} source file(s) · ${j.job_id}`,
          rawStatus: j.status,
        });
      }
    } else {
      softErrors.push(
        `Docs list: ${docs.reason instanceof ApiError ? docs.reason.message : 'failed'}`,
      );
    }

    next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setRows(next);
    setPartialErrors(softErrors);

    if (softErrors.length === 3) {
      setError('All history list endpoints failed. Is the backend running and up to date?');
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return rows.filter((r) => {
      if (featureFilter !== 'all' && r.feature !== featureFilter) return false;
      if (!needle) return true;
      return (
        r.project.toLowerCase().includes(needle) ||
        r.feature.toLowerCase().includes(needle) ||
        r.fileLabel.toLowerCase().includes(needle) ||
        r.details.toLowerCase().includes(needle) ||
        r.status.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, featureFilter]);

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-slate-800">History</h1>
        <p className="mt-1 text-sm text-slate-500">
          Unified view of BRD, unit-test, and documentation jobs from the backend.
          Data is in-memory and clears when the server restarts.
        </p>
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by project, feature, file, or job id…"
              className="w-full rounded-xl border border-slate-200 bg-white/70 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <select
            value={featureFilter}
            onChange={(e) => setFeatureFilter(e.target.value as 'all' | FeatureKind)}
            className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700 outline-none"
          >
            <option value="all">All features</option>
            <option value="BRD Upload">BRD Upload</option>
            <option value="Unit Test Generator">Unit Test Generator</option>
            <option value="Documentation Generator">Documentation Generator</option>
          </select>
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {!error && partialErrors.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Partial load: {partialErrors.join(' · ')}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 font-semibold">Date</th>
                <th className="px-3 py-2.5 font-semibold">Project</th>
                <th className="px-3 py-2.5 font-semibold">Feature</th>
                <th className="px-3 py-2.5 font-semibold">File</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Loading jobs…
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((r) => {
                  const S = STATUS_STYLE[r.status];
                  const Icon = S.icon;
                  return (
                    <tr key={r.id} className="transition hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                        {formatDate(r.date)}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-700">{r.project}</td>
                      <td className="px-3 py-3 text-slate-600">{r.feature}</td>
                      <td className="max-w-[220px] truncate px-3 py-3 text-slate-600" title={r.fileLabel}>
                        {r.fileLabel}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${S.cls}`}
                        >
                          <Icon
                            className={`h-3.5 w-3.5 ${
                              r.status === 'Processing' ? 'animate-spin' : ''
                            }`}
                          />
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-slate-500">
                        <span className="font-mono break-all">{r.details}</span>
                      </td>
                    </tr>
                  );
                })}
              {!loading && filtered.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">
                    No jobs in memory. Run BRD / unit tests / docs, or the server was restarted.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
