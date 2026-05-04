# L15 — Approved design: Task Request Sheet (Variant C)

## Picked variant

**Variant C — Sheet.** See `variants.md` for the comparison and scoring (79/90; A: 76; B: 59).

## What the user sees

1. **Resting state.** Kanban task cards look identical to today. NO drag affordance, NO kebab visible, NO header strip. The card has zero added chrome.
2. **Hover / focus.** The card gains a subtle `--surface-4` → `--surface-3` hover background (existing `clickableProps` from TaskCard) and a focus ring. The cursor is `pointer`.
3. **Activation.** Clicking the card (mouse), pressing Enter/Space when focused (keyboard), or tapping (touch) opens the **Task Sheet** as a right-anchored DaisyUI drawer (modal class `drawer-end`, ~360px wide on `lg`, full-width on `sm`). On small viewports the same component renders bottom-anchored as a bottom-sheet via Tailwind's responsive utilities.
4. **Sheet contents.**

   ```
   ┌────────────────────────────────────────────┐
   │ [×]    Task                                │
   │ ──────────────────────────────────────────│
   │ <Title> (text-base font-medium)           │
   │ <Owner> · <StatusChip> · <Cost?> · <BetTag?>│
   │ ──────────────────────────────────────────│
   │ [ Open thread ]   ← navigation button     │
   │ ──────────────────────────────────────────│
   │ REQUEST                                   │
   │ ┌────────────────────────────┐           │
   │ │ Move to BLOCKED            │           │
   │ │ Unblock and resume         │           │
   │ │ Mark DONE                  │           │
   │ │ Put on HOLD                │           │
   │ │ Stop (kill)                │           │
   │ └────────────────────────────┘           │
   │ Note (optional)                           │
   │ ┌────────────────────────────┐           │
   │ │ <textarea>                 │           │
   │ │                            │           │
   │ └────────────────────────────┘           │
   │ [ Send request ]                          │
   └────────────────────────────────────────────┘
   ```

   - Header: "Task" eyebrow (uppercase tracking +0.02em), close button at top-right.
   - Body block 1: task summary read-only (no edit; humans don't edit tasks here).
   - Body block 2: `Open thread` is a single full-width DaisyUI `btn btn-ghost` row.
   - Body block 3: `REQUEST` section.
     - Five intent rows (one per legal request kind).
     - Each row is a DaisyUI radio-styled button (single-select). Selecting a row fills the highlight; clicking again deselects.
     - Optional `<textarea>` for a free-form note (placeholder: "What should the agent know?").
     - Just above the `Send request` button there is a **single inline feedback region** (one DOM slot, one of three states at a time): empty (no message), success (`<div role="status" aria-live="polite">Sent.</div>`), or error (`<div role="alert" aria-live="assertive">Couldn't send — try again.</div>` or `Couldn't open thread — try again.`). NO global toast.
     - Single primary `Send request` button at the bottom — disabled until an intent is selected. On click: post the templated message, render the inline `[role="status"]` "Sent." element, then auto-close the sheet after ~800ms.
5. **Open-thread path.** Clicking `Open thread` triggers a navigation: `useNavigate()` to `/conversations/chat?thread=<id>` (existing page in `packages/web/src/router.tsx:31`). The sheet closes after navigation. If no thread exists yet, the client first creates one (transparent to the user — see architecture). If the resolve/create call fails, the sheet stays open and renders the inline `[role="alert"]` "Couldn't open thread — try again." in the same feedback region.
6. **Error state.** If the message post fails, the inline `[role="alert"]` region renders "Couldn't send — try again." and the sheet stays open with the form's selection (intent + note text) preserved. The user retries by clicking `Send request` again — the same `clientKey` is reused so a duplicate is not created if the previous request actually succeeded.
7. **Loading state.** While posting, the `Send request` button shows the DaisyUI `loading` spinner; intent rows are disabled.

## Closed intent vocabulary

| Label in UI | Posted text template | Maps to TaskState the user is requesting |
|---|---|---|
| Move to BLOCKED | `Request: move to BLOCKED. <note?>` | blocked |
| Unblock and resume | `Request: unblock and resume. <note?>` | in_progress |
| Mark DONE | `Request: mark DONE. <note?>` | done |
| Put on HOLD | `Request: put on HOLD. <note?>` | hold |
| Stop (kill) | `Request: stop (kill). <note?>` | killed |

The trailing `<note?>` is the optional free-form textarea content (omitted from text if empty).

These intents map 1:1 onto the legal `TaskState` values **excluding** `proposed`, `accepted`, and `review` — humans don't request those: `proposed`/`accepted` are agent intake states, `review` is an agent-driven mid-cycle state.

## Drag — explicit removal scope

| Surface | Drag survives? | Why |
|---|---|---|
| `Kanban.tsx` task cards | **NO** | Tasks are agent-team-owned per v3. |
| `Canvas.tsx` Shaped → Committed bet cards | **YES** | Shape Up shaping — human-owned move. Untouched. |
| Anywhere else | **NO** (already none) | — |

## Mobile

- Trigger: tap on the card.
- Sheet: bottom-sheet (CSS: `inset-x-0 bottom-0 max-h-[85vh] rounded-t-[var(--r3)]`).
- Touch targets: every intent row min-height `44px` (AQ-015). The textarea has `text-base` (16px) at viewport ≤ 768px (AQ-005).
- Dismiss: tap backdrop, swipe-down (CSS-only — handled by `tabindex="-1"` + ESC; no JS swipe-handler in v1).

## Keyboard navigation

- **From kanban**: Tab walks task cards in column order (existing `roving-focus` pattern in `packages/web/src/shell/use-roving-focus.ts`). Enter/Space opens the sheet.
- **Inside the sheet** (focus order):
  1. Close button (top-right).
  2. `Open thread` button.
  3. Each intent row (radio group: ↑/↓ moves selection per ARIA radiogroup pattern).
  4. Note textarea.
  5. `Send request` button.
- **ESC** closes the sheet and returns focus to the originating task card (focus restoration via `useRef` of the trigger; standard React pattern).

## Accessibility

- Sheet is `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the task title.
- Intent rows are a `role="radiogroup"` with each row `role="radio"`, `aria-checked`, label-as-text.
- The `Send request` button has `aria-disabled` mirroring its `disabled` state (defensive, for screen readers that may not honor `disabled` on buttons consistently).
- `Open thread` is `role="link"` (it navigates) styled as a button per DaisyUI conventions.
- Focus trap inside the sheet (DaisyUI `modal` primitive handles this).
- Status changes (post success/failure) announce via the Sheet's inline feedback region: success uses `role="status"` + `aria-live="polite"`; errors use `role="alert"` + `aria-live="assertive"`. The region lives just above the `Send request` button and is the same DOM node for both kinds — only the role and aria-live attribute change. No global toast surface.

## Component reuse — fits in the 19-component budget

No new custom components. Composition:
- `TaskCard` (existing) — unchanged; render via the existing `onClick` slot in `Kanban.tsx`.
- DaisyUI `drawer` / `modal` primitives (allowed; we don't wrap them).
- DaisyUI `btn`, `textarea`, `radio` form controls.
- Existing `KeyValue`, `StatusChip`, `Tag` for the summary block.
- Inline `role="status"` / `role="alert"` region inside the Sheet itself for success/error feedback. NO `useToast` hook (none exists in the codebase as of L15; introducing one is out of scope per architecture-critique round 2).

The Task Sheet itself is a **page-local composition** living at `packages/web/src/shell/TaskSheet.tsx` (Tier 3 — region/shell, like Submenu and Rail). It's not a reusable design-system component because the closed intent set is task-specific. If a similar pattern emerges for bets, we'd lift it; for now it stays in `shell/`.

## Rail / Conversations interaction

When the user picks `Open thread`:
1. The sheet closes.
2. Navigation: `/conversations/chat?thread=<id>`.
3. The Conversations Submenu (L8) updates to show the selected thread highlighted; the chat surface renders the thread.

This is the SAME behavior the Conversations view already drives when the user clicks a thread row — we're just navigating into it from a different entry point. No new selection mechanism.

## What is explicitly NOT in scope for L15

- Free-form chat composer inside the Task Sheet (beyond the single-shot note attached to the request). If a user wants ongoing conversation, they go to Conversations.
- Inline thread rendering inside the sheet. The L18 spec calls out attached-thread-on-task-detail; that's L18's job. L15's "open thread" affordance navigates out for now.
- Showing a "your request was honored" badge. Not stored; not displayed.
- Any change to `TaskCard` internals. The card is untouched.
- Any change to Canvas drag.
