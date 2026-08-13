# Aesthetics

Rules that protect the Hearth feeling. Every rule here should make you nod "yes, obviously." If a rule feels bureaucratic, it does not belong.

---

## AQ-001: Warm shadows only

Shadows in light mode use `rgba(44, 36, 26, ...)` -- warm earth tones. Never `rgba(0, 0, 0, ...)` in light mode. Dark mode uses pure black because the background is already warm.

**Why:** Cool gray shadows on a warm cream canvas create a visual temperature clash. The warmth of the shadow is what makes Hearth cards feel like paper on a wooden desk rather than rectangles on a screen.

---

## AQ-002: No cool grays

Every neutral in the system is warm-tinted. Surface-page is pale lemon cream (`#fcf8e8`), not white. Text-primary is warm olive-brown (`#2a2415`), not black. Borders are lemon-tinted stone (`#ded3a9`), not steel gray.

**Test:** Open any component in light mode. Does every element feel warm-lemon? If any element looks like it belongs in a Material Design template, the color is wrong.

---

## AQ-003: One size per component

There is no density system. No compact/default/comfortable. Each component has exactly one size that is the right size. No `[data-density]` selectors, no `--density-*` tokens in new code.

**Why:** Density systems add 3x the CSS, 3x the visual states to verify, and 3x the maintenance surface. Hearth chose its spacing through 03-hearth.html -- those measurements are the size.

---

## Spacing relationships

Composition uses the closed Hearth vocabulary: `0 / 3 / 6 / 9 / 12 / 18 / 24 / 36 / 48px`. The values communicate proportional relationship, not fixed semantic slots:

- `0` keeps contiguous rows and divided list items flush. `3–9px` signals a close relation; use `6–9px` for most label/content and icon/text pairs, with `3px` reserved for very compact metadata.
- `12–18px` separates related groups. Choose `12px` in dense or strongly bounded layouts and `18px` for multiline content or weaker cues.
- `24–36px` separates major vertical sections. Use `24px` when headings, borders, or surface changes already mark the boundary; use `36px` when a sparse, unbordered phase change needs more help.
- `48px` is exceptional page-level or expressive separation, not a routine section gap.

Horizontal composition follows the same vocabulary: `3–9px` for tightly related icon/text or metadata, `9–12px` for peer actions, `18–24px` for distinct clusters or columns, and `36–48px` only for rare broad layouts. Narrow viewports and wrapping generally need the compact end of a range; larger type, multiline content, weak boundaries, and sparse layouts may need the roomy end. Borders, surface changes, and strong headings permit less space because they already provide hierarchy.

Do not use one gap for unrelated nested relationships, introduce off-vocabulary values to split the difference, add space between contiguous divided rows, or use `48px` to compensate for weak typography. If no value in a range works after typography and boundary cues are considered, escalate the design rather than inventing a value.

The composition rule does not own control-internal padding/gaps, fixed geometry, optical offsets, canvas coordinates, negative overlap, CSS resets, or subject-authored artifact content. Exemptions must be narrow and structural; never disable the rule for a whole page or surface.

---

## AQ-004: Status through content, not structure

A bet card with "Active" status and one with "Blocked" status have the same shadow, same border radius, same padding, same structural treatment. The difference lives inside: a green dot vs a red dot, an "Active" badge vs a "Blocked" badge.

The one structural exception: toast uses a thin (1.5px) left-border accent line. Nothing else uses structural borders for status.

**Anti-patterns:**
- Full-width colored borders on cards (the "left-border" card from generic dashboards)
- Background color changes for different statuses
- Different border-radius per status

---

## AQ-005: Pill buttons always

Buttons use `border-radius: 9999px`. No square buttons. No subtle-radius buttons. The pill shape is a core Hearth identity marker.

**Applies to:** All Button variants (primary, secondary, ghost, destructive, amber), both default and small size.

---

## AQ-006: 16px default radius

Cards, inputs, toasts, and containers use `--r-default` (16px). Inner panels and small elements use `--r-subtle` (10px). There is no 4px or 8px radius in the system.

**Why:** The generous radius is what makes Hearth feel soft and inviting. Tight radii make interfaces feel corporate.

---

## AQ-007: Overlapping avatar groups

When multiple avatars appear together (thread rows, bet card footers, any team indicator), they overlap with negative margin (-6px to -8px). Each avatar gets a `2px solid var(--surface-elevated)` border to create the cut-out overlap effect.

**Why:** Overlapping avatars communicate "these people are together" more effectively than a row of separated circles. The white border creates depth -- avatars feel layered.

---

## AQ-008: Left-aligned empty states

