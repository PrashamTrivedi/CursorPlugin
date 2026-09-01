#!/usr/bin/env bun
/**
 * Sync Cursor plugin files between this repo and ~/.cursor.
 *
 * Inspired by ClaudeCodeSettings/sync.ts, but Cursor-only.
 *
 *   ./sync.ts Cursor From Central   # ~/.cursor (+ Claude skills) → repo
 *   ./sync.ts Cursor To Central     # repo → ~/.cursor + local plugin symlink
 *
 * Defaults: agent=Cursor, direction=From, location=Central
 * Flags: --dry-run  --force
 */

import { $ } from "bun";
import { existsSync } from "fs";
import path from "path";

const PLUGIN_NAME = "prashams-development-setup";
const RSYNC_EXCLUDES = [
  "--exclude",
  "node_modules",
  "--exclude",
  ".git",
  "--exclude",
  ".DS_Store",
  "--exclude",
  "*.log",
  "--exclude",
  ".env",
  "--exclude",
  ".env.*",
];

const CLAUDE_SKILLS = [
  "cloudflare",
  "workers-best-practices",
  "wrangler",
  "durable-objects",
  "agents-sdk",
  "building-ai-agent-on-cloudflare",
  "building-mcp-server-on-cloudflare",
  "sandbox-sdk",
  "cloudflare-tunnel",
  "cloudflare-email-service",
  "cf-analytics-engine",
  "web-perf",
  "frontend-designer",
  "taste-design",
  "design-md",
  "shadcn-ui",
  "react-components",
  "enhance-prompt",
  "stitch-generate-design",
  "stitch-extract-design-md",
  "stitch-manage-design-system",
  "stitch-code-to-design",
  "stitch-extract-static-html",
  "stitch-upload-to-stitch",
  "stitch-loop",
  "parakh-testing",
  "playwright-cli",
  "cheap-browsing",
  "scaffolder",
  "code-review",
  "git-best-practices",
] as const;

function displayHelp() {
  console.log(`Usage: ./sync.ts [Cursor] [To|From] [Central|Project] [--dry-run] [--force]

Syncs Cursor plugin + user config between this repository and ~/.cursor.

Arguments:
  agentName  Cursor                         (only Cursor is supported)
  direction  To | From                      default: From
  location   Central | Project | PWD        default: Central

From Central  copies user Cursor config and Claude skills into this repo
              (dereferences symlinks so GitHub gets real files).
To Central    installs this plugin via symlink at
              ~/.cursor/plugins/local/${PLUGIN_NAME}
              and copies mcp.json, hooks, user skills, and commands into ~/.cursor.

Options:
  -h, --help     Show this help
  --dry-run      Print rsync plan; do not write
  --force        Skip the confirmation prompt

Examples:
  ./sync.ts
  ./sync.ts Cursor From Central
  ./sync.ts Cursor To Central --force
`);
}

const argv = Bun.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) {
  displayHelp();
  process.exit(0);
}

const dryRun = argv.includes("--dry-run");
const force = argv.includes("--force");
const positional = argv.filter((a) => !a.startsWith("-")).map((a) => a.toLowerCase());

const agentName = positional[0] ?? "cursor";
const direction = positional[1] ?? "from";
const location = positional[2] ?? "central";

if (agentName !== "cursor") {
  console.error("Invalid agentName. This repo only syncs Cursor.");
  displayHelp();
  process.exit(1);
}

if (direction !== "to" && direction !== "from") {
  console.error("Invalid direction. Must be 'To' or 'From'.");
  process.exit(1);
}

if (!["central", "project", "pwd"].includes(location)) {
  console.error("Invalid location. Must be 'Central' or 'Project'/'PWD'.");
  process.exit(1);
}

const repoRoot = path.dirname(Bun.main);
const homeDir = process.env.HOME;
if (!homeDir) {
  console.error("HOME is not set.");
  process.exit(1);
}

const cursorHome = path.join(homeDir, ".cursor");
const claudeSkills = path.join(homeDir, ".claude", "skills");
const frontendDesign = path.join(
  homeDir,
  ".claude/plugins/cache/claude-plugins-official/frontend-design/ed404106fcd8/skills/frontend-design",
);
const cfCommands = path.join(
  homeDir,
  ".cursor/plugins/cache/cursor-public/cloudflare",
);

function findCfCommand(name: string): string | null {
  if (!existsSync(cfCommands)) return null;
  const glob = new Bun.Glob(`*/commands/${name}`);
  for (const match of glob.scanSync({ cwd: cfCommands, onlyFiles: true })) {
    return path.join(cfCommands, match);
  }
  return null;
}

