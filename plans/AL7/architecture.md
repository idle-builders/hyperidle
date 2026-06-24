# AL7 Architecture — Review-Gated Tool Execution (redo)

Fixed inputs: `plans/AL7/concept.md` (locked), `docs/process-layer/staged-operation.md` (ground truth). No `/design` (no novel UI; rides the existing action-operation review canvas).

**One-line:** HyperIdle rides each harness's native permission gate, configured at session **init**. Session 1's init policy denies irreversible calls; the agent's denied call is captured (a **Proposed Call**) via each harness's deny-with-record hook (`registry.invoke` is the universal in-process record point), then session 1 **terminates via the abort rail**. The review's approve composes a **tailored allow/deny policy** (allow the approved op + reversible work, deny every other irreversible op) and **explicitly enqueues** session 2 on the task-dispatcher; each adapter translates that policy to its **native allow/deny + sandbox scope at init**, the agent re-attempts the work, the harness permits only the approved scope, the agent's own tool/creds run it, the policy is consumed once, and the **Outcome** records the real return. HyperIdle executes nothing of its own. **Byte-fidelity (exact-arg pinning) is an optional per-harness optimization, NOT the gate — there is no exact-hash-match-to-permit, so no deadlock.**

**What this version removes vs. the byte-faithful redo (the prior CRITICAL):**
- The **exact-hash-match-to-permit** gate is gone. Session 2 is not permitted by SHA-256-matching the captured bytes; it is permitted by the **narrowed native allow/deny scope**. This **dissolves the replay-fidelity CRITICAL and the deadlock fallback entirely** — arg drift no longer blocks the approved work, so there is no "grant unconsumed → re-provision-once → fail" deadlock path required by the gate. (A bounded re-provision survives only as a *liveness* safety net for a session that crashes/ends before doing any work — see §AC11b, now non-load-bearing.)
- Deterministic registry replay (builtin) and `canUseTool` `updatedInput` arg-override (SDK) are **demoted to the arg-pin optimization**, applied only where a harness expresses arg-level scope. They are no longer the load-bearing mechanism and are no longer required for DONE.
- The "one-shot grant keyed to identityHash, consumed on hash match" is replaced by a **tailored allow/deny policy keyed to (task, agent), consumed once at the approved op**.

**Scope correction vs. the prior plan (founder direction):** AL7 builds + live-proves on **all four supported harnesses — builtin, Claude (Agent SDK), Codex, opencode** — each through its own adapter + sandbox. cursor-agent is `unavailable` (`harness-capability-descriptors.ts:11`) and skipped. The prior plan's "builtin + SDK only, Codex/opencode deferred" is superseded: because enforcement is **init-time allow/deny config** (which every harness has — `permissionMode`+settings for Claude, `approval_policy`+`sandbox_mode` for Codex, `permission` for opencode, the `registry.invoke` gate for builtin), AL7 does **not** depend on the net-new async-approval transports (Codex app-server JSON-RPC, opencode SSE). The deferral that survives is only the **arg-pin optimization** where a harness's permission grammar can't express arg-level scope.

---

## Required reading (engineer, before implementing)

- `plans/AL7/concept.md` — the locked concept (nouns, rejection list, contracts, the optimization-frontier residual).
- `docs/process-layer/staged-operation.md` — ground truth (tailored-native-allow/deny model + per-harness surface table).
- `packages/server/src/tools/tool-registry.ts:264-294` — `buildToolRegistry` + the `invoke` closure (the **builtin gate + the universal in-process capture/record/consume point**).
- `packages/server/src/services/session-provisioning.ts:586-593, 700-722, 760-849` — registry build, `setSessionToolRegistry`, `startSession`, the three invoke paths, `provisionSession` (where the per-adapter policy is injected).
- `packages/server/src/mcp/mcp-bridge.ts:96-135` — the MCP invoke path (all CLI/SDK MCP-routed tools funnel through `registry.invoke`).
- `packages/server/src/harness/builtin-harness-adapter.ts:590-668, 702-770` — `runExecuteTurn`/`executeToolCalls`/`registry.invoke` (`:741`); CRITICAL-2 abort honored at `:717`.
- `packages/server/src/harness/claude-agent-sdk-adapter.ts:141-162` — `queryOptions` sets `permissionMode` today; AL7 adds the narrowed `allow`/`deny` tool lists + (optional arg-pin) a `canUseTool`/`PreToolUse` deny-with-record hook. SDK `PermissionResult` shape verified in Type signatures §.
- `packages/server/src/harness/cli-harness-adapter.ts:56-58, 183-207` — Codex/opencode adapter: `args` template array resolved at `startSession` and passed to `spawn` (`{{sandbox}}`/`{{model}}`/`{{mcpUrl}}` etc.). **This is the Codex/opencode init-time permission-flag surface** — AL7 adds permission flags to the resolved args.
- `packages/server/src/harness/harness-capability-descriptors.ts:11` — `KNOWN_HARNESS_FAMILIES = ["codex","claude-code","cursor-agent","opencode"]` (+ builtin). cursor-agent unavailable → skip.
- `packages/shared/src/harness/harness-adapter.ts:31, 36-92` — `SessionConfig` (extend with the policy); `SessionConfig.messages` (AH3 chat channel, NOT a replay seam).
- `packages/server/src/services/session-run-registry.ts` — `abort` → `stopSession` (CRITICAL-2 session-1 termination).
- `packages/fabric/src/services/task-dispatcher.ts:176, 189, 500-514` — `enqueue`/`hasActiveSession` (reuse); `handleSessionEnded` owner-change guard (CRITICAL-3: add `handleProposedCallGranted`).
- `packages/server/src/routes/threads.ts:1254-1392` — verdict resolution + (discard) dispatch wiring.
- `packages/server/src/routes/reviews.ts` — the review loader (renders the Proposed Call + Outcome).
- `packages/db/src/schema.ts:1004-1059` — the tables to reshape.

