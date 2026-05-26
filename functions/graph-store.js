/**
 * graph-store — SQLite-backed knowledge graph storage.
 *
 * Uses better-sqlite3 with WAL mode for ACID transactions and
 * concurrent read/write performance. Supports dual-write to markdown.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot — project root directory
 * @param {string} [opts.dbPath] — custom DB path (default: .claude/memory/graph_memory.db)
 * @param {string} [opts.markdownPath] — custom markdown path (default: .claude/memory/knowledge-graph.md)
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_DB = ".claude/memory/graph_memory.db";
const DEFAULT_MD = ".claude/memory/knowledge-graph.md";
const MAX_COMMITS = 100;

function createGraphStore(opts) {
  const root = opts.projectRoot || process.cwd();
  const dbPath = path.join(root, opts.dbPath || DEFAULT_DB);
  const mdPath = path.join(root, opts.markdownPath || DEFAULT_MD);

  let db = null;

  function getDb() {
    if (db) return db;

    const Database = require("better-sqlite3");
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    initSchema();
    return db;
  }

  function initSchema() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        file_path TEXT,
        metadata TEXT,
        stale_since TEXT,
        stale_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        to_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        relation TEXT NOT NULL,
        metadata TEXT,
        UNIQUE(from_id, to_id, relation)
      );

      CREATE TABLE IF NOT EXISTS commits (
        hash TEXT PRIMARY KEY,
        message TEXT,
        timestamp TEXT NOT NULL,
        added INTEGER DEFAULT 0,
        modified INTEGER DEFAULT 0,
        removed INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
      CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
      CREATE INDEX IF NOT EXISTS idx_nodes_file_path ON nodes(file_path);
      CREATE INDEX IF NOT EXISTS idx_nodes_stale ON nodes(stale_since);
      CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
      CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
      CREATE INDEX IF NOT EXISTS idx_edges_relation ON edges(relation);
    `);
  }

  /**
   * Generate node ID from components.
   * Uses file_path to disambiguate same-named entities in different files.
   */
  function nodeId(name, type, filePath) {
    if (filePath) return `${filePath}:${name}:${type}`;
    return `:${name}:${type}`;
  }

  /**
   * Load full graph as in-memory object.
   * Returns { nodes, edges, commits, source }
   */
  function load() {
    const d = getDb();

    // Check if DB has data
    const nodeCount = d.prepare("SELECT COUNT(*) as c FROM nodes").get().c;
    if (nodeCount === 0) {
      // Try importing from markdown
      if (fs.existsSync(mdPath)) {
        const mdContent = fs.readFileSync(mdPath, "utf8");
        const graph = fromMarkdown(mdContent);
        saveToDb(graph);
        return { ...graph, source: "markdown-import" };
      }
      return { nodes: {}, edges: [], commits: [], source: "empty" };
    }

    // Load from SQLite
    const nodes = {};
    for (const row of d.prepare("SELECT * FROM nodes").all()) {
      nodes[row.id] = {
        type: row.type,
        name: row.name,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        staleSince: row.stale_since || null,
        staleReason: row.stale_reason || null,
      };
      if (row.file_path) nodes[row.id].metadata.path = row.file_path;
    }

    const edges = d.prepare("SELECT * FROM edges").all().map((e) => {
      const from = nodes[e.from_id] || parseNodeId(e.from_id);
      const to = nodes[e.to_id] || parseNodeId(e.to_id);
      return {
        from: { type: from.type, name: from.name },
        relation: e.relation,
        to: { type: to.type, name: to.name },
      };
    });

    const commits = d.prepare("SELECT * FROM commits ORDER BY timestamp DESC LIMIT ?").all(MAX_COMMITS);

    return { nodes, edges, commits, source: "sqlite" };
  }

  function parseNodeId(id) {
    const parts = id.split(":");
    if (parts.length === 3) {
      return { type: parts[2], name: parts[1] };
    }
    return { type: "Unknown", name: id };
  }

  /**
   * Save graph to SQLite. Also writes markdown as secondary output.
   */
  function save(graph) {
    saveToDb(graph);

    // Dual-write markdown
    const mdDir = path.dirname(mdPath);
    if (!fs.existsSync(mdDir)) fs.mkdirSync(mdDir, { recursive: true });
    const mdContent = toMarkdown(graph);
    fs.writeFileSync(mdPath, mdContent, "utf8");

    return { dbPath, mdPath };
  }

  function saveToDb(graph) {
    const d = getDb();
    const now = new Date().toISOString();

    const upsertNode = d.prepare(`
      INSERT INTO nodes (id, name, type, file_path, metadata, stale_since, stale_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, type=excluded.type, file_path=excluded.file_path,
        metadata=excluded.metadata, stale_since=excluded.stale_since,
        stale_reason=excluded.stale_reason, updated_at=excluded.updated_at
    `);

    const upsertEdge = d.prepare(`
      INSERT OR IGNORE INTO edges (from_id, to_id, relation, metadata)
      VALUES (?, ?, ?, ?)
    `);

    const upsertCommit = d.prepare(`
      INSERT OR REPLACE INTO commits (hash, message, timestamp, added, modified, removed)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertAll = d.transaction(() => {
      // Clear existing data for full sync
      d.exec("DELETE FROM edges");
      d.exec("DELETE FROM nodes");

      for (const [id, node] of Object.entries(graph.nodes || {})) {
        const meta = { ...node.metadata };
        const filePath = meta.path || null;
        delete meta.path;
        upsertNode.run(
          id, node.name, node.type, filePath,
          JSON.stringify(meta), node.staleSince || null, node.staleReason || null,
          now, now
        );
      }

      for (const edge of graph.edges || []) {
        const fromId = edge.from._id || nodeId(edge.from.name, edge.from.type, edge.from.path);
        const toId = edge.to._id || nodeId(edge.to.name, edge.to.type, edge.to.path);
        upsertEdge.run(fromId, toId, edge.relation, null);
      }

      for (const commit of graph.commits || []) {
        upsertCommit.run(
          commit.hash, commit.message || "", commit.timestamp || now,
          commit.added || 0, commit.modified || 0, commit.removed || 0
        );
      }
    });

    insertAll();
  }

  /**
   * Apply a patch directly to SQLite (preferred over in-memory patching).
   * Returns { changed, added, modified, removed }
   */
  function applyPatch(graph, patch) {
    if (!patch.added.length && !patch.modified.length && !patch.removed.length) {
      return { graph, changed: false };
    }

    const d = getDb();
    const now = new Date().toISOString();
    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;

    const upsertNode = d.prepare(`
      INSERT INTO nodes (id, name, type, file_path, metadata, stale_since, stale_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        metadata=excluded.metadata, updated_at=excluded.updated_at
    `);

    const deleteNode = d.prepare("DELETE FROM nodes WHERE id = ?");
    const insertEdge = d.prepare(`
      INSERT OR IGNORE INTO edges (from_id, to_id, relation, metadata) VALUES (?, ?, ?, ?)
    `);
    const upsertCommit = d.prepare(`
      INSERT OR REPLACE INTO commits (hash, message, timestamp, added, modified, removed)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const apply = d.transaction(() => {
      for (const node of patch.added) {
        const id = nodeId(node.name, node.type, node.path);
        const meta = { category: node.category || null, addedIn: patch.commitHash ? patch.commitHash.slice(0, 8) : null };
        upsertNode.run(id, node.name, node.type, node.path || null, JSON.stringify(meta), null, null, now, now);
        addedCount++;
      }

      for (const node of patch.modified) {
        const id = nodeId(node.name, node.type, node.path);
        const existing = d.prepare("SELECT metadata FROM nodes WHERE id = ?").get(id);
        const meta = existing ? JSON.parse(existing.metadata || "{}") : {};
        meta.modifiedIn = patch.commitHash ? patch.commitHash.slice(0, 8) : null;
        if (!existing) {
          meta.category = node.category || null;
          upsertNode.run(id, node.name, node.type, node.path || null, JSON.stringify(meta), null, null, now, now);
          addedCount++;
        } else {
          upsertNode.run(id, node.name, node.type, node.path || null, JSON.stringify(meta), null, null, now, now);
          modifiedCount++;
        }
      }

      for (const node of patch.removed) {
        const id = nodeId(node.name, node.type, node.path);
        const info = deleteNode.run(id);
        if (info.changes > 0) removedCount++;
      }

      if (patch.commitHash && (addedCount + modifiedCount + removedCount > 0)) {
        upsertCommit.run(
          patch.commitHash, patch.commitMessage || "", now,
          addedCount, modifiedCount, removedCount
        );
        trimCommits(d);
      }
    });

    apply();

    // Reload graph in memory for callers that need it
    const updatedGraph = load();
    Object.assign(graph, updatedGraph);

    return { graph, changed: addedCount + modifiedCount + removedCount > 0, added: addedCount, modified: modifiedCount, removed: removedCount };
  }

  function trimCommits(d) {
    d.prepare(`
      DELETE FROM commits WHERE hash NOT IN (
        SELECT hash FROM commits ORDER BY timestamp DESC LIMIT ?
      )
    `).run(MAX_COMMITS);
  }

  /**
   * GC: mark stale nodes and remove long-stale ones.
   * @param {object} patch — { deletedFiles: [], removed: [] }
   * @param {number} staleThreshold — commits before removal (default 3)
   * @returns {{ marked: string[], removed: string[] }}
   */
  function gc(patch, staleThreshold) {
    const d = getDb();
    const threshold = staleThreshold || 3;
    const now = new Date().toISOString();
    const marked = [];
    const removed = [];

    const markStale = d.prepare(`
      UPDATE nodes SET stale_since = ?, stale_reason = ? WHERE id = ? AND stale_since IS NULL
    `);

    const gcTransaction = d.transaction(() => {
      // Mark nodes from deleted files
      if (patch && patch.deletedFiles) {
        for (const filePath of patch.deletedFiles) {
          const rows = d.prepare("SELECT id, name FROM nodes WHERE file_path = ?").all(filePath);
          for (const row of rows) {
            markStale.run(now, `file deleted: ${filePath}`, row.id);
            marked.push(row.id);
          }
        }
      }

      // Mark explicitly removed nodes
      if (patch && patch.removed) {
        for (const node of patch.removed) {
          const id = nodeId(node.name, node.type, node.path);
          const info = markStale.run(now, "removed in patch", id);
          if (info.changes > 0) marked.push(id);
        }
      }

      // Scan for files that no longer exist on disk
      const allFileNodes = d.prepare("SELECT id, file_path FROM nodes WHERE file_path IS NOT NULL AND stale_since IS NULL").all();
      for (const row of allFileNodes) {
        const fullPath = path.join(root, row.file_path);
        if (!fs.existsSync(fullPath)) {
          markStale.run(now, `file not found: ${row.file_path}`, row.id);
          marked.push(row.id);
        }
      }

      // Remove nodes stale for >= threshold commits
      const commitCount = d.prepare("SELECT COUNT(*) as c FROM commits").get().c;
      const staleNodes = d.prepare("SELECT id, stale_since FROM nodes WHERE stale_since IS NOT NULL").all();
      for (const row of staleNodes) {
        const staleIdx = d.prepare("SELECT COUNT(*) as c FROM commits WHERE timestamp >= ?").get(row.stale_since).c;
        const commitsSinceStale = staleIdx > 0 ? staleIdx : threshold;
        if (commitsSinceStale >= threshold) {
          d.prepare("DELETE FROM nodes WHERE id = ?").run(row.id);
          removed.push(row.id);
        }
      }
    });

    gcTransaction();
    return { marked, removed };
  }

  /**
   * Verify graph consistency against filesystem.
   */
  function verify() {
    const d = getDb();
    const missingFiles = d.prepare(
      "SELECT id, name, file_path FROM nodes WHERE file_path IS NOT NULL"
    ).all().filter((row) => !fs.existsSync(path.join(root, row.file_path)));

    const danglingEdges = d.prepare(`
      SELECT e.relation, f.name as from_name, f.type as from_type, t.name as to_name, t.type as to_type
      FROM edges e
      LEFT JOIN nodes f ON e.from_id = f.id
      LEFT JOIN nodes t ON e.to_id = t.id
      WHERE f.id IS NULL OR t.id IS NULL
    `).all();

    return { missingFiles, danglingEdges };
  }

  /**
   * Parse markdown into graph structure.
   */
  function fromMarkdown(content) {
    const extractNodes = require("./extract-nodes");
    const extractEdges = require("./extract-edges");

    const rawNodes = extractNodes({ content });
    const rawEdges = extractEdges({ content });

    const nodes = {};
    for (const n of rawNodes) {
      const id = nodeId(n.name, n.type, null);
      nodes[id] = { type: n.type, name: n.name, metadata: {} };
    }

    const edges = rawEdges.map((e) => {
      const fromId = nodeId(e.from.name, e.from.type, null);
      const toId = nodeId(e.to.name, e.to.type, null);
      // Ensure referenced nodes exist (extract-nodes regex may miss dotted names)
      if (!nodes[fromId]) nodes[fromId] = { type: e.from.type, name: e.from.name, metadata: {} };
      if (!nodes[toId]) nodes[toId] = { type: e.to.type, name: e.to.name, metadata: {} };
      return {
        from: { type: e.from.type, name: e.from.name, _id: fromId },
        relation: e.relation,
        to: { type: e.to.type, name: e.to.name, _id: toId },
      };
    });

    return { version: 1, lastUpdated: new Date().toISOString(), nodes, edges, commits: [], metadata: { source: "markdown-parse" } };
  }

  /**
   * Convert graph to markdown.
   */
  function toMarkdown(graph) {
    const lines = [];
    lines.push("# Project Knowledge Graph Memory");
    lines.push("");
    lines.push("Auto-generated from graph_memory.db. Do not edit manually.");
    lines.push(`Last updated: ${graph.lastUpdated || new Date().toISOString()}`);
    lines.push("");
    lines.push("---");
    lines.push("");

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

  function stats() {
    const d = getDb();
    return {
      nodeCount: d.prepare("SELECT COUNT(*) as c FROM nodes").get().c,
      edgeCount: d.prepare("SELECT COUNT(*) as c FROM edges").get().c,
      commitCount: d.prepare("SELECT COUNT(*) as c FROM commits").get().c,
      staleCount: d.prepare("SELECT COUNT(*) as c FROM nodes WHERE stale_since IS NOT NULL").get().c,
      source: "sqlite",
    };
  }

  function close() {
    if (db) {
      db.close();
      db = null;
    }
  }

  return { load, save, applyPatch, gc, verify, fromMarkdown, toMarkdown, stats, close };
}

module.exports = createGraphStore;
