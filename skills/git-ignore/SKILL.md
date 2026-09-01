---
name: git-ignore
description: Add files and directories to git ignore with flexible targeting
disable-model-invocation: true
---

---
allowed-tools: FileSystem, Bash(ls:*), Bash(cat:*)
description: Add files and directories to git ignore with flexible targeting
model: haiku
---

# Ignore some files in git

Ignore some files in git.

## Arguments

- file and directory names: Comma-separated list of file names to ignore (e.g.,
  `*.log,*.tmp`)
- mode: .gitignore or .git/info/exclude (default: .gitignore)

## Process

Add the specified files and directories to the `.gitignore` or
`.git/info/exclude` file based on the mode
