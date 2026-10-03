// #8: before a memory is saved, check BOTH stores — local memory files (+ rules, global CLAUDE.md) and memory-server —
// for a duplicate or a contradiction. Evidence: 11/11 correct at 0.5 once rules were in the existing set.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { secret, loadConfig } from "../core/config.ts";
import type { Decision } from "../core/decision.ts";
import { choiceOf, clip, noul } from "../core/text.ts";
import type { HookEvent } from "../core/types.ts";

const MEMORY_FILE = /\/memory\/[^/]+\.md$/;
const MEMORY_TOOL = /^(add_memory|update_memory)$/;

function candidate(e: HookEvent): string {
  const t = e.tool!;
  if (t.kind === "mcp") {
    const a = t.mcpArgs ?? {};
    return [a.name, a.title, a.content, a.text, a.memory, a.description].filter((x) => typeof x === "string").join("\n");
  }
  return t.content ?? "";
}

const strip = (s: string) => s.replace(/^---[\s\S]*?---\s*/, "");

function localStores(e: HookEvent): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (key: string, path: string) => { try { out[key] = clip(strip(readFileSync(path, "utf8")), 2500); } catch { /* unreadable */ } };
  const t = e.tool!;
  const memDir = t.path && MEMORY_FILE.test(t.path)
    ? dirname(t.path)
    : join(homedir(), ".claude", "projects", e.cwd.replace(/[^a-zA-Z0-9]/g, "-"), "memory");
  if (existsSync(memDir)) for (const f of readdirSync(memDir)) {
    if (f.endsWith(".md") && f !== "MEMORY.md" && join(memDir, f) !== t.path) add(`memory:${f}`, join(memDir, f));
  }
  const rules = join(homedir(), ".claude", "rules");
  if (existsSync(rules)) for (const f of readdirSync(rules)) if (f.endsWith(".md")) add(`rule:${f}`, join(rules, f));
  add("global CLAUDE.md", join(homedir(), ".claude", "CLAUDE.md"));
  return out;
}

async function serverStore(query: string): Promise<{ items: Record<string, string>; checked: boolean }> {
  const key = secret("MEMORY_SERVER_API_KEY");
  const base = loadConfig().memoryServer?.url;
  if (!key || !base) return { items: {}, checked: false };
  const url = `${base.replace(/\/$/, "")}/memories/search?query=${encodeURIComponent(query.slice(0, 200))}&limit=8`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2000) });
  if (!res.ok) return { items: {}, checked: false };
  const data: any = await res.json();
  const list: any[] = data.memories ?? data.results ?? data.data ?? (Array.isArray(data) ? data : []);
  const items: Record<string, string> = {};
  for (const m of list) items[`server:${m.name ?? m.title ?? m.id}`] = clip(String(m.content ?? m.text ?? ""), 2500);
  return { items, checked: true };
}

export const memoryHygiene: Decision = {
  name: "memory-hygiene",
  safety: false,
  applies(e) {
    const t = e.tool;
    if (e.kind !== "pre_tool" || !t) return false;
    if ((t.kind === "write" || t.kind === "edit") && t.path && MEMORY_FILE.test(t.path) && basename(t.path) !== "MEMORY.md") return true;
    return t.kind === "mcp" && /memor/i.test(t.mcpServer ?? "") && MEMORY_TOOL.test(t.mcpTool ?? "");
  },
  async run(e, ctx) {
    const cand = candidate(e).trim();
    if (cand.length < 20) return null;
    const server = await serverStore(cand).catch(() => ({ items: {}, checked: false }));
    const existing = { ...localStores(e), ...server.items };
    const names = Object.keys(existing);
    if (!names.length) return null;
    const a = await ctx.ask({ candidate: clip(strip(cand), 4000), existing_memories: existing }, {
      duplicate: { type: "noul", instructions: "Is the guidance in `candidate` already covered by one of `existing_memories` (same rule or fact, possibly reworded)?" },
      conflict: { type: "noul", instructions: "Does `candidate` contradict guidance in any of `existing_memories`?" },
      closest: { type: "choice", instructions: "Which entry in `existing_memories` overlaps most with `candidate`?", criteria: { ...Object.fromEntries(names.slice(0, 250).map((n) => [n, null])), none: "No entry overlaps" } },
    });
    const dup = noul(a, "duplicate"), conflict = noul(a, "conflict"), closest = choiceOf(a, "closest");
    const signals = { dup, conflict, closest, serverChecked: server.checked };
    const which = closest && closest.choice !== "none" ? ` (closest: ${closest.choice})` : "";
    const stores = server.checked ? "local memories and memory-server" : "local memories (memory-server not checked: set MEMORY_SERVER_API_KEY)";
    if (conflict >= ctx.threshold("conflict", 0.8))
      return { verdict: { action: "ask", reason: `jev-harness: this memory may contradict an existing one${which} (p=${conflict.toFixed(2)}), checked ${stores}.` }, signals };
    if (dup >= ctx.threshold("duplicate", 0.8))
      return { verdict: { action: "ask", reason: `jev-harness: this memory looks already covered${which} (p=${dup.toFixed(2)}), checked ${stores}. Update the existing one instead?` }, signals };
    return { verdict: { action: "none" }, signals };
  },
};
