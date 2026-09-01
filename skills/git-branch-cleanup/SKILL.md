---
name: git-branch-cleanup
description: Clean up merged and stale branches with safety checks
disable-model-invocation: true
---

---
allowed-tools: Bash(git:*)
description: Clean up merged and stale branches with safety checks
model: haiku
---

# Clean up merged and stale branches

Remove merged branches and identify stale branches for cleanup.

## Process

1. List branches merged into main/master
2. Identify branches older than $ARGUMENTS days (default: 30)
3. Show current worktrees to avoid deletion
4. Interactive deletion with confirmation
5. Clean up remote tracking branches
6. Update .git/config if needed

## Safety

- Never delete current branch or main/master
- Skip branches with worktrees
- Provide restore commands for each deletion
