/**
 * repo.js — Repository root detection for tt-b CLI
 *
 * Handles multiple installation scenarios:
 * 1. Running from local git repo (development)
 * 2. Installed globally via npm
 * 3. Running via npx (cached package)
 * 4. Running from a symlinked location
 */

const fs = require("fs");
const path = require("path");
const { fileExists, isDir, run } = require("./utils");

const PKG_NAME = "tt-b";

/**
 * Detect the tt-b repository root directory.
 *
 * Priority:
 * 1. Local repo (running from cloned tt-b)
 * 2. Global npm install
 * 3. npx cache
 * 4. Relative to this file
 */
function detectRepoRoot() {
  // Strategy 1: Running from within the tt-b repo (development)
  // Check for key files that only exist in the full repo
  const localIndicators = [
    path.join(__dirname, "..", "..", "templates", "claude", "settings.json"),
    path.join(__dirname, "..", "..", ".claude", "bin", "memory-reminder.js"),
    path.join(__dirname, "..", "..", "plugin", "skills"),
  ];

  const repoRoot = path.resolve(__dirname, "..", "..");
  if (localIndicators.every((f) => fileExists(f))) {
    return { root: repoRoot, source: "local-repo" };
  }

  // Strategy 2: Global npm install
  const globalRoot = run("npm root -g");
  if (globalRoot) {
    const ttbPath = path.join(globalRoot, PKG_NAME);
    if (isDir(ttbPath) && fileExists(path.join(ttbPath, "package.json"))) {
      return { root: ttbPath, source: "global-npm" };
    }
  }

  // Strategy 3: npx cache — resolve package.json relative to this file
  // When running via npx, the package is in a temp directory like:
  // ~/.npm/_npx/<hash>/node_modules/tt-b/
  // This file is at bin/lib/repo.js, so ../../ is the package root
  const candidateRoot = path.resolve(__dirname, "..", "..");
  const pkgJson = path.join(candidateRoot, "package.json");
  if (fileExists(pkgJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8"));
      if (pkg.name === PKG_NAME) {
        // Verify it has the deploy script
        if (fileExists(path.join(candidateRoot, "bin", "claude-global-deploy.js"))) {
          return { root: candidateRoot, source: "npx-cache" };
        }
      }
    } catch {
      // Invalid package.json, skip
    }
  }

  // Strategy 4: Check parent directories (monorepo or nested install)
  let current = __dirname;
  for (let i = 0; i < 5; i++) {
    current = path.dirname(current);
    const parentPkg = path.join(current, "package.json");
    if (fileExists(parentPkg)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(parentPkg, "utf8"));
        if (pkg.name === PKG_NAME) {
          return { root: current, source: "parent-dir" };
        }
      } catch {
        // skip
      }
    }
  }

  return null;
}

/**
 * Get the deploy script path from the detected repo root.
 */
function getDeployScript() {
  const detected = detectRepoRoot();
  if (!detected) return null;

  const scriptPath = path.join(detected.root, "bin", "claude-global-deploy.js");
  if (!fileExists(scriptPath)) return null;

  return { ...detected, scriptPath };
}

/**
 * Get the import script path from the detected repo root.
 */
function getImportScript() {
  const detected = detectRepoRoot();
  if (!detected) return null;

  const scriptPath = path.join(detected.root, "bin", "import-agent-workflow.js");
  if (!fileExists(scriptPath)) return null;

  return { ...detected, scriptPath };
}

/**
 * Get package version from the detected repo root.
 */
function getPackageVersion() {
  const detected = detectRepoRoot();
  if (!detected) return null;

  const pkgPath = path.join(detected.root, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.version;
  } catch {
    return null;
  }
}

module.exports = {
  detectRepoRoot,
  getDeployScript,
  getImportScript,
  getPackageVersion,
};
