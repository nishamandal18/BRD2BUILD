import { useRef, useState } from 'react';
import {
  Code2,
  Wand2,
  Upload,
  Loader2,
  Copy,
  Download,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
  AlertCircle,
  X,
} from 'lucide-react';
import { uploadCode, generateTests, downloadTests } from '@/lib/api/tests';
import { ApiError } from '@/lib/api/client';
import type { GenerationReport } from '@/lib/types/tests';

/**
 * Phase 2 flow:
 * pasted code → File("snippet.py") OR uploaded .py/.zip
 * → POST /upload-code
 * → POST /generate-tests
 * → show test_files + report
 *
 * Backend is Python-only.
 */

const SAMPLE_CODE = `def process_payment(amount, currency, customer_id):
    if amount <= 0:
        raise ValueError("Amount must be positive")
    if currency not in ("USD", "EUR", "GBP"):
        raise ValueError("Unsupported currency")
    fee = amount * 0.029 + 0.30
    total = round(amount + fee, 2)
    return {
        "customer_id": customer_id,
        "amount": total,
        "currency": currency,
        "fee": round(fee, 2),
        "status": "processed",
    }`;

export default function UnitTestPage() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [tests, setTests] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<'code' | 'tests' | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [report, setReport] = useState<GenerationReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onPickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list);
    setUploadFiles(files);
    setErrorMessage(null);
    // If user uploaded raw .py files, preview first file content when single text file
    if (files.length === 1 && files[0].name.endsWith('.py')) {
      files[0].text().then(setCode).catch(() => undefined);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setTests('');
    setReport(null);
    setJobId(null);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      let files: File[] = uploadFiles;
      if (!files.length) {
        // Convert editor text to a .py file for POST /upload-code
        if (!code.trim()) {
          throw new Error('Paste Python code or upload a .py / .zip file first.');
        }
        files = [
          new File([code], 'snippet.py', {
            type: 'text/x-python',
          }),
        ];
      }

      setStatusMessage('Uploading code to backend…');
      const uploadRes = await uploadCode(files);
      setJobId(uploadRes.job_id);
      setStatusMessage(`Uploaded ${uploadRes.file_count} file(s). Generating tests with Vertex AI…`);

      const genRes = await generateTests({
        job_id: uploadRes.job_id,
        test_style: 'unit',
        include_integration_style: false,
      });

      const combined = genRes.test_files
        .map(
          (f) =>
            `# === ${f.relative_path} ===\n${f.content}`.trimEnd(),
        )
        .join('\n\n');

      setTests(combined || '# No test files returned');
      setReport(genRes.report);
      setStatusMessage(genRes.message || 'Tests generated successfully');
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
        setErrorMessage('Failed to generate unit tests.');
      }
    } finally {
      setGenerating(false);
    }
  };

  const copy = async (which: 'code' | 'tests', text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const handleDownloadZip = async () => {
    if (!jobId) return;
    try {
      const blob = await downloadTests(jobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tests_${jobId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : 'Download failed');
    }
  };

  const coverage = report?.coverage.estimated_line_coverage_percent ?? null;
  const branch = report?.coverage.estimated_branch_coverage_percent ?? null;
  const missing = report?.missing_edge_cases ?? [];
  const recommendations = report?.testing_recommendations ?? [];
  const covered = report?.coverage.covered_functions ?? [];
  const uncovered = report?.coverage.uncovered_functions ?? [];

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-slate-800">Unit Test Generator</h1>
        <p className="mt-1 text-sm text-slate-500">
          Paste Python code or upload <span className="font-medium">.py / .zip</span> files.
          Backend analyzes with AST and generates pytest suites via Vertex AI (Gemini).
        </p>
      </div>

      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-slate-400" />
          <select
            value="Python"
            disabled
            className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 outline-none"
            title="Backend currently supports Python only"
          >
            <option>Python</option>
          </select>
          <span className="text-xs text-slate-400">Python only (backend)</span>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".py,.zip"
          multiple
          className="hidden"
          onChange={(e) => onPickFiles(e.target.files)}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white"
        >
          <Upload className="h-4 w-4" /> Upload .py / .zip
        </button>

        {uploadFiles.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>
              {uploadFiles.length} file(s): {uploadFiles.map((f) => f.name).join(', ')}
            </span>
            <button
              onClick={() => setUploadFiles([])}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
              title="Clear uploads; will use editor text instead"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <button
          onClick={generate}
          disabled={generating}
          className="ml-auto flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:shadow-lg disabled:opacity-60"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {generating ? 'Generating…' : 'Generate Tests'}
        </button>
      </div>

      {statusMessage && (
        <p className="text-xs text-slate-500 break-all">{statusMessage}</p>
      )}
      {jobId && (
        <p className="text-[11px] font-mono text-slate-400 break-all">job_id: {jobId}</p>
      )}
      {errorMessage && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-700">Original Code</span>
            <button
              onClick={() => copy('code', code)}
              className="flex items-center gap-1.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              {copied === 'code' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
          <textarea
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              // Editing text means we prefer paste path unless explicit uploads remain
            }}
            spellCheck={false}
            className="code-block h-80 w-full resize-none bg-slate-50/60 p-4 text-slate-800 outline-none"
          />
        </div>

        <div className="glass overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-700">Generated Tests</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => tests && copy('tests', tests)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                {copied === 'tests' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={handleDownloadZip}
                disabled={!jobId || !tests}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                title="GET /download-tests"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="h-80 overflow-auto bg-slate-50/60 p-4">
            {generating ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                <p className="text-sm">Uploading, analyzing AST & generating tests…</p>
              </div>
            ) : tests ? (
              <pre className="code-block whitespace-pre text-slate-800">{tests}</pre>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Click &quot;Generate Tests&quot; to call the backend
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="glass card-hover rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-800">Coverage Analysis</h3>
          </div>
          <div className="mt-4 flex items-end gap-2">
            <span className="text-3xl font-bold text-slate-800">
              {coverage != null ? `${Math.round(coverage)}%` : '—'}
            </span>
            {branch != null && (
              <span className="mb-1 text-xs text-slate-500">
                branch {Math.round(branch)}%
              </span>
            )}
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, coverage ?? 0))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {covered.length
              ? `${covered.length} covered · ${uncovered.length} uncovered functions`
              : report
                ? 'Estimates from backend report'
                : 'Run generation to load report'}
          </p>
          {report?.coverage.notes?.[0] && (
            <p className="mt-1 text-[11px] text-slate-400">{report.coverage.notes[0]}</p>
          )}
        </div>

        <div className="glass card-hover rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-800">Covered / Notes</h3>
          </div>
          <ul className="mt-3 space-y-1.5 max-h-40 overflow-auto">
            {(covered.length ? covered : recommendations.slice(0, 4)).length === 0 && (
              <li className="text-sm text-slate-400">No data yet</li>
            )}
            {(covered.length ? covered : recommendations).slice(0, 8).map((e) => (
              <li key={e} className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                {e}
              </li>
            ))}
          </ul>
        </div>

        <div className="glass card-hover rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-800">Missing Edge Cases</h3>
          </div>
          <ul className="mt-3 space-y-1.5 max-h-40 overflow-auto">
            {missing.length === 0 && (
              <li className="text-sm text-slate-400">No data yet</li>
            )}
            {missing.map((e) => (
              <li key={e} className="flex items-start gap-2 text-sm text-slate-600">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                {e}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
