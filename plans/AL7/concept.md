# AL7 Concept — Review-Gated Tool Execution (redo)

**Status:** Locked. Supersedes the first AL7 concept (the Kernel-held staged-operation executor), which the founder rejected as "yet another integration layer."

This is a **per-workpackage concept** under Track AL (Review Experience). It reshapes one load-bearing noun (`Staged Operation` → `Proposed Call`) and introduces three satellites (`permission gate`, `one-shot grant`, two-session resume). The Track AL frame — review *experience* over the existing thread/verdict/artifact system, verdict grammar unchanged — is a fixed input.

---

## The reframe (read this first)

The shipped AL7 made **HyperIdle's kernel re-execute** the agent's operation: an agent called `stage_operation` to park a fully-bound op; on approve, a hardcoded `executeCapability` map (`fixture:staged-op` + `github/merge_pr`), gated by a `KERNEL_DISPATCHABLE_CAPABILITIES` allowlist, ran the call from HyperIdle's own process with HyperIdle's wiring. That is HyperIdle re-implementing tool execution — a curated integration layer. **Discarded whole.**

The locked model: **the review is the intermediary on the harness's NATIVE permission gate. HyperIdle executes nothing. The agent's own session, tools, and credentials run the call.**

Every harness already gates tool calls (allow / deny / ask), configured at session init. HyperIdle rides that gate. Because HyperIdle sessions are **async and not pausable** (a run is a detached one-shot `for await` over the harness stream; session state is only `active | done | crashed`; on end the sandbox + in-memory history are destroyed; only *abort* exists, not *suspend*), the gate HyperIdle rides is **allow/block at session init**, not a held native "ask." So the review spans **two sessions**:

```
SESSION 1 — irreversible call BLOCKED at the gate
  agent attempts the call → wrapper intercepts → captures the exact bound call
  → posts it as the review subject → session 1 ends (work paused, not suspended)
        │
     REVIEW — human approves (or holds with a non-approving verdict)
        │
SESSION 2 — re-provisioned via the existing task-dispatcher rail
  context reassembled (strategy.assembleContext) → the ONE approved call permitted,
  once, exactly as captured → agent executes it with its own tools → continues working
```

A thin **HyperIdle wrapper** is the load-bearing mechanism — native permissions alone are NOT enough. It does two things native gates cannot: **(a)** at block-time, capture the exact bound call (tool + args) as the review subject; **(b)** at approve-time, enforce that session 2 runs **exactly that call, once** — native allow-lists gate by tool *name/pattern*, never "this exact call with these args, one time." Without the wrapper, session 2 could merge a *different* PR than the one reviewed. This is NOT the rejected executor: HyperIdle **captures + permits**; the agent's harness **executes**.

---

## Required reading (for `/architecture` and `/pipeline`)

- This file — the locked concept.
- `docs/process-layer/review-gated-execution.md` — ground-truth (renamed from `staged-operation.md`, which never existed as ground truth; the noun changed).
- `packages/shared/src/harness/harness-adapter.ts` — `SessionConfig` (init surface, line 36) + `HarnessAdapter` interface.
- `packages/server/src/services/session-provisioning.ts:686-722` — `harness.startSession` call; `allowedToolNames` / `tools` passing.
- `packages/server/src/harness/claude-agent-sdk-adapter.ts:120-188` — `permissionMode` wiring (NO `canUseTool`/hooks today — net-new).
- `packages/server/src/tools/tool-registry.ts:264-294` — the `invoke` chokepoint (builtin + MCP-routed tools funnel here).
- `packages/fabric/src/services/task-dispatcher.ts` — the re-engagement rail (`session_ended` / `task_state_changed` → `provisionSession`).
- `packages/server/src/services/session-run-registry.ts` — the abort rail.
- `packages/server/src/routes/threads.ts:1254-1392` — verdict resolution (first-verdict-wins `WHERE resolvedAt IS NULL`, 409 race, re-open).
- `packages/server/src/routes/reviews.ts` — review composition / loader (the action-operation canvas binding).
- `packages/db/src/schema.ts:1004-1059` — `staged_operations` / `operation_outcomes` (reshaped: decision/proposal record, NOT a kernel-exec queue).
- `packages/shared/src/harness/harness-capability-descriptor.ts` — AM2 descriptor (where per-harness gate translation can later be declared).

