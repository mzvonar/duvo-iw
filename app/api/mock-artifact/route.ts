// MOCK artifact download for Phase 1. Returns a sample CSV so the download
// button works end-to-end. Phase 2 serves real per-run files instead.

export const runtime = "nodejs";

const SAMPLE_CSV = `title,source,published,url,summary
"OpenAI announces new reasoning model","techcrunch.com","2026-06-23","https://example.com/a","A faster model aimed at agentic workflows."
"Anthropic expands enterprise agent platform","theverge.com","2026-06-24","https://example.com/b","New tooling for building and observing agents."
"Google DeepMind publishes robotics breakthrough","arstechnica.com","2026-06-22","https://example.com/c","A generalist policy for manipulation tasks."
"EU finalizes AI transparency rules","venturebeat.com","2026-06-25","https://example.com/d","Disclosure requirements for generative systems."
"Startup raises $200M for agent infrastructure","techcrunch.com","2026-06-21","https://example.com/e",""
`;

export async function GET(req: Request) {
  const name =
    new URL(req.url).searchParams.get("name")?.replace(/[^\w.-]/g, "") ||
    "artifact.csv";
  return new Response(SAMPLE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
