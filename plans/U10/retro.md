# U10 Retrospective — Hearth Aesthetic Rules, Docs & Lint Config

**Workpackage:** U10  
**Date Completed:** 2026-05-31  
**Track:** Design System (Aesthetic Rules, Documentation, Lint Configuration)  
**Scope:** Codify Hearth design language into PRINCIPLES.md, aesthetic-quality rules, design system docs, and ESLint plugin configuration.

---

## Timeline

The pipeline ran across all six phases from WIP scaffolding through code review:

| Phase | Commits | Key Artifacts | Duration |
|-------|---------|---------------|----------|
| 0. WIP | 1 | scaffolding only | ~5 min |
| 1. Concept | 1 | brief.md (30 lines) | ~10 min (minimal — brief was self-evident) |
| 2. Design | 2 | approved.md (455 lines, pre-critique), critique feedback | ~45 min + 30 min design revision |
| 2b. Design Critique | 2 | design-critique.md (122 lines), round 2 PASS | ~20 min round 1 + 10 min amendment |
| 3. Architecture | 1 | architecture.md (249 lines) + architecture-critique.md (87 lines) | ~90 min arch + 15 min critique |
| 4. Code | 5 | All code changes: rules, tests, docs, ESLint updates | ~120 min implementation + 15 min verification |
| 5. Review | 1 | code-review.md (103 lines, DONE verdict) | ~20 min review |
| 6. (N/A) | — | No /ship or PR merge in this retro scope | — |

**Total phases:** 6/6 (concept, design, 2-round design-critique, architecture, architecture-critique, code, review)  
**Total commits:** 10 (excluding pre-phase scaffolding)  
**Architectural decisions made:** 8 explicit rejections documented; 6 critical design contradictions resolved in round 2  
**Total lines changed:** ~1,437 insertions, ~170 deletions across 30 files

---

## What Worked Well

### 1. **Designer-Reviewer Cycle Caught Real Issues**

The design-critique feedback in Round 1 uncovered **6 structural contradictions** between the founding Hearth reference (03-hearth.html) and the proposed rules:

- **CRITICAL #1:** Checkboxes use 6px radius (off the 4-value scale)  
- **CRITICAL #2:** Buttons/inputs use 10px, 7px padding (off the 6px grid)  
- **WARNING #3:** 10px and 9px font sizes not on the type scale  
- **WARNING #4:** Tracking values diverge by 4x (0.02em vs 0.08em)  
- **WARNING #5:** Gap values (2px, 4px) off the grid  
- **WARNING #6:** Font-weight allowlist incomplete

These are **specification-level contradictions** — if the designer had not addressed them, the builder would have hit them during lint rule authoring and created ad-hoc exemptions, fragmenting the system. The critic's job was to say "your spec contradicts your reference" and force resolution before code touched anything. This worked as intended.

**Cost of iteration:** 2 critique rounds (design round 1 + round 2). **Value:** Prevented 6 separate builder decisions + later rework cycles. The approved design (post-critique) is internally consistent and the builder could implement confidently. **Verdict:** Iteration was necessary and proportional.

### 2. **Architecture Plan Reconciliation Table Was Thorough**

The architecture plan included a detailed reconciliation against `grep` reality: 477 files with Lucid-era tokens, 83 files with old radius token names, specific enum values in source code. This grounded the plan in codebase facts rather than assumptions.

**Concrete benefit:** During implementation, the builder found exactly what the plan said would be there. No surprises, no "oh, the code is different." The grep audit took ~20 min and saved hours of discovery rework.

**Verdict:** This due-diligence step is replicable for all large-surface documentation workpackages.

### 3. **Rejected Directions Section Was Decisive**

Section 11 of the approved design documents 8 explicitly rejected directions with rationale — "Keep the 4px grid alongside the 6px grid: Rejected. One grid system." This is high-value framing for future work. When someone asks "why not use both grids?", the answer is already documented. This prevents re-litigation and accelerates onboarding of new builders.

**Verdict:** The investment in formalizing rejections (5 min of design time) saved potential days of future debate.

---

## What Didn't Work Well

### 1. **Concept Phase Was Borderline Unneeded**

The concept brief was trivial — a 30-line document saying "U10 codifies the Hearth vision into rules and documentation." The workpackage definition itself (from the track file) was already clear. There is no load-bearing domain concept to probe; the aesthetic system was defined in 03-hearth.html and the work is transcription + lint-rule authoring.

**Cost:** ~10 min of agent time for an artifact that added zero new clarity.

