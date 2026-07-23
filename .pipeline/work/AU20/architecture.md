# AU20 corrective architecture

## Status and fixed inputs

This architecture covers the corrective third pipeline pass only. It preserves the accepted 31→23 Service redesign and three named bug fixes while restoring trustworthy product/runtime proof. Fixed inputs:

- `.pipeline/work/AU20/requirements.md` corrective §0
- `.pipeline/work/AU20/design/approved.md` and `register-decisions.md`
- `plans/AU20/{validation-inventory.json,browser-validation-ledger.json,system-validation-ledger.json,problem-analysis.md,browser-analysis.md}`
- `plans/AU20/design-critique-v3.md` (accepted 8/10)
- `/Users/tg/hyperidle/.worktrees/AU20-review/.pipeline/work/AU20/review.md` (all five criticals/four warnings binding)

Corrective requirements are founder-directed and independently accepted; `progress.json` records the explicit basis for corrective requirements approval. This artifact does not authorize test/code edits before concept approval.

## Required reading

- `ETHOS.md` §§1,3,4
- `.pipeline/work/AU20/{plan.md,requirements.md,build-plan.md,design/approved.md,design/register-decisions.md}`
- `plans/AU20/{problem-analysis.md,browser-analysis.md,validation-inventory.json,browser-validation-ledger.json,system-validation-ledger.json,design-critique-v3.md}`
- prior review path above
- `docs/information-architecture/{app-shell-always-present.md,conversations-view.md,work-view.md,knowledge-view.md,cross-view-navigation-map.md}`
- `docs/human-interface-layer/{the-three-views.md,open-contract.md,part-model.md}`
- `docs/deployment/{index.md,laptop.md,releases.md}`
- `docs/architecture/{system-overview.md,data-flow-examples.md,run-unit-model.md,credential-model.md,connection-model.md}`
- `.claude/rules/testing.md`

## Plan reconciliation

- The original AU20 plan claimed green behavior. Reality: 604/604 cases are inventoried; the defensible starting map retains 181 unresolved until identity-level diagnostic artifacts prove causal targets. Seven static/proof obligations remain open and service integration/real-harness aggregate are red. Corrective success supersedes the old completion claim.
- The committed service demand package describes 31 services; runtime census reports 23. The current graph generator cannot emit the required demand package. A reproducible current writer is mandatory.
- Default Playwright collection overlaps specialized AH lanes and global timeout permits unrun cases. Process exit is not completion.
- Mock fixtures imply unmatched API traffic can continue to a backend, but default mocked Playwright starts only Vite. Request misses therefore cannot be interpreted as product failures.
- Bootstrap owns nine direct disposers after runtime custody moved into `startRuntime`; the test expecting ten is stale. This does not prove async runtime teardown ordering, which remains a separate red obligation.
- Desktop unit/build success does not prove renderer→preload→backend in dev or packaged/shared modes. Two executable contracts are missing.
- Current UI is authoritative where corrective design settled it. Architecture inspected its 116 runtime obligations and the seven architecture registers, mapping every identity to product change, test move/replacement, stale test/fixture correction, prerequisite/setup, evidence obligation, or no change. The accepted design contract is not reinterpreted.
- Blast radius includes validation scripts/configs, all E2E fixture families, server lifecycle callers, harness registry importers, Knowledge retro routes, notification/filesystem error contracts, desktop boot/client/preload entrypoints, evidence artifacts, and ownership documentation.

## Completion architecture

### 1. Inventory, observation, disposition, lineage

Add a versioned machine contract under `packages/web/e2e/support/` and generated AU20 evidence under `plans/AU20/`:

```ts
type LaneId = "mocked-browser" | "real-backend" | "cassette" | "live-agent" |
  "service-integration" | "harness-claude" | "harness-codex" |
  "harness-opencode" | "harness-gh" | "harness-builtin" |
  "desktop-unit" | "desktop-dev" | "desktop-packaged-local" | "desktop-shared";
type TerminalOutcome = "passed" | "failed" | "timed_out" | "blocked" | "unrun";
type Disposition = "feature_regression" | "intentional_move" | "stale_test_mock" |
  "harness_defect" | "missing_prerequisite" | "environment_blocker";
interface ValidationIdentity { id: string; source: string; titlePath: string[]; lane: LaneId }
interface AttemptStarted { id: string; runId: string; attemptId: string; shardId: string;
  workerId: string; startedAt: string }
interface Observation { id: string; runId: string; attemptId?: string; outcome: TerminalOutcome;
  startedAt?: string; endedAt: string; durationMs?: number; artifacts: string[];
  errorFingerprint?: string; prerequisite?: string }
type ReviewedDisposition =
  | { id: string; kind: "feature_regression"; registerId: string; contractRefs: string[];
      evidenceRefs: string[]; failingBehavior: string; reviewArtifact: string }
  | { id: string; kind: "intentional_move" | "stale_test_mock"; registerId: string;
      contractRefs: string[]; evidenceRefs: string[]; lineage: Lineage; reviewArtifact: string }
  | { id: string; kind: "harness_defect"; registerId: string; evidenceRefs: string[];
      runnerRedProof: string; reviewArtifact: string }
  | { id: string; kind: "missing_prerequisite"; registerId: string; prerequisite: string;
      preflightEvidence: string; reviewArtifact: string }
  | { id: string; kind: "environment_blocker"; registerId: string; condition: string;
      exhaustedAlternatives: string[]; reviewArtifact: string };
interface Lineage { oldId: string; replacementIds: string[]; action: "retain"|"reroute"|"rewrite"|"delete";
  capability: string; contractRef: string }
interface ReviewClaim { artifactPath: string; artifactHash: string; payloadHash: string;
  verdict: "accept"|"revise"; reviewerIdentity: string; builderIdentity: string }
interface VerifiedReviewArtifact { bytes: Uint8Array; canonicalPath: string; sha256: string;
  reviewerIdentity: string; provenance: "repository-review-manifest" }
interface ReviewVerifier {
  verify(claim: ReviewClaim, canonicalPayload: string): VerifiedReviewArtifact
}
interface ReviewManifestEntry { artifactRelativePath: string; reviewerIdentity: string;
  artifactSha256: string; reviewedPayloadSha256: string; verdict: "accept";
  builderIdentity: string }
interface ReviewManifest { schemaVersion: 1; entries: ReviewManifestEntry[] }
```

