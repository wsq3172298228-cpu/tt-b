/**
 * utils.js — File system and path utilities for tt-b CLI
 *
 * Shared between tt-b-setup.js, claude-global-deploy.js, and other bin scripts.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const crypto = require("crypto");

// ─── Path Helpers ───

function expandHome(p) {
  if (p.startsWith("~/") || p === "~") {
    return path.join(process.env.HOME || process.env.USERPROFILE || "", p.slice(1));
  }
  return p;
}

function homeDir() {
  return process.env.HOME || process.env.USERPROFILE || "";
}

function claudeDir() {
  return path.join(homeDir(), ".claude");
}

// ─── File System Helpers ───

function fileExists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

function readJson(filePath) {
  const text = readText(filePath);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath, obj) {
  writeText(filePath, JSON.stringify(obj, null, 2) + "\n");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function listDirRecursive(dir, prefix = "") {
  const results = [];
  if (!isDir(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...listDirRecursive(path.join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

function removeDir(dirPath) {
  if (isDir(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function removeFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

// ─── Command Execution ───

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: "pipe",
      timeout: opts.timeout || 30000,
      ...opts,
    }).trim();
  } catch {
    return null;
  }
}

function runOrThrow(cmd, opts = {}) {
  const result = execSync(cmd, {
    encoding: "utf8",
    stdio: opts.stdio || "pipe",
    timeout: opts.timeout || 30000,
    ...opts,
  });
  return result.trim();
}

// ─── Hashing ───

function shortHash(content) {
  return crypto.createHash("md5").update(content).digest("hex").slice(0, 8);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// ─── Validation ───

function checkNodeVersion(minMajor = 18) {
  const version = process.version;
  const major = parseInt(version.replace("v", "").split(".")[0], 10);
  return { version, major, ok: major >= minMajor, required: minMajor };
}

function checkNpmAvailable() {
  return run("npm --version") !== null;
}

function findGitDir(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    const gitDir = path.join(dir, ".git");
    if (fileExists(gitDir)) {
      const stat = fs.statSync(gitDir);
      return stat.isDirectory() ? gitDir : null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// ─── Module Exports ───

module.exports = {
  // Path
  expandHome,
  homeDir,
  claudeDir,

  // File system
  fileExists,
  isDir,
  readText,
  readJson,
  writeText,
  writeJson,
  ensureDir,
  copyFile,
  copyDirRecursive,
  listDirRecursive,
  removeDir,
  removeFile,

  // Command
  run,
  runOrThrow,

  // Hashing
  shortHash,
  timestamp,

  // Validation
  checkNodeVersion,
  checkNpmAvailable,

  // Git
  findGitDir,
};
