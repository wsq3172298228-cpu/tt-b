/**
 * restore-memory — Restore memory files from a snapshot.
 *
 * @param {object} opts
 * @param {object} opts.snapshot — { [key]: content } from snapshot-memory
 * @param {object} opts.memoryMap — { key: relativePath } mapping
 * @param {function} opts.writeText — (relPath, content) => void
 * @returns {{ ok: boolean, restored: string[] }}
 */

function restoreMemory({ snapshot, memoryMap, writeText }) {
  const restored = [];

  for (const [key, relPath] of Object.entries(memoryMap)) {
    if (snapshot[key] !== undefined && snapshot[key] !== null) {
      writeText(relPath, snapshot[key]);
      restored.push(relPath);
    }
  }

  return { ok: true, restored };
}

module.exports = restoreMemory;
