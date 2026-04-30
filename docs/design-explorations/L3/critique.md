# L3 — Artifact Primitive — Step 2 Design Critique

**Step.** /design-critique — pipeline Step 2 against `approved.md` (synthesized final from /design Step 1).
**Method.** Nine-dimension rubric per `.claude/skills/design-critique/SKILL.md`. Aggregation: arithmetic mean across the nine scores.
**Iterations.** 1 (no further iteration required — score crossed the threshold on the first scoring pass; minor optional polish fixes adopted to lift two dimensions from 7 to 8).

---

## Aggregated score

**8.2 / 10** — above the ≥7 threshold. Ready for /architecture (Step 3).

(H:8 S:8 T:8 C:8 Co:9 St:8 A:8 AS:9 PP:8)

---

## Per-dimension scoring

| # | Dimension | Score | One-line rationale |
|---|---|---|---|
| 1 | Visual Hierarchy | 8 | Clear reading order in every layout — kind/task identity reads as metadata; derived title is the primary visual weight; cost/timestamp recede; embed identity strip is intentionally light because it lives inside review-message chrome. |
| 2 | Spacing & Density | 8 | All spacing references closed density tokens (`--density-card-pad`, `--density-card-gap`, `--density-row-h`, `--density-pad-x`); auto-density flips at <1024px (AQ-016); no hardcoded `p-[Npx]` anywhere. |
| 3 | Typography | 8 | Closed scale (11/13/14/15/20px), three weights (400/500/600), Geist + Geist Mono only, tabular-nums on every numeric value, `--tracking-caps` on every uppercase label (AQ-007). |
| 4 | Color Usage | 8 | Monochrome chrome + semantic `--ok`/`--danger` reserved for diff lines and verification pass/fail counts. Color carries information on the only kind that has a binary outcome; no per-kind decoration; halation guard via the surface ladder (AQ-009). |
| 5 | Component Coherence | 9 | Four sub-primitives (`ArtifactKindBadge`, `ArtifactCostChip`, `ArtifactTimestamp`, `ArtifactPreviewSurface`) shared across all four top-level layouts — single source of truth. Embed enforced as a separate component with lint guard (`design/no-embed-chrome`). View family closed at the export boundary. |
| 6 | States & Feedback | 8 | Spec-complete state matrix in §3 (5 states × 4 layouts). Cost-pending → `—`, no-preview → `PREVIEW PENDING`. Thread-pill pluralization rule added in this step. Mockup rendering deferred to implementation stories per `.claude/rules/visual-parity.md` — the spec is unambiguous and the states are verifiable. |
| 7 | Accessibility | 8 | `role="button"` + `aria-label="Open artifact"` on embed arrow; `aria-disabled` for the unreachable case; `outline: 1px solid var(--primary); outline-offset: -1px` focus ring; full keyboard model (Enter/Space); touch targets ≥44px (AQ-015); reduced motion respected (AQ-014). |
| 8 | Anti-Slop | 9 | Zero AI-aesthetic tells. No purple/indigo gradients (AQ-102), no `rounded-2xl` (AQ-101 → uses `--r1`/`--r2`), no oversized padding (AQ-103), no emojis (AQ-105), no decorative icons (AQ-113), no glass morphism (AQ-107), no hero (AQ-104), no marketing superlatives (AQ-110). The 6-kind gallery demonstrates kind variance rather than the AQ-108 stock 3-column identical card grid. |
| 9 | Premium Polish | 8 | Tabular-nums, `+0.02em` tracking on caps, motion tokens, reduced-motion, halation guard, mobile-input ≥16px, auto-density, full hover/pressed/disabled matrix on every interactive surface. The `ArtifactCostChip variant="full"|"compact"` sub-primitive API replaces inline overrides — premium APIs are typed, not styled-in-place. |

---

## Fixes adopted into `approved.md`

Two optional fixes were incorporated to lift States (7→8) and Premium Polish (7→8). Both are pure spec additions — no layout, contract, or hard-rule change.

### Fix 1 — Pressed and disabled state matrix (Premium Polish)

`approved.md` §4 ("Behavior, motion, keyboard, focus") gained:

