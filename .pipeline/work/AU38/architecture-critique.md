# AU38 — architecture-critique, round 1

Reviewer: fresh pipeline-reviewer (read-only). Tree: worktree @ 557cf323 (pre-merge).
Verdict: **BLOCKING** — 1 blocker, fixable without redesign.

## BLOCKING

**B1 — P11 "EXEMPT" classification factually wrong for 9 of 16 createTestDb files.**
Only 7 of 16 are createTestDb-only (`db.integration`, `seed-then-migrate`, `pg-migration`,
`pg-connection`, `AD1-create-item-routing`, `AD1-idor-fix`, `AD1-session-review-routing`).
9 import test-fixtures AND use the shared-pool `{ db }` fixture (go through `checkout()`):
- framework/db/src/__tests__/migration.integration.test.ts:3,16
- layers/core-api/src/__tests__/S1-invite-code.integration.test.ts:18,38
- layers/core-api/src/__tests__/S1-e2e-flow.integration.test.ts:21,119
- layers/core-api/src/__tests__/S1-login-session.integration.test.ts:22,42
- layers/core-api/src/__tests__/S1-auth-middleware.integration.test.ts:21,69
- layers/core-api/src/__tests__/S1-auth-routes.integration.test.ts:19,58
- layers/core-api/src/__tests__/bets.integration.test.ts:3,18
- layers/core-api/src/routes/__tests__/notifications.routes.integration.test.ts:17,61
- layers/core-api/src/routes/__tests__/hints.integration.test.ts:22,82

Contradicts architecture's own §4.3 import-based lint criterion; leaves concrete unplanned
breakage at increment 8 (bets.integration.test.ts:69-78 global-absence ×4;
hints.integration.test.ts:82 `{dismissed: []}`; migration.integration.test.ts:67 CRUD).

Derived false claims:
1. P3 "migration-l1 createTestDb-based" — FALSE: imports test-fixtures, uses `{ db }`, no createTestDb. Needs ids.next().
2. useFakeTimers tally — all three S1 fake-timer files use `{ db }` fixture → 4 fixture-based, not 1.
3. P11 names "typed-routes" exempt — never calls createTestDb.

## NON-BLOCKING

1. PK inventory: 36 `text("id")` PKs not 41; the 5 "composite" are single-column FK-derived; real composites = `filesystem_injections` (schema.ts:1244), `hint_progress` (:1423); name-PK `server_credentials` (:1303) unmentioned. Design holds.
2. `server_credentials.name` fixed-catalog PK surface (~8 files) is P10-class but P10 only named factory seed-* ids. Absorbed via upsert/absent-only production writes.
3. P10 "feasibility §1 list" reference dangles.
4. Unique-index count 18 not 17 (invite_codes.code double declaration).
5. testing.md fixture example already stale (inserts `slug:` into `teams` — no slug column).

## Verified clean (independently re-measured)

Full census reproduced (338/326/313 fixture-based; all pattern counts); every coupling line ref;
route/schema claims; ESLint plugin precedents; probes A/B/C; D3 sound and properly escalated.
