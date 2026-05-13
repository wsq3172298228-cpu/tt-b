/**
 * write-memory — Write content to a memory file.
 *
 * @param {object} opts
 * @param {string} opts.name — memory key or relative path
 * @param {string} opts.content — content to write
 * @param {object} opts.memoryMap — { key: relativePath } mapping
 * @param {function} opts.writeText — (relPath, content) => void
 * @returns {{ ok: boolean, path?: string, error?: string }}
 */

function writeMemory({ name, content, memoryMap, writeText }) {
  const relPath = memoryMap[name] || name;

  try {
    writeText(relPath, content);
    return { ok: true, path: relPath };
  } catch (err) {
    return { ok: false, error: err.message, path: relPath };
  }
}

module.exports = writeMemory;
