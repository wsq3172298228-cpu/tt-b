# Project Knowledge Graph Memory

This file is the persistent project memory.

Maintain it as a compact engineering knowledge graph, not as a chronological
diary. Code evidence outranks memory. Update this file only after meaningful
work that changes stable project facts, decisions, invariants, risks, or
verification commands.

If this project was initialized through the tt-b workflow, Claude Code may run
`.claude/bin/memory-reminder.js` from `.claude/settings.json`. That hook is only
an advisory reminder to read and update this memory; it is not a source of truth
and it does not replace real-file verification.

Last updated: not initialized

---

# 0. Recovery Entry Point

When recovering context, start here.

## Current Project Identity

- Project: unknown
- Stack: unknown
- Runtime: unknown
- Package manager: unknown
- Main app entry: unknown
- Main backend entry: unknown
- Main database: unknown
- Main test command: unknown
- Main typecheck command: unknown
- Main build command: unknown

## Current Active Goal

- Goal: none recorded
- Status: idle
- Owner: unknown
- Last known next action: inspect the repository, verify this memory against
  real files, then update the graph with project-specific facts.

## Current Execution Cursor

- Active branch: unknown
- Relevant changed files: none recorded
- Files already inspected: none recorded
- Commands already run: none recorded
- Current blocker: none recorded
- Next concrete action: inspect the repository entry points and package files.

## Installed Workflow Hints

- Memory reminder hook: unknown until `.claude/settings.json` and
  `.claude/bin/memory-reminder.js` are verified.
- If present, the hook is non-blocking and should be treated as a prompt to
  refresh this graph after meaningful verified work.

---

# 1. Graph Legend

## Node Types

- `Domain`: business or product area.
- `Feature`: user-visible capability.
- `Module`: logical implementation area.
- `File`: concrete source file.
- `Symbol`: function, class, hook, component, type, constant.
- `API`: endpoint, RPC method, server action, public function, event contract.
- `DataModel`: type, schema, DTO, entity, table, or message shape.
- `DatabaseTable`: persistent database table or collection.
- `ExternalService`: third-party API, queue, storage, payment, auth, model provider.
- `Test`: test file, suite, fixture, mock, or validation command.
- `Command`: verification, build, migration, script, or runtime command.
- `Invariant`: behavior that must remain true.
- `Decision`: architectural or implementation decision.
- `Risk`: known fragility, migration risk, security risk, performance risk.
- `TODO`: known follow-up.

## Edge Types

- `owns`
- `contains`
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
- `protected_by`
- `breaks`
- `mitigates`
- `decided_by`
- `supersedes`

---

# 2. Domain Graph

Record stable project domains here after verifying them against real files.

Template:

```txt
Domain:<name> owns Feature:<name>
Domain:<name> owns Module:<name>
Feature:<name> depends_on Module:<name>
Module:<name> contains File:<path>
Module:<name> tested_by Test:<command-or-file>
```

---

# 3. Decisions

Record decisions that future agents should not rediscover from scratch.

Template:

- Decision: `<decision-name>`
  - Context: why the decision was needed
  - Chosen: what was chosen
  - Rejected: alternatives and why
  - Risk: known downside
  - Verification: files or commands proving the decision is still valid

---

# 4. Risks

Record verified risks and mitigation status.

Template:

- Risk: `<risk-name>`
  - Surface: files, modules, APIs, or commands affected
  - Impact: what can break
  - Mitigation: current guardrail or test
  - Status: open | mitigated | obsolete
