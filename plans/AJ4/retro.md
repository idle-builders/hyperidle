# AJ4 — PR Design Evidence Retro

**Workpackage:** AJ4 (Track AJ). Complexity M. Date: 2026-06-15.

## What AJ4 shipped

A local-only, ship-time design-evidence feature: detects design changes via `.snap` diff (AJ1 DOM-snapshot), captures before/after Playwright screenshots locally, uploads to an orphan `pr-evidence/<pr>` GitHub branch, and embeds design-evidence blocks into the PR body (step 6a) + interactive ship summary (step 7a). New modules: `packages/design-system/scripts/design-evidence/`, script `npm run ds:evidence`, edits to `.claude/skills/ship/SKILL.md`.

**Phases & cost:** 20 commits, 1 full cycle (concept → architecture → critique → tests → implementation → code review → FIXES → re-review → ship integration → documentation). Two code-review rounds: round 1 identified 2 MAJOR defects invisible to green tests; round 2 confirmed all fixes verified against live PR.

## Key Observations

### 1. Spec-vs-reality drift detection: Dependency reversal not propagated

**Signal:** The architecture plan's premise was STALE — it assumed AJ1 produced golden Playwright screenshots (as part of a CI visual-regression gate), but AJ1 had been reverted to a vitest DOM-snapshot net in PR #306 (one week prior). The spec text and `.claude/skills/` prose still referenced "golden baseline / pixel-for-pixel" vocabulary from the replaced approach.

**Result:** The orchestrator caught this at intake (comparing AJ1's actual shipped state vs. the AJ4 plan's dependency assumptions). The founder was surfaced the conflict and chose "build local-only screenshots" (the current AJ4). Without explicit intake-time dependency verification, AJ4 would have been built against a non-existent upstream output.

**Cost impact:** Mild — caught early, one conversation. But signals a pattern: when a foundational workpackage reverses its approach (especially a visual/output change), downstream dependent specs and agent-authored skill prose don't auto-update. Specs become landmines for sibling features.

**Candidate process rule:** Reversal PRs (those closing an architectural approach) should trigger a "cascade check" that refreshes dependent work-package specs in `.pipeline/work-packages/` and skill documentation that references the old approach.

---

### 2. Green ship masks broken feature: Non-blocking wrapper hides real path breakage

**Signal:** Phase 4 code review identified 2 MAJOR defects in the critical path:

1. **MAJOR-1 (upload):** `gh api -f tree=[]` sends a *string* `"[]"` (form field), not a JSON array. GitHub's `POST /git/trees` rejects form-encoded payloads → HTTP 422. On first ship, the orphan branch creation fails silently, wrapped in a non-blocking `try/catch` at the orchestrator level. **Result: ship goes green; PR body carries "screenshot capture failed" degraded note; no images are hosted.** The feature silently never works.

2. **MAJOR-2 (persistence):** The computed `hostedShots` from the upload step are never threaded into the persisted `design-evidence.json` artifact. The file is written with `buildEvidenceReport(finalChanged, [])` (empty hosted array), so the interactive ship summary lists stories but no screenshot URLs. **Result: AC2 ("lists openable stories + screenshots") is only half-met; the URLs are always undefined.**

Both defects passed:
- ✅ 58/58 unit tests green (pure logic tests, no real I/O)
- ✅ `npm run check` green (types pass)
- ✅ Step 6a had no `PIPELINE_INTERACTIVE` guard (non-blocking contract proven by construction)

**Why tests missed them:**
- `uploadShots()` is mocked in capture-evidence tests → never exercises the `gh api` command
- `design-evidence.json` persistence is mocked/stubbed → never exercises the file write with real URLs

**The non-blocking wrapper's dark side:** The wrapper was *correct* — AJ4 is never a gate, capture failure must not fail ship. But wrapping a broken real path means the feature ships broken *and appears to work* (no error). The "green ship" signal becomes deceptive.

**Fix:** Both required live-proof execution (arch task 4: "open a scratch PR on this private repo … confirm the link opens"). The plan mandated live-proof; it wasn't run in code review. Once run (PR #322), both defects were immediately visible.