`scripts/validation-inventory.ts` enumerates configured tests before execution and validates: unique IDs; exactly one owning lane; exact ledger set equality; no deleted ID without reviewed lineage; no replacement ID claimed twice. A reporter persists `AttemptStarted` before test body execution and a matching end observation afterward. `scripts/validation-reconcile.ts` consumes both streams. `timed_out` is legal only with matching start evidence and no end before the bounded deadline. An inventoried identity without start evidence remains `unrun`/missing-observation, retains its declared identity, makes reconciliation red, and never satisfies terminal accounting. A shard/process timeout synthesizes timeout only for its durably started attempts; all never-started shard members remain unrun.

Attempt order is strict per identity. Before attempt N+1 may start, attempt N must already have exactly one matching terminal whose `endedAt <= next.startedAt`. This applies to failed and timed-out retries, not only passes. Any earlier unmatched start keeps the identity `unrun`, reconciliation incomplete/red, and every later terminal non-authoritative. A later pass/failure/timeout cannot mask it. Duplicate/conflicting terminals, terminal-before-start, overlapping attempts, and retry after passed/blocked are hard errors.

There is exactly one authority path. Delete the exported `ReviewTrust` type and standalone `assertReviewedPayloadUnlocked`; do not deprecate, alias, or retain compatibility wrappers. `buildValidationInventory` is no longer exported as an authority-bearing free function. `packages/web/e2e/support/validation-contract.ts` exports only `createValidationContracts({ reviewVerifier })`, whose returned `assertReviewedPayloadUnlocked(request)` and `buildValidationInventory(request)` closures use the same captured verifier. All legacy tests/callers migrate in this increment; no old/new coexistence is accepted. The resulting production diff must delete duplicate trust resolution and reduce net LOC.

`packages/web/e2e/support/review-trust.ts` exports `createFilesystemReviewVerifier({ repositoryRoot, acceptedReviewRoot, reviewManifestPath, expectedManifestSha256, builderIdentity }): ReviewVerifier`. `scripts/validation-composition.ts` owns those repository-configured values and constructs the verifier once before request parsing. The reviewed, repository-owned manifest is `.pipeline/work/AU20/review-trust-manifest.json`; its exact hash is pinned in composition/task metadata. Each canonical relative artifact path binds reviewer identity, mandatory builder identity, accepted artifact SHA-256, reviewed payload SHA-256, and verdict `accept`. The manifest schema rejects missing/empty/unknown fields and duplicate artifact paths. Verification requires `manifest.builderIdentity === captured builderIdentity === claim.builderIdentity`, `manifest.reviewerIdentity === claim.reviewerIdentity`, and reviewer identity distinct from builder identity for both payload unlock and lineage. Caller `ReviewClaim` values are assertions only and must equal the manifest; rewriting both artifact and caller claims cannot mint provenance. No signatures or PKI.

File reads are descriptor-stable and return the bytes actually verified. For repository root, accepted root, manifest, and artifact: resolve canonical `realpath`; prove repository/root containment; open once read-only (`O_NOFOLLOW` where supported); `fstat` the descriptor and require regular file for manifest/artifact; compare descriptor device/inode to the canonical-path `stat`; read the original descriptor into one `Buffer`; `fstat` again and reject device/inode/size/mtime changes; hash and return that same buffer. `canonicalPath` is the resolved realpath. Root directories receive the analogous realpath/directory/device+inode checks. This proportional local-repository design closes tested traversal, prefix, symlink, and swap ambiguity without PKI.

Exact red tests remain `packages/web/src/e2e-support/review-trust.test.ts` and `packages/web/src/e2e-support/validation-contract.test.ts`. Add proof that: legacy `ReviewTrust`, standalone unlock, and free authority-bearing inventory exports are absent; every former caller uses the factory; manifest schema rejects omitted builder identity, empty identities, unknown fields, and duplicate paths; manifest/captured/claimed builder mismatch fails; reviewer=builder self-review fails; and those omission/mismatch/self-review cases fail through both payload unlock and lineage. Also prove manifest hash mismatch, artifact rewrite with matching caller claim, payload-claim rewrite, verdict/reviewer mismatch, symlink/prefix/traversal, nonfile, and descriptor/path inode swap fail; verified bytes are the exact returned buffer; payload and lineage invoke the same captured verifier; attempt 2 cannot mask unmatched attempt 1. A static export/caller check belongs in lint/type validation, while runtime trust and sequencing remain imported tests.

