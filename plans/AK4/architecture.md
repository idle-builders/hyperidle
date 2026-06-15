# AK4 — Architecture: the Assistant can draft and shape a bet

**Fixed inputs:** `plans/AK4/concept.md` (locked nouns + contracts), `plans/AK4/design/approved.md` (locked visual contract). Do not re-litigate.

**Headline.** AH3 already ships substantive Assistant replies. AK4's real work is **giving the conversational turn a bounded tool-use loop** so it can call `create_bet`/`edit_bet`, then **surfacing the resulting draft** via the existing `payload.toolCalls` + `BetCard` path. No new runtime, no new message type, no new tool, no new bet status.

---

## Required reading (engineer, before implementing)

- `packages/server/src/services/assistant-turn.ts` — `runAssistantTurn`/`runTurnInternal`; the `tools: []` SessionConfig at ~L398; the completion→persist branch at ~L437.
- `packages/server/src/harness/builtin-harness-adapter.ts` — `runChatTurn` (~L430, the conversational path), `runExecuteTurn`/`executeToolCalls` (~L521/L633, the tool-use machinery to reuse), `setSessionToolRegistry`/`toolDefsFromRegistry` (~L165/L842, the registry-injection path), `tool_call`/`completion` stream events.
- `packages/shared/src/harness/harness-adapter.ts` ~L115 — `mcpSupport` flag: for non-MCP adapters the provisioner intercepts `tool_call` events; the builtin adapter (`mcpSupport:false`) has BOTH an internal registry path (`setSessionToolRegistry` + internal `executeToolCalls`) AND external interception. AK4 uses the **internal** path (Task 1) since `runAssistantTurn` drives the builtin adapter directly — no external provisioner loop is in play for the conversational turn.
- `packages/server/src/services/session-provisioning.ts` ~L564 — how a `ToolContext` + `buildToolRegistry` is constructed (the pattern to adapt, task-free).
- `packages/server/src/tools/create-bet.ts`, `edit-bet.ts`, `tool-registry.ts` (`buildToolRegistry`, `ToolContext`, role filter `["assistant"]`), `assistant-tools.ts` (`toolsForAssistant`, `HIGH_RISK_TOOLS`).
- `packages/shared/src/thread.ts` ~L145 — `ToolCallSummary`, `PlainPayload.toolCalls`.
- `packages/web/src/shell/AssistantOverlay.tsx` — `ToolCallRow`/`renderToolCallSummaries`, `renderRefEmbedsForAssistant`.
- `packages/web/src/pages/WorkBet.tsx` — AG3 authoring (`BodyEditor`, `BET_DESCRIPTION_MUTABLE_STATUSES`), commit affordance.
- `plans/AK4/concept.md`, `plans/AK4/design/approved.md`.

---

## Plan reconciliation (spec ⇆ reality)

| Spec / concept assumption | Reality | Plan handling |
|---|---|---|
| "Assistant never replies — dispatcher only logs" (AK4 spec) | **STALE.** AH3 shipped `runAssistantTurn`; replies work. Dispatcher now only pins thread (AH3 M4). | AC1 is largely already satisfied; AK4 verifies it survives the tool-use change. |
| `create_bet`/`edit_bet` tools must be built | **EXIST** (`create-bet.ts`, `edit-bet.ts`), role-gated `["assistant"]`, produce `draft`. | Reuse unchanged (edit-bet gains a draft-status guard — see Task 5). |
| Turn can call tools | **FALSE today.** `runChatTurn` hardcodes `tools: []` (L449); `runAssistantTurn` builds SessionConfig with `tools: []` (L398) and no registry. | Core change: Tasks 1–3 wire a bounded tool-use loop into the conversational path. |
| Draft surfaced via `payload.toolCalls` + `BetCard` | `PlainPayload.toolCalls` (`ToolCallSummary[]`) EXISTS; overlay renders `ToolCallRow`. `BetCard(status="draft")` EXISTS. | `runAssistantTurn` must capture tool calls and attach them (Task 3); web renders `BetCard` from the toolCall (Task 6). |
| `ToolCallSummary` carries enough to render a navigable `BetCard` | `ToolCallSummary` = `{name, input, output, status}`. `output` is a string; `create_bet` returns `{betId, status, teamId}` as JSON in `result.data`. | `output` already JSON-stringifies the tool result → client parses `betId` from it. No type change needed (see §design-it-twice A). |
| `create_bet` needs `teamId` | Required (`z.string().min(1)`). A conversation has no inherent team. | Task 2: resolve the user's team into `ToolContext.teamId`; tool reads it OR the turn injects team into the system prompt so the model passes it. If user has no team → honest no-draft reply (AC handling). |
| Conversational turn must not become a task session | `runChatTurn` is already task-free (no sandbox, no provisionSession) — AH3 @lore §A. | Preserve: inject a task-free `ToolContext` (synthetic/empty sessionId/taskId, no sandbox IO tools). |
| No new message type | Confirmed — reuse `plain` + `toolCalls` (AH3 §design-it-twice §B rejected new types). | No schema/zod message change. |

