# AK4 — Approved design (input contract to /architecture)

**Chosen variant:** "Draft card in thread" (routine, zero new components). This is the locked visual + interaction contract. `/architecture` and `/write-code` do not re-decide hierarchy, component vocabulary, or interaction grammar — only the data shapes, routes, and wiring that realize it.

## The surface
The Assistant overlay thread is the single timeline. A drafting turn produces:
1. A substantive reply bubble (text) — AC1.
2. A tool-call summary row (`ToolCallRow` via `payload.toolCalls`) — `create_bet → "Drafted a bet"`, `edit_bet → "Updated the draft"`.
3. A `BetCard(status="draft")` embedded beneath the bubble in the existing `renderRefEmbedsForAssistant` slot, click-through to WorkBet — AC2.

Editing + commit happen in the existing `WorkBet` page (AG3 `BodyEditor`, human-only commit) — AC3. Conversational iteration calls `edit_bet`; the card re-renders updated, one bet id, in place — AC4.

## Component mapping
| Slot | Component | Props / notes |
|---|---|---|
| Reply text | existing assistant `plain` message bubble | unchanged |
| Action signal | `ToolCallRow` (AssistantOverlay) | fed from `payload.toolCalls`; copy per above |
| Draft card | **`BetCard`** (`@hyperidle/design-system`) | `title`=goal, `status="draft"`, `team`=team name, `description`=body excerpt (~140 char), `budgetLabel`=appetite if set, `onClick`→navigate `/work/bets/:id` |
| Card placement | existing embed container `flex flex-col gap-1 mt-1` under the bubble | same slot as `BlockRefEmbed` |
| Editor | existing `WorkBet` + `BodyEditor` (AG3) | draft is mutable (`BET_DESCRIPTION_MUTABLE_STATUSES`) |
| Commit | existing WorkBet commit affordance | human-only; Assistant has no commit path |

