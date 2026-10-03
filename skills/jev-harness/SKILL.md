---
name: jev-harness
description: Jev (TypeSafe System One) decisions wired into Claude Code, Cursor and Antigravity hooks, plus a jev-tools MCP server — destructive/secret command gates, read narrowing, MCP output trimming, promise auto-continue, loop detection, memory dedupe across local files and memory-server, compaction advice, screenshot gate, semantic lint, subagent routing, injection screen. Every Jev call is logged with state, questions and answers to SQLite. Use when installing, tuning, debugging or extending these hooks, reading the decision ledger or jev.db, or when the user mentions jev-harness, Jev hooks, or cutting agent token cost with Jev.
---

# jev-harness

One skill, three agents. Decisions live once in `decisions/`; each agent gets a thin adapter in `adapters/<agent>/run.ts`.
Code lives in the skill folder; per-machine state (config, credentials, ledger, `jev.db`) lives in `~/.jev-harness/`.

## Distribution (where this skill lives)
- Canonical: `~/.claude/skills/jev-harness` (real files — user-authored skills live here; CLI-managed ones live in `~/.agents/skills`).
- `~/.agents/skills/jev-harness` → symlink here (same as `frontend-designer`); Antigravity app `~/.gemini/antigravity/skills/` and
  Antigravity CLI `~/.gemini/config/skills/` → symlinks to the `~/.agents` entry.
- Cursor (this machine): `~/.cursor` is the source of truth. Install links `~/.cursor/skills/jev-harness` here and adds hooks to
  `~/.cursor/hooks.json` as `bun ./skills/jev-harness/adapters/cursor/run.ts <event>` (relative, like the existing `./hooks/...`
  entries) plus `jev-tools` in `~/.cursor/mcp.json` with a `${env:HOME}` path (cursor-agent does not expand `${userHome}`) — nothing machine-specific.
- Cursor (Cloud Agents): `cd ~/Code/CursorPlugin && ./sync.ts Cursor From Central` copies all of that into the repo (`rsync -L`
  turns the skill link into real files), then commit and tag `cursor-dev-setup-vX.Y.Z`; the image bakes it under
  `/opt/prasham-cursor`. The installer never edits the repo itself.
- Cloud Agents: set `TYPESAFE_API_KEY` as a Cursor secret; `~/.jev-harness` (ledger, `jev.db`) is per pod and lost with it.
- Cursor loads both the plugin hooks and the `~/.cursor/hooks.json` copy, so one event can fire twice; `adapters/common.ts`
  dedupes identical payloads within 30 s (first process decides, the duplicate stays neutral).

## Install, verify, uninstall

```bash
cd ~/.claude/skills/jev-harness
bun install.ts --agent all --dry-run          # what would change
bun install.ts --agent all                    # shadow mode: log only, never act
bun install.ts --agent all --replace-prompt-hooks   # also drop the old prompt-type Bash safety/failure hooks
bun install.ts --agent all --uninstall        # removes exactly what install added (entries carry the adapters path)
bun test && bunx tsc --noEmit -p .            # 62 offline tests: decisions, adapter contracts, MCP server
```
Every config is backed up to `<file>.jev-harness.bak.<ts>` before a write. Restart agent sessions after install.

## Decisions (`decisions/`)

| Decision | Event | Claude Code | Cursor | Antigravity |
|---|---|---|---|---|
| shell-safety (destructive / secret value) | pre shell | deny / ask | deny / ask | deny / force_ask |
| outbound-leak | pre MCP / fetch | ask | ask (MCP) | ask |
| failure-triage | shell failure | context | context | — |
| promise-continue | stop | block + reason | stop followup (text stashed by afterAgentResponse) | Stop continue |
| read-budget (large full reads) | pre read | updatedInput range | updated_input range | overwrite StartLine/EndLine |
| mcp-trim | post MCP | updatedToolOutput (shaped like tool_response) | updated_mcp_tool_output | — |
| loop-detector | post shell / AG PreInvocation | context | context | ephemeralMessage |
| memory-hygiene (local files + rules + CLAUDE.md + memory-server) | pre memory write | ask | ask (MCP) | ask |
| compact-advisor | stop | systemMessage with `/compact <instructions>` | — | — |
| screenshot-gate | pre screenshot | deny | rewrite `take_screenshot_afterwards:false` / deny | — |
| semantic-lint | post edit | context | context | — |
| subagent-router | pre Agent / subagentStart | rewrite `model` | log only | — |
| injection-screen | post fetch/read/MCP | context | context | — |

