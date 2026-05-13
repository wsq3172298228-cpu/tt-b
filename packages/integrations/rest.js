/**
 * integrations/rest — REST API route definitions for tt-b.
 *
 * Registers all REST endpoints on a shared routes Map.
 * Used by the lifecycle hook and the standalone REST server.
 */

const fn = require("../../functions");
const { execFileSync } = require("child_process");

/**
 * Register all tt-b REST routes.
 *
 * @param {object} opts
 * @param {Map} opts.routes — shared routes Map
 * @param {object} opts.config — from loadConfig
 * @param {object} opts.provider — from createProvider
 */
function registerRoutes({ routes, config, provider }) {
  function route(method, pathname, handler) {
    routes.set(`${method} ${pathname}`, handler);
  }

  // Health
  route("GET", "/health", () => ({
    status: "ok", server: "tt-b", version: "0.1.0",
    uptime: Math.round(process.uptime()), projectRoot: config.projectRoot,
  }));

  // Preflight
  route("GET", "/preflight", (_req, _res, _ctx, url) => {
    const host = url.searchParams.get("host");
    const model = url.searchParams.get("model");
    if (!provider.exists(config.scriptsMap.preflight)) return { error: "model-preflight.js not found" };
    const args = [];
    if (host) args.push("--host", host);
    if (model) args.push("--model", model);
    try {
      return JSON.parse(execFileSync(process.execPath, [provider.resolve(config.scriptsMap.preflight), ...args], { cwd: config.projectRoot, timeout: 10000, encoding: "utf8" }));
    } catch (e) { return { error: e.stderr || e.message }; }
  });

  // Memory reminder
  route("POST", "/memory/reminder", async (req) => {
    const body = await readBody(req);
    const parsed = body.trim() ? JSON.parse(body) : {};
    if (!provider.exists(config.scriptsMap.reminder)) return { error: "memory-reminder.js not found" };
    const hookInput = JSON.stringify({
      hook_event_name: parsed.event || "UserPromptSubmit",
      prompt: parsed.prompt || "non-trivial task",
      source: parsed.source || "turn",
      cwd: config.projectRoot,
    });
    try {
      const stdout = execFileSync(process.execPath, [provider.resolve(config.scriptsMap.reminder)], { cwd: config.projectRoot, input: hookInput, timeout: 10000, encoding: "utf8" });
      if (!stdout.trim()) return { reminder: null, message: "No reminder needed." };
      const r = JSON.parse(stdout.trim());
      return { reminder: r.hookSpecificOutput?.additionalContext || null };
    } catch (e) { return { error: e.stderr || e.message }; }
  });

  // Workflow import
  route("POST", "/workflow/import", async (req) => {
    const body = await readBody(req);
    const parsed = JSON.parse(body);
    if (!parsed.targetDir) return { error: "targetDir is required" };
    if (!provider.exists(config.scriptsMap.importer)) return { error: "import-agent-workflow.js not found" };
    const args = [parsed.targetDir];
    if (parsed.force) args.push("--force");
    if (parsed.dryRun) args.push("--dry-run");
    try {
      return { output: execFileSync(process.execPath, [provider.resolve(config.scriptsMap.importer), ...args], { cwd: config.projectRoot, timeout: 30000, encoding: "utf8" }).trim() };
    } catch (e) { return { error: e.stderr || e.message }; }
  });

  // Memory CRUD
  route("GET", "/memory/list", () => fn.listMemory({ memoryMap: config.memoryMap, readText: provider.readText, stat: provider.stat, listDir: provider.listDir }));

  route("GET", "/memory/read", (_req, _res, _ctx, url) => {
    const name = url.searchParams.get("name");
    if (!name) return { error: "name is required" };
    return fn.readMemory({ name, memoryMap: config.memoryMap, readText: provider.readText });
  });

  route("POST", "/memory/search", async (req) => {
    const body = await readBody(req);
    const { pattern } = JSON.parse(body);
    if (!pattern) return { error: "pattern is required" };
    return fn.searchMemory({ pattern, memoryMap: config.memoryMap, readText: provider.readText });
  });

  route("GET", "/memory/snapshot", () => fn.snapshotMemory({ memoryMap: config.memoryMap, readText: provider.readText }));

  route("POST", "/memory/restore", async (req) => {
    const body = await readBody(req);
    return fn.restoreMemory({ snapshot: JSON.parse(body), memoryMap: config.memoryMap, writeText: provider.writeText });
  });

  route("GET", "/memory/verify", () => fn.verifyMemory({ memoryMap: config.memoryMap, readText: provider.readText, staleDays: config.staleDays }));

  route("GET", "/memory/nodes", () => {
    const content = provider.readText(config.memoryMap.knowledgeGraph);
    return fn.extractNodes({ content });
  });

  route("GET", "/memory/edges", () => {
    const content = provider.readText(config.memoryMap.knowledgeGraph);
    return fn.extractEdges({ content });
  });

  route("POST", "/memory/diff", async (req) => {
    const body = await readBody(req);
    const { name, oldContent } = JSON.parse(body);
    if (!name) return { error: "name is required" };
    return fn.diffMemory({ name, oldContent, memoryMap: config.memoryMap, readText: provider.readText });
  });

  route("POST", "/memory/write", async (req) => {
    const body = await readBody(req);
    const { name, content } = JSON.parse(body);
    if (!name || content === undefined) return { error: "name and content are required" };
    return fn.writeMemory({ name, content, memoryMap: config.memoryMap, writeText: provider.writeText });
  });

  // Hook event ingestion (thin-client hook scripts POST here)
  route("POST", "/memory/observe", async (req) => {
    const body = await readBody(req);
    const event = JSON.parse(body);
    const hookType = event.hookType || "unknown";

    // For session_start and pre_compact, optionally inject memory context
    if (hookType === "session_start" || hookType === "pre_compact") {
      const kg = provider.readText(config.memoryMap.knowledgeGraph);
      const ss = provider.readText(config.memoryMap.sessionState);
      if (kg || ss) {
        const lines = ["<tt-b-memory>"];
        if (kg) lines.push("## Knowledge Graph", kg.slice(0, 2000));
        if (ss) lines.push("## Session State", ss.slice(0, 1000));
        lines.push("</tt-b-memory>");
        return { ok: true, hookType, context: lines.join("\n") };
      }
    }

    return { ok: true, hookType };
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

module.exports = { registerRoutes };
