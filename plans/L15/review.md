# L15 Phase 4 Review

**Verdict:** NOT DONE
**Date:** 2026-05-04

The implementation is structurally correct, the contracts are honoured, and verify is green. However, **two design contracts the architecture/design plan promised are not implemented and have no tests**: focus trap + focus restoration on the sheet, and the responsive mobile bottom-sheet. There is also a gap in the e2e coverage versus the literal AC wording ("message appears in the task's thread"). One HIGH finding gates DONE; the rest are MED/LOW.

## AC completeness audit
| AC (paraphrased) | Verifying test (file:line) | Pass |
|---|---|---|
| Drag-to-move removed from Team Board Kanban; sensors + column-to-state map gone; `WorkTeam.handleMoveTask` deleted | `packages/web/src/__tests__/Kanban.no-drag.test.tsx:24-43`; `packages/web/e2e/L15-task-request.spec.ts:150-161` | yes |
| Each task gains affordance to request a state change OR open the task's attached thread; selecting posts a message | `packages/web/src/__tests__/TaskSheet.test.tsx:89-159` (Send request shape, status, auto-close); `:199-211` (Open thread); `packages/web/src/__tests__/Kanban.no-drag.test.tsx:45-67` (click → onSelectTask) | yes |
| Drag survives only Shaped → Committed on Canvas | Implicit — not asserted by an L15 test, but Canvas is untouched in the diff (no Canvas changes). The pre-L15 Canvas drag e2e remains untouched. | partial (no positive test added but no diff to Canvas) |
| Vitest covers (a) drag is a no-op (b) request actions post messages (c) opening a thread lifts it correctly | (a) `Kanban.no-drag.test.tsx`; (b) `TaskSheet.test.tsx`, `task-threads.service.test.ts`, `WorkTeam.task-request.test.tsx`; (c) `TaskSheet.test.tsx:199-211` | yes |
| Playwright e2e: drag → no-op → request → **message appears in the task's thread** | `packages/web/e2e/L15-task-request.spec.ts:150-215` covers drag-noop, sheet open, intent select, Send, "Sent." feedback, sheet auto-closes. The literal "message appears in the task's thread" step (architecture step 7) is **not implemented** — the spec stops at the inline status. | partial |
| `bun run check` + `bun run lint` + `bun run test` green | check: tsc --noEmit clean; lint: 0 errors (157 pre-existing warnings); test: 3213 passed, 3 skipped | yes |

## Lens findings

### Architecture (positive)
- `Kanban.tsx` correctly drops `@dnd-kit` imports, `KanbanDropZone`, `DraggableTaskCard`, `useDraggable`/`useDroppable`/`useSensor*`, `DndContext`, `DragOverlay`, `activeId` state, drag handlers, `COLUMN_TO_STATE`, and the empty-state "Drag tasks here" copy. Confirmed via `grep` returning no matches.
- `WorkTeam.tsx` no longer imports `COLUMN_TO_STATE`; `handleMoveTask` is gone. `selectedTaskId` state and `<TaskSheet>` are wired with the proper `useNavigate` hook.
- `task-threads.ts` reuses L1 endpoints exactly as the plan specified — list-then-create, no schema changes, `encodeURIComponent` on `taskId`/`threadId`.
- `PLACEHOLDER_AGENT_PARTICIPANT_ID = "agent-unassigned"` is exported and used both in `WorkTeam.tsx` and tests, matching the architecture's pinning of the literal.
- Layer integrity respected: client-only changes; no server, db, or shared schema diffs.

### Design (positive)
- Inline `[role="status"]`/`[role="alert"]` feedback region implemented in the same DOM slot per architecture R2 decision. Tests verify both states.
- All five intents from the closed vocabulary table are present and rendered as a `role="radiogroup"`.
- `aria-modal="true"`, `aria-labelledby="task-sheet-title"`, ESC handler, close button — present.
- `min-h-[44px]` on intent rows (AQ-015 touch targets).
- TaskSheet has `.stories.tsx` covering Closed / OpenNoIntent / OpenWithIntent / Submitting / ErrorState.
- `aria-disabled` mirrors `disabled` on `Send request` (defensive, per design).

