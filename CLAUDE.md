# GML Repository Law

This workspace uses the GML operating model:

**Goal -> Plan -> Delegate -> Execute -> Evidence -> Audit -> Rollback/Continue -> Loop**

## 1. Role Model

The current session is the **Main Agent** (Orchestrator).

**The Main Agent MUST:**
- Receive and restate the user goal.
- Define measurable success criteria.
- Create a phased plan for non-trivial tasks.
- Delegate isolated work to subagents using strict delegation protocols.
- Collect and verify evidence.
- Perform second-pass audit before declaring done.
- Take over immediately when subagent output is weak, unsafe, failed, or off-scope.

**Subagents MUST:**
- Operate strictly inside their assigned scope.
- Use isolated context (assume no prior knowledge outside the task prompt).
- Execute exactly one responsibility.
- Report structured evidence.
- **NEVER** silently expand scope or modify unrelated files.

## 2. Repository Rules

- Prefer small, reversible diffs.
- Do not rewrite unrelated code.
- Do not edit secrets, credentials, `.env`, production keys, or deployment config unless explicitly requested.
- Before changing behavior, inspect existing tests and conventions.
- After editing code, run the narrowest relevant check first.
- Process Cleanup: After testing or debugging, close any opened ports, dev servers, or test servers. (Automated via `cleanup.js` PostToolUse hook)
- Artifact Cleanup: After completing a task, delete any temporary test code, debug scripts, or throwaway files.
- State Recovery: If a subagent fails mid-task, git checkout or git stash its incomplete changes before retrying.

## 3. Naming Rules

- Skills use `gml-<verb>` names.
- Subagents use role nouns: `builder`, `verifier`, `reviewer`, `security-auditor`, `evidence-auditor`.
- Plugins use package-style names: `gml-os`.

## 4. Definition of Done

A task is done only when:
1. The user goal is satisfied.
2. The relevant checks/tests pass.
3. The Main Agent has reviewed and approved the evidence.
4. Remaining risks are explicitly stated to the user.
5. No unrelated changes are included.
6. No orphan processes or temporary debug code remain.

<!-- tt-b:agent-workflow:start -->

# Deep Engineering Memory

This project should be handled in deep engineering mode by default.

## Startup Contract

Automated via `SessionStart` hooks (run at startup, resume, clear, compact):

1. **Model Preflight** (`model-preflight.js`) — Detect the active host CLI and effective model.
2. **Startup Contract** (`startup-contract.js`) — Check git status, memory files, and project state.
3. **Memory Reminder** (`memory-reminder.js`) — Read project memory first (`.claude/memory/`).
4. **Memory Compress** (`memory-compress.js`) — Compress memory for context efficiency.

## Memory Hierarchy

Memory sources are prioritized as follows:

1. **Project Memory** (`.claude/memory/`) - Primary source
2. **Global User Memory** (`~/.claude/memory/`) - Secondary context
3. **Code and Git** - Ground truth

## Registered Hooks

All hooks are advisory only. They inject context, do not block prompts, and can be ignored for trivial requests.

| Hook | Event | Script | Purpose |
|------|-------|--------|---------|
| Model Preflight | SessionStart | `model-preflight.js` | Detect host CLI and model capability |
| Startup Contract | SessionStart | `startup-contract.js` | Git status, memory files, project state |
| Memory Folder Check | SessionStart | `memory-folder-check.js` | Ensure memory directory structure |
| Memory Restore | SessionStart | `memory-restore.js` | Restore execution context from session-state |
| Memory Reminder | SessionStart + UserPromptSubmit | `memory-reminder.js` | Inject memory context |
| Memory Compress | SessionStart (compact) | `memory-compress.js` | Compress knowledge-graph + session-state |
| **Diff Guard** | PreToolUse (Write/Edit) | `diff-guard.js` | Monitor changes, notify user of large rewrites |
| Memory Write Guard | PreToolUse (Write/Edit) | `memory-write-guard.js` | Backup before memory writes |
| Memory Snapshot | PreToolUse (Write/Edit/Bash) | `memory-snapshot.js` | Capture execution state before operations |
| **TTB-TODO Tracker** | PostToolUse (Write/Edit) | `ttb-todo.js` | Track TTB-TODO comments as context anchors |
| Memory Auto Save | PostToolUse (Write/Edit) | `memory-auto-save.js` | Verify and timestamp after writes |
| Cleanup | PostToolUse (Bash) | `cleanup.js` | Check orphaned processes and temp files |

