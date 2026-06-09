# AE2 Design Critique -- Team Creation & Onboarding Journey

DESIGN-CRITIQUE: variant=single-scroll-presets score=8/10 rounds=1 axes: H:8 S:8 T:9 C:8 Co:8 St:9 A:8 AS:9 PP:8

---

## Scoring Breakdown

### 1. Visual Hierarchy (8/10)

The reading order is clear: brand > illustration > heading > form fields > new sections (textarea, team focus, roster preview) > submit. The preset pills sit in a natural hierarchy below the required fields, and the roster preview line acts as a quiet confirmation.

The "What are you building?" textarea and "Team focus" section are correctly weighted as secondary (optional) relative to name/API key (required). The label hierarchy (13px/500 for field labels, 12px for hints) follows the established pattern.

Minor: the roster preview line at 12px/400 tertiary is appropriately quiet but could visually compete with the hint text above the presets ("Pick a starting point. You can add agents later.") since both are 12px tertiary. This is not a real problem -- they serve different roles and are spatially separated.

### 2. Spacing & Density (8/10)

All spacing values are on the Hearth 6px grid: 6px gaps within pill groups, 9px between hint and pills, 18px section spacing, 3px within chips. The 1.5px border thickness matches the Hearth standard.

WARNING: The custom chip vertical padding is `py-[3px]` which yields a total chip height of approximately 12px font + 6px padding + 3px border = ~21px. At viewport <= 1024px, this likely falls below the 44px touch target minimum (AQ-015). The preset pills (`py-[6px]`) are closer but still possibly short at ~27px. See Accessibility.

### 3. Typography (9/10)

All font sizes are on-scale: 13px labels (sm), 12px hints (xs), 15px body text (base), 12px roster preview. Font weights are 400/500 only. The design correctly avoids 600/700 weights for form labels.

No issues found.

### 4. Color Usage (8/10)

