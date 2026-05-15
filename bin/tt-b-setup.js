#!/usr/bin/env node

/**
 * tt-b-setup.js — One-click installer for tt-b agent workflow kit
 *
 * Usage:
 *   npx tt-b                          # interactive install
 *   npx tt-b install                  # install to current project
 *   npx tt-b install --global         # deploy to ~/.claude/
 *   npx tt-b upgrade                  # update to latest
 *   npx tt-b uninstall                # remove tt-b files
 *   npx tt-b health                   # health check
 *   npx tt-b doctor                   # diagnose + fix
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

const PKG_NAME = "tt-b";
const VERSION = require("../package.json").version;

// ─── Colors ───

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function ok(msg) { console.log(`${c.green}  ✓${c.reset} ${msg}`); }
function fail(msg) { console.log(`${c.red}  ✗${c.reset} ${msg}`); }
function warn(msg) { console.log(`${c.yellow}  !${c.reset} ${msg}`); }
function info(msg) { console.log(`${c.dim}  ·${c.reset} ${msg}`); }
function heading(msg) { console.log(`\n${c.bold}${c.cyan}${msg}${c.reset}`); }

// ─── Utilities ───

function expandHome(p) {
  if (p.startsWith("~/") || p === "~") return path.join(process.env.HOME || "", p.slice(1));
  return p;
}

function fileExists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function readText(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function detectRepoRoot() {
  // If we're running from within the tt-b repo
  const localBin = path.join(__dirname, "claude-global-deploy.js");
  if (fileExists(localBin)) return path.resolve(__dirname, "..");

  // If installed globally via npm
  const globalRoot = run("npm root -g");
  if (globalRoot) {
    const ttbPath = path.join(globalRoot, PKG_NAME);
    if (fileExists(ttbPath)) return ttbPath;
  }

  // If running via npx, find the package
  const npxRoot = path.resolve(require.resolve("../package.json"), "..");
  if (fileExists(path.join(npxRoot, "bin", "claude-global-deploy.js"))) return npxRoot;

  return null;
}

// ─── Health check ───

function healthCheck() {
  heading("tt-b Health Check");

  const checks = [];

  // 1. Check ~/.claude/ deployed files
  const home = process.env.HOME || "";
  const claudeDir = path.join(home, ".claude");

  const requiredFiles = [
    ["settings.json", "~/.claude/settings.json"],
    ["bin/memory-reminder.js", "~/.claude/bin/memory-reminder.js"],
    ["bin/model-preflight.js", "~/.claude/bin/model-preflight.js"],
  ];

  for (const [name, display] of requiredFiles) {
    const p = path.join(claudeDir, name);
    if (fileExists(p)) {
      ok(`${display} exists`);
      checks.push(true);
    } else {
      fail(`${display} missing`);
      checks.push(false);
    }
  }

  // 2. Check settings.json is valid JSON with hooks
  const settingsPath = path.join(claudeDir, "settings.json");
  const settingsContent = readText(settingsPath);
  if (settingsContent) {
    try {
      const settings = JSON.parse(settingsContent.replace(/^<!--[\s\S]*?-->\s*/, ""));
      if (settings.hooks && settings.hooks.SessionStart && settings.hooks.SessionStart.length > 0) {
        ok("Hooks configured (SessionStart, UserPromptSubmit)");
        checks.push(true);
      } else {
        warn("settings.json exists but no hooks configured");
        checks.push(false);
      }
    } catch {
      fail("settings.json is not valid JSON");
      checks.push(false);
    }
  }

  // 3. Check skills
  const skillsDir = path.join(claudeDir, "skills");
  if (isDir(skillsDir)) {
    const skills = fs.readdirSync(skillsDir).filter(d => isDir(path.join(skillsDir, d)));
    ok(`${skills.length} skills installed: ${skills.join(", ")}`);
    checks.push(true);
  } else {
    warn("No skills directory found");
    checks.push(false);
  }

  // 4. Check CLAUDE.md
  const claudeMd = readText(path.join(claudeDir, "CLAUDE.md"));
  if (claudeMd) {
    if (claudeMd.includes("tt-b") || claudeMd.includes("agent-workflow")) {
      ok("CLAUDE.md contains tt-b configuration");
    } else {
      info("CLAUDE.md exists (user content, no tt-b block)");
    }
    checks.push(true);
  } else {
    warn("No CLAUDE.md found");
    checks.push(false);
  }

  // 5. Check memory files
  const memDir = path.join(claudeDir, "memory");
  if (isDir(memDir)) {
    const memFiles = fs.readdirSync(memDir).filter(f => f.endsWith(".md"));
    ok(`${memFiles.length} memory files: ${memFiles.join(", ")}`);
    checks.push(true);
  } else {
    info("No memory directory (will be created on first use)");
  }

  // 6. Check Node.js version
  const nodeVersion = run("node --version");
  if (nodeVersion) {
    const major = parseInt(nodeVersion.replace("v", "").split(".")[0], 10);
    if (major >= 18) {
      ok(`Node.js ${nodeVersion}`);
      checks.push(true);
    } else {
      fail(`Node.js ${nodeVersion} (requires >= 18)`);
      checks.push(false);
    }
  }

  // Summary
  const passed = checks.filter(Boolean).length;
  const total = checks.length;
  console.log("");
  if (passed === total) {
    console.log(`${c.green}${c.bold}All ${total} checks passed.${c.reset} tt-b is healthy.`);
  } else {
    console.log(`${c.yellow}${passed}/${total} checks passed.${c.reset} Run \`npx tt-b install --global\` to fix.`);
  }

  return passed === total;
}

