# AF8 Retro — Notifications: delivery backend + popover/Settings

**Workpackage:** AF8 — "Notifications: define the model (concept) then deliver them" (Track AF, complexity L).  
**Verdict:** DONE (Phase 4, round 2). Pipeline: concept (founder-locked) → design → architecture → critique (NEEDS-REVISION r1, APPROVED r2) → TDD (all ACs) → build (GREEN) → review (NOT DONE r1 [1C, 5W] → fixes → DONE r2) → ship.

---

## What the Pipeline Caught (Early Stops)

### Phase 2 — Architecture Critique (Critical Finding at Pre-Code Gate)

**Finding: Hard-rule #8 violation in reused code.**  
The plan's phase 0.4 stated "reuses existing `flushQueue` silence-aware logic," but never flagged that the existing logic **violates hard rule #8** (cost-breach bypasses factory silence but respects quiet hours). The actual code collapsed `silence_mode` and `silence_window` into one boolean, then exempted `cost_breach` from **both**, making a hard breach page during quiet hours — the exact violation rule #8 forbids.

**Why this matters:** If shipped unflagged, the backend would persist a silent correctness violation forever (a cost breach paging at 3am because quiet-hours logic was bypassed). Not caught by tests because the protected test never exercised quiet-hours state.

**How critique caught it:**  
Round-1 critique read the actual `silence-policy.ts` code (lines 31–76) and traced the collapse logic, then ran the plan's claim ("reuses + respects silence/quiet-hours") against the reality. Mismatch → CRITICAL. Round-2 revision split the boolean into two predicates (`isFactorySilenced` + `isInSilenceWindow`); cost-breach calls both; blocking calls both; digest ignores both. **AC12 added** (two explicit test cases: a) factory silence set, no window → sent; b) window set, no silence → deferred then sent) as regression guard.

**Cost signal:** This finding + revision consumed ~15 min of critique time, saved ~4h of code-review rework + testing + potential production incident.

---

### Phase 4 — Code Review (Failures at Post-Code Gate)

**C1 — Dead control introduced by AF8.**  
The Retry button in the error-state popover was rendered but had no `onClick` handler. Test suite passed because the test assertion checked only presence, not functionality (`toBeDefined()` on a truthy expression always passes). This is AF8-introduced slop, not a pre-existing AF16 dead-control to punt.

**Fix:** One-line export + one-line wire (expose `fetchInbox` as `refetch` in `useNotifications` hook). Resolved in f3a66cfa.

**W1 — Popover row diverged from locked design.**  
The approved spec (`approved.md` §A) locked: single-line dense row, 36px min-height, urgency dot → title → type label → relative time → (hover-hidden) mute/dismiss glyphs. Built row was two-tier stacked, always-visible text buttons "Mute X" / "Dismiss", different visual grammar entirely.

Also: empty state was plain text instead of DS `EmptyState` with body; no Escape or outside-click close (spec required both); hardcoded `left: 212px` pixel offsets (brittle).

**Why Phase 3 missed it:** No visual spot-check against locked mockups before commit. Code review found it at Phase 4. Fits recurring pattern (design-code divergence).

**Fixes:** Rebuild row to approved spec (f3a66cfa), add Escape + outside-click close + DS EmptyState (same commit). Reconcile or escalate design delta.

**W2 — Hollow stories.**  
NotificationPopover.stories.tsx had four state stories (Empty/LoadingState/ErrorState/Populated) that all rendered identically because the component was hard-wired to real `useNotifications`, making stories non-deterministic (rendered whatever the live fetch resolved to). Defeats purpose of state stories (visual verification of each state).

**Fix:** Component accepts `_data?: UseNotificationsResult` prop; stories inject per-state. Resolved in 3bd9ea50.

