/**
 * capability-route — Return execution strategy based on model capability.
 *
 * @param {object} opts
 * @param {string} opts.capability — capability class from preflight
 * @returns {{ mode: string, behaviors: string[], restrictions: string[] }}
 */

const ROUTES = {
  architect_orchestrator: {
    mode: "restore-plan-delegate-verify-update-memory",
    behaviors: [
      "Read project memory",
      "Inspect repo state",
      "Verify graph facts against code",
      "Plan before editing",
      "Delegate bounded work when helpful",
      "Review risks",
      "Update project memory after meaningful work",
    ],
    restrictions: [],
  },
  engineering_executor: {
    mode: "read-edit-test-report",
    behaviors: [
      "Read the task slice",
      "Edit only within scope",
      "Run tests after changes",
      "Report failures with concrete evidence",
    ],
    restrictions: [
      "Do not rewrite long-term architecture unless explicitly assigned",
    ],
  },
  reader_or_tester: {
    mode: "bounded-readonly-or-test",
    behaviors: [
      "Read files and analyze",
      "Run targeted verification",
      "Report findings",
    ],
    restrictions: [
      "Do not modify files",
      "Stay within assigned investigation scope",
    ],
  },
  unknown: {
    mode: "safe_probe",
    behaviors: [
      "Stay read-only until model can be confirmed",
      "Do not assume capability from host name alone",
    ],
    restrictions: [
      "Do not modify files",
      "Do not install dependencies",
      "Default to safe probe mode",
    ],
  },
};

function capabilityRoute({ capability }) {
  return ROUTES[capability] || ROUTES.unknown;
}

module.exports = capabilityRoute;
