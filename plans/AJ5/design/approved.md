# AJ5 — Annotation overlay — APPROVED design

**DESIGN-CLASS: routine** (see brief.md). Single variant — "Review pill". This is the input contract to `/architecture`; the architect does not re-decide visual hierarchy, component vocabulary, or interaction grammar.

> Note: `plans/AJ5/architecture.md` already exists (this design ran after a draft architecture). Nothing here contradicts it; two refinements are flagged under "Architecture deltas" in `brief.md` (one-shot arm semantics; fixed-to-pill popover). Carry them into `architecture.md` §task 5 wording if updating.

## The locked design

A bottom-left **review pill** (sibling to the top-right `Toolbar`) owns the whole loop: arm select-mode, see hover/selected outlines on the rendered story, write one note in a fixed popover that rises from the pill, watch the count climb, close the round with "New iteration". All chrome reuses the `viewer.css` toolbar language via a new `.anno-*` class namespace. **Zero catalogued DS components. Zero new entries in the 56-story snapshot net.** The overlay TSX mounts in `App` chrome only.

## Component mapping (where, what props)

Lives in `packages/design-system/viewer/annotations/annotation-overlay.tsx`, mounted in `viewer/main.tsx` `App` after `<Toolbar/>`, guarded by `isComponentPage` (no overlay on the catalog index). All classes added to `packages/design-system/viewer/viewer.css`.

| Element | Class | State props it reflects |
|---|---|---|
| Pill cluster (fixed bottom-left) | `.anno-pill` | always rendered on a component page |
| Arm toggle | `.toolbar-btn .anno-arm` (`+ .toolbar-btn--active` armed) | `armed: boolean`; `aria-pressed={armed}` |
| Round label | `.anno-round` | `state.currentRound` |
| Count (click → toggle list) | `.anno-count` | current round `annotations.length`; round-count button carries `aria-label` (e.g. `Round 2, 3 notes — show notes`) since the visible label is terse mono chrome |
| New iteration | `.toolbar-btn .anno-iterate` (`disabled` when 0 notes) | current round empty? |
| Note popover (fixed above pill) | `.anno-popover` | `selected: AnnotationTarget \| null` |
| Popover header (target echo) | `.anno-target` | `selected.component` + `selected.element`, mono, ellipsis + `title` |
| Textarea | bare `<textarea>` styled by `.anno-popover textarea` | `note` draft |
| Save | `.toolbar-btn .anno-save` | `saving: boolean` → `Saving…` disabled |
| Cancel | `.toolbar-btn` | — |
| Inline error | `.anno-error` | POST failure |
| Notes list (expanded) | `.anno-list > li` | current round notes (read-only) |
| Hover outline | `.anno-hover` | applied to hovered story element while armed |
| Selected outline | `.anno-selected` | applied to captured element |
| Saved outline | `.anno-saved` | best-effort re-applied on load; decorative, non-blocking. **Doubled outline (RESOLVED): a `--surface-elevated` halo + an `--accent-primary` line**, so the persistent "annotated" signal clears ≥3:1 contrast against arbitrary story backgrounds in **both** Hearth themes (AQ-007 cut-out trick). Build to this, do not re-decide. |

**Token rule (explicit, do not violate):** reused `.toolbar-*` classes (`.toolbar-btn`, `.toolbar-pill`, `.toolbar-btn--active`) **KEEP their existing hardcoded values** as they stand in `viewer.css` today (8px / 6px padding, 80ms transition). Do **not** tokenize or otherwise dirty the shared toolbar to satisfy this overlay — that surface is shared and out of AJ5 scope. Only **net-new `.anno-*` classes** use Hearth tokens. So: `.anno-*` tokens only (AQ-008): outlines use `--accent-primary` / `--accent-primary-dim`; panel uses `--surface-elevated` + `--border-default` + `--shadow-elevated` (floating surface, AQ-012); radius `--r-subtle` (10px) for the panel, `8px` for the pill to match `.toolbar-pill`'s existing hardcoded value; mono labels `--font-mono`, `--text-tertiary`, `--tracking-caps-sm` (AQ-013); motion `--motion-fast` + `--motion-ease`, transform/opacity only (AQ-014).

## States with copy

