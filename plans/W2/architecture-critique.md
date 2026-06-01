# W2 Architecture Critique

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:10 AC:N/A DM:N/A N:9 MD:8 FMC:8 S:8 V:8

## Summary

The architecture plan is thorough, well-grounded in codebase reality, and correctly scoped for a pure frontend visual parity workpackage. The Plan Reconciliation table is excellent -- every file path verified by grep, every line number confirmed. The density strip is exhaustively inventoried with per-file, per-token replacement maps. The task ordering respects the component dependency graph. The plan correctly identifies this as a zero-security-surface change. API Contracts and Data Model dimensions are N/A (no new endpoints, no schema changes). Findings below are contract gaps the builder must address, not structural plan failures.

---

## CRITICAL

### C1: Missing task for doc updates (DESIGN.md, AESTHETICS.md, our-components.md)

[plan -- entire task list]

The TRACK-W.md spec (W2 Contracts/constraints) states: "All doc updates (DESIGN.md, AESTHETICS.md, our-components.md) happen in this workpackage." The architecture plan's Required Reading lists DESIGN.md and AESTHETICS.md as inputs to read, but no task in the ordered task list (Tasks 1-7) produces doc updates. Specifically:

- AESTHETICS.md needs density AQ rules removed/rewritten (the file-level AQ-003 has been rewritten to "One size per component" but other density references may remain)
- The aesthetic-quality.md changes (remove AQ-002, AQ-003, AQ-016, AQ-017) are in Task 2, but the canonical AESTHETICS.md is not mentioned
- `our-components.md` or equivalent component catalog needs updating with the 10 new Tier 0 primitives

The plan has no task for these doc deliverables. This is scope that the spec requires but the plan does not deliver.

### C2: data-component vs data-ds-component mismatch unaddressed

[plan -- Task 4a through 4i, EXPECTED_MARKERS discussion]

(Carried forward from design critique C1.) The architecture plan specifies `data-ds-component: "Avatar"` etc. on every new primitive and adds entries to `EXPECTED_MARKERS` in the visual regression test. But the HTML reference files for all new Tier 0 primitives use `data-component` (not `data-ds-component`). The visual regression test's marker presence test (line 469) searches for `data-ds-component`.

The Plan Reconciliation table does not identify this mismatch. The builder will discover it when marker tests fail on every new primitive. The plan should specify that either (a) the HTML files are updated to use `data-ds-component` (allowed per visual-parity.md -- data attribute changes are not styling changes), or (b) the EXPECTED_MARKERS test logic is adjusted to check `data-component` on HTML pages.

### C3: AppShell density removal not in Task 2 file list

[plan -- Task 2 Files (modify)]

The plan's Task 2 lists `AppShell.test.tsx` for density test removal (correct) but does not list `AppShell.tsx` itself for modification. Checking the codebase: `packages/web/src/layouts/AppShell.tsx` has zero density references in production code -- the `useDensity`/`data-density` wiring that the test asserts does not exist in the current AppShell implementation. This means the test file's `describe("density wiring (J1)")` block (lines 146-226) tests behavior that AppShell no longer implements.

This is not a plan error per se -- the plan correctly says to delete the test block. But the plan should note that the AppShell test is asserting phantom behavior (density wiring that was removed from AppShell in a previous workpackage but whose tests were not cleaned up). This context prevents the builder from wondering whether they need to also strip density from AppShell.tsx.

---

## WARNING

### W1: Task 2 missing `data-density` attribute removal from production code

[plan -- Task 2, density token replacement tables]

The plan exhaustively lists `var(--density-*)` CSS custom property replacements (41 + 32 references). It also lists file deletions and type removals. But it does not account for `data-density` HTML attributes that may be set on DOM elements in production code. Grep confirms the `data-density` attribute is only in the deleted hook files (`useDensity.ts`, `useAutoDensity.ts`) and test files -- not in any production TSX. But the AC-1 verification grep includes `data-density` as a search term. The plan should explicitly state that no production code sets `data-density` attributes (only the hooks that get deleted), so the builder knows this is already covered by the file deletions.

