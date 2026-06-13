# AI2 — Dialog primitive — Comparison

Chrome is intentionally identical across all three (the Agent-pair chrome, promoted). The
variants compete on **machinery**: layer mechanism, guard location, composition model. The
rubric below scores fitness-for-this-spec, not pixels.

| Dimension | A — Native dialog core | B — Portal stack | C — Headless + layered |
|---|---|---|---|
| Signature (one tell) | One real `<dialog open>`, zero z-index on modals | One `#overlay-root`, one z-token scale | Contract is a hook, chrome is optional |
| Component count | 1 component | 1 component | 2 exports (hook + shell) |
| Layer mechanism | Browser top-layer (+2-step z for non-modals) | One 7-token z-scale, all in portal | Same 7-token scale, spread via hook |
| Where the guard lives | Native `cancel` event intercept | Primitive-owned `isDirty` prop | `useDialog` hook state |
| Composition model | Container w/ payload | Self-contained block | Layered (base + slots) |
| Deterministic stacking of 2 overlays | **Partial** — top-layer always above `fixed`; modal always covers TaskSheet, never reverse | **Yes** — both in `#overlay-root`, mount-order within a named band | **Yes** — same as B |
| Solves the headline (Esc discards pitch) | Yes | Yes | Yes |
| Kills the ~25-line JSDOM boilerplate | Moves it into wrapper (doesn't vanish — `showModal` fallback persists) | **Deletes it** — no native dialog, no `showModal`, no JSDOM gap | **Deletes it** — same |
| Focus uniformity | Two paths (native trap for modal, hand-roll for non-modal) | **One path** (focus-trap-react everywhere) | **One path** (hook owns it) |
| Mobile sizing ownership | In wrapper, forked by modal/non-modal branch | Owned centrally, one rule | Shell owns it; oddballs keep own |
| AI1 / tokens.css coupling | Low (2 z-values only) | Medium (7 z-tokens + scrim) | Medium (same as B) |
| Motion budget | fast fade+scale | fast fade+slide | fast fade |
| Best at | Least code; leans on the platform | One provable source of truth for layering + focus + guard | Honors that TaskSheet/Search are genuinely different surfaces |
| Worst at | Top-layer can't order vs `fixed` overlays → rigid "modal always wins" rule; JSDOM gap stays | More machinery re-implemented (scrim/inert/scroll-lock) | Two concepts; guard-render can drift across 3 bespoke surfaces; over-engineered if all use the shell |
| **Phase-2 critique score** | **6.4 / 10** | **8.6 / 10** | **7.3 / 10** |

## Phase-2 critique scoring (9 dimensions, /10 each, averaged)

**A — Native dialog core — 6.4**
- Anti-slop 8, Hierarchy 7, States 6, Reuse 9 (leans hardest on the platform), Density 7,
  Motion 7, Accessibility 8 (native a11y free), **Consistency 4** (fails the spec's
  "any two overlays stack predictably regardless of DOM order" — top-layer modals can't be
  ordered below a `fixed` TaskSheet; the layer contract has a permanent asterisk),
  **Simplicity 6** (the modal/non-modal render fork + persisting JSDOM boilerplate undercut
  the "thin wrapper" promise). The fatal flaw: it doesn't actually unify layering — it adds a
  *fifth* rule ("top-layer beats everything") rather than collapsing to one scale.

**B — Portal stack — 8.6**
- Anti-slop 9, Hierarchy 9, **States 9** (guard grammar owned in one place, one confirm
  strip), **Reuse 8** (focus-trap-react reused; scrim/inert re-implemented once), Density 9,
  Motion 8, Accessibility 8 (must add `inert` manually — handled once),
  **Consistency 10** (named z-scale + single portal satisfies every layer AC literally),
  **Simplicity 9** (one import, one mental model, "boring technology"). The machinery cost is
  real but paid exactly once, behind one component — the right place to spend it.

**C — Headless + layered — 7.3**
- Anti-slop 8, Hierarchy 8, States 7 (guard state correct but rendered in 3 places for the
  oddballs — drift risk), Reuse 8, Density 8, Motion 8, Accessibility 8, Consistency 9
  (same scale as B), **Simplicity 6** (two exports for one primitive strains the component
  budget's spirit; the headless split only pays off because 3 surfaces differ — a real but
  narrow win). Strong, but it front-loads flexibility the spec didn't ask for ("exactly one
  primitive; deviations are flags, not forks" — a hook+shell pair is closer to two things).

## Screenshots
- A: `a-native-dialog-core/screenshot.png` — clean (Esc closes) vs dirty (Esc → guard strip).
- B: `b-react-portal-stack/screenshot.png` — the z-token scale embodied: popover@40 under
  scrim@50 under dialog@60 under toast@70, all in one stage.
- C: `c-headless-layered/screenshot.png` — DialogShell confirm (left) + a drawer threading the
  same `useDialog` contract with bespoke chrome (right).
