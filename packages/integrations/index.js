/**
 * integrations/index — Horizontal extension layer.
 *
 * Provides adapters for:
 *   - OpenCode config merge/clean
 *   - MCP protocol handler
 *   - REST API route registration
 *   - HTML viewer dashboard
 */

module.exports = {
  opencode: require("./opencode"),
  mcp: require("./mcp"),
  rest: require("./rest"),
  viewer: require("./viewer"),
};
