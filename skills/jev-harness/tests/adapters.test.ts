// Contract tests: spawn each real adapter process, offline (JEV_HARNESS_FAKE), and validate stdout against what the
// agent accepts. Antigravity is the strict one: PreToolUse must always carry a decision; flat hooks accept {}.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

function setup(fake: Record<string, unknown> | null, mode = "enforce") {
  const home = mkdtempSync(join(tmpdir(), "jev-adapter-"));
  writeFileSync(join(home, "config.json"), JSON.stringify({ defaultMode: mode, timeoutMs: 3000 }));
  const fakePath = join(home, "fake.json");
  if (fake) writeFileSync(fakePath, JSON.stringify(fake));
  return { home, fakePath: fake ? fakePath : join(home, "missing.json") };
}

function run(agent: string, event: string, stdin: string, env: { home: string; fakePath: string }) {
  const r = Bun.spawnSync(["bun", join(ROOT, "adapters", agent, "run.ts"), event], {
    stdin: new TextEncoder().encode(stdin),
    env: { ...process.env, JEV_HARNESS_HOME: env.home, JEV_HARNESS_FAKE: env.fakePath, TYPESAFE_API_KEY: "test" },
  });
  return { code: r.exitCode, out: r.stdout.toString() };
}

const destroy = { accidental_destruction: { type: "noul", noul: 0.95 } };
const benign = {};

const AG_PRE_KEYS = new Set(["decision", "reason", "overwrite", "permissionOverrides"]);
const AG_DECISIONS = new Set(["allow", "deny", "ask", "force_ask"]);
const agValid = (out: string) => {
  const o = JSON.parse(out);
  return AG_DECISIONS.has(o.decision) && Object.keys(o).every((k) => AG_PRE_KEYS.has(k));
};

describe("antigravity", () => {
  const pre = (cmd: string) => JSON.stringify({ conversationId: "c1", workspacePaths: ["/tmp"], toolCall: { name: "run_command", args: { CommandLine: cmd } } });
  test("benign → ask (normal flow), never {}", () => {
    const r = run("antigravity", "PreToolUse", pre("ls"), setup(benign));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ decision: "ask" });
  });
  test("destructive → deny", () => {
    const r = run("antigravity", "PreToolUse", pre("rm -rf /data"), setup(destroy));
    expect(agValid(r.out)).toBe(true);
    expect(JSON.parse(r.out).decision).toBe("deny");
  });
  test("garbage stdin → ask, exit 0", () => {
    const r = run("antigravity", "PreToolUse", "not json{", setup(benign));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ decision: "ask" });
  });
  test("Jev unavailable on a safety decision → force_ask, still valid", () => {
    const r = run("antigravity", "PreToolUse", pre("rm -rf x"), setup(null));
    expect(agValid(r.out)).toBe(true);
    expect(JSON.parse(r.out).decision).toBe("force_ask");
  });
  test("shadow mode never acts", () => {
    const r = run("antigravity", "PreToolUse", pre("rm -rf /data"), setup(destroy, "shadow"));
    expect(JSON.parse(r.out)).toEqual({ decision: "ask" });
  });
  test("flat hooks: PreInvocation and Stop neutral are {}", () => {
    for (const ev of ["PreInvocation", "Stop"]) {
      const r = run("antigravity", ev, JSON.stringify({ conversationId: "c1", executionNum: 1, terminationReason: "model_stop" }), setup(benign));
      expect(r.out).toBe("{}");
    }
  });
});

