import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "jev-mcp-"));
process["env"].JEV_HARNESS_HOME = join(tmp, "home"); // keep ledger writes out of the real home
const { createServer } = await import("./server.ts");

const dir = join(tmp, "work");
let calls: { state: any; questions: any }[] = [];
let pickAnswer: any = { type: "choice", choice: "a.ts", probabilities: { "a.ts": 0.9, none: 0.1 }, confidence: 0.9 };

const fakeAsk: any = async (state: any, questions: any) => {
  calls.push({ state, questions });
  const answers: any = {};
  for (const [id, q] of Object.entries<any>(questions)) {
    if (id === "pick") answers[id] = pickAnswer;
    else if (q.type === "noul") answers[id] = { type: "noul", noul: 0.876 };
    else if (q.type === "choice") answers[id] = { type: "choice", choice: Object.keys(q.criteria)[0], probabilities: { x: 0.5, y: 0.3, z: 0.1, w: 0.1 }, confidence: 0.5 };
    else answers[id] = { type: "score", score: 1.4, probabilities: {}, confidence: 0.77 };
  }
  return { answers, model: "fake", inputTokens: 10, ms: 5 };
};
let gateAllowed = true;
const gate: any = async () => ({ allowed: gateAllowed, reason: gateAllowed ? "ok" : "nope" });

const server = createServer({ ask: fakeAsk, gate, cwd: dir });
let nid = 1;
const rpc = (method: string, params?: any): Promise<any> => server({ jsonrpc: "2.0", id: nid++, method, params }) as Promise<any>;
const tool = async (name: string, args: any) => {
  const r: any = await rpc("tools/call", { name, arguments: args });
  return { isError: !!r.result.isError, text: r.result.content[0].text as string, json: () => JSON.parse(r.result.content[0].text) };
};
const noul = JSON.stringify({ q: { type: "noul", instructions: "is it?" } });

