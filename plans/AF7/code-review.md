# AF7 — Code Review (Phase 4)

Reviewer: single evaluator persona (carried Phase-2 arch-critique context forward,
8/10 RESOLVED round 2). Diff reviewed: `git diff origin/main...HEAD` in worktree
`/Users/tg/hyperidle/.worktrees/AF7` (impl `2e4ecce2`). All changed production +
test files read end-to-end. Design lens skipped silently (zero UI files — confirmed
`git diff --name-only | grep packages/web` = NONE).

**Gate results (run live in worktree):**
- `npm run check` — **PASS** (all 11 packages; web's 211 errors are AF5-quarantined,
  zero web files touched by AF7 → genuinely pre-existing/out-of-scope).
- `npm run lint` — **PASS** (exit 0; 323 warnings / 37 infos are repo-wide
  pre-existing, no new errors).
- `npm run knip` — **PASS** (only 2 config hints, no dead code; the
  `createServer(port, deps?)` test-DI branch is reached by the dispatch-wiring test
  → not flagged, as §14.3 lore predicted).
- AF7 test suite — **17 integration + 2 unit = all green**; existing protected tests
  (`R1-wire-agent-execution`, `lifecycle-propagation.integration`,
  `sessions.integration`, `isolated-harness-adapter`) all pass against the new code.

**`npm run test:e2e`:** AF7 touches **zero** web files (verified). The web package is
AF5-quarantined with 211 pre-existing type errors. The e2e failure the builder flagged
is genuinely pre-existing and out of AF7's scope. Confirmed.

---

## AC → Evidence table (read against the LIVE diff)

| AC | Satisfied | Code evidence (file:line) | Test evidence |
|---|---|---|---|
| **AC1** ready→auto-provision, visible in dispatch surface | ✅ | `server-factory.ts:214` `setProvisionSessionFn(provisionSession)` + L248-255 `dispatcherDeps` forwarded; `bootstrap.ts:78-85` registers dispatcher when deps present | `af7-dispatch-wiring.integration.test.ts:148` boots REAL `createServer(0, deps)`, drives task→accepted via `/transition`, polls `sessions` row appears + stub `startSession` called + `GET /api/dispatch-queue` 200 — **passes** |
| **AC2** request returns promptly, caller not blocked | ✅ | `session-provisioning.ts:924` `startSessionProvision` (admit sync, detach run); `sessions-routes.ts:312` returns **202** + active row | `af7-nonblocking-provision.integration.test.ts:205` races POST vs 2s deadline with gated slow harness → POST wins with 202+active BEFORE gate settles; +422/+429/+500 admission tests all pre-insert — **passes** |
| **AC3** concurrent sessions never swap context | ✅ | `harness-adapter.ts:22` `SessionConfig.sessionId` (isolation contract); `builtin-harness-adapter.ts:210-245` keys map on `config.sessionId`, scan deleted; `session-provisioning.ts:673` passes `sessionId` into config | `af7-session-isolation.test.ts:105` pre-registers A then B, starts B-first, asserts B's registry ran ONLY tool_B and A's ONLY tool_A — **passes** |
| **AC4** state stays consistent, no zombie | ✅ | `session-lifecycle.ts:234-242` (endSession) + `:315-323` (crashSession) CAS `WHERE state='active'` + `.returning()`; emit gated on `updated.length>0` (L249, L326); `sessions-routes.ts:101-162` PATCH abort-or-guarded-write, 409 on terminal | `af7-state-sync.integration.test.ts:120` crash-then-end emits exactly once; `:144` already-terminal teardown emits zero; `:170` PATCH on terminal→409 + zero emit — **passes** |
| **AC5** handoff stops prior tools | ✅ | `builtin-harness-adapter.ts:582-593` per-invoke `aborted` guard before each invoke; `session-run-registry.ts:72-84` abort→`stopSession` (primary); `handoff-protocol.ts:339` post-commit `abort()` | `af7-handoff-revokes-tools.test.ts:79` two-tool batch, abort lands mid-batch via stopSession, asserts first_tool started + second_tool NOT started — **passes** |
| **AC6** abandoned/crashed workspaces cleaned | ✅ | `workspace-reaper.ts:65` `reapWorkspacesOnce` TTL sweep; `bootstrap.ts:91-93` `startWorkspaceReaper` wired alongside dispatcher | `af7-workspace-reaper.integration.test.ts:90` reclaims old crashed dir, keeps active; `:133` preserves young crash (post-mortem window); `:160` reclaims old orphan — **passes** |

