# Track Y: Knowledge Evolution

Improvements to the knowledge architecture, validated against what actually exists. Each package addresses a genuine gap — not a reimagining of infrastructure that already works.

**Constraint — what exists, do not rebuild.** Auto-promotion sweep, stale detection (90-day decay), attention scoring (8 signals, 2 stubbed), structural contradiction detection, conflict resolution, the practice meeting, the builtin knowledge routines, the session review creator, the full event system, CRUD with WYSIWYG editing, FTS search, access logging and edit logging. This track builds on that foundation, not beside it.

**Shipped.** Y4 (knowledge triage improvements) is merged.

**Note on vocabulary.** The legacy specs below were written against the kernel/strategy split, which no longer exists — the strategy layer was purged and rituals moved to plugins. Re-read each package's placement before building; the gap each names is still real, the layer names are not.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| Y1 | Temporal knowledge validity: when a fact became true and when it was superseded, with time-windowed queries | backend | M | — | unbuilt — carried from the legacy track file. The `version` column tracks edit count, not temporal validity; the stale sweep's 90-day window is blunt; the current version is always the only version, so nobody can ask "what was true in March?" **Constraint:** supersession is a link, not a copy — no content duplication. Superseded items are excluded from search by default so history does not bloat results, with an explicit opt-in. |
| Y2 | Knowledge consolidation & autonomous learning: consolidate learnings from agent sessions into team knowledge and from team knowledge into factory principles, without manual curation | backend | L | — | unbuilt — carried from the legacy track file. Knowledge flows upward only when an agent explicitly calls `write_memory` and a facilitator manually curates the result. If three agents independently discover the same pattern, nothing recognises the repetition and promotes it. Without this, knowledge accumulates but does not compound. All the infrastructure it needs already exists. |
| Y3 | Self-evolution of experience: agents discover reusable patterns, propose them as skills, adopt validated skills, and refine their own prompts | backend | L | — | unbuilt — carried from the legacy track file. An agent's capabilities are frozen at creation — a prompt and a harness, and that is it. A learning captured via `write_memory` sits in the knowledge base and never flows back into the agent's prompt or skills, so every agent starts every bet at the skill level it had on day one. |
| Y5 | Agent write governance: rate limits on agent writes and anomaly detection on unusual mutations | backend | M | — | unbuilt — carried from the legacy track file. Attention scoring governs knowledge *quality*; nothing governs agent *behaviour* — how often, how much, how unusually an agent writes. As Y2 and Y3 add autonomy, a single agent in a loop could write hundreds of items an hour and bury real insight, with manual cleanup as the only defence. Sequence it with, not after, the autonomy it guards. |
| Y6 | Knowledge graph linking: inline `[[wiki-link]]` references between items, plus a backlinks view | backend/frontend | M | — | unbuilt — carried from the legacy track file. Items are islands connected only by topic matching and manually curated related-item lists. Agents cannot follow connections to discover related context, and discovery depends entirely on search quality and topic-naming consistency. |
| Y7 | Cost intelligence & efficiency learning: analyse spending patterns, predict task costs, and identify which knowledge and agent configurations are most cost-efficient | backend | L | — | unbuilt — carried from the legacy track file. Detailed per-bet, per-agent and per-team cost data is already collected and caps are enforced, but none of it improves future performance — the cost sentinel watches for overruns and never learns from patterns. Cost management stays reactive (cap → overage → alert) instead of proactive. |

## Dependency graph

- No package here declares a hard dependency; all six are buildable against what is already on `main`.
- Value ordering, not a blocking chain: `Y2` and `Y3` are the compounding-knowledge pair, and `Y5` is the safety rail they need — do not ship autonomy far ahead of governance.
- `Y1` (temporal validity) sharpens what `Y2` consolidates *from*; building Y1 first makes Y2's supersession decisions cleaner, but Y2 does not require it.
- `Y6` and `Y7` are independent of the rest and of each other.
- Cross-track: `AC6` (`.pipeline/AC.md`) feeds outcome data into knowledge relevance and un-stubs two of the eight attention signals — related to Y2's compounding goal, but a separate package under a separate track.
