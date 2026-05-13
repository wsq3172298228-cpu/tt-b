/**
 * plugin/managed-block — Managed block merge/remove for instruction files.
 *
 * Uses HTML comment markers to identify tt-b content in CLAUDE.md / AGENTS.md.
 * Supports idempotent merge and clean removal.
 */

const MARKER_START = "<!-- tt-b:agent-workflow:start -->";
const MARKER_END = "<!-- tt-b:agent-workflow:end -->";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function managedBlock(content) {
  return `${MARKER_START}\n\n${content.trim()}\n\n${MARKER_END}\n`;
}

/**
 * Merge a managed block into existing file content.
 * If the block already exists, replace it. Otherwise append.
 */
function mergeManagedBlock(existing, content) {
  const block = managedBlock(content);
  if (!existing.trim()) return block;

  const pattern = new RegExp(`${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}\\n?`);
  if (pattern.test(existing)) {
    return existing.replace(pattern, block);
  }

  return `${existing.replace(/\s+$/, "")}\n\n${block}`;
}

/**
 * Remove the managed block from file content.
 * Returns { changed, content }.
 */
function removeManagedBlock(content) {
  if (!content) return { changed: false, content };

  const pattern = new RegExp(
    `\\n?${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}\\n?`,
    "g"
  );

  if (!pattern.test(content)) return { changed: false, content };

  const cleaned = content.replace(pattern, "").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  return { changed: true, content: cleaned };
}

module.exports = { mergeManagedBlock, removeManagedBlock, MARKER_START, MARKER_END };
