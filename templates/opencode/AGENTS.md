# Deep Engineering Memory

This project should be handled in deep engineering mode by default.

## Startup Contract

Before any non-trivial task:

1. Detect the active host CLI and effective model.
2. Read the canonical memory files:
   - `.claude/memory/knowledge-graph.md`
   - `.claude/memory/session-state.md`
3. Inspect `git status` and `git diff` when the repository is a git worktree.
4. Verify important memory claims against the real code before editing.
5. Choose the execution mode from the detected model capability.

If the repository is not a git worktree, record that fact and continue from filesystem evidence.

Canonical memory lives under `.claude/memory/`. Legacy mirrors, if any, are not the source of truth.

## Advisory Memory Reminder Hook

This workflow may register `.claude/settings.json` hooks that run
`.claude/bin/memory-reminder.js` on startup, resume, compaction, and substantial
user prompts.

The hook is advisory only. It injects reminder context, does not block prompts,
does not replace this startup contract, and can be ignored for trivial requests.

Before you start, always remember the constitution: users make mistakes, facts are always greater than empty words, and when there is only one truth, you want to answer in the affirmative, and give the user error correction, synchronous memory.

## Model Preflight

Use best-effort detection. If a value cannot be confirmed, mark it as `unknown` and fall back to safe probe mode.

### Host and model sources

- Claude Code CLI:
  - `claude --model <model>`
  - `CLAUDE_MODEL`, `MODEL`, session metadata, `.claude/settings*.json`, `~/.claude/settings*.json`
- Codex CLI:
  - `codex --model <model>`
  - `codex -c model="..."`, `CODEX_MODEL`, `MODEL`, `~/.codex/config.toml`
- OpenCode:
  - `opencode --model provider/model`
  - `OPENCODE_MODEL`, `MODEL`, session metadata, local config files

Use `.claude/bin/model-preflight.js` as the local helper for best-effort detection.

### Capability classes

- `architect_orchestrator`: high-level planning, risk review, knowledge graph updates, task decomposition, delegate orchestration
- `engineering_executor`: code reading, editing, tests, refactors, failure fixing
- `reader_or_tester`: bounded read-only investigation or targeted verification
- `unknown`: safe probe only

### Startup modes

- `restore-plan-delegate-verify-update-memory`
- `read-edit-test-report`
- `bounded-readonly-or-test`
- `safe_probe`

## Model-Aware Behavior

If the detected model is GPT-5.5 class or otherwise high-reasoning:

- read memory
- inspect repo state
- verify graph facts against code
- plan
- delegate bounded work when helpful
- review risks
- update long-term memory

If the detected model is an execution-focused model such as MiniMax-M2.7:

- read the task slice
- edit only within scope
- run tests
- report failures with concrete evidence
- do not rewrite long-term architecture unless explicitly assigned

Other highly inferring types are the following: deepseek-v4 series, glm5 series, claude opus series, mimo-v2.5-pro series.

If the model is unknown:

- stay read-only until the model can be confirmed
- do not assume capability from the host name alone

## Memory Recovery Protocol

When recovering context:

1. Reconstruct the current project graph:

   - domains
   - modules
   - files
   - symbols
   - APIs
   - data models
   - external services
   - tests
   - risks
   - decisions

2. Reconstruct the current execution cursor:

   - current user goal
   - active plan
   - files already inspected
   - files changed
   - commands run
   - failing tests
   - open questions
   - next concrete action

3. Do not trust memory blindly.

   - Treat memory as a map, not source of truth.
   - Verify important claims against actual code before editing.
   - Update memory when code contradicts previous assumptions.

4. Preserve and update memory after meaningful work.
   - Add new nodes.
   - Add new edges.
   - Update changed invariants.
   - Record decisions.
   - Record risks.
   - Record verification results.
   - Update the execution cursor.

## Memory Backup and Iteration

For complex tasks that modify knowledge-graph.md or session-state.md:

1. **Backup first**: Before iterating on memory files, copy the current version to a timestamped backup.
   - `knowledge-graph.md` → `knowledge-graph.backup.YYYY-MM-DD.md`
   - `session-state.md` → `session-state.backup.YYYY-MM-DD.md`
2. **Then iterate**: Make incremental updates to the original files.
3. **Rollback if needed**: If the iteration goes wrong, restore from backup.
4. **Clean up**: After the task succeeds, delete backup files that are no longer needed.

This prevents accumulated errors from iterative memory updates and provides a clean rollback path.

## Knowledge Graph Thinking

Think in graph form:

- Entity nodes:

  - `Domain`
  - `Feature`
  - `Module`
  - `File`
  - `Symbol`
  - `API`
  - `DataModel`
  - `DatabaseTable`
  - `ExternalService`
  - `Test`
  - `Command`
  - `Risk`
  - `Decision`
  - `Invariant`
  - `TODO`

- Relationship edges:
  - `owns`
  - `imports`
  - `calls`
  - `reads`
  - `writes`
  - `validates`
  - `serializes`
  - `depends_on`
  - `exposes`
  - `consumed_by`
  - `tested_by`
  - `breaks`
  - `mitigates`
  - `decided_by`
  - `supersedes`

For broad or ambiguous tasks, first expand the graph around the target area, then plan.
