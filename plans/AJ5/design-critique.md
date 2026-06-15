# Design Critique: AJ5 — Annotation overlay ("Review pill")

Reviewer (independent evaluator, AJ5). Scored cold against the 9-dimension rubric.
Judged as **dev-only viewer chrome (DESIGN-CLASS routine)** — premium-product polish bars
apply lightly; clarity, state coverage, token coherence with the existing viewer `Toolbar`,
and a11y of the selection outline are what matter.

Artifacts read: `design/approved.md`, `design/brief.md`, `design/annotation-overlay/spec.md`,
`screenshot.png`, plus ground-truth `viewer/main.tsx` + `viewer/viewer.css` (the `Toolbar` the
overlay mirrors).

DESIGN-CRITIQUE: variant=annotation-overlay score=8/10 rounds=1 axes: H:8 S:8 T:8 C:7 Co:9 St:9 A:7 AS:9 PP:8

## Composite: 8.0/10 — APPROVED (no dimension < 5; routine, single variant holds)

| Dimension | Score | Note |
|---|---|---|
| Hierarchy | 8 | Arm verb → round/count → iterate reading order is deliberate; popover takes focus when open. Screenshot confirms the armed `Selecting…` accent is the eye-magnet. |
| Spacing | 8 | Reuses `.toolbar-pill` 4px pad / 8px gap geometry; popover panel on a 6px grid. On-grid by construction. |
| Typography | 8 | Mono tertiary target echo (`Button · button.btn--disabled "Save"`), 11px chrome scale inherited from toolbar. On-scale. |
| Color | 7 | Tokens specified for `.anno-*`. But the toolbar it mirrors is itself NOT token-pure (see Coherence finding) — and the saved-outline 3:1 contrast over arbitrary story backgrounds is unresolved (a11y open Q1). |
| Coherence | 7 | Reads as a true sibling of `Toolbar` (opposite corner, same pill language). Downgraded from the producer's self-score of 9: the design says "Tokens only / radius `--r-subtle`", but the real `.toolbar-pill` is hardcoded `8px`/`6px`/`80ms`. "Match the toolbar" and "tokens only" conflict — the builder must be told which wins. |
| States | 9 | Empty / idle / armed / capturing / saving / error / new-iteration / overflow all specified with copy. Best-in-class state coverage for chrome this small. |
| A11y | 7 | Focus trap + `Esc` + `Cmd/Ctrl+Enter` + autofocus specified. Two real gaps: saved-outline contrast unproven (Q1), and no ARIA role/label spec for the pill or the armed-state toggle (`aria-pressed`). |
| Anti-slop | 9 | No hero, no gradient, no decorative icons, no draggable-window cargo cult. Dense, purposeful, distinct from the prior-art `feedback-overlay.js`. |
| Premium polish | 8 | Tiny motion budget (opacity + 4px translateY, `--motion-fast`), instant outlines, preserved-draft-on-error. Finished feel without showcase. |

## CRITICAL
(none)

## WARNING

- **[approved.md §Tokens / coherence with viewer.css §216-240] Token-purity vs toolbar-mirroring
  conflict.** The design states "Tokens only (AQ-008) … radius `--r-subtle` (10px) for the panel,
  `8px` for the pill to match `.toolbar-pill`". But the real `.toolbar-pill` uses a **hardcoded**
  `border-radius: 8px`, `.toolbar-btn` uses `border-radius: 6px` and `transition: background 80ms`
  — none are tokens. The `.anno-*` classes that reuse `.toolbar-btn` will inherit those hardcoded
  values; net-new `.anno-*` rules can be token-pure. This is benign (viewer.css is dev chrome,
  outside `eslint-plugin-design`'s `packages/*/src` scope, so neither path is lint-gated) but the
  design must not claim "tokens only" where it literally composes `.toolbar-btn`'s hardcoded radius.
  → Fix: state the rule explicitly — "reused `.toolbar-*` classes carry the toolbar's existing
  hardcoded chrome values; net-new `.anno-*` rules use tokens." So the builder doesn't waste a cycle
  trying to tokenize the shared toolbar (which would dirty the toolbar's own appearance).

- **[approved.md §Open Q1 / spec.md `.anno-saved`] Saved-outline 3:1 contrast is unproven and
  decorative-only — fine, but pick the mitigation now.** `.anno-saved` outline
  (`--accent-primary-dim-derived`) sits over arbitrary story backgrounds (dark cards, accent panels).
  The design correctly flags this as cosmetic/non-gating but leaves the resolution to "build". Since
  it is the only persistent visual signal that an element was annotated, an invisible outline on a
  dark surface silently breaks the "which did I annotate" affordance. → Fix: commit to the doubled
  outline (a `--surface-elevated` halo + `--accent-primary` line, AQ-007 avatar-cutout trick) in the
  design so the builder doesn't ship a single-line outline that vanishes on half the catalog.

- **[approved.md §Behavior / spec.md §Behavior] No ARIA role/label spec for the pill or armed toggle.**
  Focus trap and keyboard verbs are specified, but the pill cluster has no `role`/`aria-label`, and the
  arm toggle has no `aria-pressed` to expose armed/disarmed to AT. For a desktop dev tool this is low
  stakes, but it is cheap and the rubric scores it. → Fix: add `aria-pressed={armed}` on the arm
  toggle and an `aria-label` on the count button (it is icon-light text; "3 notes, show list" reads
  better than "3 notes"). Note: AQ-015 touch-target ≥44px is correctly waived (viewport-scoped, desktop tool).

## SUGGESTION

- **[approved.md §States "Saving"]** The error copy `Couldn't save — the viewer middleware may be down.
  Retry?` ends in a question with no actual retry control named. Either wire the `?` to re-issuing the
  POST (Save button stays active) or drop the `?` so it doesn't imply an affordance that isn't there.

- **[spec.md §Capture]** `preventDefault`/`stopPropagation` on the captured click is correct, but the
  spec should name that the capturing listener must also exclude clicks that land on the pill/popover
  *after* arming but *before* capture (e.g. founder arms, then clicks the count) — otherwise the first
  qualifying click could resolve the overlay's own chrome. The brief's "Pill/popover excluded from
  capture" covers it; promote it from prose to an explicit guard in the behavior spec so the builder
  doesn't miss it.

## What's Working Well

- **State enumeration is exemplary.** Eight named states each with literal copy — the kind of
  completeness most product surfaces skip. The empty state reading "ready, not broken" (`Round 1 · 0
  notes`) is exactly right for first-run dev chrome.
- **The reuse discipline is the strongest part of the design.** Refusing to build from catalogued DS
  components (which would stamp `data-ds-component`, pollute the annotation surface, and risk entering
  the 56-story snapshot net) is the correct, non-obvious call — and it's the same call the existing
  `Toolbar` already made. The overlay reads as a native sibling of viewer chrome, not a bolt-on.
