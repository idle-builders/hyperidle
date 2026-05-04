# Follow-up tracking rows

This file tracks scope-deferred items raised during reviews. Each row points
to the originating story and the story (or track) that should pick it up.

## auth-middleware-participant-scope

- **Origin:** L1a (initial), reaffirmed in L8 review (security HIGH-1, HIGH-2).
- **Issue:** `GET /api/threads?participant_id=<id>` does not verify that
  `participant_id` matches the authenticated identity. Any holder of a
  valid API key can read any other participant's threads (IDOR).
- **Reference:** `packages/server/src/routes/threads.ts` GET handler @lore
  comment.
- **Owner:** auth-middleware story on TRACK-L (post-L8). When the auth
  middleware lands, it MUST reject `participant_id` values that do not
  match the resolved identity.
- **Status:** open.

---

## L10 — Playwright 240 px wrap assertion (from Adversary M5)

- **Origin:** L10 adversary review (M5).
- **Issue:** the Submenu chip-row layout fix (Design C1 / Arch W2) is
  unit-tested via the disabled-chip Vitest suite + the AQ-015 Playwright
  bbox loop, but no Playwright test asserts the four pills sit on a single
  row at 240 px. A regression that reintroduces the Async-wraps bug would
  not fail CI.
- **Reference:** `packages/web/e2e/l10-conversations-filter.spec.ts`,
  `packages/web/src/shell/Submenu.tsx:142–195`.
- **Owner:** L10 follow-up — add a Playwright assertion that the
  `.boundingBox().y` of every chip + the clear button is identical (within
  1 px) at the production Submenu width with `Blocking` / `Async` selected.
- **Status:** open.

## L10 — Per-view filter state refactor (from Slop H4 / Simplification W7)

- **Origin:** L10 slop-scan H4, simplification W7.
- **Issue:** `submenuFilter` lives as a single `SubmenuFilter` shared across
  all views. AppShell narrows to `ConversationsFilter` for the conversations
  view with a defensive coercion. The cleaner shape is per-view filter state
  (or a discriminated union keyed by view) so the impossible-state coercion
  goes away.
- **Reference:** `packages/web/src/layouts/AppShell.tsx:389–398`.
- **Owner:** TBD — small refactor that should land alongside the next
  cross-view filter work (e.g. when Knowledge filter chips become active).
- **Status:** open.

---

## L8 — conversations-submenu E2E fixture rot

- **Origin:** noticed during L10 ship-readiness check (2026-05-02).
- **Issue:** `packages/web/e2e/conversations-submenu.spec.ts` uses
  `NOW_ISO = "2026-04-30T12:00:00.000Z"` and `WITHIN_24H = "2026-04-30T10:00:00.000Z"`
  for its mocked thread fixtures. The `Resolved · 24h` section depends on
  `Date.now()` − `resolvedAt` ≤ 24h. As real time advances past the fixture
  date, the resolved-bucket assertion fails. Confirmed: failing on `main`
  before any L10 commit. **Not an L10 regression.**
- **Reference:** `packages/web/e2e/conversations-submenu.spec.ts:10-11,47-48`.
- **Fix:** replace the hardcoded ISO strings with `Date.now()`-relative
  values (e.g., `new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()`)
  so the fixture stays valid as the clock advances.
- **Owner:** TBD — small fixture fix; can land in a maintenance PR or be
  bundled with the next L8 area touch.
- **Status:** open.

---

## L15-task-list-projection-N+1

- **Origin:** L15 simplification-scan (SF2, SF3).
- **Issue:** `GET /api/tasks` issues two N-style queries per row inside the
  enrichment loop in `packages/server/src/routes/tasks.ts`:
  - One `select * from task_snoozes where userId AND taskId` per task (SF2).
  - One full `select * from messages where threadId order by createdAt`
    per task with a thread, then `rowToMessage` over every row to derive
    `pendingRequest` (SF3).
- **Proposed fix:** Batch each into a single query —
  - SF2: `where(and(eq(userId, ...), inArray(taskId, ids)))` + Map lookup;
    mirrors the existing pattern in `threads.ts:222–239`.
  - SF3: either (a) restrict to `type = 'plain'`, ORDER DESC, LIMIT 1 per
    thread; (b) batch with `inArray(threadId, [...])`; or (c) cache
    `pending_request_message_id` on `tasks` (write-side; only if (a)+(b)
    are insufficient — L15 §2.2 explicitly chose the read-model).
