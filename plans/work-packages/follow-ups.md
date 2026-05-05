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

## L13 — UNIQUE(teams.product_id) to schema-enforce 1:1

- **Origin:** L13 architecture (Phase 1) + Phase 2 architecture-critique (required
  item #2: the follow-up commitment must exist as a row here, not only as prose
  in the architecture doc).
- **Issue:** L13 locks the `Product = Team` invariant at 1:1 (concept §1) but
  enforces the cardinality at the application layer only — via the
  `loadProductTeam(db, productId)` helper that throws `500` if the team for a
  product is missing OR if more than one team row exists for the product. The
  schema does NOT today carry a `UNIQUE` constraint on `teams.product_id`, so
  the second branch (multiple teams) is a real failure mode any seed bug,
  test-fixture bug, or future migration could trigger. The application-layer
  guard catches it but does not prevent it.
- **Reference:** `packages/db/src/schema.ts` (`teams` table), `plans/L13/architecture.md`
  §"Server logic notes" → "1:1 invariant enforcement", §"Risk: 1:1 invariant
  violation in seed/test data".
- **Fix:** add a one-line Drizzle migration that creates `CREATE UNIQUE INDEX
  teams_product_id_unique ON teams(product_id)`. The migration must run on both
  the SQLite (`schema.ts`) and PostgreSQL (`schema.pg.ts`) variants. Lifts the
  invariant from convention to schema; makes the `length > 1` branch in
  `loadProductTeam` unreachable (the helper can keep throwing for safety, but
  no live row could ever trigger it).
- **Owner:** TBD — small migration; can land in a maintenance PR or alongside
  the next product/team area touch (e.g. when product-rename or team-roster
  edits get added).
- **Status:** open.
