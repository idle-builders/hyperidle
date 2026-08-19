# knowledge — destroyer verdict (REVISED after founder rulings)

Revision of `verdicts/knowledge.md`. Vocabulary now includes `PLUGIN` (delete from core, re-provide
as a plugin) and `FINISH`. Same no-sampling standard: all 42 function rows + 1 class + 15 type rows.

## What changed after the rulings

The line Ruling 3 demands, drawn through this service:

- **The store** (core): create/update/get/list/search/archive, deliberate `promote` and
  `changeScope` acts, the draft→human-accept triage flow, conflict capture, and
  `assembleSessionKnowledge`. This is the machinery of a team and its agents building and using
  shared knowledge as they work.
- **The ritual** (leaves core): everything scheduled or automated *about* that knowledge —
  attention scoring, the auto-promotion pipeline, stale decay, bet retros, the portfolio retro.
  These preconfigure routines + agent judgment, which is exactly the plugin surface.
- **Plain dead** (neither): relevance engine, access-log telemetry, flag resolver, factory seed,
  FTS, dead read variants. Re-examined per instruction; nobody would want these in any form —
  they stay DELETE.

The prompt's explicit re-examinations, answered:

| Convicted feature | Re-examined verdict | Why |
|---|---|---|
| Attention scoring | **PLUGIN** | "Scoring systems that decide what is important" — named ritual. Legitimate as a curation plugin's routine + agent judgment. The heuristic-weights implementation does not travel; the ritual does. |
| Relevance scoring | **DELETE** | Not ritual — denormalized machinery feeding one sort pill. A plugin wanting frequency/relevance hangs off the kept `knowledge_accessed` event, not this code. |
| Session ranking (`rank`) | **stays (MERGE)** | Not ritual — machinery of assembling session context. Never was convicted. |
| Promotion pipeline (sweep) | **PLUGIN** | "Promotion pipelines" — named ritual verbatim. Contradiction detection inside it does NOT travel: provably dead (zero `meta.claims`/`meta.forbids` writers repo-wide), plain delete even in the plugin conception. |
| Stale decay (sweep) | **PLUGIN** | Scheduled lifecycle ceremony — same shape as promotion. |
| Access telemetry | **DELETE** | Telemetry, not ritual. But see Ruling 2 correction below: the event survives, the log dies. |
| Flag resolution | **DELETE** | Dead door end to end, and the honest re-provision is no machinery at all — a human asks an agent in conversation to fix an item. Nothing to preconfigure, so nothing to ship as a plugin. |

### Rows that moved

| # | Method | Old | New | Ruling |
|---|---|---|---|---|
| 1 | `recomputeAttention` | DELETE | **PLUGIN** | R3 — attention/importance scoring is curation ritual |
| 25 | `transition({recomputeAttention})` | DELETE | **PLUGIN** | R3 — agent score-override is the same ritual's door |
| 34 | `sweep("autoPromotion")` | DELETE | **PLUGIN** | R3 — promotion pipeline, named ritual |
| 35 | `sweep("stale")` | DELETE | **PLUGIN** | R3 — scheduled decay ceremony |
| 36 | `sweep` (impl) | DELETE | **PLUGIN** | R3 — dies from core with both kinds |
| 14 | `list({retroForBet})` | KEEP | **PLUGIN** | R3 — retros are named ritual; this variant exists only for the bet-retro reflection upsert (bets.ts:940) |
| 16 | `list({recentByLayers})` | KEEP | **PLUGIN** | R3 — portfolio retro is scheduled reflection; sole caller is `builtin:portfolio-retro` (routine-scheduler-bindings.ts:109) |

**7 verdict moves.** Plus two non-verdict corrections:

- **Ruling 2 correction — `knowledge_accessed` event is KEEP.** First wave killed it with the
  telemetry feature. Wrong: the event is emitted by the route itself
  (`layers/core-api/src/routes/knowledge.ts:497`), separately from the `recordAccess` log insert
  (`knowledge-repository.ts:1557`, which only writes `knowledgeAccessLog`). The fact — an item was
  viewed — keeps happening and keeps being announced; plugins (including a future relevance/frequency
  plugin) hang off it. The log table, `recordAccess`, `countAccesses`, `reapAccessLog` still die.
  The `knowledge_updated` payload *actions* `attention_recomputed`/`auto_promoted`/
  `contradiction_flagged`/`marked_stale`/`flagged` still retire — Ruling 2 does not protect payload
  values nothing sets once their features leave core; the event type `knowledge_updated` stays.
