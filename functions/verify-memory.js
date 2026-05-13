/**
 * verify-memory — Check memory files for staleness, placeholders, and missing files.
 *
 * @param {object} opts
 * @param {object} opts.memoryMap — { key: relativePath } mapping
 * @param {function} opts.readText — (relPath) => string|null
 * @param {number} [opts.staleDays=7] — age in days to flag as stale
 * @returns {{ ok: boolean, issues: Array<{file: string, issue: string, ...}> }}
 */

function verifyMemory({ memoryMap, readText, staleDays = 7 }) {
  const issues = [];

  for (const [, relPath] of Object.entries(memoryMap)) {
    const content = readText(relPath);

    if (content === null) {
      issues.push({ file: relPath, issue: "file-missing" });
      continue;
    }

    if (content.includes("not initialized") || content.includes("none recorded")) {
      issues.push({ file: relPath, issue: "contains-placeholders" });
    }

    const dateMatch = content.match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      const lastUpdate = new Date(dateMatch[1]);
      const daysSince = Math.round((Date.now() - lastUpdate.getTime()) / 86400000);
      if (daysSince > staleDays) {
        issues.push({ file: relPath, issue: "stale", lastUpdated: dateMatch[1], daysSince });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

module.exports = verifyMemory;
