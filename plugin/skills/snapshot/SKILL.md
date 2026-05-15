---
name: snapshot
description: Create a point-in-time snapshot of all project memory files
user-invocable: true
---

Create a snapshot of the current project memory state.

Steps:
1. Use `tt-b_memory_snapshot` MCP tool to capture all memory files.
2. Display a summary of what was captured:
   - Number of files snapshotted
   - Total size
   - Timestamp
3. Mention where the snapshot is stored (memory/snapshots/).
4. Suggest using `/diff` or `tt-b_memory_restore` if the user later needs to compare or roll back.

Snapshots are useful before major refactors or when experimenting with memory changes.
