# Design Critique: AE5 — Communication Refinements

DESIGN-CRITIQUE: variant=single score=8/10  rounds=1  axes: H:8 S:8 T:8 C:8 Co:9 St:8 A:7 AS:9 PP:7

---

## Scoring Breakdown

### 1. Visual Hierarchy — 8/10

The design establishes clear differentiation between the three surfaces. Mention tokens use accent-primary at 8% opacity background with accent-primary text -- visually distinct from surrounding body text and from EntityRef/BlockRef card embeds. The context link in the header uses secondary text color at 13px -- appropriately recessive beneath the thread title. Presence dots at 6px are minimal and positionally anchored (bottom-right of avatar) following a universal presence-indicator pattern.

One concern: the context link's right-arrow character (`→`) in `--text-tertiary` is decorative without clear function. It doesn't indicate interactivity (the link text itself does). Minor noise.

### 2. Spacing & Density — 8/10

Mention token padding `1px 3px` is sub-grid but acknowledged as "sub-grid exempt, internal inline padding" -- consistent with the AQ-001 exemption for internal component padding. The 6px presence dot with 1.5px border is proportional to 24px avatar circles. Context link gap of 6px (`--space-2`) is on-grid.

The context link uses `mt-[3px]` (section 6.2 of architecture) -- 3px is `--space-1`, on-grid. Good.

### 3. Typography — 8/10

Mention token inherits 15px body text. Context link at 13px is on the type scale (`--text-sm`). Host kind uses the Tag component which has its own established typography. All within the Hearth type scale.

The `@` prefix is rendered visually in the token -- appropriate for recognition ("@Aria" reads as a mention instantly). No extra font families introduced.

### 4. Color Usage — 8/10

Mention token: `var(--accent-primary)` text on 8% accent-primary tinted background. This creates a subtle, recognizable highlight without being decorative. The color carries meaning ("this is a person reference"). Context link hover uses `var(--accent-primary)` -- standard interactive-color treatment. Presence dot: `var(--accent-primary)` for active, `var(--status-error)` for error -- semantic color usage matching the existing StatusChip vocabulary.

All colors are token-based. No hardcoded values. The `color-mix(in oklab, ...)` pattern for the 8% tint is the same approach used elsewhere in the codebase (ThreadRow blocking badge, host pill).

### 5. Component Coherence & Consistency — 9/10

Strong. The design explicitly reuses existing components: Tag for host kind, StatusChip vocabulary for presence semantics, existing ThreadHostBanner participant avatars for presence dots. No new custom components required -- MentionToken is an inline span within CommentRow, PresenceDot is a positioned element within existing avatar rendering. This respects the component budget.

The `color-mix` tint pattern for the mention background matches ThreadRow's blocking badge and host pill treatments -- consistent visual language for "tinted semantic backgrounds."

### 6. States & Feedback — 8/10

Four mention states documented (0 refs, 1+ refs, unresolved @foo, redacted). Context link has implicit hover state (underline + accent color). Presence has five states (active, error, idle, human, unknown) -- all documented in the states table.

Missing: no explicit focus state for the context link (standard anchor behavior is inherited, but the design doesn't specify a focus ring treatment). Minor -- standard browser/Tailwind focus behavior will apply.

The mention token is explicitly non-interactive in v1 (no click, no hover). This is documented and intentional. No missing states for a non-interactive element.

### 7. Accessibility — 7/10

Presence dots carry `aria-label` for screen readers -- good. Context links are standard anchors -- keyboard-navigable by default. Mention spans are non-interactive so no tab stop needed.

Findings:
- The mention `<span>` has no `aria-label` or role. Screen readers will read "@Aria" as literal text, which is acceptable (the text is self-describing). But adding `role="mark"` or a visually-hidden prefix like "Mentioned:" would improve the screen reader experience for mentions embedded in longer messages.
- The `→` arrow character after the context link has no `aria-hidden="true"` -- screen readers will read "right arrow" which is noise.

### 8. Anti-Slop Check — 9/10

No AI-aesthetic tells. No purple gradients, no oversized padding, no centered hero layouts, no glass morphism, no gradient-on-text. The design is restrained -- inline spans, small dots, a breadcrumb link. Each element earns its place. The mention rendering is distinctively minimal (8% tint, no rounded card, no card-like embed) which avoids the "every mention is a fancy chip" pattern common in AI-generated chat UIs.

### 9. Premium Polish — 7/10

The design specifies token-only values throughout. The `color-mix(in oklab, ...)` approach is sophisticated and theme-portable. Presence dot border uses `var(--surface-elevated)` for the ring-cut effect (standard avatar-on-surface technique -- design doc says `--surface-elevated`, architecture says `--surface-container`; this discrepancy needs resolution).

Missing from the spec:
- No mention of `prefers-reduced-motion` for any transitions on these elements (granted, none of the three surfaces animate, so this may be N/A).
- The presence dot at 6px is small. On high-density displays this is fine, but on standard-DPI displays the 1.5px border may render inconsistently. The design doesn't address this -- a 2px border with proportional dot scaling would be safer, though this is admittedly a nit.

---

## CRITICAL

None.

## WARNING

- [approved.md §1.2 + §rendering-spec] The rendering spec for MentionToken and the design decisions section reference `MentionRef` entries carrying `displayName` AND `sourceText` for matching, but the architecture plan's MentionRef type (§1.1) omits `sourceText`. The design says "the renderer scans the text for each `sourceText` occurrence and wraps it in the styled span" -- this requires `sourceText` on MentionRef. The architecture must include `sourceText` in the type or the design must change its matching strategy to use `displayName` prefixed with `@`.

- [approved.md §rendering-spec vs architecture §5.1] The presence dot border token is inconsistent: the rendering spec says `border-[var(--surface-elevated)]` but the architecture (§5.1 PresenceDot) says `border-[var(--surface-container)]`. ThreadHostBanner renders on `--surface-container` background, so the dot border should match the container it sits on. The correct value depends on the surface: `--surface-container` for ThreadHostBanner, `--surface-elevated` for ThreadRow (which sits on elevated cards or page background). The design should specify "border matches the parent surface token" or pick one token and document where it fails.

## SUGGESTION

- [approved.md §1.2] Consider adding `role="mark"` to the MentionToken span for improved screen reader identification of highlighted mentions within message text.

- [approved.md §2.1] The `→` arrow after the context link is decorative noise. Remove it or replace it with nothing -- the Tag + linked text already communicates "this is a navigable reference." If kept, add `aria-hidden="true"`.

- [approved.md §2.3] The v1 UUID-as-title fallback for bet/task host kinds is acknowledged as a limitation, but the architecture plan (§3.2) already includes server-side `hostTitle` resolution. The design should update to assume `hostTitle` is available (since the architecture provides it), removing the "UUID display is acceptable for v1" qualifier.

## What's Working Well

- **Component reuse is exemplary.** All three surfaces compose from existing primitives (Tag, StatusChip vocabulary, CommentRow, ThreadHostBanner avatars). Zero new custom components. The component budget is untouched.

- **The "mention as inline span, not card embed" distinction is clean.** EntityRef and BlockRef render as cards below the message; MentionRef renders as a highlighted inline token within the text. This visual hierarchy makes mentions read naturally as part of the message flow rather than interrupting it.