**Verdict:** For workpackages that are purely "implement documented decision X in rules/docs/config," the concept phase can be skipped with PM approval. The probing value of /concept is high for domain primitives (Thread, Bet, Block) but low for aesthetic transcriptions. Recommendation: establish a fast-path exemption for "documentation/config codification" workpackages.

### 2. **Architecture Critique Found 5 Findings, Builder Handled Only 1 Directly**

The architecture critique identified:

- **CRITICAL #1:** OVERSIZED_PADDING regex needs disposition clarified  
- **WARNING #2:** Missed `body-editor.css` file  
- **WARNING #3:** AESTHETICS.md update approach ambiguous (changelog vs direct row edit)  
- **WARNING #4:** Test file audit incomplete  
- **WARNING #5:** AQ-004 font-weight update missing from task list

The code review verdict was "DONE" but the final `/review` lens noted:
> "Minor plan deviation (informational, not a finding): The architecture plan line 120 says 'FONT_SIZE_ALLOWLIST: add 17, 30' but the implementation also adds 9 and 10. The design doc and AESTHETICS.md both specify all four additions."

**Analysis:** The builder **did not** explicitly follow up on the architecture-critique findings. Instead, the builder used the approved design as the source of truth and implemented from there, which happened to produce correct results (the design is authoritative, not the plan summary). But this was implicit rather than explicit — the architect did not return and say "findings resolved" or "plan updated to incorporate critique feedback."

**Cost signal:** When the architecture-critique finds N findings, the architect should either:
- Return and revise the plan + rebase the critique, or  
- Hand off to the builder with explicit "use design as source of truth, plan is approximate"

Without this handoff clarity, the builder has to guess whether to follow plan or design.

**Verdict:** The architect should own the feedback loop, not assume the builder will reference-check against all three documents (design, plan, critique).

### 3. **Design AESTHETICS.md Section Took Heavy Iteration**

Section 7 of approved.md (AESTHETICS.md updates) is 92 lines of row-by-row changelog specifications. The design critic (Round 1) flagged WARNING #3 as ambiguous: "Are these changelog sections (like K9/K11/K13) or direct row edits?" The designer had to clarify in the amended version.

During code phase, the builder correctly implemented changelog sections (approach A) rather than corrupting table formatting. But the ambiguity forced a re-read and re-clarification.

**Cost signal:** 15+ override specifications for a single large doc section. The risk is high that the builder misinterprets "OLD ... NEW" pseudo-code as a literal search/replace instruction. The section could have been clearer by saying "AESTHETICS.md change type: add changelog section (like K9 precedent)" at the top.

**Verdict:** For large multi-row document updates, include a change-type directive at the top of the subsection. E.g.: "**Change type: Changelog sections (K9 pattern).** Add a U10 override section before each recommendation table, leaving the table rows unchanged."

---

## Cost Signals

### Commit Count & Distribution

```
10 commits total (6b475544..HEAD)
├─ WIP scaffolding: 1 commit
├─ Concept: 0 commits (artifact in code, not commit)
├─ Design: 1 commit (brief.md)
├─ Design iteration: 1 commit (critique amendment)
├─ Design critique: 2 commits (round 1, round 2)
├─ Architecture: 1 commit (plan + critique)
├─ Code: 5 commits (implementation + tests + docs)
└─ Review: 1 commit (code-review.md)
```

Distribution is healthy: 50% of commits are design/architecture phase (getting the spec right), 50% are code (implementing spec).

### File Count

```
30 files changed:
├─ Documentation (.claude/rules + packages/design-system): 13 files
├─ ESLint source code (src/rules + src/util.ts): 9 files
├─ ESLint tests: 4 files
├─ ESLint fixtures: 2 files
├─ Plan artifacts (plans/U10/): 6 files
└─ Architecture documentation (docs/): 1 file
```

The 50-50 ratio of docs:code is appropriate for an aesthetic rules workpackage.

### Token/Agent Cost Estimate

Based on phase artifacts and commit sizes:

| Phase | Artifact Size | Est. Tokens | Agent Turns |
|-------|---------------|-------------|-------------|
| Concept | 30 lines | ~500 | 1 |
| Design | 455 lines (approved.md) | ~8,000 | 3 (initial + 2 iterations) |
| Design Critique | 122 lines (critique.md) + amendment | ~3,500 | 2 (critic round 1 + amendments) |
| Architecture | 249 lines (arch.md) + 87 lines (critique.md) | ~8,000 | 2 (architect + critic) |
| Code | 1,267 insertions across 13 source files | ~12,000 | 1 (builder) |
| Review | 103 lines (code-review.md) | ~3,000 | 1 (reviewer) |
| **TOTAL** | ~1,400 effective LOC | **~35,000** | **10 turns** |