Generated execution fields are immutable facts. Read-only diagnosis writes `plans/AU20/register-diagnosis/<register>.json`. A separate pipeline-reviewer owns `plans/AU20/register-reviews/<register>.md`, checks exact-set membership and accepts/rejects every new or changed disposition. Builder identity cannot populate `reviewArtifact`; validator resolves it to an accepted reviewer artifact and matching content hash. Test editing is permitted only after acceptance. `intentional_move`/`stale_test_mock` require old→replacement lineage and equivalent capability. `feature_regression` then enters `/write-tests` for durable failing behavior/visual proof before production change. `harness_defect` requires runner-level red proof. Any disposition edit invalidates its review hash and relocks tests/code.

### Complete corrective change map

`plans/AU20/corrective-change-map.json` is the architecture handoff; `corrective-change-map.md` summarizes it. It contains **604/604 identities**: 588 browser + 16 system. The generator's defensible baseline is exactly 227 no-change, 27 confirmed regressions, 99 moves, 61 stale test/mocks, 2 prerequisites, 5 static/review obligations, 2 proof gaps, and 181 unresolved. It refuses to classify an unresolved identity by title, register, timeout, skip, failure, or unrun state.

Architecture diagnosis artifacts under `plans/AU20/diagnostics/` may replace `unresolved` only when they bind the exact identity to a terminal/imported-runtime observation, authoritative contract, first divergent boundary, exact causal file/symbol, test/production action, red proof, and dependency. Cohort attribution requires a controlled A/B or fix-free perturbation proving the shared edge. The full regenerated map must be accepted by the independent architecture-amendment reviewer; a changed source ledger, generator, diagnostic, or target invalidates the review hash.

Every `feature_regression` uses the standardized diagnostic projection `exactSymbols: Array<{file: string; symbol: string}>`. The generated `changeOwner`, `candidateFiles`, `exactSymbols`, and `requiredRedProof` must equal that source projection exactly; register-, title-, and test-file fallbacks are forbidden. The validator audits all 32 regressions plus explicit anchors for WorkBet Unblock, Q1 SplitView pointer interception, and the three AH6 session-request failures.

The completed diagnostic union is exact: `ui-a-l` 42 + `ui-m-s` 43 + `lane-ah` 72 formerly unresolved + `core-work-runtime` 24 formerly unresolved = **181 unique, zero missing/extra/overlap**. Controlled current-runtime probes passed 58/58 UI A–L, 161/161 UI M–S, and 26/26 lifecycle integration tests. The lane probe produced 50 expected/24 unexpected results and named each first boundary; AH1/AH6 web source/spec/config were byte-identical across `ca6a6b71^..HEAD`, localizing remaining AH6 divergence after accepted UI submission into durable intent/request/dispatch. Concurrent shared-port `ECONNREFUSED/RESET` observations were explicitly invalidated and never used as causality. Historical harness health remains trusted.

Final proposed targets are: **273 no change**, **32 feature regressions**, **112 intentional moves**, **178 stale tests/mocks**, **2 named external prerequisites**, **5 static/review obligations**, and **2 proof gaps**; zero unresolved and zero harness defects. Concrete change kinds: **33 production**, **112 test moves/replacements**, **177 test/fixture corrections**, **2 prerequisite/setup**, **2 test additions**, **2 evidence-generator**, **1 test correction**, **1 documentation**, **1 aggregate closeout**, and 273 no-change. These are proposed architecture dispositions, not implementation permission.

Integrity is fail-closed. The generated map binds SHA-256 for both source ledgers, all four diagnostic JSON artifacts, generator source, and canonical payload. `.pipeline/work/AU20/probes/validate-corrective-change-map.mjs` rejects identity/hash/field/unresolved drift. `--require-review` additionally requires an accepted reviewer artifact whose hash binds the exact payload; until then `acceptedReview:null` and `writeTestsLocked:true`.

**Harness baseline rule:** the harness worked regularly before AU20 and is trusted. No failure, timeout, skip, or unrun state alone is a harness defect. The map assigns zero harness repairs. A future harness change requires a focused AU20-local A/B intervention proving runner/config behavior—not product/test behavior—caused the same identity to fail, plus a new independent disposition review.

### 2. Deterministic lane isolation and bounded execution

Create an explicit lane manifest in `packages/web/e2e/lane-manifest.ts`; specialized AH specs are excluded from default collection and owned only by their named config. Each lane defines test match, fixture profile, server profile, prerequisites, worker budget, per-test timeout, and shard ceiling. Ports are allocated per worktree/run and written with `{worktreeRoot, gitHead, pid, lane, port}` identity; a health endpoint must echo identity before reuse. A process from a sibling worktree is never reused.

