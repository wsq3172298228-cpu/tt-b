/**
 * subgraph-query — Macro aggregation query for knowledge graph.
 *
 * Instead of LLM doing micro-level node-by-node traversal,
 * this does multi-hop BFS in one call and returns LLM-friendly
 * structured text.
 *
 * @param {object} opts
 * @param {string} opts.content — knowledge graph markdown content
 * @param {string} opts.entity — target node name (e.g., "importer")
 * @param {number} [opts.depth=3] — max hops (1-5)
 * @param {string} [opts.direction="both"] — "upstream", "downstream", or "both"
 * @returns {string} LLM-friendly formatted dependency tree
 */

const extractNodes = require("./extract-nodes");
const extractEdges = require("./extract-edges");

const MAX_DEPTH = 5;
const DEFAULT_DEPTH = 3;

function buildAdjacencyMap(edges) {
  const downstream = new Map(); // from -> [{relation, to}]
  const upstream = new Map();   // to -> [{relation, from}]

  for (const edge of edges) {
    const fromKey = `${edge.from.type}:${edge.from.name}`;
    const toKey = `${edge.to.type}:${edge.to.name}`;

    if (!downstream.has(fromKey)) downstream.set(fromKey, []);
    downstream.get(fromKey).push({ relation: edge.relation, target: toKey, targetInfo: edge.to });

    if (!upstream.has(toKey)) upstream.set(toKey, []);
    upstream.get(toKey).push({ relation: edge.relation, source: fromKey, sourceInfo: edge.from });
  }

  return { downstream, upstream };
}

function bfs(startKey, adjacencyMap, maxDepth, direction) {
  const visited = new Set();
  const levels = [];

  const maps = direction === "downstream"
    ? [adjacencyMap.downstream]
    : direction === "upstream"
      ? [adjacencyMap.upstream]
      : [adjacencyMap.downstream, adjacencyMap.upstream];

  let frontier = [{ key: startKey, depth: 0 }];

  while (frontier.length > 0) {
    const next = [];
    const currentLevel = [];

    for (const { key, depth } of frontier) {
      if (visited.has(key) || depth > maxDepth) continue;
      visited.add(key);

      for (const map of maps) {
        const neighbors = map.get(key) || [];
        for (const neighbor of neighbors) {
          const targetKey = neighbor.target || neighbor.source;
          if (!visited.has(targetKey)) {
            currentLevel.push({
              from: key,
              relation: neighbor.relation,
              to: targetKey,
              toInfo: neighbor.targetInfo || neighbor.sourceInfo,
              depth: depth + 1,
            });
            next.push({ key: targetKey, depth: depth + 1 });
          }
        }
      }
    }

    if (currentLevel.length > 0) {
      levels.push(currentLevel);
    }
    frontier = next;
  }

  return levels;
}

function formatAsTree(entityName, upstreamLevels, downstreamLevels, direction) {
  const lines = [];
  lines.push(`Dependency analysis: ${entityName}`);
  lines.push(`Direction: ${direction}`);
  lines.push("");

  // Format downstream
  if (direction !== "upstream" && downstreamLevels.length > 0) {
    lines.push("[Downstream — what it calls/depends on]");
    for (let i = 0; i < downstreamLevels.length; i++) {
      const level = downstreamLevels[i];
      lines.push(`  Level ${i + 1}:`);
      for (const edge of level) {
        const targetName = edge.to.split(":")[1] || edge.to;
        const targetType = edge.to.split(":")[0] || "unknown";
        lines.push(`    - [${edge.relation}] ${targetType}:${targetName}`);
      }
    }
    lines.push("");
  }

  // Format upstream
  if (direction !== "downstream" && upstreamLevels.length > 0) {
    lines.push("[Upstream — what calls/depends on it]");
    for (let i = 0; i < upstreamLevels.length; i++) {
      const level = upstreamLevels[i];
      lines.push(`  Level ${i + 1}:`);
      for (const edge of level) {
        const sourceName = edge.to.split(":")[1] || edge.to;
        const sourceType = edge.to.split(":")[0] || "unknown";
        lines.push(`    - [${edge.relation}] ${sourceType}:${sourceName}`);
      }
    }
    lines.push("");
  }

  if (upstreamLevels.length === 0 && downstreamLevels.length === 0) {
    lines.push("No dependencies found within the specified depth.");
  }

  // Summary
  const totalEdges = upstreamLevels.reduce((s, l) => s + l.length, 0) +
                     downstreamLevels.reduce((s, l) => s + l.length, 0);
  const uniqueNodes = new Set();
  for (const level of [...upstreamLevels, ...downstreamLevels]) {
    for (const edge of level) {
      uniqueNodes.add(edge.to);
    }
  }

  lines.push(`Summary: ${totalEdges} edges, ${uniqueNodes.size} unique nodes within ${direction === "both" ? "±" : ""}${Math.max(upstreamLevels.length, downstreamLevels.length)} hops`);

  return lines.join("\n");
}

