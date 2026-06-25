"use client";

import type { Artifact } from "@/lib/types";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ArtifactList({ artifacts }: { artifacts: Artifact[] }) {
  if (artifacts.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        Artifacts
      </h2>
      <ul className="space-y-2">
        {artifacts.map((a) => (
          <li
            key={a.name}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-zinc-100">
                  {a.name}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {formatSize(a.size)} · {a.mime}
                </p>
              </div>
              <a
                href={a.downloadUrl}
                download={a.name}
                className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                Download
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
