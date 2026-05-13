/**
 * plugin/preflight — Model preflight detection and capability classification.
 *
 * Standalone version that does not depend on the CLI helper script.
 * Can be called directly from Node.js code.
 */

const fs = require("fs");
const path = require("path");

function parseCliModel(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === "--model" || current === "-m") {
      return firstValue([argv[i + 1]]);
    }
    if (current.startsWith("--model=")) {
      return firstValue([current.slice("--model=".length)]);
    }
    if (current.startsWith("-m=")) {
      return firstValue([current.slice(3)]);
    }
    if (current === "-c" || current === "--config") {
      const next = firstValue([argv[i + 1]]);
      const match = next.match(/model\s*=\s*["']?([^"']+)["']?/);
      if (match) return firstValue([match[1]]);
    }
  }
  return "";
}

function firstValue(items) {
  for (const item of items) {
    if (item && String(item).trim()) return String(item).trim();
  }
  return "";
}

function detectHost(argv) {
  const explicit = firstValue([
    argv.includes("--host") ? argv[argv.indexOf("--host") + 1] : "",
    argv.find((item) => item.startsWith("--host="))?.split("=", 2)[1],
  ]);
  if (explicit) return explicit;

  if (process.env.CLAUDE_CODE || process.env.CLAUDECODE || process.env.CLAUDE_MODEL) return "claude-code-cli";
  if (process.env.CODEX_HOME || process.env.CODEX_MODEL) return "codex";
  if (process.env.OPENCODE_HOME || process.env.OPENCODE_MODEL) return "opencode";
  return "unknown";
}

function detectModel(argv, host) {
  const argModel = parseCliModel(argv);
  if (argModel) return { model: argModel, source: "cli-arg" };

  const envModel = firstValue([
    process.env.AI_MODEL, process.env.AGENT_MODEL, process.env.MODEL,
    process.env.CLAUDE_MODEL, process.env.CODEX_MODEL, process.env.OPENCODE_MODEL,
  ]);
  if (envModel) return { model: envModel, source: "env" };

  return { model: "unknown", source: "unknown" };
}

function classifyCapability(model) {
  const value = String(model || "").toLowerCase();

  if (/gpt-5\.5|claude-opus|\bopus\b|o3/.test(value)) {
    return { capability: "architect_orchestrator", startupMode: "restore-plan-delegate-verify-update-memory" };
  }
  if (/minimax|m2\.7|m2-7|sonnet|codex/.test(value)) {
    return { capability: "engineering_executor", startupMode: "read-edit-test-report" };
  }
  if (/haiku|mini|spark|fast/.test(value)) {
    return { capability: "reader_or_tester", startupMode: "bounded-readonly-or-test" };
  }
  return { capability: "unknown", startupMode: "safe_probe" };
}

function preflight(argv) {
  const host = detectHost(argv || []);
  const detected = detectModel(argv || [], host);
  const cap = classifyCapability(detected.model);

  return {
    host,
    model: detected.model,
    source: detected.source,
    capability: cap.capability,
    startupMode: cap.startupMode,
    memory: {
      knowledgeGraph: ".claude/memory/knowledge-graph.md",
      sessionState: ".claude/memory/session-state.md",
    },
  };
}

module.exports = { preflight, detectHost, detectModel, classifyCapability };
