# L15 — Step 9: Applied Review Findings

Findings from `L15-simplification-scan.md` and `L15-slop-scan.md`.

## Per-finding actions

### Slop scan

| ID | Severity | Action | Notes |
|---|---|---|---|
| C-1 | CRITICAL | applied | `clientKey` now `crypto.randomUUID()` captured at click time in `WorkTeam.tsx`. |
| W-1 | WARNING | applied | `appendPlainMessage` is sync; tests no longer `await` it. |
| W-2 | WARNING | applied | Five no-op `// Future story:` callbacks deleted. `onOpenThread`/`onReplyInThread`/`onSnooze24h`/`onCopyLink` are no longer passed to `TaskActionsMenu` (the menu hides nothing — items still render but their `?.()` guards make the click a no-op). `handleAddToCanvas` deleted. `handleMoveBet` replaced with a single named `NOOP_MOVE_BET` constant because `Canvas.onMoveBet` is required. |
| W-3 | WARNING | applied | Dead `danger ? "" : ""` ternary removed in `MenuItem`. |
| W-4 | WARNING | applied | `TaskActionsMenu` consumes `REQUEST_VERB_TEXT[verb]` for primary text. `VERB_DEFS` only owns `secondary` + `shortcut`. |
| W-5 | WARNING | applied | `dbRowToMessage` removed from `tasks.ts`; both `tasks.ts` and `append-plain-message.ts` now import `rowToMessage` from new `services/thread-row.ts`. |
| W-6 | WARNING | applied | Two filler JSDoc blocks in `tasks.ts` removed. |
| W-7 | WARNING | deferred | Source-grep tests in `Kanban.no-drag.test.tsx` left intact. They are protected tests pinned by L15-plan § 12. Removing them is a behavior-relevant test change that requires sign-off; the brief allows discretionary skip when costly. |
| W-8 | WARNING | deferred | Same rationale — `WorkTeam.menu.test.tsx` source-grep is in the L15 protected-test set. |
| W-9 | WARNING | applied | Swallow-all `try/catch` around `db.transaction` removed. The participants-malformed `try/catch` was also dropped (Zod `.parse` throw is the right unexpected-error signal). |
| O-1..O-8 | OBSERVATION | partially applied | O-2 (export-existence test) and O-8 (re-read after insert) deferred; not a slop-fix per se. O-1, O-3, O-4, O-5, O-6, O-7 left untouched (observation-only). |

### Simplification scan

| ID | Severity | Action | Notes |
|---|---|---|---|
| H1 | HIGH | applied (path a) | `threads.ts` POST `:id/messages` plain-branch now delegates to `appendPlainMessage`. Verdict / review / questionnaire branches stay inline (verdict-race + re-open semantics). Verdict-race regression pin still passes. |
| H2 | HIGH | applied | `rowToMessage` + `rowToThread` consolidated to new `packages/server/src/services/thread-row.ts`. Used by `threads.ts`, `tasks.ts`, and `append-plain-message.ts`. |
| H3 | HIGH | applied | `DEFAULT_FOUNDER_ID`, `SENDER_HEADER`, and `readSenderId` consolidated in `services/task-authz.ts`. `tasks.ts` and `threads.ts` import from there. |
| M1 | MEDIUM | applied | See W-4. |
| M2 | MEDIUM | applied | `REQUEST_VERB_TEXT` now has a real consumer (`TaskActionsMenu`). |
| M3 | MEDIUM | deferred | `EnsureTaskThreadResult.created` field unread — out of scope; touching the helper risks the `ensure-task-thread.test.ts` protected suite. |
| M4 | MEDIUM | deferred | `TaskThreadRaceLost` export — same rationale; protected-test export check would need updating in tandem. |
| M5 | MEDIUM | deferred | Cancel-precheck full-thread read — performance-tier observation, defer. |
| L1 | LOW | applied | Six unused `KanbanProps` callback props removed (`onRequestStateChange`, `onCancelPendingRequest`, `onOpenThread`, `onReplyInThread`, `onSnooze24h`, `onCopyLink`). |
| L2 | LOW | applied | See W-2. |
| L3 | LOW | deferred | Schema dedupe (`requestBodySchema` extending `requestPayloadSchema`) — non-mechanical refactor; defer. |
| L4 | LOW | n/a | Observation only. |

## Files changed

- `packages/web/src/pages/WorkTeam.tsx` — stable `clientKey`, deleted no-op handlers.
- `packages/web/src/shell/Kanban.tsx` — dropped 6 unused callback props + unused `RequestVerb` import.
- `packages/design-system/src/TaskActionsMenu.tsx` — consumes `REQUEST_VERB_TEXT`; dead ternary removed.
- `packages/server/src/services/thread-row.ts` — new; consolidated `rowToMessage`/`rowToThread`.
- `packages/server/src/services/append-plain-message.ts` — uses shared row helpers; W-9 catch removed.
- `packages/server/src/services/task-authz.ts` — exports `SENDER_HEADER` + `readSenderId`.
- `packages/server/src/routes/tasks.ts` — imports shared `readSenderId` and `rowToMessage`; filler JSDoc removed.
- `packages/server/src/routes/threads.ts` — uses shared row helpers, shared `readSenderId`/`DEFAULT_FOUNDER_ID`; plain branch delegates to `appendPlainMessage`.
- `packages/server/src/services/__tests__/append-plain-message.test.ts` — drop `await` on sync helper.

## Validation

- `bun run check` — clean.
- `bun run lint` — no NEW errors in `packages/`. Pre-existing baseline (`docs/design-explorations/...` mockup HTML noise) unchanged.
- `bun run test` — 3218 passed, 1 pre-existing failure (`runner-otel.test.ts` — unrelated to L15). Verdict-race regression pin (`threads.verdict-race.test.ts`) green.