- **Row 8 `get(view:"full")` reach correction.** Its only caller is the bet-retro flow
  (bets.ts:954), which leaves core under Ruling 3. It survives anyway as the merge target of row 9:
  after the merge, the single joined view's door is `UI:GET /api/knowledge/:id`.

**Ruling 1 re-check:** none of the first-wave knowledge kills rested on a single-user premise —
nothing to un-kill. In the other direction it hardens four KEEPs: `recordConflict`/`findOpenConflict`
(multiple humans + agents editing the same item is the normal case on a shared backend),
`transition({changeScope})` (team/org scopes are the product, not decoration), `count({triageVisible})`
(a team's shared triage queue), and `assembleSessionKnowledge` (every agent of every team launches
with the *shared* fabric).

### What leaves core and becomes a plugin

One knowledge-curation-and-ritual plugin (or a small family). No work package exists yet — the
founder rulings note one needs writing. Per feature, what travels:

1. **Attention triage** — "surface knowledge that needs attention."
   - Core code deleted: `attention-service.ts` (463 lines), `attention-scoring.ts` (340),
     `attention-classifier.ts` (52), attention half of `scoring-config.ts`;
     `recomputeAttention`; `transition({target:"recomputeAttention"})`.
   - Routes deleted: `POST /api/knowledge/:id/recompute-attention`, `PATCH /api/knowledge/:id/attention-score`.
   - Agent tool travels: `score_attention` (`tool-definitions.ts:760-794`, `builtin-tool-catalog.ts:118`) —
     retired from the core catalog; the plugin preconfigures its curation agent instead.
   - Schema deleted: `knowledgeAppProjection.attentionScore` column.
   - Cross-service wiring deleted (flag to those audits): seam methods
     `recomputeAttentionScoreForItem` + `upsertKnowledgeAppProjectionAttentionScore`; routine port
     `recomputeAttentionForCandidates`; `review`'s `createReviewItemForKnowledge` +
     `attentionReviewReasoningMarker`; `work`'s `findItemByReasoningMarker`.
   - Plugin shape: a scheduled routine whose agent reads the fabric and opens reviews through
     existing review doors. No score column anywhere — the judgment lives in the agent.
2. **Auto-promotion** — nightly cross-scope promotion.
   - Core code deleted: `sweep("autoPromotion")` in `promotion-pipeline.ts`; the contradiction
     detector inside it is plain DELETE (dead logic, does not travel).
   - Routine travels: `builtin:knowledge-promotion` (`routine-scheduler.ts:160,476`,
     `routines-routes.ts:28`) — deleted from core seeds, re-provided as a plugin routine.
   - Plugin shape: routine + agent that reviews cross-scope duplicates and calls the kept
     `promote_knowledge` door. Promotion the *act* stays core (row 26).
3. **Stale decay** — 90-day lifecycle sweep.
   - Core code deleted: `sweep("stale")` in `promotion-pipeline.ts`.
   - Routine travels: `builtin:knowledge-decay` (`routine-scheduler.ts:149,473`, `routines-routes.ts:27`).
   - Status vocabulary shrinks with it: `stale` (and the other sweep-only statuses) leave
     `KnowledgeStatus`; the plugin marks items via archive or meta, not a core enum.
   - Plugin shape: routine + agent that re-verifies or archives old items through existing
     update/archive doors.
4. **Bet retro (knowledge side)** — reflection item upserted when a bet outcome is recorded.
   - Core code deleted: `list({retroForBet})` (`knowledge-repository.ts:705`); the reflection-upsert
     block inside the bet-outcome route (`bets.ts:~920-980` — create/update + meta snapshot logic;
     the bet-outcome write itself is bets machinery and stays — flag to the bets audit).
   - Plugin shape: trigger on the bet-outcome event (`bet_revised` is KEEP per Ruling 2 and is the
     natural hook once its emission is finished) + retro agent writing the reflection via
     `write_memory`.