Default mocked shards start Vite only. Real-backend shards start a migrated, isolated PGlite/server profile. Cassette starts its replay server. Live-agent and harness profiles call `requireHarness`/credential preflight before collection; missing prerequisites terminate as named `blocked`, not skip. Claude runtime proofs pin Haiku. Builtin-only tests may require OpenRouter; Claude/Codex/OpenCode/GH deterministic lanes must not inherit that prerequisite.

Bounded terminal rule: inventory first; run shards of explicit IDs; persist attempt starts; merge reporter JSON; reconcile against inventory; retry only failed/timed-out IDs with fresh contexts. Completion requires every ID passed/failed/timed_out/blocked with valid evidence and **zero unrun**. Any never-started identity stays unrun and the lane is red. No arbitrary timeout increase counts as correction.

Diagnostics per non-pass: trace, screenshot for painted UI, console, page errors, normalized request log, response status/body excerpt, server stderr, fixture profile, worktree/head/port identity. Retain first failure and final attempt.

### 3. Fixture/request routing contract

Replace implicit glob precedence with a profile router in `packages/web/e2e/support/request-router.ts`:

```ts
type RequestKey = `${Uppercase<string>} ${string}`;
interface RouteReply { status: number; headers?: Record<string,string>; body?: unknown }
interface FixtureProfile { name: string; routes: Map<RequestKey, RouteReply | RouteHandler> }
```

Pattern grammar is finite: `METHOD /literal/:param` path segments, optional terminal `*rest`, and query clauses `?key=value`, `key=:param`, `key=*` (present with any value), or `key[]=:param` (repeated values as an order-insensitive multiset). Undeclared query keys reject. Compilation escapes literals, permits `:param` exactly one non-empty decoded segment/value, and permits `*rest` only terminally. Canonical requests decode path, preserve slash boundaries, sort query keys and repeated values, and retain duplicate cardinality. Precedence is: test-local exact instance > test-local template > profile exact > profile template > shared exact > shared template; within a tier more literal path segments, then more literal query clauses. Equal-specificity overlaps are configuration errors at inventory time; declaration order never resolves ambiguity and overrides must name the replaced route ID. Examples: `GET /api/bets/:betId?include=tasks` matches `/api/bets/b-1?include=tasks`; `GET /api/search?q=:term&tag[]=:tag` matches reordered `tag=a&tag=b&q=x`; it does not match an extra `cursor`. Shared defaults load first and named overrides replace explicit route IDs. In mocked lanes, zero matches fails with nearest keys; more than one match fails ambiguity—never `route.continue()`. Non-API assets continue. Real-backend lanes prohibit API fulfillment except declared fault injection. Cassette validates request/response schema/version.

### 4. Seven architecture register gates

| Register | Isolated diagnosis gate | Decision output |
|---|---|---|
| BR-LANE (70) | Manifest set-equality + two repeated isolated runs with identical ownership/terminal counts. | Harness defect only where ownership/routing/interference is directly reproduced; remaining IDs return to their functional register. |
| BR-FIXTURES (7) | Request-key logs compare fixture schema/status with real API contract for each ID. | Stale mock only with API/schema evidence; otherwise focused product red proof. |
| BR-LIFECYCLE (7) | One real-backend scenario per session/task transition captures API events, DB state, realtime event and UI projection. | Locate first divergent boundary; do not bulk-assign causality. |
| BR-SETUP (6) | Fresh migrated DB, named input sequence, transaction result, restart persistence, canonical landing screenshot. | Split selector/route drift from transaction/product regression per identity. |
| BR-AH6 (3) | Per-scenario normalized request, cassette match, response/server event and painted state. | Cassette drift only if current API contract succeeds outside replay; otherwise regression. |
| BR-AH1 (2) | Canonical setup→Settings journey on real backend, persisted encrypted credential readback/restart evidence. | Reroute stale journey separately from credential behavior. |
| BR-AH5 (1) | Preflight OpenRouter, execute owning live-agent spec only, record model/provider and assistant response. | Missing prerequisite remains blocked; no default-lane skip substitutes. |

The seven register gates above organize execution only; they do not assign causality. Identity-level diagnostic artifacts supply planned owners/proofs before amendment review. Register review remains the independent acceptance gate; implementation never performs primary architectural classification.

### 5. Nine system runtime validations

The nine `runtimeValidation` ledger identities are binding:

1. **Runtime disposal:** integration test injects a pending durable shutdown write; `await server.dispose()` completes it before HTTP/WS/DB close. Cleanup is best-effort ordered: runtime, WebSocket/HTTP, DB; every phase runs even when an earlier phase rejects. Failures return one `AggregateError` whose `.errors` retain phase-tagged causes in order. Repeated calls share the same promise/result. CLI and signal handlers await it, set nonzero exit status on aggregate failure, and do not call immediate `process.exit`; desktop awaits it before window/process completion; tests assert ordering and errors.
2. **Retro snapshot:** create retro, edit bet hypothesis, create/read later retro; first snapshot remains byte/semantic-equivalent to original.
3. **Notification encryption:** only `MISSING_ROOT_SECRET` has its explicitly specified response; unexpected encrypt/prepare/write failure propagates and no success audit is emitted.
4. **Filesystem watcher:** synchronous setup failure rejects/returns explicit failed result; post-setup `error` transitions handle observably and never leaves a live-looking handle.
5. **Bootstrap ownership:** assert named nine direct owners, not count only; an end-to-end runtime test proves moved handoff/reaper/session custody and awaited teardown.
6. **Installed harness binaries:** preflight reports exact binary/version for Claude, Codex, OpenCode, GH; absence blocks only owning lane.
7. **OpenRouter prerequisite:** builtin lane fails fast by credential name before test collection; unrelated harness lanes execute.
8. **Desktop unit:** existing 123 tests remain protected and green.
9. **Desktop build:** bundle plus preload/main artifact integrity remains green and is prerequisite to packaged smokes.

