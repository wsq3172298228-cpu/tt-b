/**
 * graph-store — Unified knowledge graph storage abstraction.
 *
 * Provides dual-write to both JSON (graph_memory.json) and markdown
 * (knowledge-graph.md) during the transition period.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot — project root directory
 * @param {string} [opts.jsonPath] — custom JSON path (default: .claude/memory/graph_memory.json)
 * @param {string} [opts.markdownPath] — custom markdown path (default: .claude/memory/knowledge-graph.md)
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_JSON = ".claude/memory/graph_memory.json";
const DEFAULT_MD = ".claude/memory/knowledge-graph.md";

function createGraphStore(opts) {
  const root = opts.projectRoot || process.cwd();
  const jsonPath = path.join(root, opts.jsonPath || DEFAULT_JSON);
  const mdPath = path.join(root, opts.markdownPath || DEFAULT_MD);

  /**
   * Load graph data. Prefers JSON, falls back to markdown.
   * Returns { nodes, edges, commits, metadata, source }
   */
  function load() {
    // Try JSON first
    if (fs.existsSync(jsonPath)) {
      try {
        const raw = fs.readFileSync(jsonPath, "utf8");
        const data = JSON.parse(raw);
        if (data && data.version) {
          return { ...data, source: "json" };
        }
      } catch (e) {
        // JSON parse error, fall through to markdown
      }
    }

    // Fallback: parse markdown
    if (fs.existsSync(mdPath)) {
      const mdContent = fs.readFileSync(mdPath, "utf8");
      const graph = fromMarkdown(mdContent);
      return { ...graph, source: "markdown" };
    }

    // Nothing found
    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      nodes: {},
      edges: [],
      commits: [],
      metadata: {},
      source: "empty",
    };
  }

  /**
   * Save graph data to both JSON and markdown (dual-write).
   */
  function save(graph) {
    graph.lastUpdated = new Date().toISOString();

    // Ensure directories exist
    const jsonDir = path.dirname(jsonPath);
    const mdDir = path.dirname(mdPath);
    if (!fs.existsSync(jsonDir)) fs.mkdirSync(jsonDir, { recursive: true });
    if (!fs.existsSync(mdDir)) fs.mkdirSync(mdDir, { recursive: true });

    // Write JSON
    const jsonData = {
      version: graph.version || 1,
      lastUpdated: graph.lastUpdated,
      nodes: graph.nodes || {},
      edges: graph.edges || [],
      commits: graph.commits || [],
      metadata: graph.metadata || {},
    };
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2) + "\n", "utf8");

    // Write markdown (regenerate from graph structure)
    const mdContent = toMarkdown(graph);
    fs.writeFileSync(mdPath, mdContent, "utf8");

    return { jsonPath, mdPath };
  }

  /**
   * Apply a patch (from graph-updater) to the graph.
   * Patch shape: { added: [], modified: [], removed: [], commitHash, commitMessage }
   */
  function applyPatch(graph, patch) {
    if (!patch.added.length && !patch.modified.length && !patch.removed.length) {
      return { graph, changed: false };
    }

    let changed = false;

    // Add new nodes
    for (const node of patch.added) {
      const key = `${node.type}:${node.name}`;
      if (!graph.nodes[key]) {
        graph.nodes[key] = {
          type: node.type,
          name: node.name,
          metadata: {
            path: node.path || null,
            category: node.category || null,
            addedIn: patch.commitHash ? patch.commitHash.slice(0, 8) : null,
            lastModified: new Date().toISOString(),
          },
        };
        changed = true;
      }
    }

    // Modify existing nodes
    for (const node of patch.modified) {
      const key = `${node.type}:${node.name}`;
      if (graph.nodes[key]) {
        graph.nodes[key].metadata = graph.nodes[key].metadata || {};
        graph.nodes[key].metadata.modifiedIn = patch.commitHash
          ? patch.commitHash.slice(0, 8)
          : null;
        graph.nodes[key].metadata.lastModified = new Date().toISOString();
        changed = true;
      } else {
        // Node doesn't exist yet, add it
        graph.nodes[key] = {
          type: node.type,
          name: node.name,
          metadata: {
            path: node.path || null,
            category: node.category || null,
            modifiedIn: patch.commitHash ? patch.commitHash.slice(0, 8) : null,
            lastModified: new Date().toISOString(),
          },
        };
        changed = true;
      }
    }

    // Remove nodes
    for (const node of patch.removed) {
      const key = `${node.type}:${node.name}`;
      if (graph.nodes[key]) {
        delete graph.nodes[key];
        // Also remove edges involving this node
        graph.edges = graph.edges.filter(
          (e) => `${e.from.type}:${e.from.name}` !== key && `${e.to.type}:${e.to.name}` !== key
        );
        changed = true;
      }
    }

    // Record commit
    if (patch.commitHash && changed) {
      graph.commits = graph.commits || [];
      graph.commits.push({
        hash: patch.commitHash,
        message: patch.commitMessage || "",
        timestamp: new Date().toISOString(),
        added: patch.added.length,
        modified: patch.modified.length,
        removed: patch.removed.length,
      });
      // Keep last 100 commits
      if (graph.commits.length > 100) {
        graph.commits = graph.commits.slice(-100);
      }
    }

    return { graph, changed };
  }

  /**
   * Parse markdown content into graph structure.
   * Extracts nodes and edges from the markdown format.
   */
  function fromMarkdown(content) {
    const extractNodes = require("./extract-nodes");
    const extractEdges = require("./extract-edges");

    const rawNodes = extractNodes({ content });
    const rawEdges = extractEdges({ content });

    const nodes = {};
    for (const n of rawNodes) {
      const key = `${n.type}:${n.name}`;
      nodes[key] = {
        type: n.type,
        name: n.name,
        metadata: {},
      };
    }

    const edges = rawEdges.map((e) => ({
      from: { type: e.from.type, name: e.from.name },
      relation: e.relation,
      to: { type: e.to.type, name: e.to.name },
    }));

    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      nodes,
      edges,
      commits: [],
      metadata: { source: "markdown-parse" },
    };
  }

  /**
   * Convert graph structure back to markdown format.
   * Generates a compact knowledge-graph.md.
   */
  function toMarkdown(graph) {
    const lines = [];
    lines.push("# Project Knowledge Graph Memory");
    lines.push("");
    lines.push("Auto-generated from graph_memory.json. Do not edit manually.");
    lines.push(`Last updated: ${graph.lastUpdated || new Date().toISOString()}`);
    lines.push("");
    lines.push("---");
    lines.push("");

    // Group nodes by type
    const byType = {};
    for (const [key, node] of Object.entries(graph.nodes || {})) {
      const t = node.type || "Unknown";
      if (!byType[t]) byType[t] = [];
      byType[t].push(node);
    }

    lines.push("# Nodes");
    lines.push("");
    for (const [type, nodes] of Object.entries(byType).sort()) {
      lines.push(`## ${type}`);
      lines.push("");
      for (const node of nodes.sort((a, b) => a.name.localeCompare(b.name))) {
        const meta = node.metadata || {};
        const parts = [];
        if (meta.path) parts.push(`path: \`${meta.path}\``);
        if (meta.category) parts.push(`category: ${meta.category}`);
        if (meta.addedIn) parts.push(`added: ${meta.addedIn}`);
        if (meta.modifiedIn) parts.push(`modified: ${meta.modifiedIn}`);
        const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
        lines.push(`- ${type}:${node.name}${suffix}`);
      }
      lines.push("");
    }

    // Edges
    if (graph.edges && graph.edges.length > 0) {
      lines.push("# Edges");
      lines.push("");
      lines.push("```txt");
      for (const edge of graph.edges) {
        lines.push(`${edge.from.type}:${edge.from.name} ${edge.relation} ${edge.to.type}:${edge.to.name}`);
      }
      lines.push("```");
      lines.push("");
    }

    // Recent commits
    if (graph.commits && graph.commits.length > 0) {
      lines.push("# Recent Commits");
      lines.push("");
      for (const commit of graph.commits.slice(-20).reverse()) {
        lines.push(`- ${commit.hash.slice(0, 8)} — ${commit.message || "(no message)"}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Get graph statistics.
   */
  function stats(graph) {
    return {
      nodeCount: Object.keys(graph.nodes || {}).length,
      edgeCount: (graph.edges || []).length,
      commitCount: (graph.commits || []).length,
      lastUpdated: graph.lastUpdated,
      source: graph.source,
    };
  }

  return { load, save, applyPatch, fromMarkdown, toMarkdown, stats };
}

module.exports = createGraphStore;