---

## Phase 0 — Interrogation (resolved)

The concept pins the gate (tailored native allow/deny at init), the capture (per-harness deny+record), the policy lifecycle (compose-on-approve, consume-once), and the four-harness scope. Remaining implementation questions, with my read:

1. **Where does the policy get applied — one place, or per adapter?**
   *Read:* one `SessionPermissionPolicy` on `SessionConfig` (the init surface, `harness-adapter.ts:36`), threaded `provisionSession`→`runSession`→`startSession`; **each adapter translates it to its native allow/deny at init.** No single load-bearing path — uniform architecture, four translations. The translation surface per adapter:
   - **builtin:** `buildToolRegistry(ctx)` reads `ctx.permissionPolicy`; the `invoke` closure is the gate.
   - **Claude SDK:** `queryOptions` gets `permissionMode` + `allow`/`deny` arrays computed from the policy (+ optional `PreToolUse`/`canUseTool` for capture/arg-pin).
   - **Codex:** the CLI `args` template resolves `approval_policy`/`sandbox_mode`/allow flags from the policy at `startSession`.
   - **opencode:** the CLI `args` template resolves `permission` allow/ask/deny flags from the policy at `startSession`.
   **Confirm.**

2. **How does the agent get to run the approved op in session 2 — replay, or tailored allow?** *(the reframed CRITICAL)*
   *Resolved:* **tailored native allow.** Session 2's init policy allows the approved op + reversible work and denies every other irreversible op. The agent re-attempts the work; the native gate permits only the approved scope. **No exact-hash-match-to-permit, no byte-faithful replay, no deadlock.** Byte-fidelity is an optional arg-pin (below). The agent re-deriving the same op with the same args is the happy path; if it re-derives drifted args on the *same approved tool*, the name-scoped allow still permits it (the optimization frontier — acceptable per founder direction); if it attempts a *different* irreversible op, that is denied + re-captured.

3. **Capture — synchronous deny+record per harness (NOT an async hold).**
   *Resolved:* each harness's init permission decision is configured to deny irreversible ops; the deny-with-record hook captures the attempted `{toolId, args}`:
   - **builtin** — at `registry.invoke`: deny, record, return blocked result.
   - **Claude SDK** — `canUseTool`/`PreToolUse` returns `{behavior:"deny"}` and HyperIdle logs the attempted `{toolName, input}`. (MCP-routed tools also funnel through `registry.invoke`, the in-process record backstop.)
   - **Codex** — `approval_policy`/`sandbox_mode` set to deny irreversible at init; the adapter records the denied call from the native approval signal in the CLI's event stream. *(No bidirectional app-server transport needed for deny+record — the auto-deny is init config; the record is from the stdout event. See §4 build-finding flag.)*
   - **opencode** — `permission` set to deny irreversible at init; the adapter records the denied call from the permission decision event.
   `registry.invoke` stays the universal in-process record point for all HyperIdle-registered + MCP-routed tools (the live-proof `commit_file` is MCP-routed, so on every harness the recorded call provably hits the seam). **Confirm.**

4. **Block-vs-allow classification — how does the policy know a call is irreversible?** *(fail-closed)*
   *Resolved:* `classifyReversibility(toolId, def)` resolves in order: (1) the tool definition's explicit `reversibility` field (AL7 adds optional `reversibility?` to `RegisteredTool`); (2) MCP `destructiveHint`/`idempotentHint` (`destructiveHint:true` ⇒ irreversible; `idempotentHint:true` ⇒ reversible); (3) **no signal at all ⇒ `irreversible` (fail-closed)**. A no-signal tool gates, never auto-flows (ETHOS §3 / security). The live-proof tool is given explicit `reversibility:"irreversible"`. **The classifier output feeds the adapter's native allow/deny composition** (which tool names go in deny at session 1; which one moves to allow at session 2). **Confirmed.**

5. **What is the live-proof tool, and what about harnesses that can't express the tailored allow/deny?** *(named + the build-finding flag)*
   *Resolved:* a HyperIdle-registered, **MCP-exposed** tool **`commit_file`** that writes a real file into the session sandbox, classified `irreversible`. MCP-exposed because the MCP bridge (`mcp-bridge.ts:120-135`) registers each tool with the agent's MCP client and its handler calls `registry.invoke` — so a call any of the four harnesses emits through **its own MCP client** provably hits the seam, and the *executor is the agent's harness emitting the MCP request*, not HyperIdle's loop. Production exemplar: `github_merge_pr` (named, not built — no GitHub creds guaranteed in the test env). **Build-finding flag (Hard Rule 9):** if a specific adapter genuinely cannot express "allow the approved op + reversible, deny other irreversible" at init for the proof (e.g. a Codex CLI that only globally auto-approves/denies and can't scope to one op), that is **surfaced as a build finding**, not silently deferred — the builder reports it; AL7 does not quietly drop a harness. **Confirmed: `commit_file` wired in Task 4 before Tasks 5-10.**

---

## Phase 1 — Plan reconciliation (spec ⇆ reality)

