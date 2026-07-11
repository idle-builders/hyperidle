## Architecture Critique: AU9

ARCHITECTURE-SCORE: 8/10  rounds=3  score-line: SA:9 LI:8 AC:8 DM:9 N:8 MD:7 FMC:8 S:8 V:9

### CRITICAL

None.

### WARNING

None.

### SUGGESTION

- [plan §Ownership matrix and mechanical direct-handoff guard] Reword the older guard-fixture bullet “forbidden core file importing provisioning/harness/tool/MCP/context internals” to say it applies when imported for request/run execution. The surrounding policy and later permitted descriptor/read fixture already establish the correct narrow meaning, but matching wording would reduce implementer ambiguity.
- [plan §protectedTests] The family-freeze paragraph says “two AU9 paths” although three new AU9 integration files are listed after adding lifecycle observation; update the count mechanically when implementation begins.

### What's Working Well

- The plan now inventories every live direct handoff, including the re-engagement handler, and gives each family a transactional intent-first replacement.
- Mandatory leased outbox, authoritative source predicates, boot reconciliation, and idempotent request checkpointing fully specify loss/replay recovery.
- The guard is correctly scoped to AU9’s direct request/run edge, with alias/transitive-wrapper coverage, while opaque boot and unchanged descriptor/read surfaces remain for AU10/AU11.
- Completion, failure, and cancellation have an exact persisted/event/read-model contract and executable verification.

PASS — no CRITICAL or WARNING findings remain.

---

## Architecture Critique: AU9 Remediation-2 (2026-07-11)

Scope: the new `## Remediation-2` section of `plans/AU9/architecture.md` (root-cause diagnosis, R1/R2/R3, finding ledger, contract amendments), critiqued against the 13C/3W/1O in `code-review-remediation.md` and independently verified against current worktree source.

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:7 N:7 MD:7 FMC:5 S:8 V:7

### Factual verification of the amendment's claims (independently checked against source)

Root-cause trio — ALL THREE CONFIRMED TRUE:
- Terminal write: `terminalizeAgentSessionRequest` (agent-session-runtime.ts:110) does the correct `id+running+session_id` CAS + inbox insert and has ZERO production callers (only agent-request-custody.integration.test.ts:103-104). Production terminalizes via `markRequestTerminal` (agent-session-requests.ts:244) — plain UPDATE-by-id, no CAS, no inbox — wired at runtime:431,465 and boot:76. Confirmed.
- Intent claim: `reclaimAgentWorkIntent` (worker.ts:315) has the full token+expiry CAS and is unused in production (only a test imports it). `drainAgentWorkIntents` (worker.ts:440) claims via `claim()` (worker.ts:379) whose expired branch CASes `id + status=candidate.status` only (line 408) — no token/expiry. Confirmed race.
- Recovery: `recoverRunningAgentSessionRequests` (runtime:157) returns constant `{admitted:0,...}` and throws on a missing session (line 171); `removedSyntheticCheckpointScaffold` (runtime:176) throws immediately with a commented-out body beneath and zero callers. Confirmed.

Five "already-closed" (AC) claims — ALL FIVE CONFIRMED CLOSED IN SOURCE:
1. Decomposition atomicity: bet-decomposition.ts:421-425 CAS `decompositionStatus NULL→running` + `recordAgentWorkIntent(tx,...)` in one transaction. CLOSED.
2. Source-derived target / `requestedBy` audit-only: `resolveAuthoritativeInput` (worker.ts:80-305) reloads source and calls `requireRunnableActor` on the source-derived target for session_start, task_run, knowledge, routine, decomposition, reengagement; `requestedBy` confers authority nowhere. CLOSED for 6 families. Assistant (worker.ts:96) uses a *derived-but-templated* `ast-${message.senderId}` id + `requireRunnableActor` — the review's literal "targets the human" is STALE, but this is not a genuine assistant-row reload; the ledger honestly keeps this as C1=AT (not AC). Substance closed.
3. `requestAgentTermination` wired: sessions-routes.ts:207 (PATCH live-registry branch) + handoff-protocol.ts:110. CLOSED.
4. Projector registry + inbox drain + boot wiring: `AGENT_LIFECYCLE_PROJECTORS` (projectors.ts:108) with real writes for task/routine/decomposition/explicit and intentional `observeOnly` no-ops for assistant/knowledge/proposed_call; `drainAgentLifecycleInbox` (projectors.ts:118) has real token/lease/attempts/error handling (W2 genuinely closed); boot-wired at bootstrap.ts:87. CLOSED.
5. Retention FK-order: `reapTerminalAgentWorkIntents` (agent-work-intents.ts:89) deletes agentLifecycleInbox → agentWorkIntents → explicitSessionStarts → taskDispatchAttempts. CLOSED (boot-registration remains an honest AT residual under C10).

