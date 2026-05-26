#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function isSdkChildContext(payload) {
  if (process.env["TTB_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return payload.entrypoint === "sdk-ts";
}

const MEMORY_DIR = ".claude/memory";

const MEMORY_FILES = [
  `${MEMORY_DIR}/knowledge-graph.md`,
  `${MEMORY_DIR}/session-state.md`,
];

const DEFAULT_TEMPLATES = {
  "knowledge-graph.md": `# Project Knowledge Graph Memory

This file is the persistent project memory.

Maintain it as a compact engineering knowledge graph, not as a chronological
diary. Code evidence outranks memory. Update this file only after meaningful
work that changes stable project facts, decisions, invariants, risks, or
verification commands.

If this project was initialized through the tt-b workflow, Claude Code may run
\`.claude/bin/memory-reminder.js\` from \`.claude/settings.json\`. That hook is only
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

- Memory reminder hook: unknown until \`.claude/settings.json\` and
  \`.claude/bin/memory-reminder.js\` are verified.
- If present, the hook is non-blocking and should be treated as a prompt to
  refresh this graph after meaningful verified work.

---

# 1. Graph Legend

## Node Types

- \`Domain\`: business or product area.
- \`Feature\`: user-visible capability.
- \`Module\`: logical implementation area.
- \`File\`: concrete source file.
- \`Symbol\`: function, class, hook, component, type, constant.
- \`API\`: endpoint, RPC method, server action, public function, event contract.
- \`DataModel\`: type, schema, DTO, entity, table, or message shape.
- \`DatabaseTable\`: persistent database table or collection.
- \`ExternalService\`: third-party API, queue, storage, payment, auth, model provider.
- \`Test\`: test file, suite, fixture, mock, or validation command.
- \`Command\`: verification, build, migration, script, or runtime command.
- \`Invariant\`: behavior that must remain true.
- \`Decision\`: architectural or implementation decision.
- \`Risk\`: known fragility, migration risk, security risk, performance risk.
- \`TODO\`: known follow-up.

## Edge Types

- \`owns\`
- \`contains\`
- \`imports\`
- \`calls\`
- \`reads\`
- \`writes\`
- \`validates\`
- \`serializes\`
- \`depends_on\`
- \`exposes\`
- \`consumed_by\`
- \`tested_by\`
- \`protected_by\`
- \`breaks\`
- \`mitigates\`
- \`decided_by\`
- \`supersedes\`

---

# 2. Domain Graph

Record stable project domains here after verifying them against real files.

Template:

\`\`\`txt
Domain:<name> owns Feature:<name>
Domain:<name> owns Module:<name>
Feature:<name> depends_on Module:<name>
Module:<name> contains File:<path>
Module:<name> tested_by Test:<command-or-file>
\`\`\`

---

# 3. Decisions

Record decisions that future agents should not rediscover from scratch.

Template:

- Decision: \`<decision-name>\`
  - Context: why the decision was needed
  - Chosen: what was chosen
  - Rejected: alternatives and why
  - Risk: known downside
  - Verification: files or commands proving the decision is still valid

---

# 4. Risks

Record verified risks and mitigation status.

Template:

- Risk: \`<risk-name>\`
  - Surface: files, modules, APIs, or commands affected
  - Impact: what can break
  - Mitigation: current guardrail or test
  - Status: open | mitigated | obsolete
`,

  "session-state.md": `# Session State Memory

This file stores the current working state for context recovery.

Keep this file concise and current. It is the execution cursor, not the
long-term knowledge graph.

If a non-blocking memory reminder hook is installed, use its reminder as a cue
to refresh this cursor after meaningful verified work. Do not treat the reminder
itself as evidence.

Last updated: not initialized

---

# Current Goal

- User request: none recorded
- Current interpretation: none recorded
- Success criteria: none recorded

---

# Current Plan

1. Inspect project instructions and memory.
   - If present, note whether \`.claude/settings.json\` registers
     \`.claude/bin/memory-reminder.js\`.
2. Inspect repository status and relevant files.
3. Verify memory claims against real code before editing.
4. Execute the smallest safe change.
5. Run targeted verification.
6. Update memory after meaningful work.

---

# Inspected Files

- none recorded

---

# Modified Files

- none recorded

---

# Important Symbols

- none recorded

---

# Commands Run

\`\`\`bash
# none recorded
\`\`\`

---

# Current Errors / Failing Tests

- none recorded

---

# Decisions Made In This Session

- none recorded

---

# Open Questions

- none recorded

---

# Next Concrete Action

Inspect the target repository and replace placeholder memory with verified
project-specific facts.
`,
};

const NON_TRIVIAL_PROMPT =
  /(继续|接着|修|改|实现|分析|排查|调试|测试|重构|设计|计划|复盘|迭代|记忆|claude\.md|agents\.md|continue|resume|fix|change|implement|analyze|debug|test|refactor|design|plan|review|memory)/i;

function readHookInput() {
  try {
    const text = fs.readFileSync(0, "utf8");
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function fileExists(cwd, relativePath) {
  return fs.existsSync(path.join(cwd, relativePath));
}

function ensureMemoryFiles(projectRoot) {
  const memoryDir = path.join(projectRoot, MEMORY_DIR);
  const created = [];

  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  for (const [filename, content] of Object.entries(DEFAULT_TEMPLATES)) {
    const filePath = path.join(memoryDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, "utf8");
      created.push(`${MEMORY_DIR}/${filename}`);
    }
  }

  return created;
}

function shouldRemind(input) {
  if (input.hook_event_name === "SessionStart") return true;

  if (input.hook_event_name !== "UserPromptSubmit") return false;

  const prompt = String(input.prompt || "").trim();
  return prompt.length >= 120 || NON_TRIVIAL_PROMPT.test(prompt);
}

function reminderText(input, createdFiles) {
  const cwd = input.cwd || process.cwd();
  const existingFiles = MEMORY_FILES.filter((filePath) => fileExists(cwd, filePath));
  const missingFiles = MEMORY_FILES.filter((filePath) => !fileExists(cwd, filePath));
  const source = input.source || input.trigger || "turn";
  const compactNote = source === "compact" ? " This is especially relevant after compaction." : "";

  const created = createdFiles.length
    ? ` Auto-created: ${createdFiles.map((filePath) => `\`${filePath}\``).join(", ")}.`
    : "";

  const available = existingFiles.length
    ? `Available memory: ${existingFiles.map((filePath) => `\`${filePath}\``).join(", ")}.`
    : "No canonical memory files were found under `.claude/memory/`.";

  const missing = missingFiles.length
    ? ` Missing memory files: ${missingFiles.map((filePath) => `\`${filePath}\``).join(", ")}.`
    : "";

  return [
    "Advisory memory reminder, not a hard rule.",
    compactNote.trim(),
    available,
    created.trim(),
    missing.trim(),
    "For non-trivial work, skim project memory before planning or editing; treat it as a map, verify important claims against real files, and update stable facts plus the current execution cursor after meaningful verified work.",
    "For trivial prompts, ignore this reminder.",
  ]
    .filter(Boolean)
    .join(" ");
}

function main() {
  const input = readHookInput();
  if (isSdkChildContext(input)) return;

  const projectRoot = input.cwd || process.cwd();
  const createdFiles = ensureMemoryFiles(projectRoot);

  const eventName = input.hook_event_name;
  if (!eventName || !shouldRemind(input)) return;

  const output = {
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: reminderText(input, createdFiles),
    },
  };

  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main();
