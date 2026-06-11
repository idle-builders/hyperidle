# AF9 — Architecture plan

**Workpackage:** Make the knowledge fabric learn — relevance, promotion, search.
**Type:** Backend fabric wiring. No UI surface (`/design` skipped — all four ACs are backend signals/sweeps/search).
**Concept:** `plans/AF9/concept.md` — `concept-fine`, no primitive introduced/reshaped.

This is an **activation** workpackage. The four mechanisms (relevance recompute, auto-promotion sweep, FTS setup, attention population) all already exist and pass their own unit/integration tests. AF9 connects them to the live event bus, the boot path, and the migration path. The whole job is four small seams plus their tests. **Resist scope creep** — do not rewrite the engines.

---

## Phase 0 — Interrogation (resolved)

| Probe | Read | Resolution |
|---|---|---|
| Where does the access→relevance subscriber live, and does it see the just-written access-log row? | `bootstrapFabric` is the strategy-wiring hub; the route emits `knowledge_accessed` AFTER the `knowledge_access_log` INSERT (knowledge.ts L339–359); `EventBus.emit` is synchronous (event-bus.ts L28). | Register the subscriber in `bootstrapFabric`. It calls `createRelevanceService(db).recomputeScores([itemId])`. The post-INSERT emit + synchronous bus means `recomputeScores` reads the fresh row. **Decided.** |
| Promotion-sweep trigger: event or schedule? | Constraint says "if scheduled, MUST use AF6 scheduler." `runStaleSweep` is already a scheduled builtin (`builtin:knowledge-decay`, daily cron) via `builtin-routines.ts`. | Schedule it as a new builtin routine `builtin:knowledge-promotion`, mirroring `knowledge-decay` exactly. Rides the existing AF6 scheduler/poll loop. No second mechanism. **Decided** (see Design-it-twice §A). |
| FTS setup: migration or boot? | Production `createServer` does NOT run the drizzle migrator (server-factory.ts — relies on `npm run setup`/`applyMigrations`). Test pool DOES run the migrator (test-pool.ts L55). `setupFts` is fully idempotent (`IF NOT EXISTS` ×2). | **Both.** A raw-SQL migration file (covers tests + CLI/desktop deterministically) AND a `setupFts(db)` call at boot in `bootstrapFabric` (covers the production server that skips the migrator, and self-heals pre-existing DBs). Both idempotent. **Decided** (see Design-it-twice §B). |
| Why is relevance null/constant for normal items? | `recomputeScores` is never called outside tests → `relevanceScore` column stays at its create-time value (null). `create()` in knowledge-repository.ts never sets `relevanceScore`. | Wiring the access subscriber fixes the live path. No engine change. The "permanently null" failure is purely the missing caller. **Decided.** |
| Why is attention null/constant? | `attentionScore` only set by the on-demand `score_attention` tool (`recomputeOne`) or manual override. Normal create never computes it. | The promotion-sweep builtin is the natural place to also refresh attention via `buildAttentionService.recomputeScope`, OR a dedicated step. See Risk R3 — scope carefully. **Decided: piggyback attention recompute on the promotion sweep over the provisional+active pool** (bounded), satisfying AC4 without a third scheduler. |
| Does `query_practice` work once FTS is set up? | Tool → `searchKnowledge` → `ftsSearch` → `fts_vector @@ to_tsquery`. The only failure is the missing column. | Once `setupFts` runs at boot, the column exists and the tool returns results. No tool change. **Decided.** |

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "`knowledge_accessed` has zero subscribers" | Confirmed — only emitters (knowledge.ts) and observability logging. No relevance subscriber. | Task 1 adds the subscriber. |
| "`runAutoPromotionSweep` has no caller" | Confirmed — only tests call it; `builtin-routines.ts` wires `runStaleSweep` but NOT `runAutoPromotionSweep`. | Task 2 adds a `builtin:knowledge-promotion` routine. |
| "`setupFts` never runs" | Confirmed — only test files call it manually; no migration creates `fts_vector`; boot never calls it. | Tasks 3a (migration) + 3b (boot call). |
| "relevance permanently null for normal items" | Confirmed — `create()` doesn't set `relevanceScore`; `recomputeScores` never called in prod. | Fixed by Task 1 (access subscriber populates it). |
| "attention-sorted triage orders by a constant" | `attentionScore` only set by on-demand tool/override; null for normal items. | Task 4 — bounded attention recompute on the promotion sweep. |
| Relevance config lives in `factory_settings` under `relevance.*` | Confirmed — `loadRelevanceConfig` (scoring-config.ts L220) reads them; `recomputeScores` already uses it. | No change; reuse as-is. |
| `createRelevanceService` exists and is exported | Confirmed — fabric/index.ts L256. | Import in bootstrap. |
| AF6 scheduler + builtin-routine pattern exists | Confirmed — `seedBuiltinRoutines`, `runBuiltinRoutine`, `BUILTIN_ROUTINE_IDS`, cron helpers. | Extend, don't reinvent. |