beforeAll(() => {
  mkdirSync(join(dir, "src/sub"), { recursive: true });
  mkdirSync(join(dir, "node_modules/pkg"), { recursive: true });
  writeFileSync(join(dir, "src/b.ts"), "export const b = 1;");
  writeFileSync(join(dir, "src/a.ts"), "export const a = 1;");
  writeFileSync(join(dir, "src/sub/c.ts"), "export const c = 1;");
  writeFileSync(join(dir, "node_modules/pkg/index.ts"), "nope");
  writeFileSync(join(dir, "bin.dat"), Buffer.from([1, 2, 0, 3]));
  writeFileSync(join(dir, "big.txt"), "x".repeat(110_001));
  writeFileSync(join(dir, "small.txt"), "hello");
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("protocol", () => {
  test("initialize", async () => {
    const r = await rpc("initialize", {});
    expect(r.result).toEqual({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "jev-tools", version: "0.1.0" } });
  });
  test("notification gets no reply; ping works", async () => {
    expect(await server({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect((await rpc("ping")).result).toEqual({});
  });
  test("tools/list", async () => {
    const tools = (await rpc("tools/list")).result.tools;
    expect(tools.map((t: any) => t.name)).toEqual(["ask_jev_file", "ask_jev_files", "pick_first_file", "ask_jev"]);
    const required: Record<string, string> = { ask_jev_file: "path", ask_jev_files: "patterns", pick_first_file: "question", ask_jev: "questions_json" };
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(200);
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.required).toContain(required[t.name]);
    }
  });
  test("unknown method", async () => {
    expect((await rpc("nope/nothing")).error.code).toBe(-32601);
  });
});

describe("questions_json validation", () => {
  const bad: [string, string][] = [
    ["not json", "{oops"],
    ["array", "[]"],
    ["unknown type", JSON.stringify({ q: { type: "wat", instructions: "x" } })],
    ["empty choice", JSON.stringify({ q: { type: "choice", instructions: "x", criteria: {} } })],
    ["score too short", JSON.stringify({ q: { type: "score", instructions: "x", criteria: ["one"] } })],
    ["score too long", JSON.stringify({ q: { type: "score", instructions: "x", criteria: Array(11).fill("l") } })],
  ];
  for (const [name, q] of bad) {
    test(name, async () => {
      calls = [];
      const r = await tool("ask_jev_file", { path: "small.txt", questions_json: q });
      expect(r.isError).toBe(true);
      expect(calls.length).toBe(0);
    });
  }
  test("validation happens before file is read", async () => {
    const r = await tool("ask_jev_file", { path: "missing.txt", questions_json: "{oops" });
    expect(r.text).toContain("not valid JSON");
  });
  test("choice gets auto 'other'", async () => {
    calls = [];
    await tool("ask_jev_file", { path: "small.txt", questions_json: JSON.stringify({ c: { type: "choice", instructions: "x", criteria: { a: "A" } } }) });
    expect(calls[0].questions.c.criteria.other).toBe("None of the above fits");
  });
});

describe("ask_jev_file", () => {
  test("happy path with formatting", async () => {
    calls = [];
    const q = JSON.stringify({
      n: { type: "noul", instructions: "x" },
      c: { type: "choice", instructions: "x", criteria: { a: null, other: null } },
      s: { type: "score", instructions: "x", criteria: ["low", "mid", "high"] },
    });
    const r = await tool("ask_jev_file", { path: "small.txt", questions_json: q });
    expect(r.isError).toBe(false);
    expect(calls[0].state).toEqual({ path: "small.txt", content: "hello" });
    expect(r.json()).toEqual({
      answers: {
        n: { yes: true, p: 0.88 },
        c: { choice: "a", confidence: 0.5, top3: [["x", 0.5], ["y", 0.3], ["z", 0.1]] },
        s: { score: 1.4, level: "mid", confidence: 0.77 },
      },
      jev: { calls: 1, input_tokens: 10, ms: 5 },
    });
  });
  test("refuses binary", async () => {
    const r = await tool("ask_jev_file", { path: "bin.dat", questions_json: noul });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("binary");
  });
  test("refuses oversize, naming the limit", async () => {
    const r = await tool("ask_jev_file", { path: "big.txt", questions_json: noul });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("110000");
  });
  test("refuses directory", async () => {
    expect((await tool("ask_jev_file", { path: "src", questions_json: noul })).isError).toBe(true);
  });
});

describe("ask_jev_files", () => {
  test("glob expansion, node_modules pruning, sorted", async () => {
    calls = [];
    const j = (await tool("ask_jev_files", { patterns: ["**/*.ts"], questions_json: noul })).json();
    expect(j.results.map((x: any) => x.path)).toEqual(["src/a.ts", "src/b.ts", "src/sub/c.ts"]);
    expect(calls.length).toBe(3);
    expect(j.jev.calls).toBe(3);
  });
  test("directory: direct children vs recursive; skips reported", async () => {
    const flat = (await tool("ask_jev_files", { patterns: ["src"], questions_json: noul })).json();
    expect(flat.results.map((x: any) => x.path)).toEqual(["src/a.ts", "src/b.ts"]);
    const rec = (await tool("ask_jev_files", { patterns: ["src", "bin.dat", "big.txt", "node_modules"], recursive: true, questions_json: noul })).json();
    expect(rec.results.map((x: any) => x.path)).toEqual(["src/a.ts", "src/b.ts", "src/sub/c.ts"]);
    expect(rec.skipped.map((s: any) => s.path).sort()).toEqual(["big.txt", "bin.dat", "node_modules"]);
  });
});

describe("pick_first_file", () => {
  const args = { question: "which?", paths: ["a.ts", "b.ts"], notes: { "a.ts": "the a" } };
  test("returns path", async () => {
    calls = [];
    const j = (await tool("pick_first_file", args)).json();
    expect(j.path).toBe("a.ts");
    expect(calls[0].questions.pick.criteria).toEqual({ "a.ts": "the a", "b.ts": null, none: "No file in the list fits" });
    expect(calls[0].state).toEqual({ question: "which?", files: ["a.ts", "b.ts"] });
  });
  test("none -> null", async () => {
    pickAnswer = { type: "choice", choice: "none", probabilities: { none: 0.8, "a.ts": 0.2 }, confidence: 0.8 };
    expect((await tool("pick_first_file", args)).json().path).toBeNull();
  });
  test("low confidence -> null", async () => {
    pickAnswer = { type: "choice", choice: "a.ts", probabilities: { "a.ts": 0.25, none: 0.2 }, confidence: 0.25 };
    expect((await tool("pick_first_file", args)).json().path).toBeNull();
  });
  test("too many paths", async () => {
    const r = await tool("pick_first_file", { question: "q", paths: Array.from({ length: 255 }, (_, i) => `f${i}`) });
    expect(r.isError).toBe(true);
  });
});

describe("ask_jev", () => {
  test("state + paths", async () => {
    calls = [];
    const r = await tool("ask_jev", { questions_json: noul, state: '{"k":1}', paths: ["small.txt", "src/a.ts"] });
    expect(r.isError).toBe(false);
    expect(calls[0].state).toEqual({ state: { k: 1 }, files: { "small.txt": "hello", "src/a.ts": "export const a = 1;" } });
    expect(r.text).not.toContain("hello");
  });
  test("non-JSON state kept as string", async () => {
    calls = [];
    await tool("ask_jev", { questions_json: noul, state: "plain text" });
    expect(calls[0].state.state).toBe("plain text");
  });
  test("total content cap", async () => {
    for (let i = 0; i < 3; i++) writeFileSync(join(dir, `m${i}.txt`), "y".repeat(100_000));
    const r = await tool("ask_jev", { questions_json: noul, paths: ["m0.txt", "m1.txt", "m2.txt"] });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("split");
  });
  test("gated-out command never runs", async () => {
    gateAllowed = false;
    calls = [];
    const marker = join(dir, "ran.txt");
    const r = await tool("ask_jev", { questions_json: noul, command: `touch ${marker}` });
    gateAllowed = true;
    expect(r.isError).toBe(true);
    expect(r.text).toContain("nope");
    expect(existsSync(marker)).toBe(false);
    expect(calls.length).toBe(0);
  });
  test("allowed command output goes to ask, not back", async () => {
    calls = [];
    const r = await tool("ask_jev", { questions_json: noul, command: "echo hi" });
    expect(r.isError).toBe(false);
    expect(calls[0].state.output).toMatchObject({ command: "echo hi", exit_code: 0, stdout: "hi\n", stderr: "" });
    expect(r.text).not.toContain("hi\\n");
  });
  test("long output keeps tail and notes truncation", async () => {
    calls = [];
    await tool("ask_jev", { questions_json: noul, command: "head -c 70000 /dev/zero | tr '\\0' a; echo END" });
    const o = calls[0].state.output;
    expect(o.stdout.length).toBe(15_000);
    expect(o.stdout.endsWith("END\n")).toBe(true);
    expect(o.notes[0]).toContain("truncated");
  });
  test("requires some input", async () => {
    expect((await tool("ask_jev", { questions_json: noul })).isError).toBe(true);
  });
});
