# Architecture Critique: AF7

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:7 DM:8 N:8 MD:8 FMC:7 S:9 V:7

Reviewer evaluated the plan COLD and spot-checked every load-bearing file:line
claim against real code. **All eight root-cause diagnoses are accurate** —
verified below. This is a strong, grounded plan for a high-risk runtime rewire.
It earns an APPROVED, but four findings (two CRITICAL, two WARNING) must be
addressed by the builder or carried into Phase 4 review as known watch-items.

---

## Ground-truth verification (what I checked)

| Claim (plan §) | Verified? | Evidence |
|---|---|---|
| Boot gap: `strategyBootstrap` passes only `readAlertPreferences`, no `dispatcherDeps` (§0/§1) | ✅ TRUE | `server-factory.ts` L167-188 wraps `bootstrapFabric` with only `readAlertPreferences`. |
| `setProvisionSessionFn` never called in prod (§0/§1) | ✅ TRUE | Only call site is `AD2-task-dispatcher.integration.test.ts:65`. |
| Dispatcher gated on `ctx.dispatcherDeps` (§1) | ✅ TRUE | `bootstrap.ts` `if (ctx.dispatcherDeps)`; `TaskDispatcherDeps` already declares all 6 fields incl. `resolveModel?`, `mcpBridgeRegistry?`, `mcpBaseUrl?`. |
| `mcpBridgeRegistry`/`mcpBaseUrl` in scope at boot (§1) | ✅ TRUE | `server-factory.ts` L154-155. Plan's `dispatcherDeps` block is constructible. |
| POST blocks on full `provisionSession`, returns 200 (§2) | ✅ TRUE | `sessions-routes.ts` L189-217 awaits then `c.json(sessionRow, 200)`. |
| Builtin scan binds wrong registry under concurrency (§3) | ✅ TRUE | `builtin-harness-adapter.ts` L194-216: mints `builtin-${nextId++}`, scans map for first `loopPromise===null && registry!==null && !done`, re-keys. Z8-092/093 real. |
| PATCH desync: writes state+emits `session_ended`, no runtime awareness, no state guard (§4) | ✅ TRUE | `sessions-routes.ts` L283-329: unconditional `db.update`, unconditional `session_ended` when `body.state` set. No CAS, no 409. |
| Terminal write is unconditional (§4.3 CAS target) | ✅ TRUE | `session-lifecycle.ts` `endSession`/`crashSession` both `.where(eq(sessions.id, …))` only — no `state='active'` predicate. |
| Handoff sets `state:"done"` in-tx, no `session_ended`, releases dedup post-commit (§5) | ✅ TRUE | `handoff-protocol.ts` L107-110 in-tx, L327 `releaseSessionDedup` post-commit. Abort hook slot is exactly here. |
| crashSession preserves workspace; nothing reclaims (§6) | ✅ TRUE | `session-lifecycle.ts` crash path "Do NOT delete workspace on crash". No reaper exists. |
| Retry double-log: success inserts fresh `applied` row, original left `pending_retry` (§7) | ✅ TRUE | `retryFailedPropagations` L605-662 only bumps `attempts`, re-calls `propagateSessionToTask` which `logPropagation`-INSERTS a new row. `logPropagation` is append-only (no upsert). Original row never resolved until MAX. |
| MAX branch marks `failed` on count alone (§7) | ✅ TRUE | L612-616 `if (row.attempts >= MAX)` → `.set({status:"failed"})` regardless of whether transition already landed. |
| Docker/Isolated test-only in prod pool (§8) | ✅ TRUE | `createLocalAdapterPool` registers only claude-code + builtin + CLI. No Docker/Isolated import in the pool file. |
| Phase structure (1-7 sync prefix, 8-11 detached tail) (§2) | ✅ TRUE | Phases mapped: P5 inserts row, P8.5a `setSessionToolRegistry(sessionId,…)`, P9 `harness.startSession`, P10 stream loop, P11 teardown→`endSession`/`crashSession`. Split point is honest. |

No fabricated file:line. No spec/codebase drift (CC-007 clean).

---

### CRITICAL

