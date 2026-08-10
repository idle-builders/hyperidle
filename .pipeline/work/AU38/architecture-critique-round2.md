# AU38 — architecture-critique, round 2

Reviewer: fresh pipeline-reviewer (read-only). Tree: worktree @ c5e1c9b7 (post origin/main merge 705b28f6).
Verdict: **PASS — no blockers.** Round-1 blocker verifiably fixed; census reproduces exactly; green-at-every-commit argument holds.

## Round-1 blocker: fixed, verified file-by-file

createTestDb re-cut exact on current tree: 19 callers; 10 createTestDb-only (P11 exempt incl. the 3 merge-renamed files); 9 mixed IN SCOPE, all run fixture `{ db }` through `checkout()`; all three concrete-breakage sites real. Exemption mechanism sound: test-utils.ts:165 truncates its own module-level `slots` pool, separate from the globalThis fixture pool.

## Census re-measurement: every number reproduces on c5e1c9b7

342 total / 329 service / 13 harness; 313 fixture-based; 146 files/547 sites toHaveLength (300×(1), 66/167×(0)); 220 literal-id; 29 literal-t1; 35+1 randomUUID/nanoid; 5/3 vi.mock; 124/477 selects, 13 no-where; 32 db.execute; 47/45 404/201; 252/139/19 insert/request/onConflict; 7/2/36 delete/orderBy/limit; 5/5 createServer/startTestRuntime; 4 fake-timer files as named; 124/0 beforeEach; 0/29 slug/email; 14 factory-cluster; 57 migrations. Merge delta (+3 service renames, +1 harness) confirmed.

## Load-bearing claims verified

Schema (36+5 FK-PKs, 2 real composites, name-PK, zero serial, 18 uniques); production surface (one uuid validator notifications-routes.ts:385; team-${randomUUID}; same-name idempotency; GET /bets global; credentials upsert/absent-only); merged CI/lore handling (ci.yml verify job; no attestation; verify:release; harness NO CI job; all three increment-9 lore rewrite sites exist; testing.md:88-105 examples stale); module-state inventory line refs exact; vi.mock trio exact; probes A/B/C; db.query relational API 0 files (R2 no hidden hole); D3 sound, correctly escalated to concept gate; green-at-every-commit holds (completeness rides the mechanical increment-8 empty-R1-waiver gate).

## NON-BLOCKING (retained for visibility; not auto-assigned per pipeline)

1. AC1 obligation cites test-pool.ts:130 — the truncate call is at :149 (stale ref).
2. Batch-overlap claim false as written: batch 7 claims P10 clusters while batches 3/4/5 name credentials-family members. Harmless sequential; loud if parallel leaves double-edit. Orchestrator: schedule accordingly or fix claim.
3. "Every file provably runs against a populated database" overclaims: under isolate:false the 4 workers' lead files boot against empty PGlite (~4 file-runs per run never see foreign rows). AC2 substantively proven; a single-worker proof run (maxWorkers:1) would close the gap deterministically.
4. §4.5 "no harness migration needed" prose conflicts with batch 7 migrating the 2 harness db-fixture files (AU9 literal ids must migrate for R1 waivers to empty). Ratchet forces the right outcome.
5. Lore range partial: test-pool.ts pool-does-not-span-files block runs 82-103, rewrite claims at 98-103.

Note: credentials cluster list is a harmless superset; all 4 files actually selecting server_credentials covered. feasibility zod UNVERIFIED resolvable (root zod 3.25.76 vs ^4.3.6 declared; v4-shaped UUID passes both).
