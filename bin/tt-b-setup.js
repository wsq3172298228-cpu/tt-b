#!/usr/bin/env node

/**
 * tt-b-setup.js — One-click installer for tt-b agent workflow kit
 *
 * Usage:
 *   npx tt-b                          # interactive: shows current dir, choose local/global/cancel
 *   npx tt-b install                  # install to current project
 *   npx tt-b install /path/to/proj    # install to specific project (with SQLite graph)
 *   npx tt-b install --global         # deploy to ~/.claude/
 *   npx tt-b upgrade                  # update to latest
 *   npx tt-b uninstall                # remove tt-b files
 *   npx tt-b health                   # health check
 *   npx tt-b doctor                   # diagnose + fix
 *   npx tt-b version                  # show version
 */

const { c, heading, spacer, box, prompt, info, warn, fail, ok } = require("./lib/ui");
const { checkNodeVersion } = require("./lib/utils");
const { getPackageVersion } = require("./lib/repo");
const { healthCheck } = require("./commands/health");
const { installProject, installGlobal, installToProject, restoreBackup } = require("./commands/install");
const { upgrade } = require("./commands/upgrade");
const { uninstall } = require("./commands/uninstall");
const { doctor } = require("./commands/doctor");

const PKG_NAME = "tt-b";
const VERSION = getPackageVersion() || require("../package.json").version;

// ─── Interactive Mode ───

function getCurrentDir() {
  return process.cwd();
}

function getDirBasename(dir) {
  const parts = dir.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || dir;
}

async function interactive() {
  const currentDir = getCurrentDir();
  const dirName = getDirBasename(currentDir);

  box(
    [
      `${c.bold}tt-b Agent Workflow Kit${c.reset}`,
      `v${VERSION} — Model-aware Claude Code`,
      "",
      `Current directory: ${c.cyan}${currentDir}${c.reset}`,
    ],
    { title: PKG_NAME }
  );

  spacer();

  const choice = await prompt("Where to install?", {
    choices: [
      { label: `Install to current project (${c.cyan}${dirName}${c.reset})`, value: "project", recommended: true },
      { label: "Install to ~/.claude/ (global)", value: "global" },
      { label: "Cancel", value: "exit" },
    ],
  });

  spacer();

  switch (choice) {
    case "project":
      await installToProject(currentDir);
      break;
    case "global":
      installGlobal();
      spacer();
      healthCheck();
      break;
    case "exit":
      info("Cancelled.");
      break;
    default:
      warn("Invalid choice. Run `npx tt-b` again.");
  }
}

// ─── Non-Interactive Mode ───

function nonInteractive() {
  const currentDir = getCurrentDir();
  info(`Non-interactive mode: installing to ${currentDir}...`);
  installToProject(currentDir);
}

// ─── CLI ───

async function main() {
  // Check Node.js version first
  const nodeCheck = checkNodeVersion(18);
  if (!nodeCheck.ok) {
    fail(`Node.js ${nodeCheck.version} detected. tt-b requires Node.js >= ${nodeCheck.required}.`);
    fail("Please upgrade Node.js: https://nodejs.org/");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "install":
      if (args.includes("--global") || args.includes("-g")) {
        installGlobal();
        spacer();
        healthCheck();
      } else {
        // check if a path argument was provided
        const pathArg = args.slice(1).find((a) => !a.startsWith("-"));
        if (pathArg) {
          await installToProject(pathArg);
        } else {
          installProject();
        }
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
      healthCheck({ verbose: args.includes("--verbose") || args.includes("-v") });
      break;

    case "doctor":
      doctor();
      break;

    case "restore":
      const restorePath = args.slice(1).find((a) => !a.startsWith("-"));
      restoreBackup(restorePath || process.cwd());
      break;

    case "version":
    case "--version":
    case "-v":
      console.log(`${PKG_NAME} v${VERSION}`);
      break;

    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;

    default:
      // Interactive or non-interactive based on TTY
      if (process.stdin.isTTY) {
        await interactive();
      } else {
        nonInteractive();
      }
  }
}

function showHelp() {
  console.log(`
${c.bold}${c.cyan}tt-b${c.reset} v${VERSION} — Model-aware agent workflow kit

${c.bold}Usage:${c.reset}
  npx tt-b                    Interactive setup (shows current dir, choose local/global/cancel)
  npx tt-b install            Install to current project
  npx tt-b install /path/to/proj  Install to specific project (with SQLite graph)
  npx tt-b install --global   Deploy to ~/.claude/
  npx tt-b upgrade            Update and redeploy
  npx tt-b uninstall          Remove tt-b files
  npx tt-b health             Health check
  npx tt-b doctor             Diagnose and auto-fix issues
  npx tt-b restore            Restore config from backup
  npx tt-b version            Show version

${c.bold}Options:${c.reset}
  --verbose, -v       Show detailed output (includes build tools status)
  --help, -h          Show this help

${c.bold}What gets installed:${c.reset}
  • 8 lifecycle hooks (SessionStart, UserPromptSubmit, PreToolUse, ...)
  • 12 MCP tools (memory_smart_search, memory_save, ...)
  • 10+ skills (/recall, /remember, /graph, /grill-me, ...)
  • Model-aware preflight & memory-reminder
  • GML Repository Law (CLAUDE.md)
  • better-sqlite3 dependency (auto-installed if missing)

${c.bold}Auto-fix:${c.reset}
  Run \`npx tt-b doctor\` to automatically:
  • Install missing better-sqlite3 dependency
  • Redeploy missing configuration files
  • Fix corrupted settings.json

${c.bold}Permissions:${c.reset}
  • Local install: no sudo required
  • Global install: may need sudo if npm prefix is not writable
  • If permission denied: sudo npx tt-b doctor

${c.bold}Build tools (for better-sqlite3):${c.reset}
  • macOS: xcode-select --install
  • Linux: apt install build-essential python3
  • Windows: npm install --global windows-build-tools

${c.bold}Backups:${c.reset}
  Every install backs up existing configs before applying new ones.
  Restore:  npx tt-b restore
  Backups:  ~/.claude/backups/tt-b/
`);
}

// ─── Entry Point ───

main().catch((err) => {
  fail(`Unexpected error: ${err.message}`);
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
