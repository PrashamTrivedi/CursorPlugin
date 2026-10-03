// Every Jev call, as sent and as received, in SQLite. JSON columns hold the raw payloads (query with json_extract).
// Hooks run as many short-lived processes at once, so: WAL, a busy timeout, and a write that can never throw.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { home, loadConfig } from "./config.ts";

export interface CallMeta {
  agent?: string;
  event?: string;
  decision?: string;
  mode?: string;
  sessionId?: string;
  tool?: string;
}

export interface CallRow extends CallMeta {
  model: string;
  state: unknown;
  questions: unknown;
  answers: unknown;          // null on error
  inputTokens: number;
  latencyMs: number;
  status: "ok" | "error";
  error?: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jev_calls (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT    NOT NULL,
  agent        TEXT,
  event        TEXT,
  decision     TEXT,
  mode         TEXT,
  session_id   TEXT,
  tool         TEXT,
  model        TEXT,
  state        TEXT    NOT NULL,  -- JSON, exactly as sent
  questions    TEXT    NOT NULL,  -- JSON, exactly as sent
  answers      TEXT,              -- JSON, exactly as received (NULL on error)
  input_tokens INTEGER,
  latency_ms   INTEGER,
  status       TEXT    NOT NULL,  -- ok | error
  error        TEXT
);
CREATE INDEX IF NOT EXISTS jev_calls_ts ON jev_calls(ts);
CREATE INDEX IF NOT EXISTS jev_calls_decision ON jev_calls(decision, ts);
CREATE INDEX IF NOT EXISTS jev_calls_session ON jev_calls(session_id);
`;

let db: Database | null = null;

export function dbPath(): string {
  const p: string | undefined = (loadConfig() as any).db?.path;
  if (!p) return join(home(), "jev.db");
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

function open(): Database | null {
  if (db) return db;
  if ((loadConfig() as any).db?.enabled === false) return null;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2000;");
  db.exec(SCHEMA);
  return db;
}

export function logCall(r: CallRow): void {
  try {
    const d = open();
    if (!d) return;
    d.query(`INSERT INTO jev_calls (ts, agent, event, decision, mode, session_id, tool, model, state, questions, answers,
      input_tokens, latency_ms, status, error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      new Date().toISOString(), r.agent ?? null, r.event ?? null, r.decision ?? null, r.mode ?? null,
      r.sessionId ?? null, r.tool ?? null, r.model,
      JSON.stringify(r.state ?? null), JSON.stringify(r.questions ?? null),
      r.answers === null || r.answers === undefined ? null : JSON.stringify(r.answers),
      r.inputTokens, r.latencyMs, r.status, r.error ?? null,
    );
  } catch (err) {
    process.stderr.write(`jev-harness db: ${String(err)}\n`); // logging must never break the agent
  }
}

export function closeDb() { db?.close(); db = null; }
