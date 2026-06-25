# Duvo — Agentic Automation Platform (POC) · Build Plan

> Living tracker. We clear context between phases — **this file is the source of truth.**
> When resuming: read this top-to-bottom, check the unchecked boxes in the current phase.

## Product (the 5 steps from the brief)

1. Send one set of instructions to an agentic system, get a response.
2. Do something useful: "Fetch the latest AI news from the web and save into a CSV"; user can download the output file.
3. Observable automation: a view to watch it unfold step-by-step; derive the key state at any point.
4. Connect your data: an MCP server the agent uses, with a clear enable/disable toggle.
5. Evaluate the job: automatic success/fail evaluation of an artifact.

## Locked decisions

- **Stack:** Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript. Project at repo **root**. pnpm. Node 22.
- **Agent:** `@anthropic-ai/claude-agent-sdk` `query()` (installed). **Eval:** `@anthropic-ai/sdk` structured output (installed).
- **Model:** Claude **Sonnet 4.6** (`claude-sonnet-4-6`) for both agent and evaluator.
- **MCP for Step 4:** **Filesystem MCP**, gated by a UI toggle.
- **Transport:** SSE from a Node-runtime route. Producer emits `RunFrame`s (see `lib/types.ts`).
- **State:** in-memory (POC, no DB). Artifacts in `.runs/<id>/`.
- **Execution backend: DEFERRED, behind a port (hexagonal / ports-and-adapters).** For now the
  Next.js host *is* the sandbox — agent code runs on this machine. But all machine-touching work goes
  through an `ExecutionEnvironment` port; only the concrete adapter changes when we move to a real
  sandbox (E2B / Managed Agents / Docker+gVisor / etc.). See Phase 2 for the interface.
- **Principles:** working features, good UX, functional/composition, no overengineering, **no tests**.

## Architecture / key seam

The UI only depends on the **`RunFrame` SSE contract** (`lib/types.ts`). Phase 1 feeds it from a
**mock producer**; Phases 2–3 swap in the real agent/MCP/eval **without touching the UI**.

```
React (useRun) ──POST /api/run──▶ route streams RunFrames (SSE)
                                     └─ Phase 1: lib/mock/run.ts   ← swap point
                                        Phase 2: Agent SDK query()
```

---

## Phase 1 — Foundation + mocked UX (testable end-to-end) ◀ CURRENT

- [x] Move app to repo root; pnpm; deps installed (agent SDK + anthropic SDK)
- [x] `.gitignore` (node_modules, .next, .env*.local, .runs/)
- [x] `lib/types.ts` — RunEvent / RunFrame / Artifact / EvalResult / RunConfig contract
- [x] `lib/keyState.ts` — pure `deriveKeyState(events, status)` (Step 3)
- [x] `lib/mock/run.ts` — mock producer (plan → web search → write CSV → artifact → eval; MCP steps when toggled)
- [x] `app/api/run/route.ts` — SSE endpoint (mock-driven; swap seam marked)
- [x] `app/api/mock-artifact/route.ts` — sample CSV download
- [x] `lib/useRun.ts` — client hook: POST + SSE parse + accumulating state
- [x] `components/KeyStateBar.tsx` — live key-state summary (Step 3)
- [x] `components/StepTimeline.tsx` — streaming step view; MCP steps visibly tagged
- [x] `components/ArtifactList.tsx` — artifact cards + download
- [x] `components/EvalPanel.tsx` — verdict / score / criteria
- [x] `components/RunConsole.tsx` — orchestrator: instruction box, MCP toggle, run/stop, layout, elapsed timer
- [x] `app/page.tsx` — render `<RunConsole/>`
- [x] `app/layout.tsx` — metadata (title/description)
- [x] `app/globals.css` — deliberate dark theme
- [x] Typecheck/build clean (`pnpm exec tsc --noEmit` / `pnpm build` — both pass)
- [ ] Manual UX check: `pnpm dev` → run, watch timeline, toggle MCP, download CSV, see eval ◀ YOUR TURN

**Phase 1 exit:** the full interaction works against the mock; UX approved by user.

---

## Phase 1.5 — Main-pane artifacts (UI, mock-compatible) ✅ done

- [x] `components/ArtifactPreview.tsx` — fetch artifact content and preview it (CSV → table, other text → `<pre>`)
- [x] Surface artifacts in the **main pane** after completion: clickable download + inline preview
- [x] Typecheck clean

---

## Phase 2 — Real agent (Steps 1 + 2)

