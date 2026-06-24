# AL7 Concept — Review-Gated Tool Execution (redo)

**Status:** Locked. Supersedes three earlier models: (a) the first AL7 — HyperIdle's Kernel re-executing the op via a curated `executeCapability` map, rejected as "yet another integration layer"; (b) the byte-faithful-replay redo, which made an exact-hash-match-to-permit the load-bearing gate (deadlocks on LLM arg drift); (c) the tailored-native-allow/deny reshape, which made **per-harness native allow/deny the safety floor** — infeasible on Codex (no per-op grammar) and bypassed on opencode headless. This version makes **HyperIdle's own broker/registry chokepoint (`registry.invoke`) the uniform safety floor across every harness**; harness-native allow/deny demotes to per-harness defense-in-depth tightening.

Per-workpackage concept under Track AL (Review Experience). Reshapes one load-bearing noun (`Staged Operation` → `Proposed Call`) and introduces three satellites (`broker-gate floor`, `tailored broker policy`, two-session resume). The Track AL frame — review *experience* over the existing thread/verdict/artifact system, verdict grammar unchanged — is a fixed input.

---

## The reframe (read this first)

The shipped AL7 made **HyperIdle's kernel re-execute** the agent's operation: an agent called `stage_operation`; on approve a hardcoded `executeCapability` map ran the call from HyperIdle's own process. **Discarded whole.**

