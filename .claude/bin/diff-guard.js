#!/usr/bin/env node

/**
 * diff-guard — PreToolUse hook for code change monitoring.
 *
 * Purpose: Monitor code changes and NOTIFY USER (not block AI).
 * The user receives warnings about large changes; AI execution continues uninterrupted.
 *
 * Philosophy: AI should focus on execution, user handles oversight.
 */

const fs = require("fs");
const path = require("path");

// Thresholds for user notification
const NOTIFY_LINES = 50; // Notify user if replacing >50 lines
const ALERT_LINES = 100; // Alert user if replacing >100 lines
const NOTIFY_RATIO = 0.5; // Notify if replacing >50% of file
const ALERT_RATIO = 0.8; // Alert if replacing >80% of file

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync("/dev/stdin", "utf8"));
  } catch {
    process.exit(0);
  }

  const { tool_name, tool_input } = input;

  // Only guard Edit and Write operations
  if (tool_name !== "Edit" && tool_name !== "Write") {
    process.exit(0);
  }

  const filePath = tool_input?.file_path;
  if (!filePath) process.exit(0);

  // Skip memory and template files
  if (filePath.includes(".claude/memory/") || filePath.includes("templates/")) {
    process.exit(0);
  }

  // Analyze Edit operation
  if (tool_name === "Edit") {
    const oldText = tool_input.old_string || "";
    const newText = tool_input.new_string || "";
    const oldLines = oldText.split("\n").length;
    const newLines = newText.split("\n").length;

    if (oldLines > ALERT_LINES) {
      // Notify user, don't block AI
      console.log(JSON.stringify({
        type: "user-alert",
        severity: "high",
        message: `Large edit: ${oldLines} lines → ${newLines} lines in ${path.basename(filePath)}`,
        suggestion: "Consider reviewing this change.",
        stats: { oldLines, newLines, file: filePath }
      }));
    } else if (oldLines > NOTIFY_LINES) {
      console.log(JSON.stringify({
        type: "user-notify",
        severity: "medium",
        message: `Edit: ${oldLines} lines → ${newLines} lines in ${path.basename(filePath)}`,
        stats: { oldLines, newLines, file: filePath }
      }));
    }
  }

  // Analyze Write operation
  if (tool_name === "Write") {
    const newContent = tool_input.content || "";
    const newLines = newContent.split("\n").length;

    if (fs.existsSync(filePath)) {
      const existingContent = fs.readFileSync(filePath, "utf8");
      const existingLines = existingContent.split("\n").length;

      // Calculate similarity
      const existingSet = new Set(existingContent.split("\n").map(l => l.trim()).filter(Boolean));
      const newSet = new Set(newContent.split("\n").map(l => l.trim()).filter(Boolean));
      const intersection = new Set([...existingSet].filter(x => newSet.has(x)));
      const similarity = intersection.size / Math.max(existingSet.size, 1);
      const replaceRatio = 1 - similarity;

      if (replaceRatio > ALERT_RATIO && existingLines > 30) {
        console.log(JSON.stringify({
          type: "user-alert",
          severity: "high",
          message: `Full rewrite: ${Math.round(replaceRatio * 100)}% of ${path.basename(filePath)} (${existingLines} → ${newLines} lines)`,
          suggestion: "AI is rewriting most of this file. Review the change.",
          stats: { existingLines, newLines, similarity: Math.round(similarity * 100), file: filePath }
        }));
      } else if (replaceRatio > NOTIFY_RATIO && existingLines > 20) {
        console.log(JSON.stringify({
          type: "user-notify",
          severity: "medium",
          message: `Significant rewrite: ${Math.round(replaceRatio * 100)}% of ${path.basename(filePath)}`,
          stats: { existingLines, newLines, file: filePath }
        }));
      }
    }
  }

  // Always exit 0 — never block AI
  process.exit(0);
}

main();
