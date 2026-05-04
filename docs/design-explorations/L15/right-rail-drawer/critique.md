# Design Critique: L15 Variant C — Right-rail task drawer

**Score: 7.0/10** (H:9 S:7 T:8 C:8 Co:5 St:8 A:7 AS:7 PP:6) — sum 65/90

## Per-dimension scores

| # | Dimension | Score | One-line read |
|---|---|---|---|
| 1 | Visual hierarchy (H) | 9 | The dock is unambiguously the centre of action; the Kanban is the spatial map. The selected card has a `--primary` left border that reads from across the page — clear linkage between "what's selected" and "what's in the dock". TaskHeader at the top, request action footer at the bottom, thread in between — left-to-right gravity is honoured. |
| 2 | Spacing & density (S) | 7 | Drawer interior pad (16px) is appropriate for a detail view (D1: variable density by zone). The Kanban cards reflow to a 3-column layout — tighter columns but readable. The drawer's stacked-footer (composer + request action footer) doubles up on the bottom of the dock and reads visually heavy in the screenshot — see warning. |
| 3 | Typography (T) | 8 | Two families used as designed. The drawer title at 14px weight 500 reads as a header without competing with the page titles. The thread's mono request body (`@A. Founder requested: ready for review`) is correctly mono — it's structured/parseable content. Comment row times tabular nums. |
| 4 | Color usage (C) | 8 | The selected card's `--primary` left border is the strongest cross-region color signal in the screenshot — communicates linkage. `Kill` uses `--danger` text + danger-tinted border. `--surface-2` for the drawer header, `--surface-1` for the body, `--surface-3` for the composer textarea, `--surface-2` for the action footer — the surface ladder is used to differentiate zones inside the drawer. |
| 5 | Coherence & consistency (Co) | 5 | **Adds 1 new Tier 3 component (`TaskDrawer`).** The component-budget pressure is the cost. The spec justifies multi-context reuse (any future task-detail view), but only one context exists today. The two-stacked-footers (composer at the floor of ThreadShell + RequestActionFooter below it) is a coherence hit — a visitor might expect the action footer to be inside the thread, not below it. Two send-affordances in the same vertical strip (`Send` on the composer; `Send` on the verb confirm popover) reuse the same word for two different actions. |
| 6 | States & feedback (St) | 8 | Spec covers empty / loading / error / populated / terminal / orphan / drawer-swap / drawer-close / overflow / mobile. Drawer-swap-without-animation is the right call (animating-on-swap would feel jelly). Verb confirm popover handles the optional note. |
| 7 | Accessibility (A) | 7 | `aria-label="Task detail panel"` on the drawer. `aria-selected="true"` on the selected card. Focus return on close to the most-recently-clicked card. Esc-handling defined per scope (drawer vs popover). The non-focus-trap call is correct (drawer is a region, not a modal). The `×` close button at 24×24 is below 44px; needs padding on mobile. The composer is at 13px — below 16px iOS-zoom mitigation (AQ-005). |
| 8 | Anti-slop (AS) | 7 | No purple gradient, no `rounded-2xl`, no oversized padding, no glass, no decorative emoji. The drawer pattern is borrowed from Linear (declared in the spec) — the variant doesn't try to hide the heritage. **However**, two stacked send-buttons (composer's `Send` + popover's `Send`) inside the dock is the kind of small slop-tell that signals an under-edited design. The drawer pattern itself isn't slop, but the over-stacked footer geometry feels under-resolved. |
| 9 | Premium polish (PP) | 6 | Drawer-slide motion at `--motion-medium` is correct. Selected-card border at `--primary` 2px is the keystone polish detail. Tabular nums on KeyValue costs and on times. No verb shortcuts. Cubic-bezier easing. **Missing in spec:** the explicit handling of the Rail collapse when drawer opens — the spec describes it but it'd be nice to embody (the screenshot doesn't show the Rail at all because the mockup focuses on the drawer + Kanban). The composer textarea at 13px will iOS-zoom on mobile (must be ≥ 16px per AQ-005); this is a polish miss. |

---

## CRITICAL

- **Two stacked footers in the dock is a coherence smell.** The thread's composer (`Send` button on a textarea) sits directly above the request action footer (verb buttons). The visual reading is: "two action regions for the same thread, one above the other." A user who wants to send a non-binding context message uses the composer; a user who wants to send a structured request uses the verb. The functional separation is correct but the geometric proximity makes the relationship unclear. **Fix:** either (a) move the request action footer ABOVE the composer (so the request action is the prominent floor and the composer is the secondary "more context" affordance below it), OR (b) replace the composer's `Send` with `Reply` to disambiguate from the popover's `Send`. Option (a) is more aligned with the variant's thesis ("structured requests are first-class").

