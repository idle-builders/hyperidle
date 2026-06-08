## 12. What the Meta Layer Ships at This Layer

To be deployable for anyone (per the EXECUTION layer constraint), the meta layer ships:

1. **The five primitive object stores.** Bet, Task, Session, Team, Routine. SQLite by default; swappable. The schemas in §3 are the contracts.
2. **A small task scheduler** that watches dependency graphs and notifies owners when their tasks are unblocked. Not a workflow engine — a dependency-aware notifier.
3. **A routine scheduler** that fires calendar / event / heartbeat triggers and starts sessions for the right agents (with delegation logic).
4. **A handoff helper** — a small library that wraps the `handoff` tool call into structured handoff messages (context ID, status, reason, artifacts, remaining work) and ownership changes on the task. Writes to the thread and updates task state. Reusable across harnesses.
5. **A team formation helper** — given a product spec and the available agent pool, propose a team. Used by the assistant when bootstrapping a new product.
6. **Durability adapters** — pluggable wrappers around Temporal, Hatchet/Icepick, LangGraph checkpointers, and a no-op default. Skills declare which one they need.
7. **Decomposition helpers** — utility functions agents call to query their practice for "what tasks does this kind of bet typically involve?" Not a planner, just a knowledge query.
8. **WIP and cost meters** — observability and enforcement at agent / team / factory levels. Threshold breaches produce thread items.
9. **Retro templates** — markdown templates the Product Manager fills in at ship/kill, wired to route to Practice and the assistant thread.
10. **A small CLI** for inspecting bets, tasks, sessions, teams, and routines. Useful for headless deployers and for debugging.

Everything else is downstream of this. The meta layer's job is the primitives, the schedulers, the adapters, and the helpers — not the agent runtime, not the orchestration engine.

---
