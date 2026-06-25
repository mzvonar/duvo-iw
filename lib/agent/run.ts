// REAL producer for Phase 2 — driven by the Claude Agent SDK `query()`.
// Emits the same RunFrame contract as the mock producer so the SSE route and
// UI are unchanged. Host-direct: the agent runs against a per-run workdir on
// the local filesystem (no sandbox abstraction — deferred).

import { promises as fs } from "node:fs";
import path from "node:path";

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";

import { filesystemMcp, filesystemSystemPrompt } from "@/lib/mcp/filesystem";
import { judgeArtifact } from "@/lib/eval/judge";
import type { RunConfig, RunFrame } from "@/lib/types";

let seq = 0;
const nextId = () => `evt_${Date.now().toString(36)}_${(seq++).toString(36)}`;

const event = (
  e: Omit<Extract<RunFrame, { type: "event" }>["event"], "id" | "ts">,
): RunFrame => ({
  type: "event",
  event: { id: nextId(), ts: Date.now(), ...e },
});

const sourceOf = (toolName: string) =>
  toolName.startsWith("mcp__") ? "mcp" : "agent";

// Compact, readable JSON of a tool input for the `detail` field.
function compactJson(input: unknown, max = 600): string {
  let s: string;
  try {
    s = JSON.stringify(input);
  } catch {
    s = String(input);
  }
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

const MIME_BY_EXT: Record<string, string> = {
  ".csv": "text/csv",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".tsv": "text/tab-separated-values",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
};

const mimeFor = (name: string) =>
  MIME_BY_EXT[path.extname(name).toLowerCase()] ?? "application/octet-stream";

const TEXT_EXTS = new Set([
  ".csv",
  ".json",
  ".txt",
  ".md",
  ".html",
  ".xml",
  ".tsv",
  ".yaml",
  ".yml",
]);

// Defensive narrowing helpers over the SDK's content-block shapes. We only
// read the few fields we map; everything else in the (large) union is ignored.
function blockType(b: unknown): string | undefined {
  if (b && typeof b === "object" && "type" in b) {
    const t = (b as { type: unknown }).type;
    return typeof t === "string" ? t : undefined;
  }
  return undefined;
}

function str(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

function field(obj: unknown, key: string): unknown {
  if (obj && typeof obj === "object" && key in obj) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

// Top-level regular files in the output dir (skips dotfiles and directories).
async function listArtifacts(
  outDir: string,
): Promise<Array<{ name: string; size: number }>> {
  let entries;
  try {
    entries = await fs.readdir(outDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Array<{ name: string; size: number }> = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (ent.name.startsWith(".")) continue;
    try {
      const stat = await fs.stat(path.join(outDir, ent.name));
      out.push({ name: ent.name, size: stat.size });
    } catch {
      // ignore unreadable entries
    }
  }
  return out;
}

export async function* realRun(
  config: RunConfig,
  runId: string,
): AsyncGenerator<RunFrame> {
  // Absolute output dir we scan for deliverables and the download route serves.
  const outDir = path.join(process.cwd(), ".runs", runId);

  try {
    await fs.mkdir(outDir, { recursive: true });

    yield { type: "status", runId, status: "running" };

    let allowedTools = [
      "WebSearch",
      "WebFetch",
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
    ];
    let mcpServers: Record<string, unknown> = {};

    if (config.useFilesystemMcp) {
      const fsMcp = filesystemMcp();
      mcpServers = { ...mcpServers, ...fsMcp.mcpServers };
      allowedTools = [...allowedTools, ...fsMcp.allowedTools];
    }

    // Steer the agent to write every deliverable into the dir we scan. `cwd`
    // (below) sets the session's working directory, but the SDK does not
    // guarantee the Write/Bash tools resolve relative paths there — so we state
    // the ABSOLUTE output dir in the system prompt as the source of truth.
    const outputDirInstruction = [
      "OUTPUT DIRECTORY CONTRACT (mandatory):",
      `Save every deliverable file DIRECTLY into this absolute directory: ${outDir}`,
      "Write files at the top level of that directory only — do NOT create subfolders for deliverables.",
      "Do NOT write deliverables anywhere else (not the project root, not /tmp, not your cwd by relative path).",
      "Always use the full absolute path above when creating, writing, or saving output files.",
    ].join("\n");

    const appendPrompt = config.useFilesystemMcp
      ? `${outputDirInstruction}\n\n${filesystemSystemPrompt()}`
      : outputDirInstruction;

    const options: Options = {
      cwd: outDir,
      model: "claude-sonnet-4-6",
      permissionMode: "acceptEdits",
      allowedTools,
      // Keep the Claude Code default agent prompt/tools, append our steering.
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: appendPrompt,
      },
      // McpServerConfig is a union; we build a plain map and cast at the edge.
      mcpServers: mcpServers as Options["mcpServers"],
    };

    for await (const message of query({
      prompt: config.instruction,
      options,
    })) {
      if (message.type === "assistant") {
        const content = field(message.message, "content");
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          const t = blockType(block);
          if (t === "text") {
            const text = str(block, "text");
            if (text && text.trim()) {
              yield event({
                kind: "thinking",
                source: "agent",
                title: "Agent",
                detail: text.trim(),
              });
            }
          } else if (t === "thinking") {
            const thinking = str(block, "thinking");
            if (thinking && thinking.trim()) {
              yield event({
                kind: "thinking",
                source: "agent",
                title: "Thinking",
                detail: thinking.trim(),
              });
            }
          } else if (t === "tool_use" || t === "mcp_tool_use") {
            const name = str(block, "name") ?? "tool";
            yield event({
              kind: "tool_call",
              source: sourceOf(name),
              toolName: name,
              title: `Calling ${name}`,
              detail: compactJson(field(block, "input")),
            });
          }
        }
      } else if (message.type === "user") {
        // Tool results arrive back as tool_result blocks in a user message.
        const content = field(message.message, "content");
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          if (blockType(block) !== "tool_result") continue;
          const resultContent = field(block, "content");
          let detail: string;
          if (typeof resultContent === "string") {
            detail = resultContent;
          } else if (Array.isArray(resultContent)) {
            detail = resultContent
              .map((part) => str(part, "text") ?? "")
              .filter(Boolean)
              .join("\n");
          } else {
            detail = compactJson(resultContent);
          }
          const isError = field(block, "is_error") === true;
          yield event({
            kind: "tool_result",
            source: "agent",
            title: isError ? "Tool error" : "Tool result",
            detail: detail
              ? detail.length > 1200
                ? `${detail.slice(0, 1200)}…`
                : detail
              : undefined,
          });
        }
      }
      // All other SDK message types (system, result, status, etc.) are ignored.
    }

    // After the stream ends, surface the files now present in the output dir.
    // The directory scan is the source of truth for artifact capture.
    const artifacts = await listArtifacts(outDir);
    for (const a of artifacts) {
      yield {
        type: "artifact",
        artifact: {
          name: a.name,
          size: a.size,
          mime: mimeFor(a.name),
          downloadUrl: `/api/runs/${runId}/files/${encodeURIComponent(a.name)}`,
        },
      };
    }

    // Evaluation via LLM judge over the primary text artifact (best-effort).
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const primary =
          artifacts.find((a) =>
            TEXT_EXTS.has(path.extname(a.name).toLowerCase()),
          ) ?? artifacts[0];
        if (primary) {
          const artifactText = await fs.readFile(
            path.join(outDir, primary.name),
            "utf8",
          );
          const result = await judgeArtifact({
            instruction: config.instruction,
            artifactName: primary.name,
            artifactText,
          });
          yield { type: "eval", result };
        }
      } catch (err) {
        // Eval failures must never kill the run.
        yield event({
          kind: "message",
          title: "Evaluation skipped",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    yield { type: "status", runId, status: "completed" };
  } catch (err) {
    yield event({
      kind: "message",
      title: "Run failed",
      detail: err instanceof Error ? err.message : String(err),
    });
    yield { type: "status", runId, status: "error" };
  }
}
