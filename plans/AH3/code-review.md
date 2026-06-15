# AH3 — Phase-4 Code Review (reviewer)

**Verdict: NOT DONE.** Two HIGH-severity correctness bugs make the load-bearing ACs (AC1 visible reply, AC2 specific error surface) unprovable AND broken on the real path; both are invisible to the current green suite because every test bypasses the failing seam. Plus the textarea design contract was not implemented (one-off inline patch, not the mandated design-system `Input` migration).

Green claims verified locally: `npm run check` PASS (12 pkgs), `npm run lint` PASS (warnings only, baseline), AH3 fast tests 25/25, AH3 integration 12/12. The suite is green for the same structural reason the original Assistant was dead-while-green: the tests mock/bypass exactly the seams that are broken.

---

## AC table

| AC | Status | Evidence / gap |
|---|---|---|
| AC1 — sending a message → visible streaming reply when configured | **NOT DONE** | Happy path throws. `runAssistantTurn` never resolves a model; builtin adapter `startSession` requires `resolvedModel` (`builtin-harness-adapter.ts:198` throws `"resolvedModel is required"`). With a real adapter the turn throws → generic `provider_error`. No test drives a real adapter to `completion` (the "AC1 trigger" test only asserts the stub `runTurn` was called). H1. |
| AC2 — turn can't run → specific notice, never silent | **NOT DONE** | (a) Notice field is STRIPPED on read-back: `messageRowSchema` (`threads-schema.ts:173`) validates plain payloads with `plainPayloadSchemaWithToolCalls`, which lacks `notice`; zod strips it. `GET /api/threads/assistant` maps every message through `rowToMessage`→parse, so the overlay receives notice-free bubbles. Empirically confirmed strips. H2. (b) `missing_key` is dead in local mode: `credentialResolver.resolve()` returns `string\|null` (never throws); `assistant-turn.ts:269` only catches a thrown `MissingCredentialError`, never checks `null`. M3. |
| AC3 — persona editable in exactly one place; running agent provably uses it | **PARTIAL / NOT DONE** | Server 403 reject of `ast-*` soul writes works (`agents.ts:334`, tested). UI omit works (`SettingsAgents.tsx:527`). Byte-equality test exists and passes. BUT "running agent provably uses it" is undermined by H1 (happy path throws before the persona reaches the model) and by placeholder SessionConfig casts. Single-edit-surface: met. End-to-end persona-in-reply: unproven. |
| AC4 — multi-line fields rectangular, not pills | **MET (functionally) / design contract VIOLATED** | E2E radius ≤16px passes via inline `style={{borderRadius:"var(--r-default)"}}` on raw `<textarea className="textarea textarea-bordered">`. Plan §5 + design/approved.md mandate migration to design-system `Input textarea` ("do not patch a single instance"; grep-guard "zero `className=\"textarea` in settings"). 3 raw usages remain; `SettingsAssistant` keeps `font-mono` (design W2 says prose). D4. |
| AC5 — first-time user with key gets a real answer, no extra config | **NOT DONE** | Defaults backfill is correct (`users.ts`, `assistant.ts`, tested). But blocked by H1 — the configured turn throws on `resolvedModel`. |

---

## Loop-guard verdict (explicitly requested)

**Guard is CORRECT in source; test is fraudulent (coverage gap).**
- Source: `threads.ts:1340-1345` fires only when `!senderId.startsWith("ast-")` && `input.type==="plain"` && `isAssistantThread(...)`. Re-entrancy guard implemented correctly. Plus in-memory `inFlightTurns` set in `assistant-turn.ts:85,196`.
- Test (`AH3-assistant-turn.integration.test.ts:157`): the builder's OWN comment (lines 179-186) admits it passes because the body is schema-invalid (`text` at top level) → 400 → no message insert → no trigger. It NEVER exercises the `ast-*` sender path. The `X-Identity: ast-*` header is inert (auth resolves userId from DB).
- **Required:** a real test of the guard predicate — POST a *valid* plain message whose persisted `senderId` is `ast-*` (or unit-test the guard condition directly) and assert the turn does NOT fire. As written, the guard could be deleted and this test would still pass. C5.

---

## Findings by severity

### HIGH (blockers — fix before merge)

