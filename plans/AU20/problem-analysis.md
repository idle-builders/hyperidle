# AU20 corrective failure discovery

Head: `fb8254bc1270aa5872cb6463e4cc6cfd5ddd2b32`  
Mandatory review: `/Users/tg/hyperidle/.worktrees/AU20-review/.pipeline/work/AU20/review.md`  
Machine ledgers: `browser-validation-ledger.json`, `system-validation-ledger.json`, `validation-inventory.json`

## Result

100% declared-case accounting achieved: **604/604**.

| Outcome | Count |
|---|---:|
| Passed | 227 |
| Failed | 137 |
| Timed out | 143 |
| Explicitly skipped | 32 |
| Unrun | 65 |

| Evidence-backed disposition | Count |
|---|---:|
| Passed / none required | 273 |
| Feature regression | 32 |
| Intentional move | 112 |
| Stale test/mock | 178 |
| Missing prerequisite | 2 |
| Environment blocker | 0 |
| Unresolved runtime cases | 0 |
| Open review obligations | 4 |
| Review obligation blocked by child failures | 1 |
| Open proof gaps | 2 |

“Reconciled” means every declared identity has an outcome and evidence entry. The historical discovery baseline contained 181 unresolved runtime cases; four hash-bound diagnostics now disposition all 181 without a heuristic default. The resulting 604-entry map remains a proposal until independent architecture-amendment review accepts it. Test/code changes may not begin until that review and the relevant red-proof gate pass.

## What was run

- Default mocked-browser Playwright: 580 declared cases, partitioned into 24 bounded shards rather than one global-timeout run.
- AH1 real-backend: 3; AH5 live-agent: 1; AH6 cassette replay: 4.
- Authoritative service integration: 2 failed, 2862 passed, 7 skipped. The two failures reproduce immutable-retro snapshot and disposer-count contradictions.
- Real-harness lane: installed Claude/Codex/OpenCode/GitHub binaries detected. Claude/Haiku live MCP proof passed; five suites fail at load because `OPENROUTER_API_KEY` is absent. Prior Claude inherited-discovery failure did not recur.
- Desktop: 9 files / 123 tests pass; production bundle passes. No executable dev smoke or packaged/shared smoke contract exists, so both are explicitly unrun/missing-prerequisite cases.
- Each of the fresh review’s five criticals and four warnings was separately reproduced/classified.

## Causality discipline and targeted probes

The initial signature-derived root/cascade graph was rejected and removed. Identical reporter text, timeout, skip, or non-execution is not causal evidence. Every browser non-pass remains independent unless an intervention demonstrates an edge.

Seven isolated probes now record exact command, exit, artifact kinds, direct evidence, and counter-evidence in `browser-validation-ledger.json#/probes`; their readable synthesis is `browser-analysis.md`. They directly narrow AB1, AG2, AH3 Settings, Work task rows, T4 pitch, L9 conversation detail, and AH1. None propagates its verdict to another case without direct contract evidence.

The 21-entry `browser-validation-ledger.json#/problemRegister` partitions all 364 non-passes by coherent subsystem/journey. Each entry has one owner (`design` or `architecture`), problem statement, direct/counter-evidence, state distribution, confidence, targeted proof, and decision table. `#/problemRegisterReconciliation` proves set equality: 364 memberships, 364 unique non-passes, zero missing, zero duplicate ownership, zero passing contamination, and zero pairwise intersection.

Knowledge Q2 AC-11/12/20 were unresolved at discovery. Current Knowledge IA retains in-context dialog capture, scope change, and Private semantics; identity-level diagnostics now classify their obsolete test boundaries without treating retained behavior as a top-level creation move.

## Concrete problem statements for architecture and light design

### P1 — The validation harness cannot currently establish product health

Default E2E mixes hundreds of independent specs under global limits, permits shared fixture/route behavior to cascade, and left 63 declared cases unrun even when deliberately sharded. Architecture must define deterministic inventory, per-lane ownership, shard isolation, route fallback precedence, port/worktree identity, diagnostics, and a completion rule where a runner cannot report success while cases are absent.

### P2 — Current and legacy UI contracts are mixed

Final diagnosis proposes 112 authoritative intentional moves, 178 stale tests/mocks, and 32 feature regressions across browser and system identities; zero remain unresolved. Light design reconciles canonical Work, Knowledge, Conversations, Settings, setup, responsive, and accessibility journeys against current docs and painted UI. Every move must identify both the retired interaction and equivalent current capability.

### P3 — Real, mocked, cassette, and live-agent proof have unclear boundaries

AH1 has no pass (fail/timeout/unrun), AH6 has three failures, AH5 requires a missing OpenRouter key, and default specs contain live-path skips. Architecture must make deterministic lanes independent of unrelated secrets and make live prerequisites fail fast by name. It must preserve Claude/Haiku MCP success while explaining inherited discovery and MCP isolation separately.

### P4 — AU20 introduced or exposed real service/runtime regressions

Knowledge retro snapshots mutate; runtime disposal is not awaited; harness-registry MCP dependencies are not isolated; and notification encryption and filesystem watcher failures are swallowed. The former 10-versus-9 disposer contradiction is narrowed: current bootstrap owns nine resources and commit `32cf0979` deliberately moved the historical tenth owner's custody into `startRuntime`; the remaining failure is a stale assertion plus a separate end-to-end runtime-ownership proof need.

### P5 — Required architectural evidence is stale or non-reproducible

The demand package describes 31 pre-build Services and has no current writer. Committed census says 1237 while executable census says 412. Ownership comments name deleted packages. Architecture must define one reproducible source for demand/census evidence and regenerate human artifacts without changing measurement semantics.

### P6 — Desktop acceptance is undefined beyond unit/build

Desktop tests and bundle pass, but no executable contract proves dev renderer→backend, packaged local boot, or shared-backend mode. Architecture must define those smoke contracts; light design must identify the minimal visible states/screenshots that prove correct backend connection and usable setup/application shell.

## Inputs that are evidence, not solutions

The three commits on `fix/e2e-recovery` (fresh-DB migration, light-theme contrast, desktop dev renderer/backend) are hypotheses only. None may be cherry-picked or treated as truth. Each requires independent red proof and reviewed architecture/design fit.

## Unknowns carried forward

- The historical 181-case unknown set is now covered exactly by four diagnostics (42 + 43 + 72 + 24), with zero missing, extra, or overlapping identities. Independent review must still accept each proposed target; shared timeout text is never causal evidence.
- Bootstrap's direct owner count is nine; architecture still must prove end-to-end runtime custody/teardown, not restore a tenth disposer to satisfy a stale count.
- Desktop dev and packaged/shared smoke do not exist as executable cases yet.
- AH5 and five real-harness suites cannot execute without OpenRouter credentials; this is a named prerequisite, not a skip or product pass.
- AH1/AH6 focused diagnosis is complete. AH6’s primary boundary is `session-requests/src/service.ts:resolveIntentInputInternal -> requireRunnableActor`; dispatch/run-orchestration remain secondary dependencies.

## Required next pipeline step

Revise AU20 requirements from this evidence, keeping every unknown explicit. Then independent requirement critique and human requirement gate. Only afterward: light design + architecture, independent critiques, concept gate, `/write-tests`, `/write-code`, read-only review, and bounded green commits.
