# Design Critique: W1 — Hearth Foundation Design

DESIGN-CRITIQUE: variant=hearth-foundation score=8/10 rounds=1 axes: H:9 S:8 T:9 C:8 Co:8 St:7 A:6 AS:9 PP:7

## Overall Assessment

The designer has produced a cohesive, high-quality set of HTML reference files that genuinely capture the 03-hearth.html feeling. The warm cream canvas, forest green accents, earthy shadows, generous rounding, and pill-shaped buttons are consistent across all 32 changed files. The design language is unmistakably from the same family as 03-hearth.html. The screen mockups are realistic, well-structured, and use realistic content throughout. The DESIGN.md manifesto and AESTHETICS.md rules are strong artifacts that will serve W2 well.

The score of 8/10 reflects genuinely good work with specific gaps in accessibility and states coverage that need attention before the builder starts.

---

## Dimension Scores

### 1. Visual Hierarchy — 9/10

Strong hierarchy across all screens. Page titles at 20px/600 weight dominate. Section headers use the Hearth hallmark treatment (12px uppercase, 0.06em letter-spacing, tertiary color) as quiet structural markers. Thread rows show clear reading order: unread dot draws eye, bold title for unread, muted preview below, metadata pushed right. Bet cards use status dot + badge at top, title below, description below that, progress bar, then footer with avatars/percentage. The hierarchy is identical to 03-hearth.html.

Knowledge detail screen has a particularly good hierarchy: breadcrumb > title > badges > body content, with the aside metadata card receding appropriately.

### 2. Spacing & Density — 8/10

Spacing follows the 6px grid faithfully. Card padding is 18px, page gutter is 24px, thread row padding is 12px/24px, avatar default is 36px, button padding is 10px/18px — all matching the spec exactly. Gaps use 6px, 9px, 12px, 18px from the grid.

The onboarding card uses 48px padding, which is generous but appropriate for the welcoming context. Empty states use 36px padding consistently.

One concern: the bet-detail screen packs stats row + description + 5 task rows + comment input into a single scrollable area with 24px padding. This works but the vertical density feels higher than other screens. The gap between sections is 24px, which matches `--space-8`, so it is on-grid.

### 3. Typography — 9/10

The type scale is applied correctly throughout. Page titles: 20px/600. Card titles: 17px/600. Body: 15px/400. Labels: 13px/500. Metadata: 12px/tertiary. Mono used correctly for percentage labels (`font-family: var(--font-mono)` on progress values), error detail blocks, and section labels use uppercase with letter-spacing.

The heading signature (uppercase, wide letter-spacing, tertiary color) is applied consistently across sidebar labels, form section titles, topic headers, and demo section titles.

One finding: the `_tokens.css` base font-size is set to `14px` (line 222), but the type scale starts at 12px/13px/15px. The body size of 14px in the root does not match any step in the scale. The designer's components all use explicit font-size values, so this does not affect rendered output, but it creates a minor inconsistency for any element inheriting the root size.

### 4. Color Usage — 8/10

All colors trace to tokens. No invented hex values in new/rewritten files. The five-status badge system (green/amber/blue/red/default) is applied consistently. Agent avatar distinction (green tint bg, accent border, accent text) is correct everywhere.

The theme swatches in settings.html use hardcoded hex values (`#f5f0e6`, `#1a1510`, `#e8e0d0`) for the visual preview blocks — this is acceptable since those swatches are representing the theme colors themselves, not semantic usage.

The destructive button hover color (`#c53e30`) and amber hover (`#b86305`) are hardcoded hex values. The architecture plan explicitly calls this out as acceptable ("No raw hex values except where matching 03-hearth.html exactly"), and both values match the reference. The `rgba(22, 118, 79, ...)` values for ghost hover and action block tints use literal values rather than derived tokens, but these match 03-hearth.html exactly.

### 5. Component Coherence & Consistency — 8/10

Components compose correctly. BetCard redefines Avatar/AvatarGroup/Progress/Badge inline rather than importing from the primitive files, but this is expected for self-contained HTML mockups — each file must be standalone. The inline definitions match the primitive files exactly.