describe("cursor", () => {
  test("permission hooks always print valid permission JSON", () => {
    const ok = run("cursor", "beforeShellExecution", JSON.stringify({ conversation_id: "c", command: "ls" }), setup(benign));
    expect(JSON.parse(ok.out)).toEqual({ permission: "allow" });
    const bad = run("cursor", "beforeShellExecution", JSON.stringify({ conversation_id: "c", command: "rm -rf /x" }), setup(destroy));
    expect(JSON.parse(bad.out).permission).toBe("deny");
    const garbage = run("cursor", "preToolUse", "{{", setup(benign));
    expect(JSON.parse(garbage.out)).toEqual({ permission: "allow" });
  });
  test("observational and flat hooks print {}", () => {
    expect(run("cursor", "postToolUse", JSON.stringify({ conversation_id: "c", tool_name: "Read", tool_input: { path: "x" }, tool_output: "\"hi\"" }), setup(benign)).out).toBe("{}");
    expect(run("cursor", "afterAgentResponse", JSON.stringify({ conversation_id: "c", text: "done" }), setup(benign)).out).toBe("{}");
    expect(run("cursor", "stop", JSON.stringify({ conversation_id: "c", status: "completed", loop_count: 0 }), setup(benign)).out).toBe("{}");
  });
  test("stop continues on a stashed promise via followup_message", () => {
    const env = setup({ promised_undone_work: { type: "noul", noul: 0.95 }, waits_on_user: { type: "noul", noul: 0.02 } });
    run("cursor", "afterAgentResponse", JSON.stringify({ conversation_id: "c9", text: "Live is backed up. Next I'll restore the overwritten files." }), env);
    const r = run("cursor", "stop", JSON.stringify({ conversation_id: "c9", status: "completed", loop_count: 0 }), env);
    expect(JSON.parse(r.out).followup_message).toContain("promising work");
  });
});

describe("jev_calls log", () => {
  test("every call is stored with state, questions and answers exactly as sent/received; errors too", () => {
    const { Database } = require("bun:sqlite");
    const env = setup(destroy);
    run("cursor", "beforeShellExecution", JSON.stringify({ conversation_id: "c-db", command: "rm -rf /x" }), env);
    const db = new Database(join(env.home, "jev.db"), { readonly: true });
    const row: any = db.query("SELECT * FROM jev_calls").get();
    expect(row).toMatchObject({ agent: "cursor", event: "pre_tool", decision: "shell-safety", mode: "enforce", session_id: "c-db", tool: "Shell", model: "fake", status: "ok" });
    expect(JSON.parse(row.state)).toEqual({ command: "rm -rf /x", description: "" });
    expect(JSON.parse(row.questions).accidental_destruction.type).toBe("noul");
    expect(JSON.parse(row.answers).accidental_destruction).toEqual({ type: "noul", noul: 0.95 });
    const err = setup(null);
    run("cursor", "beforeShellExecution", JSON.stringify({ conversation_id: "c-err", command: "rm -rf /x" }), err);
    const e: any = new Database(join(err.home, "jev.db"), { readonly: true }).query("SELECT status, answers, error FROM jev_calls").get();
    expect(e.status).toBe("error");
    expect(e.answers).toBeNull();
    expect(e.error).toContain("ENOENT");
  });
  test("prompt-submit hooks stash the prompt and stay neutral", () => {
    const env = setup(benign);
    expect(JSON.parse(run("cursor", "beforeSubmitPrompt", JSON.stringify({ conversation_id: "p1", prompt: "fix login" }), env).out)).toEqual({ continue: true });
    expect(run("claude-code", "UserPromptSubmit", JSON.stringify({ session_id: "p2", hook_event_name: "UserPromptSubmit", prompt: "fix login" }), env).out).toBe("");
    const st = JSON.parse(require("node:fs").readFileSync(join(env.home, "state", "p1-prompts.json"), "utf8"));
    expect(st.prompts).toEqual(["fix login"]);
  });
});

describe("claude-code", () => {
  const pre = (cmd: string) => JSON.stringify({ session_id: "s", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: cmd, description: "x" } });
  test("benign → empty stdout; destructive → deny JSON", () => {
    expect(run("claude-code", "PreToolUse", pre("ls"), setup(benign)).out).toBe("");
    const o = JSON.parse(run("claude-code", "PreToolUse", pre("rm -rf /data"), setup(destroy)).out);
    expect(o.hookSpecificOutput).toMatchObject({ hookEventName: "PreToolUse", permissionDecision: "deny" });
  });
  test("garbage stdin → empty, exit 0", () => {
    const r = run("claude-code", "PreToolUse", "nope", setup(benign));
    expect(r.code).toBe(0);
    expect(r.out).toBe("");
  });
  test("failure triage → additionalContext on PostToolUseFailure", () => {
    const r = run("claude-code", "PostToolUseFailure", JSON.stringify({ session_id: "s", tool_name: "Bash", tool_input: { command: "npm run dev" }, error: "EADDRINUSE" }),
      setup({ kind: { type: "choice", choice: "PORT_CONFLICT", probabilities: {}, confidence: 0.97 } }));
    expect(JSON.parse(r.out).hookSpecificOutput.additionalContext).toContain("PORT_CONFLICT");
  });
});
