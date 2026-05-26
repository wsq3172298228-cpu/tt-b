/**
 * integrations/mcp — MCP protocol handler for tt-b.
 *
 * Implements MCP JSON-RPC 2.0 over stdio.
 * Exposes memory files as resources and memory functions as tools.
 */

const fn = require("../../functions");

/**
 * Create an MCP server handler.
 *
 * @param {object} opts
 * @param {object} opts.provider — from createProvider
 * @param {object} opts.config — from loadConfig
 * @param {object} [opts.searchIndexData] — from buildIndex
 * @returns {{ handleRequest, RESOURCES, TOOLS }}
 */
function createMcpHandler({ provider, config, searchIndexData }) {
  const RESOURCES = [
    { uri: "tt-b://memory/knowledge-graph", name: "Knowledge Graph Memory", description: "Long-term project memory stored as a knowledge graph.", mimeType: "text/markdown", filePath: ".claude/memory/knowledge-graph.md" },
    { uri: "tt-b://memory/session-state", name: "Session State Memory", description: "Short-term execution cursor.", mimeType: "text/markdown", filePath: ".claude/memory/session-state.md" },
    { uri: "tt-b://contract/claude-md", name: "CLAUDE.md Startup Contract", description: "Project-level startup contract.", mimeType: "text/markdown", filePath: "CLAUDE.md" },
    { uri: "tt-b://contract/agents-md", name: "AGENTS.md Instructions", description: "OpenCode-compatible agent instructions.", mimeType: "text/markdown", filePath: "AGENTS.md" },
  ];

  const TOOLS = [
    { name: "tt-b_preflight", description: "Detect host, model, capability tier, and startup mode.", inputSchema: { type: "object", properties: { host: { type: "string" }, model: { type: "string" } }, additionalProperties: false } },
    { name: "tt-b_memory_list", description: "List all memory files with metadata.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "tt-b_memory_read", description: "Read a memory file by name or path.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false } },
    { name: "tt-b_memory_search", description: "Search memory files for a regex pattern.", inputSchema: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"], additionalProperties: false } },
    { name: "tt-b_memory_snapshot", description: "Create a point-in-time snapshot of all memory files.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "tt-b_memory_verify", description: "Verify memory files for staleness and placeholders.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "tt-b_memory_nodes", description: "Extract all knowledge graph nodes.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "tt-b_memory_edges", description: "Extract all knowledge graph edges.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "tt-b_memory_write", description: "Write or update a memory file.", inputSchema: { type: "object", properties: { name: { type: "string" }, content: { type: "string" } }, required: ["name", "content"], additionalProperties: false } },
    { name: "tt-b_memory_diff", description: "Diff a memory file against old content.", inputSchema: { type: "object", properties: { name: { type: "string" }, oldContent: { type: "string" } }, required: ["name", "oldContent"], additionalProperties: false } },
    { name: "tt-b_memory_restore", description: "Restore memory from a snapshot.", inputSchema: { type: "object", properties: { snapshot: { type: "object" } }, required: ["snapshot"], additionalProperties: false } },
    { name: "tt-b_memory_subgraph", description: "Get dependency subgraph for a node. Returns upstream/downstream dependencies within N hops in LLM-friendly text. Avoids micro-level node traversal.", inputSchema: { type: "object", properties: { entity: { type: "string", description: "Target node name (e.g., importer, Module:importer)" }, depth: { type: "number", description: "Max hops (1-5, default 3)" }, direction: { type: "string", enum: ["upstream", "downstream", "both"], description: "Exploration direction (default both)" } }, required: ["entity"], additionalProperties: false } },
  ];

  function handleToolCall(name, args) {
    const wrap = (data) => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
    const err = (msg) => ({ content: [{ type: "text", text: msg }], isError: true });

    switch (name) {
      case "tt-b_preflight": {
        const { execFileSync } = require("child_process");
        const preflightPath = provider.resolve(config.scriptsMap.preflight);
        if (!provider.exists(config.scriptsMap.preflight)) return err("model-preflight.js not found");
        const cliArgs = [];
        if (args.host) cliArgs.push("--host", args.host);
        if (args.model) cliArgs.push("--model", args.model);
        try {
          return wrap(execFileSync(process.execPath, [preflightPath, ...cliArgs], { cwd: config.projectRoot, timeout: 10000, encoding: "utf8" }).trim());
        } catch (e) { return err("Preflight error: " + (e.stderr || e.message)); }
      }
      case "tt-b_memory_list":
        return wrap(fn.listMemory({ memoryMap: config.memoryMap, readText: provider.readText, stat: provider.stat, listDir: provider.listDir }));
      case "tt-b_memory_read": {
        const r = fn.readMemory({ name: args.name, memoryMap: config.memoryMap, readText: provider.readText });
        return r.ok ? wrap(r.content) : err("Error: " + r.error);
      }
      case "tt-b_memory_search":
        return wrap(fn.searchMemory({ pattern: args.pattern, memoryMap: config.memoryMap, readText: provider.readText }));
      case "tt-b_memory_snapshot":
        return wrap(fn.snapshotMemory({ memoryMap: config.memoryMap, readText: provider.readText }));
      case "tt-b_memory_verify":
        return wrap(fn.verifyMemory({ memoryMap: config.memoryMap, readText: provider.readText, staleDays: config.staleDays }));
      case "tt-b_memory_nodes": {
        const content = provider.readText(config.memoryMap.knowledgeGraph);
        return wrap(fn.extractNodes({ content }));
      }
      case "tt-b_memory_edges": {
        const content = provider.readText(config.memoryMap.knowledgeGraph);
        return wrap(fn.extractEdges({ content }));
      }
      case "tt-b_memory_write": {
        const r = fn.writeMemory({ name: args.name, content: args.content, memoryMap: config.memoryMap, writeText: provider.writeText });
        return r.ok ? wrap({ ok: true, path: r.path }) : err("Error: " + r.error);
      }
      case "tt-b_memory_diff":
        return wrap(fn.diffMemory({ name: args.name, oldContent: args.oldContent, memoryMap: config.memoryMap, readText: provider.readText }));
      case "tt-b_memory_restore":
        return wrap(fn.restoreMemory({ snapshot: args.snapshot, memoryMap: config.memoryMap, writeText: provider.writeText }));
      case "tt-b_memory_subgraph": {
        const content = provider.readText(config.memoryMap.knowledgeGraph);
        return wrap(fn.subgraphQuery({ content, entity: args.entity, depth: args.depth, direction: args.direction, projectRoot: config.projectRoot }));
      }
      default:
        return err("Unknown tool: " + name);
    }
  }

  function handleRequest(request) {
    const { method, id, params } = request;
    if (id === undefined || id === null) return null;

    switch (method) {
      case "initialize":
        return { jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { resources: { listChanged: false }, tools: { listChanged: false } }, serverInfo: { name: "tt-b", version: "0.1.0" } } };
      case "resources/list":
        return { jsonrpc: "2.0", id, result: { resources: RESOURCES.map(({ uri, name, description, mimeType }) => ({ uri, name, description, mimeType })) } };
      case "resources/read": {
        const uri = params?.uri;
        const resource = RESOURCES.find((r) => r.uri === uri);
        if (!resource) return { jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown resource URI: " + uri } };
        const content = provider.readText(resource.filePath);
        if (content === null) return { jsonrpc: "2.0", id, error: { code: -32000, message: "File not found" } };
        return { jsonrpc: "2.0", id, result: { contents: [{ uri, mimeType: resource.mimeType, text: content }] } };
      }
      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
      case "tools/call": {
        const toolName = params?.name;
        const args = params?.arguments || {};
        return { jsonrpc: "2.0", id, result: handleToolCall(toolName, args) };
      }
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + method } };
    }
  }

  return { handleRequest, RESOURCES, TOOLS };
}

module.exports = { createMcpHandler };