No AC tag was found false. The diagnosis is honest and accurate.

### CRITICAL

- [Remediation-2 §Contract amendments → "Single terminal writer" (line 82) vs §Request-worker custody state machine (line 256)] The single-terminal-writer contract says ONE function performs "every request terminal transition: CAS `id+running+session_id` ... All callers (runtime completion/failure, **boot admission failure**, PATCH/handoff/shutdown/cost-cap disposition, recovery) use it. `markRequestTerminal` is deleted." But `claimed→failed` is a real pre-admission terminal transition: the boot admission-failure path (`agent-layer-boot.ts:76`) and the pre-running synchronous-exception path (`agent-session-runtime.ts:465`, reached before `markRequestRunning`) terminalize a request that is still `claimed` with NO session. A `running+session_id`-only CAS writer matches zero rows for those callers → the request silently stays `claimed`, the admission failure is lost, and no inbox row is written. This is precisely the silent-CAS-no-op class the review flagged (W1/C7) — the headline fix, taken literally, re-enables the recurring bug for a third time. The §Request-worker custody state machine (line 256) still lists `claimed → failed` as a SEPARATE token-CAS transition, so the amendment contradicts itself. Fix: define the single terminal writer to accept BOTH preconditions (running-with-session OR claimed-with-winning-token → terminal, with inbox insert), or explicitly sanction a distinct pre-admission `claimed→failed` writer and list boot-admission-failure / pre-running-exception callers against IT — and annotate line 256 with the reconciliation.

### WARNING

- [Remediation-2 §Systemic rules → R1 (line 42)] R1's "exactly one function per operation" enumerates only 4 custody operations (intent claim/reclaim, request terminal, session reserve/adopt, running-recovery) and omits the other custody writers the state machine defines: `pending→claimed` (`claimAgentSessionRequestById`), `claimed→running` admission (`markRequestRunning`), `claimed→pending` release (`releaseRequestClaim`), and both lease renewals (`renewAgentSessionRequestLease` request-side, `renewAgentWorkIntentLease` intent-side). The exact correct-symbol/weak-symbol divergence the amendment exists to kill can recur on any un-enumerated writer. Fix: restate R1 as "every transition in the §Request-worker custody state machine has exactly one writer" and enumerate the full set (claim, admit/running, release, terminal ×2 preconditions, both renewals).

- [Remediation-2 §Finding ledger C6 (line 65) vs R1 (line 44)] C6 says "Delete `terminalizeAgentSessionRequest` if it is only a test constructor" — which is *literally true today* (it has zero production callers) — while R1 says delete `markRequestTerminal`. A builder reading C6 literally could delete the CORRECT CAS+inbox function and keep patching the weak one. Name the canonical symbol unambiguously: `terminalizeAgentSessionRequest` (extended to cover the `claimed→failed` precondition per the CRITICAL) IS the single terminal writer; wire every terminal caller to it and delete `markRequestTerminal`.

- [Remediation-2 §Systemic rules → R2 (line 50) + §Test-matrix additions (line 94)] R2's banned-test-import list names only `transitionAgentRunLifecycle` and `terminalizeAgentSessionRequest`; a builder can import `markRequestRunning`, `reserveOrAdoptSession`, `claimAgentWorkIntent`, or `recoverRequestedTerminations` into a protected suite and assert its return value while satisfying R2's letter. Additionally, the review-flagged `explicit-session-start.production.integration.test.ts` (classifier/existence assertions at :75-103) is NOT in R2's re-scope list, and `agent-lifecycle-projection.integration.test.ts:68` still asserts `recoverRequestedTerminations` is `toBeTypeOf("function")` — the exact existence-theater R2 bans. Fix: enumerate the full custody/claim/terminal/recovery helper set that protected suites may not import (or state it as "no import of any function from the agent-session-requests / agent-work-intent-worker custody surface except via the drain/route entrypoint"), and add the explicit-start suite to the R2 amend list.

### SUGGESTION

