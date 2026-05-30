#!/usr/bin/env node

/**
 * memory-auto-save.js — PostToolUse hook for memory file writes
 *
 * Triggers after Write/Edit tools targeting memory files.
 * Performs:
 * 1. Verify write was successful
 * 2. Update last-modified timestamp in file
 * 3. Log memory change to session state
 */

const fs = require("fs");
const path = require("path");

const MEMORY_DIR = ".claude/memory";
const MEMORY_FILES = [
  "knowledge-graph.md",
  "session-state.md",
  "MEMORY.md",
];

// ─── Helpers ───

function readHookInput() {
  try {
    const text = fs.readFileSync(0, "utf8");
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isMemoryFile(filePath) {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.includes(MEMORY_DIR) && MEMORY_FILES.some((f) => normalized.endsWith(f));
}

function updateTimestamp(filePath) {
  if (!fileExists(filePath)) return false;

  try {
    let content = fs.readFileSync(filePath, "utf8");

    // Update "Last updated:" line if it exists
    const timestamp = new Date().toISOString().slice(0, 19);
    if (content.includes("Last updated:")) {
      content = content.replace(/Last updated:.*$/m, `Last updated: ${timestamp}`);
      fs.writeFileSync(filePath, content, "utf8");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function logToSessionState(filePath, toolName) {
  const sessionFile = path.join(MEMORY_DIR, "session-state.md");
  if (!fileExists(sessionFile)) return;

  try {
    let content = fs.readFileSync(sessionFile, "utf8");
    const timestamp = new Date().toISOString().slice(11, 19);
    const basename = path.basename(filePath);
    const logLine = `- ${timestamp} ${toolName}: ${basename}`;

    // Append to "Recent Changes" section if it exists
    if (content.includes("## Recent Changes")) {
      content = content.replace(
        /(## Recent Changes\n)/,
        `$1${logLine}\n`
      );
      fs.writeFileSync(sessionFile, content, "utf8");
    }
  } catch {
    // Silent fail for logging
  }
}

// ─── Main ───

function main() {
  const input = readHookInput();
  const toolName = input.tool_name || "";
  const toolInput = input.tool_input || {};

  // Only check Write/Edit tools
  if (!["Write", "Edit"].includes(toolName)) {
    process.exit(0);
  }

  const filePath = toolInput.file_path || "";
  if (!isMemoryFile(filePath)) {
    process.exit(0);
  }

  // Verify file exists after write
  if (!fileExists(filePath)) {
    console.error(`Warning: Memory file not found after write: ${filePath}`);
    process.exit(1);
  }

  // Update timestamp
  updateTimestamp(filePath);

  // Log to session state
  logToSessionState(filePath, toolName);

  process.exit(0);
}

main();
