# Track Y: Knowledge Evolution

Research-driven improvements to HyperIdle's knowledge architecture. Each workpackage addresses a gap identified by comparing HyperIdle's original vision against Paperclip's approach, 2024–2026 academic research (arXiv), and industry trends in AI agent knowledge management. The track strengthens three themes: (1) autonomous knowledge curation by agents, (2) human–AI collaboration on shared knowledge, and (3) knowledge governance and trust.

**Concept:** Several workpackages reshape the Knowledge Item primitive or introduce new primitives (Agent Skill, Knowledge Hook, Trust Score). Run `/concept` per workpackage at pipeline time where noted.

**Constraint:** The kernel/strategy separation (O2) is sacred — kernel fields stay structural and stable; strategy fields stay computed and replaceable. New fields must land in the correct table. All changes must preserve backward compatibility at the API level. `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### Y1 — Temporal Knowledge Validity

**Workpackage.** As a human reviewing a knowledge item, I want to see when a fact became true and when it was superseded — so that I can trust the knowledge base even when information evolves over time, and agents can answer "what was our deployment practice in March?" without hallucinating from stale data.

**Depends on.** None. The `knowledge_items` kernel table and `knowledge_strategy_fabric` extension table exist (O2). This workpackage extends them with temporal validity columns.

**Complexity.** M

**Acceptance criteria.**
- Every knowledge item has `valid_from` (timestamp, defaults to `created_at`) and `valid_until` (nullable timestamp, null means "still valid") columns on the kernel table.
- When a knowledge item is superseded (a newer item replaces it), `valid_until` is set to the superseding item's `valid_from`, and a `superseded_by` foreign key points to the replacement.
- The knowledge list API accepts an `?as_of=<ISO-timestamp>` query parameter that returns only items where `valid_from <= as_of` and (`valid_until IS NULL` or `valid_until > as_of`).
- The knowledge detail view in the web UI shows a "Valid since" date and, if superseded, a "Superseded on" date with a link to the replacement item.
- The materialization engine respects temporal validity: only items with `valid_until IS NULL` are loaded into agent workspaces by default.
- Migration is forward-only: existing items get `valid_from = created_at` and `valid_until = NULL`.

**Validation scenarios.**
- Given knowledge item A created on Jan 1 and superseded by item B on Mar 15, when the API is queried with `?as_of=2026-02-01`, then item A appears and item B does not.
- Given a user views a superseded knowledge item, when the detail page loads, then a banner shows "Superseded on Mar 15" with a link to item B.
- Given a session is provisioned, when materialization runs, then only items with `valid_until IS NULL` are written to the workspace.

**Plan calls.** Standard architecture pass — schema migration design, API query changes, UI affordance for temporal display. Skip /design (minimal UI change — a banner and date display).

**Contracts / constraints.**
- `valid_from` and `valid_until` are kernel fields (structural, stable) — not strategy fields.
- `superseded_by` is a nullable self-referential FK with ON DELETE SET NULL.
- The `?as_of` parameter is optional; omitting it returns current-valid items only (same behavior as today).
- No changes to the TOON codec — temporal fields are metadata, not body content.

**Out of scope.**
- Temporal knowledge graph traversal (following supersession chains).
- UI for bulk temporal queries ("show me the knowledge base as of date X").
- Automatic supersession detection (Y2 Dreaming Routines may handle this).

**Effort.** M (~4h)

---

### Y2 — Dreaming Routines (Between-Session Knowledge Consolidation)

**Workpackage.** As a team using HyperIdle, I want the system to automatically detect patterns across completed sessions, merge duplicate knowledge, flag contradictions, and promote recurring observations — so that the knowledge base improves between sessions without requiring humans to manually curate every item.

**Depends on.** None. The routine scheduler (C5), facilitator infrastructure (G1), promotion pipeline (G3), and attention scoring (G2) all exist. This workpackage adds the specific consolidation logic that runs as scheduled routines.

**Complexity.** L

**Acceptance criteria.**
- A "consolidation routine" runs on a configurable schedule (default: after every session ends, and once daily) that scans recent session outcomes, task completions, and new L1/L2 knowledge items.
- The routine detects duplicate knowledge items (same topic, overlapping body content) and creates merge proposals visible in the facilitator's attention queue.
- The routine detects contradictions (items in the same scope with conflicting claims) and creates conflict review items with both sides linked.
- The routine identifies recurring patterns (same observation appearing in 3+ sessions across different tasks) and auto-promotes them from L1→L2 or L2→L3, respecting the existing promotion pipeline rules.
- Each consolidation run produces a summary log entry (what was merged, promoted, flagged) queryable via the API.
- The routine respects the existing status machine: it never moves items past "provisional" without a human validation gate for L3+ items.
- Consolidation runs are idempotent: running the same consolidation twice on unchanged data produces no new proposals.

**Validation scenarios.**
- Given three sessions that each produce a knowledge item about "always chunk file uploads," when the consolidation routine runs, then a single L3 practice item is proposed with citations linking to all three source items.
- Given two knowledge items that contradict each other ("use gzip" vs "use brotli" for the same scope), when the consolidation routine runs, then a conflict review item appears in the facilitator's queue with both items linked.
- Given a consolidation routine that already processed today's sessions, when it runs again with no new data, then no new proposals or promotions are created.
- Given a recurring pattern promoted to L3, when the knowledge list is viewed, then the item's status is "provisional" (not "active") pending human validation.

**Plan calls.** Concept work needed on "Consolidation Routine" as a specialization of the Routine primitive. Architecture pass should design: the pattern detection algorithm (embedding similarity vs keyword overlap vs LLM judgment), the merge proposal data model, and how consolidation integrates with the existing promotion pipeline. This workpackage requires LLM calls for pattern detection — define the eval criteria for consolidation quality.

**Contracts / constraints.**
- Consolidation routines are facilitator-scoped: they run as a Practice Facilitator or Product Manager agent, not as a system daemon.
- LLM calls during consolidation are cost-capped per run (respecting C7 cost cap enforcement).
- Merge proposals are just proposals — they appear in the attention queue and require either facilitator or human action. No silent merges.
- The summary log uses the existing `propagationLog` table, not a new table.

**Out of scope.**
- Human UI for reviewing consolidation proposals (Y10 covers this).
- Cross-company knowledge sharing.
- Real-time consolidation during sessions (this is between-session only).
- Automatic contradiction resolution (only detection and flagging).

**Effort.** L (~3d)

---

### Y3 — Self-Evolving Agent Skills

**Workpackage.** As an agent team that improves over time, I want agents to propose new skills, refine existing ones, and version their skill definitions based on task outcomes — so that the team's capabilities compound across bets instead of staying frozen at whatever a human initially configured.

**Depends on.** None. The `userSkills` table, skill-tool registry (D4), and MCP bridge (X2) exist. This workpackage makes skill definitions mutable and agent-writable.

**Complexity.** L

**Acceptance criteria.**
- A new `skill_definitions` table stores named skills with: title, body (markdown instructions), version number, status (draft/active/deprecated), author (user FK), and a `parent_version` FK for lineage tracking.
- Agents can propose new skill definitions or modifications to existing ones via a `propose_skill` skill-tool, which creates a draft-status entry.
- Draft skills enter the facilitator's attention queue for review. Active skills are loaded into agent sessions during prompt composition when relevant to the task.
- When an agent uses a skill and the task succeeds, a "skill citation" is recorded. When a task fails, a "skill failure" is recorded. Citation and failure counts inform the relevance scoring engine.
- Deprecated skills are excluded from materialization but remain in the database for lineage queries.
- The skill definition body follows the same markdown format as knowledge items — no new content dialect.
- The settings UI shows a "Skills" tab listing all active skill definitions with their version, author, and citation count.

**Validation scenarios.**
- Given a builder agent discovers a reusable file-chunking pattern, when it calls `propose_skill` with a title and body, then a draft skill definition appears in the facilitator's attention queue.
- Given an active skill "chunk-file-uploads v2," when an agent completes a task that used it, then the skill's citation count increments.
- Given a skill with 5 failures and 0 citations, when the facilitator reviews it, then the attention score ranks it high for deprecation review.
- Given a deprecated skill, when a session is provisioned, then the skill is not included in the materialized workspace or prompt.

**Plan calls.** Concept work needed: "Agent Skill" as a new mutable, versionable primitive — distinct from the static skill-tools in D4. Architecture pass should design: the skill_definitions schema, the `propose_skill` tool contract, how skills are selected for materialization (relevance scoring integration), and the versioning model (append-only with lineage vs in-place mutation).

**Contracts / constraints.**
- Skill definitions are strategy-layer data — they use the relevance and attention scoring engines, not a separate scoring system.
- The `propose_skill` tool is available to all agent roles, not just facilitators.
- Skill bodies are plain markdown — no executable code, no tool definitions. Skills are instructions, not programs.
- Version lineage is immutable: you cannot rewrite history, only create new versions.

**Out of scope.**
- Automatic skill generation from session traces (Y6 Observational Compression is a prerequisite).
- Skill sharing across companies/factories.
- Executable skill plugins (this is knowledge-as-instruction, not code).

**Effort.** L (~5d)

---

### Y4 — Per-Fact Provenance Tracking

**Workpackage.** As a human validating a knowledge item, I want to see which agent contributed each claim and from which session — so that I can assess trustworthiness per-fact rather than per-item, and the system can detect when a single unreliable agent pollutes shared knowledge.

**Depends on.** None. The `knowledgeEditLog` table and block derivation system (`derive-blocks.ts`) exist. This workpackage adds provenance metadata at the block/fact level.

**Complexity.** M

**Acceptance criteria.**
- Each block within a knowledge item body carries provenance metadata: `contributed_by` (user FK), `contributed_in` (session FK, nullable for human edits), and `contributed_at` (timestamp).
- When an agent writes or modifies a knowledge item body, the system diffs the blocks and attributes each new or changed block to the current session and agent.
- When a human edits a knowledge item, changed blocks are attributed to the human user with no session FK.
- The knowledge detail API includes a `?include=provenance` parameter that returns per-block attribution data alongside the item body.
- The knowledge detail view in the web UI can toggle a "provenance overlay" showing colored author badges on each block.

**Validation scenarios.**
- Given agent A writes a knowledge item with three paragraphs, when the item is queried with `?include=provenance`, then each block shows agent A as contributor with the session ID.
- Given agent B later edits paragraph 2, when provenance is queried, then paragraph 2 shows agent B and paragraphs 1 and 3 still show agent A.
- Given a human edits paragraph 3 via the web UI, when provenance is queried, then paragraph 3 shows the human user with `contributed_in: null`.

**Plan calls.** Standard architecture pass — schema design for provenance storage (separate table keyed by knowledge_item_id + block_id, or JSON in a provenance column), diff algorithm for block attribution, API extension, and UI overlay design. Consider whether provenance is kernel or strategy — it's structural (who wrote what) so likely kernel.

**Contracts / constraints.**
- Provenance is append-only: once a block is attributed, that attribution record persists even if the block is later modified (creating a new attribution for the new version).
- Block IDs for provenance use the same deterministic derivation as `derive-blocks.ts` — no new ID scheme.
- Provenance data is never included in materialized workspaces (it's audit data, not agent context).

**Out of scope.**
- Trust scoring based on provenance (Y11 Memory Governance covers this).
- Provenance visualization beyond the simple overlay (e.g., full history timeline).
- Provenance for non-knowledge entities (threads, messages, etc.).

**Effort.** M (~6h)

---

### Y5 — Compiled Memory (Knowledge-as-Instruction)

**Workpackage.** As an agent starting a session, I want the most critical knowledge to be compiled directly into my system prompt as precise sub-instructions — rather than loaded as context I must interpret — so that validated practices actually shape my behavior instead of sitting in a context window I might ignore.

**Depends on.** None. The prompt composition module (X1) and materialization engine (B2) exist. This workpackage adds a compilation step between materialization and prompt delivery.

**Complexity.** M

**Acceptance criteria.**
- After materialization selects knowledge items for a session, a compilation step runs that transforms the top-N highest-relevance items (configurable, default 10) into concise sub-bullets appended to the agent's soul prompt.
- Each compiled instruction is one sentence, imperative mood, derived from the knowledge item's title and key claims in the body. The compilation uses an LLM call with a fixed prompt template.
- The compiled instructions section in the soul prompt is clearly delimited (e.g., `## Learned Practices`) so agents and humans can distinguish compiled knowledge from the base persona.
- The remaining knowledge items (below top-N) are still materialized as files in the workspace — compilation supplements, not replaces, full materialization.
- A `compiled: true/false` flag on the materialization manifest tracks which items were compiled vs file-materialized.
- The compilation step respects a token budget (configurable, default 800 tokens for compiled instructions) and truncates gracefully.