**No spec/doc contradiction.** No new `/concept` gap.

---

## Phase 3 — Design-it-twice (the two non-trivial decisions)

### §A — Promotion-sweep trigger mechanism

**Alt A1 — New builtin routine `builtin:knowledge-promotion` (calendar/cron).**
Add a 5th entry to `BUILTIN_SPECS` with a daily cron, a `runKnowledgePromotion` handler that calls `runAutoPromotionSweep(db, eventBus)`, and a `skillId: "knowledge_promotion"`. Mirrors `builtin:knowledge-decay` byte-for-byte.
- Trade-off: one more seeded routine row + a seed-migration to backfill existing DBs.
- Reject reason: none material — this is exactly the established pattern.

**Alt A2 — Subscribe the sweep to `knowledge_updated` (event-driven, fire on each promotion candidate).**
Run a targeted `checkAutoPromotion(itemId)` whenever a provisional item's repetition count could have changed (i.e. on `knowledge_created`/`knowledge_updated`).
- Trade-off: more responsive (promotes the instant the 5th repetition lands) but fires far more often, re-querying cross-scope counts on every knowledge write; risks amplification and ordering subtleties; needs careful dedupe.
- Reject reason: the sweep is explicitly designed for batch/scheduled draining (`DEFAULT_SWEEP_MAX_BATCH_SIZE`, "backlog drains across runs" lore). Auto-promotion is not latency-sensitive (validated status is a slow editorial signal). The constraint also says "if scheduled, use the AF6 scheduler" — signaling schedule is the intended mode.

**Synthesis → A1.** Scheduled builtin routine. Daily cron (off-peak, distinct minute from knowledge-decay to avoid both heavy sweeps colliding). `silent` left false so promotions DO emit `knowledge_updated` (the sweep already emits per-promotion events; downstream git-export/triage want them — unlike decay which is seeded silent to avoid daily flood).

### §B — FTS setup placement

**Alt B1 — Boot-only `setupFts(db)` in `bootstrapFabric`.**
- Trade-off: simplest; one call site. But integration tests build their DB from the drizzle migrator (test-pool) and do NOT call `bootstrapFabric` for pure-fabric tests — those would still need manual `setupFts`. And a migrate-only deploy (CLI) wouldn't have the column until first boot.
- Reject reason: leaves the migrator-built DB without the column; existing tests still need the manual call; not "safe on every migration."

**Alt B2 — Migration-only (raw SQL file).**
- Trade-off: covers the migrator path (tests, CLI, desktop) cleanly and deterministically. But production `createServer` does NOT run the migrator at boot — a freshly-pulled prod binary that skipped `npm run setup` would throw on first `query_practice`.
- Reject reason: production boot gap (server-factory never migrates).

**Synthesis → both (B1 + B2).** A new migration file `00XX_AF9_fts_setup.sql` containing the exact DDL from `setupFts` (idempotent `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`), PLUS a one-shot `await setupFts(db)` at the top of `bootstrapFabric` (best-effort, logged on error, never blocks boot — same fire-and-forget shape as the boot reaper). Idempotency makes the double-application a no-op. This is the only placement that is genuinely "safe on every boot/migration."
- Keep the manual `setupFts` calls in existing fabric tests untouched (they remain correct and idempotent; removing them is out of scope and risks churn). New tests that go through the migrator won't need it.

---

## Acceptance criteria + verification methods

**AC1 — Accessing a knowledge item updates its relevance signal; relevance not permanently null for normally-created items.**
Verify: integration test (`af9-relevance-subscriber.integration.test.ts`, server pkg with `{db, app, eventBus}`). Create an item, assert its `knowledgeStrategyFabric.relevanceScore` is null/unset. `GET /api/knowledge/:id` once (or twice), then assert `relevanceScore` is now a non-null finite string. Assert a no-data item that was never accessed stays null (fake-zero guard preserved).

