# AL7 Concept — Review-Gated Tool Execution (redo)

**Status:** Locked. Supersedes (a) the first AL7 — the Kernel-held staged-operation executor, rejected as "yet another integration layer"; and (b) the byte-faithful-replay redo, which made deterministic replay the load-bearing gate. This version makes **tailored native allow/deny lists at session-2 init** the safety mechanism; byte-fidelity demotes to an optimization.

Per-workpackage concept under Track AL (Review Experience). Reshapes one load-bearing noun (`Staged Operation` → `Proposed Call`) and introduces three satellites (`permission gate`, `tailored allow/deny policy`, two-session resume). The Track AL frame — review *experience* over the existing thread/verdict/artifact system, verdict grammar unchanged — is a fixed input.

---

## The reframe (read this first)

The shipped AL7 made **HyperIdle's kernel re-execute** the agent's operation: an agent called `stage_operation`; on approve a hardcoded `executeCapability` map ran the call from HyperIdle's own process. **Discarded whole.**

The redo correctly inverted ownership (the agent's own session/tools/creds execute, HyperIdle gates) but located the guarantee in the **wrong place**: it made session 2 re-run the captured call *byte-faithfully* — a SHA-256 hash match permitting exactly-those-bytes — and a hash mismatch (LLM arg drift) **deadlocked** the approved work. That is fragile and harness-specific.

**The locked model: the guarantee is a tailored native allow/deny list applied to session 2 at init.**

Every harness gates tool calls (allow / deny) via permission config set **at session init**. HyperIdle rides that. On approve, session 2 is **re-provisioned with the harness's allow/deny lists tailored so the agent can only execute the approved operation (plus reversible work) — and nothing else irreversible.** That narrowing IS the safety floor. The agent re-attempts the work; the harness's own native permission system permits only the approved scope. HyperIdle executes nothing — it tailors the policy and reverts it (consume-once); the agent's own session, tools, and credentials run the call.

```
SESSION 1 — irreversible call DENIED at the native gate
  agent attempts the call → harness's deny-with-record hook fires
  → captures the exact attempted call (tool + args) as the review subject (Proposed Call)
  → session 1 ENDED via the abort rail (so the denied call cannot loop/retry-with-drift)
        │
     REVIEW — human approves (or holds with a non-approving verdict)
        │
SESSION 2 — re-provisioned via an EXPLICIT proposed_call_granted trigger on the task-dispatcher
  init-time permission policy is TAILORED: allow the approved tool/op + reversible work;
  deny every other irreversible op. Applied once, then reverted (consume-once).
    builtin   → registry.invoke gate set to allow-the-approved-op + deny-other-irreversible
    Claude SDK→ permissionMode + allow/deny tool lists (settings) narrowed to the approved op
    Codex     → approval_policy + sandbox_mode + allow flags narrowed at spawn
    opencode  → permission config (allow/ask/deny) narrowed at spawn
  → the agent re-attempts; the native gate permits only the approved scope
  → agent executes with its own tools/creds → continues working → Outcome recorded
```

**Byte-faithful execution is now an OPTIMIZATION, not the gate.** Where a harness's permission layer expresses *arg-level* scope (e.g. a Claude PreToolUse hook that pins/checks args, or builtin's in-process arg check), HyperIdle MAY additionally tighten the allow to "this op with these exact args." That tightening is optional per-harness work. It is **not** load-bearing and there is **no exact-hash-match-to-permit** — so there is **no deadlock**: an arg shift no longer blocks the approved work, it merely (in the un-tightened case) runs the approved tool with the agent's re-derived args, still within the narrowed scope that forbids any *other* irreversible op.

The **safety floor** is therefore: *session 2 cannot execute any irreversible operation other than the approved one.* The **optimization frontier** is: tighten "the approved tool" down to "the approved tool with exactly these args" wherever the harness expresses arg-level scope. (See the residual statement, Phase 2.)

---

## Required reading (for `/architecture` and `/pipeline`)

