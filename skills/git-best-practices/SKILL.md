---
name: git-best-practices
description: Autonomous git operations with intelligent conflict resolution and safety checks. Use when git operations are needed - branch management, merging, syncing, committing, pushing. Auto-applies when user mentions git operations or during workflow phases.
allowed-tools: Bash(git:*), Bash(npm:*), Bash(yarn:*), Bash(test:*), Bash(build:*)
---

# Git Best Practices Skill

Handles branch work, merges, syncs, commits, and pushes autonomously — during
`/startWork` and `/completeWork`, or whenever the user asks for a git operation
directly.

## House rules

- Branches are named `feature/issue-123-short-description`.
- Rebase feature branches onto their base; merge when integrating into main.
- Before any merge or rebase, cut a backup: `git branch backup-merge-$(date +%s)`.
  Name it in your report so the rollback is one command away.
- `--force-with-lease`, never `--force`, and never either one against main or
  master.
- Never stage secrets — `.env`, credential files, key material.
- Never auto-commit while conflicts are unresolved.

## Division of labour

**conventional-commit** writes the message; don't compose one yourself.
**code-review** runs before the commit and can block it — if it blocks, stop.
**checkpoint-validator** runs the tests whose result gates the commit.

## Operation notes

Only the non-obvious parts:

- **Sync** — stash first, rebase onto the base branch, restore the stash after.
  Offer force-with-lease only if the user asks for the push.
- **Cleanup** — never delete the current branch, main, or any branch with a
  worktree attached. Print `git checkout -b <branch> <sha>` for each deletion so
  it can be undone, and confirm before deleting.
- **Hotfix** — branch from main, fast-track to critical tests only, then merge
  into **both** main and develop and tag the release.

## Consolidated commands

This skill covers what these commands do manually, and they remain available as
overrides: `/git:smart-merge`, `/git:sync-branch`, `/git:branch-cleanup`,
`/git:hotfix-flow`, `/git:blame`, `/git:find-commit`, `/git:ignore`.

## Recovery

Offer the relevant line whenever an operation goes sideways:

```bash
git reset --soft HEAD~1              # undo last commit, keep changes
git reset --hard backup-merge-<ts>   # restore from the backup branch
git merge --abort                    # abandon a conflicted merge
git rebase --abort                   # abandon a conflicted rebase
git checkout -b <branch> <sha>       # restore a deleted branch
```
