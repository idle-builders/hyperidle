# AL7 Architecture — Review-Gated Tool Execution (redo)

Fixed inputs: `plans/AL7/concept.md` (locked), `docs/process-layer/staged-operation.md` (ground truth). No `/design` (no novel UI; rides the existing action-operation review canvas).

**One-line:** The safety floor is **HyperIdle's own broker chokepoint at `registry.invoke`** — the uniform per-session seam every brokered / MCP-routed tool call passes through, on every harness. Session 1's broker floor denies irreversible calls; the agent's denied call is captured (a **Proposed Call**) at the floor (`registry.invoke` is the universal deny-with-record point), then session 1 **terminates via the abort rail**. The review's approve composes a **tailored broker policy** (allow the approved op + reversible work, deny every other irreversible op) consumed once at the floor, and **explicitly enqueues** session 2 on the task-dispatcher. The agent re-attempts; the broker floor permits only the approved scope; the agent's own brokered tool (HyperIdle-held credential, never in the sandbox) runs it; the policy is consumed once; the **Outcome** records the real return. **Harness-native allow/deny is per-harness defense-in-depth tightening on top of the floor, NOT the floor.** HyperIdle executes nothing of its own — it gates, captures, brokers the credential, records. **Byte-fidelity (arg pinning) is an optional optimization, NOT the gate — no exact-hash-match-to-permit, so no deadlock.**

**Why the broker floor holds on EVERY harness, including Codex:** irreversible LIVE ops are HyperIdle-brokered — the live credential is HyperIdle-held and **never in the agent's sandbox** (capability split + AN sandbox provisioning). So an irreversible live op can *only* happen through the brokered tool, which routes through `registry.invoke` (`tool-registry.ts:274`; builtin internal `:741`, provisioning loop `:844`, MCP bridge `mcp-bridge.ts:132` — all on the same per-session registry instance, `session-provisioning.ts:582`). A harness with no per-op native grammar (Codex) still cannot reach an unapproved irreversible op: there is no credential in its sandbox, and its brokered call hits the floor. The gate is HyperIdle's own code, harness-grammar-independent.

**This is NOT the v1 kernel executor.** No hardcoded capability map, no re-implementation of tools. The agent's OWN brokered call runs (with the HyperIdle-held credential attached at the broker boundary — the AN injection model); HyperIdle gates allow/deny + captures + records — it does not author or re-execute the tool. "HyperIdle executes nothing of its own" stays intact: gating the agent's own call at a chokepoint is the role HyperIdle already plays at `registry.invoke`, not re-execution.

**What this version changes vs. the tailored-native-allow/deny reshape (the prior CRITICALs):**
- The safety floor moves from **per-harness native allow/deny** (infeasible on Codex — no per-op grammar, no external approval event in `codex exec`; unreliable on opencode — headless `run` may auto-approve) to **HyperIdle's own broker chokepoint at `registry.invoke`**, which is uniform and harness-grammar-independent. (Fixes CRITICAL-1, CRITICAL-2's load-bearing claim, WARNING-4/5/6.)
- **Harness-native allow/deny demotes to defense-in-depth tightening** — applied where the grammar expresses it (Claude `allowedTools`/`disallowedTools`+`canUseTool`; opencode `opencode.json` permission; builtin = the floor itself). Never the floor; AL7's correctness does not depend on it.
- **DONE is an explicit per-harness feasibility matrix**, not "all four green or loop forever." builtin + Claude are `green` (adapters exist + route to the floor). Codex + opencode are `net-new-adapter-pending` (Codex: no adapter registered; opencode: no MCP-URL/permission wiring) — named net-new build tasks, live-proven once built, never silently dropped. (Fixes CRITICAL-3.)

**Carried from the reshape (still correct, re-verified):** two-session async loop; capture-as-review (deny-with-record at `registry.invoke`, uniform); `proposed_call_granted` re-dispatch trigger; abort-on-capture; byte-fidelity as optional arg-pin; reversible→allow / irreversible→capture→review→reinit; the `tailored_policies` consume-once record (now: the session-2 broker-gate policy = allow approved op + reversible, deny other irreversible).

---

## Required reading (engineer, before implementing)

- `plans/AL7/concept.md` — the locked concept (nouns, rejection list, contracts, the per-harness DONE matrix, the optimization-frontier residual).
- `docs/process-layer/staged-operation.md` — ground truth (broker-floor model + per-harness surface/DONE table).
- `packages/server/src/tools/tool-registry.ts:264-294` — `buildToolRegistry` + the `invoke` closure (`:274`): **the broker floor + the universal in-process capture/record/consume point.** The single most load-bearing seam.
- `packages/server/src/services/session-provisioning.ts:582-593, 700-722, 760-849` — registry build (the **same per-session registry instance** is shared by builtin internal calls, the provisioning loop `:844`, and the MCP bridge), `setSessionToolRegistry`, `startSession`, the three invoke paths, `provisionSession` (where the per-session policy is injected). `ctx` carries `taskId`/`agentId` (`:577,575`).
- `packages/server/src/mcp/mcp-bridge.ts:96-135` — the MCP invoke path: every CLI/SDK MCP-routed tool funnels through `registry.invoke` (`:132`). **This is how a Claude/Codex/opencode agent's brokered call reaches the floor.**
- `packages/server/src/harness/builtin-harness-adapter.ts:590-668, 702-770` — `runExecuteTurn`/`executeToolCalls`/`registry.invoke` (`:741`); abort honored at `:717`; `mcpSupport:false` (`:336`) — builtin hits `registry.invoke` *directly*, not via an MCP client.
- `packages/server/src/harness/claude-agent-sdk-adapter.ts:141-162` — `queryOptions` sets `permissionMode` today; AL7 adds `allowedTools`/`disallowedTools` + optional `canUseTool` arg-pin as **native tightening** (not the floor). SDK `PermissionResult` shape verified in Type signatures §.
- `packages/server/src/harness/cli-harness-adapter.ts:31-70, 183-207` — the generic CLI adapter: resolves an `args` template + `envMap` at `startSession` and `spawn`s (`{{sandbox}}`/`{{model}}`/`{{mcpUrl}}` etc., `{{mcpUrl}}` at `:190`). `eventFormat: "ndjson" | "text"` (`:70`).
- `packages/server/src/harness/adapter-pool.ts:324-353` — `CLI_TOOL_CONFIGS`. **Present reality (verified June 2026):** registers `aider`, `goose`, `opencode` only — **no `codex` registration**; opencode is `args:["--dir","{{workspace}}"]`, `eventFormat:"text"`, no permission surface, **does not consume `{{mcpUrl}}`**. The CLI MCP route to the floor is net-new wiring.
- `packages/server/src/harness/harness-capability-descriptors.ts:11` — `KNOWN_HARNESS_FAMILIES = ["codex","claude-code","cursor-agent","opencode"]` (+ builtin). cursor-agent `unavailable` → skip.
- `packages/shared/src/harness/harness-adapter.ts:31, 36-92` — `SessionConfig` (extend with the policy); `SessionConfig.messages` (AH3 chat channel, NOT a replay seam).
- `packages/server/src/services/session-run-registry.ts` — `abort` → `stopSession` (session-1 termination).
- `packages/fabric/src/services/task-dispatcher.ts:176, 189, 500-514` — `enqueue`/`hasActiveSession` (reuse); `handleSessionEnded` owner-change guard (add `handleProposedCallGranted`).
- `packages/server/src/routes/threads.ts:1254-1392` — verdict resolution + (discard) dispatch wiring.
- `packages/server/src/routes/reviews.ts` — the review loader (renders the Proposed Call + Outcome).
- `packages/db/src/schema.ts:1004-1059` — the tables to reshape.

