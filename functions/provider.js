/**
 * provider — Create a file system provider abstraction.
 *
 * All functions take relative paths and resolve against projectRoot.
 * This is the I/O layer that functions/ modules depend on.
 *
 * @param {string} projectRoot — absolute path to project root
 * @returns {{ readText, writeText, exists, stat, listDir, resolve }}
 */

const fs = require("fs");
const path = require("path");

function createProvider(projectRoot) {
  function resolve(relPath) {
    return path.resolve(projectRoot, relPath);
  }

  function readText(relPath) {
    try {
      return fs.readFileSync(resolve(relPath), "utf8");
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  }

  function writeText(relPath, content) {
    const full = resolve(relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }

  function exists(relPath) {
    return fs.existsSync(resolve(relPath));
  }

  function stat(relPath) {
    try {
      const s = fs.statSync(resolve(relPath));
      return { ok: true, size: s.size, mtime: s.mtime.toISOString() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  function listDir(dir) {
    try {
      return fs.readdirSync(resolve(dir)).map((name) => path.join(dir, name));
    } catch {
      return [];
    }
  }

  return { readText, writeText, exists, stat, listDir, resolve };
}

module.exports = createProvider;
