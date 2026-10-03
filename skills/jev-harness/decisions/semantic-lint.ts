// #11: checks a linter can't express, on code the agent just wrote. Evidence: 9 swallowed errors and a real
// hardcoded `AIza…` key in 200 Cursor edits; debug/stub checks found nothing, so they stay but with a high bar.
import { extname } from "node:path";
import type { Decision } from "../core/decision.ts";
import { clip, noul } from "../core/text.ts";

const CODE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".rb", ".php", ".sh", ".sql", ".vue", ".svelte", ".liquid"]);

const CHECKS = {
  swallowed_error: "Does `new_code` catch an error and silently ignore it?",
  hardcoded_secret: "Does `new_code` hardcode an API key, token, password or other secret value?",
  debug_leftover: "Does `new_code` add temporary debug output (console.log/print debugging) that should not ship?",
  fake_stub: "Does `new_code` add a placeholder, TODO, mock or stub that pretends functionality works when it does not?",
} as const;

const LABEL: Record<keyof typeof CHECKS, string> = {
  swallowed_error: "an error is caught and silently ignored",
  hardcoded_secret: "a secret value looks hardcoded",
  debug_leftover: "temporary debug output",
  fake_stub: "a stub that pretends to work",
};

export const semanticLint: Decision = {
  name: "semantic-lint",
  safety: false,
  applies: (e) => e.kind === "post_tool" && (e.tool?.kind === "write" || e.tool?.kind === "edit")
    && !!e.tool.path && CODE.has(extname(e.tool.path)) && (e.tool.content?.trim().length ?? 0) >= 40,
  async run(e, ctx) {
    const t = e.tool!;
    const a = await ctx.ask({ path: t.path, new_code: clip(t.content, 6000) },
      Object.fromEntries(Object.entries(CHECKS).map(([k, q]) => [k, { type: "noul" as const, instructions: q }])));
    const hits = (Object.keys(CHECKS) as (keyof typeof CHECKS)[])
      .map((k) => [k, noul(a, k)] as const)
      .filter(([, p]) => p >= ctx.threshold("flag", 0.85));
    const signals = Object.fromEntries((Object.keys(CHECKS) as (keyof typeof CHECKS)[]).map((k) => [k, noul(a, k)]));
    if (!hits.length) return { verdict: { action: "none" }, signals };
    return {
      verdict: { action: "context", text: `jev-harness lint on ${t.path}: ${hits.map(([k, p]) => `${LABEL[k]} (p=${p.toFixed(2)})`).join("; ")}. Fix it or say why it is intended.` },
      signals,
    };
  },
};
