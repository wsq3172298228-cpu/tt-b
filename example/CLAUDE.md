# Deep Engineering Memory

This project should be handled in deep engineering mode by default.

## Default Reasoning Mode

For any non-trivial task, do not jump directly into edits.

First:

1. Understand the current architecture.
2. Identify relevant files, modules, data flow, control flow, and external dependencies.
3. Build a precise mental model of how the requested change affects runtime behavior.
4. Identify invariants, assumptions, hidden coupling, edge cases, and failure modes.
5. Compare multiple implementation paths before choosing one.
6. Prefer the smallest safe change that preserves existing public contracts.
7. Explain the plan before editing unless the task is explicitly trivial.

For architecture changes, debugging, migrations, concurrency, authentication, payments, database changes, performance work, security-sensitive work, or cross-module refactors, use ultrathink-level reasoning.

# Project Memory Recovery Protocol

This project uses a persistent knowledge-graph memory.

Before starting any non-trivial task, first inspect:

- `.claude/memory/knowledge-graph.md`
- `.claude/memory/session-state. md` if it exists
- Relevant recent git diff and git status

Use these files to recover project memory before planning or editing.

## Memory Recovery Rules

When recovering memory:

1.  Reconstruct the current project graph:

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

2.  Identify the current execution cursor:

- current user goal
- active plan
- files already inspected
- files changed
- commands run
- failing tests
- open questions
- next concrete action

3.  Do not trust memory blindly.

- Treat memory as a map, not source of truth.
- Verify important claims against actual code before editing.
- Update memory when code contradicts previous assumptions.

4.  Preserve and update memory after meaningful work:

- Add new nodes.
- Add new edges.
- Update changed invariants.
- Record decisions.
- Record risks.
- Record verification results.
- Update the execution cursor.

## Knowledge Graph Thinking

Think in graph form:

- Entity nodes:
- Feature
- Module
- File
- Symbol
- API
- DataModel
- DatabaseTable
- ExternalService
- Test
- Command
- Risk
- Decision
- Invariant
- TODO

- Relationship edges:
- owns
- imports
- calls
- reads
- writes
- validates
- serializes
- depends_on
- exposes
- consumed_by
- tested_by
- breaks
- mitigates
- decided_by
- supersedes

For broad or ambiguous tasks, first expand the graph around the target area, then plan.
