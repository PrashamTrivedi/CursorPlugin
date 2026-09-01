---
name: git-smart-merge
description: Smart merge with intelligent conflict resolution and testing
disable-model-invocation: true
---

---
allowed-tools: Bash(git:*), Bash(npm:*), Bash(yarn:*), Bash(test:*), Bash(build:*)
description: Smart merge with intelligent conflict resolution and testing
---

# Smart merge with conflict resolution

Merge $ARGUMENTS (source branch) into current branch with intelligent conflict
resolution.

## Grok supervises Composer

Delegate to Task (`generalPurpose`, `model: composer-2.5-fast`): fetch, backup
branch, merge attempt, tests after a clean merge.

Parent keeps remaining conflicts, strategy choice, and any force-push decision.
If Composer cannot resolve a conflict mechanically, it must stop and list
hunks — do not invent a merge.

## Process

1. Fetch latest changes from origin
2. Create backup branch: `backup-merge-$(date +%s)`
3. Attempt merge with strategy options
4. If conflicts exist:
   - Analyze conflict patterns
   - Suggest resolution strategies
   - Apply automated fixes for simple conflicts
   - List remaining manual conflicts with context
5. Run tests if available
6. Provide rollback instructions

## Report

- Merge status and strategy used
- Conflicts resolved automatically vs manually
- Test results
- Rollback command if needed
