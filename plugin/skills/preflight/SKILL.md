---
name: preflight
description: Detect the current host CLI, model, and capability tier
user-invocable: true
---

Run a model preflight check to identify the current environment.

Steps:
1. Use `tt-b_preflight` MCP tool (or run `node .claude/bin/model-preflight.js --text` if MCP is unavailable).
2. Display the results:
   - **Host** — which CLI is active (Claude Code, Codex, OpenCode, etc.)
   - **Model** — the detected model identifier
   - **Source** — where the model was determined from (CLI arg, env var, config file)
   - **Capability tier** — architect_orchestrator, engineering_executor, reader_or_tester, or unknown
   - **Startup mode** — the recommended execution strategy for this capability
3. If the model is `unknown`, explain what that means and suggest how to set it.
4. Briefly explain what the detected capability tier allows (planning only, full editing, read-only, etc.).
