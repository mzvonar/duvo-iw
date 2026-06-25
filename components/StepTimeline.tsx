"use client";

import type { RunEvent, RunStatus, StepKind } from "@/lib/types";

const dotColor: Record<StepKind, string> = {
  thinking: "bg-violet-400",
  message: "bg-emerald-400",
  tool_call: "bg-sky-400",
  tool_result: "bg-sky-400/50",
  artifact: "bg-emerald-400",
  eval: "bg-amber-400",
};

function StepRow({ event, last }: { event: RunEvent; last: boolean }) {
  return (
    <li className="relative pl-7">
      {!last && (
        <span className="absolute left-[5px] top-3 bottom-[-1rem] w-px bg-zinc-800" />
      )}
      <span
        className={`absolute left-0 top-[5px] h-2.5 w-2.5 rounded-full ring-4 ring-zinc-950 ${dotColor[event.kind]}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-100">{event.title}</span>
        {event.toolName && (
          <span className="rounded-md border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
            {event.toolName}
          </span>
        )}
        {event.source === "mcp" && (
          <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-amber-400">
            MCP
          </span>
        )}
      </div>
      {event.detail && (
        <pre className="mt-1.5 whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-900/50 px-2.5 py-1.5 font-mono text-xs text-zinc-400">
          {event.detail}
        </pre>
      )}
    </li>
  );
}

export function StepTimeline({
  events,
  status,
}: {
  events: RunEvent[];
  status: RunStatus;
}) {
  if (events.length === 0) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center px-6 text-center text-sm text-zinc-500">
        Run an automation to watch it unfold step by step.
      </div>
    );
  }

  const running = status === "running";

  return (
    <ol className="space-y-4">
      {events.map((event, i) => (
        <StepRow
          key={event.id}
          event={event}
          last={i === events.length - 1 && !running}
        />
      ))}
      {running && (
        <li className="relative pl-7">
          <span className="absolute left-0 top-[5px] h-2.5 w-2.5 animate-pulse rounded-full bg-zinc-500 ring-4 ring-zinc-950" />
          <span className="animate-pulse text-sm text-zinc-500">working…</span>
        </li>
      )}
    </ol>
  );
}
