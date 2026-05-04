## 1. Why a Dedicated Process Layer

Most agent demos in 2026 fall apart at exactly this layer. They ship a single agent doing a single task, or they ship a multi-agent demo that runs for one cycle and never picks up where it left off. They have no story for *teams that persist*, *bets that change*, *recurring work that has memory*, or *how an agent decides what task to pick up next*.

The two failure modes the field has seen:

- **Workflow-engine thinking.** Treat the factory as a DAG of nodes. Every transition is wired in advance. Adding a new step means editing the graph. Agents become DAG executors, not employees. This collapses the moment reality stops looking like the graph.
- **Free-form agent thinking.** No structure at all. Agents are spawned, told to "work on the bet," and given everything. They duplicate work, contradict each other, never know when to stop, and burn cost without producing artifacts.

The 2026 ecosystem has converged on a middle path that this doc adopts: **decentralized handoffs over a shared substrate, with explicit unit primitives and explicit done conditions**. LangGraph Swarm, OpenAI Agents SDK, AG2 Swarm, Claude Subagents, Devin's planner-executor split, Replit Agent 4's parallel task graph — they all rest on the same insight. The model decides when to hand off; the system tracks state and survives crashes; the work has a beginning, a middle, and a known end.

We add three things to this consensus that the ecosystem hasn't fully figured out:

1. **Teams are bound to products, not bets.** They persist. Successive bets pass through the same team and the team accumulates muscle memory.
2. **Decomposition is decentralized and practice-grounded.** There is no central planner. Each agent uses knowledge from its practice (L3) to infer the tasks in its work stream.
3. **Change is first-class, not exceptional.** Bets are *meant* to change as the team learns. Top-down direction and bottom-up learning meet at the bet, not at a planning meeting.

---
