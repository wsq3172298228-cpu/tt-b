/**
 * integrations/opencode — OpenCode config merge adapter.
 *
 * Handles `opencode.json` instruction path merging and deduplication.
 */

function mergeJsonArray(existingValue, newValues) {
  const result = [];
  for (const value of Array.isArray(existingValue) ? existingValue : []) {
    if (!result.includes(value)) result.push(value);
  }
  for (const value of newValues) {
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

/**
 * Merge tt-b instruction paths into an existing opencode.json.
 */
function mergeOpenCodeConfig(existingText, templateText) {
  const template = JSON.parse(templateText);
  if (!existingText.trim()) {
    return JSON.stringify(template, null, 2) + "\n";
  }

  const existing = JSON.parse(existingText);
  const merged = {
    ...existing,
    instructions: mergeJsonArray(existing.instructions, template.instructions),
  };

  if (!merged.$schema && template.$schema) {
    merged.$schema = template.$schema;
  }

  return JSON.stringify(merged, null, 2) + "\n";
}

/**
 * Remove tt-b instruction paths from opencode.json.
 * Returns { changed, content?, removed? }.
 */
function cleanOpenCodeConfig(configText) {
  if (!configText) return { changed: false, reason: "file-not-found" };

  let data;
  try { data = JSON.parse(configText); } catch { return { changed: false, reason: "invalid-json" }; }

  if (!data.instructions || !Array.isArray(data.instructions)) {
    return { changed: false, reason: "no-instructions" };
  }

  const ttbPaths = [
    "AGENTS.md", "CLAUDE.md",
    ".claude/memory/knowledge-graph.md", ".claude/memory/session-state.md",
  ];

  const filtered = data.instructions.filter((p) => !ttbPaths.includes(p));
  const removedCount = data.instructions.length - filtered.length;

  if (removedCount === 0) return { changed: false, reason: "no-tt-b-instructions" };

  data.instructions = filtered;
  if (data.instructions.length === 0) delete data.instructions;

  return { changed: true, content: JSON.stringify(data, null, 2) + "\n", removed: removedCount };
}

module.exports = { mergeOpenCodeConfig, cleanOpenCodeConfig, mergeJsonArray };