- This file — the locked concept.
- `docs/process-layer/staged-operation.md` — ground-truth (file path kept stable; noun is `Proposed Call`; model = tailor-the-native-allow/deny-at-init).
- `packages/shared/src/harness/harness-adapter.ts` — `SessionConfig` (init surface, line 36; AL7 adds `permissionPolicy`). `SessionConfig.messages` is the AH3 chat channel, NOT a replay seam.
- `packages/server/src/harness/builtin-harness-adapter.ts` — builtin loop; `registry.invoke` is the in-process gate + capture point; `executeToolCalls` honors the `aborted` flag (`:717`).
- `packages/server/src/harness/claude-agent-sdk-adapter.ts:154-162` — `queryOptions` sets `permissionMode` today; AL7 narrows allow/deny tool lists at init + (optimization) a `canUseTool`/`PreToolUse` deny-with-record + arg-pin.
- `packages/server/src/harness/cli-harness-adapter.ts` — Codex/opencode adapter; permission flags inject as **template args at spawn** (`args` array, `{{sandbox}}` etc., line 58, 183-194). This is the Codex/opencode init-time permission surface.
- `packages/server/src/harness/harness-capability-descriptors.ts:11` — `KNOWN_HARNESS_FAMILIES = ["codex","claude-code","cursor-agent","opencode"]` (+ builtin). cursor-agent is `unavailable`; AL7 covers the other four.
- `packages/server/src/services/session-provisioning.ts` — `harness.startSession`; where the tailored policy is injected per adapter.
- `packages/server/src/tools/tool-registry.ts:264-294` — the `invoke` chokepoint (builtin capture + the universal in-process record point; one-shot consume of the tailored policy).
- `packages/fabric/src/services/task-dispatcher.ts` — re-engagement rail; `handleSessionEnded` re-dispatches only on owner *change* → AL7 needs an EXPLICIT `proposed_call_granted` trigger.
- `packages/server/src/services/session-run-registry.ts` — the abort rail (session-1 termination).
- `packages/server/src/routes/threads.ts:1254-1392` — verdict resolution (first-verdict-wins).
- `packages/server/src/routes/reviews.ts` — review composition / loader.
- `packages/db/src/schema.ts:1004-1059` — `staged_operations` / `operation_outcomes` (reshaped to a Proposed-Call record).

---

## Phase 0 — The nouns

| Noun | Class | One-line working definition |
|---|---|---|
| **Proposed Call** | **Reshaped** (was `Staged Operation`) | The exact, fully-bound tool call (tool id + args) an agent attempted and the gate denied, captured verbatim as the subject a human reviews. |
| **Permission gate** | **New** | The harness-native allow/deny mechanism configured at session init that HyperIdle rides; capture sits on each harness's deny-with-record hook (builtin: `registry.invoke`; Claude: `canUseTool`/`PreToolUse`; Codex/opencode: native approval signal). |
| **Tailored allow/deny policy** | **New** (replaces "one-shot grant" as the *mechanism*) | The session-2 init permission policy narrowed so the agent can execute the approved operation + reversible work and nothing else irreversible; applied once, then reverted (consume-once). |
| **Outcome** | **Stable** (kept from shipped AL7) | The immutable terminal record of what session 2's executed call returned (ok + receipt / failed + error). |
| **Verdict** | **Stable** (Track AL) | The binding human decision on a review subject. Grammar unchanged; approve gains a consequence (tailor + re-provision), not a new action. |
| **Session** | **Stable** | A detached one-shot harness run. Not pausable. `active \| done \| crashed`. |

Stable nouns are inputs. The concept work below covers **Proposed Call**, **permission gate**, **tailored allow/deny policy**.

**Human design review forecast:** No. No novel UI; rides the existing action-operation review canvas (`reviews.ts` / `ReviewComposition.tsx`). `/design` skipped per the workpackage brief.

---

## Phase 1 — Essence

### Proposed Call

1. **Identity.** A *captured intent to act* — a snapshot of one tool invocation (tool id + fully-bound args) frozen at the moment the native gate denied it. Not a queued job, not a command HyperIdle will run. It is the **subject of a review**, until a human approves and the *agent's own session* runs it under a narrowed permission policy.

2. **Essential properties.** The **tool identity** (the harness/MCP tool name); the **bound arguments** verbatim; the **blocked session** it came from + the **task/thread** it anchors to; the **review message** that gates it; a **reversibility** classification (irreversible — why it was captured at all). It carries NO HyperIdle-side executor reference, NO capability-allowlist membership. *(An identity hash over (tool id, normalized args) is OPTIONAL metadata used only by the arg-pin optimization; it is NOT the gate and NOT required for the safety floor.)*

