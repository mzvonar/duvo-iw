// SSE endpoint that streams a run's frames to the client.
// Phase 1: driven by the mock producer. Phase 2: swap `mockRun` for the
// Agent SDK `query()`-driven producer — the framing below is unchanged.

import type { RunConfig, RunFrame, RunMode } from "@/lib/types";
import { mockRun } from "@/lib/mock/run";
import { realRun } from "@/lib/agent/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const frame = (f: RunFrame) => encoder.encode(`data: ${JSON.stringify(f)}\n\n`);

// Single source of truth for which producer serves a run.
const resolveMode = (): RunMode =>
  !!process.env.ANTHROPIC_API_KEY && process.env.DUVO_MOCK !== "1"
    ? "real"
    : "mock";

// Lets the UI show a real/mock badge before a run starts.
export function GET() {
  return Response.json({ mode: resolveMode() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<RunConfig>;
  const config: RunConfig = {
    instruction: (body.instruction ?? "").trim(),
    useFilesystemMcp: Boolean(body.useFilesystemMcp),
  };

  const runId = `run_${Date.now().toString(36)}`;
  // Real Agent SDK producer when configured; otherwise the mock (demo never breaks).
  const frames =
    resolveMode() === "real" ? realRun(config, runId) : mockRun(config);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const f of frames) {
          if (req.signal.aborted) break;
          controller.enqueue(frame(f));
        }
      } catch (err) {
        controller.enqueue(
          frame({
            type: "event",
            event: {
              id: `err_${Date.now()}`,
              ts: Date.now(),
              kind: "message",
              title: "Run failed",
              detail: err instanceof Error ? err.message : String(err),
            },
          }),
        );
        controller.enqueue(
          frame({ type: "status", runId, status: "error" }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
