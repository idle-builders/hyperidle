# domain-model — destroyer verdict (framework)

## Where does this package go?

**Verdict: SPLIT — dissolve ~55% of the surface into its real owners; a slimmed shared core remains.**

456 files across every layer import `@hyperidle/domain-model`, so "delete the package" is not on the table. But the 395-export surface is three different things wearing one name:

1. **A real client↔server wire contract** (core-api / agent-orchestration serve it, core-ui / design-system render it). Neither side may import the other, so this part legitimately needs a shared home. It survives, slimmed. ~121 exports.
2. **The event vocabulary + bus typing** (`events.ts`, ~48 exports). `EventType`/`EventByType`/`EventHandler`/`WildcardHandler` exist *only* to type `framework/event-bus`'s API; every subscriber already imports event-bus. **DISSOLVE → `framework/event-bus`.** Five of the events are defined, dispatcher-cased, and never emitted anywhere — those die outright.
3. **Single-owner code parked here for tidiness** (~120 exports): trigger schemas only core-api reads, block types only the block pipeline produces, health derivations only the browser runs, auth TTLs only core-api reads, session-request internals only orchestration reads, a whole Money arithmetic library nobody calls. Each moves to its sole consumer or dies.

Plus ~45 exports that are **dead**: never imported by any production file, duplicated locally by their supposed consumer, or guards/events for features that were hard-deleted (AU21 cost-cap) and left their vocabulary behind.

## Consumers (measured, not assumed)

456 importing files: core-api 153, core-ui 125, design-system 47, agent-orchestration 42, agent-execution 9, block-derivation 8, tools/eval 7, harness-protocol 6, http-middleware 5, event-bus 5, conversation-parts 5, factory-defaults 4, db 4, tool-protocol 3, harness-capability 3, credential-access 3, desktop 3, work-intent-port 2, diagnostics 2, others ≤2. (`api-contract` and `eslint-plugin-design` reference it only in comments/messages — not real consumers.)

| Consumer | What it actually imports | Could it own this? |
|---|---|---|
| core-api | wire response types, state vocabularies (TASK_STATES, BET_STATUSES…), API_ERROR_CODES, event types, mention parsing, trigger/config schemas, errors | Owns: trigger.ts, task-transition.ts, auth.ts, OLD_KIND_MAP, mention parsing, model defaults, org/propagation vocab, its errors |
| core-ui | same wire types from the other side, label registries, health derivations, KnowledgeScope/SortOption, SCHEDULE_PRESETS, ASSISTANT_TURN_TIMEOUT_MS | Owns: health derivations, agent-profile sub-shapes, knowledge UI vocab, schedule presets, timeout const |
| design-system | thread/message model, block payloads, kind registry display fns, status vocab | Owns: segmentMentions, promotedRichMessageId, verdictDecisionToStatus, summarizePreview, artifactDisplayTitle, KnowledgeKind |
| agent-orchestration | session-request schema/kinds, events, connection provisioning types, its errors | Owns: intent guards, request statuses, held-auth/inherited-connection types, its 3 error classes |
| agent-execution | ResolvedModel, ModelTier, TokenUsage, HttpError, MODEL_CATALOG | Owns: HttpError (thrower AND catcher are both in llm-client.ts — the "cross-seam instanceof" lore is obsolete) |
| event-bus | DomainEvent, EventType, EventByType, EventHandler, WildcardHandler | Owns: all of events.ts — the union exists to type the bus |
| block-derivation | every symbol in blocks/types.ts | Owns: all of blocks/types.ts — it is the producer; design-system/core-ui import block-derivation |
| db | ConfigurationKind, PluginState (column typing) | Owns those two |
| credential-access | ModelRequest, ModelGatewayConfig, CredentialName, MissingCredentialError | Owns: ModelRequest, MissingCredentialError (it is the resolver/thrower) |
| harness-protocol / tool-protocol / work-intent-port | AgentSessionSourceKind/Correlation, Reversibility, ModelTier, TokenUsage | No — these genuinely cross seams; stay shared |
| desktop / tools/eval / factory-defaults | credential vocabulary; role catalog; seeding vocab | No — genuinely shared |

## If written today, from scratch

One slim `domain-model` (121 exports, down from 395): the state/verdict/label vocabularies both sides render, the thread/message model, the artifact kind registry, the credential + model-gateway catalog, the team/routine/agent-profile wire contracts, `ApiErrorResponse` + `API_ERROR_CODES`, `AgentSessionSourceKind`/`Correlation`, `TokenUsage`. Events live in `event-bus`. Blocks live in `block-derivation`. Everything with one consumer lives in that consumer. No Money library, no dead events, no `UserRole = string` fake type, no identity-function "builders".

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 52 |
| MERGE (move to named owner) | 146 |
| SIMPLIFY (survives in package; unexported family member or shrinks) | 75 |
| KEEP | 121 |

Surface: 395 exports → 121 exported from the shared package (69% of the public surface gone: 52 dead outright, 146 moved to their real owner, 75 demoted to unexported internals). The package shrinks from 395 exports to ~196 declarations of which 121 are public.

## Feature-level kills

1. **The Money library** (`types/money.ts` minus TokenUsage/TierTokenCount — 13 exports). Bigint currency arithmetic with USD/EUR/GBP/JPY scales, wire conversion, add/compare. Zero production callers. It is the orphan of the AU21-deleted cost-cap feature; only `@lore` comments still reference it. Hole: none — the token-accounting types it shares a file with survive.
2. **Five never-emitted events**: `dependency_met`, `bet_revised`, `thread_archived`, `work_selection_requested`, `proposed_call_executed`. Defined in `events.ts`, cased in `core-api/src/observability/dispatcher.ts`, emitted by nothing, subscribed by nothing. Delete the interfaces, union entries, and dispatcher cases. Hole: none — they never fire.
3. **Dead type-guard family**: `isConfigurationKind`, `isPluginState`, `isConnectionAuthSource`, `isHeldAuthSource`, `isTriggerEventType`, `urgencyForType`, `buildSessionLifecycleCorrelation` (a literal identity function), `classifyThreadConfiguration` (self-described "documentation-only classifier — never persisted"). Zero production callers; `core-api/settings/plugin-configuration.ts` even wrote its own private `isConfigurationKind` rather than import this one.
4. **Dead mirrors of DB rows**: `ProposedCall` (core-api uses `proposedCalls.$inferSelect` from `framework/db`), `CreateArtifactInput` (core-api/work has its own in `artifact-store.ts`), `MUTABLE_BET_FIELDS` (live copy is `bet-state-machine.MUTABLE_FIELDS`; the "both must stay in sync" doc comment is false — nothing imports this one), `VersionConflictError` (core-api/knowledge throws its own 2-arg class; this 3-arg one is never instantiated, so the `instanceof` check in error-handler.ts:25 never matches and only the `err.name` string fallback works).
5. **Never-thrown errors**: `ActiveRoutinesError`, `ProviderTimeoutError` — no `new` site anywhere. `CassetteMissError` — thrown only from `agent-execution/harness-registry/src/__testing__/llm-cassette.ts` (development world); a production package exporting an error class for a test-only module is dead weight here.
6. **Fake types**: `UserRole = string` (imported at 9 production sites for zero type safety), `UserStatus`, `UserKind`/`USER_KINDS`, `SessionState`, `KnowledgeFormat`, `RiskTier`, `AutonomyLevel` — none imported by any production file.

