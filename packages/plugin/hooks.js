/**
 * plugin/hooks — Claude Code hook contract definitions.
 *
 * Defines the hook entries that tt-b registers in `.claude/settings.json`.
 * Used by the importer to merge hooks without overwriting existing settings.
 */

const MEMORY_REMINDER_HOOK = {
  type: "command",
  command: "node .claude/bin/memory-reminder.js",
  timeout: 5,
};

const SESSION_START_MATCHER = "startup|resume|clear|compact";

const PLUGIN_SCRIPTS_DIR = "${CLAUDE_PLUGIN_ROOT}/scripts";

function pluginHook(script, opts = {}) {
  const hook = { type: "command", command: `node ${PLUGIN_SCRIPTS_DIR}/${script}` };
  if (opts.timeout) hook.timeout = opts.timeout;
  if (opts.statusMessage) hook.statusMessage = opts.statusMessage;
  return hook;
}

const TT_B_HOOKS = {
  SessionStart: [
    { matcher: SESSION_START_MATCHER, hooks: [MEMORY_REMINDER_HOOK] },
    { hooks: [pluginHook("session-start.mjs", { statusMessage: "Loading project memory..." })] },
  ],
  UserPromptSubmit: [
    { hooks: [MEMORY_REMINDER_HOOK] },
    { hooks: [pluginHook("prompt-submit.mjs")] },
  ],
  PreToolUse: [
    { matcher: "Edit|Write|Read", hooks: [pluginHook("pre-tool-use.mjs")] },
  ],
  PostToolUse: [
    { hooks: [pluginHook("post-tool-use.mjs")] },
  ],
  PreCompact: [
    { hooks: [pluginHook("pre-compact.mjs")] },
  ],
  SubagentStart: [
    { hooks: [pluginHook("subagent-start.mjs")] },
  ],
  SubagentStop: [
    { hooks: [pluginHook("subagent-stop.mjs")] },
  ],
  Stop: [
    { hooks: [pluginHook("stop.mjs")] },
  ],
};

/**
 * Merge tt-b hooks into existing Claude Code settings.
 * Preserves existing hooks and permissions.
 */
function mergeHooks(existing, template) {
  const result = { ...existing };
  const mergedHooks = { ...(existing.hooks || {}) };

  for (const [eventName, templateEntries] of Object.entries(template.hooks || {})) {
    const existingEntries = mergedHooks[eventName] || [];
    const seen = new Set(existingEntries.map((e) => JSON.stringify(e)));
    const merged = [...existingEntries];

    for (const entry of templateEntries) {
      const key = JSON.stringify(entry);
      if (!seen.has(key)) {
        merged.push(entry);
        seen.add(key);
      }
    }

    mergedHooks[eventName] = merged;
  }

  result.hooks = mergedHooks;
  return result;
}

module.exports = { TT_B_HOOKS, MEMORY_REMINDER_HOOK, pluginHook, PLUGIN_SCRIPTS_DIR, mergeHooks };
