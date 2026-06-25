"use client";

import type { EvalResult } from "@/lib/types";

export function EvalPanel({ result }: { result?: EvalResult }) {
  if (!result) return null;

  const pass = result.verdict === "pass";

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
            pass
              ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/40"
              : "bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/40"
          }`}
        >
          {result.verdict}
        </span>
        <span className="font-mono text-sm text-zinc-300 tabular-nums">
          {result.score} / 100
        </span>
      </div>

      <p className="text-sm text-zinc-300">{result.summary}</p>

      <ul className="space-y-1.5">
        {result.criteria.map((c) => (
          <li key={c.name} className="flex items-start gap-2 text-sm">
            <span
              className={`mt-0.5 shrink-0 ${c.passed ? "text-emerald-400" : "text-rose-400"}`}
            >
              {c.passed ? "✓" : "✗"}
            </span>
            <span>
              <span className="text-zinc-200">{c.name}</span>
              {c.note && (
                <span className="text-zinc-500"> — {c.note}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