**H1 — Happy path throws: no model resolution; builtin adapter requires `resolvedModel`.**
`assistant-turn.ts` builds `sessionConfig` (lines 332-340) with NO `resolvedModel`, and `resolveAgentModel`/`readServerConfig` appear nowhere on the turn path (plan §1 step 2 mandated reusing them). `BuiltinHarnessAdapter.startSession` throws `"resolvedModel is required in SessionConfig"` (`builtin-harness-adapter.ts:198`). Real configured turn → throw → caught at `assistant-turn.ts:403` → unmapped → `provider_error`. This re-manifests the exact headline failure ("valid key, no answer") as a generic provider error. Fix: resolve the model (reuse `resolveAgentModel` + `readServerConfig` + credentialResolver as `sessions-routes.ts:256-284` does) and pass `resolvedModel` (+ `resolvedFastModel`) into the config. Add a real happy-path integration test: a registered adapter stub that yields a `completion` → assert a `plain` reply from `ast-*` persists and emits `thread_message_appended` (plan task 3 / AC→verification row 1 — currently missing).

**H2 — Notice field stripped on DB read-back → error notices render as plain bubbles.**
`messageRowSchema` plain branch (`threads-schema.ts:170-174`) uses `plainPayloadSchemaWithToolCalls`, which does not include `notice`. Zod `z.object` strips unknown keys (empirically confirmed: `{text, notice}` → `{text}`). `GET /api/threads/assistant` runs every row through `rowToMessage`→`messageRowSchema.parse` (`assistant.ts:207,95`), so the overlay's `noticeMessages` filter (`AssistantOverlay.tsx:470`) finds nothing → notices render as ordinary chat text. This is the SAME class of bug the AD8b lore at `threads-schema.ts:166-168` warns about for `toolCalls`; repeated for `notice`. Invisible to tests: the integration test reads raw `JSON.parse(payload)` (bypasses schema); the overlay test mocks the hook; the no-key E2E mocks the GET route payload directly (`AH3-...spec.ts:131-166`). Fix: add `notice: assistantNoticeSchema.optional()` to `plainPayloadSchemaWithToolCalls` (and ensure the create-path `plainPayloadSchema` accepts it if a client ever sends one — server-authored only, so read-schema is the required fix). Add a route-level round-trip test: persist a notice via `persistTurnFailure`, then `GET /api/threads/assistant`, assert `messages[].payload.notice.kind` survives.

### MEDIUM

