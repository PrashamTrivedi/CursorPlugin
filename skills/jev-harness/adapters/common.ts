// Shared hook runner: stdin JSON in, exactly one valid stdout payload out, always exit 0.
// Antigravity turns any malformed hook output into a failed tool call and Cursor blocks on malformed permission
// output, so every path — exception, timeout, bad input — must end in the adapter's neutral payload.
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readdirSync, statSync, unlinkSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { home, loadConfig } from "../core/config.ts";
import { merge, runEvent } from "../core/engine.ts";
import { DECISIONS } from "../decisions/index.ts";
import type { HookEvent, Verdict } from "../core/types.ts";

export type Merged = ReturnType<typeof merge>;

export interface Adapter {
  /** Payload that changes nothing for this event. Must be valid for the agent even when `raw` is garbage. */
  neutral(event: string, raw: any): string;
  normalize(event: string, raw: any): HookEvent | null;
  supports(event: string, v: Verdict): boolean;
  render(event: string, m: Merged, e: HookEvent, raw: any): string;
  /** Optional side effect for observational events (e.g. stash text). Returns the payload to print. */
  observe?(event: string, raw: any): string | null;
}

export async function runAdapter(adapter: Adapter, eventArg?: string): Promise<void> {
  let raw: any = {};
  let text = "";
  let event = eventArg ?? "";
  let done = false;
  const finish = (s: string) => {
    if (done) return;
    done = true;
    process.stdout.write(s);
    process.exit(0);
  };
  const budget = loadConfig().timeoutMs;
  setTimeout(() => finish(safeNeutral(adapter, event, raw)), budget + 1500).unref?.();
  try {
    text = await Bun.stdin.text();
    raw = text.trim() ? JSON.parse(text) : {};
    event = eventArg ?? raw.hook_event_name ?? raw.hookEventName ?? "";
    const observed = adapter.observe?.(event, raw);
    if (observed !== null && observed !== undefined) return finish(observed);
    const e = adapter.normalize(event, raw);
    if (!e) return finish(safeNeutral(adapter, event, raw));
    // Cursor loads the plugin's hooks.json AND the copy in ~/.cursor/hooks.json, so one event can arrive twice.
    if (!firstDelivery(`${event}\n${text}`)) return finish(safeNeutral(adapter, event, raw));
    const { verdicts } = await runEvent(e, DECISIONS, {
      deadline: Date.now() + budget,
      supports: (v) => adapter.supports(event, v),
    });
    if (!verdicts.length) return finish(safeNeutral(adapter, event, raw));
    finish(adapter.render(event, merge(verdicts.map((v) => v.verdict)), e, raw));
  } catch (err) {
    process.stderr.write(`jev-harness: ${String(err)}\n`);
    finish(safeNeutral(adapter, event, raw));
  }
}

/** Atomic first-writer-wins marker per identical payload; a duplicate within 30 s stays neutral. */
function firstDelivery(payload: string): boolean {
  try {
    const dir = join(home(), "state", "dedupe");
    mkdirSync(dir, { recursive: true });
    const marker = join(dir, createHash("sha1").update(payload).digest("hex"));
    try {
      closeSync(openSync(marker, "wx"));
      if (Math.random() < 0.02) sweep(dir);
      return true;
    } catch {
      return Date.now() - statSync(marker).mtimeMs > 30_000 && (utimesSync(marker, new Date(), new Date()), true);
    }
  } catch { return true; } // dedupe is best effort; never suppress a decision because of it
}

function sweep(dir: string) {
  const cutoff = Date.now() - 3_600_000;
  for (const f of readdirSync(dir)) {
    try { if (statSync(join(dir, f)).mtimeMs < cutoff) unlinkSync(join(dir, f)); } catch { /* raced */ }
  }
}

function safeNeutral(a: Adapter, event: string, raw: any): string {
  try { return a.neutral(event, raw); } catch { return ""; }
}

/** Antigravity transcripts store some argument values JSON-encoded ("\"npm test\""); hook payloads may too. */
export function decodeArg(v: unknown): any {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (!/^["[{]/.test(s) && s !== "true" && s !== "false") return v;
  try { return JSON.parse(s); } catch { return v; }
}

export function flattenOutput(r: unknown): string {
  if (r === undefined || r === null) return "";
  if (typeof r === "string") {
    try { return flattenOutput(JSON.parse(r)); } catch { return r; }
  }
  if (Array.isArray(r)) return r.map((b: any) => (typeof b === "string" ? b : b?.text ?? JSON.stringify(b))).join("\n");
  const o = r as any;
  if (Array.isArray(o.content)) return flattenOutput(o.content);
  if ("stdout" in o || "stderr" in o) return [o.stdout, o.stderr].filter(Boolean).join("\n");
  if (typeof o.output === "string") return o.output;
  if (typeof o.text === "string") return o.text;
  return JSON.stringify(o);
}
