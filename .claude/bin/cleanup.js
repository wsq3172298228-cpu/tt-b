#!/usr/bin/env node

/**
 * cleanup.js — PostToolUse hook for process and artifact cleanup
 *
 * Runs after tool use to:
 * 1. Check for orphaned processes (dev servers, test servers)
 * 2. Check for temporary files that should be cleaned
 * 3. Report cleanup suggestions
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = process.cwd();

// ─── Helpers ───

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", cwd: projectRoot, timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// ─── Checks ───

function checkOrphanedProcesses() {
  const suggestions = [];

  // Check for common dev server ports
  const ports = [3000, 3001, 5173, 5174, 8080, 8000];
  for (const port of ports) {
    const result = run(`lsof -ti:${port} 2>/dev/null`);
    if (result) {
      suggestions.push(`Port ${port} in use (PID: ${result.split("\n")[0]})`);
    }
  }

  return suggestions;
}

function checkTempFiles() {
  const suggestions = [];
  const tempPatterns = [
    "*.tmp",
    "*.temp",
    ".cache",
    "test-output-*",
    "debug-*",
  ];

  // Check for common temp file patterns
  for (const pattern of tempPatterns) {
    const files = run(`find . -maxdepth 2 -name "${pattern}" -type f 2>/dev/null`);
    if (files) {
      const count = files.split("\n").filter(Boolean).length;
      if (count > 0) {
        suggestions.push(`Found ${count} ${pattern} files`);
      }
    }
  }

  return suggestions;
}

// ─── Main ───

function main() {
  const suggestions = [];

  // Check processes
  const processIssues = checkOrphanedProcesses();
  suggestions.push(...processIssues);

  // Check temp files
  const tempIssues = checkTempFiles();
  suggestions.push(...tempIssues);

  // Output suggestions if any
  if (suggestions.length > 0) {
    console.log("Cleanup suggestions:");
    suggestions.forEach((s) => console.log(`  - ${s}`));
  }
}

main();
