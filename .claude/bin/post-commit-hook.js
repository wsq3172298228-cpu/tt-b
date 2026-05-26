#!/usr/bin/env node

/**
 * post-commit-hook — Lightweight git post-commit hook for graph updates.
 *
 * Writes the current commit hash to .git/graph_update_queue and exits immediately.
 * Does NOT call LLM or do any heavy processing — that's the daemon's job.
 *
 * Install:
 *   echo 'node .claude/bin/post-commit-hook.js' > .git/hooks/post-commit
 *   chmod +x .git/hooks/post-commit
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const QUEUE_FILE = ".git/graph_update_queue";

try {
  const projectRoot = process.env.TTB_PROJECT_ROOT || process.cwd();
  const queuePath = path.join(projectRoot, QUEUE_FILE);

  // Get current commit hash
  const hash = execSync("git rev-parse HEAD", {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 3000
  }).trim();

  // Append to queue (create if needed)
  fs.appendFileSync(queuePath, hash + "\n", "utf8");

  // Exit immediately — no blocking
  process.exit(0);
} catch (e) {
  // Don't block git commit on errors
  process.exit(0);
}
