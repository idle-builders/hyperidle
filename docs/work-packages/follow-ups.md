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