3. **Rejection list.** See Phase 2.

4. **Composition.** Attaches to exactly one review message (the gate) and one subject thread (anchor). Carries the captured tool id + args + reversibility. Referenced by at most one Outcome (0..1, written by session 2). Nested on the action-operation artifact the review canvas renders.

5. **Lifecycle.**
   ```
   captured  ── agent's call denied at the native gate in session 1; deny-with-record hook captures it
      │
      ├─ (approve verdict) → granted ── session 2 re-provisioned with a TAILORED allow/deny policy
      │                          │       (allow the approved op + reversible work; deny other irreversible)
      │                    agent re-attempts; native gate permits the approved scope; policy consumed once
      │                          │
      │                    ┌─────┴─────┐
      │                 executed     failed   (Outcome written; terminal)
      │
      └─ (non-approve: request-changes / reject / edit) → held (never executed)
   ```
   `captured → granted → executed|failed` and `captured → held`. No `executing` *kernel* state — HyperIdle never holds an in-flight execution; the agent's session does.

6. **Authority.** The **agent produces** the Proposed Call by attempting the call (the deny-with-record hook captures it; no `stage_operation` tool). The **human authorizes** via the verdict. The **agent's session executes** in session 2 under the tailored native policy. HyperIdle **owns the capture record + the tailored policy + the Outcome record** — the *bookkeeping of the gate*, never the execution. Source of truth for "did it happen" is the **Outcome**, from the real tool return inside session 2.

7. **Vocabulary collision.** `Staged Operation` collides with the rejected kernel-exec model — retired. `Proposed Call` is new and unambiguous. Does not collide with `Task`, `Session`, `Verdict`, or `Block`.

### Permission gate

1. **Identity.** The harness-native allow/deny decision applied to each tool call, configured at session init. HyperIdle does not build it; HyperIdle **tailors it at init** (session 1: allow reversible, deny irreversible; session 2: additionally allow the one approved op) and **records the deny** to capture the attempted call.
2. **Essential properties.** Configured at session init via each harness's own init-time permission config (no net-new async transport); evaluated per call by the harness; a deny-with-record hook captures the denied call + its args.
3. **Composition.** Per-harness, expressed through the adapter at `SessionConfig`: builtin `registry.invoke` gate; Claude `permissionMode` + allow/deny tool lists (+ optional `canUseTool`/`PreToolUse`); Codex `approval_policy` + `sandbox_mode` + allow flags at spawn; opencode `permission` config at spawn. `registry.invoke` remains the universal in-process capture/record point for HyperIdle-registered + MCP-routed tools.
4. **Authority.** HyperIdle configures the policy at init; the harness enforces it.

### Tailored allow/deny policy

1. **Identity.** The session-2 init permission policy, narrowed so the agent can execute **the approved operation + reversible work** and **nothing else irreversible**. Applied once at provisioning; reverted (consume-once) so a later re-attempt of a *different* irreversible op is denied + re-captured.
2. **Essential properties.** Scoped to the session-2 re-provision of one task by one agent; allows the approved op (tightened to exact args where the harness expresses arg-level scope — optimization); denies all other irreversible ops; single-use per approved Proposed Call (a re-open mints a fresh tailored policy).
3. **Authority.** Composed by HyperIdle at approve-time from the approved Proposed Call; translated to native allow/deny by each adapter at session-2 init; enforced by the harness.

---

## Phase 2 — Rejection list (load-bearing)

**A Proposed Call / this whole loop is NOT:**

1. **NOT a Kernel-executed operation.** HyperIdle does not run the tool. *Why:* re-implementing tool execution is the integration layer the founder rejected.

2. **NOT a curated capability allowlist.** No `KERNEL_DISPATCHABLE_CAPABILITIES`. *Why:* the gate is generic (allow/deny by reversibility), the capture is generic (any tool + any args), the tailored policy is generic (allow the approved tool/op). HyperIdle never needs to know what `github/merge_pr` *means*.

