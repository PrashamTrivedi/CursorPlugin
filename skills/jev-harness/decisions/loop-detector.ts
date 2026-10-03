// #6: the agent retrying the same failing approach. Evidence: 17/153 Cursor windows ≥0.7, top hits real
// (`wrangler d1 migrations apply` ×5). Code prefilter (repeated command shapes) before any Jev call.
// Claude Code / Cursor: record + judge after each shell command. Antigravity: record at PreToolUse, judge at PreInvocation.
import type { Decision } from "../core/decision.ts";
import { loadState, saveState } from "../core/store.ts";
import { clip, normalizeCommand, noul, tail } from "../core/text.ts";
import type { HookEvent } from "../core/types.ts";

interface Entry { command: string; description: string; outcome: string }
interface LoopState { history: Entry[]; total: number; lastFlagAt: number }
const WINDOW = 6;

function recordCommand(e: HookEvent): LoopState {
  const s = loadState<LoopState>(e.sessionId, { history: [], total: 0, lastFlagAt: -99 });
  const t = e.tool!;
  s.history = [...s.history, {
    command: clip(t.command, 300),
    description: t.description ?? "",
    outcome: t.error ? `failed: ${tail(t.error, 300)}` : t.output !== undefined ? tail(t.output, 300) : "",
  }].slice(-WINDOW);
  s.total += 1;
  saveState(e.sessionId, s);
  return s;
}

function repeated(history: Entry[]): boolean {
  const counts = new Map<string, number>();
  for (const h of history) {
    const k = normalizeCommand(h.command).slice(0, 60);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values()) >= 3;
}

export const loopDetector: Decision = {
  name: "loop-detector",
  safety: false,
  applies(e) {
    const shell = e.tool?.kind === "shell" && !!e.tool.command;
    if (e.agent === "antigravity") return (e.kind === "pre_tool" && shell) || e.kind === "pre_invocation";
    return (e.kind === "post_tool" || e.kind === "tool_failure") && shell;
  },
  async run(e, ctx) {
    let s: LoopState;
    if (e.agent === "antigravity" && e.kind === "pre_tool") { recordCommand(e); return null; }
    if (e.kind === "pre_invocation") s = loadState<LoopState>(e.sessionId, { history: [], total: 0, lastFlagAt: -99 });
    else s = recordCommand(e);

    if (s.history.length < 4 || s.total - s.lastFlagAt < 4 || !repeated(s.history)) return null;
    const a = await ctx.ask({ consecutive_commands: s.history }, {
      looping: { type: "noul", instructions: "Do `consecutive_commands` show the agent retrying near-identical commands for the same goal (stuck on one failing approach) rather than making progress through different steps?" },
    });
    const p = noul(a, "looping");
    if (p < ctx.threshold("looping", 0.75)) return { verdict: { action: "none" }, signals: { looping: p } };
    s.lastFlagAt = s.total;
    saveState(e.sessionId, s);
    return {
      verdict: { action: "context", text: `jev-harness: your last ${s.history.length} commands look like retries of the same approach (p=${p.toFixed(2)}). Stop and re-read the actual error, check your assumptions, or try a different approach.` },
      signals: { looping: p },
    };
  },
};
