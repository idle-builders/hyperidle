# knowledge — destroyer verdict

## Should this service exist?

**KEEP AS the shared-knowledge store + session-context assembler — nothing else.** Shared knowledge is one of HyperIdle's three pillars (conversations, bets, knowledge), and two things in this package are genuinely load-bearing: the CRUD surface behind the Knowledge UI + agent tools (`write_memory`, `query_practice`, `promote_knowledge`, `create_conflict_review`, writeback), and `assembleSessionKnowledge`, which puts shared knowledge into every agent session at launch.

Everything else is an autonomous curation bureaucracy bolted onto that store: **three separate scoring systems** (attention score, relevance score, session ranking score — three answers to "how important is this item", only the third is ever consumed by anything that matters), an access-telemetry log with its own retention reaper, two nightly sweeps (auto-promotion, stale-decay), a contradiction detector fed by `meta.claims`/`meta.forbids` JSON that **no production write path ever produces** (verified: zero writers repo-wide — it structurally cannot fire), and a flag→agent-review pipeline whose HTTP door has **zero callers** since AD6 removed Flag from the UI ("it is an agent operation, not user-facing" — no agent path exists either). Roughly half the package (~2,300 of 4,620 lines: attention-service, attention-scoring, attention-classifier, promotion-pipeline, relevance-service, relevance-engine, relevance-listener, fts, knowledge-action-resolver, factory-seed) serves machinery no human asked for and no door reaches, or reaches only through doors that themselves should die.

## If written today, from scratch

Eleven functions:

- `create`, `get` (item / joined-detail), `update`, `remove`, `list` (visible, retroForBet, titlesByIds, recentByLayers, relatedByTopic, base), `search` (text mode only), `count` (triage badge)
- `transition` (two targets: `promote`, `changeScope`)
- `recordConflict`, `findOpenConflict` (protect agent-proposed edits from silent loss on version conflict)
- `assembleSessionKnowledge` (with `rank` folded in as a private function)

No scoring engines, no sweeps, no access log, no FTS, no flag resolver, no factory seed.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 19 |
| MERGE | 2 |
| SIMPLIFY | 8 |
| KEEP | 13 |

Surface: 42 function rows → 21 surviving declarations (50% cut); ~4,620 lines → ~2,300 (10 of 21 source files deleted outright).

## Feature-level kills

