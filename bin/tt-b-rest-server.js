#!/usr/bin/env node

/**
 * tt-b REST API Server
 *
 * Wraps tt-b helper scripts and memory functions behind HTTP endpoints.
 * Uses packages/integrations/rest for route definitions.
 * Uses functions/ for memory operations.
 */

const http = require("http");
const { createProvider, loadConfig } = require("../functions");
const { registerRoutes } = require("../packages/integrations/rest");

function jsonResponse(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function main() {
  const config = loadConfig(process.argv.slice(2));
  const provider = createProvider(config.projectRoot);
  const routes = new Map();

  registerRoutes({ routes, config, provider });

  // Add health endpoint
  routes.set("GET /health", () => ({
    status: "ok",
    server: "tt-b-rest",
    version: "0.1.0",
    uptime: Math.round(process.uptime()),
    projectRoot: config.projectRoot,
  }));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${config.restPort}`);
    const key = `${req.method} ${url.pathname}`;
    const handler = routes.get(key);

    if (!handler) {
      jsonResponse(res, 404, { error: `Not found: ${key}` });
      return;
    }

    try {
      const result = await handler(req, res, {}, url);
      const status = (result && result._status) || 200;
      if (result && result._status) delete result._status;
      jsonResponse(res, status, result);
    } catch (err) {
      jsonResponse(res, 500, { error: err.message });
    }
  });

  server.listen(config.restPort, () => {
    process.stdout.write(`tt-b REST API server listening on http://localhost:${config.restPort}\n`);
    process.stdout.write(`Project root: ${config.projectRoot}\n`);
    process.stdout.write(`\nEndpoints:\n`);
    process.stdout.write(`  GET  /health              — health check\n`);
    process.stdout.write(`  GET  /preflight           — model preflight\n`);
    process.stdout.write(`  POST /memory/reminder     — memory reminder\n`);
    process.stdout.write(`  POST /workflow/import     — import workflow\n`);
    process.stdout.write(`  GET  /memory/list         — list memory files\n`);
    process.stdout.write(`  GET  /memory/read         — read memory\n`);
    process.stdout.write(`  POST /memory/search       — search memory\n`);
    process.stdout.write(`  GET  /memory/snapshot     — snapshot\n`);
    process.stdout.write(`  POST /memory/restore      — restore\n`);
    process.stdout.write(`  GET  /memory/verify       — verify\n`);
    process.stdout.write(`  GET  /memory/nodes        — graph nodes\n`);
    process.stdout.write(`  GET  /memory/edges        — graph edges\n`);
    process.stdout.write(`  POST /memory/diff         — diff\n`);
    process.stdout.write(`  POST /memory/write        — write memory\n`);
    process.stdout.write(`  POST /memory/observe      — hook event ingestion\n`);
  });

  process.on("SIGINT", () => server.close(() => process.exit(0)));
  process.on("SIGTERM", () => server.close(() => process.exit(0)));
}

main();
