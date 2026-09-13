import { useState, useRef, useCallback, useMemo } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  Loader2,
  Wand2,
  Copy,
  Download,
  Send,
  X,
  FileType2,
  AlertCircle,
} from 'lucide-react';
import { uploadPrd, analyzePrd, downloadPrdBacklog } from '@/lib/api/prd';
import { ApiError } from '@/lib/api/client';
import type { JiraBacklog, JiraEpic, JiraStory, PrdPriority } from '@/lib/types/prd';

type Tab = 'epics' | 'stories' | 'tickets' | 'criteria';
type UiStatus = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';

const ACCEPTED = ['.pdf', '.docx', '.txt', '.md'];

/** Backend priorities — not P0/P1 mock values */
const PRIORITY_STYLES: Record<PrdPriority, string> = {
  Critical: 'bg-red-50 text-red-600 ring-red-200',
  High: 'bg-orange-50 text-orange-600 ring-orange-200',
  Medium: 'bg-amber-50 text-amber-600 ring-amber-200',
  Low: 'bg-slate-50 text-slate-600 ring-slate-200',
};

/** Flatten stories with parent epic title for list tabs (display only, no invented fields). */
interface FlatStory {
  epicTitle: string;
  story: JiraStory;
  index: number;
}

function flattenStories(backlog: JiraBacklog | null): FlatStory[] {
  if (!backlog) return [];
  const rows: FlatStory[] = [];
  let i = 0;
  for (const epic of backlog.epics) {
    for (const story of epic.stories) {
      rows.push({ epicTitle: epic.title, story, index: i++ });
    }
  }
  return rows;
}

