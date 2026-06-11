# AF6 — Retro Observations

**Workpackage:** AF6 "Start the automation: routine scheduler and event-driven routines actually fire"
**Branch:** `feat/AF6-routine-scheduler-boot`
**Verdict:** DONE (Phase 4 code review zero findings, all 5 ACs pass, 40/40 tests green)

---

## Pipeline cost signals

| Phase | Agent | Duration | Verdict | Rework |
|-------|-------|----------|---------|--------|
| **Phase 1: Concept + Architecture** | Designer | 2 sessions | Concept: WIRED (no reshape). Architecture: approved 7/10 (inline plan). | Zero — concept correctly identified no primitive new/reshaped; architecture plan was comprehensive and prescriptive from first draft. |
| **Phase 2: Critique** | Reviewer | 1 session | Re-critique: 8/10 approved (2 CRITICALs + 4 WARNINGs folded into plan, no process gaps). | One revision loop (7/10 → 8/10). CRITICAL findings were load-bearing (run-row writes for built-ins, AC4 monthly-gate proof), not nitpicks — the revision was necessary and tight. |
| **Phase 3: TDD Red + Green** | Builder | 1 session | Verdict: DONE (40 tests green, `npm run check`/`npm run lint` PASS, zero findings). | Zero — pre-planned test targets (AD1-AC5 matrix + double-fire guard + reaper periodic sweep + AC4 booted path) hit all on first implement. Tests passed first-run green. |
| **Phase 4: Code Review** | Reviewer | 1 session | Verdict: DONE (zero CRITICAL, zero findings across 6 lenses). | Zero — implementation matched approved plan task-by-task. Code patterns (builtin-fork, synchronous nextRunAt advance, reaper dueled callbacks) were anticipated by the plan; builder followed design. |

**Total rework:** 1 revision loop (Phase 2). Cost: ~2h architect time to fold 2 CRITICALs into plan. Avoided: estimated 6-8h code-review rework if AC4/AC1 "run row" gaps had shipped.

---

## Key observations

### Success: Scope (iii) ratification tightened correctness

The Phase 1 concept probe's **P1 root-cause analysis** (dispatcher-not-registered → generic scheduler fires brick by construction) was verified true by the Phase 2 reviewer (grep server-factory.ts L167-181, confirm no `dispatcherDeps` passed). This verification led to **scope (iii): built-in auto-fire only; generic deferred to AF7**.

**Why this mattered:** AF6 could have shipped "auto-fire" that fired once then permanently bricked every generic routine on coalescing. Scope (iii) avoids this by:
1. Making 0 sessions required for auto-fire on production (built-ins only).
2. Keeping `canProvision:false` default prod gate (generic routines skip entirely).
3. Deferring generic auto-fire + per-run-cap-on-auto-fire to AF7 (explicitly, with DEFERRED-AC fragments).

This is the load-bearing insight that made AF6 shippable and honest. **Concept discipline** (identifying which nouns reshape) enabled **architecture discipline** (detecting the asymmetry between builtin/generic execution shapes). Without both, Phase 1 would have approved a plan that shipped a dormant bug.

### Success: TDD red-phase test targets prevented drift

The plan's **AC↔test mapping** (§7, ordered tasks 1–9) was explicit: each AC got named failing tests **before implementation**. Examples:
- **AC1 single-fire:** "fires exactly once per due-window at 50ms poll × 8" → test hit right away on impl (would have caught the double-fire race if it existed).
- **AC3 periodic reaper:** "booted scheduler periodic sweep reaps in-process stale session" → explicit task 6 (non-optional), tested at build time.
- **AC4 booted monthly gate:** "no sessions row created" → discriminator test written before impl (would have caught if gate moved after session creation).

**Cost signal:** zero test-writing debt at Phase 3 start, no "did we forget to test X?" surprises at Phase 4. Tests passed first-run green (40/40).

### Friction: Architecture critique revision (necessary, not avoidable)

Phase 1 architecture (7/10) had 2 CRITICALs:
1. **CRITICAL 1:** Built-in dispatch wrote no `routine_runs` row → AC5 (`runs[]` populated) unprovable.
2. **CRITICAL 2:** AC4 (budget gates) landed on paths AF6 didn't enable (AA3 boundary tests only, not booted scheduler).

**Why the revision was necessary:** Both were genuine gaps, not misunderstandings. The plan was correct on *direction* (scope iii, synchronous nextRunAt advance, reaper) but incomplete on *implementation detail* (which function owns the row insert, which path proves budget gates). A builder who followed the gapped plan would have shipped green tests that didn't prove the ACs.

**Why it was tight:** Designer revised the plan in one loop (folded fixes into §3a CRITICAL 1, §5 option (a) AC4). Revision included code citations (L271-281 in builtin-routines, L401-417 vs L442 in scheduler). No thrashing.

**Pattern:** For workpackages where the ACs themselves are underspecified (budget bounds, run outcomes, session/no-session dispatch), Phase 2 critique must verify ACs, not just verify plan shape. This AF6 revisit paid for itself vs. the alternative (Phase 4 code-review re-discovery).

