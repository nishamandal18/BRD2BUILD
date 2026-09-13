import { useRef, useState } from 'react';
import {
  FileText,
  GitBranch,
  Wand2,
  Loader2,
  Copy,
  Download,
  FileDown,
  CheckCircle2,
  Network,
  Workflow,
  AlertCircle,
  X,
  Upload,
} from 'lucide-react';
import {
  uploadRepository,
  generateDocumentation,
  downloadDocumentation,
} from '@/lib/api/docs';
import { ApiError } from '@/lib/api/client';
import type { DocumentationBundle } from '@/lib/types/docs';

/**
 * Phase 3 flow:
 * upload .py/.zip → POST /upload-repository
 * → POST /generate-documentation
 * → render DocumentationBundle markdown fields
 */

type Tab =
  | 'readme'
  | 'api'
  | 'architecture'
  | 'class'
  | 'sequence'
  | 'functions'
  | 'release';

const TABS: { id: Tab; label: string; field: keyof DocumentationBundle }[] = [
  { id: 'readme', label: 'README', field: 'readme_md' },
  { id: 'api', label: 'API Docs', field: 'api_documentation_md' },
  { id: 'architecture', label: 'Architecture', field: 'architecture_summary_md' },
  { id: 'class', label: 'Class Diagram', field: 'class_documentation_md' },
  { id: 'sequence', label: 'Sequence Diagram', field: 'sequence_flow_md' },
  { id: 'functions', label: 'Function Documentation', field: 'function_documentation_md' },
  { id: 'release', label: 'Release Notes', field: 'release_notes_md' },
];

export default function DocsPage() {
  const [tab, setTab] = useState<Tab>('readme');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentationBundle | null>(null);
  const [projectName, setProjectName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const activeField = TABS.find((t) => t.id === tab)?.field ?? 'readme_md';
  const content =
    docs && typeof docs[activeField] === 'string'
      ? (docs[activeField] as string)
      : '';

  const generate = async () => {
    if (!files.length) {
      setErrorMessage('Upload one or more .py files or a .zip repository first.');
      return;
    }

    setGenerating(true);
    setDocs(null);
    setJobId(null);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      setStatusMessage('Uploading repository…');
      const uploadRes = await uploadRepository(files);
      setJobId(uploadRes.job_id);
      setStatusMessage(
        `Uploaded ${uploadRes.file_count} file(s). Generating documentation with Vertex AI…`,
      );

      const genRes = await generateDocumentation({
        job_id: uploadRes.job_id,
        project_name: projectName.trim() || undefined,
        include_html: true,
        background: false,
      });

      if (!genRes.documentation) {
        throw new Error(
          genRes.message ||
            'Documentation generation returned no content. If background mode was used, poll job status.',
        );
      }

      setDocs(genRes.documentation);
      setStatusMessage(genRes.message || 'Documentation generated');
      if (genRes.documentation.project_name) {
        setProjectName(genRes.documentation.project_name);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(
          err.code === 'llm_error'
            ? `${err.message} — Vertex AI auth may need: gcloud auth application-default login`
            : err.message,
        );
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to generate documentation.');
      }
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard?.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const handleDownloadZip = async () => {
    if (!jobId) return;
    try {
      const blob = await downloadDocumentation(jobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documentation_${jobId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : 'Download failed');
    }
  };

  const downloadCurrentMarkdown = () => {
    if (!content) return;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tab}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-slate-800">Documentation Generator</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload Python source or a repository ZIP. Backend uses AST + Vertex AI to generate
          README, API docs, architecture, and more.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".py,.zip"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            setFiles(Array.from(e.target.files));
            setErrorMessage(null);
          }
        }}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="glass card-hover rounded-2xl p-5 text-left"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <FileText className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-800">Upload Source Code</p>
          <p className="mt-1 text-xs text-slate-500">
            {files.length
              ? `${files.length} selected: ${files.map((f) => f.name).join(', ')}`
              : 'Select .py files or a .zip repository'}
          </p>
        </button>
        <div className="glass rounded-2xl p-5 opacity-80">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <GitBranch className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-800">Connect Git Repository</p>
          <p className="mt-1 text-xs text-slate-500">
            Not implemented in backend. Upload a git-export ZIP instead; metadata is read if
            present.
          </p>
        </div>
      </div>

      <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div className="min-w-[200px] flex-1">
          <label className="text-xs font-medium text-slate-600">Project name (optional)</label>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="e.g. Sample App"
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-600"
        >
          <Upload className="h-4 w-4" /> Choose files
        </button>
        {files.length > 0 && (
          <button
            type="button"
            onClick={() => setFiles([])}
            className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:shadow-lg disabled:opacity-60"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {generating ? 'Generating Documentation…' : 'Generate Documentation'}
        </button>
      </div>

      {statusMessage && <p className="text-xs text-slate-500 break-all">{statusMessage}</p>}
      {jobId && (
        <p className="text-[11px] font-mono text-slate-400 break-all">job_id: {jobId}</p>
      )}
      {errorMessage && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-3">
          {TABS.map((t) => (
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
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={copy}
            disabled={!content}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
          >
            {copied ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            Copy
          </button>
          <button
            onClick={downloadCurrentMarkdown}
            disabled={!content}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> Markdown
          </button>
          <button
            onClick={handleDownloadZip}
            disabled={!jobId || !docs}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
            title="GET /download?job_id= (ZIP with md/json/html)"
          >
            <FileDown className="h-3.5 w-3.5" /> Download ZIP
          </button>
        </div>

        <div className="mt-4 min-h-[320px] rounded-xl bg-slate-50/60 p-5">
          {generating ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <p className="text-sm">Generating {TABS.find((t) => t.id === tab)?.label}…</p>
            </div>
          ) : content ? (
            <div className="animate-fade-in">
              {(tab === 'class' || tab === 'sequence') && (
                <div className="mb-2 flex items-center gap-2 text-slate-500">
                  {tab === 'class' ? (
                    <Network className="h-4 w-4" />
                  ) : (
                    <Workflow className="h-4 w-4" />
                  )}
                  <span className="text-xs">Markdown from backend documentation bundle</span>
                </div>
              )}
              <pre className="code-block whitespace-pre-wrap text-slate-800">{content}</pre>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
              Upload source and generate to load real documentation from the API
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