- **[plan §5] The stated revocation mechanism is wrong for the builtin adapter — the only adapter AC5's test exercises.** The plan says abort works because "once the loop breaks, no further `registry.invoke` happens." But in `session-provisioning.ts` L640-647 the provisioning event loop **skips `registry.invoke` for builtin entirely** (`if (interceptToolCalls && selectedAdapter.meta.type !== "builtin")`) — builtin executes tools *internally* inside `startSession`'s `runLoop`, not in the provisioning loop. So breaking the provisioning loop on `aborted` does **not** stop builtin tool execution. The actual revocation for builtin is **`adapter.stopSession(handle)` → builtin's internal `aborted` flag** (`builtin-harness-adapter.ts` L323-326, which then waits on `loopPromise`). The plan *does* call `stopSession` in abort, so the mechanism works — but the plan's stated rationale is incorrect, and a builder following the rationale literally (adding only the loop-break flag, trusting "no further registry.invoke") would ship an abort that does nothing for builtin. → **Fix:** rewrite §5.2 to state the builtin revocation path explicitly: abort MUST call `adapter.stopSession(handle)`, which sets the builtin's internal `aborted` flag and halts its `runLoop`; the provisioning-loop break is secondary (relevant only for non-builtin adapters that invoke through `registry.invoke`). Name `builtin-harness-adapter.ts` `runLoop` as the point where builtin tool execution actually stops.

- **[plan §5 / §12.4] Cooperative abort latency leaves a real window where the prior agent completes an in-flight tool call after handoff — and the plan only checks the flag per LLM turn.** §12.4 admits "worst case the prior agent finishes its in-flight turn before stopping." For builtin, `stopSession` sets `aborted` then `await session.loopPromise` — but the runLoop only observes `aborted` between iterations, so a tool invocation already dispatched in the current turn **runs to completion and its side effects land** before the loop exits. AC5 says "the prior agent cannot keep acting after handoff" and the validation scenario asserts "no further tool calls (count frozen)." A tool call in flight at abort time will increment the counter → the test as written in §5 test-strategy ("count frozen") **can flake or fail**. → **Fix:** either (a) tighten the contract: check `aborted` inside the builtin `runLoop`'s `executeToolCalls` *before each invoke* (the plan's own §12.4 "tighter option") so no new invoke starts post-abort, and define AC5's assertion as "no tool call *starts* after handoff completes"; or (b) explicitly scope AC5 to "no *new turn* starts" and make the test deterministic by handing off at a turn boundary (deferred-promise gate between turns), not mid-tool. Do not ship the per-iteration check with a "count frozen" assertion — they contradict.

### WARNING

- **[plan §4 / §5 — ordering hazard between handoff abort and CAS teardown]** §5.3 says handoff sets `state:"done"` in-tx, then post-commit calls `abort` → `stopSession` → teardown, and "teardown for a handoff-ended session must skip the `endSession` DB write … the CAS guard from §4.3 makes this safe automatically (row no longer `active` ⇒ no-op)." This is correct **only** because handoff flips `done` *before* abort. But the detached `runSession` tail (§2) funnels its exit through `endSession`/`crashSession` unconditionally, and on the **abort path the loop breaks with `crashed=false`** → it will call `endSession` (the normal-completion branch), not `crashSession`. `endSession` with the new CAS `where(state='active')` correctly no-ops (row is `done`) — but it will **still NOT emit `session_ended`** (good, matches handoff contract) **only if** the CAS guard gates the emit, which §4.3 specifies. The hazard: if the builder applies the CAS predicate to the UPDATE but forgets to gate the `eventBus.emit` on "update affected a row," handoff will emit a spurious `session_ended` it must never emit (concept.md §"A Handoff is not a session_ended", `handoff-protocol.ts` L98-103). → **Fix:** §4.3 must state, as a hard invariant the test checks: `session_ended` is emitted **iff** the CAS UPDATE returned rowCount>0. Add an explicit AC5/AC4 test assertion: after handoff-driven abort+teardown, **zero** `session_ended` events for that session.

- **[plan §2 — admission errors thrown after the session row is inserted are lost on the detached path]** §2 splits "admit" (Phases 1-7, incl. **P5 insert session row**) from "run" (8-11, detached). The plan asserts all admission errors (`CostCapExceeded` 422 / `ConcurrencyLimit` 429 / `MissingCredential` 500) "still throw synchronously before detach." Verify this against phase order: cost pre-flight is **P2** (before insert — fine, throws pre-row), concurrency/adapter-select is **P3** (before insert — fine), but `resolvedModel`/credential failures surface in the builtin at **P9 `harness.startSession`** (`builtin-harness-adapter.ts` L195: "resolvedModel is required" throws inside startSession, which is in the *detached* tail). So a `MissingCredential`-class failure that only manifests at harness start happens **after** the 202 is returned and the row is inserted → the caller gets 202, the row exists, and the failure only reaches `crashSession` via the detached `.catch`. That is arguably acceptable (the session legitimately crashes and the DB reflects it), but it **breaks the plan's claim** that the 500 MissingCredential mapping is preserved on the POST path. → **Fix:** §2 must either (a) move credential/`resolvedModel` validation into the synchronous admit prefix (validate `resolvedModel` presence before P5 insert, throw 500 pre-detach), or (b) explicitly document that post-admission harness-start failures are reported as a crashed session (202 + later `state=crashed`), not an HTTP error, and update the AC2 test to assert that path. Pick (a) — it keeps the honest contract and avoids inserting a row that's doomed.

