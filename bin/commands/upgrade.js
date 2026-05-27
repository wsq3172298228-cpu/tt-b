/**
 * upgrade.js — Upgrade command for tt-b
 */

const { run, checkNpmAvailable } = require("../lib/utils");
const { detectRepoRoot, getPackageVersion } = require("../lib/repo");
const { ok, fail, info, warn, heading, spacer, Spinner } = require("../lib/ui");
const { installGlobal } = require("./install");

const PKG_NAME = "tt-b";

function upgrade() {
  heading("Upgrade tt-b");

  const currentVersion = getPackageVersion();
  if (currentVersion) {
    info(`Current version: ${currentVersion}`);
  }

  // Check if npm is available
  if (!checkNpmAvailable()) {
    fail("npm is not available. Please install npm first.");
    return false;
  }

  // Check if installed globally
  const globalCheck = run(`npm list -g ${PKG_NAME} --depth=0`);
  const isGlobal = globalCheck && globalCheck.includes(PKG_NAME);

  if (isGlobal) {
    info("Found global installation, updating...");
    const spinner = new Spinner(`Updating ${PKG_NAME}@latest...`).start();

    const result = run(`npm install -g ${PKG_NAME}@latest`);
    if (result !== null) {
      const newVersion = getPackageVersion();
      spinner.succeed(`Updated to ${newVersion || "latest"}`);
    } else {
      spinner.fail("Update failed");
      return false;
    }
  } else {
    // Check if running via npx
    const detected = detectRepoRoot();
    if (detected && detected.source === "npx-cache") {
      info("Running via npx (cached package)");
      info("To get the latest version, run: npx tt-b@latest");
      warn("npx cache may contain an older version");
    } else if (detected && detected.source === "local-repo") {
      info("Running from local repository");
      info("Pull the latest changes and run: npm install");
    } else {
      info("No global installation found");
      info("Install globally first: npm install -g tt-b");
    }
  }

  // Re-deploy to pick up any changes
  spacer();
  info("Re-deploying to ~/.claude/...");
  return installGlobal();
}

module.exports = { upgrade };
