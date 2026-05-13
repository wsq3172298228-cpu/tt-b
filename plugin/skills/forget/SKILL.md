---
name: forget
description: Remove specific entries from project memory (requires confirmation)
argument-hint: "<what to forget>"
user-invocable: true
---

Remove entries matching: $ARGUMENTS

Steps:
1. First search using `tt-b_memory_search` MCP tool with the given pattern.
2. Show the user exactly which entries will be removed.
3. **Always require explicit user confirmation before proceeding.**
4. If confirmed, read the full memory file via `tt-b_memory_read`, remove the matching entries, and write back via `tt-b_memory_write`.
5. Confirm what was removed.

This is a destructive operation. Never delete without the user's explicit approval.
