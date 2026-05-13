#!/usr/bin/env node

/**
 * tt-b MCP Server
 *
 * Exposes tt-b memory files as MCP resources and helper scripts as MCP tools.
 * Communicates over stdio using the MCP JSON-RPC 2.0 protocol.
 *
 * Uses packages/integrations/mcp for protocol handling.
 * Uses functions/ for memory operations.
 */

const { createMcpHandler } = require("../packages/integrations/mcp");
const { createProvider, loadConfig } = require("../functions");

function main() {
  const config = loadConfig(process.argv.slice(2));
  const provider = createProvider(config.projectRoot);
  const handler = createMcpHandler({ provider, config });

  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let request;
      try {
        request = JSON.parse(trimmed);
      } catch {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
        continue;
      }

      const response = handler.handleRequest(request);
      if (response) {
        process.stdout.write(JSON.stringify(response) + "\n");
      }
    }
  });

  process.stdin.on("end", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
}

main();
