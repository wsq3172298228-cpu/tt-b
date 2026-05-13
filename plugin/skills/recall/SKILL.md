---
name: recall
description: Search project memory for past decisions, facts, and context
argument-hint: "<what to search for>"
user-invocable: true
---

Search project memory for: $ARGUMENTS

Steps:
1. Use `tt-b_memory_search` MCP tool with `pattern` set to the search query.
2. Also read `tt-b_memory_read` with `name: knowledgeGraph` and `name: sessionState` for full context.
3. Group results by source file (knowledge-graph vs session-state).
4. Highlight entries that directly match the query.
5. If no results found, suggest alternative search terms.

Never fabricate memory entries. Only report what is actually stored.