| Spec/concept assumption | Reality | Plan handling |
|---|---|---|
| One uniform in-process record point | `registry.invoke` invoked at 3 call sites (builtin `:741`, provisioning loop `:844`, MCP bridge `:132`) on the *same per-session registry instance* | Wrap the `invoke` **closure** in `buildToolRegistry` for builtin gate + universal record/consume. One change, all paths. |
| `SessionConfig` is the init surface | Confirmed (`harness-adapter.ts:36`); no permission field today | Add `permissionPolicy?`; thread `provisionSession`→`runSession`→ each adapter's `startSession`. |
| Every harness has init-time permission config | Claude `permissionMode` wired (`:159`), `allow`/`deny` settings net-new-small; Codex/opencode flags inject via the CLI `args` template (`cli-harness-adapter.ts:58,194`); builtin is the `registry.invoke` gate | **Tailored allow/deny at init per adapter.** No net-new async transport. |
| Codex/opencode need async approval transport | Codex app-server JSON-RPC / opencode SSE are net-new — **but only needed for a held call-time ask**, which AL7 does NOT use | **Not required.** AL7 uses init-time auto-deny config + records the denied call from the CLI event stream. Build-finding flag if an adapter can't scope at init. |
| `staged_operations`/`operation_outcomes` tables exist | Confirmed `schema.ts:1004-1059` — kernel-exec queue shape | **Reshape** to a Proposed-Call record (capture, tailored-policy, outcome). Migration (drop+recreate). |
| Verdict approve fires `resolveStagedOperations` | `threads.ts:1379-1381` | **Discard**; replace with `composeTailoredPolicy(...)` + emit `proposed_call_granted`. |
| `app.ts` boot sweep + `dispatchDeps` | `app.ts:415-434` builds `buildExecuteCapability` + `sweepStrandedOperations` | **Discard** — no kernel executor, no stranded-executing sweep. |
| Reviews loader renders staged op | `reviews.ts` LEFT JOINs `operation_outcomes` | **Keep + reshape** to `proposedCall` + `outcome`. |
| task-dispatcher re-dispatch trigger | `handleSessionEnded` enqueues **only on owner change** (`:500-514`) — false for AL7's same-agent resume | **Explicit `proposed_call_granted` event** + new `handleProposedCallGranted` subscription, guarded by `hasActiveSession`. |

---

## Phase 2 — Acceptance criteria + verification (mapped across ALL four harnesses)

The harness-independent ACs are verified once on the in-process seam; the **harness-dependent ACs (the gate + capture + the live op) are verified per harness — builtin, Claude, Codex, opencode.** "H4" = all four.

| # | Acceptance criterion | Verification method |
|---|---|---|
| AC1 | Session 1's init policy denies an irreversible call at the **native gate**, captures it as a Proposed Call (status `captured`) anchored to a review message + subject thread, **and session 1 terminates**. | **Per harness (H4):** provision session 1 with a deny-irreversible policy; the agent attempts `commit_file`; the harness's native gate denies it AND the deny-with-record hook writes a `proposed_calls` row with the exact `tool_id`, `args`, status `captured` AND `sessionRunRegistry.abort(sessionId)` fires (builtin: spy on `aborted`; CLI/SDK: spy on the abort rail). A **second identical** denied call writes **no duplicate** (idempotent on `(origin_session_id, identity_hash)`). |
| AC2 | A reversible call is allowed at the gate with no capture. | **Per harness (H4):** the agent attempts a reversible tool; the native gate allows it; the normal tool result returns; zero `proposed_calls` rows. (In-process backstop assert via `registry.invoke` for the MCP path.) |
| AC3 | Approving the review composes a **tailored allow/deny policy** scoped to **task id + agent id**, transitions the Proposed Call to `granted`, **and emits `proposed_call_granted` which re-dispatches session 2**. | Integration test (harness-independent): POST verdict `approve` → a `tailored_policies` row exists `{ proposedCallId, taskScope, agentScope, approvedToolId, approvedArgs, consumed:false }`; Proposed Call status `granted`; a `proposed_call_granted` event was emitted AND the dispatcher `enqueue`d the task for `ownerAgentId` (CRITICAL-3, asserted via dispatcher queue / provisionSession spy). Non-approve → no policy, no event, status `held`. |
| AC4 | Session 2 is re-provisioned with the native allow/deny **tailored** so the agent can execute **the approved op + reversible work and nothing else irreversible**; the agent's own tool executes the approved call; the real return is recorded as an Outcome. | **LIVE-PROOF per harness (H4)** (Hard Rule 6 + 9). For each of builtin / Claude / Codex / opencode: provision session 2 grant-bearing with the approved `commit_file`; the agent re-attempts; each adapter's native gate (builtin `registry.invoke`; Claude allow-list; Codex `approval_policy`+allow flag; opencode `permission` allow) permits **only** the approved op; the agent's own MCP-routed `commit_file` runs through `registry.invoke`, the policy is consumed once, an `operation_outcomes` row records the genuine return (`status:ok`, `receipt`) and the **file exists on disk** — not a stub. Per harness, through its own adapter + sandbox. |
| AC5 | A **different irreversible op** in session 2 (not the approved one) is denied (the tailored deny still bites). | **Per harness (H4):** session 2 tailored to allow `commit_file`; the agent attempts a *second, different* irreversible tool → denied by the native gate → re-captured as a new Proposed Call; no Outcome for it. (This proves the safety floor: only the approved irreversible op runs.) |
| AC5b | **Optimization frontier (documented, where arg-pin is layered):** on a harness with arg-level scope, the approved tool with *different args* is also blocked. | **Per harness that implements arg-pin** (at minimum builtin): session 2 with an arg-pinned allow; the agent attempts the approved tool with **drifted args** → blocked by the arg-pin. On a name-scoped-only harness this is **explicitly NOT asserted** (the residual is documented as acceptable) — the test states the frontier rather than failing. |
| AC6 | At-most-once: the tailored policy is consumed once; a re-attempt after consumption does not double-execute. | Integration test (in-process seam): invoke the approved call **twice concurrently** (`Promise.all`) through `registry.invoke`; the **single-statement CAS** (`UPDATE tailored_policies SET consumed=true … WHERE … AND consumed=false RETURNING *`) means exactly one invoke gets a row and executes; the other gets zero rows → denied; exactly **one** Outcome row. (Mirrors `threads.ts:1294-1303` first-verdict-wins.) |
| AC7 | A non-approving verdict never executes the Proposed Call; it stays `held`. | Integration test: POST `request-changes` → no policy composed; provision a follow-up session → the call is denied (no allow); zero Outcomes. |
| AC8 | A Proposed Call the human never approves is never executed. | Integration test: capture, never verdict → no policy ever exists → any session denies it; zero Outcomes. |
| AC9 | Descriptive artifacts (code diff, doc) do NOT capture or execute on approve. | Integration test: a review whose subject is a descriptive artifact (no irreversible call attempted) → approve composes no policy, writes no Outcome. (Capture only happens when an irreversible *call* is attempted at the gate.) |
| AC10 | After execution, the result (ok/failure) returns to HyperIdle and is visible against the review. | Integration test: GET `/api/reviews/:reviewMessageId` after AC4 → response nests `proposedCall` + `outcome` (status, receipt or error) on the matching artifact. Failure path: a failing tool → `outcome.status:failed` + verbatim error, never silent. |
| AC11 | The agent continues working in session 2 after the approved call executes (work-continues loop). | **LIVE-PROOF per harness (H4):** after the approved `commit_file` records the Outcome, session 2's stream produces ≥1 further agent action (a follow-up tool call or completion) — the session does not end at the approved call. |
| AC11b | **Liveness net (no longer load-bearing):** if session 2 ends without the approved op executing (crash / agent never attempts it), the work does not silently hang — re-provision once, then surface failed. | Integration test: provision session 2 whose harness does NOT reach the op (no-op harness fixture); `session_ended` with an unconsumed policy → exactly **one** bounded re-provision (`retry_count`→1); a second no-op end → Proposed Call `held` + `operation_outcomes` row `{status:failed, error:"approved op did not execute"}`. *(This is a liveness net only — because the gate is tailored-allow not hash-match, arg drift never causes this; it triggers only on a crash/no-show.)* |
| AC12 | HyperIdle executes nothing — no HyperIdle-process kernel-executor dispatch exists; the live-proof tool is **agent-creds / MCP-routed** on every harness. | Static: `npm run check` + an ESLint/absence guard — `staged-operation-dispatcher.ts`, `stage-operation.ts`, `buildExecuteCapability`, `KERNEL_DISPATCHABLE_CAPABILITIES` deleted; no import resolves them. **Plus** the live-proof lanes (AC4, H4) prove the executor is the agent's MCP-routed call (the `commit_file` handler runs only because the agent's harness emitted the MCP request through its own client → bridge → `registry.invoke`), not a HyperIdle-initiated dispatch. |
| AC13 | Verdict grammar unchanged. | Existing `threads.ts` verdict tests stay green (protected); no new verdict value. |
| AC14 | **Per-harness coverage is real, not Claude-only.** | The live-proof lane (Task 11) runs the AC1/AC4/AC5/AC11 sequence on **each of builtin, Claude, Codex, opencode** through its own adapter + sandbox. A harness whose adapter cannot express the tailored allow/deny at init is reported as a **build finding** (Hard Rule 9), not silently skipped. |

