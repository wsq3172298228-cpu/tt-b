#!/usr/bin/env node

/**
 * tt-b-openclaw-install.js — Install tt-b MCP server for OpenClaw
 *
 * Usage:
 *   node bin/tt-b-openclaw-install.js          # install
 *   node bin/tt-b-openclaw-install.js --remove  # uninstall
 *   node bin/tt-b-openclaw-install.js --status  # check status
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

function fileExists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function readText(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}

function writeText(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
}

function expandHome(p) {
  if (p.startsWith("~/")) return path.join(process.env.HOME || "", p.slice(1));
  return p;
}

function detectRepoRoot() {
  const localBin = path.join(__dirname, "tt-b-openclaw-install.js");
  if (fileExists(localBin)) return path.resolve(__dirname, "..");
  const npxRoot = path.resolve(require.resolve("../package.json"), "..");
  if (fileExists(path.join(npxRoot, "bin", "tt-b-openclaw-install.js"))) return npxRoot;
  return null;
}

// ─── OpenClaw config detection ───

function findOpenClawConfig() {
  const home = process.env.HOME || "";
  const candidates = [
    path.join(home, ".openclaw", "openclaw.json"),
    path.join(home, ".openclaw", "config.json"),
    path.join(home, ".config", "openclaw", "config.json"),
  ];
  for (const p of candidates) {
    if (fileExists(p)) return p;
  }
  return null;
}

function getOpenClawMCPTemplate(repoRoot) {
  return {
    mcpServers: {
      "tt-b": {
        command: "node",
        args: [path.join(repoRoot, "bin", "tt-b-mcp-server.js")],
      },
    },
  };
}

// ─── Install ───

function install() {
  heading("Install tt-b for OpenClaw");

  const repoRoot = detectRepoRoot();
  if (!repoRoot) {
    fail("Cannot find tt-b package.");
    return false;
  }

  // 1. Deploy globally
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

  // 2. Find or create OpenClaw config
  let configPath = findOpenClawConfig();

  if (!configPath) {
    // Create default config
    configPath = expandHome("~/.openclaw/openclaw.json");
    info(`Creating OpenClaw config: ${configPath}`);
    const defaultConfig = getOpenClawMCPTemplate(repoRoot);
    writeText(configPath, JSON.stringify(defaultConfig, null, 2) + "\n");
    ok("OpenClaw config created with tt-b MCP server");
  } else {
    // Update existing config
    info(`Updating OpenClaw config: ${configPath}`);
    const content = readText(configPath);
    try {
      const config = JSON.parse(content);

      if (!config.mcpServers) config.mcpServers = {};
      if (config.mcpServers["tt-b"]) {
        // Update path
        config.mcpServers["tt-b"].args = [path.join(repoRoot, "bin", "tt-b-mcp-server.js")];
        ok("Updated tt-b MCP server path");
      } else {
        config.mcpServers["tt-b"] = getOpenClawMCPTemplate(repoRoot).mcpServers["tt-b"];
        ok("Added tt-b MCP server");
      }

      writeText(configPath, JSON.stringify(config, null, 2) + "\n");
    } catch (e) {
      fail(`Config parse error: ${e.message}`);
      info("Manual: add this to your OpenClaw config:");
      console.log(JSON.stringify(getOpenClawMCPTemplate(repoRoot), null, 2));
      return false;
    }
  }

  // 3. Copy integration files if available
  const integrationDir = path.join(repoRoot, "integrations", "openclaw");
  if (fileExists(integrationDir)) {
    const dest = expandHome("~/.openclaw/extensions/tt-b");
    info(`Copying integration files to ${dest}...`);
    try {
      fs.mkdirSync(dest, { recursive: true });
      execSync(`cp -r "${integrationDir}/"* "${dest}/"`, { encoding: "utf8" });
      ok("Integration files copied");
    } catch {
      warn("Could not copy integration files");
    }
  }

  console.log(`\n${c.green}${c.bold}Done!${c.reset} Restart OpenClaw to pick up the MCP server.`);
  info("Verify: curl http://localhost:3111/tt-b/health  (if tt-b has a REST server)");
  info("Or: npx tt-b health");
  return true;
}

// ─── Remove ───

function remove() {
  heading("Remove tt-b from OpenClaw");

  const configPath = findOpenClawConfig();
  if (!configPath) {
    warn("No OpenClaw config found");
    return;
  }

  const content = readText(configPath);
  try {
    const config = JSON.parse(content);
    if (config.mcpServers && config.mcpServers["tt-b"]) {
      delete config.mcpServers["tt-b"];
      writeText(configPath, JSON.stringify(config, null, 2) + "\n");
      ok("Removed tt-b from OpenClaw config");
    } else {
      info("tt-b not in OpenClaw config");
    }
  } catch (e) {
    fail(`Config parse error: ${e.message}`);
  }

  // Remove integration files
  const extDir = expandHome("~/.openclaw/extensions/tt-b");
  if (fileExists(extDir)) {
    fs.rmSync(extDir, { recursive: true, force: true });
    ok("Removed integration files");
  }

  info("Global files preserved. Run `npx tt-b uninstall` to remove from ~/.claude/");
}

// ─── Status ───

function status() {
  heading("tt-b OpenClaw Status");

  const configPath = findOpenClawConfig();
  console.log(`  Config:  ${configPath || c.yellow + "not found" + c.reset}`);

  if (configPath) {
    const content = readText(configPath);
    try {
      const config = JSON.parse(content);
      const hasTtB = config.mcpServers && config.mcpServers["tt-b"];
      console.log(`  MCP:     ${hasTtB ? c.green + "configured" : c.yellow + "not configured"}${c.reset}`);
      if (hasTtB) {
        console.log(`  Command: ${config.mcpServers["tt-b"].command} ${(config.mcpServers["tt-b"].args || []).join(" ")}`);
      }
    } catch {
      console.log(`  Config:  ${c.red}parse error${c.reset}`);
    }
  }

  const extDir = expandHome("~/.openclaw/extensions/tt-b");
  console.log(`  Extension: ${fileExists(extDir) ? c.green + "installed" : c.dim + "not installed"}${c.reset}`);
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
tt-b OpenClaw installer

Usage:
  node bin/tt-b-openclaw-install.js            # install
  node bin/tt-b-openclaw-install.js --remove   # uninstall
  node bin/tt-b-openclaw-install.js --status   # check status
`);
      break;
    default:
      install();
  }
}

main();
