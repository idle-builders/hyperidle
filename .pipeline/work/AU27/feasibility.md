# AU27 — Feasibility (rev 3, trimmed to the SCOPE LOCK)

**What this file is for.** AU27's core risk is not what it builds — it is what it *removes*. The assistant's
answer is scraped from the harness `completion` event (`provisioner.ts:1487-1492`) and posted by dispatch; after
AU27 the agent must **call a tool**. If it doesn't, the user gets nothing. Everything below was read on
`origin/main@75d85687` in this worktree.

**Rev 3 trim.** Cut with the work they supported: Q5 (pre-handoff admission-failure UX — struck by the founder),
Q8 (the `callingTeamId` bake — cut under bias-to-deletion), Q10 (the `tasks.threadId` migration — no schema
change; its one surviving finding is folded into Q8′ below), and Q11's option analysis (the founder settled it:
accept the loss). Q9 gained the `openai-compatible` hole (C11). Nothing new was investigated.

---

## Q1. Does a cross-harness FORCING mechanism already exist? — **YES.**

The existing return-enforcement machinery is exactly this: shipped, cross-harness, eval-covered.

**Closed return set** — `packages/shared/src/harness/return-actions.ts:23`:
`RETURN_ACTION_NAMES = ["submit_review", "handoff_to", "send_message"]`. `isReturnAction` (`:72`) normalises MCP
namespacing (`mcp__hyperidle__x`, `hyperidle_x`) via `stripMcpNamespace` (`:50-56`), so builtin (bare names) and
every CLI harness behave identically.

**The gate** — `return-enforcement.ts:42-60`: `createGate()` flips `returned` on any observed `tool_call` naming a
return action; `evaluate(gate, endReason)` returns `not_returned` only for `endReason === "completed"`.

**The forcing, per channel** — `ReturnEnforcementChannel` (`shared/src/harness/harness-adapter.ts:214-221`) is a
**non-optional** adapter capability, so `npm run check` fails any adapter that doesn't declare one:

| Harness | Channel | Force site |
|---|---|---|
| builtin | `builtin-loop` | `builtin-harness-adapter.ts:579-599` (chat loop) **and `:751-763` (execute loop)** |
| claude-code | `settings-claude` | `mcp/mcp-route.ts:140-150` → hook writes stderr + exit 2 |
| codex | `settings-codex` | same route → `{"decision":"block","reason":body}` |
| opencode | `process-reengage` | `cli-harness-adapter.ts:765-810` → respawn `opencode run <forceMsg> …` |

Budget `AL6_MAX_FORCE_RETURNS = 2` (`return-actions.ts:120`); eval coverage `eval/src/scenarios/force-return.ts`.

⇒ AU27 does not invent enforcement. It enrols `reply` into machinery that already exists — the founder's explicit
bar (*"adjust the AL6 hook"*, not shadow it).

---

## Q2. Is the assistant turn in that gate today? — **NO. Exempt in three places, all of which dissolve.**

1. `provisioner.ts:1376-1380` — `exempt = isConversational || isInternalExtractionDrain(…)`, written into the
   registry (`:1381-1385`); every force site short-circuits on `entry.exempt`.
2. `provisioner.ts:1578` — `returnEndReason = aborted || isConversational ? "stopped" : "completed"`, and
   `evaluate` (`return-enforcement.ts:59`) can only return `not_returned` for `"completed"`.
3. `builtin-harness-adapter.ts:573-582` — `hasReturnActionInRegistry` is false because the conversational registry
   is `[return_status, create_bet, edit_bet]` (`provisioner.ts:1146-1154`).

All three dissolve once `isConversational` is deleted and `reply` is in the assistant's registry.

---

## Q3. Is "add `reply` to `RETURN_ACTION_NAMES`" sufficient? — **NO, for two reasons.**

### Q3a — set membership does not bind the agent to the *right* action

After de-specialization the assistant runs the ordinary registry
(`buildToolRegistry(ctx, { role: agentRole, extraTools: [returnStatusTool] })`, `provisioner.ts:1155-1161`). Only
three tools in `buildToolDefinitions` carry a `roles` filter (`:1552-1572`); `toolsForRole`
(`shared/src/tool.ts:386-391`) returns every `roles === undefined` tool to every role. ⇒ `send_message`,
`handoff_to`, `submit_review` are all in the assistant's registry, and `AL6_FORCE_RETURN_MESSAGE`
(`return-actions.ts:106-109`) is a **static string naming exactly those three**. Plain membership would let the
agent satisfy the gate without answering, while the forcing message actively points it away from `reply`.