The first redo correctly inverted ownership (the agent's own session/tools/creds execute, HyperIdle gates) but located the guarantee in the **wrong place**: it made session 2 re-run the captured call *byte-faithfully* — a SHA-256 hash match permitting exactly-those-bytes — and a hash mismatch (LLM arg drift) **deadlocked** the approved work.

The second redo dissolved that deadlock (good) but then bet the entire safety guarantee on **each harness's native allow/deny grammar expressing the floor at init**. That claim is **false on Codex** (only global sandbox modes + a global/category approval policy; no per-op allowlist; no external-readable approval event in non-interactive `codex exec`) and **unreliable on opencode** (per-tool allow/ask/deny exists in `opencode.json`/frontmatter, but the docs say non-interactive `run` *auto-approves all permissions*). A floor that holds on 2 of 4 harnesses is not a floor.

**The locked model: the floor is HyperIdle's own broker chokepoint; native allow/deny is a bonus layer.**

Irreversible LIVE operations are **HyperIdle-brokered**. The live credential is **HyperIdle-held and never present in the agent's sandbox** (the capability split + AN sandbox provisioning). So an irreversible live op can *only* happen through the brokered tool — and every brokered / MCP-routed tool call funnels through the **same per-session `registry.invoke` chokepoint** (`tool-registry.ts:274`; builtin internal `:741`, provisioning loop `:844`, MCP bridge `mcp-bridge.ts:132` — all on the one per-session registry instance, `session-provisioning.ts:582`). Therefore a gate placed at `registry.invoke` covers irreversible ops **uniformly on EVERY harness — including Codex — regardless of the harness's native permission grammar.** That is the floor that holds everywhere.

**This is NOT the rejected v1 kernel executor.** There is no hardcoded capability map and HyperIdle re-implements no tool. The agent's OWN brokered call runs (with the HyperIdle-held credential attached at the broker boundary — the AN credential-injection model); HyperIdle gates allow/deny and captures the call — it does not author or re-execute the tool. "HyperIdle executes nothing of its own" stays intact: the broker attaches a credential and decides allow/deny/capture; the agent's harness emitted the call and the tool's own handler runs it. (See rejection list #1.)

```
SESSION 1 — irreversible call DENIED at the broker floor (registry.invoke)
  agent's brokered/MCP-routed call reaches registry.invoke
  → classified irreversible → denied + recorded (the deny-with-record capture)
  → captures the exact attempted call (tool + args) as the review subject (Proposed Call)
  → session 1 ENDED via the abort rail (so the denied call cannot loop/retry-with-drift)
        │
     REVIEW — human approves (or holds with a non-approving verdict)
        │
SESSION 2 — re-provisioned via an EXPLICIT proposed_call_granted trigger on the task-dispatcher
  the broker floor carries a TAILORED policy: allow the approved op + reversible work;
  deny every other irreversible op. Applied once at registry.invoke, then consumed.
  → the agent re-attempts; the broker permits only the approved scope
  → agent's own brokered tool (HyperIdle-held cred) runs it → continues working → Outcome recorded

  PER-HARNESS TIGHTENING (defense-in-depth, where the grammar expresses it):
    builtin   → the registry.invoke gate IS the floor (HyperIdle owns the loop)
    Claude SDK→ allowedTools/disallowedTools + canUseTool (arg-level) on top of the floor
    opencode  → opencode.json/frontmatter permission allow/ask/deny on top of the floor
    Codex     → coarse global --sandbox backstop only (no per-op native grammar)
```

**The floor is uniform; the tightening is not.** The floor (`registry.invoke` deny-with-record + consume-once) is identical on all four harnesses because the irreversible brokered call must pass through it. The native allow/deny is a **bonus defense-in-depth layer** added where each harness's grammar supports it — it is NOT the safety mechanism and AL7 does not depend on it for the floor.

**Byte-faithful execution is an OPTIMIZATION, not the gate** (unchanged from the prior redo). Where a layer expresses *arg-level* scope (builtin's in-process arg check at `registry.invoke`; a Claude `canUseTool` arg-pin), HyperIdle MAY additionally tighten "the approved tool" to "the approved tool with exactly these args." That is optional per-harness work, not load-bearing, and there is **no exact-hash-match-to-permit**, so **no deadlock**.

The **safety floor** is therefore: *session 2 cannot execute any irreversible operation other than the approved one — enforced at `registry.invoke`, the broker chokepoint, uniformly on every harness.* The **optimization frontier** is: tighten "the approved tool" to "the approved tool with exactly these args" wherever arg-level scope exists. (See the residual, Phase 2.)

---

## Required reading (for `/architecture` and `/pipeline`)

- This file — the locked concept.
- `docs/process-layer/staged-operation.md` — ground-truth (file path kept stable; noun is `Proposed Call`; model = uniform broker-floor at `registry.invoke` + per-harness native tightening).
- `packages/server/src/tools/tool-registry.ts:264-294` — the `invoke` chokepoint (`:274`): **the uniform broker floor + the universal in-process capture/record point + one-shot consume of the tailored policy**. The single seam every brokered/MCP-routed irreversible call passes through.
- `packages/server/src/services/session-provisioning.ts:582` — the **same per-session registry instance** is wired to builtin internal calls (`:844` loop), MCP bridge, and the SDK adapter; this is why the floor is uniform.
- `packages/server/src/mcp/mcp-bridge.ts:96-135` — MCP-routed tools (every CLI/SDK MCP call) funnel through `registry.invoke` (`:132`). This is how a Codex/opencode/Claude agent's call reaches the floor.
- `packages/server/src/harness/builtin-harness-adapter.ts` — builtin loop; `registry.invoke` (`:741`) is the floor + capture; `executeToolCalls` honors `aborted` (`:717`); `mcpSupport:false` (`:336`) — builtin hits `registry.invoke` *directly*, not via an MCP client.
- `packages/server/src/harness/claude-agent-sdk-adapter.ts:154-162` — `queryOptions` sets `permissionMode`; AL7 adds `allowedTools`/`disallowedTools` + an optional `canUseTool` arg-pin as **native tightening** (not the floor). SDK `PermissionResult` shape verified.
- `packages/server/src/harness/cli-harness-adapter.ts` + `packages/server/src/harness/adapter-pool.ts:324-353` — the CLI adapter. **Present reality (verified June 2026):** `CLI_TOOL_CONFIGS` registers `aider`, `goose`, `opencode` only — **no `codex` registration exists**; the opencode registration is `args:["--dir","{{workspace}}"]`, `eventFormat:"text"`, no permission surface, and **does not consume `{{mcpUrl}}`**. The MCP route to the floor is net-new wiring for the CLI harnesses.
- `packages/server/src/harness/harness-capability-descriptors.ts:11` — `KNOWN_HARNESS_FAMILIES = ["codex","claude-code","cursor-agent","opencode"]` (+ builtin). cursor-agent is `unavailable`; AL7 covers the other four, at the feasibility stated in the matrix below.
- `packages/fabric/src/services/task-dispatcher.ts:500-514` — `handleSessionEnded` re-dispatches only on owner *change* → AL7 needs an EXPLICIT `proposed_call_granted` trigger.
- `packages/server/src/services/session-run-registry.ts` — the abort rail (session-1 termination).
- `packages/server/src/routes/threads.ts:1254-1392` — verdict resolution (first-verdict-wins).
- `packages/server/src/routes/reviews.ts` — review composition / loader.
- `packages/db/src/schema.ts:1004-1059` — `staged_operations` / `operation_outcomes` (reshaped to a Proposed-Call record).

---

## Phase 0 — The nouns

| Noun | Class | One-line working definition |
|---|---|---|
| **Proposed Call** | **Reshaped** (was `Staged Operation`) | The exact, fully-bound tool call (tool id + args) an agent attempted and the broker floor denied, captured verbatim as the subject a human reviews. |
| **Broker-gate floor** | **New** | HyperIdle's own per-session chokepoint at `registry.invoke` — the *uniform* allow/deny/capture point every brokered/MCP-routed irreversible call passes through, on every harness. The safety mechanism. |
| **Native tightening** | **New** | The harness's *own* allow/deny grammar (Claude `allowedTools`/`disallowedTools`+`canUseTool`; opencode `opencode.json` permission; builtin = the floor itself) added *on top of* the broker floor where it exists — defense-in-depth, not the floor. |
| **Tailored broker policy** | **New** (replaces "one-shot grant" as the *mechanism*) | The session-2 policy consumed at the broker floor: allow the approved op + reversible work, deny every other irreversible op; applied once, consumed once. |
| **Outcome** | **Stable** (kept from shipped AL7) | The immutable terminal record of what session 2's executed call returned (ok + receipt / failed + error). |
| **Verdict** | **Stable** (Track AL) | The binding human decision on a review subject. Grammar unchanged; approve gains a consequence (compose policy + re-provision), not a new action. |
| **Session** | **Stable** | A detached one-shot harness run. Not pausable. `active \| done \| crashed`. |

Stable nouns are inputs. The concept work below covers **Proposed Call**, **broker-gate floor**, **native tightening**, **tailored broker policy**.

**Human design review forecast:** No. No novel UI; rides the existing action-operation review canvas (`reviews.ts` / `ReviewComposition.tsx`). `/design` skipped per the workpackage brief.

---

## Phase 1 — Essence

### Proposed Call

1. **Identity.** A *captured intent to act* — a snapshot of one tool invocation (tool id + fully-bound args) frozen at the moment the broker floor denied it. Not a queued job, not a command HyperIdle will run. It is the **subject of a review**, until a human approves and the *agent's own brokered call* runs it under a tailored broker policy.

2. **Essential properties.** The **tool identity** (the harness/MCP tool name); the **bound arguments** verbatim; the **blocked session** it came from + the **task/thread** it anchors to; the **review message** that gates it; a **reversibility** classification (irreversible — why it was captured at all). It carries NO HyperIdle-side executor reference, NO capability-allowlist membership. *(An identity hash over (tool id, normalized args) is OPTIONAL metadata used only by the arg-pin optimization; it is NOT the gate.)*

3. **Rejection list.** See Phase 2.

4. **Composition.** Attaches to exactly one review message (the gate) and one subject thread (anchor). Carries the captured tool id + args + reversibility. Referenced by at most one Outcome (0..1, written by session 2). Nested on the action-operation artifact the review canvas renders.

5. **Lifecycle.**
   ```
   captured  ── agent's brokered/MCP-routed call denied at the broker floor in session 1; capture
      │
      ├─ (approve verdict) → granted ── session 2 re-provisioned with a TAILORED broker policy
      │                          │       (allow the approved op + reversible work; deny other irreversible)
      │                    agent re-attempts; broker floor permits the approved scope; policy consumed once
      │                          │
      │                    ┌─────┴─────┐
      │                 executed     failed   (Outcome written; terminal)
      │
      └─ (non-approve: request-changes / reject / edit) → held (never executed)
   ```
   `captured → granted → executed|failed` and `captured → held`. No `executing` *kernel* state — HyperIdle never holds an in-flight execution; the agent's brokered call does.

6. **Authority.** The **agent produces** the Proposed Call by attempting the call (the broker floor denies + records it; no `stage_operation` tool). The **human authorizes** via the verdict. The **agent's session executes** in session 2 through its own brokered call under the tailored policy. HyperIdle **owns the capture record + the tailored policy + the Outcome record + the credential attached at the broker** — the *bookkeeping and brokering of the gate*, never authoring or re-executing the tool. Source of truth for "did it happen" is the **Outcome**, from the real tool return inside session 2.

7. **Vocabulary collision.** `Staged Operation` collides with the rejected kernel-exec model — retired. `Proposed Call` is new and unambiguous. Does not collide with `Task`, `Session`, `Verdict`, or `Block`.

### Broker-gate floor (the safety mechanism)

1. **Identity.** HyperIdle's own per-session chokepoint at `registry.invoke`. Every brokered / MCP-routed tool call — including every irreversible live op, because its credential is HyperIdle-held and brokered — passes through this one seam on every harness. The gate that allows/denies/captures lives here.
2. **Essential properties.** One per session (`session-provisioning.ts:582`); wired to builtin internal calls (`:741`), the provisioning loop (`:844`), and the MCP bridge (`mcp-bridge.ts:132`). At the floor: classify reversibility (fail-closed); allow reversible; deny + record irreversible (session 1) or deny-other-irreversible while consuming the tailored policy for the approved op (session 2). Harness-grammar-independent — it is HyperIdle's code, not the harness's.
3. **Why it covers irreversible ops on every harness, incl. Codex.** The live credential is never in the agent's sandbox; the only path to an irreversible live op is the brokered tool; the brokered tool routes through `registry.invoke`. So even a harness with *no* per-op native grammar (Codex) cannot reach an unapproved irreversible op around the floor — there is no credential in the sandbox to do it with.
4. **Authority.** HyperIdle owns and enforces the floor in its own process; no harness cooperation required.

### Native tightening (defense-in-depth, per harness)

1. **Identity.** The harness's *own* allow/deny grammar, configured at session init, added *on top of* the broker floor where the grammar exists. Not the floor.
2. **Per-harness surface.** builtin: the `registry.invoke` floor *is* the gate (no separate native layer needed). Claude (SDK): `allowedTools`/`disallowedTools` + `canUseTool` (arg-level) — verified. opencode: `opencode.json`/agent-frontmatter `permission` allow/ask/deny — last-match-wins (note: docs say non-interactive `run` may auto-approve, so this is a bonus, not relied upon). Codex: only coarse global `--sandbox` (`read-only`/`workspace-write`/`danger-full-access`) — a backstop, not per-op.
3. **Authority.** HyperIdle composes the native config from the same `SessionPermissionPolicy` and the adapter applies it at init; the harness enforces it as a *second* layer. AL7's correctness does not depend on it.

### Tailored broker policy

1. **Identity.** The session-2 policy consumed at the broker floor, narrowed so the agent can execute **the approved operation + reversible work** and **nothing else irreversible**. Applied once at `registry.invoke`, consumed once, so a later re-attempt of a *different* irreversible op is denied + re-captured.
2. **Essential properties.** Scoped to the session-2 re-provision of one task by one agent; allows the approved op (tightened to exact args where a layer expresses arg-level scope — optimization); denies all other irreversible ops; single-use per approved Proposed Call (a re-open mints a fresh policy).
3. **Authority.** Composed by HyperIdle at approve-time from the approved Proposed Call; consumed at the broker floor; (optionally) also translated to native allow/deny by each adapter as tightening.

---

## Phase 2 — Rejection list (load-bearing)

**A Proposed Call / this whole loop is NOT:**

1. **NOT a Kernel-executed operation, and the broker floor is NOT the v1 executor.** HyperIdle does not author or re-run the tool. *The distinction:* the v1 executor had a hardcoded `executeCapability` capability map and ran the call *from HyperIdle's own process as a HyperIdle action*. The broker floor has **no capability map**, re-implements **no tool**, and runs **nothing of its own** — it sits on the path the agent's *own* brokered call already takes, attaches the HyperIdle-held credential (the AN injection model), and decides allow/deny/capture. The executor is still the agent's harness emitting the call; the tool's own handler runs it. *Why this matters:* the founder rejected v1 as "yet another integration layer that re-executes." Gating the agent's own call at a chokepoint is not re-execution — it is the gate-and-bookkeeper role HyperIdle already plays at `registry.invoke`.

2. **NOT a curated capability allowlist.** No `KERNEL_DISPATCHABLE_CAPABILITIES`. *Why:* the floor is generic (allow/deny by reversibility), the capture is generic (any tool + any args), the tailored policy is generic (allow the approved tool/op). HyperIdle never needs to know what `github/merge_pr` *means*.

3. **NOT a live session pause / native held "ask."** Approve does not un-pause a suspended turn. *Why:* HyperIdle sessions are detached one-shots; on end the sandbox + history are destroyed; only abort exists. The review spans **two sessions** with context reassembly. **Enforcement is the broker floor (synchronous deny+record at session init/run time), not a held call-time ask** — so AL7 needs NONE of the net-new async-approval transports (Codex app-server JSON-RPC, opencode SSE).

4. **NOT an agent-authored spec.** No `stage_operation` tool. *Why:* an agent-authored spec can lie or drift; the *real attempted call* captured at the broker floor is the only faithful subject. (Discards `tools/stage-operation.ts`.)

5. **NOT a byte-faithful replay gate / exact-hash-match-to-permit.** Session 2 is NOT permitted by matching a SHA-256 of the captured bytes. *Why:* a hash-match gate deadlocks the approved work on any LLM arg drift; it is fragile and harness-specific. The gate is the **tailored broker policy at `registry.invoke`**, which forbids *other* irreversible ops regardless of arg drift. Byte-fidelity survives only as an **optional arg-pin optimization** where a layer expresses arg-level scope.

6. **NOT a floor that depends on harness-native allow/deny.** *Why (the prior reshape's fatal flaw):* Codex has no per-op native grammar and no external-readable approval event in `codex exec`; opencode's native permission may be auto-approved in headless `run`. A floor that rides native grammar holds on 2 of 4 harnesses. The broker floor at `registry.invoke` does not depend on any harness's grammar — it is HyperIdle's own code on the one path the brokered irreversible call must take. Native allow/deny is **defense-in-depth tightening**, never the floor.

7. **NOT a transactional multi-step rollback engine.** One Proposed Call = one tool call. Compensating/undo logic beyond the call's own semantics is out of scope (Track AL out-of-scope, unchanged).

8. **NOT a verdict-grammar change.** Approve stays approve. It gains a consequence (compose the policy + re-provision), not a new button.

9. **NOT Claude-only, and NOT silently all-four.** The broker floor is built + live-proven on the harnesses whose adapter exists and can route the brokered call to `registry.invoke` (builtin + Claude now). Codex and opencode are **named net-new build tasks** (Codex: no adapter registered at all; opencode: no MCP-URL wiring, no permission surface) — supported-pending-adapter, not silently dropped and not falsely claimed green. See the DONE matrix in Phase 4.

---

## The residual — the optimization frontier (stated plainly, per founder direction)

The safety floor is *"no **other** irreversible operation executes in session 2."* Where the allow check scopes only by tool **name** (not exact args), session 2 could permit the **same approved tool with different args** — e.g. approve "refund $10 on charge X", a drifted "refund $50 on charge X" would also pass a name-scoped allow.

This is the **optimization frontier**, not a hole in the floor:
- **The floor still holds:** no *other* irreversible op runs; the agent re-derived the *same* approved op; an *unrelated* irreversible op is denied + re-captured at the broker floor.
- **Tighten it** where arg-level scope exists: builtin checks the args in-process at `registry.invoke`; Claude pins/checks args in a `canUseTool` hook.
- **This is acceptable per founder direction** — stated openly, not hidden.

---

## Phase 3 — Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Proposed Call** | The exact captured tool call (id + bound args) the broker floor denied, reviewed as a subject. | staged operation, staged op, operation spec, `StagedOperationSpec`, dispatchable capability |
| **Broker-gate floor** | HyperIdle's own uniform chokepoint at `registry.invoke` — allow/deny/capture/consume for every brokered + MCP-routed irreversible call, on every harness. | kernel executor, dispatcher, capability map, native permission gate (the native gate is *tightening*, not the floor) |
| **Native tightening** | The harness's own allow/deny grammar added on top of the broker floor where it exists; defense-in-depth, not the safety mechanism. | the gate, the floor, the safety mechanism (it is none of these) |
| **Tailored broker policy** | Session-2 policy consumed at the broker floor: allow the approved op + reversible, deny other irreversible; consume-once. | one-shot grant (retired as mechanism), replay grant, exact-hash grant |
| **Arg-pin (optimization)** | Optional tightening of the allow from "the approved tool" to "the approved tool with these exact args". | byte-faithful replay, deterministic registry replay (techniques for the optimization, not the gate) |
| **Outcome** | Immutable terminal record of what the executed call returned. | result, receipt (receipt is a *field* of Outcome) |
| **Two-session resume** | Deny in session 1 → review → re-provision session 2 with the tailored broker policy. | pause/resume, suspend, live continuation |

`capability` as a *noun for what HyperIdle dispatches* is retired. (The AM2 `HarnessCapabilityDescriptor` keeps its name — different meaning.)

---

## Phase 4 — Contracts

- **Cardinality.** A Proposed Call → exactly one review message (gate) and one subject thread (anchor). A Proposed Call → 0..1 Outcome. A tailored policy → exactly one approved Proposed Call, valid in exactly one session-2 re-provision.
- **Closure.** The tool/args vocabulary is **open** — any tool the agent can call can be captured; HyperIdle enumerates nothing. Reversibility classification is **closed** (`irreversible | reversible`) and drives deny-vs-allow at the floor.
- **Mutability.** The captured tool id + args are **immutable** once captured (what the human reviewed). The Outcome is **immutable** (PK = proposed-call id enforces 0..1 + no overwrite). A retry produces a **new** Proposed Call with its own Outcome.
- **Identity.** A Proposed Call's id is opaque + stable. The (tool id, normalized args) hash is **optional metadata** for the arg-pin optimization — NOT the safety gate.
- **Hard rules:**
  1. **HyperIdle executes nothing of its own.** The agent's own session/tools/brokered-credentials run the call. HyperIdle gates + captures + brokers the credential + records the outcome at `registry.invoke` — it never authors a tool, never re-implements one, never runs one from its own process as a HyperIdle action. (The broker floor is distinct from the v1 executor — rejection #1.)
  2. **The safety floor is the broker chokepoint, uniform on every harness.** `registry.invoke` denies every irreversible op except the approved one, because the irreversible call's credential is HyperIdle-held and the brokered call must pass through this seam — independent of any harness's native permission grammar.
  3. **Native allow/deny is defense-in-depth tightening, not the floor.** Added where the grammar expresses it (Claude, opencode, builtin); never the safety mechanism; AL7 does not depend on it for correctness.
  4. **Session 2 cannot execute any irreversible op other than the approved one.** Enforced at the broker floor. (Arg-level exactness is the optimization frontier — see the residual.)
  5. **Two-session async resume, not live pause.** Deny ends session 1; approve re-provisions session 2 via the task-dispatcher rail with the tailored policy.
  6. **Reversible auto-flows; irreversible gates.** Reversible calls pass the floor with no review. Only irreversible calls are captured → reviewed.
  7. **A non-approving verdict never executes.** Held Proposed Calls are never granted a tailored policy.
  8. **DONE is per-harness honest, not all-four-or-loop-forever.** AL7 is DONE when the uniform broker floor is proven LIVE (real irreversible brokered call, real return, agent continues) on every harness whose adapter exists and routes to the floor (builtin + Claude). Codex + opencode are named net-new build tasks with explicit terminal states (see the DONE matrix below); they are `net-new-adapter-pending`, not silently dropped and not falsely green. No fixture/stub proof.
  9. **Broker floor, not async hold.** Enforcement is synchronous deny+record at `registry.invoke`; no net-new async-approval transport (Codex app-server, opencode SSE) is required.

### Per-harness feasibility + DONE matrix

| Harness | Broker floor feasible? | Adapter exists + routes to floor? | Native tightening | DONE state |
|---|---|---|---|---|
| **builtin** | **YES** — `registry.invoke` IS the floor; HyperIdle owns the loop (`:741`). | YES (direct; `mcpSupport:false`, calls `registry.invoke` directly). | n/a — the floor *is* the gate. | **green** — full live proof now. |
| **Claude (Agent SDK)** | **YES** — MCP-routed brokered call funnels through `registry.invoke` (`mcp-bridge.ts:132`). | YES (SDK adapter wired; small net-new MCP-route assertion). | `allowedTools`/`disallowedTools` + `canUseTool` arg-pin (verified). | **green** — full live proof now. |
| **Codex** | **YES** — covered by the broker floor; the live credential is never in the Codex sandbox, so the only irreversible-op path is the brokered MCP call through `registry.invoke`. Codex's *native* grammar cannot express the floor (global `--sandbox`/approval only, no per-op allow, no external-readable approval event in `codex exec`) — but it does not need to. | **NO — net-new.** No `codex` registration in `CLI_TOOL_CONFIGS` (`adapter-pool.ts:324-353`). Building the Codex adapter + wiring `{{mcpUrl}}` so the brokered call reaches the floor is an explicit task. | Coarse global `--sandbox` backstop only (no per-op native tightening). | **net-new-adapter-pending** — supported once the adapter exists; live-proven then. NOT silently dropped. |
| **opencode** | **YES** — same as Codex: broker floor via the MCP-routed brokered call. | **NO — net-new.** Registered adapter is `--dir`-only text-mode, no permission surface, **no `{{mcpUrl}}`** (`adapter-pool.ts:344-352`). Net-new: wire `{{mcpUrl}}` + `opencode run -f json` so the brokered call reaches + records at the floor. | `opencode.json`/frontmatter `permission` allow/ask/deny (last-match-wins) — **bonus only**; docs indicate non-interactive `run` may auto-approve, so not relied upon. | **net-new-adapter-pending** — supported once the adapter routes to the floor; live-proven then. |
| **cursor-agent** | — | — | — | **skipped** (`unavailable`, `harness-capability-descriptors.ts:11`). |

A pipeline pointed at this plan terminates: builtin + Claude must go green; Codex + opencode each terminate at `net-new-adapter-pending` until their adapter/MCP-routing task lands, at which point their live-proof lane runs. No lane loops forever trying to green a harness whose adapter does not yet exist.

---

## The open details — RESOLVED

### 1. The floor: the broker chokepoint at `registry.invoke`, uniform across harnesses → **locked.**
The safety mechanism is HyperIdle's own per-session `registry.invoke` gate. Every brokered/MCP-routed irreversible call passes through it (the credential is HyperIdle-held, never in the sandbox), so the floor holds on every harness regardless of native grammar — including Codex. Session 1: deny+record irreversible. Session 2: consume the tailored policy for the approved op, deny other irreversible. There is no exact-hash-match-to-permit, so no deadlock.

### 2. Capture location → **the broker floor at `registry.invoke`; native deny hooks are bonus records (confirmed).**
Capture is **synchronous deny+record at `registry.invoke`** — the uniform record point for HyperIdle-registered + MCP-routed tools, identical on every harness. The builtin loop hits it directly (`:741`); Claude/Codex/opencode reach it via the MCP bridge (`:132`) once their MCP route is wired. A harness's *own* deny hook (Claude `canUseTool`; opencode permission event) is an **optional second record**, not the capture mechanism. (The Codex native approval signal is NOT relied upon — `codex exec` exposes no external-readable approval event.)

### 3. Tailored-policy enforcement → **consumed at the broker floor (consume-once); native allow/deny is optional tightening.**
At approve-time HyperIdle composes a `SessionPermissionPolicy` (session role + the approved op) and threads it through `SessionConfig` → `provisionSession`. The **floor** consumes it via a single-statement atomic CAS at `registry.invoke` (allow the approved op once, deny other irreversible). Each adapter MAY *additionally* translate it to native allow/deny at init as defense-in-depth: builtin (the floor itself), Claude (`allowedTools`/`disallowedTools`+`canUseTool`), opencode (`opencode.json` permission). Codex gets only a coarse `--sandbox` backstop. The native layer is never the consume point — the broker floor is.

### 4. Reversible auto-flow + work-continues → **locked.**
Reversible calls → **allowed at the floor, no review**. Irreversible calls → **capture → review → reinit session 2 with the tailored broker policy**. The work-continues loop IS the session-2 resume: on approve the verdict path emits **`proposed_call_granted`** and the task-dispatcher's dedicated subscription re-provisions session 2 (NOT the owner-change `session_ended` path), the agent re-attempts within the narrowed scope and **keeps working**. AL7 is **done** per the per-harness DONE matrix (Phase 4): live-proven on builtin + Claude now; Codex + opencode are named net-new adapter tasks.

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
- **The broker chokepoint (`registry.invoke`) — the uniform floor + universal in-process record point + one-shot consume of the tailored policy.** The single most load-bearing reuse.
- The init surface (`SessionConfig` + `harness.startSession`) — extended with the permission policy (consumed at the floor; optionally applied as native tightening).
- The Claude `permissionMode` knob (native tightening); the CLI spawn-arg + `{{mcpUrl}}` template surface (for routing CLI brokered calls to the floor); the AM2 capability descriptor.
- The `staged_operations` / `operation_outcomes` tables, **reshaped** to a Proposed-Call record (captured call + tailored policy + outcome) — NOT a kernel execution queue. Column reshape is `/architecture`'s job.

---

## Rationale

The founder rejected the first AL7 because it made HyperIdle a tool-execution engine with a curated capability map. The byte-faithful redo correctly inverted ownership but bet the guarantee on deterministic replay — a hash-match gate that deadlocks on LLM arg drift. The tailored-native-allow/deny reshape dissolved the deadlock but bet the guarantee on each harness's native grammar — false on Codex, unreliable on opencode headless.

The locked model puts the guarantee where HyperIdle already controls it on **every** harness: **its own broker chokepoint at `registry.invoke`.** Because irreversible live ops are brokered (the credential is HyperIdle-held, never in the sandbox), the only path to such an op is the brokered call, which funnels through the one per-session `registry.invoke` seam — so the floor holds uniformly, including on Codex, with zero dependence on the harness's permission grammar. Native allow/deny becomes a *bonus* defense-in-depth layer where the grammar supports it. This is **not** the v1 executor: there is no capability map, HyperIdle re-implements no tool, and the executor is still the agent's own brokered call — HyperIdle only gates, captures, brokers the credential, and records. The deadlock is gone (no exact-match-to-permit); byte-fidelity stays an honest optional arg-pin; and DONE is per-harness honest — live-proven on builtin + Claude now, Codex + opencode named as net-new adapter tasks rather than hand-waved as green.
