/**
 * plugin/index — Claude/Codex UX layer.
 *
 * Provides:
 *   - Hook definitions and merge logic for Claude Code
 *   - Model preflight detection (standalone, no CLI dependency)
 *   - Managed block merge/remove for instruction files
 */

module.exports = {
  hooks: require("./hooks"),
  preflight: require("./preflight"),
  managedBlock: require("./managed-block"),
};
