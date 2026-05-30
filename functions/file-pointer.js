/**
 * file-pointer — AST-based file pointer for surgical code navigation.
 *
 * Parses code into structured sections, allowing AI to focus on
 * specific functions/classes/regions without reading the entire file.
 *
 * Supports: JavaScript, TypeScript, Python, JSON, Markdown
 */

const fs = require("fs");
const path = require("path");

// Simple regex-based "AST" for common patterns
// (Full AST parsing would require language-specific parsers)

const JS_PATTERNS = {
  functions: /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g,
  arrowFunctions: /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
  classes: /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{/g,
  methods: /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g,
  imports: /(?:import|require)\s*[\({]([^)}\n]+)/g,
  exports: /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g,
};

const PYTHON_PATTERNS = {
  functions: /def\s+(\w+)\s*\([^)]*\)\s*(?:->[^:]+)?:/g,
  classes: /class\s+(\w+)(?:\([^)]*\))?\s*:/g,
  imports: /(?:from\s+\S+\s+)?import\s+(.+)/g,
};

const MARKDOWN_PATTERNS = {
  headings: /^(#{1,6})\s+(.+)$/gm,
};

/**
 * Parse file and return structured sections.
 *
 * @param {object} opts
 * @param {string} opts.filePath — absolute or relative path
 * @param {string} [opts.focus] — function/class name to focus on
 * @param {number} [opts.contextLines=5] — lines of context around focus
 * @param {string} [opts.language] — override language detection
 * @returns {{ structure: object, sections: object[], focusContent: string|null }
 */
function filePointer({ filePath, focus, contextLines = 5, language }) {
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    return { error: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(absPath, "utf8");
  const lines = content.split("\n");
  const lang = language || detectLanguage(filePath);
  const patterns = getPatterns(lang);

  // Build structure map
  const structure = {
    file: filePath,
    language: lang,
    totalLines: lines.length,
    sizeBytes: Buffer.byteLength(content, "utf8"),
    sections: [],
  };

  // Extract sections
  for (const [type, pattern] of Object.entries(patterns)) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;

      structure.sections.push({
        type: type.replace(/s$/, ""), // Remove plural
        name: match[1] || match[2] || "anonymous",
        line: lineNumber,
        endLine: findEndLine(lines, lineNumber),
      });
    }
  }

  // Sort sections by line number
  structure.sections.sort((a, b) => a.line - b.line);

  // If focus specified, extract that section
  let focusContent = null;
  if (focus) {
    const section = structure.sections.find(
      (s) => s.name === focus || s.name.toLowerCase() === focus.toLowerCase()
    );

    if (section) {
      const startLine = Math.max(0, section.line - contextLines - 1);
      const endLine = Math.min(lines.length, section.endLine + contextLines);
      focusContent = lines.slice(startLine, endLine).join("\n");
      structure.focusedSection = section;
    } else {
      // Try to find by partial match
      const partialMatch = structure.sections.find(
        (s) => s.name.includes(focus) || focus.includes(s.name)
      );
      if (partialMatch) {
        const startLine = Math.max(0, partialMatch.line - contextLines - 1);
        const endLine = Math.min(lines.length, partialMatch.endLine + contextLines);
        focusContent = lines.slice(startLine, endLine).join("\n");
        structure.focusedSection = partialMatch;
      }
    }
  }

  return {
    structure,
    focusContent,
    tip: focus
      ? `Focused on: ${focus}`
      : "Use 'focus' parameter to zoom into a specific function or class",
  };
}

function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".py": "python",
    ".json": "json",
    ".md": "markdown",
  };
  return map[ext] || "text";
}

function getPatterns(lang) {
  switch (lang) {
    case "javascript":
    case "typescript":
      return JS_PATTERNS;
    case "python":
      return PYTHON_PATTERNS;
    case "markdown":
      return MARKDOWN_PATTERNS;
    default:
      return {};
  }
}

function findEndLine(lines, startLine) {
  // Simple heuristic: find matching closing brace
  let depth = 0;
  for (let i = startLine - 1; i < lines.length; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === "{") depth++;
      if (char === "}") depth--;
    }
    if (depth === 0 && i > startLine - 1) {
      return i + 1;
    }
  }
  return Math.min(startLine + 50, lines.length); // Fallback
}

module.exports = filePointer;