Symmetrically: adding `reply` to the set makes it satisfy the gate for **every** session, so a `task_run` agent
could end with `reply("done")` instead of `submit_review`. A lone `requiredReturnAction?: string` cannot express
*"the trio, but not `reply`"*. ⇒ the requirement must be a **set**: `requiredReturnActions?: readonly string[]`.

### Q3b — the blast radius is **6 sites**

Every production caller of `shouldForceReturn` / `createGate` / `createReturnGate`:

| # | Site | Channel |
|---|---|---|
| 1 | `builtin-harness-adapter.ts:581` (`runChatTurn`) | builtin, chat |
| 2 | `builtin-harness-adapter.ts:751` (`runExecuteTurn`) + static emit `:762` | builtin, **planning/execute** |
| 3 | `mcp/mcp-route.ts:140` | HTTP adjudication, serving **both** the claude and codex file hooks |
| 4 | `cli-harness-adapter.ts:773` + static message `:810` | opencode `process-reengage` |
| 5 | `return-status-tool.ts:72` | the `return_status` **MCP tool** — the agent's own self-check |
| 6 | `run-orchestration-composition.ts:125` `createReturnGate: () => enforcement.createGate()` vs. the port type `provisioner.ts:210` | composition binding — a hard **compile** dependency |

Miss 2 or 5 and an assistant that ends via `runExecuteTurn`, or self-checks with `return_status`, gets the old
trio-naming message and a membership-only check — the exact hole this question exists to close, reintroduced
through the back door.

Two asymmetries to resolve while in there: site 1 is gated by `hasReturnActionInRegistry` and site 2 is **not**;
and both builtin sites construct a *synthetic* gate literal `{ returned: session.returnSeen }` rather than the
registry's live gate, so a predicate held in the `createGate` closure does **not** reach them —
`session.returnSeen` must be made to honour the requirement in both loops.

**Gate shape is unchanged.** `EnforcementEntry.gate` stays `{ returned: boolean }`
(`enforcement-registry.ts:24-26`); the requirement rides as a sibling field plus the closure. No consumer type
breaks. This is an **adjustment in place**, not a shadow mechanism.

---

## Q4. What happens on a completion with no `reply` call? — **The net exists; it has no product subscriber.**

`provisioner.ts:1581-1598` already emits, on `returnVerdict === "not_returned"`:
`{ type: "session_not_returned", streamId, sessionId, agentId, taskId, requestId, sourceKind, sourceId,
sourceCorrelation, timestamp }` (`SessionNotReturnedEvent`, `shared/src/events.ts:220-232`). Its **only**
subscriber is `core-api/observability/src/dispatcher.ts:461` (logging).

⇒ The safety net is a **new core-api `conversation` subscriber on an existing event**. With the pre-handoff AC
struck, this is the only "never silent" guarantee left in the WP.

**Scoping gap.** `sourceCorrelation` for a `task_run` is `{ taskId, teamId }` (`session-request.ts:53-57`) — no
thread. The emitter has `params.callingThreadId` in hand at `:1583` ⇒ add it as an optional field on the event.
No read, no new mechanism. Absent → the subscriber no-ops.

---

## Q5. Does the transcript still reach the model? — **NOT automatically. Do not delete the branch blindly.**

Two independent paths, both gated on `params.conversational`:
- `provisioner.ts:1188-1204` — `composeAssistantPrompt(persona)` + a `## Conversation` transcript section into
  `assembledPrompt` (→ AGENTS.md / CLAUDE.md, i.e. every harness).
- `provisioner.ts:1196` + `:1416` — `conversationalMessages` → `SessionConfig.messages`, which is what makes the
  builtin adapter take `runChatTurn` over `runPlanningTurn` (`builtin-harness-adapter.ts:397`).

Deleting the branch without a replacement **silently deletes the assistant's input**, undoing AU21 H2.
`SessionConfig.messages` / `ConversationMessage` (`harness-adapter.ts:62-65,112-122`) are legitimately generic and
**STAY** — K2 lists the baked transcript input under "STAYS".