---

## Phase 0 — The nouns

| Noun | Class | One-line working definition |
|---|---|---|
| **Proposed Call** | **Reshaped** (was `Staged Operation`) | The exact, fully-bound tool call (tool id + args) that an agent attempted and the gate blocked, captured verbatim as the subject a human reviews. |
| **Permission gate** | **New** | The harness-native allow/deny mechanism at session init that HyperIdle rides; the wrapper interception sits on the uniform `registry.invoke` chokepoint with per-adapter dressing on top. |
| **One-shot grant** | **New** | The wrapper's session-2 permission to execute *exactly one* Proposed Call, matched by identity and consumed once. |
| **Outcome** | **Stable** (kept from shipped AL7) | The immutable terminal record of what session 2's executed call returned (ok + receipt / failed + error). |
| **Verdict** | **Stable** (Track AL) | The binding human decision on a review subject. Grammar unchanged; approve gains a consequence, not a new action. |
| **Session** | **Stable** | A detached one-shot harness run. Not pausable. `active \| done \| crashed`. |

Stable nouns are inputs. The concept work below covers **Proposed Call**, **permission gate**, **one-shot grant**.

**Human design review forecast:** No. No novel UI; rides the existing action-operation review canvas (`reviews.ts` / `ReviewComposition.tsx`). `/design` skipped per the workpackage brief.

---

## Phase 1 — Essence

### Proposed Call

1. **Identity.** A Proposed Call IS a *captured intent to act* — a snapshot of one tool invocation (tool id + fully-bound args) frozen at the moment the gate blocked it. It is not a queued job and not a command HyperIdle will run. It is the **subject of a review**, nothing more, until a human approves and the *agent's own session* runs it.

2. **Essential properties.** Every Proposed Call has: the **tool identity** (the harness/MCP tool name the agent called); the **bound arguments** verbatim (the exact `input` object); a **canonical identity** (a deterministic hash over tool id + normalized args — the thing the one-shot grant matches and consumes); the **blocked session** it came from + the **task/thread** it anchors to; the **review message** that gates it; a **reversibility** classification (irreversible — why it was captured at all). It carries NO HyperIdle-side executor reference, NO capability allowlist membership — those were the rejected model.

3. **Rejection list.** See Phase 2.

4. **Composition.** A Proposed Call **attaches to** exactly one review message (the gate) and one subject thread (anchor). It **carries** the captured tool id + args + identity hash + reversibility. It **is referenced by** at most one Outcome (0..1, written by session 2). It is **nested on** the action-operation artifact the review canvas renders.

5. **Lifecycle.**
   ```
   captured  ── agent's call blocked at the gate in session 1; wrapper records it
      │
      ├─ (approve verdict) → granted ── one-shot grant minted for session 2
      │                          │
      │                    session 2 re-provisioned; agent re-attempts the call;
      │                    wrapper matches identity → permits once → consumes grant
      │                          │
      │                    ┌─────┴─────┐
      │                 executed     failed   (Outcome written; terminal)
      │
      └─ (non-approve: request-changes / reject / edit) → held (never executed)
   ```
   `captured → granted → executed|failed` and `captured → held`. No `executing` *kernel* state — HyperIdle never holds an in-flight execution; the agent's session does.

6. **Authority.** The **agent produces** the Proposed Call by attempting the call (the wrapper captures it — the agent does not author a separate spec via a `stage_operation` tool; that tool is discarded). The **human authorizes** via the verdict. The **agent's session executes** in session 2. HyperIdle **owns the capture record + the grant + the Outcome record** — it owns the *bookkeeping of the gate*, never the execution. Source of truth for "did it happen" is the **Outcome**, written from the real tool return inside session 2.

