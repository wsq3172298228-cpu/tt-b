---
name: remember
description: Save an insight, decision, or fact to long-term project memory
argument-hint: "<what to remember>"
user-invocable: true
---

Save the following to the knowledge graph memory file using the `tt-b_memory_write` MCP tool.

Content to save: $ARGUMENTS

Steps:
1. Extract 2-5 searchable concepts (lowercased keyword phrases) from the content.
2. Identify any relevant file paths mentioned.
3. Read the current knowledge-graph memory via `tt-b_memory_read` with `name: knowledgeGraph`.
4. Append the new entry under an appropriate heading with a `- ` bullet, tagging it with the extracted concepts.
5. Write the updated content back via `tt-b_memory_write` with `name: knowledgeGraph`.
6. Confirm what was saved and list the tagged concepts.

If the MCP tool is unavailable, remind the user to:
1. Run `/plugin list` to confirm `tt-b` is enabled.
2. Restart Claude Code (`.mcp.json` only read on startup).
3. Check `/mcp` to verify the MCP server is connected.
