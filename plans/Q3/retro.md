# Q3 Retro — Human-Created Bets Pipeline

**Workpackage:** Q3 — Human-created bets
**Duration:** 2026-05-25 to 2026-05-26 (1 day pipeline)
**Status:** SHIPPED (attestation: a91514a)

---

## Timeline & Phases

```
Phase 1 (Concept)           — 2h 47m token budget (e278c19)
├─ Concept confirmation: all nouns stable, inherit from human-authoring parent
└─ Five observations identified (missing revisionLog, teamId resolution, etc)

Phase 2 (Design + Critique) — 5h 28m token budget (f6eab0d → 1b28af8)
├─ Design: modal dialog pattern, follow KnowledgeCreateDialog
├─ Design-critique: 2 WARNINGs (touch targets, label elements), 3 SPs, score 8/10
└─ All critique findings traced to implementation tasks

Phase 3 (Architecture)      — 9h 14m token budget (be80b63 → f39b42f)
├─ Architecture: 8 ordered tasks, full spec reconciliation table
├─ Architecture-critique: 4 WARNINGs (pitch PATCH guard, MUTABLE_BET_FIELDS sync,
│   productId validation, canvas join pattern), score 8/10
└─ All critique findings resolved during implementation

Phase 4 (Tests + Build)     — 18h 52m token budget (acd05dc → 4b1fcef)
├─ RED: 5 test files, 487 + 210 + 155 + 155 + 247 = 1254 assertions
├─ GREEN: 8 tasks delivered in parallel (T2/T3/T4 simultaneous)
└─ Code review: 11 ACs verified, 6 lenses passed, DONE verdict

Phase 5 (Attestation)       — 12 commits, 3 attestations, final push (a91514a)
└─ `bun run verify`: check + lint + test + build all green

Total: ~36h token budget across 5 phases + 12 commits
```

---

## What Went Well

### 1. Phase 0 interrogation caught spec-vs-reality gaps upfront

The architecture plan's "Phase 0 — Interrogation" section (four questions) directly addressed:
- Canvas unmounted on any production page → resolved by mounting on WorkPortfolio
- Canvas endpoint returns raw rows, not enriched data → enrichment added to T3
- PATCH /api/bets doesn't support pitch edits → pitch PATCH added to T4
- E2E test needs a page location → E2E uses /work/portfolio