**Validation scenarios.**
- Given 20 relevant knowledge items and a top-10 compilation setting, when a session is provisioned, then the soul prompt contains 10 compiled sub-bullets under "## Learned Practices" and the workspace contains all 20 items as files.
- Given a compiled instruction section that would exceed 800 tokens, when compilation runs, then the least-relevant items are dropped from compilation (still materialized as files) until the budget fits.
- Given an agent with no relevant knowledge items, when a session is provisioned, then the soul prompt contains no "## Learned Practices" section.

**Plan calls.** Standard architecture pass — define the compilation prompt template, integration point in `prompt-composition.ts`, token budget allocation within the existing 4000-token persona budget, and how the compilation LLM call is cost-tracked. Skip /design (no UI changes).

**Contracts / constraints.**
- Compilation is a strategy-layer concern — it does not modify the knowledge items themselves, only how they are delivered to the agent.
- The compilation LLM call uses the same model gateway (X4) as other system calls, cost-capped per session.
- Compiled instructions are regenerated fresh each session — not cached across sessions.
- The base soul prompt template remains untouched; compiled instructions are appended, never injected into the middle.

**Out of scope.**
- Agent self-modification of compiled instructions during a session.
- Feedback loop from task outcomes back to compilation ranking (Y3 Self-Evolving Skills covers learning loops).
- Compilation of non-knowledge context (task history, team info, etc.).

