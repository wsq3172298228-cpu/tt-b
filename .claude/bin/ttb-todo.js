#!/usr/bin/env node

/**
 * ttb-todo — PostToolUse hook to detect and track TTB-TODO comments.
 *
 * Scans written/edited code for TTB-TODO comments and registers them
 * as context anchors for future code generation.
 *
 * TTB-TODO format:
 *   //TTB-TODO: 步骤 N: 描述
 *   //TTB-TODO: 待完成: 描述
 *   //TTB-TODO: 注意: 描述
 */

const fs = require("fs");
const path = require("path");

const TTB_TODO_PATTERN = /\/\/\s*TTB-TODO\s*:\s*(.+)/gi;
const MEMORY_DIR = ".claude/memory";
const TODOS_FILE = path.join(MEMORY_DIR, "ttb-todos.json");

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync("/dev/stdin", "utf8"));
  } catch {
    process.exit(0);
  }

  const { tool_name, tool_input, tool_result } = input;

  // Only process Write and Edit operations
  if (tool_name !== "Write" && tool_name !== "Edit") {
    process.exit(0);
  }

  const filePath = tool_input?.file_path;
  if (!filePath) process.exit(0);

  // Get the new content
  let content = "";
  if (tool_name === "Write") {
    content = tool_input.content || "";
  } else if (tool_name === "Edit") {
    content = tool_input.new_string || "";
  }

  // Extract TTB-TODO comments
  const todos = [];
  let match;
  while ((match = TTB_TODO_PATTERN.exec(content)) !== null) {
    todos.push({
      text: match[1].trim(),
      file: filePath,
      timestamp: new Date().toISOString(),
    });
  }

  if (todos.length === 0) {
    process.exit(0);
  }

  // Load existing TODOs
  let existingTodos = [];
  try {
    if (fs.existsSync(TODOS_FILE)) {
      existingTodos = JSON.parse(fs.readFileSync(TODOS_FILE, "utf8"));
    }
  } catch {
    existingTodos = [];
  }

  // Add new TODOs (avoid duplicates by checking text + file)
  for (const todo of todos) {
    const isDuplicate = existingTodos.some(
      (t) => t.text === todo.text && t.file === todo.file
    );
    if (!isDuplicate) {
      existingTodos.push(todo);
    }
  }

  // Keep only last 100 TODOs
  if (existingTodos.length > 100) {
    existingTodos = existingTodos.slice(-100);
  }

  // Save TODOs
  try {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
    fs.writeFileSync(TODOS_FILE, JSON.stringify(existingTodos, null, 2));
  } catch (err) {
    // Silent fail
  }

  // Output for context
  console.log(JSON.stringify({
    type: "ttb-todo-registered",
    count: todos.length,
    todos: todos.map((t) => `//TTB-TODO: ${t.text}`),
    message: `Registered ${todos.length} TTB-TODO comment(s) as context anchors.`,
  }));

  process.exit(0);
}

main();
