# Z2 Retro — Getting Started Journey

**Date:** 2026-06-05  
**Status:** DONE  
**Verdict:** Documentation workpackage completed with full pipeline discipline. Hallucination risk for documentation was higher than expected and caught at code review.

---

## Cost Signals

**Pipeline phases executed:**
- Phase 1 (Concept): 1 pass — terminology alignment, 5 minor inconsistencies found
- Phase 2 (Design): Skipped (documentation workpackage, no UI variants)
- Phase 3 (Architecture): Skipped (documentation workpackage, no technical plan)
- Phase 4 (Review): 2 cycles — 1 CRITICAL + 3 MAJOR + 3 MINOR issues in Round 1, all fixed in Round 2
- Phase 5 (Retro): 1 session

**Commits:** 3 logical + 1 retro = 4 total  
**Files changed:** 1 (docs/guides/user/getting-started.md)  
**Lines added/removed:** +1486 / -0  
**Review rounds:** 2 (1 critical, 3 major findings → all fixed → DONE)  

**Estimated token cost:**
- Concept phase: ~8K tokens (terminology audit + 5 inconsistencies)
- Writer phase: ~12K tokens (1370-word guide, basic documentation task)
- Review Round 1: ~15K tokens (detailed critique + 7 findings)
- Review Round 2: ~8K tokens (fix verification)
- **Total: ~43K tokens**

---

## What Went Well

### 1. Concept Phase Caught Terminology Misalignments Early
The concept screening proved its value even for documentation. Phase 1 identified 5 minor but real inconsistencies in the source docs that could have propagated into the guide:
- Missing `the-rail.md` file (workaround: describe inline)
- Capitalization inconsistency (factory vs Product Factory)
- Stale density toggle reference
- Comment thread vs thread naming
- Artifact view ambiguity

All were flagged upfront, preventing the writer from perpetuating broken references.

### 2. Canonical Terminology Table Was Load-Bearing
The concept phase produced a tabular contract of exactly what names to use. This contract was explicit and auditable. The review found that the writer followed it correctly for all 8 core terms tested (Product, Team, Bet, Task, Session, Agent, Knowledge, Sidebar).

