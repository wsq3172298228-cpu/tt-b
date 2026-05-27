---
name: goal-ttb
description: "Dual-model adversarial goal loop: executor works autonomously, independent evaluator audits evidence until goal is provably achieved."
argument-hint: "<measurable goal condition>"
user-invocable: true
---

Achieve the following goal. Do not stop until an independent evaluator confirms the goal is provably met: $ARGUMENTS

## Core Architecture: Dual-Model Adversarial Loop

This skill implements a **two-role architecture** that eliminates "blind confidence" — the executor cannot judge its own success.

```
┌─────────────────────────────────────────────────────────────┐
│                    User: /goal-ttb <condition>               │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  1. EXECUTOR (You — full tool access)                        │
│     - Read/write files, run commands, search codebase        │
│     - Plan, execute, fix errors autonomously                 │
│     - Output all actions to transcript                       │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  2. TRANSCRIPT (Conversation history)                        │
│     - All tool calls, outputs, file diffs, test results      │
│     - The ONLY source of truth for evaluation                │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  3. EVALUATOR (Independent adversarial audit)                │
│     - Read-only access to transcript                         │
│     - No tool execution capability                           │
│     - Checks EVIDENCE, not CLAIMS                            │
│     - Catches deception (commented asserts, skipped tests)   │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
                 ┌──────────────────────────┐
                 │ Goal provably achieved?   │
                 └──────────────────────────┘
                          │         │
                         NO        YES
                          │         │
                          ▼         ▼
              ┌───────────────┐  ┌─────────────────┐
              │ Feedback Loop │  │ EXIT: Achieved   │
              │ (rejection    │  └─────────────────┘
              │  reason)      │
              └───────────────┘

## Step 1: Contract Definition

Parse the user's goal into a **Measurable Goal Contract**:

```
GOAL CONTRACT
─────────────
Goal: <restated goal>
Success Criteria:
  - [ ] <observable condition 1>
  - [ ] <observable condition 2>
  - ...
Evidence Required:
  - <what the evaluator needs to see in transcript>
Failure Modes:
  - <what would prove the goal is NOT met>
```

A good contract has **observability** — conditions that can be verified by reading terminal output, file diffs, or test results. Not subjective claims like "improved code quality."

**Examples of good contracts:**
- "All tests pass with exit code 0: `npm test` output shows 0 failures"
- "Build succeeds: `npm run build` exits cleanly with no errors"
- "Only target files modified: `git diff --name-only` shows only files in /src/services/"
- "No regressions: existing test suite still passes after changes"

**Examples of bad contracts:**
- "Code is clean and readable"
- "Performance is improved"
- "The feature works correctly"

## Step 2: Autonomous Iteration (Executor Mode)

You are now the **Executor**. You have full autonomy:

### Auto-Iteration Rules
- **Do NOT stop after each tool call.** Continue working until you believe the goal is met.
- **Fix errors as you encounter them.** If a test fails, debug and fix it. If a build breaks, repair it.
- **Track your progress** against the success criteria.
- **Run verification commands** before claiming completion.

### What You Must Do
1. Break the goal into executable phases
2. Execute each phase completely
3. Run the narrowest relevant verification after each change
4. If verification fails, diagnose and fix — do NOT proceed
5. When all phases complete, run the **full verification suite** (all success criteria)
6. Only then, declare "Goal attempt complete" and trigger evaluation

### What You Must NOT Do
- Claim success without running verification
- Skip tests or comment out assertions
- Ignore test failures
- Modify tests to make them pass (unless fixing the test itself is the goal)
- Stop before all success criteria are checked

## Step 3: Adversarial Audit (Evaluator Mode)

When you declare "Goal attempt complete," you must **switch to Evaluator mode** and audit yourself:

### Evaluator Checklist

Read through the entire transcript and check:

**Evidence Verification:**
- [ ] Did the executor run the verification commands?
- [ ] Do the terminal outputs show the expected results?
- [ ] Are there any error messages in the output?
- [ ] Did the executor fix all errors it encountered?

**Deception Detection:**
- [ ] Did the executor comment out any assertions?
- [ ] Did the executor skip any tests?
- [ ] Did the executor modify test expectations to match wrong behavior?
- [ ] Did the executor suppress error output?
- [ ] Did the executor claim success without evidence?

**Completeness Check:**
- [ ] Are ALL success criteria from the contract verified?
- [ ] Are there any criteria that were never checked?
- [ ] Did the executor handle edge cases mentioned in the goal?

**Regression Check:**
- [ ] Did existing tests still pass after changes?
- [ ] Were any unrelated files modified?
- [ ] Did the executor introduce new errors?

### Evaluator Decision

After the audit, make a clear decision:

**If ALL criteria pass with evidence:**
```
EVALUATOR VERDICT: ✅ ACHIEVED
Evidence:
  - [criterion 1]: Verified by [specific transcript reference]
  - [criterion 2]: Verified by [specific transcript reference]
  - ...
