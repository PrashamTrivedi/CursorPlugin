---
name: git-blame
description: Intelligent git blame and history analysis for code investigation
disable-model-invocation: true
---

---
allowed-tools: Bash(git:*), GitHub
description: Intelligent git blame and history analysis for code investigation
model: composer
---

# Intelligent git blame and history analysis

Analyze code history for $ARGUMENTS (file/function/line range).

## Process

1. Git blame with context
2. Show commit history for specific lines
3. Identify original author and recent modificatons
4. Find related commits and PRs
5. Show file evolution timeline
6. Identify potential regression points

## Output

- Blame with commit context
- Related PRs and issues
- Code evolution patterns
- Potential problem commits