**M3 — `missing_key` notice is unreachable in local mode.**
`CredentialResolver.resolve()` returns `string | null` and never throws `MissingCredentialError` (lore at `credential-resolver.ts:60`). `assistant-turn.ts:265-276` calls `resolve()` inside a try and only handles a *thrown* `MissingCredentialError`; a `null` return falls through and the turn proceeds key-less, surfacing later as a generic `provider_error` (or H1's throw) — NOT the actionable `missing_key` card. Also: in pure local mode `deps.credentialResolver` is often absent, so the check is skipped entirely. Fix: when `resolve()` returns null/empty, construct `MissingCredentialError` and route through `persistTurnFailure`. This is AC2's distinct-error contract.

**M4 — Two subscribers to the assistant-thread append; dead duplicate logic.**
The pre-existing `assistant-dispatcher.ts` (AD8b skeleton) still subscribes to `thread_message_appended` and contains `shouldDispatchForAssistant` (human + assistant-thread) that was meant to provision the turn but only logs. AH3 added the trigger inline in `threads.ts` instead of completing the dispatcher. Result: two code paths reason about "is this an assistant-thread human message," and the dispatcher's dispatch branch is now dead. Not a correctness bug (dispatcher only logs + pins), but it violates "the diff delivers the task, nothing more/less" and leaves a confusing second seam. Decide: route the trigger through the dispatcher, or delete the dispatcher's dispatch branch and keep only the pin logic.

### LOW / design / slop

**D4 — Textarea fix is an inline-style one-off, not the mandated design-system migration.**
Plan §5 (line 137: "do not patch a single instance") + design/approved.md Surface 1 require both textareas on design-system `Input textarea` (prose font, `--r-default`). Implementation keeps raw `<textarea className="textarea textarea-bordered">` in `SettingsAssistant.tsx:152` (with `font-mono` — contradicts design W2 prose) and `SettingsAgents.tsx:468,716`, each overriding radius via inline `style`. The plan's grep-guard ("zero `className=\"textarea` in `packages/web/src/settings/`") would FAIL; it was not added. AC4's functional check passes, but the design contract and the "shared style" intent are unmet, and `font-mono` persona is the W2 regression the critique explicitly called out. Fix per contract or get the deviation explicitly re-approved.

**C5 — Loop-guard has no genuine test** (see Loop-guard verdict). Add a real test of the `ast-*` sender predicate.

**S6 — `as unknown as Parameters<...>[0]` SessionConfig fabrication** (`assistant-turn.ts:340`). The double cast manufactures a config with empty `workspacePath`/`soulPromptPath` and an extra `messages` field not on `SessionConfig`. It compiles only because the cast erases the shape mismatch — and it's the vehicle by which H1 ships (missing `resolvedModel` goes undetected at compile time). Once H1 is fixed by resolving a real model, build the config against the real `SessionConfig` type without the `as unknown` escape, so the type system guards the required fields.

**S7 — Duck-typed `getEventStream`** (`assistant-turn.ts:434-450`) checks `"streamEvents" in startResult` to support test stubs embedding the stream on the handle. This couples production code to a test convenience and silently diverges from the real `adapter.streamEvents(handle)` contract — it's why the hung-provider test can pass with a fake that doesn't honor the real adapter shape (and why H1 went unnoticed). Prefer a proper adapter stub that implements `streamEvents`; drop the dual path.

**Minor:** `BUILTIN_SOUL_PROMPT` / `BUILTIN_ASSISTANT_SOUL_PROMPT` duplicated as a string literal across `assistant-turn.ts:50`, `users.ts`, `assistant.ts` (×2). One shared const in `@hyperidle/shared` would prevent drift between the registration default and the lazy-create default (they currently match, but by copy).

---

## Positives (no action)
- Server-side 403 `ASSISTANT_SOUL_EDIT_FORBIDDEN` correctly placed before parse, tested (AC3 single-surface server-enforced — the W2 mandate). 
- Assistant-agent defaults backfilled at registration + both lazy-create paths, tested (AC5 mechanism).
- `ProviderTimeoutError` + `ASSISTANT_TURN_TIMEOUT_MS` shared client/server; hung-provider timeout path real and tested; N3 unmapped-cause `logger.error` present.
- Client-derived thinking/stale-Retry indicator (§1.7b) implemented from `lastMessage.createdAt`; no infinite spinner.
- E2E real-model spec correctly `test.skip()`-deferred to AH5 with a lore note (not silently dropped).
- Byte-equality persona test (composedPrompt === CLAUDE.md === builtin config) present and passing.
- Docs (`the-interface.md`): concise, accurate, cover all three notices + thinking/crash + persona consolidation. Doc rubric: passes (≥35, all dims ≥3).

---

## Doc rubric (the-interface.md Assistant Overlay section)
Reading funnel / scanning (table of 3 notices) / progressive disclosure / activation (each row has an action) all satisfied. Accurate to the implemented error classes and the 2-min crash window. Score ≥35, no dimension <3. PASS.

---

## What must change to reach DONE
1. H1 — resolve a model on the turn path; pass `resolvedModel`; add a real happy-path completion test (AC1/AC5).
2. H2 — add `notice` to the read-back schema; add a route round-trip test (AC2).
3. M3 — treat `resolve()===null` as `missing_key` (AC2 distinct error).
4. C5 — a genuine `ast-*` loop-guard test.
5. D4 — migrate both textareas to design-system `Input` (drop `font-mono`, add the grep-guard) or get the deviation re-approved.
6. M4/S6/S7 — resolve the duplicate dispatch seam and the cast/duck-type escapes opened to ship H1.

---

# Round 2 — re-review

**Verdict: NOT DONE.** All six round-1 findings (H1, H2, M3, C5, D4, M4/S6/S7) are genuinely closed — verified, not test-gamed. BUT closing H1 ("the turn no longer throws") exposed a deeper defect that H1 masked: **the user's message never reaches the model.** The turn now runs to a "completion," but it runs the builtin adapter's task-planning loop against an empty conversation with only the persona system prompt. The founder types a question; the model never sees it. AC1/AC5 (a real *answer to the message sent*) are unmet in substance. New blocker **H3**.

Independent check (run, not trusted): `npm run check` PASS (12 pkgs). AH3 fast 25/25 PASS. AH3 integration 18/18 PASS. Suite is green — but green for the same reason as round 1: the happy-path test uses a `ScriptedAdapter` that hardcodes its reply regardless of input, so it is blind to whether the user's question is delivered.

## Round-1 findings — closure status

| Finding | Status | Evidence |
|---|---|---|
| **H1** model resolution | **CLOSED** | `assistant-turn.ts:287-337` calls `resolveAgentModel`/`resolveModelTier`; `SessionConfig` built as a typed object (`:374`), no `as unknown`. Companion test `:633` proves `BuiltinHarnessAdapter.startSession` throws without `resolvedModel`; the type system now guards the field. Turn reaches `startSession` without throwing. |
| **H2** notice round-trip | **CLOSED** | `plainPayloadSchemaWithToolCalls` gains `notice: assistantNoticeSchema.optional()` (`threads-schema.ts:127`); kept off the write schema. Route round-trip test `:671` persists a `missing_key` notice → `GET /api/threads/assistant` → asserts `payload.notice.kind==="missing_key"` survives. Genuine. |
| **M3** null-resolve → missing_key | **CLOSED** | `resolveAgentModel`/`resolveModelTier` throw `MissingCredentialError` on null `resolve()` (`model-gateway.ts:86,102,128`); service catches → `persistTurnFailure` (`assistant-turn.ts:310`). Test `:719` drives the full turn with a null resolver, asserts `missing_key`. Exercises the real path. |
| **M4** double-dispatch | **CLOSED** | Dispatcher's dead `shouldDispatchForAssistant` dispatch branch removed (`assistant-dispatcher.ts`); it now owns ONLY pin-on-first-response. Single trigger seam, inline in `threads.ts:1334-1355`. No double-fire. |
| **D4** textarea migration | **CLOSED** | Both `SettingsAssistant` and `SettingsAgents` textareas now `<Input textarea>`; `grep textarea-bordered packages/web/src/settings/` → zero. `font-mono` dropped. ESLint `design/no-raw-settings-textarea` added at `error` (`index.ts:72`), scoped to `packages/web/src/settings`. Rectangular + prose. |
| **S6** `as unknown` cast | **CLOSED** | Gone — `SessionConfig` literal at `:374` is type-checked; required fields compiler-guarded. |
| **S7** duck-typed stream | **CLOSED** | `drainStreamEvents` calls `adapter.streamEvents(handle)` against the real interface (`:475-501`); test stubs implement `streamEvents` on the adapter object (`:583,:371`), not on the handle. |
| **C5** loop-guard real test | **CLOSED** | New test `:845` posts a real human message (count→1), then a valid `ast-*` message via DB+event, asserts count stays 1. Exercises the `!senderId.startsWith("ast-")` predicate. Would fail if the guard were deleted (POSTing the ast-* reply would re-fire → 2). No longer the schema-400 fraud. |

## Deferral adjudications

1. **Empty conversation history → REJECTED as framed; it is the symptom of H3 (below), not a clean deferral.** The `@lore` at `assistant-turn.ts:356-360` frames the gap as "prior conversation history deferred." That conflates two different things. *Prior* multi-turn memory is genuinely deferrable — no AC requires it (AC1 = single send→reply; persona scenario = "next turn reflects it," single-turn; AC5 = first answer). BUT the same gap also drops the **current triggering message** — the question the user just typed. `SessionConfig` has no `messages` field; `composeAssistantPrompt(soulPromptText)` embeds only persona + a generic "respond to the user's messages" instruction (`prompt-composition.ts:297-316`); the builtin adapter starts `messages: []` and runs `runPlanningTurn` with a task `PLANNING_PROMPT` (`builtin-harness-adapter.ts:361,410-415`). `triggerMessageId` is declared on `AssistantTurnParams:85` but **never read**. So the user's text reaches neither the system prompt nor the message list. This breaks AC1/AC5 (answer *to the message sent*) and the plan's own §1.4 ("the thread transcript as the message history") + §3 scenario-1.

2. **`resolveModelTier("fast")` unused — RESOLVED, finding is stale.** Now wired: `:301` assigns `resolvedFastModel`, passed into `SessionConfig.resolvedFastModel` at `:382`. Not dead. No action.

## New finding

**H3 (HIGH, blocker) — the user's message never reaches the model; the assistant runs the task-planning loop against an empty conversation.**
`runAssistantTurn` builds a `SessionConfig` with `composedPrompt` (persona only) and no user message — `SessionConfig` has no `messages`/transcript field, and the service never reads `triggerMessageId` nor loads the thread's messages. The builtin adapter (the assistant's default harness) begins `runLoop` with `runPlanningTurn`, injecting a task-execution `PLANNING_PROMPT` (`builtin-harness-adapter.ts:361,414`), then runs a multi-iteration execute/reflection loop. Net: a founder typing "what can you do?" gets a session that (a) never receives that text and (b) executes a task-planning agentic loop, not a conversational reply. Any "completion" it emits is a response to the planning prompt + persona, not to the user.

