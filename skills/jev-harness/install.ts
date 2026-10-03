#!/usr/bin/env bun
// Install / uninstall jev-harness hooks and the jev-tools MCP server.
//   bun install.ts --agent all|claude-code|cursor|antigravity [--dry-run] [--uninstall] [--mode shadow|enforce]
//                  [--replace-prompt-hooks] [--no-mcp]
//
// Where things go (matches the existing setup — see SKILL.md "Distribution"):
// - Claude Code: ~/.claude/settings.json hooks + `claude mcp add`, pointing at this skill folder (~/.claude/skills/jev-harness).
// - Antigravity: named hook "jev-harness" in ~/.gemini/config/hooks.json + ~/.gemini/config/mcp_config.json.
// - Cursor: ~/.cursor (this machine's source of truth). The CursorPlugin repo carries it to Cloud Agents via
//   `./sync.ts Cursor From Central`, so everything written here is portable: relative hook commands, ${env:HOME} in mcp.json.
// Entries are recognised by the "jev-harness/adapters" path, so uninstall removes exactly what install added.
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] ?? d : d; };
const DRY = flag("--dry-run"), UNINSTALL = flag("--uninstall"), REPLACE_PROMPT = flag("--replace-prompt-hooks"), NO_MCP = flag("--no-mcp");
const AGENT = opt("--agent", "all");
const MODE = opt("--mode", "shadow");

const HOME = process.env.JEV_HARNESS_HOME ?? join(homedir(), ".jev-harness");
const SKILL = join(homedir(), ".claude", "skills", "jev-harness"); // canonical location; ~/.agents and Antigravity link here
const BUN = process.execPath;
const MARK = "jev-harness/adapters";
const cmd = (agent: string, event: string) => `${BUN} ${join(SKILL, "adapters", agent, "run.ts")} ${event}`;

const log = (s: string) => console.log((DRY ? "[dry-run] " : "") + s);
const readJson = (path: string, fallback: any) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);

function writeJson(path: string, data: any, backup = true) {
  if (DRY) return log(`would write ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  if (backup && existsSync(path)) {
    const bak = `${path}.jev-harness.bak.${Date.now()}`;
    copyFileSync(path, bak);
    log(`backup ${bak}`);
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  log(`wrote ${path}`);
}

const isOurs = (h: any) => typeof h?.command === "string" && h.command.includes(MARK);
const isPromptHook = (h: any) => h?.type === "prompt";

// ---------- shared home: config + credentials (never the code) ----------
function installHome() {
  if (DRY) return log(`would create ${HOME}/config.json (defaultMode ${MODE}) if missing`);
  mkdirSync(HOME, { recursive: true });
  const cfg = join(HOME, "config.json");
  if (!existsSync(cfg)) writeFileSync(cfg, JSON.stringify({ defaultMode: MODE, timeoutMs: 4000, decisions: {} }, null, 2) + "\n");
  const cred = join(HOME, "credentials");
  if (!existsSync(cred) && process.env.TYPESAFE_API_KEY) {
    writeFileSync(cred, `TYPESAFE_API_KEY=${process.env.TYPESAFE_API_KEY}\n`);
    chmodSync(cred, 0o600);
    log(`wrote ${cred} (mode 600) so hooks work when the agent's env lacks the key`);
  }
  log(`config ${cfg}; Jev log ${join(HOME, "jev.db")}`);
}

// ---------- Claude Code ----------
const CC_EVENTS: { event: string; matcher?: string }[] = [
  { event: "PreToolUse", matcher: "Bash|Read|Write|Edit|MultiEdit|WebFetch|Agent|Task|mcp__.*" },
  { event: "PostToolUse", matcher: "Bash|Read|Write|Edit|MultiEdit|WebFetch|mcp__.*" },
  { event: "PostToolUseFailure", matcher: "Bash" },
  { event: "Stop" },
  { event: "UserPromptSubmit" }, // stashes the prompt: the transcript can lag at PreToolUse time
];

function claudeCode() {
  const path = join(homedir(), ".claude", "settings.json");
  const s = readJson(path, {});
  s.hooks ??= {};
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = (s.hooks[ev] as any[])
      .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h: any) => !isOurs(h) && !(REPLACE_PROMPT && !UNINSTALL && isPromptHook(h) && ["PreToolUse", "PostToolUseFailure"].includes(ev) && g.matcher === "Bash")) }))
      .filter((g) => g.hooks.length);
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (!UNINSTALL) for (const { event, matcher } of CC_EVENTS) {
    (s.hooks[event] ??= []).push({ ...(matcher ? { matcher } : {}), hooks: [{ type: "command", command: cmd("claude-code", event), timeout: 15 }] });
  }
  writeJson(path, s);
  if (NO_MCP) return;
  const mcp = UNINSTALL ? ["mcp", "remove", "--scope", "user", "jev-tools"] : ["mcp", "add", "--scope", "user", "jev-tools", "--", BUN, join(SKILL, "mcp", "server.ts")];
  if (DRY) return log(`would run: claude ${mcp.join(" ")}`);
  const r = Bun.spawnSync(["claude", ...mcp]);
  log(`claude ${mcp.slice(0, 4).join(" ")}: ${r.exitCode === 0 ? "ok" : r.stderr.toString().trim()}`);
}

