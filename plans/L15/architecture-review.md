# L15 — Architecture Review (Implementation)

Read-only review of the L15 diff against `plans/L15/architecture.md`,
`plans/L15/design/approved.md`, `plans/L15/scans-applied.md`, and
`plans/work-packages/TRACK-L.md` § L15.

Verdict: **PASS with minor issues**. All ten review checks pass. Layer
integrity, contracts, schema, naming, optimistic-prohibition, and protected
tests all match the plan. Two MEDIUM findings (file location of the kebab
unit tests and one open-thread degenerate route), four LOW findings (story
deltas + minor naming nits + spec cosmetic gap). No blockers.

## Findings

### A1 — Kebab + title-row + optimistic-prohibition tests live in `packages/web` instead of `packages/design-system`
- File: `packages/web/src/__tests__/TaskCard.kebab.test.tsx`, `packages/web/src/__tests__/TaskCard.title-row.test.tsx`, `packages/web/src/__tests__/TaskCard.optimistic-prohibition.test.tsx`
- Issue: Plan §6 tasks #7 / #8 / #9 specified these tests under `packages/design-system/src/__tests__/`. They were instead placed in `packages/web/src/__tests__/`. The protected-tests YAML in plan §9 lists `packages/design-system/src/__tests__/TaskCard.optimistic-prohibition.test.tsx` — the DoD audit will not find it at that path. Behavioural coverage is intact (tests exist and import `TaskCard` from the package barrel), but the protected-test path drift is real and will silently dodge any DoD `git diff --name-only` check that pins the design-system path.
- Severity: medium
- Suggested fix: Move all three files to `packages/design-system/src/__tests__/` (their natural owner — they only exercise the design-system component) OR update `plans/L15/dod.md` + plan §9 protected-tests YAML to reflect the actual web-side paths. Prefer the move: a unit test that doesn't import any web shell concern belongs in the package whose component it tests.

### A2 — `handleOpenThread` falls through to `/conversations/review?id=` (empty id) when the task has no thread yet
- File: `packages/web/src/pages/WorkTeam.tsx:174-190`
- Issue: Plan §3.6 says the "Open thread" row navigates to `/conversations/review?id=<threadId>`. For a task with no thread yet, the implementation navigates to `/conversations/review?id=` (empty id). Approved.md §5 row "Populated, no thread" says: `Open thread row present; on activation, creates the thread server-side then navigates`. The current code does not create the thread on Open-thread — it routes to a stub query and relies on the conversations review surface to render an empty state. Comment in the source acknowledges this. This is a behaviour gap vs. approved.md §5 (Open thread should bootstrap a new thread when none exists), and the empty-id route is also a fragile contract for `ConversationsReview` (404 likely). The `WorkTeam.open-thread.test.tsx` test only asserts the navigate call, not a bootstrap.
- Severity: medium
- Suggested fix: Either (a) on Open-thread with no thread, run the lazy-bootstrap path (POST /api/threads with an `initialMessage` that is a synthetic "thread opened" message — but approved.md doesn't specify this copy, so this needs designer input) OR (b) explicitly hide the "Open thread" menu row when `task.threadUnreadCount === undefined` (i.e. no thread exists) and document the gap as L18's responsibility. Option (b) is the smallest, most plan-aligned fix and matches approved.md §5 row "Populated, no thread" — the row is "present" in the menu but its activation behaviour can be deferred to L18 by hiding it when there's no thread; the kebab still surfaces request verbs for a thread-less task. Flag for designer call.

### A3 — Approved.md §10 mandates "no `draggable` attribute on the DOM" — not asserted in tests
- File: `packages/web/e2e/kanban-drag-noop.spec.ts`, `packages/web/src/shell/__tests__/Kanban.no-dnd.test.ts`
- Issue: Approved.md §10 explicitly states "No `draggable` attribute on the DOM. (Browsers will not initiate HTML5 drag.)" The Playwright spec drag-no-ops by *behaviour* (column ancestor unchanged), not by *absence of attribute*. The Vitest source-text guard also doesn't assert the absence of `draggable={true}` or HTML5 drag events. A future regression where someone adds `draggable={true}` to TaskCard would not be caught by the no-dnd guard if they did not import @dnd-kit. The approved-design constraint is unverified.
- Severity: low
- Suggested fix: Add a Vitest assertion in `Kanban.no-dnd.test.ts` (or a new TaskCard test) that renders the card and asserts `draggable` attribute is absent on every card-rooted element.

### A4 — `getRequestableVerbRows("hold")` returns only `["resume"]`-style entries, not the documented Pause/Mark-blocked/etc. matrix
- File: `packages/shared/src/task-request.ts:80,85`
- Issue: Approved.md §4.1 documents the matrix only for `proposed/accepted (Planned)`, `in_progress`, `review`, `blocked`, `done`. The implementation extends to `hold` (six verbs) and `killed` (one verb, `reopen`). The `hold` verb list includes `resume` first which is consistent with the spec's spirit. **However** `killed` returning only `["reopen"]` does not include `kill` itself (so the danger-row renderer has nothing to show for killed tasks). This is fine semantically (you can't kill a killed task) but the test `getRequestableVerbRows ... covers every TaskState` skips `hold` and `killed` in the "renders rows for every defined verb" assertion, which masks the asymmetry. Spec did not specify `hold`/`killed` matrices — this was filled by the implementer.
- Severity: low
- Suggested fix: Document the inferred matrix for `hold` and `killed` in approved.md (or move the inference into a comment in `task-request.ts` with a "filled by implementer; unblocked by spec ambiguity" note) so future refactors know these rows are not load-bearing on a designer decision.

