# L15 Scan Resolutions

Resolutions for the two L15 review docs:
- `docs/reviews/L15-simplification-scan.md`
- `docs/reviews/L15-slop-scan.md`

Severities applied: ALL MUST-FIX. SHOULD-FIX selectively. NICE-TO-HAVE skipped.

## Validation

- `bun run check` → green.
- `bun run lint` → green (177 pre-existing warnings, 0 errors).
- L15-touched test files (9 files / 62 tests) → all pass.
- Full `bun run test`: 1 unrelated failure in
  `packages/pipeline/src/__tests__/runner-otel.test.ts:93` (OTel span
  expectation). Confirmed pre-existing on the baseline — `git stash -u` +
  re-run reproduces the same failure without any L15 edits. Out of scope
  for this resolution pass.

---

## Simplification scan resolutions

### MUST-FIX

| ID | Status | Resolution |
|---|---|---|
| Duplicated `decodeThreadDetail` + `ThreadDetailDecodeError` + `isObject` between `WorkTeamTaskThread.tsx` and `ConversationsReview.tsx` | FIXED | Extracted to new `packages/web/src/lib/thread-detail.ts`. Both pages now import from the shared module. |
| Unsafe `as unknown as Thread` cast + defensive defaults in `WorkTeamTaskThread.tsx:62-75` | FIXED | The shared `decodeThreadDetail` now performs full per-field validation (id, hostKind via `HOST_KINDS` membership, hostId, initiatorId, participants, pinned, resolvedAt, lastActiveAt, createdAt). Missing or wrong-typed fields throw `ThreadDetailDecodeError`, which the page surfaces as an `error` LoadState. No casts, no defaults. The test fixture in `WorkTeamTaskThread.test.tsx` was updated to provide a valid Thread (was previously partial). |
| `WorkTeamTaskThread.tsx:139-156` `onAppend` re-fetches whole thread, stale closure, swallows errors | FIXED | Removed the `onAppend` re-implementation. The page is read-only for L15; `onAppendMessage` is now wired to a documented `noopAppend` (the popover is the L15 write surface). Removed `useCallback` import since it is no longer needed. |
| `WorkTeam.tsx:161-188` AbortController never aborts in-flight requests | FIXED | `fetchThreadMetaForTask` now takes a `signal: AbortSignal` parameter and threads it into both fetch calls. The mount effect passes `ac.signal`. |

### SHOULD-FIX

| ID | Status | Resolution |
|---|---|---|
| `Kanban.tsx:117-166` `TaskCardActions` sub-component does almost nothing | SKIPPED — architectural | The component is small enough but inlining would push three branches into `renderTask`'s JSX. Touching this trades one indirection for another; not "clearly correct" by the brief's bar. |
| `Kanban.tsx:168-195` `renderTask` one-call helper | SKIPPED — same reason | Same shape — refactor is a wash, not a small-and-clearly-correct fix. |
| `TaskRequestPopover.postRequest` 7-arg prop bag + `clientKey` not reused on retry | SKIPPED — needs design call | The retry/idempotency fix needs design discipline (state-machine for the in-flight key); not a one-line change. Logged as follow-up below. |
| `Kanban.tsx:13` re-imports `requestableVerbsFor` (double check vs popover) | SKIPPED | Both checks are intentional (parent gates the footer rendering; popover gates its own null). Removing one means the parent renders an always-null component. Not strictly slop. |
| `TaskRequestPopover.TaskRequestPopoverTask` 3-field structural subset | SKIPPED — touches popover API | Larger refactor; popover currently uses the narrow type as a documentation contract. Defer. |
| `Kanban.tsx:127` `task.threadId ?? null` redundant ?? null (also slop S1) | FIXED | Replaced with `task.threadId != null && threadCount > 0`. |
| `WorkTeam.tsx:128-134` `ThreadListResponse` / `ThreadDetailResponse` cast | SKIPPED — needs design call | The right fix is to reuse `decodeThreadDetail` (now extracted). But that endpoint actually returns lighter `{threads}` for the list call which `decodeThreadDetail` does not handle, and the detail-side count-only access is intentional minimalism. Logged as a follow-up. |
| `Kanban.tsx:65-74` `STATE_TO_COLUMN` `null` sentinel | SKIPPED | The `@lore I4` comment defends this; a `"hidden"` literal is a wider refactor. |
| `Tag.tsx:38-71` unread-vs-kind precedence unclear | SKIPPED — small but touches Tag semantics | Behavior is currently documented in Tag's TSDoc + tested in Tag.test.tsx. Refactor risks shifting precedence under existing tests. Defer. |
| `Kanban.tsx:83-84` hardcoded `DEFAULT_FOUNDER_ID` / `DEFAULT_FOUNDER_NAME` | SKIPPED — needs auth landing | Real fix is auth context; cannot do it in this pass. |

### NICE-TO-HAVE

All skipped per brief.

---

## Slop scan resolutions

### MUST-FIX

