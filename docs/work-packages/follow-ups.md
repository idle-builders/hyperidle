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

## L15 — Per-item danger styling for "Request: Kill" (from Adversary W1)

- **Origin:** L15 adversary review W1; plan §12 A3.
- **Issue:** plan called for `text-[var(--danger)]` + divider above the
  "Request: Kill" menu item. `BlockActionsPopover` does not currently
  expose a per-item color/danger flag or a divider primitive; adding
  styling-on-item would either bypass the popover (one-off in
  TaskActionsMenu, breaking visual consistency with other DS popovers)
  or expand the design-system contract.
- **Reference:** `packages/design-system/src/BlockActionsPopover.tsx`,
  `packages/web/src/components/TaskActionsMenu.tsx` REQUESTABLE_STATES.
- **Owner:** design-system follow-up — add `danger?: boolean` and an
  optional divider/group separator to `BlockAction` once a second consumer
  needs the same affordance.
- **Status:** open.

## L15 — task-thread server-side uniqueness on (host_kind, host_id) (from Adversary C5)

- **Origin:** L15 adversary review C5.
- **Issue:** `findOrCreateTaskThread` is read-then-write. The web client
  coalesces concurrent calls per-task in a single Map, but two browser
  tabs (or the next mobile client) could still race and create duplicate
  threads. The server has no `(host_kind, host_id)` uniqueness constraint.
- **Reference:** `packages/web/src/services/task-thread-client.ts` @lore
  C5; `packages/server/src/routes/threads.ts` POST handler.
- **Owner:** auth-middleware story (post-L15) — add a unique index on
  `threads(host_kind, host_id)` for the kinds where one-thread-per-host
  is the intended invariant (task, knowledge), then collapse the create
  path into ON CONFLICT DO NOTHING + RETURNING.
- **Status:** open.

## L15 — Outbound calls bypass `useRecoveryFetch` until the auth context lands

- **Origin:** L15 review C3 (followed up).
- **Issue:** `task-thread-client` is wrapped via the new
  `hooks/actor-fetch.ts` helper, which sets `X-Identity` from
  `DEFAULT_ACTOR_ID = "u-founder"`. This is the same default the server
  falls back to. When the auth-middleware story lands, the actor id MUST
  come from the resolved identity, not a constant.
- **Reference:** `packages/web/src/hooks/actor-fetch.ts`,
  `packages/web/src/components/TaskActionsMenu.tsx`.
- **Owner:** auth-middleware story — replace `DEFAULT_ACTOR_ID` with a
  React-context resolver and update `defaultClient` construction in
  TaskActionsMenu to read it.
- **Status:** open.

## L15 — Mock task ids collide cross-session (from Adversary W10)

- **Origin:** L15 adversary review W10.
- **Issue:** WorkTeam fixtures use mock task ids (t1..t5). Threads created
  for these ids accumulate cross-session/cross-developer in any shared
  database. Either gate `TaskActionsMenu` behind a real-id pattern, or
  seed fixtures with a session prefix (`session-<rand>-t1`).
- **Reference:** `packages/web/src/pages/WorkTeam.tsx` INITIAL_TASKS.
- **Owner:** L18 (real task ids land) — at that point the mock fixtures
  go away entirely. Until then the lore is documented in
  TaskActionsMenu.tsx.
- **Status:** open.