5. **Portfolio retro** — monthly recent-knowledge digest.
   - Core code deleted: `list({recentByLayers})` (`knowledge-repository.ts:719`) and its binding
     (`routine-scheduler-bindings.ts:109`).
   - Routine travels: `builtin:portfolio-retro` (`routine-scheduler.ts:138,470`,
     `routines-routes.ts:26`) — the routine row belongs to the routine service's audit; flagged.
   - Plugin shape: monthly routine whose agent gathers recent knowledge through the kept
     `query_practice`/search doors.

## Should this service exist?

**KEEP AS the shared-knowledge store + session-context assembler — nothing else.** Unchanged from
the first wave, sharpened by the rulings: on a shared backend the fabric is the team's collective
memory and one of the product's three pillars. What is gone from core is now split honestly in two:
the ritual (attention, promotion pipeline, decay, retros) leaves as a plugin; the machinery that was
never ritual and never wanted (relevance, telemetry log, flag resolver, FTS, seed, dead variants)
just dies.

## If written today, from scratch

Against the corrected premise — a shared backend for a team and an organisation of teams, OIDC
identity, an event stream plugins hang off:

- `create`, `get` (summary / one joined view), `update`, `remove`, `list` (visible, titlesByIds,
  relatedByTopic, base), `search` (text only), `count` (triage badge)
- `transition` (two targets: `promote`, `changeScope`) — deliberate acts by a human or agent
- `recordConflict`, `findOpenConflict` — concurrent human+agent edits are the normal case
- `assembleSessionKnowledge` (with `rank` folded in as a private function)
- Every mutation and every view announces itself on the bus (`knowledge_created`,
  `knowledge_updated`, `knowledge_accessed`) — that event surface, not core tables, is where
  curation and retro rituals attach.

No scoring engines, no sweeps, no access log, no FTS, no flag resolver, no factory seed, no
retro-shaped read variants.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 14 |
| PLUGIN | 7 |
| MERGE | 2 |
| SIMPLIFY | 8 |
| KEEP | 11 |
| FINISH | 0 |

Surface: 42 function rows → 19 surviving core declarations (55% out of core; was 50%).
~4,620 lines → ~2,250 in core. Same 10 of 21 source files deleted outright; `promotion-pipeline.ts`
and the three attention files are now PLUGIN-fated rather than plain-DELETE-fated — either way they
leave `layers/core-api/knowledge`.

## Feature-level kills

1. **Attention engine — PLUGIN** (was DELETE). Everything listed in first wave leaves core: engine
   files, both routes, `score_attention` tool, seam methods, routine port, `attentionScore` column,
   `review`/`work` wiring. What breaks in core: nothing auto-surfaces "needs attention"; triage
   sorts by updatedAt. Re-provided as a curation plugin's routine + agent.
2. **Relevance engine — DELETE** (confirmed on re-examination). Not ritual; machinery for a sort
   pill that `rank` never reads. A future relevance plugin builds on the kept `knowledge_accessed`
   event, not on this code. What breaks: the "relevance" sort pill.
3. **Access telemetry — DELETE, minus the event** (Ruling 2 correction). `recordAccess`,
   `countAccesses`, `reapAccessLog`, the `knowledgeAccessLog` table and its reaper die — enterprise
   telemetry. The `knowledge_accessed` event type and its route emission
   (`routes/knowledge.ts:497`) are **KEEP**: the fact happens, plugins may listen. What breaks:
   accessCount display, frequency sort, lastActivityAt.
4. **Auto-promotion + stale sweeps — PLUGIN** (was DELETE). Both routines and both sweep kinds
   leave core, re-provided as plugin routines driving agents through the kept `promote_knowledge` /
   update doors. The contradiction detector inside the promotion sweep is plain DELETE — provably
   dead logic (zero `meta.claims`/`meta.forbids` writers), and the plugin uses agent judgment, not
   this code. Promotion as a deliberate act stays core.
5. **Bet-retro + portfolio-retro read variants — PLUGIN** (was KEEP). Retros are named ritual in
   Ruling 3. `list({retroForBet})` and `list({recentByLayers})` exist solely for them; both leave
   with the retro plugin. Cross-service: the bets route's reflection-upsert block and the
   `builtin:portfolio-retro` routine row are flagged to their owning audits.
