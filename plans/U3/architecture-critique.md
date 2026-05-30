# Architecture Critique: U3 — Hearth Token System (Light + Dark)

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:10 AC:N/A DM:N/A N:8 MD:10 FMC:7 S:8 V:7

---

## Dimension Scores

### 1. Spec Alignment — 9/10

Every AC from the spec maps to a plan task. The plan covers:
- tokens.css rewrite (Task 2, sections 4-7)
- Light mode matching 03-hearth.html values (section 4.2, verified against reference)
- Dark mode with warm earth tones and WCAG contrast (section 4.3)
- All specified token categories: radius, spacing, shadows, borders, motion, typography, density
- Both data-theme selectors (sections 4.2, 4.3)
- Test updates (section 9, Task 1)

One near-miss: the AC says "light mode matches 03-hearth.html values" but the reference HTML file (`packages/design-system/03-hearth.html`) exists only in the main repo, not in the worktree. The plan must note this as a build-time dependency (the builder needs access to this file for value verification). Not blocking because the values are fully specified in section 4.2.

Two tokens from the reference HTML are omitted from the plan: `--ds-duration-instant` (0ms) and `--ds-easing-expressive` (cubic-bezier(0.34, 1.56, 0.64, 1)). These are not in the AC list, so omitting them is defensible scope control. But the plan should explicitly note the omission with rationale (they are used in the reference HTML's toggle animation).

### 2. Layer Integrity — 10/10

This workpackage touches only CSS token files and their tests. No cross-layer violations possible. The plan explicitly scopes out consumer updates (section 10). Clean.

### 3. API Contracts — N/A

No API routes. Score excluded from average.

### 4. Data Model Alignment — N/A

No database changes. Score excluded from average.

### 5. Naming — 8/10

Token naming is mostly excellent. The plan provides a complete Lucid-to-Hearth mapping table (section 3) that is thorough and well-organized. Semantic names like `surface-page`, `text-primary`, `accent-primary` are self-documenting.

Two naming concerns:

1. **Border width prefix `--bw-*`:** The plan's self-critique (section 12) acknowledges `bw` is cryptic and defends it as "brief." The reference HTML uses `--ds-border-width-thin/default/strong` which, after dropping the `--ds-` prefix, becomes `--border-width-thin` -- unambiguous and only 7 characters longer. The plan's `--bw-` saves bytes at the cost of readability. The plan should use `--bw-thin/default/strong` as specified (brevity wins for a 3-token set that lives in a clearly labeled CSS section), but this is a judgment call, not a defect.

2. **`--leading-body` in density vs `--leading-normal` in shared tokens:** Section 3.10 maps Lucid's `--leading-body` to `--leading-normal` (1.55). But section 5 density presets define `--leading-body: 1.55/1.5/1.6` per tier. This is actually correct -- `--leading-normal` is the shared base value, `--leading-body` is the density-overridable consumption alias. But the plan never explains this dual-token relationship. A builder reading section 3.10 ("--leading-body maps to --leading-normal") and then section 5 (which still uses `--leading-body`) would be confused.

### 6. Module Depth — 10/10

One CSS file defines all tokens. One test file validates them. The interface is the CSS custom property namespace -- small, well-named, consumed via `var()`. No unnecessary abstraction. The density system is the right level of structure for three tiers with 12+ tokens each.

### 7. Failure-Mode Coverage — 7/10

**What the plan covers well:**
- WCAG contrast math is exhaustive for dark mode, with every ratio independently computed and documented (section 4.3).
- The breaking-change impact analysis (section 10) identifies all consumer files and explicitly scopes them to downstream workpackages.
- The self-critique (section 12) addresses real design tensions.

**What the plan misses:**

CRITICAL: Light mode status colors fail WCAG AA when used as text. The plan validated dark mode contrast exhaustively but did not validate light mode status/accent tokens against light surfaces:
- `--status-warning` (#d97706) on `--surface-page` (#f5f0e6): **2.80:1** -- fails even AA-Large
- `--status-error` (#dc4a3a) on `--surface-page` (#f5f0e6): **3.64:1** -- fails AA normal
- `--status-info` (#2e7dba) on `--surface-page` (#f5f0e6): **3.89:1** -- fails AA normal

These values come directly from the reference HTML. The plan should document these known contrast limitations for light mode status tokens and note that they are acceptable only when used as decorative/icon color or when paired with a contrasting label, not as standalone text on warm surfaces. This is not a plan defect per se (the values match the reference), but the plan's WCAG test spec (section 9.1) only validates dark mode text tokens. It should either add light mode status token tests or document why they are excluded.

WARNING: Dark mode `--text-on-accent` (#ffffff) on `--accent-primary` (#2eaa7a): **2.94:1** -- fails even AA-Large (3:1). The plan's section 12 discusses this but claims "3.32:1" for white on `--accent-primary-hover` (#20a070), which is correct and passes AA-Large. However, the plan leaves the primary button contrast problem unresolved for dark mode: `--text-on-accent` on `--accent-primary` is the natural token pairing for buttons, and it fails. The plan says "U3 defines the tokens; U4/U7 wire them to the right contexts" but doesn't provide a token that dark-mode buttons CAN use at AA. The light-mode value (#16764f) at 5.62:1 with white would work. The plan should note that dark-mode button backgrounds should use `--accent-primary-hover` at minimum (3.32:1, AA-Large) or a dedicated button-bg token should be added in U4/U7.

### 8. Simplicity / Over-Engineering Risk — 8/10

The plan is appropriately scoped. It does not introduce abstractions, compatibility shims, or feature flags. The "no cool grays" test (section 9.1) is a smart invariant test -- it prevents regression without adding runtime cost.

Minor concern: The "no cool grays" heuristic (`B <= R + 20`) is specified but may be too permissive for near-white colors like `--text-primary` dark (#ede5d8) where R=237, B=216 -- B is well under R+20 (257) but the color is warm by perception, not by channel arithmetic at high lightness. The heuristic works for the current values but the builder should understand it's a smoke test, not a proof.

### 9. Verifiability — 7/10

**Well-specified tests:**
- Token name existence assertions (section 9.1) with exact lists per category.
- Theme block existence tests (hearth-light, hearth-dark selectors).
- Media query change test (prefers-color-scheme: dark).
- Sync test update (HTML token file mirrors src token file).
- WCAG contrast validation test with specific ratios and surface pairs.
- No-cool-grays invariant test.
- 6px grid compliance test.

**Gaps:**

1. **No explicit test for token VALUES, only names.** Section 9.1 lists which token names to assert, and the WCAG test implicitly checks some values via contrast math, but there is no test asserting that `--surface-page` equals `#f5f0e6` or that `--r-default` equals `16px`. The current Lucid tests also only check names, so this is not a regression -- but the AC says "light mode matches 03-hearth.html values" and the only way to verify that is to test specific values. The plan should add explicit value assertions for at least the surface and accent tokens in both modes.

2. **Missing protected-tests list.** The plan doesn't enumerate which test contracts are frozen and must not drift. Given that U4-U9 will update consumers, the token tests themselves ARE the protected set. The plan should state this.

3. **Density values use px in plan, rem in current code.** The current tokens.css uses rem values (e.g., `--density-pad-x: 1rem`). The plan specifies all density values in px (e.g., `--density-pad-x: 18px`). This is a unit change that the plan doesn't acknowledge. At 16px base font size, `1rem = 16px` not `18px`. The plan's 18px is a different VALUE (bigger padding) not just a unit conversion. The plan should explicitly note this is an intentional value change (6px grid alignment), not an incidental unit change, and the tests should validate the exact values.

---

## CRITICAL

1. **[plan section 9.1]** The WCAG contrast validation test only covers dark mode text tokens and text-on-accent in light mode. Light mode status and accent tokens used as text on warm surfaces fail AA (status-warning: 2.80:1, status-error: 3.64:1, status-info: 3.89:1 on surface-page). The plan must either: (a) add these pairs to the WCAG test with explicit AA-Large-only or decorative-only annotations, or (b) document that these status tokens in light mode are icon/badge-only and never used as standalone text on surface-page/container. The builder needs this guidance to write correct tests.

## WARNING

1. **[plan section 4.3, section 12]** Dark mode `--text-on-accent` (#fff) on `--accent-primary` (#2eaa7a) is 2.94:1 -- below AA-Large (3:1). The plan acknowledges the tension but leaves the resolution to U4/U7 without specifying what token pairing buttons should actually use. Add a note: "Dark mode buttons should use the light-mode accent value (#16764f) as background, not the dark-mode `--accent-primary` which is optimized for text contrast on dark surfaces, not as a button background. U7 should define a `--accent-primary-bg` or similar for this purpose."

2. **[plan sections 3.10, 5]** The `--leading-body` / `--leading-normal` dual-token relationship is implicit. Section 3.10 says `--leading-body` maps to `--leading-normal`, but section 5 keeps using `--leading-body` in density presets. Add a one-line note: "`--leading-normal` is the base value in :root; `--leading-body` is the density-overridable alias that tiers set to 1.55/1.5/1.6."

3. **[plan section 4.1]** Two tokens from the reference HTML are omitted without acknowledgment: `--ds-duration-instant` (0ms) and `--ds-easing-expressive`. If they are out of scope, say so. The AC says "light mode matches 03-hearth.html values" which could be interpreted to include all tokens defined in the reference.

4. **[plan section 5]** Density values change from rem to px AND change magnitude (e.g., `--density-pad-x` from `1rem`/16px to `18px`). The plan does not note the unit change or the magnitude change. Both are intentional (6px grid alignment) but the builder needs to know this is not just a unit conversion.

## SUGGESTION

1. **[plan section 9.1]** Add explicit value assertions for surface tokens in both modes (e.g., assert `--surface-page` contains `#f5f0e6` in hearth-light block). Name-only tests don't catch wrong values.

2. **[plan section 9.1]** Add a protected-tests declaration: "All token tests in this file are protected. Token name sets and WCAG ratios must not drift without plan-level approval."

3. **[plan section 3.6]** The border width tokens use three different naming patterns in the plan itself: `--border-thin` / `--border-w-default` / `--border-strong-w` (section 3.6 table), then `--bw-thin` / `--bw-default` / `--bw-strong` (section 3.6 naming note and section 4.1 code). The table in section 3.6 should be updated to match the final decision (`--bw-*`).

4. **[plan section 4.1]** `--accent-primary-dim` is defined in the plan (`rgba(22, 118, 79, 0.08)`) but does not appear as a named token in the reference HTML -- the reference uses the raw rgba value inline. This is a good tokenization decision, but note it as a plan addition beyond the reference.

---

## What's Working Well

1. **Exhaustive dark-mode WCAG analysis.** The plan independently computes every contrast ratio, documents deviations from the U0 concept with reasoning, and shows its work. The self-critique section (12) is genuinely useful -- it addresses real tensions (text-tertiary AA requirement, accent-primary dark shift, border decorative exemption) with cited rationale. All dark-mode ratios verified correct.

2. **Clean breaking-change management.** Section 10 explicitly identifies all consumer files, states that U3 does NOT update them, explains the consequence (visual breakage, not crashes), and traces the fix to specific downstream workpackages (U4, U7-U9). This is the right way to handle a token system replacement -- the plan does not try to do too much.
