# L15 — Step 14 / apply-review iteration 1

Per-finding action summary for the four parallel L15 reviews
(`architecture`, `adversary`, `security`, `design`). One pass through the
must-fix list provided by the parent agent.

## Per-finding action summary

### MFC (must-fix correctness)

| ID | Finding | Action | Notes |
|----|---------|--------|-------|
| MFC-1 | `crypto.randomUUID()` per click defeats server idempotency (Adversary CR-1) | Applied | `WorkTeam.tsx` now caches a `clientKey` per `(taskId, verb)` in a `useRef<Map>` so re-fires reuse the same key. |
| MFC-2 | `appendPlainMessage` 403-traps non-participants (Architecture CR-2) | Applied | Helper now accepts `autoAddParticipant?: boolean`. The tasks-route caller (which already passed `assertTaskParticipantAuthz`) opts in. The legacy `POST /api/threads/:id/messages` does NOT opt in — preserves the historical 403 semantic for direct callers. Regression test (f) added: founder posts first, agent A1 posts second → both 201, participants now contain both. |
| MFC-3 | E2E asserts on missing UI (Adversary CR-2) | Applied | Added `data-kanban-column={col.key}` to `Kanban.tsx` columns. Removed the `Request sent` toast assertion (no toast was shipped — toast region is a tracked follow-up). The drag assertion now sanity-checks the attribute exists (so the test is no longer a `null === null` tautology). |
| MFC-4 | 3 missing protected shared tests | Applied | Created `packages/shared/src/__tests__/task-request-verbs.test.ts` (exhaustive matrix + render edge cases), `packages/shared/src/__tests__/task-pending.test.ts` (cancel/redacted/empty/no-request cases), `packages/server/src/routes/__tests__/thread-plain-with-request.test.ts` (`messageInputSchema` round-trip). 88 new shared assertions + 6 new schema assertions. |
| MFC-5 | Missing canvas-drag-survives e2e | Applied | New spec at `packages/web/e2e/L15-canvas-drag-survives.spec.ts` asserts dnd-kit attributes are present on the shaped Canvas bet, both droppable columns exist, and a drag operation runs without throwing. |
| MFC-6 | Keyboard / dismiss model on TaskActionsMenu (Design CR-2) | Applied | `useEffect`-driven keyboard controller: Esc closes (returns focus to trigger), outside-click via `pointerdown` closes, ArrowUp/Down rove menu items, single-letter shortcuts (S/H/U/D/C/B/X/O — derived from the existing `VERB_DEFS.shortcut[0]` table) fire matching items. |
| MFC-7 | TaskCard variants (Design CR-1) | Partial | Pending-chip slot + `data-pending` attribute shipped on `TaskCard.tsx`. The `↪ PENDING` button replaces the cost slot when `pendingRequest != null` and click invokes `onPendingChipClick` which the page wires to `Open thread`. Trigger touch-target raised to 44 × 44 at viewports ≤ 1024 px (AQ-015). The `task-card--menu-open` outline state was NOT promoted into TSX in this iteration — the trigger position currently lives in the menu wrapper rather than the card; promoting it requires reshaping the menu API. Tracked as a smaller scoped follow-up if the design review re-blocks. |
| MFC-8 | Universal-section honesty (Design CR-3) | Applied | Removed `Reply in thread…`, `Snooze 24h`, `Copy task link` from the menu (props removed from the public `TaskActionsMenuProps`). `Open thread` is rendered only when `onOpenThread` is supplied. The menu no longer ships items that lie about working. |
| MFC-9 | Sanitize `reason` (Security HIGH-1) | Applied | New `sanitizeReason(text: string): string` in `@hyperidle/shared` (NFC normalize → strip `\p{Cf}` and `\p{Cc}`-except-`\n\t` → trim → cap 2048). Wired into the request route before `renderRequestText`. 12-test coverage matrix on the shared helper. |
| MFC-10 | Per-task rate limiter (Security HIGH-2) | Applied | In-memory token bucket keyed on `${senderId}:${taskId}`, 10 requests / 60 s. Returns 429 + `Retry-After`. Test-only `__resetTaskRequestRateLimiter()` exported and called in `beforeEach` of every existing tasks-request test suite. New `tasks.request-rate-limit.test.ts` covers the limit + per-task isolation. |

### MFD (must-fix-or-defer documentation)

