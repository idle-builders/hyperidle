# Variant A — design-critique

## Scoresheet

| Dimension | Score | Notes |
|---|---|---|
| Hierarchy | 8 | Card title is unambiguous primary; kebab recedes; thread dot is a quiet secondary signal. |
| Spacing | 9 | Density-tokens consumed throughout; cards feel coherent at default density. The 4-px grid holds. |
| Typography | 9 | 15 px medium title, 11 px mono caps for menu sections, 12 px owner — all on the closed allowlist. Mono right-column targets in the menu use tabular-friendly digits. |
| Color | 9 | Surface ladder only; danger reserved for `Kill task` and the blocked-card border; primary used only for the unread thread dot. Monochrome status holds. |
| Coherence | 8 | Menu mirrors the verdict-grammar pattern (one menu, all actions). Reuses TaskCard's existing `actions` slot. |
| States | 7 | Empty/loading/populated/unread/in-flight/disabled all defined. Could be improved by spelling the agent-rejected state more concretely (currently "no card-level visual"). |
| Accessibility | 8 | Single tab stop per card (the kebab); arrow-key menu nav; ESC dismiss; aria-disabled on stale items; AQ-015 kebab grows to 44 px on mobile. |
| Anti-slop | 9 | No purple, no gradient, no rounded-2xl, no hero, no decorative iconography. Kebab is functional, not chrome. |
| Discoverability | **5** | The kebab itself is the only verb surface — first-time founders must click to learn what's there. This is the variant's known cost. |

**Overall: 8/10**

## Findings

- **F1 (medium).** First-time discovery is the lowest score. Mitigation: the menu opens on hover-intent (200 ms hover) for desktop power users, OR a tooltip on the kebab itself reads `Actions: Open thread, request state change…` This pushes the score to 6 without adding visual cost.
- **F2 (low).** Two clicks for one-touch tasks (Pause, Resume) is a real density tax even though the screen is dense. Acceptable trade — these requests are not high-frequency.
- **F3 (low).** "Open thread" sits at the top of the menu separated from "request state change". Clear.
- **F4 (low).** Disabled state ("Already in flight" for Resume on an in-progress task) needs a tooltip or aria-describedby for screen readers — currently aria-disabled is enough but could be better.

No issues require regen. Variant A advances at 8/10.
