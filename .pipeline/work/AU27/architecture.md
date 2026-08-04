# AU27 — Architecture: the assistant turn is an ordinary agent (de-specialize output + execution path)

**Rev 4 — TRIM PASS.** Subtraction only against plan.md's **SCOPE LOCK** (founder, 2026-08-04). Nothing new was
derived; §0 lists exactly what was cut and why. Tier: production. Base `origin/main@75d85687`. Design frame: AU21
Decision K2 (`work/AU21/architecture.md:893-915`), LOCKED.

---

## Executive block

**AU27 is six things:** (1) the generic `reply` tool · (2) `ToolContext.threadId` baked at emit · (3) the assistant
onto the shared poller — delete the `if` at `start-runtime.ts:110-118` · (4) delete `conversational` mode ·
(5) delete `@hyperidle/dispatch` · (6) the `AL6` naming purge.

**Increments (9), in three explicit phases — the seam is the review unit (W16):**

| Phase | # | Increment | Serves |
|---|---|---|---|
| **A — ADDITIVE** (each lands safely alone; nothing consumes it yet; a revert of Phase B leaves all of A intact) | 1 | `ToolContext.threadId`, baked at emit (+ resolve-or-create the task thread core-side) | item 2 |
| | 2 | the `reply` tool | item 1 |
| | 3 | return-gate adjustment, all 6 force sites | makes item 1 real (AC-8) |
| | 4 | generic transcript (de-specialize the input path) | precondition for item 4 |
| | 5 | never-silent net (`session_not_returned` → `conversation`) | AC-8's second half |
| **B — SWITCHOVER** (the risky middle; Inc 6 is the single commit that changes live behaviour, Inc 7 removes what it made unreachable) | 6 | collapse the execution entry + preserve model resolution | item 3 |
| | 7 | delete `conversational` + `dispatch` + the dead `toolCalls` UI branches | items 4, 5 |
| | 8 | live proof on the real-harness lane | AC-3, AC-8 |
| **C — RENAME** (mechanical, zero behaviour change, last so it runs once over a settled surface) | 9 | the `AL6` naming purge | item 6 |

Review the build phase by phase: A is judged on "does it break anything today?" (it cannot — nothing calls it),
B on "is the switchover correct and complete?", C on "is it green with no assertion edited but the identifier?".

**Production files: 43** — 6 deleted, 3 created, 34 edited (9 of those doc-only rewords). Tests/fixtures ~29
touched, ~9 new. §4's rows sum to exactly 43.

**The one UI change, stated plainly (not "backend-only"):** `packages/web/src/shell/AssistantOverlay.tsx` **is
edited** — deleting dead rendering branches in a UI file is a UI file edit. Nothing is added: the two branches
(AD8b tool-call summary rows, AK4 bet-draft cards, `:167-186`) lose their only data source when the
`conversationalToolCalls` capture goes, so **the assistant's bet cards and tool-call rows go away, deliberately**.
No replacement is proposed. Everything else about the assistant's rendering — including its distinct visual spot —
is untouched.

**Effort: ~7-9d** — core (Inc 1-8) **L, ~5-7d**; the rename (Inc 9) **~1.5-2d**.
Plainly why it is not the original 4-6d: two of the founder's own later amendments added work the original L
sizing predated. (a) *"the return gate itself is adjusted, not shadowed"* ⇒ Inc 3 touches **6** force/adjudication
sites across four harness channels plus a composition binding, and AC-8 demands a **real-harness** proof, not a
unit test. (b) the `AL6` purge is 373 occurrences with four lockstep pairs. Everything else is at or below the
original L. No trimmable fat remains that does not drop an AC.

---

## 0. Trim log (rev 3 → rev 4)

| Cut | Why |
|---|---|
| **All Inc 0 schema work** — migration SQL, backfill, `NOT NULL`, `NOT EXISTS` adopt guard, PGlite-vs-Postgres analysis, real-data desktop smoke, task-creation-path enumeration, `session-review-creator` rework, seed/fixture edits | SCOPE LOCK: *"No DB migration, no backfill, no `NOT NULL`, no schema change… pre-users, zero production data."* Replaced by Decision 0's four-line resolve-or-create. `tasks.threadId` stays nullable and untouched. |
| **`knowledge_item` as a FIX** | Verified in substance: threads resolve by `(hostKind, hostId)` (`conversation-store.ts:226-228`), so a missing column is not a missing capability. **PASSES.** |
| **The per-host audit as an increment** (old Inc 8) | Founder settled it: all 8 hosts stay lazy. Two lines in Decision 0. |
| **C3's UI mitigation + the `refs`-embed follow-up shape** | SCOPE LOCK: *"accept the loss, delete the dead branches, preserve nothing."* Two lines in Decision 7. |
| **C1's `callingTeamId` bake + optional `create_bet.teamId`** | **Cut under bias-to-deletion.** It ADDS surface (a `ToolContext` field, an injected `getTeamMembers` dep on the assistant resolver, an optional schema arg) and is **not** required for the RETIRE verdict — evidence #2 alone is decisive (see §5). Consequence, stated: `create_bet` becomes unusable for the assistant. No user exists to notice; re-providing it is a later WP. |
| Rev 3's §12 critique index, §1.1 drift table, §13 effort section, per-decision "rejected alternative" prose | Bookkeeping for a superseded review round. The surviving corrections are inlined where they apply. |

| Kept, with justification | Tied to |
|---|---|
| **C2's `modelId` bake + `resolveModel({kind:"agent"})` + `resolvedFastModel`** | **A preservation, not an addition.** Item 3 (the poller switch) silently breaks a shipped, founder-configurable feature otherwise — `users.modelId`/`modelProvider` have a real Settings UI, and AU21's own `@lore` (`dispatch/src/service.ts:173-180`) calls losing them *"a real regression … not an acceptable trade-off."* One field on an existing baked struct + one call shape. |
| Inc 3 (6-site gate) + Inc 5 (never-silent net) | plan.md AC-8, unstruck. |
| Inc 4 (generic transcript) | Deleting `conversational` without it deletes the assistant's **input** (see Decision 2) — a precondition for item 4, not new scope. |

---

## 1. Source re-grounding (corrections that still bind)

**(a) `conversational` spans five packages, not three** — 23 files (14 production, 9 test): `run-orchestration`,
`dispatch`, `tool-handlers`, `packages/shared`, `agent-execution/harness-registry`, `core-api/conversation`.

