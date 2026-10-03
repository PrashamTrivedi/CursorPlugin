// #5: a full read of a large file. Either it looks unneeded (strict gate), or rewrite it to the relevant line range.
// Evidence: strict gate blocked 29/38 unneeded files, 0/7 needed; Cursor made 22 full reads of >20k-char files (1.51M chars).
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { Decision } from "../core/decision.ts";
import { scoreChunks } from "../core/relevance.ts";
import { clip, lineChunks, noul, topWithNeighbours } from "../core/text.ts";
import { taskFor } from "../core/transcript.ts";
import type { AgentId } from "../core/types.ts";

const GATE = {
  needed: {
    type: "noul" as const,
    instructions: "A coding agent working on `task` is about to read `file_path` (contents in `file_content`). Will the agent have to edit this exact file, or does this file define something the task's code directly uses? Being a similar or sibling file (same folder, same kind of script) does NOT make it needed. Answer yes only if the task cannot be done correctly without this file.",
  },
};

/** Map a 1-based inclusive line range onto each agent's read arguments. */
export function rangeInput(agent: AgentId, input: Record<string, any>, start: number, end: number): Record<string, any> {
  if (agent === "antigravity") return { ...input, StartLine: start, EndLine: end };
  return { ...input, offset: start, limit: end - start + 1 }; // Claude Code Read and Cursor Read share offset/limit
}

export const readBudget: Decision = {
  name: "read-budget",
  safety: false,
  applies(e) {
    const t = e.tool;
    if (e.kind !== "pre_tool" || t?.kind !== "read" || !t.path || t.range) return false;
    const p = isAbsolute(t.path) ? t.path : resolve(e.cwd, t.path);
    try { return existsSync(p) && statSync(p).isFile() && statSync(p).size >= 20_000 && statSync(p).size <= 400_000; } catch { return false; }
  },
  async run(e, ctx) {
    const t = e.tool!;
    const path = isAbsolute(t.path!) ? t.path! : resolve(e.cwd, t.path!);
    const content = readFileSync(path, "utf8");
    if (content.length < ctx.setting("minChars", 20_000) || content.includes("\u0000")) return null;
    const task = taskFor(e);
    if (!task) return { verdict: { action: "none" }, detail: "skip: no task context" };

    const chunks = lineChunks(content, 50);
    const [gate, scores] = await Promise.all([
      ctx.ask({ task, file_path: t.path, file_content: clip(content, 100_000) }, GATE),
      scoreChunks(ctx, task, chunks),
    ]);
    const needed = noul(gate, "needed");
    const best = scores.indexOf(Math.max(...scores));
    const signals = { needed, chunks: chunks.length, best: scores[best] };

    if (needed < ctx.threshold("unneeded", 0.2))
      return { verdict: { action: "deny", reason: `jev-harness: ${t.path} looks unrelated to the current task (p(needed)=${needed.toFixed(2)}). If you still need it, read a specific line range.` }, signals };

    const sel = topWithNeighbours(scores, 2, 1);
    let start = chunks[sel[0]].startLine, end = chunks[sel[sel.length - 1]].endLine;
    let note = "";
    const lines = content.split("\n").length;
    if ((end - start + 1) / lines > 0.7) {
      // Top chunks are far apart: read around the best one, point at the other.
      const around = topWithNeighbours(scores, 1, 1);
      start = chunks[around[0]].startLine; end = chunks[around[around.length - 1]].endLine;
      const second = scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]).find(([, i]) => !around.includes(i));
      if (second) note = ` Also relevant: lines ${chunks[second[1]].startLine}-${chunks[second[1]].endLine}.`;
      if ((end - start + 1) / lines > 0.7) return { verdict: { action: "none" }, signals };
    }
    return {
      verdict: {
        action: "rewrite",
        input: rangeInput(e.agent, t.input, start, end),
        note: `jev-harness narrowed this read of ${t.path} to lines ${start}-${end} of ${lines} (most relevant to the task).${note} Read other ranges if you need them.`,
      },
      signals: { ...signals, start, end, lines },
    };
  },
};
