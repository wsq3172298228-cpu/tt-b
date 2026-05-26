#!/usr/bin/env node

/**
 * graph-updater — Diff-driven incremental knowledge graph updater.
 *
 * Workflow:
 * 1. Git post-commit hook writes commit hash to .git/graph_update_queue
 * 2. This daemon reads the queue, runs git diff + commit message
 * 3. Sends to a fast LLM (or local heuristic) for graph patch extraction
 * 4. Applies patch to knowledge-graph.md
 *
 * Usage:
 *   node .claude/bin/graph-updater.js [--once] [--dry-run] [--watch]
 *
 * --once    Process queue entries and exit (default for git hook)
 * --watch   Daemon mode: poll queue file every 5s
 * --dry-run Show what would change without writing
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const QUEUE_FILE = ".git/graph_update_queue";
const KG_FILE = ".claude/memory/knowledge-graph.md";
const MAX_DIFF_LINES = 200;

function readQueue(projectRoot) {
  const queuePath = path.join(projectRoot, QUEUE_FILE);
  if (!fs.existsSync(queuePath)) return [];
  const content = fs.readFileSync(queuePath, "utf8").trim();
  if (!content) return [];
  return content.split("\n").filter(Boolean);
}

function writeQueue(projectRoot, entries) {
  const queuePath = path.join(projectRoot, QUEUE_FILE);
  fs.writeFileSync(queuePath, entries.join("\n") + "\n", "utf8");
}

function getCommitInfo(projectRoot, commitHash) {
  try {
    const message = execSync(`git log -1 --format=%B ${commitHash}`, {
      cwd: projectRoot, encoding: "utf8", timeout: 5000
    }).trim();

    const diff = execSync(`git diff ${commitHash}~1..${commitHash} --stat`, {
      cwd: projectRoot, encoding: "utf8", timeout: 5000
    }).trim();

    const codeDiff = execSync(`git diff ${commitHash}~1..${commitHash} -- '*.js' '*.ts' '*.py' '*.md'`, {
      cwd: projectRoot, encoding: "utf8", timeout: 10000
    }).trim();

    // Truncate diff to avoid token explosion
    const diffLines = codeDiff.split("\n");
    const truncatedDiff = diffLines.length > MAX_DIFF_LINES
      ? diffLines.slice(0, MAX_DIFF_LINES).join("\n") + `\n... (${diffLines.length - MAX_DIFF_LINES} more lines)`
      : codeDiff;

    return { hash: commitHash, message, diff, codeDiff: truncatedDiff };
  } catch (e) {
    return { hash: commitHash, message: "", diff: "", codeDiff: "", error: e.message };
  }
}

/**
 * Extract graph patch from commit info using local heuristics.
 * Returns { added: [], modified: [], removed: [] }
 */
function extractPatchLocally(commitInfo) {
  const { message, diff } = commitInfo;
  const added = [];
  const modified = [];
  const removed = [];

  // Parse stat output for file changes
  const statLines = diff.split("\n");
  for (const line of statLines) {
    const fileMatch = line.match(/^\s*(.+?)\s+\|\s+\d+/);
    if (!fileMatch) continue;
    const filePath = fileMatch[1].trim();

    // Skip non-code files
    if (filePath.match(/\.(json|lock|log|tmp)$/)) continue;

    // Determine operation from diff stat
    const insertions = (line.match(/\d+ insertion/) || ["0 insertion"])[0].match(/\d+/)[0];
    const deletions = (line.match(/\d+ deletion/) || ["0 deletion"])[0].match(/\d+/)[0];

    const fileName = path.basename(filePath, path.extname(filePath));
    const fileType = path.extname(filePath).slice(1);

    if (parseInt(insertions) > 0 && parseInt(deletions) === 0) {
      added.push({ type: "File", name: fileName, path: filePath, extension: fileType });
    } else if (parseInt(deletions) > 0 && parseInt(insertions) === 0) {
      removed.push({ type: "File", name: fileName, path: filePath });
    } else {
      modified.push({ type: "File", name: fileName, path: filePath, extension: fileType });
    }
  }

  // Extract function/class names from diff (simple heuristic)
  const codeLines = commitInfo.codeDiff.split("\n");
  for (const line of codeLines) {
    // JS/TS function declarations
    const fnMatch = line.match(/^\+.*(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s*)?\(|[\(])/);
    if (fnMatch && !added.find(n => n.name === fnMatch[1])) {
      added.push({ type: "Symbol", name: fnMatch[1], category: "function" });
    }

    // Class declarations
    const classMatch = line.match(/^\+.*class\s+(\w+)/);
    if (classMatch && !added.find(n => n.name === classMatch[1])) {
      added.push({ type: "Symbol", name: classMatch[1], category: "class" });
    }

    // Module exports
    const exportMatch = line.match(/^\+.*module\.exports\s*=\s*(\w+)/);
    if (exportMatch && !added.find(n => n.name === exportMatch[1])) {
      added.push({ type: "Symbol", name: exportMatch[1], category: "export" });
    }
  }

  return { added, modified, removed, commitHash: commitInfo.hash, commitMessage: commitInfo.message };
}

/**
 * Apply graph patch to knowledge-graph.md content.
 */
function applyPatch(content, patch) {
  if (!patch.added.length && !patch.modified.length && !patch.removed.length) {
    return { content, changed: false };
  }

  const lines = content.split("\n");
  const insertLines = [];

  // Build patch summary
  if (patch.commitMessage) {
    insertLines.push("");
    insertLines.push(`<!-- auto-patch: ${patch.commitHash.slice(0, 8)} -->`);

    for (const node of patch.added) {
      insertLines.push(`- ${node.type}:${node.name} — added in ${patch.commitHash.slice(0, 8)}`);
    }
    for (const node of patch.modified) {
      insertLines.push(`- ${node.type}:${node.name} — modified in ${patch.commitHash.slice(0, 8)}`);
    }
    for (const node of patch.removed) {
      insertLines.push(`- ${node.type}:${node.name} — removed in ${patch.commitHash.slice(0, 8)}`);
    }
  }

  // Find insertion point: before "# 9. Risks, Decisions, TODOs" or at end
  let insertIdx = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("# 9. Risks, Decisions, TODOs")) {
      insertIdx = i;
      break;
    }
  }

  lines.splice(insertIdx, 0, ...insertLines);

  return { content: lines.join("\n"), changed: true };
}

