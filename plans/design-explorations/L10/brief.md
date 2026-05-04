# L10 — Submenu filter chips actually filter — BRIEF

**Story:** TRACK-L L10 (lines 345–371). **Effort:** S (~1d). **Depends on:** L8.

## What the user is doing

A founder lands on Conversations. The Submenu shows the live thread list grouped into **Blocking / Active / Resolved · 24h** (per L8 approved.md §2). Today, the chip row above the list (`All / Needs review / Chats / Resolved`) renders as visual selection state but does NOT filter the list. The user clicks a chip, the chip turns dark, the list does not change. Trust loss.

L10's job:
1. **Make the chips filter.** Wire `submenuFilter` (currently captured at `AppShell.tsx:398` and never read by `ThreadSections`) into the list classifier.
2. **Resolve the chip vocabulary** against the founder-stated single axis: **blocking ↔ non-blocking** (= sync ↔ async). The current four chips reflect a richer vocabulary that may or may not map cleanly to one axis. **This is the design call.**
3. **Empty filtered state with a clear-filter affordance** — when a chip narrows the list to zero, the user must (a) see what happened and (b) recover in one click.

## What is fixed (input contract)

- L8 sectioning is approved and not relitigated. Sections remain `Blocking / Active / Resolved · 24h` with their headers, counts, sticky behavior, sort rules.
- The Submenu chrome (title, total count, collapse chevron) is unchanged.
- `ThreadRow` props (`selected`, `pinned`, `hostTag`) are unchanged.
- The filter state lives where it does today: `useState<SubmenuFilter>("all")` in `AppShell`, lifted to `ThreadSections` as a prop. (Architect may relocate; visual contract unchanged either way.)
- One axis: `blocking ↔ non-blocking`. Two-axis filtering is forbidden by the brief.
- No customizable filter sets, no saved presets (founder cut). No emojis. No keyboard verb shortcuts.

## What is open (the design call)

| Open | Why it matters |
|---|---|
| **Chip vocabulary** | Three plausible vocabularies: pure axis (`All / Blocking / Async`), user-language (`All / Needs review / Chats / Resolved`), or binary toggle (segmented `Sync ⇄ Async` + clear). Each frames the same axis differently. |
| **Empty-filter state shape** | The L8 EmptyState is for "no threads at all" (server returned zero). The filter-empty state is "your filter has no matches" — different message, different recovery affordance. Where does the "Clear filter" CTA live? Inline EmptyState body? Persistent pill above the list? In the chip row? |
| **Section interaction with filter** | When `Blocking` is selected, the Active and Resolved sections are entirely hidden? Or rendered with `(0)` headers? Or only the relevant section's header shows? L8 §5.5 said empty Blocking and Resolved are silently absent — under a filter, that contract reads naturally for variant-by-variant evaluation. |
| **Selected state across filter change** | If the selected thread is filtered out, the row is no longer rendered, but the Main pane keeps showing the thread (per L8 §5.7). Confirmed; not a design call here. |

## Non-goals

- Server-side filtering (architect choice; the visual contract works with either).
- Multiple filters at once.
- Filter persistence across page reloads (founder cut: presets are forbidden; per-session is fine but not required by ACs).
- Chip ordering / drag-reorder.

## Decision tree (Phase 0)

1. **Who:** the CEO or CPO landing on Conversations. They want to triage by attention level — "what needs me now?" vs "what's the long tail?" That is the blocking-vs-non-blocking axis word-for-word.
2. **Smallest UI surface:** the existing chip row + the existing empty-state slot in `ThreadSections`. No new panels, no new components. Three variants explore three application strategies for an existing component vocabulary.
3. **Primary state:** populated with mixed sections AND a chip narrowing the list. Empty-filter is the secondary state that proves the design respects the recovery path.
4. **New primitive or extension?** Extension. The variants explore *application* of existing primitives (chip row in Submenu, EmptyState in list slot), not new component shapes.
5. **What overflows:** chip row at 240px Submenu width with three or four chips fits without wrap (existing `flex-wrap` handles edge case).
6. **Composition:** Submenu chrome + ThreadSections (extended). Optionally a small "× Clear filter" affordance — must come from existing components (DaisyUI badge, button, or inline text-button).

## Variants (constraint + thesis pairing)

### Variant A — Pure axis (3 chips)
- **Constraint:** chip vocabulary maps 1:1 to the founder's stated axis. Three chips: `All / Blocking / Async`.
- **Thesis:** the chip labels *are* the axis. Zero translation cost between the user-spoken filter and the underlying classification. The simplest design wins for a 1-day story.
- **Open**: how does this read for a founder used to "Needs review / Chats" (J2 vocabulary)? Does "Async" feel cold? Mockup must answer.

### Variant B — User-vocab axis (4 chips, mapped to one axis)
- **Constraint:** keep the J2-locked chip labels (`All / Needs review / Chats / Resolved`) and prove the wiring honors the single axis. `Needs review` = blocking with unresolved review. `Chats` = non-blocking conversations. `Resolved` = the existing Resolved section as a filter. Internal mapping; user sees friendly labels.
- **Thesis:** the existing vocabulary is already user-shaped. L10 is a wiring fix, not a relabeling. Make the four chips honest.
- **Open**: does `Resolved` as a filter conflict with `Resolved · 24h` as a section? Mockup must answer (one-row degenerate case).

### Variant C — Segmented binary toggle + persistent clear pill
- **Constraint:** collapse the chip row into a single segmented control: `[ Blocking | Async ]`. No "All" chip — the visual shape of a binary segmented control communicates the axis directly. When a side is active, an inline `× Showing blocking only — clear` pill appears between the segmented control and the list as the recovery affordance.
- **Thesis:** the *shape* of a segmented control encodes "one axis" the way three loose chips cannot. Maximum density (one row collapses to one control). Reference: Linear's segmented filters.
- **Open**: is "All" reachable enough without a third segment? The clear-pill solves recovery, but the affordance is two clicks (toggle off requires hitting the same chip again, or hitting clear). Mockup must answer.

## Anti-convergence axes

| Axis | A | B | C |
|---|---|---|---|
| Hierarchy (where the eye lands first) | section list (chips are quiet) | chips first (J2 vocabulary leads) | segmented control + active-filter pill |
| Density (chip row footprint) | 3 chips, 1 row | 4 chips, 1 row (may wrap) | 1 segmented control, 1 row |
| Action surface (where verbs live) | chips only | chips only | chips + inline clear pill |
| State strategy (filter-active visual) | one chip dark, list narrowed | one chip dark, list narrowed | segment dark + clear pill above list |
| Composition (component count) | btn-ghost / btn-neutral chips | btn-ghost / btn-neutral chips | DaisyUI `join` segmented + DaisyUI `badge` for clear pill |
| Copy register (chip labels) | terse / technical (`Async`) | warmer / J2 (`Needs review`) | minimal / paired (`Blocking ⇄ Async`) |
| Empty-filter affordance | inline `EmptyState` with `Clear filter` CTA | inline `EmptyState` with `Clear filter` CTA | persistent clear pill (always present when filtered) — empty state is short copy only |

Three or more axes differ across every pair. Anti-convergence cleared.

## Inputs reused from L8

- L8 mockup `variant-c-blocking-active-resolved/mockup.html` is the substrate. Each L10 variant copies the L8 frame verbatim, then overrides the chip-row region and adds the empty-filter state in a second mockup column.
- All section behavior, sort, and sticky rules from L8 approved.md remain in force.
