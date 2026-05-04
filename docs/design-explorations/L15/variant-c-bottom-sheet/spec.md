# Variant C — Card-click opens a side sheet

**Constraint:** Take inspiration from Linear's issue side-panel — clicking a row opens a right-edge sheet with the full primitive in context.
**Thesis:** The thread IS the primary surface for a task; surfacing it as a sheet keeps the user on the board while letting them act deeply.

## User story

A founder clicking anywhere on a task card opens a right-edge sheet (~40% viewport width) containing: task header (title, owner, status), four state-request buttons, and the task's thread (Composer + message list). All requests are posted as messages in the thread. Closing the sheet returns to the board with the column scroll preserved.

## Component composition

- `TaskCard` (Tier 2, existing) — `onClick` already exists (`clickableProps`). We wire it to "open the task sheet".
- DaisyUI `drawer` (right-side variant) OR a custom `<Sheet>` Tier-3 region. **Decision:** use DaisyUI `drawer` + a single `data-sheet` wrapper styled with our tokens. No new design-system component.
- `StatusChip` for current state.
- `KeyValue` for owner / cost / bet.
- DaisyUI `btn` ×4 for the state requests.
- `Composer` (Tier 2, existing) for the thread message input.
- A thread-message list — for L15 a thin placeholder; the real list arrives in L18.

**Component budget impact:** 0 new design-system components if we inline the sheet in the Kanban shell layer. **+1 if we promote it to a `TaskSheet` Tier-3 region**, which is appealing because L18 will need the same surface. **Recommendation:** L15 inlines a minimal sheet; L18 promotes it.

## Information hierarchy

Inside the sheet:

1. Sheet header — task title, status chip, close button.
2. Meta strip — owner · bet · cost · last-updated (KeyValues).
3. **State-request row** — four buttons, current state is `disabled` with "(current)" suffix; the others read "Request → In Progress" etc.
4. Thread surface — message list (L15: placeholder "No messages yet — your request will appear here." / L18: full thread); Composer pinned to bottom.

## States

| State | What appears |
|---|---|
| Default (sheet closed) | TaskCard as today, no kebab, no chips. Card has `cursor-pointer` only. |
| Hover | Card surface lifts to surface-5; otherwise unchanged. |
| Sheet opening | Drawer slides in from right, `--motion-slow` (250 ms). Backdrop dims main area to surface-0/0.4. Focus moves to the close button. |
| Sheet open, thread empty | "No messages yet." placeholder above the Composer. State-request buttons enabled (except current). |
| Sheet open, thread populated (L18) | Message list scrollable above the Composer. |
| Posting state request | Selected button shows inline spinner (DaisyUI `loading loading-xs`). On success, button returns to idle and a new message appears in the thread list ("Requested → Blocked"). |
| Posting message via Composer | Composer's existing post path. Optimistic message appears at end of list. |
| Error | Inline error chip below the failing button or composer ("Failed to post — retry"). |

## Behavior

**Pointer.** Click anywhere on the TaskCard opens the sheet. Click backdrop or the close button to close. ESC closes.

**Keyboard.** Tab order in sheet: close → state-request 1 → 2 → 3 → 4 → Composer textarea → send button. Focus trap inside the sheet while open. ESC closes and returns focus to the originating TaskCard.

**Motion.**
- Sheet slide: `transform: translateX(100%) → translateX(0)`, `--motion-slow`, `--motion-ease`.
- Backdrop fade: `opacity` 0 → 0.4, `--motion-medium`.
- Honors `prefers-reduced-motion: reduce`.

## Mobile adaptation

On ≤ 1024 px, the sheet becomes a full-screen drawer (slides in from right, fills the viewport). The board is hidden under the drawer; back button (or close X) returns to the board. State-request buttons stack to two columns to fit; Composer pinned to bottom.

## Signature

Clicking a card means engaging with the task. There is no shallow gesture — every interaction with the task primitive happens in the sheet. The board becomes a pure visual index; the sheet is the workbench.

## Trade-offs

- **Heaviest UX cost.** Every interaction takes the user off the board. For a power user scanning ten cards and dropping two requests, this is two full sheet open/close cycles vs. two kebab clicks.
- **Heaviest component cost.** Even the minimal sheet is more code than a kebab/menu. Promoting to a TaskSheet Tier-3 component eats a slot we'd want to spend on something else (Rail, Submenu).
- **Delays naturally on L18.** The sheet design pre-empts L18's "thread surface on task" decision — we'd be deciding the L18 layout in L15. This blurs the L15 / L18 boundary the architect explicitly drew.
- **Strongest discoverability.** The user clicks the card — the most natural intent — and the system surfaces every operation. No hidden affordance.
- Best on mobile if the only mobile interaction is "open card and act" — but the brief says Conversations is the mobile primary, so this is less load-bearing.
