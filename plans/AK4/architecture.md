# AK4 — Architecture: the Assistant can draft and shape a bet

**Fixed inputs:** `plans/AK4/concept.md` (locked nouns + contracts), `plans/AK4/design/approved.md` (locked visual contract). Do not re-litigate.

**Headline.** AH3 already ships substantive Assistant replies. AK4's real work is **giving the conversational turn a bounded tool-use loop scoped to exactly two tools** (`create_bet`, `edit_bet`) so it can author/refine a draft bet, then **surfacing the resulting draft** via the existing `payload.toolCalls` + `BetCard` path. No new runtime, no new message type, no new tool, no new bet status.

**Revision note (architecture-critique 6/10 → fixes).** This rev fixes two CRITICALs the reviewer verified against the branch: (1) `edit_bet` is NOT in `ALL_TOOL_DEFINITIONS` — `buildToolRegistry(ctx,{role:'assistant'})` never yields it, so AC4 is unbuildable; (2) `SessionConfig.tools` is dead — the builtin loop uses `session.toolDefs` (the WHOLE injected registry), so `buildToolRegistry(...,{role:'assistant'})` would hand the conversational turn the full role surface (`create_team`, `add_agent`, `create_routine`, `submit_review`, `handoff_to`, …) — an authority/abuse expansion. The fix is a **dedicated 2-tool registry builder** (`buildAssistantDraftRegistry`) injected via `setSessionToolRegistry`, plus registering `editBetTool` so that builder can assemble it. Five WARNINGs (draft-binding source, loop-bound never-silent, hard team injection, LLM-mock seam, design legibility) are resolved below.

---

## Required reading (engineer, before implementing)

- `packages/server/src/services/assistant-turn.ts` — `runAssistantTurn`/`runTurnInternal`; the `tools: []` SessionConfig at ~L398; the completion→persist branch at ~L437.
- `packages/server/src/harness/builtin-harness-adapter.ts` — `runChatTurn` (~L430, the conversational path), `runExecuteTurn`/`executeToolCalls` (~L521/L633, the tool-use machinery to reuse), `setSessionToolRegistry`/`toolDefsFromRegistry` (~L165/L842, the registry-injection path), `tool_call`/`completion` stream events.
- `packages/shared/src/harness/harness-adapter.ts` ~L115 — `mcpSupport` flag: for non-MCP adapters the provisioner intercepts `tool_call` events; the builtin adapter (`mcpSupport:false`) has BOTH an internal registry path (`setSessionToolRegistry` + internal `executeToolCalls`) AND external interception. AK4 uses the **internal** path (Task 1) since `runAssistantTurn` drives the builtin adapter directly — no external provisioner loop is in play for the conversational turn.
- `packages/server/src/services/session-provisioning.ts` ~L564 — how a `ToolContext` + `buildToolRegistry` is constructed (the pattern to adapt, task-free).
- `packages/server/src/tools/create-bet.ts`, `edit-bet.ts`, `tool-registry.ts` (`ALL_TOOL_DEFINITIONS` — **note: `editBetTool` is NOT registered there**, only `createBetTool` at L218; `buildToolRegistry`, `toolsForRole`, `ToolContext`, `wrapForRegistry`), `assistant-tools.ts` (`toolsForAssistant`/`HIGH_RISK_TOOLS` — **DEAD CODE**, imported by nothing in production; do not wire it in).
- `packages/db/src/schema.ts` ~L17/L40-47/L97-104 — `teams`, `users.teamId` (refs `team_members.id`), `teamMembers.teamId` (refs `teams.id`): the two-hop team resolution.
- `packages/web/src/hooks/useBet.ts` — `useBet(betId)` returns `{data, loading, error, refresh}` (exposes `loading` for the card skeleton).
- `packages/design-system/src/BetCard.tsx` — `BetCardProps` (`title`, `team`, `status`, `description?`, `budgetLabel?`, `onClick?`).
- `packages/shared/src/thread.ts` ~L145 — `ToolCallSummary`, `PlainPayload.toolCalls`.
- `packages/web/src/shell/AssistantOverlay.tsx` — `ToolCallRow`/`renderToolCallSummaries`, `renderRefEmbedsForAssistant`.
- `packages/web/src/pages/WorkBet.tsx` — AG3 authoring (`BodyEditor`, `BET_DESCRIPTION_MUTABLE_STATUSES`), commit affordance.
- `plans/AK4/concept.md`, `plans/AK4/design/approved.md`.

---

## Plan reconciliation (spec ⇆ reality)