**(b) ONE poller with an `if` inside it.** `start-runtime.ts:262-263` is the single wake loop; the specialness is
`:110-118`'s `if (request.sourceKind === "assistant")`. Convergence = deleting that `if`.

**(c) `@hyperidle/dispatch` does nothing else.** `DispatchOps` (`service.ts:530-534`) = `start()` +
`runAssistantTurn`; `start()` declares `const disposers: Disposer[] = []` (`:548`) and the file has no `.push`.

**(d) `assistant-draft-registry.ts` is a 9-line re-export stub**; body at `tool-definitions.ts:1652-1731`.

**(e) AU21 Increment 14 has landed on `75d85687`** (the AU.md AU21 row is stale prose): no `core-api/cost`; no
`model-gateway` package (`resolveModel` sole entry, `shared/src/model-gateway.ts:327`); `route_item` deleted
(`tool-definitions.ts:1541-1543`); `realtime/src/` = `ws-connection-hub.ts` only; the guard's
`ALLOWLIST`/`isStatelessProvider` survive only in `@lore` history. **No rebase collision.**

**Line drift vs. plan.md's trace** (plan.md's numbers predate AU21's later commits): `isConversational` →
`provisioner.ts:1180`; registry merge → `:1142-1161`; reply capture → `:1487-1492`; params `:698-726`, result
`:744-753`, assembly `:1654-1657`; `RunOptions.conversational` → `contracts.ts:224`; `tasks.threadId` →
`schema.ts:201`.

---

## 2. Invariants

| # | Invariant | Held by |
|---|---|---|
| **I1** | `reply` lands through the SAME `CoreApiPort` route + middleware a human uses. Never an orchestration-side special write. | Handler is `ports.coreApi.insertMessage(...)` — the call `send_message` already makes (`tool-definitions.ts:129-137`), backed by `POST /threads/:id/messages` (`routes/threads.ts:1467`). |
| **I2** | `reply` available to EVERY agent kind; clean typed error when there is no calling thread. | `roles: undefined` ⇒ `toolsForRole` (`shared/src/tool.ts:386-391`) returns it to every role. Missing thread → `err("NO_CALLING_THREAD")`, never a throw. |
| **I3** | `ToolContext.threadId` from the BAKED request — **zero** orchestration→core reads on the run path. | One `callingThreadId` field baked at emit; orchestration only `JSON.parse`s the drained payload. Decision 0's resolve-or-create is a **core-side** write at bake time — orchestration still reads nothing, so AU21 AC #2 is unaffected. |
| **I4** | Assistant flows through the shared poller — no second execution entry. | Delete `start-runtime.ts:110-118`. |
| **I5** | Exactly one UI file is edited (`AssistantOverlay.tsx`) and only to **delete** two now-dead rendering branches — no UI behaviour is added, and the assistant's distinct visual spot is untouched. The bet cards go away deliberately. | SCOPE LOCK: *"accept the loss, delete the dead branches, preserve nothing."* Decision 7. |
| **I6** | The **one** return gate is **adjusted in place**, never shadowed. | Decision 3 extends `RETURN_ACTION_NAMES` / `shouldForceReturn` / `createGate` / `EnforcementEntry`; `EnforcementEntry.gate` keeps its `{ returned: boolean }` shape (`enforcement-registry.ts:24-26`). No second gate, no parallel registry, no bypass. |

**Guard constraints (AC-2b).** `scripts/composition-edge-anti-regrowth-guard.ts` runs in `npm run lint` as a hard
failure. Its `ALLOWLIST`/`isStatelessProvider` are gone post-14e, but `DEFERRED_FOLLOWUP` survives as a live,
repopulatable filter (`:417`, read at `:457`/`:469`), currently `new Set([])` — **AU27 adds ZERO entries.** Known
blind spot (`@lore Decision K1`): it classifies by **kind**, not **purpose**, so a seam-routed decision-read is
invisible — hence the K1-style behavioural test in §8. Deleting `dispatch/src/ports.ts` removes a declared-port
surface; `reply` adds no port (reuses `ToolHandlersPorts.coreApi.insertMessage`, `tool-handlers/src/ports.ts:263`);
retiring the draft registry deletes three seam decision-reads (`tool-definitions.ts:1596,1600,1629`). The guard can
only get greener.

---

## 3. What `conversational` means, per file

| File | What it is | Verdict |
|---|---|---|
| `provisioner.ts` (28) | params `:698-726`, `isConversational` `:1180`, registry fork `:1142-1161`, prompt fork `:1188-1204`, capture `:1487-1492`, exempt `:1376-1380`, endReason `:1578`, result `:744-753`/`:1654-1657` | **DELETE — the mode** |
| `contracts.ts:224`, `runtime.ts:409` | `RunOptions.conversational` + its spread | **DELETE** |
| `dispatch/src/{service,ports}.ts` | the mode's producer | **DELETE (whole package)** |
| `shared/src/harness-port.ts` | `RunContextBundle.conversational?` `:92`; `HarnessRunOutput.conversationalReply`/`conversationalToolCalls` `:148-149` | **DELETE — the mode leaked into the cross-process `HarnessPort` seam** |
| `tool-definitions.ts:1642`, `context.ts:409` | doc on the draft registry / `composeAssistantPrompt` | **DELETE with §5 / Decision 1** |
| `shared/src/harness/harness-adapter.ts:52,112-122` | `ConversationMessage` + `SessionConfig.messages` | **KEEP — generic.** "A session seeded with a transcript runs a chat completion, not a planning loop." AU21 H2's input side; K2 lists it under "STAYS". Reword docs. |
| `shared/src/harness/harness-events.ts:38` | `CompletionEvent.toolCalls` | **DELETE** — genuinely dead after Decision 7. |
| `builtin-harness-adapter.ts` (4) | `runChatTurn` `:454-613`, branch on `config.messages` `:397`, force exemption `:573-582` | **KEEP `runChatTurn`; CHANGE the force sites** (Decision 3). Reword docs. |
| `shared/src/types.ts:210` | unrelated (verdict semantics) | untouched |
| `agent-work-intent-recorder.ts:74`, `assistant-turn-resolver.ts:88` | prose | reword |

**Stated retention:** the chat-vs-planning **execution fork survives** — `builtin-harness-adapter.ts:397` still
branches on `session.config.messages`, now fed by the generic `params.transcript`. AC #4 says "no `conversational`
execution branch remains"; this branch keys on a generic input, not on "is this the assistant". Recorded in §8.

