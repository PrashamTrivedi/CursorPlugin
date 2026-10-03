// #2: large MCP results, trimmed to the parts relevant to the task before they enter context.
// Evidence: MCP output is 30% of tool output in Claude Code sessions. Claude Code + Cursor only (Antigravity can't replace output).
import type { Decision } from "../core/decision.ts";
import { scoreChunks } from "../core/relevance.ts";
import { charChunks, topWithNeighbours } from "../core/text.ts";
import { taskFor } from "../core/transcript.ts";

const DEFAULT_EXCLUDE = ["jev-tools", "memory-server"];

export const mcpTrim: Decision = {
  name: "mcp-trim",
  safety: false,
  applies: (e) => e.kind === "post_tool" && e.tool?.kind === "mcp" && (e.tool.output?.length ?? 0) >= 12_000 && e.agent !== "antigravity",
  async run(e, ctx) {
    const t = e.tool!;
    const exclude = ctx.setting<string[]>("excludeServers", DEFAULT_EXCLUDE);
    if (t.mcpServer && exclude.some((s) => t.mcpServer!.includes(s))) return null;
    const output = t.output!;
    if (output.length < ctx.setting("minChars", 12_000)) return null;
    const task = taskFor(e);
    if (!task) return { verdict: { action: "none" }, detail: "skip: no task context" };

    const chunks = charChunks(output, 2500);
    const scores = await scoreChunks(ctx, task, chunks);
    const keep = topWithNeighbours(scores, ctx.setting("topK", 2), 1);
    const keptChars = keep.reduce((n, i) => n + chunks[i].text.length, 0);
    const signals = { parts: chunks.length, kept: keep.length, keptPct: keptChars / output.length, best: Math.max(...scores) };
    if (keptChars / output.length > 0.7 || Math.max(...scores) < 1) return { verdict: { action: "none" }, signals };

    const pieces: string[] = [];
    let prev = -1;
    for (const i of keep) {
      if (i !== prev + 1) pieces.push(`[… ${i - prev - 1} part(s) omitted by jev-harness …]`);
      pieces.push(chunks[i].text);
      prev = i;
    }
    if (prev < chunks.length - 1) pieces.push(`[… ${chunks.length - 1 - prev} part(s) omitted by jev-harness …]`);
    const header = `[jev-harness: kept ${keep.length} of ${chunks.length} parts (${Math.round((100 * keptChars) / output.length)}% of ${output.length} chars) most relevant to the task. Call the tool again with narrower arguments if something is missing.]`;
    return {
      verdict: { action: "replace_output", output: [header, ...pieces].join("\n"), note: header },
      signals,
    };
  },
};