function subgraphQuery({ content, entity, depth, direction, projectRoot }) {
  if (!content && !projectRoot) return "No knowledge graph content provided.";
  if (!entity) return "Entity name is required.";

  const safeDepth = Math.min(Math.max(parseInt(depth) || DEFAULT_DEPTH, 1), MAX_DEPTH);
  const safeDirection = direction || "both";

  // Try loading from JSON via graph-store first
  let edges, allNodes;
  if (projectRoot) {
    try {
      const createGraphStore = require("./graph-store");
      const store = createGraphStore({ projectRoot });
      const graph = store.load();
      if (graph.source === "json" && graph.edges.length > 0) {
        // Convert JSON edges to extract-edges format
        edges = graph.edges.map(e => ({
          from: { type: e.from.type, name: e.from.name },
          relation: e.relation,
          to: { type: e.to.type, name: e.to.name },
        }));
        allNodes = Object.values(graph.nodes).map(n => ({ type: n.type, name: n.name }));
      }
    } catch (e) {
      // Fall through to markdown parsing
    }
  }

  // Fallback to markdown parsing
  if (!edges) {
    edges = extractEdges({ content });
    allNodes = extractNodes({ content });
  }

  const adjacency = buildAdjacencyMap(edges);

  // Find the target node (case-insensitive partial match)
  const normalizedEntity = entity.toLowerCase();
  const matchedNode = allNodes.find(n =>
    n.name.toLowerCase() === normalizedEntity ||
    n.name.toLowerCase().includes(normalizedEntity)
  );

  if (!matchedNode) {
    // Try to find in edges directly
    const allKeys = new Set();
    for (const edge of edges) {
      allKeys.add(`${edge.from.type}:${edge.from.name}`);
      allKeys.add(`${edge.to.type}:${edge.to.name}`);
    }
    const matchKey = [...allKeys].find(k => k.toLowerCase().includes(normalizedEntity));
    if (!matchKey) {
      return `Entity "${entity}" not found in knowledge graph. Available entities: ${[...allKeys].slice(0, 20).join(", ")}${allKeys.size > 20 ? "..." : ""}`;
    }
    const startKey = matchKey;
    const upstream = safeDirection !== "downstream" ? bfs(startKey, adjacency, safeDepth, "upstream") : [];
    const downstream = safeDirection !== "upstream" ? bfs(startKey, adjacency, safeDepth, "downstream") : [];
    return formatAsTree(startKey, upstream, downstream, safeDirection);
  }

  const startKey = `${matchedNode.type}:${matchedNode.name}`;
  const upstream = safeDirection !== "downstream" ? bfs(startKey, adjacency, safeDepth, "upstream") : [];
  const downstream = safeDirection !== "upstream" ? bfs(startKey, adjacency, safeDepth, "downstream") : [];

  return formatAsTree(startKey, upstream, downstream, safeDirection);
}

module.exports = subgraphQuery;
