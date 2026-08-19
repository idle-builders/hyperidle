# Delete bundle 4 — knowledge

19 convicted rows across 1 package(s).

| # | Package | Symbol | Reach | Why convicted |
|---|---|---|---|---|
| 1 | knowledge | `ensureFactoryKnowledgeSeed` | BOOTSTRAP (factory-state.ts first boot) | Not ritual — decorative onboarding row; principle lives in ETHOS.md. Empty fabric on install is honest. |
| 2 | knowledge | `resolveKnowledgeActionRequest` | TEST-ONLY (sole caller POST /:id/flag — zero UI/seam callers since AD6) | Dead door end to end; re-provision is a conversation with an agent, no plugin machinery needed. |
| 3 | knowledge | `get (view:"projection")` | DEAD (zero production callers; rg-confirmed first wave) | Nobody asks for layer+kind alone. |
| 4 | knowledge | `list ({exportable})` | DEAD (lore cites server-factory.ts — renamed, zero usage) | Export machinery with no consumer; enterprise reflex. |
| 5 | knowledge | `list ({scope})` | DEAD (zero production callers) | Leftover from deleted knowledge-reader; KnowledgeScope dies with it. |
| 6 | knowledge | `countAccesses` | UI:GET /api/knowledge/:id (accessCount display) | Re-examined: telemetry, not ritual. Dies with the log; kill route field + display. |
| 7 | knowledge | `transition ({target:"flag"})` | TEST-ONLY (POST /:id/flag has zero callers) | Re-examined: dead door, and no plugin-worthy ritual behind it. |
| 8 | knowledge | `transition ({target:"merge"})` | TEST-ONLY (zero UI/seam callers) | Bulk-curation op nobody reaches. |
| 9 | knowledge | `transition ({target:"split"})` | TEST-ONLY (zero UI/seam callers) | Same as merge. |
| 10 | knowledge | `recordAccess` | UI:GET /api/knowledge/:id (log insert only — the event is emitted by the route, not here) | R2-checked: the log write is telemetry and dies with the table; the knowledge_accessed EVENT stays (routes/knowledge.ts:497) as extension surface. |
| 11 | knowledge | `recomputeRelevance (itemIds)` | EVENT:knowledge_accessed (relevance-listener only) | Re-examined: not ritual — machinery for a sort pill rank never reads. Its input event stays for real plugins. |
| 12 | knowledge | `recomputeRelevance (signals)` | TEST-ONLY (no production caller) | Test-facing exposure of internals. |
| 13 | knowledge | `recomputeRelevance (impl)` | — | Whole relevance engine goes (service/engine/listener). |
| 14 | knowledge | `reapAccessLog` | SCHED:retention reaper (service-bootstrap.ts:518) | Re-examined: retention policy for telemetry — enterprise reflex, not ritual. |
| 15 | knowledge | `C1` | KnowledgeActionSourceUnavailableError · TEST-ONLY (flag chain) | Dies with the resolver. |
| 16 | knowledge | `KnowledgeActionResolverDeps` |  | Port for a dead resolver. |
| 17 | knowledge | `BakedKnowledgeActionRequest` |  | Return shape of a dead resolver. |
| 18 | knowledge | `RecordAccessInput` |  | Dies with recordAccess. |
| 19 | knowledge | `KnowledgeScope` |  | Only consumer was dead list({scope}); core-api's barrel already dropped its re-export. |
