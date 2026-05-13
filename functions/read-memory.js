/**
 * read-memory — Read a memory file by key or relative path.
 *
 * @param {object} opts
 * @param {string} opts.name — memory key (e.g. "knowledgeGraph") or relative path
 * @param {object} opts.memoryMap — { key: relativePath } mapping
 * @param {function} opts.readText — (relPath) => string|null
 * @returns {{ ok: boolean, content?: string, path?: string, error?: string }}
 */

function readMemory({ name, memoryMap, readText }) {
  const relPath = memoryMap[name] || name;
  const content = readText(relPath);

  if (content === null) {
    return { ok: false, error: "file not found", path: relPath };
  }

  return { ok: true, content, path: relPath };
}

module.exports = readMemory;
