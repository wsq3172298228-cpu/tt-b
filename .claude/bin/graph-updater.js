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
 *   node .claude/bin/graph-updater.js [--once] [--dry-run] [--watch] [--gc] [--verify]
 *
 * --once    Process queue entries and exit (default for git hook)
 * --watch   Daemon mode: poll queue file every 5s
 * --dry-run Show what would change without writing
 * --gc      Run garbage collection on stale nodes and exit
 * --verify  Check graph consistency against filesystem and exit
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const QUEUE_FILE = ".git/graph_update_queue";
const KG_FILE = ".claude/memory/knowledge-graph.md";
const MAX_DIFF_LINES = 200;
const STALE_THRESHOLD = 3; // remove stale nodes after this many commits

// Lazy-load graph-store for dual-write support
let graphStore = null;
function getGraphStore(root) {
  if (!graphStore) {
    try {
      const createGraphStore = require("../../functions/graph-store");
      graphStore = createGraphStore({ projectRoot: root });
    } catch (e) {
      // graph-store not available, fall back to markdown-only
    }
  }
  return graphStore;
}

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
  const deletedFiles = [];
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
      deletedFiles.push(filePath);
    } else {
      modified.push({ type: "File", name: fileName, path: filePath, extension: fileType });
    }
  }

  // Extract function/class names from diff (simple heuristic)
  const codeLines = commitInfo.codeDiff.split("\n");
  for (const line of codeLines) {
    // Added symbols (+)
    if (line.startsWith("+")) {
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

    // Removed symbols (-) — detect deleted functions/classes
    if (line.startsWith("-") && !line.startsWith("---")) {
      const rmFnMatch = line.match(/^-.*(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s*)?\(|[\(])/);
      if (rmFnMatch && !removed.find(n => n.name === rmFnMatch[1])) {
        removed.push({ type: "Symbol", name: rmFnMatch[1], category: "function" });
      }

      const rmClassMatch = line.match(/^-.*class\s+(\w+)/);
      if (rmClassMatch && !removed.find(n => n.name === rmClassMatch[1])) {
        removed.push({ type: "Symbol", name: rmClassMatch[1], category: "class" });
      }
    }
  }

  // For fully deleted files, mark all symbols in those files as removed
  // (actual cleanup happens in gcStaleNodes)
  for (const filePath of deletedFiles) {
    const fileName = path.basename(filePath, path.extname(filePath));
    // The file removal itself is already in `removed`; GC will clean related symbols
  }

  return { added, modified, removed, deletedFiles, commitHash: commitInfo.hash, commitMessage: commitInfo.message };
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

/**
 * Garbage collect stale nodes from the graph.
 *
 * A node is "stale" if:
 * - It's a File node and the file no longer exists on disk
 * - It's a Symbol node and its parent file no longer exists
 * - It was explicitly removed in a patch
 *
 * Stale nodes are marked with `staleSince` timestamp. After STALE_THRESHOLD
 * commits with the node still stale, it gets removed along with its edges.
 *
 * @param {object} graph — graph from graph-store
 * @param {string} projectRoot — project root for file existence checks
 * @param {object} patch — current patch with removed/deletedFiles
 * @returns {{ graph, removed: string[], marked: string[] }}
 */
function gcStaleNodes(graph, projectRoot, patch) {
  const removed = [];
  const marked = [];
  const now = new Date().toISOString();

  // Phase 1: Mark nodes from deleted files as stale
  if (patch && patch.deletedFiles) {
    for (const filePath of patch.deletedFiles) {
      const fileName = path.basename(filePath, path.extname(filePath));
      const fileKey = `File:${fileName}`;

      if (graph.nodes[fileKey] && !graph.nodes[fileKey].metadata.staleSince) {
        graph.nodes[fileKey].metadata.staleSince = now;
        graph.nodes[fileKey].metadata.staleReason = `file deleted: ${filePath}`;
        marked.push(fileKey);
      }
    }
  }

  // Phase 2: Mark explicitly removed nodes as stale
  if (patch && patch.removed) {
    for (const node of patch.removed) {
      const key = `${node.type}:${node.name}`;
      if (graph.nodes[key] && !graph.nodes[key].metadata.staleSince) {
        graph.nodes[key].metadata.staleSince = now;
        graph.nodes[key].metadata.staleReason = `removed in patch`;
        marked.push(key);
      }
    }
  }

  // Phase 3: Scan all File nodes — mark stale if file doesn't exist
  for (const [key, node] of Object.entries(graph.nodes)) {
    if (node.type === "File" && node.metadata.path) {
      const fullPath = path.join(projectRoot, node.metadata.path);
      if (!fs.existsSync(fullPath) && !node.metadata.staleSince) {
        node.metadata.staleSince = now;
        node.metadata.staleReason = `file not found: ${node.metadata.path}`;
        marked.push(key);
      }
    }
  }

  // Phase 4: Remove nodes that have been stale for >= STALE_THRESHOLD commits
  const commitCount = (graph.commits || []).length;
  for (const [key, node] of Object.entries(graph.nodes)) {
    if (node.metadata.staleSince) {
      // Count commits since stale marking
      const staleIdx = graph.commits.findIndex(c => c.timestamp >= node.metadata.staleSince);
      const commitsSinceStale = staleIdx >= 0 ? commitCount - staleIdx : STALE_THRESHOLD;

      if (commitsSinceStale >= STALE_THRESHOLD) {
        // Remove node
        delete graph.nodes[key];
        removed.push(key);

        // Remove edges involving this node
        const beforeEdges = graph.edges.length;
        graph.edges = graph.edges.filter(
          e => `${e.from.type}:${e.from.name}` !== key && `${e.to.type}:${e.to.name}` !== key
        );
        const removedEdges = beforeEdges - graph.edges.length;
        if (removedEdges > 0) {
          removed.push(`  └─ ${removedEdges} edges`);
        }
      }
    }
  }

  return { graph, removed, marked };
}

/**
 * Verify graph consistency against filesystem.
 * Returns { orphanNodes, missingFiles, danglingEdges }
 */
function verifyGraph(graph, projectRoot) {
  const orphanNodes = [];
  const missingFiles = [];

  for (const [key, node] of Object.entries(graph.nodes)) {
    if (node.type === "File" && node.metadata.path) {
      const fullPath = path.join(projectRoot, node.metadata.path);
      if (!fs.existsSync(fullPath)) {
        missingFiles.push({ key, path: node.metadata.path });
      }
    }
  }

  // Check for edges referencing non-existent nodes
  const nodeKeys = new Set(Object.keys(graph.nodes));
  const danglingEdges = graph.edges.filter(
    e => !nodeKeys.has(`${e.from.type}:${e.from.name}`) || !nodeKeys.has(`${e.to.type}:${e.to.name}`)
  );

  return { orphanNodes, missingFiles, danglingEdges };
}

function main() {
  const args = process.argv.slice(2);
  const isOnce = args.includes("--once");
  const isDryRun = args.includes("--dry-run");
  const isWatch = args.includes("--watch");
  const isGC = args.includes("--gc");
  const isVerify = args.includes("--verify");
  const projectRoot = process.cwd();

  // Also support TTB_PROJECT_ROOT
  const root = process.env.TTB_PROJECT_ROOT || projectRoot;

  // Handle --verify: check graph consistency and exit
  if (isVerify) {
    const store = getGraphStore(root);
    if (!store) {
      console.error("[graph-updater] graph-store not available");
      process.exit(1);
    }
    const graph = store.load();
    const result = verifyGraph(graph, root);
    console.log(`[verify] Nodes: ${Object.keys(graph.nodes).length}, Edges: ${graph.edges.length}`);
    console.log(`[verify] Missing files: ${result.missingFiles.length}`);
    for (const mf of result.missingFiles) {
      console.log(`  - ${mf.key} → ${mf.path}`);
    }
    console.log(`[verify] Dangling edges: ${result.danglingEdges.length}`);
    for (const de of result.danglingEdges.slice(0, 10)) {
      console.log(`  - ${de.from.type}:${de.from.name} ${de.relation} ${de.to.type}:${de.to.name}`);
    }
    if (result.missingFiles.length === 0 && result.danglingEdges.length === 0) {
      console.log("[verify] Graph is consistent.");
    }
    return;
  }

  // Handle --gc: run garbage collection and exit
  if (isGC) {
    const store = getGraphStore(root);
    if (!store) {
      console.error("[graph-updater] graph-store not available");
      process.exit(1);
    }
    const graph = store.load();
    console.log(`[gc] Loaded graph: ${Object.keys(graph.nodes).length} nodes, ${graph.edges.length} edges`);

    const gcResult = gcStaleNodes(graph, root, { deletedFiles: [], removed: [] });
    console.log(`[gc] Marked stale: ${gcResult.marked.length}`);
    for (const key of gcResult.marked) {
      console.log(`  - ${key}`);
    }
    console.log(`[gc] Removed: ${gcResult.removed.length}`);
    for (const key of gcResult.removed) {
      console.log(`  - ${key}`);
    }

    if (!isDryRun && (gcResult.removed.length > 0 || gcResult.marked.length > 0)) {
      store.save(gcResult.graph);
      console.log("[gc] Graph saved.");
    }
    return;
  }

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

    // Write updated content (dual-write: markdown + JSON)
    if (!isDryRun && currentContent !== kgContent) {
      // Backup before writing
      const backupPath = kgPath.replace(/\.md$/, `.backup.${new Date().toISOString().slice(0, 10)}.md`);
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(kgPath, backupPath);
        console.log(`[graph-updater] Backup created: ${backupPath}`);
      }
      fs.writeFileSync(kgPath, currentContent, "utf8");
      console.log(`[graph-updater] Updated ${KG_FILE}`);

      // Dual-write to JSON via graph-store + GC
      const store = getGraphStore(root);
      if (store) {
        try {
          const graph = store.load();
          let allDeletedFiles = [];
          let allRemoved = [];

          // Apply all processed patches to JSON graph
          for (const commitHash of processedHashes) {
            const ci = getCommitInfo(root, commitHash);
            if (!ci.error) {
              const p = extractPatchLocally(ci);
              store.applyPatch(graph, p);
              if (p.deletedFiles) allDeletedFiles.push(...p.deletedFiles);
              if (p.removed) allRemoved.push(...p.removed);
            }
          }

          // Run GC after patching
          const gcResult = gcStaleNodes(graph, root, {
            deletedFiles: allDeletedFiles,
            removed: allRemoved,
          });
          if (gcResult.marked.length > 0) {
            console.log(`[graph-updater] GC marked ${gcResult.marked.length} stale node(s)`);
          }
          if (gcResult.removed.length > 0) {
            console.log(`[graph-updater] GC removed ${gcResult.removed.length} stale node(s)`);
          }

          store.save(graph);
          console.log(`[graph-updater] Updated graph_memory.json (dual-write + GC)`);
        } catch (e) {
          console.log(`[graph-updater] JSON dual-write skipped: ${e.message}`);
        }
      }
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