**No DB migration required.** `bets` already has `status='draft'`, `description`, `doneCondition`, `hypothesis`. No new columns, no new tables.

---

## Acceptance criteria + verification

**AC1 — Substantive back-and-forth replies (not silence).**
Verify: integration test (`AK4-assistant-draft.integration.test.ts`) posts a human plain message to the assistant thread with a stub adapter that returns a text completion; asserts an `ast-*` plain reply message is persisted and `thread_message_appended` emitted. (Guards AH3 behavior survives the tool-loop refactor.)

**AC2 — Assistant produces a draft bet (goal + concept body) from the conversation.**
Verify: integration test with a stub adapter scripted to emit a `create_bet` tool call (`{teamId, description}`) then a text completion. Asserts: (a) a `bets` row exists with `status='draft'`, `description` = the body, `teamId` = the user's team; (b) the persisted assistant reply's `payload.toolCalls` contains a `{name:'create_bet', status:'ok', output}` entry whose `output` parses to include the new `betId`.

**AC3 — Draft lands as editable draft; Assistant never commits autonomously.**
Verify (two assertions):
- (a) Editable: integration test confirms the created bet is in `draft` and `GET /bets/:id` returns it; `BET_DESCRIPTION_MUTABLE_STATUSES` (web unit test, existing) includes `draft`. No commit side-effect: assert `status` stays `draft` after the turn (no `bet_state_changed(active)` emitted).
- (b) No autonomous commit: unit test asserts `toolsForAssistant()` / the assistant tool registry contains **no** commit/ship/kill tool (the set is `create_bet`, `edit_bet`, …, never `commit_bet`). Static guarantee: there is no `commit_bet` tool anywhere (`grep`); commit is only `POST /bets/:id/commit` (human route).

**AC4 — Conversational iteration updates the draft.**
Verify: integration test runs a second turn in the same thread with a stub adapter scripted to emit `edit_bet({betId, doneCondition})`. Asserts: (a) the **same** `betId` is mutated (no second draft created — bet count for the conversation stays 1); (b) the field changed; (c) the reply's `toolCalls` carries `{name:'edit_bet', status:'ok'}`. The "which draft" binding (most-recent assistant-authored draft in this conversation) is asserted: the test does NOT pass `betId` from the client — the turn resolves it.

---

## Design-it-twice

### A. How the client gets `betId` to render a navigable `BetCard`

**Option A1 — Parse `betId` from `ToolCallSummary.output` (the existing JSON string).**
`create_bet` returns `result.data = {betId, status, teamId}`; `executeToolCalls` JSON-stringifies it into the tool result; `runAssistantTurn` puts that string in `ToolCallSummary.output`. The web layer, when it sees a `toolCalls` entry with `name==='create_bet'|'edit_bet'` and `status==='ok'`, `JSON.parse(output)` → `betId` → fetch the bet (existing `useBets`/bet hook) → render `BetCard`. Trade-off: client does a string-parse + a bet fetch. Reject reason: none fatal — `output` is already structured server data, not free text.

