# AL7 Architecture Critique — Review-Gated Tool Execution (redo)

Reviewer: cold evaluation, separate agent from the designer. Verified every load-bearing claim against code (not the plan's word). Verdict at the bottom.

The reframe is sound and the keep/discard delta is largely correct. But the plan is **build-ready in its bookkeeping half and hand-waved in its execution half.** The three things that make the loop actually *work* end-to-end — byte-faithful replay, session-1 termination on capture, and the session-2 re-provision trigger — are all flagged as risks (R1/R3) and then deferred to "Task 7/8 must verify." That is the exact pattern that sank the first AL7: the demo-able mechanism shipped, the load-bearing mechanism didn't. Two of these are CRITICAL because without them the headline ACs (AC4, AC11) cannot pass, and the plan does not commit to a concrete mechanism for either.

---

## Findings

### CRITICAL-1 — Replay fidelity has no load-bearing mechanism; the proposed seam discards the seed. *(concept Open Detail 1; arch Phase 0 Q2, R3; `strategy-port.ts:50-65`)*

This is the crux, and I agree with the brief's instinct: it is the deepest risk and the plan does not solve it.

The model requires session 2's **LLM agent** to re-issue the approved call **byte-for-byte** so the SHA-256 identity hash matches the grant. The plan's mitigation (Phase 0 Q2, R3): "Session 2's assembled context (via `strategy.assembleContext`) is seeded with the approved Proposed Call's tool+args as an explicit instruction." 

**Verified: that seam cannot do this.** `ContextAssemblyOutcome` (`strategy-port.ts:62`) returns `{ itemCount, durationMs }` and **both production call sites discard the return entirely** (`@lore AK2`, lines 56-60). `assembleContext` writes knowledge items to `.fabric/manifest.json` on disk — it is a context-retrieval port, not a prompt-injection seam, and it has no channel to force "emit exactly `merge_pr({pr:42})` now." So the plan's named mechanism does not exist, and the plan does not identify the real one (the assembled prompt is composed in `session-provisioning.ts:612-643` from `buildSessionContextData`/`assemblePrompt`, a different surface entirely).

Even if a seed channel existed, the fundamental fragility remains: an LLM re-attempting a call from reassembled context is **not a deterministic replayer.** Args drift sources that break SHA-256 match: a re-summarized PR number, a re-serialized JSON arg with different key order or whitespace, a float rendered `42.0` vs `42`, a unicode normalization difference, a re-fetched "latest" value. On any drift → hash ≠ grant → call blocked → grant stays `consumed:false` → **the approved work never executes (deadlock).** The plan calls this "safe (surfaced as held), never wrong" — but a loop that *never executes the thing the human approved* is a product failure, not a safety win. AC4 and AC11 cannot pass on a flaky replay.

**Fix — pick one and commit in the plan (do not defer to Task 8):**
- **(a) Deterministic replay path (recommended).** Don't rely on the LLM to reproduce args. On grant mint, persist the captured `{toolId, args}` verbatim (already in the Proposed Call). In session 2, the *first* turn injects a tool-call **pre-filled by HyperIdle from the captured args** into the agent's message history (an assistant `tool_use` block with the exact recorded input), so the call the harness emits is the recorded bytes, not an LLM re-derivation. The agent's own tool/creds still execute it (Hard Rule 1 intact — HyperIdle does not call the tool, it seeds the exact request the agent's harness then runs). This is replay-from-record, which is what concept rejection #5 actually demands.
- **(b) Loosen the match to a canonical-args identity the LLM can hit reliably** — but this re-opens the "merge PR #42 → #99" hole the whole wrapper exists to close. Reject unless (a) is infeasible.
- **(c)** If neither lands, AL7 is **not done** and must say so — a probabilistic replay is not a shippable execution guarantee.

The plan must also state the **deadlock fallback**: if session 2 ends without consuming the grant, what is the user-visible state and the retry path? Currently undefined (R3 says "the loop stalls" and stops there).

### CRITICAL-2 — Session 1 has no mechanism to end on capture; the builtin loop feeds the block back to the LLM and continues. *(brief #3; `builtin-harness-adapter.ts:740-769`)*

