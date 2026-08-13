# AU38 kill — independent counterfactual measurement (first-party)

**Date:** 2026-08-13
**Tree:** throwaway worktree at `origin/main` = `25ae1f65beb339073baaa5615dbe064c01132d1d`, created, measured, to be removed.
**Change under test:** ONE line — service project `isolate: true` → `isolate: false` in `vitest.integration.config.ts`. Per-test `truncateAllTables` untouched. No test files touched.
**Command:** `npx vitest run --config vitest.integration.config.ts --project service --reporter=json --outputFile=<file>`

## Runs (same machine, same lane, 2,865 tests)

| Run | Config | Wall | Total | Passed | Failed | Pending | Failed files |
|---|---|---:|---:|---:|---:|---:|---:|
| baseline | `isolate: true`, truncate kept (status quo) | **299s** | 2865 | 2860 | 0 | 5 | 0 |
| run1 | `isolate: false`, truncate kept | **103s** | 2865 | 2837 | 23 | 5 | 13 |
| run2 | same | **101s** | 2865 | 2849 | 11 | 5 | 5 |
| run3 | same | **94s** | 2865 | 2826 | 34 | 5 | 12 |

**Speedup: 299s → 94–103s ≈ 2.9–3.2× wall locally, from a one-line diff.** (CI showed 4.5× in the original PR #477 measurement, commit `714edc9965f77c55175a79fb02547cbb51627adf`, which also still called `truncateAllTables` — the prize never required removing the wipe.)

Raw JSON at measurement time: `/tmp/cf-baseline-iso-true.json`, `/tmp/cf-run{1,2,3}.json` (ephemeral; regenerate with the command above).

## Failure cluster (what actually blocks `isolate: false`)

Failing-file set is order-dependent — 13 / 5 / 12 across three runs. **Union: 23 files. Stable core (fails ≥2 of 3 runs): 7 files.**

Stable core:

- `server-bind-address.integration.test.ts`
- `factory-run-config.integration.test.ts`
- `server-disposal.integration.test.ts`
- `session-requests.integration.test.ts`
- `baked-transcript-mapping.integration.test.ts`
- `agent-and-team-creation-atomicity.integration.test.ts`
- `threads.assistant-turn-baked-emit.integration.test.ts`

Full union (23):

```
AF17-team-routines                        AL7-two-session-loop
AR4c-assistant-config                     U2-api-teams-bets
X3-agent-config-bootstrap                 agent-and-team-creation-atomicity
agent-run-admission-failed-reengagement-migration
agent-work-intent-recovery                agent-work-intent-retention
agent-work-intent-supersede               app-runtime-route-boot
baked-transcript-mapping                  boot-lifecycle-drain
calling-thread-id-bake                    core-api-port-increment2-org-routine-handoff
explicit-session-start.production         factory-and-demo
factory-run-config                        filesystems-added-after-emit
server-bind-address                       server-disposal
session-requests                          threads.assistant-turn-baked-emit
```

Shape: files that start background work (drain loops, schedulers, boot sequences) and do not deterministically dispose it, plus a few `vi.mock` module-registry leaks. Representative failures: a previous file's still-running drain consuming this file's request row; disposal-order mismatches from leaked lifecycle; mocked write-failures leaking in from another file.

## Cross-check against the three external reviews

| Claim | external-review-cursor | this measurement |
|---|---|---|
| one-line flip wall | 82–88s | 94–103s |
| green baseline wall | 261s (AU38 HEAD) | 299s (origin/main) |
| failing-file spread | 12/3/20 | 13/5/12 |
| cluster union | ~30 | 23 |

Two independent measurements converge: the performance prize sits behind a one-line config flip plus a ~23-file leak repair — not the 263-file rewrite AU38 performed. AU38's green HEAD captured zero seconds of it.
