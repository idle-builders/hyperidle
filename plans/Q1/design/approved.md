# Q1 Design: Approved Variant

**Approved:** Variant C (Companion Rail)
**Score:** 8.0/9 (PASS)
**Date:** 2026-05-24

---

## Approved Design Summary

### Recipient Picker
Inline submenu replacement. "New Thread" button at top of Conversations submenu. Clicking replaces thread list with search + recipient list. Selecting a recipient shows inline message input. Sending creates the DM thread atomically. Escape cancels.

### Dial-In Composition
Companion split (horizontal): left = thread messages + composer (flex-[3]), right = session activity panel (flex-[2]). Activated via "Dial In" button in thread header. Session activity panel has filter tabs (All | Tools | Reasoning | Cost), auto-scrolling activity entries, and summary card on session end.

### Dial-In Affordance
StatusChip ("Live") + "Dial In" button (btn-ghost btn-xs) in thread header. Appears when the thread's host task has an active session. Detection via REST fetch on thread open.

### Session End Transition
Activity panel transitions to summary card (duration, cost, action count, outcome). "Close" button dismisses panel, returning to full-width thread.

---

## Conditions (binding on builder)

1. Left and right companion panes must have `aria-label` (e.g., "Thread messages", "Session activity") or `role="region"` with accessible names.
2. The "Live" badge (pulsing dot) must carry `aria-label="Active session"` -- not rely on animation alone.
3. Activity stream must pause auto-scroll when user scrolls up manually. Resume on scroll-to-bottom.
4. Keyboard shortcut D must not fire when focus is inside a text input element. Gate with `event.target` type check.
5. The companion layout is new implementation (not reuse of existing code). The flexbox split is the implementation target; no external split-pane dependency needed.

---

## Deferred Decisions

- Companion pane conflict (artifact review + session activity on same thread): For Q1, session activity takes priority. Artifact/session toggle is a follow-up.
- Tablet (768-1024px): If right panel would be < 250px, hide it (degrade to badge-only like mobile).
