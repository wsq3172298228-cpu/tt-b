#!/usr/bin/env node

/**
 * tt-b-stream-monitor.js — Stream Health Monitor & Circuit Breaker for Claude Code
 *
 * Wraps Claude Code CLI to monitor stdout streaming health.
 * If no output is received for超过 the idle timeout (default: 60s),
 * sends SIGINT to interrupt the process and optionally retries.
 *
 * Usage:
 *   tt-b-stream-monitor [claude-args...]
 *   tt-b-stream-monitor --timeout 60 --max-retries 3 -- [claude-args...]
 *
 * Environment:
 *   STREAM_TIMEOUT   - Idle timeout in seconds (default: 60)
 *   MAX_RETRIES      - Max retry attempts (default: 3)
 *   RETRY_DELAY      - Delay between retries in ms (default: 2000)
 *   LOG_FILE         - Optional log file path
 *   VERBOSE          - Enable verbose logging (1 = on)
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// ─── Configuration ──────────────────────────────────────────────────────────

const DEFAULTS = {
  timeout: 60,        // seconds
  maxRetries: 3,
  retryDelay: 2000,   // ms
  verbose: false,
  logFile: null,
};

const CONFIG_FILE = ".claude/stream-monitor.json";

function loadConfigFile() {
  // Try to find config file in current directory or project root
  const possiblePaths = [
    path.resolve(CONFIG_FILE),
    path.join(process.env.HOME || "", ".claude", "stream-monitor.json"),
  ];

  for (const configPath of possiblePaths) {
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, "utf8");
        const config = JSON.parse(content);
        return { config, path: configPath };
      }
    } catch {
      // Ignore parse errors
    }
  }

  return { config: {}, path: null };
}

function parseArgs(argv) {
  const args = argv.slice(2);

  // Load config from file first
  const { config: fileConfig, path: configPath } = loadConfigFile();
  const config = { ...DEFAULTS, ...fileConfig, claudeArgs: [] };

  if (configPath) {
    config._configFile = configPath;
  }

  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === "--timeout" && args[i + 1]) {
      config.timeout = parseInt(args[++i], 10);
    } else if (arg === "--max-retries" && args[i + 1]) {
      config.maxRetries = parseInt(args[++i], 10);
    } else if (arg === "--retry-delay" && args[i + 1]) {
      config.retryDelay = parseInt(args[++i], 10);
    } else if (arg === "--log" && args[i + 1]) {
      config.logFile = args[++i];
    } else if (arg === "--verbose" || arg === "-v") {
      config.verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--") {
      config.claudeArgs = args.slice(i + 1);
      break;
    } else {
      config.claudeArgs = args.slice(i);
      break;
    }
    i++;
  }

  // Override with env vars (highest priority)
  if (process.env.STREAM_TIMEOUT) {
    config.timeout = parseInt(process.env.STREAM_TIMEOUT, 10);
  }
  if (process.env.MAX_RETRIES) {
    config.maxRetries = parseInt(process.env.MAX_RETRIES, 10);
  }
  if (process.env.RETRY_DELAY) {
    config.retryDelay = parseInt(process.env.RETRY_DELAY, 10);
  }
  if (process.env.LOG_FILE) {
    config.logFile = process.env.LOG_FILE;
  }
  if (process.env.VERBOSE === "1") {
    config.verbose = true;
  }

  return config;
}

function printUsage() {
  console.log(`
tt-b-stream-monitor — Stream Health Monitor & Circuit Breaker for Claude Code

Usage:
  tt-b-stream-monitor [claude-args...]
  tt-b-stream-monitor --timeout 60 --max-retries 3 -- [claude-args...]

Options:
  --timeout <seconds>    Idle timeout in seconds (default: 60)
  --max-retries <n>      Max retry attempts (default: 3)
  --retry-delay <ms>     Delay between retries in ms (default: 2000)
  --log <file>           Log file path
  --verbose, -v          Enable verbose logging
  --help, -h             Show this help

Configuration File:
  Reads .claude/stream-monitor.json if present. Example:
  {
    "timeout": 60,
    "maxRetries": 3,
    "retryDelay": 2000,
    "verbose": false,
    "logFile": null
  }

  Priority: Command-line args > Environment vars > Config file > Defaults

Environment:
  STREAM_TIMEOUT         Override timeout (seconds)
  MAX_RETRIES            Override max retries
  RETRY_DELAY            Override retry delay (ms)
  LOG_FILE               Override log file path
  VERBOSE                Set to "1" for verbose output

Examples:
  # Monitor with default 60s timeout (reads config from .claude/stream-monitor.json)
  tt-b-stream --prompt "Hello"

  # Custom timeout and retries
  tt-b-stream --timeout 120 --max-retries 5 -- --prompt "Hello"

  # With logging
  tt-b-stream --log /tmp/claude-monitor.log -- --prompt "Hello"
`);
}

// ─── Logger ──────────────────────────────────────────────────────────────────

class Logger {
  constructor(config) {
    this.config = config;
    this.logFile = config.logFile ? path.resolve(config.logFile) : null;
  }

  _timestamp() {
    return new Date().toISOString();
  }

  _write(level, msg, data) {
    const entry = {
      timestamp: this._timestamp(),
      level,
      message: msg,
      ...data,
    };

    const line = JSON.stringify(entry);

    if (this.config.verbose) {
      const color = level === "ERROR" ? "\x1b[31m" : level === "WARN" ? "\x1b[33m" : "\x1b[36m";
      console.error(`${color}[${level}]\x1b[0m ${msg}`, data ? JSON.stringify(data) : "");
    }

    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, line + "\n");
      } catch {
        // Ignore log write errors
      }
    }
  }

  info(msg, data) {
    this._write("INFO", msg, data);
  }

  warn(msg, data) {
    this._write("WARN", msg, data);
  }

  error(msg, data) {
    this._write("ERROR", msg, data);
  }

  debug(msg, data) {
    if (this.config.verbose) {
      this._write("DEBUG", msg, data);
    }
  }
}

// ─── Stream Monitor ──────────────────────────────────────────────────────────

class StreamMonitor {
  constructor(config) {
    this.config = config;
    this.logger = new Logger(config);
    this.process = null;
    this.lastOutputTime = Date.now();
    this.timeoutTimer = null;
    this.retryCount = 0;
    this.totalTokens = 0;
    this.outputBuffer = [];
    this.isInterrupted = false;
  }

  findClaudeExecutable() {
    // Try to find claude executable
    const possiblePaths = [
      "claude",
      "/usr/local/bin/claude",
      "/opt/homebrew/bin/claude",
      path.join(process.env.HOME || "", ".local/bin/claude"),
    ];

    for (const p of possiblePaths) {
      try {
        const { execSync } = require("child_process");
        execSync(`which ${p}`, { stdio: "ignore" });
        return p;
      } catch {
        continue;
      }
    }

    return "claude"; // Fallback, let PATH resolve it
  }

  start() {
    const claudePath = this.findClaudeExecutable();
    const args = [...this.config.claudeArgs];

    this.logger.info("Starting Claude Code with stream monitoring", {
      claudePath,
      args,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      configFile: this.config._configFile || "none",
    });

    this._spawnProcess(claudePath, args);
  }

  _spawnProcess(claudePath, args) {
    this.lastOutputTime = Date.now();
    this.isInterrupted = false;

    this.process = spawn(claudePath, args, {
      stdio: ["inherit", "pipe", "pipe"],
      env: {
        ...process.env,
        // Force non-interactive mode for better streaming control
        TERM: "dumb",
      },
    });

    this._attachStreams();
    this._startTimeoutWatchdog();
    this._attachExitHandler();
  }

  _attachStreams() {
    // Monitor stdout
    this.process.stdout.on("data", (chunk) => {
      this._onOutput(chunk, "stdout");
    });

    // Monitor stderr
    this.process.stderr.on("data", (chunk) => {
      this._onOutput(chunk, "stderr");
    });

    // Forward stdout to parent process
    this.process.stdout.pipe(process.stdout);

    // Forward stderr to parent process
    this.process.stderr.pipe(process.stderr);
  }

  _onOutput(chunk, stream) {
    this.lastOutputTime = Date.now();
    this.totalTokens += chunk.length;

    this.logger.debug(`Output received (${stream})`, {
      bytes: chunk.length,
      totalBytes: this.totalTokens,
    });

    // Reset timeout watchdog
    this._resetTimeoutWatchdog();
  }

  _startTimeoutWatchdog() {
    this._resetTimeoutWatchdog();
  }

  _resetTimeoutWatchdog() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
    }

    const timeoutMs = this.config.timeout * 1000;

    this.timeoutTimer = setTimeout(() => {
      this._onTimeout();
    }, timeoutMs);

    this.logger.debug(`Timeout watchdog reset to ${this.config.timeout}s`);
  }

  _onTimeout() {
    if (this.isInterrupted) return;

    this.isInterrupted = true;
    const idleSeconds = this.config.timeout;

    this.logger.error("Stream timeout triggered — no output received", {
      idleSeconds,
      retryCount: this.retryCount,
      maxRetries: this.config.maxRetries,
    });

    // Send SIGINT to interrupt the process
    this._interruptProcess();

    // Check if we should retry
    if (this.retryCount < this.config.maxRetries) {
      this.retryCount++;
      this.logger.info(`Retrying in ${this.config.retryDelay}ms (attempt ${this.retryCount}/${this.config.maxRetries})`);

      setTimeout(() => {
        this._retry();
      }, this.config.retryDelay);
    } else {
      this.logger.error("Max retries exceeded, giving up", {
        totalRetries: this.retryCount,
      });

      // Output error summary
      this._outputErrorSummary("Max retries exceeded. Possible reasoning loop or network hang.");

      process.exit(1);
    }
  }

  _interruptProcess() {
    if (!this.process || this.process.killed) return;

    this.logger.warn("Sending SIGINT to Claude Code process", {
      pid: this.process.pid,
    });

    try {
      // Try to send SIGINT to the process group
      process.kill(-this.process.pid, "SIGINT");
    } catch {
      try {
        // Fallback: send directly to process
        this.process.kill("SIGINT");
      } catch (err) {
        this.logger.error("Failed to send SIGINT", { error: err.message });
      }
    }
  }

  _retry() {
    if (this.process && !this.process.killed) {
      this.process.kill("SIGTERM");
    }

    const claudePath = this.findClaudeExecutable();
    const args = [...this.config.claudeArgs];

    this.logger.info("Retrying Claude Code process", {
      attempt: this.retryCount,
    });

    this._spawnProcess(claudePath, args);
  }

  _attachExitHandler() {
    this.process.on("exit", (code, signal) => {
      this.logger.info("Claude Code process exited", {
        code,
        signal,
        totalBytes: this.totalTokens,
        retries: this.retryCount,
      });

      if (this.timeoutTimer) {
        clearTimeout(this.timeoutTimer);
      }

      // If process exited normally, we're done
      if (code === 0 && !this.isInterrupted) {
        this.logger.info("Stream completed successfully", {
          totalBytes: this.totalTokens,
        });
        process.exit(0);
      }

      // If interrupted by timeout and no more retries
      if (this.isInterrupted && this.retryCount >= this.config.maxRetries) {
        this._outputErrorSummary("Process interrupted after max retries.");
        process.exit(1);
      }

      // If interrupted by user (Ctrl+C), exit cleanly
      if (signal === "SIGINT") {
        this.logger.info("User interrupted, exiting cleanly");
        process.exit(0);
      }
    });

    this.process.on("error", (err) => {
      this.logger.error("Failed to start Claude Code process", {
        error: err.message,
      });

      this._outputErrorSummary(`Failed to start Claude Code: ${err.message}`);
      process.exit(1);
    });
  }

  _outputErrorSummary(reason) {
    const summary = {
      error: "Stream Timeout & Circuit Breaker",
      reason,
      details: {
        timeout: `${this.config.timeout}s`,
        retries: `${this.retryCount}/${this.config.maxRetries}`,
        totalBytes: this.totalTokens,
        lastOutput: new Date(this.lastOutputTime).toISOString(),
      },
      suggestion: "The AI process may be in a reasoning loop or experiencing network issues.",
    };

    console.error("\n" + "=".repeat(60));
    console.error("🔴 STREAM TIMEOUT & CIRCUIT BREAKER");
    console.error("=".repeat(60));
    console.error(JSON.stringify(summary, null, 2));
    console.error("=".repeat(60) + "\n");
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const config = parseArgs(process.argv);

  // Check if claude is available
  const monitor = new StreamMonitor(config);

  // Handle graceful shutdown
  const shutdown = (signal) => {
    monitor.logger.info(`Received ${signal}, shutting down`);
    if (monitor.process && !monitor.process.killed) {
      monitor.process.kill(signal);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Handle uncaught exceptions
  process.on("uncaughtException", (err) => {
    monitor.logger.error("Uncaught exception", { error: err.message });
    monitor._outputErrorSummary(`Uncaught exception: ${err.message}`);
    process.exit(1);
  });

  monitor.start();
}

main();