### 3. Review Process Caught Fabrication Immediately
The hallucination risk (builder making up UI that doesn't exist) was real and present. But the two-lens review model worked:
- Round 1 reviewer read the guide and caught 7 issues where description didn't match code.
- Round 2 re-review verified fixes against the actual codebase (`WorkPortfolio.tsx`, `Sidebar.tsx`, `SetupFlow.tsx`, etc.).

No fabricated content made it to the published guide.

### 4. Writer Followed Architecture After Fixing
The writer's Round 2 fixes showed good codebase reading discipline. All fixes were verified against actual source files with line-number references. For example:
- Step 5: "Sidebar (left, 200px wide)" verified against `Sidebar.tsx line 164`.
- Step 4: Blocked message for browser users verified against `CredentialsTab.tsx line 367`.

---

## What Went Wrong

### 1. Builder Hallucinated UI That Doesn't Exist (CRITICAL)
**Problem:** Round 1 found that the guide described:
- A "Canvas" view (does not exist)
- A "Kanban board" (does not exist)
- Drag-and-drop functionality (does not exist)
- Keyboard shortcuts A/R/X (do not exist)
- A "done condition" field in bet creation (does not exist)

**Why it happened:**
The builder was familiar with typical project management UI patterns (Kanban, drag-and-drop, keyboard shortcuts) but did not read `WorkPortfolio.tsx`, `BetCreateDialog.tsx`, or the shortcut definitions before writing. The "expected" pattern (Kanban boards for work tracking) overrode the "actual" pattern (simple grid of bet cards).

**How to prevent it:**
1. **For documentation of UI components:** Require the writer to grep the codebase for the component before writing about it. Mandate at least one direct code reference per major UI surface described.
2. **Document review requirement:** Any guide describing the interface must cite source files. Use a checklist: "For each UI surface described, list the source file (e.g., WorkPortfolio.tsx line 106)."
3. **Architecture skip risk:** Skipping /architecture for doc workpackages means there's no pre-written list of "surfaces to describe." For feature docs, this could be dangerous. Recommend: even for docs, run a lightweight architecture phase (5-10 min) that enumerates which components/files to read.

### 2. Major Terminology Misfire: "Icon Rail" vs "Sidebar" (MAJOR)
Round 1 found that the guide described "Icon Rail (left sidebar)" but the actual component is `Sidebar.tsx`, not an icon rail. The concept phase had flagged "Icon Rail" as the canonical name in the terminology table, but this turned out to be wrong for the actual UI.

**Root cause:** The concept phase relied on `docs/process-layer/the-five-primitives.md` and `docs/guides/user/the-interface.md` as source of truth. But the interface.md described it as "Icon Rail" while the code called it "Sidebar." The terminology table reflected documentation, not code.

**How to prevent it:**
- For UI/interface documentation: Run concept phase with the actual codebase as the reference, not just doc files.
- Cross-check terminology: If concept defines a term as "X," verify that the component/file actually uses "X" in code.
- Recommendation for Z3/Z4 (if any similar guides are planned): Concept phase should include a codebase audit step.

### 3. Keyboard Shortcut Fabrication (MAJOR)
The guide claimed "press A to Approve, R to Request changes, X to Reject" — these shortcuts don't exist anywhere in the codebase. This is pure hallucination, not a "misunderstanding of UI patterns."

**Why it happened:** The builder familiar with keyboard shortcuts in code review tools (GitHub, Linear, etc.) assumed HyperIdle would have them. No explicit prohibition in the AC against shortcuts; the builder filled the gap with "expected" behavior instead of verifying.

**How to prevent it:**
- AC specificity: If the guide should NOT describe something, spell it out: "Do not mention keyboard shortcuts unless they appear in the codebase."
- Or, require feature-based discovery: "Describe only features present in the current release. If unsure, grep the codebase."

---

## Process Observations

### 1. Doc Workpackages Skip Design & Architecture — Is This Right?

**Finding:** Z2 skipped /design and /architecture entirely. Concept was the only planning phase.

**Analysis:** For pure documentation, this seems reasonable. But there's a risk:
- No pre-written "surfaces to describe" list (unlike feature workpackages which have architecture's task list).
- No architecture-level decision capture (e.g., "why is bet creation in Portfolio, not Team view?").
- Hallucination risk is higher when the writer doesn't have a spec to follow.

**Recommendation:** Keep doc workpackages light (no /design), but require a 5-minute /architecture phase that:
1. Enumerates which UI surfaces to describe (e.g., "Sidebar", "Work > Portfolio", "BetCreateDialog").
2. Lists the source files for each (e.g., "Sidebar.tsx line 117").
3. Identifies edge cases to cover (e.g., "browser vs desktop API key flow").

This adds 5-10 min but prevents the hallucination risk seen in Z2.

### 2. Test Phase Was Skipped — Should Doc Workpackages Have Tests?

**Finding:** Z2 had no /write-tests phase. No "tests" for runtime behavior because docs don't have runtime behavior.

**Observation:** This is correct. Docs are not code — they don't have acceptance criteria that can be automated as tests.

**But:** Code review functioned as the test. Round 1 review asked "does the guide match the code?" — exactly what an automated test would do if you could write tests for documentation.

**Consideration:** For future doc workpackages, could we write linting rules that validate docs against code? E.g., a regex test that checks "if the guide mentions BetCreateDialog, does the file exist?" — this would catch some fabrication. But this is a future enhancement, not a blocker.

### 3. Builder Fabricated UI Instead of Reading Components (Recurring Risk)

**Finding:** This is Z2's core friction point. The builder wrote about interfaces without reading the source code.

**Pattern connection:** This connects to a recurring finding across the pipeline:
- R5: Merge conflicts from stale references (merge conflict risk, not fabrication).
- U1: Dead files not deleted (incomplete cleanup, not fabrication).
- T2: E2E tests written without understanding TipTap DOM (wrong assumptions about library behavior, not fabrication).
- Z2: UI described that doesn't exist (pure fabrication).

Z2 is the first workpackage where the builder described something factually absent from the codebase.

**Prevention:**
- Code review caught it. The two-lens model (architecture critique + code review) worked.
- But the fix required an entire review cycle. Better: a pre-commit checklist in Phase 3 (write-code) that says "for documentation, grep the codebase for references to verify them."

---

## Recommendations for Next Doc Workpackage

### 1. Add a Lightweight Architecture Phase
- 5-10 min effort
- Enumerate surfaces to describe: "Sidebar, Work > Portfolio, BetCreateDialog, Conversations, Knowledge, Settings"
- List source files: "Sidebar.tsx, WorkPortfolio.tsx, BetCreateDialog.tsx, ..."
- Identify edge cases: "browser vs desktop, first-run setup, API key storage"
- Use this list as a checklist during writing and review

### 2. Require Code Reference for Each Major Surface
- AC: "Every major UI surface described must be cited to at least one source file with a line number."
- Example: "Sidebar (left, 200px wide) — see Sidebar.tsx line 164"
- Verify in review: Spot-check 2-3 references by opening the actual file

### 3. Concept Phase: Cross-Check Terminology with Code
- When concept defines a term as "X," grep the codebase to verify it appears.
- Example: "Icon Rail" — check if files/components actually use this term.
- Document both the spec-level name (what docs say) and the code-level name (what source says).

### 4. Pre-Submit Checklist for Documentation Writer
- [ ] Ran grep for all major terms (`grep -r "Sidebar" packages/`)
- [ ] Verified all command examples by copy-pasting into local terminal
- [ ] Checked troubleshooting steps against server logs (if applicable)
- [ ] Cross-checked UI flow against actual component code (not just wireframes)

### 5. Consider a Doc Linting Rule
- Long-term: ESLint or custom linting rule that validates docs against code.
- Example: "if the guide mentions `npm run setup --profile`, verify this command exists in package.json scripts."
- Not a blocker for Z2, but worth considering for Z3+.

---

## Patterns for /compound Scan

Record these observations in the retro-log for pattern detection:

1. **Documentation-specific hallucination risk:** Builder familiar with common patterns (Kanban, keyboard shortcuts, drag-and-drop) filled gaps with "expected" UI instead of verifying actual code. Two-lens review caught it. Recommendation: lightweight architecture phase for all doc workpackages.

2. **Terminology drift between docs and code:** Concept phase used doc files as authority (e.g., "Icon Rail"), but code used different names (Sidebar.tsx). Recommendation: concept phase for doc workpackages should audit code, not just doc files.

3. **Code reference requirement for UI documentation:** Every guide that describes UI should cite source code. This prevents hallucination and makes reviews faster.

4. **Test-free workpackages are review-heavy:** Without automated tests, code review is the sole quality gate. Z2 required 2 review cycles (Round 1: 7 findings, Round 2: verification). This is acceptable but higher friction than test-driven workpackages.

---

## Summary

Z2 was a documentation workpackage that went through the pipeline with full discipline and delivered accurate, verified, copy-pasteable content. The hallucination risk was real and present, but the two-lens review model caught all fabricated content and the writer fixed it in one cycle.

**Cost:** 43K tokens, 2 review cycles, 4 commits.  
**Outcome:** 1370-word guide, zero inaccuracies after Round 2 fix.  
**Key learning:** Doc workpackages need lightweight architecture phases to enumerate what to describe, preventing hallucination risk.
