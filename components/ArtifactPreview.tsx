"use client";

import { useEffect, useState } from "react";
import type { Artifact } from "@/lib/types";

const MAX_ROWS = 50;
const MAX_TEXT_CHARS = 8000;

type Preview =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "csv"; header: string[]; rows: string[][]; total: number }
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "unsupported" };

function isCsv(artifact: Artifact): boolean {
  return (
    artifact.mime.includes("csv") || artifact.name.toLowerCase().endsWith(".csv")
  );
}

function isTextLike(artifact: Artifact): boolean {
  const mime = artifact.mime.toLowerCase();
  if (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("yaml") ||
    mime.includes("markdown") ||
    mime.includes("javascript")
  ) {
    return true;
  }
  return /\.(txt|json|md|markdown|log|yaml|yml|xml|html|css|js|ts|tsv)$/i.test(
    artifact.name,
  );
}

// Parse a single CSV line, handling simple double-quoted fields with escaped
// quotes ("") and commas inside quotes.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

function parseCsv(text: string): { header: string[]; rows: string[][]; total: number } {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { header: [], rows: [], total: 0 };
  const header = parseCsvLine(lines[0]);
  const dataLines = lines.slice(1);
  const rows = dataLines.slice(0, MAX_ROWS).map(parseCsvLine);
  return { header, rows, total: dataLines.length };
}

export function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  const [preview, setPreview] = useState<Preview>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setPreview({ kind: "loading" });

    (async () => {
      try {
        const res = await fetch(artifact.downloadUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (cancelled) return;

        if (isCsv(artifact)) {
          const parsed = parseCsv(text);
          setPreview({ kind: "csv", ...parsed });
        } else if (isTextLike(artifact)) {
          const truncated = text.length > MAX_TEXT_CHARS;
          setPreview({
            kind: "text",
            text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
            truncated,
          });
        } else {
          setPreview({ kind: "unsupported" });
        }
      } catch {
        if (!cancelled) setPreview({ kind: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artifact]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      {preview.kind === "loading" && (
        <p className="animate-pulse font-mono text-xs text-zinc-500">
          Loading preview…
        </p>
      )}

      {preview.kind === "error" && (
        <p className="text-xs text-zinc-500">
          No preview available — use Download.
        </p>
      )}

      {preview.kind === "unsupported" && (
        <p className="text-xs text-zinc-500">
          Preview not available for this file type — use Download.
        </p>
      )}

      {preview.kind === "csv" && preview.header.length > 0 && (
        <div className="space-y-2">
          <div className="max-h-80 overflow-auto rounded-lg border border-zinc-800">
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead className="sticky top-0 bg-zinc-900">
                <tr>
                  {preview.header.map((h, i) => (
                    <th
                      key={i}
                      className="whitespace-nowrap border-b border-zinc-700 px-2.5 py-1.5 font-semibold text-zinc-200"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, r) => (
                  <tr
                    key={r}
                    className={r % 2 === 1 ? "bg-zinc-900/40" : undefined}
                  >
                    {preview.header.map((_, c) => (
                      <td
                        key={c}
                        className="whitespace-nowrap border-b border-zinc-800/60 px-2.5 py-1.5 text-zinc-400"
                      >
                        {row[c] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.total > preview.rows.length && (
            <p className="text-[11px] text-zinc-500">
              +{preview.total - preview.rows.length} more rows
            </p>
          )}
        </div>
      )}

      {preview.kind === "csv" && preview.header.length === 0 && (
        <p className="text-xs text-zinc-500">Empty file — nothing to preview.</p>
      )}

      {preview.kind === "text" && (
        <div className="space-y-2">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950/40 px-2.5 py-2 font-mono text-xs text-zinc-300">
            {preview.text}
          </pre>
          {preview.truncated && (
            <p className="text-[11px] text-zinc-500">
              Preview truncated — use Download for the full file.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
