# AL7 Architecture — Review-Gated Tool Execution (redo)

Fixed inputs: `plans/AL7/concept.md` (locked), `docs/process-layer/staged-operation.md` (ground truth, reframed). No `/design` (no novel UI; rides the existing action-operation review canvas).

**One-line:** HyperIdle rides each harness's native permission gate. Session 1 blocks the irreversible call and captures it (a **Proposed Call**) via the per-session `registry.invoke` wrapper, then **terminates session 1 via the abort rail**; the review's approve mints a **one-shot grant** and **explicitly enqueues** session 2 on the task-dispatcher; session 2 re-runs the recorded call **byte-faithfully — never by trusting the LLM to reproduce the args** — by one of two per-harness replay mechanisms (builtin: a deterministic `registry.invoke(recordedToolId, recordedArgs)` driven directly from the run loop; SDK: the `canUseTool` callback overwrites the LLM's args with the recorded approved args before execution), the wrapper consumes the grant once and permits it, the agent's own tool/creds run it, and the **Outcome** records the real return. HyperIdle executes nothing of its own.

**Critique r2 resolution (the one remaining CRITICAL — replay fidelity — grounded in code, per harness):**

The r1 `SessionConfig.messages` seeding was verified non-load-bearing: on builtin the seeded `tool_use` block is **LLM input**, not a dispatch — `runChatTurn`/`runExecuteTurn` hand `session.messages` to `callLlm` (`builtin-harness-adapter.ts:454-462, 596`) and the calls that reach `registry.invoke` come from **`response.content`** (`:471-483, 652-656`), i.e. the model's reply (re-derivation, the rejected path). And on the **production** harness (Claude Agent SDK) `config.messages` is read **nowhere** — the kickoff is a fixed prompt (`claude-agent-sdk-adapter.ts:172-174`); `SessionConfig.messages` is a builtin-only AH3 channel. So there was **no byte-faithful replay channel for any real harness**. Replaced with a real, per-harness mechanism:

- **CRITICAL-1a — builtin → deterministic replay through the agent's OWN registry.** A grant-bearing builtin session does **not** ask the LLM to re-issue the call. The run loop, when `permissionPolicy.sessionRole === "grant-bearing"`, drives a **direct `session.registry.invoke(recordedToolId, recordedArgs)`** as its first execute step — calling the **same per-session registry instance** (`session-provisioning.ts:582`, `setSessionToolRegistry`) the agent's own tools use — *before* the LLM gets a turn, bypassing `callLlm`. This is the agent's own tools + creds (the same `def.handler` the agent would have hit), NOT a kernel re-implementation and NOT a separate capability map (that distinction is what makes it acceptable vs. the rejected v1 executor). The wrapper hashes the recorded bytes, matches+consumes the grant once, runs `def.handler`, records the Outcome. The recorded tool-result is then appended to `session.messages` and the LLM continues the turn (the "work continues" half — AC11). Driven at a new replay seam in `runLoop` ahead of the execute loop (`builtin-harness-adapter.ts:368-385`); the existing `executeToolCalls`→`registry.invoke` path (`:741`) is reused for the invoke itself. Hash/grant still guard it (match recorded hash, consume once).
- **CRITICAL-1b — SDK (the PRODUCTION adapter) → `canUseTool` `updatedInput` arg-override.** Wire the **`canUseTool(toolName, input, options) => PermissionResult`** callback into `queryOptions` (currently only `permissionMode` is set — `claude-agent-sdk-adapter.ts:154-162`; `canUseTool` is net-new but small, ~one option + one resolver call). Session 2's SDK agent attempts the call; `canUseTool` looks up the single outstanding one-shot grant for `(taskScope, agentScope, toolName)` and returns **`{ behavior: "allow", updatedInput: <recorded approved args> }`** — overwriting the LLM's (possibly drifted) args with the **exact recorded approved args** before the SDK executes the tool with the agent's own session/creds. That guarantees executed == reviewed even under LLM drift, on the production harness. (SDK `PermissionResult` shape verified against current docs — `{ behavior:"allow"; updatedInput?: Record<string,unknown> }` — see Type signatures §.) Match rule below.
- **CRITICAL-1c — CLI / Codex / opencode → net-new transport, out of AL7's live-proof.** Their MCP-routed calls are still gated by the `registry.invoke` wrapper for the **block/capture half**; the **replay half** (a `canUseTool`-equivalent arg-override) is future per-adapter work. Stated honestly; not proven in AL7.
- **CRITICAL-2 (session 1 ends) → abort rail.** Verified `builtin-harness-adapter.ts:740-757`: a blocked tool result feeds back as `isError:true` and the loop continues. On capture the wrapper calls **`sessionRunRegistry.abort(ctx.sessionId)`** (`packages/server/src/services/session-run-registry.ts` → `stopSession` → sets builtin `aborted`, which `executeToolCalls` checks at `:717` before each invoke — the AF7 path). Capture is **idempotent per `(origin_session_id, identity_hash)`** so a racing retry mints no duplicate.
- **CRITICAL-3 (re-dispatch fires) → explicit enqueue.** Verified `task-dispatcher.ts:500-514`: `handleSessionEnded` re-dispatches *only on owner change* (`ownerAgentId !== event.agentId`) — false for AL7's same-agent resume. The verdict→grant path emits a new **`proposed_call_granted`** event; the dispatcher subscribes and enqueues the task for its current owner (guarded by `hasActiveSession`). Not relying on `handleSessionEnded`.

**Live-proof decision (pin — given v1 failed on exactly replay fidelity):** AL7 is DONE only on a **real live call executed through the agent's own tools** (Hard Rule 6). Two replay paths, two proof bars:
- **Builtin + `commit_file` (deterministic-registry-replay path) — provable now and REQUIRED for v1 DONE.** Fully expressible with the code in place (the run loop can drive `registry.invoke` directly; the MCP-exposed `commit_file` writes a real file). This is the byte-faithful path that does not depend on LLM reproduction at all, so it directly proves "executed == reviewed".
- **SDK + `commit_file` via `canUseTool` (the production target) — REQUIRED for v1 DONE too.** v1 failed precisely because the production harness had no replay channel; proving only builtin would re-bless the same gap. The `canUseTool` arg-override is net-new but small and fully expressible against the current SDK (`PermissionResult.updatedInput`, verified). The live-proof lane runs **end-to-end on the SDK adapter** (agent attempts `commit_file` with drifted args → `canUseTool` forces the recorded args → the agent's own SDK session executes → real file on disk → Outcome → agent continues). **Both harness lanes must go green before AL7 is DONE** — builtin proves the deterministic-replay mechanism, SDK proves the production path. Codex/opencode replay is explicitly deferred (CRITICAL-1c).

---

## Required reading (engineer, before implementing)

- `plans/AL7/concept.md` — the locked concept (nouns, rejection list, contracts, four resolved details).
- `docs/process-layer/staged-operation.md` — ground truth (reframed model + per-harness surface table).
- `packages/server/src/tools/tool-registry.ts:264-294` — `buildToolRegistry` + the `invoke` closure (THE wrapper seam).
- `packages/server/src/services/session-provisioning.ts:586-593, 700-722, 760-849, 1017-1024` — registry build, `setSessionToolRegistry`, `startSession`, the three invoke paths, `provisionSession`.
- `packages/server/src/mcp/mcp-bridge.ts:96-135` — the MCP invoke path (SDK production).
- `packages/server/src/harness/builtin-harness-adapter.ts:368-385, 590-668, 702-770` — `runLoop` execute-loop entry (the **builtin deterministic-replay seam**, CRITICAL-1a — drive `registry.invoke(recordedToolId, recordedArgs)` here before the LLM execute loop); `runExecuteTurn` (executed calls come from `response.content` `:652`, NOT the seed — why message-seeding was rejected); `executeToolCalls`/`registry.invoke` (`:741`, reused for the deterministic invoke + CRITICAL-2 abort at `:717`).
- `packages/server/src/harness/claude-agent-sdk-adapter.ts:154-162, 172-174` — `queryOptions` sets only `permissionMode`; fixed kickoff prompt; `config.messages` read nowhere. The **SDK replay seam** is a net-new `canUseTool` callback added to `queryOptions` (CRITICAL-1b).
- `packages/shared/src/harness/harness-adapter.ts:31, 91` — `ConversationMessage` + `SessionConfig.messages` (AH3 chat channel; **NOT** the replay seam — leave as-is for replay).
- `packages/server/src/services/session-run-registry.ts` — `abort` → `stopSession` (CRITICAL-2 session-1 termination).
- `packages/shared/src/strategy-port.ts:50-65` — `assembleContext` returns `{itemCount,durationMs}`, discarded; writes to disk. **NOT the replay seam.**
- `packages/fabric/src/services/task-dispatcher.ts:176, 189, 500-514` — `enqueue`/`hasActiveSession` (reuse); `handleSessionEnded` owner-change guard (CRITICAL-3: does NOT fire for same-agent resume — add `handleProposedCallGranted`).
- `packages/server/src/routes/threads.ts:1254-1392` — verdict resolution + (discard) dispatch wiring.
- `packages/server/src/routes/reviews.ts` — the review loader (renders the Proposed Call + Outcome).
- `packages/db/src/schema.ts:1004-1059` — the tables to reshape.
- `packages/shared/src/harness/harness-adapter.ts:36-92` — `SessionConfig` (extend with the policy).

---

## Phase 0 — Interrogation (resolved)

The concept pins fidelity (replay), seam (`registry.invoke`), one-shot (hash + atomic consume), and the reversible/work-continues loop. Remaining unsettled implementation questions, with my read:

1. **Where does the wrapper live — inside `ToolRegistry.invoke`, or at each of the 3 call sites?**
   *Read:* inside the `invoke` closure in `buildToolRegistry` (`tool-registry.ts:274`). All three call sites (builtin `:741`, provisioning loop `:844`, MCP bridge `:132`) call the *same* registry instance's `invoke` — the registry is built once per session in `runSession` and shared (`setSessionToolRegistry` for builtin, the loop closure for non-builtin, the bridge registry for MCP). Wrapping `invoke` covers all three uniformly with no per-call-site edits. **Confirm.**

2. **How does session 2 "replay" the exact call — does the agent re-issue it, or does HyperIdle force the recorded bytes?** *(CRITICAL-1 — REVISED r2, per-harness)*
   *Resolved:* **byte-faithful replay, never LLM reproduction.** An LLM is not a deterministic replayer — a re-summarized PR number, reordered JSON keys, `42` vs `42.0`, or a unicode shift would drift the args → SHA-256 ≠ grant → blocked → silent deadlock (a product failure). The r1 fix (`SessionConfig.messages` seeding) was verified **non-load-bearing on both real harnesses** (builtin: the seed is LLM context, the executed call still comes from `response.content` — `builtin-harness-adapter.ts:471-483, 652`; SDK: `config.messages` is read nowhere, fixed kickoff at `:172-174`). So replay is **mechanism-per-harness**, both of which force the recorded bytes without trusting the model:

   - **builtin — deterministic registry replay.** When session 2's `permissionPolicy.sessionRole === "grant-bearing"`, `runLoop` (after `runPlanningTurn`, before the LLM execute loop — `builtin-harness-adapter.ts:368`) drives **`session.registry.invoke(recordedToolId, recordedArgs)` directly** with the verbatim recorded args from the grant's Proposed Call. This calls the **agent's own per-session registry instance** (built once at `session-provisioning.ts:582`, shared by `executeToolCalls` at `:741`) — the same `def.handler` the agent's own call would hit, with the agent's own creds. It is NOT a kernel re-implementation and NOT a separate capability map (the v1 rejection); it is the agent's own tool, invoked deterministically instead of via a fragile LLM re-issue. The wrapper hashes the recorded bytes (= the grant hash by construction), consumes the grant once, runs the handler, records the Outcome. The Outcome's tool-result is appended to `session.messages` and the LLM then continues the turn (AC11 "work continues"). The exact seam: a new `replayGrantedCall(session)` step in `runLoop` ahead of the `while` execute loop (`:369`), reusing `executeToolCalls`/`registry.invoke` for the invoke.
   - **SDK (production) — `canUseTool` `updatedInput`.** The SDK owns its own agent loop; we cannot inject a dispatch into it, but we can **override the args of the call it makes**. Wire `canUseTool` into `queryOptions` (`claude-agent-sdk-adapter.ts:154-162`). The agent attempts the call; `canUseTool(toolName, input, opts)` resolves the single outstanding grant for `(taskScope, agentScope, toolName)` and returns `{ behavior:"allow", updatedInput: recordedArgs }`, overwriting whatever args the LLM produced with the **exact recorded approved args** before the SDK executes the tool with the agent's own creds. Even if the LLM drifts the args, executed == reviewed holds. The tool the SDK then runs is the agent's MCP-routed `commit_file` → bridge → `registry.invoke` (`mcp-bridge.ts:132`), which still hashes+consumes the grant (defence in depth: `canUseTool` forces the args, the wrapper enforces one-shot consume).

   *`assembleContext` and `SessionConfig.messages` are NOT the replay seam* — `assembleContext` writes knowledge to disk and discards its return (`strategy-port.ts:62`); `SessionConfig.messages` only seeds LLM context (builtin-only). Neither forces a call. Both left untouched for replay (the message channel keeps its AH3 chat meaning).
   *Match rule (both harnesses):* resolve grants by `(taskScope, agentScope, identityHash)` for the registry-replay path; the SDK `canUseTool` path resolves the outstanding grant by `(taskScope, agentScope, toolName)` (it has `toolName`+`input` but matches on the *outstanding* grant for the tool, then forces that grant's recorded args — it does not pre-trust the LLM's `input`). **Exactly one outstanding (unconsumed) grant for that `(task, agent, tool)` → force its recorded args and allow. Zero → `{ behavior:"deny" }` (no grant: block). More than one → `deny` (ambiguous; AL7's session-1 single-capture + one-grant-per-approve invariant means this should never occur — deny fail-closed and surface needs-attention rather than guess).** The registry-replay path is unambiguous by construction (it supplies the recorded args itself).
   *Deadlock fallback (committed, Task 8.5):* if session 2 ends with the grant still `consumed:false`, the `session_ended` handler detects the unconsumed grant for the ended session's task and (a) re-provisions **once** (single bounded retry, tracked by `retry_count` on the grant), then (b) on a second failure transitions the Proposed Call to **`held`** with a surfaced `outcome.status:failed` ("replay did not reach the gate — re-open to retry") so the user sees a failure, **never a silent hang**. With the deterministic registry-replay path on builtin the happy path no longer depends on the model, so the fallback is a true safety net, not the common case. **Confirmed.**

3. **What carries the policy + grant to the wrapper — `SessionConfig`, or a side channel?**
   *Read:* a new `permissionPolicy` field on `SessionConfig` (the init surface), threaded from `provisionSession` → `runSession` → `buildToolRegistry(ctx)` so the `invoke` closure can read it. The grant is read from the DB at invoke-time (keyed by `sessionId` + identity hash), not embedded in config — config carries the *block policy* (which reversibility blocks) and the *session role* (capture vs. grant-bearing). **Confirm.**

4. **Block-vs-allow classification at session 1 — how does the wrapper know a call is irreversible?** *(WARNING-8 — REVISED, fail-closed)*
   *Resolved:* AL7 ships the **gated arm** only (concept + ground-truth + AL8 note). `classifyReversibility(toolId, def)` resolves in order: (1) the tool definition's explicit `reversibility` field (AL7 adds an optional `reversibility?` to `RegisteredTool`); (2) MCP `destructiveHint`/`idempotentHint` where present (`destructiveHint:true` ⇒ irreversible; `idempotentHint:true` ⇒ reversible); (3) **default for no signal at all ⇒ `irreversible` (gated, fail-closed)**. A brand-new tool with no reversibility signal is **gated, never auto-flowed** — an unclassified call must not fire without review (ETHOS §3 / security). Note the distinction: a tool *known* reversible flows; *no signal* is not "known reversible" → it gates. The live-proof tool is given an explicit `reversibility:"irreversible"`. **Confirmed — minimal classifier, fail-closed default, no policy engine here.**

5. **What is the live-proof tool?** *(WARNING-9/10 — REVISED, named + pinned)*
   *Resolved:* a HyperIdle-registered, **MCP-exposed** tool **`commit_file`** that writes a real file into the session sandbox and is classified `irreversible`. Why this and not a builtin shortcut: the MCP bridge (`mcp-bridge.ts:120-135`) registers each tool with the agent's MCP client and its handler calls `registry.invoke` — so a call the SDK harness emits through **its own MCP client** provably hits the seam (the only path that gates), and the *executor is the agent's harness emitting the MCP request*, not HyperIdle's in-process loop. The real irreversible side-effect proven is a committed file on disk (asserted to exist with the exact recorded bytes). The production exemplar of the same shape is **`github_merge_pr`** (handler calls the GitHub API with the agent's creds) — named for the doc, not built in AL7 (no GitHub creds guaranteed in the test env). The live-proof MUST run end-to-end through the agent's MCP-routed session tool (Hard Rule 9). **Confirmed: `commit_file` is the AL7 live-proof tool; it is wired in Task 4 before Tasks 5-8 build against it (topological-order MEMORY).**

   *Honest seam note (WARNING-9 / verified-right §):* the HyperIdle MCP bridge exposes only HyperIdle-registered tools to the agent — it does NOT route the agent's *external* MCP servers through `registry.invoke`. A tool the harness subprocess runs without routing through our MCP server (e.g. a CLI's built-in shell) bypasses the seam; that egress is covered by the pre-existing **sandbox boundary**, not by AL7. The live-proof tool is therefore a HyperIdle-registered MCP-exposed tool *by design*, so it provably funnels through the seam.

---

## Phase 1 — Plan reconciliation (spec ⇆ reality)

| Spec/concept assumption | Reality | Plan handling |
|---|---|---|
| One uniform `registry.invoke` seam | TRUE but invoked at **3 call sites** (builtin `:741`, provisioning loop `:844`, MCP bridge `:132`) — all on the *same per-session registry instance* | Wrap the `invoke` **closure** in `buildToolRegistry`, not the call sites. One change, all paths. |
| `SessionConfig` is the init surface | Confirmed (`harness-adapter.ts:36`); has no permission field today | Add `permissionPolicy?` field; thread through `provisionSession`→`runSession`→`buildToolRegistry`. |
| SDK adapter has a native gate to ride | `claude-agent-sdk-adapter.ts` wires only `permissionMode` (`:154-162`); NO `canUseTool` | Native `canUseTool` is **net-new and REQUIRED for SDK replay** (CRITICAL-1b): it is the only way to force the recorded args on the production harness (`{behavior:"allow", updatedInput: recordedArgs}`). The `registry.invoke` wrapper still owns block/capture + one-shot consume; `canUseTool` owns SDK arg-override. |
| Codex/opencode native call-time gates | Codex CLI adapter is stdout-only; opencode SSE reply absent | **Net-new transport — out of scope for AL7's live proof.** Flagged; AL7 proves through builtin or SDK-MCP. |
| `staged_operations`/`operation_outcomes` tables exist | Confirmed `schema.ts:1004-1059` — shaped as a kernel-exec queue (`capabilityTool`, `operation`, `params`, `status: pending\|executing\|...`) | **Reshape** to a Proposed-Call record (capture, grant, outcome). Migration required (rename/repurpose columns; drop `capability_harness_type`; add `tool_id`, `args`, `identity_hash`, `origin_session_id`; add `one_shot_grants` table or grant columns). |
| Verdict approve fires `resolveStagedOperations` | `threads.ts:1379-1381` wired to the dispatcher | **Discard** dispatch call; replace with `mintGrant(...)` + emit `proposed_call_granted` (CRITICAL-3 trigger). |
| `app.ts` boot sweep + `dispatchDeps` | `app.ts:415-434` builds `buildExecuteCapability` + `sweepStrandedOperations` | **Discard** — no kernel executor, no stranded-executing sweep (HyperIdle holds no in-flight execution). |
| Reviews loader renders staged op | `reviews.ts` LEFT JOINs `operation_outcomes`, nests `stagedOperation` on artifact | **Keep + reshape** field names: `proposedCall` (tool, args summary, identity) + `outcome`. |
| Session 2 replay channel | Neither `assembleContext` (writes to disk, return discarded — `strategy-port.ts:56-62`) nor `SessionConfig.messages` (LLM context only; builtin executed call comes from `response.content` `:471-483,652`; SDK reads `messages` nowhere `:172-174`) forces a call. **No existing channel emits recorded bytes.** | **Per-harness replay:** builtin = a deterministic `registry.invoke(recordedToolId, recordedArgs)` driven from `runLoop` (`:368`) on the agent's own registry; SDK = `canUseTool` `updatedInput` arg-override (`:154-162`). Both leave `assembleContext`/`messages` untouched. (CRITICAL-1a/1b.) |
| task-dispatcher re-dispatch trigger | Confirmed `task-dispatcher.ts:500-514` — `handleSessionEnded` enqueues **only on owner change** (`ownerAgentId !== event.agentId`). AL7's session 2 is **same agent, same task** → guard false → **no re-dispatch**. The `enqueue`/`hasActiveSession` helpers (`:176,189`) are reusable; the *trigger* is not. | **Explicit trigger** — emit `proposed_call_granted` from the verdict→grant path; dispatcher subscribes (new handler) and `enqueue`s for `task.ownerAgentId`, guarded by `hasActiveSession`. NOT relying on `handleSessionEnded`. (CRITICAL-3.) |

---

## Phase 2 — Acceptance criteria + verification

Mapped from the workpackage ACs, reframed to the locked model.

| # | Acceptance criterion | Verification method |
|---|---|---|
| AC1 | Session 1 blocks an irreversible call at the gate, captures it as a Proposed Call (status `captured`) anchored to a review message + subject thread, **and session 1 terminates** (no continued retry loop). | Integration test: build a session registry with a block policy + capture role; `registry.invoke(irreversibleTool, args)` returns a blocked result AND a `proposed_calls` row exists with the exact `tool_id`, `args`, `identity_hash`, status `captured` AND `sessionRunRegistry.abort(sessionId)` was invoked (spy) so the builtin loop's `aborted` flag is set (CRITICAL-2). A **second identical** blocked call in the same session writes **no duplicate** row (idempotent on `(origin_session_id, identity_hash)`). |
| AC2 | A reversible call is allowed at the gate with no capture (no review). | Integration test: `registry.invoke(reversibleTool, args)` returns the normal tool result; zero `staged_operations` rows written. |
| AC3 | Approving the review mints a one-shot grant scoped to **task id + agent id** and transitions the Proposed Call to `granted`, **and emits `proposed_call_granted` which re-dispatches session 2**. | Integration test: POST verdict `approve` on the review message → a `one_shot_grants` row exists `{ proposedCallId, identityHash, taskScope, agentScope, consumed:false }`; Proposed Call status `granted`; a `proposed_call_granted` event was emitted AND the dispatcher `enqueue`d the task for `ownerAgentId` (CRITICAL-3, asserted via dispatcher queue snapshot / provisionSession spy). Non-approve → no grant, no event, status `held`. |
| AC4 | Session 2 (grant-bearing) re-runs the recorded call **byte-faithfully** (not LLM re-derivation), permits exactly the approved call once; the agent's own tool executes it; the real return is recorded as an Outcome. | **LIVE-PROOF integration test on BOTH harnesses** (Hard Rule 6). **Builtin:** provision session 2 grant-bearing with the recorded `{toolId,args}`; `runLoop` drives the deterministic `registry.invoke(recordedToolId, recordedArgs)` on the agent's own registry; the wrapper CAS-consumes the grant and runs the real `commit_file`. **SDK:** the agent attempts `commit_file` with **drifted args**; `canUseTool` returns `{behavior:"allow", updatedInput: recordedArgs}`; the SDK executes with the recorded args, MCP-routed → `registry.invoke` consumes the grant. Both: an `operation_outcomes` row records the genuine return (`status: ok`, `receipt`) and the **file exists on disk with the RECORDED bytes** (asserting the drift on SDK was overridden) — not a stub. |
| AC5 | A non-matching call in session 2 (different args → different hash) is blocked. | Integration test: session 2 with a grant for hash H; `registry.invoke(tool, differentArgs)` (hash ≠ H) → blocked; grant stays `consumed:false`; no Outcome. |
| AC6 | At-most-once: re-delivery / re-attempt of the same approved call after consumption is blocked (no double-execute). | Integration test: invoke the granted call **twice concurrently** (`Promise.all`) in session 2; the **single-statement CAS** (`UPDATE one_shot_grants SET consumed=true … WHERE … AND consumed=false RETURNING *`) means exactly one invoke gets a returned row and executes; the other gets zero rows → blocked; exactly **one** Outcome row. (No read-then-write — mirrors `threads.ts:1294-1303` first-verdict-wins.) |
| AC7 | A non-approving verdict never executes the Proposed Call; it stays `held`. | Integration test: POST `request-changes` → no grant minted; provision a follow-up session → the call is blocked (no grant); zero Outcome rows. |
| AC8 | A Proposed Call the human never approves is never executed. | Integration test: capture, never verdict → no grant ever exists → any session blocks it; zero Outcomes. |
| AC9 | Descriptive artifacts (code diff, doc) do NOT capture or execute on approve. | Integration test: a review whose subject is a descriptive artifact (no irreversible call attempted) → approve mints no grant, writes no Outcome. (Capture only happens when an irreversible *call* is attempted at the gate, never from artifact kind alone.) |
| AC10 | After execution, the result (ok/failure) returns to HyperIdle and is visible against the review. | Integration test: GET `/api/reviews/:reviewMessageId` after AC4 → response nests `proposedCall` + `outcome` (status, receipt or error) on the matching artifact. Failure path: a failing tool → `outcome.status: failed` + verbatim error, never silent. |
| AC11 | The agent continues working in session 2 after the approved call executes (work-continues loop). | LIVE-PROOF test: after the deterministic replay (builtin) / `canUseTool` execute (SDK) records the Outcome, the recorded tool-result is in the LLM's context and session 2's stream produces ≥1 further agent action (a follow-up tool call or completion) — the session does not end at the granted call. (Builtin: the LLM execute loop runs *after* the replay step injects the result; SDK: the SDK loop continues natively.) |
| AC11b | **Deadlock fallback (CRITICAL-1):** if session 2 ends with the grant still `consumed:false` (e.g. SDK agent never attempts the tool, or a crash before consume), the work does not silently hang — it is re-provisioned once, then surfaced as failed. | Integration test: provision session 2 whose harness does NOT reach the grant (no-op harness fixture); `session_ended` fires with an unconsumed grant → exactly **one** bounded re-provision (grant `retry_count` → 1); a second no-consume end → Proposed Call `held` + `operation_outcomes` row `{status:failed, error:"replay did not reach the gate"}`. Never an indefinite loop, never a silent stall. (Builtin's deterministic-replay path consumes the grant before the LLM runs, so this fallback is the safety net, not the common case.) |
| AC12 | HyperIdle executes nothing — no HyperIdle-process kernel-executor dispatch exists; the live-proof tool is **agent-creds / MCP-routed**, not an in-process builtin shortcut. | Static: `npm run check` + an ESLint guard / absence test — `staged-operation-dispatcher.ts`, `stage-operation.ts`, `buildExecuteCapability`, `KERNEL_DISPATCHABLE_CAPABILITIES` are deleted; no import resolves them. **Plus** the live-proof lane (AC4) proves the executor is the agent's MCP-routed call (the `commit_file` handler runs only because the agent's harness emitted the MCP request through its own client → bridge → `registry.invoke`), not a HyperIdle-initiated dispatch. (The builtin path's `def.handler` runs in-process by design — HyperIdle owns that loop — so the inverted-ownership claim is proven on the MCP path, per WARNING-9.) |
| AC13 | Verdict grammar unchanged. | Existing `threads.ts` verdict tests stay green (protected); no new verdict value. |

---

## Phase 3 — Design-it-twice (load-bearing decisions)

### D1 — The wrapper seam: wrap `ToolRegistry.invoke` vs. wrap each call site

- **A (chosen): wrap the `invoke` closure in `buildToolRegistry`.** All three call sites share one per-session registry instance; wrapping `invoke` covers builtin/loop/MCP uniformly. *Trade-off:* the wrapper must read session-scoped policy + grant — `ctx` already carries `sessionId`/`taskId`/`agentId` (`session-provisioning.ts:572-581`); only `permissionPolicy` is added to `ToolContext`. *Reject the alternative because:* wrapping the 3 call sites triples the surface, drifts (the X5/X6 double-execute guards already show how fragile per-site logic is), and a 4th adapter would need a 4th edit.
- **B: a `PreToolUse`-style hook per adapter (SDK `canUseTool`, Codex JSON-RPC, opencode SSE).** *Trade-off:* blocks at the harness edge (better UX, fewer wasted tokens). *Reject as the source of truth because:* not all adapters have it today (net-new transport for Codex/opencode), and none express "this exact call once" — so the one-shot enforcement still has to live at `registry.invoke`. **B is additive dressing, layered on A later.**

**Synthesis:** A is the source of truth; native gates are optional optimization. AL7 ships A + the init `permissionMode`/policy already present on SDK.

### D2 — Grant storage: a `one_shot_grants` table vs. grant columns on `staged_operations`

- **A (chosen): a separate `one_shot_grants` table** `{ proposed_call_id PK/FK, identity_hash, task_scope, agent_scope, consumed (bool), retry_count, minted_at, consumed_at }`. *Trade-off:* one more table. *Why:* the grant has its own lifecycle (minted at approve, consumed in session 2, can be re-minted on re-open) and the **atomic consume** is a single conditional UPDATE `WHERE consumed = false RETURNING *` (mirrors first-verdict-wins, no read-then-write). A re-open mints a *new* grant row without mutating the Proposed Call's immutable capture. Scope is `(task, agent)` — session 2's id does not exist at mint (WARNING-4).
- **B: `granted_to_session` + `consumed_at` columns on `staged_operations`.** *Trade-off:* fewer tables. *Reject because:* it muddies the Proposed Call's immutability contract (capture must not be mutated post-review) and complicates re-open (a second grant for the same call).

### D3 — Identity hash: SHA-256 over canonical JSON of `{tool_id, args}` *(WARNING-5 — fully specified)*

The identity hash IS the security boundary ("executed == reviewed"), so canonicalization is fully specified — capture-side (session 1) and replay-side (session 2) must hash **identically** across JSON round-trips.

`canonicalJson(value)` — recursive, deterministic:
- **Object keys:** sorted lexicographically (`Object.keys().sort()`), **recursively at every nesting depth** (not just top-level).
- **Arrays:** order **preserved** (never sorted — order is semantic).
- **Numbers:** rely on JS `JSON.stringify` number normalization (`42` and `42.0` and `4.2e1` all serialize to `42`); **reject non-finite** (`NaN`/`Infinity` → throw, never silently `null`).
- **Strings:** **NFC-normalized** (`String.prototype.normalize("NFC")`) so unicode-equivalent inputs hash identically.
- **`undefined`/`null`:** `undefined`-valued keys are dropped (JSON semantics); `null` is preserved as `null`.
- **Hash input:** computed on **`parsed.data` (the Zod-parsed value), at both ends** — Zod may apply defaults/coercion, so hashing raw input at capture and parsed at replay would diverge. Capture hashes `identityHash(name, parsed.data)`; replay seeds the *raw* recorded args, the wrapper re-parses, and hashes the same post-parse shape. State this in code (`@lore`) and assert it.
- `identityHash(toolId, args) = sha256hex(canonicalJson({ t: toolId, a: args }))`.

*Reject "store args and deep-equal at match time":* equality semantics over arbitrary JSON are exactly what canonical-hash avoids; the hash is the grant's match key and the dedupe identity in one.

Task 4 red test asserts: (1) `args → JSON.stringify → JSON.parse → canonicalJson → hash` is **stable** (round-trip identity); (2) key-reordered and whitespace-varied inputs produce the **same** hash; (3) a changed value or NFC-distinct unicode produces a **different** hash; (4) `NaN`/`Infinity` throws.

---

## Type signatures / schemas / endpoints

### `SessionConfig` extension (`packages/shared/src/harness/harness-adapter.ts`)
```ts
// add to SessionConfig:
readonly permissionPolicy?: SessionPermissionPolicy;   // SessionPermissionPolicy defined in the replay section below
```
`SessionPermissionPolicy` (capture-vs-grant role + the recorded `grantedCall` payload) is defined under "Per-harness replay" below — it carries the recorded `{toolId, args, identityHash}` so both the builtin deterministic-replay loop and the SDK `canUseTool` resolver can force the recorded bytes. `ConversationMessage` is **not** widened (the r1 widening served the rejected message-seed path).

### Per-harness replay (CRITICAL-1) — two real mechanisms, both force the recorded bytes

The grant-bearing session knows the recorded `{toolId, args}` (read from the grant's Proposed Call). It carries `permissionPolicy.sessionRole === "grant-bearing"` plus the recorded call. `SessionPermissionPolicy` carries the replay payload:
```ts
export interface SessionPermissionPolicy {
  readonly blockReversibility: readonly ("irreversible")[];
  readonly sessionRole: "capture" | "grant-bearing";
  /** AL7 CRITICAL-1: when grant-bearing, the recorded approved call session 2 must run byte-faithfully. */
  readonly grantedCall?: {
    readonly toolId: string;
    readonly args: Record<string, unknown>; // verbatim recorded approved args
    readonly identityHash: string;
  };
}
```

**(a) builtin — deterministic registry replay.** No `ConversationMessage` widening, no `tool_use` seed (that was the rejected r1 path — it only feeds the LLM). Instead `runLoop` gains a replay step ahead of the execute loop:
```ts
// builtin-harness-adapter.ts runLoop, after runPlanningTurn, before the `while` execute loop (~:368):
if (session.config?.permissionPolicy?.sessionRole === "grant-bearing" && session.registry) {
  const granted = session.config.permissionPolicy.grantedCall;
  if (granted) {
    // Deterministic replay: invoke the AGENT'S OWN per-session registry with the
    // RECORDED bytes — not an LLM re-derivation. Reuses executeToolCalls→registry.invoke (:741).
    const seededBlock: LlmToolUseBlock = { type:"tool_use", id: replayId(), name: granted.toolId, input: granted.args };
    const [result] = await this.executeToolCalls(session, [seededBlock]);  // → registry.invoke(granted.toolId, granted.args)
    // Append the recorded assistant call + its tool_result so the LLM continues the turn (AC11):
    session.messages.push({ role:"assistant", content:[seededBlock] });
    session.messages.push({ role:"user", content:[result] });
  }
}
// … existing execute loop runs next: the LLM continues working with the executed result in context.
```
The wrapper (in `registry.invoke`) hashes `granted.args` (= `granted.identityHash` by construction), CAS-consumes the one grant, runs the agent's own `def.handler`, records the Outcome. HyperIdle does not call the tool — it drives the agent's own registry with the recorded args; `def.handler` is the agent's tool (MCP-routed for `commit_file`). The LLM never gets to re-derive the call; it only continues afterward.

**(b) SDK (production) — `canUseTool` arg-override.** Wire a `canUseTool` callback into `queryOptions` (`claude-agent-sdk-adapter.ts:154-162`). Signature + return shape verified against current SDK docs (code.claude.com/docs/en/agent-sdk/typescript):
```ts
type CanUseTool = (toolName: string, input: Record<string, unknown>, opts: {...}) => Promise<PermissionResult>;
type PermissionResult =
  | { behavior: "allow"; updatedInput?: Record<string, unknown>; /* … */ }
  | { behavior: "deny"; message: string; /* … */ };
```
The adapter is constructed with a grant resolver (a small injected fn closing over `db` + `(taskScope, agentScope)`). `canUseTool` resolves the outstanding grant for `(taskScope, agentScope, toolName)` and returns the recorded args, overriding the LLM's:
```ts
const canUseTool: CanUseTool = async (toolName, _llmInput) => {
  const grant = await resolveOutstandingGrant(taskScope, agentScope, toolName); // unconsumed, for this tool
  if (!grant) return { behavior: "deny", message: `No grant for ${toolName}` };          // 0 → block
  if (grant.ambiguous) return { behavior: "deny", message: `Ambiguous grant for ${toolName}` }; // >1 → fail-closed
  return { behavior: "allow", updatedInput: grant.recordedArgs };                          // force recorded bytes
};
queryOptions.canUseTool = canUseTool;
```
The SDK then executes the tool with `updatedInput` = the recorded approved args, using the agent's own session/creds. The agent's MCP-routed `commit_file` still funnels through `mcp-bridge.ts:132` → `registry.invoke`, where the wrapper CAS-consumes the grant (one-shot enforcement is wrapper-owned at both ends; `canUseTool` owns *arg-fidelity*). **Match rule:** exactly one unconsumed grant for `(task, agent, tool)` → force its args + allow; zero → deny; more than one → deny (fail-closed; AL7's single-capture + one-grant-per-approve invariant means >1 never occurs).

### Proposed Call (`packages/shared/src/proposed-call.ts` — replaces `staged-operation.ts`)
```ts
export const PROPOSED_CALL_STATUSES = ["captured", "granted", "executed", "failed", "held"] as const;
export type ProposedCallStatus = (typeof PROPOSED_CALL_STATUSES)[number];

export const REVERSIBILITY = ["irreversible", "reversible"] as const;
export type Reversibility = (typeof REVERSIBILITY)[number];

/** The captured call — what the human reviews. Immutable once captured. */
export interface ProposedCall {
  readonly id: string;
  readonly reviewMessageId: string;   // the gate
  readonly subjectThreadId: string;   // anchor
  readonly artifactId: string;        // action_operation artifact it nests on
  readonly originSessionId: string;   // session 1
  readonly toolId: string;            // verbatim tool name the agent called
  readonly args: Record<string, unknown>; // verbatim input
  readonly identityHash: string;      // SHA-256 over canonical {toolId, args}
  readonly reversibility: Reversibility;
  readonly status: ProposedCallStatus;
}
```

### DB schema reshape (`packages/db/src/schema.ts`) — migration required
`staged_operations` → repurposed as `proposed_calls`:
- DROP: `capability_tool`, `capability_harness_type`, `operation`, `consequence_id` (kernel-exec fields).
- ADD: `tool_id` (text), `args` (text JSON), `identity_hash` (text), `origin_session_id` (FK → sessions.id).
- KEEP: `id`, `review_message_id` (FK, index), `subject_thread_id` (FK, anchor index), `artifact_id` (FK), `reversibility`, `status` (now `captured|granted|executed|failed|held`), `staged_by_agent_id`, `created_at`.
- INDEX: `(review_message_id, status)`; `(identity_hash)`.
- REMOVE the `idempotency_key` UNIQUE (the identity hash + grant-consume is the at-most-once guard now).

NEW `one_shot_grants` *(WARNING-4: scope = task id + agent id, NOT a not-yet-minted session 2 id)*:
```ts
export const oneShotGrants = pgTable("one_shot_grants", {
  proposedCallId: text("proposed_call_id").primaryKey().references(() => proposedCalls.id, { onDelete: "restrict" }),
  identityHash: text("identity_hash").notNull(),
  // WARNING-4: session 2's id does NOT exist at mint time (minted when provisionSession runs later).
  // Scope to the (task, agent) that uniquely identifies the re-provision instead.
  taskScope: text("task_scope").notNull(),     // tasks.id — session 2 for this task is the unique re-provision
  agentScope: text("agent_scope").notNull(),   // agents.id — the same owner resuming
  consumed: integer("consumed", { mode: "boolean" }).notNull().default(false),
  retryCount: integer("retry_count").notNull().default(0), // CRITICAL-1 deadlock fallback: bounded re-provision
  mintedAt: text("minted_at").notNull(),
  consumedAt: text("consumed_at"),
}, (t) => [index("grants_match_idx").on(t.taskScope, t.agentScope, t.identityHash, t.consumed)]);
```
The wrapper resolves the grant by `(taskId, agentId, identityHash)` — `ctx` already carries `taskId` + `agentId` (`session-provisioning.ts:577,575`). The schema comment, the wrapper `consumeGrant` key, and the lookup signature **all agree on `(taskScope, agentScope, identityHash)`** (the prior `session_scope`/`findUnconsumedGrant(ctx.sessionId,...)` inconsistency is removed).

`operation_outcomes` → kept, FK renamed `proposed_call_id` (PK, enforces 0..1 + immutability). Fields `status (ok|failed)`, `payload`/`receipt`, `error`, `executed_at`. *(NIT-12: this is a destructive **drop+recreate** migration — renaming a PK-that-is-also-FK-target is not an in-place SQLite ALTER. Pre-implementation, no production rows exist, so drop+recreate `staged_operations`/`operation_outcomes` is correct and honest — state it in the migration file.)*

### The wrapper (inside `buildToolRegistry.invoke`, `tool-registry.ts`)
```ts
// ctx gains: sessionId, taskId, agentId (already present at :577,575), permissionPolicy?, db (present)
async function invoke(name, rawArgs): Promise<ToolResult> {
  // ... existing role/schema checks; parsed = def.inputSchema.safeParse(rawArgs) ...
  const reversibility = classifyReversibility(name, def);     // fail-closed: no signal ⇒ irreversible (WARNING-8)
  if (ctx.permissionPolicy && reversibility === "irreversible") {
    const hash = identityHash(name, parsed.data);             // hash on PARSED data, both ends (WARNING-5)

    // WARNING-6: single-statement atomic CAS — the find AND the claim are ONE UPDATE.
    // No pre-read. Mirrors threads.ts:1294-1303 first-verdict-wins. PGlite: use .returning()
    // (.changes is unavailable — @lore threads.ts:1258).
    const [grant] = await ctx.db
      .update(oneShotGrants)
      .set({ consumed: true, consumedAt: nowIso() })
      .where(and(
        eq(oneShotGrants.taskScope, ctx.taskId),
        eq(oneShotGrants.agentScope, ctx.agentId),
        eq(oneShotGrants.identityHash, hash),
        eq(oneShotGrants.consumed, false),                    // ← the conditional claim
      ))
      .returning();

    if (grant) {
      // WARNING-7: wrap the handler so a THROW still records a failed Outcome (Hard Rule 8),
      // never a consumed grant with no Outcome and a half-fired irreversible call.
      try {
        const result = await def.handler(parsed.data, ctx);   // AGENT'S tool runs it (MCP-routed)
        await recordOutcome(ctx.db, grant.proposedCallId, result); // real return (ok|failed-result)
        return result;
      } catch (e) {
        await recordOutcome(ctx.db, grant.proposedCallId, errOutcome(e)); // status:failed + error
        return err("EXECUTION_FAILED", `Granted call ${name} threw: ${String(e)}`);
      }
    }

    // Zero rows: either session 1 (no grant) OR session 2 non-match/already-consumed → never executes.
    // captureProposedCall is idempotent on (origin_session_id, identity_hash) (CRITICAL-2) — a racing
    // retry writes no duplicate. On a FIRST capture in this session, terminate session 1 via the abort rail.
    const captured = await captureProposedCall(ctx.db, {
      originSessionId: ctx.sessionId, taskId: ctx.taskId, agentId: ctx.agentId,
      toolId: name, args: parsed.data, hash, reviewMessageId, subjectThreadId,
    }); // returns { firstCapture: boolean }
    if (captured.firstCapture) {
      await sessionRunRegistry.abort(ctx.sessionId);          // CRITICAL-2: end session 1 (stopSession → builtin aborted)
    }
    return err("AWAITING_REVIEW", `Call to ${name} blocked pending human approval.`);
  }
  return def.handler(parsed.data, ctx);                       // reversible → allow
}
```
*CRITICAL-2 detail:* `sessionRunRegistry.abort` (`session-run-registry.ts:abort`) calls `stopSession`, which sets the builtin session's `aborted` flag; `executeToolCalls` (`:717`) checks it before the next invoke, so the loop breaks after returning this blocked result — exactly one Proposed Call, no retry-with-drift. For the SDK/MCP path the provisioning event loop's `aborted` flag (`session-provisioning.ts:773`) is the secondary stop; the registry abort's `stopSession` terminates the subprocess.
*Crash window (WARNING-7):* CAS-consume-then-execute means a process crash between consume and the tool firing strands a `granted` Proposed Call with a consumed grant and no Outcome. Documented recovery: such a grant is surfaced (consumed, no Outcome, no `executed`/`failed`) as **needs-attention / failed** — never silently lost. (A pre-execute "execute-then-record" ordering can't give at-most-once, so consume-first is correct; the window is documented, not eliminated.)
*Note:* `reviewMessageId`/`subjectThreadId` are **derived server-side** from the session's task/thread → the review message the session-review-creator opens. Reuse the existing review-creation path; the agent never authors them (concept rejection #4).

### Verdict path (`threads.ts`) *(CRITICAL-3 — explicit re-dispatch trigger)*
Replace the `resolveStagedOperations(dispatchDeps, ...)` call (lines ~1371-1381). On `approve`/`approve-with-comments` for a review message backing a `captured` Proposed Call, inside the same verdict transaction:
1. `mintGrant(tx, { proposedCallId, identityHash, taskScope: task.id, agentScope: task.ownerAgentId })` — insert the `one_shot_grants` row (`consumed:false`, `retryCount:0`).
2. Transition the Proposed Call `captured → granted`.
3. After commit, emit a **new `proposed_call_granted` kernel event** `{ type:"proposed_call_granted", streamId: subjectThreadId, proposedCallId, taskId, agentId, identityHash, timestamp }`.

The task-dispatcher gets a **new subscription** `handleProposedCallGranted` that `enqueue`s `{ taskId, agentId, teamId }` for the grant's owner — guarded by the existing `hasActiveSession(db, taskId)` (`task-dispatcher.ts:506`) so a double-dispatch can't occur. This is the explicit trigger; it does **not** rely on `handleSessionEnded`'s owner-change guard (which is provably false for AL7's same-agent resume — CRITICAL-3 verified at `:500-514`). Add `proposed_call_granted` to the `KernelEvent` union (`events.ts:414`). Remove the `dispatchDeps` thread-through.

*Non-approve branch (NIT-11):* `request-changes` / `edit` / `reject` on a `captured` Proposed Call transition it `captured → held` (explicit write) and mint no grant, emit no `proposed_call_granted`. Task 7 covers both branches.

### Reviews loader (`reviews.ts`) + subscribers (NIT-13)
LEFT JOIN `proposed_calls` + `one_shot_grants` + `operation_outcomes` by `review_message_id`; nest `{ proposedCall: { toolId, argsSummary, identityHash, status }, outcome?: { status, receipt|error, executedAt } }` on the matching `action_operation` artifact. Keep the `rev-1` fixture branch.

**`operation_executed` → `proposed_call_executed` rename touches 3 known subscribers** (enumerated, NIT-13):
- `packages/server/src/services/observability/dispatcher.ts:494` — `case "operation_executed"` span mapping → rename.
- `packages/web/src/pages/review/review-composition.ts` — `StagedOperationView`/`StagedOperationOutcomeView` view types → `ProposedCallView`/`OutcomeView`.
- `packages/web/src/pages/review/ReviewComposition.tsx:672-679` — reads `artifact.stagedOperation?.{status,outcome}` → `artifact.proposedCall?.{status,outcome}`. A missed subscriber = the Outcome never re-renders in the review canvas (AC10 UI half), so these three are updated in Task 9.

---

## Per-harness implementation surface (config vs net-new)

| Harness | AL7 surface | Replay mechanism | Class |
|---|---|---|---|
| builtin | wrapper at shared `registry.invoke` (`:741`); session-1 termination via `sessionRunRegistry.abort`→`stopSession` (`:717` honors `aborted`) | **deterministic registry replay** — `runLoop` (`:368`) drives `registry.invoke(recordedToolId, recordedArgs)` on the agent's own per-session registry before the LLM execute loop (CRITICAL-1a) | **config + new replay step** (HyperIdle owns the loop) |
| Claude Code (SDK) | production routes tools via MCP bridge → shared `registry.invoke` (`mcp-bridge.ts:132`); `permissionMode` already wired (`:154-162`) | **`canUseTool` arg-override** — `{behavior:"allow", updatedInput: recordedArgs}` forces the recorded approved args before SDK execution (CRITICAL-1b); MCP-routed call still hits the wrapper for one-shot consume | **net-new `canUseTool` (required)** |
| Codex | native `execCommandApproval`/`applyPatchApproval` JSON-RPC needs bidirectional app-server transport (CLI is stdout-only) | block/capture via wrapper covered; **replay = net-new per-adapter `canUseTool`-equivalent, deferred** (CRITICAL-1c) | **net-new transport** — out of AL7 live-proof |
| opencode | `permission.asked` SSE reply channel | block/capture via wrapper covered; **replay deferred** (CRITICAL-1c) | **net-new transport** — out of AL7 live-proof |

AL7's live proof runs end-to-end on **both builtin (deterministic-replay) and SDK (`canUseTool` arg-override)** — both proven before DONE (the SDK path is the production target; proving only builtin would re-bless v1's gap). Codex/opencode block+capture is covered by the uniform wrapper; their *replay* (arg-override) is honestly deferred as net-new per-adapter work.

---

## Ordered task list

1. **Discard the kernel-executor model.** Delete `tools/stage-operation.ts` (+ registry registration), `services/staged-operation-dispatcher.ts`, `shared/src/staged-operation.ts`; remove `threads.ts` dispatch wiring + `dispatchDeps`; remove `app.ts` boot sweep + `buildExecuteCapability` wiring; delete the AL7-* tests for these. *(Proves AC12.)*
2. **Schema migration (drop+recreate).** Drop+recreate `staged_operations` → `proposed_calls`; add `one_shot_grants` (`taskScope`,`agentScope`,`retryCount`); recreate `operation_outcomes` with `proposed_call_id` PK/FK. `npm run db:generate` + migrate. *(red: schema test; NIT-12 drop+recreate stated in migration.)*
3. **Shared types.** `packages/shared/src/proposed-call.ts` (statuses incl. `held`, `ProposedCall`); `SessionPermissionPolicy` (with the `grantedCall` recorded-call payload — CRITICAL-1); extend `SessionConfig.permissionPolicy`; add `ProposedCallGrantedEvent` to the `KernelEvent` union. **No `ConversationMessage` widening, no `SeededToolUse`** (the r1 message-seed path is dropped). *(red: AC1 shape.)*
4. **Identity hash + classifier + live-proof tool.** `identityHash(toolId, args)` (`canonicalJson` per D3 + SHA-256); `classifyReversibility(toolId, def)` (fail-closed default `irreversible`). **Wire the `commit_file` MCP-exposed live-proof tool** (`reversibility:"irreversible"`) into `ALL_TOOL_DEFINITIONS` so it funnels through `registry.invoke` + the MCP bridge — confirmed available *before* Tasks 5-8 build against it (topological order). *(red: hash determinism + canonicalization tests D3(1-4); classifier no-hint test → irreversible.)*
5. **The wrapper.** Extend `ToolContext` with `permissionPolicy` (it already carries `sessionId`,`taskId`,`agentId`); implement single-statement CAS-consume → handler (try/catch → Outcome) / idempotent capture / `sessionRunRegistry.abort` on first capture, inside `buildToolRegistry.invoke`. *(red: AC1 incl. abort+idempotent, AC2, AC5, AC6 concurrent-CAS.)*
6. **Thread policy through provisioning.** `provisionSession`/`runSession` build the registry with `permissionPolicy`; session 1 = `capture`. *(red: AC1 via provisioning.)*
7. **Verdict → grant + trigger.** `threads.ts`: approve mints the grant (`taskScope`/`agentScope`) + transitions `captured→granted` + emits `proposed_call_granted`; non-approve → `held`. *(red: AC3 incl. event+enqueue, AC7, AC8.)*
8. **Re-dispatch + per-harness replay.** Task-dispatcher `handleProposedCallGranted` subscription `enqueue`s session 2 (guarded by `hasActiveSession`); provisioning sets session 2 `permissionPolicy.sessionRole:"grant-bearing"` + `grantedCall:{toolId,args,identityHash}` (recorded from the Proposed Call). **(a) builtin:** add the deterministic-replay step to `runLoop` (`builtin-harness-adapter.ts:368`) — `registry.invoke(recordedToolId, recordedArgs)` on the agent's own registry before the LLM execute loop, then append assistant-call + tool-result to `session.messages` so the LLM continues (CRITICAL-1a). **(b) SDK:** add the `canUseTool` callback to `queryOptions` (`claude-agent-sdk-adapter.ts:154-162`), injected with a grant resolver; returns `{behavior:"allow", updatedInput: recordedArgs}` / `deny` per the match rule (CRITICAL-1b). NOT `assembleContext`, NOT `SessionConfig.messages`. *(red: AC3 enqueue, AC4 replay on builtin AND SDK, AC5 non-match deny, AC11.)*
8.5. **Deadlock fallback — separate subscription.** Add `handleUnconsumedGrantOnSessionEnd` as a **distinct `session_ended` subscription** (NOT inside `handleSessionEnded`, which owns owner-change re-dispatch — r2 NEW-C/R7). On `session_ended`: query for an unconsumed grant with `taskScope` = the ended session's task; `retryCount === 0` → re-provision once (`retryCount`→1, guarded by `hasActiveSession` so it composes with the owner-change branch without double-enqueue); `retryCount >= 1` → Proposed Call `held` + write a `failed` Outcome. *(red: AC11b — never a silent hang; assert no double-enqueue against `handleSessionEnded`.)*
9. **Reviews loader + subscribers.** Nest `proposedCall` + `outcome` on the artifact (`reviews.ts`); rename `operation_executed` → `proposed_call_executed` and update the **3 known subscribers**: `observability/dispatcher.ts:494` (span mapping), web `review-composition.ts` (`StagedOperationView`→`ProposedCallView`) + `ReviewComposition.tsx:672-679` (status/outcome render). *(red: AC10 incl. failure path; NIT-13 subscriber inventory.)*
10. **LIVE-PROOF lane — BOTH harnesses.** End-to-end through `commit_file` (MCP-routed, agent-creds path). **Builtin:** agent attempts the irreversible call → blocked+captured → session 1 aborts → approve → `proposed_call_granted` → re-dispatch → session 2 `runLoop` deterministically `registry.invoke`s the recorded `{toolId,args}` → wrapper consumes grant once → real file written → Outcome → LLM continues. **SDK (production target):** same up to re-dispatch; session 2's SDK agent attempts `commit_file` with **drifted args** → `canUseTool` forces `updatedInput: recordedArgs` → SDK executes → MCP → `registry.invoke` consumes grant → real file written with the **recorded** (not drifted) bytes → Outcome → agent continues. **Both lanes must be green** before AL7 is DONE. *(proves AC4, AC10, AC11 on builtin + SDK — Hard Rule 6; NO fixture/stub. SDK proof is non-negotiable since v1 failed on exactly the production replay channel.)*

---

## Security & abuse cases

- **Agent-authored field trust boundary (capture).** `tool_id` + `args` are captured from the agent's *actual call*, never an agent-authored spec (concept rejection #4). `review_message_id`/`subject_thread_id` are **derived** server-side from the session's task/thread, never agent-supplied (preserves the original WARNING-1 fix). **Addressed.**
- **Grant forgery / replay.** The grant is minted only by the server verdict path on `approve`; the wrapper matches by `(taskScope, agentScope, identityHash)` and consumes via a **single-statement atomic CAS** (`UPDATE … WHERE consumed=false RETURNING *`, no pre-read — WARNING-6). An agent cannot mint a grant or re-use a consumed one. **Addressed (AC6).**
- **TOCTOU / drift between review and execution.** **Byte-faithful replay per harness** — builtin drives `registry.invoke(recordedToolId, recordedArgs)` directly (the LLM never re-issues the call); SDK `canUseTool` overwrites the LLM's args with the recorded approved args (`updatedInput`) before execution — plus immutable captured args + hash on parsed data at both ends (WARNING-5). Executed == reviewed holds even under full LLM drift (the SDK test deliberately drifts the args and asserts the on-disk bytes are the *recorded* ones). The LLM-redrift path is **structurally removed, not mitigated**. **Addressed (AC4/AC5).**
- **Classifier fail-open.** `classifyReversibility` defaults a no-signal tool to **`irreversible` (gated)** — a brand-new irreversible tool cannot fire without review (WARNING-8). **Addressed (AC1 no-hint test).**
- **Capture-loop / duplicate Proposed Calls.** Session 1 is terminated on first capture via `sessionRunRegistry.abort` (CRITICAL-2), and capture is idempotent on `(origin_session_id, identity_hash)` — a retried/varied call cannot mint duplicate or ambiguous Proposed Calls. **Addressed (AC1).**
- **Cross-session grant leakage.** `(taskScope, agentScope)` binds the grant to the unique re-provision (the same owner resuming the same task); an unrelated session/agent cannot consume it. **Addressed.**
- **Side-door egress.** The wrapper gates `registry.invoke`; the sandbox boundary (existing) blocks shell/raw-HTTP egress around it. Out-of-band egress is the existing sandbox guarantee, not new in AL7. **N/A (pre-existing control).**
- **Rate-limit on verdict POST.** Verdict route is existing; AL7 adds no new POST. **N/A.**
- **Secret handling.** AL7 stores no new credential — the agent's own credentials run the call (the whole point). **N/A.**
- **SSRF / path traversal.** No new outbound URL or path input owned by HyperIdle (the tool is the agent's). **N/A.**

---

## Risks / ambiguities

- **R1 — re-provision trigger. RESOLVED (CRITICAL-3, Task 7+8).** `handleSessionEnded` re-dispatches only on owner *change* (`:500-514`, verified) → false for AL7's same-agent resume. Fixed by an **explicit** `proposed_call_granted` event + a dedicated dispatcher subscription `handleProposedCallGranted` that enqueues the task, guarded by `hasActiveSession`. Not a "verify"; a committed code change.
- **R2 — grant scope. RESOLVED (WARNING-4, Task 2+7).** Session 2's id does not exist at mint time. Grant is scoped to **`taskScope` (task id) + `agentScope` (agent id)** — the unique re-provision instance. Schema, mint, and wrapper lookup all key on `(taskScope, agentScope, identityHash)` consistently.
- **R3 — replay fidelity. RESOLVED per-harness (CRITICAL-1, Task 8+8.5).** No longer "hope the LLM reproduces the call" and no longer the r2 `SessionConfig.messages` seed (verified non-load-bearing — builtin executes from `response.content`, SDK ignores `messages`). **Two real mechanisms, both force the recorded bytes:** builtin = a deterministic `registry.invoke(recordedToolId, recordedArgs)` driven from `runLoop` (`:368`) on the agent's own per-session registry (CRITICAL-1a); SDK (production) = `canUseTool` returning `{behavior:"allow", updatedInput: recordedArgs}`, overriding LLM-drifted args before execution (CRITICAL-1b, verified against the SDK `PermissionResult` type). Codex/opencode replay deferred net-new (CRITICAL-1c). **Deadlock fallback (Task 8.5):** an unconsumed grant at session-2 end → one bounded re-provision → then `held` + `failed` Outcome. Never a silent stall.
- **R4 — descriptive vs operative (AC9).** Capture is triggered by an *attempted irreversible call at the gate*, not by artifact kind. A descriptive review simply never has a blocked call → no grant, no outcome. No code path captures from artifact kind alone.
- **R6 — chat-loop mode-switch (r2 NEW-B). RESOLVED by dropping the message-seed.** The r2 plan routed session 2 through `config.messages`, which flips the builtin adapter into `runChatTurn` (the assistant-chat loop, `MAX_TOOL_ITERATIONS=3`, no planning/sandbox — `builtin-harness-adapter.ts:356,427`). The new mechanism does **not** set `config.messages`, so session 2 stays a **task session** (`runPlanningTurn` → execute loop); the deterministic replay is a step inside that task loop (`:368`), and AC11 "continues working" uses the real task execute-loop continuation semantics, not the 3-iteration chat cap. The mode-switch is gone, not merely acknowledged.
- **R7 — deadlock-fallback subscription placement (r2 NEW-C). RESOLVED.** The fallback (Task 8.5) is a **separate `session_ended` subscription** `handleUnconsumedGrantOnSessionEnd`, NOT an extension of `handleSessionEnded` (which owns owner-change re-dispatch + `scheduleDrain`). It runs independently: on `session_ended`, query for an unconsumed grant whose `taskScope` = the ended session's task; if found and `retryCount === 0`, re-provision once (`retryCount`→1, guarded by `hasActiveSession` so it composes with — does not double-enqueue against — `handleSessionEnded`'s own enqueue); if `retryCount >= 1`, transition `held` + write the `failed` Outcome. Two subscriptions on the same event with disjoint concerns and a shared `hasActiveSession` idempotency guard — no double-dispatch.
- **R5 — live-proof tool. RESOLVED (WARNING-9/10, Task 4).** The tool is **`commit_file`** — a HyperIdle-registered, MCP-exposed, `irreversible`-classified tool that writes a real file to the sandbox; it provably hits `registry.invoke` (via the MCP bridge) and the executor is the agent's MCP-routed call, not HyperIdle's loop. Wired in Task 4 *before* Tasks 5-8 build against it. Production exemplar: `github_merge_pr`. AL7 is not DONE until the live-proof lane (Task 10) runs green.

---

## protectedTests
- `packages/server/src/routes/__tests__/*threads*verdict*` — verdict grammar + first-verdict-wins must not change (AC13).
- existing review-composition / reviews-loader tests for non-staged-op fields.

## sharedFiles
- `packages/db/src/schema.ts` (migration — drop+recreate)
- `packages/shared/src/harness/harness-adapter.ts` (`SessionConfig.permissionPolicy` + `SessionPermissionPolicy.grantedCall`; `ConversationMessage` NOT widened)
- `packages/shared/src/events.ts` (`ProposedCallGrantedEvent`, rename `operation_executed`)
- `packages/shared/src/index.ts` (export `proposed-call.ts`, drop `staged-operation.ts`)
- `packages/server/src/tools/tool-registry.ts` (the wrapper + `commit_file` live-proof tool + `classifyReversibility`)
- `packages/server/src/harness/builtin-harness-adapter.ts` (deterministic-replay step in `runLoop` at `:368`, reusing `executeToolCalls`→`registry.invoke`; abort honored at `:717`)
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` (net-new `canUseTool` callback in `queryOptions` at `:154-162` + injected grant resolver — CRITICAL-1b SDK replay)
- `packages/server/src/services/session-provisioning.ts` (policy threading + session-2 `permissionPolicy.grantedCall` payload from the Proposed Call)
- `packages/fabric/src/services/task-dispatcher.ts` (`handleProposedCallGranted` subscription — CRITICAL-3)
- `packages/server/src/routes/threads.ts` (verdict → grant + `proposed_call_granted` emit)
- `packages/server/src/routes/reviews.ts` (loader)
- `packages/server/src/services/observability/dispatcher.ts` + `packages/web/src/pages/review/{review-composition.ts,ReviewComposition.tsx}` (event-rename subscribers — NIT-13)
- `packages/server/src/app.ts` (remove dispatch wiring)

## Migrations (symbol renames/removals — every call site)
- `StagedOperationSpec` (`shared/staged-operation.ts`) → **delete**; callers: dispatcher (deleted), `reviews.ts` view shape (rename to `ProposedCallView`).
- `staged_operations` table → **rename/reshape** `proposed_calls`; callers: `stage-operation.ts` (deleted), dispatcher (deleted), `reviews.ts` (rerename), `schema.ts` types `StagedOperation`/`NewStagedOperation` → `ProposedCall`/`NewProposedCall`.
- `resolveStagedOperations`/`sweepStrandedOperations`/`buildExecuteCapability`/`KERNEL_DISPATCHABLE_CAPABILITIES`/`isKernelDispatchableCapability` → **delete**; callers: `threads.ts`, `app.ts`, AL7 tests.
- `operation_executed` event → **reshape/rename** `proposed_call_executed` (streamId = subjectThreadId kept); 3 known subscribers: `observability/dispatcher.ts:494`, web `review-composition.ts`, `ReviewComposition.tsx:672-679` (enumerated above, NIT-13).
- NEW `proposed_call_granted` event → add to `KernelEvent` union (`events.ts:414`); subscriber: task-dispatcher `handleProposedCallGranted` (CRITICAL-3 re-dispatch trigger).
- `SessionConfig.permissionPolicy` added; `SessionPermissionPolicy.grantedCall?: {toolId,args,identityHash}` carries the recorded approved call to session 2 (CRITICAL-1). `ConversationMessage` is **unchanged** (the r1/r2 widening + `SeededToolUse` are dropped — that path fed the LLM, not a dispatch).
- NEW `canUseTool` callback wired into the SDK adapter's `queryOptions` (`claude-agent-sdk-adapter.ts:154-162`); the adapter constructor/options gain an injected grant resolver `(taskScope, agentScope, toolName) => { recordedArgs } | null | ambiguous`. CRITICAL-1b — net-new but small; verified against the SDK `CanUseTool`/`PermissionResult` type.