7. **Vocabulary collision.** `Staged Operation` collides with the rejected kernel-exec model — retired. `Proposed Call` is new and unambiguous. It does not collide with `Task`, `Session`, `Verdict`, or `Block`.

### Permission gate

1. **Identity.** The permission gate IS the harness-native allow/deny decision applied to each tool call. HyperIdle does not build it; HyperIdle **configures it at init** (allow reversible, block irreversible) and **wraps the block** to capture + later grant.
2. **Essential properties.** Configured at session init (block-list / policy); evaluated per call; the wrapper observes the block and the args.
3. **Composition.** Sits on the uniform `registry.invoke` chokepoint (builtin + MCP-routed) with per-adapter native gates (`canUseTool` / Codex JSON-RPC / opencode SSE) as dressing on top.
4. **Authority.** HyperIdle configures the policy; the harness enforces it.

### One-shot grant

1. **Identity.** The one-shot grant IS a permission token, scoped to session 2, that authorizes **exactly one** call matching a specific Proposed Call's identity hash, consumed on first match.
2. **Essential properties.** Bound to one Proposed Call identity; valid in exactly one session (session 2); single-use (consumed atomically); expires if session 2 ends without using it.
3. **Authority.** Minted by the wrapper at approve-time; enforced by the wrapper at call-time in session 2.

---

## Phase 2 — Rejection list (load-bearing)

**A Proposed Call / this whole loop is NOT:**

1. **NOT a Kernel-executed operation.** HyperIdle does not run the tool. The rejected first AL7 ran the call from HyperIdle's process via `executeCapability`. *Why:* re-implementing tool execution is the integration layer the founder rejected; it duplicates what the harness + the agent's credentials already do, and it forces HyperIdle to curate every capability.

2. **NOT a curated capability allowlist.** There is no `KERNEL_DISPATCHABLE_CAPABILITIES` set HyperIdle must enumerate per tool. *Why:* the gate is generic (block by reversibility/policy), the capture is generic (any tool + any args), the grant is generic (match by hash). HyperIdle never needs to know what `github/merge_pr` *means*.

3. **NOT a live session pause / native held "ask."** Approve does not un-pause a suspended turn. *Why:* HyperIdle sessions are detached one-shots; on end the sandbox + history are destroyed; only abort exists. The review spans **two sessions** with context reassembly, not one paused one.

4. **NOT an agent-authored spec.** There is no `stage_operation` tool the agent calls to describe what it wants. *Why:* an agent-authored spec can lie or drift from what the agent actually calls; capturing the *real attempted call* at the gate is the only faithful subject. (Discards `tools/stage-operation.ts`.)

5. **NOT a re-derivation on approve.** Session 2 does not re-plan and re-build the call with the tool now unblocked. *Why:* re-derivation risks drift — the agent could compute different args (a different PR number, a larger refund) than the human reviewed. See Open Detail 1 (replay, locked).

6. **NOT a transactional multi-step rollback engine.** One Proposed Call = one tool call. Compensating/undo logic beyond the call's own semantics is out of scope (Track AL out-of-scope, unchanged).

7. **NOT a verdict-grammar change.** Approve stays approve. It gains a consequence (mint the grant), not a new button. (Track AL hard rule.)

---

## Phase 3 — Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Proposed Call** | The exact captured tool call (id + bound args) that the gate blocked, reviewed as a subject. | staged operation, staged op, staged action, operation spec, `StagedOperationSpec`, dispatchable capability |
| **Permission gate** | Harness-native allow/deny at session init, wrapped by HyperIdle for capture + grant. | dispatcher, executor, kernel dispatch, capability map |
| **One-shot grant** | Session-2 permission to run exactly one Proposed Call, matched by identity, consumed once. | approval token (ambiguous), dispatch claim, execution lock |
| **Outcome** | Immutable terminal record of what the executed call returned. | result, receipt (receipt is a *field* of Outcome), execution record |
| **Two-session resume** | Block in session 1 → review → re-provision session 2 with the grant. | pause/resume, suspend, live continuation |