**AC-4's identifiers** (the bare word `conversational` survives legitimately in prose about
`ConversationMessage`/`runChatTurn`): `conversationalReply`, `conversationalToolCalls`, `isConversational`,
`params.conversational`, `RunOptions.conversational`, `buildAssistantDraftRegistry`, `runAssistantTurn`,
`persistTurnFailureInternal`, `@hyperidle/dispatch`.

---

## 4. Honest file count — 43 production files

Derived from `rg -li "runAssistantTurn|assistantTurn|buildAssistantDraftRegistry|conversationalReply|dispatchops|dispatch-bindings|@hyperidle/dispatch|conversational"`
plus `rg -l "shouldForceReturn|createReturnGate|AL6"`; every entry opened.
**6 deleted** · **3 created** · **34 edited** (9 doc-only). Rows sum to exactly 43.

| Area | n | Files |
|---|---|---|
| `agent-orchestration/dispatch` | 4 | **all deleted** — `service.ts`, `ports.ts`, `index.ts`, `package.json` + dir |
| `agent-orchestration/run-orchestration` | 5 | `provisioner.ts` (bulk), `contracts.ts`, `runtime.ts`, `context.ts`, `start-runtime.ts` |
| `agent-orchestration/tool-handlers` | 3 | `tool-definitions.ts`, `assistant-draft-registry.ts` (**deleted**), `index.ts` |
| `shared` | 8 | `tool.ts`, `harness-port.ts`, `events.ts`, `harness/return-actions.ts`, `harness/enforcement-registry.ts`, `agent-work-intent-recorder.ts`; doc-only `harness/harness-adapter.ts`, `harness/harness-events.ts` |
| `agent-execution/harness-registry` | 6 | `builtin-harness-adapter.ts`, `return-enforcement.ts`, `mcp/mcp-route.ts`, `cli-harness-adapter.ts`, `return-status-tool.ts`, `provision-return-hook.ts` |
| `core-api` | 10 | `services/dispatch-bindings.ts` (**deleted**), `server-factory.ts`, `app.ts`, `services/run-orchestration-composition.ts`, `src/routines.ts` (`export { dispatchOps }` `:24`), `package.json` (`"@hyperidle/dispatch": "*"` `:27`), `conversation/src/assistant-turn-resolver.ts`, `work/src/task-run-resolver.ts`, `work/src/session-start-resolver.ts`, `review/src/proposed-call-workflow.ts` |
| **new** core-api | 2 | `conversation/src/session-not-returned-notice.ts`, a `session_not_returned` reactions module |
| `eslint-plugin-design` + `scripts` | 3 | `rules/no-ungated-stream-drain.ts`, `scripts/test-naming-guard.allowlist.json`, `scripts/al6-naming-guard.ts` (**new**) |
| `remote-worker` | 1 | `src/remote-worker-client.ts:223` — the only production `AL6-relay` annotation |
| `web` | 1 | `src/shell/AssistantOverlay.tsx` — delete two dead branches (Decision 7) |

**Live consumers of the deleted package, all assigned to Inc 7:** `core-api/src/routines.ts:24`'s
`export { dispatchOps }` (verified **zero** live importers — `rg dispatchOps packages/eval` returns only `@lore`
prose at `seeding.ts:544`, `scenarios/delegation.ts:7,15`; `knip` is the proof); `core-api/package.json:27`;
`core-api/src/__tests__/dispatch-test-helpers.ts`'s `startDispatchEngine` (a no-op wrapper over a no-op) and its
**8** consumers — `routine-scheduler.au15`, `af9-promotion-routine`, `AF17-team-routines`,
`af9-attention-population`, `builtin-routines`, `agent-work-intent-production`, `O3-service-move-bootstrap`,
`AH6-lane-gates-broken-turn`; `routine-scheduler-relocation.integration.test.ts:72`.

---

## 5. Judgment call — `buildAssistantDraftRegistry`. **Verdict: RETIRE.**

plan.md:26 names this the WP's one judgment call.

1. Its two tools already exist as ordinary role-scoped tools —
   `wrapForRegistry(makeCreateBetTool(ports), ["assistant"])` / `…EditBetTool…` (`tool-definitions.ts:1526-1527`)
   — and the assistant agent's role **is** `"assistant"` (`db/src/agent-scaffold.ts:77-86`, persisted on the row
   and read back as the baked `agentConfig.role`, `provisioner.ts:835`).
2. **Decisive:** its `edit_bet` continuity scans the transcript for a prior assistant message's
   `payload.toolCalls` (`:1604-1635`) — written **only** by `dispatch/src/service.ts:377-386` from
   `conversationalToolCalls`. AU27 deletes that capture ⇒ the mechanism is structurally impossible afterwards,
   regardless of intent. It is load-bearing on the thing being removed.
3. Its remaining injection is ethos-contrary: the `@lore` at `:1644-1645` states the intent as *"model cannot
   redirect the team"* / *"cannot target another bet"* — a paranoia-shaped guard applied to the assistant only,
   while every other agent calls the same `edit_bet` unrestricted.
4. It makes three seam reads per turn (`:1596,1600,1629`), deleted with it.

**Accepted loss (bias to deletion).** `create_bet` requires a `teams.id` (`tool-definitions.ts:1104`), which the
assistant cannot derive: its `sourceCorrelation` carries none (`shared/src/session-request.ts:60-71`) and
`ctx.teamId` is `users.teamId`, a `team_members.id` (`db/src/schema.ts:58`). Rev 3 proposed baking a
`callingTeamId` to fix it; **cut** — it adds surface for a capability no user can miss. Assistant bet-drafting
stops working; re-providing it is a later WP. Cross-turn draft continuity dies with it (proper home: **AU25**).

---

## 6. Design decisions

### Decision 0 — the calling thread exists when `reply` needs it (no schema change)

Threads resolve by `(hostKind, hostId)`, not by an FK column: `findThread(db, { host: { kind, id } })`
(`conversation-store.ts:222-228`) and `insertThread` (`:125`), both exported from `@hyperidle/conversation`. So the
emit-time resolvers **resolve-or-create** the task's `hostKind:"task"` thread and bake its id — the same shape
`resolveOrCreateHostThread` (`web/src/services/host-threads.ts:36-76`) already uses. A **core-side write at bake
time**; orchestration still reads nothing (I3). Injected per Mechanism C (`@hyperidle/work` / `@hyperidle/review`
may not import `@hyperidle/conversation`), exactly like the four deps `routes/threads.ts:1483-1491` already wires.

