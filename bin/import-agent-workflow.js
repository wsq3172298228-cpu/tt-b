#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const MARKER_START = "<!-- tt-b:agent-workflow:start -->";
const MARKER_END = "<!-- tt-b:agent-workflow:end -->";

function usage() {
  return [
    "Usage: node bin/import-agent-workflow.js [target-dir] [options]",
    "",
    "Options:",
    "  --force       Replace existing tt-b managed blocks and files.",
    "  --dry-run     Show planned writes without changing files.",
    "  --help        Show this help.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    targetDir: ".",
    force: false,
    dryRun: false,
  };

  const positional = [];
  for (const arg of argv) {
    if (arg === "--force") {
      options.force = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length > 1) {
    throw new Error("Only one target directory may be provided.");
  }

  if (positional.length === 1) {
    options.targetDir = positional[0];
  }

  return options;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function ensureDir(dirPath, dryRun) {
  if (dryRun) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, content, dryRun) {
  if (dryRun) return;
  ensureDir(path.dirname(filePath), dryRun);
  fs.writeFileSync(filePath, content);
}

function copyFile(source, destination, dryRun) {
  if (dryRun) return;
  ensureDir(path.dirname(destination), dryRun);
  fs.copyFileSync(source, destination);
}

function copyDir(source, destination, dryRun) {
  if (dryRun) return;
  ensureDir(destination, dryRun);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, dryRun);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function managedBlock(content) {
  return `${MARKER_START}

${content.trim()}

${MARKER_END}
`;
}

function mergeManagedBlock(existing, content) {
  const block = managedBlock(content);
  if (!existing.trim()) return block;

  const pattern = new RegExp(`${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}\\n?`);
  if (pattern.test(existing)) {
    return existing.replace(pattern, block);
  }

  return `${existing.replace(/\s+$/, "")}\n\n${block}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fileAction(actions, kind, target) {
  actions.push({ kind, target });
}

function copyIfMissingOrForced({ source, target, force, dryRun, actions }) {
  const existed = exists(target);
  if (exists(target) && !force) {
    fileAction(actions, "kept", target);
    return;
  }
  copyFile(source, target, dryRun);
  fileAction(actions, existed ? "updated" : "created", target);
}

function makeLegacyPointer(targetPath) {
  return `# Deprecated Mirror

Canonical memory now lives under:

- \`${targetPath}\`

Do not update this file. It is kept only as a compatibility pointer for older
tooling.
`;
}

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

function normalizeJson(value) {
  return JSON.stringify(value);
}

function mergeHookEntries(existingEntries, templateEntries) {
  const result = [];
  const seen = new Set();

  for (const entry of Array.isArray(existingEntries) ? existingEntries : []) {
    result.push(entry);
    seen.add(normalizeJson(entry));
  }

  for (const entry of Array.isArray(templateEntries) ? templateEntries : []) {
    const key = normalizeJson(entry);
    if (!seen.has(key)) {
      result.push(entry);
      seen.add(key);
    }
  }

  return result;
}

function mergeClaudeSettings(existingText, templateText) {
  const template = JSON.parse(templateText);
  if (!existingText.trim()) {
    return JSON.stringify(template, null, 2) + "\n";
  }

  const existing = JSON.parse(existingText);
  const mergedHooks = {
    ...(existing.hooks || {}),
  };

  for (const [eventName, templateEntries] of Object.entries(template.hooks || {})) {
    mergedHooks[eventName] = mergeHookEntries(mergedHooks[eventName], templateEntries);
  }

  const merged = {
    ...existing,
    hooks: mergedHooks,
  };

  return JSON.stringify(merged, null, 2) + "\n";
}

function install(options) {
  const repoRoot = path.resolve(__dirname, "..");
  const targetRoot = path.resolve(process.cwd(), options.targetDir);
  const actions = [];

  if (!exists(targetRoot)) {
    throw new Error(`Target directory does not exist: ${targetRoot}`);
  }

  const claudeContract = readText(path.join(repoRoot, "CLAUDE.md"));
  const opencodeContract = readText(path.join(repoRoot, "templates/opencode/AGENTS.md"));

  const claudeTarget = path.join(targetRoot, "CLAUDE.md");
  const existingClaude = readText(claudeTarget);
  const mergedClaude = mergeManagedBlock(existingClaude, claudeContract);
  writeText(claudeTarget, mergedClaude, options.dryRun);
  fileAction(actions, existingClaude ? "updated" : "created", claudeTarget);

  const agentsTarget = path.join(targetRoot, "AGENTS.md");
  const existingAgents = readText(agentsTarget);
  const mergedAgents = mergeManagedBlock(existingAgents, opencodeContract);
  writeText(agentsTarget, mergedAgents, options.dryRun);
  fileAction(actions, existingAgents ? "updated" : "created", agentsTarget);

  const preflightTarget = path.join(targetRoot, ".claude/bin/model-preflight.js");
  const hadPreflight = exists(preflightTarget);
  copyFile(
    path.join(repoRoot, ".claude/bin/model-preflight.js"),
    preflightTarget,
    options.dryRun,
  );
  fileAction(actions, hadPreflight ? "updated" : "created", preflightTarget);

  const reminderTarget = path.join(targetRoot, ".claude/bin/memory-reminder.js");
  const hadReminder = exists(reminderTarget);
  copyFile(
    path.join(repoRoot, ".claude/bin/memory-reminder.js"),
    reminderTarget,
    options.dryRun,
  );
  fileAction(actions, hadReminder ? "updated" : "created", reminderTarget);

  const mcpServerTarget = path.join(targetRoot, ".claude/bin/tt-b-mcp-server.js");
  const hadMcpServer = exists(mcpServerTarget);
  copyFile(
    path.join(repoRoot, "bin/tt-b-mcp-server.js"),
    mcpServerTarget,
    options.dryRun,
  );
  fileAction(actions, hadMcpServer ? "updated" : "created", mcpServerTarget);

  const restServerTarget = path.join(targetRoot, ".claude/bin/tt-b-rest-server.js");
  const hadRestServer = exists(restServerTarget);
  copyFile(
    path.join(repoRoot, "bin/tt-b-rest-server.js"),
    restServerTarget,
    options.dryRun,
  );
  fileAction(actions, hadRestServer ? "updated" : "created", restServerTarget);

  const lifecycleTarget = path.join(targetRoot, ".claude/bin/tt-b-lifecycle.js");
  const hadLifecycle = exists(lifecycleTarget);
  copyFile(
    path.join(repoRoot, "bin/tt-b-lifecycle.js"),
    lifecycleTarget,
    options.dryRun,
  );
  fileAction(actions, hadLifecycle ? "updated" : "created", lifecycleTarget);

  const functionsTarget = path.join(targetRoot, ".claude/functions");
  const hadFunctions = exists(functionsTarget);
  copyDir(path.join(repoRoot, "functions"), functionsTarget, options.dryRun);
  fileAction(actions, hadFunctions ? "updated" : "created", functionsTarget);

  const packagesTarget = path.join(targetRoot, ".claude/packages");
  const hadPackages = exists(packagesTarget);
  copyDir(path.join(repoRoot, "packages"), packagesTarget, options.dryRun);
  fileAction(actions, hadPackages ? "updated" : "created", packagesTarget);

  const claudeSettingsTarget = path.join(targetRoot, ".claude/settings.json");
  const hadClaudeSettings = exists(claudeSettingsTarget);
  const mergedClaudeSettings = mergeClaudeSettings(
    readText(claudeSettingsTarget),
    readText(path.join(repoRoot, "templates/claude/settings.json")),
  );
  writeText(claudeSettingsTarget, mergedClaudeSettings, options.dryRun);
  fileAction(actions, hadClaudeSettings ? "updated" : "created", claudeSettingsTarget);

  copyIfMissingOrForced({
    source: path.join(repoRoot, "templates/claude/memory/knowledge-graph.md"),
    target: path.join(targetRoot, ".claude/memory/knowledge-graph.md"),
    force: options.force,
    dryRun: options.dryRun,
    actions,
  });

  copyIfMissingOrForced({
    source: path.join(repoRoot, "templates/claude/memory/session-state.md"),
    target: path.join(targetRoot, ".claude/memory/session-state.md"),
    force: options.force,
    dryRun: options.dryRun,
    actions,
  });

  const legacyKnowledge = path.join(targetRoot, ".claude/knowledge-graph.md");
  const hadLegacyKnowledge = exists(legacyKnowledge);
  if (!hadLegacyKnowledge || options.force) {
    writeText(legacyKnowledge, makeLegacyPointer(".claude/memory/knowledge-graph.md"), options.dryRun);
    fileAction(actions, hadLegacyKnowledge ? "updated" : "created", legacyKnowledge);
  } else {
    fileAction(actions, "kept", legacyKnowledge);
  }

  const legacySession = path.join(targetRoot, ".claude/session-state.md");
  const hadLegacySession = exists(legacySession);
  if (!hadLegacySession || options.force) {
    writeText(legacySession, makeLegacyPointer(".claude/memory/session-state.md"), options.dryRun);
    fileAction(actions, hadLegacySession ? "updated" : "created", legacySession);
  } else {
    fileAction(actions, "kept", legacySession);
  }

  const opencodeConfigTarget = path.join(targetRoot, "opencode.json");
  const hadOpenCodeConfig = exists(opencodeConfigTarget);
  const mergedOpenCodeConfig = mergeOpenCodeConfig(
    readText(opencodeConfigTarget),
    readText(path.join(repoRoot, "templates/opencode/opencode.json")),
  );
  writeText(opencodeConfigTarget, mergedOpenCodeConfig, options.dryRun);
  fileAction(actions, hadOpenCodeConfig ? "updated" : "created", opencodeConfigTarget);

  // Plugin directory
  const pluginTarget = path.join(targetRoot, "plugin");
  const hadPlugin = exists(pluginTarget);
  copyDir(path.join(repoRoot, "plugin"), pluginTarget, options.dryRun);
  fileAction(actions, hadPlugin ? "updated" : "created", pluginTarget);

  // Marketplace manifests
  const claudePluginTarget = path.join(targetRoot, ".claude-plugin");
  const hadClaudePlugin = exists(claudePluginTarget);
  copyDir(path.join(repoRoot, ".claude-plugin"), claudePluginTarget, options.dryRun);
  fileAction(actions, hadClaudePlugin ? "updated" : "created", claudePluginTarget);

  const codexPluginTarget = path.join(targetRoot, ".codex-plugin");
  const hadCodexPlugin = exists(codexPluginTarget);
  copyDir(path.join(repoRoot, ".codex-plugin"), codexPluginTarget, options.dryRun);
  fileAction(actions, hadCodexPlugin ? "updated" : "created", codexPluginTarget);

  return { targetRoot, actions };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage() + "\n");
      return;
    }

    const result = install(options);
    const mode = options.dryRun ? "Dry run complete" : "Import complete";
    process.stdout.write(`${mode}: ${result.targetRoot}\n`);
    for (const action of result.actions) {
      process.stdout.write(`- ${action.kind}: ${path.relative(result.targetRoot, action.target)}\n`);
    }
    process.stdout.write("\nNext steps:\n");
    process.stdout.write("- Claude Code: open the target project and read CLAUDE.md.\n");
    process.stdout.write("- OpenCode: open the target project and run /init if needed.\n");
    process.stdout.write("- Preflight: node .claude/bin/model-preflight.js --host opencode --model provider/model --text\n");
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n\n${usage()}\n`);
    process.exitCode = 1;
  }
}

main();