### 6. Five review obligations

1. `scripts/generate-dependency-graph.ts` (or a focused imported generator module) emits current `service-data-packages.json` from the same AST inventory, including DI-port direct, destructured, and aliased receivers; deterministic twice-run output and 23-service live reconciliation are static/integration proof.
2. Harness MCP code moves behind export-map entry `"./mcp": "./src/mcp/index.ts"`; `.` must not export/import/re-export `mcp-tool-bridge`, `@modelcontextprotocol/sdk`, `hono`, or `zod`. Only files under `src/mcp/` may runtime-import those external packages; type-only imports outside it are forbidden too so declaration reachability stays isolated. Installation dependencies may remain in the package manifest because the subpath owns them, but `esbuild packages/agent-execution/harness-registry/src/index.ts --bundle --platform=node --metafile=... --external=@hyperidle/shared` followed by a metafile assertion must show zero MCP SDK/Hono/Zod modules and zero `src/mcp/**` inputs. A Node import probe resolves `@hyperidle/harness-registry` without loading those modules; a separate probe resolves `@hyperidle/harness-registry/mcp`. Remote-server and all non-MCP consumers import only `.`; MCP consumers migrate explicitly to `/mcp`.
3. Aggregate verify cannot close until every child lane reconciles its declared inventory and all non-blocked identities pass.
4. Census human/JSON evidence regenerates from unchanged `scripts/surface-census.ts`; committed totals must equal a fresh run (23, 231 methods, 181 types, 412 total at planning head; final values may change only through reviewed code changes).
5. Ownership comments/docs are updated to surviving package/runtime names and checked against imports/registrations; deleted package names remain only in explicit historical prose.

### 7. Two desktop proof gaps

Add process-level smoke ownership under `packages/desktop/e2e/`:

- **Dev-local (supported host: macOS arm64):** preflight Node/npm dependencies and package-manager resolution from repository root (`node -p "require.resolve('electron/package.json')"`, `npm exec -- electron --version`), Chromium launch permission, two free loopback ports, writable temp/data paths. Current install resolves root-hoisted `node_modules/electron` v42.5.0; no workspace-local binary is assumed. Launch `npm run -w @hyperidle/desktop dev -- --user-data-dir=<absolute-temp>`, whose `electron` command is npm-resolved from the root workspace. Use 60s readiness and 30s clean-exit deadlines. Assert preload API, backend identity, painted shell, Work request, awaited disposal; capture screenshot/logs.
- **Packaged-local:** run `npm run -w @hyperidle/desktop build && npm exec -w @hyperidle/desktop electron-builder -- --dir --config electron-builder.yml --arm64`; preflight unsigned artifact `packages/desktop/release/mac-arm64/HyperIdle.app` and executable `Contents/MacOS/HyperIdle`, writable isolated data path and loopback port. Launch that executable, 90s readiness/30s exit; prove embedded migration/backend/shell.
- **Packaged-shared:** same unsigned artifact plus a disposable external backend whose health identity is captured before launch. The smoke launcher creates a unique directory with `mkdtemp` under the OS temp root, mode `0700`, writes only `<temp>/config.json` mode `0600` with `{"backendMode":"shared","serverUrl":"http://127.0.0.1:<allocated-port>","lastView":null,"workerEnabled":false,"workerMaxConcurrent":1,"workerDeviceId":null}`, and launches `packages/desktop/release/mac-arm64/HyperIdle.app/Contents/MacOS/HyperIdle --user-data-dir=<absolute-temp>`. The disposable backend receives any synthetic test API key through its child-process environment only; neither key nor ambient `~/Library/Application Support/HyperIdle` config/secrets are copied, read, logged, or inherited. Prove matching backend identity and absence of embedded-server bind. Use 90s readiness/30s exit. In `finally`, terminate child processes, wait for ports to close, redact logs, then recursively delete only the validated mkdtemp path; cleanup failure makes the smoke red.

Preflight outcomes are closed: unresolved repository-root Electron via `npm exec`, absent package artifact, unsupported non-macOS host, OS launch denial, unavailable required binary, or unavailable externally provisioned credential/backend may be `blocked` with named evidence. The launcher rejects empty/root/home/non-temp userData paths before creation or cleanup. Once preflight passes, launch crash, readiness deadline, migration failure, preload absence, backend mismatch, ambient-config access, port conflict created by the app, visual failure, dirty exit, or cleanup failure is a product/test failure—never blocked. Port exhaustion is blocked only after allocation probe proves an external host condition before launch.

### 8. Prior-review corrective contracts