**Option A2 — Add a typed `betDraft` field to `PlainPayload` (or a structured `ToolCallSummary.result`).**
Trade-off: touches the shared message type, the zod message schema, the AF4 payload-drift lore, and every message renderer — wide blast radius (exactly the cost AH3 §design-it-twice §B avoided). Reject: disproportionate for one card; concept closure rule says "no new message type" and this is its spirit.

**Chosen: A1.** Zero shared-type change. The web layer reads `betId` from the already-present `output` JSON and renders `BetCard` via the existing bet fetch. Concept closure honored.

### B. How the conversational turn runs tools without becoming a task session

**Option B1 — Bounded tool-use loop inside `runChatTurn`, registry injected via `setSessionToolRegistry`.**
Give `runChatTurn` the same `callLlm({tools})` + `executeToolCalls` loop the task path uses, but capped at a small `maxToolIterations` (e.g. 3) and with NO planning prompt, NO reflection, NO sandbox. `runAssistantTurn` builds a task-free `ToolContext` (empty sessionId/taskId, no real sandbox), `buildToolRegistry(ctx, {role:'assistant'})`, calls the builtin adapter's `setSessionToolRegistry(sessionId, registry)` before startSession (so `session.registry` + `session.toolDefs` are populated for `runChatTurn`'s loop), and sets `SessionConfig.tools` to the assistant tool names. Note: `setSessionToolRegistry` is builtin-adapter-specific (not on the `HarnessAdapter` interface) — `runAssistantTurn` already narrows to the selected adapter, so a typed access to the builtin method (or a small interface extension) is needed; the conversational turn only runs on the builtin adapter today. Trade-off: `runChatTurn` grows a loop. Reject reason: none — this is the minimal reuse of existing machinery, stays one runtime.

**Option B2 — Route the assistant turn through `provisionSession`/the task path.**
Reject: directly violates concept hard-rule #4 + AH3 @lore §A (pollutes tasks/bets with fake rows, couples chat to the task state machine). Not a real option; listed only to mark it rejected.

**Chosen: B1.** Bounded tool-use loop in the conversational path; task-free `ToolContext`; reuse `executeToolCalls`. The `tool_call` stream events + final completion are drained by `runAssistantTurn`, which assembles `payload.toolCalls` from the call/result pairs and the reply text from the completion.

---

## Types / contracts (no new shared types)

```ts
// EXISTING — reused unchanged:
interface ToolCallSummary { name: string; input: Record<string,unknown>; output: string; status: "ok"|"error" }
interface PlainPayload { text: string; toolCalls?: ToolCallSummary[]; notice?: AssistantNotice; refs?: InlineRef[] }

// create_bet returns (EXISTING): { betId: string; status: "draft"; teamId: string }
// edit_bet returns (EXISTING):   { betId: string }

// NEW (internal to assistant-turn, not shared): the turn captures
type CapturedToolCall = { name: string; input: Record<string,unknown>; output: string; status: "ok"|"error" };
// → mapped 1:1 to ToolCallSummary on the persisted reply payload.
```

**SessionConfig change (server-internal):** `runAssistantTurn` sets `tools: <assistant tool names>` (was `[]`) and injects the registry. The conversational `ToolContext` is task-free:
```ts
const toolContext: ToolContext = {
  db, eventBus,
  agentId: `ast-${userId}`,
  sessionId: crypto.randomUUID(),   // synthetic; no session row
  taskId: "",                        // task-free
  teamId: <resolved user team id>,   // for create_bet
  sandboxPath: "",                   // no sandbox IO
  ingestion: <no-op IngestionHandle>,// not used by bet tools
};
const registry = buildToolRegistry(toolContext, { role: "assistant" });
```

**Drained turn result (adapter → runAssistantTurn):** the chat turn must surface both the final text AND the tool calls. Two viable wirings (pick at impl): (i) extend the conversational drain to collect `tool_call` events + correlate results, or (ii) have `runChatTurn` emit a richer completion. Prefer (i): `drainStreamEvents` already loops events — extend it to accumulate `tool_call` events and the final completion, returning `{text, toolCalls}`. Keeps the adapter's `completion` event shape unchanged (no harness-interface change).

---

## Ordered tasks

