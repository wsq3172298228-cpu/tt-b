#!/usr/bin/env node

/**
 * tt-b Cleanup
 *
 * Removes all tt-b artifacts from a target project:
 *
 *   - Managed blocks in CLAUDE.md and AGENTS.md
 *   - Helper scripts in .claude/bin/
 *   - Memory templates in .claude/memory/
 *   - Legacy memory pointers in .claude/
 *   - Hook entries in .claude/settings.json (preserves other settings)
 *   - Instruction entries in opencode.json (preserves other config)
 *   - Lifecycle viewer artifacts
 *
 * Usage:
 *   node bin/tt-b-cleanup.js [target-dir] [--dry-run] [--force] [--help]
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARKER_START = "<!-- tt-b:agent-workflow:start -->";
const MARKER_END = "<!-- tt-b:agent-workflow:end -->";
const MEMORY_REMINDER_PATTERN = "memory-reminder.js";

const TT_B_SCRIPTS = [
  ".claude/bin/model-preflight.js",
  ".claude/bin/memory-reminder.js",
  ".claude/bin/tt-b-mcp-server.js",
  ".claude/bin/tt-b-rest-server.js",
  ".claude/bin/tt-b-lifecycle.js",
];

const TT_B_DIRS = [
  ".claude/functions",
  ".claude/packages",
  "plugin",
  ".claude-plugin",
  ".codex-plugin",
];

const TT_B_MEMORY_FILES = [
  ".claude/memory/knowledge-graph.md",
  ".claude/memory/session-state.md",
];

const TT_B_LEGACY_FILES = [
  ".claude/knowledge-graph.md",
  ".claude/session-state.md",
];

const TT_B_INSTRUCTION_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usage() {
  return [
    "Usage: node bin/tt-b-cleanup.js [target-dir] [options]",
    "",
    "Remove all tt-b artifacts from a target project.",
    "",
    "Options:",
    "  --dry-run     Show what would be removed without changing files.",
    "  --force       Skip confirmation prompt.",
    "  --help        Show this help.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { targetDir: ".", dryRun: false, force: false, help: false };
  const positional = [];

  for (const arg of argv) {
    if (arg === "--force") options.force = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }

  if (positional.length > 1) throw new Error("Only one target directory may be provided.");
  if (positional.length === 1) options.targetDir = positional[0];

  return options;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Managed block removal
// ---------------------------------------------------------------------------

function removeManagedBlock(content) {
  if (!content) return { changed: false, content };

  const pattern = new RegExp(
    `\\n?${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}\\n?`,
    "g"
  );

  if (!pattern.test(content)) return { changed: false, content };

  const cleaned = content.replace(pattern, "").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  return { changed: true, content: cleaned };
}

// ---------------------------------------------------------------------------
// Claude settings hook cleanup
// ---------------------------------------------------------------------------

function cleanClaudeSettings(settingsPath) {
  const text = readText(settingsPath);
  if (!text) return { changed: false, reason: "file-not-found" };

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { changed: false, reason: "invalid-json" };
  }

  if (!data.hooks) return { changed: false, reason: "no-hooks" };

  let changed = false;
  const cleanedHooks = {};

  for (const [eventName, entries] of Object.entries(data.hooks)) {
    const filtered = [];

    for (const entry of entries) {
      const entryStr = JSON.stringify(entry);
      if (entryStr.includes(MEMORY_REMINDER_PATTERN)) {
        changed = true;
        continue; // Remove memory-reminder hook entries
      }
      filtered.push(entry);
    }

    if (filtered.length > 0) {
      cleanedHooks[eventName] = filtered;
    }
  }

  if (!changed) return { changed: false, reason: "no-tt-b-hooks" };

  data.hooks = Object.keys(cleanedHooks).length > 0 ? cleanedHooks : undefined;
  if (data.hooks === undefined) delete data.hooks;

  return { changed: true, content: JSON.stringify(data, null, 2) + "\n" };
}

// ---------------------------------------------------------------------------
// OpenCode config cleanup
// ---------------------------------------------------------------------------

function cleanOpenCodeConfig(configPath) {
  const text = readText(configPath);
  if (!text) return { changed: false, reason: "file-not-found" };

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { changed: false, reason: "invalid-json" };
  }

  if (!data.instructions || !Array.isArray(data.instructions)) {
    return { changed: false, reason: "no-instructions" };
  }

  const ttbPaths = [
    "AGENTS.md",
    "CLAUDE.md",
    ".claude/memory/knowledge-graph.md",
    ".claude/memory/session-state.md",
  ];

  const filtered = data.instructions.filter((p) => !ttbPaths.includes(p));
  const removedCount = data.instructions.length - filtered.length;

  if (removedCount === 0) return { changed: false, reason: "no-tt-b-instructions" };

  data.instructions = filtered;
  if (data.instructions.length === 0) {
    delete data.instructions;
  }

  return { changed: true, content: JSON.stringify(data, null, 2) + "\n", removed: removedCount };
}

// ---------------------------------------------------------------------------
// Main cleanup logic
// ---------------------------------------------------------------------------

function cleanup(options) {
  const targetRoot = path.resolve(process.cwd(), options.targetDir);
  const actions = [];

  if (!exists(targetRoot)) {
    throw new Error(`Target directory does not exist: ${targetRoot}`);
  }

  function addAction(kind, target, detail) {
    actions.push({ kind, target, detail });
  }

  // 1. Remove managed blocks from instruction files
  for (const relPath of TT_B_INSTRUCTION_FILES) {
    const fullPath = path.join(targetRoot, relPath);
    const content = readText(fullPath);
    if (!content) {
      addAction("skipped", relPath, "file not found");
      continue;
    }

    const result = removeManagedBlock(content);
    if (!result.changed) {
      addAction("skipped", relPath, "no managed block found");
      continue;
    }

    // Check if the file has any content left outside the managed block
    const remaining = result.content.trim();
    if (!remaining || remaining.replace(/^#\s+.*/gm, "").trim() === "") {
      // File is empty or only has headings — remove the whole file
      if (!options.dryRun) {
        fs.unlinkSync(fullPath);
      }
      addAction("removed", relPath, "file was entirely tt-b content");
    } else {
      if (!options.dryRun) {
        fs.writeFileSync(fullPath, result.content, "utf8");
      }
      addAction("cleaned", relPath, "managed block removed");
    }
  }

  // 2. Remove helper scripts
  for (const relPath of TT_B_SCRIPTS) {
    const fullPath = path.join(targetRoot, relPath);
    if (!exists(fullPath)) {
      addAction("skipped", relPath, "file not found");
      continue;
    }
    if (!options.dryRun) {
      fs.unlinkSync(fullPath);
    }
    addAction("removed", relPath);
  }

  // 3. Remove memory files (with confirmation)
  for (const relPath of TT_B_MEMORY_FILES) {
    const fullPath = path.join(targetRoot, relPath);
    if (!exists(fullPath)) {
      addAction("skipped", relPath, "file not found");
      continue;
    }

    const content = readText(fullPath);
    const isTemplate = content && (
      content.includes("not initialized") ||
      content.includes("none recorded") ||
      content.includes("unknown")
    );

    if (isTemplate || options.force) {
      if (!options.dryRun) {
        fs.unlinkSync(fullPath);
      }
      addAction("removed", relPath, isTemplate ? "template content" : "forced");
    } else {
      addAction("kept", relPath, "contains project data (use --force to remove)");
    }
  }

  // 4. Remove legacy pointer files
  for (const relPath of TT_B_LEGACY_FILES) {
    const fullPath = path.join(targetRoot, relPath);
    if (!exists(fullPath)) {
      addAction("skipped", relPath, "file not found");
      continue;
    }

    const content = readText(fullPath);
    const isPointer = content && content.includes("Canonical memory now lives under");

    if (isPointer || options.force) {
      if (!options.dryRun) {
        fs.unlinkSync(fullPath);
      }
      addAction("removed", relPath, isPointer ? "legacy pointer" : "forced");
    } else {
      addAction("kept", relPath, "not a legacy pointer (use --force to remove)");
    }
  }

  // 5. Clean .claude/settings.json hooks
  const settingsPath = path.join(targetRoot, ".claude/settings.json");
  const settingsResult = cleanClaudeSettings(settingsPath);
  if (settingsResult.changed) {
    if (!options.dryRun) {
      if (settingsResult.content) {
        fs.writeFileSync(settingsPath, settingsResult.content, "utf8");
      } else {
        // No hooks left — check if file has other content
        const remaining = readText(settingsPath);
        if (remaining) {
          const data = JSON.parse(remaining);
          if (Object.keys(data).length === 0) {
            fs.unlinkSync(settingsPath);
            addAction("removed", ".claude/settings.json", "no settings remaining");
          } else {
            fs.writeFileSync(settingsPath, settingsResult.content, "utf8");
            addAction("cleaned", ".claude/settings.json", "hooks removed");
          }
        }
      }
    }
    if (!actions.find((a) => a.target === ".claude/settings.json")) {
      addAction("cleaned", ".claude/settings.json", "hooks removed");
    }
  } else {
    addAction("skipped", ".claude/settings.json", settingsResult.reason || "no tt-b hooks");
  }

  // 6. Clean opencode.json instructions
  const opencodePath = path.join(targetRoot, "opencode.json");
  const opencodeResult = cleanOpenCodeConfig(opencodePath);
  if (opencodeResult.changed) {
    if (opencodeResult.content) {
      if (!options.dryRun) {
        fs.writeFileSync(opencodePath, opencodeResult.content, "utf8");
      }
      addAction("cleaned", "opencode.json", `${opencodeResult.removed} tt-b instructions removed`);
    } else {
      if (!options.dryRun) {
        fs.unlinkSync(opencodePath);
      }
      addAction("removed", "opencode.json", "no config remaining");
    }
  } else {
    addAction("skipped", "opencode.json", opencodeResult.reason || "no tt-b instructions");
  }

  // 7. Remove tt-b directories (functions/, packages/)
  for (const relPath of TT_B_DIRS) {
    const fullPath = path.join(targetRoot, relPath);
    if (!exists(fullPath)) {
      addAction("skipped", relPath, "directory not found");
      continue;
    }
    if (!options.dryRun) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
    addAction("removed", relPath, "tt-b module directory");
  }

  // 8. Clean up empty .claude/bin/ directory
  const binDir = path.join(targetRoot, ".claude/bin");
  if (exists(binDir)) {
    try {
      const remaining = fs.readdirSync(binDir);
      if (remaining.length === 0) {
        if (!options.dryRun) {
          fs.rmdirSync(binDir);
        }
        addAction("removed", ".claude/bin/", "empty directory");
      } else {
        addAction("kept", ".claude/bin/", `${remaining.length} non-tt-b files remaining`);
      }
    } catch {
      // ignore
    }
  }

  // 8. Clean up empty .claude/memory/ directory
  const memDir = path.join(targetRoot, ".claude/memory");
  if (exists(memDir)) {
    try {
      const remaining = fs.readdirSync(memDir);
      if (remaining.length === 0) {
        if (!options.dryRun) {
          fs.rmdirSync(memDir);
        }
        addAction("removed", ".claude/memory/", "empty directory");
      } else {
        addAction("kept", ".claude/memory/", `${remaining.length} non-tt-b files remaining`);
      }
    } catch {
      // ignore
    }
  }

  // 9. Clean up empty .claude/ directory
  const claudeDir = path.join(targetRoot, ".claude");
  if (exists(claudeDir)) {
    try {
      const remaining = fs.readdirSync(claudeDir);
      if (remaining.length === 0) {
        if (!options.dryRun) {
          fs.rmdirSync(claudeDir);
        }
        addAction("removed", ".claude/", "empty directory");
      } else {
        addAction("kept", ".claude/", `${remaining.length} non-tt-b files remaining`);
      }
    } catch {
      // ignore
    }
  }

  return { targetRoot, actions };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage() + "\n");
      return;
    }

    const mode = options.dryRun ? "DRY RUN" : "CLEANUP";
    process.stdout.write(`tt-b ${mode}\n`);
    process.stdout.write(`${"=".repeat(40)}\n\n`);

    const result = cleanup(options);

    const removed = result.actions.filter((a) => a.kind === "removed");
    const cleaned = result.actions.filter((a) => a.kind === "cleaned");
    const kept = result.actions.filter((a) => a.kind === "kept");
    const skipped = result.actions.filter((a) => a.kind === "skipped");

    for (const action of result.actions) {
      const icon = { removed: "[-]", cleaned: "[~]", kept: "[=]", skipped: "[ ]" }[action.kind];
      const detail = action.detail ? ` — ${action.detail}` : "";
      process.stdout.write(`  ${icon} ${action.target}${detail}\n`);
    }

    process.stdout.write(`\nSummary:\n`);
    process.stdout.write(`  Removed:  ${removed.length}\n`);
    process.stdout.write(`  Cleaned:  ${cleaned.length}\n`);
    process.stdout.write(`  Kept:     ${kept.length}\n`);
    process.stdout.write(`  Skipped:  ${skipped.length}\n`);

    if (options.dryRun) {
      process.stdout.write(`\nThis was a dry run. No files were modified.\n`);
      process.stdout.write(`Run without --dry-run to apply changes.\n`);
    } else {
      process.stdout.write(`\nCleanup complete: ${result.targetRoot}\n`);
    }

    if (kept.length > 0) {
      process.stdout.write(`\nNote: Some files were kept because they contain project data.\n`);
      process.stdout.write(`Use --force to remove them anyway.\n`);
    }
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n\n${usage()}\n`);
    process.exitCode = 1;
  }
}

main();
