---
name: brainstorm
description: Brainstorm the requirement to finalize requirements.
disable-model-invocation: true
---

---
allowed-tools: Bash(git:*), Bash(tree:*), Bash(ls:*), Bash(grep:*), Bash(cat:*), Bash(find:*), Bash(gh:*), mcp__memory-server_*, FileSystem
description: Brainstorm the requirement to finalize requirements.
argument-hint: Raw taks Ideas.
---

# Purpose

Brainstorm the user's requirement to finalize the specs for next work.

## Argument.

The raw ideas from the user, they are pure requirements, and not the solid
specs.

## Workflow

- Understand the requirements, what the user wants to achieve.

- Read the codebase to understand the current state.

- Use agents to find online about some ideas user discuss.

- Once you have raw idea, use the `AskQuestion` tool to ask the user to help
  determining the final scope.

- Use the answer to add it into your understanding.

- Based on your understanding, find some blindspots, gaps and ask the user to
  clarify them.

- Once you have enough clarification consider this as requirements.

- The requirements should be written without any technical details.

- Write the final requirements into `taskNotes/{task-name}/requirements.md` file.
