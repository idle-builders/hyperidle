# AL7 Architecture — Review-Gated Tool Execution (redo)

Fixed inputs: `plans/AL7/concept.md` (locked), `docs/process-layer/staged-operation.md` (ground truth, reframed). No `/design` (no novel UI; rides the existing action-operation review canvas).

**One-line:** HyperIdle rides each harness's native permission gate. Session 1 blocks the irreversible call and captures it (a **Proposed Call**) via the per-session `registry.invoke` wrapper; the review's approve mints a **one-shot grant**; session 2 is re-provisioned via the task-dispatcher rail with that grant, the agent replays the exact call, the wrapper consumes the grant once and permits it, the agent's own tool runs it, and the **Outcome** records the real return. HyperIdle executes nothing.

---

## Required reading (engineer, before implementing)

- `plans/AL7/concept.md` — the locked concept (nouns, rejection list, contracts, four resolved details).
- `docs/process-layer/staged-operation.md` — ground truth (reframed model + per-harness surface table).
- `packages/server/src/tools/tool-registry.ts:264-294` — `buildToolRegistry` + the `invoke` closure (THE wrapper seam).
- `packages/server/src/services/session-provisioning.ts:586-593, 700-722, 760-849, 1017-1024` — registry build, `setSessionToolRegistry`, `startSession`, the three invoke paths, `provisionSession`.
- `packages/server/src/mcp/mcp-bridge.ts:96-135` — the MCP invoke path (SDK production).
- `packages/server/src/harness/builtin-harness-adapter.ts:154, 741` — builtin internal invoke path.
- `packages/server/src/harness/claude-agent-sdk-adapter.ts:120-188` — `permissionMode` (net-new `canUseTool` is the dressing).
- `packages/fabric/src/services/task-dispatcher.ts` — the session-2 re-provision rail.
- `packages/server/src/routes/threads.ts:1254-1392` — verdict resolution + (discard) dispatch wiring.
- `packages/server/src/routes/reviews.ts` — the review loader (renders the Proposed Call + Outcome).
- `packages/db/src/schema.ts:1004-1059` — the tables to reshape.
- `packages/shared/src/harness/harness-adapter.ts:36-92` — `SessionConfig` (extend with the policy).

---

## Phase 0 — Interrogation (resolved)

The concept pins fidelity (replay), seam (`registry.invoke`), one-shot (hash + atomic consume), and the reversible/work-continues loop. Remaining unsettled implementation questions, with my read:

1. **Where does the wrapper live — inside `ToolRegistry.invoke`, or at each of the 3 call sites?**
   *Read:* inside the `invoke` closure in `buildToolRegistry` (`tool-registry.ts:274`). All three call sites (builtin `:741`, provisioning loop `:844`, MCP bridge `:132`) call the *same* registry instance's `invoke` — the registry is built once per session in `runSession` and shared (`setSessionToolRegistry` for builtin, the loop closure for non-builtin, the bridge registry for MCP). Wrapping `invoke` covers all three uniformly with no per-call-site edits. **Confirm.**

2. **How does session 2 "replay" the exact call — does the agent re-issue it, or does HyperIdle synthesize it?**
   *Read:* the agent re-issues it. Session 2's assembled context (via `strategy.assembleContext`) is seeded with the approved Proposed Call's tool+args as an explicit instruction ("your previous call X was approved; make it now"). The agent re-attempts; the wrapper matches the identity hash and permits. HyperIdle never calls the tool itself (Hard Rule 1). If the agent's re-attempt drifts (different args → different hash), the wrapper blocks it and the Proposed Call stays `held`/captured — surfaced, never executed wrong. **Confirm.**

3. **What carries the policy + grant to the wrapper — `SessionConfig`, or a side channel?**
   *Read:* a new `permissionPolicy` field on `SessionConfig` (the init surface), threaded from `provisionSession` → `runSession` → `buildToolRegistry(ctx)` so the `invoke` closure can read it. The grant is read from the DB at invoke-time (keyed by `sessionId` + identity hash), not embedded in config — config carries the *block policy* (which reversibility blocks) and the *session role* (capture vs. grant-bearing). **Confirm.**