## Full method audit

### A. Functions (48)

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `isAgentBehaviorConfigKind` | UI:PATCH /api/settings/agent-behavior (core-api ×2) | KEEP | Guard for the kept behavior-config wire family; server-side validation. |
| 2 | `findRoleCatalogEntry` | UI:multiple (core-api ×2, core-ui ×4, eval) | KEEP | Role catalog is genuinely shared across 3 worlds. |
| 3 | `roleLabel` | UI:GET /api/knowledge (core-api ×1) | MERGE → core-api | One caller; trivial title-caser over the shared catalog. |
| 4 | `communityForRole` | INTERNAL+2 (agent-orchestration, core-api barrel re-export) | KEEP | Two independent consumers of catalog derivation. |
| 5 | `defaultRoster` | UI:SetupFlow + factory-defaults | KEEP | Two independent consumers. |
| 6 | `computeHealthSignals` | UI:AgentProfile via core-ui hook | MERGE → core-ui | Only the browser runs it (AU26 J4 moved computation client-side); "both sides need it" is no longer true. |
| 7 | `deriveHealthLevel` | UI: core-ui ×1 | MERGE → core-ui | Same. |
| 8 | `deriveHealthDetail` | UI: core-ui ×1 | MERGE → core-ui | Same. |
| 9 | `isAgentWorkIntentKind` | INTERNAL:agent-orchestration ×2 | MERGE → agent-orchestration | Guards orchestration's own DB column; nobody else calls it. |
| 10 | `isAgentWorkIntentSourceKind` | INTERNAL:agent-orchestration ×2 | MERGE → agent-orchestration | Same. |
| 11 | `isConfigurationKind` | DEAD | DELETE | core-api wrote its own private copy (plugin-configuration.ts:138); this export has zero callers. |
| 12 | `isPluginState` | DEAD | DELETE | Zero callers anywhere. |
| 13 | `isConnectionAuthSource` | TEST-ONLY | DELETE | Only a test references it. |
| 14 | `isHeldAuthSource` | TEST-ONLY | DELETE | Only a test references it. |
| 15 | `isCredentialName` | UI:credentials route + desktop | KEEP | Two worlds (server + Electron) validate against one vocabulary. |
| 16 | `credentialNameForProvider` | UI:harnesses route + SetupFlow | KEEP | Server + client. |
| 17 | `isHintId` | UI:GET /api/hints | KEEP | Guard of the two-sided hint catalog (server validates, client renders). |
| 18 | `getKindDefinition` | UI: design-system ArtifactPreviewSurface | KEEP | Kind registry family is 3-sided (core-api, orchestration, design-system). |
| 19 | `isRegisteredKind` | UI: core-api artifacts + design-system | KEEP | Same family. |
| 20 | `scopeToLayer` | INTERNAL:core-api ×2 | MERGE → core-api | Only the knowledge service maps scope→layer. |
| 21 | `extractMentionCandidates` | UI:POST /api/threads (core-api) | MERGE → core-api | Server-side resolution is authoritative by design; only the server parses. |
| 22 | `resolveMentions` | UI:POST /api/threads (core-api) | MERGE → core-api | Same. |
| 23 | `segmentMentions` | UI: design-system CommentRow | MERGE → design-system | Only the renderer segments. |
| 24 | `isCatalogModel` | UI:validate-agent-config (core-api ×1) | MERGE → core-api | One caller; one-line `.some()` over the shared MODEL_CATALOG. |
| 25 | `catalogEntry` | UI:agents route (core-api ×1) | MERGE → core-api | One caller; one-line `.find()`. |
| 26 | `urgencyForType` | DEAD | DELETE | Zero callers. |
| 27 | `shortLabelForType` | UI:NotificationPopover (core-ui ×1) | MERGE → core-ui | One caller; NOTIFICATION_TYPES stays shared, the helper moves. |
| 28 | `buildSessionLifecycleCorrelation` | TEST-ONLY | DELETE | Literal identity function (`return input;`). One test imports it. |
| 29 | `canTransitionTaskState` | INTERNAL:core-api ×3 | MERGE → core-api/work | Task state machine is core-api's domain logic; no other consumer. |
| 30 | `exhaustiveAssert` | INTERNAL: conversation-parts, design-system | DELETE | 3-line language util; each consumer inlines its own never-guard. |
| 31 | `isRedactedPayload` | UI:many (core-ui ×5, conversation-parts, design-system ×3) | KEEP | Real shared narrowing across 3 packages. |
| 32 | `classifyThreadConfiguration` | TEST-ONLY | DELETE | Self-described "documentation-only classifier — never persisted". Zero prod callers. |
| 33 | `headCollapsePredicate` | UI:GET /api/threads (core-api) + internal | KEEP | Same head rule evaluated server-side and (via isBlocking) client-side. |
| 34 | `isBlocking` | UI: design-system ThreadShell | KEEP | Pairs with 33 across the seam. |
| 35 | `promotedRichMessageId` | UI: design-system ThreadShell ×1 | MERGE → design-system | Single consumer, pure render rule. |
| 36 | `verdictDecisionLabel` | UI: core-ui + conversation-parts + design-system | KEEP | Three consumers; the label registry lint rule depends on it. |
| 37 | `verdictDecisionToStatus` | UI: design-system CommentRow ×1 | MERGE → design-system | Belongs in status-mapping.ts, its only consumer's file's sibling. |
| 38 | `isTriggerEventType` | DEAD | DELETE | Zero callers. |
| 39 | `summarizePreview` | UI: design-system ArtifactEmbed ×1 | MERGE → design-system | Display helper; single consumer. |
| 40 | `artifactDisplayTitle` | UI: core-ui + design-system ×3 | MERGE → design-system | All consumers are UI-world; core-ui already imports design-system. |
| 41 | `scaleForCurrency` | DEAD | DELETE | Dead Money library (feature-kill 1). |
| 42 | `zeroMoney` | DEAD | DELETE | Same. |
| 43 | `moneyFromWire` | DEAD | DELETE | Same. |
| 44 | `moneyToWire` | DEAD | DELETE | Same. |
| 45 | `addMoney` | DEAD | DELETE | Same. |
| 46 | `compareMoney` | DEAD | DELETE | Same. |
| 47 | `totalTokens` | DEAD | DELETE | A @lore comment orders callers to use it; none do. |
| 48 | `addTokenUsage` | TEST-ONLY | DELETE | Only tests call it. |

### B. Classes (12)

