---
name: performance-audit
description: Audit codebase for performance improvements and optimization opportunities
disable-model-invocation: true
---

---
allowed-tools: Bash(git:*), FileSystem, Read, Write, Edit, MultiWrite, MultiEdit, Bash(npm:*), Bash(yarn:*), Bash(build:*), Bash(test:*), Bash(find:*), Bash(grep:*)
description: Audit codebase for performance improvements and optimization opportunities
---

Audit the codebase or changes for performance improvements and optimizations.

## Variables

- Mode: `task` or `codebase`.
- Directory Name: If `task`, the name of the directory or task where
  `taskFindings.md` file is located. This is used to understand the context of
  the task and where to write the findings. For `codebase`, the directory name
  is the root of the codebase.
- Report File Name: The name of the file where the report will be written,
  default to `performance-audit.md`.

## Process

- If there is a task mode, expect to find both `taskFindings.md` and
  `currentCommitHash` files in the directory.

- For the task mode, read the `taskFindings.md` file to understand the context
  of the task and the code changes made, and thoroughly understand the code
  changes between the latest commit and the current commit mentioned in the
  `currentCommitHash` file. That will be your context

- For the `codebase` mode, read the `git ls-files` output to understand the
  context of the codebase. And that will be your context.

- Analyse the codebase for performance improvements and optimizations. This
  includes:
  - Identifying bottlenecks in the code.
  - Suggesting improvements in algorithms and data structures.
  - Checking for unnecessary computations or redundant code.
  - Evaluating the use of caching mechanisms.
  - Reviewing database queries for efficiency.
  - Analyzing network calls and their impact on performance.
  - For client side code, checking for rendering performance, unnecessary
    re-renders, and optimizing the use of resources.
  - Code readability and maintainability is must. I don't care if the code is
    readable by machine or not, but if it is not readable by humans, that's a
    disaster.

- Write a report that contains both the problems identified and the solutions
  suggested in better to read format in given file.
