# L10 — Synthesis

## Strongest base: Variant A — Pure axis (3 chips)

Score 8.6/10. The chip vocabulary `All / Blocking / Async` is a 1:1 bijection with the founder-stated axis (`blocking ↔ non-blocking, sync ↔ async`). The brief's hardest rule — *one axis, exhaustive* — is honored visually and operationally. The visual delta from the L8 baseline is one chip-label change (`Needs review/Chats/Resolved` → `Blocking/Async`); the chrome row stays a single line. Zero new components. Zero founder-filter risk.

A's only legible weakness is the "Async" jargon concern — and the founder's own prose uses *async* as the canonical word for non-blocking conversations ("sync = blocking, async = non-blocking — same axis, two names"). The label tracks the founder's vocabulary, not engineering jargon.

## Pulled in from Variant C: persistent active-filter signal in the chip row

C's strongest insight is that **a filter that is active should always be one click away from clearing — including during long scrolls of the populated list**, not only inside the empty-filter state. Variant A's "click `All` to clear" is one click from any state, but the affordance is implicit (`All` is the same shape as the other chips; the user has to know `All` means "no filter").

We pull C's *intent* — explicit, always-visible recovery — without pulling C's *form* (the pill row above the list). The synthesis: keep A's three-chip row, and **add a small `× Clear` text-button at the right edge of the chip row that renders only when the active filter is non-`All`**. It sits in the same row as the chips (no extra vertical chrome), is mono 11px to match the chip row's typography, and uses `--text-lo` color so it reads as a quiet secondary affordance. Click sets the filter back to `All`.

The persistent inline clear satisfies C's recovery goal at half C's vertical footprint cost.

## Pulled in from Variant B: chip-specific empty-filter copy

B's per-chip empty-filter description (`Nothing resolved in the last 24h.` vs `No active chats.`) reads better than a generic line. Carry that intent: empty-filter `description` is chip-specific (one short sentence) — `No blocking threads right now.` for `Blocking`, `No async conversations.` for `Async`. Title remains `No threads match this filter` (constant across chips).

## What gets explicitly rejected (do not relitigate)

The rejected list matters as much as the chosen direction. `/architecture` and `/write-code` MUST NOT reintroduce these:

1. **`Needs review`, `Chats`, `Resolved` as chips.** These are not the axis. `Needs review` and `Chats` are subsets of the axis halves, not bisections of the axis. `Resolved` duplicates the `Resolved · 24h` section. The J2 chip vocabulary is **superseded** by the L10 chip vocabulary `All / Blocking / Async`. The architect updates `SUBMENU_FILTERS.conversations` accordingly.
2. **Two-axis filtering.** Hard cut by the brief.
3. **A second filter axis added later** (severity, host, recency, etc.). Adding axes is a separate design call with its own concept doc — do not preemptively wire one.
4. **Customizable filter sets / saved filter presets.** Founder cut.
5. **Drag-reorder of chips.** Founder cut.
6. **Keyboard verb shortcuts** (`b` for Blocking, `a` for Async, etc.). Founder cut.
7. **Server-side filter persistence.** Per-session client state only. The chip resets to `All` on view change (existing AppShell behavior at AppShell.tsx:409-412 — keep).
8. **A persistent pill row above the list (Variant C's pill).** Vertical chrome budget rejects it. The inline `× Clear` in the chip row carries the same affordance at lower cost.
9. **A segmented `join` control replacing chip row (Variant C's segmented shape).** Default-state ambiguity (no `All` segment) is a discoverability tax we won't pay for a 1-day story.
10. **`Resolved` as a separate chip "shortcut" to scroll to the section.** L8 sectioning already shows Resolved · 24h as the third section; a chip would be a duplicate path with no new value. If the founder later wants "show resolved only", the existing Resolved section's count IS the discoverability path.
11. **EmptyState body action of any kind other than `Clear filter`.** No "Show me chats instead", no "Search threads", no second CTA. One affordance.
12. **Auto-clear on selection.** Selecting a row that's currently filtered out should not auto-clear the filter. (L8 §5.7: selected thread can persist while not visible in the list.)

## Selected direction summary

- **Chip vocabulary:** `All / Blocking / Async` (3 chips). Active chip uses `btn btn-xs btn-neutral`; inactive uses `btn btn-xs btn-ghost`. Existing `Submenu.tsx` chip pattern.
- **Filter rules:** `All` → no filter. `Blocking` → `thread.blocking === true`. `Async` → `thread.blocking === false`.
- **Section behavior under filter:** sections silently absent when their bucket is empty under the filter (L8 §5.5 contract preserved). Active under `Async` keeps its header + `Quiet — nothing in flight.` line per L8 §5.5.
- **Total count badge:** counts the *visible* (post-filter) threads. Per L8 §3 the count is derived from the rendered list length.
- **Inline `× Clear` affordance:** rendered at the right edge of the chip row when `activeFilter !== "all"`. Mono 11px, `--text-lo`, click → sets filter to `All`.
- **Empty-filter EmptyState:** title `No threads match this filter`. Chip-specific description. Primary `Clear filter` text-button as the only body action.

→ See `approved.md` for the full input contract handed to `/architecture`.
