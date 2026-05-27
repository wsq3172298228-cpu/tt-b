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

  // Track what was done for rollback
  const state = {
    imported: false,
    createdPkgJson: false,
    sqliteInstalled: false,
    hookMounted: false,
    hookTarget: null,
  };

  // Step 2: run importer
  const spinnerImport = new Spinner("Importing workflow files...").start();
  try {
    const output = execSync(`node "${deployScript}" "${resolvedTarget}" --force`, {
      encoding: "utf8",
      timeout: 60000,
    });
    spinnerImport.succeed("Workflow files imported");
    state.imported = true;
    console.log(output);
  } catch (e) {
    spinnerImport.fail(`Import failed: ${e.message}`);
    return false;
  }

  spacer();

  // Step 3: ensure package.json exists
  const pkgJsonPath = path.join(resolvedTarget, "package.json");
  const pkgJsonExisted = fileExists(pkgJsonPath);
  if (!pkgJsonExisted) {
    warn("No package.json found in target project.");
    info("Running `npm init -y` to create one...");
    try {
      execSync("npm init -y", { cwd: resolvedTarget, encoding: "utf8", stdio: "pipe" });
      ok("package.json created");
      state.createdPkgJson = true;
    } catch (e) {
      fail(`npm init failed: ${e.message}`);
      warn("Rolling back imported files...");
      rollback(state, resolvedTarget);
      return false;
    }
  }

  // Step 4: install better-sqlite3
  let sqliteOk = false;
  sqliteOk = await installSqlite(resolvedTarget, state);

  if (!sqliteOk) {
    warn("Rolling back all changes...");
    rollback(state, resolvedTarget);
    return false;
  }

  spacer();

  // Step 5: mount git post-commit hook
  const hookResult = await mountGitHook(resolvedTarget);
  if (hookResult) {
    state.hookMounted = true;
    state.hookTarget = hookResult;
  }

  spacer();

  // Step 6: verify
  const success = await finishInstall(resolvedTarget, sqliteOk);

  if (!success) {
    warn("Verification failed. Rolling back all changes...");
    rollback(state, resolvedTarget);
  }

  return success;
}

async function installSqlite(targetDir, state) {
  const spinnerSqlite = new Spinner("Installing better-sqlite3...").start();
  try {
    execSync("npm install better-sqlite3", {
      cwd: targetDir,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 120000,
    });
    spinnerSqlite.succeed("better-sqlite3 installed");
    state.sqliteInstalled = true;
    return true;
  } catch (e) {
    spinnerSqlite.fail("better-sqlite3 install failed");
  }

  // Diagnose and offer retry
  const platform = process.platform;
  spacer();
  info("better-sqlite3 requires native build tools to compile.");
  if (platform === "darwin") {
    info("macOS: install Xcode Command Line Tools first:");
    info("  xcode-select --install");
  } else if (platform === "linux") {
    info("Linux: install build tools first:");
    info("  sudo apt install build-essential python3");
  } else {
    info("Windows: install build tools first:");
    info("  npm install --global windows-build-tools");
  }

  spacer();

  // Offer to retry with sudo
  if (platform !== "win32") {
    const retryWithSudo = await confirm("Retry with sudo npm install?", { default: true });
    if (retryWithSudo) {
      const spinner2 = new Spinner("Installing better-sqlite3 with sudo...").start();
      try {
        execSync("sudo npm install better-sqlite3", {
          cwd: targetDir,
          encoding: "utf8",
          stdio: "pipe",
          timeout: 120000,
        });
        spinner2.succeed("better-sqlite3 installed (sudo)");
        state.sqliteInstalled = true;
        return true;
      } catch (e2) {
        spinner2.fail("sudo install also failed");
      }
    }
  }

  // Offer manual install
  spacer();
  const manualInstall = await confirm("Already installed or want to install manually later? Continue without SQLite?", { default: false });
  if (manualInstall) {
    warn("Continuing without better-sqlite3. SQLite graph database will not be available.");
    warn("To install later: cd " + targetDir + " && npm install better-sqlite3");
    return true;
  }

  return false;
}

function rollback(state, targetDir) {
  heading("Rolling back installation");

  // Step 5 rollback: remove git hook
  if (state.hookMounted && state.hookTarget) {
    try {
      if (fs.existsSync(state.hookTarget)) {
        fs.unlinkSync(state.hookTarget);
        ok("Removed git post-commit hook");
      }
    } catch (e) {
      warn(`Failed to remove hook: ${e.message}`);
    }
  }

  // Step 4 rollback: uninstall better-sqlite3
  if (state.sqliteInstalled) {
    try {
      execSync("npm uninstall better-sqlite3", {
        cwd: targetDir,
        encoding: "utf8",
        stdio: "pipe",
        timeout: 60000,
      });
      ok("Uninstalled better-sqlite3");
    } catch (e) {
      warn(`Failed to uninstall better-sqlite3: ${e.message}`);
    }
  }

  // Step 3 rollback: remove package.json only if we created it
  if (state.createdPkgJson) {
    const pkgPath = path.join(targetDir, "package.json");
    const lockPath = path.join(targetDir, "package-lock.json");
    try {
      if (fs.existsSync(pkgPath)) fs.unlinkSync(pkgPath);
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
      // remove node_modules if we created it
      const nmPath = path.join(targetDir, "node_modules");
      if (fs.existsSync(nmPath)) {
        fs.rmSync(nmPath, { recursive: true, force: true });
      }
      ok("Removed generated package.json and node_modules");
    } catch (e) {
      warn(`Failed to remove package.json: ${e.message}`);
    }
  }

  // Step 2 rollback: remove imported .claude/ and CLAUDE.md
  if (state.imported) {
    const claudeDir = path.join(targetDir, ".claude");
    const claudeMd = path.join(targetDir, "CLAUDE.md");
    try {
      if (fs.existsSync(claudeDir)) {
        fs.rmSync(claudeDir, { recursive: true, force: true });
        ok("Removed .claude/ directory");
      }
      if (fs.existsSync(claudeMd)) {
        fs.unlinkSync(claudeMd);
        ok("Removed CLAUDE.md");
      }
    } catch (e) {
      warn(`Failed to remove imported files: ${e.message}`);
    }
  }

  spacer();
  fail("Installation rolled back. No changes remain.");
  info("To retry, run the install command again.");
}

async function mountGitHook(targetDir) {
  const { findGitDir } = require("../lib/utils");
  const gitDir = findGitDir(targetDir);

  if (!gitDir) {
    warn("No git repository found. Skipping post-commit hook.");
    info("To mount later: cp .claude/bin/post-commit-hook.js .git/hooks/post-commit && chmod +x .git/hooks/post-commit");
    return null;
  }

  const hookSource = path.join(targetDir, ".claude", "bin", "post-commit-hook.js");
  if (!fileExists(hookSource)) {
    warn("post-commit-hook.js not found. Skipping hook mount.");
    return null;
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
      return null;
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
    return hookTarget;
  } catch (e) {
    warn(`Hook mount failed: ${e.message}`);
    info(`To mount manually: cp .claude/bin/post-commit-hook.js ${gitDir}/hooks/post-commit && chmod +x ${gitDir}/hooks/post-commit`);
    return null;
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
