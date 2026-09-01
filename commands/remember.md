---
description: Save or retrieve something in Memory Server
argument-hint: [what to remember or search]
---

# Remember

User request: $ARGUMENTS

1. Read `skills/memory-server/SKILL.md`.
2. If this is a search, call `find_memories` on `user-memory-server`.
3. If this is a save, search for near-duplicates first, then `add_memory` with hierarchical tags.
4. Confirm what was stored or found (id + tags), not a dump of the full content unless asked.