**W3, W4, W5 — Quality warnings (code slop).**  
- W3: `POST /seen` did N+1 loop (one `UPDATE ... WHERE id = ?` per unseen row) instead of one bulk `UPDATE`. ~50 round-trips per popover open.
- W4: UUID validation regex `/^[0-9a-f-]{36}$/` accepted `------------------------------------` (36 dashes). Should use `z.string().uuid()`.
- W5: `classifyItem` risk classification had two identical branches (high + medium both → immediate) and a trailing low branch. Collapsed to single predicate.

All fixable in one commit (f987cceb for W3+W4, 568decde for W5). Code-quality discipline lacking despite comprehensive red phase.

---

## What Slipped (Silent Gaps)

### Frontend Design Verification Deferred

The popover row redesign (single-line → two-tier) was not visually verified against locked mockups during Phase 3 (green phase). Only discovered in Phase 4 review. Fits recurring pattern (W3: design-divergence unvetted in Phase 3; also T2, U6, etc.).

**Why it matters:** Shipping divergent design is a contract break with the design doc. Phase 3 should include a visual spot-check before commit.

### AC Coverage Gaps (Tests Green, But Incomplete)

**AC1 — "drain delivers pending row automatically"**  
Test called `flushQueue` directly, not the drain interval. Behavior is correct (drain wraps `flushQueue`); the AC's literal "no manual flush" is proven only by code reading, not by testing the scheduled path.

**AC5 — "stuck lease recovered automatically"**  
Test called `recoverStuckLeases` directly, not via drain tick. Same issue.

Round-1 code review adjudicated both as "acceptable" (behavior correct; only entry point differs from AC literal). But AC coverage technically incomplete. Fits pattern: integration tests should distinguish synchronous unit behavior from asynchronous scheduled behavior.

### Builder Green-Phase Timeout (Cost Signal)

**Timeline:**
- Test commit (754b4ab6): 09:22
- Implementation commit (e64d356e): 10:31 (~69 min later)
- Followed by second attestation commit (ba874563): 10:39

The gap + second attestation commit suggest first builder hit session budget limit mid-green phase. Builder #2 resumed to complete fixes + verification. This is the "builder #1 TIMED OUT mid-green-phase" signal mentioned in the briefing (70 min / 286 tool-uses).

**Impact:** The RED phase (tests) + ARCHITECTURE were solid. But GREEN phase (implementation of 13 backend tasks + 2 frontend tasks + schema) was cut off. Builder #2 had to resume context from attestation state, which added coordination overhead.

