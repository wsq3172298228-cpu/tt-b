/**
 * ui.js — Terminal UI utilities for tt-b CLI
 *
 * Provides colored output, progress indicators, and interactive prompts.
 */

const readline = require("readline");

// ─── ANSI Colors ───

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

// ─── Output Helpers ───

function ok(msg) {
  console.log(`${c.green}  ✓${c.reset} ${msg}`);
}

function fail(msg) {
  console.log(`${c.red}  ✗${c.reset} ${msg}`);
}

function warn(msg) {
  console.log(`${c.yellow}  !${c.reset} ${msg}`);
}

function info(msg) {
  console.log(`${c.dim}  ·${c.reset} ${msg}`);
}

function heading(msg) {
  console.log(`\n${c.bold}${c.cyan}${msg}${c.reset}`);
}

function subheading(msg) {
  console.log(`\n${c.bold}${msg}${c.reset}`);
}

function spacer() {
  console.log("");
}

// ─── Box Drawing ───

function box(lines, { title, color = c.cyan, padding = 1 } = {}) {
  const maxLen = Math.max(
    ...lines.map((l) => stripAnsi(l).length),
    title ? stripAnsi(title).length + 2 : 0
  );
  const width = maxLen + padding * 2 + 2;
  const top = title
    ? `${color}┌─ ${c.bold}${title}${c.reset}${color} ${"─".repeat(width - stripAnsi(title).length - 5)}┐${c.reset}`
    : `${color}${"─".repeat(width)}${c.reset}`;

  console.log(top);
  for (const line of lines) {
    const stripped = stripAnsi(line);
    const pad = " ".repeat(Math.max(0, maxLen - stripped.length + padding));
    console.log(`${color}│${c.reset} ${" ".repeat(padding)}${line}${pad}${color}│${c.reset}`);
  }
  console.log(`${color}${"─".repeat(width)}${c.reset}`);
}

// ─── Progress Spinner ───

class Spinner {
  constructor(text = "Working...") {
    this.text = text;
    this.frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    this.index = 0;
    this.interval = null;
    this.stream = process.stderr;
  }

  start(text) {
    if (text) this.text = text;
    this.index = 0;
    this.interval = setInterval(() => {
      this.stream.write(`\r${c.cyan}${this.frames[this.index]}${c.reset} ${this.text}`);
      this.index = (this.index + 1) % this.frames.length;
    }, 80);
    return this;
  }

  succeed(text) {
    this.stop();
    if (text) ok(text);
    return this;
  }

  fail(text) {
    this.stop();
    if (text) fail(text);
    return this;
  }

  warn(text) {
    this.stop();
    if (text) warn(text);
    return this;
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.stream.write("\r" + " ".repeat(this.text.length + 4) + "\r");
    }
    return this;
  }
}

// ─── Progress Bar ───

class ProgressBar {
  constructor(total, { label = "", width = 30 } = {}) {
    this.total = total;
    this.current = 0;
    this.label = label;
    this.width = width;
    this.stream = process.stderr;
  }

  update(current, text) {
    this.current = Math.min(current, this.total);
    const ratio = this.current / this.total;
    const filled = Math.round(this.width * ratio);
    const empty = this.width - filled;
    const bar = `${c.green}${"█".repeat(filled)}${c.dim}${"░".repeat(empty)}${c.reset}`;
    const pct = Math.round(ratio * 100);
    const label = this.label ? `${this.label} ` : "";

    this.stream.write(`\r  ${label}${bar} ${pct}%${text ? ` ${text}` : ""}`);

    if (this.current >= this.total) {
      this.stream.write("\n");
    }
  }

  done(text) {
    this.update(this.total, text);
  }
}

// ─── Interactive Prompts ───

async function prompt(question, { choices, default: defaultVal } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let promptText = `${c.bold}${question}${c.reset}`;
    if (choices) {
      promptText += "\n";
      choices.forEach((choice, i) => {
        const num = c.bold + (i + 1) + c.reset;
        const recommended = choice.recommended ? `  ${c.dim}← recommended${c.reset}` : "";
        promptText += `  ${num}  ${choice.label}${recommended}\n`;
      });
      promptText += `\n${c.bold}Choose [1-${choices.length}]:${c.reset} `;
    } else if (defaultVal) {
      promptText += ` ${c.dim}[${defaultVal}]${c.reset} `;
    } else {
      promptText += " ";
    }

    rl.question(promptText, (answer) => {
      rl.close();
      const trimmed = answer.trim();

      if (choices) {
        const idx = parseInt(trimmed, 10) - 1;
        if (idx >= 0 && idx < choices.length) {
          resolve(choices[idx].value);
        } else {
          resolve(null);
        }
      } else {
        resolve(trimmed || defaultVal || null);
      }
    });
  });
}

async function confirm(question, { default: defaultVal = false } = {}) {
  const suffix = defaultVal ? " [Y/n]" : " [y/N]";
  const answer = await prompt(question + suffix);
  if (!answer) return defaultVal;
  return /^y|yes$/i.test(answer);
}

// ─── Helpers ───

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function formatTable(rows, { headers, indent = 2 } = {}) {
  const allRows = headers ? [headers, ...rows] : rows;
  const colWidths = allRows[0].map((_, colIdx) =>
    Math.max(...allRows.map((row) => stripAnsi(String(row[colIdx] || "")).length))
  );

  const pad = " ".repeat(indent);
  const lines = [];

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const cells = row.map((cell, j) => {
      const str = String(cell || "");
      const visible = stripAnsi(str).length;
      return str + " ".repeat(colWidths[j] - visible);
    });
    lines.push(pad + cells.join("  "));

    if (headers && i === 0) {
      lines.push(pad + colWidths.map((w) => "─".repeat(w)).join("  "));
    }
  }

  return lines.join("\n");
}

module.exports = {
  c,
  ok,
  fail,
  warn,
  info,
  heading,
  subheading,
  spacer,
  box,
  Spinner,
  ProgressBar,
  prompt,
  confirm,
  stripAnsi,
  formatTable,
};