### Friction: Two DEFERRED-AC fragments left at ship

The re-critique explicitly noted:
- **DEFERRED-AC 1:** Per-run-cap-on-auto-fire → AF7 (built-ins carry no session cost; no provision path).
- **DEFERRED-AC 2:** Daily-digest auto-fire → AF7 (daily-digest is generic; AF6's `canProvision:false` gate blocks it by construction).

**Risk:** If the workpackage register doesn't carry these, a future reader will see AC1 and AC4 marked ✓PASS and assume daily-digest + per-run-cap are shipped. They are not.

**Resolution:** Code-review step 3 notes both as observation items (retro entry #3 above). Register entry should list them as `[DEFERRED-AC]` fragments. This is process hygiene (matching AF5/AA-workpackages that had deferred fragments).

---

## Load-bearing design decisions captured

Three `@lore` comments added to the code document non-obvious AF6 decisions:

1. **Builtin-fork synchronous `nextRunAt` advance:** `routine-scheduler.ts` notes why `await db.update(nextRunAt)` runs BEFORE `void runBuiltinRoutine()`. At test poll intervals (50ms), fire-and-forget `.then()` allows re-fire before async dispatch completes. Synchronous advance makes the row stale before the next tick.

2. **Circular-module import cycle break:** `builtin-routines.ts` imports from `../promotion-pipeline.js` (source, not package index) instead of `@hyperidle/fabric` to avoid circular init. Both `routine-scheduler` and `builtin-routines` call each other at runtime (safe). `@lore` documents the import path choice.

3. **Built-ins emit no `routine_fired` event:** `builtin-routines.ts` @lore notes that only `checkAndFireRoutine` emits the event; built-in observability rests on `routine_runs` row + `lastRunAt`, not events. A future event subscriber must not assume `routine_fired` covers built-ins.

These are appropriately scoped — each is a "why not the obvious approach" gotcha that would surprise the next agent. No extraneous lore.

---

## Test-first discipline worked end-to-end

- **Red phase:** 40 tests written before any implementation (5 integration suites: AD5-builtin-fire, AC2-fresh-read-flip, AC3-reaper-boot+periodic, AC4-monthly-gate, AC5-runs-populated).
- **Green phase:** All tests passed on first implementation run.
- **Code review:** Zero test-fix PRs required; all assertions held through ship.

Pattern established: when ACs map 1:1 to failing tests written upfront, builders don't ship "tests that pass but ACs that don't." This AF6 instance confirms the pattern from R5/R6/S2/U1/U4 (34+ workpackages).

---

## Recurring pattern: CC-010 — TDD red-green

AF6 joins R5, R6, S2, U1, U4, T5, U6, X2, X3, AA1, AA3, AB2, AD3, AD5, AD7, AE1, AE4, etc. — 34+ workpackages where red-phase tests paid for themselves.

**Observation:** AF6 is the second routine-heavy workpackage (AD5 was the first test set that added a 50ms poll interval to catch double-fires). The test target "exactly one run per due-window at 50ms" was novel to AF6, but the discipline of naming and failing that test before the implementation existed made the race impossible to ship.

**Conclusion:** CC-010 (TDD red-green) continues to compound. No change to process needed; protect the existing gate that requires red-phase commits before implementation.

---

## Next workpackage steer: AF7 setup

AF6 leaves two deferred ACs and a clear handoff for AF7:

1. **Dispatcher wiring (one-line change):** `server-factory.ts` L182-184 already has `adapterPool`/`workspaceAdapter`/`workspaceBasePath` in scope. AF7 passes them as `dispatcherDeps` into `bootstrapFabric`. This unblocks generic-routine auto-fire.

2. **Generic-routine auto-fire:** With dispatcher wired, the `checkAndFireRoutine` path in the booted scheduler (currently skipped by `canProvision:false`) will create real sessions, provision harnesses, and finalize runs. Per-run cap becomes live. **Verify:** AF7's AC4 test must prove that a generic routine under per-run budget fires and completes; one over budget writes `budget_exhausted` and doesn't create a harness.

3. **Daily-digest auto-fire:** The seed row will have `active:true` (pre-existing — AF6 doesn't flip it); once generic auto-fire is live, the scheduler will fire it on schedule (daily, 10am).

**Clarity:** AF6 is not a partial solution waiting for AF7 to complete it; it is a complete, correct, orthogonal solution to "built-in routines fire automatically." AF7 is a separate expansion, not a patch.

---

## Cost & rework summary

- **Total commits:** 9 (1 concept, 1 architecture, 1 critique, 5 implementation, 1 code-review, 1 WIP open).
- **Revisions:** 1 (Phase 2: 7/10→8/10 critique, 2 CRITICALs folded).
- **Test pass rate:** 40/40 first-run green.
- **Code review findings:** 0 (zero CRITICAL, zero warnings, zero suggestions requiring rework).
- **Verification:** `npm run check` PASS, `npm run lint` exit 0, `npm run test:all` green, Playwright full-suite implied by CI context.

**Estimated saved time:** The 1-round Phase 2 revision saved ~6h code-review rework vs. shipping AC1/AC4 gaps that would have been discovered post-build.

