"use client";

import type { RunEvent, RunMode, RunStatus } from "@/lib/types";
import { deriveKeyState } from "@/lib/keyState";

function ModeBadge({ mode }: { mode: RunMode }) {
  const real = mode === "real";
  return (
    <span
      title={real ? "Live Agent SDK run" : "Mock run (no API key configured)"}
      className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        real
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-zinc-700 bg-zinc-800/60 text-zinc-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${real ? "bg-emerald-400" : "bg-zinc-500"}`}
      />
      {real ? "Live" : "Mock"}
    </span>
  );
}

const dotColor: Record<string, string> = {
  Idle: "bg-zinc-500",
  Starting: "bg-amber-400",
  Reasoning: "bg-violet-400",
  Acting: "bg-sky-400",
  "Processing result": "bg-sky-400",
  Responding: "bg-emerald-400",
  "Producing output": "bg-emerald-400",
  Evaluating: "bg-amber-400",
  Completed: "bg-emerald-400",
  Failed: "bg-rose-500",
  Stopped: "bg-zinc-400",
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-lg leading-none text-zinc-100 tabular-nums">
        {value}
      </span>
      <span className="mt-1 text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
    </div>
  );
}

export function KeyStateBar({
  events,
  status,
  elapsedMs,
  mode,
}: {
  events: RunEvent[];
  status: RunStatus;
  elapsedMs: number;
  mode?: RunMode;
}) {
  const k = deriveKeyState(events, status);
  const elapsed = `${(elapsedMs / 1000).toFixed(1)}s`;
  const live = status === "running";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span
          className={`h-2.5 w-2.5 rounded-full ${dotColor[k.phase] ?? "bg-zinc-500"} ${live ? "animate-pulse" : ""}`}
        />
        <span className="text-sm font-medium text-zinc-100">{k.phase}</span>
        {k.lastTool && (
          <span className="font-mono text-xs text-zinc-500">· {k.lastTool}</span>
        )}
        {mode && <ModeBadge mode={mode} />}
      </div>
      <div className="mt-4 grid grid-cols-5 gap-3">
        <Metric label="Steps" value={k.steps} />
        <Metric label="Tools" value={k.toolCalls} />
        <Metric label="MCP" value={k.mcpCalls} />
        <Metric label="Files" value={k.artifacts} />
        <Metric label="Elapsed" value={elapsed} />
      </div>
    </div>
  );
}
