---
name: memory-server
description: Personal knowledge base for storing code, architecture decisions, and research findings. Use when the user says remember this, save to memory, find in memory, or asks what was learned about a topic. Prefers the memory-server MCP over inventing prior context.
---

# Memory Server

Knowledge base MCP at `https://memories-api.prashamhtrivedi.app/mcp`.

Prefer namespace `user-memory-server`. Discover tools before calling.

## When to use

- User says remember / save to memory / find in memory
- Cross-session facts, architecture decisions, research, snippets
- Before answering "what did we decide about X" — search first

Do not dump secrets, tokens, or LinkedIn cookies into memory.

## Tools

| Tool | Use |
|------|-----|
| `add_memory` | Save name + content; optional `url`, `tags`, `temporary` |
| `find_memories` | Search by query and/or tags |
| `list_memories` / `get_memory` | Browse or fetch by id |
| `update_memory` | Upsert; `tags` replaces, does not merge |
| `add_tags` | Append tags |
| `update_url_content` | Re-fetch stored URL |
| `promote_memory` / `review_temporary_memories` | TTL lifecycle |
| `list_tags` / `rename_tag` / `merge_tags` / `set_tag_parent` | Tag tree |

## Tags

Hierarchical `parent>child`: `cloudflare>workers`, `mcp>tools`, `kshetra>jobs`, `architecture>sop`.

1. `find_memories` before adding a near-duplicate
2. Save durable facts with specific tags
3. Use `temporary: true` for session scratch that should expire