The sidebar is consistent across all 9 full-screen mockups: brand wordmark, bet items with status dots, team items, dividers, active state treatment. The only variation is the knowledge screens use "Scope" and "Topics" sections instead of "Bets" and "Teams" — this is intentional.

Settings.html has buttons with full inline style objects rather than CSS classes (lines 127, 135, 170, 178). While the values are correct (they use token references), the pattern is inconsistent with how buttons are styled elsewhere via CSS classes. This is a minor coherence issue for a reference file.

### 6. States & Feedback — 7/10

**Present states:** Default, hover, active (scale 0.97), disabled (opacity 0.5), focus-visible (Button, BetCard, ThreadRow). Input has default, focus, error, disabled. Toggle has on/off. Checkbox has checked/unchecked. Toast has four variants. BetCard has completed state (opacity 0.75).

**Missing states:**
- Toggle has no disabled state demo
- Checkbox has no disabled state demo
- Select has no error state demo
- TabBar has no disabled tab demo
- No loading/skeleton states demonstrated in any primitive
- Thread detail screen's composer input has `disabled` attribute but no visual explanation of when it would be disabled
- Tooltip has no hover-triggered visibility demo (all tooltips are always visible)

The Button primitive shows disabled state. Input shows disabled. Select shows disabled. But the gap in Toggle/Checkbox disabled demos means W2 builders may guess at the disabled treatment for those components.

### 7. Accessibility — 6/10

**Present:**
- `role="button"` on BetCard, ThreadRow
- `role="status"` on EmptyState
- `role="alert"` on ErrorState
- `tabIndex={0}` on BetCard, ThreadRow
- `focus-visible` outlines on Button, BetCard, ThreadRow (2px solid accent-primary, 2px offset)
- Focus ring on Input, Select, Composer input (accent border + 3px box-shadow)
- Semantic `<label>` elements in Input, Select, Settings forms

**Missing:**
- Toggle has no `role="switch"`, no `aria-checked`, no keyboard interaction, no focus styling
- Checkbox has no `role="checkbox"`, no `aria-checked`, no hidden `<input type="checkbox">`, no focus styling
- TabBar has no `role="tablist"` / `role="tab"` / `aria-selected`
- Toast close button has no `aria-label="Close"`
- Tooltip has no `aria-describedby` linkage
- NavItem has no `aria-current="page"` on active item
- Select has no focus-visible ring (only `:focus` which is different from `:focus-visible`)
- Progress bar has no `role="progressbar"`, no `aria-valuenow`/`aria-valuemin`/`aria-valuemax`
- Screen mockups: sidebar items are `<div>` elements, not `<button>` or `<a>` — non-semantic interactive elements

These are significant gaps for foundation primitives that will be replicated in TSX. The builder must add ARIA attributes, but the HTML reference is supposed to be the source of truth.

### 8. Anti-Slop Check — 9/10

This is where the design genuinely excels. The designer has clearly internalized the anti-slop principles:

- Empty states are left-aligned (not centered hero layout) per AQ-008
- No Lorem ipsum anywhere — all content is realistic per AQ-009
- No purple gradients, no glass morphism, no gradient-on-text
- No oversized padding or centered hero sections
- Cards use warm shadows, not generic gray
- Status through content (dots + badges), not structural borders per AQ-004
- Pill buttons throughout per AQ-005
- 16px default radius per AQ-006
- Overlapping avatar groups per AQ-007
- Left-aligned empty states use `--surface-page` background (sits into canvas)
- No decorative elements without function per AQ-019
- Agent avatars visually distinct per AQ-012

The empty states are particularly well-designed — they feel like helpful notes, not marketing hero sections. The error states use warm cards with helpful copy. The onboarding screen communicates "welcome" without being a landing page.

### 9. Premium Polish — 7/10

**Present:**
- Tabular numerals implied by mono font on percentage labels
- Letter-spacing on uppercase section headers (0.06em)
- Motion timing uses 120ms/240ms/450ms consistently
- Hover lift on bet cards (shadow escalation + translateY)
- Expressive easing on toggle thumb (cubic-bezier(0.34, 1.56, 0.64, 1))
- Warm shadows in light mode (rgba(44, 36, 26, ...))
- Active state scale(0.97) on buttons