**Validation scenarios** — all four mapped: VS1 (ready→queue) → AC1 test; VS2
(2 concurrent→no cross-context) → AC3 test; VS3 (crash→DB reflects crash + workspace
reclaimed) → AC4 crash test + AC6 reaper test; VS4 (handoff→tools revoked) → AC5 test.

**Phase-4 watch-items (carried from arch-critique) — all 4 verified in code:**
1. ✅ builtin abort calls `stopSession` (primary), not loop-break-only —
   `session-run-registry.ts:82` `await entry.adapter.stopSession(entry.handle)`; loop-break is secondary (`signalAbort`).
2. ✅ per-invoke `aborted` guard in `executeToolCalls` before each invoke —
   `builtin-harness-adapter.ts:591` `if (session.aborted) break;` at top of the `for (const toolCall of toolCalls)` loop, before `toolCallCount++` (L602); AC5 test asserts "no new tool call starts."
3. ✅ `session_ended` emit gated on CAS rowCount>0 via `.returning({id}).length` —
   `session-lifecycle.ts:249` and `:326`; mechanism wired = Drizzle `.returning()` (not a SELECT-guard fallback); verified it works on PGlite in the passing state-sync test.
4. ✅ `resolvedModel` guard in synchronous admit prefix, pre-P5, maps to 500 —
   `session-provisioning.ts:355-364` throws `MissingCredentialError` before the L399 insert; `sessions-routes.ts:324` maps to 500; R1 AC6/AC7 regression test green.

**Builder's 3 in-flight plan-vs-reality resolutions — all sound, none weakens an AC:**
- `enforceResolvedModelGuard` flag (default false, true only on HTTP path
  `startSessionProvision` L930): correct scoping. Dispatcher path leaves it false because
  a missing credential there is unrecoverable-per-task (dropped from queue), and dispatcher
  fixtures run builtin-typed stubs that need no resolved model. Does NOT weaken AC2 — the
  HTTP 500 contract is preserved and tested.
- detach-after-startSession boundary (`onHarnessStarted` fired once after
  `harness.startSession` resolves, L716): honest — the POST returns after the observable
  "session is running" but before the long stream drain. The `.finally(signalStarted)`
  (L961-964) guards against an early pre-start throw never unblocking the caller. Sound.
- RED-test fixture fixes (the `sessionId` field added to every adapter test's
  `SessionConfig`): pure type-ripple from the AC3 contract change, no behavioral weakening.

---

## Findings

### CRITICAL
None.

### MAJOR
None.

### MINOR

**M1 — §7 lifecycle-propagation retry rewrite is functionally UNTESTED.**
`lifecycle-propagation.ts:614-711` was substantially rewritten (in-place row resolution
via `resolveInPlace` LogSink, CAS-guarded terminal fail at L627-631). The plan §7 test
strategy promised specific assertions: "exactly ONE terminal `applied` row AND zero
residual `pending_retry`," "exactly one `propagation_applied` event," "zero
`propagation_applied` for a retry that resolves skipped," "a row that succeeded on its
last allowed attempt is NOT marked failed." **None of these were written.** The only
coverage is the pre-existing `lifecycle-propagation.integration.test.ts:790` which asserts
`appliedLogs.length >= 1` — this passes under BOTH the old double-log behavior (1 stuck
pending + 1 new applied) and the new in-place behavior (1 resolved-in-place), so it does
not prove the fix. There is no assertion that zero `pending_retry` rows remain (the actual
bug §7 closes), and no test for the CAS-guarded "succeeded-retry-not-marked-failed" path.
§7 is "what's genuinely missing" in the spec (not a numbered AC), so this does not fail an
AC — but the rewrite ships unverified against its own stated contract. *Recommend: add the
two §7 integration assertions (zero residual pending_retry after success; CAS-failed only
when still pending_retry) the plan promised.* The code itself reads correct (CAS at
L630, in-place UPDATE at L687-694, attempts bumped before retry at L669-672).

