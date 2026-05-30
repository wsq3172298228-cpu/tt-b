/**
 * takeover-check — Determine if the Main Agent should take over from a subagent.
 *
 * @param {object} opts
 * @param {object} opts.context — context about the subagent's output
 * @returns {{ shouldTakeover: boolean, reasons: string[] }}
 */

function takeoverCheck({ context }) {
  const reasons = [];

  if (!context || typeof context !== "object") {
    return { shouldTakeover: false, reasons: [] };
  }

  // Vague or unsupported conclusions
  if (context.vagueConclusion) {
    reasons.push("Subagent gave vague or unsupported conclusions");
  }

  // Missing evidence
  if (context.missingEvidence) {
    reasons.push("Evidence lacks file references, command results, or test output");
  }

  // Security-sensitive area
  if (context.securitySensitive) {
    reasons.push("Task touches auth, payments, permissions, production config, secrets, deployment, or data migration");
  }

  // Scope creep
  if (context.scopeChanged) {
    reasons.push("Subagent changed scope without permission");
  }

  // Test failures
  if (context.testsFailed) {
    reasons.push("Tests fail or are skipped without a concrete reason");
  }

  // Unverifiable result
  if (context.unverifiable) {
    reasons.push("The result cannot be independently verified");
  }

  return {
    shouldTakeover: reasons.length > 0,
    reasons,
  };
}

module.exports = takeoverCheck;