3. **NOT a live session pause / native held "ask."** Approve does not un-pause a suspended turn. *Why:* HyperIdle sessions are detached one-shots; on end the sandbox + history are destroyed; only abort exists. The review spans **two sessions** with context reassembly. **Enforcement is allow/deny at session *init*, not a held call-time ask** — so AL7 uses the init-time permission config every harness already has, NOT the net-new async-approval transports (Codex app-server JSON-RPC, opencode SSE).

4. **NOT an agent-authored spec.** No `stage_operation` tool. *Why:* an agent-authored spec can lie or drift; the *real attempted call* captured at the gate is the only faithful subject. (Discards `tools/stage-operation.ts`.)

5. **NOT a byte-faithful replay gate / exact-hash-match-to-permit.** Session 2 is NOT permitted by matching a SHA-256 of the captured bytes. *Why:* a hash-match gate deadlocks the approved work on any LLM arg drift; it is fragile and harness-specific. The gate is the **narrowed native allow/deny scope**, which forbids *other* irreversible ops regardless of arg drift. Byte-fidelity survives only as an **optional arg-pin optimization** where a harness expresses arg-level scope.

6. **NOT a transactional multi-step rollback engine.** One Proposed Call = one tool call. Compensating/undo logic beyond the call's own semantics is out of scope (Track AL out-of-scope, unchanged).

7. **NOT a verdict-grammar change.** Approve stays approve. It gains a consequence (tailor the session-2 policy + re-provision), not a new button.

8. **NOT Claude-only.** The tailored allow/deny must be designed and **tested against all four supported harnesses** (builtin, Claude SDK, Codex, opencode), each through its own adapter + sandbox. cursor-agent is `unavailable` and skipped.

---

## The residual — the optimization frontier (stated plainly, per founder direction)

The safety floor is *"no **other** irreversible operation executes in session 2."* Where a harness's allow-list scopes only by tool **name/pattern** (not exact args), session 2 could permit the **same approved tool with different args** — e.g. approve "refund $10 on charge X", the agent re-attempts "refund $10 on charge X" but the harness can only enforce "allow `stripe_refund`", so a drifted "refund $50 on charge X" would also be allowed by name.

This is the **optimization frontier**, not a hole in the floor:
- **The floor still holds:** no *other* irreversible op runs; the agent re-derived the *same* approved op; an *unrelated* irreversible op is still denied + re-captured.
- **Tighten it** per harness where arg-level scope exists: builtin checks the args in-process at `registry.invoke`; Claude pins/checks args in a `PreToolUse`/`canUseTool` hook; Codex/opencode where their permission grammar supports arg/command-pattern matching.
- **This is acceptable per founder direction** — stated openly, not hidden. AL7 ships the safety floor on all four harnesses; the arg-pin tightening is layered where each harness expresses it.

---

## Phase 3 — Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Proposed Call** | The exact captured tool call (id + bound args) the gate denied, reviewed as a subject. | staged operation, staged op, operation spec, `StagedOperationSpec`, dispatchable capability |
| **Permission gate** | Harness-native allow/deny at session init, with a deny-with-record hook for capture. | dispatcher, executor, kernel dispatch, capability map |
| **Tailored allow/deny policy** | Session-2 init policy narrowed to allow the approved op + reversible work, deny other irreversible; consume-once. | one-shot grant (retired as mechanism), replay grant, dispatch claim, exact-hash grant |
| **Arg-pin (optimization)** | Optional per-harness tightening of the allow from "the approved tool" to "the approved tool with these exact args". | byte-faithful replay, deterministic registry replay, canUseTool arg-override (these are *techniques* for the optimization, not the gate) |
| **Outcome** | Immutable terminal record of what the executed call returned. | result, receipt (receipt is a *field* of Outcome) |
| **Two-session resume** | Deny in session 1 → review → re-provision session 2 with the tailored policy. | pause/resume, suspend, live continuation |

`capability` as a *noun for what HyperIdle dispatches* is retired. (The AM2 `HarnessCapabilityDescriptor` keeps its name — different meaning.)

---

## Phase 4 — Contracts

