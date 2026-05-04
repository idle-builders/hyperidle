# Variant C — Grouped by blocking / active / resolved

## Signature
The Submenu reads as **a verdict-gate dashboard** — `Blocking` shouts at the top in red, `Active` is the working backlog underneath, `Resolved` is a calm 24-hour ledger at the bottom. Pinned (the Chief of Staff coach) is a row glyph inside Active, never a section.

The decision the founder makes first ("am I blocking anyone?") gets its own header, its own color treatment, and the strongest visual weight in the entire view.

## User story
As a founder opening the app cold, I read top-to-bottom: `Blocking 2` is red and immediate — those are the only things that matter right now. `Active 5` is everything else on my plate. `Resolved 2` confirms what I closed today. Three sections, three jobs, no ambiguity.

## Information hierarchy
1. **Title bar** — `Conversations` + total count (existing).
2. **Filter chips** — `All / Needs review / Chats / Resolved` (existing).
3. **Section "Blocking"** — every thread where `blocking = true`. Section header tinted with a 14% danger background; danger-colored count. Sort within: `lastActiveAt` desc.
4. **Section "Active"** — every non-blocking, non-resolved-within-24h thread. Sort within: pinned coach first → `hasUnresolvedReview` desc → `lastActiveAt` desc.
5. **Section "Resolved"** — every thread with `resolvedAt` within 24h. Sort within: `resolvedAt` desc. Rows render at 70% opacity so they read as "settled, behind glass."

When `Blocking` is empty, it silently disappears. (No "no blocking items" placeholder — empty Blocking is the *good* state, and silence makes the absence loud.) When `Active` is empty: header renders with count `0` + a single muted "Quiet — nothing in flight." line (the founder needs this signal — it means agents are idle). When `Resolved` is empty, header silently disappears.

## Component composition
- `Submenu` (existing chrome).
- Section header: mono uppercase tracking-wider, count inline. The `Blocking` header's chrome carries a left-edge danger accent (3px) and a danger-tinted count.
- Row: `ThreadRow` with `selected` and `pinned` props. Pinned glyph (small mono `pin` SVG) renders before the title.
- Empty state (whole list): `EmptyState`.
- Per-section "Quiet" muted line for Active when empty.

## States
- **Empty (whole list):** `EmptyState` — title "No threads", description "Conversations with agents will appear here once started."
- **Empty Blocking:** silently absent. Active is the first visible section.
- **Empty Active:** header renders + muted "Quiet — nothing in flight." line. (This is information.)
- **Empty Resolved:** silently absent.
- **Loading:** 1 skeleton row under each plausible section header (3 rows total).
- **Error:** `ErrorState` — title "Couldn't load threads", description "Check your connection.", retry "Retry". Title bar + filter chips remain visible.
- **Populated:** sections render in fixed order: Blocking → Active → Resolved. Empty Blocking + empty Resolved → only Active visible.
- **Overflow:** Submenu list slot scrolls; **Blocking section header is sticky** when it exists (it's the only sticky one — the founder needs to know if blocking items exist regardless of scroll position). Active and Resolved headers are not sticky.

## Behavior
- Click a `ThreadRow` → `onSelect(threadId)` → AppShell lifts the id.
- Up/Down arrow inside the Submenu navigates rows (a11y standard).
- Hover: existing `ThreadRow` hover.
- Selected row: `background: var(--surface-4)` + `border-left: 2px solid var(--primary)`. When the row is also `blocking`, primary border wins (the row is already inside the danger-tinted `Blocking` section, so the section context conveys blocking-ness — selection trumps).
- Filter chip change: re-derives sections after filtering. "Needs review" filter → Blocking shows blocking review threads only; Active shows non-blocking review threads only; Resolved disappears (resolved review threads are still resolved).
- Transition: 80ms surface change. No layout transitions. Sticky Blocking header is CSS-only.

## Mobile adaptation
- The Conversations tab renders the Submenu inline.
- Three sections at 360px width fits comfortably.
- Sticky Blocking header at mobile: anchors the danger signal even on a long Active scroll. This is critical — phones are where the founder picks up after lunch.
- Section labels do not wrap; counts collapse adjacent to labels.

## Trade-offs
- **What this is good at.** The first decision the founder needs ("am I blocking anyone?") is the loudest visual element in the entire chrome. Section count is honest — "Blocking 2" is unambiguous. Three sections is short enough that mobile scrolling doesn't lose context. Resolved is a calm ledger, not noise.
- **What this is bad at.** The host-kind information is buried inside row content (the snippet or the avatar). A founder who thinks "what's happening in my Bets right now?" must scan rows for bet-shaped snippets — there's no Bet section header to anchor to. (Mitigation: the avatar + title pattern carries enough — but Variant A is still strictly better at this question.)
- **What this is bad at #2.** Pinned-coach floats at top of Active rather than getting its own header. The "always available" promise is conveyed by the pin glyph, not by structure. Subtler than A's "Chief of Staff" section.
- **What this is bad at #3.** When `Blocking` is empty, the founder may not notice the absence is the good state. The first time they use the app, "Active" being the top section may suggest "this is the only thing I have to do" rather than "the urgent slot is empty." (Mitigation: Active's section count carries the load.)
