# U10 Architecture Critique -- Hearth Aesthetic Rules, Docs & Lint Config

ARCHITECTURE-SCORE: 8/10 rounds=1 score-line: SA:9 LI:10 AC:N/A DM:N/A N:9 MD:9 FMC:7 S:8 V:8

**Date:** 2026-05-31
**Reviewer:** Phase 2 architecture critique
**Source:** `plans/U10/architecture.md`

**Note:** This workpackage is purely documentation and lint config -- no API endpoints, no data model, no runtime code. Dimensions AC (API Contracts), DM (Data Model Alignment), and LI (Layer Integrity) are scored but trivially satisfied (N/A for AC and DM; 10 for LI since no cross-layer reach is possible in doc/lint changes).

---

## CRITICAL

### 1. Plan does not address `OVERSIZED_PADDING` regex update in `no-ai-aesthetic.ts`

**[Plan "AC-8" and "Task 1b"]** The plan's Task 1b for `no-ai-aesthetic.ts` covers the `ROUNDED_2XL_3XL` regex change, but the `OVERSIZED_PADDING` regex at `no-ai-aesthetic.ts:62` (`/\b(?:p|px|py)-(?:8|10|12|14|16)\b/`) is based on 4px grid assumptions. With the 6px grid:

- `p-8` = 32px -- off the 6px grid, caught by `no-off-grid-spacing` already
- `p-10` = 40px -- off the 6px grid, caught by `no-off-grid-spacing`
- `p-12` = 48px -- ON the 6px grid (`--space-16`), but the approved design says values above `--space-8` (24px) are for page-level only
- `p-14` = 56px -- off the 6px grid
- `p-16` = 64px -- off the 6px grid

The plan must specify: does this regex change, stay as-is, or get its rationale comment updated? Most of these values are now caught by the spacing rule, making the oversized-padding AI-aesthetic check partially redundant. The plan should decide and document.

---

## WARNING

### 2. Plan identifies 5 docs/ files but misses `body-editor.css`

**[Plan "AC-9" and "Task 4"]** The `packages/design-system/src/body-editor.css:5` comment says "All values use semantic Lucid tokens." This is a Lucid reference inside `packages/design-system/src/`, not `docs/`, but it should be updated to "Hearth tokens." Add to the file list.

### 3. AESTHETICS.md update approach needs explicit clarification

**[Plan "AC-7"]** The plan says "Add U10 Hearth changelog section with all override rows (following K9/K11/K13 pattern)." But the approved design Section 7 proposes updating individual recommendation table rows with "OLD ... NEW ..." text. These are different approaches:

- (a) **Changelog approach** (like K9/K11/K13): add a "U10 Hearth changelog" sub-section above each affected recommendations table. Leave the table rows with their original "no change" values. The changelog documents what overrides what.
- (b) **Direct row update**: modify the Recommended cell in each table row from "no change" to the new Hearth value.

Approach (a) is consistent with how K9/K11/K13 work and preserves the original research citations. The plan should explicitly state approach (a) and ensure the builder does not corrupt table formatting by editing 15+ individual table cells.

### 4. Test update descriptions for `no-ai-aesthetic.test.ts` are incomplete

**[Plan "Task 1a"]** The plan says "Move rounded-2xl from invalid to valid." But the test file may also have `oversizedPadding` cases. If the padding regex changes or stays (per CRITICAL #1), the plan should audit the full test file and enumerate all affected test cases.

### 5. AQ-004 font-weight update missing from plan task list

**[Plan "AC-1" and "Task 2"]** The approved design adds 700 to the font-weight allowlist, but the plan's AC-1 changelist does not include AQ-004's font-weight update. The plan lists specific AQ rule changes (AQ-001, AQ-003, AQ-011, AQ-012, AQ-013, AQ-101, AQ-112, AQ-018, AQ-019) but omits AQ-004.

---

## SUGGESTION

### 6. `MOTION_ALLOWLIST` does not exist in the ESLint plugin

**[Plan "Plan Reconciliation"]** The AESTHETICS.md motion section references motion lint hints (`regex: /\bduration-\[(\d+)ms\]/` allowlist `{80,150,250}`), but no motion ESLint rule exists in `packages/eslint-plugin-design/src/rules/`. AQ-013 is enforced by agent rules only. The plan does not need to update a motion rule, but the approved design's AQ-013 section should note this is agent-rule enforcement, not automated lint.

### 7. `util.ts` comment reference to "Lucid semantic token set" should be in Task 1b

**[Plan "Task 1b"]** The plan mentions "Update comments from Lucid to Hearth references" for `util.ts`, which covers `util.ts:47` ("Raw Tailwind palette names that are NOT part of the Lucid semantic token set"). This is correct but should be explicitly listed in the changeset so the builder does not miss it.

### 8. Consider noting Task 2 content dependency on the approved design

**[Plan "Task Dependencies"]** Tasks 1-4 are marked independent, which is correct for execution order. But Task 2 (rules files) must use the same Hearth values as Task 1 (lint plugin). The builder should be pointed to the approved design as the shared source of truth, not to Task 1's code.

---

## What's Working Well

- **Plan reconciliation table is thorough.** Every assumption is checked against `grep` reality. The reconciliation between spec assumptions and actual codebase state (477 files with old Lucid tokens, 83 with old radius tokens, the specific ALLOWED_NAMED_RADIUS values) demonstrates genuine investigation.
- **TDD ordering is correct.** Step 1a (tests first) -> Step 1b (source) -> Step 1c (verify) follows red-green. Each lint rule's test file is enumerated with specific valid/invalid case changes.
- **Security analysis is honest.** All checks marked N/A with "purely documentation and lint config" rationale. No theatre.
- **Risk table is practical.** The note about warn-severity (not error) for design lint rules is correct and prevents the builder from being surprised by 477 Lucid-era violations.

---

## Verdict

Score 8/10. The plan is well-structured and thorough for a documentation/lint workpackage. The CRITICAL finding (oversized padding regex) is real but bounded -- the builder will need to make a decision about this regex and the plan should specify the answer up front. The warnings are completeness gaps (missed file, ambiguous AESTHETICS.md approach, missing AQ-004 weight update) that would cause small rework if caught during implementation instead of in the plan. All are addressable without restructuring.

**Recommendation:** Pass with conditions. The architect should:
1. Add `OVERSIZED_PADDING` regex disposition to Task 1b (update comment or update regex)
2. Add `body-editor.css` to the Lucid reference file list
3. Explicitly state approach (a) for AESTHETICS.md (changelog section, not direct row modification)
4. Add AQ-004 font-weight `{400,500,600,700}` to AC-1's changelist
