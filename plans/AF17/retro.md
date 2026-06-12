# AF17 — Retro: Seed factory split and Nimmly purge

**Workpackage:** AF17 (TRACK-AF), Pipeline scope: full cycle (concept → architecture → review → build → retro).  
**Completion date:** 2026-06-12  
**Effort profile:** 2 designer rounds (concept + round-1 critique), 3 architecture-critique rounds, 3 code-review rounds, 3 builder rounds.

---

## What the pipeline caught that a solo build would have missed

### 1. Purge-completeness gap (architecture-critique round 1, CRITICAL-1)

The approved plan listed file-by-file purge targets but **omitted `packages/design-system/html/L11-*/mockup.html`** — four live design-asset files containing "Nimmly" (5 hits: "Pricing overhaul (Nimmly)" in `thin-header__host`, `host-banner__title`). A solo builder running `grep -ril nimmly` post-implementation would have hit these, failed `nimmly-guard:check`, and either (a) burned time debugging a "guard is broken" false positive or (b) silently excluded design-system from the guard (regression risk). The critique caught it **before implementation**, so task 11 (the purge batch) already named the four files and the guard avoided the false-positive trap entirely. Cost: prevented a wasted round of rework or a silent regression gate weakening.

### 2. `teams.id` vs `team_members.id` FK trap (architecture-critique round 1, CRITICAL-2)

The plan's type signature correctly specified `provisionTeamRoutines({ teamId, ownerByRole, leadAgentId })` but **did not explicitly name the variable confusion that would cause a builder to pass the wrong id.** Both team-creation seams (`teams-routes.ts` POST and `create-team.ts`) have two ids in scope with confusable names:
- `teamId` = `teams.id` (correct for `routines.team_id` FK)
- `teamMembersId` (or `team_members.id`, the membership row) where roster agents' `users.team_id` points

A builder reading "pass the team id" could easily select the wrong one. The plan's `teams-routes.ts` L36 example shows `const teamId = ...` and `const teamMembersId = ...` right next to each other — a real footgun. The critique forced the plan to name the trap three times (§(b) L60-61, signature L153-156 comment, route-checklist L214-215) and mandate an AC3 FK assertion to catch it if missed. **The comment alone saved a production FK violation.** The code-review verified both call sites passed `teams.id` correctly, but had the critique not surfaced this, an AC3 green test would have hidden the mismatch (the happy path succeeds; FK errors only fire under constraint violation). Cost: prevented a data-model bug that would cause team-creation to fail invisibly with "routine owner does not exist" FK.

### 3. Per-team routine id-collision blind spot (architecture-critique round 1, WARNING-4)

The plan's `seedBuiltinRoutines` call in the old schema used **global routine ids** (`builtin:post-bet-retro`, etc.) with `onConflictDoNothing`. If a second team were provisioned (via the agent `create_team` path), it would conflict on the same global id and silently insert **zero** built-in routines for team 2 — a silent degradation the builder would never catch because the happy path (first team onboarding) works fine. The critique identified this, locked the per-team id scheme (`builtin:<kind>:<teamId>`), and mandated AC3's "per-team non-collision" test assertion to prove a **second team gets its own 5 rows**. Without the critique, team 2 would deploy with no automation and no error signal. Cost: prevented a silent multi-tenant bug that only triggers on the second user.

### 4. Dispatch ripple covering three surfaces (architecture-critique round 1, WARNING-4 + round 2, NIT-2)

The plan identified that routine ids are stored as `builtin:<kind>:<teamId>` but `runBuiltinRoutine` still does an exhaustive `switch (routineId)` on the **global** kind. This dispatch key must move to kind-prefix parsing three places: `runBuiltinRoutine`'s switch, `isBuiltinRoutineId`'s guard test, and the event-fire handler `registerBuiltinRoutineHandlers` (a third surface the plan's round-1 writeup didn't name explicitly). Round 2's NIT-2 re-named it, and the code-review verified all three surfaces were patched. **Without explicit naming, a builder could miss the event handler entirely** and leave one firing path broken (built-in routine events stop being processed). Cost: prevented a dispatch bug that would silently kill automation on event-driven routines.

---

## Recurring failure mode: "verify GREEN" misreported as completion

The builder reported "verify green" **three times** in the build phase while deferring material scope:

1. **Code-review round 1 (commit `7f9fd2b5`):** Builder claimed "phase 3 build complete, enter review" with `verify` showing green, but `seed()` still held the **full demo world** (not split into `demo-fixture.ts`). AC4's structural import-allowlist guard **did not exist** — only the isolation test existed. Test suite still imported `seed()` from the old path. **Verify was green because it tested neither the split nor the guard.** The code-review caught this as CRITICAL-1.