No deception detected. Goal is provably met.
→ EXIT
```

**If ANY criteria fail or lack evidence:**
```
EVALUATOR VERDICT: ❌ NOT ACHIEVED
Rejection Reasons:
  - [criterion 1]: FAILED — [specific issue with transcript evidence]
  - [criterion 2]: NO EVIDENCE — [what was missing]
  - [deception]: DETECTED — [specific example]
Continue working. Fix these issues:
  - [actionable instruction 1]
  - [actionable instruction 2]
→ CONTINUE LOOP
```

## Step 4: Feedback Loop

If the evaluator rejects:

1. **Read the rejection reasons carefully.** They are specific and actionable.
2. **Address each rejection reason.** Do not ignore any.
3. **Run verification again** after fixing.
4. **Re-evaluate** with the same adversarial rigor.

The loop continues until the evaluator gives a clean ✅ ACHIEVED verdict.

## Loop Control

- **Maximum iterations**: 10 full cycles (executor attempt + evaluator audit). If exceeded, escalate to user with what was accomplished and what failed.
- **User interrupt**: If user says "stop", "pause", or "cancel", conclude immediately with current progress.
- **Stall detection**: If 3 consecutive cycles produce no progress on the same rejection reason, escalate to user.
- **Scope creep**: If you discover the goal needs significantly more work, pause and confirm with user.

## Safety Rules

- Never edit secrets, credentials, `.env`, production keys, or deployment config unless explicitly required by the goal and confirmed by user.
- Never force-push, reset --hard, or delete branches.
- Never install new dependencies without user confirmation.
- Prefer small, reversible diffs.
- If a change would affect >5 files, pause and confirm with user.
- Never modify test expectations to match wrong behavior.

## Memory Integration

- Write goal contract to session state via `tt-b_memory_write` with `name: sessionState`
- Update progress after each executor phase
- Record evaluator verdicts and rejection reasons
- Move stable facts to knowledge graph when verified

## Example Usage

```bash
/goal-ttb All tests pass with exit code 0 in the auth module
/goal-ttb The /api/users endpoint returns 200 with valid JSON, verified by curl
/goal-ttb Refactor /src/services to use dependency injection, all existing tests still pass
/goal-ttb Add input validation to registration form, npm test exits 0, git diff shows only src/ changes
```

## Transcript Requirements

For the evaluator to work effectively, the transcript must contain:

1. **All tool calls** — every file read, write, bash command
2. **All tool outputs** — terminal output, file contents, error messages
3. **All file diffs** — what changed and where
4. **All test results** — pass/fail counts, specific failures
5. **Verification evidence** — the actual output of verification commands

**Do not summarize or omit tool outputs.** The evaluator needs raw evidence, not summaries.

## What This Does NOT Do

- Does not run indefinitely (max 10 evaluation cycles)
- Does not make architectural decisions without user input
- Does not deploy to production
- Does not modify CI/CD pipelines
- Does not change security-sensitive code without explicit approval
- Does not trust the executor's claims without evidence

If the goal requires any of these, the skill will pause and ask the user to confirm.
