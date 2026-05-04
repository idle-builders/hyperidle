## 9. Decisions

### Resolved

- **TOON format specification.** Using the existing TOON spec at [github.com/toon-format/toon](https://github.com/toon-format/toon). ~40% token savings over JSON for structured agent context packs.
- **Practice "meeting" mechanics.** Three-turn conversation: (1) all agents propose findings, (2) all agents react with context and relevance, (3) Practice Facilitator synthesizes — routing items to practice L3 or product L2 as appropriate. Not all findings become practice knowledge.
- **Session note quality.** No rigid template. LLMs write good prose; what matters is flight-level guidance on what to write about (goal, outcome, changes, next steps, hazards). The skill package provides defaults; the meta layer doesn't parse notes structurally.
- **Context compaction detection.** Continuous session notes throughout the session (agent writes to `work/session-notes.md` as it works). Pre-compaction trigger where the harness supports it (part of the Harness Adapter contract). Token-counting heuristic as fallback.
- **Hot-reload for skills.** Next session picks it up. No mid-session propagation needed.
- **Desktop shell.** Web-first. No Tauri, no PWA wrapper. Plain web app served by the API process. Native apps or PWA can be added later if needed.
- **Mobile strategy.** Start online-first with a responsive web app. No dedicated native app or offline-first PWA in v1.
- **Canvas (bet placement) tech.** Simple symbolic UI — not an actual canvas or drag-and-drop zone. A two-column layout (shaped / committed) with a hard capacity cap, rendered as `BetCard`s. Standard React components, no canvas library needed.
- **Scheduler architecture.** Single-process (Bun event loop). API server and Scheduler share one process. Materialization and session-start calls run as async tasks so the event loop isn't blocked. **Scaling note:** if measured latency degrades under load, extract Scheduler to its own process communicating via Event Bus. Monitor for this.
- **No external framework integrations in the meta layer.** No Letta, no Agent Mail, no Temporal, no Inngest. All agentic integrations happen through the Agent Runtime layer (Harness Adapters). The meta layer stays minimal: SQLite, TypeScript/Bun, the Knowledge Fabric, and the Hono API. Complex dependencies are avoided as long as possible.
- **Laptop minimum install.** Bun + Docker + Claude API key. 10-minute install bar for anyone.
- **Cross-product routine ownership.** Chief of Staff owns routines that observe patterns across products (e.g., portfolio-level Cost Sentinel).
- **Knowledge Fabric sync.** Continuous writeback via file watcher is the v1 design — no session-boundary dependency. The file watcher on `knowledge/` and `work/` directories writes back changes incrementally (500ms debounce), with WebSocket push to open Knowledge view tabs. See KNOWLEDGE_ARCHITECTURE.md §5.
- **Notifications.** TBD during development. Will need some notification adapter; specific technology (ntfy.sh, SMTP, push API) decided at implementation time.
- **Cost hierarchy: agent < team < factory.** Strictly nested. Each level has a configurable cost cap (default: daily cycle). When a team cap is reached, the team stops. When the factory cap is reached, everything stops. Critical ops tasks finish in-progress sessions but cannot start new ones. Smart defaults: equal splits across agents. See PROCESS_LAYER.md §10.
- **Autonomy: per-agent-per-skill.** Each agent–skill combination has its own autonomy level (L1–L4). Effectively per-team-per-skill since the same skill in different products needs different oversight. Tracked in `agent_skills` table.
- **Task dependencies: hold state.** Tasks with unmet upstream dependencies go to `hold`. The Dependency Watcher auto-transitions to `accepted` when upstream clears. Distinct from `blocked` (runtime blocks). See PROCESS_LAYER.md §6.1.
- **Knowledge layer precedence: L4 > L3 > L2 > L1.** Higher layers are more absolute. Contradictions between layers are flagged at materialization time. See KNOWLEDGE_ARCHITECTURE.md §6.3.
- **Edit log for facilitator learning.** Every human edit logged in `knowledge_edit_log`. Serves as training signal for improving facilitator proposals over time.
- **A2A-inspired handoff protocol.** Structured handoff messages with context IDs, task states (working/completed/failed/canceled), reason codes, and artifact references. JSON format for all inter-agent communication; TOON reserved for context packs. See PROCESS_LAYER.md §8.
- **Attention scores: Rail & notifications, not Knowledge view.** The Knowledge view provides access to all knowledge. Attention scores drive what surfaces in the Rail and what triggers notifications — they don't filter the Knowledge view.
- **Facilitators are not a SPOF.** Practice facilitation is an async self-improvement knowledge loop. It never interferes with normal task execution. If a facilitator is down or slow, agents keep working — they just don't get new practice updates until the next materialization.
- **Knowledge misses are acceptable.** Agents will miss relevant knowledge sometimes. This is a feature, not a bug — it's part of how new approaches are discovered. The system optimizes for relevance at materialization time but doesn't guarantee completeness.
- **Paused routines when cost cap hit.** When a cost cap is reached, the heartbeat won't trigger for paused routines — they're simply skipped until the budget resets.
- **PostgreSQL as SQLite alternative.** SQLite is the default. PostgreSQL must be ready as an alternative for deployments that exceed SQLite's comfort zone (~50 concurrent writers, or when WAL mode write throughput becomes a bottleneck). **Scaling threshold:** when the factory has >50 agents with overlapping sessions, or when the Knowledge Fabric's continuous writeback creates sustained >100 writes/sec, switch to PostgreSQL. The same schema applies; the adapter pattern in the Primitive Store extends to `knowledge_items`.

### Deferred — Decide During Development

- **Heartbeat granularity for routines.** Minimum resolution roughly hourly, not sub-minute. Exact granularity determined during implementation.
- **Daytona Custom Regions.** Parked. Relevant when addressing self-hosted deployment profiles, not before.

---

*This document captures how the system is built — the companion REQUIREMENTS.md captures what it must do.*