Deliberately absent: Cursor `preCompact` and Antigravity `PostToolUse`.

## Config — `~/.jev-harness/config.json`

```json
{ "defaultMode": "shadow", "timeoutMs": 4000,
  "decisions": { "shell-safety": { "mode": "enforce", "thresholds": { "deny": 0.9, "ask": 0.7, "secret": 0.7 } },
                 "subagent-router": { "cheapModel": "sonnet" },
                 "compact-advisor": { "notice": 100000, "recommend": 140000, "request": 170000 } },
  "db": { "path": "~/.jev-harness/jev.db", "enabled": true },
  "memoryServer": { "url": "https://memories-api.prashamhtrivedi.app/api" } }
```
Modes: `off` | `shadow` (log, never act) | `enforce`. Promote one decision at a time after reading its rows.
Keys: `TYPESAFE_API_KEY` (env or `~/.jev-harness/credentials`, written 600 by install), optional `MEMORY_SERVER_API_KEY`.

## What gets recorded

- `~/.jev-harness/jev.db`, table `jev_calls`: one row per Jev call — `ts, agent, event, decision, mode, session_id, tool,
  model, state, questions, answers, input_tokens, latency_ms, status, error`. `state`, `questions`, `answers` are the JSON
  exactly as sent/received (errors keep state+questions, answers NULL). Query: `json_extract(answers,'$.needed.noul')`.
- `~/.jev-harness/ledger.jsonl`: one row per decision outcome — verdict, applied or not (shadow / unsupported), signals, skips.

```bash
sqlite3 ~/.jev-harness/jev.db "select decision, count(*), avg(latency_ms), sum(input_tokens) from jev_calls group by 1"
```

## jev-tools MCP server (`mcp/server.ts`)
`ask_jev_file`, `ask_jev_files` (+ globs, pruning, 255 cap), `pick_first_file`, `ask_jev` (state + paths + gated command).
The agent gets typed answers, never the file contents or command output.

## Agent contracts (verified live, 2026-10-03 — do not "simplify" these)
- Antigravity PreToolUse: `{}` DENIES the call. Neutral is `{"decision":"ask"}` (normal permission flow). Any malformed
  PostToolUse output replaces the tool result with an error — which is why there is no PostToolUse adapter.
- Cursor: permission hooks need valid JSON; `{"permission":"allow"}` does not bypass Cursor's approval. Hook payloads use
  `file_path`, transcripts use `path`. Headless `cursor-agent` sends `transcript_path: null` and fires no
  `beforeSubmitPrompt`, so task-dependent decisions (read-budget, mcp-trim, screenshot-gate) log `skip: no task context` there.
- Claude Code: `updatedToolOutput` must match the tool's output shape (Bash wants `{stdout, stderr, interrupted, isImage}`);
  `updatedInput` without `permissionDecision` is applied and permission rules still run. The prompt can lag in the transcript at
  PreToolUse, so `UserPromptSubmit` stashes it.
- `adapters/common.ts` always prints the adapter's neutral payload on exception, timeout or bad stdin, and exits 0.

## Extending
Add `decisions/<name>.ts` implementing `Decision` (`applies` = code-only prefilter, `run` = Jev via `ctx.ask`), register it in
`decisions/index.ts`, add a test with `fakeCtx`, and add the verdict to each adapter's `SUPPORTS` only where the agent can
express it. Keep questions narrow; keep thresholds in `ctx.threshold`.

Evidence behind each threshold: `~/claude-config-workspace/taskNotes/typesafe-*` and `jev-harness-plan.md`.
