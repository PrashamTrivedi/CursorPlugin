---
name: completework
description: Complete and finalize task work with validation and documentation updates
disable-model-invocation: true
---

---
allowed-tools: Bash(git:*), FileSystem, Bash(npm:*), Bash(yarn:*), Bash(build:*), Bash(test:*), Bash(lint:*)
description: Complete and finalize task work with validation and documentation updates
---

Confirm the code changes and documentation updates for a task

## Grok supervises Composer

Parent chat is the supervisor (Grok). Delegate mechanical close-out to Task
(`generalPurpose`, `model: composer-2.5-fast`):

- typecheck / test / lint and mechanical fixes to make them green
- docs/changelog updates
- walkthrough draft
- running the **testcase** skill (write/update tests)

Keep in the parent:

- whether the diff satisfies `taskFindings.md`
- review-loop stop / escalate (zero findings vs 5-pass / rising counts)
- `/security-review` judgment
- backend vs frontend next step
- push / release recommendation

If Composer reports green but the diff misses acceptance criteria, treat it as
failed — do not ship on test green alone.

## Arguments

- Directory Name: This is the name of the directory or task where
  taskFindings.md file is located. This is used to understand the context of the
  task and where to write the findings.

- Work mode: Backend or others

## Autonomous Mode Detection

**IMPORTANT:** Operate in AUTONOMOUS MODE if `$ARGUMENTS` contains
`mode: autonomous`.

In autonomous mode:

- Do NOT ask for user confirmation - proceed with best practices
- Do NOT wait for user input - make decisions and continue
- Use standard build/test commands: `npm run build`, `npm run typecheck`,
  `npm test`
- If directory name is missing, try to infer from context or fail gracefully

## Context and files

### Check if in git repository

- Is git repo: `test -d .git && echo "true" || echo "false"`

- Task context: @taskNotes/{ArgumentDirectoryName}/taskFindings.md
- Current commit: @taskNotes/{ArgumentDirectoryName}/currentCommitHash. Ignore
  this if you are not in git repository

## Steps

- Make sure the $ARGUMENTS pass the directory name:
  - **In autonomous mode:** Infer from context (check taskNotes/ directory) or
    fail with clear error
  - **In interactive mode:** Ask user before proceeding

- Read the uncommitted changes, read Task Context if it exists.

- If taskFindings.md doesn't exist:
  - **In autonomous mode:** STOP and report error - cannot proceed without plan
  - **In interactive mode:** Ask user to run `/codePlanner` slash command

- If you are in git repository, Read current commit, and then get list and code
  changes between latest commit and currentCommit mentioned in the file. If not
  in git repository, check for any recent file changes. Read the code carefully,
  think and confirm if changed code satisfies the requirements or not.

- Try to build the codebase. And run other commands to verify the changes built
  successfully.
  - **In autonomous mode:** Use standard commands: `npm run typecheck`,
    `npm run build`, `npm test`. If these fail, try to fix automatically.
  - **In interactive mode:** If commands are not provided, ask user to provide
    them one at a time before proceeding. If the command fails, consider that
    the code doesn't satisfy requirements.

- If the changed code doesn't satisfy the requirements, or any of the above
  command fails, think hard what needs to be done in one shot to satisfy the
  requirements. And fix it till the code satisfies the requirements and all the
  commands run successfully.

- Run a review/fix cycle on the diff, recording the finding count after each pass
  to `taskNotes/{ArgumentDirectoryName}/review-passes.md`.
  - Pass 1: `/code-review max --fix` — the deep pass, surface the most here.
  - Pass 2+: `/code-review high --fix` — confirm fixes, catch spawned issues.
  - Stop at zero findings.
  - Stop at 5 passes, or when two successive counts are equal or rising — the
    fixer cannot resolve that class. Print the remaining findings and escalate to
    the user. Do NOT continue.

