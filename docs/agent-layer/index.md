# AGENT LAYER

# Agent Layer — v1.0

How agents are defined, staffed, and composed. This doc covers agent identity, the three types of agents (team, strategy, and individual), how agents scale with product lifecycle, and how the model-routing and cost model works.

For how agents *work together* (teams, tasks, sessions, handoffs), see `PROCESS_LAYER.md`.
For what agents *know* (five knowledge layers, memory, practices), see `KNOWLEDGE_ARCHITECTURE.md`.
For how agents *meet humans* (the Factory app — Conversations, Work, Knowledge), see `HUMAN_INTERFACE_LAYER.md`.
For where agents *run* (harnesses, workspaces, skills, durability), see `RESEARCH_EXECUTION_LAYER.md`.

> **Vocabulary note (Thread primitive — see HUMAN_INTERFACE_LAYER.md §4.5).** Where this doc uses phrases like "review thread", "chat thread", or "assistant thread", the structural reality is a single Thread primitive — a container attached to exactly one host (bet, task, knowledge item, artifact, agent, user) carrying typed messages (plain / review / questionnaire). Agents and humans participate in the same matrix of threads — an agent initiating a thread to a founder uses the same primitive a founder uses to initiate a thread to an agent. The assistant thread is a *configuration* (host = user, pinned) of that primitive, not a separate concept. Skill-change reviews land as a *review message* on a thread attached to the proposed change; cross-team tasks (`PROCESS_LAYER.md` §8.5) carry a thread attached to the cross-team task itself.

---

---

## Sections

- [Principles](./principles.md)
- [Agent Structure](./agent-structure.md)
- [Agent Identity](./agent-identity.md)
- [The Three Types](./the-two-categories.md)
- [Lifecycle Scaling](./lifecycle-scaling.md)
- [One Agent, One Team — Sub-Agents Are Internal](./one-agent-one-team-sub-agents-are-internal.md)
- [Model Routing and Cost](./model-routing-and-cost.md)
- [Harness Capability Descriptor](./harness-capability-descriptor.md)
- [Founder Responsibility Routing](./founder-responsibility-routing.md)
- [What This Document Does Not Cover](./what-this-document-does-not-cover.md)
- [Harness error taxonomy](./harness-error-taxonomy.md)
- [Return-Gate Enforcement](./return-gate-enforcement.md)
- [Harness Coverage Enforcement](./harness-coverage-enforcement.md)
