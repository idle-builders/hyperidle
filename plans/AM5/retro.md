# AM5 Retro (Fresh-Context, 2026-06-26)

**Workpackage:** AM5 — Standardized artifact-view family + open/routing contract

**Context:** One unusually long founder-iterated pre-build cycle (20/50 commits in concept/design/architecture) followed by a large, clean build. Shipped in one PR (#369).

---

## What Went Well

### 1. Extract-Over-Invent Discipline Converged the Model

The founder repeatedly halted design with "STOP, we have this already" and forced extraction instead of invention:
- Block-payload layer → base primitives (no new layer)
- Existing two-split splits (chat + review) → unified SplitView (no new architecture)
- NO new kind-renderers (collapse AE6's `kinds/*-renderer.tsx` layer)

**Payoff:** The final model is smaller, reusable, self-consistent, and verified to unify Artifact(single) / Review(diff) / Block(mixed) on the same base-primitive foundation. The discipline worked, even though it required 20 commits to converge.

### 2. Collapse/Purge/Fold Delivered Real Unification

Not a refactoring pass; a **purification**:
- `kinds/*-renderer.tsx` layer (AE6) was **deleted** (not kept parallel)
- KPI and Sparkline were **extracted** from old `data-renderer.tsx` as genuine new base primitives
- Diff-core was **separated** from content (pure `code` → `{path,text,lang}` with no diff baked in) and placed as a DS foundation
- SplitView was **unified** (3 existing divergent splits → 1 canonical fold primitive)
- Verified inverse: Review composition *builds* a diff from two pure-`code` instances (not stored in preview)

**Evidence:** Landed correctly in build phase with no diff-core rework except the consumer-wiring fix.

### 3. TDD Red-Phase + Task-Boundary Commits Enabled Clean Review

Build phase (Phase 3) was 9 clean task commits (T1-T9):
- Each commit: test red → code green → snapshot bless
- Task boundaries = logical subsystem units (primitives → schema purge → arch collapse → split reconcile → routing seams → cleanup wiring)
- One code-review catch (T2 diff-core unwired at round 1) → fixed in T9 rework → NO cascade

**Payoff:** Code review was surgical and effective; the rework didn't explode into a multi-round slog.

### 4. Design-System Foundation Re-Placement Unlocked the Unification

Moving diff-core and base primitives LOW (`packages/design-system`) instead of keeping them web-local (per-surface `kinds/*-renderer.tsx` layer):
- Broke the "two-home" bottleneck (foundation can't unify Artifact/Review/Block if the diff is web-local)
- Enabled Review to *import* the DS diff foundation and add only chrome (PR header, file bands, approve/reject), not re-implement content-rendering
- Made the base-primitive vocabulary visible and reusable across boundaries

**Payoff:** The three compositions (Artifact / Review / Block) now share the canonical rendering family.

---

## What Created Friction & Cost

### 1. Model Reshaped MANY Times by Founder Iteration During Pre-Build

Eight model iterations, each requiring rework:
- `Kind` vocab layer → collapse (kinds are just `text|code|image|data|html|url`, no custom layer)
- `kinds-vs-blocks` split → merge (both compose the same base primitives)
- `data` kind (monolithic) → split into Table + KPI + Graph
- `Kind` purity (states lived in Kind) → retract (states belong to Composition, not content)
- `Representation` as a runtime enum → remove (three compositions, not a generic pattern)
- `SplitView` (design wanted a new component) → extract existing splits (founder override)
- Two-floating-layers styling → iterate on Hearth semantics 3 times (design refinement)
- Three per-composition SplitView stories → collapse to one unified story (reconcile divergent chat/review splits)

**Root cause:** Concept was not locked before Phase 2. Design started with an unlocked model; founder had to iterate it in-flight across 20 commits. Human-design-review approval came at the very end (2026-06-26), AFTER 3 critique loops, not before.

**Cost:** 20/50 total commits (40% of branch weight) in concept/design/architecture phases when the model cost, not the build cost, dominated.

### 2. Design Phase Repeatedly Produced Things That Had to Be Reworked

Evidence of "invent first, extract later" instead of "extract first, invent only if missing":
- Authored SplitView stories for each composition (Artifact/Review/Block separately) → collapsed into 1 unified story (2 design commits reworked)
- Extracted KPI and Sparkline stories → re-bound them to their composition in T4/T5 (consumer wiring not planned at design time)
- Designed 6×3 Kind-Representation matrix → retracted when founder said "Representations don't exist at runtime" (design invalidated by model change)
- Designed per-surface split implementations (chat-style, review-style) → unified in T6 (didn't ask "are these the same split?" before designing variants)

**Root cause:** No "extract before invent" validation at design time. Designers produced variants first, checked for reuse second. The design-critique skill flags this, but the design phase doesn't enforce it as a pre-sketch gate.

### 3. Designer Falsely Claimed Authored Stories

Commit messages like `concept+design(AM5): author KPI + Sparkline stories` implied these were part of the locked concept, but they were actually design-time extractions. This created timeline confusion ("Did the founder lock KPI at concept time, or did the designer extract it in Phase 2?"). 

**Root cause:** Concept lock wasn't an explicit gate; design and concept kept iterating together across many commits.

### 4. Diff-Core Was Built-But-Unwired

- T2 committed `diff-core` as a standalone DS component with snapshot stories
- T9 (7 commits later, just before review) wired it into the review page via `getDiffRenderer` selector
- Code review Round 1 (88ef8ff3) caught the gap: "K2b diff-core unwired + red lint"
- Fixed in 9b6db8d7

**Root cause:** The architecture plan didn't enumerate the consumer story for the diff-core primitive. The wiring was implicit ("review will use it") not explicit ("review page must call getDiffRenderer and compose its output"). The snapshot tests were green; the integration test was delayed until the consumer was refactored.

### 5. Viewer-Worktree Mismatch During Build

The live viewer served stale main-checkout files for a stretch during build. Slowed feedback on design changes (Hearth layering, SplitView refinements) and required manual fixes.

**Root cause:** Worktree lifecycle management, a known pattern from CC-005 retros. Pre-build iterations to the Hearth model would have caught this feedback loop earlier.

---

## Cost Signals

**Commit distribution:**
- Concept phase: 1 commit (lock)
- Design phase: 11 commits (3 re-dispatches + rework)
- Architecture phase: 8 commits (3 re-plans + must-fixes)
- Critique (founder-loop, embedded): 3 passes
- Human-design-review: 1 approval (very late, after rework)
- Build phase: 9 clean task commits + 1 code-review catch + 1 rework fix = 11 commits
- Review phase: 2 commits (round-2 re-review)

**Dominant cost:** Pre-build model iteration (20/50 = 40% of branch). The architectural model cost, not the implementation cost.

**Critique loops:** 3 full founder-feedback cycles before human-design-review approved (2026-06-26). Model was not locked in advance; it converged through iteration.

---

## Process & Skill Improvement Candidates for `/compound`

### CC-004 (Wiring Gap) — Confirmed, New Instance

Diff-core is a textbook case: isolated component tested green, consumer integration deferred to T9, caught at code review. 

**Proposed fix extension:** When the architecture plan introduces a new primitive/foundation, it must enumerate every **known downstream consumer** that will import it in Phase 3. If the consumer wiring is deferred (e.g., "review page will wire diff-core in T9"), it must be listed as an explicit must-wire item in the architecture's Phase 3 task list, not left implicit.

### CC-022 (Component Reuse Drift) — Emerging, 3 New Instances

Design said "reuse existing SplitView" (the two existing splits in chat and review), but 3 design commits proposed NEW SplitView variants before settling on extract. The "extract before invent" check happened AFTER design, not before.

**Proposed fix:** Add a pre-sketch extraction audit to the `/design` skill. Before sketching any new component/primitive, the designer greps for:
1. Similar renders in the codebase (existing splits, existing stat renderers, etc.)
2. Lists 2-3 reuse opportunities or explicitly marks "no existing parallel"
3. Cites file:line for each candidate

Paired with a Explore agent sweep if the search space is large. Prevents "invent first, extract second" pattern.

### NEW: CC-029A (Model Lock Before Design Phase) — Emerging

AM5's 20-commit pre-build cycle happened because the concept model was not locked before Phase 2 started. Design and architecture iterated the model in-flight across founder feedback.

**Proposed fix:** The `/concept` skill must produce a founder-locked concept.md before the design phase begins. This requires an explicit founder sign-off step (reads concept doc + approves model + signs `.pipeline/progress/<id>.json`). Design phase CANNOT start without a locked concept. If the concept needs to change during Phase 2, it's a scope change requiring a new re-plan commit, not a silent re-iteration.

**Decision needed:** Is this a founder-manual gate, or does `/concept` skill include a "wait for founder approval" step?

### NEW: CC-029B (Extract-Before-Invent at Design Time) — Emerging

Pattern observed across 3 design re-dispatches: designs were produced without checking if the patterns already existed. KPI and Sparkline were discovered to be extractions *after* they were designed. SplitView variants were designed before asking "are these the same component with different content?"

**Proposed fix:** Add "extract audit" to the `/design` skill as a pre-sketch gate. For every component the design introduces, the designer must grep and cite existing renders that could be reused. This is already a `/design-critique` flag; the fix is to make it a **design-time requirement**, not a review-time catch.

---

## Validation

**Shipped PR:** #369, branch `concept/AM5-artifact-view-open-contract`
**Commits:** 50 total (20 pre-build, 30 build+review)
**Diff:** 105 files, +6445/−2677
**Tests:** All green (red→green at task boundaries)
**Review:** 2 rounds (1 catch → 1 fix → DONE)

**Artifacts locked:**
- `docs/human-interface-layer/open-contract.md` — routing + fold contract
- `docs/process-layer/artifact-primitive.md` — base primitives, compositions, hard rules
- `.pipeline/progress/AM5.json` — scope lock, approved plan, task list