---

## Q6. Iteration budget in `runChatTurn` — **a tuning risk, not a blocker.**

`MAX_TOOL_ITERATIONS = 3` (`builtin-harness-adapter.ts:479`). At the cap the loop falls to the force check, which
once non-exempt re-injects and resets `toolIterations = Math.min(toolIterations, MAX_TOOL_ITERATIONS - 1)`
(`:597`) — up to 2 forces ⇒ ≈5 effective rounds. Observe on the real-harness lane; if the assistant truncates,
raise the constant, never weaken the gate.

---

## Q7. Does the calling thread exist when `reply` needs it? — **YES, via lookup. No schema work.**

Threads resolve by `(hostKind, hostId)`, not by an FK column: `findThread(db, { host: { kind, id } })`
(`conversation-store.ts:222-228`) and `insertThread` (`:125`), both exported from `@hyperidle/conversation`. This
is the same shape `resolveOrCreateHostThread` (`web/src/services/host-threads.ts:36-76`) already uses.

`tasks.threadId` (`schema.ts:201`) is a **denormalized cache**, not the source of truth — the anomaly among the 8
hosts, not the norm. Its only writer is `review/src/session-review-creator.ts:83`, gated on
`riskTier ∈ {medium, high}` (`:64-65`) and only at session end, so it is null for most tasks. That is irrelevant
once the emit-time resolver does a resolve-or-create by `(hostKind, hostId)`: a **core-side write at bake time**,
so orchestration still reads nothing and AU21 AC #2 is unaffected. No migration, no backfill, no `NOT NULL` —
`tasks.threadId` is untouched.

Knowledge items likewise have working conversations today with no such column, so `knowledge_item` **passes** the
same test. All 8 hosts stay lazy; lazy resolve-or-create is the architecture, not a gap.

---

## Q8. Can the assistant still call `create_bet` after the draft registry is retired? — **NO. Accepted loss.**

`create_bet` requires a `teams.id` (`tool-definitions.ts:1104`, validated at `:1124`). The draft registry hides
that by injecting `resolvedTeamId` (`:1682-1695`) from a **two-hop** lookup (`:1591-1602`), needed because
**`users.teamId` references `teamMembers.id`** (`db/src/schema.ts:58`), not `teams.id`. The assistant has no other
source: its `sourceCorrelation` is `{threadId, messageId, userId, assistantAgentId}`
(`shared/src/session-request.ts:60-71`); `ToolContext.teamId` is `agentConfig.teamId` = the `team_members.id`
(`provisioner.ts:836`); `assembleTaskFreePrompt` (`:443-459`) renders nothing else usable; and no tool in
`buildToolDefinitions` returns the caller's team.

A `callingTeamId` bake would fix it, but it **adds surface** (a `ToolContext` field, an injected `getTeamMembers`
dep, an optional schema arg) — cut under the SCOPE LOCK's bias-to-deletion. ⇒ assistant bet-drafting stops
working. Pre-users, no one to regress; re-providing it is a later WP.

**Latent defect discovered, recorded not fixed:** `ctx.teamId` is already consumed as if it were a `teams.id` at
`tool-definitions.ts:239` (item scope, `??`-fused with a genuine `task.teamId`) and `:426`
(`resolveReviewRecipientsForItem`) — two id spaces in one variable. AU27 must **not** repurpose `ctx.teamId`.

---

## Q9. Does the per-agent model override survive the switch to the durable path? — **NO, and the fix has a trap.**

- `assistant-turn-resolver.ts:200-201` bakes `modelId`/`modelProvider`; `dispatch` consumes them via
  `loadBakedModelOverride` (`service.ts:288-300`) → `resolveAgentModel` (`:216-221`).
- AU21's own `@lore` (`dispatch/src/service.ts:173-180`) calls losing them *"a real regression
  (`users.modelId`/`modelProvider` are real, founder-configurable columns with a real Settings UI), not an
  acceptable trade-off."*
- The durable path is **tier-only**: `makeResolveModel` (`server-factory.ts:723-735`) calls
  `resolveModel({ kind: "tier", tier }, …)` — and `bakeAgentRunnableConfig`
  (`shared/src/agent-work-intent-recorder.ts:222-234`) bakes `modelProvider` but **not** `modelId`.