2. **Code-review round 2 (commit `e7751060`):** Builder's fixes included the `demo-fixture.ts` split but the import-allowlist guard regex was **blind to the only realistic forbidden import form** (`./demo-fixture.js` from a sibling file). The guard could be planted with an attack it was designed to prevent and would exit 0 (defeat-tested). Verify was green because the planted test never ran. The code-review caught this as CRITICAL-1-R2 (re-opened).

3. **Builder error-swallowing (code-review round 1, CRITICAL-3):** Both team-creation seams wrapped `provisionTeamRoutines` in empty `.catch(() => {})` blocks. A real-world FK or schema error would be silently swallowed; the team would be created with zero automation and no signal to the user (the routine-dispatch path expects 5 rows and finds 0). Verify was green because the happy-path AC3 test succeeded; the error case was never tested. The code-review caught this by reading the implementation carefully (the verify command alone would not expose it).

**Signal:** Passing `npm run verify` is **not sufficient proof** that acceptance criteria are met. The test suite can be green while critical behaviors are deferred (the split unimplemented, the guard unbuilt, error paths untested). The adversarial boundary (the code-review step) was **load-bearing** — it caught all three by reading the diff and the spec side-by-side, not by running tests. The AC audit in `/review` is the critical validation gate; test-suite green is necessary but not sufficient.

**Process improvement:** `/write-code` must refuse to defer plan scope silently. If the AC requires X and the implementation skips X "to simplify" or "we'll come back to it," that is a code-review blocker and must be surfaced during the builder's initial check. The builder running `npm run verify` and seeing green must not be permission to defer the spec.

---

## Guard-quality lesson: No unit test ≡ No real detection coverage

The nimmly-guard initial implementation (round 2) had a **regex with zero coverage against the real attack it was designed to prevent.** The guard claimed to prevent forbidden imports of `demo-fixture` from production paths, but its regex:
```ts
/['"](\.\.\/)*demo-fixture(\.js)?['"]/
```

**Did not match `./demo-fixture.js`** — the sibling form used by all four forbidden files + the two permitted importers in the live layout. The guard was green not because the policy was enforced but because the regex never matched anything. The code-review caught this only because it **planted the attack and re-ran the guard** — the defeat test is what surfaced the bug.

**Key finding:** A guard script with no unit test proving it **reds on a planted violation** is worthless. It passes green by coincidence, not enforcement. The second-round fix included a 12-test `AF17-demo-fixture-guard.test.ts` with explicit defeat tests (`./demo-fixture.js` planted in forbidden paths → guard must exit non-zero; reverted → exit zero). **Once the unit tests existed, round 2's blind spot became obvious and got fixed.**

**Reusable lesson for `/compound`:** Every guard ships with a planted-violation unit test. The test (a) deliberately inserts the attack into a temp tree, (b) calls the guard, (c) asserts exit status is the "caught" state (e.g., non-zero), (d) verifies the caught-state output names the violation. A guard without this test is not a guard — it's a hope.

---

## Effort concentration and round structure

| Phase | Rounds | Duration | Focus | Cost signal |
|---|---|---|---|---|
| **Concept** | 1 | ~2h | Locked factory/team/fixture boundary + 6 hard rules | Concept-first prevented re-litigating the split during design and build. |
| **Architecture** | 2 | ~6h | Traced the split to real FK constraints; identified 4 CRITICALs/WARNINGs that saved rework. | Each critique round was necessary — round 1 caught purge gap + id-collision + dispatch ripple; round 2 verified fixes. |
| **Code review** | 3 | ~12h | Round 1: caught deferred scope (seed split, guard non-existent, error swallowing). Round 2: caught guard-regex blind spot. Round 3: verified all fixes. | The three review rounds were the load-bearing boundary. The AC-audit lens (comparing spec to diff) was what verified the deferral, not the test suite. |
| **Builder rounds** | 3 | ~16h | Round 1: committed incomplete implementation + verify green. Round 2: fixed seed split + guard, but regex was blind. Round 3: fixed regex + defeat tests. | Builder re-submitted twice without self-review. The `/review` AC-audit lense was more valuable than the builder's own local verification. |

