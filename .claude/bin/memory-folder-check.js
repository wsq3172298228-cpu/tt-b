#!/usr/bin/env node

/**
 * memory-folder-check.js — SessionStart hook for memory folder structure
 *
 * Checks and creates memory folder structure:
 * 1. .claude/memory/ directory exists
 * 2. Required memory files exist
 * 3. Backup directory exists
 * 4. Reports missing files
 */

const fs = require("fs");
const path = require("path");

const MEMORY_DIR = ".claude/memory";
const BACKUP_DIR = ".claude/memory/backups";

const REQUIRED_FILES = [
  { name: "knowledge-graph.md", template: "# Project Knowledge Graph Memory\n\nLast updated: not initialized\n" },
  { name: "session-state.md", template: "# Session State\n\n## Current Goal\n\n- (none)\n\n## Recent Changes\n\n" },
  { name: "MEMORY.md", template: "# Memory Index\n\n" },
];

// ─── Helpers ───

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function ensureDir(dir) {
  if (!dirExists(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

function ensureFile(filePath, template) {
  if (!fileExists(filePath)) {
    try {
      fs.writeFileSync(filePath, template, "utf8");
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// ─── Main ───

function main() {
  const projectRoot = process.cwd();
  const memoryDir = path.join(projectRoot, MEMORY_DIR);
  const backupDir = path.join(projectRoot, BACKUP_DIR);

  const results = [];

  // Ensure memory directory
  if (ensureDir(memoryDir)) {
    results.push(`Memory directory: ${MEMORY_DIR}/`);
  }

  // Ensure backup directory
  if (ensureDir(backupDir)) {
    results.push(`Backup directory: ${BACKUP_DIR}/`);
  }

  // Ensure required files
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(memoryDir, file.name);
    if (ensureFile(filePath, file.template)) {
      results.push(`Created: ${file.name}`);
    }
  }

  // Report status
  if (results.length > 0) {
    console.log("Memory structure:");
    results.forEach((r) => console.log(`  ${r}`));
  }
}

main();