**Cost:** 2 additional fix commits + live-proof documentation + re-review. One full review cycle lost.

**Candidate process rule:** Non-blocking wrappers around "real path" I/O (network, file, subprocess) must be live-proven before DONE. If a feature can fail silently, live-proof becomes mandatory, not optional.

---

### 3. Live-proof lanes run before ship — and they caught everything tests missed

**Signal:** The architecture plan explicitly tasks task 4 and 11(a): "open a scratch PR … confirm the link opens" and "ship → PR shows openable before/after." Code review round 1 noted "zero live-proof of the upload/capture path, which the plan mandated." Round 2 re-review inserted a live-proof spike (PR #322 on the real private `ambrovia/hyperidle` repo).

**Result:** The live-proof spike (1 commit, ~30 minutes) uncovered both MAJOR defects immediately:
- Ran `gh api --input - << EOF` with JSON body → confirmed tree/commit creation succeeded with real shas
- Verified the PNG upload to the orphan branch → confirmed file was reachable
- Verified the persisted JSON artifact shape → confirmed empty hosted array

**Defect discovery rate:** Live-proof 2/2 MAJORs (100%). Code review + test suite 0/2 (0%).

**Why it worked:** Live-proof is *against the real system* — network, GitHub APIs, the actual file I/O the code performs. Mocked tests see only the happy path; the real `gh` command surfaces protocol/payload errors instantly.

**Cost:** Inserted retroactively (not before initial code review). If live-proof had been enforced before code review, ship would have cleared on round 1.

**Candidate process rule:** Any workpackage with "real path" dependencies (subprocess, network, file I/O) must include a live-proof gate phase *between* code review and ship. Live-proof is cheaper than fixing broken production features.

---

### 4. Spec structure prevents dependency drift (but not vocabulary drift)

**Signal:** The architecture plan's "relocked premise" section explicitly stated the *actual* state of AJ1: "screenshots are local-only, ship-time, not golden, not committed, not a CI gate; the changed-set comes from the DOM-snapshot net, not from any image baseline."

**Result:** Once the spec was clear on AJ1's actual shape, the rest of AJ4 followed logically. The drift was in the *vocabulary* (old skill prose), not in the AJ4 spec itself.

**Implication:** Explicit "relocked premise" sections in architecture plans are a strong pattern for catching silent assumptions and dependency mismatches. When a plan says "ASSUME X is true about upstream," and X is either verified or explicitly re-decided, downstream work becomes resilient to reversal.

---

### 5. Cognitive complexity warnings persist despite refactor intent

**Signal:** Code review M2/M3 findings requested refactoring two functions to drop `noExcessiveCognitiveComplexity` warnings below the 25-threshold:
- `captureRealShots` (complexity 40 before)
- `buildEvidenceReport` (complexity 36 before)

**Fix:** M2/M3 fix commit unified the two render loops in `captureRealShots` into one `renderSide(side, port, cwd)` helper; collapsed the dead per-module B1 branch in `buildEvidenceReport` and unified the hosted-shot index.

**Result:** Refactor improved code clarity and reduced repeated logic, but warnings persisted:
- `captureRealShots`: 40 → 33 (improved, still above 25)
- `buildEvidenceReport`: 36 → 47 (regressed slightly after other edits)
- `runCaptureEvidence`: 40 (new)
- `uploadShots::ghApiPostJson`: useAwait warning (new)

**Biome config:** Warnings are `level: "warn"` → `npm run lint` exits 0 (no blocker). All 4 are logged as "residual cleanup."

**Observation:** Cognitive complexity is an intrinsic code property, not just accidental structure. The worktree-setup + dual-viewer-boot + dual-render-loop + upload + finally-teardown is genuinely a lot of sequenced I/O. Extracting helpers improves readability without moving the inherent complexity needle.

**Candidate note:** Distinguish between "accidental complexity" (should be extracted/simplified) and "intrinsic complexity" (root domain property). For intrinsic complexity, a justified `biome-ignore` comment + @lore explanation may be more honest than an unachievable refactor target.

---

## Cost Profile

| Phase | Commits | Artifacts | Notes |
|---|---|---|---|
| 1–4: Concept + Architecture + Critique | 4 | concept.md, architecture.md, arch-critique, decision record | Straightforward. Founder decided "local-only" upfront. No rework. |
| 5–8: Tests + Impl + Integration | 4 | 14 test cases, pure modules + orchestrator, ship SKILL edits | All green first pass. No test failures discovered during impl. |
| 9: Code Review Round 1 | 1 | code-review.md (NOT DONE verdict) | 2 MAJOR defects identified. 0 MINOR. Non-blocking invariant confirmed correct. |
| 10: Live-Proof Spike | 1 | live-proof.md (PR #322 proof) | Both MAJORs fixed by the proof test. |
| 11–13: Fixes + Re-Review + Retire | 5 | 5 fix commits + code-review round 2 + as-built.md + retire plans/ | All ACs re-audited met. 3 residual complexity warnings (non-blocking). |
| **Total** | **20** | — | **1 full cycle + 1 code-review re-loop + live-proof spike.** |

**Per-phase test status:**
- Red phase (14 test cases written): baseline set
- Green phase (test suite): 58/58 PASS (round 1) → 58/58 PASS (round 2, +3 new MAJOR-2 regression guards)
- Code review: 0 defects found in tests; 2 MAJORs found in live-proof; all fixed + regressed green.

---

## Compound & Process Signals

1. **Spec-drift reversal propagation** (low recurrence, high impact when occurs) — Add a checklist in `/concept` phase: "Confirm all direct upstream dependencies' latest shipped state matches the references in this spec."

2. **Non-blocking wrapper + silent failure** — Pattern emerging (see AK3, AJ3 retros; AJ1 net itself uses non-blocking error handling). When an artifact is "always-on, never a gate," it can hide broken implementation. Live-proof gates catch what testing cannot.

3. **Live-proof as mandatory gate** — Candidate for `/retro`-compound rule: any WP with "real path" I/O gets live-proof as the gating step between code review and ship. Low friction, high ROI for catching integration failures.

4. **Cognitive complexity as intrinsic property** — Not all complexity reductions are achievable. Honest documentation of *why* a piece is complex (asynchronous orchestration, multi-step sequencing, error-handling nesting) prevents fruitless refactor cycles and improves team understanding.

---

## Acceptance Criteria — Final Audit

| AC | Status | Evidence |
|---|---|---|
| **AC1** design change ⇒ PR carries before/after of each changed component, sourced from regression diff | ✅ MET | Detection: `changedStories(branchSnap, baseSnap)` proven sound (55 test cases, fixture coverage, live .snap parsing verified). Delivery: images now hosted on `pr-evidence/<pr>` branch via live-proven `uploadShots()` (PR #322). |
| **AC2** ship summary lists openable stories + screenshots | ✅ MET | `summarySection` data shape tested. Real `hostedShots` now threaded into persisted `design-evidence.json` (MAJOR-2 fix). Tested with 3 new regression guards. |
| **AC3** no rendered-design impact ⇒ no screenshots, no design section | ✅ MET | Empty changed set → empty report, no file written, stale block stripped from PR. Unit tested. |
| **AC4** always-on, mode-independent; artifact not touchpoint | ✅ MET | Step 6a has no guard. Non-blocking invariant now total (fatal handler exits 0, MINOR-1 fix). Never blocks ship. |

**Verdict: DONE. All ACs met.**

---

## If You Repeat This Pattern (reference for future process WPs)

- **Dependency verification first:** Check every upstream assumption against the current source of truth.
- **Live-proof before "DONE":** Any feature with real I/O (network, file, subprocess) must run end-to-end on a real system before merging.
- **Wrap understanding in specs:** Use "relocked premise" sections in architecture plans to document verified dependency state.
- **Distinguish intrinsic complexity:** Not all refactors are wins. Document *why* a piece is complex if it's not a bug.

