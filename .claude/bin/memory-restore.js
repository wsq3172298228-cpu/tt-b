#!/usr/bin/env node

/**
 * memory-restore.js — SessionStart hook for context restoration
 *
 * Restores execution context from session-state.md at session start:
 * 1. Reads current goal and execution cursor
 * 2. Identifies recently modified files
 * 3. Reports the state for model context
 */

const fs = require("fs");
const path = require("path");

const MEMORY_DIR = ".claude/memory";
const SS_FILE = `${MEMORY_DIR}/session-state.md`;
const KG_FILE = `${MEMORY_DIR}/knowledge-graph.md`;

// ─── Helpers ───

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function readSection(content, sectionName) {
  const regex = new RegExp(`## ${sectionName}\\n\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = content.match(regex);
  return match ? match[1].trim() : "";
}

function extractGoal(content) {
  const goalSection = readSection(content, "Current Active Goal");
  if (!goalSection) return null;

  const goalMatch = goalSection.match(/Goal:\s*(.+)/);
  const statusMatch = goalSection.match(/Status:\s*(.+)/);

  return {
    goal: goalMatch ? goalMatch[1].trim() : "unknown",
    status: statusMatch ? statusMatch[1].trim() : "unknown",
  };
}

function extractCursor(content) {
  const cursorSection = readSection(content, "Current Execution Cursor");
  if (!cursorSection) return null;

  const branchMatch = cursorSection.match(/Active branch:\s*(.+)/);
  const blockerMatch = cursorSection.match(/Current blocker:\s*(.+)/);
  const actionMatch = cursorSection.match(/Next concrete action:\s*(.+)/);

  // Extract modified files
  const fileMatches = cursorSection.match(/[-*]\s*(?:Modified|New):\s*`([^`]+)`/g) || [];
  const files = fileMatches.map(m => {
    const match = m.match(/`([^`]+)`/);
    return match ? match[1] : null;
  }).filter(Boolean);

  return {
    branch: branchMatch ? branchMatch[1].trim() : "unknown",
    blocker: blockerMatch ? blockerMatch[1].trim() : "none",
    nextAction: actionMatch ? actionMatch[1].trim() : "none",
    files,
  };
}

function extractLastActivity(content) {
  const activitySection = readSection(content, "Last Activity");
  if (!activitySection) return null;

  const timeMatch = activitySection.match(/Time:\s*(.+)/);
  const toolMatch = activitySection.match(/Tool:\s*(.+)/);

  return {
    time: timeMatch ? timeMatch[1].trim() : "unknown",
    tool: toolMatch ? toolMatch[1].trim() : "unknown",
  };
}

// ─── Main ───

function main() {
  const projectRoot = process.cwd();
  const ssPath = path.join(projectRoot, SS_FILE);

  if (!fileExists(ssPath)) {
    process.exit(0);
  }

  try {
    const content = fs.readFileSync(ssPath, "utf8");
    const lines = [];

    // Extract and report goal
    const goal = extractGoal(content);
    if (goal && goal.goal !== "unknown") {
      lines.push(`Goal: ${goal.goal} (${goal.status})`);
    }

    // Extract and report cursor
    const cursor = extractCursor(content);
    if (cursor) {
      if (cursor.branch !== "unknown") {
        lines.push(`Branch: ${cursor.branch}`);
      }
      if (cursor.files.length > 0) {
        lines.push(`Recent files: ${cursor.files.slice(0, 3).join(", ")}`);
      }
      if (cursor.nextAction !== "none") {
        lines.push(`Next: ${cursor.nextAction}`);
      }
    }

    // Extract last activity
    const activity = extractLastActivity(content);
    if (activity && activity.time !== "unknown") {
      lines.push(`Last activity: ${activity.time}`);
    }

    // Output summary
    if (lines.length > 0) {
      console.log("Session restored:");
      lines.forEach(l => console.log(`  ${l}`));
    }
  } catch {
    // Silent fail
  }

  process.exit(0);
}

main();