**Missing or weak:**
- No `prefers-reduced-motion` handling in any component CSS
- No explicit touch target size verification (toggle track is 44x24 which meets 44px in width but not height)
- Checkbox box is 20x20 — below 44px minimum touch target
- No mobile font-size considerations (inputs at 15px should be fine, but not explicitly verified)
- No transition on bet card's `opacity: 0.75` for completed state
- Sidebar items are 6px 12px padding — the click target height may be below 44px depending on line-height

---

## CRITICAL

1. **[Toggle.html] Missing ARIA role and states.** Toggle renders as plain `<div>` elements with no `role="switch"`, no `aria-checked`, and no keyboard interactivity. This is a Tier 0 foundation primitive — every consumer will inherit this gap. The builder will need to add these, but the HTML reference should demonstrate the correct pattern.

2. **[Checkbox.html] Missing ARIA role and states.** Same issue: no `role="checkbox"`, no `aria-checked`, no associated hidden input, no focus styling. Foundation primitive with accessibility gap.

3. **[TabBar.html] Missing ARIA tablist pattern.** No `role="tablist"`, `role="tab"`, or `aria-selected`. Tabs are a core navigation pattern that screen readers need to understand.

4. **[Progress.html] Missing ARIA progressbar role.** No `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`. Progress bars are used in BetCard (which appears on every work screen) — the gap cascades.

---

## WARNING

1. **[_tokens.css:68-86] Density tokens still present.** The `_tokens.css` file still contains `--density-*` tokens (lines 68-86) with a comment explaining they are "default tier mirrored from src/tokens.css." While the AC says "no density system in mockups" (and no mockup uses these tokens), the presence of `--density-*` declarations in the shared token file creates confusion. W2's first task is to strip density, so this is not blocking, but the designer should note it.

2. **[Toggle.html, Checkbox.html] No disabled state demonstrated.** These primitives show on/off and checked/unchecked but never show a disabled variant. The builder needs to know the disabled treatment (presumably opacity: 0.5 matching Button/Input/Select).

3. **[Settings.html:127,135,170,178] Inline style objects for buttons.** The Edit and Remove buttons in settings use full inline React style objects instead of CSS classes. While the values are correct, this breaks the pattern established by other files where buttons use `.btn` classes. The designer should extract these into CSS classes for consistency.

4. **[All primitives] No `prefers-reduced-motion` media query.** None of the CSS includes `@media (prefers-reduced-motion: reduce)`. PRINCIPLES.md explicitly states "Respect `prefers-reduced-motion`" under Motion rules. This should be demonstrated in at least the foundational primitives.

5. **[Sidebar in all screens] Sidebar items are `<div>` not `<button>`.** Interactive sidebar items are rendered as `<div>` elements with cursor: pointer. They should be `<button>` elements for keyboard accessibility. The NavItem.html component file correctly uses `<button>`, but the screen mockups do not use the NavItem component pattern — they inline the sidebar markup.

---

## SUGGESTION

1. **[Tooltip.html] Show hover-triggered visibility.** Currently all three tooltips are always visible. Consider adding a CSS `:hover` demo or a note that tooltips appear on hover. The always-visible approach works for the reference file but makes it harder to verify the tooltip is correctly sized when dynamically shown.

2. **[BetCard.html] Consider focus-visible ring color for completed cards.** The completed card has `opacity: 0.75` but the focus ring is the same accent-primary. At 75% opacity, the ring's visual weight diminishes — consider whether the ring should be at full opacity regardless.

3. **[Onboarding.html] Step indicator dots are narrow (32x4px).** The step dots work visually but at 4px height they may be hard to perceive on some displays. The reference file shows step 2 of 4 active — showing completed steps at reduced opacity (0.4) is a nice touch.

4. **[Knowledge detail] Backlink rows have no visual icon/indicator.** They are plain green text links. Adding a subtle link icon or arrow would differentiate them from body text links.

