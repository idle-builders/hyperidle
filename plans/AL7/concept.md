# AL7 Concept — Review-Gated Tool Execution (trust-first redo)

**Status:** Locked. Trust-first redo (2026-06-24), re-anchored on **`ETHOS.md` §4 "Trust Agents"** + `docs/agent-layer/principles.md` §5 ("Trust agents; humans own the consequential"). It supersedes four earlier models, the last three of which the founder cut off for **spiralling into paranoia**:

- **v1 — Kernel executor.** HyperIdle re-ran the agent's op via a curated `executeCapability` map. Rejected as "yet another integration layer that re-executes."
- **v2 — Byte-faithful replay.** Made an exact-hash-match-to-permit the load-bearing gate. Deadlocks on LLM arg drift.
- **v3 — Per-harness native allow/deny as the safety floor.** Bet the guarantee on each harness's native grammar; infeasible on Codex, unreliable on opencode headless.
- **v4 — Broker-floor-as-fortress.** Made HyperIdle's own `registry.invoke` chokepoint a **containment fortress** ("the broker is the *only* path"), with a load-bearing **AN credential-containment dependency** ("no live-op credential in the sandbox"), a **native-tool-bypass threat model**, and a guarantee framed as *defending against a rogue agent*. **This is the paranoia the founder cut off.** ETHOS §4: "When you catch yourself designing against a hypothetical rogue agent, stop."

**This version re-anchors on trust.** We trust agents. The agent holds its own credentials, runs its own tools, does real work — like a real employee with broad self-permission. The review gate is **not a cage around a suspect — it is a collaboration checkpoint on the consequential and irreversible, and it fades as trust is earned.** We use the harness's **native permission mechanism (ask / allow / deny) as a WORKFLOW that routes consequential actions to a human** — not as a security boundary policing the agent.

Per-workpackage concept under Track AL (Review Experience). Reshapes one load-bearing noun (`Staged Operation` → `Proposed Call`) and introduces two satellites (`review checkpoint`, two-session resume). The Track AL frame — review *experience* over the existing thread/verdict/artifact system, verdict grammar unchanged — is a fixed input.

---

## The reframe (read this first) — trust, not containment

The shipped AL7 made **HyperIdle's kernel re-execute** the agent's operation. **Discarded whole** (v1). Two further redos (v2 byte-faithful, v3 native-floor) failed on fragility / feasibility. The fourth (v4) fixed feasibility but **re-framed the gate as a containment fortress** — and that is what the founder cut off.

**The trust-first model is much simpler, and that simplicity is the point.**

- **Creds are present in the sandbox, and that is correct.** The agent's tools and MCP servers need credentials to authenticate; a tool that can't auth is useless. We do **not** withhold credentials. We do **not** build "the broker is the only path." We are **not defending against the agent.**
- **The review gate is a collaboration checkpoint, not a guard.** It routes the *consequential / irreversible* to a human for judgment — the same role a senior teammate plays when a junior is about to do something with a big blast radius. Everything reversible flows. As the agent's verdict track record builds, more flows without review. **More autonomy is the goal.**
- **The mechanism is the harness's native permission system used as a workflow.** Every supported harness (builtin, Claude, Codex, opencode) ships an ask/allow/deny permission mechanism. HyperIdle composes a *workflow policy* — "route the irreversible to review, let the reversible flow" — and the harness's own permission mechanism carries it. We **build on what the harness natively provides; we don't re-implement it as a HyperIdle fortress.**

```
SESSION 1 — the agent works (trusted; full tools + its own creds)
  agent does real work; reversible calls flow freely
  → an IRREVERSIBLE call is routed to review (the harness's native ask/deny carries the workflow)
  → the attempted call (tool + args) is captured as the review subject (Proposed Call)
  → session 1 ENDS (sessions aren't pausable)
        │
     REVIEW — the human gives a verdict on the consequential action
        │
SESSION 2 — async re-provision on approve (proposed_call_granted trigger)
  → the agent simply does the approved work with its own tools — the harness permits it
  → re-attempting / re-deriving the call is FINE (we trust it intends the approved thing)
  → no exact-match enforcement; byte-fidelity is at most a minor convenience, not a guard
  → Outcome recorded → the agent CONTINUES working (closes the story / updates docs / proceeds)
```

