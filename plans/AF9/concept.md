# AF9 — Concept notes

**Finding: `concept-fine`.** AF9 introduces no new primitive and reshapes no load-bearing noun. It activates existing, fully-specced, already-implemented-but-inert machinery. All four nouns it touches are **stable concepts** with locked ground-truth docs. No `/concept` probing required; no concept doc to update.

## Phase 0 — Nouns and classification

| Noun | Classification | Where it's already locked |
|---|---|---|
| **`relevanceScore`** (3-signal: recency × frequency × citation) | Stable | `docs/knowledge-architecture/relevance-and-attention.md` §"`relevanceScore`"; impl `packages/fabric/src/relevance-engine.ts` + `services/relevance-service.ts` |
| **`attentionScore`** (facilitator-queue signal) | Stable | same doc §"`attentionScore`"; impl `packages/fabric/src/attention-scoring.ts` + `services/attention-service.ts` |
| **Auto-promotion sweep** (provisional → validated on 5+ cross-scope repetition) | Stable | `runAutoPromotionSweep` in `packages/fabric/src/promotion-pipeline.ts`; rule from KNOWLEDGE_ARCHITECTURE §6.5 / TRACK-G §G3 |
| **Practice / FTS search** (`query_practice` → `ftsSearch` → Postgres tsvector) | Stable | `packages/fabric/src/fts.ts`; tool `packages/server/src/skill-tools/query-practice.ts` |
| **`knowledge_accessed`** (event) | Stable | `packages/shared/src/events.ts`; emitted by `GET /api/knowledge/:id` |

Every noun already has a contract, a type, and an implementation. AF9 is a **wiring** workpackage: it connects emitters to subscribers, sweep functions to triggers, and FTS setup to a run-point. The audit (`Z8-009/037/038/071/153`) confirms the code exists and is correct in isolation — only the activation seams are missing.

## Phase 1 — Spec ↔ doc alignment (no contradiction)

The spec's four ACs map 1:1 to the locked contracts:

1. **"Accessing updates relevance; not permanently null"** = the doc's server-tracked recency × frequency composite, recomputed on `knowledge_access_log` append. `computeRelevanceScore` already returns a real value once `accessCount30d`/`ageDays` are non-null. AC matches doc verbatim.
2. **"Validated knowledge promoted automatically by a sweep"** = `runAutoPromotionSweep` (5+ distinct-scope repetition → `validated`), exactly the "Repetition auto-validates without human" row in the attention table and KNOWLEDGE_ARCHITECTURE §6.5. No semantic change.
3. **"Practice/FTS search returns results instead of throwing"** = `ftsSearch` over the `fts_vector` generated column. The throw is purely operational (column never created because `setupFts` never runs), not a concept gap.
4. **"Attention-sorted triage orders by a real, populated score"** = the `attentionScore` column the doc already defines; AF9 ensures it is populated for normally-created items rather than null/constant.

No spec line redefines what relevance, attention, promotion, or search *are*. The "fake-zero guard" rule (null renders `—`, never a fake constant) is honored by `computeRelevanceScore`'s all-null → `null` return and must stay honored.

## Phase 3 — Vocabulary (already canonical; restated to prevent drift)

| Term | Definition | Aliases not to use |
|---|---|---|
| **`relevanceScore`** | User-facing rank signal; recency × frequency × citation, server-tracked. Owned by data layer. | "relevance", "importance", "score" (bare) |
| **`attentionScore`** | Facilitator-facing "needs human" signal; structural/qualitative. Owned by facilitators. | "priority", "urgency" |
| **Auto-promotion** | Provisional → validated transition on 5+ cross-scope repetition. Editor `system:auto-promotion`. | "auto-validate" (the doc uses "auto-validate" descriptively but the function/editor is "auto-promotion") |
| **Practice search** | FTS over knowledge `fts_vector`; the `query_practice` agent tool. | "knowledge search" (that is the LIKE-based `GET /api/knowledge` filter, a different path) |

Note one genuine collision to keep straight in architecture: `relevanceScore` (3-signal, L22, `relevance-service.ts`/`relevance-engine.ts`) vs `scoreItem`/`rankAndBudget` in `relevance-scoring.ts` (the materialization ranking — tag/role/recency/confidence/layer/attention weighted sum that feeds session packs). These are **two different relevance computations**. AF9 only activates the **L22 `relevanceScore` column** path (`relevance-service.recomputeScores`). It must NOT touch `relevance-scoring.ts` (the budget ranker), which is already live in materialization.

## Contracts AF9 must not break (carried into architecture)

- **Fake-zero guard.** A no-data item's `relevanceScore` stays `null` (renders `—`). Never write `0` or a constant.
- **Server-only access source.** Relevance frequency is sourced from `knowledge_access_log` written by the route handler — never agent self-report. AF9's subscriber consumes the same log; it must not add an agent-writable path.
- **Materialization does not count as access.** Only `GET /api/knowledge/:id` detail fetches append to the access log. AF9 keeps this.
- **Auto-promotion signature.** `(layer, topic, kind)` with `scope_id` excluded; threshold 5 distinct scopes. Unchanged.
- **Idempotent, deterministic FTS setup.** `setupFts` is `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`. Safe on every boot/migration. Keep it idempotent.
- **Single scheduler.** If promotion is scheduled, it rides the AF6 scheduler / builtin-routine mechanism. No second scheduling mechanism.

## Required reading (for `/architecture` and `/pipeline`)

- `docs/knowledge-architecture/relevance-and-attention.md` — relevance/attention contracts (the L22 spec).
- `docs/knowledge-architecture/canonical-shapes.md` — knowledge item / fabric shapes.
- `packages/fabric/src/relevance-engine.ts`, `packages/fabric/src/services/relevance-service.ts` — the relevance computation + denormalization (the `recomputeScores` to wire).
- `packages/fabric/src/promotion-pipeline.ts` — `runAutoPromotionSweep` / `runStaleSweep` (the sweep to trigger).
- `packages/fabric/src/fts.ts` — `setupFts` / `ftsSearch` (the FTS to activate).
- `packages/fabric/src/services/builtin-routines.ts` — the builtin-routine pattern (`runStaleSweep` is already wired here via `builtin:knowledge-decay`; promotion follows the same shape).
- `packages/fabric/src/services/attention-service.ts` — `buildAttentionService.recomputeOne/recomputeScope` (populates `attentionScore`).
- `packages/fabric/src/bootstrap.ts` — the strategy-layer wiring hub (`bootstrapFabric`), where the new subscriber + FTS boot call land.
- `packages/server/src/routes/knowledge.ts` — emits `knowledge_accessed`, writes `knowledge_access_log`.
- `packages/server/src/server-factory.ts` — production boot; does NOT run the drizzle migrator (relevant to FTS placement).
- `packages/db/src/test-pool.ts` / `packages/db/src/migrate.ts` — migration application paths (test pool runs the migrator; production does not).
