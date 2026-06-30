# Track Y: Knowledge Evolution

Improvements to HyperIdle's knowledge architecture, validated against what actually exists in the codebase. Each workpackage addresses a genuine gap — not a reimagining of infrastructure that already works. The existing knowledge system (5-layer hierarchy, promotion pipeline with 5+ cross-scope threshold, attention scoring with 8 signals, practice meetings with 3-turn consolidation, stale sweep, conflict resolution, event-driven handlers, materialization with relevance scoring) is substantial. This track builds on that foundation, not beside it.

**What exists (do not rebuild):** Auto-promotion sweep (AC2-AC5 gates), stale detection (90-day decay), attention scoring (8 signals, 2 stubbed), structural contradiction detection, conflict resolution, practice meeting (turns 1-3), 5 builtin routines (cost sentinel, practice meeting, post-bet retro, portfolio retro, knowledge decay), session review creator, full event system (23 types, 7 handlers), CRUD with WYSIWYG editing, FTS search, access logging, edit logging.

**Constraint:** The kernel/strategy separation (O2) is sacred. New fields must land in the correct table. `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### Y1 — Temporal Knowledge Validity

**Workpackage.** As a team whose knowledge evolves, I want to understand when facts became true and when they were superseded — so that agents don't hallucinate from stale data and facilitators can trace how the team's understanding changed over time.

**Why this matters.** When a team changes its deployment practice from "use gzip" to "use brotli," the old practice doesn't disappear — it was true for 6 months. Without temporal validity, an agent loading knowledge can't distinguish "current truth" from "former truth." The founder loses the ability to understand how the team's knowledge evolved. The cost of NOT building this: agents may act on stale knowledge that the stale sweep hasn't caught yet (the 90-day window is blunt), and the team can't answer "what did we believe in March?" — a question that matters for retros, audits, and debugging decisions.

**What exists today.** The `version` column tracks optimistic concurrency (edit count, not temporal validity). The `knowledgeEditLog` records every field change with timestamps. The stale sweep marks items inactive after 90 days. Access logs track read frequency. But there's no way to ask "what was true in March?" — the current version is always the only version.

**What's genuinely missing.** Temporal validity markers (when a fact became true, when it was superseded), a supersession model (linking old→new), time-windowed queries, and a way for users and agents to explore knowledge history without bloating day-to-day search.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Knowledge items track when they became valid and when they were superseded, without duplicating content — supersession is a link, not a copy.
- A user or agent can query knowledge as of a specific date, seeing only items that were valid at that point. Day-to-day queries (no date specified) return only current-valid items — same behavior as today.
- Superseded items are excluded from search by default so history doesn't bloat results. Users can opt in to include superseded items when needed.
- A user viewing a superseded knowledge item understands that it's been replaced and can navigate to the replacement.
- A user or facilitator can browse the history of a knowledge topic — seeing how the team's understanding evolved over time through the supersession chain.
- Not all knowledge is time-bound — long-lived principles keep no expiry indefinitely. Temporal versioning is opt-in per supersession event, not forced on every edit.

**Validation scenarios.**
- Given a deployment practice that was "use gzip" from January to March and then "use brotli" from March onward, when queried as of February, then "use gzip" appears and "use brotli" does not.
- Given a long-lived principle with no supersession, when 2 years pass, then it remains valid.
- Given a search for "deployment," when superseded items exist, then they are excluded by default but includable on demand.
- Given a user viewing the superseded "use gzip" item, then they understand it's been replaced and can navigate to "use brotli."

**Plan calls.** Standard architecture pass. The concept pass should reconcile temporal validity with the existing stale sweep (stale = unused, superseded = replaced — different signals). The design pass should address how users browse history and how the supersession chain is navigated in the UI.

**Contracts / constraints.**
- Temporal validity fields are kernel (structural, stable).
- Migration: existing items remain valid (no forced expiry).
- History data is only produced/queryable when explicitly requested — no bloat in normal operations.

**Out of scope.**
- Temporal graph traversal (following multi-hop supersession chains).
- Automatic supersession detection (Y2 consolidation may trigger supersession).
- Bulk "knowledge base as of date X" snapshot view.

**Effort.** M (~6h)

---

### Y2 — Knowledge Consolidation & Autonomous Learning

**Workpackage.** As a factory that compounds knowledge, I want the system to autonomously consolidate learnings — from individual agent sessions into team knowledge, and from team knowledge into factory principles — so that the knowledge base improves without requiring humans to manually curate every observation.

**Why this matters.** Today, knowledge flows upward only when agents explicitly call `write_memory` and facilitators manually curate the results. If an agent discovers something valuable but doesn't explicitly capture it, the learning is lost. If three agents independently discover the same pattern, there's no automatic mechanism to recognize the repetition and promote it. The founder's vision — that the company gets smarter with every session — requires autonomous consolidation. The cost of NOT building this: knowledge accumulates but doesn't compound. The same mistakes repeat across sessions because learnings stay siloed in individual agent contexts.

**What exists today.** Practice meeting (turns 1-3 — the facilitator IS an AI agent and can run all three turns, but the synthesis quality and autonomous triggering may need improvement). Auto-promotion sweep (5+ cross-scope repetitions). Stale sweep (90-day decay). Structural contradiction detection via `meta.forbids`/`meta.claims`. Session-review-creator (fires on session_ended for medium/high risk). Post-bet-retro and portfolio-retro routines. Agents can write knowledge during sessions via `write_memory`. The routine scheduler supports calendar, heartbeat, and event triggers.

**What's genuinely missing.**
1. **Individual agent learning across sessions:** Agents start each session fresh. There's no mechanism for an agent to accumulate personal learnings that persist across sessions and eventually surface to the team.
2. **Harness dreaming boundary enforcement:** Claude, Hermes, and other harnesses now have their own "dreaming" features. HyperIdle needs to enforce — in the harness adapter and strategy layer, not just documentation — what the harness handles vs what the factory handles. Overlapping consolidation wastes tokens and creates contradictions.
3. **Cross-team semantic pattern detection:** The promotion pipeline counts cross-scope repetitions by structural signature (layer + topic + kind) but doesn't semantically cluster related items across teams. Two items about the same concept with different wording won't match.
4. **Synthesis quality:** The practice meeting infrastructure exists but the synthesis prompts and quality evaluation for turn 3 may need work — this is an architecture pass question, not a new system.

**Depends on.** None. All infrastructure exists.

**Complexity.** L

**Acceptance criteria.**
- Each agent accumulates personal learnings (knowledge items scoped to the agent's user) where session-end observations persist across sessions. A periodic routine reviews these and proposes promotions to team-level knowledge when patterns recur.
- The harness adapter layer enforces the dreaming boundary: when configuring a session for a harness that supports its own dreaming (e.g., Claude Managed Agents), the adapter provides factory-level knowledge context but prevents the factory from duplicating the harness's session-level memory consolidation.
- When items from 2+ teams share semantically overlapping content (not just identical topic strings), the Chief of Staff routine generates candidate L4 (factory) knowledge items with status `needs_human`.
- Practice meeting synthesis quality is validated: the turn 3 output produces structured, actionable knowledge items — not freeform summaries. The architecture pass should evaluate and improve the synthesis prompt.
- Consolidation runs are idempotent — running twice on unchanged data produces no new proposals.
- All LLM calls during consolidation are cost-capped per run.

**Validation scenarios.**
- Given agent Builder-1 has logged "always chunk file uploads" in 4 separate sessions, when the personal learning review runs, then a proposal to promote this to team-level knowledge appears in the facilitator queue.
- Given team A and team B both have L3 practices about file chunking (different wording, same concept), when the portfolio-retro runs with semantic matching, then a candidate L4 principle is generated.
- Given a harness that supports dreaming (e.g., Claude Managed Agents), when HyperIdle configures the session, then the adapter enforces the boundary — no duplicate consolidation.
- Given a consolidation routine that already processed this week's sessions, when it runs again with no new data, then no new proposals are created.

**Plan calls.** Concept work needed on "Consolidation" — distinguishing harness dreaming from factory consolidation at the adapter layer. Architecture pass should design: the personal learning space model, the semantic clustering mechanism (FTS vs embeddings), the harness dreaming boundary enforcement in the adapter interface, and evaluate/improve the practice meeting synthesis prompt.

**Contracts / constraints.**
- Personal learning items use the existing knowledge_items table with scope_kind="user" — no new table.
- L4 candidates always require human validation.
- Harness dreaming boundary is enforced in the adapter layer (code), not just documented.
- Autonomous synthesis uses the existing practice meeting infrastructure — no new consolidation system.

**Out of scope.**
- Real-time consolidation during sessions.
- Semantic contradiction detection beyond structural heuristics.
- Cross-factory consolidation.

**Effort.** L (~5d)

---

### Y3 — Self-Evolution of Experience

**Workpackage.** As a team of agents that gets better over time, I want agents to evolve their own experience — discovering reusable patterns, proposing them as skills, adopting validated skills from the factory, and refining their own soul prompts — so that the team's capabilities compound across bets instead of staying frozen at whatever a human initially configured.

**Why this matters.** Today, an agent's capabilities are frozen at creation: a founder writes a soul prompt, assigns a harness, and that's it. If the agent learns that "always chunk file uploads" is critical, that learning dies with the session unless the agent explicitly calls `write_memory`. Even then, the learning sits in the knowledge base — it never flows back into the agent's prompt or skills. The cost of NOT building this: every agent starts every bet at the same skill level it had on day one. The team's muscle memory doesn't compound. This is the opposite of the vision — persistent teams that get better over time.

**What exists today.** Skills are 14 hardcoded TypeScript tool definitions. `userSkills` table tracks per-agent autonomy and success/failure but doesn't control runtime behavior. Soul prompts are inline in DB, founder-editable only. Agents write knowledge via `write_memory`. The design vision (RESEARCH_EXECUTION_LAYER.md §3) says knowledge can inform skills, but the promotion from knowledge to operational skill is "a deliberate, human-approved leap" — and that leap has no mechanism today.

**What's genuinely missing.** The loop from validated knowledge → operational skill → agent adoption doesn't close. Agents can't propose "this should become a skill" or "my soul prompt should include this." Skills and knowledge are entirely separate systems.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- Agents can propose instructional skills (markdown guidance, not executable code) through the existing knowledge pipeline — skills are knowledge items with a specific kind, using the same storage, scoring, promotion, and materialization as other knowledge.
- When a skill-kind knowledge item reaches active status, it becomes eligible for materialization into agent sessions, selected by the same relevance scoring that governs other knowledge.
- Agents can propose soul prompt adjustments — a proposed change with rationale enters the facilitator queue with `needs_human` status. Soul prompt changes always require human approval (User Sovereignty).
- The factory→agent adoption loop closes automatically: when a skill is promoted to L3 (practice community level), agents in that community receive it via materialization without manual assignment.
- Humans can manually assign skills to specific agents or teams by scoping them appropriately.

**Validation scenarios.**
- Given a builder agent discovers a reusable file-chunking pattern, when it proposes this as a skill via the knowledge pipeline, then the item enters the facilitator's attention queue for review.
- Given an active skill scoped to team A, when a session is provisioned for a team A agent, then the skill is materialized into the workspace alongside other knowledge.
- Given an agent proposes a soul prompt adjustment, when a human reviews it, then they can approve (updating the prompt) or reject.
- Given a skill promoted to L3 (practice community: "build"), when any builder agent starts a session, then the skill appears in their context automatically.

**Plan calls.** Concept work needed: "Instructional Skill" as a knowledge kind (not a new primitive), and "Experience Update" as a proposal mechanism for soul prompt evolution. Architecture pass should design: the kind="skill" materialization path, the proposal mechanism, the approval→soul prompt update flow, and how instructional skills relate to the existing hardcoded tool definitions.

**Contracts / constraints.**
- Instructional skills are knowledge items, not TypeScript tool definitions. Both systems coexist.
- Skill bodies are plain markdown — no executable code.
- Soul prompt updates always require human approval.

**Out of scope.**
- Automatic skill generation from session traces (Y2 handles learning extraction).
- Executable skill plugins.
- Runtime tool registration (adding new TypeScript tool definitions dynamically).

**Effort.** L (~5d)

---

### Y4 — Knowledge Triage Improvements

**Workpackage.** As a human reviewing knowledge, I want the triage workflow to surface the items most needing my judgment first — ordered by attention score — with a clear count of pending items, so that I spend my limited review time on what matters most and can process items efficiently.

**Why this matters.** The triage tab exists and filters by `status=draft`, but it doesn't use attention scores for ordering — a critical governance insight buried in a long list looks the same as a trivial draft. The founder's review time is the scarcest resource in a human+AI team. Every minute spent on low-priority items is a minute not spent on high-impact decisions. The cost of NOT building this: the founder either reviews everything (wasteful) or skips triage entirely (dangerous, as high-impact items go unreviewed).

**What exists today.** KnowledgeList has a "Triage" tab filtering items with `status=draft`. Attention scoring computes 8 signals per item and stores scores in the strategy fabric. The attention engine creates review items when scores exceed thresholds. CRUD, WYSIWYG editing, and merge/split operations all work.

**What's genuinely missing.** The triage tab doesn't sort by attention score. There's no `needs_human` status filter (items flagged by facilitators for human review). No count badge showing pending items. No way to process items rapidly without mouse navigation.

**Depends on.** None.

**Complexity.** S

**Acceptance criteria.**
- The triage workflow surfaces items most needing human judgment first, ordered by attention score — the most impactful, conflicting, or taste-sensitive items appear at the top.
- Items flagged as `needs_human` by facilitators or consolidation routines (Y2) are included in triage alongside `draft` items.
- A human reviewing knowledge can see at a glance how many items need their attention without navigating to the triage view.
- A reviewer can process items rapidly — validating, rejecting, or deferring without friction.

**Validation scenarios.**
- Given 10 items in triage with varying attention scores, when the triage view loads, then the highest-attention item appears first.
- Given 3 items pending triage, when the sidebar renders, then the count is visible without clicking into the knowledge section.
- Given a reviewer validates an item, then the next item is immediately visible without manual navigation.

**Plan calls.** Architecture pass only — this is a refinement of the existing triage tab, not a new feature. The design pass should evaluate whether the existing triage tab UI needs adjustment for attention-score ordering and rapid processing.

**Contracts / constraints.**
- Uses the existing KnowledgeList triage tab — refinement, not replacement.
- Server-side ordering by attention score.

**Out of scope.**
- Review assignment (routing items to specific humans).
- AI-assisted authoring during review.
- Batch operations.

**Effort.** S (~3h)

---

### Y5 — Agent Write Governance

**Workpackage.** As a factory operator, I want to prevent a malfunctioning agent from flooding or corrupting the knowledge base — through rate limits on agent writes and anomaly detection on unusual mutations — so that autonomous knowledge curation has safety rails.

**Why this matters.** As agents gain more autonomy (Y2 consolidation, Y3 skill proposals), the risk of a malfunctioning or misconfigured agent corrupting shared knowledge increases. A single agent in a loop could write hundreds of knowledge items per hour, flooding the facilitator queue and burying real insights. The existing attention scoring governs knowledge quality, but nothing governs agent behavior — how often, how much, and how unusually an agent writes. The cost of NOT building this: a single bad session can pollute the knowledge base, and the only defense is manual cleanup after the damage.

**What exists today.** Attention scoring flags items for human review when scores exceed thresholds. Conflict resolution handles concurrent edits. The `knowledgeEditLog` tracks every mutation with editor identity. Cost caps (C7) limit session spending. Taste-sensitive classification marks items requiring human judgment.

**What's genuinely missing.** No per-agent rate limiting on knowledge writes. No anomaly detection (unusual size, burst writes, scope escalation). No agent trust signal. Existing governance is about knowledge quality — this adds governance for agent behavior.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Agent knowledge writes are rate-limited — an agent exceeding a configurable threshold per hour is blocked from further writes and an alert surfaces for review.
- Statistically unusual mutations are flagged: items much larger than an agent's norm, non-facilitator agents writing to factory scope, or burst writes in a short window.
- Each agent builds a trust signal over time based on its track record (validated vs rejected contributions). Low-trust agents have their contributions flagged automatically.
- New agents start at a neutral trust level — they can build trust through validated contributions, not through volume.
- Governance is deterministic — no LLM calls, fast enough to run inline on every write.

**Validation scenarios.**
- Given an agent that has written 50 knowledge items this hour, when it attempts the 51st, then the write is blocked and an alert surfaces.
- Given an agent that normally writes 200-word items writing a 10,000-word item, then an anomaly alert is created.
- Given an agent with mostly validated contributions, then its trust signal is high and contributions flow normally.
- Given a new agent with zero history, then it starts at neutral trust — neither flagged nor privileged.

**Plan calls.** Architecture pass should design: the rate limiter implementation, the anomaly heuristics (thresholds, baselines), the trust signal formula, and how governance alerts integrate with the existing attention scoring engine.

**Contracts / constraints.**
- Trust signals are strategy-layer computed values.
- Rate limits apply to agent writes only — human writes are never rate-limited.
- Governance alerts flag for review — they don't terminate sessions.

**Out of scope.**
- Automatic agent suspension based on trust score.
- Per-fact (block-level) provenance — item-level edit log suffices for v1.
- Knowledge rollback.

**Effort.** M (~4h)

---

### Y6 — Knowledge Graph Linking

**Workpackage.** As a human or agent navigating the knowledge base, I want to reference other knowledge items inline using `[[wiki-link]]` syntax and see what links to the current item — so that related knowledge is discoverable through connections, not just search or topic grouping.

**Why this matters.** Today, knowledge items are islands connected only by topic-matching and manually curated related-items lists. If a deployment practice references a security policy, that relationship exists only in the reader's head — not in the system. Agents can't follow connections to discover related context. Facilitators can't see which items form clusters of related knowledge. The cost of NOT building this: knowledge grows but connections between items don't — the knowledge base becomes a flat pile instead of a graph. Discovery depends entirely on search quality and topic naming consistency.

**What exists today.** BacklinksCard in KnowledgeDetail shows explicitly curated related items + topic-based auto-grouping. Standard markdown links work for external URLs. Block derivation produces deterministic block IDs. FTS search exists for keyword discovery.

**What's genuinely missing.** `[[wiki-link]]` syntax for inline cross-referencing between knowledge items, automatic backlink discovery (which items reference this one), and broken link detection.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Knowledge item bodies support `[[Item Title]]` wiki-link syntax that creates navigable references to other knowledge items. Both humans and agents can create links by simply writing the syntax.
- A user viewing a knowledge item can see which other items reference it — connections are bidirectional even though links are written in one direction.
- Broken links (referencing a title that doesn't exist) are visually distinct so users can fix them.
- Links are derived from body content — they can be recomputed from the source text at any time without data loss.

**Validation scenarios.**
- Given item A contains `[[Deployment Practices]]` in its body, when a user views "Deployment Practices," then they see that item A references it.
- Given a link `[[Nonexistent Item]]`, when the item is rendered, then the link is visually distinct as broken.
- Given an agent writes a knowledge item via `write_memory` containing `[[Security Policy]]`, then the link is navigable and the backlink appears on "Security Policy."

**Plan calls.** Architecture pass should design: how links are parsed (regex vs AST extension), how backlinks are computed (on-the-fly scan vs cached index — evaluate whether a separate table is needed for performance or if body scanning suffices), duplicate title handling, and broken link detection. /pipeline:design needed for how backlinks and broken links are displayed.

**Contracts / constraints.**
- Wiki-link syntax is plain text in markdown bodies — no new content dialect.
- Links are derived data — if a storage mechanism is used, it must be fully reconstructable from body text.
- No auto-cascade on title rename — links break and humans fix them. Cascading is a future enhancement.
- `[[title|display text]]` alias syntax is out of scope for v1.

**Out of scope.**
- Graph visualization (force-directed layout).
- Transitive discovery ("items 2 hops away").
- Typed relationships (all links are "relates to").
- Automatic link suggestion at creation time (possible future enhancement).

**Effort.** M (~4h)

---

### Y7 — Cost Intelligence & Efficiency Learning

**Workpackage.** As a factory that manages cost deliberately, I want the system to analyze spending patterns, predict task costs, and identify which knowledge and agent configurations are most cost-efficient — so that cost becomes a learning signal, not just a cap.

**Why this matters.** HyperIdle already collects detailed cost data (per-bet, per-agent, per-team) and enforces caps. But none of this data is used to improve future performance. A team lead can't answer: "Which agent is most cost-efficient for code review tasks?" or "Does loading the chunking practice actually save us money?" The cost sentinel watches for overruns but never learns from patterns. The cost of NOT building this: the factory enforces budgets but never gets cheaper. Cost management stays reactive (cap → overage → alert) instead of proactive (predict → optimize → learn).

**What exists today.** Full cost tracking (L17: minor units on bets, users, teams). Cost cap enforcement (3-level hierarchy). Cost sentinel routine (80%/100% alerts). Tokens tracked per tier on bets. But sessions have no cost columns (stripped in O2), and there's no analysis or feedback loop.

**What's genuinely missing.** No cost analysis layer. No knowledge↔cost correlation. No budget predictions. No cost_impact signal on knowledge items. Cost data is collected and capped but never used to improve future performance.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- A periodic cost intelligence routine analyzes spending data and produces actionable insights as knowledge items — identifying which agents, task types, and configurations are most cost-efficient.
- A user creating a new task sees a cost prediction based on similar past tasks — making budget setting informed rather than guesswork.
- Knowledge items that correlate with lower session costs gain a relevance boost — the system preferentially loads knowledge that saves money.
- A team lead can see cost efficiency trends for their team — whether recurring work is getting cheaper or more expensive over time.

**Validation scenarios.**
- Given 50 completed sessions across 4 weeks, when the cost intelligence routine runs, then actionable insights are produced identifying efficiency patterns.
- Given a user creating a task similar to 15 past tasks, then a cost prediction hint shows the expected range.
- Given a knowledge item that consistently correlates with lower costs in sessions that load it, then its relevance score increases.

**Plan calls.** Architecture pass should design: the cost analysis queries (noting sessions lack cost columns — cost must be derived from bet/user aggregates), the prediction model (simple percentiles, no ML), a cost_impact signal for the relevance scoring formula, and the task creation form hint.

**Contracts / constraints.**
- Cost predictions use simple percentiles — no ML.
- Cost insights are knowledge items flowing through the standard pipeline.
- The prediction hint is informational — budget enforcement remains with C7.

**Out of scope.**
- Automatic agent reconfiguration based on cost insights.
- Real-time cost optimization during sessions.
- ML-based prediction models.

**Effort.** L (~5d)
