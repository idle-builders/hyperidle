# L8 — Synthesis

## The pick: Variant C — Blocking / Active / Resolved

Score: 9.0/10. The variant that scores highest on **spec alignment** (10/10), the highest on **visual hierarchy** (9/10) for the user's first decision, and the highest on **anti-slop** (10/10).

### Why C wins

The brief's primary user task is unambiguous: *"Is anything waiting on me right now?"* Concept-doc HIL §4.5.5 ratifies it: blocking is the only field that drives sort across the entire system. Variant C encodes that priority into the *layout*, not into a row property. The first thing the founder sees when they open Conversations is the answer to their first question — yes (red section + count) or no (no Blocking section).

A and B answer the question correctly *as a row indicator* but require the founder to scan to find it. Under heavy load, that scan fails — the blocking row scrolls out of the visible window. C's sticky-Blocking header solves that even when the agent population is large.

### What C borrows from A and B

- **From A — the host tag pill on every row.** A foregrounds host kind by section. C foregrounds blocking by section. Pulling A's host tag onto C's rows means C answers "what is this thread *about*?" without needing a host section. This is already in the C mockup (`bet`, `task`, `knowledge`, `coach`, `factory` host pills). Approved.
- **From B — the pin glyph for the Chief of Staff coach thread + sticky-section behavior.** Both already in C. Approved.
- **From B — opacity 0.7 on Resolved rows.** "Behind glass" calm treatment for closed conversations. Approved.

### What gets explicitly rejected (and why)

These are now *closed* — `/architecture` and `/write-code` do not re-litigate:

- **Reject: a "Chief of Staff" dedicated section.** (From A.) The pinned-coach is one row, always present, top of Active, with a pin glyph. A dedicated section adds chrome for one row. Concept doc says the coach is "always available, never archived" — that promise is delivered by *position* (top of Active) and *glyph* (pin), not by a section header.
- **Reject: a flat 2-section layout.** (From B.) "Active" lumping blocking and non-blocking into one section throws away the load-bearing axis the concept locks. Sort rank can't carry the signal the way a section header does.
- **Reject: 5-section layout grouped by host kind.** (From A.) Host kind is a row property, not a layout axis. Founders ask "what's blocking?" 10× per day; "what's in my Bets right now?" maybe 1× per day. Layout follows frequency.
- **Reject: keyboard verb shortcuts on the list.** (Founder filter, see brief §2 Q9.) Up/Down arrow nav only.
- **Reject: emoji reactions on rows.** (Founder filter — Slack reference demoted.)
- **Reject: drag-to-reorder sections.** (Founder filter — Slack reference demoted.)
- **Reject: customizable section sets.** (Founder filter — sections are concept-locked.)
- **Reject: per-section color theming beyond Blocking.** Blocking is danger-tinted because blocking *means* stop. Active and Resolved are neutral. No "primary-tinted Active."
- **Reject: route-based selection.** (AC) Selection lifts an id on AppShell.

### What stays open for the architect

These are decisions the architect makes during planning — they don't change the visual contract:

- **Where the L1 query lives:** Page-level (in a Conversations layout) or shell-level (in AppShell so the Submenu reads it directly)? Both are viable. Recommend: shell-level so the Submenu's count and list share one subscription and never desync.
- **How the lifted id is plumbed:** Local state in AppShell vs URL search param (`?thread=<id>`) vs Zustand. The visual contract requires that selection updates the Main pane without a route change — any of the three plumbing options satisfy that.
- **How L9 reads the lifted id:** L9 collapses review/chat to one detail surface. It will read the same lifted-id contract. L8 prepares the seam; L9 consumes it.
- **Prop name for ThreadRow's selected state:** `selected: boolean`. Architect adds.
- **Where the section appearance/disappearance animation lives** (when first blocking thread lands): one-line CSS transition on `opacity` for the section element. No layout animation.

### What stays open for the next design iteration (L9 / future)

- Hover preview of a thread (Linear/Notion-style flash card on hover) — not L8 scope.
- Sticky filter chips when scrolling (today they're above the list and scroll away) — not L8 scope.
- Group-by toggle (let the user switch to Variant A's host-grouped view) — explicitly rejected for L8 (no customizable views per founder filter); revisitable post-launch if data shows the need.
