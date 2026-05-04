# L8 — Conversations Submenu thread-list redesign — Brief

**Worktree:** `/workspace/.worktrees/L8`. Branch `feat/L8-conversations-submenu-threads`.
**Story:** `docs/work-packages/TRACK-L.md` lines 269–294.
**Concept locked upstream:** Thread primitive (HIL §4.5; the canonical-shapes contracts under docs/ → Thread). Conversations is a *view* over threads, never their owner. Filter axis is **blocking vs non-blocking** (sync/async = same axis).

---

## 1. The user task

A founder lands on the Conversations view at the start of the day. Three things they want, in this order:

1. **Triage.** Is anything *waiting on me right now* — i.e. is an agent literally paused on my decision? If so, that is the only thing that matters.
2. **Pick what to work next.** Of the non-blocking items, which thread do I want to enter — the Chief of Staff coach thread, an in-flight chat with a Builder, a review I deferred yesterday?
3. **Glance at "what closed."** Anything I just verdict'd should still be visible for a few seconds so I know the action landed.

The Submenu is the index. The Main pane is the reading surface. **The Submenu's job is to make decision #1 unmissable and decision #2 fast.** Decision #3 is bonus comfort.

The current state (`AppShell.tsx:39–44`) is a static two-row list — "Review Queue 3" and "Chat 1". That is a placeholder, not a thread list. Counts are hardcoded. There is exactly one reachable thread today (#1). L8 closes that gap.

A `ThreadSections` component already exists (`packages/web/src/components/ThreadSections.tsx`) with a working classifier — `pinned → blocking → reviews → chats → resolved`. It is **not yet wired into the Submenu**. L8 wires it. The variants below do *not* re-litigate Thread or its host kinds (locked by L1 concept) — they explore the **section grouping, ordering, label register, count placement, density, and selected-state shape** that the wired Submenu will render.

## 2. Decisions probed (and proposed reads)

> Following the design skill's "one question at a time" pattern. Adversarial confirm in autonomous mode.

**Q1. What grouping axis is primary?**
*Read:* The blocking-vs-non-blocking axis the concept locks (HIL §4.5.5). Blocking threads sort first because an agent is *literally* waiting. Pinned (the Chief of Staff coach) floats above blocking by tradition (always available) — but tradition can be challenged. Variant B will challenge it.
*Confirm:* yes — primary axis is blocking. Pinned-vs-blocking ordering is an explicit variant axis.

**Q2. How many sections show by default?**
*Read:* No more than 5. The existing `ThreadSections` uses 5 (`pinned, blocking, reviews, chats, resolved`). 5 is the ceiling — beyond that the founder's eye runs a search across labels instead of within them.
*Confirm:* yes — 5 is the cap. Variants explore 2, 3, and 5.

**Q3. Where does the count live?**
*Read:* Inline next to the section label, mono, `var(--text-lo)`. Never on the section title bar at the top of the Submenu (that's the *total* count, J2-locked). Counts are derived from `bucket.length` — never literals. The current `ThreadSections.tsx:121` already does this correctly.
*Confirm:* yes — section-level + total-level counts both derive. No hardcoded numbers anywhere.

**Q4. What does selection drive?**
*Read:* A *lifted selected-thread id* on the AppShell, NOT a route navigation. Per AC: "Selection drives a lifted selected-thread id, NOT a route navigation." This means the Submenu thread list and the Main pane stay on the same route (`/conversations`); the Main pane reads the lifted id and renders that thread. L9 collapses review/chat to a single detail surface — L8 prepares the seam.
*Confirm:* yes. Today's `navigate(item.path)` pattern in `AppShell.tsx:451` is gone for the conversations Submenu. Knowledge keeps its existing routing (L8 only touches conversations).

**Q5. What happens to the Submenu's existing filter chips (`All / Needs review / Chats / Resolved`)?**
*Read:* They survive — they're J2-locked and orthogonal to grouping. The chips filter the *list*; the sections group the *filtered list*. "Needs review" filter restricts to threads with `hasUnresolvedReview = true`; the result still groups (so within "Needs review" a blocking sub-section can appear above a reviews sub-section). "All" is the default.
*Confirm:* yes — chips orthogonal to grouping. Counts must update when chips change.

**Q6. What's the empty state?**
*Read:* Per-section empty (e.g. "no blocking items") is too chatty when most sections are empty most of the time. Single, list-level empty state when *all* sections are empty: "No threads yet. Conversations with agents will appear here once started." When *some* sections have items, empty sections silently disappear (already the behavior in `ThreadSections.tsx:85`).
*Confirm:* yes. Empty-section silence is the default; full-list emptiness gets the EmptyState component.

**Q7. What's the error state?**
*Read:* Network failure → Submenu shows ErrorState component in the list slot, not silent collapse. Title bar + filter chips remain visible (chips are static config). Copy: "Couldn't load threads. Retry." with a retry button. Per AC: "Given the network fails, the Submenu shows a clear error state, never silent collapse."
*Confirm:* yes — ErrorState in the list slot; structural chrome stays.

**Q8. What's the selected-state visual?**
*Read:* The selected `ThreadRow` gets the same selected treatment as `NavItem`: `background: var(--surface-4)` + `border-left: 2px solid var(--primary)`. Reuse the established selection grammar; no new color, no new shape. The `ThreadRow` HTML doesn't currently render a selected variant — it must be added.
*Confirm:* yes. ThreadRow gains a `selected` prop matching NavItem's grammar. Architect call: prop name and CSS class.

**Q9. How does the founder filter cut?**
*Read:*
- No keyboard verb shortcuts on the list (founder demoted Linear's `J/K`/`S/P/L` from `reference-linear.md` priority filter). Up/Down arrow nav inside the Submenu is allowed (a11y standard).
- No emojis anywhere.
- Counts must match list length — counts that lie are forbidden.
- Selection drives lifted id, not navigation.
- No drag-to-reorder sections (Slack reference demoted).
- No emoji reactions on rows.
- No customizable section sets — the section vocabulary is closed (concept-locked); the user does not get to add a "Project A" section.

## 3. The decision space — what variants must explore differently

Per the design skill's anti-convergence rule: 3 variants must differ on ≥3 axes per pair. The orchestrator's three suggested variants align well; refining their constraint-and-thesis pairings:

**Variant A — "Grouped by host entity"** (constraint: optimize for *what is this thread about*).
Sections come from the closed host-kind enum projected onto user-meaningful labels: `Chief of Staff` (pinned coach), `Bets`, `Tasks`, `Knowledge`, `Other`. Blocking-ness and unresolved-review-ness become per-row indicators (left border + pill), not section drivers. Hierarchy: the founder asks "what about?" first, "what state?" second.

**Variant B — "Grouped by recency + status"** (constraint: optimize for the timeline).
Two big sections: `Active` (sorted by `lastActiveAt` desc) and `Resolved` (24h window, sorted by `resolvedAt` desc). Pinned coach floats at top of `Active`. Blocking is a strong row indicator (red left border + position-within-section: blocking sorts to top of `Active`), not its own section. Hierarchy: the founder reads the list as a chronological log.

**Variant C — "Grouped by blocking / active / resolved"** (constraint: optimize for the verdict gate).
Three sections: `Blocking`, `Active`, `Resolved`. Pinned coach lives at top of `Active` (not its own section — a row glyph instead). The Chief of Staff is "always one thread among the active ones." Blocking is the shouting top section; everything else is the work backlog. Hierarchy: the founder reads `Blocking` first; if empty, drops to `Active`; never visits `Resolved` unless they're checking on something they just decided.

These three differ on:
- **Hierarchy axis** (host entity / time / blocking-state).
- **Number of sections** (5 / 2 / 3).
- **Pinned coach treatment** (own row in `Chief of Staff` / floating top of `Active` / floating top of `Active`).
- **Blocking treatment** (row indicator / row indicator + sort / dedicated section).
- **Density** (5 sections @ comfortable / 2 sections @ dense / 3 sections @ tight-default).
- **Action surface** (selection only — same across; this is by design, not a difference).

## 4. Hard constraints all variants must respect

- Compose from existing components only: `ThreadRow`, `NavItem`'s selection grammar, `EmptyState`, `ErrorState`, the existing Submenu chrome (`Submenu.tsx`).
- Density tokens: `var(--density-pad-x/y)`, `var(--density-gap)`, `var(--density-row-h)`, `var(--density-text)`. No hardcoded `p-[Npx]`. Section headers reuse the mono uppercase tracking-wider style already in `ThreadSections.tsx:118`.
- No purple/indigo gradients, no `rounded-2xl`, no oversized padding, no decorative icons on every row, no emoji.
- Section labels are short, lowercase-or-titlecase nouns — never imperatives. "Blocking" not "Needs your verdict now". The founder reads the chip status to learn *why* an item blocks; the section just labels.
- Counts are mono, `var(--text-lo)`, sit immediately right of the section label with `0.5rem` gap. Format: bare digit (no parentheses).
- Selected `ThreadRow` matches NavItem selected: `background: var(--surface-4)` + `border-left: 2px solid var(--primary)`. The 2px left-border indicator stacks correctly with the existing 2px danger left-border on `--blocking` rows: when a row is both blocking AND selected, primary wins (selection trumps; the row's `unread` weight + `blocking` chip tell the rest).
- Mobile: the Submenu becomes the Conversations tab content. The grouping must read at a 360px width — ThreadRow already wraps, but section labels must not wrap.

## 5. What's locked, what's free

**Locked (do not vary):**
- Thread primitive (host_kind enum, blocking derivation, message types).
- Filter chips (`All / Needs review / Chats / Resolved`) — J2.
- Selection drives lifted id, not nav.
- Counts derive from list length.
- No emojis, no keyboard verbs on rows.
- Existing `Submenu` chrome (title bar + filter row + collapse toggle).
- Existing `ThreadRow` density tokens and blocking border.

**Free (variants explore):**
- Section names, count, ordering.
- Pinned coach placement.
- Blocking treatment (own section / row indicator only / both).
- Section header density and typographic register.
- Selected-row visual (within the constraint that it must match NavItem's grammar; subtle variation in border weight or surface tier is allowed).
- Empty-state copy and per-section empty handling.
- Error-state copy and retry affordance.

## 6. Outputs the synthesis must produce

The variant chosen feeds into `approved.md` with these fields, ready for the architect:

- Section names + ordering rule (deterministic).
- Sort order *within* each section (e.g. blocking → by `lastActiveAt` desc; resolved → by `resolvedAt` desc).
- Count-badge formatting + placement.
- Empty-state copy (whole-list) + per-section empty behavior.
- Error-state copy + retry button label.
- Selected-state visual spec (what tokens, what stacking with blocking border).
- Pinned-coach placement decision + rationale.
- The shape of the data passed from AppShell → ThreadSections (already typed via `ThreadItem` — the architect verifies the L1 store output matches it).
- Filter-chip × grouping interaction (which threads are visible inside which section under each chip).

The architect then picks: where the L1 query lives (page-level or shell-level), how the lifted id is plumbed (state in AppShell vs URL search param), and how the L9 detail-route consolidation will read the lifted id.
