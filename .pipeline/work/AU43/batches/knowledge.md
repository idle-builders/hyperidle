# Delete batch — `knowledge`

24 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `recomputeAttention` |  | R3 — attention/importance scoring is curation ritual |
| 2 | `transition({recomputeAttention})` |  | R3 — agent score-override is the same ritual's door |
| 3 | `sweep("autoPromotion")` |  | R3 — promotion pipeline, named ritual |
| 4 | `sweep("stale")` |  | R3 — scheduled decay ceremony |
| 5 | `sweep (impl)` |  | R3 — dies from core with both kinds |
| 6 | `ensureFactoryKnowledgeSeed` | BOOTSTRAP (factory-state.ts first boot) | Not ritual — decorative onboarding row; principle lives in ETHOS.md. Empty fabric on install is honest. |
| 7 | `resolveKnowledgeActionRequest` | TEST-ONLY (sole caller POST /:id/flag — zero UI/seam callers since AD6) | Dead door end to end; re-provision is a conversation with an agent, no plugin machinery needed. |
| 8 | `get (view:"projection")` | DEAD (zero production callers; rg-confirmed first wave) | Nobody asks for layer+kind alone. |
| 9 | `list ({exportable})` | DEAD (lore cites server-factory.ts — renamed, zero usage) | Export machinery with no consumer; enterprise reflex. |
| 10 | `list ({scope})` | DEAD (zero production callers) | Leftover from deleted knowledge-reader; KnowledgeScope dies with it. |
| 11 | `countAccesses` | UI:GET /api/knowledge/:id (accessCount display) | Re-examined: telemetry, not ritual. Dies with the log; kill route field + display. |
| 12 | `transition ({target:"flag"})` | TEST-ONLY (POST /:id/flag has zero callers) | Re-examined: dead door, and no plugin-worthy ritual behind it. |
| 13 | `transition ({target:"merge"})` | TEST-ONLY (zero UI/seam callers) | Bulk-curation op nobody reaches. |
| 14 | `transition ({target:"split"})` | TEST-ONLY (zero UI/seam callers) | Same as merge. |
| 15 | `recordAccess` | UI:GET /api/knowledge/:id (log insert only — the event is emitted by the route, not here) | R2-checked: the log write is telemetry and dies with the table; the knowledge_accessed EVENT stays (routes/knowledge.ts:497) as extension surface. |
| 16 | `recomputeRelevance (itemIds)` | EVENT:knowledge_accessed (relevance-listener only) | Re-examined: not ritual — machinery for a sort pill rank never reads. Its input event stays for real plugins. |
| 17 | `recomputeRelevance (signals)` | TEST-ONLY (no production caller) | Test-facing exposure of internals. |
| 18 | `recomputeRelevance (impl)` | — | Whole relevance engine goes (service/engine/listener). |
| 19 | `reapAccessLog` | SCHED:retention reaper (service-bootstrap.ts:518) | Re-examined: retention policy for telemetry — enterprise reflex, not ritual. |
| 20 | `C1` | KnowledgeActionSourceUnavailableError · TEST-ONLY (flag chain) | Dies with the resolver. |
| 21 | `KnowledgeActionResolverDeps` |  | Port for a dead resolver. |
| 22 | `BakedKnowledgeActionRequest` |  | Return shape of a dead resolver. |
| 23 | `RecordAccessInput` |  | Dies with recordAccess. |
| 24 | `KnowledgeScope` |  | Only consumer was dead list({scope}); core-api's barrel already dropped its re-export. |
