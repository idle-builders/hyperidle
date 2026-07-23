# AU20 corrective feasibility

## Verdict

**GO-WITH-CHANGE.** The corrective work is feasible with existing TypeScript, Vitest, Playwright, Electron, package exports, and JSON evidence tooling. The current runner architecture cannot prove completion: lane overlap, a 300-second global cutoff, incomplete diagnostics, and missing desktop executable contracts require correction. The generator began from the defensible 181-unknown baseline and now resolves all 181 only through four identity-level diagnostic artifacts; independent architecture review must accept the final hash-bound map before `/write-tests`.

## Read-only probes

| Probe | Evidence | Verdict |
|---|---|---|
| Finite browser inventory | `browser-validation-ledger.json` partitions 588 declared cases; its 21 registers contain all 364 non-passes exactly once. | GO: stable IDs already exist; preserve them and add machine validation. |
| Terminal accounting | Default config has `globalTimeout: 300_000`, while discovery required 24 bounded shards and still recorded 63 unrun browser cases. | GO-WITH-CHANGE: completion requires durable start/end evidence per attempt. Never-started inventory remains `unrun` and keeps reconciliation red; it is never relabeled timeout. |
| Review trust boundary | Proof-inventory R2 exposed `ReviewTrust` beside caller unlock/lineage data, allowing forged resolver/root/actor identity. Node already provides `realpath`, regular-file inspection, byte reads, and SHA-256. | GO-WITH-CHANGE: capture one repository-composed verifier at factory construction. Filesystem adapter proves realpath containment and manifest actor provenance; payload and lineage share it. Requests carry claims only. No signatures/PKI. |
| Single authority + manifest pin | R3 found the exported legacy `ReviewTrust`/standalone unlock path still coexisted with the factory, and actor-only manifest entries let artifact+claim rewrites mint apparent provenance. Review then found optional builder identity left one authority tuple incomplete. | GO-WITH-CHANGE: delete legacy exports/callers, route inventory+payload exclusively through factory closures, and pin a repository-reviewed manifest whose entries bind path, reviewer, mandatory builder, artifact hash, payload hash, and verdict. Manifest, captured, and claimed builder must match; reviewer must differ. Enforce identically for payload and lineage. Net trust-path LOC must fall. |
| Descriptor-stable reads | `realpath` followed by a separate pathname read leaves a local swap window. Node/macOS provide `open`, `fstat`, descriptor reads, device/inode metadata, and `O_NOFOLLOW` where supported. | GO-WITH-CHANGE: open once, compare descriptor/path identity, read/hash/return one Buffer, and reject metadata changes. Apply analogous canonical directory/manifest checks; no PKI. |
| Retry causality | A later terminal could otherwise become final while an earlier started attempt remained unmatched. | GO-WITH-CHANGE: every earlier start requires a terminal ending before the next start. Any gap keeps the identity unrun/red; later results cannot mask it. |
| Lane ownership | Default `testDir` collects all `e2e/*.spec.ts`; AH1/AH5/AH6 are also selected by specialized configs. | GO-WITH-CHANGE: one manifest must assign every ID to exactly one lane/profile. |
| Request interception | `e2e/fixtures.ts` registers exact globs and sends unmatched methods through `route.continue()` although the default lane has no API server. | GO-WITH-CHANGE: mocked lanes require a terminal fallback and normalized method/path/query matching. |
| MCP isolation | `@hyperidle/harness-registry` main export exposes `createMcpToolBridge`; its main dependency graph includes MCP SDK, Hono, Zod; no `./mcp` export exists. | GO: package export maps support a dependency-isolated subpath without a new library. |
| Awaited disposal | Review shows synchronous `ServerHandle.dispose` fires and forgets async runtime disposal before DB close. Existing runtime disposal is already async. | GO: propagate `Promise<void>` through owners/callers and prove ordering. |
| Desktop proof | 123 desktop tests and bundle pass; there is no executable dev or packaged/shared smoke. Read-only install probe resolves Electron at repository-root `node_modules/electron/package.json`; `npm exec -- electron --version` returns `v42.5.0` and root `node_modules/.bin/electron` is executable. No workspace-local binary exists. | GO-WITH-CHANGE on supported macOS host: invoke Electron through repository-root `npm exec -- electron`/workspace npm scripts, never a workspace-local path. Preflight unsigned `.app`, loopback ports, writable isolated userData, and shared test backend independently; environmental absence blocks only its profile. |
| Evidence generation | Executable census reports 23 services/412 exports while committed artifacts report pre-rewrite state; dependency generator has no demand-package writer. | GO: extend a single generator/output contract without changing census semantics. |

No web research was needed: all mechanisms reuse pinned repository tooling and package/export/runtime patterns. No production or test files were changed by these probes.

## Design-it-twice decisions

### Lane execution

- **Rejected: one Playwright invocation with a larger timeout.** Simple, but hides missing terminal cases and couples independent profiles.
- **Chosen: manifest-derived disjoint lanes with bounded shards and post-run reconciliation.** More orchestration metadata, but every declared ID ends terminally and unrelated prerequisites cannot poison deterministic lanes.

### Mock routing

- **Rejected: retain free-form per-spec `page.route` plus `route.continue`.** Flexible, but a miss escapes to an absent backend and query variants silently diverge.
- **Chosen: canonical request key (`METHOD pathname normalized-query`) with fixture profile overlays and a fail-closed unmatched-request diagnostic.** Individual specs may override declared keys; unmatched API requests fail with evidence.

### Evidence lineage

- **Rejected: edit ledgers by hand after runs.** Fast once, non-reproducible and prone to stale counts.
- **Chosen: generated observations plus reviewed disposition overlay.** Execution facts regenerate; human-reviewed contract/disposition/red-proof links remain durable and schema-validated.

### Desktop proof

- **Rejected: unit/build status as desktop acceptance.** Does not prove Electron renderer/backend/preload integration.
- **Chosen: dev-local and packaged-local/shared process smokes using the real Electron entrypoint, with backend identity and painted shell evidence.** Covers both supported modes without inventing a second desktop architecture.

## Conditions

1. No former unresolved case receives a target from a default. Four diagnostics resolve exactly 181/181 with zero overlap/missing; a different pipeline-reviewer now accepts/rejects every target in the exact 604-entry map. Rejected targets return to architecture, and only accepted entries may enter `/write-tests`.
2. Missing `OPENROUTER_API_KEY` remains an explicit prerequisite, never a skip/pass; deterministic Claude/Haiku and binary discovery proofs remain independently runnable.
3. Exploratory `fix/e2e-recovery` commits are hypotheses only and are not cherry-picked.
4. Measurement semantics in `scripts/surface-census.ts` stay unchanged.
5. Historical harness behavior is trusted as the pre-AU20 baseline. Failure/timeout/unrun is not harness evidence; only an AU20-local runner/config intervention that changes the same case outcome can authorize a narrowly scoped harness repair.
