# AF9 — Code Review (Phase 4)

**Workpackage:** Make the knowledge fabric learn — relevance, promotion, search.
**Branch:** `feat/AF9-fabric-learn`
**Reviewer:** single-persona reviewer (carries AF9 Phase-2 critique context: plan scored 8/10).

## Verdict (round 1): NOT DONE — superseded by round 2 below.

One HIGH finding breaks AC2 in production: the promotion routine is wired into the **server-side test seed path** (`seedBuiltinRoutines` in fabric) but **not** into the **production seed path** (`db/seed.ts` → `BUILTIN_ROUTINE_SEEDS`). On a real install the `builtin:knowledge-promotion` row is never seeded, never gets a `nextRunAt`, and the AF6 scheduler never fires it. The AF9 tests pass only because they call the wrong (fabric) seed path. The production drift-guard test still asserts exactly 4 builtin routines — and passes — which is the tell.

Gates are green (check, lint, all 21 AF9 tests, 141 protected tests). AC1, AC3, AC4 are genuinely met. AC2's engine + scheduler wiring is correct; only the production seed registration is missing. This is a small, localized fix, but it is load-bearing for the AC2 outcome, so the WP is not done.

---

## AC Table

| AC | Status | Evidence |
|---|---|---|
| **AC1** — access updates relevance; not permanently null | **MET** | `registerRelevanceListener` (`relevance-listener.ts`) subscribes `knowledge_accessed`, wired in `bootstrap.ts:100` as a disposer. Handler is async fire-and-forget with try/catch → never throws into the bus; route emits AFTER the access-log INSERT (`knowledge.ts:339→359`), sync bus guarantees fresh row. Test `af9-relevance-subscriber.integration.test.ts` uses `vi.waitFor` (critique WARNING-1 honored), asserts non-null finite score, plus the never-accessed item stays null (fake-zero guard preserved). Disposer count test bumped 11→12 correctly. 4 tests pass. |
| **AC2** — validated knowledge promoted automatically by a scheduled sweep | **NOT MET** | Engine wiring is correct: `builtin:knowledge-promotion` added to `BUILTIN_ROUTINE_IDS`, `BUILTIN_SPECS`, the `runBuiltinRoutine` switch; `runKnowledgePromotion` calls `runAutoPromotionSweep` (no double-emit), rides the AF6 scheduler (no second mechanism), `routine_runs success` recorded, disabled→no row. **But the production seed path (`db/seed.ts` → `BUILTIN_ROUTINE_SEEDS` in `seed-fixtures.ts`) was never updated** — it still has 4 routines. `runSetup` (`setup-cli.ts:149`) calls `seed()` which uses that replica, not the fabric `seedBuiltinRoutines` the tests exercise. So no promotion row, no `nextRunAt`, scheduler never fires it in prod. See HIGH-1. |
| **AC3** — practice/FTS search returns results, deterministic + idempotent | **MET** | Migration `0030_AF9_fts_setup.sql` DDL is verbatim-identical to `setupFts()` (`fts.ts`); journal entry idx 30 added correctly; both sides `IF NOT EXISTS` → idempotent. Boot call in `bootstrap.ts:88` is fire-and-forget with `.catch` (never blocks boot) — self-heals prod DBs that skip the migrator. `af9-fts-tool.integration.test.ts` proves `queryPracticeTool` succeeds via the migrator path with NO manual `setupFts`, with real match discrimination; `af9-fts-boot.integration.test.ts` proves migrator path + idempotency (double/triple `setupFts` no-throw). 6 tests pass. |
| **AC4** — attention-sorted triage orders by a real, populated score | **MET** | `runKnowledgePromotion` piggybacks `buildAttentionService().recomputeScope({ ids })` over the sweep's bounded candidate set (`promotedIds + flaggedForReviewIds + skippedIds`, capped at `DEFAULT_SWEEP_MAX_BATCH_SIZE=1000 < MAX_RECOMPUTE_BATCH=5000`). Narrow `{ids}` form is primary, not fallback (critique WARNING-2 honored). Typed `{ok:false}` result logged, never thrown. Tests assert real ordering (conflicted item scores strictly higher than clean), variance (`uniqueScores.size > 1`), populated-not-null. 4 tests pass. |

