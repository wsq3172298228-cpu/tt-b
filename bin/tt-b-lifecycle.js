#!/usr/bin/env node

/**
 * tt-b Lifecycle Hook
 *
 * Full application bootstrap orchestrator. Runs 9 sequential phases:
 *
 *   1. Load config              → functions/config
 *   2. Initialize provider      → functions/provider
 *   3. Start worker             → inline (periodic health checks)
 *   4. Register memory functions → functions/*
 *   5. Register REST endpoints  → packages/integrations/rest
 *   6. Register MCP endpoints   → packages/integrations/mcp
 *   7. Start viewer             → packages/integrations/viewer
 *   8. Initialize health check  → functions/health-check
 *   9. Initialize search index  → functions/build-index + functions/search-index
 *
 * Usage:
 *   node bin/tt-b-lifecycle.js [--port PORT] [--viewer-port PORT] [--no-viewer] [--no-rest] [--mcp]
 */

const http = require("http");
const { EventEmitter } = require("events");

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
  const bus = new EventEmitter();
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

  // Phase 3: Start worker
  const worker = phase("3. start-worker", () => {
    const state = { ticks: 0, lastTick: null };
    const timer = setInterval(() => {
      state.ticks++;
      state.lastTick = new Date().toISOString();

      // Check staleness
      for (const [, relPath] of Object.entries(config.memoryMap)) {
        const stat = provider.stat(relPath);
        if (!stat.ok) { bus.emit("health:warn", { type: "missing-memory", file: relPath }); continue; }
        const age = Date.now() - new Date(stat.mtime).getTime();
        if (age > 24 * 3600000) bus.emit("health:warn", { type: "stale-memory", file: relPath, ageHours: Math.round(age / 3600000) });
      }

      bus.emit("worker:tick", { ticks: state.ticks, timestamp: state.lastTick });
    }, config.workerInterval);

    // Run immediately
    clearInterval(timer);
    const immediateTimer = setInterval(() => {
      state.ticks++;
      state.lastTick = new Date().toISOString();
      bus.emit("worker:tick", { ticks: state.ticks, timestamp: state.lastTick });
    }, config.workerInterval);
    state.ticks++;
    state.lastTick = new Date().toISOString();

    return { state, stop() { clearInterval(immediateTimer); } };
  });

  // Phase 4: Register memory functions (internal API, used by phases 5-9)
  phase("4. register-memory-functions", () => {
    // Validate that all function modules load correctly
    fn.readMemory; fn.writeMemory; fn.listMemory; fn.searchMemory;
    fn.snapshotMemory; fn.restoreMemory; fn.diffMemory;
    fn.verifyMemory; fn.extractNodes; fn.extractEdges;
  });

  // Phase 5: Register REST endpoints
  const routes = new Map();
  let restServer = null;
  if (config.enableRest) {
    phase("5. register-rest-endpoints", () => {
      integrations.rest.registerRoutes({ routes, config, provider });
    });
  } else {
    phaseResults.push({ phase: "5. register-rest-endpoints", ok: true, duration: 0, skipped: true });
    process.stdout.write("  [5. register-rest-endpoints] skipped\n");
  }

  // Phase 6: Register MCP endpoints
  let mcpHandler = null;
  if (config.enableMcp) {
    mcpHandler = phase("6. register-mcp-endpoints", () => {
      return integrations.mcp.createMcpHandler({ provider, config });
    });
    process.stdout.write(`     MCP: ${mcpHandler.TOOLS.length} tools registered\n`);
  } else {
    phaseResults.push({ phase: "6. register-mcp-endpoints", ok: true, duration: 0, skipped: true });
    process.stdout.write("  [6. register-mcp-endpoints] skipped (use --mcp to enable)\n");
  }

  // Phase 7: Start viewer
  let viewerServer = null;
  if (config.enableViewer) {
    viewerServer = phase("7. start-viewer", () => integrations.viewer.createViewer({ restPort: config.restPort }));
    viewerServer.listen(config.viewerPort, () => {
      process.stdout.write(`     Viewer dashboard on :${config.viewerPort}\n`);
    });
  } else {
    phaseResults.push({ phase: "7. start-viewer", ok: true, duration: 0, skipped: true });
    process.stdout.write("  [7. start-viewer] skipped\n");
  }

  // Phase 8: Initialize health check
  const health = phase("8. init-health-check", () => {
    const warnings = [];
    bus.on("health:warn", (w) => warnings.push({ ...w, timestamp: new Date().toISOString() }));
    return {
      runAll() {
        const result = fn.healthCheck({
          memoryMap: config.memoryMap,
          scriptsMap: config.scriptsMap,
          exists: provider.exists,
          stat: provider.stat,
          staleDays: config.staleDays,
        });
        return { ...result, warnings: warnings.slice(-20) };
      },
      warnings,
    };
  });

  // Phase 9: Initialize search index
  const searchIndexData = phase("9. init-search-index", () => {
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
      const { query } = JSON.parse(body);
      if (!query) return { error: "query required" };
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
        jsonResponse(res, 200, result);
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
    worker.stop();
    if (restServer) restServer.close();
    if (viewerServer) viewerServer.close();
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