| Spec / concept assumption | Reality | Plan handling |
|---|---|---|
| "Assistant never replies — dispatcher only logs" (AK4 spec) | **STALE.** AH3 shipped `runAssistantTurn`; replies work. Dispatcher now only pins thread (AH3 M4). | AC1 is largely already satisfied; AK4 verifies it survives the tool-use change. |
| `create_bet`/`edit_bet` tools must be built | **EXIST** as tool files (`create-bet.ts`, `edit-bet.ts`). BUT only `createBetTool` is registered (`tool-registry.ts` L218, `wrapForRegistry(createBetTool,["assistant"])`); **`editBetTool` is NOT in `ALL_TOOL_DEFINITIONS`** — it lives only in `assistant-tools.ts`'s `toolsForAssistant()`, which is **dead code** (imported by nothing in production — confirmed: only its own tests). | **CRITICAL-1 fix:** register `editBetTool` for the `assistant` role (Task 0). edit-bet also gains a draft-status guard (Task 5). |
| Turn can call tools | **FALSE today.** `runChatTurn` hardcodes `tools: []` (L449); `runAssistantTurn` builds SessionConfig with `tools: []` (L398) and no registry. | Core change: Tasks 1–3 wire a bounded tool-use loop into the conversational path. |
| `SessionConfig.tools: [names]` scopes the model | **FALSE — dead field.** The builtin adapter never reads `config.tools`. `runChatTurn`/`runExecuteTurn`/`runPlanningTurn` pass `tools: session.toolDefs` to `callLlm`; `session.toolDefs = toolDefsFromRegistry(registry)` = EVERY tool in the injected registry. So whichever registry is injected via `setSessionToolRegistry` IS the model's full tool surface. | **CRITICAL-2 fix:** inject a **2-tool-only** registry (`buildAssistantDraftRegistry`, Task 2). Do NOT rely on `SessionConfig.tools` and do NOT inject the full role registry. `SessionConfig.tools` is left as `[]` (documented dead). |
| HIGH_RISK_TOOLS enforces a pre-execution gate | **FALSE — dead code.** `HIGH_RISK_TOOLS`/`ASSISTANT_TOOLS`/`toolsForAssistant()` (`assistant-tools.ts`) are imported by nothing in production. The "dispatcher checks this set" docstring describes a gate that was never built. | AC3b targets the **injected conversational registry**, not `toolsForAssistant()`. No live gate to bypass; concept hard-rule #3 ("draft IS the approval surface") holds. Update the misleading `assistant-tools.ts` docstring (Task 0). |
| Draft surfaced via `payload.toolCalls` + `BetCard` | `PlainPayload.toolCalls` (`ToolCallSummary[]`) EXISTS; overlay renders `ToolCallRow`. `BetCard(status="draft")` EXISTS. | `runAssistantTurn` must capture tool calls and attach them (Task 3); web renders `BetCard` from the toolCall (Task 6). |
| `ToolCallSummary` carries enough to render a navigable `BetCard` | `ToolCallSummary` = `{name, input, output, status}`. `output` is a string; `create_bet` returns `{betId, status, teamId}` as JSON in `result.data`. | `output` already JSON-stringifies the tool result → client parses `betId` from it. No type change needed (see §design-it-twice A). |
| `create_bet` needs `teamId` | Required (`z.string().min(1)`). `create_bet` only checks the team EXISTS — it has `@lore AE3: Cross-team scope is intentional` and does NOT verify ownership. A hallucinated/prompt-injected teamId for any existing team would be honored. ALSO: `users.teamId` references `team_members.id` (the membership group), NOT `teams.id` — resolution is two hops: `users.teamId → teamMembers.teamId = the teams.id` that bets require. | **WARNING fix (hard team inject):** the `create_bet` tool in the conversational registry is wrapped so it **overrides any model-supplied `teamId`** with the resolved `teams.id` (Task 2). The model literally cannot redirect the team. If resolution yields no team → registry omits `create_bet` (or the wrapper returns an error) → honest no-draft reply (Task 7). |
| Conversational turn must not become a task session | `runChatTurn` is already task-free (no sandbox, no provisionSession) — AH3 @lore §A. | Preserve: inject a task-free `ToolContext` (synthetic/empty sessionId/taskId, no sandbox IO tools). |
| No new message type | Confirmed — reuse `plain` + `toolCalls` (AH3 §design-it-twice §B rejected new types). | No schema/zod message change. |

**No DB migration required.** `bets` already has `status='draft'`, `description`, `doneCondition`, `hypothesis`. No new columns, no new tables.

---

## Acceptance criteria + verification

**The LLM-mock seam (first-principle Verifiability — read before the ACs).** AH3's integration tests use **stub adapters** that supply a custom `streamEvents` and bypass `startSession`/`runChatTurn` entirely. That seam canNOT prove AK4, because AK4's behavior lives INSIDE `runChatTurn`'s new loop on the **real** `BuiltinHarnessAdapter`. The seam AK4 tests must use is the one the existing adapter unit test already uses: `vi.mock("../llm-client.js")` with `callLlmMock` scripted to return a `tool_use` response then an `end_turn` text response (see `builtin-harness-adapter.test.ts` L28-34, `makeToolCallResponse`/`makeTextResponse`). This drives the **real** `startSession → runLoop → runChatTurn` loop and the real `executeToolCalls`, mocking ONLY the network call. **Every AC2/AC4 proof must run through this seam** — a stub adapter that bypasses `startSession` is not acceptable proof for the loop AK4 builds.

