# Track AD: Fix & Simplify

Wire what's broken, remove what hurts, make the core loop work. Derived from the June 2026 feature-journey audit (code-verified). The codebase is solid — the gaps are dead wiring, broken promises, and overbuilt features.

**Scope:** Fix the Plan > Interact > Review > Repeat loop. Remove features that add complexity without value. Wire tested backends to rendered UIs. No new capabilities — those are in Track AE (Expand & Polish).

**Constraint:** `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### AD1 — Wire Review Routing to Humans

**Workpackage.** As a founder reviewing agent work, I want review items created by agents to appear in my conversation queue, so that I can actually see and verdict on the work my agents produce. As a second founder on the same factory, I want reviews routed to me based on my team ownership, so that each founder sees the reviews relevant to their domain.

**Why this matters.** The review flow is the daily driver — the single most important interaction between humans and agents. Currently, when an agent creates a review item, the thread participants are hardcoded to `[agentId]` only. Humans are never added. The `resolveReviewRecipients()` function exists, is tested, and works — but is never called. This means every review item goes to nobody. The entire Plan > Interact > Review > Repeat loop is broken at the Review step. Without this fix, the product is unusable for its core purpose.

**What exists today.** `resolveReviewRecipients()` in `org-routing.ts` queries `org_edges` by 3 mechanisms (direct/function/team), deduplicates, falls back to all humans if no edges match. P2 tests pass comprehensively. Thread participant filtering works — `GET /api/threads?participant_id=<userId>` correctly returns only threads where the user is a participant. The IDOR vulnerability (participant_id not validated against auth identity) is documented and deferred.

**What's genuinely missing.** Two call sites need to invoke `resolveReviewRecipients()` and add the returned human IDs to thread participants: `create-item.ts` (line 75) and `session-review-creator.ts`. Additionally, the threads API should validate that `participant_id` matches the authenticated user to close the IDOR vulnerability.

**Depends on.** None.

**Complexity.** S

**Acceptance criteria.**
- When an agent creates a review item, the resulting thread includes the appropriate human(s) as participants — determined by `resolveReviewRecipients()` based on org_edges.
- When no org_edges match, all human users are added as participants (the fallback behavior already in `resolveReviewRecipients()`).
- When a founder queries their conversation queue, review threads created by their team's agents appear in the list.
- The threads API validates that the `participant_id` query parameter matches the authenticated user, returning 403 for mismatches (IDOR fix).

**Validation scenarios.**
- Given founder A owns team "Tech" via org_edges, when a tech builder agent creates a review item, then founder A sees it in their conversations.
- Given no org_edges exist, when any agent creates a review item, then all human users see it.
- Given founder A's API key, when querying `GET /api/threads?participant_id=<founderB_id>`, then the response is 403.

**Plan calls.** Standard architecture pass — identify the exact insertion points, the context threading needed to pass db + agent role + team ID to the routing function, and the IDOR validation middleware.

**Contracts / constraints.**
- The fallback (all humans) must be preserved — removing it would silently break factories without org_edges configured.
- Thread participant arrays must remain sorted and deduplicated (existing convention).
- IDOR fix must not break local-mode single-founder setups where participant_id validation would be against the only user.

**Out of scope.**
- Multi-human approval quorum (first-verdict-wins is acceptable for now).
- Review routing UI in settings (org_edges CRUD already exists in SettingsOrgChart).
- Notification delivery for new reviews (H2 notification system handles this separately).

**Effort.** S (~2h)

---

### AD2 — Task-to-Session Dispatcher

**Workpackage.** As a founder who writes bets, I want tasks to automatically trigger agent sessions when they're ready for work, so that the flow from "I shaped what I want" to "agents are building it" happens without manual intervention. Humans write bets, agents decompose into tasks, tasks auto-provision sessions — no "Run" button.

**Why this matters.** The session provisioning orchestrator is production-ready (11 phases, 4 harness adapters, cost tracking). But nothing triggers it for ad-hoc tasks. Routines have a scheduler; tasks don't. When an agent decomposes a bet into tasks with `ownerAgentId`, nothing picks them up. The entire Interact phase of the wedge (Plan > Interact > Review > Repeat) is broken — agents literally cannot start working on tasks. This is the #1 gap blocking the product from being usable end-to-end.

**What exists today.** `POST /api/sessions { agentId, taskId, modelTier }` runs the full provisioning chain. Task state machine handles proposed → accepted → in_progress → done. Routine scheduler (`builtin-routines.ts`) calls `provisionSession()` for recurring work. Handoff protocol (`handoff-protocol.ts`) creates subtasks with `ownerAgentId`. LocalWorkspaceAdapter spawns isolated directories. BuiltinHarnessAdapter runs direct LLM loops. Multi-provider model gateway resolves credentials.

**What's genuinely missing.** A dispatcher service that watches for tasks ready for execution (state=accepted with ownerAgentId set, or state transitions triggered by bet commitment) and provisions sessions automatically. Also: clarity on what non-coding tasks look like — what workspace, tools, and harness configuration does a marketing or content task need versus a development task?

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- When a bet is committed and agents decompose it into tasks, sessions are automatically provisioned for tasks that have an assigned agent — no manual trigger needed.
- When an agent creates a subtask via handoff with `ownerAgentId`, the receiving agent's session is automatically provisioned.
- The dispatcher respects cost caps — if an agent, team, or factory is at capacity, tasks queue rather than fail.
- The dispatcher respects concurrency limits — agents don't exceed `maxConcurrentSessions`.
- Non-coding tasks (marketing, content, service) can be dispatched to appropriate harnesses with workspace configurations that don't assume a git repository.
- The dispatcher is observable — a founder can see queued tasks waiting for capacity.

**Validation scenarios.**
- Given a founder commits a bet, when the PM agent decomposes it into 3 tasks with assigned agents, then 3 sessions are provisioned (respecting concurrency limits).
- Given agent A hands off a subtask to agent B, when the subtask is created, then agent B's session starts automatically.
- Given an agent is at its `maxConcurrentSessions` limit, when a new task is assigned to it, then the task queues until a slot opens.
- Given a marketing team, when a content task is dispatched, then the session provisions with a workspace and harness appropriate for non-code work.

**Plan calls.** Standard architecture pass. Key design decisions: polling vs event-driven dispatch, queue data structure (in-memory vs BullMQ), non-code workspace shape, harness selection for non-technical tasks. The multi-harness positioning (Claude for code, ChatGPT for content, Gemini for marketing) should be documented as part of this work.

**Contracts / constraints.**
- Must reuse the existing `provisionSession()` orchestrator — no parallel execution path.
- Must integrate with the existing cost-cap system (C7) — dispatch is a consumer, not a bypass.
- Non-code workspaces must not require `git` or a repository path.
- The dispatcher must be idempotent — restarting it doesn't duplicate sessions for already-dispatched tasks.

**Out of scope.**
- Priority ordering of queued tasks (FIFO is fine for v1).
- Human-triggered session start (this is agent-driven, not button-driven).
- New harness adapters (existing builtin/claude-code/CLI adapters are sufficient).

**Effort.** L (~3d)

---

### AD3 — Single-User UX Polish

**Workpackage.** As a solo founder with one team and a few agents, I want the UI to feel clean and purposeful — not cluttered with multi-team features I don't use — so that every element on screen earns its space and I can focus on what matters.

**Why this matters.** The primary user (solo AI founder) has one team. Five specific UI elements add friction: team pill filters in portfolio (noise with 1 team), team sidebar list (clickable switcher to nowhere), org chart settings (meaningless solo), knowledge scope dropdown (7 options where 3 suffice), notification toggles (4 where 2 matter). Each is a small paper cut, but combined they make the product feel enterprise-heavy for its core user. The fix is conditional hiding — show these elements only when the user's factory has grown to need them.

**What exists today.** Bet/task/agent creation already auto-resolves team when `teams.length === 1` (good pattern to extend). Empty states hide filters until data exists. The UI correctly adapts in some places but not others.

**What's genuinely missing.** Consistent conditional rendering based on team count and human count across 5 surfaces: WorkPortfolio team pills, Sidebar team list, SettingsOrgChart, KnowledgeCreate scope picker, SettingsNotifications toggles.

**Depends on.** None.

**Complexity.** S

**Acceptance criteria.**
- With 1 team, the sidebar Work section auto-navigates to the team page instead of showing a 1-item team list.
- Portfolio page removal is handled by AD9 — this workpackage focuses on the remaining 3 simplification points.
- With 1 human user, the Org Chart settings section is hidden or shows a contextual message instead of an empty edge table.
- With 1 team, the knowledge scope picker shows simplified options (Shared / Personal / contextual scopes like bet/task) instead of all 7 scope kinds.
- With a solo user, notification settings show only the 2 most relevant toggles (reviews, cost alerts).

**Validation scenarios.**
- Given a factory with 1 team, when the portfolio loads with 3 bets, then no team filter pills appear.
- Given a factory with 2 teams, when the portfolio loads, then team filter pills appear for both teams.
- Given a solo founder, when they open Settings, then the Org Chart section is not visible.

**Plan calls.** Standard architecture pass — enumerate the 5 components, define the threshold conditions, plan the conditional rendering.

**Contracts / constraints.**
- Conditional hiding must be based on runtime data (API response counts), not configuration flags.
- When a user adds a second team, the hidden elements must appear without a page reload (reactive).
- No features are removed — they're hidden until the context justifies them.

**Out of scope.**
- Redesigning the scope model itself (the 7 scope kinds remain in the database).
- Settings restructuring beyond the 5 identified friction points.

**Effort.** S (~2h)

---

### AD4 — Remove Autonomy Product & Simplify Trust Model

**Workpackage.** As a founder, I want trust in my agents to be based on what they produce (reviews and knowledge quality), not on a per-skill autonomy spreadsheet I can't understand or edit — so that the system feels transparent rather than bureaucratic.

**Why this matters.** The June 2026 feature audit found the Autonomy product is overbuilt and non-functional: the AgentProfile shows a read-only skills table with 50+ autonomy level cells that can't be edited, success/failure tallies that are never incremented, and a graduation system that doesn't exist. The per-agent-per-skill model is the wrong granularity — agents have full tool access and get their output judged via review verdicts. Knowledge items (which include skills) get scored by the strategy layer. Per-skill autonomy levels add complexity without value. The entire Autonomy product should be removed.

**What exists today.** `userSkills` table with `autonomyLevel`, `successCount`, `failureCount`, `promotedAt`, `lastUsedAt`. Policy engine reads `autonomyLevel`. PATCH endpoint for manual level changes. AgentProfile page renders read-only skills table. None of the tracking columns are ever written in production.

**What's genuinely missing.** Nothing needs to be built — things need to be removed. The trust model should simplify to: agents have full tool access, their output goes through review (the existing verdict system), and the strategy layer scores knowledge items and review outcomes to surface agents that need attention. The skills table, autonomy levels, and graduation concept should be removed from the UI. The policy engine's trust signal should derive from review verdict history, not from a manually-managed autonomy level.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- The AgentProfile page no longer shows a per-skill autonomy table.
- The per-skill success/failure tallies are not visible to users anywhere.
- The policy engine's decision on whether to auto-resolve or escalate to review is based on review verdict history (approve rate) and knowledge-item scoring, not on a manually-assigned autonomy level.
- A founder can see an agent's review track record (approval rate, recent verdicts) on the agent profile — this is the trust signal, not a number 1-4.
- The `userSkills` table may remain in the schema for future use but is not surfaced in any UI.

**Validation scenarios.**
- Given an agent's profile page, when the skills section loads, then no autonomy level numbers or success/failure counts are visible.
- Given an agent with a 95% approval rate over 20 reviews, when the policy engine evaluates a new low-risk review, then the review is auto-resolved without human intervention.
- Given an agent with 3 recent rejections, when the policy engine evaluates a new review, then the review is escalated to human regardless of risk tier.

**Plan calls.** `/concept` needed to define the simplified trust model — what signals replace per-skill autonomy, how review history feeds the policy engine, what threshold logic governs auto-resolve vs escalate.

**Contracts / constraints.**
- The `userSkills` table schema is not deleted (migration risk) — only UI surface and policy-engine reads are changed.
- The existing review/verdict system remains the source of truth for trust.
- The policy engine must remain configurable (thresholds in factory settings).

**Out of scope.**
- Knowledge-item quality scoring (existing attention-scoring handles this).
- Per-agent cost caps or spending limits (separate concern in Cost & Budget).

**Effort.** M (~4h)

---

### AD5 — Wire Dead Strategy Layer & Cost Visibility

**Workpackage.** As a founder running HyperIdle, I want the features that are already built and tested to actually work — routines fire on schedule, task dependencies auto-unblock and trigger new sessions, notification preferences persist, cost data shows real numbers not zeros, and I can see at a glance what needs attention from any view — so that the product delivers on what the UI already promises.

**Why this matters.** The June 2026 code audit found a systemic pattern: professionally built backends with tested logic that are never called in production. The routine scheduler (`startRoutineScheduler()`) is complete with cron parsing, cost caps, delegation, and sleep-time support — but `bootstrapFabric()` never calls it. The dependency watcher (`checkAndUnblockDependents()`) has 13 test cases — but is never invoked from task transition routes. Notification settings have a working PATCH endpoint — but `SettingsNotifications.tsx` uses `useState` only. Blocking/unread counts exist in the API — but the sidebar only shows a knowledge triage badge. Each is a 2-30 line fix. Together they unlock half the feature surface.

**What exists today.** `startRoutineScheduler()` in `packages/fabric/src/services/routine-scheduler.ts` — tested, with cron parsing, cost-cap checking, delegation, and sleep-time enforcement. `checkAndUnblockDependents()` in `packages/server/src/services/dependency-watcher.ts` — tested with SQL pre-filter and race-condition handling. `PATCH /api/settings` in `packages/server/src/routes/settings.ts` — persists to `server_config`. `useSettings().save()` hook in web. `GET /api/rail` returns `blockers` array with blocked task count. Bet pause/resume buttons exist in `WorkBet.tsx` with consequence dialogs — but POST endpoints `/pause`, `/resume`, `/activate` don't exist.

**What's genuinely missing.** Five wiring calls: (1) Call `startRoutineScheduler()` in `bootstrapFabric()` and manage its disposer. (2) Call `checkAndUnblockDependents(completedTaskId)` when a task transitions to `done`, and when unblocked dispatch a session for the newly accepted task. (3) Import `useSettings` in `SettingsNotifications` and call `save()` on toggle change. (4) Add blocking/unread count badges to the Conversations and Work sidebar section headers. (5) Either add bet pause/resume/activate endpoints or remove the UI buttons.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Routines with cron schedules fire automatically without manual "Trigger Now" — the scheduler runs in production.
- When a task transitions to `done` and a downstream task's last dependency clears, the downstream task auto-transitions from `hold` to `accepted` and a session is dispatched for it.
- Notification preferences set in Settings persist across page refresh and browser restart.
- The sidebar shows a count badge on the Conversations section header indicating blocking threads, visible from any view (Work, Knowledge).
- Bet pause/resume either works end-to-end (buttons → endpoints → state change) or the buttons are removed from the UI.
- Cost values on the Work team page show real spend (not zeros) — daily spend, cost against cap, per-agent breakdown.
- Cost is populated from session cost accumulation in the fabric layer.

**Validation scenarios.**
- Given a routine with a cron schedule of "every hour," when 1 hour passes, then a routine run is created and a session provisioned without manual trigger.
- Given task A depends on task B, when task B transitions to `done`, then task A auto-transitions to `accepted` and a session starts for task A's owner agent.
- Given a founder sets "cost alerts: off" in notification settings and refreshes the page, then the toggle remains off.
- Given 2 threads are blocking agents, when the founder is on the Work page, then the Conversations sidebar label shows "(2)" badge.
- Given a founder clicks "Pause" on a bet, then the bet transitions to a paused state (or the Pause button is not visible).
- Given a team with 2 agents that have run sessions, when the team Work page loads, then cost shows non-zero daily/weekly spend.
- Given an agent with $20 in session costs, when the team roster loads, then the agent row shows $20.

**Plan calls.** Standard architecture pass — enumerate the 5 insertion points, identify the exact function calls, and plan the bet pause/resume decision (add endpoints vs remove buttons).

**Contracts / constraints.**
- Routine scheduler must be stoppable via the existing disposer pattern in `APP_DISPOSERS`.
- Dependency watcher + session dispatch must be idempotent — restarting the server doesn't duplicate sessions.
- Sidebar badges must update reactively (WebSocket push or polling), not just on page load.
- Bet pause/resume: if adding endpoints, follow the existing kill endpoint pattern (POST with reason, state machine transition).

**Out of scope.**
- New notification delivery channels (email, push — H2 handles those).
- Routine UI redesign (existing RoutineCreateDialog is sufficient).
- Priority ordering of dispatched tasks (FIFO is fine).

**Effort.** M (~6h)

---

### AD6 — Knowledge Cleanup & Scope Simplification

**Workpackage.** As a founder creating and curating knowledge, I want the knowledge system to feel like a simple wiki with tags — not a taxonomy research project — so that I spend my time writing useful knowledge instead of classifying it into the right scope/kind/status bucket.

**Why this matters.** The June 2026 audit found the knowledge system is overbuilt for its users: 7 scope kinds where 3 suffice (company / team / personal), 8 kind badges that create classification paralysis, dead UI buttons (flag/archive do nothing on click), and merge/split buttons that belong to agent-driven workflows not human UI. The scope and topic distinction is confusing (scope = who owns it, topic = what it's about — but both look like tags). The "flag for revisit" concept (sets status to draft) is unclear. The system works well architecturally but the user-facing classification burden needs simplification.

**What exists today.** `knowledgeItems` table with `scopeKind` (7 values: factory, product, practice, team, bet, task, user), `topic` (freeform string), `status` (4 values: draft, active, archived, needs_human). `knowledgeStrategyFabric` with `kind` (8 values on fabric, 4 exposed in creation UI). KnowledgeList with scope filter pills, kind badges, status badges. KnowledgeDetail overflow menu with Flag and Archive buttons (onClick stubs — do nothing). Merge/Split API endpoints work but have no UI. `ScopeChangeDialog` works end-to-end.

**What's genuinely missing.** A simplification pass: (1) Reduce user-facing scopes to 3 meaningful choices (shared/team/personal) with the backend mapping to the right scopeKind. (2) Evaluate whether kind classification adds value or should be removed from user-facing surfaces (agents can still tag internally). (3) Remove dead buttons (flag, archive) from the UI — archive should be simple delete-with-undo, flag should happen through conversation with an agent. (4) Remove merge/split buttons — these are agent actions triggered via thread discussion, not manual UI operations. (5) Clarify topic vs scope in the UI.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- When creating a knowledge item, the scope picker offers 3 clear choices that any user understands without domain knowledge: shared (visible to all agents), team-specific, or personal/private.
- The knowledge list view does not show dead buttons that do nothing on click.
- Archiving a knowledge item is a simple action (delete with undo or explicit archive) that works end-to-end, not a stub.
- The distinction between scope (who can see it) and topic (what it's about) is clear in the UI — or topic and scope are unified into a single tagging model.
- Kind classification is either removed from user-facing surfaces (agents handle internally) or simplified to a meaningful set that users can choose without training.

**Validation scenarios.**
- Given a founder creating a knowledge item, when they reach the scope picker, then they see 3 options with clear labels (not 7 technical scope kinds).
- Given a founder views a knowledge item's overflow menu, then no button exists that does nothing on click.
- Given a founder wants to archive a knowledge item, when they perform the archive action, then the item disappears from the active list.
- Given a founder browses the knowledge list, then the distinction between how items are grouped (topic) and who owns them (scope) is self-evident.

**Plan calls.** `/concept` needed — this reshapes the knowledge-item classification model (scope, kind, topic). The concept pass should answer: do we keep kind? Do we merge topic into scope as tags? What 3 scope labels map to which backend scopeKinds? Then standard architecture pass.

**Contracts / constraints.**
- The backend `scopeKind` enum stays as-is (7 values) — only the user-facing presentation changes.
- Agent-created knowledge items can still carry all 8 kinds internally (strategy fabric).
- The merge/split API endpoints remain available for agent use — only UI buttons are removed.
- Existing knowledge items must not require migration.

**Out of scope.**
- Knowledge fabric scoring changes (attention/relevance scoring stays as-is).
- Knowledge materialization changes (workspace layout stays as-is).
- Progressive disclosure of the full taxonomy at high item counts (separate UX concern).

**Effort.** M (~6h)

---

### AD7 — Search Backend

**Workpackage.** As a founder looking for something, I want Cmd+K search to actually find things across conversations, bets, and knowledge items — so that the search modal that opens every time I press Cmd+K delivers results instead of "Search coming soon."

**Why this matters.** The search UI is fully built: `GlobalSearchPanel` opens with keyboard navigation, debounced input, grouped results by type, and route-ID sanitization. The `useGlobalSearch` hook calls `GET /api/search?q=...`. But no `/api/search` route exists — every search returns 404 and shows "Search coming soon." This is a broken promise the user encounters every time they reach for search. For a product targeting power users who use keyboard shortcuts, a non-functional Cmd+K is a daily frustration.

**What exists today.** `GlobalSearchPanel.tsx` — full UI with FocusTrap, keyboard nav (j/k/Enter/Escape), grouped results (Conversations, Work, Knowledge), and graceful 404 → "coming soon" degradation. `useGlobalSearch.ts` — debounced fetch (150ms) to `/api/search?q=`, abort-on-unmount, malformed-response detection. SQLite FTS5 is available. Knowledge items have full-text-searchable `title` and `body`. Threads have `messages` with searchable payloads. Bets have searchable `description`.

**What's genuinely missing.** A `GET /api/search` route that queries across conversations (threads + messages), work (bets), and knowledge items. For the target data volumes (solo founder, hundreds of items), even a naive LIKE query would be sufficient — FTS5 is a performance optimization, not a requirement.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- `Cmd+K` followed by a search query returns grouped results from conversations, bets, and knowledge items.
- Results are clickable and navigate to the correct detail page (thread, bet, knowledge item).
- Search is fast enough for interactive use (results appear within 300ms for typical queries).
- Empty queries return no results (not all items).
- The "Search coming soon" empty state no longer appears for any query that could have results.

**Validation scenarios.**
- Given a knowledge item titled "JWT rotation patterns," when the founder types "JWT" in Cmd+K, then the item appears in the Knowledge results group.
- Given a bet with description containing "landing page redesign," when the founder searches "landing," then the bet appears in the Work results group.
- Given a thread where an agent mentioned "deployment failed," when the founder searches "deployment," then the thread appears in the Conversations results group.
- Given an empty search query, when the search modal is open, then no results are shown (prompt text only).

**Plan calls.** Standard architecture pass. Key decisions: single SQL query with UNION across tables vs separate queries merged client-side; LIKE vs FTS5; result ranking strategy.

**Contracts / constraints.**
- Must return results in the shape `useGlobalSearch` already expects (the client code defines the contract).
- Must not expose message content from threads the requesting user is not a participant in (auth boundary).
- Must be registered in `app.ts` route table like all other routes.

**Out of scope.**
- Semantic / vector search (LIKE or FTS5 is sufficient for v1 data volumes).
- Search within file contents or artifacts.
- Saved searches or search history.

**Effort.** M (~4h)

---

### AD8a — Agent Type System + Noun Purge

**Workpackage.** As a founder, I want the agent taxonomy cleaned up into three clear types (team, strategy, individual) and all dead nouns (Chief of Staff, CoS, CoC, coach, Rail) purged from every doc, code file, seed, test, and comment — so that the codebase has one vocabulary, not five competing ones.

**Why this matters.** The `/concept` phase for the original AD8 revealed that the "Chief of Staff" was a confused mix of two distinct agent types: a knowledge facilitator (strategy agent) and a personal operator (individual agent). The existing `agentCategory` field already has `team | strategy | personal` — but "personal" needs to become "individual", the CoS noun needs to die, and the docs still describe a two-category model. Additionally, the "Rail" noun was deleted in U6 but persists in docs and orphaned API routes. Everything else (AD8b assistant, AD8c facilitator) depends on clean nouns.

**What exists today.**
- `users.agentCategory` field with values `team | strategy | personal`
- `seed-agent-cos` (category: personal, role: chief_of_staff) — a confused singleton
- `docs/agent-layer/the-two-categories.md` — describes "Central Agents" vs "Product Team Agents" (outdated)
- `docs/souls/chief-of-staff.md` — CoS soul prompt
- Thread primitive docs reference "coach" configuration
- Orphaned Rail API routes: `packages/api-contract/src/rail.ts`, `packages/server/src/routes/rail.ts`, tests
- "Rail" and "CoS/coach/CoC" references scattered across docs and code

**What needs to happen.**
1. Schema migration: rename `agentCategory` value `personal` → `individual`
2. Rewrite `docs/agent-layer/the-two-categories.md` → three-type taxonomy (team, strategy, individual)
3. Delete `docs/souls/chief-of-staff.md` (replaced by assistant.md + facilitator.md in AD8b/AD8c)
4. Update thread primitive docs: "coach" configuration → "assistant" configuration
5. Delete orphaned Rail routes, API contracts, and tests
6. Purge every reference to "Chief of Staff", "CoS", "CoC", "coach" (as agent name), and "Rail" from all docs, code, seeds, tests, variable names, comments

**Depends on.** None — this is the foundation.

**Complexity.** M

**Acceptance criteria.**
- `users.agentCategory` accepts `team | strategy | individual` (not `personal`). Migration applied.
- Zero occurrences of "Chief of Staff", "CoS" (as agent name), "CoC", "coach" (as agent name) in the entire codebase (docs, code, seeds, tests, comments). Grep verification.
- Zero occurrences of "Rail" (as UI concept) in the entire codebase. Orphaned rail routes and contracts deleted.
- `docs/agent-layer/the-two-categories.md` rewritten to describe three agent types with roles, scopes, and examples.
- Thread primitive docs updated: coach configuration → assistant configuration with conditional pinning note.
- `npm run check` + `npm run lint` + `npm run test` all pass.

**Validation scenarios.**
- Given the migration has run, when querying `SELECT DISTINCT agentCategory FROM users WHERE kind='ai'`, then the results include `team`, `strategy`, `individual` — never `personal`.
- Given the purge is complete, when running `grep -ri "chief.of.staff\|\\bcos\\b\|\\bcoc\\b\|coach.*thread\|coach.*agent" --include="*.ts" --include="*.tsx" --include="*.md" .`, then zero results (excluding this spec file and the concept doc).
- Given the Rail purge is complete, when running `grep -ri "\\brail\\b" --include="*.ts" --include="*.tsx" --include="*.md" docs/ packages/`, then zero results referencing the Rail UI concept.

**Contracts / constraints.**
- No behavioral changes — this is a vocabulary + schema cleanup. The app works identically after, just with clean nouns.
- `seed-agent-cos` may be renamed or removed, but the practice facilitator seeds (seed-agent-pf-*) stay (they become the canonical strategy agents).
- The three-type doc must define: type (team/strategy/individual), scope, visibility, role examples, tool access pattern.

**Effort.** M (~6h)

---

### AD8b — Assistant Agent + Overlay

**Workpackage.** As a founder, I want a personal AI assistant — one per user, built from scratch — that I can talk to from the overlay, that can act on my behalf (create bets, edit blocks, manage tasks), and that shows me what it did through tool calls, artifacts, and review messages with guardrails for dangerous actions.

**Why this matters.** The original CoS overlay invited conversation but never responded. AD8a cleans up the nouns; AD8b builds the actual assistant. This is the individual agent — scoped to one user, powerful enough to be the user's hands in the factory, with risk-assessed guardrails so it doesn't do dangerous things without approval.

**What exists today (after AD8a).** Clean agent type system. No assistant agent exists yet. The overlay shell (formerly CocOverlay, renamed in AD8a purge) may retain basic structure but needs rebuild for the assistant's tool-call and review-message rendering.

**What needs to happen.**
1. Per-user assistant agent creation: new agent row (kind=ai, agentCategory=individual, role=assistant) created at user registration or first overlay open, with soul prompt copied from a template and editable by the user.
2. Rebuild overlay as AssistantOverlay: renders tool calls, artifacts, and review messages inline — not just plain text.
3. Wire response loop: when a human posts to the assistant thread, provision a session via AD2 dispatcher. The session reads thread history, uses tools, responds.
4. Implement assistant tool surface: `send_message`, `create_task`, `submit_review`, `create_artifact`, `create_item`, `query_practice`, `read_inbox`, `handoff_to`, `promote_knowledge`, `create_bet`, `edit_block`, `update_task_status`, `edit_bet`.
5. Implement guardrails: risk-assessed review messages for high-risk actions (create_bet, edit_bet, submit_review, handoff_to). Low-risk actions execute and report.
6. Conditional pinning: thread starts unpinned, pins after first real assistant response.
7. Refine context attachment: bets, tasks, knowledge items, blocks, thread message copies.
8. Adopt `portfolio-retro` routine: scoped to the user's teams (not factory-wide).
9. Assistant soul template in `docs/souls/assistant.md`.

**Depends on.** AD8a (clean types + nouns), AD2 (task-to-session dispatcher — already done).

**Complexity.** L

**Acceptance criteria.**
- Each human user has exactly one assistant agent (agentCategory=individual, role=assistant). Created automatically.
- The assistant's soul prompt is editable by the user in settings.
- When a human posts a message to the assistant thread, the assistant responds with relevant tool calls and information.
- High-risk actions (create_bet, edit_bet, submit_review, handoff_to) surface as review messages — the user approves before execution.
- Low/medium-risk actions execute and report results in the thread.
- The assistant thread is not pinned until the assistant has posted at least one real response.
- The overlay renders tool calls, artifacts, and review messages — not just plain text.
- The assistant overlay trigger in the sidebar is labeled "Assistant".
- Context can be attached from: bet cards, task cards, knowledge items, blocks, thread messages.

**Validation scenarios.**
- Given a first-time user, when they open the assistant overlay and send "Create a bet called Test Bet with $500 appetite", then the assistant surfaces a review message with the bet details for approval.
- Given the user approves the review message, then the bet is created and the assistant confirms with an artifact reference.
- Given a user sends "What tasks are blocked right now?", then the assistant queries and responds with task data (no review gate — read-only).
- Given a new factory, when the conversation list loads, then no assistant thread is pinned.
- Given the assistant has responded, when the conversation list loads, then the assistant thread appears pinned.
- Given a user navigates to settings, they can view and edit their assistant's soul prompt.

**Contracts / constraints.**
- One assistant per user. No shared seed agent.
- Guardrails are structural (review messages), not configurable (no on/off toggle).
- Thread is the memory. Sessions are ephemeral.
- Actions surface as tool calls / artifacts / review messages, not plain-text summaries.

**Out of scope.**
- Onboarding journey (AE2).
- Full tool expansion beyond the core set listed above.
- Multi-turn stateful sessions (each message provisions a new session that reads thread history).

**Effort.** L (~12h)

---

### AD8c — Facilitator Agent Cleanup

**Workpackage.** As a founder, I want the knowledge facilitation responsibilities cleanly owned by strategy agents with proper tooling and routines — not dangling from the dead CoS — so that knowledge management has a clear owner and the agent taxonomy is complete.

**Why this matters.** The CoS decomposition (AD8a purge) removes the agent that owned knowledge-decay, portfolio-retro, and cost-sentinel routines. The practice facilitators (seed-agent-pf-*) already exist as strategy agents but their relationship to the old CoS is unclear. AD8c makes it clean: facilitators own knowledge curation, the cost-sentinel becomes application code, and portfolio-retro moves to the assistant.

**What exists today (after AD8a).** Practice facilitators with `agentCategory=strategy`, `role=practice_facilitator`. The old CoS routines are orphaned (no owner after purge). Facilitator tools (`route_item`, `score_attention`, `promote_knowledge`, `create_conflict_review`) exist but are authorized by role name.

**What needs to happen.**
1. Update practice facilitator seeds: role `practice_facilitator` → `facilitator`. Update role-based tool authorization.
2. Create `docs/souls/facilitator.md` — clean soul template for strategy agents focused on knowledge curation.
3. Reassign `knowledge-decay` routine to a facilitator agent (e.g., seed-agent-pf-facilitation or a new factory-level facilitator).
4. Convert `cost-sentinel` from agent routine to application code — simple threshold check, no LLM needed. Delete the routine seed.
5. `portfolio-retro` moves to the assistant (AD8b). Remove from facilitator scope.
6. Update facilitator tool surface: keep `route_item`, `score_attention`, `promote_knowledge`, `create_conflict_review`, plus shared tools. Remove any assistant-specific tools from facilitator authorization.
7. Ensure strategy agent roles are open-ended — `facilitator` is the first but the type accommodates future roles.

**Depends on.** AD8a (clean types + nouns). Can run in parallel with AD8b.

**Complexity.** M

**Acceptance criteria.**
- Practice facilitator seeds have `role=facilitator` (not `practice_facilitator`). Tool authorization updated.
- `docs/souls/facilitator.md` exists with a clean soul template.
- `knowledge-decay` routine is owned by a facilitator agent and runs correctly.
- `cost-sentinel` is application code (scheduled job or reactive check), not an agent routine. The routine seed is deleted.
- `portfolio-retro` routine seed is removed from facilitator scope (moved to assistant in AD8b).
- `npm run check` + `npm run lint` + `npm run test` all pass.

**Validation scenarios.**
- Given the migration has run, when querying agents with `role='facilitator'`, then the 5 practice facilitators are returned.
- Given `cost-sentinel` is now application code, when spend exceeds the threshold, then an alert fires without provisioning an agent session.
- Given `knowledge-decay` runs on schedule, then stale knowledge items are transitioned and the owning agent is a facilitator.

**Contracts / constraints.**
- Strategy agent roles are open-ended (no closure contract). `facilitator` is first, others may follow.
- Facilitator tools are a subset of assistant tools — facilitators can curate knowledge but cannot create bets, edit bets, or act on reviews.
- No behavioral regression — knowledge-decay and cost monitoring continue to work, just with clean ownership.

**Effort.** M (~6h)

---

### AD9 — Remove Portfolio Page

**Workpackage.** As a founder, I want to navigate directly to my team's work instead of clicking through an intermediate portfolio grid — so that every click in the app takes me somewhere useful.

**Why this matters.** The June 2026 audit confirmed the portfolio page is a click-through for single-team founders and adds no unique data — everything it shows is derived from teams and bets. For the target user (1-2 teams), it's an extra navigation step. The sidebar already lists teams directly. Removing the portfolio page and making team pages the Work landing simplifies navigation and removes one level from the 5-level hierarchy (portfolio → team → bet → task → session becomes team → bet → task → session).

**What exists today.** `WorkPortfolio.tsx` renders a grid of BetCards from `GET /api/bets` with status/verdict/team filter pills. The sidebar Work section shows a team list. `/work/portfolio` is the post-setup redirect target. BetCards show title, team, status, budget, outcome verdict.

**What's genuinely missing.** Removal of the portfolio page and redirect logic: (1) Post-setup redirect goes to `/work/team/:firstTeamId` instead of `/work/portfolio`. (2) Sidebar Work section navigates directly to team pages. (3) The `/work/portfolio` route either redirects to the first team or is removed. (4) Any portfolio-only features (cross-team bet filtering) move to a consolidated view within the team page or are deferred.

**Depends on.** None.

**Complexity.** S

**Acceptance criteria.**
- After setup, the user lands on their team's Work page, not a portfolio grid.
- The sidebar Work section navigates directly to team pages without an intermediate portfolio level.
- All bet data previously visible on the portfolio page is accessible from team pages.
- The `/work/portfolio` URL either redirects to the appropriate team or returns 404.

**Validation scenarios.**
- Given a new user completing setup with 1 team, when setup finishes, then the browser navigates to `/work/team/:teamId`.
- Given a user with 2 teams, when they click "Work" in the sidebar, then they see their team list and can click directly into either team.
- Given a user navigating to `/work/portfolio`, then they are redirected to their first team's page.

**Plan calls.** Standard architecture pass — enumerate the redirect points, route changes, and sidebar navigation updates.

**Contracts / constraints.**
- The BetCard component is not deleted — it's reused in the team view.
- Cross-team filtering (if needed for multi-team users later) is deferred, not blocked.
- No data model changes — only routing and navigation.

**Out of scope.**
- Cross-team portfolio dashboard (deferred until 3+ team users exist).
- Team creation flow changes (AE2 handles that).

**Effort.** S (~2h)
