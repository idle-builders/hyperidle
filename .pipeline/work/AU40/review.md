# AU40 implementation review

## Attempt 2 — NOT DONE (2026-08-14)

### Blocking findings

1. Seed-4040 shuffled service lane remains red. Fresh structured run discovered 2,865 tests: 2,854
   passed, 7 failed, 4 pending. `AL7-reviews-loader-redo.integration.test.ts` returned four 401s instead of
   200; `agent-and-team-creation-atomicity.integration.test.ts` returned three 401s instead of its expected
   server errors. A prior fresh run of the same seed failed 13 tests across four files, so worker scheduling
   still changes victims. AC2 and AC4 fail.
2. `CreateGitRunnerOptions.timeouts.localMs` promises a process-timeout override, but bundle/worktree
   add/worktree remove hard-code 120 seconds and ignore the override. Restore override precedence and pin it.

### Evidence defect

Several causal receipts name a temporary `AU40_EXACT_ORDER=owner,victim` command whose sequencer was removed;
they are not executable evidence. Fresh shuffle evidence supersedes the recorded green claim.

### AC table

| AC | Result |
|---|---|
| service isolate:false, green default lane, 2,865 tests | PASS — fresh default: 2,861 passed, 4 pending, 0 failed |
| five consecutive plus shuffled order | FAIL |
| PR/CI timing | PENDING ship phase |
| reproduced cluster leaks nothing | FAIL |

Positive evidence: clean origin/main-based worktree; harness stays isolate:true; membership and per-test
truncate unchanged; no assertion weakening or WP-ID leakage; recorded check/lint/test/verify green; non-pipeline
diff +276/-140.

## Attempt 1 — NOT DONE (2026-08-14)

Fresh seed-4040 failed five tests in `bet-decomposition-removal` and
`explicit-session-start.production`; exact per-owner causal receipts were incomplete. AC3 had no PR/CI timing
receipt yet. The builder fixed proven owners and expanded receipts before attempt 2.