**Effort.** M (~6h)

---

### Y6 — Observational Session Compression

**Workpackage.** As a system managing knowledge flow, I want completed session traces to be compressed into structured observations before they are promoted to team or practice knowledge — so that the knowledge base contains dense, high-signal items instead of raw session logs, reducing storage costs and improving retrieval quality.

**Depends on.** None. The session lifecycle (C3), session outcomes, and knowledge writeback (B4) exist. This workpackage adds a post-session compression step.

**Complexity.** L

**Acceptance criteria.**
- After a session ends (outcome recorded), a compression routine runs that reads the session's trace (messages, tool calls, outcomes, errors) and produces 1–5 structured observations.
- Each observation is a knowledge item at L1 (task layer) with a structured format: `observation` (what happened), `evidence` (which session events support it), `confidence` (high/medium/low), and `suggested_layer` (L2 or L3 if the observation seems generalizable).
- The compression routine uses an LLM call with a fixed prompt template that instructs it to extract only non-obvious insights — not restate the task description or obvious outcomes.
- Observations that duplicate existing knowledge items (detected via embedding similarity or FTS match above a threshold) are linked to the existing item as corroborating evidence rather than created as new items.
- The compression achieves at minimum 5:1 token reduction: if a session trace is 50K tokens, the observations total under 10K tokens.
- Compression is optional per team (configurable via factory settings) and can be disabled for cost-sensitive deployments.

**Validation scenarios.**
- Given a completed session with 40K tokens of trace including a file-chunking workaround, when compression runs, then 2–4 observations are created, one of which captures the chunking insight with evidence pointing to the relevant tool calls.
- Given an observation that matches an existing L2 knowledge item (>0.85 similarity), when compression runs, then no new item is created; instead, the existing item gains a corroborating citation.
- Given compression is disabled in factory settings, when a session ends, then no compression routine runs and no observations are created.

**Plan calls.** Architecture pass should design: the compression prompt template, the deduplication strategy (embedding similarity vs FTS vs hybrid), the observation schema (extension of knowledge item or separate table), and cost controls for the LLM compression call. Concept work may be needed on "Observation" as a specialized knowledge kind.

**Contracts / constraints.**
- Compression runs as a facilitator routine, not inline with session teardown — session end is not blocked by compression.
- Observations are L1 items by default; promotion to L2/L3 follows the existing promotion pipeline.
- The compression LLM call is cost-capped independently of the session budget.
- Raw session traces are not deleted after compression — observations supplement, not replace, the audit trail.

**Out of scope.**
- Real-time observation extraction during sessions.
- Compression of non-session data (bet outcomes, human conversations).
- Automatic promotion of observations (the promotion pipeline handles that separately).

**Effort.** L (~3d)

---

### Y7 — Knowledge Activation Format (Action-Ready Knowledge)

**Workpackage.** As an agent receiving materialized knowledge, I want each item to include when to apply it, which tools are relevant, what constraints exist, and what to do next — so that knowledge is directly actionable instead of requiring me to interpret prose and infer applicability.

**Depends on.** None. The `knowledge_strategy_fabric` extension table exists (O2). This workpackage adds activation fields to the strategy layer.

**Complexity.** M

**Acceptance criteria.**
- The `knowledge_strategy_fabric` table gains four new nullable columns: `when_to_apply` (text — conditions under which this knowledge is relevant), `tools_needed` (text array — names of skill-tools or external tools), `constraints` (text — guardrails or limitations), and `next_steps` (text — what to do after applying this knowledge).
- When a knowledge item is created or promoted to L3+, a facilitator routine auto-populates the activation fields by analyzing the item's body with an LLM call.
- The TOON codec encodes activation fields as structured key-value pairs in the materialized workspace file, so agents can parse them without reading the full body.
- The knowledge detail view in the web UI displays activation fields in a structured sidebar section (not inline with the body).
- Activation fields are editable by humans via the knowledge detail UI — they are suggestions, not immutable.
- When activation fields are empty, materialization proceeds normally — these fields are progressive enhancement.

**Validation scenarios.**
- Given a knowledge item "always chunk file uploads over 10MB," when a facilitator routine processes it, then `when_to_apply` is populated with "file upload tasks exceeding 10MB," `tools_needed` includes "write_memory," and `constraints` includes "chunk size must match S3 multipart minimum."
- Given a materialized workspace with TOON-encoded knowledge, when an agent reads the file, then activation fields are parseable as distinct keys (not buried in prose).
- Given a user edits the `when_to_apply` field in the UI, when the knowledge detail is reloaded, then the updated value persists.
- Given a knowledge item with no activation fields populated, when it is materialized, then the TOON file contains the body without activation sections (backward compatible).

