// #9: tell the user when context has moved on and is worth compacting, with a ready /compact line.
// Questions and tiers adapted from disler/ten-levels-of-jev Level 7. Claude Code only: Cursor preCompact is excluded,
// and neither agent lets a hook trigger compaction — this only notifies.
import type { Decision } from "../core/decision.ts";
import { loadState, saveState } from "../core/store.ts";
import { choiceOf, clip, noul, scoreOf } from "../core/text.ts";
import { contextTokens, lastAssistantText, recentUserPrompts } from "../core/transcript.ts";

type Tier = "notice" | "recommend" | "request";
const RANK: Record<Tier, number> = { notice: 1, recommend: 2, request: 3 };

export const compactAdvisor: Decision = {
  name: "compact-advisor",
  safety: false,
  applies: (e) => e.kind === "stop" && e.agent === "claude-code" && !e.reentry,
  async run(e, ctx) {
    const tokens = contextTokens(e.agent, e.transcriptPath);
    const lines = { notice: ctx.setting("notice", 100_000), recommend: ctx.setting("recommend", 140_000), request: ctx.setting("request", 170_000) };
    if (!tokens || tokens < lines.notice) return null;

    const prompts = recentUserPrompts(e.agent, e.transcriptPath, 12);
    if (prompts.length < 2) return null;
    const a = await ctx.ask({
      current_request: clip(prompts[prompts.length - 1], 1500),
      previous_work: prompts.slice(0, -1).map((p) => clip(p, 600)),
      recent_turn: clip(e.lastAssistantText || lastAssistantText(e.agent, e.transcriptPath), 2000),
    }, {
      switched_gears: { type: "noul", instructions: "Is `current_request` a different task from `previous_work` (a new feature, a different file area, a different goal, or an unrelated question)?" },
      at_boundary: { type: "noul", instructions: "Did `recent_turn` finish a unit of work (tests passed, a commit was made, a summary was given, or a question was asked of the user)?" },
      needs_history: { type: "score", instructions: "How much of `previous_work` does the next step need?", criteria: ["None; the new work stands alone", "Some references, a file name or a decision", "Most of it; the work continues directly from it"] },
      mid_operation: { type: "noul", instructions: "Is the agent in the middle of a multi step edit whose partial state only exists in the conversation (half applied changes, an unfinished refactor)?" },
    });
    const switched = noul(a, "switched_gears"), boundary = noul(a, "at_boundary"), mid = noul(a, "mid_operation");
    const history = scoreOf(a, "needs_history")?.score ?? 2;
    const signals: Record<string, unknown> = { tokens, switched, boundary, mid, history };
    if (mid > 0.6) return { verdict: { action: "none" }, signals };
    if (!(switched > 0.7 || (boundary > 0.6 && history < 1))) return { verdict: { action: "none" }, signals };

    const tier: Tier = tokens >= lines.request ? "request" : tokens >= lines.recommend ? "recommend" : "notice";
    const st = loadState<{ tier?: Tier; tokens?: number }>(`${e.sessionId}-compact`, {});
    if (st.tier && RANK[st.tier] >= RANK[tier] && tokens - (st.tokens ?? 0) < 20_000) return { verdict: { action: "none" }, signals };
    saveState(`${e.sessionId}-compact`, { tier, tokens });

    let instructions = "Summarize earlier work briefly; keep the most recent turns in detail.";
    if (RANK[tier] >= 2) {
      const cut = await ctx.ask({ turns: prompts.map((p, i) => ({ index: i, request: clip(p, 300) })) }, {
        live_from: { type: "choice", instructions: "Which turn in `turns` starts the work that is still live? Earlier turns can be summarized briefly.", criteria: { ...Object.fromEntries(prompts.map((p, i) => [String(i), clip(p, 200)])), none: "Every turn is still live" } },
      });
      const c = choiceOf(cut, "live_from");
      signals.cut = c;
      if (c && c.choice !== "none" && c.confidence >= 0.6)
        instructions = `Live work starts at "${clip(prompts[Number(c.choice)], 120)}". Summarize everything before it in a few lines; keep decisions, file paths and open questions from there on in full.`;
    }
    const why = switched > 0.7 ? "The task changed." : "The last turn finished a unit of work and the next step needs little of the earlier context.";
    const lead = tier === "request" ? "Please compact now" : tier === "recommend" ? "Recommended: compact" : "Optional: compact";
    return { verdict: { action: "notify", message: `jev-harness: ${lead} — context at ${Math.round(tokens / 1000)}k tokens. ${why}\n/compact ${instructions}` }, signals };
  },
};