Why the green suite misses it: the happy-path test (`:562`) registers a `ScriptedAdapter` whose `completionStream` yields a fixed `EXPECTED_REPLY` regardless of config/input, so it asserts "a reply persisted" without ever checking the user's question was delivered to a real adapter. The real builtin path is never exercised against a real user message (correctly deferred to AH5's live lane — but the *wiring* that AH5 would exercise is absent here).

Fix direction (builder, round 3): give `runAssistantTurn` a seam to deliver the thread transcript (at minimum the triggering user message) to the adapter as the conversational input — e.g. extend `SessionConfig` (or a conversational variant) with a `messages` list and have the builtin adapter seed `session.messages` from it instead of/in addition to `runPlanningTurn`, OR route the assistant turn through a conversational entry on the adapter rather than the task `runLoop`. Then add a happy-path test whose adapter **echoes the received user message** (or asserts on the messages handed to `startSession`/`streamEvents`), so the test fails if the question isn't delivered. This is the §1.4 "conversational context (no task)" the plan mandated and the builder skipped.

## Minor (non-blocking, note for round 3)

- **agents.ts `ast-*` branch duplicates the full update+response block.** The 403 reject (`agents.ts:330-348`) is correct, but the non-soulPrompt path re-implements parse → `validateAgentConfig` → `buildPatchUpdateSet` → response shaping that already exists below for the general case. The early `await c.req.json()` also means the body is read twice on the non-ast path (re-parsed below). Simplification: reject on `soulPrompt` for `ast-*`, then fall through to the shared block rather than forking it. Not a correctness bug.
- `BUILTIN_SOUL_PROMPT` string still duplicated across `assistant-turn.ts:57`, `users.ts`, `assistant.ts` (round-1 minor, unaddressed). One shared const would prevent drift.