- `ServerHandle.dispose(): Promise<void>` is idempotent, runs best-effort runtime→transport→database even after rejection, returns ordered phase-tagged `AggregateError`, and every process/signal/desktop/test caller awaits it; signal/CLI callers set exit status without premature exit.
- MCP entrypoint isolation as above; remote-server and non-MCP consumers import only `.`.
- Retro snapshots store immutable hypothesis metadata at first retro creation and never rebuild prior snapshots from mutable bet state.
- Notification and watcher error semantics are observable, tested, and documented at their caller boundary.
- Evidence generation is deterministic and review artifacts are regenerated in the same evidence-only commit.
- Stale ownership prose is corrected without pretending deleted packages exist.

## Acceptance criteria and verification

| AC | Criterion | Concrete verification |
|---|---|---|
| C1 | Every 604 discovery identity and every newly introduced replacement identity has unique lane ownership, terminal observation, reviewed lineage/disposition where changed, and no silent disappearance. | Inventory/reconcile scripts assert set equality, uniqueness, terminal count, and lineage; deliberate deleted-ID fixture makes validator fail. |
| C2 | All seven architecture and 14 design registers reach reviewed per-ID decisions without inferred cascade. | Register schema validation plus isolated commands/artifacts named in each register; reviewer checks all 364 original non-passes exactly once. |
| C3 | Mocked, real-backend, cassette, live-agent and real-harness lanes are isolated and deterministic. | Two clean repetitions per deterministic lane yield identical inventory/ownership and no unrun IDs; prerequisite-removal tests block only owning lane. |
| C4 | All nine runtime validations pass with actual behavior proof. | Focused integration/E2E tests specified in §5, then `npm run test:integration:service`, harness lanes, desktop unit/build. |
| C5 | Five review obligations and two desktop proof gaps are closed reproducibly. | Generator twice-run diff empty; dependency graph/export tests; fresh census equals committed evidence; docs scan; dev and packaged local/shared screenshots/logs. |
| C6 | Current canonical UI capability is preserved for moves/stale tests and all 116 design runtime obligations are green. | Semantic Playwright assertions plus inspected screenshots at design breakpoints/states; one-to-one lineage validator; accessibility scan. |
| C7 | Corrective changes land as red-proof-first, independently reviewed, separate green commits; accepted Service simplification and named fixes remain intact. | Git history/diff audit, protected-test audit, live census, `npm run check`, `lint`, `test`, service/harness integration, full E2E, desktop smokes, build/attestation all green or explicitly credential-blocked. |

Fixed-handoff assertions are executable acceptance, not prose: inventory validation must report exactly **7 architecture registers + 14 design registers = 21**, **9 runtime validations**, **5 review obligations**, **2 desktop proof gaps**, and **116 design runtime obligations**; review closeout must map exactly all prior **5 critical + 4 warning** findings to passing proofs. Count drift is red until a reviewed plan revision explains it.

## Protected tests

Assertions may not be weakened in:

```yaml
protectedTests:
  - packages/core-api/src/__tests__/AC2-retro.integration.test.ts
  - packages/core-api/src/__tests__/O3-service-move-bootstrap.integration.test.ts
  - packages/core-api/work/src/__tests__/work-service.integration.test.ts
  - packages/agent-orchestration/tool-handlers/src/__tests__/log-task.integration.test.ts
  - packages/desktop/__tests__/
```

The bootstrap assertion may change only from brittle count `10` to exact named ownership plus new end-to-end runtime-custody proof, in its own reviewed stale-test increment. E2E files are lineage-protected: deletion/assertion migration requires an accepted disposition record.

## Migrations

- Playwright configs: assign every spec to one lane; move AH ownership by `testMatch/testIgnore`, never duplicate.
- `e2e/fixtures.ts` callers: replace implicit glob/free continuation with named fixture profiles and request keys.
- Existing ledger IDs: retain IDs where capability stays; intentional moves/stale tests add replacement IDs and lineage before old assertions change.
- Proof-inventory trust callers/tests: delete imports of `ReviewTrust`, standalone `assertReviewedPayloadUnlocked`, and free authority-bearing `buildValidationInventory`; compose once through `scripts/validation-composition.ts` and call only factory-returned operations. No compatibility export remains.
- `ServerHandle.dispose` callers: sync→async; await all tests, CLI/signal, desktop and server owners.
- harness registry: main MCP exports→`./mcp`; update MCP consumers only; non-MCP imports stay on `.`.
- evidence artifacts: regenerate service package/census/human report from scripts; do not hand-edit generated totals.
- ownership docs/comments: rename historical owners to current consolidated runtime owners.

## Ownership task tree

This tree partitions files/contracts only. It does **not** combine pipeline stages or authorize one agent to diagnose, test, implement, review, and commit. Every corrective increment traverses the mandatory stage protocol below with separate artifacts and agents.