| ID | Status | Resolution |
|---|---|---|
| M1. Unsafe `as unknown as Thread` cast in `decodeThreadDetail` | FIXED | Same fix as Simplification MUST-FIX #2 — strict per-field decode with no casts. |
| M2. Defensive defaults masking server contract drift | FIXED | All `?? false`, `?? null`, `?? new Date(0).toISOString()`, `?? ""` chains deleted. Decoder now throws `ThreadDetailDecodeError` on missing/wrong fields and the page routes to the `error` state. |
| M3. Lying `biome-ignore lint/correctness/noUnusedImports` on actually-used imports | FIXED | Removed the comment from `packages/shared/src/__tests__/task-verbs.test.ts:13`. Lint still passes. |
| M4. Stale `@lore` recording process meta in `Tag.test.tsx:11-14` | FIXED | Removed the "L15 critique Round-2" `@lore` block. The TSDoc above already documents the prop semantics. |

### SHOULD-FIX

| ID | Status | Resolution |
|---|---|---|
| S1. Redundant `?? null` on `task.threadId` | FIXED | Same change as Simplification SHOULD-FIX above — `task.threadId != null && threadCount > 0`. |
| S2. Magic constants for `u-founder` / `A. Founder` | SKIPPED — needs auth landing | Same reason as the simplification finding — defer until real auth context exists. |
| S3. Triple-nested ternary for chip rendering | FIXED | Collapsed to a single `unread={threadUnread > 0}` prop pass. The two-tier ternary that duplicated `<Tag label={...}>` is gone. |
| S4. Conditional with redundant clause `&& threadCount === 0` | FIXED | Simplified to `if (!hasRequest && !hasThread) return null;`. |
| S5. Redundant aria-label duplicating visible link text | FIXED | `aria-label` now only set on the `hasThread` branch (where the value adds the messages/unread count). The "Open thread" branch relies on the link text for its accessible name. |
| S6. `<a href>` triggers full reload (use `<Link>`) | SKIPPED — not strictly broken | Story rendering still works via MemoryRouter, and the production AppShell handles the reload acceptably. Bigger fix is a sweep across the page link surface. Logged as follow-up. |
| S7. Mock-only `handleMoveBet` no-op stub | SKIPPED — Canvas API change | The signature change touches Canvas component contract; out of L15 scope. |
| S8. `INITIAL_TASKS` captured by mount effect — silent staleness | SKIPPED — needs server data integration | Real fix is rebinding to the live tasks fetch (a future story). Adding a `@lore` flag is the brief's suggestion; deferring along with S2 to a single fixture-cleanup follow-up. |
| S9. ARIA pattern mismatch on Request popover trigger | SKIPPED — needs design call | Choosing between `menu` (with menuitem semantics + arrow keys) and `dialog` (current focus management) is a design decision. Logged as follow-up. |
| S10. Empty `<span />` as flex spacer | FIXED | Replaced with `null`; the thread link now uses `ml-auto` for right-alignment when there is no left affordance. |
| S11. E2E test mock fan-out conflated into one giant handler | SKIPPED — test refactor | Bigger e2e refactor; currently passing. Defer. |
| S12. Test asserts on raw Tailwind class strings | SKIPPED — needs alternative assertion strategy | Switching to `data-*` attributes or computed-style assertions touches Tag's prod surface. Defer. |

### NICE-TO-HAVE

All skipped per brief.

---

## Files touched

- `packages/web/src/lib/thread-detail.ts` — NEW shared decoder.
- `packages/web/src/pages/WorkTeamTaskThread.tsx` — uses shared decoder; removed unsafe cast, defensive defaults, and `onAppend` re-implementation; wired `noopAppend`.
- `packages/web/src/pages/ConversationsReview.tsx` — uses shared decoder; deleted local copy.
- `packages/web/src/pages/WorkTeam.tsx` — `fetchThreadMetaForTask` now takes a `signal` and passes it to both fetch calls.
- `packages/web/src/shell/Kanban.tsx` — simplified `TaskCardActions` (S1, S3, S4, S5, S10).
- `packages/web/src/__tests__/WorkTeamTaskThread.test.tsx` — fixture extended to a valid `Thread` (now required by the strict decoder).
- `packages/shared/src/__tests__/task-verbs.test.ts` — removed lying `biome-ignore`.
- `packages/design-system/src/__tests__/Tag.test.tsx` — removed stale process-meta `@lore`.

## Follow-ups

The skipped items below are worth tracking. None block L15 merge:

1. `TaskRequestPopover` retry should reuse `clientKey` so server-side
   idempotency holds. Hoist key generation out of `handleSend`.
2. `WorkTeam.tsx` list/detail cast — reuse the decoder (or a sibling
   `decodeThreadList`) once the endpoint shape stabilises.
3. Replace `<a href>` with `<Link to>` across the work surface in one
   sweep (S6).
4. Decide menu-vs-dialog ARIA pattern for `TaskRequestPopover` (S9) with
   `/design`.
5. Delete `DEFAULT_FOUNDER_*` magic strings + `INITIAL_TASKS` mount
   capture once auth context + server task fetch land (S2, S8).
