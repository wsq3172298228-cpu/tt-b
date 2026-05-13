/**
 * diff-memory — Compare current memory content against an old snapshot.
 *
 * @param {object} opts
 * @param {string} opts.name — memory key or relative path
 * @param {string} opts.oldContent — previous content to diff against
 * @param {object} opts.memoryMap — { key: relativePath } mapping
 * @param {function} opts.readText — (relPath) => string|null
 * @returns {{ ok: boolean, changes?: Array, oldLines?: number, newLines?: number, error?: string }}
 */

function diffMemory({ name, oldContent, memoryMap, readText }) {
  const relPath = memoryMap[name] || name;
  const newContent = readText(relPath);

  if (newContent === null) {
    return { ok: false, error: "file not found: " + relPath };
  }

  const oldLines = (oldContent || "").split("\n");
  const newLines = newContent.split("\n");
  const changes = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    if (oldLines[i] !== newLines[i]) {
      changes.push({
        line: i + 1,
        old: oldLines[i] || null,
        new: newLines[i] || null,
      });
    }
  }

  return { ok: true, changes, oldLines: oldLines.length, newLines: newLines.length };
}

module.exports = diffMemory;