**Caveat on AC4 (not a blocker):** attention is populated only on the daily promotion cadence over items the sweep touches. A freshly-created item that is never a promotion candidate keeps a null `attentionScore` until a sweep happens to scan it. This matches the plan's accepted "eventually populated on cadence" reading and the critique's noted soft spot. Acceptable for AF9; noted so it isn't mistaken for "populated on create."

---

## Findings

### HIGH

**HIGH-1 — Promotion routine not seeded in the production path; AC2 fails on a real install.**
Two distinct seed mechanisms exist:
- `packages/fabric/src/services/builtin-routines.ts` → `seedBuiltinRoutines()` — updated by AF9, called only by **tests** and `packages/eval` scenarios.
- `packages/db/src/seed.ts` → `seed()` iterating `BUILTIN_ROUTINE_SEEDS` (`packages/db/src/seed-fixtures.ts:45`) — the **production** path, invoked by `runSetup` at `packages/db/src/setup-cli.ts:149`.

The diff updated only the first. `BUILTIN_ROUTINE_SEEDS` still contains exactly 4 routines (no `builtin:knowledge-promotion`). Consequence on a real `npm run setup`: the promotion routine row is never inserted → it gets no `nextRunAt` → the AF6 scheduler never fires it → validated knowledge is never auto-promoted. AC2 ("a sweep that actually runs on a trigger or schedule") is unmet in production. The plan's R6 assumption ("the production seed path runs `seedBuiltinRoutines`") was wrong — production uses the `db`-package replica, by design (`@hyperidle/db` must not depend on `@hyperidle/server`; see the sync-required comment at `seed.ts:395-403`).

**Tell that this slipped:** the production drift-guard test `packages/db/src/__tests__/seed.integration.test.ts:185` still asserts `seeds exactly 4 G4 builtin routines` and `expect(rows).toHaveLength(4)` — and it passes, confirming production only seeds 4. The builder updated the *server* count test (4→5) and the *fabric* O3 disposer test but missed this *db* drift guard.

**Fix required:**
1. Add the `builtin:knowledge-promotion` entry to `BUILTIN_ROUTINE_SEEDS` in `packages/db/src/seed-fixtures.ts` (mirror the fabric `BUILTIN_SPECS` entry: calendar, cron `0 3 * * *`, owner `seed-agent-pf-facilitation`, skill `knowledge_promotion`, `humanReview:false`, `silent:false`).
2. Update the drift-guard test `packages/db/src/__tests__/seed.integration.test.ts` (the `toHaveLength(4)` → 5, add the id to the expected list, and add its `trigger_config`/owner/silent pins to the full-drift assertion at ~line 240) so the production seed is verified, not just the server replica.
3. Re-run `npm run test:integration` to confirm the production seed test now proves the row exists with the right trigger.

### LOW

