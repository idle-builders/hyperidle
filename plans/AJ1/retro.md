# AJ1 Retro — TSX is the single design source of truth

**Workpackage:** AJ1 (Track AJ). Complexity L.  
**Timeline:** 2026-06-14 to 2026-06-15 (~22h active).  
**Pipeline Phases:** Design/concept (1 no-op) → Critique (2 rounds) → Red/Green (1 cycle + 3 fix commits) → Review (3 rounds) → DONE.

---

## What Worked Well

1. **Architecture critique was exceptionally thorough (Phase 2, 8.5/10 across 2 rounds).** 
   - Round 1: identified both load-bearing wiring gaps (bun-in-CI, discoverStories-in-Node) that would have made AC2/AC4 vacuous.
   - Round 2: verified every claim against the tree — selectors, config shape, node runtime context.
   - No surprises in review; the approved plan's wiring was sound.

2. **Design-it-twice forced honesty about the cross-platform risk (§Central decision, Option A's trade-off).**
   - Risk was named, not hidden: "Mac-blessed PNGs vs Linux-CI render may exceed 5%."
   - Plan included explicit "canonical capture platform: CI/Linux is the blessing authority" mitigation (§Canonical capture platform, lines 109-117).
   - This framing made the platform question visible and gave builder concrete guidance — yet guidance was not followed (see Cost Signals below).

3. **TDD red phase caught the vacuous-gate hole indirectly.**
   - Red phase: test asserted "every catalogued component has a baseline" (coverage guard).
   - Would have been caught at green-phase if builder had run the test and read the detailed `@lore` comment.
   - Red phase did not force its own reading (the hole was silent `continue` rationalized by wrong `@lore` logic) — but the *structure* was correct.

4. **Two-review model (critique + code review) was necessary and sufficient.**
   - Critique found structural gaps (wiring, enumeration, platform risk).
   - Code review found execution gaps (vacuous gate, wrong platform blessing, incomplete marker assertions).
   - Neither alone would have caught all findings; critique→code review sequence is sound.

---

## What Cost Avoidable Cycles

### Cost Signal 1: Vacuous-gate silent skip (AC2 regression, caught in review round 1)

**What happened:** The new visual-regression gate shipped with a silent `continue` that skipped 39 of 69 catalogued components (57%) without assertion. 34 components had zero committed baselines, including 7 primitives (`Avatar`, `Button`, `EmptyState`, `Skeleton`, `Toast`, `TabBar`, `Progress`) that the retired gate explicitly protected. AC2 ("every catalogued component protected") was vacuous in CI.

**Root cause:** A race condition in the hash-route SPA navigation loop: `networkidle` resolves instantly (no network request for hash routes), then `waitForTimeout(300)` is insufficient for React to re-render the new route's `.demo-section`s before `.count()` reads 0. Non-deterministic across machines/load.

**Why it shipped green:** The test's `if (sections.length === 0) { console.warn(...); continue; }` pattern is a *silent* failure mode. The gate passed locally, CI was green (because skipped components produce no assertion), and the coverage floor test (`catalogCount > 25`) passed regardless.

**Cost:** 1 entire review round (round 1) + 1 fix commit (d2f66bd9) + replay through round-2 validation. ~2-3h of work.

**Avoidance opportunity:**
- **The architecture plan (§AC2, line 183) already specified the verification method:** "Playwright gate (`ds:sync`). Red-phase proof: builder deliberately restyles one component, runs gate, asserts it FAILS naming that component." This scenario would have forced the gate to enumerate and assert every component.
- **Or: The red-phase test itself could have run the gate locally and inspected its output** (baseline counts, skip counts) instead of just asserting the test syntax compiles.
- **The `@lore` comment rationalizing the skip was wrong** and should have been questioned during review: "needs Router context" is not true for `Avatar`, `Button`, `EmptyState`, etc. which render fine in isolation. A more careful @lore review or a pre-commit lint against misleading comments could have caught this.

**Better process:** The red phase should have included a local run of `ds:sync` to spot-check coverage — not just test syntax validation. Or, the code review's vacuity-detection should be automated via a coverage regression guard (which round 2 added, but it was missing in round 1).

---

### Cost Signal 2: Cross-platform baseline blessing error (AC4 regression, caught in review round 2, fixed in round 3)

**What happened:** Builder blessed all 342 baselines on **macOS** (local machine), committing the Mac-rendered PNGs. When CI (Linux runner) ran the visual gate, 1 baseline failed with a dimension mismatch: `AI2/DialogPortalRoot` rendered 160px on Mac but 161px on Linux. The `maxDiffPixelRatio: 0.05` only covers per-pixel color diffs on same-size images; dimension mismatches bypass the tolerance entirely. CI was red.

**Root cause:** The builder did not follow the plan's explicit instruction (plan §Canonical capture platform, lines 109-117):
> "CI/Linux is the blessing authority. Baselines are Linux-rendered; local `verify` on a Mac tolerates the Linux baselines (and vice-versa)."  
> "Commit to ONE canonical capture platform: CI/Linux is the blessing authority … Never commit Mac-rendered PNGs as canonical, and never raise the 5% ratio to absorb a platform delta."

The plan also created `.claude/rules/visual-regression.md` with the same rule, and added explicit `@lore` comment to `playwright.config.ts` documenting the canonical platform.

**Why it was missed:** The architecture plan's round-1 critique (WARNINGs section) flagged this exact risk as "the plan's own mitigation may force a choice between a red CI and a weakened gate" and recommended "commit to ONE canonical capture platform: CI/Linux is the blessing authority." The builder read the approved plan (round-2 critique has no disagreements on this section) but did not implement the mitigating step during Task 3 ("Bless initial baselines — on/for Linux").

**Cost:** 1 full review round (round 2, discovering the failure) + 1 fix commit (64c40794 re-blessing on Linux) + 1 verification round (round 3, checking the Linux baselines). ~3-4h of work.

**Avoidance opportunity:**
- **The plan's language was explicit, not vague.** It said "never commit Mac-rendered PNGs as canonical" — unambiguous.
- **But the plan was written by the designer, not the builder.** The builder may not have read the "Canonical capture platform" section in detail, or may have assumed "just bless locally" was simpler.
- **A pre-commit checklist for Task 3 could have caught this:** "Baselines are named with their platform stamp or blessed in the CI container?"
- **Or: The Task 3 verification requirement should have been runnable locally ("Docker run `mcr.microsoft.com/playwright:v...` && npm run ds:bless && check dimensions match CI")** rather than deferring to CI at Task 12.

**Better process:** Task 3 should have included a mandatory pre-verify check: "Bless baselines on Linux (CI container or Docker image), commit them, then verify locally on Mac that the 5% ratio tolerates any sub-pixel drift on Mac." Deferring the validation to CI green at Task 12 was too late — the fix is commit-and-wait-for-CI at that point.

---

### Cost Signal 3: Plan-to-execution deviation on the cross-platform risk (missed process signal)

**Observation:** The architecture critique (Phase 2) **explicitly flagged the cross-platform risk as the highest and provided a mitigation** (canonical-platform decision). The approved plan reified this decision in the text. Yet the builder, who received and presumably read the approved plan, made the decision that introduced the exact risk the plan tried to mitigate.

**Why this matters:** It is not a technical surprise or an ambiguous spec. It is a process signal: even with an explicit, plan-level instruction on a flagged risk, execution deviated. This suggests:
1. The plan's critical sections may not be read thoroughly by the builder (or read but not internalized).
2. Or: The builder prioritized simplicity ("just bless locally") over the plan's canonical-platform constraint.
3. Or: The builder expected "Task 12 validation" to catch it, unaware that CI-red forces a re-bless instead of a pass.

**Better process:** Either (a) the builder should have a pre-task checklist that explicitly calls out each Phase-2-critique WARNINGs and how it is being handled, or (b) the plan's critical mitigations should be stated as executable checks (e.g., "before committing baselines, verify they have Linux timestamps" or "bless in Docker, not locally").

---

## Concrete Process/Skill Improvement Candidates

### Top 3 Candidates (for `/compound` pattern detection)

1. **CC-001: Vacuous-gate anti-pattern — silent failure modes in gate assertions**
   - **Pattern:** A test/gate that uses `if (condition) { console.warn(...); continue; }` to skip non-fatal cases is a silent-regression mode. The gate passes green even if 57% of the claimed coverage is missing.
   - **Testable change:** The `/review` skill should have a linter rule: *"any gate or test with a 'skip/continue' path must have an explicit guard assertion (allowlist + floor test) that prevents silent growth."* Spot-check any visual/regression test with `continue` for an allowlist + guard.
   - **Precedent:** This WP added CRITICAL fix (d2f66bd9) with deterministic wait + allowlist + coverage-floor guard — the right pattern. `visual-regression.test.ts:293-318` now has `ALLOWLIST_SIZE === 2` guard + `covered >= catalogCount - ALLOWLIST_SIZE` floor. Apply this pattern retroactively to any gate that skips.

2. **CC-005: Plan-critical mitigations must have pre-task execution checklists**
   - **Pattern:** A Phase-2 critique flags a risk (e.g., "cross-platform baseline drift is the highest risk"). Plan includes explicit mitigation. But builder, seeing the plan, does not execute the mitigation. Root: the mitigation is stated as a principle ("canonical platform is Linux") not as a testable, pre-task action ("before Task 3, confirm baselines are blessed in the Linux container").
   - **Testable change:** The architecture plan's "Risks / blockers" section (line 243) or the ordered task list should include one-line checkpoints for each CRITICAL or top-3 WARNING. Example for this WP:
     - Task 3 checkpoint: "Baselines blessed on Linux (CI container or `mcr.microsoft.com/playwright:v<version>`) — verify via file timestamps, commit the Linux PNGs."
     - Task 3 gate before progress: "Run locally on Mac and confirm `ds:sync` tolerates the Linux baselines at ≤5%."
   - **Precedent:** Round-2 code review explicitly called out the platform error as a "CRITICAL-2" blocker. The fix (re-blessing on Linux) solved it. Preventing the error would require the plan's Task 3 to state the checkpoint, not just the principle.

3. **CC-008: E2E/visual verification discipline — no visual changes without pixel validation**
   - **Pattern:** Recurring across this WP: visual verification is deferred or incomplete. E.g., `npm run ds:sync` was not run locally before submission. W2 WP notes "npm run ds:sync not run as part of verify … AC-4/AC-5 marked PASS but pixel diff never measured."
   - **Testable change:** The `/verify` command (or pre-commit hook) should enforce: *"if any `.tsx` story file or component is modified, `npm run ds:sync` must pass locally before the branch is pushed."* Or: add `npm run ds:sync` to the verify chain as a mandatory step, not optional, when design-system changes are present.
   - **Precedent:** This WP added `ds:sync` to the verify chain (root `package.json`). But on initial submission, the builder did not run verify fully. Enforce via hook or CLI gate.

---

## Summary

**Phases that went well:**
- Concept (no-op, correct).
- Critique (2 rounds, thorough, flagged real risks, approved plan was sound).
- TDD red phase (test structure was correct, coverage guard added in round 2 fix).

**Phases that cost cycles:**
- Green phase (silent vacuous-gate shipped locally).
- Review round 1 (vacuous-gate caught).
- Review round 2 (cross-platform blessing error caught, required re-bless + round 3).

**Cost avoidance themes:**
1. Silent-skip patterns in gates need explicit allowlist + floor guards (not just `console.warn`).
2. Plan-critical mitigations need pre-task execution checklists (not just principle-level statements).
3. Visual regression verification needs to be mandatory in the verify chain (not deferred to CI).

**Timeline efficiency:**
- Total: ~22h active (6/14–6/15).
- Design/concept: 0h (no-op).
- Critique: 2h (2 rounds, fast parallel review).
- Red/green: 6h (test + feat + 3 fix commits).
- Review: 14h (3 rounds, vacuous-gate + cross-platform blessing + re-validation).

The 3 fix commits (d2f66bd9, 64c40794, a16460e7) would have been avoidable with better pre-task discipline on the two cost signals. Review round count (3) is high because the cost signals were execution errors, not design errors — and review had to catch them.

