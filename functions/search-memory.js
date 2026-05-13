/**
 * search-memory — Search memory files for a regex pattern.
 *
 * @param {object} opts
 * @param {string} opts.pattern — regex pattern string
 * @param {object} opts.memoryMap — { key: relativePath } mapping
 * @param {function} opts.readText — (relPath) => string|null
 * @returns {{ ok: boolean, results?: Array<{file: string, line: number, text: string}>, error?: string }}
 */

function searchMemory({ pattern, memoryMap, readText }) {
  let regex;
  try {
    regex = new RegExp(pattern, "gi");
  } catch (err) {
    return { ok: false, error: "invalid regex: " + err.message };
  }

  const results = [];

  for (const [, relPath] of Object.entries(memoryMap)) {
    const content = readText(relPath);
    if (!content) continue;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      regex.lastIndex = 0;
      if (regex.test(lines[i])) {
        results.push({ file: relPath, line: i + 1, text: lines[i].trim() });
      }
    }
  }

  return { ok: true, results };
}

module.exports = searchMemory;
