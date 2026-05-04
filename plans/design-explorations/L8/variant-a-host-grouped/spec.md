# Variant A — Grouped by host entity

## Signature
The Submenu reads as **a directory of what is being discussed** — Chief of Staff, Bets, Tasks, Knowledge, Other. State (blocking / unresolved / resolved) is a property *on the row*, never *of the section*.

## User story
As a founder triaging, I scan the Submenu by *what* is on my plate — "anything in my Bets right now? In Knowledge curation?" — and pick a thread. Blocking is a row indicator I see while scanning; it doesn't dictate the layout.

## Information hierarchy
1. **Title bar** — `Conversations` + total count badge (existing Submenu chrome).
2. **Filter chips** — `All / Needs review / Chats / Resolved` (existing).
3. **Section "Chief of Staff"** — exactly one row (the pinned coach). Always present. Count: 1.
4. **Section "Bets"** — every thread with `host_kind = bet`. Count = bucket length.
5. **Section "Tasks"** — every thread with `host_kind = task`. Count = bucket length.
6. **Section "Knowledge"** — every thread with `host_kind = knowledge_item`. Count = bucket length.
7. **Section "Other"** — every thread with `host_kind ∈ {artifact, agent, user, team, factory}` (excluding the pinned user-coach which is already in §3). Count = bucket length.

Empty sections silently disappear. The "Chief of Staff" section is exempt from disappearing — it is the always-on coach.

Within each section, sort: `blocking` desc → `hasUnresolvedReview` desc → `lastActiveAt` desc. So a blocking item floats to the top of *its host's section*, but never crosses out of that section.

## Component composition
- `Submenu` (existing chrome, unchanged).
- Section header: existing `ThreadSections` mono uppercase header, count inline.
- Row: `ThreadRow` from design-system, gains a `selected` prop matching NavItem grammar.
- Empty state (whole list): `EmptyState`.
- Error state: `ErrorState` in the list slot.
- Per-section empty for Chief of Staff: a single muted row "No coach activity" — never disappear.

## States
- **Empty (whole list, no threads from server):** `EmptyState` — title "No threads", description "Conversations with agents will appear here once started."
- **Empty (some sections empty):** those sections silently disappear. Chief of Staff section stays with a muted single-line placeholder if no coach thread exists yet (this case shouldn't happen in production but the row reserves the slot).
- **Loading:** Skeleton rows inside each section that has expected items (3 skeleton rows across the list).
- **Error:** `ErrorState` in the list slot — title "Couldn't load threads", description "Check your connection.", retry button labeled "Retry". Title bar + filter chips remain visible.
- **Populated:** sections render in fixed order. `Chief of Staff → Bets → Tasks → Knowledge → Other`.
- **Overflow:** Submenu list slot scrolls; section headers are *not* sticky in this variant (each section is short).

## Behavior
- Click a `ThreadRow` → calls `onSelect(threadId)`. AppShell lifts this into a selected-thread id; Main pane reads it.
- Up/Down arrow inside the Submenu navigates rows (a11y standard, allowed by founder filter — distinct from forbidden verb shortcuts like `S`/`P`/`L`).
- Hover: existing `ThreadRow` hover (background `--surface-4`).
- Selected row: `background: var(--surface-4)` + `border-left: 2px solid var(--primary)`. When the row is also `blocking`, primary border wins (selection trumps blocking visually because the row already carries a `blocked` chip and a "blocking" position-within-section).
- Filter-chip change: re-derives the buckets *after* filtering. So under "Needs review", the `Bets` section only shows bets with unresolved reviews.
- Transition: 80ms surface change on hover/select. No layout transitions.

## Mobile adaptation
- The Conversations tab renders the Submenu inline as the page content.
- Section headers shrink one tier: `text-[11px]` already minimum, so unchanged. Padding drops via auto-density `comfortable` (≤1024px).
- 5 sections at mobile width is at the edge — empty-section dropping keeps it usable in practice.

## Trade-offs
- **What this is good at.** Recognising "this is a thread *about* a bet". Strong mental match to the host-kind concept (HIL §4.5). Long-term scales because new host kinds slot into existing sections.
- **What this is bad at.** The first decision a founder needs ("am I blocking anyone?") requires scanning across all sections to spot the danger left-border. It buries the most urgent information.
- **What this is bad at #2.** Five sections is the ceiling — and with `Other` rare, the founder often sees four sections, half of them empty. The Submenu feels under-populated.
- **What this is bad at #3.** "Resolved" doesn't have a home — it interleaves with active items inside each host section, so the just-verdict'd item doesn't get a "you just did this" callout.
