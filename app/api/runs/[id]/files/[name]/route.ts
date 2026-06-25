// Serves a single file produced by a run from its per-run workdir.
// Path-safety: the resolved file must stay within the run's .runs/<id> dir.

import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  const { id, name } = await params;

  const runDir = path.join(process.cwd(), ".runs", id);
  const resolved = path.resolve(runDir, name);

  // Reject path traversal: resolved must stay within runDir.
  const rel = path.relative(runDir, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return new Response("Bad request", { status: 400 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(resolved);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const filename = path.basename(resolved);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeFor(filename),
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
