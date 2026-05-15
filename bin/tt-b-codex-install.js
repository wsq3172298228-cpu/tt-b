#!/usr/bin/env node

/**
 * tt-b-codex-install.js — Install tt-b plugin for Codex CLI
 *
 * Usage:
 *   node bin/tt-b-codex-install.js          # install
 *   node bin/tt-b-codex-install.js --remove  # uninstall
 *   node bin/tt-b-codex-install.js --status  # check status
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};

function ok(m) { console.log(`${c.green}  ✓${c.reset} ${m}`); }
function fail(m) { console.log(`${c.red}  ✗${c.reset} ${m}`); }
function warn(m) { console.log(`${c.yellow}  !${c.reset} ${m}`); }
function info(m) { console.log(`${c.dim}  ·${c.reset} ${m}`); }
function heading(m) { console.log(`\n${c.bold}${c.cyan}${m}${c.reset}`); }

function run(cmd) {
  try { return execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim(); } catch { return null; }
}

function fileExists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function readText(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}

function detectRepoRoot() {
  const localBin = path.join(__dirname, "tt-b-codex-install.js");
  if (fileExists(localBin)) return path.resolve(__dirname, "..");
  const npxRoot = path.resolve(require.resolve("../package.json"), "..");
  if (fileExists(path.join(npxRoot, "bin", "tt-b-codex-install.js"))) return npxRoot;
  return null;
}

// ─── Codex detection ───

function findCodexConfig() {
  const home = process.env.HOME || "";
  const candidates = [
    path.join(home, ".codex", "config.toml"),
    path.join(home, ".codex", "config.json"),
  ];
  for (const p of candidates) {
    if (fileExists(p)) return p;
  }
  return null;
}

function isCodexInstalled() {
  return run("which codex") !== null || run("codex --version") !== null;
}

// ─── Install ───

function install() {
  heading("Install tt-b for Codex CLI");

  const repoRoot = detectRepoRoot();
  if (!repoRoot) {
    fail("Cannot find tt-b package.");
    return false;
  }

  // Check Codex is available
  if (!isCodexInstalled()) {
    warn("Codex CLI not found in PATH. Install it first:");
    info("  npm install -g @openai/codex");
    info("Continuing anyway — plugin files will be in place when Codex is installed.");
  } else {
    ok("Codex CLI detected");
  }

  // 1. Deploy globally first (ensures hooks + skills are in ~/.claude/)
  const deployScript = path.join(repoRoot, "bin", "claude-global-deploy.js");
  if (fileExists(deployScript)) {
    info("Running global deploy...");
    try {
      execSync(`node "${deployScript}"`, { encoding: "utf8", stdio: "inherit" });
    } catch (e) {
      fail("Global deploy failed");
      return false;
    }
  }

  // 2. Register marketplace
  const marketplaceDir = path.join(repoRoot, ".codex-plugin");
  if (fileExists(marketplaceDir)) {
    const marketplaceCmd = `codex plugin marketplace add "${marketplaceDir}"`;
    info(`Registering marketplace: ${marketplaceCmd}`);
    const result = run(marketplaceCmd);
    if (result !== null) {
      ok("Marketplace registered");
    } else {
      warn("Marketplace registration failed (codex plugin may not be available yet)");
      info("Manual: codex plugin marketplace add " + marketplaceDir);
    }
  }

  // 3. Install plugin
  const pluginDir = path.join(repoRoot, "plugin", ".codex-plugin");
  if (fileExists(pluginDir)) {
    const installCmd = `codex plugin install tt-b`;
    info(`Installing plugin: ${installCmd}`);
    const result = run(installCmd);
    if (result !== null) {
      ok("Plugin installed");
    } else {
      warn("Plugin install failed (codex plugin may not be available yet)");
      info("Manual: codex plugin install tt-b");
    }
  }

  // 4. Create MCP config for Codex
  const codexConfig = findCodexConfig();
  if (codexConfig) {
    const content = readText(codexConfig);
    if (content && !content.includes("tt-b")) {
      info("Adding tt-b MCP server to Codex config...");
      // For TOML config
      if (codexConfig.endsWith(".toml")) {
        const mcpBlock = `
# tt-b MCP server
[mcp_servers.tt-b]
command = "node"
args = ["${repoRoot}/bin/tt-b-mcp-server.js"]
`;
        fs.appendFileSync(codexConfig, mcpBlock);
        ok("MCP server added to Codex config");
      }
    } else {
      ok("tt-b already in Codex config");
    }
  } else {
    info("No Codex config found — MCP server will be auto-discovered via plugin");
  }

  console.log(`\n${c.green}${c.bold}Done!${c.reset} Restart Codex CLI to pick up the plugin.`);
  info("Verify: npx tt-b health");
  return true;
}

// ─── Remove ───

function remove() {
  heading("Remove tt-b from Codex CLI");

  const result = run("codex plugin uninstall tt-b");
  if (result !== null) {
    ok("Plugin uninstalled");
  } else {
    warn("codex plugin uninstall failed — may not be installed");
  }

  info("Global files preserved. Run `npx tt-b uninstall` to remove from ~/.claude/");
}

// ─── Status ───

function status() {
  heading("tt-b Codex Status");

  const codexInstalled = isCodexInstalled();
  console.log(`  Codex CLI:     ${codexInstalled ? c.green + "found" : c.yellow + "not found"}${c.reset}`);

  const configPath = findCodexConfig();
  console.log(`  Config:        ${configPath || "not found"}`);

  if (configPath) {
    const content = readText(configPath);
    const hasTtB = content && content.includes("tt-b");
    console.log(`  tt-b in config: ${hasTtB ? c.green + "yes" : c.yellow + "no"}${c.reset}`);
  }

  // Check if plugin is installed
  const pluginList = run("codex plugin list 2>/dev/null");
  const hasPlugin = pluginList && pluginList.includes("tt-b");
  console.log(`  Plugin:        ${hasPlugin ? c.green + "installed" : c.yellow + "not installed"}${c.reset}`);

  // Check marketplace
  const marketplaceList = run("codex plugin marketplace list 2>/dev/null");
  const hasMarketplace = marketplaceList && marketplaceList.includes("tt-b");
  console.log(`  Marketplace:   ${hasMarketplace ? c.green + "registered" : c.yellow + "not registered"}${c.reset}`);
}

// ─── CLI ───

function main() {
  const args = process.argv.slice(2);

  switch (args[0]) {
    case "--remove":
    case "remove":
    case "uninstall":
      remove();
      break;
    case "--status":
    case "status":
      status();
      break;
    case "--help":
    case "-h":
      console.log(`
tt-b Codex CLI installer

Usage:
  node bin/tt-b-codex-install.js            # install
  node bin/tt-b-codex-install.js --remove   # uninstall
  node bin/tt-b-codex-install.js --status   # check status
`);
      break;
    default:
      install();
  }
}

main();