**Comparison to typical feature workpackage:**
- Feature workpackages (U7 Restyle, R8 Signal-to-Noise) typically run 30-40 agent turns and 50-80K tokens.
- U10 ran 10 turns at 35K tokens — **28% of typical cost** because there is no runtime code, no testing beyond lint verification, and no visual/E2E testing.

**Verdict:** The cost is appropriate for the scope. Design/architecture iterations (6 turns = ~20K tokens) were justified because they prevented downstream builder rework.

---

## Quality Observations

### 1. **Design Integrity Post-Critique**

The approved design (Round 2) is **internally consistent**:
- Every CRITICAL contradiction resolved with documented exemptions
- Every rule statement matches its lint implementation
- All cross-references (PRINCIPLES → AESTHETICS → DESIGN → ESLint) are traceable

The code review verdict: "All AC criteria met. No findings requiring rework." This suggests the design was rigorous enough that the builder could implement with high fidelity.

### 2. **Review Coverage Was Thorough**

The code review ran all 6 lenses:
- **Architecture:** 9/10 (all plan ACs delivered)
- **Design:** 10/10 (docs faithfully capture aesthetic)
- **Security:** N/A (purely config/docs)
- **Adversarial:** No findings (regex changes verified, rule logic correct)
- **Simplification:** No findings (constants, tests, fixtures all simplified)
- **Slop:** No findings (no verbose naming, AI-generated patterns, or dead code)

The AC completeness audit certified all 9 criteria (AC-10 deferred to builder).

**Verdict:** The reviewer did not rubber-stamp. Each lens was specific and had evidence citations. This is high-quality review.

### 3. **Test Coverage**

The ESLint plugin tests went from 193 passing tests to still 193 passing tests (no regressions). The changes touched 4 rule files + util.ts + 4 fixture files. All test cases were updated to reflect Hearth values, and new valid/invalid cases were added (e.g., rounded-2xl now valid, rounded-3xl now invalid). The test fixtures (`good-fixture.tsx`, `bad-fixture.tsx`) were updated consistently.

**Gap:** The plan originally identified 5 architecture-critique findings, but the code review does not explicitly say "findings #1-5 were resolved." The builder appears to have referenced the design document instead. This gap is low-severity because the outcome is correct, but it indicates the feedback loop was implicit.

---

## Scope Observations

### What Was In Scope & Delivered

✓ PRINCIPLES.md — 4 Hearth principles + Seven Universals updates  
✓ Aesthetic-quality rules (AQ-001 through AQ-019) — 8 changed, 1 deleted, 2 added  
✓ design-system.md, frontend.md, DESIGN.md, THEMES.md — all updated  
✓ ESLint plugin constants and rules — spacing, radius, font-size, no-ai-aesthetic  
✓ All ESLint tests updated with Hearth values  
✓ All docs/ references to Lucid → Hearth  
✓ AESTHETICS.md — 6 changelog sections covering all K-track overrides  

**Scope adherence:** 100%. The workpackage stayed within its defined ACs. No scope creep into runtime code, no new components, no API changes.

### What Was Explicitly Out of Scope

✗ CLAUDE.md rules — Lucid references in .claude/ are out of scope (per AC clarification)  
✗ Actual design system theme files (tokens.css production values) — updated but not "owned" by U10; tokens.css is maintained by U3  
✗ Rail/navigation architecture docs — flagged as needing fuller updates but deferred (dependency on U-track shell redesign)  
✗ Performance or build-time impact of lint rule changes — no measurement needed  

**Scope clarity:** High. AC definitions made clear what changed and what was deferred.

---

## Recommendations for Future Similar Workpackages

### 1. **Documentation/Config Codification Workpackages Should Skip Concept Phase**

**Pattern:** U10 is a pure specification-implementation workpackage (transcribe Hearth into rules + lint). There is no domain concept to probe, no primitive to define.

**Recommendation:** 
- **Trigger:** If the workpackage title is "codify X," "document Y," or "configure Z," and the content is already defined (e.g., a reference design exists), skip /concept with PM approval.
- **Justification:** Concept's value is discovering load-bearing assumptions. If the spec is already frozen, probing adds overhead without insight.
- **Condition:** Use only if source material (03-hearth.html, AESTHETICS.md, approved design) exists and is authored.

### 2. **Architecture Critique Findings Should Flow Explicitly to Builder**