- **Cardinality.** A Proposed Call → exactly one review message (gate) and one subject thread (anchor). A Proposed Call → 0..1 Outcome. A tailored policy → exactly one approved Proposed Call, valid in exactly one session-2 re-provision.
- **Closure.** The tool/args vocabulary is **open** — any tool the agent can call can be captured; HyperIdle enumerates nothing. Reversibility classification is **closed** (`irreversible | reversible`) and drives deny-vs-allow at the gate.
- **Mutability.** The captured tool id + args are **immutable** once captured (they are what the human reviewed). The Outcome is **immutable** (PK = proposed-call id enforces 0..1 + no overwrite). A retry produces a **new** Proposed Call with its own Outcome.
- **Identity.** A Proposed Call's id is opaque + stable. The (tool id, normalized args) hash is **optional metadata** consumed only by the arg-pin optimization — it is NOT the safety gate.
- **Hard rules:**
  1. **HyperIdle executes nothing of its own.** The agent's own session/tools/credentials run the call. HyperIdle tailors the native allow/deny at init, captures the deny, records the outcome — it never calls a tool from its own process or with its own creds.
  2. **Session 2 cannot execute any irreversible op other than the approved one.** The tailored native allow/deny enforces this; it is the safety floor. (Arg-level exactness is the optimization frontier — see the residual.)
  3. **Two-session async resume, not live pause.** Deny ends session 1; approve re-provisions session 2 via the task-dispatcher rail with the tailored policy.
  4. **Reversible auto-flows; irreversible gates.** Reversible calls are allowed at the gate with no review. Only irreversible calls are captured → reviewed.
  5. **A non-approving verdict never executes.** Held Proposed Calls are never granted a tailored policy.
  6. **Done only on a LIVE call, on ALL four supported harnesses.** AL7 is done only when a real irreversible tool call executes LIVE through the agent's own tools + adapter + sandbox AND the agent continues working afterward — **proven on builtin, Claude, Codex, and opencode**, each with its own live-proof lane (`commit_file` or an equivalent real irreversible op). No fixture/stub proof. If an adapter genuinely cannot express the tailored allow/deny for the proof, that is a build finding to surface — not a silent deferral.
  7. **Init-time permission config, not async hold.** Enforcement is allow/deny at session init (config every harness has); capture is synchronous deny+record. No net-new async-approval transport is required for the AL7 floor.

---

## The four open details — RESOLVED

### 1. Fidelity: tailored native scope (gate) + optional arg-pin (optimization) → **locked.**
Session 2 is re-provisioned with the native allow/deny **narrowed to the approved op + reversible work, denying every other irreversible op**. That narrowing is the gate. The agent re-attempts the work; the harness permits only the approved scope. **There is no exact-hash-match-to-permit, so no deadlock** — arg drift no longer blocks the approved work. Byte-fidelity (in-process arg check on builtin; `PreToolUse`/`canUseTool` arg-pin on Claude; arg/command-pattern match on Codex/opencode where expressible) is an **optional tightening** layered on top, not the load-bearing gate. The residual (name-scoped allow could permit the same tool with different args) is the documented optimization frontier, acceptable per founder direction.

### 2. Capture location → **each harness's deny-with-record hook; `registry.invoke` is the universal in-process record point (confirmed).**
Capture is **synchronous deny+record**, not an async hold:
- **builtin** — at `registry.invoke` (HyperIdle owns the loop): deny the irreversible call, record `{toolId, args}`, return a blocked result.
- **Claude (SDK)** — `canUseTool`/`PreToolUse` returns deny and HyperIdle logs the attempted `{toolName, input}` before the agent's loop continues.
- **Codex** — the native approval signal (`execCommandApproval`/`applyPatchApproval`) is configured to *auto-deny* irreversible ops at init via `approval_policy`/`sandbox_mode`; the adapter records the denied call from the approval event. *(Init-time deny config exists on the CLI; the bidirectional app-server transport is NOT required for the deny+record floor — see the build-finding flag in §4.)*
- **opencode** — `permission` config set to deny irreversible at init; the adapter records the denied call.
All HyperIdle-registered + MCP-routed tools also funnel through `registry.invoke`, which stays the universal in-process record point + the one-shot consume of the tailored policy.

