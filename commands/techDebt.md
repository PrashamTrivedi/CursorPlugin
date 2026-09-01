---
allowed-tools: Bash(find:*), Bash(grep:*), Bash(wc:*), Bash(npm:*), Bash(yarn:*), FileSystem
description: Identify and track technical debt across the codebase
---

## Context

- TODO comments:
  `grep -r "TODO\|FIXME\|HACK" --include="*.ts" --include="*.js" . | head -10`
- Large files:
  `find . -name "*.ts" -o -name "*.js" | xargs wc -l | sort -nr | head -10`
- Dependency vulnerabilities: `npm audit --audit-level=high`
- TypeScript errors: `npx tsc --noEmit 2>&1 | head -10`

Analyze codebase for technical debt, suggest refactoring opportunities.
