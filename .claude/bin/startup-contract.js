#!/usr/bin/env node

/**
 * startup-contract.js — SessionStart hook for startup checks
 *
 * Runs at session start to:
 * 1. Detect git worktree status
 * 2. Check for uncommitted changes
 * 3. Verify memory files exist
 * 4. Report project state summary
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = process.cwd();
const claudeDir = path.join(projectRoot, ".claude");
const memoryDir = path.join(claudeDir, "memory");

// ─── Helpers ───

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", cwd: projectRoot, timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

// ─── Checks ───

function checkGitStatus() {
  const isGit = dirExists(path.join(projectRoot, ".git")) || run("git rev-parse --is-inside-work-tree") === "true";
  if (!isGit) return { isGit: false };

  const branch = run("git branch --show-current");
  const status = run("git status --porcelain");
  const changes = status ? status.split("\n").filter(Boolean).length : 0;

  return { isGit: true, branch, changes };
}

function checkMemoryFiles() {
  const files = [
    { name: "knowledge-graph.md", path: path.join(memoryDir, "knowledge-graph.md") },
    { name: "session-state.md", path: path.join(memoryDir, "session-state.md") },
  ];

  return files.map((f) => ({
    name: f.name,
    exists: fileExists(f.path),
  }));
}

function checkClaudeConfig() {
  return {
    settingsJson: fileExists(path.join(claudeDir, "settings.json")),
    settingsLocal: fileExists(path.join(claudeDir, "settings.local.json")),
    claudeMd: fileExists(path.join(projectRoot, "CLAUDE.md")),
  };
}

// ─── Main ───

function main() {
  const lines = [];

  // Git status
  const git = checkGitStatus();
  if (git.isGit) {
    lines.push(`Git: ${git.branch || "detached"} (${git.changes} uncommitted)`);
  } else {
    lines.push("Git: not initialized (run `git init` to enable version control)");
  }

  // Memory files
  const memory = checkMemoryFiles();
  const missing = memory.filter((f) => !f.exists);
  if (missing.length > 0) {
    lines.push(`Memory: missing ${missing.map((f) => f.name).join(", ")}`);
  } else {
    lines.push("Memory: ok");
  }

  // Claude config
  const config = checkClaudeConfig();
  if (!config.settingsJson) {
    lines.push("Config: settings.json missing");
  }

  // Output summary
  console.log(lines.join("\n"));
}

main();