// ─── Install ───

function installProject() {
  heading("Install tt-b to current project");

  const repoRoot = detectRepoRoot();
  if (!repoRoot) {
    fail("Cannot find tt-b package. Run from the tt-b repo or install via npm.");
    return false;
  }

  const deployScript = path.join(repoRoot, "bin", "import-agent-workflow.js");
  if (!fileExists(deployScript)) {
    fail(`Deploy script not found: ${deployScript}`);
    return false;
  }

  info(`Source: ${repoRoot}`);
  info(`Target: ${process.cwd()}`);

  try {
    const output = execSync(`node "${deployScript}" --force`, {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    console.log(output);
    ok("Project-level install complete");
    return true;
  } catch (e) {
    fail(`Install failed: ${e.message}`);
    return false;
  }
}

function installGlobal() {
  heading("Deploy tt-b to ~/.claude/ (global)");

  const repoRoot = detectRepoRoot();
  if (!repoRoot) {
    fail("Cannot find tt-b package. Run from the tt-b repo or install via npm.");
    return false;
  }

  const deployScript = path.join(repoRoot, "bin", "claude-global-deploy.js");
  if (!fileExists(deployScript)) {
    fail(`Deploy script not found: ${deployScript}`);
    return false;
  }

  info(`Source: ${repoRoot}`);

  try {
    const output = execSync(`node "${deployScript}"`, {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    console.log(output);
    return true;
  } catch (e) {
    fail(`Deploy failed: ${e.message}`);
    return false;
  }
}

// ─── Upgrade ───

function upgrade() {
  heading("Upgrade tt-b");

  // Try npm update first
  const isGlobal = run(`npm list -g ${PKG_NAME} --depth=0`);
  if (isGlobal && isGlobal.includes(PKG_NAME)) {
    info("Updating global package...");
    const result = run(`npm install -g ${PKG_NAME}@latest`);
    if (result !== null) {
      ok("Package updated");
    }
  }

  // Re-deploy
  return installGlobal();
}

// ─── Uninstall ───

function uninstall() {
  heading("Uninstall tt-b from ~/.claude/");

  const repoRoot = detectRepoRoot();
  if (!repoRoot) {
    fail("Cannot find tt-b package.");
    return false;
  }

  const deployScript = path.join(repoRoot, "bin", "claude-global-deploy.js");
  try {
    const output = execSync(`node "${deployScript}" --delete`, {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    console.log(output);
    ok("Uninstall complete. Backups preserved in ~/.claude/backups/tt-b/");
    info("To restore: node bin/claude-global-deploy.js --restore");
    return true;
  } catch (e) {
    fail(`Uninstall failed: ${e.message}`);
    return false;
  }
}

// ─── Doctor ───

function doctor() {
  heading("tt-b Doctor — Diagnose & Fix");

  let fixed = 0;

  // Check and fix settings.json
  const settingsPath = expandHome("~/.claude/settings.json");
  const content = readText(settingsPath);
  if (!content) {
    warn("settings.json missing — will deploy");
    installGlobal();
    fixed++;
  } else {
    try {
      const clean = content.replace(/^<!--[\s\S]*?-->\s*/, "");
      JSON.parse(clean);
      ok("settings.json is valid");
    } catch {
      warn("settings.json is corrupted — will redeploy");
      installGlobal();
      fixed++;
    }
  }

  // Check hooks directory
  const binDir = expandHome("~/.claude/bin");
  if (!isDir(binDir)) {
    warn("~/.claude/bin/ missing — will deploy");
    installGlobal();
    fixed++;
  }

  // Check memory-reminder.js
  const reminder = expandHome("~/.claude/bin/memory-reminder.js");
  if (!fileExists(reminder)) {
    warn("memory-reminder.js missing — will deploy");
    installGlobal();
    fixed++;
  }

  if (fixed === 0) {
    ok("Everything looks good. No fixes needed.");
  } else {
    info(`Applied ${fixed} fix(es).`);
  }

  console.log("");
  healthCheck();
}

// ─── Interactive mode ───

function interactive() {
  console.log(`
${c.bold}${c.cyan}╔══════════════════════════════════════════╗
║         tt-b Agent Workflow Kit          ║
║    v${VERSION} — Model-aware Claude Code     ║
╚══════════════════════════════════════════╝${c.reset}

${c.dim}What would you like to do?${c.reset}

  ${c.bold}1${c.reset}  Install to ~/.claude/ (global)    ${c.dim}← recommended${c.reset}
  ${c.bold}2${c.reset}  Install to current project
  ${c.bold}3${c.reset}  Health check
  ${c.bold}4${c.reset}  Uninstall
  ${c.bold}5${c.reset}  Exit

${c.dim}Tip: You can also run directly:${c.reset}
  npx tt-b install --global
  npx tt-b health
  npx tt-b uninstall
`);

  // For non-interactive (piped) mode, default to global install
  if (!process.stdin.isTTY) {
    info("Non-interactive mode: installing globally...");
    installGlobal();
    console.log("");
    healthCheck();
    return;
  }

  // Simple readline for interactive mode
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question(`${c.bold}Choose [1-5]:${c.reset} `, (answer) => {
    rl.close();
    switch (answer.trim()) {
      case "1":
        installGlobal();
        console.log("");
        healthCheck();
        break;
      case "2":
        installProject();
        break;
      case "3":
        healthCheck();
        break;
      case "4":
        uninstall();
        break;
      case "5":
        console.log("Bye!");
        break;
      default:
        warn("Invalid choice. Run `npx tt-b` again.");
    }
  });
}

// ─── CLI ───

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "install":
      if (args.includes("--global") || args.includes("-g")) {
        installGlobal();
        console.log("");
        healthCheck();
      } else {
        installProject();
      }
      break;

    case "upgrade":
      upgrade();
      break;

    case "uninstall":
    case "remove":
      uninstall();
      break;

    case "health":
    case "check":
    case "status":
      healthCheck();
      break;

    case "doctor":
      doctor();
      break;

    case "version":
    case "--version":
    case "-v":
      console.log(`${PKG_NAME} v${VERSION}`);
      break;

    case "help":
    case "--help":
    case "-h":
      console.log(`
${c.bold}tt-b${c.reset} v${VERSION} — Model-aware agent workflow kit

${c.bold}Usage:${c.reset}
  npx tt-b                    Interactive setup
  npx tt-b install            Install to current project
  npx tt-b install --global   Deploy to ~/.claude/
  npx tt-b upgrade            Update and redeploy
  npx tt-b uninstall          Remove tt-b files
  npx tt-b health             Health check
  npx tt-b doctor             Diagnose and fix
  npx tt-b version            Show version

${c.bold}What gets installed:${c.reset}
  • 8 lifecycle hooks (SessionStart, UserPromptSubmit, PreToolUse, ...)
  • 11 MCP tools (memory_smart_search, memory_save, ...)
  • 10+ skills (/recall, /remember, /graph, /grill-me, ...)
  • Model-aware preflight & memory-reminder
  • GML Repository Law (CLAUDE.md)

${c.bold}Backups:${c.reset}
  Every install backs up existing ~/.claude/ files.
  Restore:  node bin/claude-global-deploy.js --restore
  Backups:  ~/.claude/backups/tt-b/
`);
      break;

    default:
      interactive();
  }
}

main();
