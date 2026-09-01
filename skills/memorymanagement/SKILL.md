---
name: memorymanagement
description: Organize CLAUDE.md rules into proper locations — root vs subdirectory placement
disable-model-invocation: true
---

---
allowed-tools: Bash(git:*), Bash(tree:*), Bash(ls:*), Bash(grep:*), Bash(cat:*), Bash(find:*), Bash(gh:*), mcp__memory-server_*, mcp__jina_*, FileSystem
description: Organize CLAUDE.md rules into proper locations — root vs subdirectory placement
---

Cleanup/Update the CLAUDE.md files and put proper memories in proper places

## Requirements

Everything's in the root directory claude.md file. Help me out. Take what you
know about this codebase and do an investigative research and figure out where
all the rules should live.

Here are some pointers

- A Rule common for entire project: Lives in ProjectRoot/CLAUDE.md
- A Rule common for a subdirectory: Lives in subdirectory/CLAUDE.md
- If a rule lives on subdirectory, it should not be in root directory.
- DO NOT REFERECENCE Subdirectory Claude.md from root, our agentic system is
  capable of picking it up when needed.

Use your own dilligence to create or update CLAUDE.md files. Do not write extensive details, just focus on what minimum is needed to be known for the agent to work
properly.