#### `proof-inventory` — Red proof for inventory, lineage, terminal accounting, lane isolation
- **Kind:** implementation
- **Depends on:** none
- **Owns:** `file:.pipeline/work/AU20/review-trust-manifest.json`, `file:packages/web/e2e/support/review-trust.ts`, `file:packages/web/e2e/support/validation-contract.ts`, `file:packages/web/e2e/lane-manifest.ts`, `file:scripts/validation-composition.ts`, `file:scripts/validation-inventory.ts`, `file:scripts/validation-reconcile.ts`, `contract:ValidationIdentity`, `contract:ReviewVerifier`
- **Consumes:** design registers and discovery ledgers
- **ACs:** C1, C2, C3
- **Start here:** `plans/AU20/validation-inventory.json`, `architecture.md#1-inventory-observation-disposition-lineage`
- **Verify:** tests/lint reject every legacy trust export/caller and prove one captured verifier; pinned manifest and entry hashes; artifact+claim rewrite; descriptor/path swap; lexical/symlink/traversal/nonfile escape; actor/verdict/payload mismatch; and unmatched attempt N followed by terminal N+1. Diff is net-negative in trust-path LOC. Bounded lane smoke reconciles exact inventory.
- **Parallel:** no

#### `proof-routing` — Red proof and deterministic fixture/request profiles
- **Kind:** implementation
- **Depends on:** `proof-inventory`
- **Owns:** `file:packages/web/e2e/fixtures.ts`, `file:packages/web/e2e/support/request-router.ts`, `file:packages/web/playwright*.config.ts`
- **Consumes:** `contract:ValidationIdentity`
- **ACs:** C2, C3
- **Start here:** `packages/web/e2e/fixtures.ts`, `architecture.md#3-fixturerequest-routing-contract`
- **Verify:** unmatched API/query/method tests fail with diagnostic; repeated mocked shard has exact terminal set
- **Parallel:** no

#### `review-change-map` — Independently review all architecture targets
- **Kind:** implementation
- **Depends on:** `proof-routing`
- **Owns:** `artifact:plans/AU20/register-reviews/`, accepted content hash for `plans/AU20/corrective-change-map.json`
- **Consumes:** seven architecture gates, fourteen accepted design registers
- **ACs:** C1, C2, C6
- **Start here:** `architecture.md#4-seven-architecture-register-gates`, `design/register-decisions.md`
- **Verify:** reviewer accounts for 604/604 identities, all 5 critical/4 warning obligations, zero unresolved, and accepts/rejects every target; no builder self-approval
- **Parallel:** no — dispositions gate every later edit

#### `service-corrections` — Review findings with focused red proofs
- **Kind:** implementation
- **Depends on:** `review-change-map`
- **Owns:** `contract:ServerHandle.dispose`, `contract:immutable-retro-snapshot`, `contract:notification-error-semantics`, `contract:watcher-failure-semantics`, `contract:harness-registry/mcp`
- **Consumes:** reviewed dispositions
- **ACs:** C4, C5, C7
- **Start here:** prior review, `architecture.md#5-nine-system-runtime-validations`
- **Verify:** focused old-red/new-green tests; check/lint/unit/service integration after each service-local commit
- **Parallel:** no — separate sequential green commits per service/runtime owner

#### `evidence-corrections` — Reproducible demand/census/ownership evidence
- **Kind:** implementation
- **Depends on:** `review-change-map`
- **Owns:** `file:scripts/generate-dependency-graph.ts`, `artifact:.pipeline/work/AU20/analysis/service-data-packages.json`, `artifact:.pipeline/work/AU20/rearch/census-after.json`, `artifact:plans/AU20/surface-census.md`, ownership comments/docs
- **Consumes:** unchanged census semantics
- **ACs:** C5, C7
- **Start here:** prior review demand/census/ownership findings
- **Verify:** twice-generated byte-identical outputs; live totals equal committed artifacts; deleted-owner scan clean
- **Parallel:** yes — no runtime source ownership overlap after disposition contracts settle

#### `browser-corrections` — Apply reviewed moves, stale assertions and feature fixes
- **Kind:** implementation
- **Depends on:** `review-change-map`
- **Owns:** `path:packages/web/e2e/`, `path:packages/web/src/` only for identities with feature-regression disposition
- **Consumes:** design approved contract, lineage, fixture router
- **ACs:** C1, C2, C6, C7
- **Start here:** register ledgers and `design/current-contract/state-atlas.md`
- **Verify:** focused red→green by register; semantic assertions + inspected screenshots; no unresolved/unrun IDs
- **Parallel:** no — one register increment/green commit at a time

#### `desktop-proof-and-correction` — Real dev and packaged local/shared proof
- **Kind:** implementation
- **Depends on:** `service-corrections`
- **Owns:** `path:packages/desktop/e2e/`, desktop scripts/config; production desktop files only after red proof
- **Consumes:** async disposal and backend identity contracts
- **ACs:** C4, C5, C7
- **Start here:** `packages/desktop/src/{main.ts,boot-server.ts,client-config.ts,preload.ts}`
- **Verify:** dev-local and packaged-local/shared smokes with screenshots/logs and clean awaited exit
- **Parallel:** no

#### `aggregate-closeout` — Independent default-reject review and final green proof
- **Kind:** implementation
- **Depends on:** all above
- **Owns:** `artifact:final validation ledgers`, `artifact:review`
- **Consumes:** all contracts
- **ACs:** C1–C7
- **Start here:** `architecture.md#acceptance-criteria-and-verification`
- **Verify:** full command matrix; exact inventory accounting; current artifacts; git history shows separate green commits
- **Parallel:** no

