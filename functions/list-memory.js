/**
 * list-memory — List all memory files with metadata.
 *
 * @param {object} opts
 * @param {object} opts.memoryMap — { key: relativePath } mapping
 * @param {function} opts.readText — (relPath) => string|null
 * @param {function} opts.stat — (relPath) => { ok, size?, mtime?, error? }
 * @param {function} [opts.listDir] — (dir) => string[] for extra file discovery
 * @returns {Array<{key: string, path: string, ok: boolean, size?: number, mtime?: string}>}
 */

function listMemory({ memoryMap, readText, stat, listDir }) {
  const result = [];

  for (const [key, relPath] of Object.entries(memoryMap)) {
    const s = stat(relPath);
    result.push({ key, path: relPath, ...s });
  }

  if (listDir) {
    const extra = listDir(".claude/memory");
    for (const f of extra) {
      if (!Object.values(memoryMap).includes(f)) {
        const s = stat(f);
        const key = f.replace(/^.*\//, "").replace(/\.md$/, "");
        result.push({ key, path: f, ...s });
      }
    }
  }

  return result;
}

module.exports = listMemory;