5. **[DESIGN.md] Add the "micro" and "count" type steps to the scale table.** The scale table lists xs through 3xl but the designer uses 10px (agent badge labels, avatar initials) and 9px (count badge font) which are documented in the text but not in the formal table.

---

## What's Working Well

1. **The Hearth feeling is genuine.** Opening these mockups side-by-side with 03-hearth.html, they are unmistakably from the same design family. The warm cream canvas, the earthy shadows, the generous rounding, the pill buttons, the status-through-content approach — all correct. This is not a pale imitation; it is a faithful extension of the reference across screens the reference did not cover (Knowledge, Settings, Onboarding, Error States).

2. **Realistic content throughout.** Every mockup uses real thread titles, real bet names, real agent names, real budget figures, real timestamps. The content tells a coherent story — the "Auth migration" bet threads through conversations, work, and knowledge screens. This level of content coherence makes the mockups genuinely useful as design references rather than visual lorem ipsum.

3. **DESIGN.md and AESTHETICS.md are excellent.** DESIGN.md reads as a design manifesto, not a token spreadsheet. AESTHETICS.md's 19 rules each have a clear rationale and each would make a reader nod "yes, obviously." The density system is gone from both docs. These will serve as authoritative references for W2 and beyond.

---

## AC Completeness Audit

| AC | Status | Notes |
|----|--------|-------|
| HTML files for every screen in every state | PASS | 12 screen files covering all required screens |
| Conversations: empty, thread list, thread detail | PASS | All three present with correct states |
| Work: empty, bet overview, bet detail | PASS | All three present with correct states |
| Knowledge: empty, list, detail | PASS | All three present with correct states |
| Settings: profile, teams, appearance, credentials, notifications | PASS | All five sections in single stacked layout |
| Setup/Onboarding | PASS | Welcoming card with brand, step indicator, form inputs |
| Error states: 404, API error, empty-but-healthy | PASS | All three with warm card treatment |
| Foundation primitive HTML files | PASS | 10 files: Avatar, Button, Input, Select, Toggle, Checkbox, TabBar, Toast, Progress, Tooltip |
| Existing component HTML rewritten | PASS | 7 files: BetCard, ThreadRow, Composer, EmptyState, ErrorState, NavItem, CommentRow |
| Sidebar matches 03-hearth.html in every screen | PASS | Brand wordmark, status dots, team items, dividers, active state — consistent across all 9 full-page screens |
| All HTML use _tokens.css | PASS | All files link to _tokens.css (or ../_tokens.css for screens/) |
| No density system | PASS | Zero --density-* usage in new/rewritten files. _tokens.css still has the declarations but nothing references them |
| Working Light/Dark theme switcher | PASS | All files include themes/_switcher.js |
| Realistic content | PASS | Zero Lorem ipsum. All real names, titles, budgets, timestamps |
| DESIGN.md rewritten | PASS | Manifesto format with material palette, philosophy, typography, spacing, shadows, borders, motion |
| AESTHETICS.md rewritten | PASS | 19 rules (AQ-001 through AQ-019), density references removed, new rules for warmth/depth/layering |

**Missing from AC:** The AC mentions "AvatarGroup" as a primitive but it is included in Avatar.html (not a separate file). The AC mentions "SearchField" as a component to review — it was not rewritten in this diff (unchanged from pre-W1). StatusChip and Tag were also not rewritten. The AC says "reviewed against 03-hearth.html and rewritten WHERE THEY DIVERGE" — the designer may have determined these components already match. This is acceptable.

---

## Verdict

**Score: 8/10 — Good. Acceptable for production with the noted accessibility gaps.**

The CRITICAL findings are all accessibility-related (ARIA roles on Toggle, Checkbox, TabBar, Progress). These do not block W2 from starting — the builder can add ARIA attributes when implementing TSX — but they represent a gap in the HTML reference's role as "source of truth."

The design quality, visual coherence, and Hearth fidelity are strong. The score of 8 reflects that this is genuinely good design work that captures the 03-hearth.html feeling across all required screens and states. The accessibility gaps prevent a 9.

**Recommendation: Advance to W2.** The builder should add ARIA attributes during TSX implementation and treat the HTML as the visual truth while supplementing with proper accessibility patterns.