## Mandatory pipeline stage protocol

The ordered plan applies first to lane/inventory infrastructure, then each service (`knowledge`, `notifications`, `filesystems`, `harness-registry`, runtime disposal), evidence generation, each browser register family, and each desktop profile. Never mix services or registers in one increment.

1. **Architecture change-map review — independent pipeline-reviewer.** Input: the complete 604-entry architecture map, inventory, accepted design, historical harness baseline, and prior review. Output: `plans/AU20/register-reviews/<increment>.md` with exact owned-ID set, per-ID accept/reject, evidence hashes, and `VERDICT: accept|revise`. Any reject returns to architecture amendment. An accepted content hash unlocks only its IDs; no implementation-time agent performs the primary classification.
2. **Increment selection — coordinator.** Select only accepted entries sharing one service/register and immutable review hash; verify dependencies/owner scope before builder assignment.
3. **`/write-tests` — pipeline-builder, red phase.** Consumes accepted review. Adds/changes only the focused test/harness proof and lineage records. It must run the focused command and capture expected red. The red proof is durable: commit it separately when project rules allow red commits; because repository rules say never commit red, AU20 stages the red diff and stores its patch hash, command, exit, and artifact paths in `.pipeline/work/AU20/red-proofs/<increment>.json` until the immediately following green commit. It may not edit production.
4. **Red-proof review — different pipeline-reviewer.** Read-only review validates that the test imports/drives real behavior, fails for the accepted reason, preserves capability, and does not weaken/delete unrelated proof. Output `plans/AU20/red-proof-reviews/<increment>.md`; only `VERDICT: accept` unlocks code.
5. **`/write-code` — pipeline-builder, green phase.** Consumes immutable accepted disposition + red-proof review; makes the minimum production/test-fixture correction. It may not alter the accepted red assertion except through a returned review cycle.
6. **Implementation review — independent pipeline-reviewer, default reject.** Reviews complete uncommitted green diff, lineage, protected tests, focused output, and service/register scope. Any unexplained test disappearance, changed disposition, combined service, missing artifact, or weakened assertion is `VERDICT: revise`.
7. **Verification — builder.** After accepted review, run focused test, `npm run check`, `npm run lint`, `npm run test`, affected integration/E2E lane, inventory reconciliation, and relevant rendered inspection. Service integration/harness/desktop commands apply by ownership. Failures return to write-code and review.
8. **Isolated green commit — builder.** Commit only the one accepted increment, including its red proof metadata/test, green code, review-linked lineage and regenerated focused evidence. Commit message names `AU20` and service/register. Push only after green. Next increment begins from this committed green state.

Lane/inventory infrastructure follows the same sequence: `/write-tests` first proves duplicate ownership, ambiguity, missing-start/unrun, and cross-worktree reuse failures; implementation follows accepted red review. Corrective entries then execute in change-map dependency order. Aggregate closeout is a final separate reviewer pass and evidence-only green commit, not a substitute for increment reviews.

## Route checklist

```yaml
route-checklist:
  - mocked browser: Vite only; all /api/** terminally fulfilled or fail-closed
  - real backend/AH1: migrated isolated server; no generic API fulfillment
  - cassette/AH6: replay server only; schema/version checked
  - live agent/AH5: real backend + named provider prerequisite
  - desktop local: packaged/dev embedded backend identity
  - desktop shared: external backend identity; no embedded conflict
```

## Security and abuse cases

- State-changing endpoints: no new endpoint; existing auth/rate-limit contracts remain. N/A to harness configuration.
- Agent-authored fields: no new field; fixture/cassette content remains untrusted and rendered through existing product paths.
- Secrets: diagnostics redact API keys/credential values; prerequisite reports names only. Notification tests use synthetic secrets.
- Paths: artifact/run directories derive from validated run IDs under a fixed root; reject traversal.
- SSRF: backend URLs in desktop/shared tests bind to allocated loopback fixtures; production shared URL behavior unchanged.

## Shared files

```yaml
sharedFiles:
  - package.json
  - package-lock.json
  - packages/web/e2e/fixtures.ts
  - packages/web/playwright.config.ts
  - packages/core-api/src/server-factory.ts
  - packages/agent-execution/harness-registry/package.json
  - scripts/generate-dependency-graph.ts
```

## Risks and unresolved blockers

- `OPENROUTER_API_KEY` is absent in discovery. Builtin/AH5 live proof remains explicitly blocked until available; it cannot block deterministic unrelated lanes.
- The 604-entry target map awaits independent architecture-amendment review. Rejection returns exact entries to planner amendment; write-tests stays locked.
- Electron packaged smoke may require platform packaging/signing assets. Local unsigned smoke is the MVP proof; release signing is outside AU20.
- Large E2E scope risks another mega-commit. Register-by-register ownership and mandatory green commits are the control.
- Generated evidence may expose nondeterministic path/order fields; generator normalizes repo-relative paths and stable sorts records.

## Feasibility reference

See `.pipeline/work/AU20/feasibility.md`: GO-WITH-CHANGE on terminal accounting, lane ownership, routing, MCP isolation, async teardown, desktop proof, and evidence generation.
