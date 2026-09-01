---
name: git-find-commit
description: Find commits by message, author, file, or date criteria
disable-model-invocation: true
---

---
allowed-tools: Bash(git:*), Bash(grep:*)
description: Find commits by message, author, file, or date criteria
model: haiku
---

# Find commits by various criteria

Search commits using $ARGUMENTS (message/author/file/date range).

## Search Types

- Message: "find-commit 'fix login'"
- Author: "find-commit author:john"
- File: "find-commit file:auth.ts"
- Date: "find-commit since:2025-01-01"
- Mixed: "find-commit 'auth bug' author:sarah since:last-week"

## Process

1. Parse search criteria
2. Build appropriate git log command
3. Show matching commits with context
4. Provide links to diffs and files
5. Suggest related commits