`tasks.threadId` is untouched and stays nullable. **All 8 thread hosts stay lazy** — lazy resolve-or-create is the
architecture, not a gap (founder, settled).

### Decision 1 — the `reply` tool

Name **`reply`**: the forcing message must read as an instruction, and it is deliberately narrower than
`send_message` — **no thread argument**. One entry in `buildToolDefinitions`'s `all` array, no `roles` (I2).

```ts
const replyInputSchema = z.object({ text: z.string().min(1).max(65_536) });

function makeReplyTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<ReplyInput, TDb> {
  return {
    name: "reply",
    description:
      "Post a message into the conversation this session was started for. This is how you answer the " +
      "person or agent who triggered you. Takes no thread argument — it always posts to your own calling thread.",
    inputSchema: replyInputSchema,
    reversibility: "reversible",
    handler: async (args, ctx) => {
      const parsed = replyInputSchema.safeParse(args);
      if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
      if (!ctx.threadId) {
        return err("NO_CALLING_THREAD",
          "This session has no calling thread, so there is nothing to reply to. Use create_item, " +
          "write_memory, or create_artifact to record your result instead.");
      }
      const created = await ports.coreApi.insertMessage(
        { threadId: ctx.threadId, type: "plain", payload: { text: parsed.data.text },
          clientKey: crypto.randomUUID() },
        ctx.agentId,
      );
      return ok({ messageId: created.id, threadId: ctx.threadId });
    },
  };
}
```

- **No `threadId` argument** — it is what makes `reply` mean "answer your caller", and it removes a loop class.
  (`routes/threads.ts:1452-1455` already refuses to re-trigger on an `ast-`-prefixed sender.) Authorization:
  `canWrite → canRead` (`core-api/src/auth/access-boundary.ts:59-80`) is host-scope for `hostKind:"task"`, so a
  task agent may write into its task thread — no 403.
- **`reversibility: "reversible"` is required, not decorative.** `classifyReversibility`
  (`shared/src/tool.ts:290-301`) fails **closed** to `irreversible`; under an AL7 `sessionWorkflow` every `reply`
  would route to human review.
- Errors are `ToolResult`s, never throws (AC-7).

**`ToolContext.threadId`** (`shared/src/tool.ts`), optional — the `taskId: ""`-for-absent idiom is deliberately not
copied, because `""` is not an id and `reply` must be able to tell:

```ts
/**
 * AU27: the thread this session was started FOR — its calling thread. Baked at emit
 * (never read on the run path — AU21 AC #2). Absent for routine_run / knowledge_action.
 */
readonly threadId?: string;
```

**Baked by every resolver, no per-kind branch in orchestration:** `assistant_turn` →
`message.threadId` (`assistant-turn-resolver.ts:162,187-206`); `task_run` / `session_start` / `proposed_call` →
Decision 0's resolve-or-create; `routine_run` / `knowledge_action` → nothing.
**Wire:** `parseBakedCallingThreadId` in `runtime.ts` (beside `:395-399`) → `RunContextBundle.callingThreadId?`
(`shared/src/harness-port.ts`) → `provisioner.ts:1122-1141`'s `toolContext`.

### Decision 2 — the transcript, de-specialized (do NOT delete the input path)

The transcript reaches the model by **two** paths, both gated on `params.conversational`
(`provisioner.ts:1188-1204` prompt; `:1196` + `:1416` → `SessionConfig.messages`, which selects `runChatTurn` over
`runPlanningTurn`, `builtin-harness-adapter.ts:397`). Deleting the branch without a replacement silently deletes
the assistant's input, undoing AU21 H2. Both are re-provided generically **before** anything is deleted:

1. `RunContextBundle.transcript?: readonly ConversationMessage[]`, beside `contextBundle`/`agentConfig` — the same
   bake-at-emit family; parsed by a new `parseBakedTranscript`. The row→message mapping
   (`dispatch/src/service.ts:424-445`) relocates **verbatim** into `run-orchestration` as a pure helper — it is
   *formatting*, which under H2 is orchestration's job, so it must not move core-side.
2. `assembleTaskFreePrompt` (`provisioner.ts:443-459`) gains a `## Conversation` section plus a one-line reply
   orientation when a return requirement is set. It already emits `## Tools` (`:451-454`), now including `reply`,
   so the tool is visible in the prompt on every harness. It also emits
   `Correlation: {"threadId":"…","messageId":"…"}` verbatim (`:455-456`) — raw machine ids in the system prompt of
   the most user-facing agent; render a human-readable source line instead when a transcript is present.
3. `SessionConfig.messages` from `params.transcript` (`:1416`).
4. `composeAssistantPrompt` **DELETED** (`context.ts` + the port at `provisioner.ts:361`).

**Persona delta — an improvement, called out.** Today the persona is `conversational.systemPromptOverride`, which
`dispatch/src/service.ts:318-326,368` recomputes from `resolveAgentScaffoldSpecs({trigger:"user_assistant"})` and
which `provisioner.ts:1190-1194` prefers over the baked agent row. After AU27 it is `agentConfig.systemPrompt`
(`provisioner.ts:839`) = the `users.systemPrompt` column. The scaffold value is a hardcoded constant
(`APP_ASSISTANT_SYSTEM_PROMPT`, `db/src/agent-scaffold.ts:39-40`), so the two are identical for an untouched
assistant; for one the founder **edited** via `PATCH /threads/assistant` (`routes/assistant.ts:453-454`), today's
code silently ignores the edit and AU27 starts honouring it. `AR4b-formation-seam.test.ts` asserts the old
mechanism and is **rewritten**, not deleted — its real AC survives.

### Decision 3 — how the agent is FORCED to call `reply` (6 sites, requirement is a **set**)

The mechanism is the existing return enforcement, **adjusted in place** (I6) — not a shadow gate.

**Why membership alone fails, both directions.** `send_message`/`handoff_to`/`submit_review` carry no `roles`
filter, so the assistant has them and could satisfy the gate without answering — while `AL6_FORCE_RETURN_MESSAGE`
(`return-actions.ts:106-109`) is a static string naming exactly those three, actively misdirecting it.
Symmetrically, adding `reply` to the set would let a `task_run` agent end with `reply("done")` instead of
`submit_review`. ⇒ the requirement is a **set**, not a lone string.

