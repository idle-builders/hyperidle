# Code Review: U3 — Hearth Token System (Light + Dark)

**Verdict: DONE**

All acceptance criteria met. Implementation is correct against the architecture plan and the 03-hearth.html reference. No blocking issues.

---

## Lens 1: Architecture (Positive)

The implementation faithfully follows the architecture plan (sections 2-11).

**Token structure:** `@layer base` wrapper preserved. Shared tokens in `:root`, light mode in `:root, [data-theme="hearth-light"]`, dark mode in `[data-theme="hearth-dark"]`, system preference fallback in `@media (prefers-color-scheme: dark) { :root:not([data-theme]) }`. All per architecture section 2.

**Token naming:** Every token name matches the architecture plan section 3 mapping tables. Old Lucid tokens (`--surface-0..6`, `--surface-ghost`, `--text-hi/mid/lo`, `--primary`, `--warn`, `--ok`, `--danger`, `--float`, `--r0..r3`, `--motion-medium`, `--ui`, `--mono`, `--border-emphasis`) are gone. Tests explicitly assert both presence of Hearth tokens and absence of Lucid tokens.

**Token values:** Automated comparison confirms all light mode values match 03-hearth.html reference exactly. Dark mode values match architecture section 4.3 exactly. The `prefers-color-scheme: dark` media query block is a byte-for-byte duplicate of the hearth-dark block (verified programmatically). Font sizes correctly convert the reference's rem values to px at 16px base.

**HTML token file sync:** All checked shared and color token values match between `src/tokens.css` and `html/_tokens.css`. The sync test in Section 9 of the tests verifies this.

**Tasks delivered:** All 5 ordered tasks from the plan executed in order (failing tests first, then tokens.css rewrite, then HTML tokens update, then verify).

---

## Lens 2: Design (N/A)

No UI surface. Skipped per instruction.

---

## Lens 3: Security (Positive)

CSS custom properties with no injection surface. Token names use `[\w-]` characters only. No user input flows into CSS values. No URL values, no `@import` (Geist font import correctly removed). No risk.

---

## Lens 4: Adversarial (Negative)

**Consumer breakage:** The plan (section 10) acknowledges all consumer files will have broken `var()` references. Tests for token names assert old Lucid names are absent, preventing silent regressions. Downstream workpackages U4-U9 handle the migration. The app will look wrong but not crash (CSS fallback behavior). This is the correct tradeoff.

**Test robustness of `extractTokenValue`:** The helper uses `new RegExp(tokenName + '\\s*:\\s*([^;]+);')` which returns the first match in the CSS string. For light-mode value tests, this works because light-mode tokens appear first in the file. For dark-mode tests, the builder correctly extracts a substring starting from `[data-theme="hearth-dark"]` to isolate the dark block. Verified that `--surface-page` matches yield `#f5f0e6` (light) as first match, `#1a1510` (dark) as second.

**Missing `--mono` absence test:** The test at line 209 checks for Lucid `--ui` absence but does not check for `--mono` absence. The architecture plan section 9.1 maps `--mono` to `--font-mono`. While `--mono` is correctly absent from the implementation, the test gap means a future regression adding `--mono` back would not be caught. Non-blocking since the token is already gone.

**`extractThemeBlock` unused result:** In the "has :root default pointing to light mode" test (line 317), `extractThemeBlock` is called but its result is stored in `_lightBlock` (underscore-prefixed, unused). The test falls back to checking `indexOf` positions. The `extractThemeBlock` regex `[^}]*` cannot handle nested braces, which is why the fallback exists. The fallback approach (light color-scheme appears before dark) is a valid verification. The dead variable is minor clutter.

---

## Lens 5: Simplification (Negative)

**@lore comments are appropriate.** File-level comments document the light-mode text-tertiary contrast exemption, status token contrast exemption, dark-mode accent-primary button guidance, and the Lucid-to-Hearth structural change. Inline `@lore` comments at `--motion-ease`, `--leading-normal`, dark `--text-tertiary`, dark `--accent-primary`, dark `--status-error`, dark `--status-info`, density system, and `--density-card-gap` compact. All address architecture critique findings or non-obvious decisions. None are filler.

**WCAG contrast helpers in tests:** The `hexToSrgb`, `toLinear`, `relativeLuminance`, `contrastRatio` functions (60 lines) are purpose-built for the WCAG contrast tests. They implement the WCAG 2.1 algorithm correctly. No external dependency needed for 4 small functions. Appropriate scope.

**`isCoolTinted` heuristic:** Correctly adds a `isNearNeutral` guard to avoid flagging intentionally-blue status tokens. The architecture critique flagged this risk; the builder addressed it. The heuristic is documented as a smoke test.

