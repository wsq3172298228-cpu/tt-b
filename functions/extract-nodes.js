/**
 * extract-nodes — Extract all knowledge graph nodes from memory content.
 *
 * @param {object} opts
 * @param {string} opts.content — knowledge graph markdown content
 * @returns {Array<{type: string, name: string}>}
 */

const NODE_TYPES = [
  "Domain", "Feature", "Module", "File", "Symbol", "API",
  "DataModel", "DatabaseTable", "ExternalService", "Test",
  "Command", "Invariant", "Decision", "Risk", "TODO",
];

function extractNodes({ content }) {
  if (!content) return [];

  const pattern = new RegExp(
    `(?:${NODE_TYPES.join("|")}):([A-Za-z0-9_-]+)`,
    "g"
  );

  const nodes = [];
  const seen = new Set();
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const full = match[0];
    const type = full.split(":")[0];
    const name = match[1];
    const key = `${type}:${name}`;

    if (!seen.has(key)) {
      seen.add(key);
      nodes.push({ type, name });
    }
  }

  return nodes;
}

module.exports = extractNodes;
module.exports.NODE_TYPES = NODE_TYPES;