1. **Attention engine — whole feature** (`attention-service.ts` 463 lines, `attention-scoring.ts` 340, `attention-classifier.ts` 52, attention half of `scoring-config.ts`). DB-weighted heuristic scores, a 0.7 threshold that auto-creates review items with idempotency markers, Mechanism-C ports into `work` and `review`. Kill the callers too: `score_attention` tool (already a literal no-op for its `item` target), `POST /api/knowledge/:id/recompute-attention`, `PATCH /:id/attention-score`, seam methods `recomputeAttentionScoreForItem` + `upsertKnowledgeAppProjectionAttentionScore`, `recomputeAttentionForCandidates` routine port, `review`'s `createReviewItemForKnowledge`/`attentionReviewReasoningMarker` and `work`'s `findItemByReasoningMarker` port wiring, `knowledgeAppProjection.attentionScore` column. What breaks: nothing auto-surfaces "knowledge needs attention"; triage sorts by updatedAt. Acceptable — a small team curates by reading. If wanted later, earn it from a real learning (ETHOS), don't pre-build it.
2. **Relevance engine — whole feature** (`relevance-service.ts` 254, `relevance-engine.ts` 119, `relevance-listener.ts` 47, relevance half of `scoring-config.ts`). Recomputes a denormalized `relevanceScore` on every item view; its only consumer is a sort pill in KnowledgeList. `rank()` — the scoring that actually matters — never reads it. What breaks: the "relevance" sort pill. Acceptable.
3. **Access telemetry — whole feature** (`recordAccess`, `countAccesses`, `reapAccessLog`, `knowledgeAccessLog` table, `knowledge_accessed` event). Per-item view logging with 30-day counts and its own retention reaper — an audit trail with a retention policy, the purest enterprise reflex in the package. Every seam version-lookup pollutes it. What breaks: accessCount on detail page, frequency sort pill, lastActivityAt in list. Acceptable.
4. **Auto-promotion + stale sweeps** (`promotion-pipeline.ts`, 634 lines, all of it). 5-cross-scope auto-promotion, 90-day auto-stale, contradiction detection over meta JSON nobody writes (provably dead logic). Kill callers: `builtin:knowledge-promotion` + `builtin:knowledge-decay` routine specs/crons/handlers/ports. Promotion stays what it honestly is: a deliberate `promote_knowledge` act by an agent or human. What breaks: no automatic lifecycle transitions. Acceptable — and the 9-status lifecycle these sweeps justify should shrink with them.
5. **Flag → knowledge_action pipeline** (`knowledge-action-resolver.ts` 177 lines, `POST /:id/flag` route, `transition({target:"flag"})`, `resolveOrCreateKnowledgeCallingThread` binding, the `knowledge_action` intent kind downstream). The door has zero UI and zero seam callers — TEST-ONLY end to end. Delete the route, the resolver, the tests.
6. **FTS** (`fts.ts`, 127 lines). The *default* mode of `search()` — and both production callers pass `mode:"text"`. The default is dead code. ILIKE is the search.
7. **Factory knowledge seed** (`factory-seed.ts`). Seeds one "Boil the Lake" row on first boot, with a dedicated writer whose only reason to exist is edit-log-free parity with a pre-move snapshot. The principle lives in ETHOS.md and system prompts; a fresh install with an empty fabric is honest.
8. **Dead read variants**: `get({view:"projection"})`, `list({exportable})` (lore cites a consumer in `server-factory.ts` — file renamed, usage gone), `list({scope})` + the `KnowledgeScope` type (core-api's own barrel records its re-export was deleted for zero consumers).

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `recomputeAttention` | UI:POST /api/knowledge/:id/recompute-attention (seam←AGENT:score_attention) + SCHED:builtin:knowledge-promotion | DELETE | Attention bureaucracy; kill the tool, both routes, and the routine with it. |
| 2 | `ensureFactoryKnowledgeSeed` | BOOTSTRAP (factory-state.ts first boot) | DELETE | Seeds one decorative row; the principle lives in ETHOS.md. Empty fabric on install is honest. |
| 3 | `resolveKnowledgeActionRequest` | TEST-ONLY (sole caller is POST /:id/flag — zero UI/seam callers since AD6) | DELETE | Dead door end to end; 177-line resolver for a session kind that never fires. |
| 4 | `recordConflict` | UI:POST /api/knowledge/:id/conflicts (seam←AGENT:create_conflict_review + writeback) | KEEP | Stops agent-proposed edits being silently lost on version conflict — real collaboration value. |
| 5 | `findOpenConflict` | UI:GET /api/knowledge/:id/conflicts (seam←AGENT:create_conflict_review dupe check) | KEEP | Same door as recordConflict; the dupe check that keeps one open conflict per agent per item. |
| 6 | `create` | UI:POST /api/knowledge + AGENT:write_memory + writeback + bets retro | SIMPLIFY | Core writer. Drop `attentionScore`/`confidence`/`meta` inputs — no live producer, engines dead. |
| 7 | `update` | UI:PATCH /api/knowledge/:id (autosave) + writeback optimistic-lock + bets retro | SIMPLIFY | Core writer with version gate. Same input shrink as create. |
| 8 | `get` (view:"full") | UI:POST /api/bets retro (bets.ts:954) | KEEP | The one joined single-item read; detail folds into it (row 9). |
| 9 | `get` (view:"detail") | UI:GET /api/knowledge/:id | MERGE | Into `full` — after score columns die, detail ≡ full minus nothing. Two joined views is one view. |
| 10 | `get` (view:"projection") | DEAD (zero production callers; rg-confirmed) | DELETE | Nobody asks for layer+kind alone. |
| 11 | `get` (view:"summary") | UI:GET /api/knowledge/:id + seam version/status lookups + bets/threads/flag routes | KEEP | The raw-row read; most callers. |
| 12 | `get` (impl) | — | SIMPLIFY | Two views survive (item, full); switch shrinks 4→2. |
| 13 | `list` ({visibleWithSignals}) | UI:GET /api/knowledge/ (KnowledgeList + AppShell) | SIMPLIFY | Core list, but signals (accessCount30d/lastActivityAt/relevance/attention) die with telemetry — becomes a plain visible-items list. |
| 14 | `list` ({retroForBet}) | UI:POST bets retro (bets.ts:940) | KEEP | Bet-retro reflection upsert lookup — bets pillar feeding the knowledge pillar. |
| 15 | `list` ({titlesByIds}) | UI:threads route (threads.ts:472) | KEEP | Batched title resolve for knowledge references in threads. |
| 16 | `list` ({recentByLayers}) | SCHED:builtin:portfolio-retro | KEEP | Monthly portfolio retro's recent-knowledge digest; routine survives this audit. |
| 17 | `list` ({exportable}) | DEAD (lore cites `server-factory.ts` — renamed, zero usage) | DELETE | Export-format machinery with no consumer; enterprise reflex. |
| 18 | `list` ({relatedByTopic}) | UI:GET /api/knowledge/:id (related items panel) | KEEP | Real detail-page feature. |
| 19 | `list` ({scope}) | DEAD (zero production callers) | DELETE | Leftover from deleted knowledge-reader; kill `KnowledgeScope` with it. |
| 20 | `list` (base ListFilters) | INTERNAL (assembleSessionKnowledge's fetchAllForLayer only) | SIMPLIFY | Drop `topic`/`kind` filters nobody passes; layer/scopeId/limit/offset is the whole need. |
| 21 | `list` (impl) | — | SIMPLIFY | 8 variants → 6; dispatch shrinks accordingly. |
| 22 | `count` ({triageVisible}) | UI:GET /api/knowledge/triage-count (AppShell badge) | KEEP | The draft-awaiting-curation badge — the human side of agent write_memory drafts. |
| 23 | `search` | UI:GET /api/knowledge/search (seam←AGENT:query_practice) + UI:GET /api/search | SIMPLIFY | Both production callers pass `mode:"text"`. Delete FTS mode + `fts.ts` — the dead default. Text-only, no mode param. |
| 24 | `countAccesses` | UI:GET /api/knowledge/:id (accessCount display) | DELETE | Access telemetry; dies with the log. Kill the route field + detail-page display. |
| 25 | `transition` ({target:"recomputeAttention"}) | UI:PATCH /:id/attention-score (seam←AGENT:score_attention override) | DELETE | Agents hand-setting attention scores is ceremony; engine dead, column dead, tool dead. |
| 26 | `transition` ({target:"promote"}) | UI:POST /:id/promote (seam←AGENT:promote_knowledge) | KEEP | The one deliberate lifecycle door; conflict gate rides it. |
| 27 | `transition` ({target:"flag"}) | TEST-ONLY (POST /:id/flag has zero callers) | DELETE | Dead door — AD6 removed Flag from the UI; no agent path exists. |
| 28 | `transition` ({target:"changeScope"}) | UI:PATCH /:id/scope (ScopeChangeDialog) | KEEP | Real UI feature; scope drives layer + session visibility. |
| 29 | `transition` ({target:"merge"}) | TEST-ONLY (POST /:id/merge has zero UI/seam callers) | DELETE | Bulk-curation op nobody reaches. |
| 30 | `transition` ({target:"split"}) | TEST-ONLY (POST /:id/split has zero UI/seam callers) | DELETE | Same as merge. |
| 31 | `transition` (impl) | — | SIMPLIFY | 6 targets → 2 (promote, changeScope). |
| 32 | `remove` | UI:POST /api/knowledge/:id/archive (KnowledgeDetail) | KEEP | The archive path; only delete flavor the product needs. |
| 33 | `recordAccess` | UI:GET /api/knowledge/:id (fires on every view incl. seam lookups) | DELETE | Telemetry write on the read path; dies with the log and the `knowledge_accessed` event. |
| 34 | `sweep` ("autoPromotion") | SCHED:builtin:knowledge-promotion (daily 03:00) | DELETE | 5-cross-scope auto-promotion + contradiction detection over meta nobody writes — provably-dead logic in a nightly cron. Kill the routine. |
| 35 | `sweep` ("stale") | SCHED:builtin:knowledge-decay (daily 02:00) | DELETE | 90-day auto-stale is retention ceremony; nothing meaningful consumes "stale". Kill the routine. |
| 36 | `sweep` (impl) | — | DELETE | Both kinds dead; whole `promotion-pipeline.ts` goes. |
| 37 | `rank` | INTERNAL (assembleSessionKnowledge only; barrel export has zero external callers) | MERGE | Fold into assembleSessionKnowledge as a private function; drop the dead `attentionScore` + near-constant `confidence` + writer-less `meta.tags` factors while folding. |
| 38 | `recomputeRelevance` (itemIds) | EVENT:knowledge_accessed (relevance-listener only) | DELETE | Feeds a score whose sole consumer is a sort pill; rank never reads it. |
| 39 | `recomputeRelevance` (signals) | TEST-ONLY (computeSignals overload — no production caller) | DELETE | Test-facing exposure of internals. |
| 40 | `recomputeRelevance` (impl) | — | DELETE | Whole relevance engine goes (service/engine/listener). |
| 41 | `reapAccessLog` | SCHED:retention reaper (service-bootstrap.ts:518) | DELETE | A retention policy for telemetry nobody needs — enterprise reflex squared. Dies with the log. |
| 42 | `assembleSessionKnowledge` | AGENT:every session bake (task_run/routine_run/reengagement/assistant resolvers via DI) + UI:threads route | KEEP | The core value of the fabric: agents launch with ranked shared knowledge. Named doors everywhere. |

### Class

| # | Member | Reach | Verdict | Reason |
|---|---|---|---|---|
| C1 | `KnowledgeActionSourceUnavailableError` | TEST-ONLY (flag chain) | DELETE | Dies with the resolver. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `KnowledgeActionResolverDeps` | DELETE | Port for a dead resolver. |
| `BakedKnowledgeActionRequest` | DELETE | Return shape of a dead resolver. |
| `RecordConflictInput` | KEEP | Input of a kept writer. |
| `CreateKnowledgeItemInput` | SIMPLIFY | Drop `attentionScore`/`confidence`/`meta` — no live producer. |
| `UpdateKnowledgeItemInput` | SIMPLIFY | Same shrink. |
| `ListFilters` | SIMPLIFY | Drop `topic`/`kind` — nobody passes them. |
| `KnowledgeItemView` | SIMPLIFY | 4 views → 2 ("summary" \| "full"). |
| `KnowledgeItemWithProjection` | SIMPLIFY | Drop `attentionScore`/`confidence`/`meta` fields with their columns. |
| `PromoteTransitionResult` | KEEP | Result of the kept promote target. |
| `RecordAccessInput` | DELETE | Dies with recordAccess. |
| `SessionKnowledgeInput` | KEEP | Input of the kept assembler. |
| `KnowledgeLayer` | KEEP | The L0–L4 taxonomy — load-bearing across tools, UI, ranking. |
| `KnowledgeStatus` | SIMPLIFY | 7 statuses + kernel draft/needs_human = a 9-state lifecycle built for the dead sweeps. Honest shape: draft / active / archived (+needs_human if triage keeps it). Collapse once sweeps land. |
| `KnowledgeKind` | KEEP | 8 kinds used by write_memory, UI chips, retro reflections. |
| `KnowledgeScope` | DELETE | Only consumer was dead `list({scope})`; core-api's own barrel already deleted its re-export for zero consumers. |

Not in the input but dies with the above: `rankAndBudget` module export (test-only), `SearchOptions`/`ExportableKnowledgeItemFilters` type exports, `attention-scoring.ts`'s five exports, `attachRelevanceListener`, all of `fts.ts`, `token-budget.ts` survives only as a private helper of the folded rank.

## Holes this leaves

1. **Fresh installs start with an empty knowledge fabric** — no seeded principle row. The principle already ships in ETHOS.md and agent system prompts.
2. **Knowledge list loses its signals column and sort pills** (frequency/relevance/attention); list and triage sort by updatedAt. KnowledgeDetail loses the accessCount stat.
3. **No automatic curation**: no auto-promotion, no auto-stale, no attention-triggered review items. Lifecycle moves only when a human or agent moves it via `promote_knowledge` / the UI. If auto-curation is ever wanted, it gets earned from a real learning — not rebuilt first.
4. **The knowledge_action session kind loses its only producer** (already unreachable) — session-requests can retire that intent kind in its own audit.
5. **Schema debt to collect**: drop `knowledgeAccessLog`; drop `knowledgeAppProjection.attentionScore`/`relevanceScore` (and `confidence`/`meta` once inputs shrink); retire `knowledge_accessed` and the `attention_recomputed`/`auto_promoted`/`contradiction_flagged`/`marked_stale`/`flagged` actions of `knowledge_updated`; delete `builtin:knowledge-decay`/`builtin:knowledge-promotion` routine seeds; delete the `score_attention` tool and the two attention seam methods.