| # | Class | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `InvalidTransitionError` | UI: core-api ×4 | MERGE → core-api | Thrown and caught only inside core-api. |
| 2 | `VersionConflictError` | DEAD (as a class) | DELETE | Never instantiated. core-api/knowledge throws its OWN 2-arg VersionConflictError; error-handler's `instanceof` on this one never matches — the `err.name` string fallback does the real work. |
| 3 | `CapacityExceededError` | UI: core-api ×2 | MERGE → core-api | Thrown (bet-state-machine) and mapped (error-handler) only in core-api. |
| 4 | `ConcurrencyLimitError` | INTERNAL: agent-orchestration ×2 | MERGE → agent-orchestration | Single owner. |
| 5 | `MissingCredentialError` | agent-orchestration + credential-access | MERGE → credential-access | The resolver throws it; orchestration already imports credential-access. |
| 6 | `TargetAgentNotRunnableError` | INTERNAL: agent-orchestration ×2 | MERGE → agent-orchestration | Single owner. |
| 7 | `ActiveRoutinesError` | DEAD | DELETE | No `new ActiveRoutinesError` anywhere. |
| 8 | `NoEligibleHarnessError` | INTERNAL: agent-orchestration ×1 | MERGE → agent-orchestration | Single owner. |
| 9 | `ProviderTimeoutError` | DEAD | DELETE | No throw site anywhere in production. |
| 10 | `HttpError` | INTERNAL: agent-execution llm-client ×1 | MERGE → agent-execution | Thrower AND catcher (`isHttpError`, `mapErrorToNotice`) now live in the same file; the cross-seam rationale is obsolete. |
| 11 | `CassetteMissError` | TEST-ONLY (`__testing__/llm-cassette.ts`) | DELETE | Only a development-world module throws/catches it; move the class into that module. |
| 12 | `TaskInvalidTransitionError` | UI: core-api ×4 | MERGE → core-api/work | Travels with the task state machine (A29). |

### C. Types / interfaces (236)

