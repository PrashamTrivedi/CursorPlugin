import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetConfigCache } from "../core/config.ts";
import type { Ctx } from "../core/decision.ts";
import type { Answers, HookEvent, Questions } from "../core/types.ts";

export function tempHome(config: object = { defaultMode: "enforce" }): string {
  const dir = mkdtempSync(join(tmpdir(), "jev-harness-test-"));
  writeFileSync(join(dir, "config.json"), JSON.stringify(config));
  process.env.JEV_HARNESS_HOME = dir;
  resetConfigCache();
  return dir;
}

/** Fake ctx: `answer(id, questions)` decides each answer; records every call. */
export function fakeCtx(answer: (id: string, q: Questions[string], state: any) => any, settings: Record<string, any> = {}) {
  const calls: { state: any; questions: Questions }[] = [];
  const ctx: Ctx = {
    async ask(state, questions) {
      calls.push({ state, questions });
      const a: Answers = {};
      for (const [id, q] of Object.entries(questions)) a[id] = answer(id, q, state);
      return a;
    },
    threshold: (_k, f) => f,
    setting: <T,>(k: string, f: T) => (k in settings ? settings[k] : f) as T,
  };
  return { ctx, calls };
}

export const noul = (p: number) => ({ type: "noul", noul: p });
export const choice = (c: string, conf = 0.95) => ({ type: "choice", choice: c, probabilities: { [c]: conf }, confidence: conf });
export const score = (s: number, conf = 0.9) => ({ type: "score", score: s, probabilities: {}, confidence: conf });

/** A Claude Code transcript with the given user prompts and a final assistant message. */
export function ccTranscript(dir: string, prompts: string[], assistant = "ok", tokens = 1000): string {
  const p = join(dir, "transcript.jsonl");
  const lines = prompts.flatMap((u) => [
    { type: "user", message: { role: "user", content: u } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: assistant }], usage: { input_tokens: tokens } } },
  ]);
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return p;
}

export function event(partial: Partial<HookEvent>): HookEvent {
  return { agent: "claude-code", kind: "pre_tool", sessionId: `s-${Math.random().toString(36).slice(2)}`, cwd: process.cwd(), ...partial };
}