**AC2 — Validated knowledge is promoted automatically by a sweep that runs on a trigger/schedule.**
Verify: integration test (`af9-promotion-routine.integration.test.ts`). Seed 5 provisional items sharing a `(layer, topic, kind)` signature across 5 distinct `scopeId`s. Invoke the builtin via `runBuiltinRoutine(db, eventBus, "builtin:knowledge-promotion")` (the same entry the scheduler uses). Assert the subject item transitions provisional→validated and a `routine_runs` row + `knowledge_updated action=auto_promoted` event were produced. Plus: assert `builtin:knowledge-promotion` is in `BUILTIN_ROUTINE_IDS` and gets a `nextRunAt` from `seedBuiltinRoutines` (scheduler eligibility).

**AC3 — Practice/full-text search returns results instead of throwing; agent practice-query tool succeeds at runtime.**
Verify: integration test (`af9-fts-boot.integration.test.ts`) that builds the DB through the **migrator only** (no manual `setupFts`), inserts an L3 item, then calls `queryPracticeTool.handler({query})` and asserts `success === true` with the item returned — proving the migration created `fts_vector`. Second assertion: `setupFts` is idempotent — calling it again does not throw (covers the boot double-apply).

**AC4 — Attention-sorted triage orders items by a real, populated score rather than a constant.**
Verify: integration test (`af9-attention-population.integration.test.ts`). Create several items, run the promotion routine (which now also recomputes attention over the bounded pool), assert their `attentionScore` values are populated and not all-equal/all-null. Assert ordering by `attentionScore` reflects differing structural inputs (e.g. an item with an open conflict scores higher than a settled one).

---

## Ordered task list