### W2: Tier 0 primitives use dsProps() with tier "0" but dsProps only accepts "1" | "2"

[plan -- Task 4a-4i, type signatures]

The `ds-attrs.ts` file defines `DsTier = "1" | "2" | "3"` and `dsProps(name: string, tier: "1" | "2")`. The new Tier 0 primitives need a data-ds-tier attribute. The plan says `data-ds-component: "Avatar"` but does not specify the tier value. If the builder uses `dsProps("Avatar", ...)` they cannot pass "0" -- the function only accepts "1" or "2". 

The plan should specify whether to: (a) extend DsTier and dsProps to accept "0", (b) use "1" for the new primitives (treating them as Tier 1 in the marker system), or (c) construct the attributes manually. The HTML files use `data-tier="0"` which is outside the current TypeScript type.

### W3: Missing task for knip/dead-export cleanup

[plan -- Task 2]

After deleting 10 files and removing types/exports, the barrel files (`index.ts` in eslint-plugin-design, settings-types re-exports) may have dangling imports or exports. The plan lists specific modifications to `eslint-plugin-design/src/index.ts` but does not mention checking that `knip` (the dead-code detector in the verify pipeline) passes after the density strip. If the deleted hook files are re-exported from any barrel file, knip will flag them. The builder should run `npm run verify -- --only=knip` after Task 2.

### W4: Page gutter value inconsistency between spec tables

[plan -- Task 2, density token replacement table for web/src]

In the design-system/src replacement table, `--density-page-gutter` maps to "18px (--space-6)". In the web/src table, `SetupFlow.tsx`'s `--density-page-gutter` maps to "24px (--space-8)". Both appear correct for their contexts (the generic token was 18px in `_tokens.css`, but DESIGN.md's page gutter and the screen mockups use 24px). The plan should clarify that `--density-page-gutter` has context-dependent replacements and the builder must verify per-component against the HTML reference, not use the same value everywhere.

### W5: No explicit task ordering constraint between 4a-4i subtasks

[plan -- Task 4]

The plan says "Build in dependency order" and lists them 4a through 4i, but does not specify dependencies between the primitives themselves. Since none of the 10 new Tier 0 primitives consume each other (AvatarGroup consumes Avatar, but they are in the same file/subtask), the subtasks are actually independent and can be built in any order. The plan should state this explicitly -- the builder may parallelize or reorder without risk.

---

## SUGGESTION

### S1: Design-it-twice section is good but could address AvatarGroup implementation

[plan -- Design-It-Twice]

The design-it-twice section covers the token replacement strategy (literal pixels vs --space-* vars). This is the right decision analyzed properly. However, the more architecturally interesting decision -- how AvatarGroup propagates size to children (CSS override vs cloneElement vs context) -- is not given design-it-twice treatment. This was flagged in the design critique (C2) and the architecture plan inherits the gap.

### S2: Token sync test should be specified more precisely

[plan -- Task 3 verification]

The plan says "A new test in `token-sync.test.ts` parses both files and asserts every CSS custom property name+value pair in `_tokens.css` has a matching entry in `tokens.css`." This is a good verification method but the plan does not specify: (a) how CSS custom properties are parsed (regex, postcss, css-tree), (b) whether the test handles structural differences (comments, @layer wrapper, CSS reset), or (c) the exact assertion (name+value match, or just name existence). The builder will need to make implementation decisions. This is minor -- the test's contract is clear even if the implementation is not specified.

### S3: Consider specifying the AvatarGroup "small" child-size mechanism

[plan -- Task 4a]