### Security (positive)
- `crypto.randomUUID()` mints `clientKey` once per Send click; `task-threads.service.test.ts:164-187` verifies the same key is forwarded on retry (server-side dedup contract).
- `submitting` flag disables the Send button between click and response (belt-and-braces against double-submit on that path).
- `encodeURIComponent` applied to `taskId` (list URL) and `threadId` (post URL).
- Note text is sent verbatim as `payload.text`; rendering-layer escaping is the documented trust boundary, asserted by test (e) at `task-threads.service.test.ts:189-202`.
- No new endpoints, no new auth surface — risk model bounded as architecture's Security & abuse-cases section enumerates.

### Adversarial (negative)
- **Open thread is not disabled during `submitting`.** A user can click `Open thread` after clicking `Send request` but before the response lands; the sheet kicks off a second `resolveThreadId` and navigates away mid-request. The Send-request status is lost. (See `TaskSheet.tsx:184-191`.) MED.
- **No focus trap.** `<div role="dialog">` is a hand-rolled element, not a `<dialog>` and not a DaisyUI `modal`. Tab key escapes the sheet into the underlying Kanban. Architecture/design promised "Focus trap inside the sheet (DaisyUI modal primitive handles this)" — this is not implemented. HIGH (a11y regression vs. design contract).
- **No focus restoration to the originating task card on close.** Design's keyboard navigation section explicitly promised "ESC closes the sheet and returns focus to the originating task card (focus restoration via useRef of the trigger; standard React pattern)." After closing, focus lands on `<body>`. MED.
- **No initial focus into the sheet on open.** Screen-reader users opening via Enter/Space on a card see the sheet appear but focus does not move into it. MED.
- **No backdrop / no click-outside-to-close.** A `role="dialog" aria-modal="true"` overlay with no scrim and no click-outside is unusual; the underlying Kanban remains clickable. The mobile design explicitly mentions "tap backdrop" as a dismiss path; that path doesn't exist. MED.
- **Mobile bottom-sheet contract not honoured.** Design specified bottom-sheet on small viewports (`inset-x-0 bottom-0 max-h-[85vh] rounded-t-[var(--r3)]`). Implementation is `fixed inset-y-0 right-0 ... w-full max-w-[360px]` at all viewports — on `<= 360px` phones it covers the whole viewport from the right side, and the radius / inset contract is broken. No responsive variant. MED.

### Simplification (negative)
- `WorkTeam.tsx:154-164` defines two `useCallback` wrappers (`handleResolveThreadId`, `handlePostRequest`) that only forward to the service helpers — the service functions have stable identity, so wrapping them in `useCallback` adds no memoization benefit. Inlining `(taskId) => resolveOrCreateTaskThread(taskId, FOUNDER_ID, PLACEHOLDER_AGENT_PARTICIPANT_ID)` is fine; wrapping `postRequestMessage` in a callback that re-introduces the same signature is dead complexity. LOW.
- `OpenWithIntent` story (`TaskSheet.stories.tsx:43-56`) is identical to `OpenNoIntent` — the comment admits "stories show a static state." If you can't actually demonstrate the with-intent state in the story, drop the duplicate. LOW.
- `useEffect` cleanup duplication: the open-toggle effect at `TaskSheet.tsx:72-83` clears `closeTimerRef` when the sheet closes; the unmount effect at `:86-92` clears it again on unmount. Both are needed (open-close vs unmount) but a single effect that returns the cleanup would suffice. LOW.

### Slop (negative)
- Comments on `REQUEST_INTENTS` constant: `"SCREAMING_SNAKE_CASE for the const; individual entries are narrowly typed"` is filler — the const name explains itself. LOW.
- `Kanban.tsx:34-46` has three @lore comments stacked — the I4 cross-cutting note and the L15 note are useful; the inline `// @lore K11: column gap → --density-gap` at `:122` is fine. The two-paragraph `STATE_TO_COLUMN` comment block could be tightened. LOW.
- `WorkTeam.task-request.test.tsx:91-94` has a 4-line comment explaining the `[role="status"]` collision with `EmptyState` and Canvas DnD live region — that's a real lore-worthy explanation, not slop. Keep.
- `TaskSheet.tsx:108`: `if (!(task && open))` is a slightly awkward double-negative; `if (!task || !open)` reads clearer. NIT.

