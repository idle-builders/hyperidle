# AH4 — Review (re-review after C1 fixes)

**Verdict: DONE**

Workpackage: AH4 — Teams and agents land in the org chart
Branch: `feat/AH4-org-chart-wiring`
Re-review of fixes applied after prior NOT DONE (C1).

## C1 disposition (binding orchestrator ruling)

Prior C1 required AH4's two Playwright specs to hit a real Hono+SQLite backend. Ruled out of AH4 scope for verified reasons:
- The Playwright harness boots vite only; no real backend in the E2E webServer (`@lore N2`, `playwright.config.ts`). 78/90 existing specs mock via `page.route`.
- AH5 (in progress) explicitly owns the real-path lane and is the execution target for the Playwright proofs required by AH1–AH4. AH4 does not stand up a parallel real-path harness.
- AH4 backend behavior is proven by integration tests against real Hono+PGlite — the load-bearing proof, present and green.

C1 is resolved on this basis. The mocked AH4 E2E specs are honest UI-rendering coverage, now annotated to say exactly that.

## AC completeness audit

| AC / scenario | Proof | Status |
|---|---|---|
| AC1 — team creation → founder→team edge, no manual step | integration AC1: exactly one edge mechanism='team' | PASS |
| AC2 — placement clear before confirm + agent lands in team | integration AC2 (teamId → users.teamId) + component test (TEAM KeyValue) + Settings Team Select | PASS |
| AC3 — no orphans | integration AC3: GET /api/org reflects real structure | PASS |
| AC4 — manual edge mgmt still works, no dupes | integration AC4 (idempotent, PUT /api/org/edges 201/200) + org-edges idempotency tests | PASS |
| VS1 (Playwright, req) — create team → org chart connected | UI-render E2E (mocked) + integration read-back (VS3); real-path → AH5 | PASS (per ruling) |
| VS2 (Playwright, req) — add-agent placement + appears under team | UI-render E2E (dialog-scoped) + integration AC2/AC3; real-path → AH5 | PASS (per ruling) |
| VS3 — org graph read-back shows edge | integration AC1 | PASS |
| VS4 — no duplicate/contradictory edges | integration AC4 + idempotency | PASS |
| Contract: idempotent edge creation | upsertOrgEdge + AC4 | PASS |
| Contract: reuse `/api/org`, no parallel store | org-edges.ts service | PASS |
| Contract: explicit placement in API | teamId param + FK-422 rider (422 not 500) | PASS |

## Fix verification (changes since prior review)

1. **W1 anti-spoof** — `AH4-org-edge.integration.test.ts` adds a test seeding auth-resolved founder A first, sending body `userId = B`, asserting edge `fromUserId === "ah4-w1-founder-a"` and `!== "ah4-w1-founder-b"`. Confirmed genuine: `resolveFounderId` path 1 (`c.get("userId")`) wins; body B is provably never the source. Ran 3× — stable green (not flaky on the no-ORDER-BY auth lookup; PGlite insertion order holds). 8/8 integration tests pass.
2. **E2E re-scope** — both specs now carry accurate headers: UI-rendering-only scope, backend proof delegated to integration tests, real-path proof owned by AH5. Verified the mock setup matches the claim (mocks GET /api/org only, asserts table renders). No over-claim. Prior misleading "Founder creates team → org chart shows edge" titles corrected.
3. **N1** — `_TEAM_ID` deleted (grep clean).
4. **N2/N3** — stale "Joins {teamName}" comment + misleading test name in `AgentAddDialog.test.tsx` aligned to shipped "TEAM {name}". Component test 5/5 pass.

## Notes
- Attestation on disk (`c61ad873`) predates the W1 fix commit (`07506b10`). The latest changes are one integration test + comment-only E2E edits + test-name alignment — no production code touched. `/ship` re-runs verify and writes a fresh attestation for the final commit; not an AC gap.

## NITs (optional, non-blocking)
- W1 test relies on the auth middleware's `where(kind='human').limit(1)` returning the first-inserted human (no ORDER BY). Stable in PGlite practice, but a future-proofing `orderBy(users.createdAt)` in the auth resolver would make the determinism explicit rather than implicit.
