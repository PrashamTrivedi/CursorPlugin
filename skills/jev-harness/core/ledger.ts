// Append-only record of every decision. In shadow mode this is the only output, so it must never throw.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { home } from "./config.ts";

export interface LedgerRow {
  ts: string;
  agent: string;
  event: string;
  tool?: string;
  decision: string;
  mode: string;
  verdict: string;            // action taken or that would have been taken
  applied: boolean;           // false in shadow, on error, or when the agent can't express the verdict
  calls: number;
  inputTokens: number;
  ms: number;
  signals?: Record<string, unknown>; // compact answers: probabilities, choices, scores
  detail?: string;
  error?: string;
}

export function record(row: Omit<LedgerRow, "ts">): void {
  try {
    mkdirSync(home(), { recursive: true });
    appendFileSync(join(home(), "ledger.jsonl"), JSON.stringify({ ts: new Date().toISOString(), ...row }) + "\n");
  } catch { /* a ledger failure must never break the agent */ }
}
