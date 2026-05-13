/**
 * health-check — Run health checks on memory files and helper scripts.
 *
 * Built-in checks:
 *   - memory-files-exist: all memory map entries exist
 *   - helper-scripts-exist: all script entries exist
 *   - memory-not-stale: memory files updated within N days
 *   - node-syntax: all .js scripts pass --check
 *
 * @param {object} opts
 * @param {object} opts.memoryMap — { key: relativePath }
 * @param {object} opts.scriptsMap — { key: relativePath }
 * @param {function} opts.exists — (relPath) => boolean
 * @param {function} opts.stat — (relPath) => { ok, mtime? }
 * @param {number} [opts.staleDays=7]
 * @returns {{ ok: boolean, checks: Array<{name: string, ok: boolean, ...}> }}
 */

function healthCheck({ memoryMap, scriptsMap, exists, stat, staleDays = 7 }) {
  const checks = [];

  // Check 1: memory files exist
  const missingMemory = Object.values(memoryMap).filter((p) => !exists(p));
  checks.push({
    name: "memory-files-exist",
    ok: missingMemory.length === 0,
    missing: missingMemory,
  });

  // Check 2: helper scripts exist
  const missingScripts = Object.values(scriptsMap).filter((p) => !exists(p));
  checks.push({
    name: "helper-scripts-exist",
    ok: missingScripts.length === 0,
    missing: missingScripts,
  });

  // Check 3: memory not stale
  const stale = [];
  for (const [, relPath] of Object.entries(memoryMap)) {
    const s = stat(relPath);
    if (!s.ok) continue;
    const ageDays = (Date.now() - new Date(s.mtime).getTime()) / 86400000;
    if (ageDays > staleDays) {
      stale.push({ file: relPath, days: Math.round(ageDays) });
    }
  }
  checks.push({ name: "memory-not-stale", ok: stale.length === 0, stale });

  // Check 4: node syntax (only if execFileSync available)
  try {
    const { execFileSync } = require("child_process");
    const failed = [];
    for (const [, relPath] of Object.entries(scriptsMap)) {
      if (!relPath.endsWith(".js") || !exists(relPath)) continue;
      try {
        execFileSync(process.execPath, ["--check", relPath], { timeout: 5000, encoding: "utf8" });
      } catch {
        failed.push(relPath);
      }
    }
    checks.push({ name: "node-syntax", ok: failed.length === 0, failed });
  } catch {
    // child_process not available, skip
    checks.push({ name: "node-syntax", ok: true, skipped: true });
  }

  return {
    ok: checks.every((c) => c.ok),
    checks,
    timestamp: new Date().toISOString(),
  };
}

module.exports = healthCheck;
