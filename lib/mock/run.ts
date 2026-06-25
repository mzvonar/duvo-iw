// MOCK producer for Phase 1. Emits the same RunFrames the real agent will emit
// in Phase 2, so the UI is fully exercised before the Agent SDK is wired in.
// Replace `mockRun` with the real `query()`-driven producer later; the SSE
// contract (RunFrame) stays identical.

import type { RunConfig, RunFrame } from "@/lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let seq = 0;
const nextId = () => `evt_${Date.now().toString(36)}_${(seq++).toString(36)}`;

type Step = Omit<
  Extract<RunFrame, { type: "event" }>["event"],
  "id" | "ts"
> & { delay?: number };

const step = (s: Step): RunFrame => ({
  type: "event",
  event: { id: nextId(), ts: Date.now(), ...s },
});

/**
 * Simulates the "Fetch the latest AI news and save them into a CSV" task as a
 * multi-step automation. When `useFilesystemMcp` is on, it also reads a
 * "connected" local data source via the (mock) filesystem MCP server, so the
 * Step 4 toggle visibly changes the trajectory.
 */
export async function* mockRun(config: RunConfig): AsyncGenerator<RunFrame> {
  const runId = `run_${Date.now().toString(36)}`;
  yield { type: "status", runId, status: "running" };

  const frames: Array<{ frame: RunFrame; delay: number }> = [];
  const push = (frame: RunFrame, delay = 650) => frames.push({ frame, delay });

  push(
    step({
      kind: "thinking",
      title: "Planning the automation",
      detail: `Breaking down the request:\n"${config.instruction}"\n\n1. Search the web for the latest AI news\n2. Select and structure the most relevant items\n3. Write the results to a CSV file`,
    }),
    500,
  );

  if (config.useFilesystemMcp) {
    push(
      step({
        kind: "tool_call",
        source: "mcp",
        toolName: "filesystem.read_file",
        title: "Reading connected data source",
        detail: "Path: /data/sources.txt  (via Filesystem MCP)",
      }),
      700,
    );
    push(
      step({
        kind: "tool_result",
        source: "mcp",
        toolName: "filesystem.read_file",
        title: "Loaded preferred sources",
        detail: "techcrunch.com, theverge.com, arstechnica.com, venturebeat.com",
      }),
      550,
    );
  }

  push(
    step({
      kind: "tool_call",
      source: "agent",
      toolName: "WebSearch",
      title: "Searching the web",
      detail: 'query: "latest artificial intelligence news this week"',
    }),
    900,
  );
  push(
    step({
      kind: "tool_result",
      source: "agent",
      toolName: "WebSearch",
      title: "Found 8 candidate articles",
      detail:
        "Ranked by recency and relevance. Filtering to the 5 most newsworthy items.",
    }),
    700,
  );
  push(
    step({
      kind: "thinking",
      title: "Structuring the dataset",
      detail:
        "Columns: title, source, published, url, summary. Normalizing dates to ISO-8601.",
    }),
    600,
  );
  push(
    step({
      kind: "tool_call",
      source: "agent",
      toolName: "Write",
      title: "Writing ai-news.csv",
      detail: "5 rows + header → ai-news.csv",
    }),
    800,
  );
  push(
    step({
      kind: "tool_result",
      source: "agent",
      toolName: "Write",
      title: "File written",
      detail: "ai-news.csv (5 rows, 642 bytes)",
    }),
    400,
  );
  push(
    step({
      kind: "artifact",
      title: "Produced ai-news.csv",
      detail: "Ready to download.",
    }),
    300,
  );

  for (const { frame, delay } of frames) {
    await sleep(delay);
    yield frame;
  }

  // Artifact frame (separate channel so the UI can list/download it).
  await sleep(200);
  yield {
    type: "artifact",
    artifact: {
      name: "ai-news.csv",
      size: 642,
      mime: "text/csv",
      // Phase 2 replaces this with a real per-run file route.
      downloadUrl: "/api/mock-artifact?name=ai-news.csv",
    },
  };

  await sleep(300);
  yield step({
    kind: "message",
    title: "Done",
    detail:
      "Saved the 5 most relevant AI news items from this week to ai-news.csv.",
  });

  // Mock evaluation (Phase 3 replaces this with a real LLM-judge over the CSV).
  await sleep(700);
  yield {
    type: "eval",
    result: {
      verdict: "pass",
      score: 92,
      summary:
        "The output is a well-formed CSV containing 5 recent, relevant AI news items with all required fields populated.",
      criteria: [
        { name: "File produced", passed: true, note: "ai-news.csv exists and is non-empty." },
        { name: "Valid CSV", passed: true, note: "Header + 5 rows, consistent column count." },
        { name: "Recency", passed: true, note: "All items dated within the last 7 days." },
        { name: "Relevance", passed: true, note: "Each row is a genuine AI/ML news item." },
        { name: "Completeness", passed: false, note: "1 row is missing a summary." },
      ],
    },
  };

  await sleep(250);
  yield { type: "status", runId, status: "completed" };
}
