/**
 * evidence-validate — Validate an evidence report against the GML contract.
 *
 * @param {object} opts
 * @param {object} opts.evidence — the evidence report to validate
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */

const REQUIRED_FIELDS = [
  "filesInspected",
  "filesChanged",
  "commandsExecuted",
  "testsRun",
  "checkResults",
  "confidence",
  "summary",
];

const VALID_CONFIDENCE = ["High", "Medium", "Low"];

function evidenceValidate({ evidence }) {
  const errors = [];
  const warnings = [];

  if (!evidence || typeof evidence !== "object") {
    return { valid: false, errors: ["Evidence must be an object"], warnings: [] };
  }

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in evidence)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate arrays
  const arrayFields = ["filesInspected", "filesChanged", "commandsExecuted", "testsRun"];
  for (const field of arrayFields) {
    if (field in evidence && !Array.isArray(evidence[field])) {
      errors.push(`${field} must be an array`);
    }
  }

  // Validate confidence
  if (evidence.confidence && !VALID_CONFIDENCE.includes(evidence.confidence)) {
    errors.push(`confidence must be one of: ${VALID_CONFIDENCE.join(", ")}`);
  }

  // Validate summary
  if (evidence.summary && typeof evidence.summary === "string") {
    if (evidence.summary.length > 300) {
      warnings.push("Summary exceeds 300 characters; consider compressing");
    }
  }

  // Check for remaining risks
  if (!evidence.remainingRisks) {
    warnings.push("remainingRisks not specified; consider adding even if empty");
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = evidenceValidate;
