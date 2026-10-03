// The contract every decision implements, and the context the engine hands it.
import type { AskFn } from "./client.ts";
import type { Answers, HookEvent, Questions, Verdict } from "./types.ts";

export interface Ctx {
  /** Jev call that also counts calls/tokens for the ledger. Respects the hook's deadline. */
  ask: (state: unknown, questions: Questions) => Promise<Answers>;
  threshold: (key: string, fallback: number) => number;
  setting: <T>(key: string, fallback: T) => T;
}

export interface Outcome {
  verdict: Verdict;
  signals?: Record<string, unknown>;
  detail?: string;
}

export interface Decision {
  name: string;
  /** Safety decisions fail to `ask` when Jev is unavailable; everything else fails open. */
  safety: boolean;
  /** Cheap, code-only filter. No network. */
  applies(e: HookEvent): boolean;
  /** Return null when there is nothing to decide after all (code prefilter said no). */
  run(e: HookEvent, ctx: Ctx): Promise<Outcome | null>;
}

export type { AskFn };
