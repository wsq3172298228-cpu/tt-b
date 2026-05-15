#!/usr/bin/env node

/**
 * tt-b Lifecycle Hook
 *
 * Full application bootstrap orchestrator. Runs 8 sequential phases:
 *
 *   1. Load config              → functions/config
 *   2. Initialize provider      → functions/provider
 *   3. Register memory functions → functions/*
 *   4. Register REST endpoints  → packages/integrations/rest
 *   5. Register MCP endpoints   → packages/integrations/mcp
 *   6. Start viewer             → packages/integrations/viewer
 *   7. Initialize health check  → functions/health-check
 *   8. Initialize search index  → functions/build-index + functions/search-index
 *
 * Usage:
 *   node bin/tt-b-lifecycle.js [--port PORT] [--viewer-port PORT] [--no-viewer] [--no-rest] [--mcp]
 */

const http = require("http");

const fn = require("../functions");
const integrations = require("../packages/integrations");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const startTime = Date.now();
  const phaseResults = [];

  function phase(name, fn) {
    const start = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - start;
      phaseResults.push({ phase: name, ok: true, duration });
      process.stdout.write(`  [${name}] ok (${duration}ms)\n`);
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      phaseResults.push({ phase: name, ok: false, duration, error: err.message });
      process.stdout.write(`  [${name}] FAILED: ${err.message}\n`);
      throw err;
    }
  }

  process.stdout.write("tt-b Lifecycle Bootstrap\n");
  process.stdout.write("========================\n\n");

  // Phase 1: Load config
  const config = phase("1. load-config", () => fn.loadConfig(argv));
  process.stdout.write(`     root: ${config.projectRoot}\n`);
  process.stdout.write(`     rest: :${config.restPort}  viewer: :${config.viewerPort}\n\n`);

  // Phase 2: Initialize provider
  const provider = phase("2. init-provider", () => fn.createProvider(config.projectRoot));

  // Phase 3: Register memory functions (internal API, used by phases 4-8)
  phase("3. register-memory-functions", () => {
    const required = [
      "readMemory", "writeMemory", "listMemory", "searchMemory",
      "snapshotMemory", "restoreMemory", "diffMemory",
      "verifyMemory", "extractNodes", "extractEdges",
    ];
    const missing = required.filter((name) => typeof fn[name] !== "function");
    if (missing.length > 0) throw new Error(`Missing function exports: ${missing.join(", ")}`);
  });

  // Phase 4: Register REST endpoints
  const routes = new Map();
  let restServer = null;
  if (config.enableRest) {
    phase("4. register-rest-endpoints", () => {
      integrations.rest.registerRoutes({ routes, config, provider });
    });
  } else {
    phaseResults.push({ phase: "4. register-rest-endpoints", ok: true, duration: 0, skipped: true });
    process.stdout.write("  [4. register-rest-endpoints] skipped\n");
  }

  // Phase 5: Register MCP endpoints
  let mcpHandler = null;
  if (config.enableMcp) {
    mcpHandler = phase("5. register-mcp-endpoints", () => {
      return integrations.mcp.createMcpHandler({ provider, config });
    });
    process.stdout.write(`     MCP: ${mcpHandler.TOOLS.length} tools registered\n`);
  } else {
    phaseResults.push({ phase: "5. register-mcp-endpoints", ok: true, duration: 0, skipped: true });
    process.stdout.write("  [5. register-mcp-endpoints] skipped (use --mcp to enable)\n");
  }

  // Phase 6: Start viewer
  let viewerServer = null;
  if (config.enableViewer) {
    viewerServer = phase("6. start-viewer", () => integrations.viewer.createViewer({ restPort: config.restPort }));
    viewerServer.listen(config.viewerPort, () => {
      process.stdout.write(`     Viewer dashboard on :${config.viewerPort}\n`);
    });
  } else {
    phaseResults.push({ phase: "6. start-viewer", ok: true, duration: 0, skipped: true });
    process.stdout.write("  [6. start-viewer] skipped\n");
  }

  // Phase 7: Initialize health check
  const health = phase("7. init-health-check", () => ({
    runAll() {
      return fn.healthCheck({
        memoryMap: config.memoryMap,
        scriptsMap: config.scriptsMap,
        exists: provider.exists,
        stat: provider.stat,
        staleDays: config.staleDays,
      });
    },
  }));

  // Phase 8: Initialize search index
  const searchIndexData = phase("8. init-search-index", () => {
    const built = fn.buildIndex({ memoryMap: config.memoryMap, readText: provider.readText, extraFiles: config.contractMap });
    return { ...built, search: (query) => fn.searchIndex({ query, index: built.index }) };
  });

  const totalDuration = Date.now() - startTime;
  process.stdout.write(`\nBootstrap complete in ${totalDuration}ms\n`);
  process.stdout.write(`Search index: ${searchIndexData.files} files, ${searchIndexData.terms} terms\n\n`);

  // Register lifecycle-specific routes
  if (config.enableRest) {
    routes.set("GET /lifecycle/status", () => ({
      status: "running", uptime: Math.round(process.uptime()),
      phases: phaseResults, startTime: new Date(startTime).toISOString(),
    }));
    routes.set("GET /health/detailed", () => health.runAll());
    routes.set("POST /search", async (req) => {
      const body = await readBody(req);
      let parsed;
      try { parsed = JSON.parse(body); } catch (e) { return { _status: 400, error: `Invalid JSON: ${e.message}` }; }
      const { query } = parsed;
      if (!query) return { _status: 400, error: "query required" };
      return searchIndexData.search(query);
    });
    routes.set("GET /search/stats", () => ({
      built: searchIndexData.built, files: searchIndexData.files,
      totalTerms: searchIndexData.terms, byType: searchIndexData.byType,
    }));

    // Create and start HTTP server
    restServer = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${config.restPort}`);
      const key = `${req.method} ${url.pathname}`;
      const handler = routes.get(key);
      if (!handler) { jsonResponse(res, 404, { error: `Not found: ${key}` }); return; }
      try {
        const result = await handler(req, res, {}, url);
        const status = (result && result._status) || 200;
        if (result && result._status) delete result._status;
        jsonResponse(res, status, result);
      } catch (err) { jsonResponse(res, 500, { error: err.message }); }
    });

    restServer.listen(config.restPort, () => {
      process.stdout.write(`     REST API listening on :${config.restPort}\n`);
    });
  }

  // MCP stdio handler
  if (config.enableMcp && mcpHandler) {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const request = JSON.parse(trimmed);
          const response = mcpHandler.handleRequest(request);
          if (response) process.stdout.write(JSON.stringify(response) + "\n");
        } catch {
          process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
        }
      }
    });
    process.stdin.on("end", () => process.exit(0));
  }

  // Graceful shutdown
  function shutdown() {
    process.stdout.write("\nShutting down...\n");
    if (restServer) restServer.close();
    if (viewerServer) viewerServer.close();
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
