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

## thread-message-rate-limit

- **Origin:** L1 (initial inherited gap), reaffirmed in L15 architecture-critique (2026-05-04).
- **Issue:** `POST /api/threads` and `POST /api/threads/:id/messages` have NO per-sender rate limiting today. A scripted client could flood any thread the sender is a participant of. L15's UX has a client-side 80ms minimum-show floor on the popover, but that is not a security control.
- **Reference:** `packages/server/src/routes/threads.ts:278` (POST /api/threads), `packages/server/src/routes/threads.ts:381` (POST /api/threads/:id/messages).
- **Owner:** middleware story on TRACK-L. Suggested shape: per-sender token bucket, 30 req/min for thread-write routes; 429 with `Retry-After` when exceeded; idempotency replay (same `clientKey`) is exempt.
- **Status:** open.

---

## thread-list-include-message-count

- **Origin:** L15 architecture (2026-05-04).
- **Issue:** `GET /api/threads` returns thread rows but no per-thread `messageCount`. L15 derives the count via N follow-up `GET /api/threads/:id` calls (≤ 25 visible Kanban tasks → ≤ 50 total round-trips). Acceptable today; will not scale past one team's worth of cards.
- **Reference:** L15-plan.md §5.3 "Note on `threadCount`".
- **Owner:** TRACK-L thread-list-projection story (post-L15).
- **Status:** open.

---

## kanban-thread-metadata-batched-endpoint

- **Origin:** L15 architecture (2026-05-04).
- **Issue:** Kanban renders make ≤ 50 sequential REST round-trips for thread metadata (existing thread + message-count fan-out). SLO is ≤ 800ms p95 on local SQLite; if measured production p95 exceeds budget, scope a single batched endpoint `GET /api/threads?host_kind=task&host_id_in=<ids>&include=messageCount`.
- **Reference:** L15-plan.md §5.3.
- **Owner:** TRACK-L (post-L15, gated on production telemetry).
- **Status:** open (deferred-pending-data).

---

## team-scoped-tasks-and-agent-membership

- **Origin:** L15 architecture (2026-05-04). Designer's Q2 premise referenced `/api/teams/:teamId/tasks`; that endpoint does not exist.
- **Issue:** WorkTeam page renders an inline `INITIAL_TASKS` mock with hand-coded `ownerAgentId` strings (`agent-dev-1`, `agent-dev-2`). Real team-scoped task fetching + agent-team membership lookup is not yet wired.
- **Reference:** `packages/web/src/pages/WorkTeam.tsx` `INITIAL_TASKS`; L15-plan.md §5.2.
- **Owner:** post-C5 (process primitives) story on TRACK-L.
- **Status:** open.

---

## kanban-per-user-thread-read-state

- **Origin:** L15 architecture (2026-05-04).
- **Issue:** L1 stores `lastActiveAt` and `hasUnresolvedReview` on threads but no per-user read pointer. The L15 unread-chip data feed is hardcoded to `0` until a per-user read-state pointer table + endpoint ships. The renderer is correct (synthetic-data unit-tested); only the live data is missing.
- **Reference:** L15-plan.md §4 Q2 (option A).
- **Owner:** TRACK-L thread-read-state story.
- **Status:** open.

---

## thread-host-existence-check

- **Origin:** L15 security review (2026-05-04, MUST-3 deferred).
- **Issue:** `POST /api/threads` accepts arbitrary `hostId` for any `hostKind` without validating the host exists. With `hostKind:'task'` an authenticated client could create threads against non-existent task ids, polluting the table. L15 ships the first UI exercising the `task` host kind.
- **Reference:** `packages/server/src/routes/threads.ts:278-378`; `docs/reviews/L15-security-review.md` MUST-3.
- **Owner:** post-L17 (real tasks table) on TRACK-L; until then add a soft existence check via in-memory fixture.
- **Status:** open.

---

## signed-identity-header

- **Origin:** L15 security review (2026-05-04, SHOULD-1).
- **Issue:** `X-Identity` header is unsigned and trusted by the server, allowing impersonation. Inherited from L1; surfaces wider with L15's request-posting affordance.
- **Reference:** `docs/reviews/L15-security-review.md` SHOULD-1.
- **Owner:** TRACK-L security hardening.
- **Status:** open.

---

## agent-side-request-parser-spec

- **Origin:** L15 security review (2026-05-04, NTH-4).
- **Issue:** L15 messages embed `@<actorName> requested: <verb>` as the deterministic line-1 grammar in a `plain` payload. Agents will eventually parse this line. The parser must derive identity from the server-trusted `senderId`, NOT the client-supplied `@<actorName>` in the body.
- **Reference:** `packages/shared/src/task-verbs.ts` `formatRequestMessageBody`.
- **Owner:** Agent layer story that first consumes task-thread requests.
- **Status:** open.

---

## kanban-fan-out-perf-budget

- **Origin:** L15 adversary review (2026-05-04, S1).
- **Issue:** Plan §5.3 commits to ≤ 800ms p95 for the per-task thread-metadata fan-out, but no perf-harness test asserts the budget. A unit-level mock test would not be representative; either ship a Playwright-based perf assertion or wire OpenTelemetry timing on the production endpoint.
- **Reference:** `packages/web/src/pages/WorkTeam.tsx` `fetchThreadMetaForTask`.
- **Owner:** TRACK-L observability.
- **Status:** open.

---

## kanban-thread-chip-density-tokens

- **Origin:** L15 DoD remediation (2026-05-04).
- **Issue:** The Kanban Request trigger + Thread link use inline `style={{ minHeight: 44, minWidth: 44 }}` to satisfy AQ-015 at the mobile viewport because Tailwind responsive variants (`max-lg:`, `[&]:`, `!`) did not reliably override DaisyUI's `.btn-xs` cascade in this stack. Long-term: route through density tokens (`var(--density-row-h)`) and a custom utility class registered in `tailwind.config.ts` so the desktop footer keeps its 28px design spec without ad-hoc inline styles.
- **Reference:** `packages/web/src/shell/Kanban.tsx` `touchTargetStyle`, `packages/web/src/shell/TaskRequestPopover.tsx` `style={…}`.
- **Owner:** TRACK-K (chrome density refactor).
- **Status:** open.