async function rsync(src: string, dest: string, opts: { delete?: boolean } = {}) {
  if (!existsSync(src)) {
    console.warn(`skip (missing): ${src}`);
    return;
  }
  await $`mkdir -p ${dest}`;
  const flags = ["-a", "-L"];
  if (opts.delete !== false) flags.push("--delete");
  if (dryRun) flags.push("--dry-run", "-v");
  await $`rsync ${flags} ${RSYNC_EXCLUDES} ${src}/ ${dest}/`;
}

async function rsyncFile(src: string, dest: string) {
  if (!existsSync(src)) {
    console.warn(`skip (missing): ${src}`);
    return;
  }
  await $`mkdir -p ${path.dirname(dest)}`;
  const flags = ["-a", "-L"];
  if (dryRun) flags.push("--dry-run", "-v");
  await $`rsync ${flags} ${src} ${dest}`;
}

async function confirm(message: string) {
  if (force || dryRun) return;
  const answer = prompt(`${message} [y/N] `);
  if (answer?.trim().toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }
}

async function fromCentral() {
  await confirm(`Copy Cursor/Claude config INTO ${repoRoot}?`);
  console.log(`From central → ${repoRoot}`);

  for (const name of CLAUDE_SKILLS) {
    await rsync(path.join(claudeSkills, name), path.join(repoRoot, "skills", name));
  }
  if (existsSync(frontendDesign)) {
    await rsync(frontendDesign, path.join(repoRoot, "skills", "frontend-design"));
  }
  await rsync(path.join(cursorHome, "skills"), path.join(repoRoot, "skills"), { delete: false });
  await rsync(path.join(cursorHome, "commands"), path.join(repoRoot, "commands"), { delete: false });
  await rsync(path.join(cursorHome, "hooks"), path.join(repoRoot, "hooks"));
  await rsyncFile(path.join(cursorHome, "hooks.json"), path.join(repoRoot, "hooks", "hooks.json"));

  const buildAgent = findCfCommand("build-agent.md");
  const buildMcp = findCfCommand("build-mcp.md");
  if (buildAgent) await rsyncFile(buildAgent, path.join(repoRoot, "commands", "build-agent.md"));
  if (buildMcp) await rsyncFile(buildMcp, path.join(repoRoot, "commands", "build-mcp.md"));

  // Keep plugin-owned skills/commands that live only in the repo
  // (memory-server, kshetra, remember, kshetra command) — rsync of ~/.cursor/skills
  // does not delete them unless --delete wipes unmatched names. Those dirs are
  // extra destinations; do not --delete the whole skills tree from cursor home.
}

async function toCentral() {
  const pluginLink = path.join(cursorHome, "plugins", "local", PLUGIN_NAME);
  await confirm(`Install plugin symlink at ${pluginLink} and copy mcp/hooks/skills/commands into ${cursorHome}?`);
  console.log(`To central ← ${repoRoot}`);

  await $`mkdir -p ${path.join(cursorHome, "plugins", "local")}`;
  if (!dryRun) {
    await $`ln -sfn ${repoRoot} ${pluginLink}`;
  } else {
    console.log(`dry-run: ln -sfn ${repoRoot} ${pluginLink}`);
  }

  await rsyncFile(path.join(repoRoot, "mcp.json"), path.join(cursorHome, "mcp.json"));
  await rsync(path.join(repoRoot, "hooks"), path.join(cursorHome, "hooks"));
  await rsyncFile(path.join(repoRoot, "hooks", "hooks.json"), path.join(cursorHome, "hooks.json"));
  await rsync(path.join(repoRoot, "skills"), path.join(cursorHome, "skills"));
  await rsync(path.join(repoRoot, "commands"), path.join(cursorHome, "commands"));
}

async function fromProject() {
  const cwd = process.cwd();
  await confirm(`Copy ${path.join(cwd, ".cursor")} INTO ${repoRoot}?`);
  console.warn(`This copies project .cursor into the plugin repo.`);
  await rsync(path.join(cwd, ".cursor"), path.join(repoRoot, "import-project-cursor"));
}

async function toProject() {
  const cwd = process.cwd();
  await confirm(`Copy plugin skills/rules/commands INTO ${path.join(cwd, ".cursor")}?`);
  await rsync(path.join(repoRoot, "skills"), path.join(cwd, ".cursor", "skills"));
  await rsync(path.join(repoRoot, "rules"), path.join(cwd, ".cursor", "rules"));
  await rsync(path.join(repoRoot, "commands"), path.join(cwd, ".cursor", "commands"));
}

try {
  if (direction === "from" && location === "central") await fromCentral();
  else if (direction === "to" && location === "central") await toCentral();
  else if (direction === "from") await fromProject();
  else await toProject();
  console.log(dryRun ? "Dry run complete." : "Sync complete.");
} catch (error) {
  console.error("Sync failed:", error);
  process.exit(1);
}