### SUGGESTION

- **[plan §1 test strategy]** The new `createServer(port, deps?)` optional test-DI param is a reasonable mirror of `createApp`'s `SessionRouteDeps`, but it widens a production entry point's signature for tests only. Acceptable, but add a `@lore` noting the param is test-only and production passes nothing, and ensure `knip` doesn't flag the optional param branch as dead.

- **[plan §6 reaper] Orphan-dir reclamation ("no matching session row … older than TTL") races the admit/run split.** With §2, the session row is inserted in P5 *before* the workspace is fully materialized (P6) — but the workspace dir is spawned in P4 (`adapter.spawn`) *before* the row exists (P5). There is a brief window where a dir exists with no row. The reaper's "orphan dir older than TTL ⇒ reclaim" is TTL-guarded (24h default) so the window is harmless in practice, but the plan should state the ordering (dir-before-row in P4→P5) so the TTL is understood as the safety margin, not an accident. The post-mortem window (§6) and crash-preserve are otherwise sound.

- **[plan §7] Verify `propagateSessionToTask`/`propagateTaskToBet` return-status refactor doesn't change first-attempt logging.** The plan keeps "first-attempt path logging as-is; add an internal `apply*` core that returns the status." Good — but the first-attempt wrappers currently emit `propagation_applied`/`propagation_failed` events inline (L344-358). The refactor must keep event emission on the first attempt AND decide whether a *retry* that resolves to `applied` re-emits `propagation_applied`. The plan is silent on retry-path event emission. → Specify: a retry resolving to `applied` SHOULD emit `propagation_applied` once (the transition really happened on this pass); a retry resolving to `skipped` should not. Add to the §7 test assertions.

- **[plan §8] Z8-050 gate vs delete is acceptable.** Keeping Docker/Isolated behind `HYPERIDLE_ENABLE_*` + availability check + `@lore` converts silent dead paths into documented gated capability. The contract ("either coherent or explicitly marked unsupported — not silent dead paths") is satisfied. Note: `local-workspace-adapter.ts` L65 and `cli-harness-adapter.ts` L321 reference these adapters in messages/patterns, so they are not pure dead code — the gate decision (not delete) is the right call.

---

## AC × plan coverage matrix