## AC table (round 2)

| AC | Status | Evidence / gap |
|---|---|---|
| AC1 — visible streaming reply when configured | **NOT DONE** | Turn no longer throws (H1 closed) but the user message never reaches the model (H3). The reply is to the persona+planning prompt, not the question. Real-model streaming E2E correctly `.skip()`-deferred to AH5 (`spec.ts:209`). |
| AC2 — can't run → specific notice, never silent | **DONE** | Three classes persist + survive read-back (H2). missing_key (null-resolve M3 + thrown), missing_harness, provider_error (incl. hung-provider timeout). No secret leak (test `:254`). All deterministic AH3 proofs present and passing. |
| AC3 — persona one place; agent provably uses it | **PARTIAL** | Single-edit-surface fully met: UI omit + server 403 (`agents.ts`, test `:437`) + byte-equality persona test pass. "Provably uses it": persona DOES reach `composedPrompt`, so the persona-reflection scenario holds at the system-prompt level. But end-to-end "the reply reflects persona" is undermined by H3 (the turn isn't a real conversational answer). |
| AC4 — rectangular textareas | **DONE** | Both migrated to `<Input textarea>`; ESLint guard active; zero raw textareas in settings; E2E rectangularity specs present. |
| AC5 — first-time user with key gets a real answer | **NOT DONE** | Defaults backfilled (tested). Turn runs. But H3: no real answer to the user's message — the question is never delivered. |

## What must change to reach DONE (round 3 — cap)
1. **H3** — deliver the thread transcript (≥ the triggering user message) to the adapter as conversational input; stop running the task `runLoop` for a chat turn (§1.4). Add a happy-path test whose adapter **observes/echoes the user message**, failing if it isn't delivered.
2. (Optional cleanup) de-duplicate the `agents.ts` `ast-*` branch; lift `BUILTIN_SOUL_PROMPT` to a shared const.

---

# Round 3 — final review (review cap)

**Verdict: DONE.** H3 is genuinely closed. The user's triggering message now reaches the model as conversational input, the assistant runs a single chat completion (not the task-planning loop), the persona is the system prompt for that completion, and the two new tests genuinely discriminate (they fail if the message isn't delivered). All five round-1 and the round-2 H3 blocker are closed without regression. The two remaining minors are cosmetic, non-blocking, AC-neutral.