Nothing over-engineered. No dead code beyond the `_lightBlock` variable mentioned above.

---

## Lens 6: AI Slop (Negative)

No unnecessary comments. No verbose naming. No defensive over-engineering (no null checks for non-nullable types, no try-catch around non-throwing code). No "TODO: implement", no "simplified version", no "for now". No `=== true`. No redundant else-return. No unnecessary async. No single-use helpers beyond test utilities that are used across multiple tests.

The `biome-ignore` comment on the `animation: none !important` rule includes a thorough justification citing WCAG SC 2.3.3, MDN, and Material 3. This is a required Biome suppression, not slop.

Clean.

---

## AC Completeness Audit

| AC | Expected | Status |
|---|---|---|
| tokens.css rewritten with Hearth tokens | Lucid blocks replaced entirely | PASS - all Lucid tokens removed, all Hearth tokens present, tests assert both |
| Light mode matches 03-hearth.html values | surface-page=#f5f0e6, accent-primary=#16764f, etc. | PASS - automated comparison of all mappable reference tokens shows exact match |
| Dark mode warm earth tones, WCAG AA | All text tokens >= 4.5:1 | PASS - 6 contrast tests pass; text-primary 14.50:1/11.99:1, text-secondary 6.45:1/5.33:1, text-tertiary 5.65:1/4.67:1 |
| Radius: none=0, subtle=10px, default=16px, pill=9999px | Values correct | PASS - test assertions verify exact values |
| Spacing: 6px grid (3/6/9/12/18/24/36/48px) | All space-* correct | PASS - spacing grid tests verify all 8 values with 3px half-grid compliance |
| Shadows: warm-tinted | rgba brown base in light, black in dark | PASS - light: rgba(44, 36, 26, ...), dark: rgba(0, 0, 0, ...) |
| Border widths: thin=1px, default=1.5px, strong=2.5px | Values correct | PASS - --bw-thin/default/strong present with correct values |
| Motion: fast=120ms, default=240ms, slow=450ms | Values correct | PASS - test assertions verify exact values |
| Typography: system-ui stack, weights 400/500/600/700 | Sizes 12/13/15/17/20/24/30px | PASS - all 7 size stops, 4 weights, system-ui font stack, no Geist |
| Density presets on 6px grid | Values are 6px multiples | PASS - density grid test verifies all values; 3px card-gap compact documented |
| data-theme="hearth-light" and "hearth-dark" selectors | Both exist | PASS - test assertions verify presence of both, absence of lucid-dark/lucid-light |
| Default follows prefers-color-scheme | prefers-color-scheme: dark query | PASS - media query present, values match hearth-dark exactly |
| Token tests updated for Hearth values | All tests pass | PASS - 46 test cases, all green |

---

## Architecture Critique Findings Addressed

The Phase 2 architecture critique raised several items. The builder addressed them:

1. **CRITICAL: Light mode status tokens WCAG contrast** -- Builder added `@lore` comments documenting the exemption (file-level + inline). Test file has a comment block (line 511-514) explicitly stating these are exempt with rationale. Correct handling.

2. **WARNING: Dark mode text-on-accent contrast** -- Builder added `@lore` comment noting dark-mode buttons should use light-mode accent value. Documented at file level and in test file.

3. **WARNING: leading-body / leading-normal dual-token** -- Builder added inline `@lore` at `--leading-normal` (line 79-82) explaining the relationship. Addressed.

4. **WARNING: Density rem-to-px change** -- Builder added `@lore` in the density block header (line 263-268) noting the unit change from rem to px. Addressed.

5. **WARNING: Omitted reference tokens** -- `--ds-duration-instant` (0ms) and `--ds-easing-expressive` remain omitted. The architecture plan acknowledged this as scope control. Not a defect.

6. **SUGGESTION: Value assertions** -- Builder added explicit value assertions for surfaces, accents, radii, motion (Section 3 of tests). Addressed.

7. **SUGGESTION: Protected tests declaration** -- Builder added `@protected` annotation at the top of the test file. Addressed.

---

## Non-Blocking Observations

1. The `--mono` Lucid token absence is not tested (only `--ui` is checked). Low risk since the token is factually absent.

2. The `_lightBlock` variable on test line 317 is assigned but unused. Biome would normally flag this, but it is suppressed by the underscore prefix convention. No action needed.

3. Two reference HTML tokens (`--ds-duration-instant`, `--ds-easing-expressive`) are not implemented. The architecture plan explicitly omitted them. If needed later, they should be added as `--motion-instant` and `--motion-expressive`.
