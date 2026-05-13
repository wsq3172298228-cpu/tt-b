#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function isSdkChildContext(payload) {
  if (process.env["TTB_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return payload.entrypoint === "sdk-ts";
}

const MEMORY_FILES = [
  ".claude/memory/knowledge-graph.md",
  ".claude/memory/session-state.md",
];

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

function shouldRemind(input) {
  if (input.hook_event_name === "SessionStart") return true;

  if (input.hook_event_name !== "UserPromptSubmit") return false;

  const prompt = String(input.prompt || "").trim();
  return prompt.length >= 120 || NON_TRIVIAL_PROMPT.test(prompt);
}

function reminderText(input) {
  const cwd = input.cwd || process.cwd();
  const existingFiles = MEMORY_FILES.filter((filePath) => fileExists(cwd, filePath));
  const missingFiles = MEMORY_FILES.filter((filePath) => !fileExists(cwd, filePath));
  const source = input.source || input.trigger || "turn";
  const compactNote = source === "compact" ? " This is especially relevant after compaction." : "";

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
  const eventName = input.hook_event_name;

  if (!eventName || !shouldRemind(input)) return;

  const output = {
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: reminderText(input),
    },
  };

  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main();
