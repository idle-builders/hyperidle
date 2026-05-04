# Variant C — Inline Thread Peek

## User story

A founder clicks the StatusChip on a TaskCard. The card expands in place. Above a one-line composer is a row of state-change chips. Below the composer is the last 2-3 turns of the task's thread (a thin transcript). The human types — or clicks a chip — and the message lands. Same gesture, same surface, whether they want to chat or to request a state move. This *is* the thread; the kanban card is a viewport into it.

## Component composition

- `TaskCard` (existing). When expanded, the `actions` slot becomes a thin embedded panel.
- `StatusChip` (existing) is the trigger — clicking the chip toggles "expand". This re-uses the chip as a verb-bearing affordance instead of a passive label.
- A reduced shape of the existing thread/composer surface — a single textarea (`textarea` from DaisyUI) plus the row of state-change chips above. We re-use the SAME composer the Conversations Rail uses (no new component shape).
- Last-N-turn transcript: re-uses the existing `RichMessageCard` / message row primitive (the L1 thread already has a renderer). On the kanban it's compressed: only the last 2 messages, each a one-line summary.
- A "Open in Rail" link at the bottom-right of the expanded panel — opens the full thread in the Rail.

No new component invented; the panel is a composition.

## Information hierarchy (top → bottom of the expanded panel)

1. **State-request chips** (one row, scrollable on overflow). Same labels as Variant A: Start / Block / Review / Done / Abandon — gated. Hover/focus reveals a tiny `→ {state}` hint inline.
2. **Composer** — 1-line textarea, `field-sizing: content` so it grows up to 5 rows. Placeholder: `Reply or describe what should change…`.
3. **Send affordance** — when the textarea has content OR a chip is selected, a tiny "Send" appears at the right of the composer row. `⌘+Enter` sends.
4. **Transcript stub** — the last 2 messages from the task thread, rendered with monospaced timestamps (`12 min`, `3h`) and one-line truncated body. If the thread is empty: a `text-lo` line `No messages yet — first message starts the thread.`
5. **Footer link** — `Open thread →` at right (text-button, 11px). Closes the inline panel and opens the Rail.

The card title, tag, status, owner row stay at the top — unchanged. The expanded panel grows BELOW them. The card width stays 320px.

## All states

| State | Render |
|---|---|
| Collapsed (default) | Standard TaskCard. The status chip has a faint `cursor: pointer` + `1px outline-on-hover` to hint expandability. No icon clutter. |
| Empty thread | Composer shows. Transcript area shows `No messages yet.` State-chips are still available. |
| Loading (expanding) | Card height transitions over `var(--motion-medium)`; transcript shows 2 skeleton rows of `height: 16px; background: var(--surface-3); border-radius: var(--r1);`. |
| Loading (sending) | Composer shows a 12px spinner inside the Send button. Composer is read-only. |
| Error | A 1-line `alert-error` strip appears above the composer: `Couldn't send. Retry.` Retry button inline. |
| Populated (sent) | The new message slides into the transcript above the composer (`opacity 0→1`, `translateY(4px → 0)`). Composer clears. The card chip does NOT change. |
| Disabled targets | Hidden (same gating rules as A and B). |

## Behavior

- **Expand:** click the StatusChip OR click anywhere on an empty area of the card except the title. The card expands. The card's `aria-expanded` flips. Only ONE card can be expanded at a time on the board (clicking another collapses the previous — like an accordion). Optionally, `Esc` collapses the active card.
- **Composer key:** `Enter` inserts a newline. `⌘/Ctrl+Enter` sends. `Esc` collapses without sending (with confirm if textarea is non-empty).
- **State chip click:** posts immediately as `{ type: "plain", text: "Please move \"{title}\" to {targetVerb}." }`. If the textarea has content too, the note is appended.
- **Composer submit (no chip):** posts plain text, `refs: [{ kind: "task", id: <taskId> }]` only.
- **Transcript click:** clicking a transcript row opens the full thread in the Rail (one-step deeper navigation; the inline panel is for quick replies, the Rail is for reading).
- **Open in Rail link:** explicit "go full" affordance.
- **Motion:** card height grows over `var(--motion-medium)`. Composer fade-in `var(--motion-fast)`. Transcript skeleton swaps to content over `var(--motion-medium)`. Honors `prefers-reduced-motion` (instant swap, no transform).
- **Stop-propagation:** chip click toggles expand BUT does not bubble to the card's primary `onClick` (which would route to the task detail page). The "Title" remains the navigation target.

## Mobile adaptation

- The board is single-column on phones. Expanded card spans full viewport width minus 16px padding.
- Composer textarea = 16px font (AQ-005).
- State chips wrap to a second row if needed; each is ≥ 32px tall with extended hit area to ≥ 44px.
- "Open in Rail" link becomes the dominant affordance on mobile because the inline transcript is cramped.

## Signature

There is no separate "request" surface. Conversation IS the surface. The same gesture (type and send) handles both "let me ask" and "please move this". State-chips are pre-built request templates, not commands. The kanban card transparently becomes a thread peek when you engage with it — one interaction grammar, dense default, deep on demand.

## Trade-offs

- **Bad at** kanban density when expanded — one expanded card displaces the column rhythm.
- **Bad at** discoverability of the chip-as-trigger — clicking a status chip to expand is unfamiliar (most boards make chips passive).
- **Bad at** compact desktop screens — expanded card may push the column long enough to need scrolling.
- **Good at** preserving one interaction grammar with the rest of the system.
- **Good at** quick back-and-forth without leaving the board context.
- **Good at** signalling "agent owns this; you're talking to them" because the conversation is right there.
