---
name: grill-me-ttb
description: Interview the user relentlessly about their goals, informed by project memory, until the plan is crystal clear. Updates knowledge graph and session state as understanding deepens.
argument-hint: "<topic or plan to grill on>"
user-invocable: true
---

Interview me relentlessly about: $ARGUMENTS

Purpose: stress-test my thinking, expose gaps, and reach a shared understanding — then update project memory with what we learned.

Steps:

1. **Load context first.**

   - Read `tt-b_memory_read` with `name: knowledgeGraph` to get what the project already knows.
   - Read `tt-b_memory_read` with `name: sessionState` to get the current execution cursor.
   - Identify what is already established vs. what is vague or missing.

2. **Build a question tree.**

   - From the topic and existing memory, derive a set of unresolved questions.
   - Organize them as a decision tree: each answer opens or closes branches.
   - Prioritize questions that unblock the most downstream decisions.

3. **Grill one question at a time.**

   - Ask exactly one question per turn.
   - For each question, provide your recommended answer and explain why.
   - If the question can be answered by exploring the codebase, explore it instead of asking.
   - Track which branches are resolved and which remain open.

4. **Challenge assumptions.**

   - If memory contains claims that conflict with the user's stated goal, call them out.
   - If the user's answer contradicts something in the knowledge graph, flag it explicitly.
   - Push for specificity: "what exactly do you mean by X?", "how would you verify Y?", "what's the failure mode?"

5. **Update memory as you go.**

   - After each confirmed answer, update the session state via `tt-b_memory_write` with `name: sessionState` to reflect the new understanding.
   - When a decision is stable and generalizable, move it to the knowledge graph via `tt-b_memory_write` with `name: knowledgeGraph`.
   - Record open questions, risks, and trade-offs discovered during the interview.

6. **Conclude when the tree is resolved.**
   - When all branches are closed or deferred with clear reasons, summarize:
     - What we confirmed
     - What we updated in memory
     - What remains open (and why it's deferred)
     - The next concrete action

Never fabricate memory entries. If the knowledge graph is empty, say so and start from scratch.

If the user says "stop" or "enough", conclude immediately with what has been established so far.