**The gate fades as trust grows.** The verdict-history trust signal (`packages/fabric/src/services/policy-engine.ts`, AD4) graduates autonomy off the review track record — a trusted agent's reversible work already flows, and over time more flows without review. AL7 ships the gated arm for the irreversible; wiring the trust signal so *reversible* calls auto-flow (and the autonomy widening) is AL8.

**Byte-fidelity is not a guard.** We trust the agent intends the approved op. If the harness can't perfectly scope a permission to *exactly* one op, that is **acceptable** — we are not defending against the agent. The agent re-attempting / re-deriving the call in session 2 is fine. Byte-fidelity (pinning exact args) is at most a minor convenience where a harness expresses arg-level scope; it is **not** load-bearing and there is **no deadlock machinery**.

---

## Required reading (for `/architecture` and `/pipeline`)

- This file — the locked concept.
- `ETHOS.md` §4 "Trust Agents" + `docs/agent-layer/principles.md` §5 — the trust frame this concept obeys.
- `docs/process-layer/staged-operation.md` — ground-truth (file path kept stable; noun is `Proposed Call`; model = review checkpoint via the harness's native permission, fading with trust).
- `packages/server/src/tools/tool-registry.ts:264-294` — the `invoke` closure (`:274`): where HyperIdle classifies a brokered call's reversibility, **routes the irreversible to review** (capture + record), and on approve permits the approved work. The convenient place HyperIdle already participates in the agent's call — used as a *workflow router*, not a fortress.
- `packages/server/src/harness/claude-agent-sdk-adapter.ts:154-162` — Claude's native `canUseTool` (allow / **ask** / deny, with `updatedInput`) + `allowedTools`/`disallowedTools` — the native permission mechanism this workflow rides on Claude. *(verified: code.claude.com/docs/en/agent-sdk/permissions, June 2026.)*
- `packages/server/src/harness/builtin-harness-adapter.ts` — builtin loop; `registry.invoke` (`:741`) is where HyperIdle routes the call; `mcpSupport:false` (`:336`).
- `packages/server/src/harness/cli-harness-adapter.ts` + `packages/server/src/harness/adapter-pool.ts:324-353` — the CLI adapter. **Codex CLI 0.141.0** carries the workflow via **native PreToolUse hooks** (`.codex/hooks.json` → `.codex/hooks/*.sh`, **already wired by AL6**); a PreToolUse hook returns `permissionDecision:"deny"|"allow"` and fires in headless `codex exec`. **opencode 1.17.8** carries it via native `permission` (`opencode.json`, enforced by default in headless `run`) + the `opencode serve` `GET /event` SSE (`permission.asked`) + `POST /session/{sessionID}/permissions/{permissionID}` answer path. **Present reality (verified June 2026 against installed binaries):** `CLI_TOOL_CONFIGS` registers `aider`, `goose`, `opencode` only (no `codex` entry yet); the opencode registration does not consume `{{mcpUrl}}`. Both routes are **feasible headlessly**; the remaining work is wiring the adapter to the native mechanism — Codex reuses AL6's existing hook; opencode wires the serve `/event` path.
- `packages/server/src/harness/harness-capability-descriptors.ts:11` — `KNOWN_HARNESS_FAMILIES = ["codex","claude-code","cursor-agent","opencode"]` (+ builtin). cursor-agent is `unavailable`; AL7 covers the other four.
- `packages/fabric/src/services/task-dispatcher.ts:500-514` — `handleSessionEnded` re-dispatches only on owner *change* → AL7 needs an EXPLICIT `proposed_call_granted` trigger to re-engage the agent on approve.
- `packages/fabric/src/services/policy-engine.ts` — the verdict-history trust signal (AD4) the gate fades on; AL7 ships the gated arm, AL8 wires auto-flow.
- `packages/server/src/services/session-run-registry.ts` — the abort rail (session-1 termination, since sessions aren't pausable).
- `packages/server/src/routes/threads.ts:1254-1392` — verdict resolution (first-verdict-wins).
- `packages/server/src/routes/reviews.ts` — review composition / loader.
- `packages/db/src/schema.ts:1004-1059` — `staged_operations` / `operation_outcomes` (reshaped to a Proposed-Call record).

---

## Phase 0 — The nouns

| Noun | Class | One-line working definition |
|---|---|---|
| **Proposed Call** | **Reshaped** (was `Staged Operation`) | The exact tool call (tool id + args) an agent attempted, captured verbatim as the subject a human reviews when it is consequential/irreversible. |
| **Review checkpoint** | **New** (replaces "broker-gate floor — the safety mechanism") | The collaboration moment where HyperIdle routes a consequential/irreversible call to a human — carried by the harness's native permission mechanism (ask/allow/deny) as a *workflow*, not a security boundary. It fades as trust grows. |
| **Tailored grant** | **New** (replaces "tailored broker policy" as the *mechanism* framing) | The session-2 permission the agent works under after approve: do the approved op + reversible work; route any *other* irreversible op to review. A workflow scope, not a cage. |
| **Outcome** | **Stable** (kept from shipped AL7) | The immutable terminal record of what session 2's executed call returned (ok + receipt / failed + error). |
| **Verdict** | **Stable** (Track AL) | The binding human decision on a review subject. Grammar unchanged; approve gains a consequence (compose grant + re-engage), not a new action. |
| **Session** | **Stable** | A detached one-shot harness run. Not pausable. `active \| done \| crashed`. |

Stable nouns are inputs. The concept work below covers **Proposed Call**, **review checkpoint**, **tailored grant**.

**Human design review forecast:** No. No novel UI; rides the existing action-operation review canvas (`reviews.ts` / `ReviewComposition.tsx`). `/design` skipped per the workpackage brief.

---

## Phase 1 — Essence

### Proposed Call

1. **Identity.** A *captured intent to act* — a snapshot of one tool invocation (tool id + bound args) frozen at the moment HyperIdle routed it to review. Not a queued job, not a command HyperIdle will run. It is the **subject of a review**, until a human approves and the *agent's own session* runs the work.

2. **Essential properties.** The **tool identity** (the harness/MCP tool name); the **bound arguments** verbatim; the **origin session** + the **task/thread** it anchors to; the **review message** that gates it; a **reversibility** classification (irreversible — why it was routed to review at all). It carries NO HyperIdle-side executor reference, NO capability-allowlist membership. *(An identity hash over (tool id, normalized args) is OPTIONAL metadata for the arg-pin convenience; it is NOT a guard.)*

3. **Rejection list.** See Phase 2.

4. **Composition.** Attaches to exactly one review message (the gate) and one subject thread (anchor). Carries the captured tool id + args + reversibility. Referenced by at most one Outcome (0..1, written by session 2). Nested on the action-operation artifact the review canvas renders.

5. **Lifecycle.**
   ```
   captured  ── the agent's irreversible call is routed to review in session 1; the call is captured
      │
      ├─ (approve verdict) → granted ── session 2 re-provisioned with a TAILORED GRANT
      │                          │       (do the approved op + reversible work; route other irreversible to review)
      │                    the agent re-attempts; the harness permits the approved work; grant consumed once
      │                          │
      │                    ┌─────┴─────┐
      │                 executed     failed   (Outcome written; terminal)
      │
      └─ (non-approve: request-changes / reject / edit) → held (never executed)
   ```
   `captured → granted → executed|failed` and `captured → held`. No `executing` *kernel* state — HyperIdle never holds an in-flight execution; the agent's own session does.

6. **Authority.** The **agent produces** the Proposed Call by attempting the call (HyperIdle captures it when routing it to review; no `stage_operation` tool). The **human authorizes** via the verdict. The **agent's own session executes** in session 2 with its own tools + creds under the tailored grant. HyperIdle **owns the capture record + the tailored grant + the Outcome record** — the *bookkeeping of the checkpoint*, never authoring or re-executing the tool. Source of truth for "did it happen" is the **Outcome**, from the real tool return inside session 2.

7. **Vocabulary collision.** `Staged Operation` collides with the rejected kernel-exec model — retired. `Proposed Call` is new and unambiguous. Does not collide with `Task`, `Session`, `Verdict`, or `Block`.

### Review checkpoint (the collaboration moment — NOT a guard)

1. **Identity.** The moment a consequential/irreversible call is routed to a human for judgment. It is a **collaboration checkpoint** — like a senior teammate stepping in on a high-blast-radius action — not a security boundary policing a suspect. It rides the harness's **native permission mechanism** (ask/allow/deny) as a *workflow*.
2. **Essential properties.** Classify reversibility (fail-closed: unknown ⇒ treat as irreversible, i.e. route to review — out of *care*, not suspicion); reversible flows freely; irreversible is routed to review + captured. It uses whatever native ask/deny the harness provides to carry the workflow. **It fades as trust is earned** — the verdict-history trust signal widens the lane over time (AD4; auto-flow is AL8).
3. **Why creds-present is correct.** The agent holds its own credentials and runs its own tools — that is the product. We do not withhold creds and we do not claim "the checkpoint is the only path." The agent *could* do the irreversible thing with its own creds; **we trust it not to route around the collaboration checkpoint**, exactly as we trust a real employee not to route around a teammate's sign-off. The checkpoint is where a human *chooses* to weigh in, not a wall the agent is tested against.
4. **Authority.** HyperIdle composes the workflow (route irreversible → review; let reversible flow); the harness's native permission mechanism carries it; the human owns the verdict.

### Tailored grant

1. **Identity.** The session-2 permission the agent works under after approve, narrowed so the agent does **the approved operation + reversible work** and any *other* irreversible op is routed back to review. A **workflow scope**, not a cage. Applied once, consumed once; a re-attempt of a *different* irreversible op is routed to review again (not blocked-as-attack — surfaced for a fresh human decision).
2. **Essential properties.** Scoped to the session-2 re-provision of one task by one agent; permits the approved op (optionally tightened to exact args where a harness expresses arg-level scope — a minor convenience); routes other irreversible ops to review; single-use per approved Proposed Call (a re-open mints a fresh grant).
3. **Authority.** Composed by HyperIdle at approve-time from the approved Proposed Call; carried by the harness's native permission mechanism in session 2; the human's approve is what mints it.

---

## Phase 2 — Rejection list (load-bearing) — explicitly rejecting the paranoid framings

**A Proposed Call / this whole loop is NOT:**

1. **NOT a containment fortress, and the checkpoint is NOT "the only path."** *(Rejects the v4 paranoia — cited ETHOS §4.)* We do **not** build "the broker is the only path to an irreversible live op." We do **not** model a rogue agent routing around the checkpoint via native shell / raw HTTP / ambient creds. ETHOS §4: "When you catch yourself designing against a hypothetical rogue agent, stop. That is paranoia, and it is not the product." The checkpoint is where a human *chooses* to weigh in; it is not a wall the agent is adversarially tested against.

2. **NOT credential-withholding / capability-split-as-security.** *(Rejects the AN credential-containment dependency.)* Creds are present in the sandbox **and that is correct** — tools and MCP servers need creds to authenticate; a tool that can't auth is useless (ETHOS §4: "Don't withhold credentials an agent's tools need to function"). AL7 has **no dependency on a Track-AN "no live-op credential in the sandbox" guarantee.** There is no native-tool-bypass threat model and no credential-containment fortress. The agent has its creds; we trust it.

3. **NOT byte-faithful replay / exact-hash-match-to-permit as a guard.** *(Rejects v2 + the v4 "executed==reviewed hash-match-to-permit" guard.)* Session 2 is NOT permitted by matching a SHA-256 of the captured bytes. We trust the agent intends the approved op; **re-attempting / re-deriving the call is fine.** Byte-fidelity is at most a minor convenience (pin exact args where a harness expresses arg-level scope), **never a guard**, and there is **no deadlock machinery**. If the harness can't perfectly scope a permission to exactly one op, that is acceptable — we are not defending against the agent.

4. **NOT a Kernel-executed operation.** *(Rejects v1.)* HyperIdle does not author or re-run the tool — no `executeCapability` capability map, no re-implementation, nothing run from its own process as a HyperIdle action. The agent's own session runs the approved work with its own tools + creds. HyperIdle captures the call, surfaces it, and on approve re-engages the agent — the bookkeeper of the checkpoint, not the executor.

5. **NOT a curated capability allowlist.** No `KERNEL_DISPATCHABLE_CAPABILITIES`. The classification (reversible vs irreversible) and the capture are generic — any tool + any args. HyperIdle never needs to know what `github/merge_pr` *means*.

6. **NOT a re-implementation of the harness's permission system.** *(Honors the harness rules.)* We **build on the harness's native ask/allow/deny** as the workflow carrier; we do not invent a HyperIdle mechanism that duplicates it. Where a harness lacks a usable native ask in non-interactive mode (Codex `exec`, opencode headless), HyperIdle's participation point in the agent's brokered call (`registry.invoke`) carries the same *workflow* — route-to-review — but as a **workflow router we already own**, framed as collaboration plumbing, not a security floor.

7. **NOT a live session pause / native held "ask."** Approve does not un-pause a suspended turn. HyperIdle sessions are detached one-shots; on end the sandbox + history are destroyed; only abort exists. The review spans **two sessions** with context reassembly. (Kept from prior models — sessions aren't pausable.)

8. **NOT an agent-authored spec.** No `stage_operation` tool. The *real attempted call* captured when routing to review is the only faithful subject. (Discards `tools/stage-operation.ts`.)

9. **NOT a transactional multi-step rollback engine.** One Proposed Call = one tool call. Compensating/undo logic beyond the call's own semantics is out of scope (Track AL out-of-scope, unchanged).

10. **NOT a verdict-grammar change.** Approve stays approve. It gains a consequence (compose the grant + re-engage), not a new button.

11. **NOT a permanent brake.** The checkpoint **fades as trust is earned** (verdict-history trust signal, AD4). It is not held down by default; more autonomy is the goal. AL7 ships the gated arm; AL8 widens the lane.

---

## Phase 3 — Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Proposed Call** | The exact captured tool call (id + bound args) routed to review, reviewed as a subject. | staged operation, staged op, operation spec, `StagedOperationSpec`, dispatchable capability |
| **Review checkpoint** | The collaboration moment routing a consequential/irreversible call to a human, carried by the harness's native permission mechanism as a workflow; fades as trust grows. | broker-gate floor, the safety mechanism, the safety floor, containment fortress, the only path, security boundary |
| **Tailored grant** | Session-2 workflow scope: do the approved op + reversible, route other irreversible to review; consume-once. | tailored broker policy, one-shot grant, replay grant, exact-hash grant, the cage |
| **Arg-pin (convenience)** | Optional pinning of the allow to the approved tool *with these exact args*, where a harness expresses arg-level scope. A minor convenience, never a guard. | byte-faithful replay, exact-hash-match-to-permit, deterministic registry replay |
| **Outcome** | Immutable terminal record of what the executed call returned. | result, receipt (receipt is a *field* of Outcome) |
| **Two-session resume** | Route to review in session 1 → review → re-provision session 2 with the tailored grant. | pause/resume, suspend, live continuation |
| **Trust signal** | The agent's verdict-history approval rate; the checkpoint fades on it (AD4). | per-skill autonomy level (removed — AD4), per-tool risk table |

`capability` as a *noun for what HyperIdle dispatches* is retired. (The AM2 `HarnessCapabilityDescriptor` keeps its name — different meaning.)

**Explicitly retired vocabulary (the v4 paranoia):** "broker-gate floor", "the safety mechanism/floor", "containment fortress", "the only path", "credential-containment", "native-tool bypass", "AN dependency", "designing against a rogue agent", "exact-hash-match-to-permit as the gate". None of these appear in the trust-first model.

---

## Phase 4 — Contracts

- **Cardinality.** A Proposed Call → exactly one review message (gate) and one subject thread (anchor). A Proposed Call → 0..1 Outcome. A tailored grant → exactly one approved Proposed Call, valid in exactly one session-2 re-provision.
- **Closure.** The tool/args vocabulary is **open** — any tool the agent can call can be captured; HyperIdle enumerates nothing. Reversibility classification is **closed** (`irreversible | reversible`) and drives route-to-review vs flow.
- **Mutability.** The captured tool id + args are **immutable** once captured (what the human reviewed). The Outcome is **immutable** (PK = proposed-call id enforces 0..1 + no overwrite). A retry produces a **new** Proposed Call with its own Outcome.
- **Identity.** A Proposed Call's id is opaque + stable. The (tool id, normalized args) hash is **optional metadata** for the arg-pin convenience — NOT a guard.
- **Hard rules:**
  1. **We trust the agent.** AL7 does not design against a rogue agent, does not withhold credentials, and builds no "only path" containment. The checkpoint is a collaboration moment, not a guard. (ETHOS §4.)
  2. **HyperIdle executes nothing of its own.** The agent's own session/tools/creds run the call. HyperIdle captures + records + re-engages — it never authors a tool, re-implements one, or runs one from its own process. (Rejects v1.)
  3. **The checkpoint routes the consequential to a human, via the harness's native permission as a workflow.** Reversible flows; irreversible is routed to review. We build on the harness's native ask/allow/deny, not a re-implementation.
  4. **The agent re-attempting the approved op in session 2 is fine.** No exact-match-to-permit; byte-fidelity is at most a convenience; no deadlock machinery. If a harness can't scope a permission to exactly one op, that is acceptable.
  5. **Two-session async resume, not live pause.** Route-to-review ends session 1; approve re-provisions session 2 via the task-dispatcher rail with the tailored grant.
  6. **Reversible auto-flows; irreversible routes to review.** Only irreversible calls are captured → reviewed.
  7. **A non-approving verdict never executes.** Held Proposed Calls are never granted.
  8. **The work continues after the result.** On approve the agent re-engages, runs the approved op, and **keeps working** (closes the story / updates docs / proceeds). **This is the *same* session-2 run proceeding after the approved tool returns — not a third event.** There is exactly one re-engagement event (`proposed_call_granted` → session 2); after the Outcome the agent simply continues in that same run. (NIT-3 — "the operation-finish event re-engages the agent" was a phantom event; there is no second/third re-dispatch in the happy path. The only *re*-provision is the AC11b liveness net on crash/no-show.) Folded in; was AL10.
  9. **The gate fades as trust grows.** It rides the verdict-history trust signal (AD4); more autonomy is the goal. AL7 ships the gated arm; AL8 widens the lane.
  10. **DONE is proven LIVE on the real installed harnesses.** The trust-first loop (agent proposes irreversible op → review → approve → agent executes with its own tools → continues) is integration-tested against the real installed harness per supported harness — never a stub. **All four are feasible headlessly via native permission features** (verified June 2026): builtin + Claude green now (smallest wiring); Codex green once AL6's existing `.codex/hooks.json` PreToolUse hook is extended (7c); opencode green once `opencode serve` + `/event`+POST is wired (7b). None is infeasible; the remaining work is wiring the adapter to the native mechanism.

### Per-harness native-permission routing + DONE matrix

*(Verified June 2026 against the installed binaries — Codex CLI 0.141.0, opencode 1.17.8 — and current web docs. All four harnesses are **FEASIBLE HEADLESSLY** via native permission features. The earlier "Codex/opencode = no answerable ask / net-new capability pending" reading is **overturned**: both expose a native externally-answerable route-to-review path headlessly. The remaining work is **wiring the adapter to the native mechanism**, not a missing capability.)*

| Harness | Native permission mechanism (the workflow carrier) | Adapter wiring | DONE state |
|---|---|---|---|
| **builtin** | HyperIdle owns the loop; `registry.invoke` (`:741`) is the router — classify + route-to-review + record + consume here. | YES (direct; `mcpSupport:false`). | **green now** — smallest wiring. |
| **Claude (Agent SDK)** | `canUseTool` (allow / **ask** / deny, with `updatedInput`) + `allowedTools`/`disallowedTools` + `permissionMode` at init — externally-answerable native ask, can pend. *(verified June 2026.)* | YES — SDK wired; small net-new MCP-route assertion. | **green now** — smallest wiring. |
| **Codex (CLI 0.141.0)** | **Native PreToolUse hooks** via `.codex/hooks.json` (the repo ALREADY has this from **AL6**: `PreToolUse`/`PostToolUse` matchers → `.codex/hooks/*.sh`). A PreToolUse hook gets the tool call as JSON on stdin (`tool_name`, `tool_input.command`, `tool_use_id`, `session_id`, `cwd`) and returns `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"|"deny",...}}` (or exit 2 = block). **deny-in-run-1 / allow-in-run-2 is supported** (decisions vary per run; trust is per-hash) — this IS the two-session model. Fires in headless `codex exec`. Config-at-start via `-c key=value`, `-p/--profile`, `-s/--sandbox`, `approval_policy`, execpolicy `.rules`. | **Wiring-needed** — extend AL6's existing `.codex/hooks.json` PreToolUse hook to call HyperIdle's route-to-review decision (build on what's already wired). | **green once wired** (Task 7c). |
| **opencode (1.17.8)** | **Native `permission` config** in `opencode.json` (`allow`/`ask`/`deny` per tool + bash/path glob, last-match-wins) at init; headless `opencode run` **enforces permissions by default** (`--dangerously-skip-permissions` bypasses). Event-driven answering via **`opencode serve` + `GET /event` SSE (`permission.asked` { id, sessionID, permission, patterns[], tool.callID }) + `POST /session/{sessionID}/permissions/{permissionID}` body `{"response":"once"|"always"|"reject"}`** (turn blocks until reply). *(verified against the installed 1.17.8 `/doc` OpenAPI.)* | **Wiring-needed** — register `opencode serve`, subscribe `/event`, answer via POST; set `opencode.json` permission at init. | **green once wired** (Task 7b). |
| **cursor-agent** | — | — | **skipped** (`unavailable`, `harness-capability-descriptors.ts:11`). |

**Uniform two-session model on native mechanisms.** Every harness runs the *same* loop on its *own* native mechanism: **session 1** = native deny/capture (Codex PreToolUse-hook `deny` / opencode `/event` `reject` / Claude `canUseTool` `deny` / builtin `registry.invoke` deny) → capture the Proposed Call → end; **session 2** = native allow for the approved op (Codex hook `allow` per-hash / opencode `opencode.json` permission or `/event` `once` / Claude `allow` / builtin `registry.invoke`). This fits HyperIdle's async non-pausable sessions and long human reviews — the native decision simply differs run-to-run.

All four are feasible; a pipeline terminates with builtin + Claude green at the smallest wiring, Codex green once AL6's existing hook is extended (7c), opencode green once the serve `/event` path is wired (7b). **No harness is infeasible; none loops forever waiting on a missing capability.**

**What the checkpoint covers on a headless CLI harness (WARNING-1, ETHOS §4 — stated once).** On a headless CLI harness the checkpoint covers the agent's **MCP-routed calls** (those that pass through HyperIdle's bridge to `registry.invoke`, plus the harness's own native permission carrier), and the agent is **trusted not to route the irreversible op around the bridge** (raw shell / direct HTTP / its own creds). This is ETHOS §4 — not a defect to bypass-proof: we do not model a rogue agent circumventing the gate, exactly as we do not model an employee circumventing a teammate's sign-off. The participation point does **not** intercept everything the subprocess could do; it carries the workflow for the call the agent is trusted to make through the gated path.

> **Honest wiring residuals (bounded facts, NOT blockers).** (1) **Codex** PreToolUse hooks reliably fire for **shell/Bash** calls; coverage for `apply_patch` file-edits and MCP tool calls is **incomplete** — so an irreversible op gated via the Codex hook must be **shell-expressible**, OR use the `app-server`/`mcp-server` JSON-RPC approval path (`execCommandApproval`/`applyPatchApproval`, turn blocks until answered) as the async channel outside plain `exec`. `permissionDecision:"ask"` is parsed but NOT yet supported — use `deny`/`allow`. (2) **opencode** the `permission.ask` plugin hook has open reliability bugs — prefer the `opencode serve` `/event`+POST path as load-bearing. There is **no** `OPENCODE_PERMISSION` env var. These are wiring caveats, not infeasibility, and not security claims (ETHOS §4 — we are not caging the agent).

---

## The minor convenience frontier (stated plainly, no longer a "residual hole")

In the trust-first model there is **no security residual to confess** — because there is no fortress whose cracks need flagging. Two things are simply stated as design facts:

- **Arg-level scope is a convenience, not a guarantee.** Where the permission scopes only by tool *name*, session 2 could permit the *same approved tool with different args*. We trust the agent intends the approved thing, so this is **fine**; where a harness expresses arg-level scope (builtin in-process check; Claude `canUseTool` `updatedInput`), HyperIdle MAY pin exact args as a convenience. Not a guard, no deadlock.
- **The agent can act with its own creds — by design.** The agent holds credentials and runs its own tools; it *could* perform an irreversible op outside the checkpoint. **We trust it not to**, exactly as we trust an employee. There is no native-tool-bypass threat model, no AN credential-containment dependency, and no "only path" claim. (ETHOS §4.)

---

## The open details — RESOLVED

### 1. The checkpoint: route the consequential to a human via the harness's native permission as a workflow → **locked.**
Not a containment fortress, not "the only path", no credential-containment dependency. Reversible flows; irreversible is routed to review + captured. Built on each harness's native permission, all four feasible headlessly (verified June 2026): Claude `canUseTool` deny/allow; **Codex native PreToolUse hooks** (`.codex/hooks.json`, reusing AL6's wiring); **opencode native `permission` + `opencode serve` `/event`+POST**; builtin at `registry.invoke`. The two-session model rides the native mechanism (deny in run 1, allow in run 2).

### 2. Session 2 → **the agent re-does the approved work with its own tools under a tailored grant.**
On approve HyperIdle composes a tailored grant (do the approved op + reversible; route other irreversible to review), re-provisions session 2, and the agent re-attempts. **Re-deriving the call is fine — we trust it.** No exact-hash-match, no deadlock. Byte-fidelity is an optional arg-pin convenience.

### 3. Work continues after the result → **locked (folded in; was AL10).**
On approve the verdict path emits **`proposed_call_granted`** and the task-dispatcher's dedicated subscription re-engages the agent (NOT the owner-change `session_ended` path). After the approved op returns its Outcome, the agent **keeps working *within that same session-2 run*** — closes the story, updates docs, proceeds. There is **no second "operation-finish" event** (NIT-3): one re-engagement (`proposed_call_granted`), then the same run continues.

### 4. The gate fades with trust → **locked (AL7 ships the gated arm; AL8 widens it).**
Reversible auto-flow + autonomy widening ride the verdict-history trust signal (AD4, `policy-engine.ts`). AL7 ships only the gated arm (every irreversible Proposed Call waits for explicit approve); AL8 wires the auto-flow.

---

## Keep / discard delta

**DISCARD** (the rejected kernel-executor model, v1):
- `packages/server/src/tools/stage-operation.ts` (whole) + registry registration.
- `packages/server/src/services/staged-operation-dispatcher.ts` (whole: `resolveStagedOperations`, `executeOne`, `githubMergePr`, `buildExecuteCapability`, `sweepStrandedOperations`, `KERNEL_DISPATCHABLE_CAPABILITIES`, `isKernelDispatchableCapability`).
- `routes/threads.ts` approve-path dispatch wiring + `dispatchDeps` thread-through; `app.ts` boot wiring + boot sweep.
- `packages/shared/src/staged-operation.ts` `StagedOperationSpec`.
- The AL7-* tests for the above.

**DISCARD** (the v4 paranoia framing — purge the vocabulary, not new code, since v4 was never built):
- All "broker-gate floor / safety mechanism / safety floor / containment fortress / the only path / credential-containment / native-tool-bypass / AN dependency / exact-hash-match-to-permit-as-gate" framing. The trust-first model replaces it.

**KEEP / REUSE:**
- Review surface + verdict resolution (`threads.ts` first-verdict-wins, re-open, 409) — approve now composes the grant + re-engages.
- Review composition / loader (`routes/reviews.ts`) — canvas renders a Proposed Call + its Outcome.
- The Outcome-recording **pattern** — written from session 2's real tool return.
- The re-engagement rail (`task-dispatcher.ts`) — drives the session-2 resume + work-continues.
- The abort rail (`session-run-registry.ts`) — session-1 termination (sessions aren't pausable).
- HyperIdle's participation point in the agent's brokered call (`registry.invoke`) — used as a **workflow router** (classify → route irreversible to review → on approve permit approved work), not a fortress.
- The harness-native permission surfaces — Claude `canUseTool`/`allowedTools`; **Codex native PreToolUse hooks** (`.codex/hooks.json`, reusing AL6's existing wiring); opencode native `permission` + `opencode serve` `/event`+POST — built on as the workflow carrier (all four feasible headlessly, verified June 2026).
- The verdict-history trust signal (`policy-engine.ts`, AD4) — the gate fades on it.
- The init surface (`SessionConfig` + `harness.startSession`) — extended with the session permission/workflow.
- The `staged_operations` / `operation_outcomes` tables, **reshaped** to a Proposed-Call record (captured call + tailored grant + outcome). Column reshape is `/architecture`'s job.

---

## Rationale

The founder rejected v1 (kernel re-executes), v2 (byte-faithful deadlock), and v3 (native-floor infeasible). Then v4 **spiralled into paranoia**: it made HyperIdle's own chokepoint a *containment fortress* ("the only path"), leaned on an unbuilt AN *credential-containment* guarantee, modelled a *rogue-agent native-tool bypass*, and used an *exact-hash-match* as a guard. The founder cut that off and locked **ETHOS §4: Trust Agents.**

The trust-first model re-anchors on that. **We trust agents.** They hold their own creds (correct — tools need them to auth), run their own tools, and do real work like a real employee with broad self-permission. The review gate is a **collaboration checkpoint on the consequential/irreversible**, carried by the harness's **native permission mechanism (ask/allow/deny) as a workflow** — never as a security boundary policing the agent. The agent re-attempting the approved op in session 2 is fine; byte-fidelity is at most a convenience; there is no deadlock machinery and no "only path." The gate **fades as trust grows** (verdict-history signal, AD4) — more autonomy is the goal. This is **much simpler** than v4, and that simplicity is the point. DONE is proven LIVE on the real installed harnesses — **all four feasible headlessly via native permission features** (verified June 2026): builtin + Claude green now; Codex via its native PreToolUse hooks (reusing AL6's `.codex/hooks.json` wiring); opencode via native `permission` + `opencode serve` `/event`+POST — never a stub.