⇒ The switchover re-breaks exactly what AU21 fixed. Fix: add `modelId` to `BakedAgentRunnableConfig` (one field,
one line in the whitelist mapper — uniform for all six kinds) and issue `resolveModel({kind:"agent", …})`, whose
shape already exists (`shared/src/model-gateway.ts:327-348`).

### ⚠️ C11 — the trap: `{kind:"agent"}` throws on a user-selectable provider

`resolveModel({kind:"agent"})` sets `agentPath: true` (`model-gateway.ts:341`), and `resolveProvider`'s
`case "openai-compatible"` **throws `UnsupportedAgentProviderError`** when `agentPath` is set (`:261-263`).
`openai-compatible` is real and **user-selectable**: it is in `MODEL_PROVIDERS` (`:24`) and Settings → Agents
PATCHes `modelProvider` straight from the editor draft (`web/src/settings/SettingsAgents.tsx:243,257`).

Today the throw is contained — `resolveTurnModelInternal` rethrows and `runTurnInternal`'s outer catch
(`dispatch/src/service.ts:419-421`) turns it into a thread notice. After the switchover there is no such catch:
it lands at `start-runtime.ts:127`, **outside** `runClaimedRequest`, feeding the unbounded re-claim loop plan.md
accepts as out-of-scope — and now for **`task_run`** too, since the bake is uniform.

**Fix (two lines, zero new surface):** request `{kind:"agent"}` only when
`modelProvider !== "openai-compatible"`; otherwise `{kind:"tier"}`. Such an agent runs on its tier — strictly
better than today, where the same configuration errors the turn out entirely.
**Rejected:** *don't bake `modelId` at all* — that drops the override for anthropic and openrouter as well, i.e.
re-breaks the exact regression AU21 called unacceptable, trading a two-line guard for the whole reason this
preservation survives the scope cut.

**Two more model-resolution deltas:**
- **`resolvedFastModel` is lost.** Resolved for assistant turns today (`dispatch/src/service.ts:204-210,222-229`);
  `start-runtime.ts:128-135` passes none. Consumer: `builtin-harness-adapter.ts`'s
  `config.resolvedFastModel ?? config.resolvedModel`. Every assistant summarization would silently move to the
  workhorse model. One line to wire, for all kinds.
- **Gateway config improves.** dispatch used the static `BUILT_IN_GATEWAY_CONFIG` (`service.ts:207,219,225`); the
  durable path uses `readServerConfig(db).modelGateway` (`server-factory.ts:728-732`), so a founder's custom
  gateway settings start applying to assistant turns — closing the deferral dispatch's own `@lore` records at
  `service.ts:186-191`.

---

## Q10. What happens to `payload.toolCalls` and the assistant's tool-call UI? — **It dies. Settled: accept the loss.**

Sole writer: `dispatch/src/service.ts:377-386`. Two shipped consumers, both in
`packages/web/src/shell/AssistantOverlay.tsx:167-186` (`renderToolCallSummaries`): AD8b tool-call summary rows and
AK4 bet-draft cards. After AU27 the branch is unreachable; component tests over fixture payloads stay green, which
is why `npm run verify` will not catch it.

Founder ruling: **delete the dead branches, preserve nothing, propose no replacement.** Pre-users, no one to
regress. This also makes `CompletionEvent.toolCalls` (`harness-events.ts:38`) and its population
(`builtin-harness-adapter.ts:607`) genuinely dead — deleted with it. Note the capture was **builtin-only** anyway:
no CLI harness ever produced it.

---

## Verdict

**FEASIBLE**, with four things that must be in the plan rather than discovered mid-build:

1. **`requiredReturnActions` as a set, applied at all 6 force sites** (Q3) — membership alone both under-binds the
   assistant and over-permits task agents.
2. **`session_not_returned` → `conversation` subscriber, carrying `callingThreadId`** (Q4) — the only "never
   silent" guarantee left.
3. **The `openai-compatible` guard on the `{kind:"agent"}` model request** (Q9/C11) — without it the preservation
   introduces a throw on a provider a user can select, for every kind.
4. **Re-provide both transcript delivery paths before deleting the branch** (Q5).

Accepted losses, all deliberate under the SCOPE LOCK: assistant `create_bet` (Q8), the assistant's tool-call and
bet-card rendering (Q10).
