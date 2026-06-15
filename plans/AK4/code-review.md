# AK4 — Code Review (Phase 4)

**PR #321** · branch `feat/AK4-assistant-drafts-bet` · reviewer carry-forward from architecture-critique round 2 (8/10, APPROVED).

## Verdict: NOT DONE

One CRITICAL must-fix: `npm run lint` is RED on an AK4-touched file (formatting). CI / `/ship` cannot reach green until fixed. Everything else — all 4 ACs, the authority boundary, User Sovereignty, hard team-inject, draft binding, never-silent cap — is correctly implemented and proven through the real loop. After the lint fix this is a clean DONE.

---

## AC coverage table

| AC | Covered? | By which test / code |
|---|---|---|
| **AC1** — substantive back-and-forth replies (not silence) | YES | `AK4-assistant-draft.integration.test.ts` "AC1: text-only turn" — real `runChatTurn`, asserts `ast-*` plain reply with `payload.text`, no `toolCalls`, `thread_message_appended` fired. Code: `runChatTurn` (text-only path) + `runTurnInternal` persist branch. |
| **AC2** — produce a draft bet (goal + concept body) from conversation | YES | Integration "AC2: create_bet tool_use" — bets row `status='draft'`, `description`/`doneCondition` set, `teamId`=resolved `teams.id`, reply `payload.toolCalls[0]` `create_bet ok` with parseable `betId`. Web: `AK4-AssistantOverlay.bet-card.test.tsx` renders `BetCard` from toolCall output. |
| **AC3** — lands as editable draft; never auto-commits | YES | (a) Integration "AC3a: bet stays draft" — `status` stays `draft`, no `bet_state_changed(active)`. (b) **AC3b structural** — `AK4-assistant-draft-registry.test.ts` asserts `registry.definitions.map(d=>d.name).sort() === ["create_bet","edit_bet"]` AND `ALL_TOOL_DEFINITIONS` has no `commit_bet`/`ship_bet`/`kill_bet`. Editability: `edit-bet.ts` draft-only guard. |
| **AC4** — conversational iteration updates the draft | YES | Integration "AC4: turn1=create_bet, turn2=edit_bet (no client betId)" — same `betId` mutated, bet count stays 1, field changed, reply `toolCalls` has `edit_bet ok`. Binding: `resolveCurrentDraftBetId` (transcript scan + liveness). `edit_bet` betId server-forced. |
| **AC4-loop-bound** (never-silent on cap) | YES | Integration "AC4-loop-bound: always tool_use" — ≤3 bet rows (cap proven), non-empty reply persisted. Code: `runChatTurn` `MAX_TOOL_ITERATIONS=3` + `CAP_FALLBACK`. |

All AC2/AC4 proofs run through the REAL `startSession → runChatTurn → executeToolCalls` loop via `vi.mock("../../harness/llm-client.js")` — verified: NO stub adapter, NO `deps.runTurn` bypass. This is the correct seam the plan mandated. Integration suite: 6/6 pass. Unit: 14/14 pass. Web: 7/7 pass. Protected adapter test (`builtin-harness-adapter.test.ts`): 31/31 pass (no task-loop regression). `npm run check`: PASS (13 packages).

---

## Phase-2 carry-forward verification (the things I said I'd check in code)