| # | Declaration | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `AgentBehaviorConfigKind` | core-api ×1 | SIMPLIFY | Unexport; structural member of kept View + guard source. |
| 2 | `AgentBehaviorOriginType` | core-api ×1 | SIMPLIFY | Unexport; member of OriginView. |
| 3 | `AgentBehaviorOriginState` | core-api ×1 | SIMPLIFY | Unexport; member. |
| 4 | `AgentBehaviorValueSource` | core-api ×1 | SIMPLIFY | Unexport; member. |
| 5 | `AgentBehaviorPromptSource` | core-api ×1 | SIMPLIFY | Unexport; member. |
| 6 | `AgentBehaviorFieldKind` | none external | SIMPLIFY | Unexport; member of EditableField. |
| 7 | `AgentBehaviorLinkTarget` | none external | SIMPLIFY | Unexport; member of ConfigLink. |
| 8 | `AgentBehaviorOriginView` | core-api ×1 | SIMPLIFY | Unexport; member of View. |
| 9 | `AgentBehaviorEditableField` | core-api + core-ui | KEEP | Two-sided wire type for the settings surface. |
| 10 | `AgentBehaviorConfigLink` | core-api ×1 | SIMPLIFY | Unexport; member of View. |
| 11 | `AgentBehaviorTriggerSummary` | core-api ×1 | SIMPLIFY | Unexport; member of View. |
| 12 | `AgentBehaviorConfigView` | core-api + core-ui | KEEP | The wire contract for Settings → Agent behavior. |
| 13 | `AgentBehaviorConfigListResponse` | core-api + core-ui | KEEP | Wire pair. |
| 14 | `AgentBehaviorConfigPatchRequest` | core-api ×1 | KEEP | Request half of the kept PATCH contract. |
| 15 | `AgentBehaviorConfigPatchResponse` | core-api + core-ui | KEEP | Wire pair. |
| 16 | `AgentBehaviorConfigErrorResponse` | core-api ×1 | DELETE | `{error, code}` — a duplicate of ApiErrorResponse. Use that. |
| 17 | `AgentActiveSession` | core-ui ×1 | MERGE → core-ui | Only the browser types this. |
| 18 | `AgentSessionSummary` | core-ui ×1 | MERGE → core-ui | Same. |
| 19 | `AgentPerformanceStats` | core-ui ×1 | MERGE → core-ui | Same. |
| 20 | `AgentHealthSignals` | core-ui ×1 + internal | MERGE → core-ui | Travels with the health derivations (A6–A8). |
| 21 | `AgentHarnessCapabilities` | core-api ×1 | SIMPLIFY | Unexport; member of AgentProfileResponse. |
| 22 | `AgentVerdictEntry` | none external | SIMPLIFY | Unexport; member of AgentReviewTrackRecord. |
| 23 | `AgentReviewTrackRecord` | core-api ×1 | SIMPLIFY | Unexport; member of AgentProfileResponse. |
| 24 | `AgentProfileResponse` | core-api + core-ui ×2 | KEEP | Wire contract for GET /api/agents/:id/profile. |
| 25 | `AgentRoleCatalogEntry` | via catalog (3 worlds) | KEEP | Element type of the shared catalog. |
| 26 | `TeamFunction` | none external | SIMPLIFY | Unexport; derived from TEAM_FUNCTIONS. |
| 27 | `AgentRunSummary` | core-ui ×3 | KEEP | Orchestration serves it, browser reads it — two-sided by construction. |
| 28 | `AgentRunsResponse` | agent-orchestration + core-ui | KEEP | Wire pair. |
| 29 | `AgentRunActiveCountsResponse` | agent-orchestration + core-ui | KEEP | Wire pair. |
| 30 | `AgentRunLatestOutcomesResponse` | agent-orchestration + core-ui | KEEP | Wire pair. |
| 31 | `HealthSignalInput` | none external | MERGE → core-ui | Parameter type of the moved health functions. |
| 32 | `ApiErrorResponse` | 14 prod files, 3 packages | KEEP | The error envelope of the whole API. |
| 33 | `ApiErrorCode` | none external | SIMPLIFY | Unexport; derived from API_ERROR_CODES. |
| 34 | `InviteRole` | core-api ×1 | MERGE → core-api/users | Only invite-code.ts types it. |
| 35 | `BlockKind` | block-derivation ×1 | MERGE → block-derivation | Whole blocks/types.ts belongs to its producer. |
| 36 | `BlockHostKind` | block-derivation + conversation-parts + core-ui | MERGE → block-derivation | Producer owns; consumers import block-derivation. |
| 37 | `BlockId` | block-derivation + core-ui + design-system | MERGE → block-derivation | Same. |
| 38 | `BlockAnchor` | none external | MERGE → block-derivation | Member of Block; travels. |
| 39 | `InlineNode` | block-derivation ×3 + design-system ×4 + core-ui | MERGE → block-derivation | Same. |
| 40 | `ListItem` | block-derivation + design-system | MERGE → block-derivation | Same. |
| 41 | `BlockPayload` | block-derivation ×3 + design-system ×5 + core-ui ×2 | MERGE → block-derivation | Same. |
| 42 | `Block` | block-derivation + design-system + core-ui | MERGE → block-derivation | Same. |
| 43 | `BlockDerivationResult` | block-derivation ×1 | MERGE → block-derivation | Literally named after its owner. |
| 44 | `ConfigurationKind` | core-api ×2 + db schema | MERGE → framework/db | db types the column; core-api already imports db. |
| 45 | `PluginState` | core-api + db schema | MERGE → framework/db | Same. |
| 46 | `ConfigurationOriginType` | none external | MERGE → core-api/settings | Member of ConfigurationOrigin; single owner. |
| 47 | `ConfigurationValueSource` | none external | MERGE → core-api/settings | Same. |
| 48 | `ConfigurationOrigin` | core-api ×1 | MERGE → core-api/settings | Single owner. |
| 49 | `ResolvedConfigurationItem` | core-api ×2 | MERGE → core-api/settings | Single owner. |
| 50 | `ConnectionAuthSource` | core-ui ×1 | KEEP | Member of the kept ServiceConnectionView wire type. |
| 51 | `ConnectionHealth` | agent-orchestration + core-ui | KEEP | Two-sided. |
| 52 | `HeldAuthSource` | agent-orchestration ×2 | MERGE → agent-orchestration | Provisioning-internal vocabulary. |
| 53 | `ServiceConnectionView` | agent-orchestration ×2 + core-ui | KEEP | Wire contract for Settings → Connections. |
| 54 | `InheritedConnectionFact` | agent-orchestration ×2 | MERGE → agent-orchestration | Only orchestration produces/consumes. |
| 55 | `CredentialName` | 5 packages incl. desktop | KEEP | Genuinely shared credential vocabulary. |
| 56 | `CredentialState` | core-api + core-ui + desktop | KEEP | Same. |
| 57 | `CredentialCatalogEntry` | none external | SIMPLIFY | Unexport; element of CREDENTIAL_CATALOG. |
| 58 | `AgentWorkIntentKind` | dev-only direct | MERGE → event-bus | Event vocabulary; travels with events.ts. |
| 59 | `AgentWorkIntentSourceKind` | via guards | MERGE → event-bus | Same. |
| 60 | `AgentWorkIntentEvent` | EVENT:agent_work_intent_recorded (emitted core-api ×2) | MERGE → event-bus | Live event. |
| 61 | `AgentRunAdmissionFailureCode` | agent-orchestration ×1 | MERGE → event-bus | Member of live admission-failed event. |
| 62 | `AgentRunAdmissionFailedEvent` | EVENT:agent_run_admission_failed | MERGE → event-bus | Live event. |
| 63 | `AgentRunLifecycleChangedEvent` | EVENT:agent_run_lifecycle_changed | MERGE → event-bus | Live event. |
| 64 | `TaskStateChangedEvent` | EVENT:task_state_changed | MERGE → event-bus | Live event. |
| 65 | `BetStateChangedEvent` | EVENT:bet_state_changed | MERGE → event-bus | Live event. |
| 66 | `ItemCreatedEvent` | EVENT:item_created | MERGE → event-bus | Live event. |
| 67 | `SessionStartedEvent` | EVENT:session_started | MERGE → event-bus | Live event. |
| 68 | `SessionOutcome` | 5 packages | MERGE → event-bus | Member of SessionEndedEvent; broad but travels with the event family. |
| 69 | `SessionEndedEvent` | EVENT:session_ended (8 prod subscribers) | MERGE → event-bus | Live event, heavily used. |
| 70 | `SessionHandoffCompletedEvent` | EVENT:session_handoff_completed | MERGE → event-bus | Live event. |
| 71 | `SessionNotReturnedEvent` | EVENT:session_not_returned | MERGE → event-bus | Live event. |
| 72 | `NotificationEvent` | EVENT:notification | MERGE → event-bus | Live event. |
| 73 | `KnowledgeUpdatedEvent` | EVENT:knowledge_updated | MERGE → event-bus | Live event. |
| 74 | `KnowledgeCreatedEvent` | EVENT:knowledge_created | MERGE → event-bus | Live event. |
| 75 | `KnowledgeArchivedEvent` | EVENT:knowledge_archived | MERGE → event-bus | Live event. |
| 76 | `KnowledgeAccessedEvent` | EVENT:knowledge_accessed | MERGE → event-bus | Live event. |
| 77 | `RoutineFiredEvent` | EVENT:routine_fired | MERGE → event-bus | Live event. |
| 78 | `DependencyMetEvent` | DEAD — never emitted | DELETE | Only definition + dispatcher case exist. No emitter, no subscriber. |
| 79 | `SandboxWritebackChange` | agent-orchestration file-watcher | MERGE → event-bus | Member of live writeback event. |
| 80 | `SandboxWritebackChangesDetectedEvent` | EVENT:sandbox_writeback_changes_detected | MERGE → event-bus | Live event. |
| 81 | `BetRevisedEvent` | DEAD — never emitted | DELETE | Same as #78. |
| 82 | `ToolCallRecordedEvent` | EVENT:tool_call_recorded | MERGE → event-bus | Live event. |
| 83 | `ThreadCreatedEvent` | EVENT:thread_created | MERGE → event-bus | Live event. |
| 84 | `ThreadMessageAppendedEvent` | EVENT:thread_message_appended | MERGE → event-bus | Live event. |
| 85 | `ThreadResolvedEvent` | EVENT:thread_resolved | MERGE → event-bus | Live event. |
| 86 | `ThreadReopenedEvent` | EVENT:thread_reopened | MERGE → event-bus | Live event. |
| 87 | `ThreadArchivedEvent` | DEAD — never emitted | DELETE | Thread archival does not exist as a runtime event. |
| 88 | `ArtifactCreatedEvent` | EVENT:artifact_created | MERGE → event-bus | Live event. |
| 89 | `PropagationAppliedEvent` | EVENT:propagation_applied | MERGE → event-bus | Live event. |
| 90 | `PropagationFailedEvent` | EVENT:propagation_failed | MERGE → event-bus | Live event. |
| 91 | `WorkSelectionRequestedEvent` | DEAD — never emitted | DELETE | Same as #78. |
| 92 | `TeamCreatedEvent` | EVENT:team_created | MERGE → event-bus | Live event. |
| 93 | `AgentAddedEvent` | EVENT:agent_added | MERGE → event-bus | Live event. |
| 94 | `UserCreatedEvent` | EVENT:user_created | MERGE → event-bus | Live event. |
| 95 | `ProposedCallExecutedEvent` | DEAD — never emitted | DELETE | The executed-status transition happens without an event. |
| 96 | `ProposedCallGrantedEvent` | EVENT:proposed_call_granted | MERGE → event-bus | Live event. |
| 97 | `KernelEvent` | TEST-ONLY | DELETE | Inline into DomainEvent; the kernel/strategy split is a docs concept, not a runtime seam. |
| 98 | `StrategyEvent` | internal only | DELETE | Same. |
| 99 | `DomainEvent` | core-api ×2 + event-bus | MERGE → event-bus | The bus's own union. |
| 100 | `EventType` | core-api ×2 + event-bus | MERGE → event-bus | Bus API typing. |
| 101 | `WildcardType` | event-bus internal | MERGE → event-bus | Bus API typing. |
| 102 | `EventByType` | event-bus ×1 | MERGE → event-bus | Bus API typing. |
| 103 | `EventHandler` | event-bus ×1 | MERGE → event-bus | Bus API typing. |
| 104 | `HintId` | core-ui ×1 | KEEP | Two-sided hint catalog (server validates via isHintId, client renders). |
| 105 | `HintCatalogEntry` | none external | SIMPLIFY | Unexport; element of HINT_CATALOG. |
| 106 | `OldKindMapping` | none external | MERGE → core-api | Travels with OLD_KIND_MAP (sole consumer: artifacts route). |
| 107 | `KindDefinition` | via getKindDefinition | KEEP | Extension-point contract of the shared kind registry. |
| 108 | `TextPreview` | none external | SIMPLIFY | Unexport; z.infer convenience, family member. |
| 109 | `CodePreview` | none external | SIMPLIFY | Same. |
| 110 | `ImagePreview` | none external | SIMPLIFY | Same. |
| 111 | `DataPreview` | none external | SIMPLIFY | Same. |
| 112 | `HtmlPreview` | none external | SIMPLIFY | Same. |
| 113 | `UrlPreview` | none external | SIMPLIFY | Same. |
| 114 | `ArtifactKind` | none external | SIMPLIFY | Unexport; derived from ARTIFACT_KINDS. |
| 115 | `KnowledgeLayer` | 3 packages | KEEP | Shared knowledge vocabulary. |
| 116 | `KnowledgeStatus` | 3 packages | KEEP | Shared. |
| 117 | `KnowledgeKind` | core-ui ×2 + design-system | MERGE → design-system | All consumers are UI-world; server stores plain text. |
| 118 | `KnowledgeScope` | core-ui ×3 | MERGE → core-ui | Single consumer. |
| 119 | `KnowledgeTopicHealth` | core-ui ×3 | MERGE → core-ui | Single consumer. |
| 120 | `KnowledgeAccessorKind` | none external | MERGE → event-bus | Member of KnowledgeAccessedEvent. |
| 121 | `KnowledgeRelevanceSignals` | DEAD | DELETE | Zero references outside declaration + barrel. |
| 122 | `KnowledgeSortOption` | core-ui ×1 | MERGE → core-ui | Single consumer. |
| 123 | `RiskTier` | DEAD | DELETE | Trust-model vocabulary nobody imports; the live riskTier lives in DB/service code. |
| 124 | `AutonomyLevel` | TEST-ONLY | DELETE | Same. |
| 125 | `PropagationLevel` | core-api ×1 + event member | MERGE → event-bus | Member of live propagation events. |
| 126 | `PropagationStatus` | DEAD | DELETE | Member of dead PropagationResult only. |
| 127 | `PropagationResult` | DEAD | DELETE | Zero external references; the events carry their own fields. |
| 128 | `MentionCandidate` | via extractMentionCandidates | MERGE → core-api | Travels with the parser. |
| 129 | `ResolvedMention` | via resolveMentions | MERGE → core-api | Same. |
| 130 | `MentionSegment` | design-system ×1 | MERGE → design-system | Travels with segmentMentions. |
| 131 | `ModelProvider` | 4 packages | KEEP | Shared gateway vocabulary. |
| 132 | `ModelTierConfig` | core-api ×2 | KEEP | Member of kept ModelGatewayConfig; directly imported. |
| 133 | `ModelGatewayConfig` | core-api ×4 + credential-access + eval | KEEP | Shared. |
| 134 | `ResolvedModel` | 6 packages | KEEP | The seam type between orchestration, execution, and the resolver. |
| 135 | `ModelCatalogEntry` | none external | SIMPLIFY | Unexport; element/return type of catalog family. |
| 136 | `ModelRequest` | credential-access ×1 | MERGE → credential-access | Input type of the resolver; single consumer. |
| 137 | `NotificationUrgency` | core-api ×1 | SIMPLIFY | Unexport; member of registry entry. |
| 138 | `NotificationTypeKey` | core-api ×2 + core-ui ×2 | KEEP | Two-sided registry key. |
| 139 | `NotificationType` | none external directly | SIMPLIFY | Unexport; element of NOTIFICATION_TYPES. |
| 140 | `ProposedCallStatus` | core-ui ×2 | MERGE → core-ui | Only review pages narrow it; server uses DB-inferred types. |
| 141 | `Reversibility` | harness-protocol + tool-protocol ×2 | KEEP | Two independent framework consumers across the tool seam. |
| 142 | `ProposedCall` | DEAD (dev-only import) | DELETE | Dead mirror; core-api uses `proposedCalls.$inferSelect` from framework/db. |
| 143 | `RoutineState` | design-system ×1 + family | KEEP | Status-mapping consumes; ROUTINE_STATES validates server-side — two-sided family. |
| 144 | `RoutineRunOutcome` | core-api ×2 | SIMPLIFY | Unexport; member of kept routine wire types. |
| 145 | `RoutineCardSummary` | core-api ×1 | SIMPLIFY | Unexport; member of TeamDetail. |
| 146 | `RoutineRunSummary` | core-api + core-ui | KEEP | Wire pair. |
| 147 | `RoutineInfo` | core-api ×1 | SIMPLIFY | Unexport; member of RoutineDetail. |
| 148 | `RoutineDetail` | core-api + core-ui ×3 | KEEP | Wire contract for routine pages. |
| 149 | `RoutineCreatePayload` | DEAD | DELETE | Route validates with its own zod schema; nobody imports this. |
| 150 | `ToolCallData` | none external | SIMPLIFY | Unexport; member of ActivityEntry union. |
| 151 | `ReasoningData` | none external | SIMPLIFY | Same. |
| 152 | `AnswerDeltaData` | none external | SIMPLIFY | Same. |
| 153 | `AnswerSettledData` | none external | SIMPLIFY | Same. |
| 154 | `HumanMessageData` | none external | SIMPLIFY | Same. |
| 155 | `ActivityEntry` | agent-orchestration ×4 + core-ui ×2 + conversation-parts | KEEP | The session-activity wire union across the WS seam. |
| 156 | `AgentSessionSourceKind` | 4 packages | KEEP | Crosses the orchestration↔harness↔tool seams. |
| 157 | `AgentSessionPromptMode` | none external | SIMPLIFY | Unexport; schema-internal. |
| 158 | `AgentSessionRequestStatus` | none external | MERGE → agent-orchestration | Vocabulary of orchestration's own request table. |
| 159 | `AgentSessionRequestInput` | agent-orchestration ×1 | KEEP | z.infer of the kept union schema. |
| 160 | `AgentSessionSourceCorrelation` | 4 packages | KEEP | Seam-crossing correlation type. |
| 161 | `SessionLifecycleCorrelation` | agent-orchestration ×1 | MERGE → agent-orchestration | Single consumer once its dead builder (A28) dies. |
| 162 | `TeamStatus` | none external | SIMPLIFY | Unexport; member of TeamSummary. |
| 163 | `TeamSummary` | none external | SIMPLIFY | Unexport; member of TeamDetail. |
| 164 | `AgentOperationalStatus` | core-ui + design-system ×3 | KEEP | Shared status vocabulary (lint-enforced registry). |
| 165 | `AgentHealthLevel` | core-ui ×1 | MERGE → core-ui | Travels with the health derivations. |
| 166 | `RosterMember` | core-api + core-ui | KEEP | Wire pair. |
| 167 | `TeamBurn` | none external | SIMPLIFY | Unexport; member of TeamDetail. |
| 168 | `BetCardSummary` | core-api + core-ui | KEEP | Wire pair. |
| 169 | `TeamDetail` | core-api + core-ui ×2 | KEEP | Wire contract for the team page. |
| 170 | `TeamListItem` | core-api + core-ui ×3 | KEEP | Wire contract. |
| 171 | `TeamListResponse` | core-ui ×2 | KEEP | Wire pair of kept TeamListItem. |
| 172 | `PrimaryHarnessConfig` | core-api ×2 + harness-capability | KEEP | Crosses core↔harness-capability seam. |
| 173 | `CreateTeamRequest` | core-api ×1 | MERGE → core-api | Only the route types it; the client posts untyped. |
| 174 | `CreateTeamResponse` | core-api ×1 | MERGE → core-api | Same. |
| 175 | `HostKind` | core-api ×6 + core-ui ×8 + design-system ×2 | KEEP | Core thread vocabulary. |
| 176 | `MessageType` | core-api ×3 + design-system | KEEP | Same. |
| 177 | `VerdictDecision` | core-ui ×4 + design-system ×2 | KEEP | Same. |
| 178 | `ArtifactViewShape` | none external directly | SIMPLIFY | Unexport; derived from kept ARTIFACT_VIEW_SHAPES, member of ArtifactRef. |
| 179 | `ThreadId` | none external | SIMPLIFY | Alias of `string`; collapse to string. |
| 180 | `MessageId` | none external | SIMPLIFY | Same. |
| 181 | `IdentityId` | none external | SIMPLIFY | Same. |
| 182 | `Thread` | core-api ×3 + core-ui ×3 + design-system | KEEP | Core model. |
| 183 | `AnchorRef` | core-ui ×7 | KEEP | Review-surface anchor type. |
| 184 | `InlineRefKind` | none external | SIMPLIFY | Unexport; union of the kept ref kinds. |
| 185 | `EntityRef` | conversation-parts ×1 | KEEP | Member of kept InlineRef union, directly imported. |
| 186 | `BlockRef` | core-ui ×1 | KEEP | Same. |
| 187 | `MentionRef` | none external (comments only) | SIMPLIFY | Unexport; union member flows structurally. |
| 188 | `InlineRef` | core-ui ×2 + conversation-parts + design-system ×3 | KEEP | Core model. |
| 189 | `ArtifactRef` | core-ui + conversation-parts + design-system | KEEP | Core model. |
| 190 | `ToolCallSummary` | none external | SIMPLIFY | Unexport; member of PlainPayload. |
| 191 | `AssistantNotice` | core-ui ×1 | KEEP | Member of PlainPayload, directly imported by the overlay. |
| 192 | `PlainPayload` | core-api ×3 + core-ui ×3 | KEEP | Core model. |
| 193 | `ReviewPayload` | agent-orchestration ×1 | KEEP | Message-union member, imported across the seam. |
| 194 | `QuestionnairePayload` | none external | SIMPLIFY | Unexport; union member. |
| 195 | `VerdictPayload` | conversation-parts ×1 | KEEP | Union member, imported. |
| 196 | `RedactedPayload` | core-api ×3 + design-system | KEEP | Union member, imported. |
| 197 | `Message` | 4 packages, 17 prod files | KEEP | THE core model type. |
| 198 | `ThreadConfiguration` | DEAD | DELETE | Dies with classifyThreadConfiguration (A32). |
| 199 | `HeadCollapseResult` | none external | SIMPLIFY | Unexport; return type of kept predicate. |
| 200 | `AgentSessionStateSnapshot` | design-system ×1 | KEEP | Parameter of kept isBlocking. |
| 201 | `ArtifactThreadSummary` | core-api ×1 | KEEP | Wire pair with #202. |
| 202 | `ArtifactThreadSummaryResponse` | core-ui ×1 | KEEP | Wire pair. |
| 203 | `PlainPayloadWithBlockId` | core-ui ×1 | MERGE → core-ui | Only the client builds this request shape. |
| 204 | `TriggerEventType` | internal | MERGE → core-api/settings | Whole trigger module has one owner: the settings/behavior-config service. |
| 205 | `TriggerResultState` | internal | MERGE → core-api/settings | Same. |
| 206 | `TriggerRuleValue` | internal | MERGE → core-api/settings | Same. |
| 207 | `TriggerResolutionResult` | DEAD | DELETE | Zero references anywhere outside declaration. |
| 208 | `ArtifactPreview` | none external (name-collision hits are design-system's component) | SIMPLIFY | Unexport; member of Artifact + schema target. |
| 209 | `Artifact` | core-api + core-ui ×2 + design-system ×4 | KEEP | Core wire model. |
| 210 | `ArtifactPage` | core-api + core-ui | KEEP | Wire pair. |
| 211 | `ArtifactFilterAxis` | core-ui ×2 | MERGE → core-ui | Client-side filter vocabulary. |
| 212 | `ArtifactQuery` | core-ui ×2 | MERGE → core-ui | Server validates with its own zod; only client imports. |
| 213 | `CreateArtifactInput` | DEAD | DELETE | core-api/work has its own CreateArtifactInput in artifact-store.ts; this one has zero callers. |
| 214 | `CurrencyCode` | DEAD | DELETE | Dead Money library. |
| 215 | `Money` | DEAD | DELETE | Same. |
| 216 | `WireMoney` | DEAD (comments only) | DELETE | Same. |
| 217 | `TierTokenCount` | agent-execution ×1 | KEEP | Live token accounting (SessionEndedEvent tokensByTier path). |
| 218 | `TokenUsage` | agent-execution + core-ui + harness-protocol | KEEP | Same, three consumers. |
| 219 | `TaskState` | core-api ×4 + core-ui + design-system ×2 + eval ×2 | KEEP | Core state vocabulary. |
| 220 | `MutableBetField` | DEAD | DELETE | Dies with MUTABLE_BET_FIELDS (dead mirror of bet-state-machine.MUTABLE_FIELDS). |
| 221 | `HealthResponse` | core-api ×1 | MERGE → core-api | Health route's own 2-field shape. |
| 222 | `KnowledgeFormat` | DEAD (comment refs only) | DELETE | AU14 widened the real column to string; this union is a leftover. |
| 223 | `KernelKnowledgeStatus` | agent-orchestration + core-api | KEEP | Crosses the tool-definition seam. |
| 224 | `BetStatus` | 4 packages | KEEP | Core state vocabulary. |
| 225 | `SessionState` | DEAD | DELETE | Zero imports; session state lives in orchestration's own types. |
| 226 | `ModelTier` | 6 packages | KEEP | The most-shared type in the package. |
| 227 | `TriggerType` | none external | SIMPLIFY | Unexport; member of RoutineInfo. |
| 228 | `AgentCategory` | eval + internal catalog | KEEP | Element type of shared AGENT_CATEGORIES/catalog. |
| 229 | `UserRole` | 9 prod files | DELETE | `type UserRole = string` — a fake type providing zero safety. Replace every import with `string`. |
| 230 | `UserStatus` | DEAD | DELETE | Zero imports. |
| 231 | `UserKind` | DEAD | DELETE | Zero imports; db doesn't type the column with it. |
| 232 | `OrgEdgeMechanism` | core-api ×1 | MERGE → core-api/org | Single owner. |
| 233 | `ScopeKind` | agent-orchestration + core-ui ×5 + eval | KEEP | Shared knowledge-scope vocabulary. |
| 234 | `BetOutcomeVerdict` | core-ui ×2 + design-system ×2 | KEEP | Shared verdict vocabulary. |
| 235 | `TaskOutcomeVerdict` | core-ui + design-system | KEEP | Same. |
| 236 | `OldKindMapping` — counted at #106 (input lists it under kinds/old-kind-map). | — | — | — |

### D. Consts (99)

| # | Const | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `AGENT_BEHAVIOR_CONFIG_KINDS` | internal guard only | SIMPLIFY | Unexport; feeds the kept guard. |
| 2 | `TEAM_FUNCTIONS` | UI:SetupFlow | KEEP | Client renders, catalog derives from it. |
| 3 | `AGENT_ROLE_CATALOG` | core-api + core-ui ×3 + factory-defaults | KEEP | The shared role catalog — 3 worlds. |
| 4 | `API_ERROR_CODES` | core-api ×16 + agent-orchestration ×4 + http-middleware ×4 | KEEP | Most-used const in the package. |
| 5 | `artifactPreviewSchema` | core-api + agent-orchestration | KEEP | Two-sided validation (route + tool schema). |
| 6 | `fallbackPreviewSchema` | core-api ×1 | KEEP | Family with #5; open-vocabulary fallback. |
| 7 | `INVITE_ROLES` | core-api ×1 | MERGE → core-api/users | Single owner. |
| 8 | `LOGIN_SESSION_TTL_MS` | core-api ×1 | MERGE → core-api/users | Single owner. |
| 9 | `INVITE_CODE_TTL_MS` | core-api ×1 | MERGE → core-api/users | Single owner. |
| 10 | `BLOCK_KINDS` | none external | MERGE → block-derivation | Blocks module moves whole. |
| 11 | `BLOCK_HOST_KINDS` | core-api ×1 | MERGE → block-derivation | Same; core-api imports block-derivation for validation. |
| 12 | `BLOCK_ID_VERSION` | block-derivation ×1 | MERGE → block-derivation | Same. |
| 13 | `IMAGE_URL_SAFE_SCHEMES` | block-derivation + design-system | MERGE → block-derivation | Same. |
| 14 | `LINK_URL_SAFE_SCHEMES` | block-derivation ×2 | MERGE → block-derivation | Same. |
| 15 | `MAX_BODY_BYTES` | block-derivation ×2 | MERGE → block-derivation | Same. |
| 16 | `CONFIGURATION_KINDS` | core-api ×1 | MERGE → core-api/settings | Single owner. |
| 17 | `PLUGIN_STATES` | none external | MERGE → framework/db | Derives PluginState, which moves to db. |
| 18 | `BUILTIN_PLUGIN_ID` | core-api ×1 | MERGE → core-api/settings | Single owner. |
| 19 | `CONNECTION_AUTH_SOURCES` | none external | SIMPLIFY | Unexport; type-derivation only once its dead guard dies. |
| 20 | `CONNECTION_HEALTH` | none external | SIMPLIFY | Same. |
| 21 | `HELD_AUTH_SOURCES` | agent-orchestration ×2 | MERGE → agent-orchestration | Provisioning-internal. |
| 22 | `CREDENTIAL_NAMES` | desktop ×1 | KEEP | Cross-world (Electron) vocabulary. |
| 23 | `CREDENTIAL_STATES` | core-api ×1 | KEEP | Derives shared CredentialState; server zod. |
| 24 | `CREDENTIAL_CATALOG` | core-api + core-ui | KEEP | Two-sided registry. |
| 25 | `CREDENTIAL_BY_PROVIDER` | none external | SIMPLIFY | Unexport; internal to credentialNameForProvider. |
| 26 | `ASSISTANT_TURN_TIMEOUT_MS` | core-ui ×1 | MERGE → core-ui | "Both sides use it" is false — only AssistantOverlay imports it in production. |
| 27 | `AGENT_WORK_INTENT_KINDS` | dev-only external | MERGE → event-bus | Travels with the intent event + guards. |
| 28 | `HINT_CATALOG` | core-ui ×1 | KEEP | Two-sided hint registry. |
| 29 | `HINT_IDS` | none external | SIMPLIFY | Unexport; internal to isHintId. |
| 30 | `OLD_KIND_MAP` | core-api ×1 | MERGE → core-api | Read-time normalization used by one route. |
| 31 | `textPreviewSchema` | internal registry | SIMPLIFY | Unexport; already marked internal. |
| 32 | `textKind` | internal registry | SIMPLIFY | Unexport. |
| 33 | `codePreviewSchema` | internal registry | SIMPLIFY | Unexport. |
| 34 | `codeKind` | internal registry | SIMPLIFY | Unexport. |
| 35 | `imagePreviewSchema` | internal registry | SIMPLIFY | Unexport. |
| 36 | `imageKind` | internal registry | SIMPLIFY | Unexport. |
| 37 | `dataPreviewSchema` | internal registry | SIMPLIFY | Unexport. |
| 38 | `dataKind` | internal registry | SIMPLIFY | Unexport. |
| 39 | `htmlPreviewSchema` | internal registry | SIMPLIFY | Unexport. |
| 40 | `htmlKind` | internal registry | SIMPLIFY | Unexport. |
| 41 | `urlPreviewSchema` | internal registry | SIMPLIFY | Unexport. |
| 42 | `urlKind` | internal registry | SIMPLIFY | Unexport. |
| 43 | `ARTIFACT_KINDS` | agent-orchestration + core-api | KEEP | Two-sided kind list. |
| 44 | `KNOWLEDGE_LAYERS` | agent-orchestration + core-api | KEEP | Two-sided. |
| 45 | `SCOPE_TO_LAYER` | core-api ×2 | MERGE → core-api | Travels with scopeToLayer. |
| 46 | `KNOWLEDGE_STATUSES` | agent-orchestration + core-ui ×2 | KEEP | Two-sided. |
| 47 | `KNOWLEDGE_STATUS_LABEL` | core-ui ×1 | KEEP | Label registry (lint-enforced pattern). |
| 48 | `KNOWLEDGE_SCOPES` | none external | MERGE → core-ui | Derives KnowledgeScope which moves there. |
| 49 | `KNOWLEDGE_TOPIC_HEALTHS` | none external | MERGE → core-ui | Same. |
| 50 | `KNOWLEDGE_SORT_OPTIONS` | core-ui ×1 | MERGE → core-ui | Single consumer. |
| 51 | `MAX_MENTIONS_PER_MESSAGE` | none external | MERGE → core-api | Travels with the mention parser. |
| 52 | `MODEL_PROVIDERS` | core-api ×2 + core-ui ×2 | KEEP | Two-sided. |
| 53 | `MODEL_CATALOG` | agent-execution ×1 (+ helpers) | KEEP | Shared model catalog. |
| 54 | `DEFAULT_AGENT_MODEL_ID` | core-api ×1 | MERGE → core-api | Agent-creation default; single owner. |
| 55 | `DEFAULT_AGENT_MODEL_PROVIDER` | core-api ×1 | MERGE → core-api | Same. |
| 56 | `DEFAULT_AGENT_HARNESS` | core-api ×1 | MERGE → core-api | Same. |
| 57 | `BUILT_IN_GATEWAY_CONFIG` | core-api ×1 | MERGE → core-api/settings | Single owner (server-config fallback). |
| 58 | `NOTIFICATION_TYPES` | core-api + core-ui | KEEP | Two-sided registry. |
| 59 | `PROPOSED_CALL_STATUSES` | TEST-ONLY external | MERGE → core-ui | Travels (unexported) with ProposedCallStatus. |
| 60 | `REVERSIBILITY` | TEST-ONLY external | SIMPLIFY | Unexport; derives kept Reversibility. |
| 61 | `ROUTINE_STATES` | core-api ×1 | KEEP | Server zod for the kept RoutineState family. |
| 62 | `ROUTINE_RUN_OUTCOMES` | none external | SIMPLIFY | Unexport; type-derivation only. |
| 63 | `SCHEDULE_PRESETS` | core-ui ×2 | MERGE → core-ui | Pure UI presets. |
| 64 | `AGENT_SESSION_SOURCE_KINDS` | agent-orchestration ×1 + internal trigger schema | KEEP | Seam vocabulary (also feeds trigger schema post-move). |
| 65 | `AGENT_SESSION_PROMPT_MODES` | none external | SIMPLIFY | Unexport; schema-internal. |
| 66 | `AGENT_SESSION_REQUEST_STATUSES` | none external | MERGE → agent-orchestration | Its request table's vocabulary. |
| 67 | `taskSessionRequestInputSchema` | none external | SIMPLIFY | Unexport; branch of the kept union schema. |
| 68 | `assistantSessionRequestInputSchema` | none external | SIMPLIFY | Same. |
| 69 | `routineSessionRequestInputSchema` | none external | SIMPLIFY | Same. |
| 70 | `knowledgeSessionRequestInputSchema` | none external | SIMPLIFY | Same. |
| 71 | `proposedCallSessionRequestInputSchema` | none external | SIMPLIFY | Same. |
| 72 | `agentSessionRequestInputSchema` | agent-orchestration ×2 | KEEP | The intake contract. |
| 73 | `TASK_STATE_TRANSITIONS` | core-api ×1 | MERGE → core-api/work | Task state machine data. |
| 74 | `HOST_KINDS` | core-api ×1 | KEEP | Derives shared HostKind; server zod. |
| 75 | `MESSAGE_TYPES` | core-api ×1 | KEEP | Same for MessageType. |
| 76 | `VERDICT_DECISIONS` | core-api ×1 | KEEP | Same for VerdictDecision. |
| 77 | `ARTIFACT_VIEW_SHAPES` | agent-orchestration + core-api | KEEP | Two-sided. |
| 78 | `TRIGGER_EVENT_TYPES` | internal | MERGE → core-api/settings | Trigger module moves whole. |
| 79 | `TRIGGER_RESULT_STATES` | internal | MERGE → core-api/settings | Same. |
| 80 | `TriggerRuleValueSchema` | core-api ×2 | MERGE → core-api/settings | Same. |
| 81 | `CURRENCY_CODES` | DEAD | DELETE | Dead Money library. |
| 82 | `CURRENCY_SCALE` | DEAD | DELETE | Same. |
| 83 | `TASK_STATES` | core-api ×2 | KEEP | Core vocabulary, server zod. |
| 84 | `TASK_STATE_LABEL` | core-ui ×2 | KEEP | Label registry — eslint-plugin-design's no-local-status-builder points here. |
| 85 | `MUTABLE_BET_FIELDS` | DEAD | DELETE | Dead mirror; bet-state-machine.MUTABLE_FIELDS is the live copy. Doc comment claiming route usage is false. |
| 86 | `KERNEL_KNOWLEDGE_STATUSES` | agent-orchestration ×1 | KEEP | Derives shared KernelKnowledgeStatus. |
| 87 | `BET_STATUSES` | core-api + core-ui | KEEP | Core vocabulary. |
| 88 | `BET_STATUS_LABEL` | core-ui ×2 + design-system | KEEP | Label registry. |
| 89 | `MODEL_TIERS` | 4 packages | KEEP | Core vocabulary. |
| 90 | `AGENT_CATEGORIES` | core-api ×1 | KEEP | Derives shared AgentCategory. |
| 91 | `USER_KINDS` | DEAD | DELETE | Zero imports. |
| 92 | `ORG_EDGE_MECHANISMS` | core-api ×1 | MERGE → core-api/org | Single owner. |
| 93 | `SCOPE_KINDS` | 3 packages | KEEP | Shared. |
| 94 | `SCOPES_REQUIRING_ID` | 3 packages | KEEP | Shared. |
| 95 | `BET_OUTCOME_VERDICTS` | core-api + core-ui | KEEP | Core vocabulary. |
| 96 | `BET_OUTCOME_VERDICT_LABEL` | core-ui + design-system | KEEP | Label registry. |
| 97 | `TASK_OUTCOME_VERDICTS` | core-api ×1 | KEEP | Core vocabulary. |
| 98 | `TASK_OUTCOME_VERDICT_LABEL` | core-ui ×1 | KEEP | Label registry. |
| 99 | `AGENT_OPERATIONAL_STATUS_LABEL` | core-ui ×2 | KEEP | Label registry. |

## Holes this leaves

- **Five dead events + dispatcher cases**: `core-api/src/observability/dispatcher.ts` loses five cases; the `DomainEvent` union shrinks. No runtime behavior changes — nothing emitted them.
- **`VersionConflictError` delete**: `error-handler.ts` must drop the dead `instanceof` and rely on (or import) core-api/knowledge's real class. Behavior today already flows through the `err.name` fallback, so nothing user-visible changes — but the middleware should stop pretending the instanceof works.
- **`UserRole` delete**: 9 production files change an import to `string`. Any future closed role enum would be a new decision, which is correct — the current type falsely implies one exists.
- **blocks/types.ts → block-derivation**: design-system and core-ui gain an import edge on `@hyperidle/block-derivation`; the framework-surfaces/reach declarations need updating. If governance forbids design-system→block-derivation, the fallback is keeping blocks/types in the slim shared core — the DELETE/SIMPLIFY rows are unaffected.
- **events.ts → event-bus**: every subscriber file changes an import path (large mechanical diff, zero behavior). `framework/db`'s intent-kind parity test follows the vocabulary to its new home.
- **`AgentBehaviorConfigErrorResponse` → ApiErrorResponse**: the settings route's error body loses nothing — the shapes are identical.
- **Money library delete**: if a future cost feature returns, it starts from its own design, not from an unexercised bigint library whose only proof of correctness is its own unit tests.
- **Misfiled test**: `framework/domain-model/src/http/__tests__/rate-limit.test.ts` tests `@hyperidle/http-middleware`'s rate limiter — it should move to http-middleware regardless of the rest of this verdict (the whole `src/http/` dir in domain-model contains nothing but that test).
