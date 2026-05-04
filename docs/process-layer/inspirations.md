## 15. Inspirations

**For decentralized handoff coordination:** LangGraph Swarm, OpenAI Agents SDK handoffs, AG2 Swarm, Anthropic Claude Subagents. The shared insight: handoff beats supervision for non-trivial multi-agent work.

**For durable execution:** Temporal (the canonical implementation), Restate (transactional Virtual Objects), Hatchet/Icepick (zero-cost durability for agents), LangGraph Platform's managed checkpointers, Trigger.dev v3's checkpoint-resume.

**For session-bounded long-running work:** Devin's planner-executor split with incremental progress sessions, Cursor Background Agents' fresh-VM-per-run model, Replit Agent 3/4's parallel task graph.

**For sleep-time agents and memory continuity:** Letta's sleep-time agents and shared-memory primary/background pattern, Claude Agent SDK's initializer + coding agent split.

**For team formation and persistence:** real flat-company team patterns, Shape Up's "small team for the cycle" (which we extend to "small team for the product"), Basecamp's team-per-product norm.

**For decentralized practice-grounded decomposition:** the way actual high-functioning specialist teams plan together, Toyota Production System's "the people doing the work design the work," Agile's notion that the team estimates not the manager.

**For recurring routines on stateful identities:** Claude Code `/loop` and `/schedule`, Hermes Agent cron, Temporal schedules, Inngest cron + AgentKit.

**For top-down + bottom-up flow:** how knowledge moves in successful flat companies, the "leading from any chair" pattern, Shape Up's appetite-and-pitches dialogue between shapers and builders.

**For WIP and cost discipline:** Kanban's WIP limits (the entire field of which we shamelessly borrow), prepaid-credit cost models from the agent ops space (AgentPatch, etc.), classical FinOps practices applied to LLM spend.

**Critiques that shaped what we *don't* build:** centralized-planner failure modes (CrewAI hierarchical), workflow-DAG rigidity, Crew-per-task amnesia (throwing away muscle memory after every cycle), unbounded parallelism with no caps, silent rate-limiting that hides failures.