function main() {
  const args = process.argv.slice(2);
  const isOnce = args.includes("--once");
  const isDryRun = args.includes("--dry-run");
  const isWatch = args.includes("--watch");
  const projectRoot = process.cwd();

  // Also support TTB_PROJECT_ROOT
  const root = process.env.TTB_PROJECT_ROOT || projectRoot;

  function processQueue() {
    const queue = readQueue(root);
    if (queue.length === 0) return false;

    console.log(`[graph-updater] Processing ${queue.length} queued commit(s)...`);

    const kgPath = path.join(root, KG_FILE);
    if (!fs.existsSync(kgPath)) {
      console.log(`[graph-updater] ${KG_FILE} not found, skipping`);
      return false;
    }

    const kgContent = fs.readFileSync(kgPath, "utf8");
    let currentContent = kgContent;
    let processedHashes = [];

    for (const commitHash of queue) {
      const commitInfo = getCommitInfo(root, commitHash);
      if (commitInfo.error) {
        console.log(`[graph-updater] Error getting commit ${commitHash}: ${commitInfo.error}`);
        continue;
      }

      const patch = extractPatchLocally(commitInfo);

      if (isDryRun) {
        console.log(`[graph-updater] Would apply patch for ${commitHash.slice(0, 8)}:`);
        console.log(`  Added: ${patch.added.map(n => n.name).join(", ") || "none"}`);
        console.log(`  Modified: ${patch.modified.map(n => n.name).join(", ") || "none"}`);
        console.log(`  Removed: ${patch.removed.map(n => n.name).join(", ") || "none"}`);
      } else {
        const result = applyPatch(currentContent, patch);
        if (result.changed) {
          currentContent = result.content;
          console.log(`[graph-updater] Applied patch for ${commitHash.slice(0, 8)}`);
        } else {
          console.log(`[graph-updater] No graph changes for ${commitHash.slice(0, 8)}`);
        }
      }

      processedHashes.push(commitHash);
    }

    // Write updated content
    if (!isDryRun && currentContent !== kgContent) {
      // Backup before writing
      const backupPath = kgPath.replace(/\.md$/, `.backup.${new Date().toISOString().slice(0, 10)}.md`);
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(kgPath, backupPath);
        console.log(`[graph-updater] Backup created: ${backupPath}`);
      }
      fs.writeFileSync(kgPath, currentContent, "utf8");
      console.log(`[graph-updater] Updated ${KG_FILE}`);
    }

    // Clear processed entries from queue
    const remaining = queue.filter(h => !processedHashes.includes(h));
    writeQueue(root, remaining);

    return true;
  }

  if (isWatch) {
    console.log(`[graph-updater] Watching ${QUEUE_FILE} for updates...`);
    setInterval(() => {
      try { processQueue(); } catch (e) { console.error(`[graph-updater] Error: ${e.message}`); }
    }, 5000);
  } else {
    // One-shot mode (default for git hook)
    try {
      processQueue();
    } catch (e) {
      console.error(`[graph-updater] Error: ${e.message}`);
      process.exit(1);
    }
  }
}

main();