Independent check (run, not trusted): `npm run check` PASS (12/12 packages). AH3 integration `AH3-assistant-turn.integration.test.ts` 20/20 PASS (was 18 in round 2; +2 H3 tests). AH3 fast tests 25/25 PASS (4 files: compose-assistant-prompt, assistant-turn-unit, plain-payload-notice, AssistantOverlay.notice).

## H3 closure — traced, not asserted

**1. The triggering user message reaches the model.** Full trace verified:
- `threads.ts:1334-1355` fires `runAssistantTurn` with `triggerMessageId: messageId` (the just-inserted human message), guarded to human + plain + assistant-thread.
- `assistant-turn.ts:374` calls `loadThreadTranscript(db, threadId, ast-${userId})`, which reads ALL plain messages on the thread `orderBy(asc(createdAt))`, skips notices/empty, maps `senderId === assistantAgentId → "assistant"` else `"user"`. The trigger message was inserted immediately before the turn fired, so it is present and chronologically last → correct role + ordering.
- `assistant-turn.ts:398` puts the transcript on `SessionConfig.messages` (real typed field on `SessionConfig`, real `ConversationMessage` interface — no `as unknown`).
- `builtin-harness-adapter.ts:367` branches on `config.messages?.length > 0` → `runChatTurn`. `runChatTurn:438-451` seeds `session.messages` from the transcript and calls `callLlm({ model, messages: session.messages, tools: [], system: config.composedPrompt })`. The user's text is in the `messages` payload sent to the provider. Confirmed.
- `triggerMessageId` itself is unused inside `runTurnInternal` (prefixed `_`); not a defect — the transcript loader captures the trigger by loading the whole thread, and the lore at `assistant-turn.ts:368-371` documents this. Multi-turn prior history is genuinely deferred but the *current* question is delivered.

**2. The new tests genuinely discriminate (not blind).**
- H3a (`:929`): capturing adapter derives `capturedUserContent` from `config.messages` (last user msg) and echoes `Received: ${capturedUserContent}`; if `messages` were empty it would be `NO_USER_MESSAGE_RECEIVED`. Asserts `capturedUserContent === "What time is it?"` AND persisted reply `toContain("What time is it?")`. Reply is a pure function of the delivered input — would fail if H3 regressed.
- H3b (`:1040`): validating adapter emits an `error` event (→ `provider_error` notice) unless `messages` contains the exact `UNIQUE_QUESTION` as a user message; asserts the persisted reply is exactly `"I see your question."` (i.e. no error) and `receivedMessages` contains the user msg. Discriminating in the negative direction too.
- Neither is the round-2 `ScriptedAdapter` blind test (that one hardcoded its reply regardless of input). The H1 scripted test at `:562` is retained only as a "reply persists" smoke check, not the H3 proof.

**3. Chat-turn vs planning-loop branch is sound.** `runChatTurn` runs ONE `callLlm`, no `PLANNING_PROMPT`, no `runExecuteTurn`/reflection/max-iterations, no tools, sets `session.done = true`. The task path (`messages` absent/empty → `runPlanningTurn` + execute loop) is byte-unchanged. Existing task/session tests not in the AH3 set are unaffected (no edits to the planning-turn code). Persona system prompt: `composeAssistantPrompt(soulPromptText)` → `composedPrompt` → passed as `system` to `callLlm` in the chat turn. Byte-equality (§4) intact — `composeAssistantPrompt` is the single composer for both adapter paths; the compose test (4-file fast suite) passes.