```ts
// shared/src/harness/return-actions.ts
export const RETURN_ACTION_NAMES = ["submit_review", "handoff_to", "send_message", "reply"] as const;
export function buildForceReturnMessage(required?: readonly string[]): string;
export function shouldForceReturn(
  gate: { readonly returned: boolean }, forceCount: number, required?: readonly string[],
): string | null;

// shared/src/harness/enforcement-registry.ts — EnforcementEntry
readonly requiredReturnActions?: readonly string[];

// harness-registry/src/return-enforcement.ts
createGate(requiredReturnActions?: readonly string[]): ReturnGate   // predicate in the closure
```

`EnforcementEntry.gate` keeps its `{ returned: boolean }` shape (`enforcement-registry.ts:24-26`) — no consumer's
type breaks.

| # | Site | Channel | Change |
|---|---|---|---|
| 1 | `builtin-harness-adapter.ts:581` (`runChatTurn`) | builtin, chat | pass the set; apply it to `session.returnSeen` |
| 2 | `builtin-harness-adapter.ts:751` (`runExecuteTurn`) + static emit `:762` | builtin, planning/execute | same — and it is **not** gated by `hasReturnActionInRegistry` while site 1 is; reconcile |
| 3 | `mcp/mcp-route.ts:140` | HTTP adjudication for **both** claude and codex hooks | `shouldForceReturn(entry.gate, pre, entry.requiredReturnActions)` |
| 4 | `cli-harness-adapter.ts:773` + static message `:810` | opencode `process-reengage` | same + `buildForceReturnMessage(...)` |
| 5 | `return-status-tool.ts:72` | the `return_status` MCP tool (agent self-check) | same; update its doc contract at `:10` |
| 6 | `run-orchestration-composition.ts:125` `createReturnGate: () => enforcement.createGate()` vs. the port type `provisioner.ts:210` | composition binding | thread the parameter — a hard **compile** dependency |

**Both builtin sites build a *synthetic* gate literal `{ returned: session.returnSeen }`**, so the closure-held
predicate does not reach them — `session.returnSeen` must be set only for a member of the session's required set.

**The rule, structural, no `sourceKind` anywhere:**

> `requiredReturnActions = ["reply"]` ⟺ `params.callingThreadId != null && params.taskId == null`
> otherwise `undefined` (⇒ the full set satisfies, unchanged behaviour).

Assistant (thread, no task) → must `reply`. `task_run`/`proposed_call`/`session_start` (thread **and** task) →
unchanged trio, with `reply` newly available. `routine_run`/`knowledge_action` → no thread, `&&` short-circuits,
unchanged. `params.taskId` is `string | null` (`provisioner.ts:732`), so `== null` is sound. **This rule is the one
genuine judgment call in the plan** — surfaced for critique.

### Decision 4 — collapsing the execution entry + preserving model resolution

Delete `start-runtime.ts:110-118`'s `if`; the assistant falls into the existing `else` (`:119-147`) →
`runSession({ mode: "durable" })` → `consumeAgentSessionRequest` → `runClaimedRequest`.
`RuntimeDeps.assistantTurn` (`contracts.ts:254`) and `RuntimePorts.dispatch` (`:197`) are deleted.
`completion: "admit"` (`:134`) detaches the run — nothing awaits the reply anyway (fire-and-forget since AU9,
`routes/threads.ts:1557-1561`), but tests must **poll**.

**Model preservation (kept per §0).** `assistant-turn-resolver.ts:200-201` bakes `modelId`/`modelProvider`;
`dispatch` consumes them via `loadBakedModelOverride` (`service.ts:288-300`) → `resolveAgentModel` (`:216-221`).
The durable path is tier-only (`makeResolveModel`, `server-factory.ts:723-735`) and `bakeAgentRunnableConfig`
(`shared/src/agent-work-intent-recorder.ts:222-234`) omits `modelId`. Fix, uniform for all six kinds:
1. add `modelId: string | null` to `BakedAgentRunnableConfig` + its whitelist mapper (one field, one line);
2. the drain issues `resolveModel({ kind: "agent", modelId, modelProvider, tierFallback: tier }, …)` — the shape
   already exists (`shared/src/model-gateway.ts:327-348`) and `modelId === null` falls back to the tier;
   ⚠️ **C11 — one guard is mandatory, not optional.** `resolveModel({kind:"agent"})` sets `agentPath: true`
   (`model-gateway.ts:341`), and `resolveProvider`'s `case "openai-compatible"` **throws
   `UnsupportedAgentProviderError`** when `agentPath` is set (`:261-263`). `openai-compatible` is a real,
   **user-selectable** per-agent provider: it is in `MODEL_PROVIDERS` (`:24`) and Settings → Agents PATCHes
   `modelProvider` straight from the editor draft (`web/src/settings/SettingsAgents.tsx:243,257`). Today that
   throw is contained — `resolveTurnModelInternal` rethrows it and `runTurnInternal`'s outer catch
   (`dispatch/src/service.ts:419-421`) turns it into a thread notice. After Inc 6 there is no such catch: the
   throw lands at `start-runtime.ts:127`, outside `runClaimedRequest`, feeding the unbounded re-claim loop
   plan.md accepts as out-of-scope — and now for **`task_run`** too, not just the assistant, because the bake is
   uniform across all six kinds. **Fix (two lines, zero new surface):** request `{kind:"agent"}` only when
   `modelProvider !== "openai-compatible"`; otherwise request `{kind:"tier"}`. Such an agent then runs on its
   tier — strictly better than today, where the same configuration errors the turn out entirely. Rejected
   alternative: *don't bake `modelId` at all* — that drops the override for **anthropic and openrouter** as well,
   i.e. re-breaks precisely the regression AU21 called *"not an acceptable trade-off"*, so it trades a two-line
   guard for the whole reason C2 survives the scope cut.
   **Test:** an agent with `modelProvider: "openai-compatible"` + a `modelId` resolves to the tier model and the
   drain does not throw (sanity-break it: remove the guard, confirm the throw).
