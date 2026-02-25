"use client";

import { useEffect, useMemo, useState } from "react";

type ApiMode = "Auto Detect" | "DX11" | "DX12" | "Vulkan";

const DAILY_LIMIT = 3;

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseProbabilityBreakdown(text: string) {
  // Looks for:
  // Probability Breakdown:
  // - Driver/software issue: 60%
  // - Overheating/thermal: 15%
  // ...
  const lines = text.split("\n").map((l) => l.trim());
  const startIdx = lines.findIndex((l) =>
    l.toLowerCase().startsWith("probability breakdown:")
  );
  if (startIdx === -1) return null;

  const probs: { label: string; value: number }[] = [];
  for (let i = startIdx + 1; i < Math.min(lines.length, startIdx + 15); i++) {
    const line = lines[i];
    if (!line.startsWith("-")) break;

    // Example: "- Driver/software issue: 60%"
    const match = line.match(/^-+\s*(.+?):\s*(\d{1,3})%/i);
    if (!match) continue;

    const label = match[1].trim();
    const value = Number(match[2]);
    if (!Number.isFinite(value)) continue;

    probs.push({ label, value });
  }

  if (probs.length === 0) return null;

  probs.sort((a, b) => b.value - a.value);
  return {
    top: probs[0],
    all: probs,
  };
}

export default function Home() {
  const [gameTitle, setGameTitle] = useState("");
  const [gpuModel, setGpuModel] = useState("");
  const [driverVersion, setDriverVersion] = useState("");
  const [apiMode, setApiMode] = useState<ApiMode>("Auto Detect");
  const [log, setLog] = useState("");

  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  // Daily limiter state
  const [runsToday, setRunsToday] = useState(0);

  useEffect(() => {
    // Initialize / reset daily counter
    const key = "fmg_runs";
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as { date: string; count: number }) : null;

    const today = todayKey();

    if (!parsed || parsed.date !== today) {
      const fresh = { date: today, count: 0 };
      localStorage.setItem(key, JSON.stringify(fresh));
      setRunsToday(0);
    } else {
      setRunsToday(parsed.count ?? 0);
    }
  }, []);

  const remaining = Math.max(0, DAILY_LIMIT - runsToday);
  const isLimited = remaining <= 0;

  const prob = useMemo(() => parseProbabilityBreakdown(result), [result]);

  async function incrementRunCount() {
    const key = "fmg_runs";
    const today = todayKey();
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as { date: string; count: number }) : null;

    const count =
      parsed && parsed.date === today && Number.isFinite(parsed.count)
        ? parsed.count
        : 0;

    const next = { date: today, count: count + 1 };
    localStorage.setItem(key, JSON.stringify(next));
    setRunsToday(next.count);
  }

  async function handleAnalyze() {
    if (loading) return;

    // limiter (free tier)
    if (isLimited) {
      setResult(
        "Daily limit reached (3 free diagnostics/day). Upgrade for unlimited diagnostics."
      );
      return;
    }

    setLoading(true);
    setResult("");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          log,
          gameTitle,
          gpuModel,
          driverVersion,
          apiMode,
        }),
      });

      const data: unknown = await res.json();

      if (
        typeof data === "object" &&
        data !== null &&
        "result" in data &&
        typeof (data as { result: string }).result === "string"
      ) {
        await incrementRunCount();
        setResult((data as { result: string }).result);
      } else if (
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as { error: string }).error === "string"
      ) {
        setResult("Error: " + (data as { error: string }).error);
      } else {
        setResult("Unexpected response.");
      }
    } catch (err: unknown) {
      console.error(err);
      setResult("Error calling API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-start justify-center px-6 py-10 text-white bg-black">
      <div className="w-full max-w-2xl">
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-950 to-black p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
          <h1 className="text-4xl font-extrabold tracking-tight">
            FixMyGame AI
          </h1>
          <p className="mt-2 text-slate-300">
            GPU crash & driver diagnostic engine
          </p>

          <div className="mt-8 space-y-5">
            <div>
              <label className="block text-xs tracking-widest text-slate-400">
                GAME TITLE
              </label>
              <input
                className="mt-2 w-full rounded-lg border border-slate-800 bg-black px-4 py-3 text-white outline-none focus:border-slate-600"
                placeholder="Warzone, Tarkov, Fortnite..."
                value={gameTitle}
                onChange={(e) => setGameTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs tracking-widest text-slate-400">
                GPU MODEL
              </label>
              <input
                className="mt-2 w-full rounded-lg border border-slate-800 bg-black px-4 py-3 text-white outline-none focus:border-slate-600"
                placeholder="RTX 3070 / RX 6800"
                value={gpuModel}
                onChange={(e) => setGpuModel(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs tracking-widest text-slate-400">
                DRIVER VERSION
              </label>
              <input
                className="mt-2 w-full rounded-lg border border-slate-800 bg-black px-4 py-3 text-white outline-none focus:border-slate-600"
                placeholder="551.86"
                value={driverVersion}
                onChange={(e) => setDriverVersion(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs tracking-widest text-slate-400">
                GRAPHICS API MODE
              </label>

              {/* Accessible name fix: label is already present, plus aria-label */}
              <select
                aria-label="Graphics API Mode"
                className="mt-2 w-full rounded-lg border border-slate-800 bg-black px-4 py-3 text-white outline-none focus:border-slate-600"
                value={apiMode}
                onChange={(e) => setApiMode(e.target.value as ApiMode)}
              >
                <option value="Auto Detect">Auto Detect</option>
                <option value="DX11">DX11</option>
                <option value="DX12">DX12</option>
                <option value="Vulkan">Vulkan</option>
              </select>
            </div>

            <div>
              <label className="block text-xs tracking-widest text-slate-400">
                CRASH LOG / ERROR
              </label>
              <textarea
                className="mt-2 min-h-[170px] w-full rounded-lg border border-slate-800 bg-black px-4 py-3 text-white outline-none focus:border-slate-600"
                placeholder="Paste crash log or error message..."
                value={log}
                onChange={(e) => setLog(e.target.value)}
              />
            </div>

            <div className="pt-2">
              <button
                onClick={handleAnalyze}
                disabled={loading || isLimited || !log.trim()}
                className="w-full rounded-lg bg-blue-600 px-5 py-4 text-lg font-semibold disabled:opacity-40"
              >
                {loading
                  ? "Running..."
                  : isLimited
                  ? "Daily Limit Reached"
                  : "Run Diagnostic"}
              </button>

              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span>
                  Free diagnostics left today:{" "}
                  <span className="text-slate-200">{remaining}</span> / {DAILY_LIMIT}
                </span>

                <span className="text-slate-300">
                  Upgrade for unlimited (coming next)
                </span>
              </div>
            </div>
          </div>

          {/* STEP 1: Top cause summary box */}
          {prob?.top && (
            <div className="mt-8 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-xs tracking-widest text-slate-400">
                TOP LIKELY CAUSE
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-lg font-semibold text-white">
                  {prob.top.label}
                </div>
                <div className="rounded-full border border-slate-700 bg-black px-3 py-1 text-sm text-slate-200">
                  {prob.top.value}%
                </div>
              </div>
              <div className="mt-2 text-sm text-slate-300">
                Based on the probability breakdown from your crash signal + context.
              </div>
            </div>
          )}

          {/* Output */}
          <pre className="mt-8 whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-100">
            {result || "Paste a crash log and run diagnostic to see results here."}
          </pre>
        </div>
      </div>
    </main>
  );
}