Empty states are left-aligned. Never centered. Centering is the most common AI-aesthetic tell in generated UI -- it communicates "landing page" rather than "workspace." Empty states in Hearth feel like a helpful note left on your desk, not a marketing hero section.

Empty states use `--surface-page` background (not elevated) so they sit into the canvas rather than floating above it.

---

## AQ-009: Realistic content always

Every mockup, every storybook story, every HTML reference file uses realistic content. Real thread titles ("Passkey rollout plan -- phase 1 scope"), real bet names ("Auth migration"), real agent names ("Atlas"), real timestamps ("2:38 PM"), real budget figures ("$2,400").

No Lorem ipsum. No "Item 1, Item 2, Item 3." No "Click here." No "Description goes here."

**Why:** Realistic content is the only way to verify spacing, truncation, and visual hierarchy. Abstract content hides layout bugs.

---

## AQ-010: Hover lifts cards

Bet cards (and any clickable card) respond to hover with `box-shadow` escalation from `--shadow-default` to `--shadow-elevated` and a subtle `translateY(-2px)`. This tactile feedback makes the interface feel alive.

Flat list items (thread rows, knowledge rows) use a subtle background tint on hover instead: `rgba(44, 36, 26, 0.02)`.

---

## AQ-011: Badge system coherence

Badges use pill shape, 12px font, 3px 9px padding. Five semantic variants:
- **Green** (`accent-primary` tint) -- active, success, product team
- **Amber** (`accent-secondary` tint) -- at risk, budget, warning
- **Blue** (`status-info` tint) -- draft, informational, review
- **Red** (`status-error` tint) -- blocked, failure
- **Default** (`surface-container`) -- completed, neutral count

Count badges (message counts) are narrower: `3px 6px` padding with `min-width: 20px`.

---

## AQ-012: Agent avatar distinction

Agent avatars are visually distinct from human avatars:
- **Background:** `var(--accent-deep-dim)` tint
- **Border:** `var(--accent-deep)` (cocoa in light, light beige in dark)
- **Text:** `var(--accent-deep)`

This distinction persists across all sizes (sm, md, lg) and contexts (message avatars, thread row avatars, bet card team groups).

<!-- @lore CL1: agent identity color moved forest-green -> cocoa/beige (--accent-deep) with the creme lemon palette; the distinction mechanism is unchanged. -->

**Why:** In an agentic OS, the human needs to instantly distinguish "who said this -- a person or an agent?" at a glance.

---

## AQ-013: Section headers are quiet

Section headers (sidebar labels, topic headers, form section titles) use:
- 12px font size
- Semibold weight (600)
- Uppercase transform
- Wide letter-spacing (0.06em)
- Tertiary color

They organize without shouting. They are structural markers, not content.

---

## AQ-014: Sidebar is a stable navigator shell

Every full-screen desktop mockup includes the Hearth sidebar:
- Brand wordmark ("HyperIdle") at top, 15px bold
- Grouped Search and Assistant tools in the top corner
- Notifications, Conversations, Work, and Knowledge as one stable destination set
- A single domain-owned navigator taking the remaining vertical space
- Settings as the bottom-right utility
- Active item: quiet filled surface, `--text-primary` color, medium weight
- Hover: subtle background tint
- 276px width; 300px drawer on phone
- Phone destination set: four 44px icon targets with full accessible labels

---

## AQ-015: Composer is a pill-button pair

The thread composer is an input + pill send button, not a bordered textarea + text button. The input uses `--surface-page` background (sits into the canvas). The send button is a small primary pill.

---

## AQ-016: Action blocks are tinted rows

Agent action blocks in thread messages (deployment plans, migration strategies) use:
- `color-mix(in oklab, var(--accent-deep) 4%, transparent)` background tint
- `--r-subtle` (10px) border radius
- 9px 12px padding
- A 6px `--accent-deep` dot before the label
- Status text on the right (success/warning color)

They feel like inline cards, not banners.

---

## AQ-017: Error states deserve design

Error states are not raw red text. They are warm Hearth cards with:
- An icon in a tinted circle (error-red tint)
- A clear title
- A helpful description that explains what to do
- An optional technical detail in a monospace block
- A pill retry button

Even errors should feel like the app cares about the user.

---

## AQ-018: Theme switcher on every mockup

Every HTML reference file includes the theme switcher (`themes/_switcher.js`). Both light and dark modes must work. This is verified by opening the file in a browser and clicking through.

---

## AQ-019: No decoration without function

Every visual element earns its place. No decorative icons that don't communicate meaning. No background patterns. No gradient fills (except the very subtle card-green/card-amber tints). No hero sections. No oversized padding.

The Hearth aesthetic is achieved through material quality (warm shadows, generous rounding, earthy colors), not through decoration.