3. also pass **`resolvedFastModel`** (`start-runtime.ts:128-135` passes none today; consumer
   `builtin-harness-adapter.ts`'s `config.resolvedFastModel ?? config.resolvedModel`) — otherwise every assistant
   summarization silently moves to the workhorse model.

Recorded improvement: dispatch used the static `BUILT_IN_GATEWAY_CONFIG`; the durable path uses
`readServerConfig(db).modelGateway`, so a founder's custom gateway settings start applying to assistant turns.

### Decision 5 — the never-silent net

The force budget (`AL6_MAX_FORCE_RETURNS = 2`) is finite, so a session can still end without `reply`.
`provisioner.ts:1581-1598` already emits `session_not_returned` with `sourceCorrelation`; its only subscriber is
the observability dispatcher (`core-api/observability/src/dispatcher.ts:461`). AU27 adds a
`@hyperidle/conversation` subscriber posting one plain `notice` — existing event, new subscriber, zero
orchestration writes.

Scoping: `sourceCorrelation` for a `task_run` is `{taskId, teamId}` — no thread. The emitter has
`params.callingThreadId` in hand at `:1583` ⇒ add `callingThreadId?: string` to `SessionNotReturnedEvent`
(`shared/src/events.ts:220-232`). Absent → the subscriber **no-ops**. Present → one notice: *"I couldn't finish
that turn. Try asking again."* Text lives in `core-api/conversation/src/session-not-returned-notice.ts`.

### Decision 6 — the assistant's tool surface expands, and that is the point

`provisioner.ts:1145-1154` builds the conversational registry with `useOnlyExtraTools: true` ⇒
`[return_status, create_bet, edit_bet]`. After Inc 7 the assistant gets every `roles: undefined` tool
(`send_message`, `handoff_to`, `submit_review`, `create_task`, `create_item`, `write_memory`, `commit_file`,
`create_artifact`, `create_team`, `add_agent`, `create_routine`, `update_routine`, `read_inbox`, `log_task`,
`query_practice`, `write_session_notes`, `reply`). The largest product-behaviour change in the WP, and the
founder's verbatim direction.

**No AL7 gate is introduced.** `create_bet`/`edit_bet` declare no `reversibility` and go through `wrapForRegistry`
(`shared/src/tool.ts:232-251`), so `classifyReversibility` fails closed to `irreversible` — but the workflow router
participates only when `sessionWorkflow` is present (`harness-adapter.ts:132-137`), and `params.sessionWorkflow`
(`provisioner.ts:1160`) is set only for the AL7 two-session proposed-call flow, never for an assistant turn.

### Decision 7 — deletions: `conversational`, `dispatch`, and the dead `toolCalls` UI

`payload.toolCalls`'s sole writer is `dispatch/src/service.ts:377-386`; its two consumers are in
`packages/web/src/shell/AssistantOverlay.tsx:167-186` (AD8b tool-call summary rows, AK4 bet-draft cards). Both
branches die. **Delete them, preserve nothing, propose nothing** — deliberate under the scope lock: pre-users, no
one to regress; re-adding agent tool-call visibility properly is a later WP. This also makes
`CompletionEvent.toolCalls` (`harness-events.ts:38`) and its population (`builtin-harness-adapter.ts:607`)
genuinely dead — deleted with it.

### Decision 8 — the `AL6` naming purge

**Surface:** 373 occurrences across 30+ files. **Vocabulary** (the mechanism is *return enforcement*, not a WP id):
`AL6_FORCE_RETURN_MESSAGE`→`FORCE_RETURN_MESSAGE` · `AL6_MAX_FORCE_RETURNS`→`MAX_FORCE_RETURNS` ·
`AL6-relay`→`return-relay` · `AL6-exempt: …`→`return-exempt: …` · `AL6-observe-only:`→`return-observe-only:` ·
`X-AL6-Budget-Left`/`X-AL6-Returned`→`X-Return-Budget-Left`/`X-Return-Seen` · `AL6-*.test.ts`→
`return-gate.test.ts`, `return-status-tool.test.ts`, `return-enforcement-registry.test.ts`,
`cli-reengage-adapter.test.ts`, `provision-return-hook.test.ts`, `return-actions.closure.test.ts`,
`return-status-route.test.ts`, `real-harness-return-enforcement-realbinary.integration.test.ts`.

**Four lockstep pairs, each one commit:**
1. **Marker strings the lint rule PARSES.** `eslint-plugin-design/src/rules/no-ungated-stream-drain.ts:40,42,54`
   define them, plus five developer-facing messages at `:161-177` instructing developers to type those exact
   tokens; its own test embeds them (`__tests__/no-ungated-stream-drain.test.ts:26,34,57`). A raw `rg -a` finds
   exactly **one** production annotation — `remote-worker/src/remote-worker-client.ts:223`. So: rule + rule-test +
   one call site.
2. **HTTP headers — producer-only.** `mcp-route.ts:157-158` emits them; the generated hooks
   (`provision-return-hook.ts:346,373`) use `curl -s` with **no `-i`/`-D`**, so headers are discarded, and
   `mcp-route.ts:155` documents them as debug-only. The **body** is the wire contract. No script regeneration.
3. **Constants + two barrels + importers.** `return-actions.ts:106,120`, re-exported from `shared/src/index.ts:325-326`
   and `shared/src/harness/index.ts:52-53`; imported by `builtin-harness-adapter.ts:33`, `cli-harness-adapter.ts:32`,
   `return-status-tool.ts:25`, `mcp-route.ts`, `provisioner.ts`; named in `eval/src/scenarios/force-return.ts:57`.
4. **`scripts/test-naming-guard.allowlist.json` pins 8 `AL6-*` paths** (`:3-7,27,57,58`) — renaming files without
   editing it breaks the naming guard.

**Scope boundary, stated so the builder need not decide.** Live naming is purged — identifiers, markers, headers,
filenames, and prose that *names the mechanism* ("the AL6 gate" → "the return gate"). **`@lore <WP-ID>` provenance
tags are PRESERVED**: `@lore AL6 v2: …` is the same shape as `@lore AU21`/`@lore AK4` used repo-wide, CLAUDE.md
mandates lore capture, and purging one WP's tags would break the convention and destroy traceability. The guard
excludes the `@lore <ID>` position. ⚠️ This narrows AC-9 — flagged for critique.

**Enforcement:** `scripts/al6-naming-guard.ts` in `npm run lint`, matching the repo-guard pattern
(`composition-edge-anti-regrowth-guard.ts`, `honest-harness-guard.ts`) — **not** `eslint-plugin-design` (scoped to
design tokens), never a `readFileSync` test. **Placement LAST** so the rename runs once over a settled surface;
Inc 3's new identifiers (`buildForceReturnMessage`, `requiredReturnActions`) are **born** with the new vocabulary.

---

## 7. Increments

**Inc 1 — `ToolContext.threadId`, baked at emit.** `shared/src/tool.ts`, `shared/src/harness-port.ts`, the four
resolvers (`assistant-turn-resolver.ts`, `task-run-resolver.ts`, `session-start-resolver.ts`,
`proposed-call-workflow.ts` — both bake sites, with Decision 0's injected resolve-or-create),
`runtime.ts` (`parseBakedCallingThreadId`), `provisioner.ts:1122-1141`.
*Tests:* per-resolver bake shape (assistant / task resolve-or-create is idempotent — second emit reuses the same
thread / routine bakes nothing). Wiring completeness per K1's precedent: every composition-root resolver site gets
a proof it supplies the bake, each sanity-broken (drop wiring → RED → restore → GREEN).

**Inc 2 — the `reply` tool.** `tool-definitions.ts` only.
*Tests:* a `task_run` session posts a comment into its task's thread, `app.fetch` spy proving
`POST /threads/:id/messages` (AC-1); `routine_run` **and** `knowledge_action` get `err("NO_CALLING_THREAD")` and
continue (AC-7). Extend `tool-registry.integration.test.ts`, `tool-schemas.integration.test.ts`,
`tool-registry-role.integration.test.ts`.

**Inc 3 — the return gate, all 6 sites** (Decision 3's table; new identifiers born with Inc 9's vocabulary).
*Tests:* extend `AL6-return-actions.closure.test.ts` (already asserts every `RETURN_ACTION_NAMES` member maps to a
real registered tool — it fails until Inc 2 lands, hence the ordering) and `AL6-return-gate.test.ts`: a gate
required to `["reply"]` is **not** satisfied by `send_message`; the message names `reply`, not the trio; **plus
cases for sites 2 and 5.** Never weaken `MAX_FORCE_RETURNS` to pass anything.

**Inc 4 — generic transcript.** `shared/src/harness-port.ts` (`+transcript`), `runtime.ts`
(`parseBakedTranscript` + the relocated mapper), `provisioner.ts` (`## Conversation`, the readable source section,
`SessionConfig.messages`, register `requiredReturnActions` per Decision 3's rule).
*Tests:* the assembled prompt contains the transcript and no raw correlation JSON; `SessionConfig.messages` is
populated for a transcript-bearing durable request.

**Inc 5 — the never-silent net.** `shared/src/events.ts` (`+callingThreadId?`), `provisioner.ts:1583`, the new
notice module + reactions module.
*Tests:* a `not_returned` session with a `callingThreadId` produces exactly one notice in that thread; without one,
no message and no throw.

**Inc 6 — collapse the execution entry + model preservation (SWITCHOVER).** `start-runtime.ts`, `contracts.ts`,
`shared/src/agent-work-intent-recorder.ts` (`+modelId`), `server-factory.ts`, `app.ts`,
`run-orchestration-composition.ts:229-241`.
*Tests (rewrite):* `AH6-lane-gates-broken-turn.integration.test.ts` — its Term-1 premise ("no `assistantTurnDeps`
⇒ no reply") is gone; the load-bearing property becomes "no `agent_work_intents` row ⇒ no reply".
`AR4b-formation-seam.test.ts` per Decision 2. `AU9-assistant-handoff-realbinary` re-pointed.
*New:* assert the request traverses `runClaimedRequest` and the **durable lifecycle**
(`transitionAgentRunLifecycle`, status `running`→`completed`) — **not** merely "a session row exists", which is
already true today; and that the per-agent `modelId` override plus `resolvedFastModel` reach the resolved model.

**Inc 7 — delete `conversational`, `dispatch`, and the dead UI branches.** `dispatch/**` (+ its 3 test files),
`dispatch-bindings.ts`, `routines.ts:24`, `core-api/package.json:27`, `assistant-draft-registry.ts`,
`tool-definitions.ts:1578-1731`, `tool-handlers/src/index.ts:23`, `contracts.ts:224`, `runtime.ts:409`,
`provisioner.ts` (params / registry fork / `isConversational` / prompt fork / exempt term / endReason term /
capture / result fields / the `composeAssistantPrompt` port), `context.ts`, `shared/src/harness-port.ts:92,148-149`,
`harness-events.ts:38` + `builtin-harness-adapter.ts:607`, `AssistantOverlay.tsx:167-186`, 4 doc-only rewords.
*Test cleanup:* `dispatch-test-helpers.ts` + its 8 consumers; `routine-scheduler-relocation…:72`;
`core-api-port-increment2-dispatch-assistant-turn…` → rewritten as `core-api-port-assistant-reply-seam…` (same real
assertion — the reply crosses the seam, not a raw DI write — now proven of the agent's own `reply` call);
`run-orchestration/src/__tests__/test-ports.ts`; `tool-handlers-completeness-contract.test.ts` (drop section B,
extend A for `reply`); `AK4-AssistantOverlay.bet-card.test.tsx` + the AD8b overlay tests.

**Inc 8 — live proof on the real-harness lane.** No production change unless a defect surfaces. Per harness
(builtin / claude-code / codex / opencode — `requireHarness`, never `skipIf`): (1) an assistant turn ends with a
real `reply` call and the reply lands in the thread; (2) a scripted refusal hits the force path (≥1 injection,
message names `reply`, **including via `runExecuteTurn` and `return_status`**); (3) exhausting the budget ends
`not_returned` and the thread shows the notice — never silence.
⚠️ `test:integration:harness` is **release-gated** (`verify:release`), not part of per-merge `npm run verify`.
Watch `MAX_TOOL_ITERATIONS = 3` (`builtin-harness-adapter.ts:479`; ≈5 effective rounds via the force reset at
`:597`) — if the assistant truncates, raise the constant, never weaken the gate.

**Inc 9 — the `AL6` naming purge, LAST.** Decision 8's four lockstep commits + `scripts/al6-naming-guard.ts` in
`npm run lint` + the allowlist's 8 rows. *Proof:* `check && lint && test` green with **no test assertions edited**
other than renamed identifiers.

**Order (replacement precedes deletion).** 1→2→3→4→5 are inert additions; **6 is the single switchover**; 7 removes
the now-unreachable path; 8 proves it live; 9 renames once over a settled surface. A revert of 6 leaves 1-5 intact.

---

## 8. Acceptance criteria → verification

CLAUDE.md: runtime behaviour → automated test; **static property → lint/type, never a `readFileSync` test.**

| AC | Method | Inc |
|---|---|---|
| **1** Generic `reply`, every kind, via the `CoreApiPort` seam | **Runtime test** — `task_run` posts into its task's thread; `app.fetch` spy proves the route | 2 |
| **2a** `ToolContext.threadId` from the baked request | **Runtime test** — per-resolver bake + `toolContext.threadId` at invocation | 1 |
| **2b** Zero orchestration→core reads on the run path | **Lint + runtime test.** `composition-edge-anti-regrowth-guard` at zero findings **and zero new `DEFERRED_FOLLOWUP` entries**; plus a K1-style `app.fetch` spy across bake → `runClaimedRequest` → `runSession` (only the agent's own tool calls). Decision 0's write is core-side at bake time, not a run-path read | 1, 6 |
| **3** The assistant replies by calling `reply` during the session | **Runtime test** (service lane, scripted adapter) **+ real-harness** on all four | 4, 6, 8 |
| **4** `conversational` fully removed | **`npm run check` + `knip`** (both already in `verify`) — the deleted types cannot resolve, the deleted package cannot be referenced. No new ESLint denylist: a hardcoded identifier list is a grep with extra steps and permanent debt, and ETHOS earns guards from learnings. **Stated retention:** the chat-vs-planning fork at `builtin-harness-adapter.ts:397` survives, keyed on the generic `params.transcript` | 7 |
| **5** Assistant on the shared poller; no second entry | **Runtime test on the durable lifecycle** — `runClaimedRequest` + `transitionAgentRunLifecycle` (`running`→`completed`), not "a session row exists" (already true today). Statically backstopped by AC-4 | 6 |
| **7** No calling thread → clean typed error, never a crash | **Runtime test** — `routine_run` **and** `knowledge_action`: `{success:false, code:"NO_CALLING_THREAD"}`, session continues | 2 |
| **8** The gate forces the session-appropriate action; the message names it; the thread is not left silent | **Runtime tests at all 6 sites** + **real harness** (AC text: *"not gate-unit-only"*) + the never-silent half | 3, 5, 8 |
| **9** No `AL6` WP-id naming in production code | **Lint** — `scripts/al6-naming-guard.ts` in `npm run lint`. Scope boundary + `@lore` exclusion per Decision 8 | 9 |

*(AC-0 is satisfied without work: threads resolve by `(hostKind, hostId)`, all hosts stay lazy, and Decision 0
guarantees the task thread exists when a session needs one. AC-6 is struck.)*

**Sanity-break discipline** (mock-validation trap): every new assertion proven non-hollow — revert the production
change, confirm RED, restore, confirm GREEN. Named targets: AC-2b's `app.fetch` spy, each Inc-1 wiring proof,
AC-8's force-message assertions at sites 2 and 5, AC-5's lifecycle assertion.
⚠️ `packages/web/e2e/AH3-assistant-responds.spec.ts` is **not** a merge-lane backstop — e2e is local-only.

---

## 9. Knip / dead-code watch

- `CompletionEvent.toolCalls` + `CapturedToolCall` — delete the field and its population (Decision 7).
- `routines.ts:24`'s `dispatchOps` re-export — verified zero live importers; `knip` is the proof.
- `startDispatchEngine` — a no-op wrapper over a no-op; delete with its 8 consumers.
- `HarnessRunOutput`/`SessionMetrics` fields orphaned by the result-shape narrowing.
- `AssistantToolShape`/`AssistantToolResult`/`wrapForRegistry` (`shared/src/tool.ts:183-251`) — still used by
  `create_bet`/`edit_bet`; **confirm, do not assume**.
- `ToolCallRow` / `BetDraftCardForToolCall` — check for other callers before deleting.

---

## 10. Risks & open questions

| # | Risk | Mitigation |
|---|---|---|
| **R1** | **The agent doesn't call `reply` ⇒ the user gets nothing.** The WP's highest risk. | Decision 3's per-session requirement across all 6 sites + Inc 5's never-silent net + Inc 8's four-harness proof. |
| **R2** | **Silently deleting the transcript input**, undoing AU21 H2. It rides *two* channels. | Decision 2 provides both generically **before** Inc 7 deletes anything. |
| **R3** | **Assistant bet-drafting stops working** (§5's accepted loss). | Deliberate under the scope lock — pre-users. `@lore` at the deletion site; re-providing is a later WP. |
| **R4** | `MAX_TOOL_ITERATIONS = 3` may truncate an assistant that must both work and reply. | ≈5 effective rounds via the force reset. Observe in Inc 8; raise the constant, never weaken the gate. |
| **R5** | `completion:"admit"` detaches; tests that awaited completion now race. | Inc 6 rewrites them to poll. |
| **R6** | Persona source changes to `users.systemPrompt` (Decision 2). | Intended latent-bug fix; byte-identical for un-edited assistants. `AR4b` rewritten. |
| **R7** | **Decision 6's tool-surface expansion** — 3 tools → ~17. | The founder's verbatim direction; no AL7 gate introduced (Decision 6). Inc 8's harness lane surfaces misbehaviour. |
| **R8** | **`openai-compatible` per-agent provider throws on the durable path** (C11). | Decision 4's two-line guard + its named test. Without it the throw feeds the unbounded re-claim loop, for `task_run` as well as the assistant. |
| **R9** | Parallel-WP overlap on `provisioner.ts` / `start-runtime.ts` / `server-factory.ts`. | AU21 Inc 14 already landed (§1e) — no collision. **AU26** will touch `server-factory.ts` heavily; AU27 should land first since it *shrinks* that file. |
| **Q1** | Decision 3's `callingThreadId != null && taskId == null` rule. | The one genuine judgment call; per-kind table in Decision 3. Surfaced for critique. |
| **Q2** | AC-9's `@lore` exclusion — purging `AL6` from provenance tags would break the repo-wide `@lore <WP-ID>` convention. | Decision 8 excludes the tag position and says so. A deliberate narrowing, flagged. |
| **Q3** | `reply` vs `post_message`. | `reply` chosen (Decision 1). Cheap to change before Inc 2, expensive after. |

---

## 11. Docs to update at `/pipeline:write-docs`

`docs/agent-layer/` (the assistant is an ordinary agent; `reply` in the tool surface; the return-action set is now
four; return-enforcement vocabulary), `docs/architecture/runtime-simplification.md` (one execution entry;
`@hyperidle/dispatch` retired), `docs/process-layer/sessions.md` (the calling thread as a session property),
`docs/guides/developer/` (retired `conversational` and `AL6` vocabulary).