4. **Block-vs-allow classification at session 1 — how does the wrapper know a call is irreversible?**
   *Read:* AL7 ships the **gated arm** only (concept + ground-truth + AL8 note). For the live-proof tool, reversibility is resolved from a minimal classifier: the tool/op's declared reversibility (MCP `destructiveHint`/`idempotentHint` where present; a small per-tool default otherwise). The trust-signal auto-flow for reversible calls is AL8. For AL7's proof, the irreversible tool is explicitly classified irreversible. **Confirm — keep the classifier minimal; do not build the policy engine here.**

5. **What is the live-proof tool?**
   *Read:* a real, reversible-to-set-up, irreversible-at-commit call the agent runs with its OWN tools/credentials (NOT HyperIdle's process). Candidate: a GitHub PR merge via the agent's MCP github tool, or a filesystem/echo MCP tool that writes a real file. It MUST run through the agent's session tools (Hard Rule 9: no fixture/stub proof). **Confirm the concrete tool with the reviewer; the plan is tool-agnostic below.**

---

## Phase 1 — Plan reconciliation (spec ⇆ reality)

| Spec/concept assumption | Reality | Plan handling |
|---|---|---|
| One uniform `registry.invoke` seam | TRUE but invoked at **3 call sites** (builtin `:741`, provisioning loop `:844`, MCP bridge `:132`) — all on the *same per-session registry instance* | Wrap the `invoke` **closure** in `buildToolRegistry`, not the call sites. One change, all paths. |
| `SessionConfig` is the init surface | Confirmed (`harness-adapter.ts:36`); has no permission field today | Add `permissionPolicy?` field; thread through `provisionSession`→`runSession`→`buildToolRegistry`. |
| SDK adapter has a native gate to ride | `claude-agent-sdk-adapter.ts` wires only `permissionMode` (`:159`); NO `canUseTool`/hooks | Native `canUseTool` is **net-new dressing** (optional for AL7). The `registry.invoke` wrapper is the source of truth; SDK production path routes tools via MCP bridge (`registry.invoke` at `:132`) — already covered. |
| Codex/opencode native call-time gates | Codex CLI adapter is stdout-only; opencode SSE reply absent | **Net-new transport — out of scope for AL7's live proof.** Flagged; AL7 proves through builtin or SDK-MCP. |
| `staged_operations`/`operation_outcomes` tables exist | Confirmed `schema.ts:1004-1059` — shaped as a kernel-exec queue (`capabilityTool`, `operation`, `params`, `status: pending\|executing\|...`) | **Reshape** to a Proposed-Call record (capture, grant, outcome). Migration required (rename/repurpose columns; drop `capability_harness_type`; add `tool_id`, `args`, `identity_hash`, `origin_session_id`; add `one_shot_grants` table or grant columns). |
| Verdict approve fires `resolveStagedOperations` | `threads.ts:1379-1381` wired to the dispatcher | **Discard** dispatch call; replace with `mintGrant(...)` + re-provision trigger. |
| `app.ts` boot sweep + `dispatchDeps` | `app.ts:415-434` builds `buildExecuteCapability` + `sweepStrandedOperations` | **Discard** — no kernel executor, no stranded-executing sweep (HyperIdle holds no in-flight execution). |
| Reviews loader renders staged op | `reviews.ts` LEFT JOINs `operation_outcomes`, nests `stagedOperation` on artifact | **Keep + reshape** field names: `proposedCall` (tool, args summary, identity) + `outcome`. |
| task-dispatcher re-provisions on `session_ended` | Confirmed (`task-dispatcher.ts:482-520`) — re-dispatches `in_progress` tasks with no active session | **Reuse** — session 2 is a re-provision of the same task. The grant existing in the DB is what makes session 2 a "resume with permission." |

---

## Phase 2 — Acceptance criteria + verification

Mapped from the workpackage ACs, reframed to the locked model.

| # | Acceptance criterion | Verification method |
|---|---|---|
| AC1 | Session 1 blocks an irreversible call at the gate and captures it as a Proposed Call (status `captured`) anchored to a review message + subject thread. | Integration test: build a session registry with a block policy + capture role; `registry.invoke(irreversibleTool, args)` returns a blocked result AND a `staged_operations` row exists with the exact `tool_id`, `args`, `identity_hash`, status `captured`. |
| AC2 | A reversible call is allowed at the gate with no capture (no review). | Integration test: `registry.invoke(reversibleTool, args)` returns the normal tool result; zero `staged_operations` rows written. |
| AC3 | Approving the review mints a one-shot grant scoped to the next session and transitions the Proposed Call to `granted`. | Integration test: POST verdict `approve` on the review message → a `one_shot_grants` row exists `{ proposedCallId, identityHash, sessionScope, consumed:false }`; Proposed Call status `granted`. Non-approve → no grant, status `held`. |
| AC4 | Session 2 (grant-bearing) permits exactly the approved call, once; the agent's own tool executes it; the real return is recorded as an Outcome. | **LIVE-PROOF integration test** (Hard Rule 9): provision session 2 with the grant; the agent replays the call; `registry.invoke` consumes the grant atomically and permits; the real tool runs and an `operation_outcomes` row records the genuine return (`status: ok`, `receipt`). Asserts the side-effect actually happened (e.g. file written / PR merged), not a stub. |
| AC5 | A non-matching call in session 2 (different args → different hash) is blocked. | Integration test: session 2 with a grant for hash H; `registry.invoke(tool, differentArgs)` (hash ≠ H) → blocked; grant stays `consumed:false`; no Outcome. |
| AC6 | At-most-once: re-delivery / re-attempt of the same approved call after consumption is blocked (no double-execute). | Integration test: invoke the granted call twice in session 2; first permits (grant consume CAS wins), second blocks (grant already `consumed`); exactly one Outcome row. |
| AC7 | A non-approving verdict never executes the Proposed Call; it stays `held`. | Integration test: POST `request-changes` → no grant minted; provision a follow-up session → the call is blocked (no grant); zero Outcome rows. |
| AC8 | A Proposed Call the human never approves is never executed. | Integration test: capture, never verdict → no grant ever exists → any session blocks it; zero Outcomes. |
| AC9 | Descriptive artifacts (code diff, doc) do NOT capture or execute on approve. | Integration test: a review whose subject is a descriptive artifact (no irreversible call attempted) → approve mints no grant, writes no Outcome. (Capture only happens when an irreversible *call* is attempted at the gate, never from artifact kind alone.) |
| AC10 | After execution, the result (ok/failure) returns to HyperIdle and is visible against the review. | Integration test: GET `/api/reviews/:reviewMessageId` after AC4 → response nests `proposedCall` + `outcome` (status, receipt or error) on the matching artifact. Failure path: a failing tool → `outcome.status: failed` + verbatim error, never silent. |
| AC11 | The agent continues working in session 2 after the approved call executes (work-continues loop). | LIVE-PROOF test: after the Outcome is recorded, session 2's stream produces ≥1 further agent action (a follow-up tool call or completion) — the session does not end at the granted call. |
| AC12 | HyperIdle executes nothing — no HyperIdle-process tool dispatch exists. | Static: `npm run check` + an ESLint guard / absence test — `staged-operation-dispatcher.ts`, `stage-operation.ts`, `buildExecuteCapability`, `KERNEL_DISPATCHABLE_CAPABILITIES` are deleted; no import resolves them. (Verifies the discard.) |
| AC13 | Verdict grammar unchanged. | Existing `threads.ts` verdict tests stay green (protected); no new verdict value. |

---

## Phase 3 — Design-it-twice (load-bearing decisions)

### D1 — The wrapper seam: wrap `ToolRegistry.invoke` vs. wrap each call site

- **A (chosen): wrap the `invoke` closure in `buildToolRegistry`.** All three call sites share one per-session registry instance; wrapping `invoke` covers builtin/loop/MCP uniformly. *Trade-off:* the wrapper must read session-scoped policy + grant, so `buildToolRegistry` needs the `sessionId` + policy in `ctx`. *Reject the alternative because:* wrapping the 3 call sites triples the surface, drifts (the X5/X6 double-execute guards already show how fragile per-site logic is), and a 4th adapter would need a 4th edit.
- **B: a `PreToolUse`-style hook per adapter (SDK `canUseTool`, Codex JSON-RPC, opencode SSE).** *Trade-off:* blocks at the harness edge (better UX, fewer wasted tokens). *Reject as the source of truth because:* not all adapters have it today (net-new transport for Codex/opencode), and none express "this exact call once" — so the one-shot enforcement still has to live at `registry.invoke`. **B is additive dressing, layered on A later.**

**Synthesis:** A is the source of truth; native gates are optional optimization. AL7 ships A + the init `permissionMode`/policy already present on SDK.

### D2 — Grant storage: a `one_shot_grants` table vs. grant columns on `staged_operations`

- **A (chosen): a separate `one_shot_grants` table** `{ proposed_call_id PK/FK, identity_hash, session_scope, consumed (bool), minted_at, consumed_at }`. *Trade-off:* one more table. *Why:* the grant has its own lifecycle (minted at approve, consumed in session 2, can be re-minted on re-open) and the **atomic consume** is a clean conditional UPDATE `WHERE consumed = false` (mirrors first-verdict-wins). A re-open mints a *new* grant row without mutating the Proposed Call's immutable capture.
- **B: `granted_to_session` + `consumed_at` columns on `staged_operations`.** *Trade-off:* fewer tables. *Reject because:* it muddies the Proposed Call's immutability contract (capture must not be mutated post-review) and complicates re-open (a second grant for the same call).

### D3 — Identity hash: SHA-256 over canonical JSON of `{tool_id, args}`

- Canonicalize args (sorted keys, stable number/string encoding) → SHA-256 hex. Deterministic, collision-safe for this scale, comparable across sessions. *Reject "store args and deep-equal at match time":* equality semantics over arbitrary JSON are exactly what canonical-hash avoids; the hash is also the grant's match key and the dedupe identity in one.

---

## Type signatures / schemas / endpoints

### `SessionConfig` extension (`packages/shared/src/harness/harness-adapter.ts`)
```ts
/** AL7: per-session permission policy the registry wrapper enforces. */
export interface SessionPermissionPolicy {
  /** Reversibility classes blocked at the gate (captured for review). */
  readonly blockReversibility: readonly ("irreversible")[];
  /** When this session bears a grant, the registry permits the matching call once. */
  readonly sessionRole: "capture" | "grant-bearing";
}
// add to SessionConfig:
readonly permissionPolicy?: SessionPermissionPolicy;
```

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

NEW `one_shot_grants`:
```ts
export const oneShotGrants = pgTable("one_shot_grants", {
  proposedCallId: text("proposed_call_id").primaryKey().references(() => proposedCalls.id, { onDelete: "restrict" }),
  identityHash: text("identity_hash").notNull(),
  sessionScope: text("session_scope").notNull(),   // session 2 id (or task id until session 2 minted — see Risk R2)
  consumed: integer("consumed", { mode: "boolean" }).notNull().default(false),
  mintedAt: text("minted_at").notNull(),
  consumedAt: text("consumed_at"),
}, (t) => [index("grants_match_idx").on(t.identityHash, t.consumed)]);
```
`operation_outcomes` → kept, FK renamed `proposed_call_id` (PK, enforces 0..1 + immutability). Fields `status (ok|failed)`, `payload`/`receipt`, `error`, `executed_at`.

### The wrapper (inside `buildToolRegistry.invoke`, `tool-registry.ts`)
```ts
// ctx gains: sessionId, permissionPolicy?, db (already present)
async function invoke(name, rawArgs): Promise<ToolResult> {
  // ... existing role/schema checks ...
  const reversibility = classifyReversibility(name);          // minimal classifier (Phase 0 Q4)
  if (ctx.permissionPolicy && reversibility === "irreversible") {
    const hash = identityHash(name, parsed.data);
    const grant = await findUnconsumedGrant(ctx.db, ctx.sessionId, hash);
    if (grant) {
      const won = await consumeGrant(ctx.db, grant.proposedCallId);  // CAS: WHERE consumed=false
      if (won) {
        const result = await def.handler(parsed.data, ctx);          // AGENT'S tool runs it
        await recordOutcome(ctx.db, grant.proposedCallId, result);   // real return
        return result;
      }
    }
    // no grant (or lost CAS) → capture (session 1) or block (session 2 non-match)
    await captureProposedCall(ctx.db, { sessionId: ctx.sessionId, toolId: name, args: parsed.data, hash, reviewMessageId, subjectThreadId });
    return err("AWAITING_REVIEW", `Call to ${name} blocked pending human approval.`);
  }
  return def.handler(parsed.data, ctx);                          // reversible → allow
}
```
*Note:* `reviewMessageId`/`subjectThreadId` resolution at capture time = the agent's current task/thread → the review message the session-review-creator opens. Reuse the existing review-creation path; do NOT have the agent author them (concept rejection #4).

### Verdict path (`threads.ts`)
Replace the `resolveStagedOperations(dispatchDeps, ...)` call (lines ~1371-1381) with: on `approve`/`approve-with-comments`, `mintGrant(db, proposedCallId, identityHash, sessionScope)` + transition Proposed Call `captured → granted` + emit an event that triggers the task-dispatcher re-provision (the task is already `in_progress` with no active session after session 1 ended; the existing `session_ended` handler re-dispatches — verify the trigger fires; if not, emit a `task_state_changed`-equivalent or call the re-provision explicitly). Remove `dispatchDeps` thread-through.

### Reviews loader (`reviews.ts`)
LEFT JOIN `proposed_calls` + `one_shot_grants` + `operation_outcomes` by `review_message_id`; nest `{ proposedCall: { toolId, argsSummary, identityHash, status }, outcome?: { status, receipt|error, executedAt } }` on the matching `action_operation` artifact. Keep the `rev-1` fixture branch.

---

## Per-harness implementation surface (config vs net-new)

| Harness | AL7 surface | Class |
|---|---|---|
| builtin | wrapper at shared `registry.invoke`; tools run internally (`builtin-harness-adapter.ts:741`) | **config** (no native gate; HyperIdle owns the loop) |
| Claude Code (SDK) | production routes tools via MCP bridge → shared `registry.invoke` (`mcp-bridge.ts:132`); `permissionMode` already wired. Native `canUseTool` block-at-edge = optional. | **config** (wrapper covers it); `canUseTool` = **net-new dressing**, deferred |
| Codex | native `execCommandApproval`/`applyPatchApproval` JSON-RPC needs bidirectional app-server transport (CLI is stdout-only) | **net-new transport** — out of scope for AL7 live proof |
| opencode | `permission.asked` SSE reply channel | **net-new transport** — out of scope for AL7 live proof |

AL7's live proof runs through **builtin or SDK-MCP** (both already funnel through `registry.invoke`). Codex/opencode native gates are flagged net-new and deferred; the uniform wrapper already gates their MCP-routed calls.

---

## Ordered task list

1. **Discard the kernel-executor model.** Delete `tools/stage-operation.ts` (+ registry registration), `services/staged-operation-dispatcher.ts`, `shared/src/staged-operation.ts`; remove `threads.ts` dispatch wiring + `dispatchDeps`; remove `app.ts` boot sweep + `buildExecuteCapability` wiring; delete the AL7-* tests for these. *(Proves AC12.)*
2. **Schema migration.** Reshape `staged_operations` → `proposed_calls`; add `one_shot_grants`; rename `operation_outcomes` FK. `npm run db:generate` + migrate. *(red: schema test.)*
3. **Shared types.** `packages/shared/src/proposed-call.ts` (statuses, `ProposedCall`, `SessionPermissionPolicy`); extend `SessionConfig`. *(red: AC1 shape.)*
4. **Identity hash + classifier.** `identityHash(toolId, args)` (canonical JSON + SHA-256); minimal `classifyReversibility(toolId)`. *(red: hash determinism test.)*
5. **The wrapper.** Extend `ToolContext` with `sessionId` + `permissionPolicy`; implement capture / find-grant / atomic-consume / record-outcome inside `buildToolRegistry.invoke`. *(red: AC1, AC2, AC5, AC6.)*
6. **Thread policy through provisioning.** `provisionSession`/`runSession` build the registry with `permissionPolicy`; session 1 = `capture`, session 2 = `grant-bearing`. *(red: AC1 via provisioning.)*
7. **Verdict → grant.** `threads.ts`: approve mints the grant + transitions the call + triggers re-provision. *(red: AC3, AC7, AC8.)*
8. **Session-2 resume + replay seeding.** `strategy.assembleContext` seeds the approved Proposed Call so the agent replays it; confirm the task-dispatcher re-dispatches after session 1 ends. *(red: AC4, AC11.)*
9. **Reviews loader.** Nest `proposedCall` + `outcome` on the artifact. *(red: AC10.)*
10. **LIVE-PROOF lane.** End-to-end: agent attempts irreversible call → blocked+captured → approve → session 2 → agent's own tool runs the real call → Outcome records the genuine side-effect → agent continues. *(proves AC4, AC10, AC11 — Hard Rule 9; NO fixture/stub.)*

---

## Security & abuse cases

- **Agent-authored field trust boundary (capture).** `tool_id` + `args` are captured from the agent's *actual call*, never an agent-authored spec (concept rejection #4). `review_message_id`/`subject_thread_id` are **derived** server-side from the session's task/thread, never agent-supplied (preserves the original WARNING-1 fix). **Addressed.**
- **Grant forgery / replay.** The grant is minted only by the server verdict path on `approve`; the wrapper matches by identity hash + session scope and consumes atomically (`WHERE consumed=false`). An agent cannot mint a grant or re-use a consumed one. **Addressed (AC6).**
- **TOCTOU / drift between review and execution.** Replay-not-re-derive + immutable captured args + hash match guarantee executed == reviewed (Hard Rule 2). **Addressed (AC5).**
- **Cross-session grant leakage.** `session_scope` binds the grant to session 2; a grant cannot be consumed by an unrelated session. **Addressed.** *(Risk R2 below covers the scope-id timing.)*
- **Side-door egress.** The wrapper gates `registry.invoke`; the sandbox boundary (existing) blocks shell/raw-HTTP egress around it. Out-of-band egress is the existing sandbox guarantee, not new in AL7. **N/A (pre-existing control).**
- **Rate-limit on verdict POST.** Verdict route is existing; AL7 adds no new POST. **N/A.**
- **Secret handling.** AL7 stores no new credential — the agent's own credentials run the call (the whole point). **N/A.**
- **SSRF / path traversal.** No new outbound URL or path input owned by HyperIdle (the tool is the agent's). **N/A.**

---

## Risks / ambiguities

- **R1 — re-provision trigger.** After session 1 ends, does the task-dispatcher re-dispatch the task automatically? `handleSessionEnded` re-dispatches `in_progress` tasks with a *changed owner*; a same-owner re-provision may need an explicit trigger from the verdict path. **Task 7/8 must verify and, if needed, emit the trigger explicitly.** Load-bearing for AC4/AC11.
- **R2 — grant `session_scope` before session 2 exists.** At approve-time session 2's id is not yet minted. Options: scope the grant to the **task id** (session 2 reads grants for its task) or mint the grant lazily when session 2 starts. *Recommend: scope to task id + agent id* (session 2 for that task is the unique re-provision). Lock in Task 7.
- **R3 — replay reliability.** The agent must re-issue the byte-identical call. If context reassembly drifts the args, the hash won't match and the call stays held (safe, but the loop stalls). Mitigate by seeding the exact tool+args in `assembleContext` and instructing an exact replay. Surfaced as held state, never wrong execution.
- **R4 — descriptive vs operative (AC9).** Capture is triggered by an *attempted irreversible call at the gate*, not by artifact kind. A descriptive review simply never has a blocked call → no grant, no outcome. Confirm no code path captures from artifact kind alone.
- **R5 — live-proof tool availability.** AC4/AC10/AC11 require a real tool the agent runs with its own creds. If none is wired in the test env, AL7 is **not done** (Hard Rule 9 — no stub proof). The live-proof lane must run before DONE.

---

## protectedTests
- `packages/server/src/routes/__tests__/*threads*verdict*` — verdict grammar + first-verdict-wins must not change (AC13).
- existing review-composition / reviews-loader tests for non-staged-op fields.

## sharedFiles
- `packages/db/src/schema.ts` (migration)
- `packages/shared/src/harness/harness-adapter.ts` (`SessionConfig`)
- `packages/shared/src/index.ts` (export `proposed-call.ts`, drop `staged-operation.ts`)
- `packages/server/src/tools/tool-registry.ts` (the wrapper)
- `packages/server/src/services/session-provisioning.ts` (policy threading)
- `packages/server/src/routes/threads.ts` (verdict → grant)
- `packages/server/src/routes/reviews.ts` (loader)
- `packages/server/src/app.ts` (remove dispatch wiring)

## Migrations (symbol renames/removals — every call site)
- `StagedOperationSpec` (`shared/staged-operation.ts`) → **delete**; callers: dispatcher (deleted), `reviews.ts` view shape (rename to `ProposedCallView`).
- `staged_operations` table → **rename/reshape** `proposed_calls`; callers: `stage-operation.ts` (deleted), dispatcher (deleted), `reviews.ts` (rerename), `schema.ts` types `StagedOperation`/`NewStagedOperation` → `ProposedCall`/`NewProposedCall`.
- `resolveStagedOperations`/`sweepStrandedOperations`/`buildExecuteCapability`/`KERNEL_DISPATCHABLE_CAPABILITIES`/`isKernelDispatchableCapability` → **delete**; callers: `threads.ts`, `app.ts`, AL7 tests.
- `operation_executed` event → **reshape/rename** `proposed_call_executed` (streamId = subjectThreadId kept); callers: any UI subscriber (grep `operation_executed`).
