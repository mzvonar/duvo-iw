"use client";

import { useEffect, useState } from "react";
import type { RunMode } from "@/lib/types";
import { useRun } from "@/lib/useRun";
import { KeyStateBar } from "@/components/KeyStateBar";
import { StepTimeline } from "@/components/StepTimeline";
import { ArtifactPreview } from "@/components/ArtifactPreview";
import { EvalPanel } from "@/components/EvalPanel";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const DEFAULT_INSTRUCTION =
  "Fetch the latest AI news from the web and save them into a CSV";

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-amber-500" : "bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function RunConsole() {
  const { state, start, stop, reset } = useRun();
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [useFilesystemMcp, setUseFilesystemMcp] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<RunMode | undefined>(undefined);

  const running = state.status === "running";

  // Ask the server which producer is configured (real Agent SDK vs mock).
  useEffect(() => {
    let active = true;
    fetch("/api/run")
      .then((r) => r.json())
      .then((d) => {
        if (active && (d?.mode === "real" || d?.mode === "mock"))
          setMode(d.mode);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);

  const lastEventTs = state.events[state.events.length - 1]?.ts ?? now;
  const elapsedMs = state.startedAt
    ? (running ? now : lastEventTs) - state.startedAt
    : 0;

  const canRun = instruction.trim().length > 0 && !running;

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <aside className="space-y-5 lg:sticky lg:top-8 lg:self-start">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Duvo
          </h1>
          <p className="text-sm text-zinc-500">Agentic automation</p>
        </header>

        <div className="space-y-2">
          <label
            htmlFor="instruction"
            className="text-[11px] font-medium uppercase tracking-wider text-zinc-500"
          >
            Instruction
          </label>
          <textarea
            id="instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={running}
            rows={4}
            className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-600 disabled:opacity-60"
            placeholder="Describe what the agent should do…"
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-zinc-100">Filesystem MCP</p>
            <p className="text-xs text-zinc-500">Connect your data</p>
          </div>
          <Toggle
            checked={useFilesystemMcp}
            onChange={setUseFilesystemMcp}
            disabled={running}
          />
        </div>

        <div className="flex gap-2">
          {running ? (
            <button
              type="button"
              onClick={stop}
              className="flex-1 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => start({ instruction, useFilesystemMcp })}
              disabled={!canRun}
              className="flex-1 rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Run
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            New run
          </button>
        </div>

        <KeyStateBar
          events={state.events}
          status={state.status}
          elapsedMs={elapsedMs}
          mode={mode}
        />

        <EvalPanel result={state.evaluation} />
      </aside>

      <section className="max-h-[calc(100vh-4rem)] space-y-6 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 lg:sticky lg:top-8">
        <StepTimeline events={state.events} status={state.status} />

        {state.artifacts.length > 0 && (
          <div className="space-y-3 border-t border-zinc-800 pt-5">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Artifacts
            </h2>
            <ul className="space-y-3">
              {state.artifacts.map((a) => (
                <li key={a.name} className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-zinc-100">
                        {a.name}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {formatSize(a.size)} · {a.mime}
                      </p>
                    </div>
                    <a
                      href={a.downloadUrl}
                      download={a.name}
                      className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                    >
                      Download
                    </a>
                  </div>
                  {state.status === "completed" && (
                    <ArtifactPreview artifact={a} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
