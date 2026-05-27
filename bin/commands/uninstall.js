/**
 * uninstall.js — Uninstall command for tt-b
 */

const { execSync } = require("child_process");
const { detectRepoRoot } = require("../lib/repo");
const { ok, fail, info, heading, spacer, Spinner } = require("../lib/ui");

function uninstall() {
  heading("Uninstall tt-b from ~/.claude/");

  const detected = detectRepoRoot();
  if (!detected) {
    fail("Cannot find tt-b package.");
    return false;
  }

  const { root, source } = detected;
  const deployScript = require("path").join(root, "bin", "claude-global-deploy.js");

  info(`Source: ${root} (${source})`);
  spacer();

  const spinner = new Spinner("Removing tt-b files...").start();

  try {
    const output = execSync(`node "${deployScript}" --delete`, {
      encoding: "utf8",
      cwd: process.cwd(),
      timeout: 60000,
    });
    spinner.succeed("Uninstall complete");
    console.log(output);
    spacer();
    ok("Backups preserved in ~/.claude/backups/tt-b/");
    info("To restore: node bin/claude-global-deploy.js --restore");
    return true;
  } catch (e) {
    spinner.fail(`Uninstall failed: ${e.message}`);
    return false;
  }
}

module.exports = { uninstall };