- [Remediation-2 R2/R3] R1 gives a mechanical reviewer recipe (`rg -a` the wiring); R2 ("assert DB rows") and R3 ("no manufactured rows") do not. Add: R3 reviewer greps `insert(sessions|agentSessionRequests|agentLifecycleInbox)` call sites and confirms each lives in the sanctioned intent→request→adoption chain; R2 reviewer greps each protected suite's import list against the banned custody-helper set. Without a recipe, R2/R3 are aspirational where R1 is checkable.
- [Remediation-2 §Finding ledger] The ledger covers all 13 CRITICAL (C1–C14, with C12 an explicit dup of C2) + W1–W3 but silently drops the 1 OBSERVATION (design lens skipped / no UI). Add a one-line N/A row so the ledger visibly accounts for 13C+3W+1O.
- [progress + amendment prose "findingsAlreadyClosedInWorktree"] The summary says "source-derived target validation for all 7 families" while the ledger correctly keeps assistant (C1) as AT (templated `ast-${senderId}`, not a genuine assistant-row reload). Align the summary wording to "6 families closed; assistant target reload tightened (C1)" to avoid an overclaim the next builder might trust.

### What's Working Well

- The root-cause diagnosis is factually accurate — every one of the three cited divergences (terminal write, intent claim, recovery) and all five AC "already-closed" claims verify against current source. This is the honest, code-grounded diagnosis the two prior regressions lacked.
- R1's "a correct-but-uncalled exported symbol counts as unimplemented, verified by `rg`-ing the production wiring" is exactly the mechanical anti-theater rule that would have caught this bug at review, and R3's naming `removedSyntheticCheckpointScaffold` as CRITICAL slop kills the specific dead corpse.
- The enumerated 10-check Durable-rows contract with a one-reject-case-per-check schema suite converts a vague "constraints are weak" finding into a mechanically-verifiable DoD.

VERDICT: FAIL — 1 CRITICAL, 3 WARNING. The diagnosis and most rules are strong, but the single-terminal-writer contract must be reconciled with the `claimed→failed` pre-admission transition (or it re-ships the recurring silent-no-op), and R1/R2 must close their enumeration gaps so the "exactly one writer" / "real entrypoint only" rules cannot be satisfied in letter while re-diverging in spirit. One more amendment round.

---

## Architecture Critique: AU9 Remediation-2, round 2 (2026-07-11)

Re-read fresh after the planner's round-1 revision. Verified claims against source where checkable.

ARCHITECTURE-SCORE: 8/10  rounds=2  score-line: SA:9 LI:9 AC:9 DM:8 N:9 MD:8 FMC:8 S:9 V:8

### Round-1 findings — disposition

- CRITICAL (terminal-writer contradiction) — RESOLVED. The "Single terminal writer" amendment (lines 90-94) now specifies both preconditions in one function with non-overlapping predicates: post-admission CAS `id+status='running'+session_id=observed` (+ `termination_reason IS NULL` for natural completion) and pre-admission CAS `id+status='claimed'+claim_token=winning-token` with a null-`session_id` inbox row. The two predicates key on `status`, which is exclusive (a request is `running` XOR `claimed`), so no request can match both; a request matching neither (already-terminal/pending) is an explicit zero-row no-op the caller reconciles — not a silent success. Both real pre-admission callers are named (agent-layer-boot.ts:76; agent-session-runtime.ts:465), both hold the winning claim token, and the §Request-worker custody bullets (lines 268-269) are annotated as the two branches of this single writer. The silent-no-op that recurred twice is closed.
- WARNING 1 (R1 enumeration gap) — PARTIALLY RESOLVED; residual below. R1 now enumerates intent claim/reclaim, intent lease renewal, request claim/reclaim, request lease renewal, admission (`markRequestRunning`), release (`releaseRequestClaim`), terminal (both preconditions), reserve/adopt, running-recovery, and inbox drain — a real improvement.
- WARNING 2 (keep/delete inversion) — RESOLVED. Verified all eight `markRequestTerminal`/`terminalizeAgentSessionRequest` mentions (lines 34,50,55,57,72,73,90,94,268,269): every actionable one says keep `terminalizeAgentSessionRequest` (extended), delete `markRequestTerminal`. C6 (line 72) now leads with "Do not delete `terminalizeAgentSessionRequest`." No stale reference in the Migrations or call-site sections.
- WARNING 3 (R2 too narrow) — RESOLVED. R2 (line 57) now enumerates the banned custody-surface imports across all five modules (including `handOffIntent`, `markRequestRunning`, `reserveOrAdoptSession`, `recoverRequestedTerminations`), gives the `rg`-the-import-list reviewer recipe, adds `explicit-session-start.production.integration.test.ts` to the R2 re-scope list (line 106), and names the `toBeTypeOf("function")` assertion at `agent-lifecycle-projection.integration.test.ts:68` for removal.
- Suggestions (O1 ledger row; R3 grep recipe) — RESOLVED. O1 is now ledger row 84 (N/A, 13C+3W+1O accounted for); R3 (line 59) has the `rg -a 'insert\((sessions|agentSessionRequests|agentLifecycleInbox)'` recipe.

