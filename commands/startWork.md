---
allowed-tools: Bash(git:*), FileSystem, Bash(npm:*), Bash(yarn:*), Bash(build:*), Bash(test:*), Read, Write, Edit, MultiEdit, Bash(ls:*), Bash(git:*), Bash(tree:*),Bash(grep:*), Bash(cat:*), Bash(find:*), Bash(gh:*)
description: Start or continue working on a planned task with proper branch management
---

Start or continue working on a task.

## Arguments provided by user in $ARGUMENTS

- Directory Name: This is the name of the directory or task where
  taskFindings.md file is located. This is used to understand the context of the
  task and where to write the findings.

- Should work in same branch or separate branch.

## Autonomous Mode Detection

**IMPORTANT:** Operate in AUTONOMOUS MODE if `$ARGUMENTS` contains `mode: autonomous`.

In autonomous mode:
- Do NOT ask for user confirmation on branch strategy - use your recommendation
- Do NOT wait for user input - proceed immediately with best practices
- Do NOT ask user to run other commands - run them yourself or skip if not possible
- Make decisions based on complexity score and proceed

## Context and files

## Context

### Check if in git repository

- Is git repo: `test -d .git && echo "true" || echo "false"`

### Run these commands if you are in git repository

- Current git status:
  `test -d .git && git status --porcelain || echo "Not a git repository"`
- Current branch:
  `test -d .git && git branch --show-current || echo "Not a git repository"`
- Uncommitted changes:
  `test -d .git && git diff --name-only || echo "Not a git repository"`

### This must always be available to you.

- Task findings: @taskNotes/{ArgumentDirectoryName}/taskFindings.md

## Grok supervises Composer

Parent chat is the supervisor (Grok). Do **not** implement the whole task in
the parent, and do **not** switch the parent to Composer.

Composer can follow a written plan. It should not own branch strategy, scope
changes, or the go/no-go after a checkpoint. That is why `/startWork` stays on
Grok even though `/startWork-haiku` exists.

For each checkpoint-sized slice, spawn Task:

- `subagent_type`: `generalPurpose`
- `model`: `composer-2.5-fast`
- Prompt must include the `taskFindings.md` path, the files/acceptance for
  **this slice only**, and: do not change the plan, do not expand scope, stop
  when this slice is done.

After the Task returns, supervisor MUST:

1. Diff against `taskFindings.md` for this slice
2. Reject and re-prompt Composer if off-plan — do not continue
3. Run Checkpoint Validator, then Conventional Commit
4. Next slice, or `/completeWork` when the plan is covered

Keep in the parent (never Composer): missing-plan stop, branch strategy,
resume from `currentCommitHash`, go/no-go, invoking `/completeWork`.

## Steps

- Auto-detect if working directory is clean

- Smart branch naming with ticket prefixes

- Automatic dependency checking:
  The **Dependency Auditor** skill will automatically check for outdated packages
  and security vulnerabilities. Only warn if there are critical security issues
  or major version changes, do not stop the flow.

- If taskFindings.md doesn't exist:
  - In autonomous mode: STOP and report error - cannot proceed without plan
  - In interactive mode: Ask user to run `/codePlanner` slash command

- Branch strategy decision (only if in git repository):
  - For complexity 3 or less: working in same branch is fine
  - For complexity 4 or more: working in separate branch is recommended
  - Already in separate branch: continue in the same branch

  **In autonomous mode:** Apply the recommendation automatically without asking.
  **In interactive mode:** Ask the user to confirm.

- If separate branch is chosen/recommended and you are in git repository:
  Make sure to check-out latest version of main, CREATE NEW branch with same
  name as ${ArgumentDirectoryName}.

- If same branch is chosen or not in git repository:
  Continue in the current branch. Ensure it is up-to-date with main if in git
  repository.

- Before starting your work, write the current commit hash in
  `taskNotes/{ArgumentDirectoryName}/currentCommitHash` file only if you are in
  git repository.
- If the file already exists, that means the work is already started. Check the
  content of `taskNotes/{ArgumentDirectoryName}` directory.
  - Task Status from `taskNotesDirectory`
  - `taskFindings.md`: Analysis done
  - `currentCommitHash`: Work has started. Check commits between
    currentCommitHash and latest commit.
  - `backend-validation.md`: Backend work verified
  - `frontend-validation.md`: Frontend work verified
  - REMEMBER: Frontend don't start work untill verified backend contracts.
  - Staged files and unstaged files can also show the progress.
  - On resume ONLY: read `git diff {currentCommitHash}..HEAD --stat` before
    continuing. This is the one point where you are inheriting changes you did
    not observe. Not needed at any other checkpoint.

- Complete the development of the task as per the findings Task Contents if
  applicable.

- IMPORTANT: Use the **Conventional Commit** skill to generate commit messages.
  Commit messages should not include any description - single line with emoji and
  type only.

- Once the work is done, typechecked and tested:
  **In autonomous mode:** Automatically run `/completeWork` to finalize.
  **In interactive mode:** Ask the user to run `/completeWork` slash command.

### Driving the implement-until-green loop with `/goal` (autonomous mode)

In autonomous mode, instead of manually re-running typecheck/tests after each
change, set a `/goal` so the session self-continues until the final checkpoint
is green — no per-turn "keep going" needed. Requires Claude Code v2.1.139+ and
pairs best with auto mode (auto removes per-tool prompts; `/goal` removes
per-turn prompts).

- After the branch + `currentCommitHash` are set up, set the goal:

  ```
  /goal Implement task <ArgumentDirectoryName> per taskFindings.md, then print a
  final checkpoint where `npm run typecheck` exits 0 and the full `npm test`
  suite prints 0 failing tests. Do not stop until both exit codes / result lines
  are echoed in the transcript. Or stop after 25 turns.
  ```

- **Transcript-provable only:** the goal evaluator (Haiku) cannot read files — it
  only sees the conversation. So always **echo the actual command output**
  (exit codes, the test summary line) into the transcript; a green state that
  only exists on disk will never satisfy the goal.
- One goal is active per session; setting this replaces any prior goal. It
  auto-clears when met; use `/goal clear` to stop early.
- When the goal is achieved, proceed to `/completeWork` as above.

### Checkpoint Strategy

- Commit after each MAJOR component (not minor changes)
- Checkpoints: BACKEND API, MCP Integration, FRONTEND Integration
- Micro checkpoints:
  - Go up from Atomic unit of code to the complete Feature development, commit
    after each major component.
- After Each Checkpoint:
  - Use the **Checkpoint Validator** skill to:
    - Run incremental typecheck
    - Run tests only related to the changed files (not full test suite)
    - Generate validation report
- At Final Checkpoint:
  - Run typecheck before commits (not full build)
  - Full test suite ONLY at final checkpoint
