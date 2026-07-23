# Review: AU20

Date: 2026-07-23  
Head: `cf8bee1a`  
Base: `origin/main`  
Scope: complete committed AU20 branch; founder has moved real-backend E2E replacement to AU23.

## Architecture

CRITICAL [F1] — `.pipeline/work/AU20/analysis/service-data-packages.json:1` and `scripts/generate-dependency-graph.ts:481` — `plan.md` original AC5 and corrective completion criterion 4 — The required current, reproducible per-Service demand package remains the stale 31-Service input. The generator still cannot regenerate the 23-Service package. The proof-inventory commit did not change this production/evidence path.

CRITICAL [F2] — `packages/core-api/src/server-factory.ts:549` and `packages/core-api/src/server-factory.ts:1021` — `architecture.md` migration “ServerHandle.dispose callers: sync→async” — `ServerHandle.dispose` is still synchronous and calls `void runRuntime.dispose()` before closing owned resources. Durable shutdown marking can race DB close and its rejection is not observable.

CRITICAL [F3] — `packages/agent-execution/harness-registry/package.json:5` and `packages/agent-execution/harness-registry/src/index.ts:12` — `rearch/harness-registry.md` §§1,5 and corrective completion criterion 4 — MCP remains exported from the main package entry; MCP SDK, Hono, and Zod remain main dependencies. The required dependency-isolated `./mcp` entry does not exist.

CRITICAL [F4] — `packages/core-api/src/routes/bets.ts:1042` — `plan.md` no-product-behavior-change criterion and protected `AC2-retro` contract — updating a retro reconstructs projection metadata from the bet’s current hypothesis. Independent focused service integration reproduced the regression: expected the creation-time hypothesis, received the later edited hypothesis.

CRITICAL [F5] — `packages/core-api/src/__tests__/O3-service-move-bootstrap.integration.test.ts:80` — corrective completion criterion 4 and `architecture.md` protected-test rule — resource ownership remains contradictory. Independent focused service integration expected 10 disposers and received 9. No reviewed exact named-ownership replacement has landed.

CRITICAL [F6] — `.pipeline/work/AU20/architecture.md:191` and `.pipeline/work/AU20/progress.json:4` — corrective ACs C1–C7 — only the first corrective `proof-inventory` increment landed. Routing, review-change-map closure, service corrections, evidence corrections, real application validation, desktop proof, and aggregate closeout remain unimplemented. Moving real-backend E2E redesign to AU23 removes that redesign from this review; it does not resolve the five non-E2E critical defects above.

WARNING [F7] — `plans/AU20/surface-census.md:9` and `.pipeline/work/AU20/rearch/census-after.json:1` — original AC4/AC5 — executable census is correct at 231 methods / 181 types / 412 total, but committed human evidence still contains stale pre-final-rewrite totals.

WARNING [F8] — `packages/agent-orchestration/src/index.ts:12` and `packages/core-api/src/services/durable-agent-queue.ts:2` — architecture lens/doc accuracy — ownership prose still names deleted packages as live owners and wiring.

## Security

WARNING [F9] — `packages/core-api/notifications/src/install.ts:229` — corrective completion criterion 5 — `writeSecret` catches every encryption exception although its contract permits suppression only for `MISSING_ROOT_SECRET`. Unexpected encryption defects become false-success writes.

No new authz, injection, workspace-escape, or XSS defect was supported by the AU20 diff.

## Adversarial

WARNING [F10] — `packages/core-api/filesystems/src/file-watcher.ts:102` — corrective completion criterion 5 — watcher setup errors are swallowed by an empty catch and runtime watcher errors have no observable contract. Callers receive a live-looking handle after failed setup.

The three named correctness fixes remain present: atomic task-note append, duplicate team-membership read removal, and duplicate session-chain user read removal. Service rewrites are separately committed and the implementation-site census was not gamed.

## Simplification

OBSERVATION [F12] — `scripts/surface-census.ts:1` — original deliberate-surface criteria — live surface is 23 Services, 231 methods, 181 types, 412 total. No late corrective commit added Service methods or types. The large `cf8bee1a` addition is validation/planning evidence and browser support, not Service surface.

## AI slop

WARNING [F11] — `.pipeline/work/AU20/plan.md:3` and `.pipeline/work/AU20/architecture.md:191` — closeout clarity — the branch now carries a large corrective architecture that explicitly declares AU20 unfinished, while ship is being requested after only its first implementation increment. This is contradictory durable state, not an acceptable DONE record.

## Review integrity

WARNING [F13] — `.pipeline/work/AU20/review.md:76` — review-ledger count integrity — the historical footer claimed six warnings while only five warning headings existed. This finding records that contradiction itself; no additional product warning is invented. Stable IDs and the static ledger validator now make heading/footer drift fail closed.

## AC completeness

| Acceptance criterion | PASS/FAIL | Evidence or gap |
|---|---|---|
| Holistic OUTSIDE/INSIDE analysis and existence verdict for every original Service | PASS | 31 analysis artifacts and final fold/dissolve records exist. |
| Small, general, composable demand-informed APIs | FAIL | Census proves broad reduction, but harness-registry violates its accepted isolated-entry design and demand input is not currently reproducible. |
| Explicit sub-linear scaling argument per Service | PASS | Retained rearchitecture documents include the scaling argument. |
| Apply material reductions without behavior change; full suite green | FAIL | Live census is 412, but immutable retro behavior regressed and focused integration is red. |
| Re-runnable per-Service export/consumer-demand input | FAIL | Stale 31-Service package cannot be regenerated for the 23-Service result. |
| Independent critique before reductions | PASS | Planner/reviewer artifacts and separate commit ordering exist. |
| Three named correctness bugs fixed; complete suite green | FAIL | All three fixes are retained; protected focused integration is 2 failures / 31 passes. |
| Corrective C1: exact inventory/lineage/terminal accounting | PASS | `proof-inventory` implementation and 153-test contract landed in `cf8bee1a`. |
| Corrective C2: all architecture/design registers reviewed and closed | FAIL | Planning/change-map evidence exists; corrective implementation/closeout is incomplete. |
| Corrective C3: deterministic isolated lanes | FAIL | Real-backend E2E redesign is now AU23; AU20 has no accepted replacement closeout for this criterion. |
| Corrective C4: nine runtime validations pass | FAIL | Retro and disposer protected tests fail; shutdown and MCP contracts remain unfixed. |
| Corrective C5: five review obligations and desktop proof gaps close | FAIL | Evidence generation, stale docs, watcher/notification semantics, and desktop proof remain open. |
| Corrective C6: canonical UI capability preserved | FAIL | No real-backend/desktop proof accepted in AU20; this work was moved to AU23. |
| Corrective C7: reviewed separate green corrections and aggregate closeout | FAIL | Only proof-inventory corrective increment landed; aggregate closeout absent. |

## Verification

| Command | Result |
|---|---|
| `npx tsx scripts/surface-census.ts --table` | PASS — 231 methods, 181 types, 412 total |
| `npm run check` | PASS — 37 packages |
| `npm run lint` | PASS |
| `npm run test` | PASS |
| Focused protected service integration (`AC2-retro`, `O3-service-move-bootstrap`) | FAIL — 2 failed, 31 passed |
| `git status --short` | REVIEW ARTIFACTS + unrelated untracked `plans/AG4`, `AG6`, `AI1`, `AI3`, `AI4`; unrelated files were not touched |

Finding counts: 6 CRITICAL, 6 WARNING, 1 OBSERVATION.

VERDICT: NOT DONE
