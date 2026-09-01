---
allowed-tools: Bash(git:*), FileSystem, Bash(npm:*), Bash(yarn:*), Bash(build:*), Bash(test:*), Read, Write, Edit, MultiEdit, Bash(ls:*), Bash(git:*), Bash(tree:*),Bash(grep:*), Bash(cat:*), Bash(find:*), Bash(gh:*)
description: Start or continue working on a planned task with proper branch management
model: composer
---

Start or continue working on a task.

This is the **unsupervised** cheap path: implement the plan yourself. Use
`/startWork` on Grok when you want Composer slices reviewed between
checkpoints.

## Arguments provided by user in $ARGUMENTS

- Directory Name: This is the name of the directory or task where
  taskFindings.md file is located. This is used to understand the context of the
  task and where to write the findings.

- Should work in same branch or separate branch.

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

## Steps

- Auto-detect if working directory is clean

- Smart branch naming with ticket prefixes

- Automatic dependency checking:
  The **Dependency Auditor** skill will automatically check for outdated packages
  and security vulnerabilities. Only warn if there are critical security issues
  or major version changes, do not stop the flow.

- If it doesn't exist, ask user to run `/codePlanner` slash command. As of now
  you don't have the ability to run the command yourself.

- Ask the user if they want to work on a separate branch or not (only if in git
  repository). Present your recommendation based on below criteria.
  - For complexity 3 or less, working in same branch is fine.
  - For complexity 4 or more, working in separate branch is recommended.
  - For complexity 3 or less and already in separate branch, recommend to
    continue in the same branch.

- If they confirm and you are in git repository, make sure to check-out latest
  version of main, CREATE NEW branch with same name as ${ArgumentDirectoryName}.

- If the user doesn't confirm or not in git repository, continue in the current
  branch. But make sure it is the latest version of main if in git repository.

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

- Complete the development of the task as per the findings Task Contents if
  applicable.

- IMPORTANT: Use the **Conventional Commit** skill to generate commit messages.
  Commit messages should not include any description - single line with emoji and
  type only.

- Once the work is done, typechecked and tested, Ask the user to run
  `/completeWork` slash command to complete the work.

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
