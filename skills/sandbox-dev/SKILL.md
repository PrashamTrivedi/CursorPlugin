---
name: sandbox-dev
description: End-to-end autonomous development in the current session. Proactively use when the user says "sandbox dev", "dev this", "implement this", or provides a task/issue to work on autonomously.
disable-model-invocation: true
---

---
allowed-tools: Bash, Write, Read, Edit, Grep, Glob, Task, WebSearch, WebFetch, TodoWrite, mcp__github__*, Bash(gh:*), Bash(npm:*), Bash(npx:*), Bash(git:*), Bash(bun:*), Bash(pnpm:*)
description: End-to-end autonomous development in the current session. Proactively use when the user says "sandbox dev", "dev this", "implement this", or provides a task/issue to work on autonomously.
---

# Sandbox Dev - In-Session Autonomous Development

Everything runs end-to-end in this session — no Docker, no tmux. On **Cursor Cloud
Agents**, permissions are managed by the dashboard and environment config — assume
unattended execution. If a tool call is blocked by permissions, stop and ask the
user to adjust the environment configuration rather than working around it.

**Flow:** Plan → Digest & Checkpoint → Implement → Complete

---

## PHASE 0: PREFLIGHT

Confirm the session can run unattended. On Cursor Cloud Agents this is the default;
in the IDE, it means auto-approve / YOLO mode is on (so the flow is not stalled by
per-call prompts).

If tool calls have been running without prompts, announce `mode: cursor
(unattended assumed)` in one line and proceed to Phase 1.

If calls are being blocked or prompting, STOP and say:

```
This skill needs an unattended permission mode. Enable one:
  • Cursor Cloud Agent — permissions are dashboard-managed (default unattended)
  • Cursor IDE        — turn on auto-approve / YOLO mode in settings
```

Stay inside the workspace you started in — a wander into `~/`, `/etc`, or a
sibling repo reads as scope escalation and gets blocked. Never reword, encode, or
indirect a command to get past a permission denial. If the plan genuinely needs
blocked operations, stop and ask the user to adjust the environment rather than
fight it.

If `taskNotes/{task-name}/taskFindings.md` already exists for this task, skip to
Phase 3.

---

## PHASE 1: PLANNING

Invoke the **codeplanner** skill with the github-ticket-id or task description.

**CRITICAL:** Do NOT ask the user to review, and do NOT wait for approval here.
Go straight to Phase 2.

---

## PHASE 2: PLAN DIGEST & HUMAN CHECKPOINT

Read the plan. Its `Original Ask` h2 section holds the user's requirements; the
rest is the implementation plan. Analyze one against the other and extract facts
only — no opinions, no recommendations. Respond in this EXACT format:

---
**📋 Plan Digest: {task-name}**

| Signal | Value |
|--------|-------|
| Complexity | Score and summarized reason |
| Gaps found | {list} OR "None" |
| Edge cases | {list} OR "None" |
| Potential bugs | {list} OR "None" |
| Simplifications possible | {yes/no} + brief explanation |
| External deps added | {list} OR "None" |
| Highest risk | {single riskiest part of the plan} |
| Files touched | {count}: {comma-separated list} |
| New abstractions | {count}: {names} OR "None" |
| Existing code modified | {Yes — what / No — additive only} |

**Rejected alternatives:** {simpler approaches considered but skipped, with the stated reason — or "None mentioned"}

**Watch for:** {schema migrations, auth changes, new patterns, broad refactors — or "Nothing unusual"}
---

Then show `Ready? [g]o · [t]weak: {feedback} · [r]eject/show full plan` and
**WAIT.** Do not proceed autonomously.

| Input | Action |
|---|---|
| `g`, `go`, `yes`, 👍 | Proceed to Phase 3 |
| `t: {feedback}` | Update taskFindings.md, re-extract, present again |
| `r`, `reject`, `plan`, `show` | Display full taskFindings.md, wait |
| `stop`, `cancel` | Abort |

---

## PHASE 3: IMPLEMENTATION

Invoke the **startwork** skill with the taskFindings.md path, branch name, and
`mode: autonomous`.

`mode: autonomous` tells startwork to skip confirmations, because the permission
mode is already gating the risky calls.

### Optional: Goal Envelope

You MAY set a session goal to supervise the autonomous stretch. It backstops a
premature "done" — if startwork or completework return while tests are red, the
goal evaluator pulls control back instead of marching on to Phase 5.

Call `CreateGoal` (from the `cursor` dynamic namespace) with the objective:

```
CreateGoal: "implementation from taskFindings.md is complete: the full test suite output shows 0 failures, the lint/typecheck step exits clean, and every acceptance criterion in Original Ask is satisfied. Or stop after 25 turns."
```

The goal auto-continues turns until the condition is met. Use `UpdateGoal` to
abort early (e.g. set status to `complete` when done, or to clear when stopping).

Two constraints, both easy to get wrong. Set it only AFTER Phase 2 approval — it
auto-continues turns and would blow straight through the human gate. And phrase
the condition against evidence the turns actually print, because the evaluator
only judges the transcript and never runs commands itself.

---

## PHASE 4: COMPLETION

Invoke the **completework** skill with the task-name and `mode: autonomous`.

---

## PHASE 5: FINALIZE

Summarize what was done: files created and modified, key decisions, test results,
and any caveats or follow-ups.

For work that splits into independent parallel tracks, use the team-build skill
instead of this one.