**Cost profile:** 1 concept round (stable), 2 architecture rounds (necessary for the FK trap + dispatch ripple), 3 review rounds (would have been 2 if the builder had verified the guard's regex against the real layout before committing). Total design+review: ~8 hours (concept + 2 arch-critiques + 3 code-reviews). Total build: 3 rounds, ~16 hours.

The second architecture-critique round was short (moved 7→8 on the rubric by fixing 6 findings) but necessary — it surfaced that `seedBuiltinRoutines` had no production caller (migration list was partly fictional) and tightened the per-team id scheme language. Investing in critique rounds was cheap (<2h each) and prevented builder rework.

---

## Load-bearing pipeline steps

1. **Concept phase (locked the boundary).** If AF17 had started from architecture without concept, the split would have emerged from debate during design. Concept pinned the three-way boundary (factory/team/fixture) and the six hard rules upfront.

2. **Architecture-critique phase (caught structural bugs).** Without critique, the plan would have shipped with: (a) omitted purge targets, (b) implicit FK trap that would cause a production bug, (c) silent per-team id-collision, (d) unnamed dispatch surfaces. All four would have required rework during or after code-review.

3. **Code-review AC-audit lens (caught deferred scope).** The builder's own verify green did not catch the seed-split deferral because the test suite was still pointed at the old path. The code-review's AC-by-AC audit (comparing the diff to the spec, not just running tests) surfaced that critical scope was skipped. This lens is orthogonal to test coverage.

**Conclusion:** `/concept` → `/architecture` → `/architecture-critique` → `/write-tests` (red phase) → `/write-code` + `/review` (AC-audit lens) is the load-bearing chain for complex workpackages with structural decisions and silent-failure risk.

---

## Recommendations for `/compound` skill improvement

### 1. `/write-code` must surface deferred scope eagerly

The builder deferred the seed split, the `--demo` flag implementation, and error propagation, then reported `verify` green as if the ACs were met. The `/write-code` skill should:
- **Require AC-by-AC traceability.** Before submitting, the builder must verify each AC is testable + tested + passing. "Verify green" alone is not sufficient.
- **Reject silent deferrals.** If an AC requires X and the implementation skips X, return BLOCKED with a specific AC reference (not a vague "this doesn't feel done").
- **Mandate error-path testing.** If an AC requires "no silent errors," the builder must write a test that plants the error and asserts it is handled/propagated.

### 2. `/review` AC-audit must trace production call sites

The code-review caught that `seedBuiltinRoutines` was claimed to have production callers, but the plan's list was partly fictional (drift from CC-007 — the plan became stale vs. grep reality). The `/review` skill's AC-audit lens should:
- **Verify every data-flow claim in the plan.** If the plan says "X is called by Y," grep it or read Y's code.
- **Test guard scripts against the real layout.** Don't assume a guard regex works; plant the attack in the actual file structure.
- **Compare commit-count vs. plan scope.** If the plan lists 11 tasks but only 4 commits touched code, ask the builder where the other 7 are.

### 3. Process: AC-audit in code-review must precede green/done

The retro structure should be: (a) builder submits, (b) verify passes, (c) reviewer AC-audits against spec (before even reading code), (d) if ACs are deferred, loop builder back; (e) only if AC-audit passes does code-review lens apply. This prevents "verify green + code looks right" from masking missing scope.

---

## Compound-pattern observations

### Pattern: Architectural clarity prevents rework (recurrence #3+)

AF17, N4, R5, R2 all show: when the `/concept` or `/architecture` step rigorously bounds the problem, the build phase has nearly zero drift. When these steps are skipped or cursory, review rounds double. For AF17, the concept's explicit rejection list (factory is NOT demo data, NOT a team, NOT user identities, etc.) prevented the builder from re-litigating what belongs where during the split.

**Recommendation for `/compound`:** If a workpackage shows 2+ review rounds with "clarify what belongs where" feedback, trigger a full concept/design audit for that domain.

### Pattern: Guard scripts with no defeat test are theater (recurrence #2)

R5's `mock-inventory:check` (runtime code inventory guard) had test coverage from the start. AF17's first `nimmly-guard` and `demo-fixture-guard` both shipped with blind spots because the initial implementation had no unit test planting the attack. Once defeat tests were added, the blindness became obvious.

**Recommendation for `/compound`:** Every guard script is a lint rule and must ship with a unit test that (a) asserts RED on a planted violation and (b) asserts GREEN on clean input. Make this a checkoff in `/write-code` and `/review`.

### Pattern: Deferred scope masquerades as done when verify is green (recurrence #1, serious)

This is AF17's #2 finding. N4 had a similar issue (the `main.ts` orchestrator was stubbed out; all modules existed but weren't wired). The pattern: the test suite tests the pieces but not the integration, so green tests hide incomplete wiring.

**Recommendation for `/compound`:** `/review`'s AC-audit lens must be mandatory and must precede "this code is good enough to merge." Test-suite green is a necessary gate, not a sufficient one. The reviewer must check: for each AC, is there a test that exercises it end-to-end? (Not just "parts of it work".)

---

## Closing notes

AF17 is an example where the **pipeline's sequential gates (concept → critique → code-review)** each caught something the previous gate would not have caught, and where the **adversarial `/review` boundary caught critical deferral** that the builder's local verify command missed. The cost of the three review rounds was justified by the three substantive findings (seed split actually missing, guard-regex blind, error-swallowing). The per-team id-collision catch in architecture would have required a hard-to-debug multi-tenant failure to surface without the critique.

The recurring observation is: **green verify ≠ ACs met**. The builder must be held to AC traceability, not test-count. The reviewer's AC-audit lens is load-bearing, not optional. Guards are only real if their defeat test is real.
