---
name: verify
description: Check memory files for staleness, placeholders, and inconsistencies
user-invocable: true
---

Verify the health and freshness of project memory.

Steps:
1. Use `tt-b_memory_verify` MCP tool to run all built-in checks.
2. Report results grouped by check type:
   - **Stale entries** — memory claims that contradict current code
   - **Placeholders** — template text that was never filled in
   - **Missing files** — expected memory files that don't exist
   - **Orphan references** — mentions of files or symbols that no longer exist
3. For each issue found, suggest a concrete fix (update, remove, or fill in).
4. If everything is clean, confirm that memory is consistent.

This is a read-only diagnostic. It does not modify any files.
