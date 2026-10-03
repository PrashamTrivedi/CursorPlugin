// #3: the turn ended on a promise ("Next I'll…") with the work undone. Evidence: 50 of 268 Cursor turns (19%).
import type { Decision } from "../core/decision.ts";
import { clip, noul } from "../core/text.ts";
import { lastAssistantText } from "../core/transcript.ts";

// Code prefilter on the ending: future-tense commitments only. Jev confirms.
const PROMISE = /\b(I'?ll|I will|I'm going to|I am going to|let me|next,? I|will now|going to (?:now )?(?:fix|add|write|run|update|check))\b/i;

export const promiseContinue: Decision = {
  name: "promise-continue",
  safety: false,
  applies: (e) => e.kind === "stop" && !e.reentry,
  async run(e, ctx) {
    const text = (e.lastAssistantText || lastAssistantText(e.agent, e.transcriptPath)).trim();
    if (!text || !PROMISE.test(text.slice(-500))) return null;
    const a = await ctx.ask({ final_message: clip(text.slice(-3000), 3000) }, {
      promised_undone_work: { type: "noul", instructions: "Does `final_message` end by promising work that has not been done yet, instead of doing it?" },
      waits_on_user: { type: "noul", instructions: "Does `final_message` end by asking the user a question, or by waiting for a decision or input only the user can give?" },
    });
    const promised = noul(a, "promised_undone_work"), waits = noul(a, "waits_on_user");
    const signals = { promised, waits };
    if (promised < ctx.threshold("promise", 0.8) || waits >= ctx.threshold("waits", 0.5)) return { verdict: { action: "none" }, signals };
    const last = text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(-1)[0] ?? "";
    return {
      verdict: { action: "continue", reason: `You ended the turn by promising work you have not done ("${clip(last, 160)}"). Do it now. If you are blocked on the user, say exactly what you need from them instead.` },
      signals,
    };
  },
};
