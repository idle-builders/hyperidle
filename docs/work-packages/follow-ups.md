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

## auth-identity-binding (NEVER-tier; pre-existing)

- **Origin:** L15 security review CRITICAL-1 (re-affirmed L15 review iteration 1).
- **Issue:** The `X-Identity` header is read directly from the HTTP request
  without binding to the API key. Any holder of `HYPERIDLE_API_KEY` can
  assert any identity (including `u-founder`), bypassing every task-scoped
  authz chokepoint. This pre-dates L15 — but L15 widens the blast radius
  by giving every authenticated client a write path into any task's thread.
- **Reference:** `packages/server/src/middleware/auth.ts`,
  `packages/server/src/services/task-authz.ts` (`@lore` updated to call
  out the gap).
- **Owner:** auth-middleware story on TRACK-L. The middleware MUST either
  bind a single identity to each API key, or sign `X-Identity` with an
  HMAC the server verifies before reading.
- **Status:** open. Until landed, treat L15 endpoints as
  `single-principal-dev-only` per the security review verdict.

---

## L15 — snooze table + endpoints + projection (deferred plan items D-1..D-6)

- **Origin:** L15 plan §§ 5.1-5.7 (snooze table + endpoints + event +
  GET-projection); re-confirmed in L15 review iteration 1 (architecture
  review D-1..D-4).
- **Issue:** The L15 plan over-promised relative to the spec ACs. The
  spec only requires (a) drag removal, (b) request affordance, (c) Canvas
  drag survives. Snooze, the `task_snoozed` event, the `task_snoozes`
  table, the `GET /api/tasks` `pendingRequest` + `snoozedUntil` projection
  were all plan-level extensions that did NOT ship.
- **Reference:** `docs/work-packages/L15-plan.md` §§ 5.1, 5.2, 5.5, 5.6,
  5.7.
- **Owner:** TBD — pick up when the team-board view needs server-driven
  pending-state OR snooze-from-board affordances. Until then, the L15
  baseline page (`packages/web/src/pages/WorkTeam.tsx`) seeds a demo
  pending-request fixture so the chip variant has a render path.
- **Status:** deferred (spec ACs all met without it).

---

## L15 — request-sent toast + Composer modal (Cmd-click "with reason")

- **Origin:** L15 design review CRITICAL-2 / CRITICAL-3.
- **Issue:** No toast region renders the `Request sent — agent will respond.`
  copy from approved.md § 8. No Composer modal opens on Cmd/Alt-click of
  a verb. The `reason` plumbing exists end-to-end (server schema accepts
  it, `sanitizeReason` runs, `renderRequestText` honors it) — only the UI
  surface is missing.
- **Reference:** `packages/design-system/src/TaskActionsMenu.tsx`,
  `packages/web/src/pages/WorkTeam.tsx`.
- **Owner:** L18 (Composer modal lands as part of the thread surface);
  the toast region should land alongside or as a small follow-up in the
  L15.x window.
- **Status:** open.

