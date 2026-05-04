# L15 — Variant comparison

## Critique scores

Each variant scored against the eight `/design-critique` dimensions (hierarchy, spacing, typography, color, coherence, states, a11y, anti-slop).

| Dimension | A — Kebab | B — Inline chips | C — Side sheet |
|---|---|---|---|
| Visual hierarchy (where the eye lands) | 9 — title leads, kebab is invisible until needed | 7 — chip row competes with title once revealed | 7 — sheet pulls eye off board entirely |
| Spacing / density | 9 — zero added vertical bleed | 6 — reserves ~26 px slot per card OR jumps height on hover | 8 — board itself unchanged |
| Typography | 8 — consistent | 8 — chip Tag recipe re-used | 8 — section header / sheet title scale used correctly |
| Color | 9 — monochrome respected; danger only on Blocked | 8 — same; primary tint on Thread is a designer-call deviation | 8 — danger on Blocked button |
| Coherence with system | 9 — uses DaisyUI dropdown grammar already present | 7 — invents a new "chip-row beneath card" pattern unique to Kanban | 6 — sheet pre-empts L18's task-thread surface |
| State coverage | 8 — empty/loading/error/posting all specified | 7 — height-jump tradeoff still hand-wavy | 9 — most thoroughly specified states |
| Accessibility (≥44 px touch, focus, kbd) | 8 — kbd hints in submenu; mobile pads to 44 px | 7 — chips are 26 px high in mockup → mobile must always-show + grow to 44 px | 8 — sheet has obvious focus trap |
| Anti-slop / AI-aesthetic | 9 — no gradients, no 3-col grid, no oversized padding | 8 — chip row could read as "stock toolbar"; mitigated by dense chip recipe | 7 — sheet w/ "Request state change" header + 2×2 button grid edges close to "stock detail panel" |
| **Total / 80** | **69** | **58** | **61** |
| **Score / 10** | **8.6** | **7.3** | **7.6** |

## Comparison axes

| Axis | A | B | C |
|---|---|---|---|
| Signature (one tell) | Invisible-by-default 24 px kebab; menu+submenu | One-click chip row beneath card on hover | Click-to-open right side sheet |
| Component count | 0 new | 0 new (inline) / +1 if extracted | 0 new (inline) / +1 if Tier-3 sheet promoted |
| Density | Highest — card unchanged | Medium — slot reserved per card | Highest on the BOARD; sheet eats 480 px |
| Primary action surface | Kebab → menu → submenu (2 clicks) | Chip (1 click) | Sheet button (2 clicks: open → click) |
| State strategy | Hidden by default, revealed on hover/focus | Hidden by default, revealed on hover/focus | Decoupled: card unchanged, sheet is the state surface |
| Motion budget | Opacity fade (motion-fast) on kebab; medium on menu | Opacity fade on chip row | Slide-in motion-slow + backdrop fade |
| Best at | Density · familiarity · mobile · component budget | Speed (1 click) · directness | Discoverability · long-form interaction · L18 alignment |
| Worst at | 2 clicks for state request | Mobile (always-on chip row eats height); height-shift jitter | Heaviest UX cost per interaction; pre-empts L18 |
| L18 future-proofing | Clean — "Open thread" is a route action; L18 fills the surface | Clean — "Thread" chip routes the same way | Risky — L15's sheet design constrains L18's choices |
| /design-critique score | **8.6** | **7.3** | **7.6** |

## Headline

**Variant A wins on every load-bearing axis.** It honors density (the explicit design principle), respects the L15/L18 boundary the architect drew, costs zero new components, and uses the most familiar grammar in productivity tools. The "two clicks" cost is a feature, not a bug: humans **request**, they don't **command**. The extra click reinforces that the founder is asking, not directing.

Variant B's one-click directness is appealing but the always-on chip row on mobile breaks density, and the chip recipe edges toward the "row of buttons under every card" anti-pattern that has already failed before in productivity tools (Asana 2018 redesign rolled it back).

Variant C is the most discoverable but pre-empts the L18 thread-surface design and is heaviest per interaction. The sheet is the right move for L18, not for L15.