The AvatarGroup TypeScript interface uses `children: ReactNode` and `small?: boolean`. When `small` is true, the HTML achieves 24px avatars via CSS specificity override on `.avatar-group--sm .avatar`. The TSX cannot replicate this exact pattern with Tailwind. The plan should specify the implementation approach: Tailwind's `[&>*]` child selector utility, React.cloneElement to override size, or CSS module/inline style. This is a load-bearing implementation decision left to the builder.

### S4: visual-regression.test.ts INTERACTIVE_COMPONENTS should include new primitives

[plan -- Task 4b-4i]

The plan mentions extending COMPONENTS and EXPECTED_MARKERS arrays for new primitives, and Task 4b says Button goes into INTERACTIVE_COMPONENTS. But Tasks 4c-4i do not specify INTERACTIVE_COMPONENTS entries for Input (focus), Select (focus), Toggle (click), or Checkbox (click). The design spec says these all have hover/focus states. The builder should add interactive state tests for all form primitives, not just Button.

---

## What's Working Well

1. **Plan Reconciliation table is exemplary.** Every file path, every line number, every assumption verified against grep reality. This is the section that prevents "the plan said line 247 but it's actually line 312" surprises during implementation. The 60-row reconciliation table covering both spec assumptions and codebase reality is the kind of thoroughness that makes a density strip safe at scale.

2. **Design-it-twice on token replacement is correctly resolved.** The analysis of Option A (--space-* vars creating double indirection) vs Option B (literal pixels matching HTML) is honest. The rejection of Option A cites a concrete maintenance asymmetry (HTML uses literals, TSX would use vars -- drift becomes invisible). The decision is well-grounded.

3. **Security section is correctly scoped as N/A.** A pure frontend visual parity workpackage with no new endpoints, no new user inputs, and no new data flows has zero security surface. The plan does not manufacture security theatre.

4. **Protected tests list is well-specified.** Five test files with clear notes on what gets removed (density assertions) vs what gets preserved (non-density assertions, test framework). This gives the builder precise surgical guidance.

---

## Dimension Notes

**Spec Alignment (8/10):** Every AC maps to a task. The one gap is the doc updates (DESIGN.md, AESTHETICS.md, our-components.md) mentioned in the spec's Contracts/constraints that have no task. The Tooltip deferral is correctly handled.

**Layer Integrity (10/10):** All changes are within Human Interface layer (design-system + web frontend). No cross-layer violations. No backend changes.

**API Contracts (N/A):** No new API endpoints.

**Data Model (N/A):** No schema changes.

**Naming (9/10):** Component names match HTML filenames. Props interfaces match the HTML component APIs. The `data-ds-component` naming is consistent with existing convention (though the HTML mismatch is a separate issue).

**Module Depth (8/10):** New primitives have minimal prop surfaces (3-6 props each). Button's forwardRef is the only complexity addition. AvatarGroup's `children: ReactNode` is appropriately open. The barrel export additions are mechanical.

**Failure-Mode Coverage (8/10):** Risks section covers the four realistic failure modes (touch targets, ds:sync flakiness, large commit, TSX divergence). The data-component mismatch risk is missing. The mobile input font size risk is acknowledged in the design but not reiterated in the plan's risks.

**Simplicity (8/10):** No over-engineering. No unnecessary abstractions. The token replacement strategy is correctly simplified to literal pixels. The only forwardRef is on the one component that needs it. No premature generics.

**Verifiability (8/10):** Every AC has a concrete verification method (grep command, test name, ds:sync). The token-sync test is specified as a new test with clear assertion. The density grep commands are copy-pasteable. The one gap: the doc update AC has no verification method because it has no task.

---

## Verdict

Score 8/10. The plan is thorough, well-grounded, and correctly scoped. The three critical findings (missing doc update task, data-component mismatch, AppShell phantom test context) are all addressable during implementation. The warnings about DsTier type extension, page gutter inconsistency, and knip cleanup are implementation-time concerns the builder should be aware of. Advances to build phase.
