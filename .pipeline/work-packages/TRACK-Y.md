# Track Y: Knowledge Evolution

Improvements to HyperIdle's knowledge architecture, validated against what actually exists in the codebase. Each workpackage addresses a genuine gap — not a reimagining of infrastructure that already works. The existing knowledge system (5-layer hierarchy, promotion pipeline with 5+ cross-scope threshold, attention scoring with 8 signals, practice meetings with 3-turn consolidation, stale sweep, conflict resolution, event-driven handlers, materialization with relevance scoring) is substantial. This track builds on that foundation, not beside it.

Three themes: (1) closing learning loops that are open-ended today, (2) making the human side of human+AI knowledge collaboration concrete, and (3) adding signals the existing scoring system is missing.

**What exists (do not rebuild):** Auto-promotion sweep (AC2-AC5 gates), stale detection (90-day decay), attention scoring (8 signals, 2 stubbed), structural contradiction detection, conflict resolution, practice meeting (turns 1-3, turn 3 manual), 5 builtin routines (cost sentinel, practice meeting, post-bet retro, portfolio retro, knowledge decay), session review creator, full event system (23 types, 7 handlers), CRUD with WYSIWYG editing, FTS search, access logging, edit logging.

**Constraint:** The kernel/strategy separation (O2) is sacred. New fields must land in the correct table. `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### Y1 — Temporal Knowledge Validity

**Workpackage.** As a team whose knowledge evolves, I want to understand when facts became true and when they were superseded — so that agents don't hallucinate from stale data and facilitators can trace how the team's understanding changed over time.

**What exists today.** The `version` column tracks optimistic concurrency (edit count, not temporal validity). The `knowledgeEditLog` records every field change with timestamps. The stale sweep marks items inactive after 90 days. Access logs track read frequency. But there's no way to ask "what was true in March?" — the current version is always the only version.

**What's genuinely missing.** Temporal validity columns (`valid_from`, `valid_until`), a supersession model (`superseded_by` FK), and time-windowed queries (`?as_of=<date>`).

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Knowledge items gain `valid_from` (timestamp, defaults to `created_at`) and `valid_until` (nullable, null = still valid) on the kernel table, and `superseded_by` (nullable self-referential FK) for replacement linking.
- The knowledge list API accepts `?as_of=<ISO-timestamp>` that returns only items valid at that point. Omitting it returns current-valid items (same as today).
- Superseded items show a "Superseded" banner with a link to the replacement in the detail view.
- The materialization engine loads only `valid_until IS NULL` items by default.
- Not all knowledge is time-bound — items without a natural expiry keep `valid_until = NULL` indefinitely. Temporal versioning is opt-in per supersession event, not forced on every edit.
- Superseded items are excluded from search results by default (configurable via `?include_superseded=true`).
- Storage efficiency: supersession creates a link, not a copy. The old item stays as-is with `valid_until` set. No duplication of body content.

**Validation scenarios.**
- Given item A (created Jan 1) superseded by item B (created Mar 15), when the API is queried with `?as_of=2026-02-01`, then A appears and B does not.
- Given a long-lived principle with no supersession, when 2 years pass, then it remains valid (no forced expiry).
- Given a search for "deployment," when superseded items exist, then they are excluded from results by default.

**Plan calls.** Standard architecture pass. The concept pass should reconcile temporal validity with the existing stale sweep (90-day decay) — these are different signals (stale = unused, superseded = replaced). Verify that access log frequency and edit log recency remain separate from temporal validity.

**Contracts / constraints.**
- `valid_from` and `valid_until` are kernel fields.
- `superseded_by` is ON DELETE SET NULL.
- Migration: existing items get `valid_from = created_at`, `valid_until = NULL`.
- Temporal fields are metadata — no TOON codec changes.

**Out of scope.**
- Temporal graph traversal (following supersession chains).
- Automatic supersession detection (Y2 consolidation may trigger supersession).
- Bulk "knowledge base as of date X" snapshot UI.

**Effort.** M (~4h)

---

### Y2 — Knowledge Consolidation & Autonomous Learning

**Workpackage.** As a factory that compounds knowledge, I want the system to autonomously synthesize learnings from sessions into team and factory knowledge — detecting patterns, merging duplicates, resolving contradictions, and producing company-level insights — so that the knowledge base improves without requiring humans to manually curate every item.

**What exists today.** Practice meeting (turns 1-2 working, turn 3 synthesis is manual), auto-promotion sweep (5+ cross-scope repetitions), stale sweep (90-day decay), structural contradiction detection via `meta.forbids`/`meta.claims`, session-review-creator (fires on session_ended for medium/high risk), post-bet-retro routine (fires on bet completion), portfolio-retro routine (monthly). Agents can write knowledge during sessions via `write_memory`. The routine scheduler supports calendar, heartbeat, and event triggers.

**What's genuinely missing.**
1. **Autonomous synthesis (practice meeting turn 3):** The infrastructure for turn 3 exists but synthesis is manual — a facilitator must write it. LLM-powered autonomous synthesis is the gap.
2. **Individual agent learning across sessions:** Agents start each session fresh. There's no mechanism for an agent to accumulate personal learnings that persist across sessions and eventually surface to the team.
3. **Harness-level vs factory-level dreaming:** Claude, Hermes, and other harnesses now have their own "dreaming" features (between-session memory consolidation). HyperIdle needs to decide: what does the harness handle, and what does the factory handle? Overlapping consolidation wastes tokens and creates contradictions.
4. **Cross-team pattern detection:** The promotion pipeline counts cross-scope repetitions but doesn't semantically cluster related items across teams.

**Depends on.** None. All infrastructure (routines, promotion pipeline, practice meetings, event bus) exists.

**Complexity.** L

**Acceptance criteria.**
- Practice meeting turn 3 runs autonomously via an LLM call: the facilitator agent reads turn-1 proposals and turn-2 reactions, synthesizes them into provisional knowledge items, and archives intermediates. The synthesis prompt produces structured output (not freeform prose).
- Each agent has a personal learning space (knowledge items scoped to `user` with the agent's userId) where session-end observations accumulate. A periodic routine (weekly) reviews the agent's personal learnings and proposes promotions to team-level (L2) knowledge when patterns recur (3+ similar observations).
- A mapping document clarifies the boundary between harness dreaming and factory consolidation: harnesses handle session-level memory (what happened in this conversation), the factory handles cross-session patterns (what the team should know). The architecture pass produces this boundary definition.
- When items from 2+ teams share the same topic and overlapping content, the Chief of Staff routine (existing portfolio-retro) generates candidate L4 (factory) knowledge items with status `needs_human`. These are never auto-promoted to active.
- Consolidation runs are idempotent — running twice on unchanged data produces no new proposals.
- All LLM calls during consolidation are cost-capped per run.

**Validation scenarios.**
- Given turn-1 proposals and turn-2 reactions in a practice meeting, when turn 3 runs autonomously, then provisional knowledge items are created and intermediates are archived.
- Given agent Builder-1 has logged "always chunk file uploads" in 4 separate sessions over 2 weeks, when the personal learning review runs, then a proposal to promote this observation to team-level knowledge appears in the facilitator queue.
- Given team A and team B both have L3 practices about file chunking, when the portfolio-retro runs with synthesis enabled, then a candidate L4 principle is generated with citations to both teams' items.
- Given a harness that supports dreaming (e.g., Claude Managed Agents), when HyperIdle configures the session, then it provides the harness with factory-level knowledge but does NOT duplicate the factory's consolidation at the harness level.

**Plan calls.** Concept work needed on "Consolidation" — distinguishing harness dreaming (session memory) from factory consolidation (cross-session patterns). Architecture pass should design: the synthesis prompt for turn 3, the personal learning space model, the cross-team clustering mechanism, and the harness dreaming boundary protocol.

**Contracts / constraints.**
- Autonomous synthesis uses the existing practice meeting infrastructure (turns, anchors, atomic transactions) — no new consolidation system.
- Personal learning items use the existing knowledge_items table with scope_kind="user" — no new table.
- L4 candidates always require human validation — the synthesis routine never sets status to "active."
- The harness dreaming boundary is a configuration decision, not a code enforcement — documented, not policed.

**Out of scope.**
- Real-time consolidation during sessions.
- Semantic contradiction detection (structural heuristic is sufficient for v1; LLM-based classification is a future enhancement).
- Cross-factory consolidation.

**Effort.** L (~5d)

---

### Y3 — Self-Evolution of Experience

**Workpackage.** As a team of agents that gets better over time, I want agents to evolve their own experience — discovering reusable patterns, proposing them as skills, adopting validated skills from the factory, and refining their own soul prompts — so that the team's capabilities compound across bets instead of staying frozen at whatever a human initially configured.

**What exists today.** Skills are 14 hardcoded TypeScript tool definitions in `skill-tools/`. The `userSkills` table tracks per-agent autonomy levels and success/failure counts but doesn't control anything at runtime. Soul prompts are stored inline in DB (`users.soulPrompt`), editable by founders only. Agents write knowledge via `write_memory` — the existing knowledge→facilitator→promotion pipeline is the core loop. The design vision (RESEARCH_EXECUTION_LAYER.md §3) explicitly says knowledge at L3 can *inform* a future skill, but the promotion from knowledge to skill is a "deliberate, human-approved" leap.

**What's genuinely missing.** Agents can write knowledge but cannot propose "this should become a skill" or "my soul prompt should include this learning." There's no mechanism to close the loop from validated knowledge → operational skill → agent adoption. Skills and knowledge are completely separate systems (TypeScript code vs DB rows).

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- Skills are reconceived as knowledge items with `kind = "skill"` — they are markdown instructions, not executable code. They use the same storage, scoring, promotion, and materialization as other knowledge. The existing 14 tool definitions (TypeScript, hardcoded) remain separate — this workpackage adds *instructional* skills, not new tool code.
- Agents can propose a skill via `write_memory` with kind="skill" — it enters the knowledge pipeline as any other item (captured → facilitator review → promotion).
- When a skill-kind knowledge item reaches `active` status, it becomes eligible for materialization into agent sessions. The relevance scoring engine selects skills based on task tags, agent role, and team scope — same as other knowledge.
- A "Skills" view in the knowledge section lists all active skill-kind items with their scope, author, and citation signals (once L22 citation tracking ships).
- Agents can propose soul prompt adjustments: a new skill-tool `propose_experience_update` creates a knowledge item with kind="experience_update" containing the proposed change and rationale. These enter the facilitator queue with `needs_human` status — soul prompt changes always require human approval.
- Humans can "assign" a skill to an agent by scoping it to the agent's user scope, or to a team for all team members.
- The factory→agent adoption loop: when a skill is promoted to L3 (practice), all agents in the relevant practice community receive it via materialization. No manual assignment needed.

**Validation scenarios.**
- Given a builder agent discovers a reusable file-chunking pattern, when it calls `write_memory` with kind="skill", then the item enters the knowledge pipeline and appears in the facilitator's attention queue.
- Given an active skill "chunk-file-uploads" scoped to team A, when a session is provisioned for a team A agent, then the skill is materialized into the workspace alongside other knowledge.
- Given an agent proposes a soul prompt adjustment via `propose_experience_update`, when a human reviews it, then they can approve (updating the agent's soul prompt) or reject (archiving the proposal).
- Given a skill promoted to L3 (practice community: "build"), when any builder agent starts a session, then the skill appears in their materialized context automatically.

**Plan calls.** Concept work needed: "Instructional Skill" as a knowledge kind (not a new primitive), and "Experience Update" as a proposal mechanism for soul prompt evolution. Architecture pass should design: the kind="skill" materialization path, the `propose_experience_update` tool contract, the human approval→soul prompt update flow, and how instructional skills relate to the existing tool definitions.

**Contracts / constraints.**
- Instructional skills are knowledge items, not TypeScript tool definitions. The two systems coexist — hardcoded tools provide capabilities, instructional skills provide guidance.
- Skill bodies are plain markdown — no executable code, no tool schemas.
- Soul prompt updates always require human approval — agents propose, humans decide. User Sovereignty.
- The `propose_experience_update` tool is available to all agent roles.

**Out of scope.**
- Automatic skill generation from session traces (Y2 handles learning extraction).
- Skill sharing across factories.
- Executable skill plugins (this is knowledge-as-instruction, not code).
- Runtime tool registration (adding new TypeScript tool definitions dynamically).

**Effort.** L (~5d)

---

### Y4 — Declarative Event Hook Registry

**Workpackage.** As a factory operator, I want to register event-driven knowledge processing hooks without modifying code — so that I can wire up automation like "when a session ends, extract learnings" or "when a bet closes, run a retro" through configuration, not deploys.

**What exists today.** A full event system with 23 event types and 7 hardcoded handlers registered in `bootstrap.ts`. Event-triggered routines already work (bet_state_changed → post-bet-retro). The routine scheduler supports event triggers with taskId in triggerConfig. Knowledge IS already event-driven — session_ended creates review items, knowledge_updated triggers git export, etc.

**What's genuinely missing.** Hooks are hardcoded — you can't add a new handler without modifying `bootstrap.ts` and redeploying. No declarative registry, no conditional filtering, no enable/disable without code changes, no execution audit log. The gap is extensibility, not the event mechanism itself.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- A `event_hooks` table stores hook registrations: event type (from the existing EventType union), handler routine ID (FK to routines), enabled flag, and an optional filter (simple JSON key-value match against event payload).
- When a system event fires, the hook dispatcher evaluates registered hooks alongside the existing hardcoded handlers. Matching hooks enqueue their associated routine.
- Hooks are manageable via API: create, enable, disable, delete. A settings UI section lists hooks with their event type, target routine, and enabled state.
- Hook executions are logged: event type, hook ID, routine ID, timestamp, success/failure.
- Hooks are asynchronous — they enqueue routines, never block the originating event.
- Batch accumulation is supported: a hook can specify a `debounce_seconds` (default 0) to coalesce rapid events into a single routine invocation — respecting the user's concern that sometimes scheduled batches are better than reacting to every event.

**Validation scenarios.**
- Given a hook registered for `session.ended` linked to a "extract-learnings" routine, when a session ends, then the routine is enqueued.
- Given a hook with `debounce_seconds: 300`, when 5 knowledge_updated events fire within 5 minutes, then the routine is enqueued once after the debounce window.
- Given a user disables a hook, when the matching event fires, then the hook is skipped.

**Plan calls.** Standard architecture pass. The concept pass should clarify the relationship between declarative hooks and the existing hardcoded handlers in bootstrap.ts — do they coexist, or do builtin handlers migrate to the hook table?

**Contracts / constraints.**
- Filter expressions use simple JSON key-value matching — no scripting, no arbitrary code.
- Hook execution failures don't affect the originating event.
- The existing 7 hardcoded handlers continue to work — hooks are additive.
- Maximum 50 hooks per factory (prevents runaway configuration).

**Out of scope.**
- Webhook/external HTTP hooks (internal event-to-routine only).
- Hook chaining (hook A's output triggering hook B).
- Visual hook builder.

**Effort.** M (~6h)

---

### Y5 — Knowledge Review Queue UX

**Workpackage.** As a human CEO or team lead, I want a focused review queue that surfaces the knowledge items most needing my judgment — ordered by attention score — so that I spend my review time on items that matter and can process them rapidly.

**What exists today.** Full knowledge CRUD (create, edit, scope, archive, flag, merge, split). KnowledgeCreate page with WYSIWYG + scope/kind selectors. KnowledgeDetail with inline auto-save and conflict detection. KnowledgeList with a "Triage" tab filtering items with status="draft". FTS search. Access logging. The human authoring flow is feature-complete.

**What's genuinely missing.** The triage tab filters by `status=draft` but doesn't use attention scores for ordering. There's no `needs_human` status filter. No count badge. No keyboard shortcuts for rapid processing. No formal review workflow.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- The KnowledgeList page gains a "Review" tab (alongside existing Curated/Triage tabs) that shows items with `status = needs_human`, ordered by `attentionScore` descending.
- A count badge in the sidebar navigation shows how many items await review.
- Each item in the review tab shows: title, body preview, kind, scope, proposing agent (if agent-authored), and action buttons: Validate (→ active), Edit & Validate, Reject (→ archived), Defer (keep in queue).
- Keyboard shortcuts for the review tab: `v` validate, `e` edit, `r` reject, `d` defer, `j/k` navigate.
- When a human validates an item, `status` transitions to `active`, `confidence` in the strategy fabric is set to maximum.
- Items generated by Y2 consolidation (synthesis proposals, L4 candidates) naturally appear in this queue because they enter with status `needs_human`.

**Validation scenarios.**
- Given 5 items with status `needs_human` and varying attention scores, when the Review tab loads, then items are ordered by attention score descending.
- Given a human presses `v` on an item, then the item status changes to active, confidence is maximized, and the next item is focused.
- Given 3 items awaiting review, when the sidebar renders, then a "3" badge appears on the Knowledge nav item.
- Given no items need review, when the Review tab loads, then an empty state says "All caught up."

**Plan calls.** /design needed for the review tab interaction (keyboard nav, action buttons, queue progression). Architecture pass should design: the review query (knowledge_items WHERE status = 'needs_human' ORDER BY attentionScore DESC), keyboard shortcut system, and badge computation.

**Contracts / constraints.**
- Uses the existing KnowledgeList page — new tab, not a new page.
- Uses the existing BodyEditor (T1) for Edit & Validate flow.
- Server-side paginated (not client-side filtering).
- Validation and rejection are single-click (undo via knowledge detail page).

**Out of scope.**
- Batch operations (validate/reject multiple at once).
- Review assignment (routing items to specific humans).
- AI-assisted authoring.

**Effort.** M (~6h)

---

### Y6 — Agent Write Governance

**Workpackage.** As a factory operator, I want to prevent a malfunctioning agent from flooding or corrupting the knowledge base — through rate limits on agent writes, anomaly detection on unusual mutations, and trust-informed scoring — so that autonomous knowledge curation has safety rails.

**What exists today.** Attention scoring flags items for human review when scores exceed thresholds. Conflict resolution handles concurrent edits. The `knowledgeEditLog` tracks every mutation with editor identity. Cost caps (C7) limit session spending. Taste-sensitive classification marks items requiring human judgment.

**What's genuinely missing.** No per-agent rate limiting on knowledge writes. No anomaly detection (unusual mutation size, burst writes, scope escalation). No agent trust score. The existing governance is about *knowledge quality* — this workpackage adds governance for *agent behavior*.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- A configurable rate limiter enforces a maximum number of knowledge mutations per agent per hour (default: 50). Exceeding the limit blocks further writes and creates an alert in the facilitator's attention queue.
- An anomaly detector flags statistically unusual mutations: items much larger than the agent's historical average, non-facilitator agents writing to factory scope (L4), or burst writes (10+ mutations in 5 minutes).
- Flagged anomalies appear as governance alerts in the facilitator queue with evidence (which agent, what mutation, why flagged).
- Each agent has a computed trust score (0.0–1.0) derived from: ratio of validated vs rejected contributions, and governance violation count. The score is visible on the agent profile page (AB1).
- Items contributed by agents with trust score < 0.3 show a "low-trust" indicator in the knowledge list.
- New agents start with trust score 0.5 (neutral) — they can build trust through validated contributions.
- The anomaly detector uses statistical heuristics, not LLM calls — it must be fast and deterministic.

**Validation scenarios.**
- Given an agent that has written 50 knowledge items this hour, when it attempts a 51st, then the write is blocked and a rate-limit alert appears.
- Given an agent with average contribution size of 200 words that writes a 10,000-word item, then a size anomaly alert is created.
- Given an agent with 20 validated and 2 rejected contributions, then its trust score reflects the high validation ratio (> 0.8).
- Given a new agent with zero contributions, then its trust score is 0.5 and no low-trust badge appears.

**Plan calls.** Architecture pass should design: the rate limiter (in-memory with periodic DB sync, or pure DB), the anomaly heuristics (thresholds, baselines), the trust score formula, and how governance alerts integrate with the existing attention scoring engine.

**Contracts / constraints.**
- Trust scores are strategy-layer computed values — never stored on the kernel users table.
- Rate limits apply to agent writes only — human writes are never rate-limited.
- Governance alerts do not terminate sessions — they flag for review.
- The trust score formula is simple and deterministic: `(validated / (validated + rejected + violations)) * age_factor`.

**Out of scope.**
- Automatic agent suspension based on trust score.
- Per-fact (block-level) provenance tracking — item-level edit log is sufficient for v1.
- Knowledge rollback (reverting a specific agent's contributions).

**Effort.** L (~3d)

---

### Y7 — Knowledge Graph Linking

**Workpackage.** As a human or agent navigating the knowledge base, I want to create references between knowledge items using `[[wiki-link]]` syntax and see backlinks on every item — so that related knowledge is discoverable through connections, not just search or manual curation.

**What exists today.** The BacklinksCard in KnowledgeDetail shows explicitly curated related items + topic-based auto-grouping (same topic + scope). Standard markdown links work. Block derivation produces deterministic block IDs. But there's no wiki-link syntax, no automatic backlink index, and no mention detection.

**What's genuinely missing.** `[[wiki-link]]` syntax in knowledge item bodies, a `knowledge_links` table for directed edges, automatic link extraction on save, backlink queries, broken link detection, and agent-created cross-references.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- Knowledge item bodies support `[[Item Title]]` wiki-link syntax. Links resolve by title match (case-insensitive, exact). Unresolved links render as broken (visually distinct).
- A `knowledge_links` table stores directed edges: source_item_id, target_item_id, link_text. Links are extracted on save (write-path) by parsing `[[...]]` from the body.
- Each knowledge item's detail view shows a "Linked from" section listing all items that reference it, with title and linking context snippet.
- Broken links (referencing a title that doesn't exist) are queryable via API (`?filter=broken_links`) and visually distinct in the rendered body.
- Agents can create links by writing `[[...]]` syntax in knowledge item bodies via `write_memory` — no special tool needed.
- When a new item is created and its topic/body overlaps with existing items, the system suggests potential links (FTS-based candidate search) in the create/edit UI. Suggestions are informational, not automatic.
- Link records are derived data — they can be fully reconstructed from knowledge item bodies.

**Validation scenarios.**
- Given item A contains `[[Deployment Practices]]` in its body, when saved, then a link record is created and "Deployment Practices" shows A in its "Linked from" section.
- Given a `[[Nonexistent Item]]` link, when rendered, then it appears as broken (distinct style).
- Given a new knowledge item about "file upload chunking," when the create form opens, then FTS suggests linking to existing items about "file upload" or "chunking."
- Given item B is renamed, then existing `[[Old Title]]` links from other items become broken (no auto-cascade in v1).

**Plan calls.** Architecture pass should design: the `knowledge_links` schema, the wiki-link parser (regex on `[[...]]` vs markdown AST extension), the FTS-based suggestion mechanism, and duplicate title handling. /design needed for the "Linked from" section and link suggestions UI.

**Contracts / constraints.**
- Wiki-links are parsed on the write path (save) — link records are created/updated at save time.
- Link records are derived — deleting and rebuilding the table from all item bodies must produce the same result.
- No auto-cascade on title rename (links break; human fixes). Title rename cascading is a future enhancement.
- `[[title|display text]]` alias syntax is out of scope for v1.
- Backlink queries are indexed (source_item_id, target_item_id).

**Out of scope.**
- Graph visualization (force-directed layout).
- Transitive discovery ("items 2 hops away").
- Typed relationships (all links are "relates to").
- Automatic link creation without [[]] syntax (suggestions only).

**Effort.** L (~5d)

---

### Y8 — Cost Intelligence & Efficiency Learning

**Workpackage.** As a factory that manages cost deliberately, I want the system to analyze spending patterns, predict task costs, and identify which knowledge and agent configurations are most cost-efficient — so that cost becomes a learning signal, not just a cap.

**What exists today.** Full cost tracking (L17: minor units on bets, users, teams), cost cap enforcement (3-level hierarchy: agent → team → factory), cost sentinel routine (80%/100% alerts with deduplication), tokens tracked per tier on bets. But sessions have no cost columns (stripped in O2), cost data only aggregates upward, and there's no analysis or feedback loop.

**What's genuinely missing.** No cost analysis layer. No knowledge↔cost correlation. No budget predictions. No `cost_impact` signal on knowledge items. Cost data is collected and capped but never used to improve future performance.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- A cost intelligence routine runs weekly (configurable) that analyzes cost data across sessions/tasks/bets and produces actionable insights as knowledge items (kind: "cost_insight").
- The routine identifies: (a) which agents are cost-efficient vs expensive for similar tasks, (b) which harness/model tier combinations are most cost-effective, (c) task types that consistently exceed appetite.
- Budget predictions for new tasks: based on historical cost data for similar tasks (same team, similar description, same agent role), surface a predicted cost range (p25/p50/p75) as a hint in the task creation flow.
- A `cost_impact` field on `knowledge_strategy_fabric` (nullable numeric) captures how a knowledge item affects session costs when materialized. Positive = reduces cost. Populated by the cost intelligence routine when it detects correlations.
- The `cost_impact` signal is added as a new factor in the relevance scoring formula — knowledge that saves money ranks higher for materialization.
- A "Cost Efficiency" section on the team Work page shows: average cost per successful task, cost trend (last 4 weeks), and the top 3 recommendations from the latest cost intelligence run.

**Validation scenarios.**
- Given 50 completed sessions across 4 weeks, when the cost intelligence routine runs, then 2-4 cost insight items are produced identifying efficiency patterns.
- Given a user creating a task similar to 15 past tasks, when the creation form loads, then a cost prediction hint shows "Estimated: $0.30–$0.80 (median $0.50)."
- Given a knowledge item that correlates with 40% lower session costs, when the cost intelligence routine runs, then the item's `cost_impact` field is set to a positive value and its relevance score increases.

**Plan calls.** Architecture pass should design: the cost analysis queries (aggregation across bets, users, tasks — noting sessions lack cost columns), the prediction model (simple percentiles, no ML), the `cost_impact` field and its integration with relevance scoring, and the task creation form hint.

**Contracts / constraints.**
- Cost predictions use simple statistical methods (percentiles from historical data) — no ML.
- The cost intelligence routine is an LLM call cost-capped per run.
- Cost insights are knowledge items — they flow through the same pipeline as other knowledge.
- The prediction hint is informational — budget enforcement remains with C7.

**Out of scope.**
- Automatic agent reconfiguration based on cost insights (recommendations only).
- Real-time cost optimization during sessions.
- ML-based prediction models.

**Effort.** L (~5d)