- **Reference:** `packages/server/src/routes/tasks.ts:152-186` (post-L15
  simplification edits).
- **Owner:** TBD — small backend perf story; bundle with next tasks-route
  touch.
- **Status:** open.

---

## L15-composer-modal-and-toast

- **Origin:** L15 design review CRITICAL-4 (Composer modal) + CRITICAL-7
  (toast surface) + WARNING-3 (`Reply in thread…` is a no-op) + WARNING-12
  (Cmd+Enter / Cmd+click for `Request X with reason`).
- **Issue:** approved.md §1 Pull-in 2 mandates a Composer modal for
  `Reply in thread…` and `Request X with reason` flows; approved.md §4
  mandates toast strings on Sent / Sent-with-reason / Reply-sent / Error
  / Cancel-pending. Neither surface ships in L15 — the Reply menu item
  fires a no-op handler and there is no DaisyUI `<dialog>` wired into the
  TaskActionsMenu. The four request-fire / cancel / error events produce
  no user-visible feedback.
- **Reference:** `packages/web/src/pages/WorkTeam.tsx:163-166`,
  `packages/design-system/src/TaskActionsMenu.tsx`.
- **Proposed fix:** wire a DaisyUI `<dialog className="modal">` containing
  a textarea Composer for the two flows, branch `handleKeyDown` on
  `e.metaKey` so Cmd+Enter / Cmd+click open the modal pre-populated for
  the focused verb, and add a DaisyUI `toast` surface with the four locked
  strings. The modal closes the menu when opened; both close on submit.
  Remove the Reply menu's no-op handler once the modal lands.
- **Owner:** next L-track UX story; bundle with the page-level wire-up
  story below.
- **Status:** open.

---

## L15-page-level-thread-routing

- **Origin:** L15 plan §13 deferral + design review WARNING-3 / SF-4 /
  the WorkTeam.tsx `INITIAL_TASKS` mock comment.
- **Issue:** the team-board page renders tasks from a static
  `INITIAL_TASKS` list and `handleOpenThread` writes a hash that resolves
  to no SPA route. The page ships UI affordances that perform no
  observable navigation. The four `void fetch(...)` handlers in
  `WorkTeam.tsx` also drop the `X-Actor-Id` header (eslint
  `design/no-raw-actor-fetch` warnings on lines 133, 143, 169) — they
  should route through a future `useRecoveryFetch` helper once one
  exists, or through a sibling actor-aware hook.
- **Reference:** `packages/web/src/pages/WorkTeam.tsx:127,131-174`.
- **Proposed fix:** (a) replace `INITIAL_TASKS` with a `useFetch` /
  `useTasks` hook against `GET /api/tasks`; (b) wire `handleOpenThread`
  to a real `/work/team/threads/:id` route; (c) introduce a
  `useRecoveryFetch` wrapper that sets `X-Actor-Id` and migrate all four
  team-board fetches to it.
- **Owner:** next team-board UX story.
- **Status:** open.

---

## L15-task-snoozes-board-filter

- **Origin:** L15 adversary review F9.
- **Issue:** plan §2.5 promised `GET /api/tasks` would hide tasks where
  `task_snoozes.user_id = current_user AND snoozed_until > now()`. The
  current projection only attaches the `snoozedUntil` field but does not
  filter — neither the server nor the client implements the hide.
- **Proposed fix:** filter at SQL level (`LEFT JOIN task_snoozes ... AND
  snoozed_until > now()` then `WHERE snoozedUntil IS NULL OR
  ?include_snoozed=true`).
- **Reference:** `packages/server/src/routes/tasks.ts:118-186`.
- **Owner:** server side of the page-level wire-up story above.
- **Status:** open.

---

## L15-auth-middleware-task-scope

- **Origin:** L15 security review SHOULD-FIX-1 (sibling to the
  `auth-middleware-participant-scope` row at the top of this file).
- **Issue:** `GET /api/tasks` has no team-scope authz. Any holder of a
  valid API key sees every task in every team. L15 amplifies the impact
  via the new `pendingRequest` projection (which carries up to 2 KiB of
  free-text `reason`). Mitigation landed for the `reason` field (it is
  stripped for cross-team callers in the L15 fix pass) but the row
  itself is still readable cross-team.
- **Reference:** `packages/server/src/routes/tasks.ts:118-186`.
- **Owner:** auth-middleware track. Do not deploy past single-tenant
  demo until closed.
- **Status:** open.