- **Component budget pressure.** The spec adds `TaskDrawer` as a new Tier 3 component. The 19-component budget is sacred. The justification ("reusable for future task-detail views") is speculative — we have one context today (Team Board). Either commit to multi-context reuse with a concrete second consumer named in the spec, or the variant must absorb the cost as a budget exception that the architect signs off. This is a load-bearing trade-off — the variant's whole value proposition rests on accepting the new region.

---

## WARNING

- **Composer at 13px will iOS-zoom on mobile** (AQ-005 requires ≥ 16px input font-size at viewport ≤ 768px). The variant's mobile spec says full-screen sheet but doesn't specify the composer font bump. Add: composer textarea uses 16px on mobile.

- **The Kanban shrinks to 3 columns on drawer-open.** This is a side-effect that the founder will notice. On a 1440px viewport (the screenshot), 3 columns + 360px drawer = the screenshot you see. On 1280px laptop, the spec says it goes to 2 columns. That's a 50% loss of in-flight task visibility per click — substantial. Mitigation in the spec: `Done` collapses into a header pill. But this changes the founder's spatial map every time the drawer opens. Founders running a 13" MacBook may find this disruptive.

- **Drawer's body has the composer-with-Send + the action-footer with verb buttons → the action footer pushes the verb-confirm popover up by ~120px** (it positions `bottom: calc(100% + 6px)` from the verb button). On a 900px viewport, the popover anchors near the dock's bottom; on a 720px viewport it could clip. Need explicit auto-flip for the popover.

- **The drawer is sticky-positioned, full-viewport-height** (`position: sticky; top: 0`). On viewports with the AppShell header above the drawer, the math of `top: 0` may collide with the header. Architect needs to specify the actual top offset relative to the AppShell.

- **The selected-card border (2px primary) is the keystone visual** — but it's only on the left edge of the card. On a card already wearing a `--danger` left border (blocked task in the drawer), the two borders compete. The Webhook signature verify card in the Blocked column has the danger border — if it were the selected card, the visual would be ambiguous. Spec needs to define "blocked + selected" composition.

---

## SUGGESTION

- **Consider: the Composer should not exist if the drawer footer has the request action surface.** The thread's natural composer at the bottom of the dock + the request action footer below it = duplication. Could the verb popover absorb the composer's role (the popover has an optional note — that IS the composer's purpose for non-binding messages). One unified composer-with-verb-shortcuts would be the cleanest expression.

- **The drawer's `×` close button + the keyboard `Esc` are both available.** Standard pattern. Could add a "back" gesture (swipe right on the drawer) on touch — out of L15 scope but worth noting for the L18b mobile pass.

- **The selected-card `--primary` border is 2px** — consider 3px. The signal needs to read across the full Kanban width; 2px on a `--surface-4` card may not pull the eye from the rightmost column.

- **The drawer's `taskId` lives in the URL query string** per the spec. Consider: the `Open in full page` affordance in the TaskHeader could link to the same URL minus the `?taskId=` parameter, replacing the drawer with a full-page version. Provides an upgrade path for power users without needing a new component.

- **Empty state** when drawer is mounted but task has no thread yet: the dock shows `EmptyState` ("No messages yet"). The spec covers this but the embodiment shows only the populated state. Consider mocking the empty-thread state for review.

---

## What's working well

- **Spatial linkage is excellent.** The selected-card border + the drawer share `--primary` color treatment. A user's eye traces the link without thinking: "this card is what's in that dock." This is the variant's strongest attribute.

- **The thread-as-substance-of-the-dock is the right composition.** ThreadShell mounts directly inside the dock with no wrapping chrome; the existing L1 surface fills the available height. Reuses the L1 family at maximum value.

- **The verb confirm popover with the optional note** mirrors variant A's grammar — same focus management, same `Esc`/`Cmd+Enter`. Cross-variant grammar consistency.

- **Drawer-as-route** (URL query string) means the dock is shareable and deep-linkable. A founder can paste a URL to a co-founder and they land in the same dock state.

- **Mobile fallback to full-screen sheet** is the right answer (aligns with HIL §3.2 mobile-three-tabs pattern). The drawer doesn't pretend to be split-screen on phones.

- **No on-card affordance**, which means the card silhouette is unchanged. Cards still look exactly like today's cards. This is variant C's most distinguishing positive: the Kanban density is preserved at the card level (the drawer's column-narrowing cost is at the page-layout level instead).

---

## Score recap

**65/90 = 7.0 average.**

At the ≥ 7 gate. Variant advances to comparison.

Two structural fixes would lift the score meaningfully:
1. Resolve the two-stacked-footers ambiguity (one source of action, not two). Recommended option (a): action footer above the composer.
2. Concrete second consumer for `TaskDrawer` named in the spec, OR architect-approved budget exception.

After fixes, projected score: ~73/90 = 8.1 average.

The component-budget cost is the variant's load-bearing risk. If the founder wants HyperIdle to stay tight on the 19-component budget, this variant has the highest cost. If the founder is OK with a budget exception in service of better UX for the most-common act ("look at why this agent is doing what it's doing"), this variant has the highest ceiling.