**Plan calls.** Standard architecture pass — schema migration, facilitator routine for auto-population, TOON codec extension, API changes, and minimal UI for display/edit. Skip /design (structured sidebar display, not a new page).

**Contracts / constraints.**
- Activation fields are strategy-layer data — they live in `knowledge_strategy_fabric`, not the kernel table.
- The auto-population LLM call is cost-capped and runs as a facilitator routine, not inline with item creation.
- `tools_needed` references tool names from the skill-tool registry — it is not validated against the registry (tools may be added later).
- Activation fields are informational for agents — there is no runtime enforcement of `constraints`.

**Out of scope.**
- Executable activation (auto-running tools listed in `tools_needed`).
- Activation field search/filtering in the knowledge list API.
- Activation fields for L0/L1 items (only L2+ where curation justifies the LLM cost).

**Effort.** M (~6h)

---

### Y8 — Event-Driven Knowledge Hooks

**Workpackage.** As a factory operator, I want to attach knowledge-processing logic to any system event (task completion, session end, bet closure, knowledge conflict, routine trigger) — so that knowledge curation happens automatically in response to work, not only on fixed schedules.

**Depends on.** None. The event bus (A3), routine scheduler (C5), and facilitator infrastructure (G1) exist. This workpackage adds a hook registration system that connects events to knowledge-processing routines.

**Complexity.** L

**Acceptance criteria.**
- A `knowledge_hooks` table stores hook registrations: event type (enum of all system events), handler routine ID (FK to routines), filter expression (JSON — optional conditions on the event payload), enabled flag, and priority (for ordering multiple hooks on the same event).
- When a system event fires on the event bus, the hook dispatcher finds all enabled hooks matching that event type, evaluates filter expressions against the event payload, and enqueues matching routines for execution.
- At least these event types are hookable: `session.ended`, `task.completed`, `task.failed`, `bet.closed`, `knowledge.created`, `knowledge.conflict.detected`, `knowledge.promoted`, `routine.completed`.
- The settings UI includes a "Knowledge Hooks" section where users can view, create, enable/disable, and delete hooks.
- Hook execution respects the existing routine cost caps and concurrency limits.
- A hook execution log records which hooks fired, when, and whether the handler succeeded or failed.

**Validation scenarios.**
- Given a hook registered for `session.ended` with no filter, when any session ends, then the associated routine is enqueued for execution within 30 seconds.
- Given a hook registered for `task.completed` with filter `{ "team_id": "team-123" }`, when a task completes for team-456, then the hook does not fire.
- Given a user disables a hook in the settings UI, when the matching event fires, then the hook is skipped and no routine is enqueued.
- Given two hooks on the same event with priorities 1 and 2, when the event fires, then priority 1's routine is enqueued first.

**Plan calls.** Concept work needed: "Knowledge Hook" as a new primitive connecting the event bus to knowledge-processing routines. Architecture pass should design: the hook registration schema, the filter expression language (JSON predicate vs simple key-value match), the dispatcher integration with the event bus, and the execution log model. UI design needed for the hooks management section in settings.

