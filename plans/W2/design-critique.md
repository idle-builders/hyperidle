# W2 Design Critique

DESIGN-CRITIQUE: variant=bottom-up-trickle score=8/10  rounds=1  axes: H:9 S:8 T:9 C:8 Co:9 St:7 A:7 AS:9 PP:8

## Summary

W2 is a routine classification with fixed visual targets (HTML reference files). The design variant is an implementation strategy, not a visual direction. The "Bottom-Up Trickle" strategy is the correct and only sensible approach for design system parity work. The spec is thorough, well-researched, and grounded in codebase reality. The designer correctly identified the density removal scope, token sync direction, and the dependency graph for primitives. Findings below are contract gaps that the builder must account for, not fundamental flaws.

---

## CRITICAL

### C1: data-component vs data-ds-component mismatch

The approved design spec (Part 3) states every new primitive uses `data-ds-component` (e.g., `data-ds-component: "Avatar"`). The visual regression test (`visual-regression.test.ts` line 469) asserts the presence of `data-ds-component` markers. But the W1 HTML reference files for all new Tier 0 primitives use `data-component` -- not `data-ds-component`:

- `Avatar.html` line 94: `data-component="Avatar"`
- `Button.html` line 121: `data-component="Button"`
- `Toggle.html` line 72: `data-component="Toggle"`
- `Input.html` line 88: `data-component="Input"`

Meanwhile, existing components that already have TSX (ThreadRow, BetCard, etc.) use `dsProps()` which emits `data-ds-component`. And the existing HTML files for those components (StatusChip.html, Tag.html, etc.) DO use `data-ds-component`.

The new Tier 0 HTML files were written with the old `data-component` convention. The visual regression marker test will fail for every new primitive because it looks for `data-ds-component` on the HTML page and finds `data-component` instead.

**Impact:** The builder must either (a) update the HTML files to use `data-ds-component` (permitted per visual-parity.md -- adapting for renderability/data attributes is allowed, just not styling changes), or (b) adjust the marker test. Option (a) is the correct fix -- it aligns with the existing TSX convention and existing HTML convention for Tier 1+ components.

### C2: AvatarGroup small variant implementation gap

The design spec says AvatarGroup `small` uses "24px avatars, -6px overlap." But in Avatar.html, the 24px size is achieved via CSS specificity override: `.avatar-group--sm .avatar` sets `width: 24px; height: 24px` regardless of the Avatar's own size prop. The demo even passes `size="sm"` (28px) to the children, relying on the parent override.

The TSX implementation cannot replicate this pattern with Tailwind utilities in the same way -- there is no parent-context CSS override for child component styles when using inline Tailwind. The spec's TypeScript interface for AvatarGroup (`children: ReactNode, small?: boolean`) does not address how the 24px override propagates to Avatar children.

**Impact:** The builder must decide between: (a) having AvatarGroup use a React context or `cloneElement` to force size on children, (b) relying on CSS overrides via a wrapper class + Tailwind child selector utilities, or (c) requiring callers to pass size="sm" and having AvatarGroup apply the 24px override via CSS. The architecture plan (Task 4a) does not address this mechanism. This is a design-to-implementation gap.

---

## WARNING

### W1: density-row-h regression from 44px to 42px unaddressed in token migration table

The density-default `--density-row-h` in `tokens.css` is 44px (line 290), which satisfies AQ-015's 44px touch-target floor. The Hearth value from `_tokens.css` is 42px (line 76). The token migration table in the spec maps `--density-row-h` to "42px" but the AQ-015 rule requires 44px minimum at viewport <= 1024px.

The design brief's section on Mobile Adaptation acknowledges this ("Default row height (42px) is close to but slightly below the 44px AQ-015 minimum") and the architecture plan's Risk 1 says "where they don't [clear 44px], add explicit `min-h-[44px]`." But neither the design spec nor the architecture plan specifies WHICH components need the min-height fix. The touch-target E2E tests will catch this, but the builder has no explicit list of which interactive elements to patch.

**Recommendation:** The builder should audit every interactive list-row primitive (ThreadRow, NavItem, KnowledgeRow, NotificationRow) after the density strip and verify computed height >= 44px at mobile viewports. Any that fall short need explicit `min-h-[44px]`.

### W2: AQ-002 and AQ-003 removal scope incomplete

