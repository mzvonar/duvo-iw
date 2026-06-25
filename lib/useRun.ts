"use client";

// Client-side run driver. POSTs the config, reads the SSE stream, and exposes
// the accumulating run state. The producer behind /api/run can change freely;
// this hook only depends on the RunFrame contract.

import { useCallback, useRef, useState } from "react";
import type {
  Artifact,
  EvalResult,
  RunConfig,
  RunEvent,
  RunFrame,
  RunStatus,
} from "@/lib/types";

export interface RunState {
  status: RunStatus;
  events: RunEvent[];
  artifacts: Artifact[];
  evaluation?: EvalResult;
  startedAt?: number;
}

const initial: RunState = { status: "idle", events: [], artifacts: [] };

function parseFrames(buffer: string): { frames: RunFrame[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const frames: RunFrame[] = [];
  for (const part of parts) {
    const line = part.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    try {
      frames.push(JSON.parse(line.slice(5).trim()) as RunFrame);
    } catch {
      // ignore malformed frame
    }
  }
  return { frames, rest };
}

export function useRun() {
  const [state, setState] = useState<RunState>(initial);
  const abortRef = useRef<AbortController | null>(null);

  const apply = useCallback((frame: RunFrame) => {
    setState((prev) => {
      switch (frame.type) {
        case "status":
          return { ...prev, status: frame.status };
        case "event":
          return { ...prev, events: [...prev.events, frame.event] };
        case "artifact":
          return prev.artifacts.some((a) => a.name === frame.artifact.name)
            ? prev
            : { ...prev, artifacts: [...prev.artifacts, frame.artifact] };
        case "eval":
          return { ...prev, evaluation: frame.result };
        default:
          return prev;
      }
    });
  }, []);

  const start = useCallback(
    async (config: RunConfig) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setState({ ...initial, status: "running", startedAt: Date.now() });

      try {
        const res = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
          signal: ctrl.signal,
        });
        if (!res.body) throw new Error("No response stream");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { frames, rest } = parseFrames(buffer);
          buffer = rest;
          frames.forEach(apply);
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          setState((prev) => ({ ...prev, status: "aborted" }));
        } else {
          setState((prev) => ({ ...prev, status: "error" }));
        }
      }
    },
    [apply],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(initial);
  }, []);

  return { state, start, stop, reset };
}