---

## Phase 3 — Design-it-twice (load-bearing decisions)

### D1 — The gate: tailored native allow/deny at init (per adapter) vs. an in-process-only gate at `registry.invoke`

- **A (chosen): native allow/deny at init, per adapter, + `registry.invoke` as the universal in-process record/consume point.** Each harness enforces the tailored scope with its *own* permission system (`permissionMode`+settings, `approval_policy`+`sandbox_mode`, `permission` config, the builtin loop). *Trade-off:* four translations of one policy. *Why:* this is the founder's reframe — the native gate is the safety floor, uniform across harnesses, no net-new transport, no exact-match-to-permit. The agent literally cannot reach an unapproved irreversible op because the harness denies it at the edge.
- **B (rejected): an in-process-only `registry.invoke` gate** that allow/denies for every harness. *Reject because:* it only covers HyperIdle-registered + MCP-routed tools; a CLI's built-in shell or an external MCP server the harness runs would bypass it. The native gate + the sandbox boundary cover those; `registry.invoke` is the *record/consume* backstop, not the sole gate.

**Synthesis:** the native gate is the source of truth; `registry.invoke` is the universal in-process record point + the one-shot consume of the tailored policy + the builtin gate.

### D2 — Policy storage: a `tailored_policies` table vs. columns on `proposed_calls`

- **A (chosen): a separate `tailored_policies` table** `{ proposed_call_id PK/FK, task_scope, agent_scope, approved_tool_id, approved_args, arg_pinned (bool), consumed (bool), retry_count, minted_at, consumed_at }`. *Why:* the policy has its own lifecycle (composed at approve, consumed in session 2, re-minted on re-open) and the **atomic consume** is a single conditional UPDATE `WHERE consumed=false RETURNING *`. A re-open mints a new row without mutating the Proposed Call's immutable capture. Scope is `(task, agent)` — session 2's id does not exist at compose time.
- **B (rejected): columns on `proposed_calls`.** Muddies the Proposed Call's immutability contract and complicates re-open.

### D3 — Identity hash: optional metadata for the arg-pin, NOT the gate

The hash (SHA-256 over canonical JSON of `{tool_id, args}`) is **no longer the security boundary** — the tailored native allow/deny is. The hash is **optional metadata** consumed only where the arg-pin optimization is layered (builtin in-process check; Claude `PreToolUse`). It still gets a deterministic `canonicalJson` (sorted keys recursively; arrays order-preserved; numbers via `JSON.stringify` normalization, reject non-finite; strings NFC-normalized; hash on Zod-parsed `parsed.data` at both ends) **so the arg-pin is stable** — but a hash mismatch **no longer blocks the approved work** (the name-scoped allow still permits the approved tool). Task 4 tests the canonicalization for the arg-pin path; the absence of a hash signal never deadlocks (no gate depends on it).