The approved design spec says "Remove AQ-002, AQ-003, AQ-016, AQ-017" from `.claude/rules/aesthetic-quality.md`. However, the current `aesthetic-quality.md` already has AQ-003 rewritten to say "One size per component -- There is no density system." The AQ-002 in the current file is about "No cool grays" (not about density tokens). The AQ numbers in the design spec appear to reference older content.

Looking at the actual file:
- AQ-002 (line 15): "Density tokens for component internals" -- this IS density-related and should be removed
- AQ-003 (line 16): "Density tier ladder is coherent" -- this IS density-related and should be removed
- AQ-016 (line 29): "Auto-density" -- this IS density-related and should be removed
- AQ-017 (line 30): "Density-aware components" -- this IS density-related and should be removed

But AESTHETICS.md AQ-003 has ALREADY been rewritten to "One size per component" with no density language. The two files are out of sync on AQ numbering. The builder must cross-reference both files carefully during the density strip. The `aesthetic-quality.md` rules file is the one that gets removed; the AESTHETICS.md has already been updated.

### W3: Input mobile font size risk

The design spec for Input (Part 3) specifies 15px font size, matching the HTML reference. But AQ-005 requires "Mobile inputs >= 16px font-size at viewport <= 768px" (iOS Safari zoom mitigation). The spec does not include a responsive override for mobile.

The existing `aesthetic-quality.md` AQ-005 and the `require-mobile-input-size` lint rule will catch this, but the design spec should have acknowledged the need for a `@media (max-width: 768px)` override to 16px on input elements, or documented why 15px is acceptable.

### W4: Tooltip deferred but not tracked

The design correctly defers Tooltip to a follow-up workpackage. But no follow-up workpackage ID or tracking reference is given. If the deferral is not captured in the pipeline manifest, it will be forgotten.

---

## SUGGESTION

### S1: Page gutter value inconsistency

The token migration table maps `--density-page-gutter` (16px) to "18px (--space-6)" per `_tokens.css`. But the approved design spec (Part 1, Token Migration table) maps it to "--space-8 (24px) per DESIGN.md page gutter." These are different values (18px vs 24px). The `_tokens.css` value is 18px; the DESIGN.md likely specifies 24px for the page gutter in screen layouts.

The builder should verify the correct page gutter value per-context: `_tokens.css` says 18px for the generic token, but individual screen mockups may use 24px for the actual page gutter. The HTML reference for each page is the arbiter.

### S2: Consider documenting the "no DaisyUI form primitives" decision as lore

The rejection of DaisyUI's `.input`, `.select`, `.toggle`, `.checkbox` classes in favor of custom CSS is a significant architectural decision. The reasoning (Hearth styling diverges from DaisyUI defaults) should be captured as a `@lore` comment in the relevant component files so future agents do not attempt to "simplify" by switching to DaisyUI primitives.

### S3: Button forwardRef rationale

The architecture plan says Button uses `forwardRef` while no other primitive does. The rationale (focus management, tooltips, popovers) is sound but should be explicit in the component file as a `@lore` comment, since "why does only Button have forwardRef?" is a question future agents will ask.

---

## What's Working Well

1. **Density scope audit is exhaustive.** The designer identified all 10 files to delete, all test files with density assertions to surgically remove, all 73 density token references across two packages with per-file replacement maps. This is the kind of thorough inventory that prevents "grep shows 3 remaining references after the density strip" surprises.

2. **Token sync direction analysis is correct and nuanced.** The designer correctly identified that `_tokens.css` has stale `--tracking-caps: 0.02em` while `tokens.css` has the correct `0.08em`, making the sync bidirectional rather than one-way. The missing `--easing-expressive` token was identified by reading the Toggle HTML inline CSS. This level of cross-referencing between files is exactly what prevents token drift.

3. **Bottom-up strategy is well-argued.** The dependency graph (Tier 0 -> Tier 1 -> Tier 2 -> Tier 3) with consumer counts driving build order (Avatar first because it has the most consumers) means the ds:sync gate can verify each component incrementally. The trade-off section honestly acknowledges the serialization constraint.

---

## Verdict

Score 8/10. The design is thorough, well-grounded, and correctly classified as routine. The two critical findings (data attribute mismatch, AvatarGroup small variant implementation gap) are solvable during implementation but represent contract gaps the builder must address. The warnings about touch-target regression and input mobile font size are real risks that the existing test infrastructure should catch. Advances to architecture.