### 3. Tailored-policy enforcement → **adapter-translated native allow/deny at session-2 init, consume-once.**
At approve-time HyperIdle composes a `SessionPermissionPolicy` (session role + the approved op) and threads it through `SessionConfig` → `provisionSession` → each adapter, which translates it to native allow/deny + sandbox scope at init:
- **builtin** → the `registry.invoke` gate is set to allow-the-approved-op + reversible, deny-other-irreversible.
- **Claude** → `permissionMode` + `allow`/`deny` tool lists in settings narrowed to the approved op (+ optional `PreToolUse` arg-pin).
- **Codex** → `approval_policy` + `sandbox_mode` + allow flags injected as spawn template args.
- **opencode** → `permission` allow/ask/deny config injected as spawn template args.
The policy is applied once and reverted (consume-once) so a *second* irreversible op in session 2 is denied + re-captured.

### 4. Reversible auto-flow + work-continues → **locked.**
Reversible calls → **allowed at the gate, no review**. Irreversible calls → **capture → review → reinit session 2 with the tailored allow/deny**. The work-continues loop IS the session-2 resume: on approve the verdict path emits **`proposed_call_granted`** and the task-dispatcher's dedicated subscription re-provisions session 2 (the same-owner resume is NOT triggered by the owner-change `session_ended` path), the agent re-attempts within the narrowed scope and **keeps working**. **Build-finding flag:** if any adapter genuinely cannot express the tailored allow/deny (e.g. a Codex CLI that only auto-approves/denies globally and cannot scope to one op at init), that is surfaced as a build finding — not silently deferred. AL7 is **done only when** a real irreversible call (`commit_file`, or an equivalent real op the agent runs with its own creds) executes LIVE through the agent's own tools + adapter + sandbox AND the agent continues, **on all four supported harnesses**.

---

## Keep / discard delta

**DISCARD** (the rejected kernel-executor model):
- `packages/server/src/tools/stage-operation.ts` (whole) + registry registration.
- `packages/server/src/services/staged-operation-dispatcher.ts` (whole: `resolveStagedOperations`, `executeOne`, `githubMergePr`, `buildExecuteCapability`, `sweepStrandedOperations`, `KERNEL_DISPATCHABLE_CAPABILITIES`, `isKernelDispatchableCapability`).
- `routes/threads.ts` approve-path dispatch wiring + `dispatchDeps` thread-through; `app.ts` boot wiring + boot sweep.
- `packages/shared/src/staged-operation.ts` `StagedOperationSpec`.
- The AL7-* tests for the above.

**KEEP / REUSE:**
- Review surface + verdict resolution (`threads.ts` first-verdict-wins, re-open, 409) — approve now composes + re-provisions with a tailored policy instead of dispatching.
- Review composition / loader (`routes/reviews.ts`) — canvas renders a Proposed Call + its Outcome.
- The Outcome-recording **pattern** — kept; written from session 2's real tool return.
- The re-engagement rail (`task-dispatcher.ts`) — drives the session-2 resume.
- The abort rail (`session-run-registry.ts`) — session-1 termination.
- The tool chokepoint (`registry.invoke`) — builtin capture + the universal in-process record point + one-shot consume of the tailored policy.
- The init surface (`SessionConfig` + `harness.startSession`) — extended with the permission policy.
- The Claude `permissionMode` knob; the Codex/opencode CLI spawn-arg template surface; the AM2 capability descriptor.
- The `staged_operations` / `operation_outcomes` tables, **reshaped** to a Proposed-Call record (captured call + tailored policy + outcome) — NOT a kernel execution queue. Column reshape is `/architecture`'s job.

---

## Rationale

The founder rejected the first AL7 because it made HyperIdle a tool-execution engine. The byte-faithful redo correctly inverted ownership but bet the guarantee on deterministic replay — a hash-match gate that deadlocks on LLM arg drift and is harness-specific. The locked model puts the guarantee where every harness already has it: **the native allow/deny permission config set at session init.** On approve, session 2 is re-provisioned with that config tailored to the approved op + reversible work, denying everything else irreversible — the agent's own session executes within the narrowed scope. This dissolves the replay-fidelity/deadlock problem entirely (no exact-match-to-permit), works through the same init-time config on all four supported harnesses (no net-new async transport), and keeps byte-fidelity as an honest optimization where a harness expresses arg-level scope. The residual — name-scoped allow could permit the same tool with different args — is stated plainly as the optimization frontier; the safety floor (no *other* irreversible op) holds on every harness.
