# L23 — Design critique (Phase 2 reviewer)

Critiquing `plans/L23/design/variants.md` + `plans/L23/design/approved.md`. Round 1 of up to 4. Threshold: every dimension ≥ 7.

## Scoring

| Dim | Variant A | Rationale |
|---|---|---|
| Clarity / hierarchy | 8 | Single primary container with scoped heading scale. The relationship between body, page chrome, ObservationLog, and edit preview is unambiguous. |
| Density / spacing | 7 | Inter-block rhythm is `Block`'s own `py-[6px]` (12 px between centres). The +4 px heading `margin-top` is on grid (AQ-001). One concern: paragraph-after-paragraph is also 12 px, which can read undifferentiated from heading-after-paragraph (10 + 4 = 14 px). Tight, but legal. |
| Typography | 7 | The scale uses tokens (`--density-text-h1`, `--density-text-h2`, `--density-text`) — AQ-004 satisfied. h3 / h4–h6 collapse to body size differentiated only by weight; acceptable given Knowledge bodies don't routinely go past h2. **Risk:** `HeadingPayload` already sets `leading-[1.2] tracking-[-0.005em]` as Tailwind utilities; the scoped CSS overrides `line-height` to `1.3`/`1.4` for h2/h3/h4–6. With `index.css` ordered `@tailwind base / components / utilities`, the scoped rule placed in `@layer components` will LOSE to HeadingPayload's `leading-[1.2]` utility. The plan does not pin where the rule lives in the cascade. Either drop the line-height override (consistent 1.2 from L2 wins) or place the rule outside any `@layer` (specificity wins) — this needs to be decided in architecture, not left to the builder. |
| Color / contrast | 9 | Zero hardcoded colors. h4–h6 fold to `--text-mid` only; `--text-strong` remains the default heading colour from `HeadingPayload`. WCAG 2.1 AA contrast against `--surface-0` is preserved (existing semantic tokens). |
| Motion / feedback | 8 | No motion introduced. Edit-mode preview re-derives on every keystroke; React's reconciliation against stable `block.id` keys is the visual feedback. No flicker risk for sub-256 KB bodies. |
| States (empty / edit / long-body) | 7 | Empty state is `<p class="text-[var(--text-lo)] text-sm m-0">(no content yet)</p>`. **Inconsistency with the rest of the app:** the design system has a dedicated `EmptyState` primitive (`packages/design-system/src/EmptyState.tsx`) with `role="status"`, density-aware padding, structured title+description. Knowledge body's empty state opts out and inlines a muted `<p>`. The variant doc justifies "pure prose absence" — defensible (a card-shaped EmptyState INSIDE a no-chrome body would be jarring) but should be acknowledged explicitly as a deliberate departure from the EmptyState primitive, not silently. **Long-body state is not designed.** R4 in architecture acknowledges 256 KB cap returns a single `unknown` block; visually the user sees an unknown-block warn-stripe with no explanation. Spec for the long-body affordance is absent from `approved.md`. |
| Accessibility | 7 | Heading levels are semantic (HeadingPayload uses `createElement('h${level}')`). `Block` shells are `tabIndex={0}` and respond to ↑/↓ for block stepping. Empty-state `<p>` has no `role="status"` — screen reader users won't be alerted that the body is empty after navigation; the design-system's `EmptyState` does. AQ-015 (≥44 CSS px touch targets) is N/A since L23 wires no interactive elements beyond what `Block` provides; the existing tabindex chevron via keyboard is not a touch target. Mobile font-size: `--density-text` resolves to `0.875rem` in compact mode = 14 px, **below the 16 px AQ-005 floor** — but AQ-005 governs *inputs*, not body prose, so this is OK. The textarea retains `text-sm` (14 px); pre-existing AQ-005 violation, NOT introduced by L23. |
| Consistency-with-tokens | 9 | Pure token consumption, no `text-[Npx]`, no off-grid spacing, no off-scale radius (no radius added at all, which is the right call). `flex flex-col` with no `gap-*` correctly delegates rhythm to `Block`. |
| Anti-slop | 9 | No `rounded-2xl/3xl`, no purple/indigo gradient, no oversized padding, no glass morphism, no marketing copy, no decorative emojis. Variant B (card-wrapped) was correctly rejected as AQ-103 / AI-aesthetic instinct. |

**Lowest dim:** Density/spacing, States, Accessibility, Typography all at **7**. None below.

## AC compliance check

- "3-sentence belief renders 3 paragraphs with no chrome" — **passes**. Variant A produces three `<article data-ds-component="block" data-ds-kind="paragraph">` inside a no-border `<div data-knowledge-body class="flex flex-col">`. No card. No bg. Validated by Scenario 1 in `approved.md`.
- "5-section playbook, proper heading hierarchy" — **passes**, conditional on the line-height cascade fix above.
- "(no content yet)" — **passes** with the noted EmptyState-primitive departure.
- "Edit one section → other ids unchanged" — passes, but this is a contract concern (not visual). Architecture-critique territory.
- Block-id stability visual surface — `data-block-id` attribute is already emitted by `Block.tsx:109`. Variant A's tests use this attribute. Confirmed.

## Did-we-consider — additions

The variants doc lists six items. Two more should be on the list:

1. **Skim density on a long playbook.** A 5-section, 30-paragraph playbook on a single column has no orientation cue — no rule, no left gutter, no section number. Considered (not stated): a thin `--border-subtle` rule above each `h2`. Rejection reason if rejected: visual chrome the spec forbids. Accept as-is, but state it.
2. **First-block-is-h1 deduplication.** The variants doc raises that `# Title` may duplicate the page header `<h1>` and defers it as "an authoring concern". This is fine; mark it as a *user-facing convention* and consider a follow-up to surface a soft warning in the editor. No impact on L23.

## Anti-slop pass

Clean. No tells found in the proposed surface.

## Verdict

**APPROVE** Variant A as `approved.md`. The reviewer concurs with the designer's choice of "scoped prose container, no chrome".

**Required addenda before architecture phase locks (these are micro-edits, not a re-design — issued to the designer/architect to fold into `approved.md` + `architecture.md`, NOT a REVISE blocker):**

1. Decide cascade: drop the `line-height` override for h2/h3/h4–6 OR place the rule outside `@layer components` so the selector specificity beats `HeadingPayload`'s utility classes. State the chosen mechanism in the architecture plan §1.
2. Acknowledge the EmptyState-primitive departure explicitly in `approved.md` § Empty state. One sentence: "Inline `<p>` not the `EmptyState` primitive — a card-shaped empty state inside a no-chrome body would create the very chrome the AC forbids."
3. Add a one-paragraph long-body story to `approved.md` § States: "Bodies above 256 KB render as a single `unknown` Block via L2 — visually a warn-stripe shell with no payload. L23 ships this pass-through; richer treatment is a follow-up."

These are tracked here, not as revisions. Proceeding to architecture-critique.

**Approved variant:** A (scoped prose container, no chrome).
