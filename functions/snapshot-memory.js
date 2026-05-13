/**
 * snapshot-memory — Create a point-in-time snapshot of all memory files.
 *
 * @param {object} opts
 * @param {object} opts.memoryMap — { key: relativePath } mapping
 * @param {function} opts.readText — (relPath) => string|null
 * @returns {{ timestamp: string, [key: string]: string|null }}
 */

function snapshotMemory({ memoryMap, readText }) {
  const snap = { timestamp: new Date().toISOString() };

  for (const [key, relPath] of Object.entries(memoryMap)) {
    snap[key] = readText(relPath);
  }

  return snap;
}

module.exports = snapshotMemory;
