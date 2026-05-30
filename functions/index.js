/**
 * functions/index — Barrel export for all tt-b memory capability functions.
 *
 * Usage:
 *   const { readMemory, searchMemory, extractNodes, ... } = require("./functions");
 *   // or
 *   const fn = require("./functions");
 *   fn.readMemory({ name: "knowledgeGraph", memoryMap, readText });
 */

module.exports = {
  // I/O layer
  createProvider: require("./provider"),
  loadConfig: require("./config"),

  // Memory CRUD
  readMemory: require("./read-memory"),
  writeMemory: require("./write-memory"),
  listMemory: require("./list-memory"),

  // Search & index
  searchMemory: require("./search-memory"),
  buildIndex: require("./build-index"),
  searchIndex: require("./search-index"),

  // Snapshot & diff
  snapshotMemory: require("./snapshot-memory"),
  restoreMemory: require("./restore-memory"),
  diffMemory: require("./diff-memory"),

  // Verification & health
  verifyMemory: require("./verify-memory"),
  healthCheck: require("./health-check"),

  // Knowledge graph
  extractNodes: require("./extract-nodes"),
  extractEdges: require("./extract-edges"),
  subgraphQuery: require("./subgraph-query"),
  createGraphStore: require("./graph-store"),

  // GML workflow tools
  workflowCheck: require("./workflow-check"),
  evidenceValidate: require("./evidence-validate"),
  takeoverCheck: require("./takeover-check"),
  doneCheck: require("./done-check"),
  delegateValidate: require("./delegate-validate"),
  capabilityRoute: require("./capability-route"),
  memoryRecover: require("./memory-recover"),
  graphExpand: require("./graph-expand"),

  // Code navigation tools
  filePointer: require("./file-pointer"),
};
