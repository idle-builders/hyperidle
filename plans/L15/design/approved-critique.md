# Approved design — final /design-critique

Re-applied against the synthesised spec in `approved.md`.

## Scoresheet

| Dimension | Score | Notes |
|---|---|---|
| Hierarchy | 9 | Title is unambiguous primary; kebab recedes; thread dot is a quiet secondary signal that escalates only when there's something to read; conditional title-row hover-tint surfaces unread without adding chrome. |
| Spacing | 9 | Density tokens consumed throughout. Card footprint unchanged from today — no chrome added on the dominant case (no unread). 4-px grid intact. |
| Typography | 9 | 15 px medium title, 11 px mono caps for menu sections + KeyValue, 12 px owner — all on the closed allowlist. Mono right-column targets in menu use tabular numerics. |
| Color | 9 | Monochrome status holds. Primary is reserved for unread thread (dot, body-click hover, menu item background) — the most disciplined application of `--primary` in the page. Danger reserved for `Kill task` and the existing blocked-card border. |
| Coherence | 9 | Single grammar (kebab + menu) with one targeted exception (title-row click for unread). Reuses TaskCard's existing `actions` slot. Menu mirrors the verdict-grammar pattern. State-aware ordering is deterministic and documented. |
| States | 9 | Empty / loading / no-thread / read / unread / in-flight / agent-honoured / agent-rejected / drag-attempt all defined with concrete render rules. Disabled-verb hint copy specified. |
| Accessibility | 9 | One tab stop per card without unread; two with unread (title row + kebab). Arrow-key menu nav, ESC dismiss, focus-trap inside menu, aria-haspopup/expanded set. AQ-015 met at ≤1024 px (kebab grows to 44, title-row touch-padding pseudo-element). Open question 6 in §11 surfaces the touch-padding spec. |
| Anti-slop | 9 | No purple/violet, no gradient, no rounded-2xl, no hero, no decorative iconography, no marketing superlatives. Single accent (primary) used functionally. Single danger use (kill task). |
| Discoverability | 8 | Improved over Variant A's 5 by adding the conditional body-click and the primary-tint on the most-likely menu row. Still slightly below C's 10 because first-time founders without unread still have to click the kebab once. The trade is conscious: density first, discovery second, mediated by the primary-tint promotion of relevant actions. |

**Overall: 8.9/10 → 9/10.**

Threshold (≥7) cleared. Approved design is locked.

## Findings to feed forward

- **F1 (info, for L18).** The `onOpenThread` callback in §6 needs L18 to commit on the thread-detail surface (Submenu vs route). L15 stays loose; L18 owns it.
- **F2 (info, for L1/server).** Server-side lazy thread creation on first state-change request needs a contract (open question §11 #3). Architect to specify in `architecture.md`.
- **F3 (info, for write-code).** Touch-padding pseudo-element for the conditional title-row click target is a non-trivial CSS detail. Architect to call this out in the implementation plan.

No regen needed.
