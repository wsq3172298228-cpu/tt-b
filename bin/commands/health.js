/**
 * health.js — Health check command for tt-b
 */

const path = require("path");
const { execSync } = require("child_process");
const { fileExists, isDir, readText, readJson, checkNodeVersion, claudeDir, run } = require("../lib/utils");
const { c, ok, fail, warn, info, heading, spacer, Spinner } = require("../lib/ui");

function checkSqlite3() {
  try {
    require("better-sqlite3");
    return { ok: true, version: require("better-sqlite3/package.json").version };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function checkBuildTools() {
  const tools = {};

  // Check Python (required by node-gyp)
  tools.python = run("python3 --version") || run("python --version");

  // Check make
  tools.make = run("make --version 2>&1 | head -1");

  // Check gcc/cc
  tools.cc = run("gcc --version 2>&1 | head -1") || run("cc --version 2>&1 | head -1");

  // Check node-gyp
  tools.nodeGyp = run("node-gyp --version");

  return tools;
}

function needsSudo() {
  // Check if npm global dir is writable
  const globalDir = run("npm config get prefix");
  if (!globalDir) return false;

  try {
    execSync(`test -w "${globalDir}"`, { stdio: "pipe" });
    return false;
  } catch {
    return true;
  }
}

function installSqlite3({ useSudo = false } = {}) {
  const spinner = new Spinner("Installing better-sqlite3...").start();

  try {
    // Try local install first (no sudo needed)
    const cmd = useSudo ? "sudo npm install better-sqlite3" : "npm install better-sqlite3";
    run(cmd, { timeout: 180000 });

    // Verify installation
    const check = checkSqlite3();
    if (check.ok) {
      spinner.succeed(`better-sqlite3 v${check.version} installed`);
      return { ok: true, version: check.version };
    }

    spinner.fail("Installation completed but module not loadable");
    return { ok: false, error: "Module not loadable after install" };
  } catch (e) {
    spinner.fail("Installation failed");

    // Parse common errors
    const stderr = e.stderr || e.message || "";
    const diagnosis = diagnoseInstallError(stderr);

    return { ok: false, error: e.message, diagnosis };
  }
}

function diagnoseInstallError(stderr) {
  const issues = [];

  if (stderr.includes("EACCES") || stderr.includes("permission denied")) {
    issues.push({
      problem: "Permission denied",
      fix: "Run with sudo: sudo npx tt-b doctor",
    });
  }

  if (stderr.includes("gyp ERR") || stderr.includes("node-gyp")) {
    issues.push({
      problem: "Native compilation failed (node-gyp)",
      fix: "Install build tools: xcode-select --install (macOS) or build-essential (Linux)",
    });
  }

  if (stderr.includes("Python") || stderr.includes("python")) {
    issues.push({
      problem: "Python not found (required by node-gyp)",
      fix: "Install Python 3: brew install python3 (macOS) or apt install python3 (Linux)",
    });
  }

  if (stderr.includes("make") || stderr.includes("Makefile")) {
    issues.push({
      problem: "make not found",
      fix: "Install Xcode Command Line Tools: xcode-select --install",
    });
  }

  if (stderr.includes("prebuild") || stderr.includes("prebuild-install")) {
    issues.push({
      problem: "Prebuilt binary not available for this platform",
      fix: "Install from source with build tools (see above)",
    });
  }

  if (issues.length === 0) {
    issues.push({
      problem: "Unknown installation error",
      fix: "Try: npm install better-sqlite3 --build-from-source",
    });
  }

  return issues;
}

function healthCheck({ verbose = false, autoFix = false } = {}) {
  heading("tt-b Health Check");

  const checks = [];
  const home = claudeDir();

  // 1. Node.js version
  const nodeCheck = checkNodeVersion(18);
  if (nodeCheck.ok) {
    ok(`Node.js ${nodeCheck.version}`);
    checks.push({ name: "Node.js", status: "pass", detail: nodeCheck.version });
  } else {
    fail(`Node.js ${nodeCheck.version} (requires >= ${nodeCheck.required})`);
    checks.push({ name: "Node.js", status: "fail", detail: `requires >= ${nodeCheck.required}` });
  }

  // 2. better-sqlite3 dependency
  let sqliteCheck = checkSqlite3();
  if (sqliteCheck.ok) {
    ok(`better-sqlite3 v${sqliteCheck.version}`);
    checks.push({ name: "better-sqlite3", status: "pass", detail: `v${sqliteCheck.version}` });
  } else {
    if (autoFix) {
      warn("better-sqlite3 not installed — attempting auto-install...");

      // Check if sudo might be needed
      const sudoNeeded = needsSudo();
      if (sudoNeeded) {
        info("Global npm directory requires elevated permissions");
      }

      const result = installSqlite3({ useSudo: sudoNeeded });
      if (result.ok) {
        ok(`better-sqlite3 v${result.version} (auto-installed)`);
        checks.push({ name: "better-sqlite3", status: "pass", detail: `v${result.version} (auto)` });
      } else {
        fail("better-sqlite3 installation failed");
        if (result.diagnosis) {
          spacer();
          warn("Diagnosis:");
          for (const d of result.diagnosis) {
            info(`Problem: ${d.problem}`);
            info(`Fix: ${d.fix}`);
          }
        }
        checks.push({ name: "better-sqlite3", status: "fail", detail: "install failed" });
      }
    } else {
      fail("better-sqlite3 not installed (required for graph-store)");
      if (verbose) {
        info(`Error: ${sqliteCheck.error}`);

        // Show build tools status
        const tools = checkBuildTools();
        spacer();
        info("Build tools status:");
        info(`  Python: ${tools.python || "not found"}`);
        info(`  make: ${tools.make || "not found"}`);
        info(`  cc/gcc: ${tools.cc || "not found"}`);
      }
      info("Fix: run `npx tt-b doctor` to auto-install");
      checks.push({ name: "better-sqlite3", status: "fail", detail: "not installed" });
    }
  }

  spacer();

  // 2. Core files
  const coreFiles = [
    ["settings.json", "~/.claude/settings.json"],
    ["bin/memory-reminder.js", "~/.claude/bin/memory-reminder.js"],
    ["bin/model-preflight.js", "~/.claude/bin/model-preflight.js"],
  ];

  for (const [name, display] of coreFiles) {
    const p = path.join(home, name);
    if (fileExists(p)) {
      ok(`${display} exists`);
      checks.push({ name: display, status: "pass" });
    } else {
      fail(`${display} missing`);
      checks.push({ name: display, status: "fail", detail: "missing" });
    }
  }

  // 3. Settings.json hooks
  const settingsPath = path.join(home, "settings.json");
  const settings = readJson(settingsPath);
  if (settings) {
    const hasHooks = settings.hooks &&
      settings.hooks.SessionStart &&
      settings.hooks.SessionStart.length > 0;

    if (hasHooks) {
      ok("Hooks configured (SessionStart, UserPromptSubmit)");
      checks.push({ name: "Hooks", status: "pass" });
    } else {
      warn("settings.json exists but no hooks configured");
      checks.push({ name: "Hooks", status: "warn", detail: "not configured" });
    }
  }

  // 4. Skills
  const skillsDir = path.join(home, "skills");
  if (isDir(skillsDir)) {
    const skills = require("fs").readdirSync(skillsDir).filter(d => isDir(path.join(skillsDir, d)));
    ok(`${skills.length} skills installed`);
    if (verbose) {
      info(`Skills: ${skills.join(", ")}`);
    }
    checks.push({ name: "Skills", status: "pass", detail: `${skills.length} installed` });
  } else {
    warn("No skills directory found");
    checks.push({ name: "Skills", status: "warn", detail: "not found" });
  }

  // 5. CLAUDE.md
  const claudeMd = readText(path.join(home, "CLAUDE.md"));
  if (claudeMd) {
    if (claudeMd.includes("tt-b") || claudeMd.includes("agent-workflow")) {
      ok("CLAUDE.md contains tt-b configuration");
      checks.push({ name: "CLAUDE.md", status: "pass" });
    } else {
      info("CLAUDE.md exists (user content, no tt-b block)");
      checks.push({ name: "CLAUDE.md", status: "pass", detail: "user content only" });
    }
  } else {
    warn("No CLAUDE.md found");
    checks.push({ name: "CLAUDE.md", status: "warn", detail: "not found" });
  }

  // 6. Memory files
  const memDir = path.join(home, "memory");
  if (isDir(memDir)) {
    const memFiles = require("fs").readdirSync(memDir).filter(f => f.endsWith(".md"));
    ok(`${memFiles.length} memory files`);
    if (verbose) {
      info(`Files: ${memFiles.join(", ")}`);
    }
    checks.push({ name: "Memory", status: "pass", detail: `${memFiles.length} files` });
  } else {
    info("No memory directory (will be created on first use)");
    checks.push({ name: "Memory", status: "info", detail: "will be created" });
  }

  // Summary
  spacer();
  const passed = checks.filter(c => c.status === "pass").length;
  const warnings = checks.filter(c => c.status === "warn").length;
  const failed = checks.filter(c => c.status === "fail").length;
  const total = checks.length;

  if (failed === 0 && warnings === 0) {
    console.log(`${c.green}${c.bold}All ${total} checks passed.${c.reset} tt-b is healthy.`);
  } else if (failed === 0) {
    console.log(`${c.yellow}${passed} passed, ${warnings} warnings.${c.reset} Run \`npx tt-b install --global\` to fix warnings.`);
  } else {
    console.log(`${c.red}${failed} failed, ${passed} passed.${c.reset} Run \`npx tt-b install --global\` to fix.`);
  }

  return { passed, warnings, failed, total, checks };
}

module.exports = { healthCheck, installSqlite3, checkSqlite3, checkBuildTools, needsSudo };
