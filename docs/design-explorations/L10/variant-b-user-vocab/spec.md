# Variant B — User-vocab axis (4 chips, mapped to one axis)

## Signature
The Submenu keeps the **J2-locked vocabulary** the founder already speaks — `All / Needs review / Chats / Resolved` — and proves L10 is a wiring fix, not a relabeling. The chips render with the same `btn btn-xs btn-ghost / btn-neutral` pattern the existing `Submenu.tsx` uses, the row order is unchanged, and the only thing that changes is *what the chips actually do*. Inside, every chip resolves to a deterministic predicate over the `blocking ↔ non-blocking` axis (plus the `resolved` short-circuit). The user sees friendly labels; the classifier sees one axis.

## User story
As a founder, I land on Conversations and see chips I already understand because I clicked them last week. `Needs review` means "the things waiting for my verdict." `Chats` means "the back-and-forths that aren't blocking anything." `Resolved` means "what just landed." When I click a chip, the list narrows. When the narrowed list is empty, I see a one-line explanation and a `Clear filter` text-button that puts me back on `All`. No cognitive translation between the chip label and the classifier.

## Information hierarchy
1. **Title bar** — `Conversations` + total count (existing chrome).
2. **Filter chips** — `All / Needs review / Chats / Resolved`, in this order. Active chip uses `btn btn-xs btn-neutral`; inactive chips use `btn btn-xs btn-ghost`. The chip row visually identical to today; only behavior changes.
3. **List slot** — either:
   - the L8 sectioned list (Blocking / Active / Resolved · 24h) narrowed by the chip's predicate, OR
   - the empty-filter `EmptyState` (described below) when the predicate yields zero rows.

## Chip-to-axis mapping table

The single underlying axis is `blocking ↔ non-blocking`. The four chips compose **predicates** over that axis. The mapping is exhaustive.

| Chip | Predicate | Sections that can render | Axis position |
|---|---|---|---|
| `All` | no filter | Blocking, Active, Resolved | both halves |
| `Needs review` | `thread.blocking === true && thread.hasUnresolvedReview === true` | Blocking only | **subset of blocking** |
| `Chats` | `thread.blocking === false && thread.hasUnresolvedReview === false` | Active, Resolved (rare; a resolved chat is still a chat) | **non-blocking** |
| `Resolved` | `thread.section === 'resolved'` (i.e., `resolvedAt` within 24h) | Resolved only | orthogonal short-circuit |

