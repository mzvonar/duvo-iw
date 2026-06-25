// Pure derivation of the automation's key state from its event log.
// Step 3 requires that "at every point we can derive the key state" — this is
// that function. It takes the events seen so far and returns a summary.

import type { RunEvent, RunStatus } from "@/lib/types";

export interface KeyState {
  phase: string;
  lastTool?: string;
  steps: number;
  toolCalls: number;
  mcpCalls: number;
  artifacts: number;
}

const phaseForKind: Record<RunEvent["kind"], string> = {
  thinking: "Reasoning",
  message: "Responding",
  tool_call: "Acting",
  tool_result: "Processing result",
  artifact: "Producing output",
  eval: "Evaluating",
};

const isStep = (e: RunEvent) => e.kind !== "eval";

export function deriveKeyState(
  events: readonly RunEvent[],
  status: RunStatus,
): KeyState {
  const toolCalls = events.filter((e) => e.kind === "tool_call");
  const lastTool = [...toolCalls].reverse()[0]?.toolName;
  const last = events[events.length - 1];

  const phase =
    status === "completed"
      ? "Completed"
      : status === "error"
        ? "Failed"
        : status === "aborted"
          ? "Stopped"
          : status === "idle"
            ? "Idle"
            : last
              ? phaseForKind[last.kind]
              : "Starting";

  return {
    phase,
    lastTool,
    steps: events.filter(isStep).length,
    toolCalls: toolCalls.length,
    mcpCalls: toolCalls.filter((e) => e.source === "mcp").length,
    artifacts: events.filter((e) => e.kind === "artifact").length,
  };
}
