---
allowed-tools: Bash(git:*), Bash(npm:*), Bash(yarn:*), Bash(test:*), Bash(build:*)
description: Emergency hotfix workflow with fast-track testing and deployment
---

# Emergency hotfix workflow

Create hotfix branch for $ARGUMENTS from production.

## Process

1. Create hotfix branch from main/master
2. Apply fix for $ARGUMENTS
3. Run critical tests only
4. Create hotfix commit with proper message
5. Prepare for immediate merge to main
6. Generate deployment checklist
7. Create backport instructions

## Safety

- Minimal changes only
- Fast-track testing
- Clear rollback plan
