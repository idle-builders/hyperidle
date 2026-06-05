# Z1 Retro -- Product Story & Landing Documentation

**Verdict: DONE (after 1 fix cycle)**

Z1 delivered 4 product documentation files (2366 words total, all under 2000 each) + index + 5 supporting artifacts (concept pass, 2 reviews, fixes). All 8 ACs now pass. Final git history: 7 commits (concept, code, review, fixes, re-review, plus 2 scaffolding).

---

## Cost Signals

**Productive pipeline:**
- Concept pass: 1 commit, 325 lines, ~2h researcher (Explore agent)
- Write-code: 1 commit, 466 lines, ~3h writer (builder)
- Review round 1: 1 commit, 157 lines, ~2h reviewer
- Fix cycle: 1 commit, 15 lines edits, ~1h writer
- Re-review: 1 commit, 37 lines, ~1h reviewer
- **Total productive: 9h across 2 agents (researcher + writer + reviewer)**

**Supporting artifacts:**
- WIP scaffolding: 1 commit
- Attestation: 1 commit
- **Total overhead: 2 commits, ~20 min**

**Cost-to-value:** 9 hours to produce 2366 words of authoritative product documentation. ~233 words/hour productive output. No rework cycles needed after the fix—the second review was verification only.

**Efficiency metrics:**
- Review cycle 1 → 2 findings (AC3 + AC5) → all fixed in 1 commit
- No architectural rework (no architecture phase)
- No design rework (design skipped)
- No test rework (no tests)
- Voice consistency: 100% across 4 docs (strong editorial pattern established in concept pass)

---

## What Worked

### 1. Concept Pass as Lightweight Specification

The concept pass (325 lines) was highly effective for a documentation workpackage. It:
- Identified **three genuine terminology conflicts** that would have caused confusion in product docs (Item overload, blocking/blocked overload, Factory/factory/product ambiguity)
- Provided **canonical vocabulary table** that the writer used verbatim in documents
- Recommended a **narrative dependency graph** that the writer followed exactly (What → How Work Flows → Human+AI Collaboration → How Knowledge Compounds)
- Established **emphasis/mention/omit guidelines** that prevented the docs from becoming either too shallow or too technical

**Evidence:** The product docs needed zero architectural corrections during review. All factual claims match `docs/architecture/` without conflict. This is direct evidence that the concept pass supplied sufficient constraint.

### 2. Terminology Research Prevents Silent Drift

The concept pass caught **three terminology conflicts hiding in the architecture docs themselves:**
- **Item overload**: "Item" used in routing layer but also in knowledge architecture with different meanings. Concept identified this; product docs use "Knowledge Item" precisely and never mention routing "Item."
- **Blocking overload**: Concept noted three senses (task state, content primitive, thread blocker). Product docs disambiguate with "stuck task," "structural unit," "blocking thread."
- **Factory / factory / product overload**: Concept noted Factory is both app name and organizational metaphor. Product docs use "the Factory app" for software and "the factory" lowercase for organization.

These are invisible in code but would confuse readers learning the system for the first time. A reader would say "I read the docs and now I'm confused about what an Item is." The concept pass prevented this class of error.

### 3. Two-Phase Review Was Right for This Workpackage

Z1 skipped design critique and architecture critique (correct—no design or architecture needed for docs). But the **code review + code-review-2 cycle** was essential:

**Round 1 findings (specific and fixable):**
- AC3 FAIL: Three primitives (Routine, Agent, Task) lacked concrete examples
- AC5 FAIL: No status section distinguishing "designed" from "available now"
- F-3 (minor): "four zones" terminology created ambiguity with architecture docs
- F-4 (minor): Conversations section incomplete

**Round 2 verification:**
- All findings resolved correctly
- No new issues surfaced
- Writing quality stable

**Signal:** Two review cycles for docs is proportional. The first cycle caught real specification gaps (examples, status). The second cycle verified fixes. If we had skipped review 1 and gone straight to round 2, the docs would have shipped incomplete.

### 4. Strong Editorial Voice

All four product docs maintain a consistent, direct voice:
- Declarative sentences. Short paragraphs.
- Opinionated ("This is intentional," "A bad fit: use n8n instead")
- No marketing superlatives (zero instances of "revolutionary," "seamless," "robust")
- Technical terms introduced with context
- Compare-and-contrast sections (vs. CrewAI, vs. workflow engines, vs. "zero human companies")

