# Variant C — Segmented toggle + persistent clear pill — CRITIQUE

Scoring against the nine `/design-critique` dimensions, judged from the rendered `screenshot.png` (1280×820, two frames).

| Dimension | Score | Notes |
|---|---:|---|
| 1. Visual hierarchy | 9 | The segmented control reads as one component before the eye parses the labels. Shape encodes "single binary axis" the way three loose chips cannot. List still dominates. The clear-pill is a quiet secondary affordance — clearly subordinate to the control. |
| 2. Spacing & density | 7 | Adds a second chrome row (the pill) above the list whenever a filter is active. That's vertical density traded for permanent recovery affordance. Justifiable but a real cost vs. A's single-row chrome. |
| 3. Color & dark mode | 9 | Same palette discipline as A. |
| 4. Typography | 8 | Pill copy `× Showing blocking only — clear` is mono 10-11 px — readable but dense. The unicode `×` is rendered as text, not an emoji (AQ-105 clear). |
| 5. Borders / radii / shadows | 9 | Joined segments use shared `--r1` outer corners + zero inner gap — the visual contract for a segmented control. Pill is `--r-pill`. No off-scale radius. |
| 6. Motion | 8 | Spec calls `--motion-fast` on segment toggle and pill enter/exit. GPU properties (opacity + transform). Honors `prefers-reduced-motion`. |
| 7. Mobile & touch | 8 | Joined segments give wider individual touch targets (each ≈90 px wide at 240 px Submenu). Pill is ≥40 px wide; at comfortable density on mobile, ≥44 px tall. |
| 8. Information architecture | 9 | Strongest of the three on encoding the axis visually. The shape of a two-segment joined control IS the axis. Pill provides a permanent, discoverable recovery surface that A and B place inside the empty-filter state only. |
| 9. Founder filter | 9 | No emojis, no purple, no rounded-2xl. No keyboard verb shortcuts. No drag-reorder. The "click active segment to clear" gesture is non-standard but is mitigated by the pill (one-click clear is always reachable). |

**Total:** 76/90 → **8.4 / 10**.

**Strengths**
- The geometric semantics of a binary segmented control teach the single-axis rule by shape — the variant's signature.
- Persistent clear-pill above the list means recovery is one click in every state (filter populated, filter empty, filter active during scroll). The pill IS the recovery affordance.
- Zero new custom components — composes from DaisyUI `join` + `badge`. Component budget win.

**Weaknesses**
- No `All` segment. Default state is "both segments inactive (ghost)" — a first-time user cannot infer that "neither is dark" means "no filter" without seeing the populated full list. The pill is absent in default state, which helps.
- "Click active segment to clear" is a learned interaction that conflicts with chip-row priors from Gmail/Slack/Linear *list* filters. The pill mitigates but does not eliminate this; the action surface for "clear" doubles (segment OR pill).
- The empty-filter EmptyState body is intentionally terse (title only, no description, no body action) because the pill above it is the recovery. That terseness is consistent with the design's logic but breaks parallel structure with A and B's richer empty-filter states — and makes the "what filter am I in?" question less obvious to a user who scrolls past the pill.

**Verdict:** clears the ≥7 threshold strongly. Highest IA + hierarchy scores. The action-surface doubling is real but defended by the pill's permanence.
