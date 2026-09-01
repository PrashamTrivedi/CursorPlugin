---
allowed-tools: Bash(git:*), Bash(tree:*), Bash(ls:*), Bash(grep:*), Bash(cat:*), Bash(find:*), Bash(gh:*), mcp__memory-server_*, FileSystem
description: Plan and analyze code tasks with comprehensive project understanding with help of Gemini CLI coding agent
argument-hint: github ticket id | task description
---

# Purpose

Understand the code and requirements we are working on with the help of Gemini
CLI.

## Arguments

- Task and/or Github Ticket ID: This can be mix and match, user may provide both
  task description and github ticket ID or just one of them.

## Workflow

- Understand the task and the requirements clearly. You don't need to analyse
  it, just understand the basic ask of the task so that you can pass proper
  information to Gemini CLI.

- Determine the correct path in agentDocs/gemini-logs directory where you will
  ask Gemini CLI to write the report.

- Invoke Gemini CLI with /codePlanner with exact requirements and the file path
  where it should write the report.

- Report the progress to the user.

- Once Gemini CLI is done, explain what Gemini has produced and the next steps.
