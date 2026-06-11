# AF7 — Retro: Task Auto-Dispatch & Session Execution

**Date:** 2026-06-11
**Branch:** `feat/AF7-task-auto-dispatch`
**Verdict:** DONE (Phase 4 code-review DONE, fix-cycle re-review DONE)
**Complexity:** L (~5d budget) — runtime rewire closing 10 Z8 defects
(Z8-004, Z8-039, Z8-047, Z8-048, Z8-050, Z8-092/093/094/095, dispatch-half of Z8-010).

---

## Cost signals (A/B harness reads this section)

| Signal | Value | Notes |
|---|---|---|
| Concept rounds | 1 | `concept-present` — no new primitive, wiring-only. Fast confirm. |
| Architecture-critique rounds | **2** | Round 1 APPROVED 8/10 with 2 CRITICAL + 2 WARNING; Round 2 RESOLVED. One plan-revision commit + the round-2 re-critique. |
| Critique findings (load-bearing) | 4 | 2 CRITICAL, 2 WARNING — all genuine, all folded into plan before red phase. 3 SUGGESTIONs also folded. |
| Red→green | 1 pass | Impl commit `2e4ecce2` after red commit `8722cebe`. All 6 ACs green first code-review. |
| Phase-4 fix cycles | **1** | 4 MINOR findings (M1–M4); fix commit `19513149`; re-review DONE. No CRITICAL/MAJOR ever. |
| Contract change ripple | 200→**202** on POST /api/sessions | Forced a protected-tests enumeration (§13) + rewrite of R1 assertions + downstream `SessionConfig.sessionId` type-ripple across every adapter test. Anticipated in plan, not a surprise. |
| Commits ahead of main | 13 | 5 docs/scaffold `[skip ci]`, 1 red, 1 impl, 1 fix, 2 attestation, 1 merge, 2 review. |
| Net diff | +4156 / −268 across 41 files | |
| Gate result | check + lint + knip PASS; AF7 suite 17 integ + 2 unit green (→ post-fix: state-sync 8, +3 lifecycle retry, +adapter-gating) | web 211 errors AF5-quarantined, zero web files touched — out of scope. |

**Phase elapsed (commit timestamps):** concept+arch 08:51→08:56, critique 09:00, revision 09:06, round-2 09:08, red 09:24, impl 10:21, review 10:36, fix 10:54, fix-review 11:05. ~2h14m wall.

---

## What went well (protect these)

- **Cold-spot architecture critique verified all 14 load-bearing file:line claims against real source — zero drift.** Score 8/10 not 6 explicitly because every root cause was traced, not guessed. This is the CC-009 sub-pattern (independent grep/read of every factual claim) working as intended.
- **CRITICAL-1 caught a no-op-abort defect before it shipped.** The plan's stated builtin-revocation rationale was wrong: it claimed abort works because "the loop breaks, no further `registry.invoke`" — but builtin skips `registry.invoke` entirely (provisioning L645) and executes tools internally in `runLoop`. A builder following the rationale literally would have shipped an abort that does nothing for builtin (the only adapter AC5 exercises). Critique forced §5 to lead with `stopSession`→`aborted`→`runLoop` as the *primary* revocation. Prevented-production-bug.
- **WARNING-2 caught an admission-error-on-detached-path hole.** The 202 admit/run split meant a `MissingCredential`-class failure surfacing at P9 `startSession` (local mode, builtin, no resolved model) would land in the detached `.catch`→`crashSession` *after* the 202 returned — breaking the plan's claim that 500 MissingCredential mapping is preserved. Fix: synchronous `resolvedModel` presence guard in `admitSession` pre-P5-insert. Honest contract kept, no doomed row inserted.
- **CRITICAL-2 resolved a test-assertion contradiction before red phase.** "Count frozen" assertion contradicts cooperative abort (an in-flight invoke completes +1). Plan picked design (a) end-to-end: per-invoke `aborted` guard in `executeToolCalls` before each invoke + AC5 scoped to "no new tool call *starts*." Test and contract made to agree before a flaky test could ship.
- **CAS terminal write + rowcount-gated `session_ended` emit** is the right concurrency primitive and composes cleanly with the handoff path (row already `done` ⇒ teardown no-ops, zero spurious `session_ended`). The hard invariant ("emit iff rowCount>0") was stated explicitly and verified in code at `session-lifecycle.ts:249,326`.
- **sessionId-as-contract (§3) is the genuinely minimal fix** — deleting the id-minting + reconcile-scan and keying the existing `Map<sessionId>` by the provided id closes the Z8-092/093 race with no new locks.
- **Builder's 3 plan-vs-reality resolutions were all sound and weakened no AC** — notably the `enforceResolvedModelGuard` flag scoping (default false; true only on the HTTP `startSessionProvision` path) correctly reconciled WARNING-2's 500-contract with AD2's dispatcher path (where a missing credential is unrecoverable-per-task and dropped from queue, and fixtures run builtin stubs needing no resolved model). M3 fix (live-abort PATCH → 202/`aborting`) *strengthened* AC4.

## What cost iterations

- **2 architecture-critique rounds (1 plan revision).** Necessary, not waste — the four findings were load-bearing. But signals that a runtime-rewire plan benefits from the critique catching rationale defects (CRITICAL-1) that a happy-path read would miss.
- **1 Phase-4 fix cycle on 4 MINOR findings.** Root cause = **coverage gaps on the NON-AC deliverables**: §7 (lifecycle-propagation retry) and §8 (Z8-050 adapter gating) are "what's genuinely missing" spec items, not numbered ACs, so they shipped with code-correct-but-UNTESTED implementations against their own plan-stated test contracts. M1 (§7 retry untested — pre-existing test was tautological `>= 1`), M2 (§8 gate untested), M3 (stale live-abort PATCH body), M4 (avoidable `any` on `selectedAdapter`). All closed non-tautologically in one cycle. The gap: plan *promised* §7/§8 test assertions; red phase wrote AC tests but not the non-AC ones.
- **200→202 contract-change ripple.** Forced an explicit protected-tests list (closed the lone Dimension-9/CC-008 miss) and rewrites of R1 `returns 200` assertions to "assert 202 + active, then poll until done/crashed." Handled deliberately because the plan enumerated it — but it is recurring contract-ripple cost worth tracking.

## Handoff / notes

- M3 live-abort PATCH now returns `202 {state:"aborting"}` + poll directive instead of a stale `200 active` body — any future web client on this route must poll `GET /sessions/:id`, not read the PATCH body as terminal.
- §6 workspace reaper TTL default 24h (env `HYPERIDLE_WORKSPACE_TTL_HOURS`); TTL is the deliberate margin for the P4-dir-before-P5-row window, not luck.
- Docker/Isolated adapters now env-gated (`HYPERIDLE_ENABLE_*`) + availability-checked, never silent dead paths (Z8-050 closed by coherence, not deletion).
