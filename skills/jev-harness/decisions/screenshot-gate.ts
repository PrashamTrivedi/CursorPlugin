// #10: screenshots only for the four allowed reasons in rules/browser-cost.md. Evidence: screenshots were 51% of the
// weekly Claude Code quota; Cursor hides them in `take_screenshot_afterwards` (28 calls), which we switch off instead of denying.
import type { Decision } from "../core/decision.ts";
import { choiceOf, clip } from "../core/text.ts";
import { lastAssistantText, taskFor } from "../core/transcript.ts";
import type { HookEvent } from "../core/types.ts";

const REASONS = {
  visual_assertion: "the user asked how something looks, or layout/CSS is being debugged",
  a11y_failed: "the text/accessibility tree returned nothing usable",
  pre_submit_confirmation: "one final frame right before an irreversible submit",
  user_asked: "the user explicitly asked to see it",
  none: "no allowed reason; finding elements or reading text should use text tools",
};

function screenshotKind(e: HookEvent): "explicit" | "afterwards" | null {
  const t = e.tool;
  if (e.kind !== "pre_tool" || !t) return null;
  const args = t.mcpArgs ?? t.input ?? {};
  if (/computer$/.test(t.mcpTool ?? t.name) && args.action === "screenshot") return "explicit";
  if (/take_screenshot$/.test(t.mcpTool ?? t.name)) return "explicit";
  if (args.take_screenshot_afterwards === true || args.arguments?.take_screenshot_afterwards === true) return "afterwards";
  return null;
}

export const screenshotGate: Decision = {
  name: "screenshot-gate",
  safety: false,
  applies: (e) => screenshotKind(e) !== null,
  async run(e, ctx) {
    const kind = screenshotKind(e)!;
    const a = await ctx.ask({
      tool_input: e.tool!.mcpArgs ?? e.tool!.input,
      user_request: clip(taskFor(e), 1500),
      last_assistant_message: clip(lastAssistantText(e.agent, e.transcriptPath), 1500),
    }, { justification: { type: "choice", instructions: "Which allowed reason justifies taking this screenshot?", criteria: REASONS } });
    const j = choiceOf(a, "justification");
    const signals = { justification: j, kind };
    if (!j || j.choice !== "none" || j.confidence < ctx.threshold("none", 0.8)) return { verdict: { action: "none" }, signals };

    if (kind === "afterwards") {
      const input = structuredClone(e.tool!.input);
      if (input.arguments && typeof input.arguments === "object") input.arguments.take_screenshot_afterwards = false;
      else input.take_screenshot_afterwards = false;
      return { verdict: { action: "rewrite", input, note: "jev-harness turned off take_screenshot_afterwards; use a snapshot or page text to read the result." }, signals };
    }
    return { verdict: { action: "deny", reason: "jev-harness: no allowed reason for a screenshot here (rules/browser-cost.md). Read the page as text (get_page_text / find / read_page) instead." }, signals };
  },
};