All colors reference semantic tokens: `--text-primary`, `--text-secondary`, `--text-tertiary`, `--accent-primary`, `--surface-elevated`, `--border-default`. The selected pill uses `rgba(22,118,79,0.06)` which is a correct 6% tint of `--accent-primary` (#16764f).

WARNING: The `rgba(22,118,79,0.06)` value is a hardcoded RGBA derived from the accent color. If the theme switches to dark mode (where accent-primary is `#2eaa7a`), this tint will be wrong -- it will still use the light-mode accent. This should be a token or CSS custom property, not a hardcoded RGBA. The design should specify this as a token-derived value (e.g., `color-mix(in srgb, var(--accent-primary) 6%, transparent)`).

### 5. Component Coherence & Consistency (8/10)

The design correctly reuses existing Input, Button, and DaisyUI textarea. The preset pills and custom chips are page-level composition, not new components -- this is the right call for a one-off use in the setup flow.

The pill styling (border-1.5px, r-pill, surface-elevated bg, border-default border) is consistent with the Hearth border and radius system.

CRITICAL: The preset table for "Full team" is wrong. The design says `["development", "product", "design", "marketing"]` produces "Builder, Designer, Growth, Product Manager, QA Engineer" (5 agents). The actual `defaultRoster()` output is "Brand Voice, Builder, Content Writer, Designer, Growth, Product Manager, QA Engineer" (7 agents). The design omits Brand Voice and Content Writer. This matters because the roster preview will show 7 agents, not 5 -- the visual length and first-impression of the "Full team" preset will be different from what the design predicts.

### 6. States & Feedback (9/10)

The states matrix (section 4) is thorough: Initial, Partial, Ready, Custom expanding, Custom selecting, Submitting, Error, Success. All 8 states are specified with visual descriptions.

The custom chips section has a 240ms slide-down animation (--motion-default) which is correct. The pill border/color transitions use --motion-fast which is appropriate for micro-interactions.

The submitting state disables all fields + pills (correct). The error state shows red text below submit (correct). The success state unmounts the page (correct).

### 7. Accessibility (8/10)

Good: `role="radiogroup"` and `role="radio"` + `aria-checked` on preset pills. `role="button"` + `aria-pressed` on custom chips. `aria-label` on textarea. Arrow key navigation on presets. Space/Enter for selection.

WARNING: Touch targets. The preset pills at `py-[6px]` with 13px text are approximately 25-27px tall. The custom chips at `py-[3px]` with 12px text are approximately 18-21px tall. Both are well below 44px on any viewport. AQ-015 requires >= 44px at viewport <= 1024px. The design needs to specify mobile-adaptive padding or minimum heights for these interactive elements.

WARNING: The textarea at 15px font-size is below the 16px iOS zoom threshold at viewport <= 768px (AQ-005). The design should note that the textarea needs `text-[16px]` at small viewports to prevent iOS Safari auto-zoom.

### 8. Anti-Slop Check (9/10)

No AI-aesthetic tells detected. The design:
- Uses left-aligned layout (not centered hero)
- Uses warm tokens throughout (not generic Material)
- Has no oversized padding (48px card padding is the existing pattern, not introduced here)
- No gradient backgrounds, no glass morphism
- No emoji icons
- The preset pills are distinctive (pill-shaped with accent border) rather than generic cards or radio buttons

The design explicitly rejects multi-step wizard, card grid, and tutorial overlays -- all common AI-generated patterns.

### 9. Premium Polish (8/10)

The motion specifications are correct (--motion-fast for pill transitions, 240ms for custom chip expansion). The pill interaction uses border-color + background + color transition.

The roster preview uses 12px/400 tertiary -- this is appropriately muted informational text.

Minor: No specification for the preset pill hover state. The design specifies selected and unselected states but not hover. Interactive elements need visible hover feedback (Principle 6 of PRINCIPLES.md). The builder will need to infer a hover state (likely `border-[var(--border-strong)]` or a subtle background shift).

---

## Findings

### CRITICAL

1. **[design/approved.md:76-78] Full team preset roster mismatch.** The design table says Full team creates "Builder, Designer, Growth, Product Manager, QA Engineer" (5 agents). The actual `defaultRoster(["development", "product", "design", "marketing"])` returns 7 agents: Brand Voice, Builder, Content Writer, Designer, Growth, Product Manager, QA Engineer. Brand Voice and Content Writer are missing from the design table. This will cause the roster preview to show more agents than the design expects, and may affect the visual layout. The builder must use the real `defaultRoster()` output, not the design table. The design table should be corrected.

### WARNING

2. **[design/approved.md:88-100] Preset pill hover state missing.** No hover specification for pills. Interactive elements require visible hover/focus states (PRINCIPLES.md Universal 6). The builder must define a hover treatment -- recommend `border-[var(--border-strong)]` and `text-[var(--text-primary)]` on hover.

3. **[design/approved.md:96-98] Hardcoded accent tint RGBA.** The selected pill uses `bg-[rgba(22,118,79,0.06)]` which hardcodes the light-mode accent-primary hex values. This breaks theme portability. Should use a token-derived approach or at minimum acknowledge this is light-mode-only.

4. **[design/approved.md:119-120, 88-100] Touch target minimum violation.** Preset pills (~27px tall) and custom chips (~21px tall) are below 44px AQ-015 minimum at viewport <= 1024px. The design should specify mobile-adaptive min-height or additional padding.

5. **[design/approved.md:55] iOS textarea zoom.** The textarea at 15px font-size will trigger iOS Safari auto-zoom at viewport <= 768px (AQ-005 violation). Should be 16px at mobile viewports.

### SUGGESTION

6. **[design/approved.md:33] "What are you building?" field placement.** The textarea is placed between repo path and team focus. Since it informs the welcome message content (per architecture Task 5), consider placing it after team focus so the user has already selected their team composition before describing what they are building. This is a minor flow optimization, not a requirement.

7. **[design/approved.md:252-258] Mobile adaptation could be more specific.** The mobile section says "flex-wrap handles it naturally" which is true for layout but does not address the touch target and font size issues flagged above. A more complete mobile spec would specify min-height on pills/chips at narrow viewports.

---

## What is Working Well

1. **Presets collapse the decision space.** Offering 5 bundles instead of forcing 8 individual function choices is excellent first-use UX. The "Custom" escape hatch preserves power-user flexibility without burdening newcomers.

2. **Zero new components.** The entire design is composed from existing primitives and page-level styling. This keeps the component budget at zero, which is proportionate to the scope of changes.

3. **Post-setup flow is well-conceived.** The `?onboarding=true` param triggering the Assistant overlay with a seeded welcome message creates a cohesive handoff from setup form to conversational guidance, using existing infrastructure (CocOverlay, assistant thread).

---

## Verdict

Score 8/10 -- passes the >= 7 threshold. The one CRITICAL finding (roster table mismatch) is a factual error in the design documentation, not a design quality issue. The builder must use `defaultRoster()` output directly rather than trusting the design table values. The WARNING findings on touch targets and hardcoded RGBA are real accessibility and theme concerns that should be addressed during implementation but do not block advancement.
