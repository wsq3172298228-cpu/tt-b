#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function firstValue(items) {
  for (const item of items) {
    if (item && String(item).trim()) {
      return String(item).trim();
    }
  }
  return "";
}

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
    if (current.startsWith("-c=") || current.startsWith("--config=")) {
      const config = current.slice(current.indexOf("=") + 1);
      const match = config.match(/model\s*=\s*["']?([^"']+)["']?/);
      if (match) return firstValue([match[1]]);
    }
  }
  return "";
}

function parseJsonModel(filePath) {
  const text = readFile(filePath);
  if (!text) return "";
  try {
    const data = JSON.parse(text);
    return firstValue([data && data.model]);
  } catch {
    return "";
  }
}

function parseTomlModel(filePath) {
  const text = readFile(filePath);
  if (!text) return "";
  const match = text.match(/^\s*model\s*=\s*["']([^"']+)["']\s*$/m);
  return match ? firstValue([match[1]]) : "";
}

function detectHost(argv) {
  const explicit = firstValue([
    argv.includes("--host") ? argv[argv.indexOf("--host") + 1] : "",
    argv.find((item) => item.startsWith("--host="))?.split("=", 2)[1],
  ]);
  if (explicit) return explicit;

  if (process.env.CLAUDE_CODE || process.env.CLAUDECODE || process.env.CLAUDE_MODEL) {
    return "claude-code-cli";
  }
  if (process.env.CODEX_HOME || process.env.CODEX_MODEL) {
    return "codex";
  }
  if (process.env.OPENCODE_HOME || process.env.OPENCODE_MODEL) {
    return "opencode";
  }
  return "unknown";
}

function candidateFiles(host) {
  if (host === "claude-code-cli") {
    return [
      path.join(process.cwd(), ".claude/settings.local.json"),
      path.join(process.cwd(), ".claude/settings.json"),
      path.join(process.env.HOME || "", ".claude/settings.local.json"),
      path.join(process.env.HOME || "", ".claude/settings.json"),
    ];
  }

  if (host === "codex") {
    return [
      path.join(process.cwd(), ".codex/config.toml"),
      path.join(process.env.HOME || "", ".codex/config.toml"),
      path.join(process.env.HOME || "", ".codex/config.json"),
    ];
  }

  if (host === "opencode") {
    return [
      path.join(process.cwd(), ".opencode/config.json"),
      path.join(process.cwd(), ".opencode.json"),
      path.join(process.env.HOME || "", ".config/opencode/config.json"),
      path.join(process.env.HOME || "", ".opencode.json"),
    ];
  }

  return [
    path.join(process.cwd(), ".claude/settings.local.json"),
    path.join(process.cwd(), ".claude/settings.json"),
    path.join(process.cwd(), ".codex/config.toml"),
    path.join(process.cwd(), ".opencode/config.json"),
  ];
}

function detectModelFromFiles(host) {
  for (const filePath of candidateFiles(host)) {
    const jsonModel = parseJsonModel(filePath);
    if (jsonModel) {
      return { model: jsonModel, source: `file:${filePath}` };
    }
    const tomlModel = parseTomlModel(filePath);
    if (tomlModel) {
      return { model: tomlModel, source: `file:${filePath}` };
    }
  }
  return { model: "", source: "" };
}

function detectModel(argv, host) {
  const argModel = parseCliModel(argv);
  if (argModel) return { model: argModel, source: "cli-arg" };

  const envModel = firstValue([
    process.env.AI_MODEL,
    process.env.AGENT_MODEL,
    process.env.MODEL,
    process.env.CLAUDE_MODEL,
    process.env.CODEX_MODEL,
    process.env.OPENCODE_MODEL,
  ]);
  if (envModel) return { model: envModel, source: "env" };

  const fileModel = detectModelFromFiles(host);
  if (fileModel.model) return fileModel;

  return { model: "unknown", source: "unknown" };
}

function classifyCapability(model) {
  const value = String(model || "").toLowerCase();

  if (/gpt-5\.5|claude-opus|\bopus\b|o3/.test(value)) {
    return {
      capability: "architect_orchestrator",
      startupMode: "restore-plan-delegate-verify-update-memory",
    };
  }

  if (/minimax|m2\.7|m2-7|sonnet|codex/.test(value)) {
    return {
      capability: "engineering_executor",
      startupMode: "read-edit-test-report",
    };
  }

  if (/haiku|mini|spark|fast/.test(value)) {
    return {
      capability: "reader_or_tester",
      startupMode: "bounded-readonly-or-test",
    };
  }

  return {
    capability: "unknown",
    startupMode: "safe_probe",
  };
}

function main() {
  const argv = process.argv.slice(2);
  const host = detectHost(argv);
  const detected = detectModel(argv, host);
  const capability = classifyCapability(detected.model);

  const result = {
    host,
    model: detected.model,
    source: detected.source,
    capability: capability.capability,
    startupMode: capability.startupMode,
    memory: {
      knowledgeGraph: ".claude/memory/knowledge-graph.md",
      sessionState: ".claude/memory/session-state.md",
    },
  };

  if (argv.includes("--text")) {
    process.stdout.write(
      [
        `Host: ${result.host}`,
        `Model: ${result.model}`,
        `Source: ${result.source}`,
        `Capability: ${result.capability}`,
        `Startup mode: ${result.startupMode}`,
      ].join("\n") + "\n",
    );
    return;
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main();
