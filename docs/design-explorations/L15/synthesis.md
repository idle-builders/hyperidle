# L15 — Synthesis

This document picks the chosen base from the three variants and identifies which insights from the others are worth pulling in. The autonomous selection rule (per `/design` skill phase 4):

1. Highest critique score → Variant A (7.7) wins.
2. Lowest component-budget cost → Variant A wins (zero new components).
3. Best fit with the founder filter (no keyboard verbs, no optimistic UI, no drag-reorder-of-tasks, etc.) → all three pass; A is unambiguously the cleanest.

**All three rules point to A. No conflict.**

---

## Strongest base — Variant A (`inline-action-row`)

A wins on three independent criteria:

- **Discoverability.** The labelled `Request ▾` and `Thread (N)` affordances on every card make the new mechanic obvious to first-time users. B's hover-revealed `…` and C's click-card-to-discover both impose discovery debt that A doesn't.
- **Component budget.** Net-zero new shapes. The 19-component budget is sacred per project rules; A leaves it at 19. C costs +1 Tier 3.
- **Grammar consistency.** A's pick-then-confirm popover with optional note mirrors L1's verdict popover (already shipped). Power users transfer learning.

A's worst attribute (equal-weight footer ignores frequency-of-use asymmetry) is recoverable through small visual tuning, which is what the synthesis pulls from B.

---

## Pull-in 1 (from B) — the unread signal on the thread chip

B's strongest insight: when the agent has posted unread messages in the thread, the founder's eye should be pulled to that card. A's `Thread (N)` count chip becomes a passive read-out of message count, but doesn't differentiate "agent posted, you haven't read" from "static count of past messages."

**Synthesis.** Adopt B's two-state thread chip styling on A's `Thread (N)` link:
- Default state (no unread): chip uses `--surface-ghost` background, `--text-mid` count.
- Unread state (agent has posted since last read): chip uses `color-mix(in oklab, var(--primary) 14%, transparent)` background + a 6×6px `--primary` dot prefix, `--text-hi` count.

This gives the founder a single-glance scan path across the Kanban: cards with unread chips pull the eye, then the labelled `Request ▾` is one click away once she lands on a card. A's discoverability + B's signal density.

The cost is small: `Tag` gets one optional prop (`kind: "default" | "unread"`). Same one-prop extension B already proposed.

---

## Pull-in 2 (from C) — the selected-card border + drawer-as-future-upgrade

C's strongest insight: the spatial linkage between a Kanban card and its "in-flight surface" is valuable. A doesn't currently make the link visible — when the popover is open, you know which card it's anchored to (it's literally attached), but once the popover closes, there's no persistent marker.