- Run `/security-review` on the diff. Agent-authored multi-file changes leak
  vulnerabilities through change interactions, not single lines. Fix what you can,
  surface what needs product judgment.

### Driving the verify loop with `/goal` (autonomous mode)

The build loop and the bounded review loop above are the iterate-until-condition
shape `/goal` is built for. In autonomous mode, collapse them into one
self-continuing loop instead of manually re-running each step. Requires Claude
Code v2.1.139+; pair with auto mode.

- Set a single goal covering both proofs:

  ```
  /goal For task <ArgumentDirectoryName>: echo to the transcript that
  `npm run typecheck`, `npm run build`, and `npm test` all exit 0, AND that the
  review loop has terminated — either a pass reporting zero findings, or an
  escalation line after 5 passes / two non-decreasing counts. Fix code until all
  four proofs are present in the transcript; do not stop before then. Or stop
  after 30 turns.
  ```

- **Echo every result into the transcript** — the goal evaluator (Haiku) judges
  only what it can see in the conversation, not files. Print exit codes, the
  test summary, and each review pass's finding count.
- The goal auto-clears once satisfied; then continue below. Use `/goal clear` to
  abort.

### Verifying the tail with a second `/goal`

The tail steps succeed in files, which is transcript-provable the moment you echo
them. Once the goal above clears, set a second one so the tail keeps the same
self-continuation the implementation had:

```
/goal For task <ArgumentDirectoryName>, the transcript must show: `wc -l
taskNotes/<name>/taskWalkthrough.md` returning a non-zero count, the first 5
lines of backend-validation.md (or frontend-validation.md), and the changed-file
coverage percentage from the test run. Do not stop until all three appear. Or
stop after 15 turns.
```

Echo each artifact as you produce it. Without this goal a mid-tail stop is
silent — tests are green and the code is committed, so the session reads as
successful while the walkthrough and validation are missing.

`parakh-testing` is deliberately not a proof here; it may run after deployment.

- Run the **testcase** skill against the `Validation` and `Acceptance Criteria`
  sections of taskFindings.md, scoped to this change. Verify three things:
  - Tests covering the criteria are NEW or CHANGED in this diff. An untouched
    test file means the criteria are unverified, whatever the suite reports.
  - Full suite: 0 failures.
  - Coverage of changed files: up to 95%. Do not chase past it.

  Write tests against the code as implemented here. This is not a spec-first
  track running alongside the work — it closes out the work.

- After that, invoke **qa-validator** agent.
  - For backend mode: Ask it to run integration test of latest change
  - For frontend mode: Ask it to test the site using browser mcp tools

- As the last step of the task, Make sure none of the documentation is missing
  or outdated. If anything is missing and outdated, update the documentation
  accordingly using **documentation-updater** agent. This includes README files,
  comments in the code, and any other relevant documentation.

- Commit any uncommitted files using the **Conventional Commit** skill to
  generate a proper commit message (only if in git repository).

- Once it's done running, check the output file.
  - For backend, it must be backend-validation.md file.
  - For frontend, it must be frontend-validation.md file.

- Create a walkthrough of the completed task, which contains the following
  - How to setup for the task, if it's backend, using curl commands, if it's
    frontend, using Steps in UI
  - What to run to verify the task end to end, including relevant curls and UI
    steps
  - What to verify, including database states, user states or other Curls that
    verifies the task is completed successfully for humans
  Save it to taskNotes/{ArgumentDirectoryName}/taskWalkthrough.md
  
- Run the `parakh-testing` skill to run the tests and collect the evidence for the given change.

- Read the files and think, are we ready to move to the next step? And based on
  it, think, be pragmatic and suggest the next step.
  - For backend, the next step should always be implementing frontend if there
    is a frontend task
  - For frontend, the next step should be releasing.

- IMPORTANT: Use the **Conventional Commit** skill for all commit messages.
  Commit messages should not include any description - single line only.

- Push the code (only if in git repository).