**Capability model (decided):** do NOT hardcode a fixed capability set. The agent gets a *general*
tool surface (bash + file ops + on-demand package install) and self-installs what a task needs
(pdf, ffmpeg, etc.). That power is only safe inside a sandbox — hence the execution port below.
A curated base image (pre-baked ffmpeg/pandoc/chromium/common pkgs) is a future *performance* layer,
not the capability ceiling.

### Execution sandbox port — ⏸ DEFERRED (build later)

> Deferred per decision: run **host-direct** for now (agent works in a per-run dir on this machine).
> The ports-and-adapters seam below — so a real sandbox is a one-adapter swap — comes later, when we
> harden for untrusted execution. Interface sketch kept here for that future work, **not built now.**

```ts
// lib/exec/types.ts
export interface ExecResult { stdout: string; stderr: string; code: number }
export interface OutputFile { name: string; size: number; mime: string }

export interface Sandbox {
  readonly id: string;
  readonly workdir: string;                              // where the agent operates
  exec(command: string, signal?: AbortSignal): Promise<ExecResult>;
  writeFile(rel: string, data: Uint8Array | string): Promise<void>;
  readFile(rel: string): Promise<Uint8Array>;
  listOutputs(): Promise<OutputFile[]>;                  // files under the run's output dir
  dispose(): Promise<void>;
}
export interface ExecutionEnvironment {                  // ◀ THE PORT
  create(runId: string): Promise<Sandbox>;
}
```

- [ ] _(deferred)_ `lib/exec/types.ts` + `lib/exec/local.ts` — the port & local adapter
- [ ] _(deferred)_ bind agent tools to the `Sandbox` instead of the SDK's host bash

**Now (host-direct, no port) — built, typechecks; needs live key to verify:**
- [x] `lib/agent/run.ts` — `realRun(config, runId)` via Agent SDK `query()` (model `claude-sonnet-4-6`), `cwd = .runs/<runId>`, built-in tools (WebSearch/WebFetch/Read/Write/Edit/Bash), `permissionMode: acceptEdits`; merges filesystem MCP when toggled
- [x] Map SDK messages → `RunFrame`s (assistant text→thinking, tool_use→tool_call with `source:"mcp"` when name starts `mcp__`, tool_result→tool_result); collects files from `.runs/<runId>/` → artifact frames; calls eval judge → eval frame
- [x] Env-gate in `app/api/run/route.ts`: uses `realRun` when `ANTHROPIC_API_KEY` set (and `DUVO_MOCK !== "1"`), else `mockRun` (demo never breaks)
- [x] Artifact route `app/api/runs/[id]/files/[name]/route.ts` — serves from `.runs/<id>/` (path-sanitized)
- [ ] ▶ Verify with a key: "fetch latest AI news → CSV → download" works against the live API
- [ ] ▶ Smoke-test generality: a non-CSV ask (e.g. "make a PDF") triggers on-demand install + still produces a downloadable artifact

## Phase 3 — Filesystem MCP (Step 4) + real eval (Step 5)

- [x] Wire Filesystem MCP server into agent options, gated by `useFilesystemMcp` (`lib/mcp/filesystem.ts`, merged in `realRun`)
- [x] Seed `_sandbox/` with a dummy markdown file (`_sandbox/notes.md`) the user can prompt the agent to operate on
- [x] **Scope the Filesystem MCP to `_sandbox/` ONLY** — stdio `@modelcontextprotocol/server-filesystem` given `SANDBOX_DIR` as its sole allowed dir
- [x] MCP tool calls tagged `source: "mcp"` (timeline shows amber MCP badge) — [ ] ▶ runtime confirm trajectory change (needs key)
- [x] `lib/eval/judge.ts` — LLM-as-judge via `@anthropic-ai/sdk` structured output (`output_config.format`, model sonnet-4-6) → `EvalResult`
- [x] Eval emitted inline at end of `realRun` (no separate route needed)
- [x] Real eval active when key present; mock eval retained for the keyless demo path

## Phase 4 — Polish

- [ ] Error/empty/loading states, transitions, copy
- [ ] README run instructions; final UX pass

---

## Resume notes / context for next session

- Path alias `@/*` → `./*`.
- The mock and real producers MUST emit identical `RunFrame` shapes — that's the whole point of the seam.
- MCP steps are distinguished by `RunEvent.source === "mcp"` (timeline tags them).
- Multi-agent: build work is delegated to subagents to conserve orchestrator context.
