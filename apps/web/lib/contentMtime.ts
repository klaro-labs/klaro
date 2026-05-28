import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Returns the most recent commit date for a path under `apps/web/`, ISO-8601.
 * Falls back to file mtime when git is unavailable (e.g. some build sandboxes)
 * and to `null` when the path doesn't exist. Server-side only.
 */
export function getLastUpdated(relPath: string): string | null {
  const abs = path.join(process.cwd(), relPath);
  if (!existsSync(abs)) return null;

  try {
    const iso = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", relPath],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "ignore"],
      },
    )
      .toString()
      .trim();
    if (iso) return iso;
  } catch {
    // git not available — fall through to fs mtime.
  }

  try {
    return statSync(abs).mtime.toISOString();
  } catch {
    return null;
  }
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