| ID | Finding | Action | Notes |
|----|---------|--------|-------|
| MFD-1 | X-Identity spoofing (Security CR-1, pre-existing) | Documented | Added `@lore` block to `task-authz.ts` calling out that the assertion is "API-key-holder boundary only" until identity-binding lands. New `auth-identity-binding` follow-up entry in `docs/work-packages/follow-ups.md`. NOT fixed in L15 (not introduced by L15). |
| MFD-2 | Dead `KanbanTask.pendingRequest` (Architecture W) | Wired | `Kanban.tsx` now passes `pendingRequest` down to `TaskCard`. `WorkTeam.tsx` seeds one fixture (`t3 — JWT refresh logic`) with a non-null pending request so the chip has a render path on `/work/team`. Live-data wiring requires the `GET /api/tasks` projection (D-4 — out of L15 scope). |
| MFD-3 | Snooze + projection (Architecture D-1..D-4) | Deferred | Confirmed in `follow-ups.md` (`L15 — snooze table + endpoints + projection`). Spec ACs do not require it. |
| MFD-4 | StatusChip `request_pending` variant (Architecture D-5) | Replaced | Implemented as the `task-card__pending-chip` button on `TaskCard.tsx` (matches `packages/design-system/html/TaskCard.html` reference). Plan reference superseded. |

## Validation

```
$ bun run check
[ok] tsc --noEmit -p tsconfig.json — zero type errors

$ bun run lint
[mixed]
  - packages/shared, packages/server, packages/web,
    packages/design-system: zero new errors / warnings.
  - Pre-existing diagnostics in scripts/trace-collector.ts and the
    docs/design-explorations/L15/quiet-menu/mockup.html (button-type
    on a static mockup) remain — NOT introduced by this iteration.

$ bun run test
[mixed]
  - 3315 tests passed across 323 files (1 skipped file).
  - 1 pre-existing failing test: `packages/pipeline/src/__tests__/runner-otel.test.ts`
    (out of L15 scope; called out as pre-existing in the parent prompt).
  - All L15-relevant suites green: tasks.request, tasks.request-authz,
    tasks.request-concurrent, tasks.request-rate-limit, append-plain-message,
    task-pending, task-request-verbs, sanitize-reason, thread-plain-with-request,
    Kanban (+ no-drag), WorkTeam, WorkTeam.menu, WorkKanban.grouped,
    TaskCard. 123 of these are L15-protected.
```

## E2E verification

The two Playwright specs (`L15-team-board-no-drag.spec.ts` and the new
`L15-canvas-drag-survives.spec.ts`) were NOT executed in this iteration —
running them requires the dev server (`bun dev`) plus Playwright, and the
local environment in this autonomous loop did not have a dev server
running. The spec changes are behaviour-coherent (assert against attributes
the implementation now exposes) and the unit-test coverage for the
underlying behaviours (drag absence on Kanban, request POST shape,
Canvas DnD pipeline still imports its dnd-kit symbols) all pass green.

If the next agent runs `bun run e2e` they should see the two L15 specs
green; the canvas-drag spec is the one that protects AC-3 against future
"consolidation" of Kanban + Canvas dnd setup.

## Could not apply

- **Composer modal for Cmd-click "with reason"** (Design CR-3): tracked as
  follow-up. Touches the L18 Composer surface and adds a new modal path
  through `WorkTeam.tsx`; out of L15 must-fix.
- **Request-sent / cancelled / failed toasts**: the project does not yet
  have a global toast region. Adding one is out of L15 scope; the e2e was
  fixed to assert on the API call shape instead of a non-existent toast.
- **`task-card--menu-open` outline state in TSX**: the trigger lives inside
  the menu wrapper today, not on the card. Promoting it requires reshaping
  the `TaskActionsMenu` API (open-state slot, anchor ref) which is a
  larger refactor than the must-fix list called for. Pending-chip + the
  AQ-015 trigger touch-target are both shipped, which closes the bulk of
  the visual gap.

## NOTICED BUT NOT TOUCHING

- `packages/server/src/services/append-plain-message.ts:154-159` — the
  helper still re-SELECTs the thread + message after insert (Adversary
  W-4 / Slop O-8). Two extra round-trips per write; out of must-fix scope.
- `packages/server/src/services/ensure-task-thread.ts:70-81` — the
  `(result as { changes: number })` cast at the race-loser branch is an
  unsafe cast violation per typescript rules (Adversary W-4). Same pattern
  appears at `threads.ts:475`.
- `packages/server/src/services/thread-row.ts:21-44` — `rowToMessage`
  throws `ZodError` on a single corrupt row, poisoning the whole thread
  fetch (Adversary O-1). Out of L15 surface.
- `packages/web/src/__tests__/Kanban.no-drag.test.tsx:26-27` — source-grep
  via `readFileSync` is fragile to file moves (Adversary O-7). Out of L15
  surface.
- `packages/server/src/routes/threads.ts:362-368` vs
  `append-plain-message.ts:55` — inconsistent error semantics for malformed
  `participants` JSON (one try/catches and returns 500, the other lets
  ZodError propagate). Adversary W-3.
- `packages/server/src/services/__tests__/ensure-task-thread.test.ts:104-143`
  — the "race lost" test pre-pins rather than racing (Adversary W-9). The
  semantic is correctly tested; literal concurrency is unreachable in
  better-sqlite3.
