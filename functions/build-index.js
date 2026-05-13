/**
 * build-index — Build a full-text search index of memory content.
 *
 * Indexes headings, graph node references, file paths, and significant words.
 *
 * @param {object} opts
 * @param {object} opts.memoryMap — { key: relativePath } mapping
 * @param {function} opts.readText — (relPath) => string|null
 * @param {object} [opts.extraFiles] — additional { key: relPath } to index
 * @returns {{ built: string, files: number, terms: number, index: Map<string, Array<{file: string, line: number}>> }}
 */

function buildIndex({ memoryMap, readText, extraFiles }) {
  const index = new Map();
  let fileCount = 0;

  function addToIndex(type, term, file, line) {
    const key = `${type}:${term.toLowerCase()}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ file, line });
  }

  function indexFile(relPath) {
    const content = readText(relPath);
    if (!content) return;

    fileCount++;
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Headings
      if (line.startsWith("#")) {
        addToIndex("heading", line.replace(/^#+\s*/, "").trim(), relPath, i + 1);
      }

      // Graph node references
      const nodeMatches = line.matchAll(/(Domain|Feature|Module|File|Symbol|API|DataModel|DatabaseTable|ExternalService|Test|Command|Invariant|Decision|Risk|TODO):([A-Za-z0-9_-]+)/g);
      for (const m of nodeMatches) {
        addToIndex("node", `${m[1]}:${m[2]}`, relPath, i + 1);
      }

      // File paths
      const pathMatch = line.match(/`([^`]+\.(js|ts|md|json))`/g);
      if (pathMatch) {
        for (const p of pathMatch) {
          addToIndex("path", p.replace(/`/g, ""), relPath, i + 1);
        }
      }

      // Significant words
      const words = line.match(/\b[A-Za-z]{4,}\b/g);
      if (words) {
        for (const w of new Set(words)) {
          addToIndex("word", w.toLowerCase(), relPath, i + 1);
        }
      }
    }
  }

  // Index memory files
  for (const [, relPath] of Object.entries(memoryMap)) {
    indexFile(relPath);
  }

  // Index extra files (contract files, etc.)
  if (extraFiles) {
    for (const [, relPath] of Object.entries(extraFiles)) {
      indexFile(relPath);
    }
  }

  return {
    built: new Date().toISOString(),
    files: fileCount,
    terms: index.size,
    index,
  };
}

module.exports = buildIndex;