// ---------- Cursor (~/.cursor; the CursorPlugin repo picks it up via `./sync.ts Cursor From Central`) ----------
const CURSOR_EVENTS: { event: string; matcher?: string; extra?: Record<string, unknown> }[] = [
  { event: "beforeSubmitPrompt" }, // stashes the prompt (IDE); headless cursor-agent never fires it
  { event: "beforeShellExecution" },
  { event: "beforeMCPExecution" },
  { event: "preToolUse", matcher: "Read|Write|StrReplace|Task|MCP:browser_.*" }, // Shell/MCP gates live in before*Execution
  { event: "postToolUse", matcher: "Shell|Read|Write|StrReplace|WebFetch|MCP:.*" },
  { event: "postToolUseFailure", matcher: "Shell" },
  { event: "afterAgentResponse" },
  { event: "stop", extra: { loop_limit: 1 } },
  { event: "subagentStart" },
];
// Relative to ~/.cursor, like the existing `bun ./hooks/...` entries; the same text then works from the plugin root and
// /opt/prasham-cursor once From Central copies it into the repo and the image bakes it.
const CURSOR_CMD = (event: string) => `bun ./skills/jev-harness/adapters/cursor/run.ts ${event}`;

function cursorAgent() {
  const cursorHome = join(homedir(), ".cursor");
  // 1. Skill: symlink so local edits stay live; From Central's `rsync -L` turns it into real files in the repo.
  const link = join(cursorHome, "skills", "jev-harness");
  if (UNINSTALL) {
    if (existsSync(link) && lstatSync(link).isSymbolicLink()) { if (DRY) log(`would remove ${link}`); else { unlinkSync(link); log(`removed ${link}`); } }
  } else if (!existsSync(link)) {
    if (DRY) log(`would link ${link} -> ${SKILL}`);
    else { mkdirSync(dirname(link), { recursive: true }); symlinkSync(SKILL, link); log(`linked ${link} -> ${SKILL}`); }
  }

  // 2. ~/.cursor/hooks.json
  const hpath = join(cursorHome, "hooks.json");
  const s = readJson(hpath, { version: 1, hooks: {} });
  s.hooks ??= {};
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = (s.hooks[ev] as any[]).filter((h) => !isOurs(h) && !(REPLACE_PROMPT && !UNINSTALL && isPromptHook(h) && ["beforeShellExecution", "postToolUseFailure"].includes(ev)));
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (!UNINSTALL) for (const { event, matcher, extra } of CURSOR_EVENTS) {
    (s.hooks[event] ??= []).push({ command: CURSOR_CMD(event), timeout: 15, ...(matcher ? { matcher } : {}), ...(extra ?? {}) });
  }
  writeJson(hpath, s);

  // 3. ~/.cursor/mcp.json — ${env:HOME} keeps the path portable to the image. Verified: cursor-agent does NOT expand ${userHome}.
  if (!NO_MCP) {
    const mpath = join(cursorHome, "mcp.json");
    const m = readJson(mpath, { mcpServers: {} });
    m.mcpServers ??= {};
    if (UNINSTALL) delete m.mcpServers["jev-tools"];
    else m.mcpServers["jev-tools"] = { command: "bun", args: ["${env:HOME}/.cursor/skills/jev-harness/mcp/server.ts"] };
    writeJson(mpath, m);
  }
  log("Cursor: this machine is done. For Cloud Agents: `cd ~/Code/CursorPlugin && ./sync.ts Cursor From Central`, commit, tag the image.");
}

// ---------- Antigravity ----------
function antigravityAgent() {
  const root = join(homedir(), ".gemini", "config");
  const path = join(root, "hooks.json");
  const s = readJson(path, {});
  delete s["jev-harness"];
  if (!UNINSTALL) s["jev-harness"] = {
    PreToolUse: [{ matcher: "run_command|view_file|write_to_file|replace_file_content|call_mcp_tool|read_url_content", hooks: [{ type: "command", command: cmd("antigravity", "PreToolUse"), timeout: 15 }] }],
    PreInvocation: [{ type: "command", command: cmd("antigravity", "PreInvocation"), timeout: 15 }],
    Stop: [{ type: "command", command: cmd("antigravity", "Stop"), timeout: 15 }],
  };
  writeJson(path, s);
  if (NO_MCP) return;
  const mpath = join(root, "mcp_config.json");
  const m = readJson(mpath, { mcpServers: {} });
  m.mcpServers ??= {};
  if (UNINSTALL) delete m.mcpServers["jev-tools"]; else m.mcpServers["jev-tools"] = { command: BUN, args: [join(SKILL, "mcp", "server.ts")] };
  writeJson(mpath, m);
}

if (!UNINSTALL) installHome();
const targets: Record<string, () => void> = { "claude-code": claudeCode, cursor: cursorAgent, antigravity: antigravityAgent };
for (const [name, fn] of Object.entries(targets)) if (AGENT === "all" || AGENT === name) { log(`— ${name}`); fn(); }
if (!DRY && !UNINSTALL) log("Restart running agent sessions to pick up hooks.");
