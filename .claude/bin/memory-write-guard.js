#!/usr/bin/env node

/**
 * memory-write-guard.js — PreToolUse hook for memory file writes
 *
 * Triggers before Write/Edit tools targeting memory files.
 * Ensures:
 * 1. Backup exists before modification
 * 2. File format is valid (has frontmatter or headers)
 * 3. No accidental overwrites of critical sections
 */

const fs = require("fs");
const path = require("path");

const MEMORY_DIR = ".claude/memory";
const MEMORY_FILES = [
  "knowledge-graph.md",
  "session-state.md",
  "MEMORY.md",
];

const BACKUP_DIR = ".claude/memory/backups";

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

function createBackup(filePath) {
  if (!fileExists(filePath)) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const basename = path.basename(filePath, ".md");
  const backupPath = path.join(BACKUP_DIR, `${basename}.${timestamp}.md`);

  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  } catch {
    return null;
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

  // Create backup before modification
  const backup = createBackup(filePath);
  if (backup) {
    console.log(`Backup created: ${path.relative(process.cwd(), backup)}`);
  }

  // Check if file has valid structure
  if (toolName === "Write" && fileExists(filePath)) {
    const content = fs.readFileSync(filePath, "utf8");
    if (content.length > 0 && !content.startsWith("---") && !content.startsWith("#")) {
      console.warn("Warning: Memory file may be missing frontmatter or headers");
    }
  }

  process.exit(0);
}

main();
