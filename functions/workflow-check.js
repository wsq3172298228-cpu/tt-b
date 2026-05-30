/**
 * workflow-check — Check if a task is non-trivial and return the GML steps to execute.
 *
 * @param {object} opts
 * @param {object} opts.task — task description
 * @returns {{ nonTrivial: boolean, steps: string[], reason: string }}
 */

function workflowCheck({ task }) {
  const reasons = [];

  if (task.fileCount > 1) reasons.push(`Modifies ${task.fileCount} files (>1)`);
  if (task.touchesBusinessLogic) reasons.push("Touches business logic, data models, or APIs");
  if (task.requiresDependencies) reasons.push("Requires external dependencies installation");
  if (task.securitySensitive) reasons.push("Involves security-sensitive configurations");

  const nonTrivial = reasons.length > 0;

  const steps = nonTrivial
    ? [
        "1. Restate & Define: Restate the user goal and define measurable success criteria.",
        "2. Inspect: Inspect the repository structure, existing tests, and conventions before editing.",
        "3. Plan: Create a phased, step-by-step plan.",
        "4. Delegate: Delegate focused subtasks to subagents.",
        "5. Execute in Parallel: Delegate focused subtasks to subagents when useful.",
        "6. Collect Evidence: Require evidence from every implementation, verification, review, or audit step.",
        "7. Audit: Perform second-pass audit before declaring success.",
        "8. Handle Anomalies: Take over if evidence is weak, failed, or off-scope.",
        "9. Context Management: Abort subagent if no output for 3 minutes.",
        "10. Fast Iteration: Prefer fast output, iterate rather than wait for perfection.",
        "11. Loop: Continue until the goal is complete or time is exhausted.",
      ]
    : ["Simple task: execute directly with minimal overhead."];

  return {
    nonTrivial,
    steps,
    reason: nonTrivial ? reasons.join("; ") : "Task is trivial (single file, no logic changes, no dependencies, no security concerns)",
  };
}

module.exports = workflowCheck;
