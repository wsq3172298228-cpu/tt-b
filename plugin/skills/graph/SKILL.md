---
name: graph
description: Show the knowledge graph — all nodes and edges extracted from memory
user-invocable: true
---

Display the project knowledge graph extracted from memory.

Steps:
1. Use `tt-b_memory_nodes` MCP tool to get all nodes.
2. Use `tt-b_memory_edges` MCP tool to get all edges.
3. Present the graph in a readable format:
   - **Nodes** grouped by type (Domain, Module, File, Symbol, API, Decision, Risk, etc.)
   - **Edges** showing relationships (owns, imports, calls, depends_on, tested_by, etc.)
4. Highlight any isolated nodes (no edges) — these may be stale or need linking.
5. If the graph is empty, note that memory hasn't been populated yet and suggest using `/remember` to start building it.

This is a read-only view. It helps understand what the project "knows" about itself.
