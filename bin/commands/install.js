/**
 * install.js — Install commands for tt-b
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { detectRepoRoot } = require("../lib/repo");
const { fileExists } = require("../lib/utils");
const { ok, fail, info, warn, heading, spacer, Spinner, confirm } = require("../lib/ui");

async function installProject() {
  const targetDir = process.cwd();
  await installToProject(targetDir);
}

async function installToProject(targetDir) {
  const resolvedTarget = path.resolve(targetDir);

  if (!fs.existsSync(resolvedTarget)) {
    fail(`Directory not found: ${resolvedTarget}`);
    return false;
  }

  if (!fs.statSync(resolvedTarget).isDirectory()) {
    fail(`Not a directory: ${resolvedTarget}`);
    return false;
  }

  heading(`Install tt-b to ${resolvedTarget}`);

  // Step 1: detect tt-b repo root
  const detected = detectRepoRoot();
  if (!detected) {
    fail("Cannot find tt-b package.");
    fail("Run from the tt-b repo or install via: npm install -g tt-b");
    return false;
  }

  const { root, source } = detected;
  const deployScript = path.join(root, "bin", "import-agent-workflow.js");

  if (!fileExists(deployScript)) {
    fail(`Deploy script not found: ${deployScript}`);
    return false;
  }

  info(`Source: ${root} (${source})`);
  spacer();

  // Step 2: run importer
  const spinnerImport = new Spinner("Importing workflow files...").start();
  try {
    const output = execSync(`node "${deployScript}" "${resolvedTarget}" --force`, {
      encoding: "utf8",
      timeout: 60000,
    });
    spinnerImport.succeed("Workflow files imported");
    console.log(output);
  } catch (e) {
    spinnerImport.fail(`Import failed: ${e.message}`);
    return false;
  }

  spacer();

  // Step 3: ensure package.json exists
  const pkgJsonPath = path.join(resolvedTarget, "package.json");
  if (!fileExists(pkgJsonPath)) {
    warn("No package.json found in target project.");
    info("Running `npm init -y` to create one...");
    try {
      execSync("npm init -y", { cwd: resolvedTarget, encoding: "utf8", stdio: "pipe" });
      ok("package.json created");
    } catch (e) {
      fail(`npm init failed: ${e.message}`);
      warn("Skipping better-sqlite3 install. You can run `npm init -y && npm install better-sqlite3` manually.");
      return await finishInstall(resolvedTarget);
    }
  }

  // Step 4: install better-sqlite3
  const spinnerSqlite = new Spinner("Installing better-sqlite3...").start();
  let sqliteOk = false;
  try {
    execSync("npm install better-sqlite3", {
      cwd: resolvedTarget,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 120000,
    });
    spinnerSqlite.succeed("better-sqlite3 installed");
    sqliteOk = true;
  } catch (e) {
    spinnerSqlite.fail("better-sqlite3 install failed");
    warn("SQLite graph database will not be available (markdown-only mode).");
    warn("To fix later: install build tools, then run `npm install better-sqlite3`");

    // diagnose
    const platform = process.platform;
    if (platform === "darwin") {
      info("macOS: run `xcode-select --install` to install build tools");
    } else if (platform === "linux") {
      info("Linux: run `apt install build-essential python3`");
    }
  }

  spacer();

  // Step 5: mount git post-commit hook
  await mountGitHook(resolvedTarget);

  spacer();

  // Step 6: verify
  return await finishInstall(resolvedTarget, sqliteOk);
}

async function mountGitHook(targetDir) {
  const { findGitDir } = require("../lib/utils");
  const gitDir = findGitDir(targetDir);

  if (!gitDir) {
    warn("No git repository found. Skipping post-commit hook.");
    info("To mount later: cp .claude/bin/post-commit-hook.js .git/hooks/post-commit && chmod +x .git/hooks/post-commit");
    return;
  }

  const hookSource = path.join(targetDir, ".claude", "bin", "post-commit-hook.js");
  if (!fileExists(hookSource)) {
    warn("post-commit-hook.js not found. Skipping hook mount.");
    return;
  }

  const hookTarget = path.join(gitDir, "hooks", "post-commit");
  const isMonorepo = gitDir !== path.join(targetDir, ".git");

  if (isMonorepo) {
    info(`Git repository detected at: ${gitDir}`);
    const answer = await confirm("Mount post-commit hook? This will affect all projects under this repo.", {
      default: true,
    });
    if (!answer) {
      info("Skipped hook mount.");
      info(`To mount later: cp .claude/bin/post-commit-hook.js ${gitDir}/hooks/post-commit`);
      return;
    }
  }

  const hooksDir = path.join(gitDir, "hooks");
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  try {
    fs.copyFileSync(hookSource, hookTarget);
    fs.chmodSync(hookTarget, 0o755);
    ok("Git post-commit hook mounted");
  } catch (e) {
    warn(`Hook mount failed: ${e.message}`);
    info(`To mount manually: cp .claude/bin/post-commit-hook.js ${gitDir}/hooks/post-commit && chmod +x ${gitDir}/hooks/post-commit`);
  }
}

async function finishInstall(targetDir, sqliteOk = false) {
  heading("Verification");

  const checks = [];

  // check CLAUDE.md
  const claudeMd = path.join(targetDir, "CLAUDE.md");
  checks.push({ name: "CLAUDE.md", ok: fileExists(claudeMd) });

  // check memory files
  const kg = path.join(targetDir, ".claude", "memory", "knowledge-graph.md");
  checks.push({ name: "knowledge-graph.md", ok: fileExists(kg) });

  const ss = path.join(targetDir, ".claude", "memory", "session-state.md");
  checks.push({ name: "session-state.md", ok: fileExists(ss) });

  // check bin scripts
  const preflight = path.join(targetDir, ".claude", "bin", "model-preflight.js");
  checks.push({ name: "model-preflight.js", ok: fileExists(preflight) });

  const reminder = path.join(targetDir, ".claude", "bin", "memory-reminder.js");
  checks.push({ name: "memory-reminder.js", ok: fileExists(reminder) });

  // check functions
  const graphStore = path.join(targetDir, ".claude", "functions", "graph-store.js");
  checks.push({ name: "graph-store.js", ok: fileExists(graphStore) });

  // check settings.json
  const settings = path.join(targetDir, ".claude", "settings.json");
  checks.push({ name: "settings.json", ok: fileExists(settings) });

  // check SQLite
  checks.push({ name: "better-sqlite3", ok: sqliteOk });

  for (const check of checks) {
    if (check.ok) {
      ok(check.name);
    } else {
      warn(check.name + " — missing");
    }
  }

  spacer();
  ok("Installation complete!");
  spacer();
  info("Next steps:");
  info(`  cd ${targetDir}`);
  info("  claude");
  spacer();
  info("Skills available: /preflight, /remember, /recall, /graph, /verify, /memories");

  return true;
}

function installGlobal() {
  heading("Deploy tt-b to ~/.claude/ (global)");

  const detected = detectRepoRoot();
  if (!detected) {
    fail("Cannot find tt-b package.");
    fail("Run from the tt-b repo or install via: npm install -g tt-b");
    return false;
  }

  const { root, source } = detected;
  const deployScript = require("path").join(root, "bin", "claude-global-deploy.js");

  if (!require("../lib/utils").fileExists(deployScript)) {
    fail(`Deploy script not found: ${deployScript}`);
    return false;
  }

  info(`Source: ${root} (${source})`);
  spacer();

  const spinner = new Spinner("Deploying to ~/.claude/...").start();

  try {
    const output = execSync(`node "${deployScript}"`, {
      encoding: "utf8",
      cwd: process.cwd(),
      timeout: 60000,
    });
    spinner.succeed("Global deploy complete");
    console.log(output);
    return true;
  } catch (e) {
    spinner.fail(`Deploy failed: ${e.message}`);
    return false;
  }
}

module.exports = { installProject, installGlobal, installToProject };
