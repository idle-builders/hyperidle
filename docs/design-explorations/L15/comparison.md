# L15 — Comparison

| Dimension | A — Minimal Menu | B — Structured Form | C — Inline Thread Peek |
|---|---|---|---|
| **Signature (one tell)** | A 16px ellipsis top-right of the card; tap, pick a verb, done. | Two equal-weight verbs at the card footer; "Request" opens a modal that makes you write. | Click the StatusChip; the card grows a thread strip in place. |
| **Component count** | TaskCard (existing) + DaisyUI dropdown + DaisyUI input + DaisyUI toast | TaskCard (existing) + 2× card btn + DaisyUI modal + radio-chips + textarea + KeyValue | TaskCard (existing) + DaisyUI textarea + composer (re-used) + chip-row (composed) + RichMessageCard (re-used) |
| **Density (cards visible at 1440 wide)** | Highest — 5 cards in In Progress column visible; only 16px icon adds chrome | Medium — 4 cards visible; each gained a button row (~28px) | Lowest when expanded — 1 expanded card displaces 2 collapsed cards in the column |
| **Primary action surface** | Top-right, card-internal, popover | Card footer pair, then modal | Inline-grown panel below the card |
| **State strategy** | One canonical card layout; menu overlays | One canonical card layout; modal overlays | Two card shapes (collapsed vs expanded) — accordion |
| **Motion budget** | One pop-in animation on the menu (var(--motion-medium)) | Modal slide+fade (var(--motion-medium)); send-spinner | Card height grow (var(--motion-medium)); transcript skeleton swap; new-message slide-in |
| **Action cost — request a state change** | 2 clicks (icon → verb) | 3 clicks (Request → chip → Send) | 1 click (chip in the expanded panel) — but +1 click to expand first, so 2 |
| **Action cost — open thread** | 2 clicks (icon → "Open thread") | 1 click ("Thread" button on card) | 2 clicks (expand → "Open thread →") |
| **Action cost — leave a free-form note** | 1 click + type (note input lives in the menu) | 3 clicks + type (Request → focus textarea → Send) | 1 click + type (composer in the expanded panel) |
| **Best at** | Speed for the common case | Deliberation; auditable request notes | Continuity with thread grammar; multi-turn back-and-forth |
| **Worst at** | Discoverability of "open thread"; signalling that this is a *request* not a command | Card density; click cost | Per-card vertical real estate; chip-as-trigger discoverability |
| **Critique score (0-10)** | 8.4 | 8.4 | 8.3 |

## Screenshots

- A: `minimal-menu/screenshot.png`
- B: `structured-form/screenshot.png`
- C: `inline-thread/screenshot.png`

## Anti-convergence verification (all three differ on ≥3 axes per pair)

| Pair | Differing axes |
|---|---|
| A vs B | surface (popover vs modal), density (icon vs button-row), action cost (2 vs 3 clicks), copy register (terse vs guided) |
| A vs C | hierarchy (icon-tucked vs panel-foregrounded), state strategy (one-shape vs two-shapes), composition (popover vs in-flow panel), motion (pop vs grow) |
| B vs C | surface (overlay vs in-flow), composition (modal vs inline), copy register (form vs conversation), kinetic feel (interrupt vs reveal) |

All three explore the same locked concept. None redefines what a Thread is or what a Task is.