### A5 — `ORDER_BY_STATE.done` includes disabled `pause/mark_blocked/push_to_review/mark_done` rows that the spec said are simply hidden
- File: `packages/shared/src/task-request.ts:84,99`
- Issue: Approved.md §4.1 row `done` says "Reopen | (others disabled)" — readable as "reopen + the other verbs greyed". The implementation renders six rows (reopen + the four greyed + kill). Matches the "full set always visible" rule from the same §4.1 paragraph. Consistent. Not a defect, but worth flagging that the spec's terse "(others disabled)" was interpreted as "render five rows greyed" — correct interpretation, but I verify here because the unit test only asserts four `disabled: true` flags out of five.
- Severity: low
- Suggested fix: None — flagging for the record. The implementation is the more-defensive read.

### A6 — `WorkTeam.tsx` `handleAddToCanvas` and `handleMoveBet` mocks live next to the new request handler — out-of-scope but expanding the page surface
- File: `packages/web/src/pages/WorkTeam.tsx:157-172`
- Issue: These are pre-existing no-op mocks (covered by `@lore` blocks). L15 did not introduce them, but their presence next to `handleRequestStateChange` makes the page handle four concerns: Canvas mock, Pitch mock, Open-thread, Request. Not a violation. Slop scan S9 already addressed `@lore` annotations. No action.
- Severity: low
- Suggested fix: None.

### A7 — `Kanban.props.test.tsx` only checks the `@ts-expect-error` line at compile time; runtime test for `onMoveTask` rejection is absent
- File: `packages/web/src/shell/__tests__/Kanban.props.test.tsx:33-37`
- Issue: The compile-time guard works (TypeScript will fail if `onMoveTask` is added back to `KanbanProps`). But there is no runtime test that the prop being passed in via untyped JS (e.g. by a JS consumer) is *ignored*. Acceptable — the source-text guard `Kanban.no-dnd.test.ts` covers the regex-level prevention at the consumer surface.
- Severity: low
- Suggested fix: None.

### A8 — `kanban-request-verb.spec.ts` does not assert "StatusChip is unchanged"
- File: `packages/web/e2e/kanban-request-verb.spec.ts:18-66`
- Issue: Plan §1 row 4 says the Playwright spec asserts "(c) toast `Request posted to thread` appears" AND the StatusChip text is unchanged on the card. The current spec only asserts the toast text. Optimistic-prohibition is verified at the Vitest layer (`TaskCard.optimistic-prohibition.test.tsx`, `WorkTeam.request-post.test.tsx`) but the e2e gate misses it. Defence in depth is reduced.
- Severity: low
- Suggested fix: Append two assertions — capture the StatusChip text on the first card before the kebab click, then re-assert the same text after the toast appears.

### A9 — `participants` field on bootstrap is hardcoded to `["u-founder"]` only — task agent missing
- File: `packages/web/src/pages/WorkTeam.tsx:227`
- Issue: Plan §4.2 acknowledges this gap and tracks it under follow-up `task-thread-agent-participant`. The implementation matches the plan verbatim. No defect — just confirming the documented limitation is preserved end-to-end.
- Severity: low
- Suggested fix: None.

### A10 — F1 collapse: render-state preservation verified; spec wording in plan §3.2 still references `threadExists`
- File: `packages/design-system/src/TaskCard.tsx:23-26`, `plans/L15/architecture.md:131`
- Issue: scans-applied F1 collapsed `threadExists` into `threadUnreadCount` (`undefined → no dot`, `0 → grey`, `>0 → primary`). The implementation honours this in TaskCardProps and Kanban + kebab tests cover all three render outcomes (`task-thread-dot` data-attr + three test cases). Plan architecture.md §3.2 still lists `threadExists?: boolean` in the documented prop set — not a code defect, but a doc-vs-code drift that future readers will trip on.
- Severity: low
- Suggested fix: Update `plans/L15/architecture.md` §3.2 to drop `threadExists` and add the three-render-state comment from the implementation, OR add a `> Note: F1 collapse — see scans-applied.md` callout above the prop block.

## Counts

| Severity | Count |
|---|---|
| blocker | 0 |
| high | 0 |
| medium | 2 (A1, A2) |
| low | 8 (A3, A4, A5, A6, A7, A8, A9, A10) |

## Summary

Layer integrity: clean (no agent-runtime imports; server uses existing routes only). API contract: matches `clientKey` field name + regex + length window per `threads-schema.ts:21-22`. Schema: zero changes confirmed via `git diff --stat`. Type contract: `TaskRequestVerb` exported from `@hyperidle/shared` and consumed by web + tests as the single source of truth. Protected tests: `Kanban.no-dnd.test.ts` exists and locks 13 forbidden symbols + `onMoveTask` prop. Canvas: untouched (drag survives only there). Optimistic prohibition: encoded both at type level (no setter exposed) and behavioural test. Naming: helper `getRequestableVerbRows` matches camelCase; type `RequestableVerbRow` matches PascalCase; constant `TASK_REQUEST_VERBS` matches SCREAMING_SNAKE_CASE; file `task-request.ts` matches its primary content. Error paths: try/catch narrowed to fetch only (S1); 2xx-with-malformed-body branch surfaces error toast (S2); JSON parse on non-bootstrap path propagates as a programmer bug (correct).

Two medium findings need follow-up — A1 (test path drift breaks DoD's protected-test pinning) and A2 (Open-thread without an existing thread routes to an empty-id stub which approved.md §5 requires to bootstrap). Neither blocks ship; both should land before pipeline closes L15.