*Reject "store args and deep-equal at arg-pin match time":* canonical-hash avoids equality semantics over arbitrary JSON for the optional arg-pin.

---

## Type signatures / schemas / endpoints

### `SessionConfig` extension (`packages/shared/src/harness/harness-adapter.ts`)
```ts
// add to SessionConfig:
readonly permissionPolicy?: SessionPermissionPolicy;
```
```ts
export interface SessionPermissionPolicy {
  /** Reversibility classes denied at the native gate at init (session 1: ["irreversible"]). */
  readonly denyReversibility: readonly Reversibility[];
  readonly sessionRole: "capture" | "grant-bearing";
  /** When grant-bearing, the ONE approved op session 2's native allow/deny is tailored to permit. */
  readonly approvedCall?: {
    readonly toolId: string;
    readonly args: Record<string, unknown>;   // recorded approved args (used by the optional arg-pin)
    readonly argPinned: boolean;               // true ⇒ tighten allow to these exact args where the harness expresses arg-level scope
    readonly identityHash?: string;            // optional metadata for the arg-pin; NOT the gate
  };
}
```
`ConversationMessage` is **not** widened (no message-seed path). The policy carries the approved op so each adapter composes its native allow (move `approvedCall.toolId` from deny to allow at session-2 init; keep every other irreversible tool in deny).

### Per-harness native allow/deny composition (the gate)

Each adapter receives `SessionPermissionPolicy` at `startSession` and composes its native config. `composeDenyAllow(policy, allTools)` (shared helper in `tool-registry.ts` / a small `permission-policy.ts`) returns `{ allow: string[], deny: string[] }`:
- **session 1 (`capture`):** `deny` = all tools classified `irreversible`; `allow` = the rest (reversible).
- **session 2 (`grant-bearing`):** `deny` = irreversible tools **except** `approvedCall.toolId`; `allow` = reversible tools **+** `approvedCall.toolId`. `argPinned` toggles whether the approved entry also pins args.

**(a) builtin — the `registry.invoke` gate.** `buildToolRegistry(ctx)` reads `ctx.permissionPolicy`; the `invoke` closure denies a call whose classified reversibility is in `denyReversibility` **unless** it is the approved op (and, if `argPinned`, args match the recorded args). On deny: record + (first capture) abort. On the approved op: CAS-consume the policy, run `def.handler`, record the Outcome.

**(b) Claude (Agent SDK) — `permissionMode` + allow/deny lists.** `queryOptions` gets `permissionMode` (already wired `:159`) **plus** `allow`/`deny` tool lists from `composeDenyAllow`. The SDK's native gate denies the irreversible tools at the edge. Capture: a `canUseTool`/`PreToolUse` hook returns `{behavior:"deny", message}` for a denied tool and logs the attempted `{toolName, input}` (the MCP-routed call also funnels through `registry.invoke` as the in-process record backstop). **Optional arg-pin:** the `PreToolUse`/`canUseTool` hook compares args to the recorded approved args and denies on drift. SDK `PermissionResult` shape verified against current docs (code.claude.com/docs/en/agent-sdk/typescript): `{ behavior:"allow"; updatedInput?: Record<string,unknown> } | { behavior:"deny"; message: string }`.
```ts
queryOptions.permissionMode = "default";
queryOptions.allowedTools = allow;   // SDK allow list — only the approved op + reversible
queryOptions.disallowedTools = deny; // SDK deny list — every other irreversible op
// optional arg-pin / capture hook:
queryOptions.canUseTool = async (toolName, input) => { /* deny+record on session 1; allow approved (optional arg check) on session 2 */ };
```

**(c) Codex — `approval_policy` + `sandbox_mode` + allow flags at spawn.** The CLI `args` template (`cli-harness-adapter.ts:58,194`) is extended with permission template vars resolved from the policy at `startSession`: `--approval-policy <auto-deny-irreversible|...>`, `--sandbox <sandbox_mode>`, and (session 2) an allow flag scoping the approved op. The denied call is recorded from the native approval signal in the CLI's stdout event stream; MCP-routed `commit_file` funnels through `registry.invoke` for the in-process consume. **Init-time config — no app-server JSON-RPC.**

**(d) opencode — `permission` allow/ask/deny config at spawn.** Same shape: the `args` template (or a generated permission config file referenced by an arg) resolves opencode's `permission` allow/ask/deny from the policy at `startSession`; session 2 allows the approved op, denies other irreversible. Denied call recorded from the permission decision event; MCP-routed call funnels through `registry.invoke`. **Init-time config — no SSE reply channel.**

> All four set the gate via **init-time config that already exists**, threaded from one `SessionPermissionPolicy`. The net-new async transports (Codex app-server, opencode SSE) are **not** on the AL7 path. If an adapter genuinely cannot scope to one op at init for the live proof, that is a **build finding** (Hard Rule 9), reported — not silently dropped.

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
The wrapper resolves the policy by `(taskId, agentId, approvedToolId)` — `ctx` carries `taskId` + `agentId` (`session-provisioning.ts:577,575`). `operation_outcomes` → kept, FK renamed `proposed_call_id` (PK, enforces 0..1 + immutability). *(Drop+recreate migration — pre-implementation, no production rows; state it in the migration file.)*

