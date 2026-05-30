#!/usr/bin/env node

/**
 * memory-snapshot.js — PreToolUse hook for execution state capture
 *
 * Captures current execution state before major operations:
 * 1. Current tool being used
 * 2. Files being modified
 * 3. Timestamp of last activity
 *
 * This ensures session-state.md is updated frequently enough
 * to survive context compaction or new conversations.
 */

const fs = require("fs");
const path = require("path");

const MEMORY_DIR = ".claude/memory";
const SS_FILE = `${MEMORY_DIR}/session-state.md`;

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

function updateSessionState(projectRoot, toolName, toolInput) {
  const ssPath = path.join(projectRoot, SS_FILE);
  if (!fileExists(ssPath)) return false;

  try {
    let content = fs.readFileSync(ssPath, "utf8");
    const timestamp = new Date().toISOString().slice(0, 19);
    const files = [];

    // Extract file paths from tool input
    if (toolInput.file_path) files.push(toolInput.file_path);
    if (toolInput.files) files.push(...toolInput.files);

    // Update "Last Activity" section
    const lastActivity = `## Last Activity\n\n- Time: ${timestamp}\n- Tool: ${toolName}\n- Files: ${files.length > 0 ? files.map(f => `\`${path.basename(f)}\``).join(", ") : "none"}\n`;

    if (content.includes("## Last Activity")) {
      content = content.replace(/## Last Activity\n\n.*?(?=\n##|\n$)/s, lastActivity);
    } else {
      // Add before "## Recent Changes" or at end
      if (content.includes("## Recent Changes")) {
        content = content.replace("## Recent Changes", `${lastActivity}\n## Recent Changes`);
      } else {
        content += `\n${lastActivity}`;
      }
    }

    fs.writeFileSync(ssPath, content, "utf8");
    return true;
  } catch {
    return false;
  }
}

// ─── Main ───

function main() {
  const input = readHookInput();
  const toolName = input.tool_name || "";
  const toolInput = input.tool_input || {};
  const projectRoot = process.cwd();

  // Only track Write, Edit, and Bash tools
  if (!["Write", "Edit", "Bash"].includes(toolName)) {
    process.exit(0);
  }

  // Skip for memory files themselves to avoid loops
  const filePath = toolInput.file_path || "";
  if (filePath.includes(MEMORY_DIR)) {
    process.exit(0);
  }

  updateSessionState(projectRoot, toolName, toolInput);
  process.exit(0);
}

main();