The concept and doc both assert "session 1 ends (work paused, not suspended)" on capture. **Verified: nothing makes it end.** The wrapper (Phase plan §wrapper) returns `err("AWAITING_REVIEW", ...)` from `invoke`. In the builtin loop (`executeToolCalls`, `:740-757`), an error result is pushed back as a `tool_result` with `isError: true` and the loop **continues to the next LLM turn**. The LLM then sees "your call was blocked pending approval" and, per normal agent behavior, will (i) retry the same call — re-capturing a duplicate Proposed Call each iteration, (ii) retry with *varied* args (the SaboteurNew-Hire failure: now there are N Proposed Calls with N hashes, and the human reviews one while the agent intended another), or (iii) attempt a different irreversible call. None of these is "session ends cleanly with exactly one Proposed Call captured."

The MCP-routed path (SDK) has the same shape: a tool error returns to the harness subprocess, which keeps running.

This directly threatens AC1 ("captures it as a Proposed Call" — singular, clean) and AC9, and it makes the identity that the human reviews ambiguous.

**Fix — commit a mechanism in the plan:**
- After `captureProposedCall`, signal session termination: for builtin, set `session.aborted`/`session.done` so the loop breaks after returning the result (the abort rail at `:717` already exists — reuse it); for the MCP/SDK path, the wrapper cannot stop the subprocess, so the provisioning loop must observe a "captured" signal and abort the stream (mirror the AF7 §5 abort at `session-provisioning.ts:773`).
- Make capture **idempotent on identity hash within a session** so a retried identical call does not write duplicate Proposed Calls (UNIQUE on `(origin_session_id, identity_hash)` or upsert).
- Decide and document the policy for a *second distinct* irreversible call in session 1 (capture both? capture first, abort?). The plan is silent.

### CRITICAL-3 — Session-2 re-provision trigger does not fire for a same-owner resume. *(brief #4, R1; `task-dispatcher.ts:482-520`)*

The "work continues after review" promise (AC11) rests entirely on the task-dispatcher re-provisioning session 2 after approve. **Verified: it does not, for the AL7 case.**

`handleSessionEnded` (`task-dispatcher.ts:489-515`) Case 1 re-dispatches only when `task.ownerAgentId && task.ownerAgentId !== event.agentId` (`:503`) — i.e. **only on an owner change (handoff).** Session 2 in AL7 is the **same agent** resuming the **same task**, so `ownerAgentId === event.agentId` → the guard is false → no enqueue. Case 2 (`scheduleDrain`, `:518`) only drains the *existing* queue; it enqueues nothing. So after session 1 ends, **no path re-dispatches the task.** The verdict path (`threads.ts:1361-1382`) currently only calls `resolveStagedOperations` (being discarded) and emits `thread_resolved` — and nothing in the dispatcher subscribes to `thread_resolved` for re-provision.

The plan's handling (R1, Task 7/8): "the existing `session_ended` handler re-dispatches — verify the trigger fires; if not, emit a trigger explicitly." This is the founder's exact prior complaint: a load-bearing trigger asserted as "reuse existing" when the existing code provably doesn't cover the case.

**Fix:** the verdict→grant path must **explicitly** trigger re-provision (enqueue the task for the same owner, or emit a new `proposed_call_granted` event the dispatcher subscribes to). Add a re-dispatch path keyed on grant-mint, not owner-change. Guard against double-dispatch via the existing `hasActiveSession` check (`:506`). This must be in the ordered task list as a concrete code change, not a "verify."

### WARNING-4 — Grant `session_scope` cannot be session 2's id at mint time; the args/schema are internally inconsistent. *(brief #5, R2; arch schema §`one_shot_grants`)*

The plan is honestly aware (R2) but ships an inconsistent design. The `one_shot_grants.session_scope` comment says "session 2 id (or task id until session 2 minted)" and the wrapper pseudo-code matches on `(sessionScope, identityHash)` while `findUnconsumedGrant(ctx.db, ctx.sessionId, hash)` keys on `ctx.sessionId`. But **session 2's id does not exist at approve time** (it's minted when provisionSession runs later). So a grant scoped to session-2-id can never be found by session 2 (chicken/egg), and a grant scoped to task-id cannot be matched by `findUnconsumedGrant(..., ctx.sessionId, ...)`.

