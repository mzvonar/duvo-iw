// Shared contract between the streaming backend and the UI.
// The mock producer (Phase 1) and the real agent (Phase 2) both emit these
// frames over SSE, so the UI never changes when the producer is swapped.

export type RunStatus = "idle" | "running" | "completed" | "error" | "aborted";

// Which producer is serving runs: the real Agent SDK or the mock stream.
export type RunMode = "real" | "mock";

export type StepKind =
  | "thinking" // agent reasoning / planning text
  | "message" // user-facing agent text
  | "tool_call" // a tool was invoked
  | "tool_result" // a tool returned
  | "artifact" // a file was produced
  | "eval"; // an evaluation verdict was produced

// Whether a step came from the core agent toolset or a connected MCP server.
export type StepSource = "agent" | "mcp";

export interface RunEvent {
  id: string;
  ts: number;
  kind: StepKind;
  title: string;
  detail?: string;
  toolName?: string;
  source?: StepSource;
}

export interface Artifact {
  name: string;
  size: number;
  mime: string;
  downloadUrl: string;
}

export interface EvalCriterion {
  name: string;
  passed: boolean;
  note: string;
}

export interface EvalResult {
  verdict: "pass" | "fail";
  score: number; // 0..100
  summary: string;
  criteria: EvalCriterion[];
}

export interface RunConfig {
  instruction: string;
  useFilesystemMcp: boolean; // Step 4 — "connect your data" toggle
}

// Frames sent over the SSE stream. A run is a sequence of these.
export type RunFrame =
  | { type: "status"; runId: string; status: RunStatus }
  | { type: "event"; event: RunEvent }
  | { type: "artifact"; artifact: Artifact }
  | { type: "eval"; result: EvalResult };
