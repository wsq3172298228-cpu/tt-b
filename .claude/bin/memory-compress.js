#!/usr/bin/env node

/**
 * Memory auto-compression hook for Claude Code.
 *
 * Triggers on context compaction (compact event) and compresses:
 * 1. knowledge-graph.md — remove redundant edges, collapse stale sections
 * 2. session-state.md — archive old activity, keep only current state
 *
 * Backup strategy: creates a timestamped backup before any mutation.
 */

const fs = require("fs");
const path = require("path");

const MEMORY_DIR = ".claude/memory";
const KG_FILE = `${MEMORY_DIR}/knowledge-graph.md`;
const SS_FILE = `${MEMORY_DIR}/session-state.md`;

// --- Config ---
const COMPRESS_THRESHOLD_LINES = 600;
const BACKUP_SUFFIX = `.backup.${new Date().toISOString().slice(0, 10)}.md`;

function readHookInput() {
  try {
    const text = fs.readFileSync(0, "utf8");
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split("\n");
}

function writeLines(filePath, lines) {
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const backupPath = filePath.replace(/\.md$/, BACKUP_SUFFIX.replace(".md", ".md"));
  const backupFullPath = filePath.replace(/\.md$/, `.backup.${new Date().toISOString().slice(0, 10)}.md`);
  if (fs.existsSync(backupFullPath)) return backupFullPath; // already backed up today
  fs.copyFileSync(filePath, backupFullPath);
  return backupFullPath;
}

/**
 * Compress a knowledge graph section by removing duplicate edges
 * and collapsing multi-line edge blocks into single lines.
 */
function compressEdgeBlock(lines) {
  const seen = new Set();
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "```txt" || trimmed === "```") {
      result.push(line);
      continue;
    }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(line);
  }
  return result;
}

/**
 * Remove empty sections (headers followed immediately by another header or EOF).
 */
function removeEmptySections(lines) {
  const result = [];
  let i = 0;
  while (i < lines.length) {
    const isHeader = /^#{1,4}\s/.test(lines[i]);
    if (isHeader) {
      // Look ahead: is the next non-blank line also a header?
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && /^#{1,4}\s/.test(lines[j])) {
        // Empty section, skip this header and blank lines
        i = j;
        continue;
      }
    }
    result.push(lines[i]);
    i++;
  }
  return result;
}

/**
 * Collapse verbose "Edges:" blocks for modules that haven't changed recently.
 * Keeps only edges that mention active modules/files.
 */
function collapseStaleEdgeBlocks(lines, activeKeywords) {
  const result = [];
  let inEdgeBlock = false;
  let edgeBuffer = [];
  let currentSection = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track current section
    if (/^#{2,4}\s/.test(line)) {
      currentSection = line.replace(/^#+\s*/, "").trim();
    }

    if (line.trim() === "Edges:" && i + 1 < lines.length && lines[i + 1].trim() === "```txt") {
      inEdgeBlock = true;
      edgeBuffer = [line];
      continue;
    }

    if (inEdgeBlock) {
      edgeBuffer.push(line);
      if (line.trim() === "```") {
        inEdgeBlock = false;
        // Check if any edge references an active keyword
        const hasActiveEdge = edgeBuffer.some((l) =>
          activeKeywords.some((kw) => l.toLowerCase().includes(kw.toLowerCase()))
        );
        if (hasActiveEdge) {
          result.push(...edgeBuffer);
        } else {
          // Keep a collapsed summary
          const edgeCount = edgeBuffer.filter((l) => l.trim() && !l.startsWith("```") && l.trim() !== "Edges:").length;
          result.push(edgeBuffer[0]); // "Edges:"
          result.push("```txt");
          result.push(`  (${edgeCount} edges omitted by auto-compression)`);
          result.push("```");
        }
        edgeBuffer = [];
      }
      continue;
    }

    result.push(line);
  }

  return result;
}

/**
 * Main compression logic.
 * Returns { compressed: boolean, linesBefore: number, linesAfter: number, backupPath: string|null }
 */
