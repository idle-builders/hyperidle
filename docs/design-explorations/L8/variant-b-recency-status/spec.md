# Variant B — Grouped by recency + status

## Signature
The Submenu reads as **a chronological stream split into "Active" and "Resolved"** — like an email inbox split by whether the conversation is closed. Blocking is sort-rank-1 inside Active (rises to the top, marked by the existing red left-border on the row). The pinned coach floats at the literal top of Active.

## User story
As a founder returning to the app after lunch, I read the Submenu top-to-bottom like a stream and see the most recent activity first. If something's blocking, it's at the very top with a red bar. If something just resolved, it's a click away in the second section.

## Information hierarchy
1. **Title bar** — `Conversations` + total count (existing).
2. **Filter chips** — `All / Needs review / Chats / Resolved` (existing).
3. **Section "Active"** — every thread without a `resolvedAt` (or with `resolvedAt` older than the 24h window). Count = bucket length.
   Sort within: pinned first (the coach) → blocking desc → `lastActiveAt` desc.
4. **Section "Resolved"** — every thread with `resolvedAt` within the last 24h. Count = bucket length. Sort within: `resolvedAt` desc.

Just two sections. Both always render their header (even if count is 0) so the founder always knows where the boundary is. When `Active` is empty, the section still shows its header + a muted "Quiet — no active threads." (this conveys "nothing pending" rather than "nothing here at all").

## Component composition
- `Submenu` (existing chrome).
- Section header: mono uppercase tracking-wider, count inline.
- Row: `ThreadRow` with `selected` prop and a new `pinned` glyph (the existing component already supports `unread` and `blocking`; pinned indicator is a small mono "·" or pin icon to the left of the title — designer-call).
- Empty state (whole list): `EmptyState`.
- Per-section "quiet" muted line for Active when empty.

## States
- **Empty (whole list):** `EmptyState` — title "No threads", description "Conversations with agents will appear here once started."
- **Empty Active, populated Resolved:** Active header renders with count `0` and a muted "Quiet — no active threads." — Resolved renders below normally.
- **Empty Resolved:** Resolved header silently disappears (the founder doesn't need a "no resolved" placeholder).
- **Loading:** 5 skeleton rows under Active header.
- **Error:** `ErrorState` in the list slot — title "Couldn't load threads", description "Check your connection.", retry button. Title bar + filter chips remain visible.
- **Populated:** Active section first (pinned coach pinned to top, blocking next, then by recency); Resolved second.
- **Overflow:** Submenu list slot scrolls; **Active section header is sticky** (sticks to top of the scroll viewport so the count badge stays visible during scroll). Resolved header is not sticky.

## Behavior
- Click a `ThreadRow` → `onSelect(threadId)` → AppShell lifts the id.
- Up/Down arrow inside the Submenu navigates rows (a11y standard).
- Hover: existing `ThreadRow` hover.
- Selected row: `background: var(--surface-4)` + `border-left: 2px solid var(--primary)`. Same selection-trumps-blocking rule as the other variants.
- Filter chip change: re-derives sections after filtering. "Needs review" filter → Active section shows only review threads; Resolved hides (because resolved review threads moved to Resolved by the 24h window already).
- Transition: 80ms surface change. No layout transitions. Sticky header is CSS-only.

## Mobile adaptation
- The Conversations tab renders the Submenu inline.
- Two sections is mobile-friendly — the pinned coach stays visible when the user scrolls the Active section (the sticky header keeps the section context).
- 360px width: section headers don't wrap; counts collapse into the same line as the label.

## Trade-offs
- **What this is good at.** Reads like a feed — matches the muscle memory the founder brings from email, Slack, Linear inbox. Blocking surfaces *visually* without needing its own section. Resolved is right there for the "did my verdict land?" check.
- **What this is bad at.** "Blocking" is information the founder must *infer* from a row indicator + sort position rather than a section header. Under heavy load (many active threads), the blocking item can scroll out of the visible window even though it's first in the list. The section header doesn't shout "STOP, AGENT WAITING."
- **What this is bad at #2.** Two sections is *almost* enough — but the founder wants a "for the next-up work" feel, and "Active" lumps blocking-now items with chats-from-last-week (under chronological sort, the chat from last week sits below the blocking item, but they're both "Active" — semantic conflation).
- **What this is bad at #3.** Pinned-coach as "first row inside Active" works visually but conflicts with the concept doc's emphasis that the coach is *always available, never archived*. A pinned section header would make that promise more visible.
