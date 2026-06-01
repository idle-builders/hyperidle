# U10 Architecture Plan -- Hearth Aesthetic Rules, Docs & Lint Config

**Workpackage:** U10
**Status:** Ready for implementation
**Date:** 2026-05-31
**Branch:** `feat/U10-aesthetic-rules`
**Worktree:** `/Users/tg/hyperidle/.worktrees/U10`

---

## Required Reading

- `plans/U10/design/approved.md` -- the full Hearth aesthetic definition (locked)
- `packages/design-system/03-hearth.html` -- the founding Hearth reference (in main repo, not worktree)
- `packages/design-system/src/tokens.css` -- current Hearth token system
- `packages/design-system/DESIGN.md`, `PRINCIPLES.md`, `THEMES.md`, `AESTHETICS.md` -- docs to update
- `.claude/rules/aesthetic-quality.md`, `frontend.md`, `design-system.md` -- rules to update
- `packages/eslint-plugin-design/src/util.ts` -- shared constants for lint rules
- `packages/eslint-plugin-design/src/rules/no-off-grid-spacing.ts` -- spacing rule
- `packages/eslint-plugin-design/src/rules/no-off-scale-radius.ts` -- radius rule
- `packages/eslint-plugin-design/src/rules/no-off-scale-font-size.ts` -- font size rule
- `packages/eslint-plugin-design/src/rules/no-ai-aesthetic.ts` -- AI aesthetic rule

---

## Plan Reconciliation (spec vs reality)

| Spec assumption | Reality | Resolution |
|---|---|---|
| U10 depends on U9 (components restyled) | U9 does not exist yet; 477 files use old Lucid tokens (`--surface-0..7`, `--text-hi/lo/mid`), 83 use old radius tokens (`--r0..r3`) | All design lint rules are `warn` severity (not `error`), so violations will not fail `npm run verify`. U10 updates the rules; U9 will fix the component code. |
| AQ-112 references "nav rail" | IconRail component still exists but Hearth replaces it with Sidebar | Delete AQ-112 as specified. The underlying principle is covered by AI-aesthetic blacklist #14. |
| `SUB_GRID_VALUE` constant used by spacing rule | Referenced in `util.ts:29` and `no-off-grid-spacing.ts` | Remove the constant and the sub-grid check. Hearth has no 2px value. |
| `ALLOWED_NAMED_RADIUS` set in `util.ts:113` | Contains `{"none", "", "lg", "xl", "full"}` mapping old Lucid scale | Update to `{"none", "2xl", "full"}` for Hearth (0, 16px, 9999px) |
| `RADIUS_ALLOWLIST` in `util.ts:36` | Contains `{0, 4, 8, 12, 999}` | Update to `{0, 10, 16, 9999}` |
| `SPACING_ALLOWLIST` in `util.ts:22` | Contains `{0, 4, 8, 12, 16, 20, 24, 32, 40, 48}` | Update to `{0, 3, 6, 9, 12, 18, 24, 36, 48}` |
| `FONT_SIZE_ALLOWLIST` in `util.ts:43` | Contains `{11, 12, 13, 14, 15, 16, 18, 20, 24}` | Update to `{11, 12, 13, 14, 15, 16, 17, 18, 20, 24, 30}` |
| `ROUNDED_2XL_3XL` regex in `no-ai-aesthetic.ts:34` | Matches `rounded-(2xl|3xl)` | Change to match only `rounded-3xl` -- `rounded-2xl` is now on-scale |
| DESIGN.md says "4px baseline grid" at line 154 | Contradicts Hearth 6px grid | Fix to "6px baseline grid" |
| THEMES.md says "Spacing grid \| 4px baseline" | Contradicts Hearth 6px grid | Fix to "6px baseline grid" |
| PRINCIPLES.md line 179 references "Lucid Dark uses #111113" | Lucid is dead | Replace with "Hearth Dark uses #1a1510" |
| docs/ files reference Lucid theme | 5 files found via grep | Update all 5 to Hearth |
| Motion token name `--motion-medium` | tokens.css uses `--motion-default` (already Hearth-correct) | Update AESTHETICS.md references from `--motion-medium` to `--motion-default` |

---

## Security & Abuse Cases