function compressKnowledgeGraph(projectRoot) {
  const kgPath = path.join(projectRoot, KG_FILE);
  if (!fs.existsSync(kgPath)) {
    return { compressed: false, reason: "file not found" };
  }

  let lines = readLines(kgPath);
  const linesBefore = lines.length;

  if (linesBefore < COMPRESS_THRESHOLD_LINES) {
    return { compressed: false, reason: `below threshold (${linesBefore} < ${COMPRESS_THRESHOLD_LINES})` };
  }

  // Step 1: Backup
  const backupPath = backupFile(kgPath);

  // Step 2: Remove duplicate edges within edge blocks
  let compressed = compressEdgeBlock(lines);

  // Step 3: Remove empty sections
  compressed = removeEmptySections(compressed);

  // Step 4: Collapse stale edge blocks (keep edges for recently changed modules)
  // Active keywords come from session-state.md changed files
  const ssPath = path.join(projectRoot, SS_FILE);
  const ssLines = readLines(ssPath);
  const activeKeywords = [];
  for (const line of ssLines) {
    const match = line.match(/[-*]\s*`([^`]+)`/);
    if (match) activeKeywords.push(match[1]);
  }
  // Always keep edges mentioning current project modules
  activeKeywords.push("importer", "memory-reminder", "model-preflight", "lifecycle");

  compressed = collapseStaleEdgeBlocks(compressed, activeKeywords);

  const linesAfter = compressed.length;

  if (linesAfter >= linesBefore) {
    return { compressed: false, reason: "compression produced no reduction", backupPath };
  }

  writeLines(kgPath, compressed);
  return { compressed: true, linesBefore, linesAfter, backupPath };
}

/**
 * Compress session-state.md by archiving old activity and keeping only current state.
 */
function compressSessionState(projectRoot) {
  const ssPath = path.join(projectRoot, SS_FILE);
  if (!fs.existsSync(ssPath)) {
    return { compressed: false, reason: "file not found" };
  }

  let lines = readLines(ssPath);
  const linesBefore = lines.length;

  // Remove "Refactoring Summary" and similar historical sections
  const sectionsToRemove = [
    "Refactoring Summary",
    "Before",
    "After",
    "Key Improvements",
  ];

  const result = [];
  let skipSection = false;
  let currentHeader = "";

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headerMatch) {
      currentHeader = headerMatch[1].trim();
      skipSection = sectionsToRemove.some(s => currentHeader.includes(s));
    }
    if (!skipSection) {
      result.push(line);
    }
  }

  // Remove "## Recent Changes" entries older than 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const finalResult = [];
  let inRecentChanges = false;

  for (const line of result) {
    if (line.includes("## Recent Changes")) {
      inRecentChanges = true;
      finalResult.push(line);
      continue;
    }

    if (inRecentChanges && line.match(/^## /)) {
      inRecentChanges = false;
      finalResult.push(line);
      continue;
    }

    if (inRecentChanges) {
      // Check if line has a date
      const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const lineDate = new Date(dateMatch[1]);
        if (lineDate < sevenDaysAgo) continue; // Skip old entries
      }
    }

    finalResult.push(line);
  }

  const linesAfter = finalResult.length;

  if (linesAfter >= linesBefore) {
    return { compressed: false, reason: "no reduction" };
  }

  backupFile(ssPath);
  writeLines(ssPath, finalResult);
  return { compressed: true, linesBefore, linesAfter };
}

function main() {
  const input = readHookInput();
  const projectRoot = input.cwd || process.cwd();

  // Only run on compact events
  const source = input.source || input.trigger || "";
  const eventName = input.hook_event_name || "";

  const isCompact =
    source === "compact" ||
    eventName === "compact" ||
    (eventName === "SessionStart" && source === "compact");

  if (!isCompact) return;

  const results = [];

  // Compress knowledge-graph.md
  const kgResult = compressKnowledgeGraph(projectRoot);
  if (kgResult.compressed) {
    results.push(`knowledge-graph.md: ${kgResult.linesBefore} → ${kgResult.linesAfter} lines`);
  }

  // Compress session-state.md
  const ssResult = compressSessionState(projectRoot);
  if (ssResult.compressed) {
    results.push(`session-state.md: ${ssResult.linesBefore} → ${ssResult.linesAfter} lines`);
  }

  if (results.length === 0) return;

  const output = {
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: "compact",
      additionalContext: `Memory auto-compressed:\n${results.join("\n")}`,
    },
  };

  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main();