6. **Flag → knowledge_action pipeline — DELETE** (confirmed). Dead door end to end since AD6; the
   honest re-provision is a conversation with an agent, which needs no plugin.
7. **FTS — DELETE** (unchanged). Both production callers pass `mode:"text"`; the default is dead.
8. **Factory knowledge seed — DELETE** (confirmed). Onboarding decoration, not ritual; the
   principle ships in ETHOS.md and system prompts. If starter practice-content is ever wanted, it
   is a plugin's job — but nobody wants this row.
9. **Dead read variants — DELETE** (unchanged): `get({view:"projection"})`, `list({exportable})`,
   `list({scope})` + `KnowledgeScope`.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `recomputeAttention` | UI:POST /api/knowledge/:id/recompute-attention (seam←AGENT:score_attention) + SCHED:builtin:knowledge-promotion | PLUGIN | R3: importance-scoring ritual; leaves core with tool, routes, column, routine port. Plugin = routine + agent judgment. |
| 2 | `ensureFactoryKnowledgeSeed` | BOOTSTRAP (factory-state.ts first boot) | DELETE | Not ritual — decorative onboarding row; principle lives in ETHOS.md. Empty fabric on install is honest. |
| 3 | `resolveKnowledgeActionRequest` | TEST-ONLY (sole caller POST /:id/flag — zero UI/seam callers since AD6) | DELETE | Dead door end to end; re-provision is a conversation with an agent, no plugin machinery needed. |
| 4 | `recordConflict` | UI:POST /api/knowledge/:id/conflicts (seam←AGENT:create_conflict_review + writeback) | KEEP | R1 hardens it: concurrent human+agent edits are the normal case on a shared backend; stops silent loss. |
| 5 | `findOpenConflict` | UI:GET /api/knowledge/:id/conflicts (seam←AGENT:create_conflict_review dupe check) | KEEP | Same door; one open conflict per agent per item. |
| 6 | `create` | UI:POST /api/knowledge + AGENT:write_memory + writeback + bets retro | SIMPLIFY | Core writer. Drop `attentionScore`/`confidence`/`meta` — the last core `meta` producer (bet-retro upsert) leaves under R3, making the shrink safe. |
| 7 | `update` | UI:PATCH /api/knowledge/:id (autosave) + writeback optimistic-lock + bets retro | SIMPLIFY | Core writer with version gate; same input shrink, same R3-enabled `meta` drop. |
| 8 | `get` (view:"full") | was UI:POST bets retro (bets.ts:954) — that caller leaves core (R3); post-merge door is UI:GET /api/knowledge/:id | KEEP | Survives as the single joined view (merge target of row 9); its retro caller departs with the retro plugin. |
| 9 | `get` (view:"detail") | UI:GET /api/knowledge/:id | MERGE | Into `full` — after score columns die, two joined views are one view. |
| 10 | `get` (view:"projection") | DEAD (zero production callers; rg-confirmed first wave) | DELETE | Nobody asks for layer+kind alone. |
| 11 | `get` (view:"summary") | UI:GET /api/knowledge/:id + seam version/status lookups + bets/threads routes | KEEP | The raw-row read; most callers. |
| 12 | `get` (impl) | — | SIMPLIFY | Two views survive (summary, full); switch shrinks 4→2. |
| 13 | `list` ({visibleWithSignals}) | UI:GET /api/knowledge/ (KnowledgeList + AppShell) | SIMPLIFY | Core list; signals die with telemetry/scores — becomes a plain visible-items list. |
| 14 | `list` ({retroForBet}) | UI:POST bets retro (bets.ts:940) — a ritual caller | PLUGIN | R3: bet-retro reflection is retro ritual; variant exists only for it. Plugin's retro agent writes via write_memory instead. |
| 15 | `list` ({titlesByIds}) | UI:threads route (threads.ts:472) | KEEP | Batched title resolve for knowledge references in threads. |
| 16 | `list` ({recentByLayers}) | SCHED:builtin:portfolio-retro (routine-scheduler-bindings.ts:109) | PLUGIN | R3: portfolio retro is scheduled reflection; sole caller is its routine. Plugin agent uses query_practice/search. |
| 17 | `list` ({exportable}) | DEAD (lore cites `server-factory.ts` — renamed, zero usage) | DELETE | Export machinery with no consumer; enterprise reflex. |
| 18 | `list` ({relatedByTopic}) | UI:GET /api/knowledge/:id (related items panel) | KEEP | Real detail-page feature. |
| 19 | `list` ({scope}) | DEAD (zero production callers) | DELETE | Leftover from deleted knowledge-reader; `KnowledgeScope` dies with it. |
| 20 | `list` (base ListFilters) | INTERNAL (assembleSessionKnowledge's fetchAllForLayer only) | SIMPLIFY | Drop `topic`/`kind` filters nobody passes. |
| 21 | `list` (impl) | — | SIMPLIFY | 8 variants → 4 (visible, titlesByIds, relatedByTopic, base) — two more leave than first wave, via R3. |
| 22 | `count` ({triageVisible}) | UI:GET /api/knowledge/triage-count (AppShell badge) | KEEP | Re-judged against R3: draft→human-accept is the machinery of building shared knowledge — a deliberate act, not scheduled ceremony. R1: it is the team's shared triage queue. |
| 23 | `search` | UI:GET /api/knowledge/search (seam←AGENT:query_practice) + UI:GET /api/search | SIMPLIFY | Both production callers pass `mode:"text"`; delete FTS mode + `fts.ts`. Text-only, no mode param. |
| 24 | `countAccesses` | UI:GET /api/knowledge/:id (accessCount display) | DELETE | Re-examined: telemetry, not ritual. Dies with the log; kill route field + display. |
| 25 | `transition` ({target:"recomputeAttention"}) | UI:PATCH /:id/attention-score (seam←AGENT:score_attention override) | PLUGIN | R3: score-override door of the attention ritual; travels with it. |
| 26 | `transition` ({target:"promote"}) | UI:POST /:id/promote (seam←AGENT:promote_knowledge) | KEEP | The deliberate act stays core; the automated pipeline (row 34) leaves. Conflict gate rides it. |
| 27 | `transition` ({target:"flag"}) | TEST-ONLY (POST /:id/flag has zero callers) | DELETE | Re-examined: dead door, and no plugin-worthy ritual behind it. |
| 28 | `transition` ({target:"changeScope"}) | UI:PATCH /:id/scope (ScopeChangeDialog) | KEEP | R1 hardens it: team/org scopes are the product on a shared backend. |
| 29 | `transition` ({target:"merge"}) | TEST-ONLY (zero UI/seam callers) | DELETE | Bulk-curation op nobody reaches. |
| 30 | `transition` ({target:"split"}) | TEST-ONLY (zero UI/seam callers) | DELETE | Same as merge. |
| 31 | `transition` (impl) | — | SIMPLIFY | 6 targets → 2 (promote, changeScope). |
| 32 | `remove` | UI:POST /api/knowledge/:id/archive (KnowledgeDetail) | KEEP | The archive path; only delete flavor the product needs. |
| 33 | `recordAccess` | UI:GET /api/knowledge/:id (log insert only — the event is emitted by the route, not here) | DELETE | R2-checked: the log write is telemetry and dies with the table; the `knowledge_accessed` EVENT stays (routes/knowledge.ts:497) as extension surface. |
| 34 | `sweep` ("autoPromotion") | SCHED:builtin:knowledge-promotion (daily 03:00) | PLUGIN | R3: promotion pipeline is named ritual. Routine leaves core with it. Contradiction detector inside is plain-dead and does not travel. |
| 35 | `sweep` ("stale") | SCHED:builtin:knowledge-decay (daily 02:00) | PLUGIN | R3: scheduled decay ceremony; routine leaves core with it. |
| 36 | `sweep` (impl) | — | PLUGIN | Both kinds leave core; whole `promotion-pipeline.ts` exits the package. |
| 37 | `rank` | INTERNAL (assembleSessionKnowledge only) | MERGE | Re-judged: session ranking is context-assembly machinery, not ritual. Fold in as private fn; drop dead `attentionScore`/near-constant `confidence`/writer-less `meta.tags` factors. |
| 38 | `recomputeRelevance` (itemIds) | EVENT:knowledge_accessed (relevance-listener only) | DELETE | Re-examined: not ritual — machinery for a sort pill `rank` never reads. Its input event stays for real plugins. |
| 39 | `recomputeRelevance` (signals) | TEST-ONLY (no production caller) | DELETE | Test-facing exposure of internals. |
| 40 | `recomputeRelevance` (impl) | — | DELETE | Whole relevance engine goes (service/engine/listener). |
| 41 | `reapAccessLog` | SCHED:retention reaper (service-bootstrap.ts:518) | DELETE | Re-examined: retention policy for telemetry — enterprise reflex, not ritual. |
| 42 | `assembleSessionKnowledge` | AGENT:every session bake (task_run/routine_run/reengagement/assistant resolvers via DI) + UI:threads route | KEEP | R1 hardens it: every agent of every team launches with the shared fabric. The core value. |

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
| `CreateKnowledgeItemInput` | SIMPLIFY | Drop `attentionScore`/`confidence`/`meta` — R3 removes the last core `meta` producer (bet-retro upsert), making the first wave's shrink actually true. |
| `UpdateKnowledgeItemInput` | SIMPLIFY | Same shrink, same R3 enablement. |
| `ListFilters` | SIMPLIFY | Drop `topic`/`kind` — nobody passes them. |
| `KnowledgeItemView` | SIMPLIFY | 4 views → 2 ("summary" \| "full"). |
| `KnowledgeItemWithProjection` | SIMPLIFY | Drop `attentionScore`/`confidence`/`meta` fields with their columns. |
| `PromoteTransitionResult` | KEEP | Result of the kept promote target. |
| `RecordAccessInput` | DELETE | Dies with recordAccess. |
| `SessionKnowledgeInput` | KEEP | Input of the kept assembler. |
| `KnowledgeLayer` | KEEP | The L0–L4 taxonomy — load-bearing across tools, UI, ranking. |
| `KnowledgeStatus` | SIMPLIFY | Collapse to draft / active / archived (+needs_human for triage). `stale` and the sweep-only states leave core with the ritual (R3); the plugin marks items via archive/meta, not a core enum. |
| `KnowledgeKind` | KEEP | 8 kinds used by write_memory, UI chips, retro reflections (plugin will keep writing kinds through write_memory). |
| `KnowledgeScope` | DELETE | Only consumer was dead `list({scope})`; core-api's barrel already dropped its re-export. |

Not in the input but resolved by the above: `rankAndBudget` module export (test-only, dies),
`SearchOptions`/`ExportableKnowledgeItemFilters` (die), `attention-scoring.ts`'s five exports
(leave with the attention ritual), `attachRelevanceListener` (dies), all of `fts.ts` (dies),
`token-budget.ts` (survives as a private helper of the folded rank).

## Holes this leaves

1. **Until the curation/retro plugin exists, the rituals are simply gone**: no bet-retro reflection
   item on outcome recording, no monthly portfolio digest, no attention triage, no auto-promotion,
   no stale decay. Lifecycle moves only when a human or agent moves it deliberately. The founder
   rulings note no work package exists for the plugin — one needs writing; its scope is the five
   features in "What leaves core and becomes a plugin".
2. **Fresh installs start with an empty fabric** — no seeded principle row (ETHOS.md and system
   prompts carry it).
3. **Knowledge list loses signals and sort pills** (frequency/relevance/attention); list and triage
   sort by updatedAt; detail loses accessCount.
4. **The knowledge_action session kind loses its only producer** (already unreachable) —
   session-requests can retire that intent kind in its own audit.
5. **Schema/wiring debt to collect**: drop `knowledgeAccessLog`; drop
   `knowledgeAppProjection.attentionScore`/`relevanceScore` (and `confidence`/`meta` once inputs
   shrink); **keep the `knowledge_accessed` event type and its route emission** (Ruling 2 — reverses
   first wave); retire the sweep-only `knowledge_updated` actions; delete
   `builtin:knowledge-decay`/`builtin:knowledge-promotion` seeds and retire `score_attention` from
   the core tool catalog (both re-provided by the plugin); delete the two attention seam methods.
6. **Cross-service flags** (other audits must pick these up): bets route's reflection-upsert block
   (`bets.ts:~920-980` — bet-outcome write stays, knowledge upsert leaves); `builtin:portfolio-retro`
   routine row (routine service); `score_attention` tool rows (tool-handlers / tool-protocol);
   `review`'s `createReviewItemForKnowledge` + `work`'s `findItemByReasoningMarker`.
