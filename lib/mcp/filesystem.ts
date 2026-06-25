import path from "node:path";

// The agent is restricted to this directory. The MCP filesystem server is
// launched with SANDBOX_DIR as its only allowed-directory argument, so the
// agent can never read or write outside it.
export const SANDBOX_DIR = path.join(process.cwd(), "_sandbox");

// Pin the filesystem server so the exposed tool set is deterministic and our
// allowlist below stays in sync with it. Recent versions renamed/added tools
// (e.g. `read_file` → `read_text_file`, plus `read_media_file`,
// `list_directory_with_sizes`, `list_allowed_directories`), so an unpinned
// `npx` fetch can drift away from a hardcoded per-tool allowlist and silently
// block the very tools the agent needs.
const FILESYSTEM_SERVER_PKG = "@modelcontextprotocol/server-filesystem@2026.1.14";

export interface FilesystemMcp {
  mcpServers: Record<string, unknown>;
  allowedTools: string[];
}

export function filesystemMcp(): FilesystemMcp {
  return {
    // Matches the Agent SDK's McpStdioServerConfig shape:
    // { type?: "stdio"; command: string; args?: string[]; env?: Record<string,string> }
    // The server is scoped to SANDBOX_DIR as its sole allowed directory.
    mcpServers: {
      filesystem: {
        type: "stdio",
        command: "npx",
        args: ["-y", FILESYSTEM_SERVER_PKG, SANDBOX_DIR],
      },
    },
    // Allow the WHOLE server via the SDK's server-level wildcard rather than an
    // enumerated per-tool list. The SDK names MCP tools `mcp__<server>__<tool>`
    // and supports `mcp__<server>__*` to allow every tool from that server.
    // This is mismatch-proof: a tool rename in a future server version can't
    // drop a tool out of the allowlist and "hide" it from the agent.
    allowedTools: ["mcp__filesystem__*"],
  };
}

// Guidance injected into the agent's system prompt so it knows WHERE its data
// lives and WHICH tools to use to reach it. Without this the agent defaults to
// its built-in Read/Write (which operate on the run workdir, not the sandbox)
// and reports it "can't find" files that actually live under SANDBOX_DIR.
export function filesystemSystemPrompt(): string {
  return [
    `A Filesystem MCP server is connected. It exposes EXACTLY this one directory and nothing outside it:`,
    `  ${SANDBOX_DIR}`,
    ``,
    `The user's data lives in that directory (for example, ${path.join(
      SANDBOX_DIR,
      "notes.md",
    )}).`,
    ``,
    `To read or write that data you MUST use the Filesystem MCP tools (named`,
    `mcp__filesystem__*), NOT the built-in Read/Write/Edit tools — those operate`,
    `on your working directory, not on the connected folder.`,
    ``,
    `Always use absolute paths under ${SANDBOX_DIR}. Before reading or writing,`,
    `discover what's there first: call mcp__filesystem__list_allowed_directories`,
    `and/or mcp__filesystem__list_directory, then read (mcp__filesystem__read_text_file)`,
    `or write (mcp__filesystem__write_file) the specific files you need.`,
  ].join("\n");
}
