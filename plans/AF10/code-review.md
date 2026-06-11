# AF10 — Cost accounting integrity — Code Review (Phase 4)

**Reviewer:** single evaluator persona (carried from Phase 2 plan critique, 9/10 APPROVED).
**Diff:** `git diff origin/main...HEAD` on `feat/AF10-cost-accounting`.
**Verdict: DONE.**

Gates: `npm run check` PASS (11/11 packages, 0 type errors) · `npm run lint` exit 0 (warnings are pre-existing baseline) · AF10 unit tests 31/31 green · AF10 integration tests 32 passed / 1 skipped green.

---

## AC table

| AC | Requirement | Status | Evidence |
|---|---|---|---|
| AC1 | session cost = Σ deltas (10,5,5 → 20 not 45); delta is per-event, not total | **PASS** | `session-provisioning.ts:760` computes `deltaMinor = round(delta*scale)`; `:774` passes `costMinor: deltaMinor` (NOT `totalCostCents`, which is kept only for cap-check `:765` + teardown `:872/886`). Boundary does `costActual += costMinor` (`cost-cap.ts:247`). Test `AF10-session-cost-delta.integration` asserts 20 on agent/team/bet; `AF10-provisioning-cost-delta.integration` proves the caller honors it. |
| AC2 | routine + team cost written, not placeholders | **PASS** | `session-lifecycle.ts:114-126` atomically `coalesce(costActualMinor,0) + costInCents` on `routines`. Team cost already flows to `teamMembers.costActual` (`cost-cap.ts:255`) and is read at `teams-routes.ts:801`; §1 fix corrects its magnitude. Test: routine single-run=300, two-run accumulate=450 (`AA3-routine-cost.integration:972/1021`). |
| AC3 | CLI-harness cost captured (`total_cost_usd`, fallback 0) | **PASS** | `cli-harness-adapter.ts:415-420` reads `costField` (default `total_cost_usd`) off the `type:"result"` line, accepts only finite ≥0; `:327-336` emits one terminal `cost_update(delta=total)`; `buildResult:449` returns real cents or 0. Committed fixtures (with/without cost). Test 31/31 incl. missing-field → aggregate 0. |
| AC4 (narrowed §5.4) | artifact cost recorded into aggregates; null-owner → 201 no cost; teamId via users.teamId not tasks.teamId | **PASS** | `artifacts.ts:330` resolves agent (body→`tasks.ownerAgentId`), `:340-344` resolves `teamMembers.id` via `users.teamId` (NOT `tasks.teamId`), `:347` synthesizes `artifact:<id>` sessionId, `:351` routes delta `micros/10000`. Null-owner guarded at `:333` (`resolvedAgentId !== null`) → never calls boundary, never throws `Agent not found`, returns 201. Tests cover agent/bet/team aggregate, fallback-to-owner, null-owner 201+zero-delta, GET chip NULL_COST. |
| AC5 | all 7 money surfaces via `formatMoney`; no hardcoded symbol/divisor/currency; no 8th surface | **PASS** | All 7 converted (SessionActivityPanel:100, WorkTask:144/334, WorkRoutine:353, WorkTeam:263/270, TaskSheet:342). Re-grep of `packages/web/src` for `toFixed(2)`/`/100`/`$` in cost contexts (excl. tests) returns **zero** — no 8th surface. JPY-based render tests prove genuine `formatMoney` use (¥1,500 not ¥15.00), not a string grep. |

---

## Findings

### CRITICAL
None.

### WARNING
None.

### OBSERVATIONS

1. **[Security — out of AF10 scope, AF11 owns it] `POST /api/artifacts` lets an authenticated caller attribute cost to an arbitrary `agentId`/team.** `artifacts.ts:330-356` accepts `body.agentId` and increments that agent's `users.costActual` and their team's accumulator with **no check** that the agent relates to the producing task or that the caller may act as that agent. Under today's single-tenant admin-level `X-API-Key` model (all `/api` routes behind `authMiddleware`, `app.ts:336/338`) every caller is already fully trusted, so this is not a live escalation. AF11 explicitly scopes artifacts authz (TRACK-AF.md §AF11: *"thread detail … and artifacts enforce the same scoping as their list endpoints"*). Flagged so AF11 includes the cost-attribution vector in its artifact scoping, not just read scoping. The security-critical part for AF10 — null-owner does **not** throw `Agent not found` — is satisfied (`:333` guard).

