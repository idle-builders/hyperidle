# Track O: Kernel / Strategy Separation

Separate the stable kernel (conversations, work, knowledge) from the volatile strategy layer (fabric's scoring, routing, propagation, cost caps, notifications). After this track, kernel code never imports from `@hyperidle/fabric`. Strategy depends on kernel freely.

**Concept:** `plans/kernel-seperation/concept.md`
**Architecture:** `plans/kernel-seperation/architecture.md`
**Critique:** `plans/kernel-seperation/architecture-critique-5.md`

**Constraint:** After each work package merges to main, `bun dev` must work — the app runs in dev mode at every merge boundary.

---

### O1 — Types and events split

**Story.** As a developer, I want kernel types and events cleanly separated from strategy types and events, so that I can tell at a glance whether I'm touching kernel or fabric code.

**Depends on.** None (works against current `main`).

**Required reading.** `plans/kernel-seperation/concept.md` (kernel vs strategy definition), `plans/kernel-seperation/architecture.md` §2 (type split + event split).

**Scope.** Architecture Tasks 1 + 2. Pure reorganization — no schema changes, no behavior changes, no route changes.

**Acceptance criteria.**

_Type split:_
- All strategy types moved from `packages/shared/src/types.ts` to `packages/fabric/src/types.ts`: `KnowledgeLayer`, `KNOWLEDGE_LAYERS`, `KnowledgeKind`, `KnowledgeScope`, `KNOWLEDGE_SCOPES`, `KNOWLEDGE_STATUSES` (7-state), `KnowledgeTopicHealth`, `KNOWLEDGE_TOPIC_HEALTHS`, `KnowledgeSortOption`, `KNOWLEDGE_SORT_OPTIONS`, `KnowledgeRelevanceSignals`, `KnowledgeAccessorKind`, `RiskTier`, `AutonomyLevel`.
- `PropagationLevel`, `PropagationStatus`, `PropagationResult` moved from `packages/shared/src/propagation.ts` to `packages/fabric/src/types.ts`.
- `KERNEL_KNOWLEDGE_STATUSES = ["draft", "active", "archived"]` added to `shared/types.ts`.
- `KERNEL_AGENT_ROLES`, `FABRIC_AGENT_ROLES`, and full `AGENT_ROLES` union defined in `shared/types.ts`.
- All imports across all packages updated to reference new locations.

_Event split:_
- `KernelEvent` and `StrategyEvent` unions defined in `packages/shared/src/events.ts`. `DomainEvent = KernelEvent | StrategyEvent`.
- Deleted: `BetShippedEvent` (redundant with `bet_state_changed`), `BetCommittedEvent` (redundant), `ResponseRecordedEvent` (zombie), `NotificationEvent` (never emitted).
- Tests updated: `policy-engine.test.ts`, `task-state-machine.test.ts`, `dependency-watcher.test.ts`, `ws-broadcaster.test.ts` — all references to deleted events replaced or removed.
- Added: `KnowledgeCreatedEvent`, `KnowledgeArchivedEvent`, `KnowledgeAccessedEvent`.
- `KnowledgeUpdatedEvent.action` tightened from `string` to `"edit" | "promote" | "flag" | "merge" | "split"`.
- `SessionEndedEvent.costDelta` field removed.
- `@lore` comment above `KernelEvent` union documenting the how-to-add-an-event pattern.

**Validation scenarios.**
- `grep -rn "KnowledgeScope\|KnowledgeLayer\|KNOWLEDGE_LAYERS\|RiskTier\|AutonomyLevel\|PropagationLevel\|PropagationStatus\|PropagationResult\|KnowledgeKind\|KNOWLEDGE_SCOPES\|KNOWLEDGE_STATUSES\|KNOWLEDGE_SORT_OPTIONS\|KnowledgeTopicHealth\|KNOWLEDGE_TOPIC_HEALTHS\|KnowledgeRelevanceSignals\|KnowledgeAccessorKind" packages/shared/src/` returns zero hits.
- `bun run check` passes (zero type errors).
- `bun run test` passes (all updated test files green).
- `bun dev` starts and the app works in the browser.

**Effort.** M (~2d)

---

### O2 — Schema migration and route rewrite

**Story.** As a developer, I want strategy columns physically moved off kernel tables into extension tables and routes updated to match, so that kernel schema and routes are free of fabric concerns.

**Depends on.** O1 (types and events must be split first — extension tables reference strategy types, routes emit new events).

**Required reading.** `plans/kernel-seperation/concept.md` (kernel vs strategy definition), `plans/kernel-seperation/architecture.md` §1 (schema changes), §3 (routes).

**Scope.** Architecture Tasks 3 + 4 + 5. Schema changes and all route updates are atomic — you can't drop columns without updating the queries that read them.

**Acceptance criteria.**

_Extension tables:_
- `knowledge_strategy_fabric` table created with FK to `knowledgeItems.id`, cascade delete. Columns: `layer`, `scopeId`, `kind`, `status` (7-state), `attentionScore`, `relevanceScore`, `confidence`, `citationCount`, `lastCitedAt`, `meta`.
- `task_strategy_fabric` table created with FK to `tasks.id`, cascade delete. Columns: `riskTier`, `attentionScore`, `durability`, `crossTeam`.
- No `strategy` discriminator column on either table.

_Kernel table stripping:_
- `knowledgeItems`: `layer`, `scopeId`, `kind`, `attentionScore`, `relevanceScore`, `citationCount`, `lastCitedAt`, `confidence`, `meta` removed. `topic` kept. `status` simplified to `draft | active | archived`.
- `tasks`: `riskTier`, `attentionScore`, `durability`, `crossTeam` removed.
- `sessions`: all 8 columns removed (`cost`, `costMinor`, `costCurrency`, `tokensJson`, `tokensInput`, `tokensOutput`, `traceId`, `harnessUrl`).
- `items`: `attentionScore`, `reversibility`, `sandboxResult`, `costEstimate` removed.
- `artifacts`: `costMoneyMicros`, `costTokensInput`, `costTokensOutput`, `costSettledAt` removed.
- Indexes on removed columns dropped (`ki_layer_idx`, `ki_scope_id_idx`, `ki_kind_idx`, `ki_layer_scope_idx`, `ki_attention_desc_idx`). Corresponding indexes created on extension tables.
- `@lore` comments on `routines` governance columns (`delegationAllowed`, `humanReview`, `autonomyLevel`, `silent`, `skillId`).

_Knowledge route rewrite:_
- URL shape changed: `/:layer/...` becomes `/:id` or `/` patterns.
- All 10 route handlers rewritten (list, search, get-by-id, create, update, merge, split, archive, flag, plus old `/:layer` list).
- `GET /api/knowledge/:id` writes access log, emits `knowledge_accessed`.
- `POST /api/knowledge` emits `knowledge_created`. `PATCH /api/knowledge/:id` emits `knowledge_updated`. Archive emits `knowledge_archived`.
- List route reads pre-computed scores from extension table via LEFT JOIN with `@lore` boundary-compromise note.
- Old URL shape `/:layer/:id` returns 404.

_Route purity:_
- Conversation POST: `routeToFounder()` and `routeItem()` inline calls removed. Existing `item_created` emission kept.
- Session end: inline review creation and cost cap checks removed. `session_ended` emitted, fabric subscribes.
- Handoff route: kernel protocol (reassign, transition) stays. Strategy decision logic (when/whom) extracted.
- All queries that referenced removed columns updated — either simplified (kernel queries) or JOIN to extension tables (fabric queries).

**Validation scenarios.**
- `bun run db:generate && bun run db:migrate` succeeds.
- Integration test: `POST /api/knowledge` returns 201 and emits `knowledge_created`.
- Integration test: `GET /api/knowledge/:id` emits `knowledge_accessed`.
- Integration test: `GET /api/knowledge/:layer/:id` returns 404.
- `grep -rn "routeToFounder\|routeItem\|createRelevanceService\|computeSignals\|recomputeScores" packages/server/src/routes/` returns zero.
- `bun run check` passes. `bun run test` passes.
- `bun dev` starts and the app works in the browser.

**Effort.** L (~4d)

---

### O3 — Service move and bootstrap

**Story.** As a developer, I want all strategy services living in `packages/fabric` behind a single `bootstrapFabric()` entry point, so that the kernel/strategy boundary is enforced by the package dependency graph — not just convention.

**Depends on.** O2 (routes must be purified first — they no longer call strategy services inline, so moving the services won't break route imports).

**Required reading.** `plans/kernel-seperation/concept.md` (kernel vs strategy definition), `plans/kernel-seperation/architecture.md` §4 (bootstrap and services), §5 (file layout).

**Scope.** Architecture Tasks 6 + 7. Move services, create bootstrap, update frontend imports.

**Acceptance criteria.**

_Service move:_
- 7 disposer-registered services moved to `packages/fabric/src/services/`: `session-review-creator`, `policy-engine`, `lifecycle-propagation`, `builtin-routines`, `cost-cap-dedup-releaser`, `git-export-handler`, `notification-dispatcher`.
- 9 non-disposer strategy services moved to `packages/fabric/src/services/`: `founder-router`, `item-router`, `relevance-service`, `attention-service`, `review-item-factory`, `silence-policy`, `daily-digest`, `practice-meeting`, `routine-scheduler`.
- `notifications/` subtree moved to `packages/fabric/src/services/notifications/`.
- `observability/` stays in `packages/server/src/services/observability/` (kernel infrastructure).

_Bootstrap:_
- `packages/fabric/src/bootstrap.ts` exports `bootstrapFabric({ db, eventBus }): Array<() => void>`.
- `AppOptions` gains `strategyBootstrap?: (ctx: { db: HyperIdleDb; eventBus: EventBus }) => Array<() => void>`.
- `app.ts` replaces 7 hardwired `register*()` calls with `options.strategyBootstrap?.({ db, eventBus })`.
- Production entry point passes `bootstrapFabric`. `createApp({ strategyBootstrap: undefined })` boots without error (kernel-only testing).

_Frontend:_
- All frontend imports of strategy types reference `@hyperidle/fabric` instead of `@hyperidle/shared`.
- Knowledge pages updated for new route URL shape (`/api/knowledge/:id` not `/:layer/:id`).
- Components referencing removed columns (session costs, `items.costEstimate`, artifact costs) updated.

**Validation scenarios.**
- `grep -rn "registerPolicyEngine\|registerSessionReviewCreator\|registerLifecyclePropagation\|registerBuiltinRoutineHandlers\|registerCostCapDedupReleaser\|registerGitExportHandler\|registerNotificationDispatcher" packages/server/src/app.ts` returns zero.
- `grep -rn "founder-router\|item-router\|relevance-service\|attention-service\|review-item-factory\|silence-policy\|daily-digest\|practice-meeting\|routine-scheduler" packages/server/src/services/` returns zero.
- `grep -rn "KnowledgeScope\|KnowledgeLayer\|KNOWLEDGE_LAYERS\|KnowledgeKind\|KnowledgeStatus\|KNOWLEDGE_STATUSES\|KnowledgeSortOption\|KNOWLEDGE_SORT_OPTIONS\|KnowledgeTopicHealth" packages/web/src/ | grep "@hyperidle/shared"` returns zero.
- `createApp({ strategyBootstrap: undefined })` boots without error.
- `bun run verify` (check + lint + test) passes with zero errors.
- `bun dev` starts and the app works in the browser.

**Effort.** M (~3d)
