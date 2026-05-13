/**
 * extract-edges — Extract all knowledge graph edges from memory content.
 *
 * @param {object} opts
 * @param {string} opts.content — knowledge graph markdown content
 * @returns {Array<{from: {type: string, name: string}, relation: string, to: {type: string, name: string}}>}
 */

const EDGE_TYPES = [
  "owns", "imports", "calls", "reads", "writes", "validates",
  "serializes", "depends_on", "exposes", "consumed_by", "tested_by",
  "protected_by", "breaks", "mitigates", "decided_by", "supersedes",
];

function extractEdges({ content }) {
  if (!content) return [];

  const edgePattern = /(\w+):(\S+)\s+(owns|imports|calls|reads|writes|validates|serializes|depends_on|exposes|consumed_by|tested_by|protected_by|breaks|mitigates|decided_by|supersedes)\s+(\w+):(\S+)/g;

  const edges = [];
  const seen = new Set();
  let match;

  while ((match = edgePattern.exec(content)) !== null) {
    const key = match[0];
    if (seen.has(key)) continue;
    seen.add(key);

    edges.push({
      from: { type: match[1], name: match[2] },
      relation: match[3],
      to: { type: match[4], name: match[5] },
    });
  }

  return edges;
}

module.exports = extractEdges;
module.exports.EDGE_TYPES = EDGE_TYPES;
