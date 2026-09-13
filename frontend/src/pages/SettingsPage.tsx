import { useState } from 'react';
import { Check, Sun, Moon, Server, Info } from 'lucide-react';

/**
 * Phase 6 — Settings cleanup
 *
 * Backend Vertex model / temperature / credentials live in server .env
 * (VERTEX_MODEL, VERTEX_TEMPERATURE, ADC / service account).
 * We do NOT collect cloud API keys in the browser (security).
 *
 * Local-only preferences (theme) stay in React state for now.
 */

const MODELS = [
  {
    id: 'gemini',
    name: 'Gemini (Vertex AI)',
    desc: 'Server-managed via VERTEX_MODEL in backend .env',
    tint: 'from-sky-500 to-cyan-600',
    active: true,
  },
  {
    id: 'gpt',
    name: 'GPT-4o',
    desc: 'Not configured — backend uses Vertex AI only',
    tint: 'from-emerald-500 to-teal-600',
    active: false,
  },
  {
    id: 'claude',
    name: 'Claude 3.5',
    desc: 'Not configured — backend uses Vertex AI only',
    tint: 'from-blue-500 to-indigo-600',
    active: false,
  },
];

export default function SettingsPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [saved, setSaved] = useState(false);

  const save = () => {
    // Theme is UI-only for now (no dark theme CSS fully wired)
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Local UI preferences. AI model credentials and Vertex config are managed on the server.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-800">LLM provider</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            This app&apos;s backend is wired to Google Vertex AI (Gemini) only.
          </p>
          <div className="mt-4 space-y-2.5">
            {MODELS.map((m) => (
              <div
                key={m.id}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                  m.active
                    ? 'border-blue-300 bg-blue-50/60 ring-1 ring-blue-200'
                    : 'border-slate-200 bg-white/40 opacity-70'
                }`}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${m.tint} text-white`}
                >
                  <span className="text-xs font-bold">{m.name[0]}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{m.name}</p>
                  <p className="text-xs text-slate-500">{m.desc}</p>
                </div>
                {m.active && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-800">Server configuration</h2>
            </div>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              Set these in <code className="text-[11px]">backend-python/.env</code>, not in the
              browser:
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600 font-mono">
              <li>VERTEX_PROJECT_ID</li>
              <li>VERTEX_LOCATION</li>
              <li>VERTEX_MODEL</li>
              <li>VERTEX_TEMPERATURE</li>
              <li>gcloud auth application-default login</li>
            </ul>
            <div className="mt-3 flex gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <Info className="h-4 w-4 shrink-0 text-slate-400" />
              API keys are never stored in the frontend. Supabase is installed but unused.
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-slate-800">Theme</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Preference only (full dark theme CSS not fully implemented yet).
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium capitalize transition ${
                    theme === t
                      ? 'border-blue-300 bg-blue-50/60 text-blue-700 ring-1 ring-blue-200'
                      : 'border-slate-200 bg-white/60 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {t === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {t} mode
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-800">Frontend API connection</h2>
          <p className="mt-1 text-xs text-slate-500">
            Configured via <code>VITE_API_BASE_URL</code> in <code>frontend/.env</code> (default
            http://localhost:8080). Restart Vite after changing it.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={save}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:shadow-lg"
            >
              Save local preferences
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 animate-fade-in">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