### WARNING

- [Remediation-2 §R1 (lines 42-53) + §R3 (line 59)] R1 opens with the universal rule "every transition in the state machine and its intent-side mirror has exactly one function" and then presents its bullet list as "the full set (not a subset)" — but the list omits the request-birth/handoff operations, and a live weak parallel path exists for exactly these today: (a) `handOffIntent` (agent-work-intent-worker.ts:371) resolves + calls `createTriggeredAgentSessionRequest` and returns the request but does NOT checkpoint the intent `claimed→handed_off/request_id` — a second creation path parallel to the drain's inline checkpoint (worker.ts:452-471), with zero production callers (only the R2-banned `toBeTypeOf` assertion at agent-work-intent-production.integration.test.ts:224); (b) `createTriggeredAgentSessionRequest` has a second production caller at `agent-work-assistant.ts:532` (direct create outside the drain — the pre-remediation assistant path §Single request execution/Plan-reconciliation line 143 says to collapse). R3's mechanical recipe greps raw `insert(agentSessionRequests)`, which lands on the sanctioned wrapper in trigger-resolution.ts and does NOT flag a divergent *caller* of that wrapper. Net: request creation + intent `claimed→handed_off` checkpoint + intent `claimed→failed|pending` fail/release (`failOrRelease`) are the one custody-operation class that R1's "full set" claim covers only by its universal clause, not its enumeration, and that R3 cannot catch mechanically. These operations ARE governed in prose (§Single request execution names `handOffIntent`'s single role and the assistant split), so this is a reviewability-completeness hole, not a buildability hole — but it is the exact correct-symbol/weak-path shape the amendment exists to make structurally impossible. Fix (one-line each): add "request create + intent claimed→handed_off checkpoint → the drain's inline `createTriggeredAgentSessionRequest`+checkpoint transaction; delete `handOffIntent` or make it the sole non-drain create-and-checkpoint path" and "intent claimed→failed|pending → `failOrRelease`" to R1's list, and extend R3's recipe to grep `createTriggeredAgentSessionRequest(` call sites (must be exactly the drain; assistant direct-create collapsed).

### Internal-consistency checks (coordinator Q3/Q4)

- No new contradiction introduced by the edit. Line 90 supersedes both former state-machine bullets; lines 268-269 are annotated consistently; shutdown/cost-cap (line 100) route through `requestAgentTermination` → the single terminal writer (post-admission running branch), consistent. The pre-admission branch's null-`session_id` inbox row implies a nullable inbox `session_id` (matches the projector's `...(row.sessionId ? ...)` handling) — not enumerated in the Durable-rows checks but not contradicted.
- Keep/delete naming is unambiguous at every mention of both symbols; no stale reference survived the edit.

### What's Working Well

- The terminal-writer fix is exactly right: keying the two preconditions on mutually-exclusive `status` values makes "match neither / match ambiguously" structurally impossible, and naming both pre-admission callers by file:line makes the wiring mechanically checkable.
- R2's banned-import enumeration plus the `rg`-the-import-list recipe converts "no test theater" from an aspiration into a reviewer procedure, and it caught the real `toBeTypeOf` assertion still in the tree.

VERDICT: PASS (score 8, ≥7 ships). The blocking CRITICAL and all three round-1 WARNINGs are resolved; the amendment is buildable and every custody operation is governed somewhere in the plan. One residual WARNING remains — R1's "full set" enumeration and R3's grep recipe do not mechanically cover the request-creation / intent-handoff-checkpoint / fail-release operations, where a live weak parallel path (`handOffIntent`; `agent-work-assistant.ts:532` direct create) exists. This is a minor, one-line-each follow-up the planner should fold into R1/R3 before handing to the builder; it does not warrant a third full critique round. Ready for `/write-tests` once that fold-in lands, and the code reviewer must verify at Phase 4 that `createTriggeredAgentSessionRequest` has exactly the drain caller (assistant direct-create collapsed, `handOffIntent` removed or made the single sanctioned non-drain path).