1. **Conversational tool-use loop in the adapter.** `builtin-harness-adapter.ts`: change `runChatTurn` from single-shot to a bounded loop (cap `maxToolIterations`, default 3): `callLlm({tools: session.toolDefs})` → if `tool_use` blocks and `session.registry`, `executeToolCalls` (emits `tool_call` events, reused as-is) → append results → loop until text-only `end_turn` or cap. No planning prompt, no reflection, no sandbox. Files: `builtin-harness-adapter.ts`. Test: adapter unit test (extend `builtin-harness-adapter.test.ts`) — scripted LLM stub emits a tool_use then end_turn; assert the tool is invoked via registry and the final completion carries the text. (Supports AC2/AC4.)

2. **Task-free ToolContext + registry in `runAssistantTurn`.** `assistant-turn.ts`: build the task-free `ToolContext` above, resolve the user's team id (single/default team; if none, skip tools and let the model say it can't draft), `buildToolRegistry(ctx,{role:'assistant'})`, call the builtin adapter's `setSessionToolRegistry(sessionId, registry)` before `startSession`, set `SessionConfig.tools` to the assistant tool names. (See §design-it-twice B for the builtin-adapter-method access.) Files: `assistant-turn.ts` (+ a small team-resolution helper). Test: covered by AC2 integration test. (Supports AC2.)

3. **Capture tool calls onto the persisted reply.** `assistant-turn.ts` + `drainStreamEvents`: extend the drain to return `{text, toolCalls: CapturedToolCall[]}`; map each to `ToolCallSummary` (output = JSON of the tool result, incl. `betId`); set `payload.toolCalls` on the persisted reply. Preserve the "never silent" invariant (text-only reply if no tools fired; honest reply if create_bet failed). Files: `assistant-turn.ts`. Test: AC2 asserts `toolCalls` present with parseable `betId`; AC1 asserts a text-only turn still persists a reply. (Supports AC1/AC2.)

