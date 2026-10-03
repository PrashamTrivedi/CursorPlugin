// Runtime home, per-decision modes, thresholds, and the API key lookup.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Mode = "off" | "shadow" | "enforce";

export interface DecisionConfig {
  mode?: Mode;
  thresholds?: Record<string, number>;
  [k: string]: unknown;
}

export interface HarnessConfig {
  timeoutMs: number;        // whole-hook budget for Jev work; stays well under every agent's hook timeout
  model: string;
  defaultMode: Mode;
  decisions: Record<string, DecisionConfig>;
  memoryServer?: { url: string };
}

export const home = () => process.env.JEV_HARNESS_HOME ?? join(homedir(), ".jev-harness");

const DEFAULTS: HarnessConfig = {
  timeoutMs: 4000,
  model: "jev-latest",
  defaultMode: "shadow",
  decisions: {},
  memoryServer: { url: "https://memories-api.prashamhtrivedi.app/api" },
};

let cached: HarnessConfig | null = null;

export function loadConfig(): HarnessConfig {
  if (cached) return cached;
  const file = join(home(), "config.json");
  let user: Partial<HarnessConfig> = {};
  if (existsSync(file)) {
    try { user = JSON.parse(readFileSync(file, "utf8")); } catch { /* bad config falls back to defaults */ }
  }
  cached = { ...DEFAULTS, ...user, decisions: { ...DEFAULTS.decisions, ...(user.decisions ?? {}) } };
  return cached;
}

export function resetConfigCache() { cached = null; }

export function decisionMode(name: string): Mode {
  const c = loadConfig();
  return c.decisions[name]?.mode ?? c.defaultMode;
}

export function threshold(name: string, key: string, fallback: number): number {
  const v = loadConfig().decisions[name]?.thresholds?.[key];
  return typeof v === "number" ? v : fallback;
}

export function decisionSetting<T>(name: string, key: string, fallback: T): T {
  const v = loadConfig().decisions[name]?.[key];
  return v === undefined ? fallback : (v as T);
}

/** Env first, then `~/.jev-harness/credentials` (KEY=value lines, written by install.ts with mode 600). */
export function secret(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const file = join(home(), "credentials");
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === name) return m[2];
  }
  return undefined;
}
