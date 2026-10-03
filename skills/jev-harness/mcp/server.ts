// Stdio MCP server exposing Jev judgments about files / command output without the content entering the agent's context.
import { spawn } from "node:child_process";
import { closeSync, openSync, readSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { AskFn } from "../core/client.ts";
import { loadConfig } from "../core/config.ts";
import { record } from "../core/ledger.ts";
import type { Answers, Questions } from "../core/types.ts";
import type { gateCommand } from "../decisions/shell-safety.ts";

export interface Deps { ask: AskFn; gate: typeof gateCommand; cwd: string }

const MAX_FILE_BYTES = 110_000;
const MAX_FILES = 255;
const MAX_PICK_PATHS = 254;
const MAX_ASK_JEV_FILES = 20;
const MAX_TOTAL_CHARS = 90_000; // files + command output share Jev's ~32k-token state budget
const MAX_OUTPUT_CHARS = 15_000;
const CONCURRENCY = 16;
const JEV_DEADLINE_MS = 20_000;
const COMMAND_TIMEOUT_MS = 60_000;
const PRUNED = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);

const PREAMBLE =
  "Jev answers typed judgment questions in ~0.4s for a tiny fraction of a cent. Use it to learn something about a file or command output INSTEAD of reading it into your context; only the answers come back. " +
  "Still read a file you must edit or quote. Not for exact lookups, counting, or anything grep answers. " +
  "Ask every question you may need in ONE call (they share state). Give every choice an `other` option. Describe score levels as concrete situations, not adjectives. " +
  "questions_json is a STRING holding a JSON object keyed by question id; types: " +
  '{"type":"noul","instructions":"..."} (yes/no probability), {"type":"choice","instructions":"...","criteria":{"option":"description"}}, {"type":"score","instructions":"...","criteria":["level 0 situation","level 1 situation", "..."]} (2-10 ordered levels).';

const QJ = { type: "string", description: "JSON object string of questions keyed by id." } as const;

const TOOLS = [
  {
    name: "ask_jev_file",
    description:
      "Ask Jev typed questions about ONE file without reading it into context. " + PREAMBLE +
      ` Refuses binaries and files over ${MAX_FILE_BYTES} bytes. Example questions_json: ` +
      '{"has_auth":{"type":"noul","instructions":"Does this file check user authentication?"},"kind":{"type":"choice","instructions":"What is this file mainly?","criteria":{"route":"HTTP handler","util":"helpers","other":"None of the above fits"}}}',
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "File path; relative paths resolve against the server cwd." }, questions_json: QJ },
      required: ["path", "questions_json"],
    },
  },
  {
    name: "ask_jev_files",
    description:
      "Ask the same Jev questions about MANY files (one Jev call per file, answers returned per path) without reading any of them. " + PREAMBLE +
      ` Patterns may be files, directories (direct children, or all descendants if recursive) or globs. Skips node_modules/.git/dist/build/.next/coverage, binaries and files over ${MAX_FILE_BYTES} bytes; max ${MAX_FILES} files. Example: patterns ["src/**/*.ts"], questions_json ` +
      '{"uses_db":{"type":"noul","instructions":"Does this file query a database?"}}',
    inputSchema: {
      type: "object",
      properties: {
        patterns: { type: "array", items: { type: "string" }, description: "File paths, directories or globs." },
        questions_json: QJ,
        recursive: { type: "boolean", description: "Directories: include all descendants (default: direct children only)." },
      },
      required: ["patterns", "questions_json"],
    },
  },
  {
    name: "pick_first_file",
    description:
      "Ask Jev which ONE of a list of candidate file paths best fits a question (e.g. 'which file defines the retry logic?'), judging from the paths and notes only. Returns {path|null, confidence, probabilities}; path is null when nothing fits or confidence < 0.3. " +
      `Use after a listing/glob to choose what to read next. Max ${MAX_PICK_PATHS} paths. Example: {"question":"Which file configures the database?","paths":["src/db.ts","src/app.ts"],"notes":{"src/db.ts":"connection pool"}}`,
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        paths: { type: "array", items: { type: "string" } },
        notes: { type: "object", additionalProperties: { type: "string" }, description: "Optional per-path hints." },
      },
      required: ["question", "paths"],
    },
  },
  {
    name: "ask_jev",
    description:
      "Ask Jev typed questions about arbitrary state: free-form context, several files together, and/or the output of a shell command, none of which enter your context. " + PREAMBLE +
      ` Max ${MAX_ASK_JEV_FILES} files, ${MAX_TOTAL_CHARS} chars total. A command is safety-gated, then run with bash -lc in the server cwd (60s timeout); stdout/stderr are truncated to the last ${MAX_OUTPUT_CHARS} chars each. Example: command "bun test 2>&1", questions_json ` +
      '{"passed":{"type":"noul","instructions":"Did all tests pass?"},"cause":{"type":"choice","instructions":"Main failure cause?","criteria":{"assertion":"wrong value","timeout":null,"other":"None of the above fits"}}}',
    inputSchema: {
      type: "object",
      properties: {
        questions_json: QJ,
        state: { type: "string", description: "Free-form context (parsed as JSON if valid)." },
        paths: { type: "array", items: { type: "string" }, description: `Files to include as state (max ${MAX_ASK_JEV_FILES}).` },
        command: { type: "string", description: "Shell command whose output Jev should judge." },
      },
      required: ["questions_json"],
    },
  },
];