## States + copy
- **Pre-draft:** text reply only, no row, no card.
- **Drafted:** reply text + `create_bet` row ("Drafted a bet") + `BetCard(draft)`.
- **Iterated:** new message: reply text + `edit_bet` row ("Updated the draft") + `BetCard(draft)` with updated content (same bet id). Prior cards remain in history.
- **Loading:** existing "Thinking…" indicator (AH3 §1.7b) — covers the longer tool-use turn.
- **Error (turn-level):** existing notice cards (`missing_key`/`missing_harness`/`provider_error`).
- **Error (draft couldn't be created, e.g. no team):** turn still replies; reply text explains honestly ("I couldn't create the draft — you don't have a team yet."), no card. Never silent.
- **Overflow:** `BetCard` title truncates (existing); body excerpt capped at ~140 chars + ellipsis.

## Behavior
- Card: button-role click target (`BetCard` `clickableProps`), Enter/Space → navigate to WorkBet, existing hover lift (`--shadow-default`→`--shadow-elevated`, `--motion-fast`).
- Iteration: founder types in the existing composer; no new affordance.
- No new motion, no new keyboard shortcut.

## Mobile
`BetCard` is responsive; renders at message-column width like `BlockRefEmbed`. Click-through to the WorkBet tab. No special-casing.

## Open questions for the architect
1. **Surfacing the draft to the client.** How does the founder's overlay learn a draft was created so it can render the card? Options: (a) the assistant reply message's `payload.toolCalls` carries the `betId` + summary, and the client renders `BetCard` from a bet lookup / from the toolCall output; (b) a block/bet ref in the message refs (like `BlockRefEmbed`). Recommend (a) — extend the existing `toolCalls` payload to carry enough for the card, OR have the client fetch the bet by id from the tool output. Architecture decides the exact payload shape (concept closure rule: **no new message type** — reuse `plain` + `toolCalls`).
2. **"Which draft to edit" binding** across iteration turns (concept defers this mechanism to architecture): most-recent assistant-authored `draft` bet in the conversation. Architecture defines where this binding lives (e.g. server resolves it before the turn, or the turn's tool context carries it).
3. **Tool wiring into the conversational turn.** The conversational path (`runChatTurn`) currently hardcodes `tools: []`. Architecture must give the Assistant turn a tool-use path so `create_bet`/`edit_bet` can fire — without converting the turn into a task session (concept hard-rule #4: one runtime, no `provisionSession`).
4. **`teamId` for the draft.** `create_bet` requires `teamId`. How is it chosen in a conversation (the user's default/only team? asked in chat? inferred?). Architecture + AC: if no team, the honest no-draft error state above applies.
5. **Status-gated Assistant edits.** `edit_bet` must only mutate while `status='draft'` (concept mutability contract). Architecture: enforce in `edit-bet.ts` or via the conversational binding never re-targeting a committed bet.

## Rejected (locked — see synthesis.md)
In-overlay editor; pre-creation approval modal; draft pane/split view; full inline AG3 blocks in the reply; in-thread Approve/Reject verdict. Do not reintroduce.

---

## Architecture decision — APPROVED (reviewer, round 2, 2026-06-15)

The plan at `plans/AK4/architecture.md` is **APPROVED** (architecture-critique round 2: 8/10, no unaddressed CRITICAL). It is the locked technical contract for `/write-tests` + `/write-code`. The design contract above is unchanged. This section records how the plan resolves the five "Open questions for the architect" so the builder reads one consolidated approved plan.

1. **Surfacing the draft to the client** → Option (a). `runChatTurn` accumulates `CapturedToolCall[]` (name, input, output=JSON of tool result incl. `betId`, status) across the loop and surfaces them on a NEW additive optional field `CompletionEvent.toolCalls?` (`packages/shared/src/harness/harness-events.ts`). `runAssistantTurn` maps each 1:1 to the existing `ToolCallSummary` and sets `payload.toolCalls` on the persisted `plain` reply. Web parses `betId` from the `output` JSON and renders `BetCard` via the existing `useBet(betId)` hook. NO new message type, NO new shared field on `PlainPayload`/`ToolCallSummary`. (Concept closure honored.)
2. **"Which draft to edit" binding** → transcript-sourced (bets have no `threadId`/`createdBy` — confirmed against schema). Server resolves `currentDraftBetId` BEFORE the turn (`resolveCurrentDraftBetId`): scan prior assistant `payload.toolCalls` for the newest `create_bet`/`edit_bet` ok `betId`, then validate it is still `status='draft'` (drop if committed/killed/deleted). `edit_bet`'s `betId` is server-FORCED to this bound id (model-supplied `betId` ignored). One living draft per conversation; newest wins; `inFlightTurns` serializes.
3. **Tool wiring into the conversational turn** → bounded tool-use loop inside `runChatTurn` (`MAX_TOOL_ITERATIONS=3`), reusing `executeToolCalls`, with a task-free `ToolContext` (synthetic sessionId, empty taskId/sandboxPath) and a dedicated `buildAssistantDraftRegistry` injected via `setSessionToolRegistry` BEFORE `startSession`. NO `provisionSession`, NO planning/reflection prompt, NO sandbox (concept hard-rule #4: one runtime). Cap-exhaustion emits a non-empty reply (never silent).
4. **`teamId` for the draft** → resolved server-side via `resolveDraftTeamId(db, userId)` (two-hop `users.teamId → teamMembers.teamId = teams.id`) and HARD-INJECTED by the `create_bet` wrapper; the model cannot redirect the team. No team → honest no-draft plain reply (never silent), no notice card.
5. **Status-gated Assistant edits** → both belt and suspenders: (a) `edit-bet.ts` gains a draft-only guard (reject when `status !== 'draft'`), and (b) the conversational binding never re-targets a committed bet (liveness check in §C). The `edit_bet` betId is server-bound, so no cross-bet edit is possible.

**Authority boundary (the load-bearing decision):** the conversational turn injects a registry of EXACTLY `[create_bet, edit_bet]` — verified by a static unit assertion (AC3b). It provably cannot `create_team`/`add_agent`/`create_routine`/`submit_review`/`handoff_to`/`send_message`/commit/ship/kill. This is the User Sovereignty line in code.

**Builder must-not-drop:** never-silent on cap exhaustion and on empty completion is NOT free in the current `runChatTurn` (`if (text)` + empty-default drain). Implement the explicit fallback (Task 1) and test it (AC4-loop-bound + AC1 empty-completion). Run AC2/AC4 through the REAL `startSession → runChatTurn` loop via the `vi.mock("../llm-client.js")` seam — NOT a stub adapter that bypasses `startSession`.