4. **"Which draft" binding for iteration.** `assistant-turn.ts`: before the turn, resolve the most-recent `draft` bet authored by `ast-${userId}` in this conversation and surface it to the model (in the system/context: "you previously drafted bet <id>: <goal>. Use edit_bet(<id>, …) to refine it; do not create a new bet"). The model then calls `edit_bet` with the bound `betId`. Binding lives server-side (the turn injects it) — the client never passes a betId. Files: `assistant-turn.ts` (+ helper to find the conversation's current draft). Test: AC4 integration test asserts the same betId is edited and no second draft is created. (Supports AC4.)

5. **Draft-only guard on `edit_bet`.** `edit-bet.ts`: reject when the target bet `status !== 'draft'` (return `{status:'error', message:'Can only edit a draft bet'}`). Enforces concept mutability contract (Assistant edits only drafts). Files: `edit-bet.ts`. Test: unit test on `editBetTool.handler` — committed (`active`) bet → error; draft → ok. (Supports AC3 mutability.)

6. **Render the draft `BetCard` from the toolCall (web).** `AssistantOverlay.tsx`: when a `toolCalls` entry has `name in {create_bet, edit_bet}` and `status==='ok'`, parse `betId` from `output`, fetch the bet (existing bet hook), render `BetCard(status, title=goal, description=excerpt, budgetLabel, onClick→navigate /work/bets/:id)` in the existing `renderRefEmbedsForAssistant` slot — alongside (not replacing) the `ToolCallRow`. Files: `AssistantOverlay.tsx`. Test: component test (`tsx`) — message with a `create_bet` ok toolCall renders a `BetCard` with the goal as title and a click target. (Supports AC2/AC3 surfacing.)

7. **Honest no-team / draft-failure states (web + server copy).** Server: if team resolution fails, the turn replies with copy explaining no draft was created (no toolCalls, no card). Web: a `create_bet` toolCall with `status==='error'` renders the existing error `ToolCallRow`, no `BetCard`. Files: `assistant-turn.ts`, `AssistantOverlay.tsx`. Test: integration — user with no team → reply persisted, no draft bet created, no toolCalls. (Supports AC3/AC1 never-silent.)

8. **Verify suite green.** `npm run check && npm run lint && npm run test && npm run test:integration` (+ snapshot re-bless if AssistantOverlay DOM changes — review the diff, never blind `-u`). Re-bless the catalog snapshot only if a catalogued story DOM changed.

**Dependency order:** 1 → 2 → 3 → (4, 5 parallel) → 6 → 7 → 8. Task 1 is the foundation (the loop); 2–3 feed it; 4–5 are independent refinements; 6–7 are the web surface; 8 gates.

---

## Security & abuse cases

- **Rate-limit on the turn:** the turn is triggered fire-and-forget from `POST /threads/:id/messages` (existing endpoint, existing rate posture). The in-flight guard (`inFlightTurns`) prevents stacked turns per thread. **Applicable + addressed** (reuse existing; the tool loop is capped at `maxToolIterations` to bound cost).
- **Input-trust boundary (agent-authored fields):** `description`/`doneCondition`/`hypothesis` are model-authored and persisted. Already length-capped in `create-bet.ts`/`edit-bet.ts` (`max(65_536)`); rendered as AG3 markdown→blocks (existing sanitization path). **Applicable + addressed.**
- **Cross-team / cross-bet injection:** `create_bet` validates the team exists; `teamId` is bound server-side from the resolved user team, NOT from raw model output where avoidable. `edit_bet` `betId` for iteration is bound from the conversation's draft (Task 4), not free model choice, reducing cross-bet edits. The draft-only guard (Task 5) prevents editing committed bets. **Applicable + addressed.**
- **No autonomous irreversible action:** the assistant tool set has no commit/ship/kill (AC3b static check). Cost stays Kernel-side (existing `checkCostCap` is not on this path — conversational turns already run under the AH3 model-resolution posture). **Applicable + addressed.**
- **Secret handling:** unchanged — model credentials via the existing `resolveAgentModel`/`CredentialResolver`; error mapping (`mapErrorToNotice`) already never leaks key material. **N/A new surface.**
- **Path traversal / SSRF:** no path input, no outbound URL added. **N/A.**

---

## route-checklist
No new routes. The turn fires from the existing `POST /api/threads/:id/messages` handler (`threads.ts` ~L1342, unchanged trigger). `GET /api/bets/:id` (existing) serves the card's bet fetch. No guard/middleware changes.

## protectedTests
- `packages/server/src/routes/__tests__/AH3-assistant-turn.integration.test.ts` — AH3 reply behavior must not regress (AC1).
- `packages/server/src/__tests__/AH3-assistant-turn-unit.test.ts` — error-mapping / never-silent invariants.
- `packages/server/src/tools/__tests__/AD8b-assistant-tools.test.ts` — assistant tool set composition (AC3b relies on no commit tool).
- `packages/fabric/src/__tests__/AH3-compose-assistant-prompt.test.ts` — persona composition byte-equality.

## sharedFiles
- `packages/server/src/services/assistant-turn.ts` (also touched by any AH-track follow-up)
- `packages/server/src/harness/builtin-harness-adapter.ts` (shared harness — coordinate with any harness WP)
- `packages/web/src/shell/AssistantOverlay.tsx` (shared overlay surface)
- `packages/server/src/tools/edit-bet.ts` (shared tool)
- NOT modified: `packages/db/src/schema.ts` (no migration), shared message types.

## Risks / ambiguities
- **Team resolution.** If a user has multiple teams, which is the draft's team? v1: use the user's single/default team; if ambiguous or absent, reply honestly without a draft (AC handling). A multi-team picker is out of scope (concept: out-of-scope autonomy UI).
- **Tool-loop cost.** A bounded loop (cap 3) prevents runaway tool calls within the timeout. The existing `ASSISTANT_TURN_TIMEOUT_MS` still wraps the whole turn.
- **Snapshot net.** If `AssistantOverlay` is a catalogued story, the `BetCard` addition changes its DOM snapshot — re-bless after reviewing the diff (visual-regression rule).
- **HIGH_RISK_TOOLS comment drift.** `assistant-tools.ts` marks `create_bet`/`edit_bet` "requires human approval before execution." Concept hard-rule #3 resolves this: a draft IS the approval surface; no pre-execution gate. Update the comment to reflect "approval = the draft + human commit," do not add a blocking gate.