**4. Never-silent holds across the chat path.** `runChatTurn` errors propagate through `runLoop`'s catch → `error` HarnessEvent → `drainStreamEvents` returns `{type:"error"}` → `persistTurnFailure` → `provider_error` notice. Missing key (null-resolve M3 + thrown), missing harness, and the hung-provider timeout all still map to their distinct notices on the chat path (the timeout race wraps the same `drainStreamEvents`). No new silent branch introduced.

## AC table (round 3 — final)

| AC | Status | Evidence |
|---|---|---|
| AC1 — visible streaming reply when configured | **DONE** (deterministic proof); real-model streaming correctly deferred to AH5 | Turn delivers the user message → chat completion → reply persisted + `thread_message_appended` emitted. H3a/H3b prove the reply is a function of the user's question. Real-model streaming E2E `.skip()`-deferred to AH5 (`spec.ts:209`), not dropped — lore-noted, RED-authored. |
| AC2 — can't run → specific notice, never silent | **DONE** | Three notice classes persist + survive read-back (H2 schema fix); missing_key (null + thrown), missing_harness, provider_error (incl. hung-provider timeout) all tested. No secret leak (`:254`). Chat-path errors map to provider_error. |
| AC3 — persona one place; agent provably uses it | **DONE** | Single edit surface: UI omit + server 403 `ASSISTANT_SOUL_EDIT_FORBIDDEN` (`agents.ts`, test `:437`) + byte-equality test. End-to-end use now provable: saved `soulPrompt` → `composeAssistantPrompt` → `composedPrompt` → `system` of the actual chat completion in `runChatTurn`. The round-2 gap (turn wasn't a real conversational answer) is closed by H3. |
| AC4 — rectangular textareas | **DONE** | Both settings textareas on `<Input textarea>`; `grep textarea-bordered packages/web/src/settings/` → zero; ESLint `design/no-raw-settings-textarea` at error; E2E rectangularity specs present. |
| AC5 — first-time user with key gets a real answer | **DONE** (deterministic); live answer = AH5 lane | Defaults backfilled at registration + both lazy-create paths (tested). Turn runs, delivers the message, returns a reply that is a function of the input. The live real-model answer-vs-welcome assertion is the AH5 `.skip()` lane. |

## Validation scenarios

- Scenario 1 (fresh install + key → real answer, distinct from welcome) — deterministic proof present (H3a/H3b); live-model assertion correctly `.skip()`-deferred to AH5 with lore. The wiring AH5 needs (`assistantTurnDeps` into server boot) exists (`app.ts`, `threads.ts`).
- Scenario 2 (no key → visible error/guidance) — DONE; E2E no-key overlay spec active (`spec.ts:169`) + integration missing_key notice round-trip.
- Scenario 3 (rectangular textareas, ≥2 instances) — DONE; two E2E specs (`spec.ts:323,346`) + ESLint guard.
- Scenario 4 (edit persona → next turn reflects it; exactly one surface) — single-surface DONE; persona reaches the chat completion's system prompt (composer is the one canonical path). Live persona-reflection is the AH5 lane.

## Two remaining minors — adjudication (NOT blockers)

1. **`BUILTIN_SOUL_PROMPT` literal duplicated ×3** (`assistant-turn.ts:59`, `users.ts:24`, `assistant.ts:39`). All three strings are byte-identical today; risk is future drift, not a current bug. Cosmetic. Not an AC-breaker. Acceptable deferral — note for a follow-up cleanup.
2. **`agents.ts` `ast-*` branch duplicates the update+response block** and reads the body twice on the non-soulPrompt path. The 403 reject is correct and tested; the duplication is a simplification/slop note, no correctness impact. Cosmetic. Not an AC-breaker. Acceptable deferral.

Neither item touches a contract, an AC, or a security boundary. Both are safe to ship as-is and clean up later.

## No regressions

All round-1 fixes (H1, H2, M3, M4, D4, S6, S7, C5) remain closed — verified in the round-3 diff: typed `SessionConfig` literal (no `as unknown`), notice on read schema, null-resolve→missing_key, single dispatch seam, `<Input textarea>` + ESLint guard (zero raw textareas), real `streamEvents` interface, genuine `ast-*` loop-guard test. The H3 change is additive (`ConversationMessage`, `SessionConfig.messages`, `loadThreadTranscript`, `runChatTurn` branch) and does not weaken any of them.

**Final: DONE. Pipeline may proceed to retro + ship.**
