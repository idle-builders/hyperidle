# L15 Variant A — `quiet-menu` — Design Critique

**Score: 7.6 / 10** — passes the ≥ 7 gate.

## Per-dimension scores

| Dimension | Score | Notes |
|---|---|---|
| 1. Visual Hierarchy | 8 | Card content reads first; menu is clearly secondary; selected card has a visible ring; menu items have a clear "section label → disclosure → verbs → divider → universals" structure |
| 2. Spacing & Density | 8 | Uses `--density-card-pad`, `--density-card-gap` directly. Menu uses 4px / 6px / 10px increments — all on grid. `···` button is 22×22 (4px-aligned, fits the cap because mobile gets the always-visible row tap). |
| 3. Typography | 8 | Body 13px (menu items), labels 11px mono caps, shortcut hints 11px mono. No new sizes. |
| 4. Color Usage | 8 | Tokens only. No purple/indigo. Selected item uses `--primary-dim`. Pending chip uses `--surface-ghost` + dashed border (monochrome, contract-true). |
| 5. Component Coherence | 7 | Reuses TaskCard verbatim. The menu is shaped like `BlockActionsPopover.html` (correct precedent). Pending-chip variant is new but minimal. |
| 6. State Coverage | 8 | Default / hover / open / pending / sent / error / loading / empty (first-use disclosure) all specified. |
| 7. Accessibility | 7 | aria-haspopup, aria-expanded, role=menu, role=menuitem all set. Letter shortcuts native. Touch path: tap card → menu (44px target via card body). One concern: focused-card shortcut to "open thread" is via menu navigation, not direct — keyboard users pay 4 keys for the most common action. |
| 8. Anti-slop | 9 | Zero AI-aesthetic tells. No `rounded-2xl`, no purple, no decorative icons, no oversized padding. The `···` is a real interaction surface, not chrome. |
| 9. Verifiability | 8 | All states are testable: hover triggers opacity; aria-expanded toggles; menu items fire callbacks; toast appears with role=status. Mockup matches the spec. |

## CRITICAL

None.

## WARNING

- **W-1** — Direct "Open thread" path on keyboard requires 4 presses (`Enter` → `↓ ↓ ↓` → `Enter`). Mitigated by `O` shortcut inside the menu, but this needs to be documented and consistently labelled. If thread-open is the most common action, it should arguably be `Enter` directly on the card (the menu should be a SECONDARY trigger, e.g., `Cmd+.`). Founder-call.
- **W-2** — The asymmetry between desktop (tap card body opens menu) and mobile (tap card body opens menu) versus desktop (tap card body opens nothing — only `···` does) needs alignment. The spec proposes "tap card body opens menu on touch" — but on desktop the click event also fires, and DOES nothing. Consider: tap-to-open-menu on all surfaces, OR drag-handle-style trigger only.

## SUGGESTION

- **S-1** — The first-use disclosure is good. Consider showing it on every menu open for the first 3 invocations (compounding teaching), not just the first one.
- **S-2** — The pending chip should carry a `title` attribute with the requested verb so a hover tooltip says "Request stop · 2 min ago".
- **S-3** — Replace literal `···` glyph with a proper SVG icon for crisp rendering at high-DPI; otherwise glyph kerning varies by font.

## Verdict

Cleanest, cheapest path. Component budget +0. Discoverability is the weakness — but it's the weakness any quiet-by-default design has, and the founder filter favours density over signposting.