**Fix:** commit to **task-id + agent-id scope** (R2's own recommendation) and make the wrapper lookup key `(taskId, agentId, identityHash)` — `ctx` already carries enough to resolve the task (provisioning builds the registry with `params.taskId`). Update the schema column to `task_scope`/`agent_scope`, the index, and the wrapper signature to match. As written the three references (schema comment, wrapper `consumeGrant` key, `findUnconsumedGrant` signature) disagree.

### WARNING-5 — Canonicalization spec is one line for a security-load-bearing hash. *(brief #5; arch D3)*

The identity hash IS the security boundary (it's what makes "executed == reviewed" enforceable). D3 says "sorted keys, stable number/string encoding → SHA-256" — that is not enough to be safe or deterministic across the capture (session 1) and replay (session 2) JSON round-trips. Unspecified and load-bearing: nested-object key ordering (recursive, not just top-level), array order (must be preserved, not sorted), number canonicalization (`42` vs `42.0` vs `4.2e1`; JS `JSON.stringify` already normalizes but the spec must say so), unicode normalization (NFC) on string args, handling of `undefined`/`null` keys, and whether the hash is computed on `parsed.data` (post-Zod, which may apply defaults/coercion) or raw input. Since capture hashes `parsed.data` (wrapper line: `identityHash(name, parsed.data)`) and replay must hash the same post-parse shape, **the hash must be computed on the Zod-parsed value at both ends** — state this, or a default-filled field will silently break the match.

**Fix:** specify a canonical-JSON function (recursive key sort, preserve array order, NFC strings, reject non-finite numbers) and assert in Task 4's red test: round-trip `args → JSON → parse → canonicalize → hash` is stable, and key-reordered/whitespace-varied inputs produce the *same* hash while a changed value produces a *different* one.

### WARNING-6 — CAS atomicity is asserted but the Drizzle pattern + read-modify-write race is not specified. *(arch wrapper §, D2)*

AC6 (at-most-once) depends on `consumeGrant` being a genuine atomic conditional UPDATE. The plan cites "mirrors first-verdict-wins `WHERE resolvedAt IS NULL`" — good model — but the wrapper pseudo-code does `findUnconsumedGrant(...)` **then** `consumeGrant(...)` as two statements. Between them, a concurrent session-2 invoke (or a re-delivery) could also read `consumed:false`. The first-verdict-wins pattern (`threads.ts:1294-1303`) avoids this by doing the conditional UPDATE `... WHERE resolvedAt IS NULL` and checking `.returning().length === 0` — **the find and the claim are the same statement.** The plan must do the same: `UPDATE one_shot_grants SET consumed=true, consumed_at=now WHERE identity_hash=H AND <scope> AND consumed=false RETURNING *` and treat zero rows as "lost/already-consumed → block." Do not pre-read. Also note PGlite: `.changes` is unavailable (per the `@lore PGlite` note at `threads.ts:1258`) — use `.returning()`.

**Fix:** specify the single-statement CAS; Task 5 red test must invoke the granted call twice concurrently and assert exactly one Outcome.

### WARNING-7 — Outcome recording is inside the wrapper but failure/throw semantics are unspecified. *(arch wrapper §; concept Hard Rule 8; schema `operation_outcomes`)*

The wrapper does `consumeGrant` → `def.handler(...)` → `recordOutcome(...)`. Two gaps: (1) if `def.handler` **throws** (not returns an error result), the grant is already consumed (CAS won) but no Outcome is recorded → a consumed grant with no Outcome, the irreversible call may have half-fired, and Hard Rule 8 ("failure surfaces as a `failed` Outcome, never silent") is violated. The handler call must be wrapped so a throw records `status:failed` + the error and still surfaces. (2) Ordering: consume-then-execute means a process crash *between* consume and execute strands the grant consumed with the call un-run — for an irreversible call this is the worst failure mode. The plan should at minimum document this window and the recovery (the Proposed Call stuck `granted` with a consumed grant and no Outcome → surfaced as failed/needs-attention, never silently lost). AC10's "failure path" test must cover the handler-throws case, not just handler-returns-error.

### WARNING-8 — `classifyReversibility` is the gate's trigger and is under-specified / fail-open risk. *(arch Phase 0 Q4, wrapper §)*

The wrapper blocks only when `reversibility === "irreversible"`. So the classifier is the thing standing between an irreversible call and the world. Phase 0 Q4 says "MCP `destructiveHint`/`idempotentHint` where present; a small per-tool default otherwise." The failure mode that matters: **what is the default for an unknown tool with no hint?** If the default is "reversible," a brand-new irreversible tool **fires without review** — a silent ETHOS §3 violation and a security hole. ETHOS §3 / the doc say "unknown does not mean gated" for *reversibility*, but an unknown *reversibility* (no signal at all) is not the same as known-reversible. For AL7's gated arm the safe default for "no reversibility signal" should be **gate it** (fail-closed), not flow it. The plan must state the default explicitly and Task 4 must test the no-hint case.

### WARNING-9 — AC12 "executes nothing" is verified by a deletion/absence test, but the wrapper itself calls `def.handler`. *(arch AC12, wrapper §)*

AC12 claims "no HyperIdle-process tool dispatch exists" and verifies it by asserting the kernel-executor files are deleted. But the wrapper's `def.handler(parsed.data, ctx)` **is HyperIdle's process invoking the tool handler** — for builtin tools, that handler runs *in HyperIdle's process*, not the agent's external creds. This is fine for builtin (HyperIdle owns that loop by design), but it means "HyperIdle executes nothing" is literally false for the builtin path and true only for MCP-routed external-creds tools. The distinction the live-proof (AC4/R5) must honor: the **irreversible live-proof tool must be an agent-creds tool (MCP/external), not a builtin handler**, or the proof doesn't prove the inverted-ownership claim that the whole redo rests on. The plan gestures at this (R5, "agent's OWN tools/credentials, NOT HyperIdle's process") but the AC12 verification doesn't enforce it and the candidate list ("filesystem/echo MCP tool that writes a real file") could resolve to an in-process builtin. Pin the live-proof tool to a genuinely external-creds path.

### WARNING-10 — Live-proof lane (R5/AC4/AC11) is the DONE gate but the plan never names a wired tool. *(arch Phase 0 Q5, R5, Task 10)*

Per MEMORY (live-proof lanes run before ship; AH5 shipped 3x mocked) and Hard Rule 9, AL7 is not done without a real irreversible call executed by agent creds *and* the agent continuing. The plan honestly says this (R5) but leaves the tool "to confirm with the reviewer." That is the single highest-risk deferral given this concept already failed once. Until a concrete, environment-available, agent-creds irreversible tool is named and the end-to-end lane (block → capture → session-1-end → approve → re-provision → replay → consume → execute → Outcome → continue) is proven green, **AL7 cannot be marked done.** The ordered task list puts this last (Task 10) — correct order, but the topological-dependency MEMORY warns: the proof vehicle must be confirmed *available* before Task 5-8 build against it, or you discover at Task 10 there's nothing to run.

### NIT-11 — `held` is in `PROPOSED_CALL_STATUSES` but the doc lifecycle has no `captured → held` write path spec. *(arch type §, concept lifecycle)*

The status union includes `held`, set on a non-approving verdict. But the verdict path spec (threads.ts §) only describes the approve branch (mint grant). The transition to `held` on request-changes/reject (AC7) needs an explicit write. Minor — just make Task 7 cover the non-approve branch transition, not only approve.

### NIT-12 — `operation_outcomes` rename to `proposed_call_id` is a destructive migration on a table with a kept PK-as-FK; spell out the migration is a drop+recreate. *(arch schema §)*

Renaming a PK column that is also the FK target shape requires care in Drizzle/SQLite (no in-place column rename for PK/FK). Since AL7 is pre-production with no data to preserve (and the first AL7's rows are discardable), state that the migration drops and recreates `staged_operations`/`operation_outcomes` rather than ALTER — simpler and honest. Confirm no production data exists (it doesn't — pre-implementation).

### NIT-13 — `operation_executed` event rename touches UI subscribers; grep is listed but no subscriber inventory. *(arch Migrations §)*

The plan says "grep `operation_executed`" for subscribers but doesn't enumerate them. Quick: confirm whether `packages/web` subscribes (the review canvas likely re-renders on it). A missed subscriber = the Outcome silently never appears in the UI (AC10 UI half). List them in Task 9.

---

## What the plan gets right (verified)

- **The `registry.invoke` uniform-seam claim (#2) is TRUE.** Verified all three paths hit the *same per-session instance* built once at `session-provisioning.ts:582`: builtin via `session.registry.invoke` (`builtin-harness-adapter.ts:741`), the provisioning fallback loop via `registry.invoke` (`session-provisioning.ts:844`, gated to non-builtin + non-MCP so no double-execute), and the MCP bridge via `registry.invoke` (`mcp-bridge.ts:132`) closing over the same `registry` passed to `createMcpBridge` (`:661`). Wrapping the `invoke` closure (`tool-registry.ts:274`) is the correct single seam and covers builtin + all MCP-routed SDK/CLI calls. The Codex/opencode native-gate deferral is honest — their MCP-routed calls are still covered; only block-at-edge UX is deferred. **No hole here.** (Caveat: a tool the harness subprocess runs *without* routing through our MCP server — e.g. a CLI's built-in shell — bypasses the seam. The plan leans on the sandbox boundary for that, which is the correct pre-existing control, but should state that the live-proof tool must be an MCP-routed tool so it provably hits the seam.)
- **Keep/discard delta (#7) is sound.** Discarding `stage-operation.ts`, the dispatcher, `buildExecuteCapability`, `KERNEL_DISPATCHABLE_CAPABILITIES`, the boot sweep, and `dispatchDeps` is correct and nothing kept still assumes the executor model — except the verdict path (`threads.ts:1379-1381`) which still calls `resolveStagedOperations`; the plan correctly flags it for replacement. The table reshape is the right move; the `staged_operations` shape (`schema.ts:1004-1041`) is provably an exec-queue (`capabilityTool`, `operation`, `params`, `status:pending|executing`) and must be reshaped.
- **Concept ↔ doc ↔ plan are coherent** on the inverted-ownership model, the two-session shape, and the wrapper rationale. The agent-authored-field trust boundary (server-derived `reviewMessageId`/`subjectThreadId`) is correctly preserved.
- **AC mapping** is mostly concrete and test-backed; the negative cases (AC5/AC7/AC8/AC9) are well-specified.

---

## Score: 5 / 10 — REVISION NEEDED

3 CRITICAL, 7 WARNING, 3 NIT.

The architecture *frame* is right and would score ~8 on the bookkeeping half alone (clean seam, sound keep/discard, immutable capture, atomic-consume model). But three load-bearing mechanisms that the headline ACs (AC1, AC4, AC11) depend on are **asserted as "reuse/verify" when the code provably does not provide them**, and the deepest one — replay fidelity — names a seam (`assembleContext`) that structurally cannot do the job. That is below the no-CRITICAL bar for build-ready, and it is the same failure shape that got the first AL7 rejected: the demo-able half is solid, the load-bearing half is hand-waved to a downstream task.

**Verdict on the replay-fidelity risk (#1 — the crux):** Confirmed CRITICAL and unsolved. The plan's mitigation is non-load-bearing on two counts — (a) the named seam discards its return and cannot inject a forced call, and (b) even with a seam, an LLM is not a deterministic replayer, so the SHA-256 grant match is probabilistic and the failure mode is a silent deadlock of the approved work. The fix is a **replay-from-record** path: HyperIdle seeds session 2's message history with the captured `{toolId, args}` as a pre-filled tool-use block so the harness emits the recorded bytes (the agent's creds still execute it — Hard Rule 1 intact), rather than hoping the LLM reproduces the call. The plan must commit to this (or an equivalent deterministic path) and define the deadlock fallback before any code is written.

**To reach build-ready (≥7, no CRITICAL):** resolve CRITICAL-1/2/3 with concrete mechanisms in the ordered task list (not "verify in Task 8"), tighten WARNING-4/5/6 (scope, canonicalization, single-statement CAS), and pin the WARNING-10 live-proof tool to a named external-creds MCP tool available in the test env before building against it.

---

## Verified file references
- `packages/server/src/tools/tool-registry.ts:264-294` — the `invoke` closure (correct seam; no policy/grant logic yet).
- `packages/server/src/harness/builtin-harness-adapter.ts:702-770` — `executeToolCalls`: error result feeds back to the loop, session does NOT end (CRITICAL-2).
- `packages/server/src/services/session-provisioning.ts:582, 661, 703, 844` — single registry instance shared across all three paths (#2 confirmed).
- `packages/server/src/mcp/mcp-bridge.ts:102-135` — bridge closes over the same registry (#2 confirmed).
- `packages/fabric/src/services/task-dispatcher.ts:482-520` — `handleSessionEnded` re-dispatches only on owner *change* (CRITICAL-3).
- `packages/server/src/routes/threads.ts:1293-1382` — verdict resolution + first-verdict-wins CAS pattern (model for WARNING-6); current `resolveStagedOperations` call to discard.
- `packages/shared/src/strategy-port.ts:50-65` — `assembleContext` return discarded; not a prompt-injection seam (CRITICAL-1).
- `packages/db/src/schema.ts:1004-1059` — `staged_operations`/`operation_outcomes` exec-queue shape to reshape.