Two test files realize this:
- `builtin-harness-adapter.test.ts` (extend) — Task 1's adapter-level proof of the conversational loop (mock `callLlm`, real adapter, real registry-via-`setSessionToolRegistry`).
- `AK4-assistant-draft.integration.test.ts` (new) — end-to-end via `runAssistantTurn` with a real `BuiltinHarnessAdapter` in the pool and `callLlm` mocked (`vi.mock` the llm-client). NO stub adapter, NO `deps.runTurn` override (that override skips the entire turn — fine only for AC1's trigger-fires assertion if reused, but AC2/AC4 must run the real path).

**AC1 — Substantive back-and-forth replies (not silence).**
Verify: integration test in `AK4-assistant-draft.integration.test.ts` posts a human plain message; `callLlm` mocked to return a single text `end_turn` (no tool_use). Asserts an `ast-*` plain reply is persisted with `payload.text` = the completion and `payload.toolCalls` absent/empty, and `thread_message_appended` emitted. Runs the REAL `runChatTurn`. (Guards AH3 never-silent + text-only path survives the loop refactor.)

**AC2 — Assistant produces a draft bet (goal + concept body) from the conversation.**
Verify: integration test, `callLlm` mocked to return `tool_use(create_bet, {description, doneCondition})` on call 1, then text `end_turn` on call 2. The REAL `runChatTurn` loop calls the REAL `create_bet` handler via the injected registry. Asserts: (a) a `bets` row exists with `status='draft'`, `description` = the body, `teamId` = the resolved `teams.id` (NOT any model-supplied value — the model is scripted to omit teamId, or to supply a wrong one, and the row still carries the resolved team — proves the hard inject); (b) the persisted assistant reply's `payload.toolCalls` contains a `{name:'create_bet', status:'ok', output}` entry whose `output` JSON parses to include the new `betId`.

**AC3 — Draft lands as editable draft; Assistant never commits autonomously.**
Verify (two assertions):
- (a) Editable: integration test confirms the created bet is in `draft` and `GET /bets/:id` returns it; `BET_DESCRIPTION_MUTABLE_STATUSES` (web unit test, existing) includes `draft`. No commit side-effect: assert `status` stays `draft` after the turn.
- (b) **AC3b — no commit tool in the injected registry (static/structural).** Unit test on `buildAssistantDraftRegistry(ctx)` (Task 2): assert `registry.definitions.map(d => d.name)` is **exactly** `["create_bet","edit_bet"]` (sorted) — proves the conversational turn can NEVER call `create_team`/`add_agent`/`submit_review`/`handoff_to`/etc., and contains no commit/ship/kill tool. This is the corrected AC3b — it targets the **injected conversational registry**, not the dead `toolsForAssistant()`. Plus a static guarantee: no `commit_bet`/`ship_bet`/`kill_bet` tool exists anywhere (commit is only the human route `POST /bets/:id/commit`) — enforced as a structural assertion in the same unit test (`ALL_TOOL_DEFINITIONS` contains no such name) rather than a runtime behavior test.

**AC4 — Conversational iteration updates the draft.**
Verify: integration test runs turn 1 (create_bet, as AC2), then a second turn in the same thread; turn 2's `callLlm` mock returns `tool_use(edit_bet, {doneCondition})` then text `end_turn`. Crucially the mock's `edit_bet` input does **not** include a `betId` from the client — the turn resolves it (see "which draft" binding below) and injects it. Asserts: (a) the **same** `betId` is mutated (bet count for the conversation stays 1 — no second draft); (b) the field changed; (c) the reply's `toolCalls` carries `{name:'edit_bet', status:'ok'}`. (Requires CRITICAL-1: `edit_bet` registered. If still absent, the model gets a `FORBIDDEN`/`NOT_FOUND` tool_result and this AC fails — which is the point of the failing red test.)

**AC4-loop-bound — never-silent on iteration-cap exhaustion (WARNING fix).**
Verify: integration test, `callLlm` mocked to return a `tool_use` on EVERY call (never an `end_turn`). Asserts: (a) a plain reply IS persisted (never-silent invariant holds), (b) `executeToolCalls` ran **≤ `MAX_TOOL_ITERATIONS` (3)** times (assert via tool-call count / number of `create_bet` rows ≤ 3, or spy on the registry), (c) the persisted reply text is the last model text OR the explicit cap-fallback copy (Task 1) — not empty.

---

## Design-it-twice

### A. How the client gets `betId` to render a navigable `BetCard`

**Option A1 — Parse `betId` from `ToolCallSummary.output` (the existing JSON string).**
`create_bet` returns `result.data = {betId, status, teamId}`; `executeToolCalls` JSON-stringifies it into the tool result; `runAssistantTurn` puts that string in `ToolCallSummary.output`. The web layer, when it sees a `toolCalls` entry with `name==='create_bet'|'edit_bet'` and `status==='ok'`, `JSON.parse(output)` → `betId` → fetch the bet (existing `useBets`/bet hook) → render `BetCard`. Trade-off: client does a string-parse + a bet fetch. Reject reason: none fatal — `output` is already structured server data, not free text.

**Option A2 — Add a typed `betDraft` field to `PlainPayload` (or a structured `ToolCallSummary.result`).**
Trade-off: touches the shared message type, the zod message schema, the AF4 payload-drift lore, and every message renderer — wide blast radius (exactly the cost AH3 §design-it-twice §B avoided). Reject: disproportionate for one card; concept closure rule says "no new message type" and this is its spirit.

**Chosen: A1.** Zero shared-type change. The web layer reads `betId` from the already-present `output` JSON and renders `BetCard` via the existing bet fetch. Concept closure honored.

### B. How the conversational turn runs tools without becoming a task session

**Option B1 — Bounded tool-use loop inside `runChatTurn`, a DEDICATED 2-tool registry injected via `setSessionToolRegistry`.**
Give `runChatTurn` the same `callLlm({tools: session.toolDefs})` + `executeToolCalls` loop the task path uses, but capped at `MAX_TOOL_ITERATIONS = 3`, with NO planning prompt, NO reflection, NO sandbox, and a defined cap-exhaustion fallback (never silent). `runAssistantTurn` builds a task-free `ToolContext` (synthetic sessionId, empty taskId, no real sandbox), then calls **`buildAssistantDraftRegistry(ctx, {resolvedTeamId, currentDraftBetId})`** — a NEW purpose-built builder (Task 2) that returns a registry whose `definitions` are EXACTLY `[create_bet (team-injected wrapper), edit_bet (betId-bound + draft-guarded wrapper)]`. It calls the builtin adapter's `setSessionToolRegistry(sessionId, registry)` before `startSession` (populating `session.registry` + `session.toolDefs`). `SessionConfig.tools` stays `[]` (dead field; documented). `setSessionToolRegistry` is builtin-adapter-specific (not on `HarnessAdapter`); `runAssistantTurn` narrows the selected adapter via `selected.meta.type === "builtin"` then casts to `BuiltinHarnessAdapter` (the existing X6 provisioning pattern). Trade-off: a small new builder fn + `runChatTurn` grows a loop. Reject reason: none — minimal reuse, stays one runtime, and (unlike `buildToolRegistry(...,{role:'assistant'})`) does NOT leak the full role surface.

**Why a dedicated builder, not `buildToolRegistry(ctx,{role:'assistant'})`?** (CRITICAL-2.) The full assistant role registry includes `create_team`, `add_agent`, `create_routine`, `update_routine`, `submit_review`, `handoff_to`, `send_message`, `create_task`, `create_artifact`, … Because the loop uses `session.toolDefs` (= the whole injected registry, not `SessionConfig.tools`), injecting that registry would let a single conversational turn create teams, add agents, hand off, or post reviews — far beyond AK4's concept ("authors/updates exactly one draft bet") and a real abuse surface. The dedicated builder is the authority boundary, verified statically by AC3b.

**Option B2 — Inject `buildToolRegistry(ctx,{role:'assistant'})` and filter by `SessionConfig.tools`.**
Reject: `SessionConfig.tools` is dead (the adapter never reads it) — this filters nothing; the model still sees the full role surface. This is exactly the CRITICAL-2 trap. Listed to mark it rejected.

**Option B3 — Route the assistant turn through `provisionSession`/the task path.**
Reject: directly violates concept hard-rule #4 + AH3 @lore §A (pollutes tasks/bets with fake rows, couples chat to the task state machine). Not a real option; listed only to mark it rejected.

**Chosen: B1.** Bounded tool-use loop in the conversational path; task-free `ToolContext`; reuse `executeToolCalls`; a dedicated 2-tool registry as the authority boundary.

### C. "Which draft to edit" binding — source of truth (WARNING fix)

The concept defers the binding mechanism to architecture. The reviewer correctly flagged: **`bets` has NO `threadId` and NO author/`createdBy` column** (`create-bet.ts` writes only `{id, teamId, description, doneCondition, hypothesis, status, createdAt}`). So "the draft authored by `ast-${userId}` in this conversation" is **not queryable from the `bets` table**. Binding source MUST be the **thread transcript**:

1. Before the turn, scan the thread's prior messages (already loaded for the transcript) for assistant (`senderId === ast-${userId}`) `plain` messages whose `payload.toolCalls` contains a `{name:'create_bet'|'edit_bet', status:'ok'}` entry. Parse `betId` from the newest such entry's `output` JSON. (Reuse the existing transcript query in `assistant-turn.ts`; widen it to read `payload.toolCalls`, not just `payload.text`.)
2. **Validate liveness:** fetch that bet; if it still exists AND `status === 'draft'`, bind it → `currentDraftBetId`. If it is committed (`active`)/`completed`/`killed`/deleted, do **NOT** rebind — drop the binding (`currentDraftBetId = undefined`); a subsequent `create_bet` produces a fresh draft, or the model replies without one.
3. **None found:** `currentDraftBetId = undefined`. The `edit_bet` wrapper, called with no bound betId, returns `{status:'error', message:'No draft to edit yet — describe the bet and I'll draft it first.'}`; the model surfaces this honestly (never silent). The expected model behavior (system-prompt nudge) is: with no current draft, use `create_bet`; with one, use `edit_bet`.
4. **`edit_bet` betId is server-bound, not model-chosen:** the `edit_bet` wrapper in `buildAssistantDraftRegistry` **forces** `betId = currentDraftBetId`, ignoring any model-supplied `betId`. This + the draft-only guard (Task 5) means the conversational turn can only ever mutate the one bound draft — no cross-bet edits.

**Cardinality decision (one draft per conversation).** The binding picks the NEWEST draft. If a founder asks for two bets in one thread, a second `create_bet` orphans the first as a stale draft in history (still valid, still editable in WorkBet, just no longer the bound target). This is the accepted v1 tradeoff (concept: "one living draft per drafting conversation"); not enforced as a hard 1-row cap. `inFlightTurns` (keyed `userId:threadId`) already serializes turns, so two concurrent turns can't double-create.

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

**CRITICAL-1 — register `edit_bet` (Task 0).** In `tool-registry.ts`, add to `ALL_TOOL_DEFINITIONS` next to the existing `createBetTool`:
```ts
import { editBetTool } from "./edit-bet.js";
// …
wrapForRegistry(createBetTool, ["assistant"]),
wrapForRegistry(editBetTool, ["assistant"]),   // ADDED — both AssistantToolShape; same wrapper
```
This makes `edit_bet` available for the assistant role so `buildAssistantDraftRegistry` can assemble it. (Scope decision: register ONLY `create_bet` + `edit_bet` for the assistant role here. `update_task_status`/`edit_block` from the dead `toolsForAssistant()` are out of AK4 scope — do not add them.)

**CRITICAL-2 — the dedicated 2-tool registry builder (Task 2).** NEW function, server-internal (new file `packages/server/src/tools/assistant-draft-registry.ts` or exported from `tool-registry.ts`):
```ts
interface AssistantDraftRegistryParams {
  resolvedTeamId: string | undefined;   // resolved teams.id, or undefined when no team
  currentDraftBetId: string | undefined; // bound draft from transcript (§C), or undefined
}
// Returns a ToolRegistry whose `definitions` are EXACTLY [create_bet, edit_bet]:
//  - create_bet: wrapped so it HARD-INJECTS teamId = resolvedTeamId, ignoring any
//    model-supplied teamId (the model cannot redirect the team). If resolvedTeamId is
//    undefined, the wrapper returns {status:'error','no team'} → honest no-draft reply.
//  - edit_bet: wrapped so it FORCES betId = currentDraftBetId, ignoring any model betId.
//    If currentDraftBetId is undefined → {status:'error','no draft to edit yet'}.
// Implementation: reuse the existing tool handlers; the wrapper rewrites `input` before
// calling the real handler, then registers via the same toRegistered/wrapForRegistry path.
function buildAssistantDraftRegistry(
  ctx: ToolContext,
  params: AssistantDraftRegistryParams,
): ToolRegistry;
```
AC3b asserts `registry.definitions.map(d=>d.name).sort()` deep-equals `["create_bet","edit_bet"]`.

**Team resolution (WARNING fix — two hops).** `users.teamId` references `team_members.id` (NOT `teams.id`). Resolve: `users.teamId` (the founder's membership-group id) → `teamMembers.teamId` = the `teams.id` `create_bet` requires. New helper `resolveDraftTeamId(db, userId): Promise<string | undefined>`: load `users.teamId`; if null → undefined; else load `teamMembers` row → return its `teamId`. The resolved value is passed to `buildAssistantDraftRegistry` and hard-injected; it is NOT placed in `ToolContext.teamId` and trusted to the model.

**The conversational `ToolContext` is task-free:**
```ts
const toolContext: ToolContext = {
  db, eventBus,
  agentId: `ast-${userId}`,
  sessionId: <the sessionConfig.sessionId>, // synthetic; no session row
  taskId: "",                                // task-free
  sandboxPath: "",                           // no sandbox IO
  ingestion: <no-op IngestionHandle>,        // not used by bet tools
};
// teamId is NOT set here — it is hard-injected by the create_bet wrapper from resolveDraftTeamId().
const registry = buildAssistantDraftRegistry(toolContext, { resolvedTeamId, currentDraftBetId });
```
`SessionConfig.tools` stays `[]` (dead field; leave a comment that the adapter ignores it).

**Capturing tool calls onto the reply (drain → `payload.toolCalls`).** The `tool_call` HarnessEvent carries `{toolName, args}` but NOT the result (no result field on the event). Rather than correlate `tool_call` events to later messages, **capture call+result pairs inside `runChatTurn`** where both are in hand (the `toolCalls` blocks and the `executeToolCalls` results), and emit them. Chosen wiring: extend the adapter's `CompletionEvent` consumption — `runChatTurn` accumulates `CapturedToolCall[]` (name, input=args, output=JSON of `result.data` or the error string, status from `result.success`) across loop iterations and surfaces them via a NEW optional field on the completion path. Concretely: add `toolCalls?: CapturedToolCall[]` to `CompletionEvent` in `harness-events.ts` (a small additive field — populated only by `runChatTurn`, ignored elsewhere), and `drainStreamEvents` returns `{type:'completion', text, toolCalls}`. `runAssistantTurn` maps each `CapturedToolCall` 1:1 to `ToolCallSummary` and sets `payload.toolCalls`. This keeps the call/result correlation server-side and avoids a second transcript scan. (Additive optional field on an existing event = minimal blast radius; no message-type change, honoring concept closure.)

**Cap-exhaustion fallback (never-silent, WARNING fix).** When the loop hits `MAX_TOOL_ITERATIONS` without a text `end_turn`, `runChatTurn` emits a `completion` with the last available assistant text, or, if none, the fallback string `"I started shaping that but ran out of steps — say 'continue' and I'll keep going."` plus whatever `toolCalls` fired. Never emits an empty completion; `session.done = true`.

---

## Ordered tasks

0. **[CRITICAL-1] Register `edit_bet` for the assistant role.** `tool-registry.ts`: import `editBetTool`; add `wrapForRegistry(editBetTool, ["assistant"])` to `ALL_TOOL_DEFINITIONS` beside the existing `createBetTool`. Also: update the misleading `assistant-tools.ts` `HIGH_RISK_TOOLS`/`toolsForAssistant()` docstring to note it is unused-by-production (the "dispatcher checks this set" gate was never built) so the next agent doesn't trust a phantom gate. Files: `tool-registry.ts`, `assistant-tools.ts` (comment only). Test: unit test asserts `toolsForRole("assistant").map(d=>d.name)` includes both `create_bet` and `edit_bet`. (Unblocks AC4.)

1. **Conversational tool-use loop in the adapter (+ never-silent cap fallback + tool-call capture).** `builtin-harness-adapter.ts`: change `runChatTurn` from single-shot (`tools:[]`) to a bounded loop, cap `MAX_TOOL_ITERATIONS = 3`: `callLlm({tools: session.toolDefs})` → if `tool_use` blocks and `session.registry`, append assistant message, `executeToolCalls` (reused; emits `tool_call` events), accumulate `CapturedToolCall[]` from the call inputs + results, append `tool_result` user message, loop; exit on text `end_turn`/`stop` or cap. NO planning prompt, NO reflection, NO sandbox. On cap-hit: emit a `completion` with last text or the fallback copy (never empty). Emit the final `completion` carrying `{text, toolCalls: CapturedToolCall[]}` (additive optional `toolCalls?` field on `CompletionEvent`, `harness-events.ts`). Files: `builtin-harness-adapter.ts`, `packages/shared/src/harness/harness-events.ts`. Tests (extend `builtin-harness-adapter.test.ts`, REAL adapter + `vi.mock("../llm-client.js")`): (a) tool_use→end_turn → tool invoked via registry, completion text + `toolCalls[0]` present; (b) **cap test:** tool_use every call → ≤3 executions AND a non-empty completion emitted. (Supports AC2/AC4 + AC4-loop-bound. Protected: must not regress `runPlanningTurn`/`runExecuteTurn`.)

2. **[CRITICAL-2] Dedicated 2-tool registry + team resolution + draft binding in `runAssistantTurn`.** New `buildAssistantDraftRegistry(ctx, {resolvedTeamId, currentDraftBetId})` (new file `tools/assistant-draft-registry.ts`) returning EXACTLY `[create_bet (team-hard-injected), edit_bet (betId-bound)]`. New `resolveDraftTeamId(db, userId)` helper (two-hop `users.teamId → teamMembers.teamId`). New `resolveCurrentDraftBetId(transcriptRows, astAgentId, db)` helper (§C: scan prior `payload.toolCalls` for newest `create_bet`/`edit_bet` ok `betId`; validate still `status='draft'`). In `runAssistantTurn`: build task-free `ToolContext`, resolve team + draft binding, `buildAssistantDraftRegistry(...)`, narrow `selected.meta.type==='builtin'` → cast to `BuiltinHarnessAdapter` → `setSessionToolRegistry(sessionId, registry)` BEFORE `startSession`. Leave `SessionConfig.tools: []` with a "dead field — adapter ignores" comment. Files: `tools/assistant-draft-registry.ts` (new), `assistant-turn.ts`. Tests: **AC3b unit** — `buildAssistantDraftRegistry` `.definitions` names === `["create_bet","edit_bet"]` and `ALL_TOOL_DEFINITIONS` has no `commit_bet`/`ship_bet`/`kill_bet`; **team-inject unit** — `create_bet` via this registry with a wrong model teamId still writes the resolved `teams.id`; `resolveDraftTeamId` unit (two-hop). (Supports AC2/AC3b + team-inject WARNING.)

3. **Capture tool calls onto the persisted reply.** `assistant-turn.ts` + `drainStreamEvents`: extend the drain to return `{type:'completion', text, toolCalls: CapturedToolCall[]}` (read the new `CompletionEvent.toolCalls`); map each to `ToolCallSummary` (output = JSON incl. `betId`); set `payload.toolCalls` on the persisted reply when present. Preserve never-silent (text-only reply when no tools fired). Files: `assistant-turn.ts`. Test: AC2 integration asserts `payload.toolCalls` present with parseable `betId`; AC1 asserts a text-only turn persists a reply with no `toolCalls`. (Supports AC1/AC2.)

4. **Draft binding wiring + model nudge for iteration.** `assistant-turn.ts`: pass `currentDraftBetId` (from Task 2's resolver) into `buildAssistantDraftRegistry`; when set, append a system/context nudge: "You previously drafted bet <id>. Use edit_bet to refine it; do not create a new bet." `edit_bet`'s betId is server-forced regardless. When unset, nudge toward `create_bet`. Files: `assistant-turn.ts`. Test: AC4 integration — turn 2's `edit_bet` (no client betId) mutates the SAME betId, bet count stays 1, reply `toolCalls` has `edit_bet ok`; plus a "no draft yet → edit_bet returns honest error, never silent" case. (Supports AC4.)

5. **Draft-only guard on `edit_bet`.** `edit-bet.ts`: after loading `existing`, reject when `existing.status !== 'draft'` → `{status:'error', message:'Can only edit a draft bet.'}` (before the update). Enforces concept mutability. Files: `edit-bet.ts`. Test: unit on `editBetTool.handler` — `active` bet → error, no DB write; `draft` → ok. (Supports AC3 mutability; defense-in-depth behind the binding's liveness check.)

6. **Render the draft `BetCard` from the toolCall (web) + loading state + same-id navigation.** `AssistantOverlay.tsx`: when a `toolCalls` entry has `name in {create_bet, edit_bet}` and `status==='ok'`, parse `betId` from `output`, `useBet(betId)` (existing hook — exposes `loading`), and render alongside (not replacing) the `ToolCallRow`: while `loading` → a skeleton/placeholder card (design WARNING: post-turn fetch needs its own loading state, not the turn-level "Thinking…"); on data → `BetCard(title=goal, status, team, description=~140-char excerpt, budgetLabel, onClick→navigate '/work/bets/'+betId)`. **Every card's `onClick` uses the toolCall's own `betId`** — for `create_bet` and `edit_bet` alike this is the live bound bet id (binding is server-side, §C), so a stale-excerpt card never mis-navigates (design WARNING: all cards point at the same live bet). Created-vs-updated stays carried by the `ToolCallRow` copy ("Drafted a bet" / "Updated the draft") — accepted tradeoff per design-critique (copy-only signal sufficient; the card is intentionally byte-identical across states). Files: `AssistantOverlay.tsx`. Test: component `.test.tsx` — `create_bet` ok toolCall → renders skeleton then BetCard (mock `useBet`) with goal title + click target; `edit_bet` ok toolCall → card navigates to the same betId. (Supports AC2/AC3/AC4 surfacing + 3 design WARNINGs.)

7. **Honest no-team / draft-failure states.** Server: when `resolveDraftTeamId` returns undefined, the `create_bet` wrapper errors → the model's reply explains no draft was created; persisted as a plain reply (NOT a `notice` card — notices are reserved for `missing_key`/`missing_harness`/`provider_error`, per design SUGGESTION). Web: a `create_bet`/`edit_bet` toolCall with `status==='error'` renders the existing error `ToolCallRow`, NO `BetCard`. Files: `assistant-turn.ts` (ensure plain reply path), `AssistantOverlay.tsx`. Test: integration — user with no team → plain reply persisted, no draft bet row, error `toolCalls` (or none), never silent. (Supports AC1/AC3 never-silent.)

8. **Verify suite green.** `npm run check && npm run lint && npm run test && npm run test:integration`. No catalog-snapshot re-bless expected: `AssistantOverlay` is in `packages/web` (NOT a catalogued design-system story — critique SUGGESTION correction) and `BetCard` is unchanged. If `npm run test` reports a design-system snapshot diff, something unintended changed — investigate, never blind `-u`.

**Dependency order:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Task 0 unblocks the registry; Task 1 is the loop foundation (uses the new `CompletionEvent.toolCalls`); Task 2 builds the scoped registry + resolvers Tasks 3–4 consume; 5 is independent defense-in-depth (can run anytime after 0); 6–7 are the web surface; 8 gates. (Tasks 4 and 5 may run in parallel after 2.)

---

## Security & abuse cases

- **Rate-limit on the turn:** the turn is triggered fire-and-forget from `POST /threads/:id/messages` (existing endpoint, existing rate posture). The in-flight guard (`inFlightTurns`) prevents stacked turns per thread. **Applicable + addressed** (reuse existing; the tool loop is capped at `maxToolIterations` to bound cost).
- **Input-trust boundary (agent-authored fields):** `description`/`doneCondition`/`hypothesis` are model-authored and persisted. Already length-capped in `create-bet.ts`/`edit-bet.ts` (`max(65_536)`); rendered as AG3 markdown→blocks (existing sanitization path). **Applicable + addressed.**
- **Cross-team injection (HARD inject, not "where avoidable"):** `create_bet` only checks the team EXISTS (`@lore AE3` cross-team scope intentional) — a hallucinated/injected teamId for any existing team would be honored. The conversational `create_bet` wrapper (Task 2) **overrides any model-supplied `teamId`** with `resolveDraftTeamId(db, userId)` (two-hop `users.teamId → teamMembers.teamId`). The model cannot redirect the team — verified by the team-inject unit test. **Applicable + addressed (hard).**
- **Cross-bet edit:** `edit_bet`'s `betId` is server-FORCED to the conversation's bound draft (Task 2/4), ignoring model-supplied betId; the draft-only guard (Task 5) + the binding's liveness check (§C: never rebind a committed bet) prevent editing any committed or other-conversation bet. **Applicable + addressed.**
- **Authority-scope expansion (the CRITICAL-2 abuse surface):** the conversational turn injects a registry of EXACTLY `[create_bet, edit_bet]` (Task 2), NOT the full assistant role surface. A conversational turn therefore cannot `create_team`/`add_agent`/`create_routine`/`submit_review`/`handoff_to`/`send_message`. Verified statically by AC3b (`registry.definitions` names === `["create_bet","edit_bet"]`). **Applicable + addressed.**
- **No autonomous irreversible action:** no commit/ship/kill tool exists anywhere (commit is only the human route `POST /bets/:id/commit`); the injected registry contains none (AC3b). Cost stays Kernel-side; the tool loop is capped at `MAX_TOOL_ITERATIONS=3` and wrapped by `ASSISTANT_TURN_TIMEOUT_MS`. **Applicable + addressed.**
- **Secret handling:** unchanged — model credentials via the existing `resolveAgentModel`/`CredentialResolver`; error mapping (`mapErrorToNotice`) already never leaks key material. **N/A new surface.**
- **Path traversal / SSRF:** no path input, no outbound URL added. **N/A.**

---

## route-checklist
No new routes. The turn fires from the existing `POST /api/threads/:id/messages` handler (`threads.ts` ~L1342, unchanged trigger). `GET /api/bets/:id` (existing) serves the card's bet fetch. No guard/middleware changes.

## protectedTests
- `packages/server/src/harness/__tests__/builtin-harness-adapter.test.ts` — Task 1 changes the most-shared harness file next to `runExecuteTurn`/`runPlanningTurn`/`runMaxIterationsTurn`; the task-loop (planning/execute/reflect) MUST NOT regress — a regression there breaks every task session.
- `packages/server/src/routes/__tests__/AH3-assistant-turn.integration.test.ts` — AH3 reply behavior must not regress (AC1).
- `packages/server/src/__tests__/AH3-assistant-turn-unit.test.ts` — error-mapping / never-silent invariants.
- `packages/server/src/tools/__tests__/AD8b-assistant-tools.test.ts` — note: this tests the DEAD `toolsForAssistant()` path; AK4 leaves its behavior intact (only its docstring is touched). AC3b's real guarantee is the NEW `buildAssistantDraftRegistry` unit test, not this one.
- `packages/fabric/src/__tests__/AH3-compose-assistant-prompt.test.ts` — persona composition byte-equality.

## sharedFiles
- `packages/server/src/services/assistant-turn.ts` (also touched by any AH-track follow-up)
- `packages/server/src/harness/builtin-harness-adapter.ts` (shared harness — coordinate with any harness WP; Task 1 sits next to the task loop)
- `packages/shared/src/harness/harness-events.ts` (shared event type — additive optional `CompletionEvent.toolCalls` field; non-breaking)
- `packages/server/src/tools/tool-registry.ts` (shared registry — Task 0 adds `edit_bet` to `ALL_TOOL_DEFINITIONS`; affects every assistant-role registry build)
- `packages/web/src/shell/AssistantOverlay.tsx` (shared overlay surface)
- `packages/server/src/tools/edit-bet.ts` (shared tool — gains draft-status guard)
- NEW: `packages/server/src/tools/assistant-draft-registry.ts` (the 2-tool builder)
- NOT modified: `packages/db/src/schema.ts` (no migration), shared message types (`PlainPayload`/`ToolCallSummary` reused unchanged).

## Risks / ambiguities
- **Team resolution.** `users.teamId` → `team_members.id` (1:1 membership group, U1) → `teamMembers.teamId` = `teams.id`. v1: a founder has one membership group → one team. If `users.teamId` is null → undefined → honest no-draft reply. A multi-team picker is out of scope.
- **Tool-loop cost.** Bounded loop (`MAX_TOOL_ITERATIONS=3`) prevents runaway tool calls; `ASSISTANT_TURN_TIMEOUT_MS` still wraps the whole turn; cap-exhaustion emits a non-empty reply (never silent).
- **Snapshot net (critique SUGGESTION correction).** `AssistantOverlay` lives in `packages/web` — it is NOT a catalogued design-system story, so the catalog snapshot net does not cover it. `BetCard` IS catalogued but AK4 does NOT change it. So **no re-bless is expected**. The web-side proof is the `AssistantOverlay` `.test.tsx` component test (Task 6). If a design-system snapshot diff appears in `npm run test`, it is unintended — investigate.
- **HIGH_RISK_TOOLS / `toolsForAssistant()` is dead code (critique WARNING).** It enforces no live gate (imported by nothing in production). AK4 does NOT add a pre-execution gate (concept hard-rule #3: the draft IS the approval surface; commit is the human gate). Task 0 updates the misleading docstring; AC3b's static guarantee targets the NEW `buildAssistantDraftRegistry`, not this dead path.
- **`SessionConfig.tools` is dead.** Left as `[]` with a comment; do not wire it (the adapter ignores it — the injected registry is the real surface).
