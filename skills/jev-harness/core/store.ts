// Tiny per-session state (shell history for the loop detector, stashed final text for Cursor's stop hook).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { home } from "./config.ts";

const file = (sessionId: string) => join(home(), "state", `${sessionId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);

export function loadState<T extends object>(sessionId: string, fallback: T): T {
  try {
    const f = file(sessionId);
    return existsSync(f) ? { ...fallback, ...JSON.parse(readFileSync(f, "utf8")) } : fallback;
  } catch { return fallback; }
}

export function saveState(sessionId: string, state: object): void {
  try {
    mkdirSync(join(home(), "state"), { recursive: true });
    writeFileSync(file(sessionId), JSON.stringify(state));
  } catch { /* state is best effort */ }
}