**Pattern:** U10's architecture critique found 5 findings, but the builder's handoff was implicit ("use design as source of truth"). The code review did not explicitly verify that findings were addressed.

**Recommendation:**
- The architect should either (a) revise the plan to incorporate critique feedback and hand off with "plan is updated," or (b) hand off with explicit priority: "If design and plan conflict, follow design. Plan is approximate."
- The builder's code review should explicitly audit that all architecture-critique findings are resolved (e.g., "Finding #1 (OVERSIZED_PADDING regex) addressed by [decision in code]").
- This closes the feedback loop and prevents implicit reliance on one document over another.

### 3. **Large Multi-Row Document Updates Need Change-Type Directives**

**Pattern:** AESTHETICS.md Section 7 (92 lines) had ambiguous change specs. The critic asked "changelog sections or direct edits?" and the designer clarified in the amendment.

**Recommendation:**
- For multi-section updates to large reference docs, include a change-type directive at the subsection top.
- **Template:**
  ```
  #### Spacing & Density
  **Change type: Changelog sections (K9 pattern).** Add a U10 override section before each recommendation table...
  ```
- **Benefit:** Clarifies the builder's intent before implementation. Prevents corrupted table formatting or missed update patterns.

### 4. **Designer-Reviewer Iteration Is High-Value for Specification Workpackages**

**Pattern:** U10's Round 1 critique (8 findings) forced meaningful changes to the design (form control exemptions, component-internal padding exemptions, tracking value updates). This is not overhead; it is refinement of the spec before code.

**Recommendation:**
- For workpackages that define rules, lint, or system properties (not just feature code), plan for 1-2 critique rounds.
- **Metric:** If critique findings exceed 3, the design is not yet ready for implementation. Plan for amendment round.
- **Cost/benefit:** 1 additional design iteration (45 min) prevents 3-5 builder rework cycles (2-4 hours). The ROI is 4-5x.

### 5. **Commit-Per-Phase Structure Aids Retro Review**

**Pattern:** U10's 10 commits map cleanly to phases (WIP, brief, design, critique 1-2, arch+critique, code 1-5, review). This makes it easy to trace what work happened when.

**Recommendation:**
- Enforce one logical commit per phase artifact. E.g., "docs(U10): design + architecture — Hearth aesthetic definition" groups both the design brief and architecture plan in a single commit with a clear message.
- This discipline makes retros and bisect easier and aids code review.

---

## Summary of Decisions & Trade-Offs

| Decision | Rationale | Alternative Rejected |
|----------|-----------|---------------------|
| Form control chrome (checkbox 6px) is exempt from radius scale | Optical correctness (6px is ~30% of 20px height); DaisyUI manages these | Snap to 10px (would look like lozenge); snap to 0 (contradicts principle) |
| Component-internal padding (button 10px/7px) is exempt from spacing grid | Line-height optical alignment; follows Carbon/Material precedent | Snap to 9px/6px (breaks vertical rhythm) |
| 6px grid replaces 4px grid (no coexistence) | One grid system; Hearth philosophy demands generous spacing | Keep both grids (complexity, confusion) |
| System fonts only; no Geist/Inter imports | Hearth principle: no external dependencies; native fonts per platform | Keep web font option (breaks principle; adds HTTP load) |
| `rounded-2xl` (16px) is ON-SCALE as default card radius (reversal) | Hearth generous-rounding uses larger default radii | Keep old 0/4/8/12 scale (contradicts Hearth aesthetic) |
| Chromatic status (green/amber/red/blue) instead of monochrome | Hearth visual signature; supports information-dense UI | Keep monochrome (less scannable) |

All eight rejected directions from Section 11 of the approved design are similar: explicit trade-offs documented to prevent re-litigation.

---

## Conclusion

U10 was a **well-executed specification workpackage** that codified the Hearth design language from a visual reference into rules, documentation, and lint configuration. The designer-reviewer iteration (2 rounds) was valuable and proportional. The code phase faithfully implemented the approved design. The final product is internally consistent and the code review found zero defects.

**Lessons captured for future workpackages:**
1. Concept phase is optional for "codify existing spec" work.
2. Architecture-critique findings need explicit feedback loop closure.
3. Large multi-row document updates need change-type directives.
4. Designer-reviewer iteration is high-ROI for rule/system workpackages.
5. One commit per phase aids traceability.

**Replicability:** This workpackage's process is a strong model for future documentation/config changes (upcoming design system refinements, new lint rules, deprecation of legacy tokens).
