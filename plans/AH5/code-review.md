# AH5 Code Review — Phase 4

**Workpackage:** AH5 — Live agent-path smoke lane. **Branch:** `feat/AH5-live-smoke-lane`. **Diff:** `f0c8dc2e..HEAD`.
**Reviewer:** single evaluator (Phase 2 critique → Phase 4 code review). Design lens skipped (no UI surface).

**Verdict: NOT DONE.** Two CRITICAL findings block: (C1) the no-mock guard does not compile and never enforces — AC1's static guarantee is dead; (C3) nothing in AH5's own DoD asserts a tool call fires — AC3 is not gated by any always-run proof. Both are fixable without re-architecting.

---

## AC completeness audit

| AC | Status | Evidence |
|---|---|---|
| **AC1** Frontend-driven lane asserts a real streamed response, no mocks on the proof path; probe drives `provisionSession` with real `callLlm` | **PARTIAL** | The probe (`ah5-real-turn-probe.ts`) genuinely drives the production span: production `DbCredentialResolver` + `resolveModelTier` resolve the encrypted OpenRouter key, then `provisionSession → runSession → BuiltinHarnessAdapter → callLlm` runs with zero mocks. The credential/LLM path is real. UI-trigger assertion `test.fixme()`-gated pending AH3 — legitimate per Phase-2 ruling. **BUT** the no-mock *static guarantee* is broken — see **C1**: `scripts/ah5-no-mock-guard.ts` fails to parse and never runs. Without the guard, "no mocks on the proof path" is asserted only by convention. |
| **AC2** Model selected at run time by documented gates, ranked, `:nitro`, not hardcoded; delisting→next candidate; unit-tested against captured fixture | **MET** | `selectSmokeModel` correctly implements free/gen/price pre-filter → per-provider tools+uptime+status gate → ≥2-provider redundancy → throughput-desc/latency-asc/price-asc rank → `${id}:nitro`. 22 passing unit tests in `select-smoke-model.test.ts` derive gate/rank cases from the real captured fixture (`openrouter-endpoints.captured.json`, real OpenRouter ids/shapes), tiebreaks from synthetic inputs (acceptable). Fallthrough tested (remove `ranked[0]` → `ranked[1]` surfaces). `narrowModels`/`narrowModelEndpoints` shape-integrity asserted against the fixture. No hardcoded model on the proof path. Minor: see **W4** (`:nitro` is double-suffixed for the agent row but harmless). |
| **AC3** ≥1 real tool-using action via prescriptive prompt; tool effect observable | **NOT MET** | The probe at `ah5-real-turn-probe.ts:327-329` **explicitly does NOT fail on tool-call absence** ("We don't fail on tool call absence here"). The `write_session_notes` `tool_call_recorded` observation is logged but never asserted. The UI-row assertion that *would* check it is `test.fixme()`-gated (AH3). **Therefore no always-run AH5 proof gates AC3.** The probe can pass on `outcome===completed && cost>0` while the model emits prose and never calls the tool. See **C3**. |
| **AC4** Runs in CI off hot path AND genuinely gates (broken stream → fail) | **PARTIAL** | Off-hot-path CI is correct: separate `ah5-smoke.yml`, schedule+dispatch+labeled-PR, secret-gated, `ci.yml` untouched. Gating integration test `ah5-gates-on-broken-stream.integration.test.ts` drives the **production** `provisionSession` seam (not a hand-built adapter — Phase-2 WARNING honored), injects a zero-event adapter, asserts `totalCostCents === 0`. Runs green (2 passing). **BUT** the gate only proves the *cost>0* half of the liveness condition is load-bearing — it does **not** prove the *tool_call* half (which AC3 needs and the probe doesn't assert anyway). And the broken adapter's `stopSession` returns `outcome:"completed"`, so the test does **not** prove the probe's `outcome` check is load-bearing. See **W1**. |
| **AC5** Token cost bounded by configured cap, reported, fail-closed; cents; missing file fails closed; `if: always()` | **MET** (with **W2** path bug) | `isWithinCostCap` pure + tested. Probe asserts `totalCostCents <= MAX_COST_CENTS` and `> 0`, writes `ah5-cost.json` *before* assertions (fail-closed ordering). `ah5-assert-budget.ts` fails closed on missing/unparseable/over-cap, runs `if: always()`. Cents not dollars. **BUT** the CI cost-artifact upload path (`packages/web/playwright-report-ah5/`) does not match where the probe writes (`packages/playwright-report-ah5/`) — the artifact silently never uploads (`if-no-files-found: warn`). Budget-assert still reads the correct path, so the *gate* works; only the retained artifact is lost. See **W2**. |

---

## CRITICAL

### C1 — `scripts/ah5-no-mock-guard.ts` does not compile; the no-mock enforcement (AC1 static half) never runs
The JSDoc header contains `**/threads/**/messages` on line 6. The `*/` inside `**/threads/**` **closes the block comment prematurely**, so esbuild/tsx parses `threads/**/messages` as code:
```
ERROR: Expected ";" but found "messages"  (scripts/ah5-no-mock-guard.ts:6:21)
```
Verified: `npx tsx scripts/ah5-no-mock-guard.ts` exits **1 with a `TransformError`**, before reading a single spec file. The guard the plan designates as the mechanical enforcement of "no `page.route` on the proof path" (AC1) is dead. In CI (`ah5-smoke.yml` step "Run no-mock static guard") it will fail the job for a *parse error*, not because it detected (or cleared) mocks — and a future reader who "fixes" it by deleting the step removes all enforcement. `npm run lint`/`npm run check` do NOT catch this (biome tolerates the comment; the file isn't in a typechecked project).
**Fix:** escape or reword the globs in the comment so no `*/` appears (e.g. `threads/.../messages`, or use a non-comment string array as the source of truth). Add a CI assertion that the guard actually inspected ≥1 spec file (it currently exits 0 silently when zero specs match — `collectSpecFiles` empty → "Skipping guard").

### C3 — No always-run AH5 proof gates AC3 (real tool call). The probe deliberately doesn't assert it
`ah5-real-turn-probe.ts:327-329`:
```ts
// We don't fail on tool call absence here — the prescriptive prompt may
// produce prose without a tool call on some models. The key liveness proof
// is outcome=completed + cost > 0 + cost <= cap.
```
AC3 requires "≥1 real tool-using action via a prescriptive prompt, tool effect observable." The probe finds and logs the `write_session_notes` event but never asserts it. The only assertion that checks the tool is the `test.fixme()`-gated UI block (AH3-owned). So **AH5's DoD is satisfiable while the assistant never calls a tool** — exactly the kind of "green while dead" the track's hard requirement exists to prevent. The Phase-2 plan (§ Risk 5, AC3 row) committed to "the probe asserts the `tool_call` event for `write_session_notes`" — the code dropped that assertion.
**Fix:** make the probe **fail** when no `tool_call_recorded` for `write_session_notes` (with `notes === "AH5-SMOKE-OK"`) is observed. Determinism comes from the prescriptive prompt (the plan's own rationale); if a model occasionally emits prose, that is a model-quality signal the lane should surface, not suppress. If genuine model flakiness is a concern, retry once with `:nitro` fallback (`ranked[1]`) rather than passing silently. Note: the adapter's internal `registry.invoke("write_session_notes", ...)` at `builtin-harness-adapter.ts:460/509` does NOT emit a `tool_call` harness event (only LLM `tool_use` blocks do), so asserting the event remains a true proof the *model* called the tool — no false positive.

---

## WARNING

### W1 — Gating test under-proves: `outcome` and `tool_call` halves of the liveness condition are not pinned
`ah5-gates-on-broken-stream.integration.test.ts` only asserts `totalCostCents === 0`. The broken adapter's `stopSession` returns `outcome:"completed"`, so the test cannot and does not prove the probe's `outcome !== "completed"` check is load-bearing — a future regression that makes the probe pass on `outcome` alone would not be caught. And nothing in the gating test exercises the `tool_call` liveness half (because the probe doesn't assert it either — C3). **Fix:** after C3 is addressed, add a gate case proving "broken/empty stream → no `tool_call_recorded` observed → probe-style liveness check fails," so the tool-call assertion is itself protected. At minimum, assert the broken-stream path does not satisfy the *combined* probe success predicate, not just one term of it.

### W2 — CI cost-artifact upload path mismatch; the report never uploads
Probe writes (and budget-assert reads) `packages/playwright-report-ah5/ah5-cost.json` (resolving `../../` from `packages/web/scripts` = `packages/`). The Playwright HTML report and the CI artifact-upload step point at `packages/web/playwright-report-ah5/`. Verified by path resolution. Result: the "Upload cost report" step finds no file and warns (`if-no-files-found: warn`) — the cost evidence is never retained for inspection, defeating half of "reported." The budget *gate* still works (assert reads the right path). **Fix:** make the probe write into `packages/web/playwright-report-ah5/` (alongside the Playwright report), and update `ah5-assert-budget.ts`'s `COST_FILE` to match, OR fix the CI upload path. Pick one canonical directory and use it in all three places (probe, budget-assert, CI upload).

### W3 — Missing server export-map entries: `services/credential-encryption` and `services/server-config`
`ah5-real-turn-probe.ts` (L60-65) and `ah5-test-server.ts` (L40-43) import `@hyperidle/server/services/credential-encryption` and `@hyperidle/server/services/server-config`. Verified: `packages/server/package.json` `exports` lists `session-provisioning`, `model-gateway`, `credential-resolver`, `adapter-pool`, `builtin-harness-adapter`, `local-workspace-adapter` — but **not** `credential-encryption` or `server-config`. These resolve today only because `tsx` reads TS source directly and ignores the exports map. This is real fragility: any consumer using Node's exports resolution (or a future build that respects the map) breaks. The probe and test-server are the proof vehicle — they should not depend on an unsanctioned resolution path. **Fix:** add both subpaths to the server `exports` map (they're already source-mapped like the siblings). Small, do it now — it's load-bearing for the lane the whole track depends on.

### W4 — Probe exercises the tier path, not the per-agent (AH2) path; agent model is seeded but unused
The probe seeds the agent (`users` row) with `modelProvider:"openrouter", modelId:smokeModelId`, then resolves via `resolveModelTier("workhorse", ...)` and passes the result into `provisionSession`. `provisionSession` consumes the pre-resolved model — it never reads the agent's per-agent model. So the per-agent model on the seeded row is dead config; the model actually used comes from the global `modelGateway.workhorse` override. The plan's stated seam ("`resolveAgentModel` openrouter branch") is not what runs. The real LLM call still happens with the right `:nitro` model and a real credential, so AC1's *substance* holds — but the seam is the tier resolver, not the agent resolver. **Fix (low priority):** either drop the unused per-agent model seed (slop) or, better, resolve via `resolveAgentModel(agent, ...)` so the probe proves the AH2 per-agent path the eventual AH3 trigger will use. Document the actual seam in the probe header (currently claims `resolveAgentModel`).

---

## NIT / SLOP

- **N1 — Dead export.** `ah5-test-server.ts:132` `export const resolvedSmokeModelId` is never imported (the probe has its own isolated DB and resolves independently). Knip doesn't flag it (scripts/ entry config). Remove it and the misleading "Export for the probe to import" comment.
- **N2 — `isNaN` → `Number.isNaN`.** `select-smoke-model.ts:87` and `ah5-resolve-model.ts:52` use global `isNaN` (3 biome `noGlobalIsNan` warnings introduced by AH5). After `Number.parseFloat`, `Number.isNaN` is the correct guard. Minor; lint still exits 0.
- **N3 — Pre-filter logic duplicated.** The `:free`/gen/price pre-filter in `ah5-resolve-model.ts:48-54` re-implements the same three gates already inside `selectSmokeModel`. It exists to bound endpoint fetches (legitimate optimization), but it's a copy that can drift from the canonical gates in `select-smoke-model.ts`. Consider exporting a `preFilterModels(models, policy)` pure helper from the smoke module and using it in both places, so the gates have one source of truth.
- **N4 — `ah5-resolve-model.ts` default `OUT_FILE`** resolves to `<repo>/tmp/ah5-model-selection.json` while CI sets `RESOLVE_MODEL_FILE=/tmp/ah5-model-selection.json`. Works in CI (env override) but the local default writes to a different dir than the probe/test-server read absent the env var. Document the requirement that `RESOLVE_MODEL_FILE` be set for local runs, or align defaults.
- **N5 — `fetchModelEndpoints` failures are swallowed** in `ah5-resolve-model.ts:76-81` (per-model `catch` → skip). If *every* endpoint fetch fails (e.g. auth error), the loop silently yields an empty map → `selectSmokeModel` returns empty `ranked` → the script's existing empty-check fails closed. Acceptable, but log-only swallow of a likely-systemic auth failure could mask the root cause. Minor.

---

## Doc check

Builder marked NO user-facing doc change ("AH5 is internal CI smoke-lane infrastructure"). **Reasonable and confirmed** — the diff touches only `packages/eval/src/smoke/`, `packages/web/scripts/` + e2e + configs, `.github/workflows/`, `scripts/`, and `packages/server/.../__tests__/`. No user-facing surface (no `docs/guides/user/`, no UI component, no route reachable in production). No doc change warranted.

---

## What the builder must fix (to reach DONE)

1. **C1** — Fix `ah5-no-mock-guard.ts` so it compiles (reword the `*/`-bearing globs in the JSDoc), and make it fail (not silently exit 0) when zero specs are inspected.
2. **C3** — Make `ah5-real-turn-probe.ts` **assert** a `write_session_notes` `tool_call_recorded` event with `notes === "AH5-SMOKE-OK"`; fail closed on absence. Restore the AC3 gate the plan committed to.
3. **W1** — Extend the gating test so the *combined* probe success predicate (outcome + cost + tool_call) is proven load-bearing, not just `cost === 0`.
4. **W2** — Unify the cost-report directory across probe write, budget-assert read, and CI upload.
5. **W3** — Add `services/credential-encryption` and `services/server-config` to `packages/server/package.json` exports.

W4 and the NITs are non-blocking but should be folded in.

After fixes: re-run `npx tsx scripts/ah5-no-mock-guard.ts` (must exit 0 *and* report it inspected the spec), the probe locally with a real key (must fail if the tool call is absent), `npm run test:integration` on the gating test, `npm run check` + `npm run lint`.

---

# AH5 Re-Review — Phase 4 (after fix commit `1015b20e`)

**Reviewer:** single evaluator. **Diff re-audited:** `99904168..HEAD`. All prior findings (C1, C3, W1–W4, N1–N5) verified against the actual code + executed.

## Verdict: DONE.

All 5 ACs MET. Zero CRITICAL. Two prior CRITICALs (C1, C3) genuinely closed — verified by execution, not inspection alone.

## AC table (re-audit)

| AC | Status | Evidence |
|---|---|---|
| **AC1** No mocks on proof path; static guard enforces | **MET** | `ah5-no-mock-guard.ts` now compiles (JSDoc → `//` lines), runs (exit 0, inspected 1 spec), and **fails closed** on zero specs (`process.exit(1)`). Adversarially confirmed: injecting `page.route("**/sessions/provision", …)` into the AH5 spec → guard exits 1 with VIOLATION at the right line; restoring → exit 0. CI step "Run no-mock static guard" (ah5-smoke.yml:76) runs it unconditionally. Probe drives the real credential→LLM span, no mocks. |
| **AC2** Documented gates, ranked, `:nitro`, fixture-tested | **MET** | Unchanged from prior MET. 22 selection unit tests pass after the `preFilterModels` extraction (N3) — no selection-behavior change. |
| **AC3** ≥1 real tool action, observable | **MET** | Probe now **asserts always-run**: finds `write_session_notes` `tool_call_recorded`, parses `argsSummary` (real format = `JSON.stringify(args)` scrubbed; `"AH5-SMOKE-OK"` matches no redaction regex so parse is sound), requires `notes === "AH5-SMOKE-OK"`. Sets `failed=true` on absence or arg mismatch → `process.exit(1)`. No `test.fixme()` gate; only the UI-overlay assertion remains AH3-gated. "Green while dead" hole closed. |
| **AC4** CI off hot path AND genuinely gates | **MET** | Gating integration test rewritten: `probeSucceeds(result, toolCallNames)` mirrors the probe's real predicate (A: outcome==="completed", B: cost>0, C: write_session_notes observed). 3 tests pin B, C, and combined against the **production `provisionSession`** seam. Broken adapter returns `outcome:"completed"` so A vacuously passes — proving B and C load-bearing. All 3 pass (`test:integration`). |
| **AC5** Cost bounded, reported, fail-closed | **MET** | W2 fixed: probe write, `ah5-assert-budget.ts` read, and CI upload now all resolve to `packages/web/playwright-report-ah5/ah5-cost.json`. Gate + retained artifact both correct. |

## Prior findings — resolution

- **C1** RESOLVED — compiles, runs, fails closed on zero specs, fails on injected forbidden route (adversarially verified), wired into CI unconditionally.
- **C3** RESOLVED — tool-call assertion is always-run and gating; argsSummary parse verified sound against `summarizeToolArgs`.
- **W1** RESOLVED — `probeSucceeds` faithfully mirrors the probe predicate; B and C each proven load-bearing; 3 tests green.
- **W2** RESOLVED — all three paths agree on `packages/web/playwright-report-ah5/`.
- **W3** RESOLVED — `./services/credential-encryption` + `./services/server-config` added to server exports; match the probe/test-server import specifiers.
- **W4** RESOLVED (doc) — probe header `@lore AH5 W4` accurately documents the tier-path vs per-agent seam; AH3 per-agent seam scoped out. Misleading `resolveAgentModel` mention in header removed.
- **N1** RESOLVED — dead `resolvedSmokeModelId` export removed.
- **N2** RESOLVED — `Number.isNaN` at both sites; the 3 AH5 `noGlobalIsNan` warnings gone.
- **N3** RESOLVED — `preFilterModels` extracted as single source of truth, shared by `selectSmokeModel`'s call site and `ah5-resolve-model.ts`; logic byte-identical to the old inline filter; 22 selection tests pass — no regression.
- **N4** RESOLVED (doc) — `RESOLVE_MODEL_FILE` requirement documented in `ah5-resolve-model.ts`.
- **N5** RESOLVED (doc) — endpoint-error swallow behavior noted; fails closed downstream.

## New findings

- **N6 (info, non-blocking)** — `ah5-real-turn-probe.ts:388` `parsed["notes"]` triggers one biome `useLiteralKeys` **info** (not warning, not error). `npm run lint` exits 0. Cosmetic; fold in opportunistically.

## Validation executed

- `npx tsx scripts/ah5-no-mock-guard.ts` → exit 0, "inspected 1 spec"; injected-violation → exit 1; restored → exit 0.
- `npm run test -- select-smoke-model` → 22 passed.
- `npm run test:integration -- ah5-gates-on-broken-stream` → 3 passed.
- `npm run check` → 12/12 packages PASS.
- `npm run lint` → exit 0 (warnings/infos only; no AH5 `noGlobalIsNan`).