**Synthesis (limited pull-in).** Do NOT adopt the drawer in L15 (component-budget cost is real and the drawer's two-footer ambiguity is an open coherence issue). DO adopt:

- **The `--primary` left border treatment for selected/active cards as a future-ready pattern.** When the user clicks the card title (which navigates to the full task detail page in L20-territory), the active card carries a 2px `--primary` left border. In L15a this only flashes briefly during the click animation — but the border treatment is a reserved visual that L20 (or a future TaskDrawer) can adopt without re-litigating.
- **The URL-as-state pattern for thread route.** A's spec already proposes `/work/teams/:teamId/tasks/:taskId/thread`. Lock this as the contract. Future TaskDrawer (if it ships) can mount the same surface from a query string version of the same URL.

Neither addition adds code in L15a. Both lock visual + routing patterns the architect honours.

---

## Explicit rejection list

These elements were considered and rejected. They do NOT enter the approved design and should not be re-litigated:

1. **B's `…` overflow trigger.** Rejected for discoverability. New users don't know they can request from the card. A's labelled `Request ▾` is the better answer.
2. **B's no-confirmation-on-Kill.** Rejected as an unsafe accelerator. A's pick-then-Send pattern keeps Kill behind a confirmation step.
3. **B's "context goes in the thread, not the popover" stance.** Rejected. A founder may want to attach a one-line "why" without going to the thread. The optional note in the popover is the right friction-cost answer.
4. **C's TaskDrawer as a Tier 3 component for L15.** Rejected for component-budget pressure + two-footer ambiguity. May ship in a future story (L20 or L18b) under a separate budget review with concrete second-context justification.
5. **C's drawer auto-collapsing the Rail.** Rejected because it creates a side-effect on a sibling region that surprises the user.
6. **C's two stacked footers (composer + action footer).** Rejected as a coherence smell. Variant A's popover-anchored-to-card avoids the duplication entirely.
7. **Any variant of "auto-send on verb pick".** Rejected; the pick-then-confirm grammar is a non-negotiable safety + L1-grammar consistency.
8. **Drag on Kanban tasks.** Rejected per spec — this is what L15 explicitly removes.
9. **A new `MESSAGE_TYPES` enum value for `request`.** Rejected; the message is `plain` with a deterministic body format. Spec is non-negotiable.
10. **An overflow menu on `…` ALONE without a labelled trigger.** Rejected for discoverability (see #1).
11. **Keyboard verb shortcuts** (e.g. `B` to mark blocked, `K` to kill). Rejected per founder filter — same rule as L1 / L11.
12. **Optimistic UI bragging** (e.g., "Request sent!" toast). Rejected per founder filter. The thread chip's `(N)` count increment is the only feedback.
13. **A persistent "recent requests" feed at the page level.** Rejected. The thread itself is the audit trail.
14. **Per-card unread badge in the column header roll-up.** Rejected — the per-card chip already carries the signal; column-level rollup adds chrome without adding info.

---

## What the architect inherits

The visual contract the architect cannot redecide:

- A's footer geometry (28px, 1px subtle divider above, two labelled affordances).
- A's pick-then-confirm popover with the optional note.
- A's `Request ▾` always rendered when verbs apply; collapsed-to-thread-only on terminal cards.
- B's two-state thread chip (default + unread, with the `--primary` dot prefix).
- The route `/work/teams/:teamId/tasks/:taskId/thread` for thread navigation.
- The DnD scaffolding removal from `Kanban.tsx`; the read-direction of `STATE_TO_COLUMN` survives, the write-direction `COLUMN_TO_STATE` is deleted.
- The `plain`-message body format for the request:
  ```
  @<actor> requested: <verb-label>
  <optional one-line note>
  ```

What the architect freely picks:

- The exact thread route URL shape (e.g., `/work/teams/:teamId/tasks/:taskId/thread` vs `/tasks/:taskId/thread` — both fine if `host_kind: "task"` resolves correctly).
- The verb-list-derivation function's location (utility module, or a hook on top of the task type).
- The DaisyUI `dropdown` primitive vs a custom popover via `<dialog popover>` (both acceptable; `dropdown` is what variant A's mockup used).
- The `Tag`'s `kind` prop API shape (whether `kind: "unread"` carries the dot, or whether the dot is its own prop — designer doesn't care, both are token-driven).
- Test geometry — the exact Vitest + Playwright file shapes per the standard.

---

## Three open questions for the architect

1. **Where does the verb-list derivation live?** A pure function in `@hyperidle/shared` (alongside `taskStateToStatus`) is a natural home. Architect picks the exact location and signature.

2. **Read-state for the thread chip's unread count.** L1 already plans server-side read-state per `ThreadShell`. The architect picks whether the Kanban consumer fetches `(threadId, unreadCount)` per card via a batched endpoint (e.g., `/api/threads/by-task?taskIds=…`) or per-card on render. The visual contract is "the count is correct on first render and updates after the user opens-and-returns from the thread."

3. **The popover's anchor library.** DaisyUI `dropdown` works for the simple case but its CSS-only nature limits placement-flipping near viewport edges. Architect picks: stay with DaisyUI + accept the edge-clip cost, or pull in a small headless-popover dependency (e.g., `@floating-ui/react`). Designer's preference: stay with DaisyUI; in practice the rightmost column rarely has a full-width popover (the verb list is short).