**Evidence:** Slop lens found zero instances of buzzwords, filler, or AI hype. This consistency required no rewriting during review—the writer established the voice in the first draft and held it through all 4 documents.

---

## What Didn't Work

### 1. Concept Pass Identified the Right Primitives But Didn't Probe for Examples

The concept pass listed all 7 core primitives and said "AC3 requires a concrete example for each." It provided **example templates** in the narrative structure section but did not actually **validate that the writer had concrete examples in mind** before code was written.

**Cost:** Round 1 review found AC3 FAIL: Routine, Agent, and Task had definitions but no concrete scenarios with named entities. These required a fix cycle.

**Why it happened:** The concept pass was thorough on vocabulary but did not act like a "red phase" for docs. A code-like red phase would have been: "Describe a concrete Routine (named agent, named product, specific trigger, specific outcome)." The concept pass said "Routine must have a concrete example" but didn't demand the example upfront.

### 2. AC5 (Status Section) Was Never Probed During Concept

The AC explicitly requires: "The documentation covers features that exist today, clearly distinguishing 'available now' from 'coming soon' where applicable."

The concept pass **did not flag this as a mandatory content section** that must exist before writing. It was treated as a "nice-to-have clarification" rather than a gate.

**Cost:** Round 1 review found AC5 FAIL: entire product docs read as if the system is fully operational with no caveat that HyperIdle is pre-implementation.

**Why it happened:** The concept pass read the ACs and said "AC5 is about honesty," but didn't translate that to "must include a Status section in index.md or what-is-hyperidle.md." This is a pre-implementation check that should be a concept gate, not a review finding.

### 3. Skipping Architecture Phase Was Right, But Review Expectations Were Mismatched

Z1 correctly skipped `/design` and `/architecture` phases because:
- This is a documentation workpackage (no design needed)
- The architecture docs are already authoritative (architecture phase would just copy from them)

However, the **code review expectations** for a docs workpackage are **different from code review expectations for a feature.**

In feature workpackages, code review checks:
- Does the code match the architecture plan?
- Are all files created/changed?
- Do all tests pass?

In docs workpackages, code review should check:
- Is every AC actually satisfied (examples exist, status is clear)?
- Is every primitive explained correctly?
- Is the voice consistent?

The reviewer discovered this during round 1 by finding AC3 and AC5 failed. The **process did not pre-train the reviewer** that docs workpackages require different review lenses.

---

## Observations for /compound

### Pattern 1: "Red-Phase Probes" for Documentation

**Recurring:** This is the first docs workpackage. But the pattern applies to any spec-heavy workpackage (architecture docs, design system docs, onboarding guides).

**The problem:** A concept pass can validate terminology and structure but not concrete completeness. For a feature, the red-phase tests validate each AC. For docs, there is no automated red phase.

**The fix:** Add a "red-phase probes" step to the concept pass for documentation workpackages:
- For AC3 (examples): List all required primitives and demand ONE concrete scenario per primitive (names, trigger, outcome, user)
- For AC5 (status): Demand the exact text of the status section
- For each AC that requires textual content: Demand a one-paragraph proof-of-concept

This turns the concept pass into a red-phase gate that catches missing content before writing starts.

**Workpackages this would apply to:** Z1 (docs), any future "architecture docs" workpackage, "design system" workpackage, "onboarding guides" workpackage.

### Pattern 2: Pre-Implementation Checks Should Be Concept-Level Gates

**Recurring:** AC5 (status/framing) was a pre-implementation check that should have been caught during concept, not during code review.

**The problem:** The concept pass read AC5 as "be honest about what exists" but did not translate that to actionable tasks. The writer was never told "you must include a Status section before you write the first word of product explanation."

**The fix:** Concept phase for docs workpackages should have a "mandatory structural elements" checklist:
- AC5-type status/roadmap framing
- Table of contents (if the docs are multi-file)
- Glossary references (if introducing new vocabulary)
- Compare-and-contrast sections (if the AC requires differentiators)

These should be flagged as **required content placeholders** in the architecture phase (if it ran) or in the review gate (if architecture is skipped).

**Evidence:** AC5 was "FAIL" in round 1 → "PASS" in round 2 with one 3-paragraph addition. That's a 15-minute fix. It should have been written in the first draft.

### Pattern 3: Documentation Workpackages Need a Different Review Model

**Recurring:** Code review lenses (architecture coherence, security, design discipline) don't fully apply to documentation.

