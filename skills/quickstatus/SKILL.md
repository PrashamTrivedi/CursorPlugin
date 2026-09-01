---
name: quickstatus
description: Quick project status overview with build and test status
disable-model-invocation: true
---

---
allowed-tools: Bash(git:*), Bash(npm:*), Bash(yarn:*), Bash(find:*), FileSystem
description: Quick project status overview with build and test status
model: haiku
---

## Context

- Git status: `git status --short`
- Current branch: `git branch --show-current`
- Uncommitted files: `git diff --name-only`
- Recent commits: `git log --oneline -3`
- Build status: `npm run build --silent 2>&1 | tail -5 || echo "No build"`
- Test status: `npm test --silent 2>&1 | tail -5 || echo "No tests"`
- Active tasks: Directory name from argument or `taskNotes` if not provided

Quick overview of project status, active tasks, and next steps.

## Consider following points to give the status

- Which tasks we're working on recently? (Hint: TaskNotes directory. Which one
  is created recently?)
  - Task Status from `taskNotesDirectory`
  - `taskFindings.md`: Analysis done
  - `currentCommitHash`: Work has started. Check commits between
    currentCommitHash and latest commit.
  - `backend-validation.md` or `frontend-validation.md` We thought work is
    completed, and verification is ongoing.
  - Remember, there can be more than one tasks ongoing
  - Ignore any tasks which are not complete and not touched in last 7 days.
