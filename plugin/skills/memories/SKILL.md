---
name: memories
description: List all memory files with metadata (size, last modified, entry count)
user-invocable: true
---

List all project memory files and their metadata.

Steps:
1. Use `tt-b_memory_list` MCP tool to get all memory files with metadata.
2. Display a table with:
   - File name
   - Size (human-readable)
   - Last modified time
   - Approximate entry count (bullet points or headings)
3. Group by directory (knowledge-graph, session-state, snapshots).
4. If any files are unexpectedly large or old, flag them for review.
5. Suggest `/verify` if any files look stale, or `/snapshot` if no recent snapshot exists.