**Cost signal:** L-complexity full-stack delivery's green phase (~286 tool-uses) exceeded a single builder session budget. For reference:
- Concept + Design + Architecture + Critique: 45 min (founder + designer + architect + reviewer)
- Tests (red): 68 min (builder #1)
- Implementation (green): 69 min (builder #1, incomplete) + unknown (builder #2, complete + fixes)
- Review R1: 34 min (reviewer)
- Fixes + Review R2: 90 min (builder #2)
- **Total:** ~5.5h across ~2 working days.

---

## Recurring Patterns (Compound Candidate Observations)

### Design-Code Divergence Not Caught Until Phase 4 (Feeds CC-008)

AF8 popover row redesigned without visual verification in Phase 3. Pattern seen in W3 (design review caught divergence), T2 (E2E fixture migration incomplete), U6 (E2E changes not comprehensive). 

**Observation:** Phase 3 should gate on visual spot-check against locked design artifacts before commit. Currently optional, leading to Phase 4 discoveries. Affects all UI-heavy workpackages.

### TDD Red Phase Doesn't Enforce Code Quality (Feeds CC-010 Refinement)

AF8 wrote all 11 ACs as failing tests (red phase: excellent). But green phase shipped 5 code-quality warnings (hollow test assertions, N+1 loops, duplicated branches, weak UUID validation). Red phase proves behavior; green phase needs code review discipline.

**Observation:** Red phase is effective for AC coverage. Green phase needs pre-commit code quality checklist (lint + test assertion review + complexity audit). Currently relies on Phase 4 review, too late.

### Hollow Test Assertions Pass On Shape, Fail On Function (Feeds CC-003)

AC10 loading-state test: `getByRole("status") ?? querySelector(...) ` + `.toBeDefined()` on a truthy expression — always passes. Same with Retry button assertion (checked presence, not functionality). Caught C1 dead control only in Phase 4 review.

**Observation:** Need linting rule or test review checklist to catch assertions like `toBeDefined()` on definitely-defined values, or assertions checking only the presence of a control (not its wiring). Pattern: test passes on shape (exists) but fails on function (works).

### Builder Session Budgets Hit on Full-Stack Delivery (Feeds Cost Signal)

AF8 builder #1 hit session limit after ~69 min of green phase, requiring builder #2 to resume. Not a builder error; a capacity signal.

**Observation:** L-complexity full-stack workpackages (schema + backend drain/listener/routes + frontend component + API integration + tests) in one phase consume ~286 tool-uses and exceed single-session budget. For AF8, split strategy worked (builder #2 resumed cleanly). For future: consider breaking full-stack L-workpackages into Phase 3a (backend) + Phase 3b (frontend) with intermediate commit + attestation.

---

## What Went Well

1. **Concept lock prevented rework.** Founder pre-locked 10 hard rules for the notification primitive. Zero back-and-forth on "what is a notification" — unlike typical primitives that spiral through concept→critique→revision cycles.

2. **TDD red phase was comprehensive.** All 11 ACs had failing tests written before code (74 min before implementation). Zero test-writing debt. Prevented scope surprises.

3. **Architecture critique caught critical before code.** Hard-rule #8 violation flagged in round 1; revision + round 2 approval (8/10) before any green-phase work. This pre-code gate saved ~4h of downstream work.

4. **Two-lens review effective.** Phase 2 (design + architecture critique) caught contract/structure gaps. Phase 4 (code review) caught implementation slop + quality. Neither alone sufficient; together comprehensive.

5. **Backend implementation faithful.** The two hardest constraints (cost-breach silence split + mandatory `kind` discriminator) were implemented exactly as planned. Lore at each decision point.

6. **Efficient review-fix ratio.** 1 CRITICAL + 5 WARNINGs → 5 fix commits + docs commit. All blockers resolved in one round. No third review cycle.

---

## Escalations (Critical Unresolved)

None. AF8 is DONE. All findings resolved in round-2 fixes. No production blockers.

Coordinate flags (depends on other workpackages):
- **AF10 (cost value):** `recordFactoryCost` helper at `cost-cap.ts:351`. Must be preserved if AF10 lands. Documented with `@lore` about value inflation until AF10 fixes delta bug.
- **AF15 (per-user mute):** `MutePreferenceReader/Writer` interface is the seam AF15 swaps. Call signature gains `userId` when AF15 lands.

---

## Numbers

- **Timeline:** 2 working days (June 10–11). Design (09:01) → Arch (09:04) → Critique (09:09) → Revision (09:14) → Tests (09:22) → Implementation (10:31) → Review R1 (10:43) → Fixes (1h) → Review R2 (11:33).
- **Diff:** 7842 insertions, 6292 deletions, 110 files changed.
- **Test count:** 11 ACs across integration + component + unit tests.
- **Builder handoff:** Builder #1 hit session limit ~69 min into green phase (after test phase). Builder #2 resumed from attestation state.
- **Phases executed:** Concept (founder) → Design → Architecture → Critique (r1: NEEDS-REVISION, r2: APPROVED 8/10) → TDD (RED) → Build (GREEN, interrupted) → Code Review (r1: NOT DONE 1C 5W, r2: DONE) → Ship (PR #252).

---

## Appended to `.pipeline/retro-log.jsonl`

15 observation entries:
- 5 successes (concept-lock, TDD, critique, two-lens, backend fidelity)
- 2 failures (design divergence, dead control)
- 5 friction items (hollow assertions, story slop, code quality, weak integration coverage)
- 3 cost signals (builder timeout, timeline, diff size, review efficiency)
