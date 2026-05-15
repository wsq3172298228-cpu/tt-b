#!/usr/bin/env node

/**
 * claude-global-deploy.js
 *
 * One-click global deploy of tt-b configs to ~/.claude/
 * Supports: deploy (with backup), restore, delete, verify
 *
 * Usage:
 *   node bin/claude-global-deploy.js              # deploy with backup
 *   node bin/claude-global-deploy.js --dry-run    # preview without writing
 *   node bin/claude-global-deploy.js --restore    # restore from latest backup
 *   node bin/claude-global-deploy.js --restore --backup-id <id>  # restore specific backup
 *   node bin/claude-global-deploy.js --delete     # remove tt-b deployed files, keep originals
 *   node bin/claude-global-deploy.js --verify     # verify current deployment
 *   node bin/claude-global-deploy.js --list-backups  # list available backups
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const crypto = require("crypto");

const MARKER_PREFIX = "tt-b-deployed";
const BACKUP_DIR_NAME = "backups";
const MANIFEST_NAME = "manifest.json";

// ─── Files to deploy ───

function getDeployPlan(repoRoot) {
  return [
    {
      id: "settings.json",
      source: path.join(repoRoot, "templates/claude/settings.json"),
      target: "~/.claude/settings.json",
      merge: "json-merge-hooks",
    },
    {
      id: "CLAUDE.md",
      source: path.join(repoRoot, "CLAUDE.md"),
      target: "~/.claude/CLAUDE.md",
      merge: "managed-block",
    },
    {
      id: "bin/memory-reminder.js",
      source: path.join(repoRoot, ".claude/bin/memory-reminder.js"),
      target: "~/.claude/bin/memory-reminder.js",
      merge: "overwrite",
    },
    {
      id: "bin/model-preflight.js",
      source: path.join(repoRoot, ".claude/bin/model-preflight.js"),
      target: "~/.claude/bin/model-preflight.js",
      merge: "overwrite",
    },
    {
      id: "memory/knowledge-graph.md",
      source: path.join(repoRoot, "templates/claude/memory/knowledge-graph.md"),
      target: "~/.claude/memory/knowledge-graph.md",
      merge: "skip-if-exists",
    },
    {
      id: "memory/session-state.md",
      source: path.join(repoRoot, "templates/claude/memory/session-state.md"),
      target: "~/.claude/memory/session-state.md",
      merge: "skip-if-exists",
    },
    {
      id: "skills",
      source: path.join(repoRoot, "plugin/skills"),
      target: "~/.claude/skills",
      merge: "dir-merge",
      isDir: true,
    },
    {
      id: "plugins",
      source: path.join(repoRoot, "plugin/.claude-plugin"),
      target: "~/.claude/plugins",
      merge: "dir-merge",
      isDir: true,
    },
  ];
}

// ─── Utilities ───

function expandHome(p) {
  if (p.startsWith("~/") || p === "~") {
    return path.join(process.env.HOME || process.env.USERPROFILE, p.slice(1));
  }
  return p;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileExists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function copyDirRecursive(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function listDirRecursive(dir, prefix = "") {
  const results = [];
  if (!isDir(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...listDirRecursive(path.join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function shortHash(content) {
  return crypto.createHash("md5").update(content).digest("hex").slice(0, 8);
}

// ─── Backup ───

function getBackupRoot() {
  return expandHome(`~/.claude/${BACKUP_DIR_NAME}/tt-b`);
}

function createBackup(deployPlan, targetPaths) {
  const backupId = timestamp();
  const backupDir = path.join(getBackupRoot(), backupId);
  ensureDir(backupDir);

  const manifest = {
    id: backupId,
    created: new Date().toISOString(),
    files: [],
  };

  for (const item of deployPlan) {
    const targetPath = expandHome(item.target);

    if (item.isDir) {
      if (isDir(targetPath)) {
        const relFiles = listDirRecursive(targetPath);
        for (const rel of relFiles) {
          const src = path.join(targetPath, rel);
          const dest = path.join(backupDir, item.id, rel);
          ensureDir(path.dirname(dest));
          fs.copyFileSync(src, dest);
          manifest.files.push({
            id: `${item.id}/${rel}`,
            target: item.target + "/" + rel,
            backupPath: path.join(item.id, rel),
            wasManaged: isManagedFile(src),
          });
        }
      }
    } else {
      const content = readText(targetPath);
      if (content !== null) {
        const backupPath = path.join(backupDir, item.id);
        ensureDir(path.dirname(backupPath));
        fs.writeFileSync(backupPath, content, "utf8");
        manifest.files.push({
          id: item.id,
          target: item.target,
          backupPath: item.id,
          wasManaged: isManagedFile(targetPath),
          hash: shortHash(content),
        });
      }
    }
  }

  const manifestPath = path.join(backupDir, MANIFEST_NAME);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return { backupId, backupDir, manifest };
}

function listBackups() {
  const root = getBackupRoot();
  if (!isDir(root)) return [];

  const backups = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(root, entry.name, MANIFEST_NAME);
    const content = readText(manifestPath);
    if (content) {
      try {
        backups.push(JSON.parse(content));
      } catch {
        // skip corrupt manifest
      }
    }
  }

  return backups.sort((a, b) => b.id.localeCompare(a.id));
}

function getLatestBackup() {
  const backups = listBackups();
  return backups.length > 0 ? backups[0] : null;
}

// ─── Managed file detection ───

const MANAGED_HEADER_RE = new RegExp(
  `^<!--\\s*${MARKER_PREFIX}[:\\s]`,
  "m"
);

function isManagedFile(filePath) {
  const content = readText(filePath);
  if (!content) return false;
  // Check HTML comment marker (deploy marker)
  if (MANAGED_HEADER_RE.test(content)) return true;
  // Check managed-block marker (agent-workflow)
  if (content.includes(MARKER_START)) return true;
  // Check JSON embedded marker
  if (filePath.endsWith(".json")) {
    try {
      const obj = JSON.parse(content);
      if (obj._tt_b_managed) return true;
    } catch {}
  }
  return false;
}

function managedHeader(itemId) {
  return `<!-- ${MARKER_PREFIX}: ${itemId} | backed-up: true | restore with: node bin/claude-global-deploy.js --restore -->`;
}

function wrapWithManagedMarker(content, itemId, isJson) {
  if (isJson) {
    // For JSON files, embed marker as a field instead of a comment
    try {
      const obj = JSON.parse(content);
      obj._tt_b_managed = itemId;
      return JSON.stringify(obj, null, 2) + "\n";
    } catch {
      // fallback to comment if parse fails
    }
  }
  const header = managedHeader(itemId);
  return `${header}\n${content}`;
}

function stripManagedMarker(content) {
  // Strip HTML comment marker (use [\s\S]*? for multi-line safety)
  let cleaned = content.replace(
    new RegExp(`^<!--\\s*${MARKER_PREFIX}[\\s\\S]*?-->\\s*`),
    ""
  );
  // Strip JSON embedded marker
  try {
    const obj = JSON.parse(cleaned);
    if (obj._tt_b_managed) {
      delete obj._tt_b_managed;
      cleaned = JSON.stringify(obj, null, 2) + "\n";
    }
  } catch {}
  return cleaned;
}

// ─── Merge strategies ───

const MARKER_START = "<!-- tt-b:agent-workflow:start -->";
const MARKER_END = "<!-- tt-b:agent-workflow:end -->";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mergeManagedBlock(existing, newContent) {
  const block = `${MARKER_START}\n\n${newContent.trim()}\n\n${MARKER_END}\n`;
  if (!existing || !existing.trim()) return block;

  const pattern = new RegExp(
    `${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}\\n?`
  );
  if (pattern.test(existing)) {
    return existing.replace(pattern, block);
  }

  return `${existing.replace(/\s+$/, "")}\n\n${block}`;
}

function mergeJsonHooks(existingText, templateText) {
  const template = JSON.parse(templateText);
  if (!existingText || !existingText.trim()) {
    return JSON.stringify(template, null, 2) + "\n";
  }

  // Strip managed markers before parsing
  const cleanExisting = stripManagedMarker(existingText);
  const existing = JSON.parse(cleanExisting);
  const mergedHooks = { ...(existing.hooks || {}) };

  for (const [eventName, templateEntries] of Object.entries(
    template.hooks || {}
  )) {
    const existingEntries = mergedHooks[eventName] || [];
    const seen = new Set(existingEntries.map((e) => JSON.stringify(e)));
    const result = [...existingEntries];

    for (const entry of Array.isArray(templateEntries) ? templateEntries : []) {
      const key = JSON.stringify(entry);
      if (!seen.has(key)) {
        result.push(entry);
        seen.add(key);
      }
    }

    mergedHooks[eventName] = result;
  }

  const merged = { ...existing, hooks: mergedHooks };
  return JSON.stringify(merged, null, 2) + "\n";
}

// ─── Deploy ───

function deploy(options) {
  const repoRoot = path.resolve(__dirname, "..");
  const plan = getDeployPlan(repoRoot);
  const results = [];

  // 1. Backup existing files
  let backup = null;
  if (!options.dryRun) {
    const targetPaths = plan.map((item) => expandHome(item.target));
    backup = createBackup(plan, targetPaths);
    results.push({ action: "backup", path: backup.backupDir, status: "ok" });
  } else {
    results.push({ action: "backup", path: "(dry-run)", status: "skipped" });
  }

  // 2. Deploy each file
  for (const item of plan) {
    const targetPath = expandHome(item.target);
    const sourceExists = item.isDir
      ? isDir(item.source)
      : fileExists(item.source);

    if (!sourceExists) {
      results.push({
        action: "skip",
        id: item.id,
        target: item.target,
        reason: "source not found",
      });
      continue;
    }

    if (item.isDir) {
      if (options.dryRun) {
        const files = listDirRecursive(item.source);
        results.push({
          action: "deploy-dir",
          id: item.id,
          target: item.target,
          files: files.length,
          status: "dry-run",
        });
      } else {
        copyDirRecursive(item.source, targetPath);
        const files = listDirRecursive(targetPath);
        results.push({
          action: "deploy-dir",
          id: item.id,
          target: item.target,
          files: files.length,
          status: "ok",
        });
      }
      continue;
    }

    const sourceContent = readText(item.source);
    if (sourceContent === null) {
      results.push({
        action: "skip",
        id: item.id,
        target: item.target,
        reason: "source empty",
      });
      continue;
    }

    const existingContent = readText(targetPath);

    let finalContent;
    switch (item.merge) {
      case "managed-block":
        finalContent = mergeManagedBlock(
          existingContent || "",
          sourceContent
        );
        break;
      case "json-merge-hooks":
        finalContent = mergeJsonHooks(existingContent, sourceContent);
        break;
      case "skip-if-exists":
        if (existingContent) {
          results.push({
            action: "kept",
            id: item.id,
            target: item.target,
            reason: "already exists",
          });
          continue;
        }
        finalContent = sourceContent;
        break;
      case "overwrite":
      default:
        finalContent = sourceContent;
        break;
    }

    // Wrap with managed marker (except for managed-block which already has markers)
    if (item.merge !== "managed-block") {
      const isJson = item.target.endsWith(".json");
      finalContent = wrapWithManagedMarker(finalContent, item.id, isJson);
    }

    if (options.dryRun) {
      results.push({
        action: existingContent ? "update" : "create",
        id: item.id,
        target: item.target,
        status: "dry-run",
      });
    } else {
      writeText(targetPath, finalContent);
      results.push({
        action: existingContent ? "update" : "create",
        id: item.id,
        target: item.target,
        status: "ok",
      });
    }
  }

  return { backup, results };
}

// ─── Restore ───

function restore(options) {
  const backupId = options.backupId;
  let manifest;

  if (backupId) {
    const manifestPath = path.join(getBackupRoot(), backupId, MANIFEST_NAME);
    const content = readText(manifestPath);
    if (!content) {
      throw new Error(`Backup not found: ${backupId}`);
    }
    manifest = JSON.parse(content);
  } else {
    const latest = getLatestBackup();
    if (!latest) {
      throw new Error("No backups found. Nothing to restore.");
    }
    manifest = latest;
  }

  const backupDir = path.join(getBackupRoot(), manifest.id);
  const results = [];

  for (const file of manifest.files) {
    const backupPath = path.join(backupDir, file.backupPath);
    const targetPath = expandHome(file.target);

    const backupContent = readText(backupPath);
    if (backupContent === null) {
      results.push({
        action: "skip",
        id: file.id,
        target: file.target,
        reason: "backup file missing",
      });
      continue;
    }

    if (options.dryRun) {
      results.push({
        action: "restore",
        id: file.id,
        target: file.target,
        status: "dry-run",
      });
      continue;
    }

    // Restore the original content (strip our managed markers if present)
    const cleanContent = stripManagedMarker(backupContent);
    writeText(targetPath, cleanContent);
    results.push({
      action: "restore",
      id: file.id,
      target: file.target,
      status: "ok",
    });
  }

  // Remove deployed files that weren't in the original backup
  const plan = getDeployPlan(path.resolve(__dirname, ".."));
  for (const item of plan) {
    const inManifest = manifest.files.some(
      (f) => f.id === item.id || f.id.startsWith(item.id + "/")
    );
    if (!inManifest) {
      const targetPath = expandHome(item.target);
      if (fileExists(targetPath)) {
        if (!options.dryRun) {
          if (isDir(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(targetPath);
          }
        }
        results.push({
          action: "removed-new",
          id: item.id,
          target: item.target,
          status: options.dryRun ? "dry-run" : "ok",
        });
      }
    }
  }

  return { manifest, results };
}

// ─── Delete ───

function deleteDeployed(options) {
  const plan = getDeployPlan(path.resolve(__dirname, ".."));
  const results = [];

  for (const item of plan) {
    const targetPath = expandHome(item.target);

    if (!fileExists(targetPath)) {
      results.push({
        action: "skip",
        id: item.id,
        target: item.target,
        reason: "not found",
      });
      continue;
    }

    if (item.isDir) {
      // For dirs, only remove files that have our managed marker
      const relFiles = listDirRecursive(targetPath);
      let removed = 0;
      for (const rel of relFiles) {
        const fullPath = path.join(targetPath, rel);
        if (isManagedFile(fullPath)) {
          if (!options.dryRun) fs.unlinkSync(fullPath);
          removed++;
        }
      }
      results.push({
        action: "clean-dir",
        id: item.id,
        target: item.target,
        removed,
        status: options.dryRun ? "dry-run" : "ok",
      });
    } else {
      if (isManagedFile(targetPath)) {
        const content = readText(targetPath);
        // For managed-block files, strip the block instead of deleting
        if (content && content.includes(MARKER_START)) {
          const pattern = new RegExp(
            `\\n?${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}\\n?`,
            "g"
          );
          const stripped = content.replace(pattern, "").trim() + "\n";
          if (!options.dryRun) {
            if (stripped.length > 1) {
              writeText(targetPath, stripped);
            } else {
              fs.unlinkSync(targetPath);
            }
          }
          results.push({
            action: stripped.length > 1 ? "stripped-block" : "removed",
            id: item.id,
            target: item.target,
            status: options.dryRun ? "dry-run" : "ok",
          });
        } else {
          if (!options.dryRun) fs.unlinkSync(targetPath);
          results.push({
            action: "removed",
            id: item.id,
            target: item.target,
            status: options.dryRun ? "dry-run" : "ok",
          });
        }
      } else {
        results.push({
          action: "kept",
          id: item.id,
          target: item.target,
          reason: "not managed by tt-b",
        });
      }
    }
  }

  return { results };
}

// ─── Verify ───

function verify() {
  const plan = getDeployPlan(path.resolve(__dirname, ".."));
  const checks = [];

  for (const item of plan) {
    const targetPath = expandHome(item.target);

    if (item.isDir) {
      const exists = isDir(targetPath);
      const files = exists ? listDirRecursive(targetPath) : [];
      checks.push({
        id: item.id,
        target: item.target,
        exists,
        files: files.length,
        status: exists && files.length > 0 ? "ok" : "missing",
      });
    } else {
      const content = readText(targetPath);
      const exists = content !== null;
      const managed = exists ? isManagedFile(targetPath) : false;

      let parseable = true;
      if (exists && item.target.endsWith(".json")) {
        try {
          // Strip managed marker comment before parsing
          const cleanContent = stripManagedMarker(content);
          JSON.parse(cleanContent);
        } catch {
          parseable = false;
        }
      }

      checks.push({
        id: item.id,
        target: item.target,
        exists,
        managed,
        parseable: item.target.endsWith(".json") ? parseable : undefined,
        status: exists && parseable ? "ok" : exists ? "parse-error" : "missing",
      });
    }
  }

  // Check hooks work
  let hooksOk = false;
  try {
    const settingsPath = expandHome("~/.claude/settings.json");
    const settings = JSON.parse(readText(settingsPath) || "{}");
    hooksOk =
      settings.hooks &&
      settings.hooks.SessionStart &&
      settings.hooks.SessionStart.length > 0;
  } catch {
    // ignore
  }

  return { checks, hooksOk };
}

// ─── CLI ───

function usage() {
  return `Usage: node bin/claude-global-deploy.js [options]

Deploy tt-b configuration to ~/.claude/ (global Claude Code config).

Options:
  --dry-run           Preview changes without writing
  --restore           Restore from backup (latest, or specify --backup-id)
  --backup-id <id>    Specify backup to restore (e.g. 2026-05-15T14-30-00)
  --delete            Remove tt-b managed files from ~/.claude/
  --verify            Verify current deployment
  --list-backups      List available backups
  --help, -h          Show this help

Examples:
  node bin/claude-global-deploy.js                    # deploy
  node bin/claude-global-deploy.js --dry-run          # preview
  node bin/claude-global-deploy.js --restore          # undo last deploy
  node bin/claude-global-deploy.js --delete           # clean remove
  node bin/claude-global-deploy.js --verify           # check health
  node bin/claude-global-deploy.js --list-backups     # see backups`;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    restore: false,
    backupId: null,
    delete: false,
    verify: false,
    listBackups: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--restore":
        options.restore = true;
        break;
      case "--backup-id":
        options.backupId = argv[++i];
        break;
      case "--delete":
        options.delete = true;
        break;
      case "--verify":
        options.verify = true;
        break;
      case "--list-backups":
        options.listBackups = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function formatAction(action) {
  const icons = {
    backup: "[backup]",
    create: "[+new]",
    update: "[~upd]",
    kept: "[=keep]",
    skip: "[-skip]",
    "deploy-dir": "[dir]",
    restore: "[undo]",
    removed: "[-del]",
    "removed-new": "[-del]",
    "clean-dir": "[clean]",
    "stripped-block": "[strip]",
  };
  return icons[action.action] || `[${action.action}]`;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
      console.log(usage());
      return;
    }

    // ── List backups ──
    if (options.listBackups) {
      const backups = listBackups();
      if (backups.length === 0) {
        console.log("No backups found.");
        return;
      }
      console.log(`Available backups (${backups.length}):\n`);
      for (const b of backups) {
        console.log(`  ${b.id}  (${b.files.length} files)  ${b.created}`);
      }
      return;
    }

    // ── Verify ──
    if (options.verify) {
      const result = verify();
      console.log("Deployment verification:\n");
      for (const c of result.checks) {
        const icon = c.status === "ok" ? "OK" : "FAIL";
        const extra = c.managed ? " [managed]" : "";
        console.log(`  ${icon}  ${c.id.padEnd(30)} ${c.target}${extra}`);
      }
      console.log(`\nHooks configured: ${result.hooksOk ? "yes" : "no"}`);
      const allOk = result.checks.every((c) => c.status === "ok");
      console.log(`\nOverall: ${allOk ? "HEALTHY" : "ISSUES FOUND"}`);
      process.exitCode = allOk ? 0 : 1;
      return;
    }

    // ── Restore ──
    if (options.restore) {
      const result = restore(options);
      const mode = options.dryRun ? "Dry run" : "Restore";
      console.log(`${mode} from backup: ${result.manifest.id}\n`);
      for (const r of result.results) {
        console.log(`  ${formatAction(r)} ${r.id} -> ${r.target}${r.reason ? ` (${r.reason})` : ""}`);
      }
      if (!options.dryRun) {
        console.log("\nRestore complete. Run --verify to check.");
      }
      return;
    }

    // ── Delete ──
    if (options.delete) {
      const result = deleteDeployed(options);
      const mode = options.dryRun ? "Dry run" : "Delete";
      console.log(`${mode} tt-b managed files:\n`);
      for (const r of result.results) {
        console.log(`  ${formatAction(r)} ${r.id} -> ${r.target}${r.reason ? ` (${r.reason})` : ""}`);
      }
      if (!options.dryRun) {
        console.log("\nDelete complete. Run --verify to check.");
      }
      return;
    }

    // ── Deploy (default) ──
    const result = deploy(options);
    const mode = options.dryRun ? "Dry run" : "Deploy";
    console.log(`${mode} complete.\n`);

    if (result.backup && !options.dryRun) {
      console.log(`Backup: ${result.backup.backupDir}\n`);
    }

    for (const r of result.results) {
      console.log(`  ${formatAction(r)} ${r.id || ""}${r.target ? ` -> ${r.target}` : ""}${r.reason ? ` (${r.reason})` : ""}${r.files !== undefined ? ` [${r.files} files]` : ""}`);
    }

    if (!options.dryRun) {
      console.log("\nRunning verification...\n");
      const v = verify();
      for (const c of v.checks) {
        const icon = c.status === "ok" ? "OK" : "FAIL";
        console.log(`  ${icon}  ${c.id}`);
      }
      console.log(`\nHooks: ${v.hooksOk ? "OK" : "NOT CONFIGURED"}`);
      console.log("\nDone. Restart Claude Code to pick up new hooks.");
    }
  } catch (error) {
    console.error(`Error: ${error.message}\n`);
    console.error(usage());
    process.exitCode = 1;
  }
}

main();
