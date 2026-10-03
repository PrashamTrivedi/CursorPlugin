// Runs the applicable decisions for one event, applies modes and fail policy, logs, and merges verdicts.
import { ask as defaultAsk, type AskFn } from "./client.ts";
import { decisionMode, decisionSetting, loadConfig, threshold } from "./config.ts";
import type { Ctx, Decision } from "./decision.ts";
import { record } from "./ledger.ts";
import { compactSignals } from "./text.ts";
import type { HookEvent, Verdict } from "./types.ts";

export interface EngineResult {
  verdicts: { decision: string; verdict: Verdict }[]; // enforce-mode verdicts only
}

export interface EngineDeps {
  ask?: AskFn;
  deadline?: number;
  /** Actions this agent+event can express; anything else is logged as not applied. */
  supports: (v: Verdict) => boolean;
}

export async function runEvent(e: HookEvent, decisions: Decision[], deps: EngineDeps): Promise<EngineResult> {
  const askFn = deps.ask ?? defaultAsk;
  const deadline = deps.deadline ?? Date.now() + loadConfig().timeoutMs;
  const active = decisions.filter((d) => decisionMode(d.name) !== "off" && safeApplies(d, e));

  const results = await Promise.all(active.map(async (d) => {
    const mode = decisionMode(d.name);
    let calls = 0, inputTokens = 0;
    const started = Date.now();
    const ctx: Ctx = {
      ask: async (state, questions) => {
        const r = await askFn(state, questions, { deadline, meta: { agent: e.agent, event: e.kind, decision: d.name, mode, sessionId: e.sessionId, tool: e.tool?.name } });
        calls++;
        inputTokens += r.inputTokens;
        return r.answers;
      },
      threshold: (k, f) => threshold(d.name, k, f),
      setting: (k, f) => decisionSetting(d.name, k, f),
    };
    const base = { agent: e.agent, event: e.kind, tool: e.tool?.name, decision: d.name, mode };
    try {
      const out = await d.run(e, ctx);
      if (!out) return null;
      const expressible = out.verdict.action === "none" || deps.supports(out.verdict);
      const applied = mode === "enforce" && out.verdict.action !== "none" && expressible;
      record({
        ...base, verdict: out.verdict.action + (expressible ? "" : " (unsupported here)"), applied,
        calls, inputTokens, ms: Date.now() - started,
        signals: out.signals ? compactSignals(out.signals) : undefined, detail: out.detail,
      });
      return applied ? { decision: d.name, verdict: out.verdict } : null;
    } catch (err: any) {
      const fallback: Verdict = d.safety
        ? { action: "ask", reason: `jev-harness ${d.name} could not decide (${err?.message ?? err}); confirm manually.` }
        : { action: "none" };
      const applied = mode === "enforce" && fallback.action !== "none" && deps.supports(fallback);
      record({ ...base, verdict: fallback.action, applied, calls, inputTokens, ms: Date.now() - started, error: String(err?.message ?? err) });
      return applied ? { decision: d.name, verdict: fallback } : null;
    }
  }));

  return { verdicts: results.filter((r): r is { decision: string; verdict: Verdict } => r !== null) };
}

function safeApplies(d: Decision, e: HookEvent): boolean {
  try { return d.applies(e); } catch { return false; }
}

const RANK: Record<Verdict["action"], number> = {
  deny: 0, ask: 1, rewrite: 2, replace_output: 3, continue: 4, context: 5, notify: 6, none: 7,
};

/** One verdict per kind of effect: the strongest gate wins; context and notices are concatenated. */
export function merge(verdicts: Verdict[]): {
  gate?: Extract<Verdict, { action: "deny" | "ask" }>;
  rewrite?: Extract<Verdict, { action: "rewrite" }>;
  replace?: Extract<Verdict, { action: "replace_output" }>;
  cont?: Extract<Verdict, { action: "continue" }>;
  context: string[];
  notify: string[];
} {
  const sorted = [...verdicts].sort((a, b) => RANK[a.action] - RANK[b.action]);
  const out: ReturnType<typeof merge> = { context: [], notify: [] };
  for (const v of sorted) {
    if ((v.action === "deny" || v.action === "ask") && !out.gate) out.gate = v;
    else if (v.action === "rewrite" && !out.rewrite) out.rewrite = v;
    else if (v.action === "replace_output" && !out.replace) out.replace = v;
    else if (v.action === "continue" && !out.cont) out.cont = v;
    else if (v.action === "context") out.context.push(v.text);
    else if (v.action === "notify") out.notify.push(v.message);
  }
  // A gate makes rewrites moot: a denied or held call should not also be silently changed.
  if (out.gate) out.rewrite = undefined;
  return out;
}
