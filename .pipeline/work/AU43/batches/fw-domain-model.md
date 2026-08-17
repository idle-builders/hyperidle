# Delete batch — `fw-domain-model`

50 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `isConfigurationKind` | DEAD | core-api wrote its own private copy (plugin-configuration.ts:138); this export has zero callers. |
| 2 | `isPluginState` | DEAD | Zero callers anywhere. |
| 3 | `isConnectionAuthSource` | TEST-ONLY | Only a test references it. |
| 4 | `isHeldAuthSource` | TEST-ONLY | Only a test references it. |
| 5 | `urgencyForType` | DEAD | Zero callers. Not an event — a helper over the live registry; Ruling 2 boundary does not protect it. |
| 6 | `buildSessionLifecycleCorrelation` | TEST-ONLY | Literal identity function (return input;). One test imports it. Founder-confirmed. |
| 7 | `exhaustiveAssert` | INTERNAL: conversation-parts, design-system | 3-line language util; each consumer inlines its own never-guard. |
| 8 | `classifyThreadConfiguration` | TEST-ONLY | Self-described "documentation-only classifier — never persisted". Zero prod callers. |
| 9 | `isTriggerEventType` | DEAD | Zero callers; the trigger intake validates via TriggerRuleValueSchema instead. Dead plumbing for a non-subscriber reason — Ruling 2 boundary does not protect it. The vocabulary it guards survives (C.204/D.78). |
| 10 | `scaleForCurrency` | DEAD | Dead Money library (feature-kill 1). |
| 11 | `zeroMoney` | DEAD | Same. |
| 12 | `moneyFromWire` | DEAD | Same. |
| 13 | `moneyToWire` | DEAD | Same. |
| 14 | `addMoney` | DEAD | Same. |
| 15 | `compareMoney` | DEAD | Same. |
| 16 | `totalTokens` | DEAD | A @lore comment orders callers to use it; none do. |
| 17 | `addTokenUsage` | TEST-ONLY | Only tests call it. |
| 18 | `VersionConflictError` | DEAD (as a class) | Never instantiated. core-api/knowledge throws its OWN 2-arg VersionConflictError; error-handler's instanceof on this one never matches — the err.name string fallback does the real work. Founder-confirmed. |
| 19 | `ActiveRoutinesError` | DEAD | No new ActiveRoutinesError anywhere. |
| 20 | `ProviderTimeoutError` | DEAD | No throw site anywhere in production. |
| 21 | `CassetteMissError` | TEST-ONLY (__testing__/llm-cassette.ts) | Only a development-world module throws/catches it; move the class into that module. |
| 22 | `AgentBehaviorConfigErrorResponse` | core-api ×1 | {error, code} — a duplicate of ApiErrorResponse. Use that. |
| 23 | `InviteRole` | core-api ×1 | REVISED (Ruling 1). Was MERGE → core-api/users. OIDC replaces invites; its only consumer (invite-code.ts) is machinery the founder ruled dead. Dies with it. |
| 24 | `KernelEvent` | TEST-ONLY | Union grouping, not an event type — inlining into DomainEvent removes zero events from the extension surface. The kernel/strategy split is a docs concept, not a runtime seam. Ruling 2 boundary: plumbing, not vocabulary. |
| 25 | `StrategyEvent` | internal only | Same. |
| 26 | `KnowledgeRelevanceSignals` | DEAD | Zero references outside declaration + barrel. Not an event; not protected. |
| 27 | `RiskTier` | DEAD | Trust-model vocabulary nobody imports; the live riskTier lives in DB/service code. |
| 28 | `AutonomyLevel` | TEST-ONLY | Same. |
| 29 | `PropagationStatus` | DEAD | Member of dead PropagationResult only. Ruling 2 boundary: a payload nothing ever sets is not protected; the live propagation events carry their own fields and survive (C.89/90). |
| 30 | `PropagationResult` | DEAD | Zero external references; same boundary as #126. |
| 31 | `RoutineCreatePayload` | DEAD | Route validates with its own zod schema; nobody imports this. |
| 32 | `ThreadConfiguration` | DEAD | Dies with classifyThreadConfiguration (A32). |
| 33 | `TriggerResolutionResult` | DEAD | Zero references anywhere outside declaration. A record type nothing constructs — not an event; not protected. |
| 34 | `CreateArtifactInput` | DEAD | core-api/work has its own CreateArtifactInput in artifact-store.ts; this one has zero callers. |
| 35 | `CurrencyCode` | DEAD | Dead Money library. |
| 36 | `Money` | DEAD | Same. |
| 37 | `WireMoney` | DEAD (comments only) | Same. |
| 38 | `MutableBetField` | DEAD | Dies with MUTABLE_BET_FIELDS (dead mirror of bet-state-machine.MUTABLE_FIELDS). |
| 39 | `KnowledgeFormat` | DEAD (comment refs only) | AU14 widened the real column to string; this union is a leftover. |
| 40 | `SessionState` | DEAD | Zero imports; session state lives in orchestration's own types. |
| 41 | `UserRole` | 9 prod files | type UserRole = string — a fake type providing zero safety. Replace every import with string. Ruling 1 does not resurrect it: OIDC carries the real role facts; this alias carries none. Founder-confirmed. |
| 42 | `UserStatus` | DEAD | Zero imports. Dead is dead under any deployment premise. |
| 43 | `UserKind` | DEAD | Zero imports; db doesn't type the column with it. |
| 44 | `INVITE_ROLES` | core-api ×1 | REVISED (Ruling 1). Was MERGE → core-api/users. OIDC replaces invites; the consumer dies, the constant dies with it. |
| 45 | `LOGIN_SESSION_TTL_MS` | core-api ×1 | REVISED (Ruling 1). Home-grown login-session machinery is dead; OIDC owns session lifetime. |
| 46 | `INVITE_CODE_TTL_MS` | core-api ×1 | REVISED (Ruling 1). Invite codes are not the access mechanism. |
| 47 | `CURRENCY_CODES` | DEAD | Dead Money library. |
| 48 | `CURRENCY_SCALE` | DEAD | Same. |
| 49 | `MUTABLE_BET_FIELDS` | DEAD | Dead mirror; bet-state-machine.MUTABLE_FIELDS is the live copy. Doc comment claiming route usage is false. |
| 50 | `USER_KINDS` | DEAD | Zero imports. |
