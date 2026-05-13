---
name: session-history
description: Show the current execution cursor and recent session state
user-invocable: true
---

Show the current session state and execution cursor.

Steps:
1. Read session-state memory via `tt-b_memory_read` MCP tool with `name: sessionState`.
2. Display the content in a readable format:
   - Current user goal (if recorded)
   - Active plan
   - Files inspected
   - Files changed
   - Commands run
   - Failing tests
   - Open questions
   - Next concrete action
3. If the session state is empty or template-only, note that no active session is tracked.

Never fabricate session data. Only report what is actually stored.