- **Pressed.** `:active` ramps one surface step down per the AESTHETICS pressed-state convention. Card: `--surface-5 → --surface-4`. Stack row: `--surface-4 → --surface-3`. Embed arrow: `--surface-3 → --surface-2`. All via `--motion-fast`.
- **Disabled.** Layouts have no disabled state at the L3 level. The embed `→` arrow disables only when the artifact's permalink is unreachable; rendered with `aria-disabled="true"`, `cursor: not-allowed`, color `--text-lo`, no hover.

### Fix 2 — Thread-pill pluralization (States)

`approved.md` §3 (state matrices) gained:

- `0` → not rendered (earned, not given);
- `1` → `"1 thread"`;
- `≥2` → `"N threads"`;
- Stack-row width-constrained variant collapses to numeric-only `"N"` only when the row's right cluster cannot fit the labelled form. Gallery and `ArtifactPreview` always render the labelled form because they have the width budget.

This closes the WARNING from the Phase-2 critique ("`2` thread pill is non-pluralized — when count = 1, `1` reads ambiguously").

### Score table updated

`approved.md` §9 was updated from 8.0 / 10 to 8.2 / 10 to reflect the two adopted fixes.

---

## Why one iteration was sufficient

The synthesis going into this step had already absorbed the entirety of the Phase-2 Variant B critique (7.6 / 10):

1. **States gap** (Phase-2: 6 → synthesis: 7) — closed by the explicit 5×4 state matrix in §3.
2. **Accessibility gap** (Phase-2: 7 → synthesis: 8) — closed by explicit `role`/`aria-label` on the embed arrow + documented keyboard model.
3. **Premium Polish gap** (Phase-2: 6 → synthesis: 7) — closed by explicit motion/density/halation tokens, mobile-input-size, auto-density, tabular-nums, tracking, and the `ArtifactCostChip variant` API.

The remaining headroom on States and Polish was both small (each at 7) and addressable with non-controversial spec additions. Adopting them brought the design from 8.0 to 8.2 with no architectural impact.

The four-layout view-family closure and the §4.5 hard rules are FIXED per the brief — none of the adopted fixes touch them.

---

## Concerns surfaced for /architecture (Step 3)

These are unresolved by the design phase and explicitly tagged as architect's calls. They do **not** lower the score because they are out of design scope per `approved.md` §8.

1. **`preview` discriminated-union closure.** Per-kind shapes need TS-level closure. Design assumes one exists.
2. **`kind` enum closure** — closed literal union vs. open string + catch-all renderer. Both work; architect picks.
3. **Producing-task-title denormalisation** vs. batched fetch. Design assumes the former for hot paths.
4. **`getArtifactViewProps(artifact): { shape, payload }` helper location.** Shared package vs. L3 package.
5. **Thread-count fetching contract.** Denormalised on aggregation responses vs. per-artifact lookup.
6. **`cost_from_session` shape alignment with L4** when L4 lands.
7. **`state` prop derivation** — explicit prop vs. derived from data shape (recommend explicit for testability).
8. **Storybook story plan** — 8 components × ≥4 variants = 32+ stories. Architect plans build order; design suggests sub-primitives first.
9. **ESLint rule `design/no-embed-chrome`** — K6 family addition to enforce the embed's "no background, no border, no radius, no shadow" rule at lint time.
10. **Aggregation fetching contracts** (`fetch_artifacts_by_task / by_bet / by_product / by_portfolio`) — return shapes, pagination, sort default (design recommends `created_at DESC`).

These ten items map 1:1 to `approved.md` §8 and to the synthesis's open-questions list. They are the architect's contract; the design is closed at the rendering layer.

---

## Files written / edited

- **Edited:** `docs/design-explorations/L3/approved.md`
  - §4 ("Behavior, motion, keyboard, focus") — added pressed and disabled state spec.
  - §3 ("States — every layout, every state") — added thread-pill pluralization spec.
  - §9 ("Final critique pass") — score updated 8.0 → 8.2; per-dimension table refreshed.
- **Created:** `docs/design-explorations/L3/critique.md` (this file).

No commits performed (per Step 2 brief). No mockup re-render performed — the adopted fixes are spec-only and the existing `mockup.html` already covers populated + placeholder for every layout (loading/error/disabled rendering is an implementation-story deliverable per `.claude/rules/visual-parity.md`).
