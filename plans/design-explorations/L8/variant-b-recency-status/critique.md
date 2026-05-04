# Variant B — Critique

## 1. Spec alignment — 7/10
Brief locks blocking-vs-non-blocking as the primary axis. Variant respects it as a *sort rank* inside Active rather than as a section. Counts derive. Selection lifts. Filter chips orthogonal. -3: blocking is a property the founder must read off the row's left-border + chip, not the section header. The blocking signal is not absent — but it's not load-bearing on the layout.

## 2. Visual hierarchy — 7/10
Two large sections. The founder's eye lands on the pinned coach (top of Active) → blocking rows (immediately below, red left-borders cluster visually) → the rest of Active → Resolved. Strong vertical flow. -3: the visual cluster of red left-borders is dependent on data layout — if 4 of 7 active rows are non-blocking and 1 is blocking, the blocking row is alone in a sea of greys. The shouting-ness of "blocking" depends on data density.

## 3. Spacing & density — 9/10
Two-section structure leaves more room for rows; very dense, very efficient at the 360px width. Sticky Active header is a thoughtful detail — the founder doesn't lose section context when scrolling. All density tokens. Pin glyph at 10px is on the lower edge of the icon scale but readable.

## 4. Typography — 9/10
Mono uppercase headers. Tabular counts. Nothing off-grid. Pin glyph is a vector, not an emoji.

## 5. Color — 9/10
Tokens throughout. Danger reserved for blocking border. Resolved rows at 70% opacity is a tasteful "behind glass" treatment that doesn't introduce a new color.

## 6. Coherence — 8/10
Reuses ThreadRow. Section header style consistent. Pin glyph is a new icon (small SVG) — the founder filter doesn't ban icons, but the design system `over-iconification` rule (AQ-113) cautions against icons that don't communicate faster than text. Pin communicates "always available" faster than "Pinned" text would, so the icon earns its place. Borderline.

## 7. States — 8/10
Whole-list empty + per-section quiet states + loading + error + overflow + sticky header all spec'd. -2: "Quiet — no active threads." copy under Active when empty is a useful signal but it lives in a section that *normally* has threads, so the empty-section rendering rule diverges from Resolved (which silently disappears). Two different empty-section behaviors in the same variant; defensible but adds surface.

## 8. Accessibility — 8/10
Sticky header is CSS-only. Up/Down arrow nav allowed. Pin glyph carries `aria-label`/`title` (architect must specify). -2: opacity 0.7 on Resolved rows reduces text contrast — the architect must verify each Resolved row's text on its hover surface clears 4.5:1 (likely fine but needs check).

## 9. Anti-slop — 9/10
No emoji (pin is SVG glyph), no purple/indigo, no `rounded-2xl`, no oversized padding, no decorative icons, no hero, no 3-column grid. Counts derived. Density tokens consumed.

---

**Total: 74/90 → 8.2/10.** Advances. Strongest at chronological reading + density; weakest at making the blocking signal independent of data layout.