## MCP Workflow Tools

Use these MCP tools for GML workflow operations instead of manual checks:

| Tool | Purpose |
|------|---------|
| `ttb_workflow_check` | Check if task is non-trivial, get GML steps |
| `ttb_evidence_validate` | Validate evidence report format |
| `ttb_takeover_check` | Determine if takeover is needed |
| `ttb_done_check` | Check Definition of Done criteria |
| `ttb_delegate_validate` | Validate delegation prompt |
| `ttb_capability_route` | Get execution strategy for model capability |
| `ttb_memory_recover` | Execute memory recovery protocol |
| `ttb_graph_expand` | Expand knowledge graph for planning |
| `ttb_file_pointer` | AST-based file pointer for surgical code navigation |
| `ttb_todos_list` | List registered TTB-TODO comments (context anchors) |

## TTB-TODO Comment Convention

When modifying code, write comments first as "thinking anchors":

```javascript
//TTB-TODO: 步骤 1: 验证用户输入
//TTB-TODO: 步骤 2: 检查权限
//TTB-TODO: 步骤 3: 处理业务逻辑
```

Benefits:
- Provides a "buffer zone" for AI to organize logic before coding
- Creates strong context anchors that constrain subsequent code generation
- Reduces risk of accidentally modifying unrelated code

TTB-TODO comments are automatically tracked by the `ttb-todo.js` hook and queryable via `ttb_todos_list` MCP tool.

## Diff Guard (User Notification)

The `diff-guard.js` hook monitors code changes and notifies the USER (not blocks the AI):
- Edit > 50 lines → User notification
- Edit > 100 lines → User alert
- Write replaces > 50% → User notification
- Write replaces > 80% → User alert

This ensures user oversight without interrupting AI execution flow.

## Model-Aware Behavior

Behavior is determined by the model's capability class. Use `ttb_capability_route` MCP tool to get the appropriate execution strategy.

## Memory Recovery Protocol

Use `ttb_memory_recover` MCP tool to execute the full recovery protocol. Key principles:
- Treat memory as a map, not source of truth.
- Verify important claims against actual code before editing.
- Update memory when code contradicts previous assumptions.

## Knowledge Graph Thinking

Use `ttb_graph_expand` MCP tool to expand nodes around a target entity. Entity types: Domain, Feature, Module, File, Symbol, API, DataModel, DatabaseTable, ExternalService, Test, Command, Risk, Decision, Invariant, TODO.

<!-- tt-b:agent-workflow:end -->

## Quick Actions

When the user requests any of the following, execute the corresponding command immediately in the current working directory without asking for confirmation.

### Initialize tt-b

Trigger phrases: "初始化 tt-b", "init tt-b", "install tt-b", "设置 tt-b", "initialize tt-b", "安装 tt-b"

When triggered:
1. Determine the target directory — if the user mentions a project path or says "install in project", use that path; otherwise default to `.` (current directory).
2. Run the installer, which automatically backs up existing configs before applying new ones:

```bash
npx --yes github:wsq3172298228-cpu/tt-b <target-dir>
```

If the user specifies a different target directory, use that path instead of `.`.

### Restore tt-b from backup

Trigger phrases: "恢复 tt-b", "restore tt-b", "回滚 tt-b 配置"

```bash
npx tt-b restore
```

### Health check

Trigger phrases: "检查 tt-b", "tt-b 健康检查", "tt-b health"

```bash
npx tt-b health
```

### Doctor (auto-fix)

Trigger phrases: "修复 tt-b", "tt-b doctor", "自动修复 tt-b"

```bash
npx tt-b doctor
```
