# Delete bundle 8 — fw-conversation-parts, users, fw-block-derivation, fw-work-intent-port

18 convicted rows across 4 package(s).

| # | Package | Symbol | Reach | Why convicted |
|---|---|---|---|---|
| 1 | fw-conversation-parts | `PartKind` | type · none (PartList mention is a comment) | Stands: exported to nobody; internal use inlines into the union. |
| 2 | fw-conversation-parts | `PartId` | type · none | Stands: alias of string, zero consumers. |
| 3 | fw-conversation-parts | `ReviewTarget` | interface · none outside package | Stands: internal-only; inline the shape; betId is always "" at the only construction site. |
| 4 | fw-conversation-parts | `FoldDescriptor` | interface · DEAD | Stands: zero references anywhere, not even inside its own package. Pure corpse. |
| 5 | fw-conversation-parts | `EmbedKind` | type · DEAD | Stands: zero references outside its own derivation line. |
| 6 | fw-conversation-parts | `PART_KINDS` | const · TEST-ONLY externally; internal type derivation | Stands: no runtime production reader; inline the union literals. |
| 7 | fw-conversation-parts | `EMBED_KINDS` | const · TEST-ONLY | Stands: only readers are the package's own tests asserting the const equals itself. |
| 8 | users | `reapExpiredCredentials` | SCHED:6h retention sweep (service-bootstrap.ts:510) | Reaps tables that die with feature kill #1; under OIDC the provider owns session lifecycle — there is nothing home-grown left to reap. |
| 9 | users | `setAgentCategoryForRole` | BOOTSTRAP (bootstrap/factory-state.ts) | Permanent re-run of the one-time AB0 backfill; on a shared backend it reverts another human's recategorization every boot. Unchanged. |
| 10 | users | `listDismissedHints` | UI:GET /api/hint-progress/ | Re-judged under Ruling 1, stands — localStorage is per-human already; tooltip memory earns no table. |
| 11 | users | `dismissHint` | UI:POST /api/hint-progress/:hintId/dismiss | Dies with #5. Unchanged. |
| 12 | users | `ReapExpiredCredentialsArgs` |  | Dies with row 1. |
| 13 | users | `ReapExpiredCredentialsResult` |  | Dies with row 1. |
| 14 | users | `DismissedHint` |  | Dies with rows 5–6. |
| 15 | fw-block-derivation | `assertNoCollisions` | function · INTERNAL (wired to a no-op logger) + TEST-ONLY external refs | Reports to nobody by construction; golden-ids snapshot is the real guard. Delete export, dev-mode call, and the test that pokes it. |
| 16 | fw-block-derivation | `CollisionLogger (unexported, derive-blocks.ts:440)` |  | Dies with assertNoCollisions; its only real implementation is a no-op. |
| 17 | fw-work-intent-port | `AgentWorkIntentRecorder` | interface · BOOTSTRAP: app.ts:405-437 wires buildSeamBackedWorkIntentRecorder; injected into threads.ts, work, policy, routine, review | Port with one implementation = indirection, and its TTx/tx parameter is a lie — the sole implementation ignores it (record: (_tx, input) => port.intents.submit(input)). It is a second name for AgentOrchestrationPort.intents.submit. Replace every injected AgentWorkIntentRecorder<X> with the plain function type; delete the two shared-type pin tests with it; fix the false atomicity story in the package header by deleting the package. |
| 18 | fw-work-intent-port | `AgentWorkIntentReader` | interface · DEAD | Zero implementations, zero callers — findByKindAndSource appears nowhere outside this package (rg -a across layers/framework/applications/tools). Referenced only by two stale @lore comments. Dead on arrival since the AU31 reshape. |