---

## Phase 0 — Interrogation (resolved)

The concept pins the floor (the broker chokepoint at `registry.invoke`, uniform), the capture (deny-with-record at the floor), the policy lifecycle (compose-on-approve, consume-once at the floor), the per-harness DONE matrix, and that native allow/deny is tightening. Remaining implementation questions, with my read:

1. **Where is the floor — one place, or per adapter?**
   *Read:* **one place — `registry.invoke`**, the per-session broker chokepoint (`session-provisioning.ts:582`). Every brokered/MCP-routed irreversible call passes through it on every harness (builtin direct `:741`; MCP bridge `:132` for the rest). The floor is HyperIdle's code, not the harness's. **Native allow/deny is a *separate, optional* tightening layer** each adapter MAY apply at init — never the floor, never the consume point. So there is one load-bearing path (the broker floor) + up to four optional translations (tightening). **Confirm.**

2. **How does the agent run the approved op in session 2 — replay, or tailored broker policy?** *(the reframed CRITICAL)*
   *Resolved:* **tailored broker policy consumed at `registry.invoke`.** Session 2's policy allows the approved op + reversible work and denies every other irreversible op; the broker floor consumes it once. **No exact-hash-match-to-permit, no byte-faithful replay, no deadlock.** Byte-fidelity is an optional arg-pin. Same-tool drifted args (name-scoped) are permitted (the optimization frontier — acceptable per founder direction); a *different* irreversible op is denied + re-captured at the floor.

3. **Capture — synchronous deny+record at the broker floor (NOT an async hold).**
   *Resolved:* the floor at `registry.invoke` denies an irreversible call (session 1, or a non-approved op in session 2) and records the attempted `{toolId, args}`. **Uniform on every harness** because the brokered call passes through `registry.invoke`:
   - **builtin** — direct at `registry.invoke` (`:741`): deny, record, return blocked result.
   - **Claude / Codex / opencode** — the agent's MCP-routed brokered call hits `registry.invoke` via the bridge (`:132`): deny, record. (A harness's *own* deny hook — Claude `canUseTool` — is an optional second record, not the capture mechanism; the Codex native approval signal is NOT relied upon — `codex exec` exposes no external-readable approval event.)
   `registry.invoke` is the universal in-process record point. **Confirm.**

4. **Block-vs-allow classification — how does the floor know a call is irreversible?** *(fail-closed)*
   *Resolved:* `classifyReversibility(toolId, def)` resolves in order: (1) the tool definition's explicit `reversibility` field (AL7 adds optional `reversibility?` to `RegisteredTool`); (2) MCP `destructiveHint`/`idempotentHint` (`destructiveHint:true` ⇒ irreversible; `idempotentHint:true` ⇒ reversible); (3) **no signal ⇒ `irreversible` (fail-closed)**. The classifier runs **at the broker floor**; the live-proof tool gets explicit `reversibility:"irreversible"`. **Confirmed.**

5. **What is the live-proof tool, and what about harnesses whose adapter does not route to the floor?** *(named + the DONE matrix)*
   *Resolved:* a HyperIdle-registered, **MCP-exposed** tool **`commit_file`** that writes a real file into the session sandbox, classified `irreversible`. MCP-exposed so the agent's harness emits it through **its own MCP client → the bridge → `registry.invoke`** (`mcp-bridge.ts:120-135`) — the executor is the agent's harness, the floor is HyperIdle's `registry.invoke`. (builtin has `mcpSupport:false` and hits `registry.invoke` directly — same floor, different route; stated per-harness.) Production exemplar: `github_merge_pr` (named, not built — no GitHub creds guaranteed in the test env). **The DONE matrix (Phase 2, AC14) replaces the "build finding if not" hand-wave:** an adapter that does not yet route the brokered call to the floor (Codex: no adapter; opencode: no MCP-URL) is a **named net-new build task** with terminal state `net-new-adapter-pending`, not a silent deferral and not falsely green. **Confirmed: `commit_file` wired in Task 4 before Tasks 5-11.**

---

## Phase 1 — Plan reconciliation (spec ⇆ reality)

| Spec/concept assumption | Reality (verified June 2026) | Plan handling |
|---|---|---|
| One uniform broker floor | `registry.invoke` invoked at 3 call sites (builtin `:741`, provisioning loop `:844`, MCP bridge `:132`) on the *same per-session registry instance* (`session-provisioning.ts:582`) | Wrap the `invoke` **closure** in `buildToolRegistry` for the floor + universal capture/record/consume. One change, all paths, all harnesses. |
| Irreversible ops are HyperIdle-brokered, credential never in sandbox | Capability split + AN sandbox provisioning hold the live credential HyperIdle-side; the brokered tool is the only path | The floor at `registry.invoke` therefore covers every irreversible op on every harness — incl. Codex — independent of native grammar. |
| `SessionConfig` is the init surface | Confirmed (`harness-adapter.ts:36`); no permission field today | Add `permissionPolicy?`; thread `provisionSession`→`runSession`→the registry (the floor consumes it) and optionally to each adapter (native tightening). |
| Native allow/deny is the floor | **FALSE on Codex** — only global `--sandbox` (`read-only`/`workspace-write`/`danger-full-access`) + global/category approval; no per-op allowlist; no external-readable approval event in `codex exec`. **Unreliable on opencode** — per-tool `permission` exists in `opencode.json`/frontmatter (last-match-wins) but non-interactive `run` may auto-approve. | **Native allow/deny is demoted to defense-in-depth tightening.** The floor is the broker chokepoint, not native grammar. |
| Codex adapter exists | **FALSE** — `CLI_TOOL_CONFIGS` (`adapter-pool.ts:324-353`) registers `aider`, `goose`, `opencode` only. No `codex`. | **Net-new task (Task 7c):** register a `codex` adapter + wire `{{mcpUrl}}` so the brokered call routes to the floor. Terminal state `net-new-adapter-pending` until built. |
| opencode adapter routes the brokered call to the floor | **FALSE** — `--dir`-only text-mode, no permission surface, **does not consume `{{mcpUrl}}`** (`:344-352`); `eventFormat:"text"` wraps every line as opaque completion | **Net-new task (Task 7b):** wire `{{mcpUrl}}` + `opencode run -f json` so the brokered call reaches + records at the floor; add `opencode.json` permission as bonus tightening. |
| `staged_operations`/`operation_outcomes` tables exist | Confirmed `schema.ts:1004-1059` — kernel-exec queue shape | **Reshape** to a Proposed-Call record (capture, tailored-policy, outcome). Migration (drop+recreate). |
| Verdict approve fires `resolveStagedOperations` | `threads.ts:1379-1381` | **Discard**; replace with `composeTailoredPolicy(...)` + emit `proposed_call_granted`. |
| `app.ts` boot sweep + `dispatchDeps` | `app.ts:415-434` builds `buildExecuteCapability` + `sweepStrandedOperations` | **Discard** — no kernel executor, no stranded-executing sweep. |
| Reviews loader renders staged op | `reviews.ts` LEFT JOINs `operation_outcomes` | **Keep + reshape** to `proposedCall` + `outcome`. |
| task-dispatcher re-dispatch trigger | `handleSessionEnded` enqueues **only on owner change** (`:500-514`) — false for AL7's same-agent resume | **Explicit `proposed_call_granted` event** + new `handleProposedCallGranted` subscription, guarded by `hasActiveSession`. |

