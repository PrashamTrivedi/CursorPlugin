// Small text utilities shared by decisions.
import type { Answer, Answers } from "./types.ts";

export const clip = (s: string | undefined, n: number) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + `…[+${s.length - n} chars]` : s;
};

/** Keep the end, where errors and the latest lines live. */
export const tail = (s: string | undefined, n: number) => {
  if (!s) return "";
  return s.length > n ? `[…${s.length - n} chars]` + s.slice(-n) : s;
};

export interface Chunk { index: number; startLine: number; endLine: number; text: string }

/** Fixed-size line chunks, 1-based inclusive line numbers. */
export function lineChunks(text: string, linesPer = 50): Chunk[] {
  const lines = text.split("\n");
  const chunks: Chunk[] = [];
  for (let i = 0; i < lines.length; i += linesPer) {
    chunks.push({ index: chunks.length, startLine: i + 1, endLine: Math.min(i + linesPer, lines.length), text: lines.slice(i, i + linesPer).join("\n") });
  }
  return chunks;
}

/** Chunks of roughly `chars` characters, split on line boundaries; long single lines are hard-split. */
export function charChunks(text: string, chars = 2500): Chunk[] {
  const lines = text.split("\n");
  const chunks: Chunk[] = [];
  let buf: string[] = [], size = 0, start = 1;
  const flush = (end: number) => {
    if (!buf.length) return;
    chunks.push({ index: chunks.length, startLine: start, endLine: end, text: buf.join("\n") });
    buf = []; size = 0; start = end + 1;
  };
  lines.forEach((line, i) => {
    if (line.length > chars) {
      flush(i);
      for (let o = 0; o < line.length; o += chars) chunks.push({ index: chunks.length, startLine: i + 1, endLine: i + 1, text: line.slice(o, o + chars) });
      start = i + 2;
      return;
    }
    if (size + line.length > chars && buf.length) flush(i);
    buf.push(line); size += line.length + 1;
  });
  flush(lines.length);
  return chunks;
}

/** Group chunks into batches whose text stays under `budget` characters (Jev's state cap is ~32k tokens). */
export function batches<T extends { text: string }>(items: T[], budget = 80_000): T[][] {
  const out: T[][] = [];
  let cur: T[] = [], size = 0;
  for (const it of items) {
    if (size + it.text.length > budget && cur.length) { out.push(cur); cur = []; size = 0; }
    cur.push(it); size += it.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Top-k indices by score plus `nb` neighbours each side, sorted. Picks after the best must reach `minScore`,
 *  so an irrelevant runner-up (a tie at 0) never widens the selection. */
export function topWithNeighbours(scores: number[], k: number, nb: number, minScore = 1.5): number[] {
  const top = scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]).slice(0, k)
    .filter(([s], rank) => rank === 0 || s >= minScore).map(([, i]) => i);
  const sel = new Set<number>();
  for (const i of top) for (let j = i - nb; j <= i + nb; j++) if (j >= 0 && j < scores.length) sel.add(j);
  return [...sel].sort((a, b) => a - b);
}

export const noul = (a: Answers, id: string) => (a[id] as Extract<Answer, { type: "noul" }>)?.noul ?? 0;
export const choiceOf = (a: Answers, id: string) => a[id] as Extract<Answer, { type: "choice" }>;
export const scoreOf = (a: Answers, id: string) => a[id] as Extract<Answer, { type: "score" }>;

/** Ledger-friendly answers: numbers rounded, choice with confidence. */
export function compactSignals(s: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === "number") out[k] = Math.round(v * 100) / 100;
    else if (v && typeof v === "object" && "type" in (v as any)) {
      const a = v as Answer;
      out[k] = a.type === "noul" ? Math.round(a.noul * 100) / 100
        : a.type === "choice" ? `${a.choice}@${Math.round(a.confidence * 100) / 100}`
        : Math.round(a.score * 100) / 100;
    } else out[k] = v;
  }
  return out;
}

export function normalizeCommand(c: string): string {
  return c.replace(/\s+/g, " ").replace(/\d{2,}/g, "N").trim().toLowerCase();
}