- **Empty / first run:** `Round 1 · 0 notes`, toggle `Select`, New iteration disabled, no popover. Reads ready, not broken.
- **Idle with notes:** `Round 2 · 3 notes`; saved elements outlined; click count → expand list.
- **Armed:** toggle `Selecting…` + accent; hover outline tracks pointer over story root; `Esc` or re-click disarms.
- **Popover open:** header `Button · button.btn--disabled "Save"`; textarea autofocused, placeholder `What should change about this element?`; Save (accent) + Cancel.
- **Saving:** Save → `Saving…` disabled; on error inline `.anno-error`: `Couldn't save — the viewer middleware may be down. Retry?`; typed note preserved.
- **New iteration:** `Round 2 → Round 3`, count → `0 notes`, saved outlines clear; disabled until a note exists.
- **Overflow:** target descriptor ellipsis + `title`; list note clamped to first line; pill never grows.

## Behavior + motion + keyboard

- One-shot arm: attach `mousemove` + capturing `click` scoped to the **story root**, not `document`; capture on first qualifying click then detach (disarm). Pill/popover excluded from capture.
- Focus trap in popover (`Tab` textarea → Save → Cancel); `Esc` cancels → focus returns to arm toggle; `Cmd/Ctrl+Enter` saves.
- No global keyboard verbs beyond `Esc` / `Cmd+Enter` (founder-filter: no keyboard-verb menagerie).
- **Cheap ARIA (required):** `aria-pressed={armed}` on the Select arm toggle (its active state is otherwise color-only); `aria-label` on the round-count button (visible label is terse mono chrome — give SR users the full `Round N, M notes` reading). No further ARIA — desktop dev tool, not a product a11y target.
- Popover/list enter: `opacity` + 4px `translateY`, `--motion-fast`, `--motion-ease`. Outlines instant. `prefers-reduced-motion` honored via tokens.

## Mobile adaptation

N/A — `:8098` is a desktop dev tool, not a product surface; no three-tab mapping. Narrow-viewport fallback (pill wraps, popover full-width-minus-12px) is graceful-only, not a designed target.

## Rejected (do not re-litigate — see rejected.md)

Floating draggable window · element-anchored popover · always-on sticky select · folding into the top-right Toolbar · building from catalogued DS components · live CSS tweak sliders · per-component annotation UI. Each rejected with reason in `rejected.md`.

## In-session Phase-2 critique (9 dimensions)

Scored against `AESTHETICS.md` + the design references. Single variant, so critique is on `approved.md`.

| Dimension | Score /10 | Note |
|---|---|---|
| Hierarchy | 8 | Arm verb → round/count → iterate reading order is deliberate; popover takes focus when open. |
| Spacing | 8 | Reuses `.toolbar-pill` 4px pad / 8px gap; panel on 6px grid. On-grid by construction. |
| Typography | 8 | Mono tertiary labels (AQ-013); type sizes inherit toolbar's 11px chrome scale (on-scale). |
| Color | 8 | Tokens only; `--accent-primary` for armed/outline, `--surface-elevated`+warm shadow for panel. No hardcoded color. |
| Coherence | 9 | Reads as a sibling of the existing Toolbar — same chrome language, opposite corner. Strong fit. |
| States | 9 | Empty/idle/armed/capturing/saving/error/new-iteration/overflow all specified with copy. |
| A11y | 7 | Focus trap + `Esc` + autofocus specified; the *target* elements aren't 44px touch targets but this is a desktop dev tool (AQ-015 viewport-scoped, N/A). Saved-outline color must clear 3:1 against arbitrary story backgrounds — flagged for build. |
| Anti-slop | 9 | No centered empty state, no hero, no gradient, no decorative icons, no draggable-window cargo cult. Dense, purposeful, distinctive. |
| Premium polish | 8 | Tiny motion budget, instant outlines, preserved-draft-on-error — finished feel without showcase. |

**Composite: 8.2/10.** No dimension below 5 → no low-confidence fallback to a 2nd variant. Routine classification holds.

## Open questions for the architect

1. **Saved-outline contrast (A11y flag) — RESOLVED.** `.anno-saved` uses the **doubled outline**: a `--surface-elevated` halo + an `--accent-primary` line (AQ-007 avatar cut-out trick), so it clears ≥3:1 against arbitrary story backgrounds (cards, dark surfaces) in **both** Hearth themes. This is the committed persistent "annotated" signal — no build-time re-decision.
2. **Story-root scoping for the click listener.** Architecture §task 5 says "story area"; confirm the concrete DOM anchor (the `ComponentWrapper`/`.demo-grid` subtree under `App`) so the capturing listener attaches there and excludes the pill/popover/toolbar.
3. **List expansion source.** The expanded `.anno-list` renders the current round's notes — confirm it reads from the same `GET /__annotations` response already fetched for the count (no extra endpoint), keeping the client stateless over rounds per architecture §B2.
