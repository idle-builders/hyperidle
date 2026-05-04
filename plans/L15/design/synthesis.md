# L15 — Synthesis

## Strongest base: Variant A — Kebab menu

A scores 8/10 with the smallest density cost, the smallest component-budget impact, and the cleanest single-grammar surface. C also scores 8/10 but pays for it in vertical chrome and AI-aesthetic risk.

## Pulled in from Variant B

- **Body click opens the thread** — but only when the card carries an unread thread. For a card with no thread or all-read thread, click on the body does nothing (cursor stays default). When `unread > 0`, the cursor becomes pointer over the title row only; clicking the title row opens the thread.

  Rationale: the most common founder action on a card with unread messages is to read them. Body-click is the right grammar there. But making *every* card a link (Variant B's choice) introduces the borders-as-hierarchy problem and the title-not-selectable problem. Conditional body-click resolves both: cards with no unread look static; cards with unread feel like links.

- **Thread-state vocabulary** — Variant B's strip vocabulary (`<n> UNREAD`, `<n> MSG`, `NEW THREAD`) is concrete and useful. We lift the unread count into the kebab menu's "Open thread" right column, and the thread dot beside the title carries the visual signal.

## Pulled in from Variant C

- **State-aware menu ordering** — C's deterministic verb-by-state rule is sound. We apply it to A's menu by ordering items: "primary requests for this state" first, "secondary" below a divider, danger (`Kill task`) last in its own section. The menu always shows all items, but the most-relevant ones are at the top and not greyed out.

- **Primary action highlight** — when there's an unread thread, the menu's `Open thread` row gets a subtle primary-tint background (like C's `Thread (n)` button). This propagates the unread signal from the thread dot into the menu.

## Explicitly rejected

These are not options. The architect / write-code skill must not re-litigate them:

1. **Card-body-as-link for every card** (B's grammar). Conflicts with title-text-selectability and adds a structural divider. Conditional body-click on unread-only is the kept compromise.
2. **Always-visible verb row** (C's grammar). Density tax is too high for a 5-15-task default state; primary kanban view must remain scannable in one glance. The verb row stays available conceptually inside the menu — every verb in C's row is also a menu item in A.
3. **Drag-with-confirmation modal** ("are you sure you want to move this?"). Drag is a no-op. There is no fall-back gesture. The kebab is the only path.
4. **Cursor: not-allowed on the card body.** Looks like an error state. Cursor stays `default`. Drag is treated as "not part of the grammar" rather than "actively disabled".
5. **Optimistic state change in the UI when the human picks a verb.** Spec says the agent decides. The card's StatusChip does not move on click — it moves only when the agent honours the request and the state machine fires.
6. **Two-step confirmation on `Kill task`.** Already a danger-tinted menu item with red copy; adding a confirm modal violates the founder filter "no destructive-act consequence preview" for tasks (that lives only on bets per L14). For tasks, the agent can refuse; the founder can post the request again.
7. **Bulk-select / multi-card actions.** Out of scope. One card at a time.
8. **Drag survives ANY column.** Spec is explicit: drag survives only Shaped → Committed on the Canvas. The Canvas is a different file (`Canvas.tsx`) and is unchanged by this workpackage.

## Decision

Synthesise A as the base; lift the conditional body-click on unread, the state-aware ordering, and the primary-tint on Open thread for unread cards. Score target: ≥8/10 after critique.