| AC / scenario | Plan § | Test named? | Covered |
|---|---|---|---|
| AC1 ready→auto-provision, visible in surface | §1 | `server-factory-dispatch.integration.test.ts` (poll queue + sessions row) | ✅ |
| AC2 request returns promptly | §2 | slow-harness deferred, assert 202 before settle | ✅ (see §2 CRITICAL-adjacent WARNING on error mapping) |
| AC3 concurrent sessions no context swap | §3 | two concurrent builtin, sentinel-per-session assertion | ✅ |
| AC4 state consistency, no zombie | §4 | crash → exactly-one `session_ended`, PATCH-after-terminal 409 | ✅ |
| AC5 handoff stops prior tools | §5 | handoff mid-run, tool count frozen | ⚠️ assertion contradicts per-iteration abort (CRITICAL #2) |
| AC6 workspace cleanup | §6 | reaper pass: crashed dir gone, active dir survives | ✅ |
| VS: ready→dispatcher→queue | §1 | covered by AC1 test | ✅ |
| VS: 2 concurrent→no cross-context | §3 | covered by AC3 test | ✅ |
| VS: crash→DB reflects crash + workspace reclaimed | §4+§6 | crash test + reaper test | ✅ (two tests; acceptable) |
| VS: handoff→prior tools revoked | §5 | covered by AC5 test | ⚠️ see CRITICAL #2 |

Plus §7 (lifecycle retry — not an AC but in "what's missing") and §8 (Z8-050 contract) both have named tests. **No AC is unmapped.** Two ACs (AC2, AC5) have a test whose assertion needs tightening before red-phase.

---

## Dimension scores

- **SA (Spec Alignment) 9** — Every AC + every validation scenario + every named Z8 issue maps to a §. No scope creep: the propagation-retry fix (§7) and Z8-050 (§8) are explicitly in-spec ("what's missing" / contracts). No invented requirements.
- **LI (Layer Integrity) 9** — fabric→server boundary respected via `provision-registry` injection; reaper takes `workspaceBasePath` as data, not a server import. `SessionRunRegistry` is server-layer, imported only by server (route+orchestrator+handoff) — in-layer. Correct.
- **AC (API Contracts) 7** — 200→202 change is named and honest. Error-status table preserved *except* the MissingCredential-at-harness-start case (WARNING). PATCH 409 on terminal is specified. Request/response shapes for `startSessionProvision` (`{sessionId, taskId}`) named.
- **DM (Data Model) 8** — No schema change, correctly. CAS predicate (`state='active'`) on terminal write is the right concurrency primitive. In-place propagation-log resolution (UPDATE … WHERE id) is sound. Minor: plan doesn't name the Drizzle return-rowcount API it'll use for the CAS-emit gate — relevant to the WARNING.
- **N (Naming) 8** — `admitSession`/`runSession`/`startSessionProvision` honest. `SessionRunRegistry`, `startWorkspaceReaper` clear. No new generic `Manager`/`Service`. No collision with closed vocab (Session/Task/Handoff used per concept.md).
- **MD (Module Depth) 8** — `SessionRunRegistry` is a narrow leaf singleton (`{register,deregister,abort,has}`) serving route+orchestrator+handoff with one shape — good depth. `provisionSession`-as-wrapper avoids duplicated phase logic. Slight surface widening from `createServer(port, deps?)` (SUGGESTION).
- **FMC (Failure-Mode Coverage) 7** — Strong on the zombie/CAS/idempotency paths. Gaps: abort-latency window (CRITICAL #2), post-admission harness-start failure path (WARNING), retry-path event emission (SUGGESTION). No security/abuse regressions introduced (no new credential path, AF11 boundary respected). Rate-limiting: PATCH/POST inherit existing middleware — plan doesn't re-enumerate a route-checklist, but no new public route is added (POST/PATCH already exist), so CC-003/L7 route-checklist is N/A and correctly so.
- **S (Simplicity) 9** — No speculative abstraction. Cooperative flag chosen over process-kill with stated rationale. Gate-not-delete for Z8-050 justified. `design-it-twice` present and genuine on the two load-bearing decisions (dispatcher-in-fabric vs move; sweep vs eager-delete) — not theatre.
- **V (Verifiability) 7** — Every AC has a named integration test with a concrete assertion. Red-phase-first ordering stated (§9). Two assertions need tightening before they're trustworthy (AC2 error-mapping, AC5 count-frozen). **No protected-tests list** — the plan touches `AD2-task-dispatcher.integration.test.ts` semantics (it's the existing wiring test) and changes `POST /api/sessions` status 200→202, which any existing sessions-route test asserts on. → **Builder must enumerate** existing tests that assert 200 on POST /sessions and the AD2 dispatcher test as protected/to-update before red phase. This is the one Dimension-9 miss (CC-008).

---

## What's Working Well

- **Every root cause was traced, not guessed.** I independently confirmed all 14 load-bearing file:line claims against real code — zero drift. This is the gold standard for a runtime-rewire plan and the reason the score is 8 not 6.
- **The sessionId-as-contract fix (§3) is the genuinely minimal correct fix.** Deleting the id-minting + reconcile-scan and keying the existing `Map<sessionId,…>` by the provided id closes the race without new locks. The plan correctly identifies that the bug is the *lookup key*, not the storage — and that the `Map` was already per-session.
- **CAS terminal write + single-writer contract (§4.3) is the right primitive** for the zombie/double-`session_ended` problem, and it composes cleanly with the handoff path (row already `done` ⇒ teardown no-ops) — provided the emit is gated on rowcount (the WARNING).

---

## Verdict

**APPROVED (8/10).** Ship the plan to red-phase. The two CRITICAL findings are
correctness-of-rationale and test-assertion issues, not structural plan defects —
they are cheap to fix in the plan text and MUST be carried into Phase 4 review as
watch-items regardless. Builder must additionally produce the missing
protected-tests list (POST /sessions 200→202 callers + AD2 dispatcher test)
before writing red tests.

---

## Round 2 re-critique (focused — confirm revisions resolve the findings)

ARCHITECTURE-SCORE: RESOLVED  rounds=2

Re-read the revised `architecture.md` and re-verified every code claim the
revisions depend on against real source (builtin adapter
`startSession`/`stopSession`/`runLoop`/`executeToolCalls`, the L645 builtin
`registry.invoke` skip, `endSession`/`crashSession` unconditional terminal
writes, the `crashed`-flag set points in the provisioning loop). All claims hold
— no drift, no fabricated file:line.

### CRITICAL 1 (builtin revocation via stopSession→aborted→runLoop) — RESOLVED
§5 now leads with a dedicated "Critical: where builtin tool execution actually
stops (revocation truth)" block and §5.2 makes `adapter.stopSession(handle)` the
**primary** revocation, loop-break the **secondary** (non-builtin only). Spot-check:
`builtin-harness-adapter.ts` `stopSession` L323-326 sets `aborted` then awaits
`loopPromise`; `runLoop` checks `aborted` between iterations; provisioning L645
`if (interceptToolCalls && selectedAdapter.meta.type !== "builtin")` skips
`registry.invoke` for builtin — all exactly as the plan now states. The plan
explicitly warns: "A builder who adds only the loop-break flag … ships an abort
that does nothing for builtin — do not." The wrong-rationale hazard is closed.

### CRITICAL 2 (abort-latency vs "count frozen" contradiction) — RESOLVED
The plan picks ONE coherent design (a) end-to-end: per-invoke `aborted` check in
builtin `executeToolCalls` **before each invoke** + AC5 assertion scoped to "no
tool call *starts* after handoff completes" (NOT "count frozen"). §5.2/§5.3, the
§5 test strategy, §9.4 task order, and §12.4 all agree and all explicitly reject
the "count frozen" assertion as flake-prone. Verified the guard's intended site:
top of the `for (const toolCall of toolCalls)` loop, before the `tool_call` emit
and `toolCallCount++` (L595-603). Coherent.

### WARNING 1 (rowcount-gated session_ended; handoff never emits) — RESOLVED
§4.3 states the HARD INVARIANT: `session_ended` fires **iff the CAS UPDATE
returned rowCount>0** — gated on rowcount, not "the UPDATE ran." §4 + §5 test
strategies both assert **zero** `session_ended` after handoff-driven
abort+teardown, and §4 adds a direct already-terminal-row teardown test. The
abort→`endSession` path is correctly traced: abort breaks the loop with
`crashed=false` (verified: `crashed` is set only at provisioning L562/L649/L654 —
all `error`/catch paths, never on a clean abort-break), so teardown hits the
normal `endSession` branch and the CAS no-ops it. The Drizzle `.returning()`
rowcount-API UNVERIFIED flag with a SELECT-guard fallback is an **acceptable
builder-time decision** — the invariant is dialect-independent; only the
mechanism to read affected-rows is open, and a concrete in-tx SELECT fallback is
specified. Not a plan defect.

### WARNING 2 (admission errors → synchronous admit prefix, 500 preserved) — RESOLVED
§2 adds a synchronous `resolvedModel` presence guard in `admitSession` **before
the P5 row insert** (option (a)), throwing a `MissingCredentialError`-class error
the route maps to 500 pre-detach, pre-insert. Phase order re-verified: cost P2,
concurrency/adapter-select P3 (both pre-insert), new `resolvedModel` guard
pre-P5. The local-mode gap (builtin throwing "resolvedModel is required" at P9
`startSession` L195, inside the detached tail) is the exact hole closed. AC2 test
updated: §2 test-strategy bullet 3 asserts 500 + `code=MISSING_CREDENTIAL` + no
session row + harness never started, and §13 lists `R1` L296-343 as an unchanged
regression guard. Correct.

### Notes — RESOLVED
- **Protected-tests list (§13):** present and concrete — file:line for every
  broken/at-risk assertion (R1 L221-294, L344-388, L296-343, L455, L495;
  sessions.integration L78-87, L240-286; AD2 L65, L255-264, L351-487), each with
  a rewrite-or-regression-guard disposition. Closes the lone Dimension-9 miss
  (CC-008) from Round 1.
- **3 SUGGESTIONs (§14):** all three dispositioned as **folded** — reaper
  orphan-dir/admit-split ordering into §6.1, retry-path event emission into §7 +
  its tests, `createServer(port, deps?)` test-DI `@lore` into §1. None deferred
  silently.

### Round 2 verdict
**RESOLVED.** All four findings (2 CRITICAL, 2 WARNING) adequately addressed; both
notes closed. No CRITICAL remains. Proceed to build (red-phase first per §9). The
four findings carry forward as Phase 4 code-review watch-items: (1) builtin abort
calls `stopSession` not loop-break-only; (2) per-invoke `aborted` guard present +
AC5 asserts "no new tool call starts"; (3) `session_ended` emit gated on CAS
rowcount, with the chosen rowcount/SELECT mechanism actually wired; (4) the
`resolvedModel` guard sits pre-P5-insert and maps to 500.