**LOW-1 — Stale "4 builtin IDs" JSDoc after adding the 5th routine.**
`packages/fabric/src/services/builtin-routines.ts:48` — the AD8c JSDoc still reads "There are now 4 builtin IDs." Now 5. Correctness/slop. Update to 5. (Confirmed the builder's self-flagged nit.)

**LOW-2 — Contradictory stale comment left above the corrected test comment.**
`packages/server/src/__tests__/builtin-routines.integration.test.ts:164` still reads `// @lore AD8c: cost-sentinel extracted to app code — now 4 builtin routine IDs`, immediately followed by line 165 `// @lore AF9: ... now 5`. The two lines contradict. Delete or fix the stale line 164 rather than stacking a correction on top. (This is the `~164` nit the builder flagged; it's in the server test, not the fabric test — the builder's note said fabric, minor mislocation.)

### NIT (no action required)

**NIT-1 — Dead red-phase cast in the AC1 test.**
`af9-relevance-subscriber.integration.test.ts:25-32` casts the fabric module `as unknown as { registerRelevanceListener: ... }` to survive the red phase before the export existed. The export now exists and is in `index.ts`, so the cast is dead weight and slightly obscures type-checking of the call. Harmless; could import `registerRelevanceListener` directly. Not blocking.

**NIT-2 — `af9-fts-boot` second test is weak.**
`af9-fts-boot.integration.test.ts:62-93` ("returns the correct item matching the query") only asserts `length >= 1` and explicitly notes it can't check the negative because it lacks IDs at write time — so it doesn't actually prove discrimination. Discrimination IS proven by the server-pkg `af9-fts-tool` test (asserts the non-matching item is absent), so coverage is fine overall. Could be tightened or dropped. Not blocking.

---

## Lens summary

- **Architecture:** Layer integrity respected (fabric wiring only; no reaching across layers). Engine reuse exemplary — no rewrites, no new event types, no schema columns beyond the FTS migration that formalizes existing DDL. Scope discipline strong. **One contract miss:** the seed-registration contract has two enforcement points (db replica + fabric) and only one was satisfied (HIGH-1).
- **Design:** N/A (no UI; correctly skipped).
- **Security:** No new mutating routes; relevance rides an existing GET. FTS still goes through `sanitizeFtsQuery`. Auto-promotion editor is the reserved `system:auto-promotion` marker, not spoofable. Sweeps batch-capped. Relevance frequency sourced from server-written `knowledge_access_log`, not agent self-report. No new findings.
- **Adversarial:** No `any`/unsafe `as`/non-null `!` in production code (only the dead test cast, NIT-1). Fire-and-forget paths are error-handled (FTS boot `.catch`, relevance handler try/catch, attention `{ok:false}` log). No double-emit of `knowledge_updated` (verified: handler only calls the sweep; test asserts exactly one `auto_promoted` per item). Disabled-routine short-circuit returns before the `routine_runs` insert — verified, test covers it. The Saboteur's-eye risk that surfaced: the test seed path masks the missing production seed (HIGH-1).
- **Simplification:** Candidate-id concatenation is clean. No premature generics, no dead helpers in production. NIT-1/NIT-2 are minor test-side cleanups.
- **AI slop:** Comments are dense and lore-grounded, not filler. Two stale count comments (LOW-1, LOW-2) are the only slop.

## Doc-skip justification: reasonable.
AF9 is backend automation — no routes, no UI, no user-visible surface change. Practice search "starting to work at runtime" is an agent-facing tool (`query_practice`), not a human-facing doc surface; lifecycle/relevance docs already describe these mechanisms as the intended behavior. No user reads/sees/does anything new. Skipping user-facing docs is justified.

## What the builder must fix to reach DONE
1. **HIGH-1** — add `builtin:knowledge-promotion` to `BUILTIN_ROUTINE_SEEDS` (`packages/db/src/seed-fixtures.ts`) and update the production drift-guard test (`packages/db/src/__tests__/seed.integration.test.ts`: count 4→5 + add the id's trigger/owner/silent pins). This is the only AC-blocking item.
2. **LOW-1** — fix stale "4 builtin IDs" JSDoc at `builtin-routines.ts:48` → 5.
3. **LOW-2** — remove the contradictory stale comment at `builtin-routines.integration.test.ts:164`.

Re-run `npm run test:integration` (must show the production seed test proving 5 routines) + `npm run check` + `npm run lint` before re-review.

---

# AF9 — Code Review Round 2 (re-review of fix commit)

**Fix commit:** `cdccbf13` "fix(AF9): seed promotion routine in production replica; refresh stale builtin-count comments".

## Verdict: DONE

All three round-1 findings resolved. AC2 now genuinely holds on the production seed path. Gates green: `npm run check` (11/11 packages PASS), targeted integration suite (7 files, 57 tests, all pass — seed + all af9-* + builtin-routines). No regressions, no new findings.

## Finding resolution

**HIGH-1 — RESOLVED.** `builtin:knowledge-promotion` added to `BUILTIN_ROUTINE_SEEDS` (`packages/db/src/seed-fixtures.ts:101-112`). Field-by-field cross-check against the fabric spec `BUILTIN_SPECS` (`builtin-routines.ts:169-185`):

| Field | seed-fixtures.ts | BUILTIN_SPECS | Match |
|---|---|---|---|
| id | `builtin:knowledge-promotion` | `builtin:knowledge-promotion` | ✓ |
| name | `Knowledge promotion` | `Knowledge promotion` | ✓ |
| ownerAgentId | `seed-agent-pf-facilitation` | `seed-agent-pf-facilitation` | ✓ |
| triggerType | `calendar` | `calendar` | ✓ |
| triggerConfig.cron | `0 3 * * *` | `KNOWLEDGE_PROMOTION_CRON = "0 3 * * *"` | ✓ |
| skillId | `knowledge_promotion` | `knowledge_promotion` | ✓ |
| doneCondition | `Provisional items meeting repetition threshold promoted` | identical | ✓ |
| humanReview | `false` | `false` | ✓ |
| silent | `false` | `false` | ✓ |

No drift. (`teamId: seed-product-1` is correct for the production replica — the fabric spec carries no teamId because `seedBuiltinRoutines` takes it as a parameter; production passes `seed-product-1`.)

Production drift-guard test now genuinely covers the new row. `seed.integration.test.ts`:
- "seeds exactly 5 G4 builtin routines" — `toHaveLength(5)` (was 4), `expectedIds` includes `builtin:knowledge-promotion` with active+trigger_config assertions (lines 193-235).
- "pins the full trigger_config, owner, skill, human_review, silent" — adds the promotion pin (lines 299-308): trigger `calendar` / cron `0 3 * * *`, owner `seed-agent-pf-facilitation`, skill `knowledge_promotion`, humanReview `false`, silent `false`. The test reads from the real `routines` table after `seed(db)` (the production path), and asserts each field equals the pin — so it proves the row exists with the right trigger via production seed, not the fabric replica. Confirmed passing.

**LOW-1 — RESOLVED.** `builtin-routines.ts:48` JSDoc now reads "There are now 5 builtin IDs." plus an AF9 line documenting the addition. No stale "4".

**LOW-2 — RESOLVED.** `builtin-routines.integration.test.ts:164-165` — the contradictory stale line is gone; the lore now reads "AF9: knowledge-promotion added — now 5 builtin routine IDs" with a parenthetical noting AD8c removed cost-sentinel. No "now 4" left in the file.

## AC2 production-path status

**MET.** The production path `runSetup → seed() → iterates BUILTIN_ROUTINE_SEEDS` now inserts the `builtin:knowledge-promotion` row. On a real install it gets a `nextRunAt` (calendar trigger → AF6 scheduler computes it at seed time / backfill), the AF6 scheduler fires `runKnowledgePromotion`, which runs `runAutoPromotionSweep` (single emit) + bounded attention recompute. The tell from round 1 (drift guard asserting 4) is inverted: it now asserts 5 and pins the new routine's full spec, and passes. AC2 is unmet no longer.

## Regression scan

Round-1-met ACs (AC1, AC3, AC4) untouched by the fix commit — the only changes are the seed replica addition, the db drift-guard test (count + pin), and two comment edits. No production logic in fabric/server changed. The fix is additive and the existing AF9 suites (relevance subscriber, FTS boot/tool, attention population, promotion routine) all still pass in the same run. No new `any`/unsafe `as`/`!`, no slop introduced — the new seed entry is plain data mirroring an existing pattern, with a sync-required lore comment pointing back to `seed.ts:395-403`.

NIT-1 and NIT-2 from round 1 remain (dead red-phase cast; weak second fts-boot assertion) — both explicitly non-blocking, left as-is. Not re-raised.

## What changed since round 1: DONE.