---

## Phase 2 — Acceptance criteria + verification (per-harness DONE matrix)

The harness-independent ACs are verified once on the broker floor (`registry.invoke`). The **harness-dependent ACs (the floor reaching the agent's brokered call + the live op) are verified per harness whose adapter exists and routes to the floor.** Per the DONE matrix, that is **builtin + Claude now**; Codex + opencode gain their lane once their net-new adapter task (Task 7b/7c) lands.

**Per-harness DONE matrix (the terminal-state contract — fixes CRITICAL-3):**

| Harness | Broker floor feasible? | Adapter exists + routes to floor? | Native tightening | Terminal DONE state |
|---|---|---|---|---|
| **builtin** | YES — `registry.invoke` IS the floor (`:741`) | YES (direct; `mcpSupport:false`) | n/a (the floor is the gate) | **green** — live proof now (AC1/4/5/11) |
| **Claude (SDK)** | YES — brokered MCP call → `registry.invoke` (`:132`) | YES (SDK wired; small net-new MCP-route assertion) | `allowedTools`/`disallowedTools`+`canUseTool` (verified) | **green** — live proof now (AC1/4/5/11) |
| **Codex** | YES — credential never in sandbox; only path is the brokered MCP call → floor | **NO — net-new (Task 7c)** | coarse `--sandbox` backstop only | **net-new-adapter-pending** — lane runs once Task 7c lands |
| **opencode** | YES — same | **NO — net-new (Task 7b)** | `opencode.json` permission (bonus; `run` may auto-approve) | **net-new-adapter-pending** — lane runs once Task 7b lands |
| **cursor-agent** | — | — | — | **skipped** (`unavailable`) |

**DONE for AL7** = the uniform broker floor proven LIVE on the harnesses with adapters that route to it (builtin + Claude), with Codex + opencode scoped as named build tasks (Task 7b/7c) whose live-proof lane (AC14) runs when they land. No stub-as-proof. A pipeline terminates: builtin + Claude must go green; Codex + opencode each terminate at `net-new-adapter-pending` until their task lands — no lane loops forever on a harness whose adapter does not exist.

| # | Acceptance criterion | Verification method |
|---|---|---|
| AC1 | Session 1's broker floor denies an irreversible call at `registry.invoke`, captures it as a Proposed Call (status `captured`) anchored to a review message + subject thread, **and session 1 terminates**. | **Per adapter-ready harness (builtin + Claude):** provision session 1 with a deny-irreversible policy; the agent attempts `commit_file`; the **broker floor** denies it (builtin direct; Claude via the MCP bridge) AND writes a `proposed_calls` row with the exact `tool_id`, `args`, status `captured` AND `sessionRunRegistry.abort(sessionId)` fires. A **second identical** denied call writes **no duplicate** (idempotent on `(origin_session_id, identity_hash)`). |
| AC2 | A reversible call passes the floor with no capture. | **Per adapter-ready harness:** the agent attempts a reversible tool; the floor allows it; the normal tool result returns; zero `proposed_calls` rows. |
| AC3 | Approving the review composes a **tailored broker policy** scoped to **task id + agent id**, transitions the Proposed Call to `granted`, **and emits `proposed_call_granted` which re-dispatches session 2**. | Integration test (harness-independent): POST verdict `approve` → a `tailored_policies` row exists `{ proposedCallId, taskScope, agentScope, approvedToolId, approvedArgs, consumed:false }`; Proposed Call status `granted`; a `proposed_call_granted` event was emitted AND the dispatcher `enqueue`d the task for `ownerAgentId`. Non-approve → no policy, no event, status `held`. |
| AC4 | Session 2 is re-provisioned with the tailored broker policy so the agent can execute **the approved op + reversible work and nothing else irreversible**; the agent's own brokered tool executes the approved call at the floor; the real return is recorded as an Outcome. | **LIVE-PROOF per adapter-ready harness (builtin + Claude now; Codex/opencode when Task 7b/7c lands).** Provision session 2 grant-bearing with the approved `commit_file`; the agent re-attempts; the **broker floor** at `registry.invoke` permits **only** the approved op (consumes the policy once); the agent's own MCP-routed `commit_file` runs through `registry.invoke`, an `operation_outcomes` row records the genuine return (`status:ok`, `receipt`) and the **file exists on disk** — not a stub. **Integration-tested against the real installed harness** (the actual `claude` SDK / installed CLI binary), not a fixture. |
| AC5 | A **different irreversible op** in session 2 (not the approved one) is denied at the floor (the tailored deny still bites). | **Per adapter-ready harness:** session 2 tailored to allow `commit_file`; the agent attempts a *second, different* irreversible tool → denied at `registry.invoke` → re-captured as a new Proposed Call; no Outcome for it. (Proves the safety floor: only the approved irreversible op runs.) |
| AC5b | **Optimization frontier (documented, where arg-pin is layered):** on a layer with arg-level scope, the approved tool with *different args* is also blocked. | **Per layer that implements arg-pin** (at minimum the builtin in-process check at `registry.invoke`): session 2 with an arg-pinned allow; the agent attempts the approved tool with **drifted args** → blocked. On a name-scoped-only path this is **explicitly NOT asserted** (the residual is documented as acceptable) — the test states the frontier rather than failing. |
| AC6 | At-most-once: the tailored policy is consumed once at the floor; a re-attempt after consumption does not double-execute. | Integration test (broker floor): invoke the approved call **twice concurrently** (`Promise.all`) through `registry.invoke`; the **single-statement CAS** (`UPDATE tailored_policies SET consumed=true … WHERE … AND consumed=false RETURNING *`) means exactly one invoke gets a row and executes; the other gets zero rows → denied; exactly **one** Outcome row. |
| AC7 | A non-approving verdict never executes the Proposed Call; it stays `held`. | Integration test: POST `request-changes` → no policy composed; provision a follow-up session → the floor denies the call (no allow); zero Outcomes. |
| AC8 | A Proposed Call the human never approves is never executed. | Integration test: capture, never verdict → no policy ever exists → the floor denies it; zero Outcomes. |
| AC9 | Descriptive artifacts (code diff, doc) do NOT capture or execute on approve. | Integration test: a review whose subject is a descriptive artifact (no irreversible call attempted) → approve composes no policy, writes no Outcome. (Capture only happens when an irreversible *call* hits the floor.) |
| AC10 | After execution, the result (ok/failure) returns to HyperIdle and is visible against the review. | Integration test: GET `/api/reviews/:reviewMessageId` after AC4 → response nests `proposedCall` + `outcome` (status, receipt or error) on the matching artifact. Failure path: a failing tool → `outcome.status:failed` + verbatim error, never silent. |
| AC11 | The agent continues working in session 2 after the approved call executes (work-continues loop). | **LIVE-PROOF per adapter-ready harness:** after the approved `commit_file` records the Outcome, session 2's stream produces ≥1 further agent action — the session does not end at the approved call. |
| AC11b | **Liveness net (not load-bearing):** if session 2 ends without the approved op executing, the work does not silently hang — re-provision once, then surface failed. | Integration test: provision session 2 whose harness does NOT reach the op (no-op harness fixture); `session_ended` with an unconsumed policy → exactly **one** bounded re-provision (`retry_count`→1); a second no-op end → Proposed Call `held` + `operation_outcomes` row `{status:failed, error:"approved op did not execute"}`. *(Liveness net only — triggers on crash/no-show, never on arg drift.)* |
| AC12 | HyperIdle executes nothing — no HyperIdle-process kernel-executor dispatch exists; the live-proof tool is **agent-creds / brokered / MCP-routed** at the floor. | Static: `npm run check` + an ESLint/absence guard — `staged-operation-dispatcher.ts`, `stage-operation.ts`, `buildExecuteCapability`, `KERNEL_DISPATCHABLE_CAPABILITIES` deleted; no import resolves them. **Plus** the live-proof lanes (AC4): the `commit_file` handler runs only because the agent's harness emitted the call (builtin loop / MCP request) → `registry.invoke` — not a HyperIdle-initiated dispatch. The broker floor attaches the credential + gates; it does not author or re-run the tool (distinct from v1). |
| AC13 | Verdict grammar unchanged. | Existing `threads.ts` verdict tests stay green (protected); no new verdict value. |
| AC14 | **Per-harness coverage is real, honest, and terminal.** | The live-proof lane (Task 11) runs the AC1/AC4/AC5/AC11 sequence **against the real installed harness** on each harness whose adapter exists + routes to the floor: **builtin + Claude must go green now.** Codex (Task 7c) + opencode (Task 7b) are named net-new adapter tasks; their live-proof lane runs once that task lands, and until then their terminal state is `net-new-adapter-pending` (NOT green, NOT silently skipped, NOT looped). |

---

## Phase 3 — Design-it-twice (load-bearing decisions)

### D1 — The floor: HyperIdle's broker chokepoint at `registry.invoke` (uniform) vs. per-harness native allow/deny

- **A (chosen): the broker chokepoint at `registry.invoke` is the floor, uniform on every harness; native allow/deny is optional defense-in-depth tightening.** Every brokered/MCP-routed irreversible call passes through the one per-session `registry.invoke` seam (builtin direct; the rest via the MCP bridge). Because the live credential is HyperIdle-held and never in the sandbox, the brokered call is the only path to an irreversible live op — so the floor covers every harness independent of native grammar, **including Codex** (which has no per-op grammar). *Trade-off:* the CLI harnesses must route their brokered call through HyperIdle's MCP server to reach the floor (net-new MCP-URL wiring, Task 7b/7c). *Why:* it is the only model that holds on all four harnesses; it is HyperIdle's own code, not a bet on each harness's permission system; and it is the chokepoint HyperIdle already owns.
- **B (rejected): per-harness native allow/deny as the floor** (the prior reshape). *Reject because:* Codex has only global `--sandbox` + global approval — no per-op allowlist, no external-readable approval event in `codex exec` — so "allow the approved op, deny other irreversible" is **unsayable**; opencode's `permission` config may be **auto-approved** in non-interactive `run`. The floor would hold on 2 of 4 harnesses. (Verified against current Codex/opencode docs, June 2026.)

**Synthesis:** the broker floor at `registry.invoke` is the source of truth + the consume point + the capture point, uniform. Native allow/deny is layered on top where the grammar expresses it — a bonus, not the floor. The sandbox boundary (credential never present) is what makes the broker the *only* path, which is what makes the floor uniform.

### D2 — Policy storage: a `tailored_policies` table vs. columns on `proposed_calls`

- **A (chosen): a separate `tailored_policies` table** `{ proposed_call_id PK/FK, task_scope, agent_scope, approved_tool_id, approved_args, arg_pinned (bool), consumed (bool), retry_count, minted_at, consumed_at }`. *Why:* the policy has its own lifecycle (composed at approve, consumed at the floor in session 2, re-minted on re-open) and the **atomic consume** is a single conditional UPDATE `WHERE consumed=false RETURNING *`. A re-open mints a new row without mutating the Proposed Call's immutable capture. Scope is `(task, agent)` — session 2's id does not exist at compose time.
- **B (rejected): columns on `proposed_calls`.** Muddies the Proposed Call's immutability contract and complicates re-open.

### D3 — Identity hash: optional metadata for the arg-pin, NOT the gate

The hash (SHA-256 over canonical JSON of `{tool_id, args}`) is **not the security boundary** — the tailored broker policy is. The hash is **optional metadata** consumed only where the arg-pin optimization is layered (builtin in-process check; Claude `canUseTool`). It still gets a deterministic `canonicalJson` (sorted keys recursively; arrays order-preserved; numbers via `JSON.stringify` normalization, reject non-finite; strings NFC-normalized; hash on Zod-parsed `parsed.data` at both ends) **so the arg-pin is stable** — but a hash mismatch **no longer blocks the approved work** (the name-scoped allow at the floor still permits the approved tool). Task 4 tests the canonicalization for the arg-pin path; the absence of a hash signal never deadlocks (no gate depends on it).

---

## Type signatures / schemas / endpoints

### `SessionConfig` extension (`packages/shared/src/harness/harness-adapter.ts`)
```ts
// add to SessionConfig:
readonly permissionPolicy?: SessionPermissionPolicy;
```
```ts
export interface SessionPermissionPolicy {
  /** Reversibility classes denied at the broker floor at init (session 1: ["irreversible"]). */
  readonly denyReversibility: readonly Reversibility[];
  readonly sessionRole: "capture" | "grant-bearing";
  /** When grant-bearing, the ONE approved op the broker floor permits (and adapters MAY tighten to natively). */
  readonly approvedCall?: {
    readonly toolId: string;
    readonly args: Record<string, unknown>;   // recorded approved args (used by the optional arg-pin)
    readonly argPinned: boolean;               // true ⇒ tighten allow to these exact args where a layer expresses arg-level scope
    readonly identityHash?: string;            // optional metadata for the arg-pin; NOT the gate
  };
}
```
`ConversationMessage` is **not** widened (no message-seed path). The policy is consumed at the broker floor (`registry.invoke`); each adapter MAY *additionally* translate it to native allow/deny at init as tightening.

### The broker floor (the gate) — inside `buildToolRegistry.invoke` (`tool-registry.ts`)

`ctx` gains: `sessionId`, `taskId`, `agentId` (present at `:577,575`), `permissionPolicy?`, `db` (present). This is the uniform floor — one change, all harnesses, because every brokered/MCP-routed call passes through this closure.
```ts
async function invoke(name, rawArgs): Promise<ToolResult> {
  // ... existing role/schema checks; parsed = def.inputSchema.safeParse(rawArgs) ...
  const reversibility = classifyReversibility(name, def);      // fail-closed: no signal ⇒ irreversible
  const policy = ctx.permissionPolicy;

  if (policy?.sessionRole === "grant-bearing" && isApprovedOp(policy, name, parsed.data)) {
    // The approved op: CAS-consume the tailored policy once, then run the agent's own brokered handler.
    const [claimed] = await ctx.db.update(tailoredPolicies)
      .set({ consumed: true, consumedAt: nowIso() })
      .where(and(
        eq(tailoredPolicies.taskScope, ctx.taskId),
        eq(tailoredPolicies.agentScope, ctx.agentId),
        eq(tailoredPolicies.approvedToolId, name),
        eq(tailoredPolicies.consumed, false),                  // ← the conditional claim
      ))
      .returning();
    if (claimed) {
      try {
        const result = await def.handler(parsed.data, ctx);    // AGENT'S brokered tool runs it (HyperIdle-held cred attached here)
        await recordOutcome(ctx.db, claimed.proposedCallId, result);
        return result;
      } catch (e) {
        await recordOutcome(ctx.db, claimed.proposedCallId, errOutcome(e)); // status:failed
        return err("EXECUTION_FAILED", `Approved call ${name} threw: ${String(e)}`);
      }
    }
    // policy already consumed → fall through to deny (no double-execute).
  }

  if (policy && reversibility === "irreversible") {            // denied at the floor (session 1, or non-approved op in session 2)
    const captured = await captureProposedCall(ctx.db, {
      originSessionId: ctx.sessionId, taskId: ctx.taskId, agentId: ctx.agentId,
      toolId: name, args: parsed.data, hash: identityHash(name, parsed.data),
      reviewMessageId, subjectThreadId,                        // derived server-side, never agent-authored
    }); // idempotent on (origin_session_id, identity_hash)
    if (captured.firstCapture) await sessionRunRegistry.abort(ctx.sessionId); // abort-on-capture
    return err("AWAITING_REVIEW", `Call to ${name} blocked pending human approval.`);
  }
  return def.handler(parsed.data, ctx);                        // reversible → allow
}
```
`isApprovedOp(policy, name, args)` = `policy.approvedCall?.toolId === name` AND (`!policy.approvedCall.argPinned` OR `identityHash(name,args) === policy.approvedCall.identityHash`). **The arg-pin is the only place args gate; un-pinned, the approved tool name is the gate (the documented optimization frontier).**
*Abort-on-capture:* `sessionRunRegistry.abort` → `stopSession` sets the builtin `aborted` flag (`:717`); for CLI/SDK it terminates the subprocess.
*Crash window:* CAS-consume-then-execute means a crash between consume and the tool firing strands a `granted` Proposed Call with a consumed policy and no Outcome — surfaced as needs-attention/failed, never silently lost.
*Note:* `reviewMessageId`/`subjectThreadId` are **derived server-side**, never agent-authored (concept rejection #4).

### Per-harness native allow/deny composition (the OPTIONAL tightening — NOT the floor)

`composeDenyAllow(policy, allTools)` (shared helper) returns `{ allow: string[], deny: string[] }` for adapters that can apply native tightening. This is layered *on top of* the broker floor as defense-in-depth — the floor stands alone if native tightening is absent (Codex) or bypassed (opencode headless).
- **session 1 (`capture`):** `deny` = all tools classified `irreversible`; `allow` = the rest.
- **session 2 (`grant-bearing`):** `deny` = irreversible tools **except** `approvedCall.toolId`; `allow` = reversible + `approvedCall.toolId`.

**(a) builtin — the floor IS the gate.** No separate native layer; the `registry.invoke` floor (above) is the whole enforcement. Optional in-process arg-pin lives at the floor.

**(b) Claude (Agent SDK) — native tightening on top of the floor.** `queryOptions` gets `allowedTools`/`disallowedTools` from `composeDenyAllow` + an optional `canUseTool` arg-pin. The brokered MCP-routed `commit_file` still funnels through `registry.invoke` (the floor); the SDK lists are a *second* layer. SDK `PermissionResult` verified (code.claude.com/docs/en/agent-sdk/typescript): `{ behavior:"allow"; updatedInput?: Record<string,unknown> } | { behavior:"deny"; message: string }`.
```ts
queryOptions.permissionMode = "default";
queryOptions.allowedTools = allow;     // native tightening — bonus layer
queryOptions.disallowedTools = deny;
queryOptions.canUseTool = async (toolName, input) => { /* optional arg-pin; the floor is registry.invoke */ };
```

**(c) Codex — no usable native tightening; the floor alone covers it.** Codex exposes only global `--sandbox` (`read-only`/`workspace-write`/`danger-full-access`) + a global/category approval policy — **no per-op allowlist, no external-readable approval event in `codex exec`** (verified, developers.openai.com/codex/agent-approvals-security, June 2026). So Codex gets at most a coarse `--sandbox` backstop. **Its safety comes entirely from the broker floor:** the brokered `commit_file` routes through HyperIdle's MCP server → the bridge → `registry.invoke`, and the live credential is never in Codex's sandbox, so there is no other path to an irreversible op. **The Codex adapter is net-new (Task 7c)** — `CLI_TOOL_CONFIGS` has no `codex` entry today.

**(d) opencode — native tightening is a bonus, not relied upon.** opencode permissions are per-tool allow/ask/deny via `opencode.json`/agent-frontmatter (last-match-wins), **NOT spawn-arg flags**; and non-interactive `run` may auto-approve (verified, opencode.ai/docs/permissions + /docs/cli, June 2026). So the `opencode.json` permission is layered as a bonus where it bites, but **the floor (the brokered MCP call → `registry.invoke`) is the guarantee.** **Net-new (Task 7b):** the registered adapter is `--dir`-only text-mode with no `{{mcpUrl}}`; wire `{{mcpUrl}}` + `opencode run -f json` so the brokered call reaches + records at the floor.

> The floor is **one** change at `registry.invoke`, identical on all four harnesses. Native tightening is up to four optional translations of one `SessionPermissionPolicy`, applied where the grammar supports it. The net-new async transports (Codex app-server, opencode SSE) are NOT on the AL7 path.

### Proposed Call (`packages/shared/src/proposed-call.ts` — replaces `staged-operation.ts`)
```ts
export const PROPOSED_CALL_STATUSES = ["captured", "granted", "executed", "failed", "held"] as const;
export type ProposedCallStatus = (typeof PROPOSED_CALL_STATUSES)[number];

export const REVERSIBILITY = ["irreversible", "reversible"] as const;
export type Reversibility = (typeof REVERSIBILITY)[number];

export interface ProposedCall {
  readonly id: string;
  readonly reviewMessageId: string;   // the gate
  readonly subjectThreadId: string;   // anchor
  readonly artifactId: string;        // action_operation artifact it nests on
  readonly originSessionId: string;   // session 1
  readonly toolId: string;            // verbatim tool name the agent called
  readonly args: Record<string, unknown>; // verbatim input
  readonly identityHash: string;      // optional metadata for the arg-pin; NOT the gate
  readonly reversibility: Reversibility;
  readonly status: ProposedCallStatus;
}
```

### DB schema reshape (`packages/db/src/schema.ts`) — migration (drop+recreate)
`staged_operations` → `proposed_calls`:
- DROP: `capability_tool`, `capability_harness_type`, `operation`, `consequence_id`.
- ADD: `tool_id`, `args` (text JSON), `identity_hash`, `origin_session_id` (FK → sessions.id).
- KEEP: `id`, `review_message_id` (FK, index), `subject_thread_id` (FK, anchor index), `artifact_id` (FK), `reversibility`, `status` (`captured|granted|executed|failed|held`), `staged_by_agent_id`, `created_at`.
- INDEX: `(review_message_id, status)`; `(origin_session_id, identity_hash)` (capture idempotency).
- REMOVE the `idempotency_key` UNIQUE (capture idempotency + consume-once replace it).

NEW `tailored_policies` *(scope = task id + agent id, NOT a not-yet-minted session-2 id)*:
```ts
export const tailoredPolicies = pgTable("tailored_policies", {
  proposedCallId: text("proposed_call_id").primaryKey().references(() => proposedCalls.id, { onDelete: "restrict" }),
  taskScope: text("task_scope").notNull(),       // tasks.id — session 2 for this task is the unique re-provision
  agentScope: text("agent_scope").notNull(),     // agents.id — the same owner resuming
  approvedToolId: text("approved_tool_id").notNull(),
  approvedArgs: text("approved_args").notNull(), // JSON; recorded approved args (arg-pin uses these)
  argPinned: integer("arg_pinned", { mode: "boolean" }).notNull().default(false),
  identityHash: text("identity_hash"),           // optional, for the arg-pin
  consumed: integer("consumed", { mode: "boolean" }).notNull().default(false),
  retryCount: integer("retry_count").notNull().default(0), // liveness net (AC11b), not the gate
  mintedAt: text("minted_at").notNull(),
  consumedAt: text("consumed_at"),
}, (t) => [index("policy_match_idx").on(t.taskScope, t.agentScope, t.approvedToolId, t.consumed)]);
```
The floor resolves the policy by `(taskId, agentId, approvedToolId)` from `ctx`. `operation_outcomes` → kept, FK renamed `proposed_call_id` (PK, enforces 0..1 + immutability). *(Drop+recreate migration — pre-implementation, no production rows; state it in the migration file.)*

### Verdict path (`threads.ts`) *(explicit re-dispatch trigger)*
Replace `resolveStagedOperations(dispatchDeps, ...)` (lines ~1371-1381). On `approve`/`approve-with-comments` for a review message backing a `captured` Proposed Call, inside the verdict transaction:
1. `composeTailoredPolicy(tx, { proposedCallId, taskScope: task.id, agentScope: task.ownerAgentId, approvedToolId, approvedArgs, argPinned, identityHash })` — insert the `tailored_policies` row (`consumed:false`, `retryCount:0`).
2. Transition the Proposed Call `captured → granted`.
3. After commit, emit **`proposed_call_granted`** `{ type:"proposed_call_granted", streamId: subjectThreadId, proposedCallId, taskId, agentId, timestamp }`.

The task-dispatcher gets a new subscription `handleProposedCallGranted` that `enqueue`s `{ taskId, agentId, teamId }` for the grant's owner — guarded by `hasActiveSession(db, taskId)`. Does **not** rely on `handleSessionEnded`'s owner-change guard (`:500-514`). Add `proposed_call_granted` to the `KernelEvent` union (`events.ts:414`). Remove the `dispatchDeps` thread-through.

*Non-approve branch:* `request-changes` / `edit` / `reject` on a `captured` Proposed Call transition it `captured → held`, compose no policy, emit no event.

### Reviews loader (`reviews.ts`) + subscribers
LEFT JOIN `proposed_calls` + `tailored_policies` + `operation_outcomes` by `review_message_id`; nest `{ proposedCall: { toolId, argsSummary, status }, outcome?: { status, receipt|error, executedAt } }` on the matching `action_operation` artifact.

**`operation_executed` → `proposed_call_executed` rename touches 3 known subscribers:**
- `packages/server/src/services/observability/dispatcher.ts:494` — span mapping → rename.
- `packages/web/src/pages/review/review-composition.ts` — `StagedOperationView`→`ProposedCallView`.
- `packages/web/src/pages/review/ReviewComposition.tsx:672-679` — `artifact.stagedOperation?.{status,outcome}`→`artifact.proposedCall?.{status,outcome}`.

---

## Per-harness implementation surface (the floor, the capture, the optional tightening, the live proof)

| Harness | Broker floor (the gate) | Capture (deny+record) | Native tightening (bonus) | Live-proof lane | Terminal state |
|---|---|---|---|---|---|
| **builtin** | `registry.invoke` IS the floor; reads `ctx.permissionPolicy` | deny + record at `registry.invoke` (`:741`) | n/a (floor is the gate; optional in-process arg-pin) | full AC1/4/5/11 in-process; `commit_file` writes a real file | **green now** |
| **Claude (Agent SDK)** | brokered MCP-routed `commit_file` → `registry.invoke` (`:132`) | deny + record at `registry.invoke`; Claude `canUseTool` optional second log | `allowedTools`/`disallowedTools` + `canUseTool` arg-pin | full sequence via the agent's MCP-routed `commit_file`, against the real SDK | **green now** |
| **Codex** | brokered MCP-routed `commit_file` → `registry.invoke`; credential never in Codex sandbox | deny + record at `registry.invoke` | none usable (coarse `--sandbox` backstop only) | runs once Task 7c lands; tested against installed `codex` | **net-new-adapter-pending (Task 7c)** |
| **opencode** | brokered MCP-routed `commit_file` → `registry.invoke` | deny + record at `registry.invoke` | `opencode.json` permission (bonus; `run` may auto-approve) | runs once Task 7b lands; tested against installed `opencode` | **net-new-adapter-pending (Task 7b)** |

**cursor-agent — skipped** (`unavailable`, `harness-capability-descriptors.ts:11`). The floor is one `registry.invoke` change identical on all harnesses; native tightening is up to four optional translations of one `SessionPermissionPolicy`. Codex + opencode are named net-new adapter tasks (route the brokered call to the floor); not silently deferred, not falsely green.

---

## Ordered task list

1. **Discard the kernel-executor model.** Delete `tools/stage-operation.ts` (+ registry registration), `services/staged-operation-dispatcher.ts`, `shared/src/staged-operation.ts`; remove `threads.ts` dispatch wiring + `dispatchDeps`; remove `app.ts` boot sweep + `buildExecuteCapability`; delete the AL7-* tests for these. *(Proves AC12.)*
2. **Schema migration (drop+recreate).** Drop+recreate `staged_operations` → `proposed_calls`; add `tailored_policies` (`taskScope`,`agentScope`,`approvedToolId`,`approvedArgs`,`argPinned`,`retryCount`); recreate `operation_outcomes` with `proposed_call_id` PK/FK. `npm run db:generate` + migrate. *(red: schema test.)*
3. **Shared types.** `packages/shared/src/proposed-call.ts`; `SessionPermissionPolicy` (with `approvedCall` + `argPinned`); extend `SessionConfig.permissionPolicy`; add `ProposedCallGrantedEvent` to `KernelEvent`. **No `ConversationMessage` widening, no message-seed.** *(red: AC1 shape.)*
4. **Classifier + composer + identity hash + live-proof tool.** `classifyReversibility(toolId, def)` (fail-closed `irreversible`); `composeDenyAllow(policy, allTools)` → `{allow, deny}` (the optional native-tightening input); `identityHash`/`canonicalJson` (for the optional arg-pin only). **Wire the `commit_file` MCP-exposed live-proof tool** (`reversibility:"irreversible"`) into `ALL_TOOL_DEFINITIONS` *before* Tasks 5-11 (topological order). *(red: classifier no-hint→irreversible; composer session-1 vs session-2 output; hash determinism for arg-pin.)*
5. **The broker floor + universal record/consume.** Extend `ToolContext` with `permissionPolicy`; implement `isApprovedOp` + single-statement CAS-consume → handler (try/catch → Outcome) / idempotent capture / `sessionRunRegistry.abort` on first capture, **inside `buildToolRegistry.invoke`** (the uniform floor for all harnesses). *(red: AC1 incl. abort+idempotent, AC2, AC5, AC6 concurrent-CAS, AC5b arg-pin at the floor.)*
6. **Thread policy through provisioning.** `provisionSession`/`runSession` build the registry with `permissionPolicy`; session 1 = `capture`, session 2 = `grant-bearing` with `approvedCall`. *(red: AC1/AC4 via provisioning, builtin.)*
7. **Per-adapter native tightening + CLI MCP routing (where applicable).**
   - **(a) Claude SDK** *(green-now harness):* set `allowedTools`/`disallowedTools` from `composeDenyAllow` + optional `canUseTool` arg-pin in `queryOptions` (`:154-162`) — **bonus tightening on top of the floor**; assert the brokered MCP `commit_file` still funnels through `registry.invoke`. *(red: AC1/AC2/AC5 on Claude via the floor.)*
   - **(b) opencode adapter — NET-NEW, route to the floor.** Wire `{{mcpUrl}}` into the opencode `CLI_TOOL_CONFIGS` args/config (`adapter-pool.ts:344-352`) + switch to `opencode run -f json` (`eventFormat:"ndjson"`) so the brokered `commit_file` reaches + records at `registry.invoke`; add `opencode.json` permission as **bonus** tightening. **Integration-test against the installed `opencode` binary**, not a stub. Terminal state: `net-new-adapter-pending` until this lands. *(red: AC1/AC4/AC5 on opencode via the floor.)*
   - **(c) Codex adapter — NET-NEW, register + route to the floor.** Add a `codex` entry to `CLI_TOOL_CONFIGS` (none exists today) with `{{mcpUrl}}` wired so the brokered `commit_file` reaches + records at `registry.invoke`; apply a coarse `--sandbox` backstop. No per-op native tightening, no app-server JSON-RPC. **Integration-test against the installed `codex` binary.** Terminal state: `net-new-adapter-pending` until this lands. *(red: AC1/AC4/AC5 on Codex via the floor.)*
8. **Verdict → tailored policy + trigger.** `threads.ts`: approve composes the policy + transitions `captured→granted` + emits `proposed_call_granted`; non-approve → `held`. *(red: AC3 incl. event+enqueue, AC7, AC8.)*
9. **Re-dispatch.** Task-dispatcher `handleProposedCallGranted` `enqueue`s session 2 (guarded by `hasActiveSession`). *(red: AC3 enqueue.)*
9.5. **Liveness net (not the gate).** A distinct `session_ended` subscription `handleUnconsumedPolicyOnSessionEnd` (NOT inside `handleSessionEnded`): on `session_ended` with an unconsumed policy for the ended session's task, `retryCount===0` → re-provision once (`retryCount`→1, guarded by `hasActiveSession`); `retryCount>=1` → Proposed Call `held` + `failed` Outcome. *(red: AC11b — never a silent hang; assert no double-enqueue vs. `handleSessionEnded`.)* Non-load-bearing — triggers only on crash/no-show.
10. **Reviews loader + subscribers.** Nest `proposedCall` + `outcome` (`reviews.ts`); rename `operation_executed` → `proposed_call_executed` + update the 3 subscribers. *(red: AC10 incl. failure path.)*
11. **LIVE-PROOF lanes — per the DONE matrix, against the real installed harness.** End-to-end through `commit_file` (MCP-routed/brokered, agent-creds, own sandbox): agent attempts the irreversible call → **broker floor** denies + captures → session 1 aborts → approve → `proposed_call_granted` → re-dispatch → session 2 re-provisioned with the tailored policy → agent re-attempts → **broker floor** permits **only** the approved op → consume → real file written → Outcome → agent continues (AC11) → a *different* irreversible op is still denied (AC5). **builtin + Claude lanes must be green now** (against the real SDK/loop), no fixture/stub. **Codex (Task 7c) + opencode (Task 7b) lanes run once their adapter task lands** and are tested against the installed binary; until then their terminal state is `net-new-adapter-pending` — NOT green, NOT skipped silently, NOT looped. *(Hard Rule 8; AC14.)*

---

## Security & abuse cases

- **The broker floor is the safety mechanism (uniform, harness-grammar-independent).** Every irreversible live op is HyperIdle-brokered; the credential is HyperIdle-held and never in the agent's sandbox; the brokered call passes through `registry.invoke`. So even Codex (no per-op native grammar) cannot reach an unapproved irreversible op — there is no credential in its sandbox and its brokered call hits the floor. **The floor does not depend on any harness's permission system.** **Addressed (D1, AC1/AC4/AC5).**
- **Distinct from the v1 kernel executor.** No capability map, no tool re-implementation; the broker floor attaches the HyperIdle-held credential + gates allow/deny/capture; the agent's own harness emits the call and the tool's own handler runs it. HyperIdle authors and re-executes nothing. **Addressed (AC12).**
- **Agent-authored field trust boundary (capture).** `tool_id` + `args` captured from the agent's *actual call* at the floor, never an agent-authored spec. `review_message_id`/`subject_thread_id` **derived** server-side. **Addressed.**
- **Tailored-policy forgery / replay.** The policy is composed only by the server verdict path on `approve`; the floor consumes it via a **single-statement atomic CAS** (no pre-read). An agent cannot compose a policy or re-use a consumed one. **Addressed (AC6).**
- **Unapproved irreversible op in session 2.** The tailored deny at the floor denies every irreversible op except the approved one — a second/different irreversible op is denied + re-captured at `registry.invoke`. **The safety floor.** **Addressed (AC5).**
- **Arg drift on the approved tool (the residual / optimization frontier).** Where a layer expresses arg-level scope (builtin in-process at the floor; Claude `canUseTool`), the arg-pin blocks drifted args (AC5b). Where the floor scopes by name only, the *same approved tool with different args* is permitted — **documented, acceptable per founder direction** (the floor — no *other* irreversible op — still holds). **Stated openly.**
- **Classifier fail-open.** `classifyReversibility` defaults a no-signal tool to **`irreversible`** at the floor — gated, cannot fire without review. **Addressed (AC1 no-hint test).**
- **Capture-loop / duplicate Proposed Calls.** Session 1 terminated on first capture (`sessionRunRegistry.abort`), capture idempotent on `(origin_session_id, identity_hash)`. **Addressed (AC1).**
- **Cross-session policy leakage.** `(taskScope, agentScope)` binds the policy to the unique re-provision. **Addressed.**
- **Side-door egress.** The sandbox boundary (credential never present) means a CLI's built-in shell / raw HTTP / external MCP server cannot perform an irreversible *live* op — there is no credential to do it with. The brokered path through `registry.invoke` is the only one. **Addressed (sandbox boundary makes the broker the only path — this is why the floor is uniform, not native-grammar-dependent).**
- **opencode headless auto-approve / Codex no-native-grammar.** Both are why native allow/deny is NOT the floor. Neither harness's native gate is relied upon; the broker floor covers both. **Addressed (D1).**
- **Secret handling / SSRF / path traversal.** No new credential, outbound URL, or path owned by HyperIdle beyond the existing broker; the agent's own brokered call runs. **N/A.**

---

## Risks / ambiguities

- **R1 — re-provision trigger. RESOLVED (Task 8+9).** Explicit `proposed_call_granted` event + dedicated `handleProposedCallGranted` subscription; not the owner-change `handleSessionEnded` path (`:500-514`).
- **R2 — policy scope. RESOLVED (Task 2+8).** Session 2's id doesn't exist at compose time → scope `(taskScope, agentScope)`; schema, compose, and floor lookup all key on `(taskScope, agentScope, approvedToolId)`.
- **R3 — the floor (was replay fidelity, was native-allow/deny). RESOLVED + SIMPLIFIED (Task 5+11).** The floor is **HyperIdle's broker chokepoint at `registry.invoke`** — uniform on every harness because the irreversible brokered call must pass through it (credential never in sandbox). NOT a byte-faithful replay, NOT per-harness native grammar. Dissolves the deadlock (no exact-match-to-permit) AND the Codex/opencode infeasibility (the floor is HyperIdle's code, not the harness's). Byte-fidelity survives as the optional arg-pin; native allow/deny survives as optional tightening.
- **R4 — descriptive vs operative (AC9).** Capture is triggered by an *attempted irreversible call at the floor*, not by artifact kind.
- **R5 — live-proof tool + per-harness coverage. RESOLVED (Task 4+7+11; DONE matrix).** `commit_file` (MCP-exposed, `irreversible`) wired in Task 4. **builtin + Claude live-proof green now** (adapters route to the floor). **Codex (Task 7c) + opencode (Task 7b) are named net-new adapter tasks** (route the brokered call to the floor) with terminal state `net-new-adapter-pending`; their live-proof lane runs once built, tested against the installed binary. Production exemplar: `github_merge_pr`.
- **R6 — Codex/opencode floor without native grammar. RESOLVED (D1, Task 7b/7c).** Codex has no per-op native grammar and no external-readable approval event in `codex exec`; opencode headless `run` may auto-approve. **Neither is relied upon** — the broker floor at `registry.invoke` covers both because the credential is never in the sandbox and the brokered call routes through the floor. Native allow/deny is bonus tightening only. The net-new app-server/SSE transports are NOT required.
- **R7 — liveness-net subscription placement. RESOLVED.** `handleUnconsumedPolicyOnSessionEnd` is a **separate `session_ended` subscription** (not inside `handleSessionEnded`), composing via the shared `hasActiveSession` guard — no double-dispatch.
- **R8 — opencode native permission docs uncertainty. FLAGGED, NOT load-bearing.** `OPENCODE_PERMISSION` as an inline-JSON env var is **not docs-confirmed** (only `OPENCODE_CONFIG` for a config-file path + `-f json` output are); and docs indicate non-interactive `run` may auto-approve all permissions. Because native allow/deny is only bonus tightening (the floor is the broker chokepoint), this uncertainty does **not** affect AL7's correctness — but Task 7b must integration-test the actual permission behavior of the installed binary and, if `run` auto-approves, simply omit the bonus layer (the floor still holds). ⚠️ UNVERIFIED: `OPENCODE_PERMISSION` env var; verify against the installed binary in Task 7b.

---

## protectedTests
- `packages/server/src/routes/__tests__/*threads*verdict*` — verdict grammar + first-verdict-wins must not change (AC13).
- existing review-composition / reviews-loader tests for non-staged-op fields.

## sharedFiles
- `packages/db/src/schema.ts` (migration — drop+recreate)
- `packages/shared/src/harness/harness-adapter.ts` (`SessionConfig.permissionPolicy` + `SessionPermissionPolicy`; `ConversationMessage` NOT widened)
- `packages/shared/src/events.ts` (`ProposedCallGrantedEvent`, rename `operation_executed`)
- `packages/shared/src/index.ts` (export `proposed-call.ts`, drop `staged-operation.ts`)
- `packages/server/src/tools/tool-registry.ts` (**the broker floor** + universal record/consume + `commit_file` + `classifyReversibility` + `composeDenyAllow`)
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` (native tightening: `allowedTools`/`disallowedTools` + optional `canUseTool` arg-pin — on top of the floor)
- `packages/server/src/harness/adapter-pool.ts` + `cli-harness-adapter.ts` (**Task 7b** opencode `{{mcpUrl}}` + `-f json` MCP routing + `opencode.json` permission; **Task 7c** net-new `codex` registration + `{{mcpUrl}}` routing + `--sandbox` backstop)
- `packages/server/src/harness/builtin-harness-adapter.ts` (the floor honored via `registry.invoke`; abort at `:717`)
- `packages/server/src/services/session-provisioning.ts` (policy threading to the registry/floor + session-2 `approvedCall` payload)
- `packages/fabric/src/services/task-dispatcher.ts` (`handleProposedCallGranted` + `handleUnconsumedPolicyOnSessionEnd`)
- `packages/server/src/routes/threads.ts` (verdict → tailored policy + `proposed_call_granted`)
- `packages/server/src/routes/reviews.ts` (loader)
- `packages/server/src/services/observability/dispatcher.ts` + `packages/web/src/pages/review/{review-composition.ts,ReviewComposition.tsx}` (event-rename subscribers)
- `packages/server/src/app.ts` (remove dispatch wiring)

## Migrations (symbol renames/removals — every call site)
- `StagedOperationSpec` → **delete**; callers: dispatcher (deleted), `reviews.ts` view shape (→`ProposedCallView`).
- `staged_operations` table → **reshape** `proposed_calls`; types `StagedOperation`/`NewStagedOperation` → `ProposedCall`/`NewProposedCall`.
- `one_shot_grants` (prior plan's table) → **never built**; the tailored-policy table is `tailored_policies`.
- `resolveStagedOperations`/`sweepStrandedOperations`/`buildExecuteCapability`/`KERNEL_DISPATCHABLE_CAPABILITIES`/`isKernelDispatchableCapability` → **delete**; callers: `threads.ts`, `app.ts`, AL7 tests.
- `operation_executed` event → **rename** `proposed_call_executed`; 3 subscribers (enumerated above).
- NEW `proposed_call_granted` event → add to `KernelEvent` (`events.ts:414`); subscriber: `handleProposedCallGranted`.
- `SessionConfig.permissionPolicy` + `SessionPermissionPolicy.approvedCall` added; `ConversationMessage` unchanged. NEW: `composeDenyAllow` (optional native tightening) consumed by Claude/opencode adapters; **net-new `codex` registration in `CLI_TOOL_CONFIGS`** + `{{mcpUrl}}` wiring for both CLI harnesses.
