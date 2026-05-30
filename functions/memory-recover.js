/**
 * memory-recover — Execute memory recovery protocol.
 *
 * Reads memory files and returns a structured recovery report.
 *
 * @param {object} opts
 * @param {object} opts.readText — file reader
 * @param {object} opts.memoryMap — memory file paths
 * @returns {{ recovered: boolean, graph: object, cursor: object, warnings: string[] }}
 */

function memoryRecover({ readText, memoryMap }) {
  const warnings = [];

  // Read knowledge graph
  const kgContent = readText(memoryMap.knowledgeGraph);
  if (!kgContent) {
    warnings.push("knowledge-graph.md not found or empty");
  }

  // Read session state
  const ssContent = readText(memoryMap.sessionState);
  if (!ssContent) {
    warnings.push("session-state.md not found or empty");
  }

  // Parse session state for cursor
  const cursor = {};
  if (ssContent) {
    const goalMatch = ssContent.match(/Goal:\s*(.+)/i);
    if (goalMatch) cursor.goal = goalMatch[1].trim();

    const statusMatch = ssContent.match(/Status:\s*(.+)/i);
    if (statusMatch) cursor.status = statusMatch[1].trim();

    const branchMatch = ssContent.match(/Active branch:\s*(.+)/i);
    if (branchMatch) cursor.branch = branchMatch[1].trim();

    const nextMatch = ssContent.match(/Next concrete action:\s*(.+)/i);
    if (nextMatch) cursor.nextAction = nextMatch[1].trim();
  }

  // Parse knowledge graph for key entities
  const graph = { domains: [], modules: [], files: [] };
  if (kgContent) {
    const domainMatches = kgContent.matchAll(/### Domain:\s*(.+)/g);
    for (const m of domainMatches) graph.domains.push(m[1].trim());

    const moduleMatches = kgContent.matchAll(/### Module:\s*(.+)/g);
    for (const m of moduleMatches) graph.modules.push(m[1].trim());

    const fileMatches = kgContent.matchAll(/### File:\s*`?([^`\n]+)`?/g);
    for (const m of fileMatches) graph.files.push(m[1].trim());
  }

  return {
    recovered: warnings.length === 0,
    graph,
    cursor,
    warnings,
    memoryRoot: ".claude/memory/",
    instructions: [
      "Treat memory as a map, not source of truth.",
      "Verify important claims against actual code before editing.",
      "Update memory when code contradicts previous assumptions.",
      "Add new nodes/edges after meaningful work.",
      "Record decisions, risks, and verification results.",
    ],
  };
}

module.exports = memoryRecover;