`capability` as a *noun for what HyperIdle dispatches* is retired. (The AM2 `HarnessCapabilityDescriptor` keeps its name — different meaning: it describes a harness's models/auth/options, not a dispatchable verb.)

---

## Phase 4 — Contracts

- **Cardinality.** A Proposed Call → exactly one review message (gate) and one subject thread (anchor). A Proposed Call → 0..1 Outcome. A one-shot grant → exactly one Proposed Call, valid in exactly one session.
- **Closure.** The tool/args vocabulary is **open** — any tool the agent can call can be captured; HyperIdle does not enumerate tools. Reversibility classification is **closed** (`irreversible | reversible`) and drives block-vs-allow at the gate.
- **Mutability.** The captured tool id + args + identity hash are **immutable** once captured (they are what the human reviewed). The Outcome is **immutable** (PK = proposed-call id enforces 0..1 + no overwrite). A retry produces a **new** Proposed Call with its own identity and Outcome.
- **Identity.** A Proposed Call's identity is a **deterministic hash over (tool id, canonically-normalized args)**. This is the value the one-shot grant matches and consumes — it is what makes "executed == reviewed" enforceable.
- **Hard rules:**
  1. **HyperIdle executes nothing.** The agent's own session/tools/credentials run the call. HyperIdle captures, permits, and records.
  2. **Executed == reviewed, once.** Session 2 may run only a call whose identity matches an approved Proposed Call, exactly once. A non-matching call in session 2 is blocked like any other.
  3. **Two-session async resume, not live pause.** Block ends session 1; approve re-provisions session 2 via the task-dispatcher rail; the agent re-attempts and the grant permits.
  4. **Reversible auto-flows; irreversible gates.** Reversible calls are allowed at the gate with no review. Only irreversible calls are captured → reviewed.
  5. **A non-approving verdict never executes.** Held Proposed Calls are never granted.
  6. **Done only on a LIVE call.** AL7 is done only when a real tool call executes LIVE through the agent's own tools AND the agent continues working after the review. No fixture/stub proof.

---

## The four open details — RESOLVED

### 1. Fidelity: replay vs re-derive → **REPLAY (locked).**
Session 2 executes the **captured exact call** (the wrapper rejects any non-matching call), it does NOT re-derive. *Justification:* re-derivation breaks Hard Rule 2 ("executed == reviewed") — the agent, re-provisioned with fresh context, could compute different args (different PR, larger refund) than the human approved, silently. Replay makes "the human approved THIS call" enforceable by construction: the grant is keyed to the identity hash; only a byte-faithful re-attempt matches. The cost is that session 2 must re-attempt *the same* call — handled by re-seeding the agent's context with the approved Proposed Call so the agent re-issues it (and if the agent's re-attempt drifts, the wrapper blocks it, and we surface that as a held/failed state rather than executing the wrong thing). Replay is the only option consistent with the rejection list (#5).

### 2. Wrapper location → **`registry.invoke` is the uniform seam (confirmed).**
`tool-registry.ts:274 registry.invoke` is the one place all tool paths funnel — builtin (internal) AND all MCP-routed tools (SDK, CLI). The wrapper's **capture** (block-time) and **grant enforcement** (approve-time, session 2) live here as the uniform mechanism. The per-adapter native gates are **dressing on top**: SDK `canUseTool(tool,input)` / `permissionMode`; Codex `execCommandApproval`/`applyPatchApproval` JSON-RPC; opencode `permission.asked` SSE. Rationale: the native gates differ per harness and some don't exist yet in our adapters; `registry.invoke` is already present, already covers the MCP-routed path for SDK/CLI, and is the only seam guaranteed for every adapter. Native gates are an optimization/UX layer (block at the harness edge before the call reaches MCP), not the source of truth for capture + one-shot enforcement.

### 3. One-shot exact-call enforcement → **wrapper-owned, hash-match + atomic consume.**
No harness expresses "allow this exact call once" — native allow-lists gate by name/pattern. So the wrapper owns it:
- At approve-time, mint a **one-shot grant** = `{ proposedCallId, identityHash, sessionScope: <session-2-id>, consumed: false }`.
- In session 2, at `registry.invoke`, the wrapper computes the identity hash of the incoming call and looks for an **unconsumed** grant matching `(sessionScope, identityHash)`.
- On match: **atomically** flip `consumed` (conditional update `WHERE consumed = false`, like the existing first-verdict-wins `WHERE resolvedAt IS NULL` pattern) → if the flip wins, permit the call exactly once; if it loses (already consumed / re-delivery), block. The call is permitted; the agent's tool runs; the real return is recorded as the Outcome.
- Any call in session 2 with **no matching unconsumed grant** is blocked by the normal gate. This guarantees executed == reviewed, once.

### 4. Reversible auto-flow + work-continues → **locked.**
Reversible calls → **allowed at the gate, no review** (Hard Rule 4). Irreversible calls → **capture → review → reinit-allow**. The **work-continues-after-review** loop (formerly a separate WP) IS the session-2 resume: session 2 is re-provisioned through the existing `task-dispatcher` rail (`session_ended` / `task_state_changed` → `provisionSession` → `strategy.assembleContext`), executes the granted call, and **keeps working** in the same session. AL7 is **done only when** a real tool call executes LIVE through the agent's own tools AND the agent continues working afterward — no fixture/stub proof (Hard Rule 6).

---

## Keep / discard delta

**DISCARD** (the rejected kernel-executor model):
- `packages/server/src/tools/stage-operation.ts` (whole) + its registry registration.
- `packages/server/src/services/staged-operation-dispatcher.ts` (whole: `resolveStagedOperations`, `executeOne`, `githubMergePr`, `buildExecuteCapability`, `sweepStrandedOperations`, `KERNEL_DISPATCHABLE_CAPABILITIES`, `isKernelDispatchableCapability`).
- `routes/threads.ts` approve-path dispatch wiring (`resolveStagedOperations(dispatchDeps,…)` + `dispatchDeps` thread-through, lines ~58-59, 625, 1371-1381) and `app.ts` boot wiring + boot sweep (lines ~65-67, 415-434, 454).
- `packages/shared/src/staged-operation.ts` `StagedOperationSpec` (the executor input shape).
- The AL7-* tests for the above.

**KEEP / REUSE:**
- Review surface + verdict resolution (`threads.ts` first-verdict-wins `WHERE resolvedAt IS NULL`, re-open, 409) — the approve verdict now mints a grant instead of dispatching.
- Review composition / loader (`routes/reviews.ts`) — the canvas now renders a Proposed Call (captured call) + its Outcome.
- The Outcome-recording **pattern** (immutable record of what session 2 did) — kept; written from session 2's real tool return.
- The re-engagement rail (`task-dispatcher.ts`) — drives the session-2 resume.
- The abort rail (`session-run-registry.ts`).
- The tool chokepoint (`registry.invoke`) — now hosts capture + grant enforcement.
- The init surface (`SessionConfig` + `harness.startSession` at `session-provisioning.ts:703`) — extended with a permission policy.
- The SDK `permissionMode` knob; the AM2 capability descriptor.
- The `staged_operations` / `operation_outcomes` tables, **reshaped** to a review-anchored decision/proposal record (captured call + grant + outcome) — NOT a kernel execution queue. Column reshape is `/architecture`'s job.

---

## Rationale

The founder rejected the first AL7 because it made HyperIdle a tool-execution engine — "yet another integration layer" curating capabilities the harnesses and the agent's own credentials already handle. The reframe inverts ownership: HyperIdle owns the *gate bookkeeping* (capture the blocked call, mint a one-shot grant, record the outcome) and rides the harness's native permission system; the agent's own session executes. The async/non-pausable nature of HyperIdle sessions forces the two-session shape — there is no turn to hold open, so the loop is block-in-session-1 → review → re-provision-session-2-with-the-grant. The wrapper exists because native permission systems gate by tool *name*, not by *this exact call once* — so without it, an approved "merge PR #42" could become "merge PR #99" in session 2. Replay (not re-derive) and identity-hash-matched single-use grants are what make the human's approval mean exactly what they saw.