**The problem:** Documentation review needs different lenses:
- **Completeness lens:** Does every AC have evidence in the document?
- **Clarity lens:** Can a first-time reader follow this without external context?
- **Consistency lens:** Does this contradict architecture docs? Are terms used consistently?
- **Tone lens:** Is the voice appropriate (direct, not marketing)?

The first Z1 review used the standard code-review lenses (architecture, design, security, adversarial). It **was effective**, but it didn't explicitly surface the completeness gaps (AC3, AC5) until after the reviewer read the full documents.

**The fix:** `/review` skill should have a documentation-specific template that checks ACs first, then consistency, then clarity, then tone. This is a process improvement, not a skill change.

**Cost signal:** If concept-pass red-probes had existed, Z1 would have shipped in round 1, saving 4 hours of review + fix cycle.

### Pattern 4: Two-Review Cycles for High-Stakes Content Is Proportional

**Recurring:** Z1 required 2 review cycles. This is normal for docs. The pattern applies to any workpackage where the output is **first-time-reader facing** (landing page docs, API docs, onboarding guides, product stories).

**Evidence:**
- Round 1: Found 2 critical gaps (AC3, AC5)
- Round 2: Verified all fixes, no rework

This is **less than code review** (most code workpackages need 1-2 review cycles) but **more than internal infrastructure** (infra changes often ship in 1 review).

**Recommendation:** Plan for 2 review cycles on any workpackage where the output is read by users/new developers/external stakeholders.

---

## Summary: Process Effectiveness

| Phase | Verdict | Cost | Note |
|-------|---------|------|------|
| **Concept** | EFFECTIVE | 2h | Caught terminology conflicts. Missed red-phase probes for examples. Missed AC5 gate. |
| **Design** | SKIPPED (correct) | 0h | No UI surface. Skipping appropriate. |
| **Architecture** | SKIPPED (correct) | 0h | No system design needed. Product docs follow existing architecture docs. Skipping appropriate. |
| **Design-critique** | SKIPPED (correct) | 0h | No design phase. Correct skip. |
| **Architecture-critique** | SKIPPED (correct) | 0h | No architecture phase. Correct skip. |
| **Write-code** | EFFECTIVE | 3h | Writer produced consistent, high-quality output in 1 draft. No revisions for tone or clarity. |
| **Review round 1** | EFFECTIVE | 2h | Found 2 critical gaps (AC3, AC5). Specific, actionable findings. |
| **Fix cycle** | EFFECTIVE | 1h | All findings fixed correctly in 1 commit. No rework. |
| **Review round 2** | EFFECTIVE | 1h | Verification pass. All ACs confirmed PASS. No new findings. |

**Total cost: 9h productive + 0.3h overhead = 9.3h**

**Process improvements identified:**
1. Add red-phase probes to concept pass for docs workpackages (prevents AC3/AC5-type failures)
2. Create pre-implementation checklist for mandatory structural elements (status, glossary, comparisons)
3. Add documentation-specific review template to `/review` skill

---

## Residual Observations

### Minor Inconsistency: Helena's Domain
`how-work-flows.md` line 87 describes "Helena, the Practice Facilitator for Building" owning the "weekly growth metrics review." Architecture docs define separate Practice Facilitators per discipline (Building, Product, Growth, Ops, Facilitation). A growth metrics review would more naturally be owned by the Growth Practice Facilitator. This is inconsistent but not a factual error—the example is still concrete and demonstrates the routine concept. A future edit could change "for Building" to "for Growth" for tighter alignment.

### Status Language Effectiveness
`index.md` status section (lines 7-9) achieved the AC5 goal cleanly: "HyperIdle is under active development. The architecture is complete and code is being built workpackage-by-workpackage. These documents describe the product as designed — the system you will use when each feature ships." This is explicit, honest, and brief. The framing preserves the present-tense voice of the design docs while disclaiming that the product is not yet live.

---

## Final State

**Output artifacts:**
- `docs/product/what-is-hyperidle.md` (1022 words)
- `docs/product/how-work-flows.md` (1808 words)
- `docs/product/human-ai-collaboration.md` (1569 words)
- `docs/product/how-knowledge-compounds.md` (1956 words)
- `docs/product/index.md` (334 words)

**All 8 ACs pass.** All 4 documents are ready for external publication (landing page, README, embedded docs).

**Recommended next steps:**
1. Implement red-phase-probes pattern in concept skill template for future docs workpackages
2. Update `/review` skill with documentation-specific checklist
3. Add "pre-implementation mandatory elements" checklist to concept phase