- **Registry is EXACTLY `[create_bet, edit_bet]` — no role-surface leak.** VERIFIED. `buildAssistantDraftRegistry` builds `definitions` from two hand-wrapped tools only; AC3b unit asserts it; `runTurnInternal` injects this (never `buildToolRegistry(...,{role:'assistant'})`). The model's tool surface = `session.toolDefs` = these two. Authority boundary is structural.
- **No commit/kill/ship path reachable.** VERIFIED. No such tool exists in `ALL_TOOL_DEFINITIONS` (asserted); the injected registry has neither; commit remains the human route. User Sovereignty enforced structurally.
- **`teamId` hard-injected, model cannot override.** VERIFIED. `createBetDraftInputSchema` OMITS `teamId` → it is not in the Claude tool spec the model sees (`toClaudeToolSpec` derives from the relaxed schema). Wrapper sets `teamId: resolvedTeamId`. Integration "team-inject" test: model supplies `wrong-team-id-from-model` → row still carries resolved `TEAM_ID`. Two-hop resolution (`users.teamId → teamMembers.teamId`) correct + unit-tested.
- **Draft binding (transcript scan) correct on iteration.** VERIFIED. `resolveCurrentDraftBetId` reverse-scans assistant messages' `payload.toolCalls` for newest ok `create_bet`/`edit_bet`, parses `betId`, runs a liveness check (`status==='draft'` only). Committed/killed/deleted → no rebind (continues scan). None-found → `undefined` → `edit_bet` wrapper returns honest `NO_DRAFT` error. Wrong-bet impossible (server-forced betId).
- **Cap-exhaustion never-silent + proven.** VERIFIED. `finalText = lastText || (toolUseBlocks.length>0 ? CAP_FALLBACK : "")`, `emitText = finalText || CAP_FALLBACK` — never empty. AC4-loop-bound test proves a non-empty reply persists with ≤3 executions.
- **Tests exercise the REAL loop, not a bypass stub.** VERIFIED (see above).
- **No `as unknown`/`as any` smuggled into production.** VERIFIED. Diff grep: the only `as unknown` hits are in test files (legit jsdom/router mock plumbing) and the plan doc. Production casts are narrow `as z.infer<...>`/`as typeof parsed` after a `safeParse`/`JSON.parse` guard — sound.
- **AK1 harness nouns respected.** VERIFIED. No `soul`/`skill-tools`. Uses `systemPrompt`/`assembledPrompt` consistently.

---

## Findings

### CRITICAL

- **[lint RED — blocks ship/CI] `packages/server/src/tools/__tests__/tool-registry-role.integration.test.ts:89` fails `biome check`.** The task-8 commit widened the B3 assertion to 21 tools but left the `test(...)` line unformatted (exceeds line width — biome wants the destructured `{ db }` arg wrapped). `npm run lint` → "Found 1 error". This is an AK4-touched file (in the diff), so it is this WP's regression, not pre-existing. CI re-runs lint live → red gate. **Fix:** `npm run lint:fix` (or `biome format --write` on that file), re-verify `npm run lint` is clean, commit. Pure formatting — no behavior change. The assertion itself (21 tools, `edit_bet` now in assistant role) is correct.

### WARNING

- **[slop / readability] Dynamic `await import("@hyperidle/db")` inside the hot scan loop** — `resolveCurrentDraftBetId` (assistant-draft-registry.ts:120) and several integration-test bodies re-import `{ bets }` / `{ messages }` lazily inside loops/functions. In `resolveCurrentDraftBetId` this dynamic import sits inside a nested `for` loop and runs on every candidate toolCall. It works (module cache makes it cheap) but it is an unnecessary in-loop `await import` where a top-level `import { bets }` would read cleaner and avoid the per-iteration call. The file already top-imports `teamMembers, users` from `@hyperidle/db` — `bets` should join them. Non-blocking; tidy in the lint-fix commit if convenient.

### NIT

- **[never-silent edge] `runChatTurn` emits `CAP_FALLBACK` for a genuinely empty text end_turn** — if the model returns end_turn with empty text and zero tool blocks, `emitText` falls through to `CAP_FALLBACK` ("ran out of steps…"), which is misleading copy for that case (it didn't run out of steps). Never-silent is preserved (the invariant that matters); only the copy is slightly off for a pathological path no AC exercises. Acceptable as-is.
- **[design fidelity] `BetCard` rendered without `budgetLabel`/`team` excerpt-trim** — approved design spec lists `budgetLabel`=appetite and `description`=~140-char excerpt. `BetDraftCardForToolCall` passes `description={data.description}` (full, no 140-char trim) and omits `budgetLabel`. `BetCard` truncates title itself and `description` overflow is a card concern, so this is within tolerance; the design-critique already accepted copy-only created-vs-updated signalling. Non-blocking.

---

## Must-fix list (to flip to DONE)

1. **CRITICAL:** Run `npm run lint:fix` to format `tool-registry-role.integration.test.ts:89`; confirm `npm run lint` exits clean; commit. (Optionally fold in the WARNING's top-level `bets` import while touching the area.)

No other blockers. After fix 1, all gates green → DONE.
