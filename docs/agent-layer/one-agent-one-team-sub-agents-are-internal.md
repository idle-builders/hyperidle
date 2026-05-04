## 5. One Agent, One Team — Sub-Agents Are Internal

An agent belongs to exactly one team (or is central). No multi-team membership. This keeps identity clean, context unambiguous, and scheduling simple: every session loads one product's L2, one team's context, no ambiguity.

When a product team needs expertise it doesn't have on roster, the answer is **cross-team tasks** (see `PROCESS_LAYER.md` §8.5) — a chat thread to the providing team, a task on the requesting bet, the providing agent does the work. Not multi-team membership.

### 5.1 Sub-agents within a session

An "agent" in the factory's sense is one identity, one workspace, one team — the unit the meta layer sees and schedules. But *inside a session*, an agent can spawn sub-agents to parallelize or specialize work. A Builder might spin up a security review sub-agent, a test-writing sub-agent, and a code-review sub-agent within a single session, using Claude SDK subagents or equivalent harness-level primitives.

The meta layer does not see sub-agents. They are internal to the session, the way functions are internal to a program. Sub-agents share the session's workspace, the session's cost budget, and the session's context. When the session ends, sub-agents end. Their work is part of the parent session's output.

This means:
- **Specialist capabilities** (security review, accessibility audit, brand-voice check) are packaged as skills that the agent invokes, possibly via sub-agents — not as separate top-level agents the factory manages.
- **The team roster stays small.** A product team is 3–6 agents, not 15. Specialization happens inside sessions, not at the org chart level.
- **Cost tracking is per session.** Sub-agent token spend rolls up into the parent session's cost. The factory doesn't need a separate cost line per sub-agent.
- **Session cost flows to Artifacts.** When a session produces an Artifact (Artifact primitive, `HUMAN_INTERFACE_LAYER.md` §4.5), the session's cost contributes to the Artifact's `cost_from_session` field. The Artifact, not the session, is the surface where Work and Conversations consumers see "what this output cost." The session remains the cost-tracking unit; the Artifact is the consumer-facing projection.

---