**Contracts / constraints.**
- Hooks are asynchronous — they enqueue routines, never block the originating event.
- Filter expressions use simple JSON key-value matching against the event payload — no scripting language, no arbitrary code execution.
- Hook execution failures do not affect the originating event's outcome.
- The hook dispatcher is a single-pass evaluation — no chaining (hook A's output triggering hook B).

**Out of scope.**
- Webhook/external HTTP hooks (this is internal event-to-routine only).
- Hook templating (parameterizing the routine based on event payload — routines read context themselves).
- Visual hook builder (drag-and-drop event wiring).

**Effort.** L (~3d)

---

### Y9 — Company Knowledge Generation (L4 Synthesis)

**Workpackage.** As a founder or CEO, I want the Chief of Staff agent to actively synthesize cross-team patterns, recurring failures, and strategic insights into factory-level (L4) knowledge — so that company-wide principles emerge from real work instead of being manually written top-down.

**Depends on.** None. The Chief of Staff soul prompt (`docs/souls/chief-of-staff.md`), L4 factory scope (Q2 scope mutations), and promotion pipeline (G3) exist. This workpackage adds the synthesis routine and L4-specific generation logic.

**Complexity.** L

**Acceptance criteria.**
- A "company synthesis" routine runs on a configurable schedule (default: weekly) as the Chief of Staff agent.
- The routine queries all L2 (product) and L3 (practice) knowledge items created or promoted since the last run, grouped by topic.
- For each topic cluster with items from 2+ teams, the routine generates a candidate L4 (factory) knowledge item: a principle, anti-pattern, or strategic insight with citations linking to the source L2/L3 items.
- Generated L4 candidates enter the facilitator queue with status "needs-human" — they are never auto-promoted to "active" without human validation.
- Each candidate includes a "synthesis rationale" field explaining why this pattern is factory-level (cross-team, recurring, strategic impact).
- The routine produces a weekly synthesis digest: a summary of what was generated, what's pending human review, and what was validated since the last run.
- The synthesis digest is delivered via the existing notification adapter (H2) to the founder's configured channel.

**Validation scenarios.**
- Given team A and team B both have L3 practices about "chunk file uploads," when the weekly synthesis runs, then a candidate L4 principle "always chunk file operations" is generated with citations to both teams' practices.
- Given a generated L4 candidate, when a founder views the knowledge list filtered to factory scope, then the candidate appears with status "needs-human" and a synthesis rationale.
- Given no cross-team patterns exist this week (all new items are team-specific), when synthesis runs, then the digest reports "no new factory patterns detected" and no L4 candidates are created.
- Given the synthesis routine ran last Monday, when it runs again this Monday, then only items created/promoted since last Monday are analyzed.

**Plan calls.** Architecture pass should design: the synthesis prompt template (instructing the CoS agent on what constitutes factory-level knowledge), the clustering algorithm (topic-based grouping across teams), the digest format and delivery mechanism, and the "synthesis rationale" field on knowledge items. Skip /design (digest is plain text; L4 items use existing knowledge UI).

**Contracts / constraints.**
- L4 items always require human validation — the synthesis routine never sets status to "active."
- The synthesis routine runs as the Chief of Staff agent identity, not as a system daemon.
- The routine respects cost caps (C7) — if the budget is exhausted, synthesis is skipped with a log entry.
- Cross-team queries only read items the Chief of Staff has access to (respecting any future access control).

**Out of scope.**
- Real-time synthesis (this is batch, scheduled).
- L4 item editing or refinement (humans edit via the existing knowledge UI).
- Strategic planning or goal-setting (this generates knowledge, not work items).
- Cross-factory synthesis (multi-company patterns).

**Effort.** L (~3d)

---

### Y10 — Human Knowledge Authoring & Validation Queue

**Workpackage.** As a human CEO or team lead, I want to author knowledge directly, validate agent-proposed items from a prioritized queue, and annotate knowledge with my judgment — so that the knowledge base reflects both AI-discovered patterns and human expertise, and I spend my review time on the items that matter most.

**Depends on.**
- Q2 — Human-authored knowledge at any scope. Q2 establishes the API endpoints for human knowledge creation and scope mutation; Y10 builds the complete UX flow on top.

**Complexity.** L

**Acceptance criteria.**
- The knowledge section in the web UI includes a "Create" action that opens a full knowledge authoring flow: title, body (using the existing WYSIWYG editor from T1), scope selection (factory/team/personal), and optional topic/kind metadata.
- A "Review Queue" page shows all knowledge items with status "needs-human," ordered by attention score (highest first).
- Each item in the review queue shows: title, body preview, synthesis rationale (if generated by Y9), source citations, the proposing agent's identity, and action buttons: Validate (→ active), Edit & Validate, Reject (→ archived), and Defer.
- The review queue shows a count badge in the sidebar navigation indicating how many items await review.
- When a human validates an item, the `status` transitions to "active," the `updated_by` is set to the human user, and the `confidence` field in the strategy fabric is set to the maximum value.
- The queue filters by scope (factory/team) and by kind (principle/pattern/anti-pattern/decision).
- Keyboard shortcuts enable rapid queue processing: `v` to validate, `e` to edit, `r` to reject, `d` to defer, `j`/`k` to navigate.

**Validation scenarios.**
- Given a human clicks "Create" in the knowledge section, when they fill in title, body, and select "factory" scope, then a new knowledge item is created with status "draft" and the human as author.
- Given 5 items with status "needs-human" and varying attention scores, when the review queue loads, then items are ordered by attention score descending.
- Given a human presses `v` on an item in the review queue, then the item's status changes to "active," confidence is set to maximum, and the next item is focused.
- Given no items need review, when the review queue loads, then an empty state message says "All caught up — no items need your attention."

**Plan calls.** /design needed — the review queue is a new page with interaction-dense UX (keyboard nav, action buttons, queue progression). Architecture pass should design: the queue query (knowledge items WHERE status = 'needs-human' ORDER BY attention_score DESC), the authoring flow state management, and the keyboard shortcut system.

**Contracts / constraints.**
- The authoring flow uses the existing BodyEditor component (T1) — no new editor.
- Scope selection respects the user's team membership — a user cannot create factory-scope items unless they have the founder role.
- The review queue is server-side paginated (not client-side filtering of all items).
- Validation and rejection are single-click actions — no confirmation dialog (undo is available via the knowledge detail page).

**Out of scope.**
- Batch operations (validate/reject multiple items at once).
- AI-assisted authoring (suggesting content as the human types).
- Review assignment (routing specific items to specific humans).
- Mobile-optimized review queue.

**Effort.** L (~5d)

---

### Y11 — Memory Governance & Trust Scoring

**Workpackage.** As a factory operator, I want the system to detect anomalous knowledge mutations, score the trustworthiness of agent-contributed knowledge, and enforce rate limits on knowledge writes — so that a malfunctioning or compromised agent cannot corrupt the shared knowledge base.

**Depends on.**
- Y4 — Per-Fact Provenance Tracking. Composite trust scoring requires per-fact provenance to attribute trust to specific agent contributions; without provenance data, the governance layer can only apply coarse per-item policies, not fine-grained trust assessment.

**Complexity.** L

**Acceptance criteria.**
- Each agent (user with kind="ai") has a computed `trust_score` (0.0–1.0) derived from: ratio of validated vs rejected knowledge contributions, age of the agent, number of successful task completions, and number of governance violations.
- A rate limiter enforces a configurable maximum number of knowledge mutations per agent per hour (default: 50). Exceeding the limit blocks further writes and creates an alert in the facilitator queue.
- An anomaly detector flags knowledge mutations that are statistically unusual: items that are much larger than the agent's typical contributions, items that modify factory-scope knowledge (L4) from a non-facilitator agent, or a burst of mutations in a short window.
- Flagged anomalies appear in the facilitator's attention queue with a "governance alert" kind and the relevant evidence (which agent, what mutation, why it was flagged).
- The trust score is visible on the agent's profile page in the settings UI.
- Items contributed by agents with trust_score < 0.3 are auto-tagged with a "low-trust" indicator visible in the knowledge list and detail views.

**Validation scenarios.**
- Given an agent with 20 validated and 2 rejected contributions, when the trust score is computed, then it reflects the high validation ratio (e.g., > 0.8).
- Given an agent that has written 50 knowledge items this hour, when it attempts a 51st write, then the write is blocked and a rate-limit alert appears in the facilitator queue.
- Given an agent writes a 10,000-word knowledge item when its average is 200 words, when the anomaly detector runs, then a governance alert is created citing the size anomaly.
- Given an agent with trust_score 0.2, when it creates a knowledge item, then the item appears in the knowledge list with a "low-trust" badge.

**Plan calls.** Concept work needed: "Trust Score" as a computed attribute of agent users, and "Governance Alert" as a new item kind in the facilitator queue. Architecture pass should design: the trust score computation formula, the rate limiter implementation (in-memory vs DB-backed), the anomaly detection heuristics, and how governance integrates with the existing attention scoring engine.

**Contracts / constraints.**
- Trust scores are strategy-layer computed values — they are never stored on the kernel `users` table, only in a strategy extension or computed at query time.
- Rate limits apply to agent writes only — human writes are never rate-limited.
- Governance alerts do not block ongoing sessions — they flag for review, not terminate.
- The anomaly detector uses statistical heuristics, not LLM calls — it must be fast and deterministic.

**Out of scope.**
- Automatic agent suspension or termination based on trust score.
- Trust scores for human users.
- Network-level security (authentication, authorization — covered by E1/I2).
- Knowledge rollback (reverting a specific agent's contributions).

**Effort.** L (~5d)

---

### Y12 — Knowledge Graph Linking (Zettelkasten)

**Workpackage.** As a human or agent navigating the knowledge base, I want to create wiki-style links between knowledge items, see backlinks on every item, and traverse entity relationships — so that related knowledge is discoverable through its connections, not just through search.

**Depends on.** None. The knowledge items table, block derivation, and knowledge detail UI exist. This workpackage adds the linking primitive that was deferred in L24.

**Complexity.** L

**Acceptance criteria.**
- Knowledge item bodies support a `[[Item Title]]` wiki-link syntax that creates a navigable link to another knowledge item. The link resolves by title match (case-insensitive, exact match).
- Each knowledge item's detail view shows a "Backlinks" section listing all items that link to it, with title and a snippet of the linking context.
- A `knowledge_links` table stores directed edges: source_item_id, target_item_id, link_text, and block_id (which block in the source contains the link).
- Links are extracted automatically when a knowledge item is saved — the system parses `[[...]]` syntax from the body and creates/updates link records.
- Broken links (referencing a title that doesn't exist) are visually distinct in the rendered body (e.g., red text) and queryable via API (`?filter=broken_links`).
- The materialization engine includes backlink metadata in the TOON-encoded workspace files, so agents can discover related knowledge through connections.
- Agents can create links by writing `[[...]]` syntax in knowledge item bodies — no special tool needed.

**Validation scenarios.**
- Given knowledge item A contains `[[Deployment Practices]]` in its body, when item A is saved, then a link record is created from A to the item titled "Deployment Practices," and "Deployment Practices" shows A in its backlinks section.
- Given a link `[[Nonexistent Item]]` in a knowledge item body, when the item is rendered, then the link appears in red/dashed style indicating a broken link.
- Given item B has 3 backlinks, when item B's detail page loads, then the backlinks section shows all 3 linking items with context snippets.
- Given a materialized workspace, when an agent reads a TOON file for an item with backlinks, then the backlink metadata is present as structured key-value pairs.

**Plan calls.** Architecture pass should design: the `knowledge_links` table schema, the wiki-link parser (regex on `[[...]]` vs markdown AST extension), the backlink query (reverse join on knowledge_links), the broken-link detection mechanism, and the TOON encoding for backlink metadata. /design needed for the backlinks section UI on the knowledge detail page.

**Contracts / constraints.**
- Wiki-link syntax `[[...]]` is parsed on the read path during block derivation — the stored body is plain markdown with literal `[[...]]` text. No special markdown dialect.
- Link records are derived data — they can be fully reconstructed from the knowledge item bodies. Deleting and rebuilding the `knowledge_links` table must produce the same result.
- Backlink queries are indexed for performance — the knowledge_links table has indexes on both source and target.
- Links are unidirectional in storage but displayed bidirectionally (backlinks show the reverse).

**Out of scope.**
- Graph visualization (force-directed layout of knowledge connections).
- Transitive link discovery ("items 2 hops away").
- Automatic link suggestion ("these items might be related").
- Typed relationships (links are just "relates to" — no "depends on" or "contradicts" semantics).

**Effort.** L (~5d)

---

### Y13 — Anthropic Dreaming Protocol Adoption

**Workpackage.** As a factory operator, I want the between-session knowledge consolidation (Y2) to follow Anthropic's proven Dreaming protocol — collect session logs, detect cross-session patterns, restructure memory (create, modify, delete, promote), and validate changes — so that HyperIdle's consolidation benefits from the same approach that produced 6x task completion improvement at Harvey and 50% review time reduction at Wisedocs.

**Depends on.**
- Y2 — Dreaming Routines. Y2 builds the consolidation routine infrastructure and scheduling; Y13 refines the consolidation algorithm to follow the specific four-step Dreaming protocol rather than ad-hoc pattern detection.

**Complexity.** M

**Acceptance criteria.**
- The consolidation routine follows four explicit phases: (1) Collection — gather session logs, task outcomes, and new knowledge items since last run; (2) Detection — identify cross-session patterns, recurring observations, duplicates, and contradictions; (3) Restructuring — produce a structured change set: new items to create, existing items to modify, stale items to delete, items to promote; (4) Validation — verify each proposed change against existing knowledge for consistency before applying.
- The restructuring phase outputs a "change set" data structure, not individual mutations — enabling atomic review (a human or facilitator can approve/reject the entire consolidation batch).
- The validation phase checks for: internal consistency (no two items in the change set contradict each other), external consistency (no proposed item contradicts an existing active item without creating a conflict review), and completeness (no proposed deletion removes an item that other items depend on via citations).
- Consolidation runs produce a "dreaming report" that summarizes: sessions analyzed, patterns detected, changes proposed, changes applied, changes deferred to human review.
- In multi-team deployments, the dreaming protocol can run per-team (Product Manager agent) or cross-team (Chief of Staff agent), with team-scoped runs processing only that team's knowledge.

**Validation scenarios.**
- Given 10 completed sessions across 3 tasks, when the dreaming consolidation runs, then the collection phase assembles all 10 session traces, the detection phase identifies 2 recurring patterns, the restructuring phase proposes 2 new L2 items and 1 merge, and the validation phase confirms no contradictions.
- Given a restructuring change set that proposes deleting item X which is cited by item Y, when the validation phase runs, then the deletion is flagged as inconsistent and deferred to human review.
- Given a team-scoped dreaming run for team A, when it completes, then only team A's knowledge items and sessions were analyzed — team B's data was not touched.

**Plan calls.** Architecture pass should design: the change set data model, the validation rules engine, the per-team vs cross-team scoping mechanism, and how the dreaming report integrates with the notification adapter (H2). Research Anthropic's published Dreaming protocol documentation for implementation details.

**Contracts / constraints.**
- The four phases are sequential within a single run — no parallelism between phases.
- The change set is proposed, not applied, until validation passes. Failed validation items are routed to the facilitator queue.
- The dreaming report is stored as a knowledge item (kind: "report", layer: L1) for audit purposes.
- The protocol does not modify model weights or fine-tune agents — it writes learnings as structured knowledge items.

**Out of scope.**
- Cross-factory dreaming (multi-company consolidation).
- Real-time dreaming during sessions.
- Integration with Anthropic's managed agent Dreaming feature (this is a self-hosted implementation).

**Effort.** M (~6h)

---

### Y14 — Team-Level Shared Context (Third Brain Pattern)

**Workpackage.** As a team of humans and agents collaborating on a product, I want a curated, concise context layer that captures our team's specific conventions, decisions, and working patterns — automatically maintained and injected into every team member's session — so that new agents and humans joining the team ramp up instantly and the team's institutional knowledge is never lost.

**Depends on.** None. The team management (C4), knowledge scoping (Q2), and materialization engine (B2) exist. This workpackage adds a specific materialization pattern inspired by Meta's "Third Brain" deployment (0→63K users, 50+ specialized agents mapping tribal knowledge).

**Complexity.** L

**Acceptance criteria.**
- Each team has a "team context" — a curated, auto-generated knowledge item (kind: "context", scope: team) that summarizes the team's active conventions, decisions, and working patterns in under 1000 tokens (~35 lines).
- The team context is regenerated weekly (or on-demand) by a facilitator routine that reads all active L2 (product) and L3 (practice) knowledge items scoped to the team and distills them into a concise summary.
- The team context is automatically injected into every agent session for that team during prompt composition — it appears in the soul prompt's context section, not as a workspace file.
- The team context includes: team name, active bet titles, key conventions (top 5 by relevance score), recent decisions (last 2 weeks), and known anti-patterns.
- A "Team Context" card is visible on the team page in the web UI, showing the current context with a "Regenerate" button.
- Humans can edit the team context directly — manual edits are preserved until the next regeneration, at which point the facilitator routine merges manual additions with the auto-generated content.
- The token budget for team context injection is capped at 1000 tokens, separate from the existing knowledge materialization budget.

**Validation scenarios.**
- Given a team with 15 active knowledge items, when the team context regeneration runs, then a single context item is created/updated with under 1000 tokens summarizing the team's key practices.
- Given a new agent joins the team and starts a session, when prompt composition runs, then the team context appears in the agent's soul prompt without any manual configuration.
- Given a human manually adds "We always use UTC timestamps" to the team context, when regeneration runs next week, then the manual addition is preserved in the regenerated output.
- Given a team with no active knowledge items, when the team context page loads, then it shows an empty state: "No team context yet — knowledge will be summarized as your team works."

**Plan calls.** Architecture pass should design: the regeneration prompt template, the merge strategy for manual edits (LLM-assisted merge vs append-only), the injection point in prompt-composition.ts, and the separate token budget allocation. Skip /design (team context card is a simple read-only display with one action button).

**Contracts / constraints.**
- The team context is a knowledge item (stored in `knowledge_items` with scope_kind="team"), not a separate table.
- Regeneration is an LLM call cost-capped per run via C7.
- The 1000-token cap is enforced at write time — the regeneration routine truncates if needed.
- Team context injection happens after soul prompt and before task context in the prompt composition order.

**Out of scope.**
- Per-user context (personal conventions for individual agents or humans).
- Cross-team context (that's L4/factory level, covered by Y9).
- Context inheritance (team context flowing into sub-teams).

**Effort.** L (~3d)

---

### Y15 — Knowledge Item Packaging (MemCube Pattern)

**Workpackage.** As the knowledge fabric, I want each knowledge item to be a self-contained package that bundles its content with all metadata needed for governance, materialization, and provenance — so that items can be moved, cached, exported, and evaluated independently without querying back to the database for context.

**Depends on.** None. The knowledge items kernel table and strategy fabric extension exist (O2). This workpackage defines a packaging format that wraps both layers into a single portable unit.

**Complexity.** M

**Acceptance criteria.**
- A "knowledge package" format is defined that bundles: kernel fields (title, body, scope, status, version), strategy fields (layer, kind, attention, relevance, confidence), provenance metadata (author, last editor, creation date, edit count), governance metadata (trust score if Y11 exists, validation history), and relationship metadata (backlinks if Y12 exists, citations).
- The packaging format is a JSON schema (not a new file format) that can be serialized to a single JSON document or a TOON-encoded file.
- The knowledge export API supports a `?format=package` parameter that returns knowledge items in the packaged format instead of the flat API response.
- The materialization engine can optionally write packaged items to the workspace instead of raw markdown files — configurable per team via factory settings.
- Packaged items achieve measurable token savings: the TOON-encoded package format uses fewer tokens than the equivalent markdown file + separate metadata, validated by a benchmark test.
- The packaging format is versioned (includes a `package_version` field) so future format changes can be migrated.

**Validation scenarios.**
- Given a knowledge item with kernel fields, strategy fields, and 3 backlinks, when the API is called with `?format=package`, then the response contains a single JSON document with all fields bundled and a `package_version` field.
- Given a packaged item serialized to TOON, when the token count is compared to the equivalent markdown file, then the package uses fewer tokens (validated by a test that compares both formats for 10 representative items).
- Given a team with packaged materialization enabled, when a session is provisioned, then workspace knowledge files are TOON-encoded packages instead of raw markdown.

**Plan calls.** Standard architecture pass — JSON schema definition, TOON codec extension for the package format, API response format, materialization option, and a benchmark test for token savings. Skip /design (no UI changes).

**Contracts / constraints.**
- The package format is additive — it wraps existing data, does not change how it is stored in the database.
- The TOON package format is a superset of the existing TOON encoding, maintaining backward compatibility.
- Optional fields (provenance, governance, relationships) are omitted from the package when the source data does not exist (e.g., no trust score if Y11 is not shipped).
- The benchmark test is a vitest test that runs against sample data, not a runtime performance test.

**Out of scope.**
- Package import (creating knowledge items from packages — that's a separate workpackage for company portability).
- Package signing or encryption.
- Package streaming (packages are serialized atomically).

**Effort.** M (~6h)

---

### Y16 — Reactive Knowledge Updates (Auto-Linking)

**Workpackage.** As a knowledge base that improves over time, I want new knowledge items to automatically trigger updates to related existing items — adding cross-references, flagging potential contradictions, and strengthening corroborating evidence — so that the knowledge graph stays connected and current without manual curation of every relationship.

**Depends on.**
- Y12 — Knowledge Graph Linking. Y12 establishes the wiki-link infrastructure and backlinks system; Y16 adds the automatic reactive behavior where new items trigger link creation and related-item updates.

**Complexity.** L

**Acceptance criteria.**
- When a new knowledge item is created, a "reactive update" routine runs that: (a) searches for related existing items by topic, body similarity, and scope overlap; (b) for each related item found, determines the relationship type: corroborating (similar claim), contradicting (conflicting claim), or extending (adds detail to an existing item); (c) creates appropriate actions: add a wiki-link from the new item to the related item, flag contradictions as conflict reviews, or add a corroboration citation to the related item's metadata.
- The reactive update uses an LLM call to classify relationships (corroborating/contradicting/extending) — keyword matching alone is insufficient for semantic relationship detection.
- Reactive updates are logged: each automatic link or conflict flag includes a `created_by: "reactive_update"` attribution so humans can distinguish automatic links from manually created ones.
- Reactive updates respect a configurable similarity threshold (default: top 5 most-related items are evaluated per new item) and a cost cap per update.
- The reactive update routine can be disabled per team via factory settings.
- When a reactive update proposes a contradiction, it creates a conflict review item (using the existing conflict resolution system from B5) rather than modifying either knowledge item.

**Validation scenarios.**
- Given an existing knowledge item about "always chunk file uploads" and a new item about "file upload best practices including chunking," when the reactive update runs, then a wiki-link is created from the new item to the existing item and a corroboration citation is added to the existing item.
- Given an existing item saying "use gzip compression" and a new item saying "use brotli compression instead of gzip," when the reactive update runs, then a conflict review is created linking both items.
- Given reactive updates disabled for team X, when a new knowledge item is created in team X, then no reactive update routine runs.
- Given 3 related items found for a new item, when the reactive update processes them, then each relationship is logged with `created_by: "reactive_update"` in the link or conflict record.

**Plan calls.** Architecture pass should design: the similarity search mechanism (FTS vs embedding similarity vs LLM-based), the relationship classifier prompt, the cost model for reactive updates (LLM call per new item), and integration with the conflict resolution system (B5). Concept work may be needed on "Reactive Update" as a specialized routine type.

**Contracts / constraints.**
- Reactive updates are asynchronous — they do not block the creation API response.
- The LLM classification call is cost-capped per item creation.
- Reactive updates never modify existing item bodies — they only create links, citations, and conflict reviews.
- The similarity search uses the existing FTS infrastructure as a first pass; LLM classification is applied only to the top candidates.

**Out of scope.**
- Automatic body merging (combining two items into one).
- Transitive reactive updates (item A triggers update to B, which triggers update to C).
- Reactive updates on item edits (only on new item creation).

**Effort.** L (~3d)

---

### Y17 — Cost Intelligence & Efficiency Learning

**Workpackage.** As a factory that gets smarter over time, I want the system to analyze cost and token data across sessions, identify efficiency patterns, predict task costs, and feed cost insights back into knowledge and agent configuration — so that the company becomes progressively cheaper and more accurate at budgeting instead of just enforcing static caps.

**Depends on.** None. The cost tracking infrastructure (C7/L17), session outcomes with cost/token data, and knowledge fabric exist. This workpackage adds the analytical and learning layer that closes the loop between cost data collection and cost optimization.

**Complexity.** L

**Acceptance criteria.**
- A "cost intelligence" routine runs weekly (configurable) that analyzes session cost data and produces actionable insights as knowledge items (kind: "cost_insight", scope: team or factory).
- The routine identifies efficiency patterns: (a) which agents are cost-efficient vs expensive for similar tasks (normalized by task complexity), (b) which knowledge items, when loaded into sessions, correlate with lower session costs (cost impact of knowledge), (c) which task types consistently exceed their budget estimates, (d) which harness/model tier combinations are most cost-effective per task type.
- The routine generates budget predictions for new tasks: based on historical cost data for similar tasks (same team, similar description, same agent role), predict the expected cost range (p25/p50/p75) and surface this prediction in the task creation flow.
- Cost predictions are shown in the task creation form as a hint: "Based on 15 similar tasks, estimated cost: $0.30–$0.80 (median $0.50)."
- A "Cost Efficiency" section on the team Work page shows: average session cost trend (last 4 weeks), cost per successful task vs failed task, total spend this month vs last month, and top-3 cost optimization recommendations from the latest cost intelligence run.
- Cost intelligence insights that identify reusable efficiency patterns (e.g., "loading the file-chunking practice reduces session cost by 40%") are flagged for promotion to L3 practices with a "cost_impact" annotation on the knowledge strategy fabric.

**Validation scenarios.**
- Given 50 completed sessions for a team across 4 weeks, when the cost intelligence routine runs, then it produces 2-4 cost insight knowledge items identifying the most and least cost-efficient agents and task patterns.
- Given a user creating a new task with description "implement file upload," when the creation form loads, then a cost prediction hint appears based on similar past tasks: "Estimated: $0.30–$0.80."
- Given a cost insight that "loading practice 'always chunk file uploads' correlates with 40% lower session costs," when the team Work page loads, then the Cost Efficiency section includes this as a recommendation.
- Given the cost intelligence routine identifies that model tier "fast" is 60% cheaper than "balanced" for code review tasks with no quality difference, when the agent configuration is viewed, then a recommendation suggests switching code review agents to the "fast" tier.

**Plan calls.** Architecture pass should design: the cost analysis queries (aggregation across sessions, tasks, agents, knowledge items), the prediction model (simple percentile-based from historical data, no ML), the cost_impact annotation schema on knowledge_strategy_fabric, and the task creation form integration for predictions. Skip /design for the Cost Efficiency section (uses existing card patterns).

**Contracts / constraints.**
- Cost predictions use simple statistical methods (percentiles from historical data) — no machine learning models or external services.
- The cost intelligence routine is an LLM call (to analyze patterns and generate natural-language insights), cost-capped per run.
- Cost insights are knowledge items — they flow through the same promotion pipeline and attention scoring as other knowledge.
- The prediction hint in the task creation form is informational — it does not enforce a budget. Budget enforcement remains with C7.
- The `cost_impact` annotation is a new nullable numeric field on `knowledge_strategy_fabric` — positive values mean the item reduces session costs when loaded.

**Out of scope.**
- Automatic agent reconfiguration based on cost insights (recommendations only, human decides).
- Real-time cost optimization during sessions (this is between-session analysis).
- Cross-factory cost benchmarking.
- ML-based prediction models (simple percentiles are sufficient for v1).

**Effort.** L (~5d)
