/**
 * config — Load and merge tt-b configuration from defaults, env, and CLI args.
 *
 * @param {string[]} argv — process.argv.slice(2)
 * @returns {object} config
 */

const DEFAULTS = {
  projectRoot: process.cwd(),
  restPort: 3742,
  viewerPort: 3743,
  enableViewer: true,
  enableRest: true,
  enableMcp: false,
  staleDays: 7,
  memoryMap: {
    knowledgeGraph: ".claude/memory/knowledge-graph.md",
    sessionState: ".claude/memory/session-state.md",
  },
  contractMap: {
    claudeMd: "CLAUDE.md",
    agentsMd: "AGENTS.md",
  },
  scriptsMap: {
    preflight: ".claude/bin/model-preflight.js",
    reminder: ".claude/bin/memory-reminder.js",
    importer: "bin/import-agent-workflow.js",
    lifecycle: "bin/tt-b-lifecycle.js",
    mcpServer: "bin/tt-b-mcp-server.js",
    restServer: "bin/tt-b-rest-server.js",
    cleanup: "bin/tt-b-cleanup.js",
  },
};

function loadConfig(argv) {
  const config = { ...DEFAULTS };

  // Env overrides
  if (process.env.TTB_PROJECT_ROOT) config.projectRoot = process.env.TTB_PROJECT_ROOT;
  if (process.env.TTB_REST_PORT) config.restPort = parseInt(process.env.TTB_REST_PORT, 10);
  if (process.env.TTB_VIEWER_PORT) config.viewerPort = parseInt(process.env.TTB_VIEWER_PORT, 10);
  if (process.env.TTB_REST_URL) config.restUrl = process.env.TTB_REST_URL;

  // Derived
  config.restUrl = config.restUrl || `http://localhost:${config.restPort}`;

  // CLI overrides
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port" && argv[i + 1]) config.restPort = parseInt(argv[++i], 10);
    if (argv[i] === "--viewer-port" && argv[i + 1]) config.viewerPort = parseInt(argv[++i], 10);
    if (argv[i] === "--no-viewer") config.enableViewer = false;
    if (argv[i] === "--no-rest") config.enableRest = false;
    if (argv[i] === "--mcp") config.enableMcp = true;
    if (argv[i] === "--stale-days" && argv[i + 1]) config.staleDays = parseInt(argv[++i], 10);
    if (argv[i] === "--help" || argv[i] === "-h") {
      process.stdout.write(
        [
          "Usage: node bin/tt-b-lifecycle.js [options]",
          "",
          "Options:",
          "  --port PORT          REST API port (default: 3742)",
          "  --viewer-port PORT   Viewer dashboard port (default: 3743)",
          "  --no-viewer          Disable viewer dashboard",
          "  --no-rest            Disable REST API",
          "  --mcp                Enable MCP server (stdio)",
          "  --stale-days N       Days before memory is flagged stale (default: 7)",
          "  --help               Show this help",
        ].join("\n") + "\n"
      );
      process.exit(0);
    }
  }

  return config;
}

module.exports = loadConfig;
module.exports.DEFAULTS = DEFAULTS;
