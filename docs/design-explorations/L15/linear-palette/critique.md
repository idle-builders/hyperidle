# L15 Variant C — `linear-palette` — Design Critique

**Score: 6.4 / 10** — fails ≥ 7 gate.

## Per-dimension scores

| Dimension | Score | Notes |
|---|---|---|
| 1. Visual Hierarchy | 8 | Inside the palette: title → filter → verbs → divider → universals → footer hint. Top-down order is right. |
| 2. Spacing & Density | 7 | Palette internal spacing uses 8/10/12 — on grid. The `K` chip on the card is 1px×5px padding — fine; below the 4px floor only because chip-internals are exempt under AQ-001. |
| 3. Typography | 7 | Palette items 13/11 mono. `K` chip 10px mono — at the 11px mono floor; AQ-004 allows but it's tight. |
| 4. Color Usage | 7 | Tokens only. Backdrop-dim uses `rgba(0,0,0,0.45)` — should probably be `color-mix(in oklab, var(--surface-0) 60%, transparent)` for theme consistency. Selected palette item: `--primary-dim` (correct). |
| 5. Component Coherence | 6 | The `K` chip is a brand-new visual element. Carries no precedent in the design system. Either justify (footnote in `tokens.css`), reuse `Tag`, or drop entirely. |
| 6. State Coverage | 7 | Closed / focused / open (mouse) / open (keyboard) / empty filter / fired-atomic / fired-with-reason / open-thread → navigates / mobile bottom-sheet — all listed. The "request pending" indicator on the card is the same as A/B — good. |
| 7. Accessibility | 8 | role=dialog on palette, role=listbox on list, role=option on items, aria-selected toggling. Filter input has explicit autofocus. `Esc` closes. Strong keyboard story — that's the variant's core thesis. |
| 8. Anti-slop | 5 | **Two issues.** (1) The "command palette" pattern itself, scaled down to 5–7 commands per task, is an over-design — palettes earn their keep at 50+ commands. The chrome-to-content ratio is high. This is borderline aesthetic-slop. (2) The hint footer "AGENTS DECIDE" reads as marketing copy — too earnest for a productivity tool. |
| 9. Verifiability | 7 | Palette is a modal — testable. Filter is real-time string match — testable. All fire-paths testable. Mockup matches spec. |

## CRITICAL

- **C-1** — The pattern is the wrong tool. A command palette is a great answer when there are many commands; here there are at most 7. With so few items, the filter input is friction (you'd just arrow-down anyway), the multi-section structure is fluff, and the keyboard-first pitch loses its edge against Variant A's letter-shortcut menu (which also gets `↵ ↓ ↓ ↵` for the user). The whole pattern is heavier than the problem.

## WARNING

- **W-1** — Two-grammar problem. Mouse users see a popover; keyboard users see a palette. Same overlay, two mental models. Variant A keeps a single mental model (it's a menu, regardless of input device).
- **W-2** — The `K` chip is a teaching aid, not a state. It only has value the first few times. After learning, it's chrome. Cards get unnecessarily noisy.
- **W-3** — "Cancel pending request" as a palette command is a good idea — but it's the only one of the variants that surfaces it. The synthesis should pull this into the chosen design.

## SUGGESTION

- **S-1** — If the palette pattern wins, drop the filter input. Keep the list of 5–7 commands; arrow-keys + Enter only.
- **S-2** — Replace `K` chip with focus-only outline + focus-only `Tag(K)` placed at the bottom-right (so titles aren't truncated).
- **S-3** — The "with-reason" composer flow is the strongest contribution this variant makes. Worth pulling into the chosen direction regardless.

## Verdict

The keyboard-first thesis is right for a power-user tool. The execution overshoots — a palette is too much chrome for the verb count. Variant A's letter-shortcut menu achieves the keyboard goal with less surface area. C's "request-with-reason composer" and "cancel pending request" affordance are the gems worth pulling forward.
