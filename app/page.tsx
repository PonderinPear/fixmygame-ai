"use client";

import React, { useEffect, useMemo, useState } from "react";

type LimitResponse = {
  isPro: boolean;
  remaining: number;
  limit: number;
};

type AnalyzeResponse = {
  result: string;
};

type CheckoutResponse = {
  url: string;
};
type ApiErrorShape = {
  error?: string;
  message?: string;
};

function isApiErrorShape(x: unknown): x is ApiErrorShape {
  return typeof x === "object" && x !== null;
}

async function fetchJSON<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();

  let parsed: unknown = null;
  if (text.trim().length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;

    if (isApiErrorShape(parsed)) {
      if (typeof parsed.error === "string" && parsed.error.trim().length > 0) {
        message = parsed.error;
      } else if (typeof parsed.message === "string" && parsed.message.trim().length > 0) {
        message = parsed.message;
      }
    } else if (text.trim().length > 0) {
      message = text.slice(0, 300);
    }

    throw new Error(message);
  }

  if (parsed === null) {
    throw new Error("Server returned an empty response.");
  }

  return parsed as T;
}

export default function Page() {
  const [gameTitle, setGameTitle] = useState("Minecraft (Modded)");
  const [gpuModel, setGpuModel] = useState("RTX 3060");
  const [driverVersion, setDriverVersion] = useState("551.86");
  const [graphicsApiMode, setGraphicsApiMode] = useState("Auto Detect");
  const [crashLog, setCrashLog] = useState("");

  const [isPro, setIsPro] = useState(false);
  const [limit, setLimit] = useState(3);
  const [remaining, setRemaining] = useState(3);

  const [loadingLimit, setLoadingLimit] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const canRun = useMemo(() => isPro || remaining > 0, [isPro, remaining]);

  useEffect(() => {
    let cancelled = false;

    async function loadLimit() {
      setLoadingLimit(true);
      try {
        const data = await fetchJSON<LimitResponse>("/api/limit", { method: "GET" });
        if (cancelled) return;

        setIsPro(Boolean(data.isPro));
        setLimit(Number.isFinite(data.limit) ? data.limit : 3);
        setRemaining(Number.isFinite(data.remaining) ? data.remaining : 3);
      } catch {
        // If /api/limit fails locally, don't break the UI
        if (cancelled) return;
        setIsPro(false);
        setLimit(3);
        setRemaining(3);
      } finally {
        if (!cancelled) setLoadingLimit(false);
      }
    }
    

    loadLimit();
    return () => {
      cancelled = true;
    };
  }, []);

  function showCrashLogHelp() {
    alert(
      `Minecraft (CurseForge/Forge/Fabric):
- Instance folder > logs/latest.log
- Instance folder > crash-reports/*.txt

CurseForge app:
Open the modpack > ... > Open Folder`
    );
  }

  async function runDiagnostic() {
    setErrorMsg("");
    setResult("");

    if (!crashLog.trim()) {
      setErrorMsg("Paste a crash log / error first.");
      return;
    }

    if (!canRun) {
      setErrorMsg("Daily limit reached. Upgrade to Pro for unlimited diagnostics.");
      return;
    }

    setRunning(true);
    try {
      const payload = {
        gameTitle,
        gpuModel,
        driverVersion,
        graphicsApiMode,
        crashLog,
      };

      const data = await fetchJSON<AnalyzeResponse>("/api/analyze", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setResult(data.result || "");
      // refresh limit after a run (server is source of truth)
      const lim = await fetchJSON<LimitResponse>("/api/limit", { method: "GET" });
      setIsPro(Boolean(lim.isPro));
      setLimit(Number.isFinite(lim.limit) ? lim.limit : 3);
      setRemaining(Number.isFinite(lim.remaining) ? lim.remaining : 0);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Diagnostic failed.";
      setErrorMsg(msg);
    } finally {
      setRunning(false);
    }
  }

  async function upgradeToPro() {
    setErrorMsg("");
    try {
      const data = await fetchJSON<CheckoutResponse>("/api/checkout", {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (!data.url) {
        throw new Error("Checkout failed.");
      }

      window.location.href = data.url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Checkout failed.";
      setErrorMsg(msg);
      alert("Checkout failed.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-12 text-white">
      <h1 className="text-4xl font-extrabold tracking-tight">AI Crash Analyzer for Modded PC Games</h1>
      <p className="mt-3 max-w-3xl text-white/80">
        Diagnose Forge, Fabric, and CurseForge crash logs. Detect mod conflicts, dependency issues, loader mismatches, and
        GPU/driver faults.
      </p>

      <section className="mt-10 rounded-2xl border border-white/10 bg-[rgba(10,22,48,0.55)] p-5">
        <div className="grid gap-4">
          <Field label="GAME TITLE">
            <input
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/20"
              value={gameTitle}
              onChange={(e) => setGameTitle(e.target.value)}
              placeholder="Minecraft (Modded), Warzone, Tarkov..."
            />
          </Field>

          <Field label="GPU MODEL">
            <input
className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/20"              value={gpuModel}
              onChange={(e) => setGpuModel(e.target.value)}
              placeholder="RTX 3070 / RX 6800"
            />
          </Field>

          <Field label="DRIVER VERSION">
            <input
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/20"
              value={driverVersion}
              onChange={(e) => setDriverVersion(e.target.value)}
              placeholder="551.86"
            />
          </Field>

          <Field label="GRAPHICS API MODE">
            <select
  aria-label="Graphics API Mode"
  className="..."
  value={graphicsApiMode}
  onChange={(e) => setGraphicsApiMode(e.target.value)}
>
              <option>Auto Detect</option>
              <option>DirectX 11</option>
              <option>DirectX 12</option>
              <option>Vulkan</option>
              <option>OpenGL</option>
            </select>
          </Field>

          <Field
            label="CRASH LOG / ERROR"
            rightLinkText="Where do I find my crash log?"
            onRightLinkClick={showCrashLogHelp}
          >
            <textarea
              className="min-h-[220px] w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm outline-none focus:border-white/20"
              value={crashLog}
              onChange={(e) => setCrashLog(e.target.value)}
              placeholder="Paste your Forge/Fabric/CurseForge crash report or latest.log here..."
            />
          </Field>
        </div>

        <div className="mt-6">
          <button
            className={[
              "w-full rounded-xl px-5 py-4 text-lg font-semibold transition",
              canRun && !running ? "bg-blue-600 hover:bg-blue-500" : "bg-blue-900/60 text-white/60",
            ].join(" ")}
            onClick={runDiagnostic}
            disabled={!canRun || running}
          >
            {running ? "Running..." : "Run Diagnostic"}
          </button>

          <div className="mt-2 flex items-center justify-between text-sm text-white/70">
            <div>
              {loadingLimit ? (
                "Checking daily limit..."
              ) : isPro ? (
                "Pro: Unlimited"
              ) : (
                <>
                  Free diagnostics left today: <span className="font-semibold">{remaining}</span> / {limit}
                </>
              )}
            </div>

            {!isPro && (
              <button
                type="button"
                className="underline underline-offset-4 hover:text-white"
                onClick={upgradeToPro}
              >
                Upgrade for unlimited (Pro)
              </button>
            )}
          </div>

          {errorMsg ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-100">
              {errorMsg}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6">
        {result ? (
          <div className="rounded-2xl border border-white/10 bg-[rgba(10,22,48,0.55)] p-5">
            <div className="text-xs font-semibold tracking-widest text-white/70">RESULT</div>
            <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-black/30 p-4 text-sm leading-relaxed">
              {result}
            </pre>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-[rgba(10,22,48,0.35)] p-5 text-white/70">
            Paste a crash log and run diagnostic to see results here.
          </div>
        )}
      </section>
    </main>
  );
}

function Field(props: {
  label: string;
  children: React.ReactNode;
  rightLinkText?: string;
  onRightLinkClick?: () => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <div className="text-xs font-semibold tracking-widest text-white/70">{props.label}</div>
        <div className="flex-1" />
        {props.rightLinkText && props.onRightLinkClick ? (
          <button
            type="button"
            onClick={props.onRightLinkClick}
            className="text-xs text-white/70 underline underline-offset-4 hover:text-white"
          >
            {props.rightLinkText}
          </button>
        ) : null}
      </div>
      {props.children}
    </div>
  );
}