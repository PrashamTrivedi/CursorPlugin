// Minimal Jev client: one endpoint, a hard deadline, one 429 retry inside the deadline.
import { readFileSync } from "node:fs";
import { loadConfig, secret } from "./config.ts";
import { logCall, type CallMeta } from "./db.ts";
import type { Answers, JevResult, Questions } from "./types.ts";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export class JevError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "JevError";
  }
}

export type AskFn = (state: unknown, questions: Questions, opts?: { deadline?: number; meta?: CallMeta }) => Promise<JevResult>;

/** Offline test mode: JEV_HARNESS_FAKE points at a JSON map of question id → answer. Unlisted ids get a "no" answer. */
function fake(path: string, questions: Questions): JevResult {
  const table: Record<string, any> = JSON.parse(readFileSync(path, "utf8"));
  const answers: Answers = {};
  for (const [id, q] of Object.entries(questions)) {
    const key = Object.keys(table).find((k) => k === id || (k.endsWith("*") && id.startsWith(k.slice(0, -1))));
    answers[id] = key ? table[key]
      : q.type === "noul" ? { type: "noul", noul: 0 }
      : q.type === "choice" ? { type: "choice", choice: Object.keys(q.criteria)[0], probabilities: {}, confidence: 0 }
      : { type: "score", score: 0, probabilities: {}, confidence: 1 };
  }
  return { answers, model: "fake", inputTokens: 0, ms: 0 };
}

/** Every call is logged to SQLite exactly as sent/received (core/db.ts), success or failure. */
export const ask: AskFn = async (state, questions, opts = {}) => {
  const started = Date.now();
  try {
    const r = await send(state, questions, opts);
    logCall({ ...opts.meta, model: r.model, state, questions, answers: r.answers, inputTokens: r.inputTokens, latencyMs: r.ms, status: "ok" });
    return r;
  } catch (err: any) {
    logCall({ ...opts.meta, model: loadConfig().model, state, questions, answers: null, inputTokens: 0, latencyMs: Date.now() - started, status: "error", error: String(err?.message ?? err) });
    throw err;
  }
};

const send: AskFn = async (state, questions, opts = {}) => {
  if (process.env.JEV_HARNESS_FAKE) return fake(process.env.JEV_HARNESS_FAKE, questions);
  const key = secret("TYPESAFE_API_KEY");
  if (!key) throw new JevError("TYPESAFE_API_KEY not set (env or ~/.jev-harness/credentials)");
  const deadline = opts.deadline ?? Date.now() + loadConfig().timeoutMs;
  const body = JSON.stringify({ model: loadConfig().model, state, questions });

  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 50) throw new JevError("deadline exceeded");
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), remaining);
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
        signal: ctrl.signal,
      });
    } catch (err: any) {
      throw new JevError(err?.name === "AbortError" ? "deadline exceeded" : `network: ${err?.message ?? err}`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429 && attempt === 0) {
      const wait = Math.min(Number(res.headers.get("retry-after") ?? 0.3) * 1000, deadline - Date.now() - 100);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new JevError(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
    const data: any = await res.json();
    return {
      answers: data.answers as Answers,
      model: data.model,
      inputTokens: data.usage?.input_tokens ?? 0,
      ms: Date.now() - started,
    };
  }
  throw new JevError("rate limited");
};
