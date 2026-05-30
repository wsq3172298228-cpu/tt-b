/**
 * graph-expand — Expand knowledge graph nodes around a target entity.
 *
 * Returns related nodes and edges for planning purposes.
 *
 * @param {object} opts
 * @param {string} opts.content — knowledge graph markdown content
 * @param {string} opts.entity — target entity name
 * @param {number} [opts.depth=1] — expansion depth
 * @returns {{ nodes: string[], edges: string[], context: string }
 */

function graphExpand({ content, entity, depth = 1 }) {
  if (!content) return { nodes: [], edges: [], context: "No knowledge graph content provided" };

  const lines = content.split("\n");
  const nodes = new Set();
  const edges = [];

  // Find the target entity section
  let inTarget = false;
  let targetSection = [];

  for (const line of lines) {
    if (line.includes(entity)) {
      inTarget = true;
      targetSection.push(line);
      continue;
    }

    if (inTarget) {
      if (line.startsWith("### ") || line.startsWith("## ")) break;
      targetSection.push(line);
    }
  }

  // Extract nodes mentioned in edges
  const edgePattern = /(\w+[:\w]*)\s+(owns|contains|imports|calls|reads|writes|validates|serializes|depends_on|exposes|consumed_by|tested_by|protected_by|breaks|mitigates|decided_by|supersedes)\s+(\w+[:\w]*)/g;

  for (const line of lines) {
    let match;
    while ((match = edgePattern.exec(line)) !== null) {
      const [, source, rel, target] = match;
      nodes.add(source);
      nodes.add(target);
      edges.push(`${source} ${rel} ${target}`);
    }
  }

  // If entity found, highlight related nodes
  const related = edges
    .filter((e) => e.includes(entity))
    .map((e) => {
      const parts = e.split(" ");
      return parts[0] === entity ? parts[2] : parts[0];
    });

  return {
    nodes: Array.from(nodes),
    edges,
    relatedNodes: [...new Set(related)],
    context: targetSection.length > 0 ? targetSection.join("\n") : `Entity "${entity}" not found in knowledge graph`,
    instructions: [
      "For broad or ambiguous tasks, first expand the graph around the target area, then plan.",
      "Entity types: Domain, Feature, Module, File, Symbol, API, DataModel, DatabaseTable, ExternalService, Test, Command, Risk, Decision, Invariant, TODO",
      "Edge types: owns, contains, imports, calls, reads, writes, validates, serializes, depends_on, exposes, consumed_by, tested_by, protected_by, breaks, mitigates, decided_by, supersedes",
    ],
  };
}

module.exports = graphExpand;
