/**
 * graph-store — SQLite-backed knowledge graph storage.
 *
 * Optimizations:
 * 1. Integer primary keys + path dictionary (files table)
 * 2. Compressed metadata storage (zlib BLOB)
 * 3. Incremental vacuum for space reclamation
 *
 * @param {object} opts
 * @param {string} opts.projectRoot — project root directory
 * @param {string} [opts.dbPath] — custom DB path (default: .claude/memory/graph_memory.db)
 * @param {string} [opts.markdownPath] — custom markdown path (default: .claude/memory/knowledge-graph.md)
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DEFAULT_DB = ".claude/memory/graph_memory.db";
const DEFAULT_MD = ".claude/memory/knowledge-graph.md";
const MAX_COMMITS = 100;

function createGraphStore(opts) {
  const root = opts.projectRoot || process.cwd();
  const dbPath = path.join(root, opts.dbPath || DEFAULT_DB);
  const mdPath = path.join(root, opts.markdownPath || DEFAULT_MD);

  let db = null;
  let fileIdCache = new Map(); // path -> id
  let nodeIdCache = new Map(); // composite key -> integer id

  function getDb() {
    if (db) return db;

    const Database = require("better-sqlite3");
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("auto_vacuum = INCREMENTAL");

    initSchema();
    return db;
  }

  function initSchema() {
    // Check if old schema exists (has file_path column in nodes)
    const hasOldSchema = db.prepare(`
      SELECT COUNT(*) as c FROM pragma_table_info('nodes') WHERE name = 'file_path'
    `).get().c > 0;

    if (hasOldSchema) {
      migrateFromOldSchema();
      return;
    }

    // Check if tables exist at all
    const tablesExist = db.prepare(`
      SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'nodes'
    `).get().c > 0;

    if (!tablesExist) {
      // Fresh install - create new schema
      createNewSchema();
    }
    // else: already using new schema
  }

  function createNewSchema() {
    db.exec(`
      -- Path dictionary: deduplicate file paths
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE
      );

      -- Nodes with integer primary key
      CREATE TABLE IF NOT EXISTS nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
        metadata BLOB,
        stale_since TEXT,
        stale_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        -- Legacy string ID for migration compatibility
        legacy_id TEXT UNIQUE
      );

      -- Edges with integer foreign keys
      CREATE TABLE IF NOT EXISTS edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        to_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        relation TEXT NOT NULL,
        metadata BLOB,
        UNIQUE(from_id, to_id, relation)
      );

      -- Commit history
      CREATE TABLE IF NOT EXISTS commits (
        hash TEXT PRIMARY KEY,
        message TEXT,
        timestamp TEXT NOT NULL,
        added INTEGER DEFAULT 0,
        modified INTEGER DEFAULT 0,
        removed INTEGER DEFAULT 0
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
      CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
      CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
      CREATE INDEX IF NOT EXISTS idx_nodes_file_id ON nodes(file_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_stale ON nodes(stale_since);
      CREATE INDEX IF NOT EXISTS idx_nodes_legacy_id ON nodes(legacy_id);
      CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
      CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
      CREATE INDEX IF NOT EXISTS idx_edges_relation ON edges(relation);
    `);
  }

  function migrateFromOldSchema() {
    // Old schema detected - migrate to new schema
    // Strategy: drop and recreate, then reimport from markdown
    db.exec(`
      DROP TABLE IF EXISTS edges;
      DROP TABLE IF EXISTS nodes;
      DROP TABLE IF EXISTS files;
      DROP TABLE IF EXISTS commits;
    `);

    createNewSchema();

    // Try reimport from markdown if available
    if (fs.existsSync(mdPath)) {
      const mdContent = fs.readFileSync(mdPath, "utf8");
      const graph = fromMarkdown(mdContent);
      saveToDb(graph);
    }
  }

  // ─── Compression helpers ────────────────────────────────────────────

  function compressMeta(obj) {
    if (!obj) return null;
    const json = JSON.stringify(obj);
    return zlib.deflateRawSync(Buffer.from(json, "utf8"));
  }

  function decompressMeta(blob) {
    if (!blob) return {};
    try {
      const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
      const json = zlib.inflateRawSync(buf, { maxOutputLength: 1024 * 1024 }).toString("utf8");
      return JSON.parse(json);
    } catch {
      // Fallback: try plain JSON (migration from old format)
      try { return JSON.parse(blob.toString()); } catch { return {}; }
    }
  }

  // ─── Path dictionary helpers ────────────────────────────────────────

  function getOrCreateFileId(filePath) {
    if (!filePath) return null;
    if (fileIdCache.has(filePath)) return fileIdCache.get(filePath);

    const existing = db.prepare("SELECT id FROM files WHERE path = ?").get(filePath);
    if (existing) {
      fileIdCache.set(filePath, existing.id);
      return existing.id;
    }

    const info = db.prepare("INSERT INTO files (path) VALUES (?)").run(filePath);
    fileIdCache.set(filePath, info.lastInsertRowid);
    return info.lastInsertRowid;
  }

  function getFilePath(fileId) {
    if (!fileId) return null;
    const row = db.prepare("SELECT path FROM files WHERE id = ?").get(fileId);
    return row ? row.path : null;
  }

  // ─── Node ID helpers ────────────────────────────────────────────────

  function getOrCreateNodeId(name, type, filePath) {
    const key = `${filePath || ""}:${name}:${type}`;
    if (nodeIdCache.has(key)) return nodeIdCache.get(key);

    const fileId = getOrCreateFileId(filePath);
    const legacyId = `${filePath || ""}:${name}:${type}`;

    // Try find by legacy ID first
    const existing = db.prepare("SELECT id FROM nodes WHERE legacy_id = ?").get(legacyId);
    if (existing) {
      nodeIdCache.set(key, existing.id);
      return existing.id;
    }

    // Create new node
    const now = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO nodes (name, type, file_id, legacy_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, type, fileId, legacyId, now, now);

    nodeIdCache.set(key, info.lastInsertRowid);
    return info.lastInsertRowid;
  }

  // ─── Core API ───────────────────────────────────────────────────────

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

    // Load from SQLite with JOIN for file paths
    const nodes = {};
    const rows = d.prepare(`
      SELECT n.*, f.path as file_path
      FROM nodes n
      LEFT JOIN files f ON n.file_id = f.id
    `).all();

    for (const row of rows) {
      const legacyId = row.legacy_id || `:${row.name}:${row.type}`;
      nodes[legacyId] = {
        type: row.type,
        name: row.name,
        metadata: decompressMeta(row.metadata),
        staleSince: row.stale_since || null,
        staleReason: row.stale_reason || null,
      };
      if (row.file_path) nodes[legacyId].metadata.path = row.file_path;
    }

    const edges = d.prepare(`
      SELECT e.relation,
             fn.name as from_name, fn.type as from_type, ff.path as from_path,
             tn.name as to_name, tn.type as to_type, tf.path as to_path
      FROM edges e
      JOIN nodes fn ON e.from_id = fn.id
      JOIN nodes tn ON e.to_id = tn.id
      LEFT JOIN files ff ON fn.file_id = ff.id
      LEFT JOIN files tf ON tn.file_id = tf.id
    `).all().map((e) => ({
      from: { type: e.from_type, name: e.from_name, path: e.from_path || undefined },
      relation: e.relation,
      to: { type: e.to_type, name: e.to_name, path: e.to_path || undefined },
    }));

    const commits = d.prepare("SELECT * FROM commits ORDER BY timestamp DESC LIMIT ?").all(MAX_COMMITS);

    return { nodes, edges, commits, source: "sqlite" };
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

    const insertNode = d.prepare(`
      INSERT INTO nodes (name, type, file_id, metadata, stale_since, stale_reason, legacy_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEdge = d.prepare(`
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
      d.exec("DELETE FROM files");
      fileIdCache.clear();
      nodeIdCache.clear();

      for (const [legacyId, node] of Object.entries(graph.nodes || {})) {
        const meta = { ...node.metadata };
        const filePath = meta.path || null;
        delete meta.path;

        const fileId = getOrCreateFileId(filePath);
        insertNode.run(
          node.name, node.type, fileId,
          compressMeta(meta),
          node.staleSince || null, node.staleReason || null,
          legacyId, now, now
        );
      }

      // Build legacy ID -> integer ID map
      const idMap = new Map();
      for (const row of d.prepare("SELECT id, legacy_id FROM nodes").all()) {
        if (row.legacy_id) idMap.set(row.legacy_id, row.id);
      }

      for (const edge of graph.edges || []) {
        const fromLegacy = edge.from._id || `${edge.from.path || ""}:${edge.from.name}:${edge.from.type}`;
        const toLegacy = edge.to._id || `${edge.to.path || ""}:${edge.to.name}:${edge.to.type}`;
        const fromId = idMap.get(fromLegacy);
        const toId = idMap.get(toLegacy);
        if (fromId && toId) {
          insertEdge.run(fromId, toId, edge.relation, null);
        }
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
   * Apply a patch directly to SQLite.
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
      INSERT INTO nodes (name, type, file_id, metadata, legacy_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(legacy_id) DO UPDATE SET
        metadata=excluded.metadata, updated_at=excluded.updated_at
    `);

    const deleteNode = d.prepare("DELETE FROM nodes WHERE legacy_id = ?");
    const insertEdge = d.prepare(`
      INSERT OR IGNORE INTO edges (from_id, to_id, relation, metadata) VALUES (?, ?, ?, ?)
    `);
    const upsertCommit = d.prepare(`
      INSERT OR REPLACE INTO commits (hash, message, timestamp, added, modified, removed)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const apply = d.transaction(() => {
      for (const node of patch.added) {
        const legacyId = `${node.path || ""}:${node.name}:${node.type}`;
        const fileId = getOrCreateFileId(node.path);
        const meta = { category: node.category || null, addedIn: patch.commitHash ? patch.commitHash.slice(0, 8) : null };
        upsertNode.run(node.name, node.type, fileId, compressMeta(meta), legacyId, now, now);
        addedCount++;
      }

      for (const node of patch.modified) {
        const legacyId = `${node.path || ""}:${node.name}:${node.type}`;
        const existing = db.prepare("SELECT metadata FROM nodes WHERE legacy_id = ?").get(legacyId);
        const meta = existing ? decompressMeta(existing.metadata) : {};
        meta.modifiedIn = patch.commitHash ? patch.commitHash.slice(0, 8) : null;
        const fileId = getOrCreateFileId(node.path);
        if (!existing) {
          meta.category = node.category || null;
          upsertNode.run(node.name, node.type, fileId, compressMeta(meta), legacyId, now, now);
          addedCount++;
        } else {
          upsertNode.run(node.name, node.type, fileId, compressMeta(meta), legacyId, now, now);
          modifiedCount++;
        }
      }

      for (const node of patch.removed) {
        const legacyId = `${node.path || ""}:${node.name}:${node.type}`;
        const info = deleteNode.run(legacyId);
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
   */
  function gc(patch, staleThreshold) {
    const d = getDb();
    const threshold = staleThreshold || 3;
    const now = new Date().toISOString();
    const marked = [];
    const removed = [];

    const markStale = d.prepare(`
      UPDATE nodes SET stale_since = ?, stale_reason = ? WHERE legacy_id = ? AND stale_since IS NULL
    `);

    const gcTransaction = d.transaction(() => {
      // Mark nodes from deleted files
      if (patch && patch.deletedFiles) {
        for (const filePath of patch.deletedFiles) {
          const rows = d.prepare(`
            SELECT n.id, n.name, n.legacy_id
            FROM nodes n
            JOIN files f ON n.file_id = f.id
            WHERE f.path = ?
          `).all(filePath);
          for (const row of rows) {
            if (row.legacy_id) {
              markStale.run(now, `file deleted: ${filePath}`, row.legacy_id);
              marked.push(row.legacy_id);
            }
          }
        }
      }

      // Mark explicitly removed nodes
      if (patch && patch.removed) {
        for (const node of patch.removed) {
          const legacyId = `${node.path || ""}:${node.name}:${node.type}`;
          const info = markStale.run(now, "removed in patch", legacyId);
          if (info.changes > 0) marked.push(legacyId);
        }
      }

      // Scan for files that no longer exist on disk
      const allFiles = d.prepare("SELECT id, path FROM files").all();
      for (const file of allFiles) {
        const fullPath = path.join(root, file.path);
        if (!fs.existsSync(fullPath)) {
          const rows = d.prepare("SELECT legacy_id FROM nodes WHERE file_id = ? AND stale_since IS NULL").all(file.id);
          for (const row of rows) {
            if (row.legacy_id) {
              markStale.run(now, `file not found: ${file.path}`, row.legacy_id);
              marked.push(row.legacy_id);
            }
          }
        }
      }

      // Remove nodes stale for >= threshold commits
      const staleNodes = d.prepare("SELECT legacy_id, stale_since FROM nodes WHERE stale_since IS NOT NULL").all();
      for (const row of staleNodes) {
        const staleIdx = d.prepare("SELECT COUNT(*) as c FROM commits WHERE timestamp >= ?").get(row.stale_since).c;
        const commitsSinceStale = staleIdx > 0 ? staleIdx : threshold;
        if (commitsSinceStale >= threshold) {
          d.prepare("DELETE FROM nodes WHERE legacy_id = ?").run(row.legacy_id);
          removed.push(row.legacy_id);
        }
      }
    });

    gcTransaction();

    // Incremental vacuum to reclaim space
    d.prepare("PRAGMA incremental_vacuum(100)").run();

    return { marked, removed };
  }

  /**
   * Verify graph consistency against filesystem.
   */
  function verify() {
    const d = getDb();

    const missingFiles = d.prepare(`
      SELECT n.id, n.name, f.path as file_path
      FROM nodes n
      JOIN files f ON n.file_id = f.id
    `).all().filter((row) => !fs.existsSync(path.join(root, row.file_path)));

    const danglingEdges = d.prepare(`
      SELECT e.relation, fn.name as from_name, fn.type as from_type, tn.name as to_name, tn.type as to_type
      FROM edges e
      LEFT JOIN nodes fn ON e.from_id = fn.id
      LEFT JOIN nodes tn ON e.to_id = tn.id
      WHERE fn.id IS NULL OR tn.id IS NULL
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
      const legacyId = `:${n.name}:${n.type}`;
      nodes[legacyId] = { type: n.type, name: n.name, metadata: {} };
    }

    const edges = rawEdges.map((e) => {
      const fromId = `:${e.from.name}:${e.from.type}`;
      const toId = `:${e.to.name}:${e.to.type}`;
      // Ensure referenced nodes exist
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
    const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    const mdSize = fs.existsSync(mdPath) ? fs.statSync(mdPath).size : 0;
    return {
      nodeCount: d.prepare("SELECT COUNT(*) as c FROM nodes").get().c,
      edgeCount: d.prepare("SELECT COUNT(*) as c FROM edges").get().c,
      fileCount: d.prepare("SELECT COUNT(*) as c FROM files").get().c,
      commitCount: d.prepare("SELECT COUNT(*) as c FROM commits").get().c,
      staleCount: d.prepare("SELECT COUNT(*) as c FROM nodes WHERE stale_since IS NOT NULL").get().c,
      dbSizeBytes: dbSize,
      mdSizeBytes: mdSize,
      source: "sqlite",
    };
  }

  function close() {
    if (db) {
      db.close();
      db = null;
      fileIdCache.clear();
      nodeIdCache.clear();
    }
  }

  return { load, save, applyPatch, gc, verify, fromMarkdown, toMarkdown, stats, close };
}

module.exports = createGraphStore;