class ToolError extends Error {}
const fail = (msg: string): never => { throw new ToolError(msg); };
const r2 = (n: number) => Math.round(n * 100) / 100;

function parseQuestions(raw: unknown): Questions {
  if (typeof raw !== "string") return fail("questions_json must be a string holding a JSON object");
  let q: any;
  try { q = JSON.parse(raw); } catch (e: any) { return fail(`questions_json is not valid JSON: ${e.message}`); }
  if (!q || typeof q !== "object" || Array.isArray(q)) return fail("questions_json must be a JSON object keyed by question id");
  const ids = Object.keys(q);
  if (!ids.length) return fail("questions_json has no questions");
  for (const id of ids) {
    const e = q[id];
    if (!e || typeof e !== "object") return fail(`question "${id}" must be an object`);
    if (e.instructions === undefined || e.instructions === "") return fail(`question "${id}" needs instructions`);
    if (e.type === "noul") continue;
    if (e.type === "choice") {
      const c = e.criteria;
      if (!c || typeof c !== "object" || Array.isArray(c) || !Object.keys(c).length) return fail(`question "${id}": choice criteria must be a non-empty object`);
      if (!Object.keys(c).some((k) => k === "other" || k === "none")) c.other = "None of the above fits";
    } else if (e.type === "score") {
      const c = e.criteria;
      if (!Array.isArray(c) || c.length < 2 || c.length > 10 || c.some((x: unknown) => typeof x !== "string"))
        return fail(`question "${id}": score criteria must be an array of 2-10 strings`);
    } else return fail(`question "${id}": unknown type ${JSON.stringify(e.type)} (use noul, choice or score)`);
  }
  return q as Questions;
}

function formatAnswers(questions: Questions, answers: Answers): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [id, q] of Object.entries(questions)) {
    const a: any = answers[id];
    if (!a) { out[id] = { error: "no answer" }; continue; }
    if (q.type === "noul") out[id] = { yes: a.noul > 0.5, p: r2(a.noul) };
    else if (q.type === "choice") {
      const top3 = Object.entries(a.probabilities ?? {}).sort((x, y) => (y[1] as number) - (x[1] as number)).slice(0, 3).map(([k, p]) => [k, r2(p as number)]);
      out[id] = { choice: a.choice, confidence: r2(a.confidence), top3 };
    } else {
      const crit = q.criteria;
      const level = crit[Math.min(crit.length - 1, Math.max(0, Math.round(a.score)))];
      out[id] = { score: r2(a.score), level, confidence: r2(a.confidence) };
    }
  }
  return out;
}

