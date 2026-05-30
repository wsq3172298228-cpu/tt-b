/**
 * done-check — Check if a task meets the GML Definition of Done.
 *
 * @param {object} opts
 * @param {object} opts.task — task status
 * @returns {{ done: boolean, missing: string[] }}
 */

function doneCheck({ task }) {
  const missing = [];

  if (!task || typeof task !== "object") {
    return { done: false, missing: ["No task provided"] };
  }

  if (!task.goalSatisfied) missing.push("User goal is not satisfied");
  if (!task.checksPassed) missing.push("Relevant checks/tests do not pass");
  if (!task.evidenceApproved) missing.push("Main Agent has not reviewed/approved the evidence");
  if (!task.risksStated) missing.push("Remaining risks are not explicitly stated to the user");
  if (task.unrelatedChanges) missing.push("Unrelated changes are included");
  if (task.orphanProcesses) missing.push("Orphan processes or temporary debug code remain");

  return { done: missing.length === 0, missing };
}

module.exports = doneCheck;
