---
name: code-review
description: Automatic code review before commits and pushes. Use when code changes are about to be committed or when user requests review. Auto-applies before git operations to ensure code quality and security.
allowed-tools: Bash(git:*), FileSystem, Bash(npm:*), Bash(yarn:*), Bash(lint:*), Bash(test:*), Bash(build:*), Read, Grep, Glob, Task
---

# Code Review Skill

Runs **before** a commit is created, never as a general pass over freshly written
code. Triggers: the user says commit or push, a checkpoint commit during
`/startWork`, the final commit during `/completeWork`, or an explicit review
request.

## Scope of this skill vs its neighbours

- **checkpoint-validator runs the tests.** Don't run them here — verify that
  tests exist for new behaviour and that they cover the edge cases.
- **conventional-commit owns the message format.** This skill only judges code.
- **git-best-practices performs the commit**, and aborts if this review blocks.

## Process

Read the change: `git diff --cached --stat`, falling back to `git diff` when
nothing is staged. Then review it, and run the project's own gates:

```bash
npm run lint --silent 2>&1 || true
npm run typecheck --silent 2>&1 || true
```

Escalate to the **security-code-reviewer subagent** — passing it the changed
files, the diff, and task context — when any of these hold:

- the diff touches auth, login, payment, credential, or API-key files
- it contains `eval(`, `exec(`, `dangerouslySetInnerHTML`, raw SQL, or crypto work
- the change exceeds 500 lines
- the user asked for a deep security review

If `taskFindings.md` exists, also check the change against its acceptance
criteria and flag scope creep.

## Verdict

**Block** on: hardcoded secrets or credentials, critical vulnerabilities, lint or
type errors that can't be auto-fixed, failing tests, and unapproved breaking
changes. Anything else is a warning — report it and let the commit proceed.

Auto-fix the mechanical things (formatter, `eslint --fix`, import order) and say
what you fixed. Never auto-fix logic.

Report as a short verdict line, then the findings that earned it — each with
file:line and the fix. No score tables, no duration estimates.

## Relaxed cases

| Case | Treatment |
|---|---|
| User says "emergency" or "hotfix" | Lint and secrets only; still block on critical security issues |
| Commit message starts `WIP:` or `🚧 wip:` | Warn freely, block only on secrets and critical vulnerabilities |
| Docs-only diff | Check markdown formatting and links; pass |
| Config-only diff | Validate JSON/YAML syntax, scan for exposed secrets; pass |

If a linter or the subagent is unavailable, continue and say so in the output
rather than blocking on the missing tool.

## Escape hatch

"Commit anyway" or "override review" is the user's call to make. Warn once about
the specific risk, then allow it and note in your summary that review was
overridden.
