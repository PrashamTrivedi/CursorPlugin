// #1: classify a failed shell command so the agent fixes the cause instead of retrying. Replaces the prompt-type classifier.
import type { Decision } from "../core/decision.ts";
import { choiceOf, clip, tail } from "../core/text.ts";

const KINDS: Record<string, string> = {
  MISSING_DEP: "a package or binary needs installing",
  PERMISSION: "needs sudo, chmod, or different credentials",
  NOT_FOUND: "wrong path or command name",
  PORT_CONFLICT: "port already in use",
  SYNTAX: "shell or language syntax error",
  OTHER: "anything else",
};

export const failureTriage: Decision = {
  name: "failure-triage",
  safety: false,
  applies: (e) => e.kind === "tool_failure" && e.tool?.kind === "shell" && !!e.tool.error,
  async run(e, ctx) {
    const a = await ctx.ask(
      { command: clip(e.tool!.command, 2000), error: tail(e.tool!.error, 4000) },
      { kind: { type: "choice", instructions: "Why did this shell command fail?", criteria: KINDS } },
    );
    const k = choiceOf(a, "kind");
    if (!k || k.choice === "OTHER" || k.confidence < ctx.threshold("confidence", 0.5))
      return { verdict: { action: "none" }, signals: { kind: k } };
    return {
      verdict: { action: "context", text: `jev-harness: this failure looks like ${k.choice} (${KINDS[k.choice]}, confidence ${k.confidence.toFixed(2)}). Fix that cause before retrying.` },
      signals: { kind: k },
    };
  },
};
