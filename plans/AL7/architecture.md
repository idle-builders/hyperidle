# AL7 Architecture — Review-Gated Tool Execution (trust-first redo)

Fixed inputs: `plans/AL7/concept.md` (locked, trust-first), `docs/process-layer/staged-operation.md` (ground truth), `ETHOS.md` §4 "Trust Agents". No `/design` (no novel UI; rides the existing action-operation review canvas).

**One-line:** **We trust the agent.** It works in session 1 with its own tools + creds; reversible calls flow; an **irreversible call is routed to a review** (carried by the harness's native ask/deny where it exists, or at HyperIdle's own brokered participation point where the harness has no headless ask). The attempted call is captured as a **Proposed Call**; session 1 ends (sessions aren't pausable). On approve, HyperIdle composes a **tailored grant** (do the approved op + reversible work; route any *other* irreversible op to review) and re-engages the agent; **the agent simply re-does the approved work with its own tools** — re-attempting is fine, we trust it. The real return is recorded as an **Outcome**, and the agent **continues working** (closes the story / updates docs / proceeds). The gate **fades as trust grows** (verdict-history signal, AD4). **No containment fortress, no "only path", no credential-containment dependency, no exact-hash-match guard, no deadlock machinery — creds-present is correct.**

**The trust frame (read before "how it works") — ETHOS §4:**

> The agent holds its own credentials, runs its own tools, and does real work like a real employee with broad self-permission. The review gate is a **collaboration checkpoint on the consequential/irreversible, not a cage.** We use the harness's **native permission system (ask/allow/deny) as a WORKFLOW that routes consequential actions to a human** — never as a security boundary policing the agent. We do **not** design against a rogue agent, do **not** withhold credentials a tool needs to auth, and do **not** build "the broker is the only path." If a harness can't scope a permission to exactly one op, that is acceptable — we are not defending against the agent.

**What this version changes vs. the broker-floor-as-fortress (v4) plan — the paranoia purge:**
- **Deletes the containment-fortress framing.** No "the broker floor is the safety mechanism / the only path." `registry.invoke` is reframed as **HyperIdle's own workflow-router participation point** in the agent's brokered call — it classifies, routes the irreversible to review, and on approve permits the approved work. Collaboration plumbing, not a security floor.
- **Deletes the AN credential-containment dependency.** AL7 no longer assumes "no live-op credential in the sandbox." Creds are present and that is correct. No `⚠️ UNBUILT (AN)` flag, no scoped-guarantee caveat, no Track-AN forward dependency.
- **Deletes the native-tool / ambient-credential bypass threat model.** We do not model the agent routing around the checkpoint. There is no "bounded residual until AN."
- **Deletes byte-fidelity-as-guard.** Re-attempting the approved op in session 2 is fine. No exact-hash-match-to-permit, no deadlock machinery. Byte-fidelity is at most an optional arg-pin convenience.
- **Reframes native allow/deny.** Not "defense-in-depth tightening on a floor" — it is **the primary workflow carrier where the harness exposes an externally-answerable ask** (Claude `canUseTool`). Where it doesn't (Codex `exec`, opencode headless), the *same workflow* hangs at HyperIdle's brokered participation point — plumbing for a missing channel, not a floor.
- **Folds in the work-continues loop (was AL10):** after the approved op returns, the agent keeps working *within the same session-2 run* (one re-engagement event `proposed_call_granted`; no separate "operation-finish" re-dispatch — NIT-3).

**Carried from prior models (still correct):** two-session async loop (sessions aren't pausable); capture-of-the-proposed-op as the review subject; the `proposed_call_granted` re-dispatch trigger; abort-on-route-to-review (session 1 ends, since it can't pause); reversible→flow / irreversible→review; the tailored-grant consume-once record. **All reframed as trusted-collaboration workflow, not enforcement.**

---

## Required reading (engineer, before implementing)

- `plans/AL7/concept.md` — the locked trust-first concept (nouns, rejection list incl. the paranoia purge, contracts, the per-harness DONE matrix).
- `ETHOS.md` §4 + `docs/agent-layer/principles.md` §5 — the trust frame.
- `docs/process-layer/staged-operation.md` — ground truth (review checkpoint via native permission, fading with trust).
- `packages/server/src/tools/tool-registry.ts:264-294` — `buildToolRegistry` + the `invoke` closure (`:274`): HyperIdle's **workflow-router participation point** — classify reversibility, route the irreversible to review (capture + record), and on approve permit the approved work. Not a fortress; the convenient place HyperIdle already participates in the agent's brokered call.
- `packages/server/src/services/session-provisioning.ts:582-593, 700-722, 760-849` — registry build (the **same per-session registry instance** shared by builtin internal calls, the provisioning loop `:844`, and the MCP bridge), `setSessionToolRegistry`, `startSession`, `provisionSession` (where the per-session workflow is injected). `ctx` carries `taskId`/`agentId` (`:577,575`).
- `packages/server/src/mcp/mcp-bridge.ts:96-135` — the MCP invoke path: a CLI/SDK MCP-routed tool reaches `registry.invoke` (`:132`). How a Claude/Codex/opencode agent's brokered call reaches HyperIdle's workflow router.
- `packages/server/src/harness/builtin-harness-adapter.ts:590-668, 702-770` — `runExecuteTurn`/`executeToolCalls`/`registry.invoke` (`:741`); abort honored at `:717`; `mcpSupport:false` (`:336`) — builtin hits `registry.invoke` directly.
- `packages/server/src/harness/claude-agent-sdk-adapter.ts:141-162` — `queryOptions` sets `permissionMode`; AL7 uses **`canUseTool` (allow/ask/deny, `updatedInput`) + `allowedTools`/`disallowedTools` as the native workflow carrier** (verified: code.claude.com/docs/en/agent-sdk/permissions, June 2026; `PermissionResult` = `{behavior:"allow",updatedInput?} | {behavior:"deny",message} | {behavior:"ask"}`).
- `packages/server/src/harness/cli-harness-adapter.ts:31-70, 183-207` — the generic CLI adapter (`{{sandbox}}`/`{{model}}`/`{{mcpUrl}}` at `:190`; `eventFormat:"ndjson"|"text"` `:70`).
- `packages/server/src/harness/adapter-pool.ts:324-353` — `CLI_TOOL_CONFIGS`. **Present reality (verified June 2026):** registers `aider`, `goose`, `opencode` only — no `codex`; opencode is `--dir`-only text-mode, no `{{mcpUrl}}`. Routing the CLI harnesses' calls into the review workflow is net-new wiring.
- `packages/server/src/harness/harness-capability-descriptors.ts:11` — `KNOWN_HARNESS_FAMILIES`. cursor-agent `unavailable` → skip.
- `packages/shared/src/harness/harness-adapter.ts:31, 36-92` — `SessionConfig` (extend with the workflow); `SessionConfig.messages` (AH3 chat channel, NOT a replay seam).
- `packages/server/src/services/session-run-registry.ts` — `abort` → `stopSession` (session-1 termination; sessions aren't pausable).
- `packages/fabric/src/services/task-dispatcher.ts:176, 189, 500-514` — `enqueue`/`hasActiveSession` (reuse); `handleSessionEnded` owner-change guard (add `handleProposedCallGranted`).
- `packages/fabric/src/services/policy-engine.ts` — the verdict-history trust signal (AD4) the gate fades on. AL7 ships the gated arm; AL8 wires auto-flow.
- `packages/server/src/routes/threads.ts:1254-1392` — verdict resolution + (discard) dispatch wiring.
- `packages/server/src/routes/reviews.ts` — the review loader (renders the Proposed Call + Outcome).
- `packages/db/src/schema.ts:1004-1059` — the tables to reshape.

---

## Phase 0 — Interrogation (resolved)

The concept pins the trust frame (checkpoint not fortress), the capture (route-to-review + record), the grant lifecycle (compose-on-approve, consume-once), the work-continues loop, and that the gate fades on the trust signal. Remaining implementation questions, with my read:

1. **Where does the route-to-review workflow live — native ask, or HyperIdle's participation point?**
   *Read:* **both, by harness, and that's fine.** Where the harness exposes an externally-answerable native ask (Claude `canUseTool` → `deny` to route to review, or `ask` semantically), use it as the carrier. Where it doesn't (Codex `exec`, opencode headless `run` may auto-approve), hang the same route-to-review step at HyperIdle's brokered participation point (`registry.invoke`). This is **not** "the broker floor is the only path" — it is workflow plumbing for a missing native channel. Either way the workflow is identical: classify → route irreversible to review → capture → end session 1. **Confirm.**

2. **How does the agent run the approved op in session 2 — replay, or just let it work?**
   *Resolved:* **just let the agent re-do the approved work with its own tools** under a tailored grant (do the approved op + reversible; route other irreversible to review). **Re-attempting / re-deriving the call is fine — we trust it.** No exact-hash-match-to-permit, no byte-faithful replay, no deadlock. Same-tool drifted args (name-scoped) are permitted — we trust the intent; arg-pin is an optional convenience where arg-level scope exists. A *different* irreversible op is routed to review again (a fresh human decision, not a blocked attack).

3. **Capture — synchronous route-to-review + record (NOT an async hold).**
   *Resolved:* when an irreversible call is routed to review (session 1, or a non-approved op in session 2), record the attempted `{toolId, args}`. Uniform because the brokered call passes through `registry.invoke`:
   - **builtin** — direct at `registry.invoke` (`:741`): route to review, record.
   - **Claude** — `canUseTool` `deny` (or the MCP-routed call at `registry.invoke` `:132`): route to review, record. Claude's externally-answerable ask is the native carrier.
   - **Codex / opencode** — the MCP-routed call hits `registry.invoke` via the bridge: route to review, record. (Their native ask isn't externally answerable in headless mode, so the workflow hangs here — plumbing, not a floor.)
   `registry.invoke` is the universal in-process record point. **Confirm.**

4. **Classification — how does HyperIdle know a call is irreversible?** *(fail-closed out of care, not suspicion)*
   *Resolved:* `classifyReversibility(toolId, def)` resolves in order: (1) the tool definition's explicit `reversibility` field (AL7 adds optional `reversibility?` to `RegisteredTool`); (2) MCP `destructiveHint`/`idempotentHint`; (3) **no signal ⇒ `irreversible`** — route to review out of *care* (we'd rather surface a consequential-looking call to the human than miss one), not out of suspicion of the agent. The live-proof tool gets explicit `reversibility:"irreversible"`. **Confirmed.**

5. **What is the live-proof tool, and the per-harness DONE matrix?**
   *Resolved:* a HyperIdle-registered, **MCP-exposed** tool **`commit_file`** that writes a real file into the session sandbox, classified `irreversible`. The agent's harness emits it through its own MCP client → the bridge → `registry.invoke` (builtin hits `registry.invoke` directly). It needs no special credential — it is just a concrete irreversible op to prove the loop. **The DONE matrix:** builtin + Claude go green now (adapters route the call into the workflow); Codex + opencode are named net-new adapter tasks (`net-new-adapter-pending`), live-proven once built. **Confirmed: `commit_file` wired in Task 4 before Tasks 5-11.**

   **Honesty note on what `commit_file` proves (WARNING-4 — stated plainly):** `commit_file` is a HyperIdle-registered tool with a HyperIdle handler, declared `reversibility:"irreversible"`, run in the session sandbox. It proves the **loop mechanics** deterministically — classify → route-to-review → capture → grant → consume-once → execute (the agent's own session emitted the call) → record Outcome → continue — **without** depending on a real external side-effect or an external credential. It does **not** itself exercise the "agent runs with its *own external credentials*" path: its handler is HyperIdle's own and authenticates nothing. The "own-creds" property rides on the fact that it is **the agent's own session that emits the call** (AC12), not on the handler doing external auth. The own-creds *external* path (a tool that auths to a third party with the agent's credentials) is exercised by the **production exemplar `github_merge_pr`** — a real brokered external op the agent calls with its own creds — which is the real-world instance of this same loop, not a separate mechanism. AL7's AC is the checkpoint mechanics; the external-creds exemplar rides the identical router unchanged.

---

## Phase 1 — Plan reconciliation (spec ⇆ reality)

| Spec/concept assumption | Reality (verified June 2026) | Plan handling |
|---|---|---|
| One uniform place to route the irreversible call to review | `registry.invoke` invoked at 3 call sites (builtin `:741`, provisioning loop `:844`, MCP bridge `:132`) on the *same per-session registry instance* (`session-provisioning.ts:582`) | Wrap the `invoke` **closure** in `buildToolRegistry` as the workflow router (classify → route irreversible to review + record → on approve permit approved work). One change, all paths, all harnesses. **Framed as collaboration plumbing, not a security floor.** |
| ~~Irreversible ops are HyperIdle-brokered, credential never in sandbox~~ | **Deleted.** Creds are present in the sandbox and that is correct (ETHOS §4). AL7 has no AN credential-containment dependency. | No `⚠️ UNBUILT (AN)` flag, no "only path" claim, no native-tool-bypass residual. The agent holds its creds; we trust it. |
| Claude has a native ask | **TRUE** — `canUseTool` returns allow (with `updatedInput`) / **ask** / deny; the ask prompts the user to approve/deny/modify. Externally answerable. (code.claude.com/docs/en/agent-sdk/permissions) | Use `canUseTool` as the native workflow carrier on Claude. |
| Codex has an externally-answerable headless ask | **NO** — `--ask-for-approval` exists but `codex exec` (non-interactive) has no documented external answer channel. (developers.openai.com/codex/noninteractive) | Carry the route-to-review workflow at HyperIdle's brokered participation point for Codex. Plumbing, not a floor. |
| opencode headless `run` honors ask | **Unreliable** — `permission` ask exists in `opencode.json`/frontmatter, but headless `run` may auto-approve (an ask has no terminal to project to). (opencode.ai/docs/permissions) | Same — carry the workflow at HyperIdle's brokered participation point; opencode `permission` is a bonus where it bites. |
| Codex adapter exists | **FALSE** — `CLI_TOOL_CONFIGS` registers `aider`, `goose`, `opencode` only. | **Net-new task (Task 7c):** register a `codex` adapter + wire `{{mcpUrl}}` so the brokered call routes into the workflow. `net-new-adapter-pending` until built. |
| opencode adapter routes the brokered call into the workflow | **FALSE** — `--dir`-only text-mode, no `{{mcpUrl}}` (`:344-352`) | **Net-new task (Task 7b):** wire `{{mcpUrl}}` + `opencode run -f json` so the brokered call routes into the workflow. |
| `SessionConfig` is the init surface | Confirmed (`harness-adapter.ts:36`); no permission field today | Add `sessionWorkflow?` (the permission workflow); thread `provisionSession`→`runSession`→the registry (the router) + optionally to each adapter (native carrier). |
| `staged_operations`/`operation_outcomes` tables exist | Confirmed `schema.ts:1004-1059` — kernel-exec queue shape | **Reshape** to a Proposed-Call record (capture, tailored-grant, outcome). Migration (drop+recreate). |
| Verdict approve fires `resolveStagedOperations` | `threads.ts:1379-1381` | **Discard**; replace with `composeTailoredGrant(...)` + emit `proposed_call_granted`. |
| `app.ts` boot sweep + `dispatchDeps` | `app.ts:415-434` builds `buildExecuteCapability` + `sweepStrandedOperations` | **Discard** — no kernel executor. |
| task-dispatcher re-dispatch trigger | `handleSessionEnded` enqueues **only on owner change** (`:500-514`) | **Explicit `proposed_call_granted` event** + new `handleProposedCallGranted` subscription, guarded by `hasActiveSession`. |

---

## Phase 2 — Acceptance criteria + verification (per-harness DONE matrix)

Harness-independent ACs are verified once at the workflow router (`registry.invoke`). Harness-dependent ACs (routing the agent's brokered call into the workflow + the live op + continuation) are verified **per harness whose adapter routes into the workflow**, against the real installed harness: builtin + Claude now; Codex + opencode once Task 7b/7c lands.

**Per-harness native-permission routing + DONE matrix** *(canonical copy: `docs/process-layer/staged-operation.md` §"Per-harness native-permission routing + DONE matrix"; this table and the concept's are derived from it — if they ever drift, the doc wins. NIT-1.)*:

| Harness | Native permission carrier | Adapter routes into the workflow? | Terminal DONE state |
|---|---|---|---|
| **builtin** | HyperIdle owns the loop; `registry.invoke` (`:741`) is the router | YES (direct; `mcpSupport:false`) | **green** — live proof now (AC1/4/5/11) |
| **Claude (SDK)** | `canUseTool` (allow/ask/deny, `updatedInput`) + `allowedTools`/`disallowedTools` — native ask carrier (verified) | YES (SDK wired; small net-new MCP-route assertion) | **green** — live proof now (AC1/4/5/11) |
| **Codex** | `--ask-for-approval` + `--sandbox` (no headless external ask → workflow hangs at HyperIdle's brokered participation point) | **NO — net-new (Task 7c)** | **net-new-adapter-pending** — lane runs once Task 7c lands |
| **opencode** | `opencode.json` `permission` (headless `run` may auto-approve → workflow hangs at HyperIdle's brokered participation point) | **NO — net-new (Task 7b)** | **net-new-adapter-pending** — lane runs once Task 7b lands |
| **cursor-agent** | — | — | **skipped** (`unavailable`) |

**Honesty note on the CLI harnesses (WARNING-1, ETHOS §4 — stated plainly, once):** on a headless CLI harness (Codex `exec`, opencode `run`) the checkpoint **covers the agent's MCP-routed calls** — those reach `registry.invoke` via the bridge, where HyperIdle hangs the route-to-review step. The agent is **trusted not to route the irreversible op around the bridge** (e.g. via its own native shell / raw HTTP). This is ETHOS §4, **not a guarantee**: the participation point does not intercept *everything*, and we do not model a bypass. The checkpoint is delivered for the brokered (MCP-routed) call the agent is trusted to make; it is not a containment wall. (Builtin + Claude differ only in that the carrier is in-process / the native `canUseTool` ask, not the MCP bridge.)

**DONE for AL7** = the trust-first loop proven LIVE on the harnesses with adapters that route into the workflow (builtin + Claude), with Codex + opencode scoped as named build tasks (7b/7c). No stub-as-proof. **A `green-now` harness whose real binary/SDK is absent in the run env makes its lane FAIL, never skip** — absence is not a pass (AC14b). builtin is in-process (always available); the Claude lane requires the real installed SDK/binary and fails loudly without it.

| # | Acceptance criterion | Verification method |
|---|---|---|
| AC1 | Session 1 routes an irreversible call to review, captures it as a Proposed Call (status `captured`) anchored to a review message + subject thread, **and session 1 ends** (sessions aren't pausable). | **Per adapter-ready harness (builtin + Claude):** provision session 1 with a route-irreversible workflow; the agent attempts `commit_file`; HyperIdle routes it to review (builtin direct at `registry.invoke`; Claude via `canUseTool` deny / the MCP bridge) AND writes a `proposed_calls` row with the exact `tool_id`, `args`, status `captured` AND `sessionRunRegistry.abort(sessionId)` fires. A **second identical** routed call writes **no duplicate** (idempotent on `(origin_session_id, identity_hash)`). |
| AC2 | A reversible call flows with no capture. | **Per adapter-ready harness:** the agent attempts a reversible tool; it flows; the normal tool result returns; zero `proposed_calls` rows. |
| AC3 | Approving the review composes a **tailored grant** scoped to **task id + agent id**, transitions the Proposed Call to `granted`, **and emits `proposed_call_granted` which re-engages the agent (session 2)**. | Integration test (harness-independent): POST verdict `approve` → a `tailored_grants` row exists `{ proposedCallId, taskScope, agentScope, approvedToolId, approvedArgs, consumed:false }`; Proposed Call status `granted`; a `proposed_call_granted` event was emitted AND the dispatcher `enqueue`d the task for `ownerAgentId`. Non-approve → no grant, no event, status `held`. |
| AC4 | Session 2 is re-provisioned with the tailored grant so the agent does **the approved op + reversible work**; the agent's own tools execute the approved call; the real return is recorded as an Outcome. | **LIVE-PROOF per adapter-ready harness (builtin + Claude now; Codex/opencode when 7b/7c lands).** Provision session 2 grant-bearing with the approved `commit_file`; the agent re-attempts; HyperIdle permits the approved op (consumes the grant once); the agent's own `commit_file` runs, an `operation_outcomes` row records the genuine return (`status:ok`, `receipt`) and the **file exists on disk** — not a stub. **Re-deriving the call is permitted (no exact-match).** **Integration-tested against the real installed harness** (the actual `claude` SDK / installed CLI binary), not a fixture. |
| AC5 | A **different irreversible op** in session 2 (not the approved one) is routed to review (the grant scopes to the approved op + reversible). | **Per adapter-ready harness:** session 2 granted `commit_file`; the agent attempts a *second, different* irreversible tool → routed to review → re-captured as a new Proposed Call (a fresh human decision); no Outcome for it. (Proves the workflow: only the approved irreversible op proceeds without a new verdict.) |
| AC5b | **Arg-pin convenience (where arg-level scope exists):** on a harness with arg-level scope, the approved tool with *different args* MAY be pinned. | **Per harness that implements arg-pin** (builtin in-process check; Claude `canUseTool` `updatedInput`): the test states the convenience. On a name-scoped path the approved tool with drifted args is **permitted** (we trust the intent) — the test states the frontier rather than failing. **Not a guard; no deadlock.** |
| AC6 | At-most-once: the tailored grant is consumed once; a re-attempt after consumption does not double-execute. | Integration test: invoke the approved call **twice concurrently** (`Promise.all`); the **single-statement CAS** (`UPDATE tailored_grants SET consumed=true … WHERE … AND consumed=false RETURNING *`) means exactly one invoke claims it and executes; the other gets zero rows → routed to review; exactly **one** Outcome row. |
| AC7 | A non-approving verdict never executes the Proposed Call; it stays `held`. | Integration test: POST `request-changes` → no grant composed; provision a follow-up session → the call is routed to review (no grant); zero Outcomes. |
| AC8 | A Proposed Call the human never approves is never executed. | Integration test: capture, never verdict → no grant ever exists → routed to review; zero Outcomes. |
| AC9 | Descriptive artifacts (code diff, doc) do NOT capture or execute on approve. | Integration test: a review whose subject is a descriptive artifact (no irreversible call attempted) → approve composes no grant, writes no Outcome. (Capture only happens when an irreversible *call* is routed to review.) |
| AC10 | After execution, the result (ok/failure) returns to HyperIdle and is visible against the review. | Integration test: GET `/api/reviews/:reviewMessageId` after AC4 → response nests `proposedCall` + `outcome` (status, receipt or error). Failure path: a failing tool → `outcome.status:failed` + verbatim error, never silent. |
| AC10b | **The review surface renders the concrete approved args, not just the tool name (WARNING-2, ETHOS §3).** | Integration test: GET `/api/reviews/:reviewMessageId` for a `captured` Proposed Call → `proposedCall.args` equals the **verbatim captured args object** (deep-equal to what the agent called), not an `argsSummary` string and not just `toolId`. Component test: the `action_operation` review canvas renders those args as a readable key→value view (asserts the arg values appear in the rendered DOM), so the human's approve is grounded in the real call. *(Legibility for human judgment — not exact-match enforcement; no guard added.)* |
| AC11 | The agent **continues working** in session 2 after the approved call executes (work-continues loop; folded-in AL10). | **LIVE-PROOF per adapter-ready harness:** after the approved `commit_file` records the Outcome, session 2's stream produces ≥1 further agent action (closes the story / updates docs / proceeds) — the session does not end at the approved call. |
| AC11b | **Liveness net (not load-bearing):** if session 2 ends without the approved op executing, the work does not silently hang — re-provision once, then surface failed. | Integration test: provision session 2 whose harness does NOT reach the op (no-op harness fixture); `session_ended` with an unconsumed grant → exactly **one** bounded re-provision (`retry_count`→1); a second no-op end → Proposed Call `held` + `operation_outcomes` row `{status:failed, error:"approved op did not execute"}`. *(Liveness net only — triggers on crash/no-show, never on re-derivation/arg drift.)* |
| AC12 | HyperIdle executes nothing of its own — no kernel-executor dispatch exists; the live-proof tool runs because the **agent's own session** emitted it. | Static: `npm run check` + an ESLint/absence guard — `staged-operation-dispatcher.ts`, `stage-operation.ts`, `buildExecuteCapability`, `KERNEL_DISPATCHABLE_CAPABILITIES` deleted; no import resolves them. **Plus** the live-proof lanes (AC4): the `commit_file` handler runs only because the agent's harness emitted the call (builtin loop / MCP request) → `registry.invoke` — not a HyperIdle-initiated dispatch. HyperIdle classifies, routes-to-review, records — it does not author or re-run the tool. |
| AC13 | Verdict grammar unchanged. | Existing `threads.ts` verdict tests stay green (protected); no new verdict value. |
| AC14 | **Per-harness coverage is real, honest, and terminal.** | The live-proof lane (Task 11) runs AC1/AC4/AC5/AC11 **against the real installed harness** per harness whose adapter routes into the workflow: **builtin + Claude green now.** Codex (7c) + opencode (7b) are named net-new adapter tasks; their lane runs once that task lands; until then their terminal state is `net-new-adapter-pending` (NOT green, NOT silently skipped, NOT looped). |
| AC14b | **A `green-now` harness whose real binary/SDK is ABSENT makes the lane FAIL — absence is never a pass (WARNING-3).** | The Claude live-proof lane probes for the real `@anthropic-ai/claude-agent-sdk` / `claude` binary in the run environment (builtin needs no external binary — it is in-process). If a `green-now` harness's real binary/SDK is **not installed**, the lane **fails** (DONE not reached, exit non-zero) — it does **not** `skip` and does **not** fall back to a stub/mock. A `green-now` harness whose binary is absent is treated like a red lane, never like a pass. (Only `net-new-adapter-pending` / `skipped` are non-failing terminal states, and they are *declared*, not derived from a missing binary.) Verification: the lane's harness-availability probe asserts the real binary/SDK is present and throws (test failure) when it is not — proven by a unit test that stubs "binary absent" and asserts the lane raises rather than skips. *(MEMORY: live-proof lanes run before ship; no stub-as-proof.)* |

---

## Phase 3 — Design-it-twice (load-bearing decisions)

### D1 — The route-to-review workflow: native ask where it exists + HyperIdle's participation point elsewhere (NOT a containment fortress)

- **A (chosen): a route-to-review *workflow* carried by the harness's native permission where it's externally answerable (Claude `canUseTool`), and at HyperIdle's own brokered participation point (`registry.invoke`) where it isn't (Codex `exec`, opencode headless).** The workflow is identical on every harness: classify reversibility → reversible flows → irreversible is routed to review + captured → session 1 ends. *Trade-off:* the CLI harnesses must route their brokered call through HyperIdle's MCP server so HyperIdle can hang the route-to-review step (net-new MCP-URL wiring, Task 7b/7c). *Why:* it builds on what each harness natively provides (ETHOS-§4 / harness rules) and uses HyperIdle's existing participation point only as **plumbing for a missing headless ask channel** — not as a security floor and not as "the only path."
- **B (rejected): frame `registry.invoke` as the safety floor / the only path (the v4 fortress).** *Reject because:* ETHOS §4 forbids it — it designs against a rogue agent, leans on an unbuilt AN credential-containment guarantee, and models a native-tool bypass. We trust the agent; the checkpoint is a collaboration moment, not a wall.
- **C (rejected): rely solely on each harness's native ask.** *Reject because:* Codex `exec` and opencode headless have no externally-answerable ask — the route-to-review step would have nowhere to land. HyperIdle's participation point fills that gap as plumbing.

**Synthesis:** one workflow (route irreversible → review), carried by the most natural mechanism per harness. **Creds-present is correct; there is no fortress.** The agent could act with its own creds outside the checkpoint — we trust it not to, exactly as we trust an employee.

### D2 — Grant storage: a `tailored_grants` table vs. columns on `proposed_calls`

- **A (chosen): a separate `tailored_grants` table** `{ proposed_call_id PK/FK, task_scope, agent_scope, approved_tool_id, approved_args, arg_pinned (bool), consumed (bool), retry_count, minted_at, consumed_at }`. *Why:* the grant has its own lifecycle (composed at approve, consumed in session 2, re-minted on re-open) and the **atomic consume** is a single conditional UPDATE `WHERE consumed=false RETURNING *`. Scope is `(task, agent)` — session 2's id does not exist at compose time.
- **B (rejected): columns on `proposed_calls`.** Muddies the Proposed Call's immutability contract and complicates re-open.

### D3 — Identity hash: optional metadata for the arg-pin convenience, NOT a guard

The hash (SHA-256 over canonical JSON of `{tool_id, args}`) is **not a security boundary** — **nothing gates on it**. It is **optional metadata** consumed only where the arg-pin convenience is layered (builtin in-process check; Claude `canUseTool`). It gets a deterministic `canonicalJson` so the optional arg-pin is stable, but a hash mismatch **never blocks the approved work** (we trust the agent's re-derivation; the name-scoped allow permits the approved tool). **No deadlock — nothing depends on the hash.**

---

## Type signatures / schemas / endpoints

### `SessionConfig` extension (`packages/shared/src/harness/harness-adapter.ts`)
```ts
// add to SessionConfig:
readonly sessionWorkflow?: SessionWorkflow;
```
```ts
export interface SessionWorkflow {
  /** Reversibility classes routed to review at init (session 1: ["irreversible"]). */
  readonly routeToReview: readonly Reversibility[];
  readonly sessionRole: "open-work" | "grant-bearing";
  /** When grant-bearing, the approved op the agent works under (and may be arg-pinned where a harness expresses arg-level scope). */
  readonly approvedCall?: {
    readonly toolId: string;
    readonly args: Record<string, unknown>;   // recorded approved args (used by the optional arg-pin)
    readonly argPinned: boolean;               // true ⇒ pin to these exact args where arg-level scope exists (convenience)
    readonly identityHash?: string;            // optional metadata for the arg-pin; NOT a guard
  };
}
```
`ConversationMessage` is **not** widened (no message-seed path). The workflow is consumed at HyperIdle's router (`registry.invoke`); each adapter MAY *additionally* carry it via the harness's native ask where externally answerable (Claude).

### The workflow router (where HyperIdle participates in the agent's call) — inside `buildToolRegistry.invoke` (`tool-registry.ts`)

`ctx` gains: `sessionId`, `taskId`, `agentId` (present at `:577,575`), `sessionWorkflow?`, `db` (present). One change, all harnesses, because every brokered/MCP-routed call passes through this closure.
```ts
async function invoke(name, rawArgs): Promise<ToolResult> {
  // ... existing role/schema checks; parsed = def.inputSchema.safeParse(rawArgs) ...
  const reversibility = classifyReversibility(name, def);      // fail-closed (out of care): no signal ⇒ irreversible
  const wf = ctx.sessionWorkflow;

  if (wf?.sessionRole === "grant-bearing" && isApprovedOp(wf, name, parsed.data)) {
    // The approved op: CAS-consume the tailored grant once, then run the agent's own handler.
    const [claimed] = await ctx.db.update(tailoredGrants)
      .set({ consumed: true, consumedAt: nowIso() })
      .where(and(
        eq(tailoredGrants.taskScope, ctx.taskId),
        eq(tailoredGrants.agentScope, ctx.agentId),
        eq(tailoredGrants.approvedToolId, name),
        eq(tailoredGrants.consumed, false),                    // ← the conditional claim
      ))
      .returning();
    if (claimed) {
      try {
        const result = await def.handler(parsed.data, ctx);    // AGENT'S OWN tool runs it (its own creds). HyperIdle does not author/re-run it.
        await recordOutcome(ctx.db, claimed.proposedCallId, result);
        return result;
      } catch (e) {
        await recordOutcome(ctx.db, claimed.proposedCallId, errOutcome(e)); // status:failed
        return err("EXECUTION_FAILED", `Approved call ${name} threw: ${String(e)}`);
      }
    }
    // grant already consumed → fall through to route-to-review (no double-execute; surfaced as a fresh decision).
  }

  if (wf && reversibility === "irreversible") {                // route to review (session 1, or a non-approved op in session 2)
    const captured = await captureProposedCall(ctx.db, {
      originSessionId: ctx.sessionId, taskId: ctx.taskId, agentId: ctx.agentId,
      toolId: name, args: parsed.data, hash: identityHash(name, parsed.data),
      reviewMessageId, subjectThreadId,                        // derived server-side, never agent-authored
    }); // conditional insert ON CONFLICT (origin_session_id, identity_hash) DO NOTHING RETURNING *;
        // firstCapture = rows.length > 0. The UNIQUE constraint (not a plain index) is what dedups a duplicate Proposed Call.
    if (captured.firstCapture) await sessionRunRegistry.abort(ctx.sessionId); // session 1 ends (can't pause)
    return err("AWAITING_REVIEW", `Call to ${name} routed to human review.`);
  }
  return def.handler(parsed.data, ctx);                        // reversible → flow
}
```
`isApprovedOp(wf, name, args)` = `wf.approvedCall?.toolId === name` AND (`!wf.approvedCall.argPinned` OR `identityHash(name,args) === wf.approvedCall.identityHash`). **The arg-pin is the only place args narrow; un-pinned, the approved tool name suffices (we trust the re-derivation).**
*Session 1 ends on route-to-review:* `sessionRunRegistry.abort` → `stopSession` sets the builtin `aborted` flag (`:717`); for CLI/SDK it terminates the subprocess. (Sessions aren't pausable — this is why the loop is two-session, not a hold.)
*Crash window:* CAS-consume-then-execute means a crash between consume and the tool firing strands a `granted` Proposed Call with no Outcome — surfaced as needs-attention/failed, never silently lost.
*Capture-then-abort is not atomic — intended behavior (WARNING-5.1):* `abort` fires after the first capture, but the harness may emit a *second* irreversible call before the subprocess dies. The `(origin_session_id, identity_hash)` UNIQUE dedups an *identical* second call (no duplicate). A *different* second irreversible call in the dying session writes a **second Proposed Call → second review** — and that is **intended**: each distinct consequential call the agent attempted deserves its own human decision. We do **not** short-circuit further captures (no "session is ending, drop the rest"); that would silently discard a consequential call the agent meant to make. This is bookkeeping cleanliness, not a guard — we trust the agent; we simply surface every distinct irreversible call it attempted.
*Note:* `reviewMessageId`/`subjectThreadId` are **derived server-side**, never agent-authored (concept rejection #8).

### Per-harness native carrier (where externally answerable — NOT a separate "floor")

`composeWorkflowAllowDeny(wf, allTools)` (shared helper) returns `{ allow: string[], routeToReview: string[] }` for adapters that carry the workflow via their native permission.
- **session 1 (`open-work`):** `routeToReview` = all tools classified `irreversible`; `allow` = the rest.
- **session 2 (`grant-bearing`):** `routeToReview` = irreversible tools **except** `approvedCall.toolId`; `allow` = reversible + `approvedCall.toolId`.

**(a) builtin — HyperIdle owns the loop.** The `registry.invoke` router (above) carries the whole workflow; optional in-process arg-pin lives there.

**(b) Claude (Agent SDK) — native `canUseTool` carrier.** `queryOptions` gets `allowedTools`/`disallowedTools` from `composeWorkflowAllowDeny` + a `canUseTool` that returns `deny` (route to review) for an irreversible non-approved op, `allow` (with optional `updatedInput` arg-pin) for the approved op + reversible. SDK `PermissionResult` verified (code.claude.com/docs/en/agent-sdk/permissions, June 2026): `{behavior:"allow",updatedInput?,updatedPermissions?} | {behavior:"deny",message,interrupt?} | {behavior:"ask",...}`.
```ts
queryOptions.permissionMode = "default";
queryOptions.allowedTools = allow;     // native workflow carrier
queryOptions.disallowedTools = routeToReview;
queryOptions.canUseTool = async (toolName, input) =>
  isIrreversibleNonApproved(toolName, input)
    ? { behavior: "deny", message: "Routed to human review." }   // route-to-review via the native ask/deny
    : { behavior: "allow", updatedInput: maybePin(input) };       // approved/reversible flows (optional arg-pin convenience)
```

**(c) Codex — native ask not externally answerable in `exec`; workflow hangs at HyperIdle's participation point.** Codex exposes `--ask-for-approval` (untrusted/on-request) + `--sandbox`, but `codex exec` (non-interactive) has no documented external answer channel (developers.openai.com/codex/noninteractive, June 2026). So the route-to-review step is carried at HyperIdle's brokered participation point: the brokered `commit_file` routes through HyperIdle's MCP server → the bridge → `registry.invoke`, where HyperIdle routes it to review. **This is plumbing for a missing headless ask, not a security floor — no "only path", no credential-containment claim.** A coarse `--sandbox` may still be set as a sensible default. **The Codex adapter is net-new (Task 7c).**

**(d) opencode — headless `run` may auto-approve; workflow hangs at HyperIdle's participation point.** opencode `permission` (allow/ask/deny) lives in `opencode.json`/frontmatter (last-match-wins), but non-interactive `run` may auto-approve an ask (no terminal to project to; opencode.ai/docs/permissions, June 2026). So the route-to-review step is carried at HyperIdle's participation point (the brokered MCP call → `registry.invoke`); `opencode.json` `permission` is a bonus where it bites. **Net-new (Task 7b):** wire `{{mcpUrl}}` + `opencode run -f json`.

> The workflow is **one** change at `registry.invoke` (the router) + a native carrier per harness where externally answerable (Claude). The net-new async transports (Codex app-server JSON-RPC, opencode SSE) are NOT on the AL7 path — HyperIdle's existing participation point already carries the workflow for headless harnesses.

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
  readonly identityHash: string;      // optional metadata for the arg-pin convenience; NOT a guard
  readonly reversibility: Reversibility;
  readonly status: ProposedCallStatus;
}
```

### DB schema reshape (`packages/db/src/schema.ts`) — migration (drop+recreate)
`staged_operations` → `proposed_calls`:
- DROP: `capability_tool`, `capability_harness_type`, `operation`, `consequence_id`.
- ADD: `tool_id`, `args` (text JSON), `identity_hash`, `origin_session_id` (FK → sessions.id).
- KEEP: `id`, `review_message_id` (FK, index), `subject_thread_id` (FK, anchor index), `artifact_id` (FK), `reversibility`, `status` (`captured|granted|executed|failed|held`), `staged_by_agent_id`, `created_at`.
- INDEX: `(review_message_id, status)`.
- **UNIQUE** constraint: `(origin_session_id, identity_hash)` — capture idempotency. **Must be UNIQUE, not a plain INDEX:** a plain index does not prevent a duplicate Proposed Call; only the UNIQUE constraint enforces no-duplicate (the capture insert is `ON CONFLICT (origin_session_id, identity_hash) DO NOTHING RETURNING *`, so `firstCapture` is `rows.length > 0`). (WARNING-5.2.)
- REMOVE the `idempotency_key` UNIQUE (the `(origin_session_id, identity_hash)` UNIQUE + consume-once CAS replace it).

NEW `tailored_grants` *(scope = task id + agent id, NOT a not-yet-minted session-2 id)*:
```ts
export const tailoredGrants = pgTable("tailored_grants", {
  proposedCallId: text("proposed_call_id").primaryKey().references(() => proposedCalls.id, { onDelete: "restrict" }),
  taskScope: text("task_scope").notNull(),       // tasks.id
  agentScope: text("agent_scope").notNull(),     // agents.id — the same owner resuming
  approvedToolId: text("approved_tool_id").notNull(),
  approvedArgs: text("approved_args").notNull(), // JSON; recorded approved args (arg-pin uses these)
  argPinned: integer("arg_pinned", { mode: "boolean" }).notNull().default(false),
  identityHash: text("identity_hash"),           // optional, for the arg-pin convenience
  consumed: integer("consumed", { mode: "boolean" }).notNull().default(false),
  retryCount: integer("retry_count").notNull().default(0), // liveness net (AC11b), not a guard
  mintedAt: text("minted_at").notNull(),
  consumedAt: text("consumed_at"),
}, (t) => [index("grant_match_idx").on(t.taskScope, t.agentScope, t.approvedToolId, t.consumed)]);
```
The router resolves the grant by `(taskId, agentId, approvedToolId)` from `ctx`. `operation_outcomes` → kept, FK renamed `proposed_call_id` (PK, enforces 0..1 + immutability). *(Drop+recreate migration — pre-implementation, no production rows; state it in the migration file.)*

### Verdict path (`threads.ts`) *(explicit re-engage trigger)*
Replace `resolveStagedOperations(dispatchDeps, ...)` (lines ~1371-1381). On `approve`/`approve-with-comments` for a review message backing a `captured` Proposed Call, inside the verdict transaction:
1. `composeTailoredGrant(tx, { proposedCallId, taskScope: task.id, agentScope: task.ownerAgentId, approvedToolId, approvedArgs, argPinned, identityHash })` — insert the `tailored_grants` row (`consumed:false`, `retryCount:0`).
2. Transition the Proposed Call `captured → granted`.
3. After commit, emit **`proposed_call_granted`** `{ type:"proposed_call_granted", streamId: subjectThreadId, proposedCallId, taskId, agentId, timestamp }`.

The task-dispatcher gets a new subscription `handleProposedCallGranted` that `enqueue`s `{ taskId, agentId, teamId }` for the grant's owner — guarded by `hasActiveSession(db, taskId)`. Does **not** rely on `handleSessionEnded`'s owner-change guard (`:500-514`). Add `proposed_call_granted` to the `KernelEvent` union (`events.ts:414`). Remove the `dispatchDeps` thread-through.

*Non-approve branch:* `request-changes` / `edit` / `reject` on a `captured` Proposed Call transition it `captured → held`, compose no grant, emit no event.

### Reviews loader (`reviews.ts`) + subscribers
LEFT JOIN `proposed_calls` + `tailored_grants` + `operation_outcomes` by `review_message_id`; nest `{ proposedCall: { toolId, args, status }, outcome?: { status, receipt|error, executedAt } }` on the matching `action_operation` artifact.

**WARNING-2 — the review surface renders the *concrete approved args*, not just the tool name (User Sovereignty, ETHOS §3 — NOT the rejected hash-fortress).** The loader returns the captured `args` object **verbatim** (the same immutable `{toolId, args}` the router captured), so the human approves *what they actually see*. The previous `argsSummary` (a vague one-line gist) is **dropped** — a summary alone makes "approved X, agent did materially-different Y" invisible to the human, since session-2 re-derivation can legitimately differ. The canvas renders the args as a readable key→value tree (the existing `action_operation` arg renderer). This is **not** exact-match enforcement and adds **no** guard: it shows the human the real call so gross divergence is visible to *human judgment*; the optional arg-pin (AC5b) is where exactness is enforced on harnesses that support it, and the review-legibility covers the rest. Both are "the human sees what they signed," neither is a cage.

**`operation_executed` → `proposed_call_executed` rename touches 3 known subscribers:**
- `packages/server/src/services/observability/dispatcher.ts:494` — span mapping → rename.
- `packages/web/src/pages/review/review-composition.ts` — `StagedOperationView`→`ProposedCallView`.
- `packages/web/src/pages/review/ReviewComposition.tsx:672-679` — `artifact.stagedOperation?.{status,outcome}`→`artifact.proposedCall?.{status,outcome}`.

---

## Per-harness implementation surface (the router, the capture, the native carrier, the live proof)

| Harness | Workflow router (HyperIdle's participation) | Capture (route-to-review + record) | Native carrier (where externally answerable) | Live-proof lane | Terminal state |
|---|---|---|---|---|---|
| **builtin** | `registry.invoke` is the router; reads `ctx.sessionWorkflow` | route-to-review + record at `registry.invoke` (`:741`) | n/a — HyperIdle owns the loop (optional in-process arg-pin) | full AC1/4/5/11 in-process; `commit_file` writes a real file | **green now** |
| **Claude (Agent SDK)** | brokered MCP-routed `commit_file` → `registry.invoke` (`:132`) | route-to-review + record; Claude `canUseTool` `deny` is the native carrier | `canUseTool` (allow/ask/deny, `updatedInput`) + `allowedTools`/`disallowedTools` | full sequence via the agent's MCP-routed `commit_file`, against the real SDK | **green now** |
| **Codex** | brokered MCP-routed `commit_file` → `registry.invoke` (carries the workflow; native `exec` ask not externally answerable) | route-to-review + record at `registry.invoke` | `--ask-for-approval`/`--sandbox` (not externally answerable headless → workflow hangs at the router) | runs once Task 7c lands; tested against installed `codex` | **net-new-adapter-pending (Task 7c)** |
| **opencode** | brokered MCP-routed `commit_file` → `registry.invoke` | route-to-review + record at `registry.invoke` | `opencode.json` `permission` (bonus; headless `run` may auto-approve → workflow hangs at the router) | runs once Task 7b lands; tested against installed `opencode` | **net-new-adapter-pending (Task 7b)** |

**cursor-agent — skipped** (`unavailable`, `harness-capability-descriptors.ts:11`). The router is one `registry.invoke` change identical on all harnesses; the native carrier is added where the harness exposes an externally-answerable ask (Claude). **No "floor", no "only path" — collaboration plumbing.**

---

## Ordered task list

1. **Discard the kernel-executor model.** Delete `tools/stage-operation.ts` (+ registry registration), `services/staged-operation-dispatcher.ts`, `shared/src/staged-operation.ts`; remove `threads.ts` dispatch wiring + `dispatchDeps`; remove `app.ts` boot sweep + `buildExecuteCapability`; delete the AL7-* tests for these. *(Proves AC12.)*
2. **Schema migration (drop+recreate).** Drop+recreate `staged_operations` → `proposed_calls`; add `tailored_grants`; recreate `operation_outcomes` with `proposed_call_id` PK/FK. `npm run db:generate` + migrate. *(red: schema test.)*
3. **Shared types.** `packages/shared/src/proposed-call.ts`; `SessionWorkflow` (with `approvedCall` + `argPinned`); extend `SessionConfig.sessionWorkflow`; add `ProposedCallGrantedEvent` to `KernelEvent`. **No `ConversationMessage` widening, no message-seed.** *(red: AC1 shape.)*
4. **Classifier + composer + identity hash + live-proof tool.** `classifyReversibility(toolId, def)` (fail-closed `irreversible`); `composeWorkflowAllowDeny(wf, allTools)` → `{allow, routeToReview}`; `identityHash`/`canonicalJson` (for the optional arg-pin only). **Wire the `commit_file` MCP-exposed live-proof tool** (`reversibility:"irreversible"`) into `ALL_TOOL_DEFINITIONS` *before* Tasks 5-11 (topological order). *(red: classifier no-hint→irreversible; composer session-1 vs session-2 output; hash determinism for arg-pin.)*
5. **The workflow router + record/consume.** Extend `ToolContext` with `sessionWorkflow`; implement `isApprovedOp` + single-statement CAS-consume → handler (try/catch → Outcome) / idempotent capture / `sessionRunRegistry.abort` on first capture, **inside `buildToolRegistry.invoke`**. *(red: AC1 incl. abort+idempotent, AC2, AC5, AC6 concurrent-CAS, AC5b arg-pin convenience.)*
6. **Thread workflow through provisioning.** `provisionSession`/`runSession` build the registry with `sessionWorkflow`; session 1 = `open-work`, session 2 = `grant-bearing` with `approvedCall`. *(red: AC1/AC4 via provisioning, builtin.)*
7. **Per-adapter native carrier + CLI MCP routing (where applicable).**
   - **(a) Claude SDK** *(green-now harness):* set `allowedTools`/`disallowedTools` + the `canUseTool` route-to-review/allow callback in `queryOptions` (`:154-162`); assert the brokered MCP `commit_file` routes into the workflow. *(red: AC1/AC2/AC5 on Claude.)*
   - **(b) opencode adapter — NET-NEW.** Wire `{{mcpUrl}}` into the opencode `CLI_TOOL_CONFIGS` args/config (`:344-352`) + switch to `opencode run -f json` (`eventFormat:"ndjson"`) so the brokered `commit_file` routes into the workflow at `registry.invoke`; add `opencode.json` `permission` as a bonus carrier. **Integration-test against the installed `opencode` binary**, not a stub. Terminal state: `net-new-adapter-pending` until this lands. *(red: AC1/AC4/AC5 on opencode.)*
   - **(c) Codex adapter — NET-NEW.** Add a `codex` entry to `CLI_TOOL_CONFIGS` (none today) with `{{mcpUrl}}` wired so the brokered `commit_file` routes into the workflow at `registry.invoke`; set a sensible `--sandbox` default. No app-server JSON-RPC. **Integration-test against the installed `codex` binary.** Terminal state: `net-new-adapter-pending` until this lands. *(red: AC1/AC4/AC5 on Codex.)*
8. **Verdict → tailored grant + trigger.** `threads.ts`: approve composes the grant + transitions `captured→granted` + emits `proposed_call_granted`; non-approve → `held`. *(red: AC3 incl. event+enqueue, AC7, AC8.)*
9. **Re-engage.** Task-dispatcher `handleProposedCallGranted` `enqueue`s session 2 (guarded by `hasActiveSession`). *(red: AC3 enqueue.)*
9.5. **Liveness net (not a guard).** A distinct `session_ended` subscription `handleUnconsumedGrantOnSessionEnd` (NOT inside `handleSessionEnded`): on `session_ended` with an unconsumed grant for the ended session's task, `retryCount===0` → re-provision once (`retryCount`→1, guarded by `hasActiveSession`); `retryCount>=1` → Proposed Call `held` + `failed` Outcome. *(red: AC11b — never a silent hang; assert no double-enqueue vs. `handleSessionEnded`.)* Non-load-bearing — triggers only on crash/no-show, never on re-derivation/arg drift.
10. **Reviews loader + subscribers.** Nest `proposedCall` (with the **verbatim captured `args` object**, not an `argsSummary`) + `outcome` (`reviews.ts`); render the args as a readable key→value view on the `action_operation` canvas so the human approves the concrete call (WARNING-2); rename `operation_executed` → `proposed_call_executed` + update the 3 subscribers. **The `ReviewComposition.tsx` field rename + the new concrete-args render change the DOM — re-bless the DOM-snapshot net (`npm run ds:bless`, after reading the diff) in this WP (NIT-2; per `.claude/rules/visual-regression.md`).** *(red: AC10 incl. failure path + AC10b concrete-args.)*
11. **LIVE-PROOF lanes — per the DONE matrix, against the real installed harness.** End-to-end through `commit_file` (agent's own session, MCP-routed): agent attempts the irreversible call → HyperIdle routes it to review + captures → session 1 ends → approve → `proposed_call_granted` → re-engage → session 2 re-provisioned with the tailored grant → agent re-attempts → HyperIdle permits the approved op (consume) → real file written → Outcome → agent continues (AC11) → a *different* irreversible op is routed to review again (AC5). **builtin + Claude lanes must be green now** (against the real SDK/loop), no fixture/stub. **If a `green-now` harness's real binary/SDK is absent, the lane FAILS — never skips, never stubs** (AC14b; builtin is in-process so always present, the Claude lane probes the real installed SDK/binary and fails loudly without it). **Codex (7c) + opencode (7b) lanes run once their adapter task lands**, tested against the installed binary; until then `net-new-adapter-pending` — NOT green, NOT silently skipped, NOT looped. *(Hard Rule 10; AC14/AC14b.)*

---

## Security & abuse cases (trust-first framing — NOT a fortress audit)

> **Frame (ETHOS §4):** AL7 does **not** design against a rogue agent. We trust the agent with its own creds and tools. The items below are about HyperIdle's own bookkeeping integrity (don't double-execute, don't lose an Outcome, don't let a *non-agent* forge a grant) — **not** about caging the agent. There is **no** "only path" claim, **no** AN credential-containment dependency, and **no** native-tool-bypass residual to confess, because we are not building a containment fortress.

- **The route-to-review workflow is a collaboration checkpoint, not a security floor.** Reversible flows; irreversible is routed to a human. Carried by the harness's native ask where externally answerable (Claude), else at HyperIdle's own participation point (plumbing). **The agent could act with its own creds outside the checkpoint — we trust it not to, exactly as we trust an employee.** Not a vuln to close.
- **HyperIdle executes nothing of its own.** No capability map, no tool re-implementation; HyperIdle classifies, routes-to-review, and records; the agent's own harness emits the call and the tool's own handler runs it (its own creds). **Addressed (AC12).**
- **Agent-authored field trust boundary (capture integrity).** `tool_id` + `args` captured from the agent's *actual call*, never an agent-authored spec; `review_message_id`/`subject_thread_id` **derived** server-side. This is data-integrity hygiene (the human reviews the real call), not distrust of the agent's intent. **Addressed.**
- **Grant forgery / replay (non-agent integrity).** The grant is composed only by the server verdict path on `approve`; the router consumes it via a **single-statement atomic CAS** (no pre-read). A *forged* request can't mint a grant or re-use a consumed one. **Addressed (AC6).** *(This guards HyperIdle's own bookkeeping, not against the trusted agent.)*
- **A different irreversible op in session 2 is routed to review again.** The grant scopes to the approved op + reversible; a different irreversible op surfaces as a **fresh human decision** (re-captured), not a blocked attack. **Addressed (AC5).**
- **Arg drift on the approved tool (the convenience frontier).** Where arg-level scope exists (builtin in-process; Claude `canUseTool` `updatedInput`), the arg-pin MAY narrow (AC5b). Where the allow scopes by name only, the same approved tool with different args is **permitted — we trust the intent.** **Not a hole; a design fact.**
- **Classifier fail-closed (out of care).** `classifyReversibility` defaults a no-signal tool to **`irreversible`** — routed to review so a consequential-looking call reaches the human. Care, not suspicion. **Addressed (AC1 no-hint test).**
- **Capture-loop / duplicate Proposed Calls.** Session 1 ends on first route-to-review (`sessionRunRegistry.abort`); capture idempotent on `(origin_session_id, identity_hash)`. **Addressed (AC1).**
- **Cross-session grant leakage.** `(taskScope, agentScope)` binds the grant to the unique re-provision. **Addressed.**
- **Secret handling / SSRF / path traversal.** No new credential, outbound URL, or path owned by HyperIdle; the agent's own call runs with its own creds (correct — ETHOS §4). **N/A.**

---

## Risks / ambiguities

- **R1 — re-engage trigger. RESOLVED (Task 8+9).** Explicit `proposed_call_granted` event + dedicated `handleProposedCallGranted` subscription; not the owner-change `handleSessionEnded` path (`:500-514`).
- **R2 — grant scope. RESOLVED (Task 2+8).** Session 2's id doesn't exist at compose time → scope `(taskScope, agentScope)`; schema, compose, and router lookup all key on `(taskScope, agentScope, approvedToolId)`.
- **R3 — the route-to-review workflow (was the "floor"). RESOLVED + SIMPLIFIED (Task 5+7+11).** It is a **collaboration workflow** carried by the harness's native ask where externally answerable (Claude), else at HyperIdle's own participation point (`registry.invoke`) as plumbing. **NOT a containment fortress, NOT "the only path", NO credential-containment dependency.** Re-attempting the approved op is fine (no exact-match, no deadlock).
- **R4 — descriptive vs operative (AC9).** Capture is triggered by an *attempted irreversible call*, not by artifact kind.
- **R5 — live-proof tool + per-harness coverage. RESOLVED (Task 4+7+11; DONE matrix).** `commit_file` (MCP-exposed, `irreversible`) wired in Task 4. **builtin + Claude live-proof green now.** Codex (7c) + opencode (7b) are named net-new adapter tasks; live-proven once built, tested against the installed binary.
- **R6 — Codex/opencode headless ask. RESOLVED (D1, Task 7b/7c).** Codex `exec` and opencode headless have no externally-answerable native ask, so the route-to-review step is carried at HyperIdle's own participation point — **plumbing for a missing channel, not a floor.** No app-server/SSE transports required.
- **R7 — liveness-net subscription placement. RESOLVED.** `handleUnconsumedGrantOnSessionEnd` is a **separate `session_ended` subscription** (not inside `handleSessionEnded`), sharing the `hasActiveSession` guard — no double-dispatch.
- **R8 — opencode native permission docs uncertainty. FLAGGED, NOT load-bearing.** Headless `run` may auto-approve; because the route-to-review workflow is carried at HyperIdle's participation point regardless, this does not affect AL7's correctness. ⚠️ UNVERIFIED inline-JSON env permission var; verify against the installed binary in Task 7b — if `run` auto-approves, simply omit the bonus opencode carrier (the workflow still routes at HyperIdle's participation point).
- **R9 — ~~AN credential-containment dependency + native-tool bypass~~. DELETED (ETHOS §4).** AL7 does **not** assume "no live-op credential in the sandbox", does **not** model a native-tool bypass, and has **no** Track-AN forward dependency. Creds are present and that is correct. The agent could act with its own creds outside the checkpoint — we trust it not to. **Removed entirely as paranoia.**

---

## protectedTests
- `packages/server/src/routes/__tests__/*threads*verdict*` — verdict grammar + first-verdict-wins must not change (AC13).
- existing review-composition / reviews-loader tests for non-staged-op fields.

## sharedFiles
- `packages/db/src/schema.ts` (migration — drop+recreate)
- `packages/shared/src/harness/harness-adapter.ts` (`SessionConfig.sessionWorkflow` + `SessionWorkflow`; `ConversationMessage` NOT widened)
- `packages/shared/src/events.ts` (`ProposedCallGrantedEvent`, rename `operation_executed`)
- `packages/shared/src/index.ts` (export `proposed-call.ts`, drop `staged-operation.ts`)
- `packages/server/src/tools/tool-registry.ts` (**the workflow router** + record/consume + `commit_file` + `classifyReversibility` + `composeWorkflowAllowDeny`)
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` (native carrier: `canUseTool` route-to-review/allow + `allowedTools`/`disallowedTools`)
- `packages/server/src/harness/adapter-pool.ts` + `cli-harness-adapter.ts` (**Task 7b** opencode `{{mcpUrl}}` + `-f json` MCP routing + `opencode.json` permission bonus; **Task 7c** net-new `codex` registration + `{{mcpUrl}}` routing + `--sandbox` default)
- `packages/server/src/harness/builtin-harness-adapter.ts` (the router honored via `registry.invoke`; abort at `:717`)
- `packages/server/src/services/session-provisioning.ts` (workflow threading to the registry/router + session-2 `approvedCall` payload)
- `packages/fabric/src/services/task-dispatcher.ts` (`handleProposedCallGranted` + `handleUnconsumedGrantOnSessionEnd`)
- `packages/server/src/routes/threads.ts` (verdict → tailored grant + `proposed_call_granted`)
- `packages/server/src/routes/reviews.ts` (loader)
- `packages/server/src/services/observability/dispatcher.ts` + `packages/web/src/pages/review/{review-composition.ts,ReviewComposition.tsx}` (event-rename subscribers)
- `packages/server/src/app.ts` (remove dispatch wiring)

## Migrations (symbol renames/removals — every call site)
- `StagedOperationSpec` → **delete**; callers: dispatcher (deleted), `reviews.ts` view shape (→`ProposedCallView`).
- `staged_operations` table → **reshape** `proposed_calls`; types `StagedOperation`/`NewStagedOperation` → `ProposedCall`/`NewProposedCall`.
- `tailored_policies` / `one_shot_grants` (prior plans' tables) → **never built**; the grant table is `tailored_grants`.
- `resolveStagedOperations`/`sweepStrandedOperations`/`buildExecuteCapability`/`KERNEL_DISPATCHABLE_CAPABILITIES`/`isKernelDispatchableCapability` → **delete**; callers: `threads.ts`, `app.ts`, AL7 tests.
- `operation_executed` event → **rename** `proposed_call_executed`; 3 subscribers (enumerated above).
- NEW `proposed_call_granted` event → add to `KernelEvent` (`events.ts:414`); subscriber: `handleProposedCallGranted`.
- `SessionConfig.sessionWorkflow` + `SessionWorkflow.approvedCall` added; `ConversationMessage` unchanged. NEW: `composeWorkflowAllowDeny` consumed by the Claude adapter; **net-new `codex` registration in `CLI_TOOL_CONFIGS`** + `{{mcpUrl}}` wiring for both CLI harnesses.