**Task 1 — Access→relevance subscriber.** *(AC1)*
- File: `packages/fabric/src/services/relevance-listener.ts` (new). Export `registerRelevanceListener(db, eventBus): () => void`.
- It subscribes `eventBus.on("knowledge_accessed", handler)`. Handler wraps an async IIFE (the bus is sync; mirror `registerBuiltinRoutineHandlers`'s `void (async () => {...})()` shape) that calls `createRelevanceService(db).recomputeScores([event.itemId])`. Best-effort: log on error, never throw into the bus.
- Build the `RelevanceService` once at register time (closure), not per event.
- Wire in `packages/fabric/src/bootstrap.ts`: `disposers.push(registerRelevanceListener(db, eventBus));`.
- Export `registerRelevanceListener` from `packages/fabric/src/index.ts`.
- Test: `af9-relevance-subscriber.integration.test.ts`.
- `@lore AF9`: relevance recompute is driven by `knowledge_accessed`, which the route emits AFTER the access-log INSERT — the sync bus guarantees the fresh row is visible to `recomputeScores`.

**Task 2 — Promotion-sweep builtin routine.** *(AC2)*
- File: `packages/fabric/src/services/builtin-routines.ts` (edit).
  - Add `"builtin:knowledge-promotion"` to `BUILTIN_ROUTINE_IDS`.
  - Add a `BuiltinSpec`: `triggerType: "calendar"`, `triggerConfig: { cron: KNOWLEDGE_PROMOTION_CRON }`, `skillId: "knowledge_promotion"`, `doneCondition: "Provisional items meeting repetition threshold promoted"`, `humanReview: false`, `silent: false`, owner `seed-agent-pf-facilitation` (same owner as decay — practice-layer concern).
  - Add `KNOWLEDGE_PROMOTION_CRON = "0 3 * * *"` (daily 03:00 UTC — one hour after decay's 02:00 so the two heavy sweeps don't overlap).
  - Add `runKnowledgePromotion(db, eventBus, routine)` handler → `const sweep = await runAutoPromotionSweep(db, eventBus); ...` plus the Task 4 attention recompute. Import `runAutoPromotionSweep` from `../promotion-pipeline.js` (NOT the index — same circular-import lore as `runStaleSweep`).
  - Add the `case "builtin:knowledge-promotion":` arm to the `runBuiltinRoutine` switch.
- Seed: `seedBuiltinRoutines` is idempotent (`onConflictDoNothing`) and already backfills `nextRunAt` for calendar builtins, so it self-heals existing DBs on next call. Verify the production seed path (`packages/db/src/seed.ts`) re-invokes it (it does, per existing knowledge-decay).
- Test: `af9-promotion-routine.integration.test.ts`.

**Task 3a — FTS migration file.** *(AC3)*
- Generate via the drizzle workflow if it picks up the generated column; otherwise hand-write a raw-SQL migration `packages/db/drizzle/00XX_AF9_fts_setup.sql` with the two statements from `setupFts` verbatim (`ADD COLUMN IF NOT EXISTS fts_vector ... GENERATED ALWAYS AS (...) STORED` + `CREATE INDEX IF NOT EXISTS knowledge_items_fts_idx ...`), `--> statement-breakpoint` between them. Append the journal entry to `packages/db/drizzle/meta/_journal.json` with the next idx/tag.
- `@lore AF9`: this DDL is the SAME as `setupFts`. The two must stay in lockstep — `fts.ts` remains the single source of the column definition; the migration is a copy so the migrator-built path (tests, CLI, desktop) has the column without a runtime call.

**Task 3b — FTS boot call.** *(AC3)*
- File: `packages/fabric/src/bootstrap.ts` (edit). Near the top of `bootstrapFabric`, fire-and-forget `setupFts(db).catch((err) => bootstrapLog.error("FTS setup failed", { err }));` (mirror the boot reaper's `.catch`). Import `setupFts` from `./fts.js`.
- Rationale: production `createServer` never runs the migrator; this guarantees the column on every prod boot and self-heals existing prod DBs.

**Task 4 — Attention population on the promotion sweep.** *(AC4)*
- Inside `runKnowledgePromotion` (Task 2), after the promotion sweep, call `buildAttentionService({ db, eventBus }).recomputeScope({ ... })` over the provisional + active pool (use the existing filter shape; pass a filter to satisfy `FILTER_REQUIRED`, and rely on the service's `BATCH_TOO_LARGE` guard to bound the set). Handle the typed `{ ok: false }` result by logging, never throwing.
- This populates `attentionScore` for normally-created items on the daily cadence, making attention-sorted triage order by a real score.
- Test: `af9-attention-population.integration.test.ts`.
- Risk control (R3): if `recomputeScope`'s batch guard makes a single call awkward for the full pool, scope the recompute to the items the sweep just `scanned`/touched (the candidate list), which is already bounded by `maxBatchSize`. Prefer this narrower form.

**Task ordering:** 3a+3b first (unblocks any FTS-dependent test infra) → 1 → 2 → 4 (4 depends on 2's handler).

---

## Type signatures / contracts

```ts
// packages/fabric/src/services/relevance-listener.ts (new)
export function registerRelevanceListener(db: HyperIdleDb, eventBus: EventBus): () => void;

// packages/fabric/src/services/builtin-routines.ts (edits)
export const BUILTIN_ROUTINE_IDS = [
  "builtin:practice-meeting",
  "builtin:post-bet-retro",
  "builtin:portfolio-retro",
  "builtin:knowledge-decay",
  "builtin:knowledge-promotion", // NEW
] as const;
// new internal: async function runKnowledgePromotion(db, eventBus, routine): Promise<RunBuiltinResult>

// reused as-is (no signature change):
//   createRelevanceService(db).recomputeScores(itemIds: readonly string[]): Promise<void>
//   runAutoPromotionSweep(db, eventBus, maxBatchSize?): Promise<AutoPromotionSweepResult>
//   setupFts(db): Promise<void>
//   buildAttentionService({db, eventBus}).recomputeScope(filter): Promise<AttentionRecomputeScopeResult>
```

No new event types. No schema columns beyond the FTS migration (which only formalizes the existing `setupFts` DDL). No route changes.

---

## Risks / ambiguities

- **R1 — Relevance recompute cost per access.** `recomputeScores([itemId])` runs ~3 small queries per `GET /api/knowledge/:id`. At HyperIdle scale this is negligible and it's already bounded to one item. Do NOT batch-defer in AF9 (premature). If it ever shows up, a debounce belongs in a later WP. **Accepted.**
- **R2 — Two heavy sweeps colliding.** Decay at 02:00, promotion at 03:00 — deliberately offset. The scheduler poll loop fires each on its own `nextRunAt`. **Mitigated by cron offset.**
- **R3 — `recomputeScope` batch guard.** `recomputeScope` rejects oversize batches (`BATCH_TOO_LARGE`) and requires a filter (`FILTER_REQUIRED`). Scope the attention recompute to the sweep's bounded candidate set rather than the whole table. **Mitigated; narrower form preferred.**
- **R4 — `fts.ts` DDL vs migration drift.** The migration copies `setupFts`'s DDL. Lore comment in both files pins them in lockstep. **Mitigated by lore; low blast radius since both are idempotent.**
- **R5 — `knowledge-promotion` `silent` flag.** Set false so promotions emit events (git-export/triage consume them). Decay is silent only to avoid daily noise on a sweep that touches many rows; promotion touches few. **Decided false.**
- **R6 — Seed backfill on existing DBs.** `seedBuiltinRoutines` uses `onConflictDoNothing`; the new id is simply inserted on the next seed run with a `nextRunAt`. Confirm the production seed path runs `seedBuiltinRoutines` post-AF9 (it does today for the other builtins). **Low risk.**

---

## Security & abuse cases

- **Rate-limit on POST/PATCH:** N/A — AF9 adds no new mutating routes. The relevance recompute rides the existing `GET /api/knowledge/:id` (a read), whose access-log write is already best-effort and bounded.
- **Input-trust boundary for agent-authored fields:** Addressed/preserved — relevance frequency is sourced exclusively from `knowledge_access_log` written by the route handler, NOT agent self-report (the binding rule in `relevance-and-attention.md` §23). AF9's subscriber consumes the same server-written log; it adds no agent-writable relevance path. Auto-promotion editor is the reserved `system:auto-promotion` marker, not a spoofable agent id.
- **FTS query injection:** Addressed/preserved — `sanitizeFtsQuery` already whitelists tokens and bounds length/count (the I3 lore). AF9 changes nothing here; `query_practice` still goes through it.
- **Secret-handling / new credential surface:** N/A — no credentials touched.
- **Path-traversal:** N/A — no path inputs.
- **SSRF:** N/A — no outbound URLs.
- **Sweep DoS / amplification:** Addressed — both sweeps are batch-capped (`DEFAULT_SWEEP_MAX_BATCH_SIZE = 1000`); the scheduled cadence + cap means a backlog drains across runs rather than blowing the event loop.

---

## Protected tests

`protectedTests`:
- `packages/fabric/src/__tests__/promotion-pipeline.integration.test.ts` — sweep semantics must not change.
- `packages/fabric/src/__tests__/relevance-scoring.integration.test.ts` — the budget ranker (different concern) must stay untouched.
- `packages/fabric/src/__tests__/fts-search.sanitization.integration.test.ts` — FTS sanitization unchanged.
- `packages/server/src/skill-tools/__tests__/query-practice.integration.test.ts` — tool contract unchanged (it manually calls `setupFts`; keep it).
- `packages/fabric/src/__tests__/attention-scoring.test.ts` / `attention-scoring.l22.test.ts` — engine math unchanged.

(New AF9 tests are additive; these existing assertions must remain green and unedited.)

## Shared files

`sharedFiles`:
- `packages/fabric/src/bootstrap.ts` — strategy wiring hub (touched by AF6/AF7/AF8 too; AF9 appends two disposers/calls).
- `packages/fabric/src/index.ts` — add `registerRelevanceListener` export.
- `packages/fabric/src/services/builtin-routines.ts` — add the 5th builtin (AF6 owns this file's scheduler integration).
- `packages/db/drizzle/` + `packages/db/drizzle/meta/_journal.json` — new migration + journal entry (any concurrent schema WP collides here; coordinate migration idx).

## Required reading (for `/write-tests`, `/write-code`)

- `plans/AF9/concept.md`
- `docs/knowledge-architecture/relevance-and-attention.md`
- `packages/fabric/src/bootstrap.ts`
- `packages/fabric/src/services/relevance-service.ts` + `packages/fabric/src/relevance-engine.ts`
- `packages/fabric/src/services/builtin-routines.ts` (the decay/promotion pattern)
- `packages/fabric/src/promotion-pipeline.ts`
- `packages/fabric/src/fts.ts`
- `packages/fabric/src/services/attention-service.ts`
- `packages/server/src/routes/knowledge.ts` (emit point)
- `packages/server/src/skill-tools/query-practice.ts`
- `packages/db/src/migrate.ts` + `packages/db/src/test-pool.ts` (migration paths)
- `packages/db/drizzle/0029_dizzy_frog_thor.sql` (migration-file format reference)
