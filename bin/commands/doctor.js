/**
 * doctor.js — Diagnose and fix command for tt-b
 */

const { fileExists, isDir, readJson, expandHome, claudeDir } = require("../lib/utils");
const { ok, fail, warn, info, heading, spacer, Spinner } = require("../lib/ui");
const { installGlobal } = require("./install");
const { healthCheck, installSqlite3, checkSqlite3, needsSudo } = require("./health");

function doctor() {
  heading("tt-b Doctor — Diagnose & Fix");

  let fixed = 0;
  const issues = [];

  // 1. Check and fix better-sqlite3
  const sqliteCheck = checkSqlite3();
  if (sqliteCheck.ok) {
    ok(`better-sqlite3 v${sqliteCheck.version}`);
  } else {
    issues.push({ name: "better-sqlite3", issue: "not installed" });
    warn("better-sqlite3 missing — installing...");

    const sudoNeeded = needsSudo();
    if (sudoNeeded) {
      info("Global npm directory requires elevated permissions");
      info("If installation fails, try: sudo npx tt-b doctor");
    }

    const result = installSqlite3({ useSudo: sudoNeeded });
    if (result.ok) {
      ok(`better-sqlite3 v${result.version} installed`);
      fixed++;
    } else {
      fail("Failed to install better-sqlite3");
      if (result.diagnosis) {
        spacer();
        warn("Diagnosis:");
        for (const d of result.diagnosis) {
          info(`  Problem: ${d.problem}`);
          info(`  Fix: ${d.fix}`);
        }
      }
    }
  }

  // 2. Check settings.json
  const settingsPath = expandHome("~/.claude/settings.json");
  const settings = readJson(settingsPath);

  if (!settings) {
    issues.push({ name: "settings.json", issue: "missing" });
  } else {
    if (!settings.hooks || !settings.hooks.SessionStart || settings.hooks.SessionStart.length === 0) {
      issues.push({ name: "settings.json", issue: "no hooks configured" });
    }
  }

  // 3. Check bin directory
  const binDir = expandHome("~/.claude/bin");
  if (!isDir(binDir)) {
    issues.push({ name: "~/.claude/bin/", issue: "missing" });
  } else {
    const requiredBins = ["memory-reminder.js", "model-preflight.js"];
    for (const bin of requiredBins) {
      if (!fileExists(require("path").join(binDir, bin))) {
        issues.push({ name: `bin/${bin}`, issue: "missing" });
      }
    }
  }

  // 4. Check CLAUDE.md
  const claudeMdPath = expandHome("~/.claude/CLAUDE.md");
  if (!fileExists(claudeMdPath)) {
    issues.push({ name: "CLAUDE.md", issue: "missing" });
  }

  // Report findings and fix config issues
  const configIssues = issues.filter(i => i.name !== "better-sqlite3");
  if (configIssues.length > 0) {
    spacer();
    warn(`Found ${configIssues.length} config issue(s):`);
    for (const issue of configIssues) {
      info(`${issue.name}: ${issue.issue}`);
    }

    info("Attempting to fix by redeploying...");
    const spinner = new Spinner("Redeploying...").start();

    try {
      installGlobal();
      spinner.succeed("Redeploy complete");
      fixed += configIssues.length;
    } catch (e) {
      spinner.fail(`Redeploy failed: ${e.message}`);
    }
  } else if (fixed === 0) {
    ok("Everything looks good. No issues found.");
  }

  // Run health check with autoFix enabled
  spacer();
  const health = healthCheck({ verbose: false, autoFix: true });

  return { fixed, issues, health };
}

module.exports = { doctor };