### The wrapper / gate (inside `buildToolRegistry.invoke`, `tool-registry.ts`)
```ts
// ctx gains: sessionId, taskId, agentId (present at :577,575), permissionPolicy?, db (present)
async function invoke(name, rawArgs): Promise<ToolResult> {
  // ... existing role/schema checks; parsed = def.inputSchema.safeParse(rawArgs) ...
  const reversibility = classifyReversibility(name, def);      // fail-closed: no signal ⇒ irreversible
  const policy = ctx.permissionPolicy;

  if (policy?.sessionRole === "grant-bearing" && isApprovedOp(policy, name, parsed.data)) {
    // The approved op: CAS-consume the tailored policy once, then run the agent's own handler.
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
        const result = await def.handler(parsed.data, ctx);    // AGENT'S tool runs it (MCP-routed)
        await recordOutcome(ctx.db, claimed.proposedCallId, result);
        return result;
      } catch (e) {
        await recordOutcome(ctx.db, claimed.proposedCallId, errOutcome(e)); // status:failed
        return err("EXECUTION_FAILED", `Approved call ${name} threw: ${String(e)}`);
      }
    }
    // policy already consumed → fall through to deny (no double-execute).
  }

  if (policy && reversibility === "irreversible") {            // denied at the gate (session 1, or non-approved op in session 2)
    const captured = await captureProposedCall(ctx.db, {
      originSessionId: ctx.sessionId, taskId: ctx.taskId, agentId: ctx.agentId,
      toolId: name, args: parsed.data, hash: identityHash(name, parsed.data),
      reviewMessageId, subjectThreadId,                        // derived server-side, never agent-authored
    }); // idempotent on (origin_session_id, identity_hash)
    if (captured.firstCapture) await sessionRunRegistry.abort(ctx.sessionId); // CRITICAL-2
    return err("AWAITING_REVIEW", `Call to ${name} blocked pending human approval.`);
  }
  return def.handler(parsed.data, ctx);                        // reversible → allow
}
```
`isApprovedOp(policy, name, args)` = `policy.approvedCall?.toolId === name` AND (`!policy.approvedCall.argPinned` OR `identityHash(name,args) === policy.approvedCall.identityHash`). **The arg-pin is the only place args gate; un-pinned, the approved tool name is the gate (the documented optimization frontier).**
*CRITICAL-2:* `sessionRunRegistry.abort` → `stopSession` sets the builtin `aborted` flag (`:717`); for CLI/SDK it terminates the subprocess.
*Crash window:* CAS-consume-then-execute means a crash between consume and the tool firing strands a `granted` Proposed Call with a consumed policy and no Outcome — surfaced as needs-attention/failed, never silently lost.
*Note:* `reviewMessageId`/`subjectThreadId` are **derived server-side**, never agent-authored (concept rejection #4).

### Verdict path (`threads.ts`) *(CRITICAL-3 — explicit re-dispatch trigger)*
Replace `resolveStagedOperations(dispatchDeps, ...)` (lines ~1371-1381). On `approve`/`approve-with-comments` for a review message backing a `captured` Proposed Call, inside the verdict transaction:
1. `composeTailoredPolicy(tx, { proposedCallId, taskScope: task.id, agentScope: task.ownerAgentId, approvedToolId, approvedArgs, argPinned, identityHash })` — insert the `tailored_policies` row (`consumed:false`, `retryCount:0`).
2. Transition the Proposed Call `captured → granted`.
3. After commit, emit **`proposed_call_granted`** `{ type:"proposed_call_granted", streamId: subjectThreadId, proposedCallId, taskId, agentId, timestamp }`.

The task-dispatcher gets a new subscription `handleProposedCallGranted` that `enqueue`s `{ taskId, agentId, teamId }` for the grant's owner — guarded by `hasActiveSession(db, taskId)`. Does **not** rely on `handleSessionEnded`'s owner-change guard (false for same-agent resume, `:500-514`). Add `proposed_call_granted` to the `KernelEvent` union (`events.ts:414`). Remove the `dispatchDeps` thread-through.

*Non-approve branch:* `request-changes` / `edit` / `reject` on a `captured` Proposed Call transition it `captured → held`, compose no policy, emit no event.

### Reviews loader (`reviews.ts`) + subscribers
LEFT JOIN `proposed_calls` + `tailored_policies` + `operation_outcomes` by `review_message_id`; nest `{ proposedCall: { toolId, argsSummary, status }, outcome?: { status, receipt|error, executedAt } }` on the matching `action_operation` artifact.

**`operation_executed` → `proposed_call_executed` rename touches 3 known subscribers:**
- `packages/server/src/services/observability/dispatcher.ts:494` — span mapping → rename.
- `packages/web/src/pages/review/review-composition.ts` — `StagedOperationView`→`ProposedCallView`.
- `packages/web/src/pages/review/ReviewComposition.tsx:672-679` — `artifact.stagedOperation?.{status,outcome}`→`artifact.proposedCall?.{status,outcome}`.

---

## Per-harness implementation surface (the gate, the capture, the optional arg-pin, the live proof)

| Harness | Init allow/deny (the gate) | Capture (deny+record) | Arg-pin (optimization) | Live-proof lane (Task 11) | Class |
|---|---|---|---|---|---|
| **builtin** | `registry.invoke` gate from `ctx.permissionPolicy` (`composeDenyAllow`) | deny + record at `registry.invoke` | in-process arg check at `registry.invoke` | full AC1/4/5/11 sequence in-process; `commit_file` writes a real file | **config — HyperIdle owns the loop** |
| **Claude (Agent SDK)** | `permissionMode` + `allowedTools`/`disallowedTools` from `composeDenyAllow` (`:159`) | `canUseTool`/`PreToolUse` deny+log; MCP-routed call also hits `registry.invoke` | `PreToolUse`/`canUseTool` arg compare | full sequence via the agent's MCP-routed `commit_file` | **net-new allow/deny lists + capture hook (small)** |
| **Codex** | `--approval-policy`/`--sandbox`/allow flags in the CLI `args` template at spawn | record from the native approval signal in stdout (auto-deny irreversible at init) | arg/command-pattern flag where Codex's permission grammar supports it | full sequence via MCP-routed `commit_file` | **net-new spawn-arg permission flags (init config)** |
| **opencode** | `permission` allow/ask/deny in the CLI `args`/config at spawn | record from the permission decision event | command/arg pattern in `permission` config where supported | full sequence via MCP-routed `commit_file` | **net-new spawn-arg permission config (init config)** |

**cursor-agent — skipped** (`unavailable`, `harness-capability-descriptors.ts:11`). All four supported harnesses get a live-proof lane; the gate is one `SessionPermissionPolicy` translated four ways. **If any adapter cannot express the tailored allow/deny at init for the proof → build finding (Hard Rule 9), reported not deferred.**

---

## Ordered task list

1. **Discard the kernel-executor model.** Delete `tools/stage-operation.ts` (+ registry registration), `services/staged-operation-dispatcher.ts`, `shared/src/staged-operation.ts`; remove `threads.ts` dispatch wiring + `dispatchDeps`; remove `app.ts` boot sweep + `buildExecuteCapability`; delete the AL7-* tests for these. *(Proves AC12.)*
2. **Schema migration (drop+recreate).** Drop+recreate `staged_operations` → `proposed_calls`; add `tailored_policies` (`taskScope`,`agentScope`,`approvedToolId`,`approvedArgs`,`argPinned`,`retryCount`); recreate `operation_outcomes` with `proposed_call_id` PK/FK. `npm run db:generate` + migrate. *(red: schema test.)*
3. **Shared types.** `packages/shared/src/proposed-call.ts`; `SessionPermissionPolicy` (with `approvedCall` + `argPinned`); extend `SessionConfig.permissionPolicy`; add `ProposedCallGrantedEvent` to `KernelEvent`. **No `ConversationMessage` widening, no message-seed.** *(red: AC1 shape.)*
4. **Classifier + allow/deny composer + identity hash + live-proof tool.** `classifyReversibility(toolId, def)` (fail-closed `irreversible`); `composeDenyAllow(policy, allTools)` → `{allow, deny}` (the per-adapter gate input); `identityHash`/`canonicalJson` (for the optional arg-pin only). **Wire the `commit_file` MCP-exposed live-proof tool** (`reversibility:"irreversible"`) into `ALL_TOOL_DEFINITIONS` *before* Tasks 5-11 (topological order). *(red: classifier no-hint→irreversible; composer session-1 vs session-2 output; hash determinism for arg-pin.)*
5. **The builtin gate + universal record/consume.** Extend `ToolContext` with `permissionPolicy`; implement `isApprovedOp` + single-statement CAS-consume → handler (try/catch → Outcome) / idempotent capture / `sessionRunRegistry.abort` on first capture, inside `buildToolRegistry.invoke`. *(red: AC1 incl. abort+idempotent, AC2, AC5, AC6 concurrent-CAS, AC5b arg-pin on builtin.)*
6. **Thread policy through provisioning.** `provisionSession`/`runSession` build the registry + pass `permissionPolicy` to each adapter's `startSession`; session 1 = `capture`, session 2 = `grant-bearing` with `approvedCall`. *(red: AC1/AC4 via provisioning.)*
7. **Per-adapter native allow/deny translation.** **(a) Claude SDK:** set `allowedTools`/`disallowedTools` from `composeDenyAllow` + a `canUseTool`/`PreToolUse` deny-with-record (+ optional arg-pin) in `queryOptions` (`:154-162`). **(b) Codex:** extend the CLI `args` template with `--approval-policy`/`--sandbox`/allow flags resolved from the policy; record the denied call from stdout. **(c) opencode:** extend the `args`/config with `permission` allow/ask/deny resolved from the policy; record the denied call. *(red: AC1/AC2/AC5 per harness — gate denies irreversible, allows the approved op, allows reversible.)*
8. **Verdict → tailored policy + trigger.** `threads.ts`: approve composes the policy + transitions `captured→granted` + emits `proposed_call_granted`; non-approve → `held`. *(red: AC3 incl. event+enqueue, AC7, AC8.)*
9. **Re-dispatch.** Task-dispatcher `handleProposedCallGranted` `enqueue`s session 2 (guarded by `hasActiveSession`). *(red: AC3 enqueue.)*
9.5. **Liveness net (not the gate).** A distinct `session_ended` subscription `handleUnconsumedPolicyOnSessionEnd` (NOT inside `handleSessionEnded`): on `session_ended` with an unconsumed policy for the ended session's task, `retryCount===0` → re-provision once (`retryCount`→1, guarded by `hasActiveSession`); `retryCount>=1` → Proposed Call `held` + `failed` Outcome. *(red: AC11b — never a silent hang; assert no double-enqueue vs. `handleSessionEnded`.)* Non-load-bearing — triggers only on crash/no-show, never on arg drift.
10. **Reviews loader + subscribers.** Nest `proposedCall` + `outcome` (`reviews.ts`); rename `operation_executed` → `proposed_call_executed` + update the 3 subscribers. *(red: AC10 incl. failure path.)*
11. **LIVE-PROOF lanes — ALL FOUR harnesses.** For each of **builtin, Claude, Codex, opencode**, end-to-end through `commit_file` (MCP-routed, agent-creds, own sandbox): agent attempts the irreversible call → native gate denies + captures → session 1 aborts → approve → `proposed_call_granted` → re-dispatch → session 2 re-provisioned with the tailored native allow/deny → agent re-attempts → native gate permits **only** the approved op → MCP → `registry.invoke` consumes the policy → real file written → Outcome → agent continues (AC11) → a *different* irreversible op is still denied (AC5). **All four lanes must be green** before AL7 is DONE (Hard Rule 6+9; AC14). NO fixture/stub. An adapter that cannot express the tailored allow/deny at init → build finding, reported.

---

## Security & abuse cases

- **Agent-authored field trust boundary (capture).** `tool_id` + `args` captured from the agent's *actual call*, never an agent-authored spec. `review_message_id`/`subject_thread_id` **derived** server-side. **Addressed.**
- **Tailored-policy forgery / replay.** The policy is composed only by the server verdict path on `approve`; the wrapper consumes it via a **single-statement atomic CAS** (no pre-read). An agent cannot compose a policy or re-use a consumed one. **Addressed (AC6).**
- **Unapproved irreversible op in session 2.** The tailored deny still denies every irreversible op except the approved one — a second/different irreversible op is denied + re-captured. **The safety floor.** **Addressed (AC5).**
- **Arg drift on the approved tool (the residual / optimization frontier).** Where the harness expresses arg-level scope, the arg-pin blocks drifted args (AC5b). Where it scopes by name only, the *same approved tool with different args* is permitted — **documented, acceptable per founder direction** (the floor — no *other* irreversible op — still holds). **Stated openly, not hidden.**
- **Classifier fail-open.** `classifyReversibility` defaults a no-signal tool to **`irreversible`** — gated, cannot fire without review. **Addressed (AC1 no-hint test).**
- **Capture-loop / duplicate Proposed Calls.** Session 1 terminated on first capture (`sessionRunRegistry.abort`), capture idempotent on `(origin_session_id, identity_hash)`. **Addressed (AC1).**
- **Cross-session policy leakage.** `(taskScope, agentScope)` binds the policy to the unique re-provision; an unrelated session/agent cannot consume it. **Addressed.**
- **Side-door egress.** The native gate + the sandbox boundary (existing) block shell/raw-HTTP/external-MCP egress around `registry.invoke`. The native allow/deny is per-harness, so a CLI's built-in tool is denied at the harness edge, not just at `registry.invoke`. **Addressed (native gate) + pre-existing sandbox control.**
- **Secret handling / SSRF / path traversal.** No new credential, outbound URL, or path owned by HyperIdle — the agent's own creds/tools run the call. **N/A.**

---

## Risks / ambiguities

- **R1 — re-provision trigger. RESOLVED (CRITICAL-3, Task 8+9).** Explicit `proposed_call_granted` event + dedicated `handleProposedCallGranted` subscription; not the owner-change `handleSessionEnded` path (`:500-514`, verified false for same-agent resume).
- **R2 — policy scope. RESOLVED (Task 2+8).** Session 2's id doesn't exist at compose time → scope `(taskScope, agentScope)`. Schema, compose, and wrapper lookup all key on `(taskScope, agentScope, approvedToolId)`.
- **R3 — the gate (was replay fidelity). RESOLVED + SIMPLIFIED (Task 5-7+11).** The gate is the **tailored native allow/deny at init**, per adapter — NOT a byte-faithful replay / exact-hash-match. This **dissolves the replay-fidelity CRITICAL and the deadlock**: arg drift never blocks the approved work (no exact-match-to-permit). Byte-fidelity survives only as the optional arg-pin (Task 5/7). The bounded re-provision (Task 9.5) is now a *liveness* net for crash/no-show, not a gate dependency.
- **R4 — descriptive vs operative (AC9).** Capture is triggered by an *attempted irreversible call at the gate*, not by artifact kind.
- **R5 — live-proof tool + four-harness coverage. RESOLVED (Task 4+11).** `commit_file` (MCP-exposed, `irreversible`) wired in Task 4; the live-proof lane runs on **all four** supported harnesses, each through its own adapter + sandbox. An adapter that cannot express the tailored allow/deny at init → build finding (Hard Rule 9), reported not silently deferred. Production exemplar: `github_merge_pr`.
- **R6 — Codex/opencode without async transport. RESOLVED (Task 7).** Enforcement is init-time config (`approval_policy`/`sandbox_mode` for Codex via spawn args; `permission` for opencode via spawn args); the deny is recorded from the CLI stdout event. The net-new app-server/SSE transports are NOT required for the AL7 floor — they would only be needed for a *held call-time ask*, which AL7 does not use.
- **R7 — liveness-net subscription placement. RESOLVED.** `handleUnconsumedPolicyOnSessionEnd` is a **separate `session_ended` subscription** (not inside `handleSessionEnded`), composing via the shared `hasActiveSession` guard — no double-dispatch.

---

## protectedTests
- `packages/server/src/routes/__tests__/*threads*verdict*` — verdict grammar + first-verdict-wins must not change (AC13).
- existing review-composition / reviews-loader tests for non-staged-op fields.

## sharedFiles
- `packages/db/src/schema.ts` (migration — drop+recreate)
- `packages/shared/src/harness/harness-adapter.ts` (`SessionConfig.permissionPolicy` + `SessionPermissionPolicy`; `ConversationMessage` NOT widened)
- `packages/shared/src/events.ts` (`ProposedCallGrantedEvent`, rename `operation_executed`)
- `packages/shared/src/index.ts` (export `proposed-call.ts`, drop `staged-operation.ts`)
- `packages/server/src/tools/tool-registry.ts` (the builtin gate + universal record/consume + `commit_file` + `classifyReversibility` + `composeDenyAllow`)
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` (`allowedTools`/`disallowedTools` from `composeDenyAllow` + `canUseTool`/`PreToolUse` deny-with-record/arg-pin)
- `packages/server/src/harness/cli-harness-adapter.ts` (Codex `--approval-policy`/`--sandbox`/allow + opencode `permission` flags in the resolved `args` template; record denied call from stdout)
- `packages/server/src/harness/builtin-harness-adapter.ts` (gate honored via `registry.invoke`; abort at `:717`)
- `packages/server/src/services/session-provisioning.ts` (policy threading + session-2 `approvedCall` payload from the Proposed Call)
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
- `SessionConfig.permissionPolicy` + `SessionPermissionPolicy.approvedCall` added; `ConversationMessage` unchanged (no message-seed). NEW: `composeDenyAllow` consumed by all four adapters; Claude `canUseTool`/allow-list, Codex/opencode spawn-arg permission flags.
