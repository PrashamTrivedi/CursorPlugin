// Score chunks of a large text against the current task. Policy from the read-gate test:
// top-2 chunks plus one neighbour each side covered 100% of the answer on 4/4 docs.
import type { Ctx } from "./decision.ts";
import { batches, scoreOf, type Chunk } from "./text.ts";

const LEVELS = [
  "irrelevant to the task",
  "same topic but does not help answer it",
  "partly answers the task",
  "directly answers the task",
];

export async function scoreChunks(ctx: Ctx, task: string, chunks: Chunk[]): Promise<number[]> {
  const scores = new Array<number>(chunks.length).fill(0);
  await Promise.all(batches(chunks).map(async (batch) => {
    const questions = Object.fromEntries(batch.map((_, k) => [`c${k}`, {
      type: "score" as const,
      instructions: `How useful is \`chunks[${k}].text\` for the work described in \`task\`?`,
      criteria: LEVELS,
    }]));
    const a = await ctx.ask({ task, chunks: batch.map((c) => ({ lines: `${c.startLine}-${c.endLine}`, text: c.text })) }, questions);
    batch.forEach((c, k) => { scores[c.index] = scoreOf(a, `c${k}`)?.score ?? 0; });
  }));
  return scores;
}