2. **[Dead field — pre-existing, not introduced by AF10] `cost_tick` activity entries have no server producer.** `SessionActivityBuffer.start()` subscribes only to `tool_call_recorded` + `session_ended` (`session-activity-buffer.ts:46/69`); nothing ever creates a `cost_tick` entry. The `currency` field AF10 added to `CostTickData` (`:20`, web `useSessionActivity.ts:29`) and the `SessionActivityPanel:100` `formatMoney` swap are therefore exercised only by `.stories.tsx` mock data today. The plan (§6) assumed a live `cost_tick` emit site; there is none. AF10's swap is still correct (renders correctly when a producer is wired), and the currency-threading is forward-correct. The missing producer is out of AF10 scope (cost is recorded via `cost_update`, not surfaced as live ticks). Worth a follow-up: either wire a `cost_tick` producer or remove the unused entry type.

3. **[Render fidelity — acceptable] SessionActivityPanel precision change.** Old: `+{(deltaMinor/100).toFixed(4)}` (4-decimal sub-cent delta). New: `formatMoney({minor:deltaMinor,currency})` → 2-decimal USD, so a sub-cent per-tick delta renders `$0.00`. This is the correct AC5 behavior (currency-aware, no magic precision) and only affects the (currently unproduced — see #2) live-tick view. Noted, not a defect.

4. **[Slop — minor] Verbose inline `as import("@hyperidle/shared").CurrencyCode` casts** at `TaskSheet.tsx:351`, `SessionActivityPanel.tsx:100`, `WorkTask.tsx:147`. Three `string → CurrencyCode` narrowing casts, each guarded by `|| "USD"`. Necessary (wire types carry `currency: string`; `formatMoney` wants the narrow union) but the inline-`import()` type form is noisy; a top-of-file `import type { CurrencyCode }` would read cleaner. Cosmetic. No `any`/`@ts-ignore`/non-null assertions anywhere in the production diff.

### What's working well

- **AC1 fix is exactly the surgical one-value change the plan promised** — `deltaMinor` to the boundary, `totalCostCents` retained only for cap-check + teardown. The stale `@lore AF8 INFLATION WARNING` was correctly updated to `INFLATION RESOLVED` (`cost-cap.ts:366`), and the `recordFactoryCost` trailing call (the AF8/AF6 contract) is preserved untouched.
- **AC4 id-resolution lands on the correct tables.** `users.teamId` (= `teamMembers.id`) is used, `tasks.teamId` (= `teams.id`) is correctly avoided — verified against `cost-cap.ts:255` accumulator target. The null-owner skip is the only runtime-safe path given the boundary throws on a missing agent; tests prove 201 + zero delta.
- **AC5 proof is behavioral, not lexical.** The JPY zero-decimal fixtures would render the wrong magnitude (¥15.00 vs ¥1,500) if any surface still hardcoded `$x/100` — this is real input→output proof, exactly what the rubric demands.
- **Doc check confirmed.** `docs/guides/user/cost-management.md` describes the cost *model* and *surface locations* only — no numerical-accuracy claim, no placeholder mention. AF10 makes figures correct without changing any documented claim or behavior. Builder's "no doc update needed" is correct.

---

## Verdict: DONE

All five acceptance criteria pass with behavioral evidence. Zero critical, zero warning findings. The four observations are: one out-of-scope security vector explicitly owned by AF11 (cross-referenced), one pre-existing dead-field condition AF10 did not introduce and correctly future-proofed, one acceptable render-fidelity change, and one cosmetic slop note. None blocks merge.