| Check | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | N/A | No API endpoints changed |
| Input-trust boundary | N/A | No user input processing |
| Secret-handling | N/A | No credentials involved |
| Path-traversal | N/A | No path inputs |
| SSRF | N/A | No outbound URLs |

This workpackage is purely documentation and lint config. No runtime code, no API endpoints, no user-facing features. All security checks are N/A.

---

## Acceptance Criteria + Verification

### AC-1: aesthetic-quality.md updated
**Changes:**
- AQ-001: "4px grid" -> "6px grid {3,6,9,12,18,24,36,48}", remove 2px sub-grid
- AQ-003: "comfortable = default x 1.25" -> "comfortable = default x 1.5"
- AQ-011: "`--r0/r1/r2/r3` + pill" -> "`--r-none/r-subtle/r-default/r-pill`" (0/10/16/9999)
- AQ-012: "shadow restricted to overlays" -> "cards use --shadow-default; shadow-elevated for overlays"
- AQ-013: "80/150/250ms, cubic-bezier(0.2,0,0,1)" -> "120/240/450ms, cubic-bezier(0.25,0.1,0.25,1)"
- AQ-101: "No rounded-2xl/rounded-3xl" -> "No rounded-3xl" (rounded-2xl is on-scale)
- AQ-112: DELETE (rail rule)
- ADD AQ-018: No cool grays
- ADD AQ-019: System fonts only (no external font dependencies)
**Verification:** Read the file; verify each rule ID contains the Hearth values. `grep "4px\|Lucid\|--r0\|--r1\|--r2\|--r3\|80ms\|150ms\|250ms\|surface-1\b" .claude/rules/aesthetic-quality.md` returns zero matches.

### AC-2: frontend.md updated
**Changes:**
- "8-12px padding default" -> "Hearth spacing tokens for all padding"
- Verify aesthetic description references Hearth (already does)
- Verify component count is current
**Verification:** Read file; no Lucid references. `grep "Lucid\|8-12px" .claude/rules/frontend.md` returns zero.

### AC-3: design-system.md updated
**Changes:** Minor -- verify no Lucid references. Already Hearth-aware.
**Verification:** `grep "Lucid\|lucid" .claude/rules/design-system.md` returns zero.

### AC-4: DESIGN.md rewritten for Hearth
**Changes:**
- Line 154: "4px baseline grid" -> "6px baseline grid"
- Spacing common values table: update to Hearth grid values
- Typography allowlist: add 17px and 30px
- Anti-Patterns: update rounded-2xl text (no longer an AI tell)
**Verification:** `grep "4px baseline\|Lucid\|Geist\|{0,4,8,12" packages/design-system/DESIGN.md` returns zero.

### AC-5: PRINCIPLES.md updated for Hearth
**Changes:**
- Add "Hearth Design Principles" section with the four principles from 03-hearth.html
- Update Universal 2 lever list (mixed hierarchy)
- Update S4 (upgrade from surprise to Hearth core)
- Line 179: "Lucid Dark uses #111113" -> "Hearth Dark uses #1a1510"
- Remove monochrome status reference
**Verification:** File contains "Warmth signals trust", "Status through content", "Generous rounding", "Mixed hierarchy". No Lucid references.

### AC-6: THEMES.md updated
**Changes:**
- Shared Properties table: "Spacing grid | 4px baseline" -> "Spacing grid | 6px baseline"
**Verification:** `grep "4px" packages/design-system/THEMES.md` returns zero.

### AC-7: AESTHETICS.md updated
**Changes:**
- Add "U10 Hearth changelog" section (following K9/K11/K13 pattern)
- Override rows: grid base unit, sub-grid removal, radius scale, dark base surface, surface temperature, status colors, motion values, easing curve, font families, border widths
- Update AI-aesthetic items #1 and #10 for Hearth
**Verification:** File contains "U10" changelog section. `grep "no change.*4px\|Geist.*no change\|0/4/8/12.*no change\|80ms.*no change\|cool-neutral.*designer-call" packages/design-system/AESTHETICS.md` -- Hearth overrides must replace or annotate these rows.

