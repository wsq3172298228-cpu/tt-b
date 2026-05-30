/**
 * delegate-validate — Validate a task delegation prompt.
 *
 * @param {object} opts
 * @param {object} opts.delegation — the delegation prompt
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */

function delegateValidate({ delegation }) {
  const errors = [];
  const warnings = [];

  if (!delegation || typeof delegation !== "object") {
    return { valid: false, errors: ["Delegation must be an object"], warnings: [] };
  }

  // Required fields
  if (!delegation.objective) {
    errors.push("Missing objective: Clear, single-sentence description of the outcome");
  } else if (typeof delegation.objective === "string" && delegation.objective.length > 200) {
    warnings.push("Objective exceeds 200 characters; consider simplifying");
  }

  if (!delegation.scope) {
    errors.push("Missing scope: Explicit list of files/directories allowed to be modified");
  } else if (Array.isArray(delegation.scope) && delegation.scope.length === 0) {
    warnings.push("Scope is empty; subagent will have implicit deny-all");
  }

  if (!delegation.constraints) {
    warnings.push("Constraints not specified; consider adding what NOT to do");
  }

  if (!delegation.expectedOutput) {
    warnings.push("ExpectedOutput not specified; subagent may not know the required format");
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = delegateValidate;