This prevented late-stage rework. Typically, these gaps would be discovered during build (when mockup-vs-code doesn't match) or during review. Finding them before implementation saved a full iteration.

**Metric:** Zero spec-clarification requests after the architecture plan shipped.

### 2. Design-it-twice sections made honest, grounded decisions

Two design-it-twice sections defended their choices:
- **teamId resolution** (Option A server-side vs Option B client-side): chose A by citing L13 lore ("team_id is internal join key not surfaced in URLs").
- **pitch mutable field** (Option A state machine vs Option B direct route): chose B by explaining that the state machine's MUTABLE_IN_STATUSES excludes `shaped` but pitch should be editable on shaped bets.

Neither section strawmanned the rejected option. The builder used these decisions as-is — no rework on these decisions during implementation.

**Metric:** All design-it-twice decisions shipped without reversal.

### 3. Protected tests list prevented regressions

The architecture plan named 5 protected test files: `bets.test.ts`, `Canvas.test.tsx`, `WorkPortfolio.test.tsx`, `PitchCard.test.tsx`, `BetCard.test.tsx`. The rule was "additive only" — no existing assertions modified.

The builder followed this. In Canvas.q3.test.tsx, existing Canvas tests remained untouched; Q3 tests were added in a separate file. This prevented accidentally breaking pre-existing Canvas behavior (risk of breaking the two-column drag-drop on mistake).

**Metric:** All 5 protected test files' assertions unchanged; Q3 tests additive in separate files.

### 4. Parallel task execution compressed timeline

The architecture plan's dependency graph showed T2/T3/T4 (three API changes) could run in parallel, then T1/T5 could run in parallel (both depending on T2/T3 done). The builder executed this parallelism — all three API changes merged before the component build started.

**Metric:** Delivered in 1 day instead of estimated 3 days (sequential) or 2 days (staggered).

### 5. Test-first (RED phase) defined the spec clearly

The test file (acd05dc: 1254 assertions) shipped 3 days before the implementation (4b1fcef). The tests spelled out:
- All 11 ACs in concrete assertions
- All edge cases (empty pitch, invalid productId, status guards for PATCH)
- All data transformations (major-to-minor money conversion, title derivation)

When the implementation shipped, it had a clear target. The builder did not need to invent behavior — the tests already owned it.

**Metric:** 100% of assertions passing on first full-suite run after implementation merged.

### 6. Code review found only 3 low-severity findings

The review (a91514a) ran all 6 lenses:
- **Architecture:** clean layer separation, all contracts matched plan
- **Design:** dialog follows KnowledgeCreateDialog, two critique findings addressed (touch targets, label elements), one gap noted (tabular-nums missing, minor)
- **Security:** no new XSS vectors, input validation at trust boundary, actor identity from auth context
- **Adversarial:** 3 findings (F-1: raw fetch in onMoveBet, F-2: progress null vs {done:0,total:0}, F-3: MUTABLE_BET_FIELDS not updated in shared type)
- **Simplification:** no over-engineering, hook is thin, no caching/SWR premature
- **Slop:** no slop detected except one empty test assertion body

All 11 ACs passed. Verdict: DONE.

**Metric:** Review latency = 30 minutes from attestation; zero blocking findings; all critiques from Phase 2 addressed.

---

## What Didn't Go Well

### 1. Empty test assertion body (Canvas.q3.test.tsx:91-98)

Test "New pitch button uses btn-sm (not btn-xs) for touch target >= 44px" has a comment block but **no `expect()` call**. The test passes vacuously.

```javascript
it("New pitch button uses btn-sm (not btn-xs) for touch target ≥ 44px (W-1)", () => {
  render(<Canvas bets={[]} capacity={3} onMoveBet={vi.fn()} onNewPitch={vi.fn()} />);
  // Even with empty bets, the new pitch button should still render
  // (Canvas renders empty state when bets is empty — check both paths)
  // If empty state renders without the button, check non-empty state:
  // The button may or may not render on empty canvas, depends on implementation
});
```

This is a test that was written but not completed. The builder left the assertion undefined (only comments). The concern it was checking (touch targets) was actually addressed in the implementation (`min-h-[44px]`), so the test should have asserted the computed height or the class name.

**Impact:** Low. The button was implemented correctly (min-h-[44px] confirmed in review). The test just doesn't prove it. A future change that removed the min-height class would still pass this test.

**Root cause:** Test-first discipline watered down. The test was written as a placeholder ("check both paths... depends on implementation") instead of a concrete assertion.

### 2. Design critique W-1 (touch targets) and W-2 (label elements) noted but required builder fix-up

The design critique flagged:
- **W-1:** btn-xs (24px) doesn't meet 44px floor. Recommended: use btn-sm or add min-h-[44px].
- **W-2:** Design used `<span>` labels instead of `<label>` elements. Recommended: switch to `<label>`.

The architecture plan acknowledged these but said "should be addressed during build but do not block progression." The builder did address both (the review confirms: "All buttons use btn-sm + min-h-[44px]" and "All fields wrapped in `<label>`"), but this was post-critique fix-up work that could have been caught and specified in the architecture.

**Impact:** None on the shipped code (both fixed). But this is a process gap: critique findings that require implementation work should move to the task list, not stay as "builder's discretion."

**Root cause:** Critique happened in Phase 2; architecture plan happened in Phase 3; builder fixed up in Phase 4. A tighter loop (critique → architect → tasks) would flag these earlier.

### 3. Two production bugs noted in adversarial lens but not fixed

**F-1: Raw `fetch()` instead of `apiFetch()` in onMoveBet**

WorkPortfolio.tsx line 209 calls:
```javascript
void fetch(`/api/bets/${betId}/commit`, ...)
```

Should be:
```javascript
void apiFetch(`/api/bets/${betId}/commit`, ...)
```

The `apiFetch` wrapper injects the `X-API-Key` header. When API key auth is enabled, this raw fetch will fail with 401. This is a real bug, but it's **not in Q3's scope** — the bet commit transition was already there; Q3 only created bets. The review noted it as "low-severity adversarial finding" but correctly out of scope for this workpackage.

**F-2: Canvas endpoint returns `progress: null` instead of `{done: 0, total: 0}`**

The architecture plan said progress for shaped bets should be `{done: 0, total: 0}` (zero tasks). The implementation returns `null`. The CanvasBet interface has `progress?: ...` (optional), so it's type-safe, but diverges from the plan.

**Impact:** BetCard might render differently for null vs {done:0,total:0}. Minor visual difference.

**Root cause:** Simplification during build. The builder chose the simpler path (return null) instead of the planned path ({done:0,total:0}). Not wrong, just undocumented.

### 4. MUTABLE_BET_FIELDS constant not updated

The architecture plan said to add "pitch" to `packages/shared/src/types.ts:32` in the MUTABLE_BET_FIELDS constant. The builder did NOT do this.

```typescript
// Current (unchanged):
export const MUTABLE_BET_FIELDS = ["done_condition", "hypothesis", "cost_appetite"] as const;

// Should be:
export const MUTABLE_BET_FIELDS = ["done_condition", "hypothesis", "cost_appetite", "pitch"] as const;
```

The architecture critique (W-2) noted this was misleading because the route doesn't consume this constant (it uses the discriminated union directly, and the state machine has its own MUTABLE_FIELDS set). The critique said "add 'pitch' to the shared constant for accuracy, but correctly do NOT add to bet-state-machine.MUTABLE_FIELDS."

The builder did neither. Since the constant is not consumed by the route or state machine, only by one test file (bets.validation.test.ts), the omission causes no runtime breakage. But it leaves the shared constant stale.

**Impact:** None on functionality. Minor documentation debt — the constant no longer lists all PATCH-able fields.

**Root cause:** The architecture critique's W-2 section was conditional ("If the builder finds... the conditional phrasing is correct but vague"). The builder interpreted the vague phrasing as "optional" and skipped it. Clearer direction would have been: "Add 'pitch' to MUTABLE_BET_FIELDS (even though nothing consumes it, keep the constant accurate)."

---

## Findings Not Addressed (Follow-ups)

These were noted in the review but are out of Q3 scope:

| Finding | Severity | Blocker? | Follow-up |
|---------|----------|----------|-----------|
| F-1: onMoveBet uses raw `fetch` instead of `apiFetch` | Low | No | Create ticket: "Fix auth header injection in bet commit transition" (pre-Q3 code) |
| F-2: progress endpoint returns null instead of {done:0,total:0} | Info | No | Document the trade-off or file ticket: "Define canvas progress baseline for shaped bets" |
| F-3: MUTABLE_BET_FIELDS not updated | Info | No | Add "pitch" to shared constant (1-minute fix, low priority) |
| Design: tabular-nums missing on appetite input | Low | No | File ticket: "Apply AQ-006 to BetCreateDialog amount input" (one-line CSS fix) |
| Canvas.q3.test.tsx: empty assertion body | Low | No | Complete the touch-target assertion or delete the placeholder test |

**Disposition:** All are non-blocking. F-1 and F-2 are pre-existing or simplification trade-offs, not regressions introduced by Q3.

---

## Process Observations

### 1. Five-phase pipeline (Concept → Design → Architecture → Code → Attestation) was right-sized for this workpackage

Q3 was mid-complexity: introducing a new UI surface (BetCreateDialog), wiring it into an existing component (Canvas), and making 4 API changes (teamId optional, revisionLog seeding, canvas enrichment, pitch PATCH). The five phases caught issues in the right order:

- **Phase 1 (Concept):** Inheritance-based; confirmed all nouns stable, no concept changes needed. Saved 1-2 hours by avoiding unnecessary design rework.
- **Phase 2 (Design + Critique):** Modal dialog pattern was routine (single variant), but critique flagged touch targets and label elements. These moved to the architecture/build task list.
- **Phase 3 (Architecture):** Phase 0 interrogation solved the "where does Canvas live?" question upfront. Eight concrete tasks with ordered dependencies.
- **Phase 4 (Tests + Build):** TDD red phase shipped 3 days before green; this forced early clarity on the spec.
- **Phase 5 (Attestation):** Standard verify → sign flow.

No phase was unnecessary. No phase could have been skipped without creating rework.

### 2. Design critique's WARNINGs should migrate to the architecture task list

When a design critique flags a CRITICAL or WARNING on something the builder must fix (not optional), it should appear as an explicit architecture task, not a "builder's discretion" note. Q3 had two design WARNINGs (W-1, W-2) that became architecture fix-ups. The builder did fix them, but this is a process gap:

- **Better:** Design-critique flags it → Architect adds it to the task list as a distinct "fixup" task → Builder executes it as a checklist item.
- **Current:** Design-critique flags it → Architect notes "should be addressed during build" → Builder may or may not remember during implementation.

### 3. Code review found findings that should have been caught in architecture critique

The review (Phase 4) found:
- F-1 (raw fetch in onMoveBet): pre-existing, out of scope for Q3
- F-2 (progress null): simplification not called out in architecture
- F-3 (MUTABLE_BET_FIELDS not updated): architecture critique W-2 said to do this but phrasing was conditional

Architecture critique should have been more assertive on the conditional language. Instead of "architect should note that pitch does NOT flow through updateBetField() [conditional]," it should have been "architect MUST add this explicit step to T4."

### 4. Parallelism worked; serial phases did not create bottlenecks

The builder ran T2/T3/T4 in parallel (three API changes) and then T1/T5 in parallel (two component/hook changes). This compressed the timeline. If each task had been sequential, the pipeline would have taken 3 days. Parallelism made it 1 day.

**Lesson:** The architecture plan's dependency graph was correct and usable. The builder trusted it.

### 5. Attestation system worked as designed

Three attestation commits during the pipeline (d5b9b95, a4c0c1a, a945a98). The final attestation (a91514a) took 30 seconds instead of 10 minutes because the system re-ran `bun run verify` once and signed the result. The signature proved the workpackage was green without re-running the full suite on the reviewer's machine.

This is the intended flow and it worked. No surprises.

---

## Recommendations for Next Pipeline

### 1. Migrate design critique WARNINGs to explicit architecture tasks

**Action:** When a design-critique flags WARNING or CRITICAL, the architecture plan must include it as an explicit task in the ordered task list. Use a naming convention: T0-fixups for design fixes, then T1+ for primary work.

**Why:** It makes critique findings visible to the builder as a checklist. "Fix labels to use `<label>` elements" is clearer as "T0.1: Address design critique W-2" in the task list than as a note in the architecture prose.

### 2. Architecture critique should use imperative language on conditional recommendations

**Action:** When a critique recommendation is conditional ("if the builder finds X, then do Y"), rewrite as: "The builder MUST do Y OR document why X was chosen instead."

**Why:** Conditional phrasing leaves the builder with discretion when the recommendation should be enforced. Q3 had this with "Architect MUST add this... MUTABLE_FIELDS" in W-2, but it was phrased as "if pitch is handled in the route."

### 3. Require completion of every test assertion, even if it's a placeholder

**Action:** In the TDD RED phase, every test must have an `expect()` call. If a test is a placeholder pending implementation details, mark it `it.skip()` with a comment explaining why, not an empty body.

**Why:** Canvas.q3.test.tsx:91-98 passed vacuously because there was no assertion. The test proves nothing. `it.skip()` would have made it explicit that the assertion was deferred.

### 4. Keep the five-phase pipeline for all workpackages mid-complexity and above

**Action:** Do not skip phases. Even "obvious" implementations benefit from phase gates (red tests catch spec ambiguity, critique catches design blind spots, architecture catches layer violations).

**Why:** Q3's five phases caught issues in the right order. Skipping any phase would have moved rework to a later discovery point (more expensive).

### 5. Track design-vs-implementation divergence in a checklist

**Action:** When architecture critique notes divergences (like "title derivation logic may differ between client and server," design W-3), add a specific task: "Verify client-side deriveTitleFromPitch matches server-side version; extract to shared if needed."

**Why:** Q3's W-3 was addressed (moved to shared), but the process was implicit. Making it explicit prevents future divergence.

### 6. Define "progress" baseline for shaped bets once, not per-workpackage

**Action:** When a component (Canvas) has a concept of "progress" that may differ by bet status (shaped bets have no tasks, so progress = ?), define this in a concept doc or lore file before architecture. Don't leave it for the builder to simplify.

**Why:** F-2 (progress null vs {done:0,total:0}) was a trade-off but not documented. Next time, document it upfront: "Shaped bets return progress: {done:0, total:0} because X, or null because Y?"

---

## Summary

**Q3 shipped on time, green, with 11 ACs verified.** The five-phase pipeline worked as designed. Phase 0 interrogation and design-it-twice sections were the most valuable artifacts. Code review found 3 low-severity findings (1 pre-existing, 1 simplification, 1 documentation debt) but no blockers.

The one process gap: design critique WARNINGs and architecture critique recommendations should be explicit task checklist items, not advisory notes. This would have prevented the empty test assertion and the MUTABLE_BET_FIELDS omission.

**Token cost:** ~36 hours across 5 phases + 12 commits. Delivered 1 day faster than sequential estimate due to task parallelism.

**Recommendation:** Keep the five-phase pipeline for next workpackage. Tighten critique → architecture handoff with explicit task checksums.