### AC-8: ESLint plugin updated
**Changes in `packages/eslint-plugin-design/src/util.ts`:**
- `SPACING_ALLOWLIST`: `{0,4,8,...48}` -> `{0,3,6,9,12,18,24,36,48}`
- Remove `SUB_GRID_VALUE` constant
- `RADIUS_ALLOWLIST`: `{0,4,8,12,999}` -> `{0,10,16,9999}`
- `FONT_SIZE_ALLOWLIST`: add 17, 30
- `ALLOWED_NAMED_RADIUS`: `{"none","","lg","xl","full"}` -> `{"none","2xl","full"}`
- Update comments from Lucid to Hearth references

**Changes in rule files:**
- `no-off-grid-spacing.ts`: update messages, remove subGrid messageId and check
- `no-off-scale-radius.ts`: update messages and header comment
- `no-off-scale-font-size.ts`: no code change needed (reads from util constant)
- `no-ai-aesthetic.ts`: change `ROUNDED_2XL_3XL` from `/rounded-(2xl|3xl)/` to `/rounded-3xl/`, update `rounded2xl` message to `rounded3xl`, update `oversizedPadding` regex

**Changes in test files:**
- `__tests__/no-off-grid-spacing.test.ts`: update valid/invalid cases for 6px grid
- `__tests__/no-off-scale-radius.test.ts`: update valid/invalid cases for Hearth scale
- `__tests__/no-off-scale-font-size.test.ts`: move 17px from invalid to valid
- `__tests__/no-ai-aesthetic.test.ts`: move rounded-2xl from invalid to valid, update

**Verification:** `npm run test -- --all` passes; affected test files exercise Hearth values.

### AC-9: docs/ Lucid references updated
**Files:**
1. `docs/human-interface-layer/decisions.md` -- "Lucid theme" -> "Hearth theme"
2. `docs/ui-design/build-order.md` -- "author Lucid themes" -> "author Hearth themes"
3. `docs/ui-design/index.md` -- "Dark / Light / System (Lucid theme)" -> "Light / Dark / System (Hearth theme)"
4. `docs/ui-design/foundation.md` -- "`lucid-dark` and `lucid-light`" -> "`hearth-light` and `hearth-dark`"
5. `docs/architecture/the-human-interface-the-factory.md` -- "custom Lucid theme" -> "Hearth theme"
**Verification:** `grep -r "Lucid" docs/ | grep -vi "Lucide"` returns zero (exclude Lucide icon references).

### AC-10: npm run verify passes
**Verification:** Run `npm run verify` at the end. All tools pass.

---

## Ordered Task List

### Task 1: Update ESLint plugin constants and rules (most impactful, test-first)

**Step 1a: Update test files FIRST (TDD red phase)**

| File | Change |
|---|---|
| `packages/eslint-plugin-design/src/rules/__tests__/no-off-grid-spacing.test.ts` | Valid: change `p-[8px]` to `p-[6px]`, add `p-[3px]`, `p-[9px]`, `p-[18px]`, `gap-[36px]`. Invalid: change `p-[5px]` to `p-[5px]` (stays invalid), change `gap-[2px]` from `subGrid` messageId to `offGrid` messageId (2px is now just off-grid, not sub-grid), add `p-[4px]`, `p-[8px]`, `p-[16px]` as invalid (off the 6px grid), remove `subGrid` error expectations |
| `packages/eslint-plugin-design/src/rules/__tests__/no-off-scale-radius.test.ts` | Valid: replace `rounded-[4px]`, `rounded-[12px]`, `rounded-[999px]` with `rounded-[10px]`, `rounded-[16px]`, `rounded-[9999px]`. Remove `rounded` (4px) and `rounded-lg` (8px) and `rounded-xl` (12px) from valid. Add `rounded-2xl` to valid. Invalid: replace `rounded-[10px]` and `rounded-[16px]` with `rounded-[4px]`, `rounded-[8px]`, `rounded-[12px]`. Add `rounded`, `rounded-lg`, `rounded-xl` to invalid. Remove `rounded-2xl` from invalid. |
| `packages/eslint-plugin-design/src/rules/__tests__/no-off-scale-font-size.test.ts` | Move `text-[17px]` from invalid to valid. Add `text-[30px]` as valid. Add `text-[28px]` or `text-[22px]` as invalid. |
| `packages/eslint-plugin-design/src/rules/__tests__/no-ai-aesthetic.test.ts` | Move `rounded-2xl` from invalid to valid (and in cn() variant). Add `rounded-3xl` to invalid (it stays). Update expected messageId from `rounded2xl` to `rounded3xl` where applicable. |

