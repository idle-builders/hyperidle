## 13. What This Layer Is Not

To prevent scope creep:

- **Not a workflow engine.** No DAGs. Sequences emerge from task dependencies and handoffs, not from a graph editor.
- **Not a project tracker.** Tasks have state, but the goal is *agents finishing work*, not human stakeholders watching progress. The Rail is the human view. <!-- @lore AD8a: historical — Rail removed in U6 -->
- **Not a backlog.** Pitches are on the canvas; tasks are inside committed bets; nothing accumulates in a "later" pile.
- **Not a planner.** Decomposition is decentralized and lives with the team members. The assistant is not a central planner.
- **Not the agent runtime.** Sessions execute on whatever harness the deployer chose. We coordinate them; we don't run them.
- **Not the durability substrate.** We adapt to Temporal/Hatchet/etc.; we don't reimplement them.
- **Not Jira.** If someone asks "where are the sprint reports," we've lost.

---