## Findings to fix
| ID | Severity | File:line | Issue | Required action |
|---|---|---|---|---|
| F1 | HIGH | `packages/web/src/shell/TaskSheet.tsx:154-260` | Hand-rolled `role="dialog"` with no focus trap, no initial focus, no focus restoration. Design contract (`design/approved.md` §Accessibility + §Keyboard navigation) explicitly promised focus trap and ESC-restore-to-trigger. | Implement focus management: (a) on open, move focus to the close button (or the dialog itself with `tabIndex={-1}`); (b) trap Tab/Shift+Tab inside the dialog; (c) on close (any path), restore focus to the originating element (pass a `triggerRef` prop or use `document.activeElement` snapshot). Add at least one Vitest case asserting focus is inside the dialog after open. Either use a focus-trap utility or implement a minimal `firstFocusable`/`lastFocusable` cycle handler. |
| F2 | MED | `packages/web/e2e/L15-task-request.spec.ts:194-215` | AC literal: "Playwright e2e: ... request a state change → message appears in the task's thread." The spec stops at "Sent." inline feedback and never asserts the message renders in the thread surface. Architecture step 7 ("Navigate to /conversations/chat, select the task's thread, assert the request text is the latest message") is missing. | Add a step that, after the sheet closes, navigates to `/conversations/chat?thread=<TASK_THREAD_ID>` (with the chat-detail endpoint mocked to return the posted message) and asserts the message text "Request: move to BLOCKED." appears. The mock helpers `makeThreadDetailResponse` and `makePostMessageResponse` already exist — wire them. |
| F3 | MED | `packages/web/src/shell/TaskSheet.tsx:155-159` | Mobile responsive contract broken: design specified bottom-sheet at small viewports (`inset-x-0 bottom-0 max-h-[85vh] rounded-t-[var(--r3)]`); implementation hard-codes `inset-y-0 right-0 max-w-[360px]` at all breakpoints. | Add Tailwind responsive utilities: e.g. `inset-x-0 bottom-0 max-h-[85vh] rounded-t-[var(--r3)] sm:inset-y-0 sm:right-0 sm:bottom-auto sm:left-auto sm:max-w-[360px] sm:rounded-none`. Add a Vitest assertion that the dialog has the bottom-sheet classes; or document explicitly in the design doc that the bottom-sheet was deferred. |
| F4 | MED | `packages/web/src/shell/TaskSheet.tsx:184-191` | `Open thread` button is not disabled while `submitting` is true. Allows the user to fire `resolveThreadId` and navigate away mid-Send-request. | Add `disabled={submitting}` on the `Open thread` button at `:186-191`. |
| F5 | LOW | `packages/web/src/pages/WorkTeam.tsx:154-164` | `useCallback` wrappers around stable service functions are no-op memoizations. | Inline or simplify; not a blocker. |
| F6 | LOW | `packages/web/src/shell/TaskSheet.stories.tsx:43-56` | `OpenWithIntent` is a duplicate of `OpenNoIntent`. | Either lift `selectedIntent` into a story-state wrapper or delete the duplicate story. |

## Verdict rationale

**NOT DONE.** F1 is a HIGH a11y regression: the design and architecture explicitly promised focus trap and focus restoration via the DaisyUI modal primitive, and the implementation rolled its own dialog without either. This is a published design contract for the Sheet, not a nice-to-have, and there is no test guarding it. F2 + F3 + F4 are MED gaps versus the literal AC + design promises (e2e end-state, mobile bottom-sheet, submitting-blocks-open-thread). All ACs at the spec-text level pass except the e2e "message appears in the thread" step. Verify is green; structural drag removal is complete and correct; security posture is sound. Once F1 is addressed (with a regression test) the review can flip to DONE — F2-F4 are remaining items to fix in the Phase 4 fix loop or to triage as L15 follow-ups.