export default function BrdUploadPage() {
  const [dragging, setDragging] = useState(false);
  /** Keep the real browser File so we can upload bytes to FastAPI */
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UiStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [tab, setTab] = useState<Tab>('epics');
  const [copied, setCopied] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [backlog, setBacklog] = useState<JiraBacklog | null>(null);
  const [projectName, setProjectName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const flatStories = useMemo(() => flattenStories(backlog), [backlog]);

  const handleFile = useCallback((f: File) => {
    setSelectedFile(f);
    setStatus('idle');
    setProgress(0);
    setJobId(null);
    setBacklog(null);
    setErrorMessage(null);
    setStatusMessage(null);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  /**
   * Full integration handler:
   * 1) POST /prd/upload with FormData field "file"
   * 2) POST /prd/analyze with { job_id, project_name_hint? }
   * 3) Store backlog in React state for UI
   */
  const analyze = async () => {
    if (!selectedFile || status === 'uploading' || status === 'analyzing') return;

    setErrorMessage(null);
    setStatusMessage(null);
    setBacklog(null);
    setJobId(null);

    try {
      // --- Step 1: upload ---
      setStatus('uploading');
      setProgress(20);
      setStatusMessage('Uploading document to backend…');

      const uploadRes = await uploadPrd(selectedFile);
      setJobId(uploadRes.job_id);
      setProgress(45);
      setStatusMessage(`Uploaded. Job: ${uploadRes.job_id}. Analyzing with AI…`);

      // --- Step 2: analyze (Vertex AI on server) ---
      setStatus('analyzing');
      setProgress(60);

      const analyzeRes = await analyzePrd({
        job_id: uploadRes.job_id,
        project_name_hint: projectName.trim() || undefined,
      });

      setProgress(100);
      setBacklog(analyzeRes.backlog);
      setStatus('done');
      setStatusMessage(
        analyzeRes.message ||
          `Generated ${analyzeRes.epic_count} epics and ${analyzeRes.story_count} stories.`,
      );
      setTab('epics');
    } catch (err) {
      setProgress(0);
      setStatus('error');
      if (err instanceof ApiError) {
        // Surface backend codes like llm_error / validation_error clearly
        setErrorMessage(
          err.code === 'llm_error'
            ? `${err.message} — Vertex AI auth may need: gcloud auth application-default login`
            : err.message,
        );
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Something went wrong while analyzing the BRD.');
      }
    }
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard may be blocked; ignore quietly
    }
  };

  const handleDownloadJson = async () => {
    if (!jobId) return;
    try {
      const blob = await downloadPrdBacklog(jobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jira_backlog_${jobId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : 'Failed to download backlog JSON',
      );
    }
  };

  /** Client-side CSV from real backlog only (no invented columns). */
  const handleDownloadCsv = () => {
    if (!backlog) return;
    const header = [
      'project_name',
      'epic_title',
      'story_title',
      'description',
      'story_points',
      'priority',
      'labels',
      'components',
      'dependencies',
      'acceptance_criteria',
    ];
    const rows: string[][] = [];
    for (const epic of backlog.epics) {
      for (const s of epic.stories) {
        rows.push([
          backlog.project_name,
          epic.title,
          s.title,
          s.description,
          String(s.story_points),
          s.priority,
          s.labels.join('|'),
          s.components.join('|'),
          s.dependencies.join('|'),
          s.acceptance_criteria.join(' || '),
        ]);
      }
    }
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jira_backlog_${jobId || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'epics', label: 'Epics', count: backlog?.epics.length ?? 0 },
    { id: 'stories', label: 'User Stories', count: flatStories.length },
    // Backend has no separate "tickets" model — stories are the work items
    { id: 'tickets', label: 'Work Items', count: flatStories.length },
    {
      id: 'criteria',
      label: 'Acceptance Criteria',
      count: flatStories.filter((s) => s.story.acceptance_criteria.length > 0).length,
    },
  ];

  const busy = status === 'uploading' || status === 'analyzing';
  const fileExt = selectedFile
    ? selectedFile.name.split('.').pop()?.toLowerCase() || 'file'
    : '';

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-slate-800">BRD Upload</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a Business Requirements Document. The backend extracts text and uses Vertex AI
          (Gemini) to generate epics, stories, and acceptance criteria.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Upload + status */}
        <div className="space-y-4 lg:col-span-1">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`glass card-hover cursor-pointer rounded-2xl p-8 text-center transition ${
              dragging ? 'border-blue-400 bg-blue-50/60' : ''
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(',')}
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-500 text-white shadow-lg shadow-blue-500/20">
              <UploadCloud className="h-7 w-7" />
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-800">
              Drag & drop your BRD here
            </p>
            <p className="mt-1 text-xs text-slate-500">or click to browse</p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {['PDF', 'DOCX', 'TXT', 'Markdown'].map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Optional project name hint sent to POST /prd/analyze */}
          <div className="glass rounded-2xl p-4">
            <label className="text-xs font-medium text-slate-600">
              Project name hint (optional)
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. TaskFlow Lite"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Sent as project_name_hint to the analyze API. Does not invent backlog fields.
            </p>
          </div>

          {selectedFile && (
            <div className="glass rounded-2xl p-4 animate-fade-in-up">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <FileType2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(selectedFile.size / 1024).toFixed(1)} KB · {fileExt.toUpperCase()}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setStatus('idle');
                    setProgress(0);
                    setJobId(null);
                    setBacklog(null);
                    setErrorMessage(null);
                    setStatusMessage(null);
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  disabled={busy}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">AI Analysis</span>
                  <span className="flex items-center gap-1 text-slate-500">
                    {status === 'idle' && 'Ready'}
                    {status === 'uploading' && (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                      </>
                    )}
                    {status === 'analyzing' && (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Analyzing…
                      </>
                    )}
                    {status === 'done' && (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Complete
                      </>
                    )}
                    {status === 'error' && (
                      <>
                        <AlertCircle className="h-3.5 w-3.5 text-red-500" /> Failed
                      </>
                    )}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      status === 'error'
                        ? 'bg-red-400'
                        : 'bg-gradient-to-r from-blue-500 to-emerald-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {statusMessage && (
                  <p className="mt-2 text-[11px] text-slate-500 break-all">{statusMessage}</p>
                )}
                {jobId && (
                  <p className="mt-1 text-[11px] font-mono text-slate-400 break-all">
                    job_id: {jobId}
                  </p>
                )}
              </div>

              {errorMessage && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {errorMessage}
                </div>
              )}

              <button
                onClick={analyze}
                disabled={busy}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:shadow-lg disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {status === 'done' ? 'Regenerate' : busy ? 'Working…' : 'Generate'}
              </button>
            </div>
          )}
        </div>

        {/* Output */}
        <div className="lg:col-span-2">
          <div className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-3">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    tab === t.id
                      ? 'bg-gradient-to-r from-blue-50 to-emerald-50 text-blue-700'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                >
                  {t.label}
                  <span className="rounded-md bg-white px-1.5 text-[11px] text-slate-400 ring-1 ring-slate-200">
                    {t.count}
                  </span>
                </button>
              ))}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={handleDownloadCsv}
                  disabled={!backlog}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
                <button
                  onClick={handleDownloadJson}
                  disabled={!jobId || status !== 'done'}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white disabled:opacity-40"
                  title="GET /prd/download?job_id=..."
                >
                  <Download className="h-3.5 w-3.5" /> JSON
                </button>
                <button
                  disabled
                  title="Jira export is not implemented in the backend yet"
                  className="flex items-center gap-1.5 rounded-lg bg-slate-300 px-3 py-1.5 text-xs font-semibold text-white cursor-not-allowed"
                >
                  <Send className="h-3.5 w-3.5" /> Export to Jira
                </button>
              </div>
            </div>

            {backlog?.project_name && (
              <p className="mt-3 text-sm text-slate-600">
                Project:{' '}
                <span className="font-semibold text-slate-800">{backlog.project_name}</span>
              </p>
            )}

            <div className="mt-4 space-y-3">
              {!backlog && status !== 'error' && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-12 text-center text-sm text-slate-400">
                  {busy
                    ? 'Waiting for backend analysis… This can take up to a few minutes when Vertex AI is cold.'
                    : 'Upload a BRD and click Generate to load real epics and stories from the API.'}
                </div>
              )}

              {tab === 'epics' &&
                backlog?.epics.map((e: JiraEpic, idx) => (
                  <div
                    key={`${e.title}-${idx}`}
                    className="rounded-xl border border-slate-200 bg-white/60 p-4 card-hover"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">
                        Epic
                      </span>
                      <p className="text-sm font-semibold text-slate-800">{e.title}</p>
                      <span className="ml-auto text-xs text-slate-400">
                        {e.stories.length} stories
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{e.description}</p>
                  </div>
                ))}

              {tab === 'stories' &&
                flatStories.map(({ epicTitle, story, index }) => (
                  <StoryCard
                    key={`story-${index}`}
                    story={story}
                    epicTitle={epicTitle}
                    copied={copied}
                    copyKey={`story-${index}`}
                    onCopy={copyText}
                  />
                ))}

              {tab === 'tickets' &&
                flatStories.map(({ epicTitle, story, index }) => (
                  <StoryCard
                    key={`ticket-${index}`}
                    story={story}
                    epicTitle={epicTitle}
                    copied={copied}
                    copyKey={`ticket-${index}`}
                    onCopy={copyText}
                    showAsWorkItem
                  />
                ))}

              {tab === 'criteria' &&
                flatStories.map(({ story, index, epicTitle }) => (
                  <div
                    key={`ac-${index}`}
                    className="rounded-xl border border-slate-200 bg-white/60 p-4 card-hover"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      <p className="text-sm font-semibold text-slate-800">{story.title}</p>
                      <span className="ml-auto rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {epicTitle}
                      </span>
                    </div>
                    {story.acceptance_criteria.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-400">No acceptance criteria returned.</p>
                    ) : (
                      <ul className="mt-3 space-y-1.5">
                        {story.acceptance_criteria.map((c, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                            <span className="whitespace-pre-wrap">{c}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoryCard({
  story,
  epicTitle,
  copied,
  copyKey,
  onCopy,
  showAsWorkItem = false,
}: {
  story: JiraStory;
  epicTitle: string;
  copied: string | null;
  copyKey: string;
  onCopy: (key: string, text: string) => void;
  showAsWorkItem?: boolean;
}) {
  const copyPayload = [
    `Title: ${story.title}`,
    `Epic: ${epicTitle}`,
    `Priority: ${story.priority}`,
    `Story points: ${story.story_points}`,
    `Description: ${story.description}`,
    story.labels.length ? `Labels: ${story.labels.join(', ')}` : '',
    story.components.length ? `Components: ${story.components.join(', ')}` : '',
    story.dependencies.length ? `Dependencies: ${story.dependencies.join(', ')}` : '',
    story.acceptance_criteria.length
      ? `Acceptance criteria:\n- ${story.acceptance_criteria.join('\n- ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="rounded-xl border border-slate-200 bg-white/60 p-4 card-hover">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
          {showAsWorkItem ? 'Story' : 'User Story'}
        </span>
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${
            PRIORITY_STYLES[story.priority] || PRIORITY_STYLES.Medium
          }`}
        >
          {story.priority}
        </span>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          {story.story_points} pts
        </span>
        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
          Epic: {epicTitle}
        </span>
        <button
          onClick={() => onCopy(copyKey, copyPayload)}
          className="ml-auto rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          {copied === copyKey ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-800">{story.title}</p>
      <p className="mt-1 text-sm text-slate-500 whitespace-pre-wrap">{story.description}</p>

      {(story.labels.length > 0 || story.components.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {story.labels.map((l) => (
            <span
              key={`l-${l}`}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
            >
              {l}
            </span>
          ))}
          {story.components.map((c) => (
            <span
              key={`c-${c}`}
              className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-600"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {story.dependencies.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Dependencies: {story.dependencies.join(', ')}
        </p>
      )}

      {showAsWorkItem && story.acceptance_criteria.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Acceptance Criteria
          </p>
          <ul className="mt-2 space-y-1">
            {story.acceptance_criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className="whitespace-pre-wrap">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