function looksBinary(path: string): boolean {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(8192);
    return buf.subarray(0, readSync(fd, buf, 0, 8192, 0)).includes(0);
  } finally { closeSync(fd); }
}

/** Returns a refusal reason, or null when the file is readable and within budget. */
async function refusal(abs: string): Promise<string | null> {
  let s;
  try { s = await stat(abs); } catch { return "not found"; }
  if (!s.isFile()) return "not a regular file";
  if (s.size > MAX_FILE_BYTES) return `file is ${s.size} bytes, over the ${MAX_FILE_BYTES}-byte limit (Jev state budget is ~32k tokens)`;
  if (looksBinary(abs)) return "binary file (NUL byte in first 8KB)";
  return null;
}

const isPruned = (rel: string) => rel.split(/[\\/]/).some((seg) => PRUNED.has(seg));

async function walk(dir: string, recursive: boolean, out: string[]) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (PRUNED.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (recursive) await walk(p, true, out); }
    else if (e.isFile()) out.push(p);
  }
}

async function expandPatterns(patterns: string[], cwd: string, recursive: boolean) {
  const found = new Set<string>();
  const skipped: { path: string; reason: string }[] = [];
  for (const pat of patterns) {
    if (/[*?[\]{}]/.test(pat)) {
      for await (const f of new Bun.Glob(pat).scan({ cwd, onlyFiles: true })) {
        if (!isPruned(f)) found.add(resolve(cwd, f));
      }
      continue;
    }
    const abs = resolve(cwd, pat);
    if (isPruned(relative(cwd, abs))) { skipped.push({ path: pat, reason: "pruned directory (node_modules/.git/dist/build/.next/coverage)" }); continue; }
    let s;
    try { s = await stat(abs); } catch { skipped.push({ path: pat, reason: "not found" }); continue; }
    if (s.isDirectory()) { const l: string[] = []; await walk(abs, recursive, l); l.forEach((f) => found.add(f)); }
    else found.add(abs);
  }
  return { files: [...found].sort(), skipped };
}

const relPath = (abs: string, cwd: string) => { const r = relative(cwd, abs); return sep === "/" ? r : r.split(sep).join("/"); };

function runCommand(command: string, cwd: string) {
  return new Promise<{ command: string; exit_code: number | null; stdout: string; stderr: string; notes?: string[] }>((res) => {
    const child = spawn("bash", ["-lc", command], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, COMMAND_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      const notes: string[] = [];
      const tail = (s: string, name: string) => {
        if (s.length <= MAX_OUTPUT_CHARS) return s;
        notes.push(`${name} truncated to last ${MAX_OUTPUT_CHARS} of ${s.length} chars`);
        return s.slice(-MAX_OUTPUT_CHARS);
      };
      if (timedOut) notes.push(`command killed after ${COMMAND_TIMEOUT_MS / 1000}s timeout`);
      res({ command, exit_code: code, stdout: tail(stdout, "stdout"), stderr: tail(stderr, "stderr"), ...(notes.length ? { notes } : {}) });
    });
    child.on("error", (e) => { clearTimeout(timer); res({ command, exit_code: null, stdout, stderr: stderr + String(e) }); });
  });
}

