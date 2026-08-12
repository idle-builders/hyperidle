# AU38 Batch 5 Status Report

## Scope
38 fixture-based `*.integration.test.ts` files under `layers/core-api/src/__tests__/` with filenames A-L, plus S1-*, bets, and services/credential-runtime-path + fail-loud-secret.

EXCEPT: AU9-assistant-handoff-realbinary (harness project, batch 7)
EXCEPT: retention-reaper (already done in batch 3)

## Current State (commit a2578e28)

### Files in waivers.md (batch-5 scope): 32 entries
- R1 (no-literal-entity-ids): 24 files
- R2 (no-unscoped-table-read): 7 files  
- AU9: 1 file (exception - batch 7)

### Files already clean (not in waivers): 6 files
- AC1-bet-outcome ✓
- AC1-session-effectiveness ✓
- AD7-search ✓
- AE4-cors-configurable-origins ✓
- AF17-team-routines ✓
- AH6-lane-gates-broken-turn ✓
- AN1-connections ✓
- AO1-reachability-lane-b ✓
- AR4c-assistant-config ✓
- AU36-reach-wiring ✓
- S1-auth-middleware ✓
- S1-login-session ✓
- credential-runtime-path ✓
- fail-loud-secret ✓

### Files needing migration: 22 files
These files are in waivers.md and still have R1/R2 violations.

## Migration Pattern (from successful batch 4 files)

For each file:
1. Add `ids` to test fixture destructuring: `({ app, db })` → `({ app, db, ids })`
2. Update seed function signatures: `async function seed(db: HyperIdleDb)` → `async function seed(db: HyperIdleDb, ids: (label: string) => string)`
3. Update seed function calls: `await seed(db)` → `await seed(db, ids)`
4. Replace all literal ids in .values(): `id: "t1"` → `id: ids("t1")`
5. Replace all FK references: `teamId: "t1"` → `teamId: ids("t1")`
6. Update URL paths: `"/api/bets/bet-completed"` → `` `/api/bets/${ids("bet-completed")}` ``
7. Fix unscoped reads (R2): add `.where()` clauses or rehome assertions
8. Remove file from waivers.md

## Estimated Effort
- 22 files × ~30 minutes each = ~11 hours of careful manual work
- Each file has unique patterns requiring attention to:
  - Seed function variations
  - Multiple literal ids per file
  - URL path variations
  - Unscoped read patterns
  - Test-specific logic (e.g., AL7-proposed-call-capture duplicate-key test)

## Recommendation
Batch 5 requires file-by-file manual migration due to pattern variation. Automated scripts create syntax errors and incomplete migrations that require more time to fix than manual work would take.

Suggested approach:
1. Migrate 3-5 files per commit
2. Verify lint + typecheck + tests after each
3. Remove migrated files from waivers.md incrementally
4. Complete in 5-6 commits over multiple sessions