**Step 1b: Update source files (TDD green phase)**

| File | Change |
|---|---|
| `packages/eslint-plugin-design/src/util.ts` | Update `SPACING_ALLOWLIST`, remove `SUB_GRID_VALUE`, update `RADIUS_ALLOWLIST`, update `FONT_SIZE_ALLOWLIST`, update `ALLOWED_NAMED_RADIUS`, update all comments |
| `packages/eslint-plugin-design/src/rules/no-off-grid-spacing.ts` | Remove `subGrid` message, remove 2px check, update docs and error messages |
| `packages/eslint-plugin-design/src/rules/no-off-scale-radius.ts` | Update docs/comments, update error messages |
| `packages/eslint-plugin-design/src/rules/no-ai-aesthetic.ts` | Change `ROUNDED_2XL_3XL` regex from `/rounded-(2xl\|3xl)/` to `/rounded-3xl/`, rename messageId from `rounded2xl` to `rounded3xl`, update message text |

**Step 1c: Run tests**
`npm run test -- --all` to verify all lint rule tests pass with the new values.

### Task 2: Update .claude/rules/ files

| File | Changes |
|---|---|
| `.claude/rules/aesthetic-quality.md` | Full rewrite per AC-1. See approved design section 2. |
| `.claude/rules/frontend.md` | Minor updates per AC-2. |
| `.claude/rules/design-system.md` | Verify Hearth-correct (likely no changes needed). |

No tests needed -- these are agent instruction files, not runtime code.

### Task 3: Update design-system documentation

| File | Changes |
|---|---|
| `packages/design-system/DESIGN.md` | Fix "4px baseline grid" -> "6px baseline grid". Update spacing values table. Add 17px, 30px to type scale. Update anti-patterns for rounded-2xl. |
| `packages/design-system/PRINCIPLES.md` | Add Hearth principles section. Update Universal 2. Update S4. Fix Lucid reference. Remove monochrome status. |
| `packages/design-system/THEMES.md` | Fix spacing grid from 4px to 6px. |
| `packages/design-system/AESTHETICS.md` | Add U10 Hearth changelog section with all override rows. |

No tests needed -- these are documentation files.

### Task 4: Update docs/ files with Lucid references

5 files with targeted find-replace. See AC-9 for the exact list.

No tests needed -- these are documentation files.

### Task 5: Verify

Run `npm run verify` to confirm all tools pass. The design lint rules are `warn` severity, so existing component code violations will not fail the build.

---

## Protected Tests

```
protectedTests: []
```

No existing tests are protected. We are MODIFYING test files (the lint rule tests) as part of this workpackage. The modified tests will have Hearth values instead of Lucid values.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Components using old token names trigger many lint warnings | Noisy but not blocking (warn, not error) | Expected. U9 will fix. |
| AESTHETICS.md is 492 lines with complex table structure | Easy to break formatting | Only add a new changelog section; do not rewrite existing rows. Use the K9/K11/K13 changelog pattern already in the file. |
| Some existing component code uses `rounded-lg` (8px) which is now off-scale | Lint warnings increase | Expected. U9 will migrate to `rounded-[var(--r-subtle)]` (10px) or `rounded-2xl` (16px). |
| `no-ai-aesthetic.ts` `rounded2xl` messageId rename | May break any code referencing this messageId | Only test files reference messageIds. Update tests in same commit. |
| DESIGN.md type scale allowlist update (add 17, 30) | Need to verify no other doc references the old list | Grep for the old allowlist string and update all occurrences. |

---

## Task Dependencies

```
Task 1 (lint plugin) → independent
Task 2 (rules files) → independent
Task 3 (design docs) → independent
Task 4 (docs/ files) → independent
Task 5 (verify)      → depends on Tasks 1-4
```

Tasks 1-4 are independent and can be committed separately. Task 5 is the final gate.

Recommended commit order:
1. `feat(U10): update ESLint plugin for Hearth token values` (Task 1)
2. `docs(U10): update Claude rules for Hearth aesthetic` (Task 2)
3. `docs(U10): update design system docs for Hearth` (Task 3)
4. `docs(U10): replace Lucid references in docs/` (Task 4)
5. Verify (Task 5 -- no commit, just validation)