export function createServer(deps: Deps) {
  const { cwd } = deps;

  // Per-call accounting; MCP stdio calls can overlap, so each tool call gets its own counter.
  type Stats = { calls: number; inputTokens: number; ms: number; tool?: string };
  const jev = async (stats: Stats, state: unknown, questions: Questions) => {
    const r = await deps.ask(state, questions, { deadline: Date.now() + Math.max(JEV_DEADLINE_MS, loadConfig().timeoutMs), meta: { agent: "mcp", event: "tools/call", decision: `mcp:${stats.tool}`, mode: "enforce", tool: stats.tool } });
    stats.calls++; stats.inputTokens += r.inputTokens; stats.ms += r.ms;
    return r;
  };

  async function askFile(args: any, stats: Stats) {
    const questions = parseQuestions(args.questions_json);
    if (typeof args.path !== "string" || !args.path) fail("path must be a non-empty string");
    const abs = resolve(cwd, args.path);
    const why = await refusal(abs);
    if (why) fail(`${args.path}: ${why}`);
    const content = await Bun.file(abs).text();
    const r = await jev(stats, { path: args.path, content }, questions);
    return { answers: formatAnswers(questions, r.answers) };
  }

  async function askFiles(args: any, stats: Stats) {
    const questions = parseQuestions(args.questions_json);
    if (!Array.isArray(args.patterns) || !args.patterns.length || args.patterns.some((p: unknown) => typeof p !== "string"))
      fail("patterns must be a non-empty array of strings");
    const { files, skipped } = await expandPatterns(args.patterns, cwd, !!args.recursive);
    const ok: string[] = [];
    for (const f of files) {
      const why = await refusal(f);
      if (why) skipped.push({ path: relPath(f, cwd), reason: why });
      else ok.push(f);
    }
    let capped: string | undefined;
    if (ok.length > MAX_FILES) {
      capped = `${ok.length} files matched; only the first ${MAX_FILES} (by path) were asked about`;
      ok.length = MAX_FILES;
    }
    const results: { path: string; answers?: unknown; error?: string }[] = new Array(ok.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ok.length) }, async () => {
      while (next < ok.length) {
        const i = next++;
        const path = relPath(ok[i], cwd);
        try {
          const r = await jev(stats, { path, content: await Bun.file(ok[i]).text() }, questions);
          results[i] = { path, answers: formatAnswers(questions, r.answers) };
        } catch (e: any) { results[i] = { path, error: e?.message ?? String(e) }; }
      }
    }));
    results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return { results, skipped, ...(capped ? { capped } : {}) };
  }

  async function pickFirst(args: any, stats: Stats) {
    if (typeof args.question !== "string" || !args.question) fail("question must be a non-empty string");
    const paths = args.paths;
    if (!Array.isArray(paths) || !paths.length || paths.some((p: unknown) => typeof p !== "string")) fail("paths must be a non-empty array of strings");
    if (paths.length > MAX_PICK_PATHS) fail(`too many paths (${paths.length}); max ${MAX_PICK_PATHS}`);
    const notes = args.notes && typeof args.notes === "object" ? args.notes : {};
    const criteria: Record<string, string | null> = {};
    for (const p of paths) criteria[p] = typeof notes[p] === "string" ? notes[p] : null;
    criteria.none = "No file in the list fits";
    const questions: Questions = { pick: { type: "choice", instructions: args.question, criteria } };
    const r = await jev(stats, { question: args.question, files: paths }, questions);
    const a: any = r.answers.pick;
    const path = a.choice === "none" || a.confidence < 0.3 ? null : a.choice;
    const probabilities = Object.fromEntries(Object.entries(a.probabilities ?? {}).map(([k, p]) => [k, r2(p as number)]));
    return { path, confidence: r2(a.confidence), probabilities };
  }

  async function askAny(args: any, stats: Stats) {
    const questions = parseQuestions(args.questions_json);
    const state: Record<string, unknown> = {};
    if (args.state !== undefined) {
      if (typeof args.state !== "string") fail("state must be a string");
      try { state.state = JSON.parse(args.state); } catch { state.state = args.state; }
    }
    if (args.paths !== undefined) {
      if (!Array.isArray(args.paths) || args.paths.some((p: unknown) => typeof p !== "string")) fail("paths must be an array of strings");
      if (args.paths.length > MAX_ASK_JEV_FILES) fail(`too many files (${args.paths.length}); max ${MAX_ASK_JEV_FILES}. Split into several calls.`);
      const files: Record<string, string> = {};
      let total = 0;
      for (const p of args.paths) {
        const why = await refusal(resolve(cwd, p));
        if (why) fail(`${p}: ${why}`);
        files[p] = await Bun.file(resolve(cwd, p)).text();
        total += files[p].length;
        if (total > MAX_TOTAL_CHARS) fail(`files exceed ${MAX_TOTAL_CHARS} total chars; split them across several ask_jev calls`);
      }
      state.files = files;
    }
    if (args.command !== undefined) {
      if (typeof args.command !== "string" || !args.command.trim()) fail("command must be a non-empty string");
      const gate = await deps.gate(args.command, cwd);
      if (!gate.allowed) fail(`command not allowed: ${gate.reason}`);
      state.output = await runCommand(args.command, cwd);
    }
    if (!Object.keys(state).length) fail("provide at least one of state, paths or command");
    const r = await jev(stats, state, questions);
    return { answers: formatAnswers(questions, r.answers) };
  }

  const impls: Record<string, (a: any, s: Stats) => Promise<unknown>> = {
    ask_jev_file: askFile, ask_jev_files: askFiles, pick_first_file: pickFirst, ask_jev: askAny,
  };

  async function callTool(name: string, args: any) {
    const started = Date.now();
    const stats: Stats = { calls: 0, inputTokens: 0, ms: 0, tool: name };
    const base = { agent: "mcp", event: "tools/call", tool: name, decision: `mcp:${name}`, mode: "enforce" };
    try {
      const body: any = await impls[name](args ?? {}, stats);
      const text = JSON.stringify({ ...body, jev: { calls: stats.calls, input_tokens: stats.inputTokens, ms: stats.ms } });
      record({ ...base, verdict: "answered", applied: true, calls: stats.calls, inputTokens: stats.inputTokens, ms: Date.now() - started });
      return { content: [{ type: "text", text }] };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      record({ ...base, verdict: "error", applied: false, calls: stats.calls, inputTokens: stats.inputTokens, ms: Date.now() - started, error: msg });
      return { content: [{ type: "text", text: msg }], isError: true };
    }
  }

  return async function handle(message: any): Promise<object | null> {
    const { id, method, params } = message ?? {};
    if (id === undefined || id === null) return null; // notifications never get a reply
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
    const err = (code: number, m: string) => ({ jsonrpc: "2.0", id, error: { code, message: m } });
    switch (method) {
      case "initialize":
        return ok({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "jev-tools", version: "0.1.0" } });
      case "ping": return ok({});
      case "tools/list": return ok({ tools: TOOLS });
      case "tools/call": {
        const name = params?.name;
        if (!Object.hasOwn(impls, name)) return err(-32602, `unknown tool: ${name}`);
        return ok(await callTool(name, params.arguments));
      }
      default: return err(-32601, `method not found: ${method}`);
    }
  };
}

if (import.meta.main) {
  const [{ ask }, { gateCommand }] = await Promise.all([
    import("../core/client.ts"),
    import("../decisions/shell-safety.ts"),
  ]);
  const handle = createServer({ ask, gate: gateCommand, cwd: process.cwd() });
  const send = (m: object) => process.stdout.write(JSON.stringify(m) + "\n");
  const onLine = async (line: string) => {
    if (!line.trim()) return;
    let msg: any;
    try { msg = JSON.parse(line); } catch { return void send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
    try {
      const reply = await handle(msg);
      if (reply) send(reply);
    } catch (e: any) {
      console.error("jev-tools:", e);
      if (msg?.id !== undefined) send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: e?.message ?? "internal error" } });
    }
  };
  let buf = "";
  const dec = new TextDecoder();
  const pending: Promise<void>[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { pending.push(onLine(buf.slice(0, i))); buf = buf.slice(i + 1); }
  }
  if (buf.trim()) pending.push(onLine(buf));
  await Promise.all(pending);
}
