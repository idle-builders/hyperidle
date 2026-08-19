# Delete bundle 2 — fw-domain-model

45 convicted rows across 1 package(s).

| # | Package | Symbol | Reach | Why convicted |
|---|---|---|---|---|
| 1 | fw-domain-model | `isConfigurationKind` | DEAD | core-api wrote its own private copy (plugin-configuration.ts:138); this export has zero callers. |
| 2 | fw-domain-model | `isPluginState` | DEAD | Zero callers anywhere. |
| 3 | fw-domain-model | `isConnectionAuthSource` | TEST-ONLY | Only a test references it. |
| 4 | fw-domain-model | `isHeldAuthSource` | TEST-ONLY | Only a test references it. |
| 5 | fw-domain-model | `urgencyForType` | DEAD | Zero callers. Not an event — a helper over the live registry; Ruling 2 boundary does not protect it. |
| 6 | fw-domain-model | `buildSessionLifecycleCorrelation` | TEST-ONLY | Literal identity function (return input;). One test imports it. Founder-confirmed. |
| 7 | fw-domain-model | `exhaustiveAssert` | INTERNAL: conversation-parts, design-system | 3-line language util; each consumer inlines its own never-guard. |
| 8 | fw-domain-model | `classifyThreadConfiguration` | TEST-ONLY | Self-described "documentation-only classifier — never persisted". Zero prod callers. |
| 9 | fw-domain-model | `scaleForCurrency` | DEAD | Dead Money library (feature-kill 1). |
| 10 | fw-domain-model | `zeroMoney` | DEAD | Same. |
| 11 | fw-domain-model | `moneyFromWire` | DEAD | Same. |
| 12 | fw-domain-model | `moneyToWire` | DEAD | Same. |
| 13 | fw-domain-model | `addMoney` | DEAD | Same. |
| 14 | fw-domain-model | `compareMoney` | DEAD | Same. |
| 15 | fw-domain-model | `totalTokens` | DEAD | A @lore comment orders callers to use it; none do. |
| 16 | fw-domain-model | `addTokenUsage` | TEST-ONLY | Only tests call it. |
| 17 | fw-domain-model | `VersionConflictError` | DEAD (as a class) | Never instantiated. core-api/knowledge throws its OWN 2-arg VersionConflictError; error-handler's instanceof on this one never matches — the err.name string fallback does the real work. Founder-confirmed. |
| 18 | fw-domain-model | `ActiveRoutinesError` | DEAD | No new ActiveRoutinesError anywhere. |
| 19 | fw-domain-model | `ProviderTimeoutError` | DEAD | No throw site anywhere in production. |
| 20 | fw-domain-model | `CassetteMissError` | TEST-ONLY (__testing__/llm-cassette.ts) | Only a development-world module throws/catches it; move the class into that module. |
| 21 | fw-domain-model | `KernelEvent` | TEST-ONLY | Union grouping, not an event type — inlining into DomainEvent removes zero events from the extension surface. The kernel/strategy split is a docs concept, not a runtime seam. Ruling 2 boundary: plumbing, not vocabulary. |
| 22 | fw-domain-model | `StrategyEvent` | internal only | Same. |
| 23 | fw-domain-model | `KnowledgeRelevanceSignals` | DEAD | Zero references outside declaration + barrel. Not an event; not protected. |
| 24 | fw-domain-model | `RiskTier` | DEAD | Trust-model vocabulary nobody imports; the live riskTier lives in DB/service code. |
| 25 | fw-domain-model | `AutonomyLevel` | TEST-ONLY | Same. |
| 26 | fw-domain-model | `PropagationStatus` | DEAD | Member of dead PropagationResult only. Ruling 2 boundary: a payload nothing ever sets is not protected; the live propagation events carry their own fields and survive (C.89/90). |
| 27 | fw-domain-model | `PropagationResult` | DEAD | Zero external references; same boundary as #126. |
| 28 | fw-domain-model | `RoutineCreatePayload` | DEAD | Route validates with its own zod schema; nobody imports this. |
| 29 | fw-domain-model | `ThreadConfiguration` | DEAD | Dies with classifyThreadConfiguration (A32). |
| 30 | fw-domain-model | `TriggerResolutionResult` | DEAD | Zero references anywhere outside declaration. A record type nothing constructs — not an event; not protected. |
| 31 | fw-domain-model | `CreateArtifactInput` | DEAD | core-api/work has its own CreateArtifactInput in artifact-store.ts; this one has zero callers. |
| 32 | fw-domain-model | `CurrencyCode` | DEAD | Dead Money library. |
| 33 | fw-domain-model | `Money` | DEAD | Same. |
| 34 | fw-domain-model | `WireMoney` | DEAD (comments only) | Same. |
| 35 | fw-domain-model | `MutableBetField` | DEAD | Dies with MUTABLE_BET_FIELDS (dead mirror of bet-state-machine.MUTABLE_FIELDS). |
| 36 | fw-domain-model | `KnowledgeFormat` | DEAD (comment refs only) | AU14 widened the real column to string; this union is a leftover. |
| 37 | fw-domain-model | `SessionState` | DEAD | Zero imports; session state lives in orchestration's own types. |
| 38 | fw-domain-model | `UserRole` | 9 prod files | type UserRole = string — a fake type providing zero safety. Replace every import with string. Ruling 1 does not resurrect it: OIDC carries the real role facts; this alias carries none. Founder-confirmed. |
| 39 | fw-domain-model | `UserStatus` | DEAD | Zero imports. Dead is dead under any deployment premise. |
| 40 | fw-domain-model | `UserKind` | DEAD | Zero imports; db doesn't type the column with it. |
| 41 | fw-domain-model | `LOGIN_SESSION_TTL_MS` | core-api ×1 | REVISED (Ruling 1). Home-grown login-session machinery is dead; OIDC owns session lifetime. |
| 42 | fw-domain-model | `CURRENCY_CODES` | DEAD | Dead Money library. |
| 43 | fw-domain-model | `CURRENCY_SCALE` | DEAD | Same. |
| 44 | fw-domain-model | `MUTABLE_BET_FIELDS` | DEAD | Dead mirror; bet-state-machine.MUTABLE_FIELDS is the live copy. Doc comment claiming route usage is false. |
| 45 | fw-domain-model | `USER_KINDS` | DEAD | Zero imports. |