**The asymmetry — flagged as the open question.** `Needs review` is **not** the blocking half of the axis; it is a *narrower subset* of blocking (review-needing-blocking). `Chats` is **not** the entire non-blocking half; it is a *narrower subset* (review-free-non-blocking). A blocking thread without an unresolved review (e.g., a coach thread the founder hasn't read) and an active thread *with* an unresolved review (e.g., a non-urgent pitch awaiting verdict) both fall through every chip except `All`. This is faithful to L8's J2-locked vocabulary table, but it means **`Needs review ∪ Chats ⊊ All`**. The mapping is honest about the axis, but the chips are not its bisection.

**Consequence the spec acknowledges.** The brief asks the variant to "honor the founder's blocking-vs-non-blocking axis." This variant honors the axis by routing every chip through it — but the surface vocabulary is *narrower* than the axis on both sides. A power user testing the chips against the L8 sections would notice that `Needs review` does not show every Blocking row, and `Chats` does not show every Active row. Whether that reads as "the chips are sharper than the sections" (positive) or "the chips lie about the sections" (negative) is the comparison call.

## Component composition
- `Submenu` chrome (existing).
- Filter chips: `<button class="btn btn-xs btn-ghost">` (inactive) / `<button class="btn btn-xs btn-neutral">` (active). No new component.
- List slot: `ThreadSections` (L8) — predicate applied **before** sectioning.
- Empty-filter state: `EmptyState` from design-system with a custom `action` slot (text-button labeled `Clear filter`). No new component.

## States
- **All (default).** Identical to L8 approved.md: Blocking → Active → Resolved sections render per their per-section empty rules.
- **Needs review.** Predicate narrows to blocking-with-unresolved-review threads. Active and Resolved sections silently absent (no rows match). Blocking section renders only if at least one row matches; the section's `Quiet` line never renders here because Blocking has no quiet state.
- **Chats.** Predicate narrows to non-blocking, review-free threads. Blocking section silently absent. Active section renders matching rows; Resolved section renders matching rows (rare).
- **Resolved.** Predicate narrows to `resolvedAt` within 24h. Blocking and Active sections silently absent. Resolved section renders all matching rows at 70% opacity (per L8 §4 "behind glass").
- **Empty-filter state (chip narrows to zero rows).**
  - Section headers do **not** render. The list slot is the `EmptyState` component, occupying the full list area.
  - **title:** `No threads match this filter`
  - **description (chip-specific):**
    - `Needs review` → `No threads need review right now.`
    - `Chats` → `No active chats.`
    - `Resolved` → `Nothing resolved in the last 24h.`
    - `All` → never reachable from the filter (whole-list empty falls back to L8 §5.1 "No threads yet").
  - **action:** primary text-button, label `Clear filter`. On click, sets `submenuFilter = "all"`. Visual: 12px text, `var(--primary)` color, no background, cursor pointer (matches `EmptyState`'s `action` slot convention).
  - **dataTestId:** `thread-sections-filter-empty`.
- **Loading, error, whole-list empty.** Identical to L8 §5.1–5.3. The chip row remains visible.
- **Selected-thread persistence across chip change.** Per L8 §5.7 and L10 brief: the lifted selected-thread id is unchanged when a chip is clicked. If the selected thread is filtered out, no row carries `selected={true}`; the Main pane keeps showing the thread until the user picks another row or clears the filter.

## Behavior
- Click chip → `setSubmenuFilter(chipId)`. The list re-renders synchronously; sections re-derive from the predicate.
- Click `Clear filter` (text-button inside `EmptyState`) → `setSubmenuFilter("all")`. The list returns to the full L8 sectioning.
- Tab order: chips are in a single `flex` row; tab moves through them left-to-right; `Enter`/`Space` activates. The `Clear filter` button is reachable by tab from the last chip when the empty state is visible.
- No keyboard verb shortcuts (founder filter).
- No transition between filter states beyond the existing 80ms surface fade — the chip color flips, the list re-derives, no layout animation.

## Mobile adaptation
- The chip row stays horizontally above the list. At 360px the four chips fit on one row (`btn-xs` = 24px tall × ~64–88px each). If they wrap to a second row, that's acceptable — the existing `flex-wrap` handles it; no overflow scroll.
- Empty-filter `EmptyState` uses the same left-aligned layout (per L8 §7 — no centered hero treatment on mobile).
- Touch target: `btn-xs` is 24px; AQ-015 requires ≥44px at viewport ≤1024px. The auto-density tier (AQ-016) bumps `btn-xs` to comfortable equivalents at mobile, satisfying the rule. No design change here; the density token system carries it.

## Trade-offs
- **What this is good at.** Zero label churn. Founders who learned the J2 vocabulary keep it. The chip styling is identical to today's `Submenu.tsx`; the diff is one prop and one predicate. Smallest possible visual change for a wiring fix. The `Resolved` chip is honest — it shows exactly the L8 Resolved section (one-row degenerate case from the brief: it's not a conflict, it's a focus).
- **What this is bad at.** **The asymmetry.** `Needs review` is a subset of blocking; `Chats` is a subset of non-blocking; together they don't cover the axis. A founder who clicks `Needs review` and expects "all blocking" will see fewer rows than the L8 Blocking section's count. The friction surface is exactly one mental model: "the chips are sharper than the sections." Either the user reads that as a feature (the chips zoom in) or as a discrepancy (the chips lie). This is the open question the comparison phase must adjudicate.
- **What this is bad at #2.** Four chips at 240px Submenu width is one row only when labels stay short. `Needs review` is the longest label (~12 chars); a future fifth chip would force wrap. The variant accepts that constraint — no fifth chip is in scope.
- **What this is bad at #3.** The chips do not visually telegraph the underlying axis. A founder who has never seen the brief cannot infer "blocking ↔ non-blocking" from `All / Needs review / Chats / Resolved`. The axis is internal; the surface is user-vocab. (Variant A optimizes for axis legibility; this variant optimizes for label continuity.)

## Founder filter — verification
- [x] No keyboard verb shortcuts (Tab + Enter/Space only).
- [x] No emojis (chips are plain words; `Clear filter` is plain text).
- [x] No customizable filter sets, no presets (the four chips are fixed).
- [x] One axis (blocking ↔ non-blocking) is the substrate; chips are predicates over it.
- [x] No 3-column card grid; no hero; no purple/indigo gradient on chips or empty state.
- [x] Closed radius scale only (`btn-xs` consumes `--rounded-btn = 4px`).
- [x] Density tokens consumed by `EmptyState` and `ThreadRow`.

## Open questions for the comparison phase
1. **Does the asymmetric mapping read naturally?** A founder clicking `Needs review` may expect the L8 Blocking section's 2 rows but get only the review-needing subset (e.g., 1 row). Is this surprising or sharp? Adjudicated by comparison; not by this spec.
2. **Should `Chats` exclude resolved chats?** The current predicate (`hasUnresolvedReview === false`) lets resolved chats through into the Resolved section under the `Chats` filter. Faithful to L8's J2 table. But a founder reading "Chats" may expect "ongoing chats only." If the comparison flags this, the predicate becomes `hasUnresolvedReview === false && section !== 'resolved'`. Designer-call deferred to comparison.
3. **Is `Clear filter` the right copy?** Alternatives: `Show all` (matches the `All` chip label), `Reset` (terse). `Clear filter` is the L10 brief's prescribed copy; this spec honors it.
