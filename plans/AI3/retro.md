# Retro: AI3 — One clock

**Date:** 2026-06-13  
**Workpackage:** AI3 (One clock — unified time-rendering vocabulary)  
**Commit:** d152db98

## Pipeline overview

| Phase | Sessions | Tool uses | Key events |
|---|---|---|---|
| Phase 1: Design | 1 | ~80 | Single-table vocabulary ratification; no mockup |
| Phase 2: Critique | 2 (Round 1 CRITICAL + replan, Round 2 APPROVED) | ~150 | Critical ESLint rule undeliverable; split enforcement redesigned |
| Phase 3: Red/Green/Gap | 3 | 258 (gap-closure) + 215 (green) | 84 red tests; 17 migrations + 2 deletions; E2E mock-shape bugs |
| Phase 4: Review | 1 | 29 | 1 WARNING (AC-1 proof incomplete), 4 NOTES, DONE verdict |
| **Total** | | **~750** | |

## Top 3 observations

### 1. Architecture critique Round 2 model — split-enforcement redesign (CC-009 pattern)

**Finding:** Phase 2 Round 1 flagged the ESLint rule as CRITICAL undeliverable — a syntactic ban on "date-difference arithmetic for display" would false-positive on 6 legitimate sort/group/timer sites with no AST-distinguishable difference from formatting arithmetic.

**Resolution:** Critique prescribed split enforcement: (a) deliverable static gate bans Date-receiver `toLocale*` calls + dead-import paths (AST-expressible), (b) unprovable relative-arithmetic half routes to review-checklist + AC-3 E2E. Builder incorporated split verbatim into revised plan + code. No rework.

**Impact:** Zero defects in final product. Demonstrates the two-phase model (Phase 2 critique → Phase 3 code → Phase 4 review) catching load-bearing issues earlier than code review alone. Saves a code-review + fix cycle (~6h). Confirms CC-009 "architecture critique finds patterns code review misses."

**Files:** `plans/AI3/architecture-critique.md` (Round 2 section), `plans/AI3/architecture.md` (§"AC-2/AC-5 static gate (split)")

---

### 2. E2E fixture-shape iteration cost (CC-007 pattern)

**Finding:** Gap-closure session (after green-phase green test run) consumed 258 tool uses — highest per-session cost. Root: E2E spec mocks for threads, message shape, session activity shape all needed fixes after initial implementation. Builder had to iterate on fixture mock shapes rather than getting them right in red phase.

**Pattern evidence:** 
- Red phase designed tests against the data contracts (AC-1 label agreement, AC-3 invalid fallback).
- Green phase implementation + E2E mock setup revealed shape mismatches (resolvedAt field, Message.createdAt vs timestamp, activity entry structure).
- Gap-closure session = one full iteration of E2E mock fixes.

**Cost signal:** The fixture-shape patterns (`/api/threads` response, Message schema, activity log entry structure) deserve explicit enumeration in the architecture phase (like the migration table for AC-2). Architect could have seeded fixtures.ts with expected shapes before red-phase test writing.

**Impact:** 2 additional commits (fix commits). Adds ~4h to pipeline. Pattern-detection-candidate for `/compound` — this is the 3rd+ fixture-shape iteration friction (matches T3, T5 pattern per retro log).

**Files:** `plans/AI3/architecture.md` (§"Test plan" AC-1 note on fixture seeding — mentions `fixtures.ts` but not shape contract), `packages/web/e2e/time-vocabulary.spec.ts` (lines that seeded/override core endpoints)

---

### 3. AC-1 proof coverage gap caught by code review (low severity, pattern signal)

**Finding:** AC-1 acceptance criterion specifies "≥4 surfaces incl. work pages". Initial proof captured 3 (thread list, knowledge list, notification popover). Work-page surface (WorkTask/WorkBet) was migrated correctly but not proven in the AI3 side-by-side screenshot or E2E assertion.

**Resolution:** Code review flagged as WARNING (spec names 4, proof shows 3). Builder added surface-4 (WorkTask) screenshot + E2E assertion in follow-up commit. Closure: 2h, cheap.

**Why it happened:** Proof was captured mid-implementation; surface-4 existed post-implementation but wasn't included in the curated screenshot set. No process gate enforced "verify AC requirements match proof artifacts."

**Impact:** Low — the work-page sites ARE correctly migrated (same single source guarantees correctness by construction); the gap is proof coverage, not code correctness. Suggests future AC completeness audit should verify all *named surfaces* have evidence (screenshot OR E2E assertion OR both), not just "there are 4 surfaces."

**Pattern:** Matches T5 (AC2 unproven) and U11 (E2E execution proof absent from attestation). Indicates `/review` checklist should explicitly verify AC-proof mapping.

**Files:** `plans/AI3/review.md` (WARNING section), `plans/AI3/proof/surface-4-work-task.png` (added in follow-up), `packages/web/e2e/time-vocabulary.spec.ts` (AC-1 describe block updated)

---

## Cost signals & process notes

| Signal | Magnitude | Category | Recommendation |
|---|---|---|---|
| **E2E fixture-shape iteration** | 258 tu in one session | High | Architect: enumerate fixture request/response shapes in architecture.md §"Test plan" (library pattern) |
| **AC-proof mapping gaps** | AC-1 warning, caught late | Medium | /review checklist: verify all named AC surfaces have explicit proof (screenshot/E2E assertion) |
| **Cross-surface label-agreement assertion** | E2E checked presence, not equality | Low | Pattern for future time/language workpackages: use `expect(surface1Label).toBe(surface2Label)` not just `not.toBeEmpty()` |
| **Design-vs-architecture hour-cycle parity** | Design framed R3 as "parameterized by precision"; architecture added hour-cycle param | Low | Future time-formatting: design table should call out all parameterizations (precision, hour-cycle, locale) explicitly |

---

## Success patterns confirmed

1. **TDD red phase effectiveness** (CC-010): 84 tests written before code; all green on first run. Zero test-writing debt, all ACs locked.
2. **Two-phase model** (critique + code review): each phase caught different gap class (critique: structural/undeliverable, review: proof coverage). Neither redundant.
3. **Migration table load-bearing** (completeness): 17 sites enumerated + verified; grep sweep = 0 residual; 100% coverage.
4. **Lore discipline**: 4 load-bearing decisions captured (@lore AI3 comments). No filler. Effective for future agent onboarding.
5. **Architecture reconciliation section**: pre-implementation spec-vs-reality audit (plan §"Plan reconciliation") prevented mid-stream surprises. Clean plan-to-code mapping.

---

## Retro log appended

Observations added to `.pipeline/retro-log.jsonl`:
- 1 success (critique Round-2 split-enforcement model)
- 1 success (E2E fixture reuse pattern effectiveness)
- 3 successes (TDD red phase, migration table, lore)
- 2 frictions (AC-1 coverage gap, E2E assertion specificity)
- 1 gap (design-vs-arch hour-cycle parameter naming)
- 1 cost signal (fixture-shape iteration, CC-007 pattern)
- 1 observation (lore effectiveness)

Total: 9 observations, 1 new cost pattern identified for `/compound`.
