---
allowed-tools: Bash(git:*)
description: Sync branch with main/master while preserving local commits safely
model: sonnet
---

# Sync branch with main/master

Sync current branch with $ARGUMENTS (default: main) while preserving local
commits.

## Process

1. Stash any uncommitted changes
2. Fetch origin
3. Rebase current branch onto $ARGUMENTS
4. Handle rebase conflicts intelligently
5. Restore stashed changes
6. Push force-with-lease if requested

## Safety

- Create backup branch before rebase
- Provide recovery commands
- Warn about force-push implications