**M2 — §8 Z8-050 adapter gating has no test.** `adapter-pool.ts:341-357` adds the
`HYPERIDLE_ENABLE_ISOLATED` env gate + availability-check + warning-skip. Plan §8 test
strategy specified: "with flags unset, pool contains exactly {claude-code, builtin}
(+CLI); with `HYPERIDLE_ENABLE_ISOLATED=1` but worker absent, pool still excludes isolated
and a warning is recorded." No such unit test exists in the diff
(`adapter-pool*.test.ts` files unchanged). The code is defensive (never throws, never
registers a broken adapter) and the DockerWorkspaceAdapter `@lore` correctly notes it is a
WorkspaceAdapter not a HarnessAdapter (so it can't live in this pool) — the reasoning is
sound. But the gate behavior is unverified. Note: the contract ("either coherent or
explicitly marked unsupported — not silent dead path") IS satisfied at the code level via
the `@lore Z8-050` documentation + env gate. *Recommend: a 2-assertion unit test on
`createLocalAdapterPool` (flags-unset membership; flag-set-prereq-absent warns + skips).*

**M3 — Live-abort PATCH can return a stale `active` body (response-only, not a zombie).**
`sessions-routes.ts:121-124`: when a live runtime entry exists, PATCH calls
`sessionRunRegistry.abort(sessionId)` then immediately re-reads the row and returns it.
`abort()` → builtin `stopSession` awaits the builtin **internal** `loopPromise`
(`builtin-harness-adapter.ts:316-318), but the terminal DB write happens in the SEPARATE
provisioning `runSession` `for await` loop (`session-provisioning.ts:735` → break on
`aborted` → `endSession` at L892). `stopSession` resolving does NOT guarantee the
provisioning loop has yet observed `done`, broken, and run teardown. So the PATCH read at
L123 can return a row still `state: "active"`. This is **not** a zombie (the §4 contract
holds — runtime remains the sole terminal writer, DB converges within the teardown that
follows), and the 409-on-terminal + CAS-emit invariants are intact. It is a transient
stale-response-body issue only, and no test exercises the live-abort PATCH read-back (the
state-sync test covers only the fallback no-runtime-entry path + the 409 path). Low impact
at single-founder scale. *Recommend: either await teardown completion before reading, or
document that the live-abort PATCH returns the pre-teardown row and the caller should poll
`GET /sessions/:id`.*

**M4 — Avoidable `any` on `AdmittedSession.selectedAdapter`.**
`session-provisioning.ts:239` `readonly selectedAdapter: any` (with a `noExplicitAny`
biome-ignore). The justification — "avoid importing the concrete type to keep this
signature light" — is weak: `SelectedEntry` is exported from `../harness/adapter-pool.js`,
the **same** package and layer, already imported transitively. This is the one avoidable
type-escape in the AF7 production surface (the other 4 in the file are pre-existing
`as TaskState` / `JSON.parse as` narrowings unrelated to AF7). *Recommend: type it as
`SelectedEntry`.*

### OBSERVATIONS (no action required)

- **Architecture / layer integrity: clean.** fabric→server boundary respected exactly as
  planned — dispatcher resolves `provisionSession` via the `provision-registry` leaf
  (`server-factory.ts:214`), reaper takes `workspaceBasePath` as a string
  (`workspace-reaper.ts:69`), never a server fs import; `bootstrap.ts:51` keeps
  `dispatcherDeps` as `Omit<TaskDispatcherDeps,...>` so fabric stays server-type-free.
  `SessionRunRegistry` is a dependency-free leaf singleton (`session-run-registry.ts:30`
  imports only `@hyperidle/shared` types) consumed by route + orchestrator + handoff —
  in-layer, no circular import. No layer reaches past its neighbor.
- **Security: no new attack surface.** AF7 adds no credential flow — `resolveModel`
  reuses the existing `EnvCredentialResolver` (`server-factory.ts:199`); worker-token
  (Z8-014) untouched (AF11 boundary respected). Reaper cannot delete arbitrary paths: it
  only `readdir`s under `workspaceBasePath` and `rm`s direct children
  (`workspace-reaper.ts:97-118`) — no path-traversal vector, no symlink-following concern
  beyond the founder's own tmp tree. TTL-guard prevents reclaiming the P4-spawn-before-P5
  window. POST/PATCH inherit existing auth middleware; no new public route added (both
  pre-existed). `summarizeToolArgs` still scrubs secrets on the `tool_call_recorded` emit
  (`session-provisioning.ts:796`). No secrets logged.
- **Adversarial: the handoff-abort vs CAS-teardown ordering hazard is correctly closed.**
  Handoff sets `state:"done"` in-tx (`handoff-protocol.ts:113`) BEFORE the post-commit
  `abort()` (L339); the detached `runSession` abort-break carries `crashed=false`
  (`session-provisioning.ts:742` break is unconditional, `crashed` set only on `error`
  L810 or catch L815), so teardown hits the normal `endSession` branch whose CAS no-ops
  on the already-`done` row → zero spurious `session_ended`. The state-sync test directly
  asserts the already-terminal teardown emits zero. Dispatcher double-wiring
  (`setProvisionSessionFn` in both test + production-under-test) is last-write-wins and
  harmless (vitest per-file isolation); the dispatch-wiring test explicitly
  `clearProvisionSessionFn()` in setup to prove createServer's own wiring.
- **Simplification: the admit/run split is justified, not over-built.** `provisionSession`
  is retained as a thin 2-line wrapper (`session-provisioning.ts:980-986`) so the
  dispatcher + outcome-asserting tests share one phase implementation — no duplication.
  `SessionRunRegistry` is a narrow 4-method leaf, exactly the depth needed. The reaper is
  one `setInterval` + a deterministic `reapWorkspacesOnce` (testable in isolation),
  mirroring the cost-sentinel precedent. No premature generics, no speculative abstraction.
- **AI slop: low.** `@lore` comments are dense but each is load-bearing (the AF7 ones
  document the exact invariants a future builder must not weaken — e.g. the rowcount-gated
  emit at `session-lifecycle.ts:244-248`, the stopSession-not-loop-break warning at
  `session-run-registry.ts:24-27`). No "TODO: implement" on implemented code, no "for now"
  / "simplified version" tells. The `console.warn`/`console.error` calls all carry a
  biome-ignore noting the observability adapter is not yet stood up — consistent with the
  repo-wide pattern, not new slop.

---

## Verdict

**DONE.**

All 6 ACs are satisfied with code evidence AND a passing test that proves the right
behavior. All 4 validation scenarios mapped and green. All 4 Phase-4 watch-items verified
in the actual code. The 3 builder plan-vs-reality resolutions are sound and weaken no AC.
`check` + `lint` + `knip` pass; the e2e failure is confirmed pre-existing and out of scope
(zero web files touched). No CRITICAL, no MAJOR findings open.

The four MINOR findings (M1 §7-retry untested, M2 §8-gate untested, M3 stale live-abort
PATCH body, M4 avoidable `any`) are quality/coverage gaps on the NON-AC portions of the
workpackage (§7 and §8 are "what's genuinely missing" items, not numbered ACs; M3 is a
response-only edge with no zombie; M4 is cosmetic type hygiene). None blocks DONE under the
rubric (every AC satisfied with code+test, zero CRITICAL/MAJOR). They are recommended
follow-ups, ideally folded before merge since the §7 and §8 code shipped unverified against
their own plan-stated test contracts.

---

## Fix-cycle re-review (Phase 4 — delta only)

Scope: ONLY the fix deltas in commit `19513149` (production: `sessions-routes.ts`,
`session-provisioning.ts`; tests: `lifecycle-propagation.integration.test.ts`,
`af7-state-sync.integration.test.ts`, `af7-adapter-pool-gating.test.ts`). All four
prior MINOR findings traced to source + production code that backs each test read
end-to-end. Gates re-run live in worktree.

**M1 — §7 lifecycle-retry tests — CLOSED, non-tautological.** Three new tests in
`lifecycle-propagation.integration.test.ts:802+`, all driving the REAL
`retryFailedPropagations` (`@hyperidle/fabric`) against seeded `pending_retry` rows.
Production path traced: `retryFailedPropagations` (`fabric/.../lifecycle-propagation.ts:614`)
bumps `attempts`, then `propagateSessionToTask` resolves the ORIGINAL row in place via
the `resolveInPlace` LogSink (L678-695) — never appends a parallel row.
- *in-place test* asserts EXACT `toHaveLength(1)` on the target's propagation_log rows,
  same `id`, `status: "applied"`, non-null `appliedAt`, AND zero residual `pending_retry`
  globally. This FAILS against the old double-log behavior (which left 1 stuck
  `pending_retry` + 1 new `applied` = 2 rows, non-empty residual). Discriminating, not `>=`.
- *single-emit test* asserts exactly one `propagation_applied` event (real EventBus
  subscription). Weaker discriminator (old path also emitted once) but valid and exact-count.
- *CAS-guard test* seeds `attempts=2` (< MAX 3): heartbeat bumps to 3, retry SUCCEEDS →
  row ends `applied`, never `failed`, zero `propagation_exhausted` notifications. Exercises
  the "succeeded-retry-not-marked-failed" class. The CAS at L630 (`WHERE id=… AND
  status='pending_retry'`) is the guard. Genuine.

**M2 — §8 adapter-gating test — CLOSED, proves no silent dead path.**
`af7-adapter-pool-gating.test.ts` drives the real `createLocalAdapterPool`. Gate-unset:
asserts `local-claude-code` + `local-builtin` present, no `isolated`/`docker` id (membership
by inclusion+exclusion, never exact size — robust to env-dependent CLI adapters). Gate-set
(`HYPERIDLE_ENABLE_ISOLATED=1`): asserts isolated STILL excluded AND `console.warn` fired
with a message containing both `isolated` and `hyperidle_enable_isolated`. Both branches of
the production gate (`adapter-pool.ts:340-356` — worker-absent and worker-present-but-unwired)
emit a warning matching the assertion, so the test is robust regardless of whether
`isolated-session-worker.js` resolves in the test run. Consistent with the Z8-050 contract:
the dead path is now coherent-or-explicitly-warned, never silent. Would fail a silent no-op
(no warn) or a broken-registration impl.

**M3 — live-abort PATCH 202/aborting — CLOSED, STRENGTHENS the AC4 guarantee.**
Hardest-scrutinized item. Behavior change verified against all four sub-questions:
- (a) Route writes NO terminal state + emits NO `session_ended` on the live path. Confirmed
  in code (`sessions-routes.ts:124-135`: `abort()` then return 202, no DB write, no emit) AND
  in `session-run-registry.ts:72-85` (`abort` only calls `signalAbort()` + `adapter.stopSession`,
  never touches DB). The new test asserts the DB row is still `active` and `ended.length === 0`
  after the PATCH — directly proving the runtime stays the SOLE terminal writer.
- (b) The 202/`aborting` contract is forwarded intact to the client at the single caller
  (`sessions-routes.ts:427` `c.json(result.body, result.status)`). No existing caller breaks:
  the prior live-abort path returned `200 + stale row`; callers now get `202 + {state:"aborting"}`
  and a poll directive. The AC4 state-sync test (the no-runtime-entry CAS path + the 409
  already-terminal path) is unchanged and still green. No AC4 test asserted on the old stale
  200 body, so nothing regresses.
- (c) The new test (`af7-state-sync.integration.test.ts:230+`) registers a LIVE runtime entry
  whose `stopSession` resolves WITHOUT writing terminal state — the exact real-world race — and
  asserts 202 + `state:"aborting"` + `sessionId` + `stopCalled===true` + row-still-active +
  zero emit. This is the genuine live-abort read-back the prior review found uncovered. It fails
  on BOTH axes against the old behavior (status would be 200, body would be `active`).
- (d) The widened `200 | 202 | 409` return type typechecks clean (server `tsc` PASS) and the
  sole caller passes it straight through to `c.json(body, status)` — Hono accepts the union.
- **Verdict on the guarantee:** STRENGTHENS AC4. The old read-back could return a stale
  `active` body that a caller might misread as terminal; the route now never asserts a state it
  did not write. No-zombie invariant is unchanged (runtime still sole terminal writer); response
  coherence improved.

**M4 — `selectedAdapter: any` → `SelectedEntry` — CLOSED, no `any` leak.**
`session-provisioning.ts:238` now `readonly selectedAdapter: SelectedEntry` (type imported
from `../harness/adapter-pool.js`, same package/layer). The `noExplicitAny` biome-ignore is
removed. Server `tsc` PASS confirms the concrete type flows correctly (no downstream `any`
re-introduction). One avoidable type-escape eliminated.

**Regression check — clean.**
- `npm run check`: server + all 10 non-web packages PASS (web 211 = AF5-quarantined, zero AF7
  web files). The widened union and `SelectedEntry` both typecheck.
- Tests: 3 unit (adapter-pool-gating, session-isolation, handoff-revokes-tools) + AF7
  integration suite (dispatch-wiring, nonblocking-provision, state-sync, workspace-reaper) +
  lifecycle-propagation.integration — ALL GREEN. State-sync now 8 tests incl. the M3 live-abort
  case; lifecycle-propagation incl. the three new §7 tests.
- Biome on the five changed files: 1 warning (`noExcessiveCognitiveComplexity` on the POST
  handler at L228) — confirmed PRE-EXISTING (present in the file at review-commit `98a1017e`,
  untouched by the M3 delta which only touched the PATCH/`applyStateChangePatch` path). No new
  lint error.
- All 6 ACs re-confirmed to hold: M3 is the only behavior change and it touches only the PATCH
  live-abort response (strengthens AC4, breaks no AC); M1/M2 are pure test additions; M4 is type
  hygiene. AC1/AC2/AC3/AC5/AC6 code + tests are untouched and still pass.

No fix is tautological. No fix introduced a regression. All four MINOR findings properly closed.

### Verdict

**DONE.**
