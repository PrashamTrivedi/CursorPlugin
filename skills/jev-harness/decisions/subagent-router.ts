// #12: subagents that inherit the expensive parent model for cheap work. Evidence: 11 of 15 such Cursor tasks judged
// fast_cheap. Claude Code can rewrite the Agent tool's `model`; Cursor's subagentStart can only deny, so it logs only.
import type { Decision } from "../core/decision.ts";
import { choiceOf, clip, scoreOf } from "../core/text.ts";

export const subagentRouter: Decision = {
  name: "subagent-router",
  safety: false,
  applies: (e) => (e.kind === "pre_tool" && e.tool?.kind === "subagent") || e.kind === "subagent_start",
  async run(e, ctx) {
    const t = e.tool!;
    if (!t.subagentPrompt) return null;
    const a = await ctx.ask({ task: clip(t.subagentPrompt, 4000) }, {
      route: { type: "choice", instructions: "Which executor should handle `task`?", criteria: {
        frontier: "architecture, ambiguous debugging, design judgment, synthesis across many sources",
        fast_cheap: "scoped search, web research summaries, mechanical edits, or recon with a clear spec",
      } },
      difficulty: { type: "score", instructions: "How much judgment does `task` require?", criteria: ["purely mechanical", "small local judgment", "cross-cutting design judgment", "open-ended research or ambiguous debugging"] },
    });
    const route = choiceOf(a, "route"), difficulty = scoreOf(a, "difficulty")?.score ?? 3;
    const signals = { route, difficulty, requestedModel: t.subagentModel ?? "inherit" };
    const cheap = route?.choice === "fast_cheap" && route.confidence >= ctx.threshold("confidence", 0.85) && difficulty < ctx.threshold("difficulty", 1.5);
    // Only when the caller left the model unset (inherit); an explicit choice is respected.
    if (!cheap || t.subagentModel || e.agent !== "claude-code") return { verdict: { action: "none" }, signals, detail: cheap ? "would route cheap" : undefined };
    const model = ctx.setting("cheapModel", "sonnet");
    return { verdict: { action: "rewrite", input: { ...t.input, model }, note: `jev-harness routed this subagent to ${model} (mechanical, difficulty ${difficulty.toFixed(2)}).` }, signals };
  },
};
