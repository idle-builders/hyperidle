# AH3 — The Assistant actually responds (one soul, real textareas) — Architecture

Status: locked plan. Builder reads this, not the docs. Consumes AH1 (credential reaches runtime) and AH2 (per-agent model + harness + registry). AH3 owns: the message→turn→stream→render trigger, the specific error surface, the single canonical persona surface, the shared textarea fix.

## Required reading (engineer, before implementing)
- `packages/server/src/services/session-provisioning.ts` — `admitSession` / `runSession` (task-centric; the assistant turn reuses its harness/stream wiring but NOT its task coupling).
- `packages/server/src/routes/threads.ts` — POST `/api/threads/:id/messages` (the append handler that must gain a trigger) + `isAssistantThread` guard (line ~348).
- `packages/server/src/routes/assistant.ts` — assistant thread + soul-prompt CRUD.
- `packages/server/src/routes/sessions-routes.ts` ~230–320 — model+credential resolution pattern (`resolveAgentModel`, `MissingCredentialError`→`MISSING_CREDENTIAL` 500).
- `packages/server/src/harness/builtin-harness-adapter.ts` (reads `config.composedPrompt`) + `claude-agent-sdk-adapter.ts` ~150–205 (reads CLAUDE.md from cwd).
- `packages/fabric/src/prompt-composition.ts` `composePrompt` (persona is `soulPromptText`, already the single source for task sessions).
- `packages/web/src/shell/AssistantOverlay.tsx`, `packages/web/src/hooks/useAssistantThread.ts`, `packages/web/src/hooks/useThreadDetail.ts` (the WS subscribe pattern the overlay must adopt), `packages/web/src/services/ws-client.ts`.
- `packages/web/src/settings/SettingsAssistant.tsx` + `SettingsAgents.tsx` (raw `<textarea className="textarea textarea-bordered">` — the pills).
- `packages/design-system/src/Input.tsx` (textarea mode already renders rectangular `--r-default`).
- `packages/shared/src/errors.ts` (`MissingCredentialError`, `NoEligibleHarnessError`), `packages/shared/src/model-gateway.ts` (`DEFAULT_AGENT_MODEL_ID = "claude-sonnet-4-6"`).
- Design: `plans/AH3/design/approved.md`.

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "Sending a message writes a row, whether anything consumes it is unproven." | **CONFIRMED: nothing consumes it.** POST `/api/threads/:id/messages` (threads.ts ~1247–1357) inserts the row and emits `thread_message_appended`. No subscriber provisions an assistant turn. There is NO message→turn trigger anywhere. | AH3 builds the trigger from scratch: a server-side listener/inline call on the assistant-thread append path → `runAssistantTurn`. This is the largest piece. |
| "Two divergent persona surfaces; CLAUDE.md vs inline soul_prompt." | Partly. For task sessions persona is already single-sourced: `agent.soulPrompt` → `composePrompt` → `composedPrompt`, written to CLAUDE.md (SDK) AND passed as `config.composedPrompt` (builtin). The "divergence" is *delivery mechanism* (auto-discovered file vs config field), not *content*. The genuine duplication is the two **edit** surfaces: `PATCH /api/users/:id/assistant` (writes `ast-{userId}.soulPrompt`) and Settings → Agents editing the same agent's `soulPrompt`. | Canonical source = `users.soulPrompt` on `ast-{userId}`. Both adapters derive persona from one `composeAssistantPrompt(soulPromptText)` (same string → CLAUDE.md AND `composedPrompt`). Remove the duplicate edit surface (see §4). |
| Assistant agent created at registration has harness + model. | **FALSE.** `users.ts:135` inserts `ast-{userId}` with NO `harnessType`, `modelProvider`, `modelId`, or `soulPrompt`. AH2 added per-agent model/harness columns + defaults for *team* agents but the assistant insert was not updated. | AH3 backfills the assistant insert (and the lazy-create paths in assistant.ts) with `harnessType="builtin"`, `modelId=DEFAULT_AGENT_MODEL_ID`, `modelProvider="anthropic"`, default `soulPrompt`. Migration backfills existing `ast-*` rows. (Strictly an AH2 concern, but AH2 shipped without it; AH3 must close it or the turn is dead — flagged.) |
| `provisionSession` can run a conversational turn. | **FALSE.** It requires `taskId`, transitions task state (`accepted→in_progress`), builds task/bet context, writes to bets. A chat message has no task. | AH3 introduces a task-free `runAssistantTurn` service that reuses `AdapterPool` + harness + `streamEvents` + model/credential resolution, but NOT the task state machine, bet accounting, or `buildSessionContextData`. (Design-it-twice §A.) |
| Overlay shows streamed reply live. | **FALSE.** `useAssistantThread` fetches once + `refresh()` on send; it does NOT subscribe to WS. `useThreadDetail` already has the `ws.subscribe(\`thread:${threadId}\`, …)` pattern. | Overlay adopts the WS subscribe pattern: subscribe to `thread:${thread.id}`, `refresh()` on `thread_message_appended`. Streaming tokens surface as the reply message lands (token-granular streaming optional — see §3). |
| Textarea pills come from the shared Input style. | **PARTLY FALSE.** Design-system `Input` (textarea mode) is already rectangular (`rounded-[var(--r-default)]`, 16px). The pills are raw `<textarea className="textarea textarea-bordered">` (DaisyUI) in `SettingsAssistant.tsx` and `SettingsAgents.tsx`, which inherit DaisyUI's field radius. | "Shared fix" = migrate both raw instances onto design-system `Input textarea`. That IS the shared style. No DaisyUI global override needed; removing the raw `.textarea` usage resolves it everywhere it occurs (§5). |

**Net:** the spec's headline ("Assistant is silent") is caused by THREE independent gaps, all real: (1) no trigger, (2) assistant agent lacks harness/model, (3) overlay doesn't subscribe to live updates. All three must close for the streaming proof; (2) is the missing-key / missing-harness error surface; the textarea + persona-consolidation are independent UI fixes.

---

## 1. The trigger path (message → turn → stream → render)

### Server: `runAssistantTurn` service
New file `packages/server/src/services/assistant-turn.ts`.

```ts
export interface AssistantTurnDeps {
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
  readonly adapterPool: AdapterPool;
  readonly credentialResolver?: CredentialResolver; // shared mode; absent in local mode
}
export interface AssistantTurnParams {
  readonly userId: string;          // human; assistant agent = `ast-${userId}`
  readonly threadId: string;        // the assistant thread
  readonly triggerMessageId: string;// the user message that triggered this turn
}
/** Runs one assistant reply. Persists the reply (or a specific error message)
 *  as a thread message from `ast-${userId}`. Never returns silently. */
export async function runAssistantTurn(
  deps: AssistantTurnDeps, params: AssistantTurnParams,
): Promise<void>;
```

Algorithm (each failure branch ends by persisting a thread message — never silent):
1. Load assistant agent `ast-${userId}`. If missing → lazy-create with defaults (mirror assistant.ts).
2. **Resolve model + credential** (reuse `resolveAgentModel` + `readServerConfig` from sessions-routes pattern). On `MissingCredentialError` → persist error message class `missing_key` (§2), return.
3. **Select adapter** via `adapterPool.select({ harnessType: agent.harnessType, modelProviders: [agent.modelProvider] })`. If null → persist `missing_harness` (§2), return.
4. Build a **conversational** message list from the thread's existing messages (assistant + user roles, no task context). Build the session-scoped `ToolRegistry` (role `assistant`) the same way `runSession` Phase 8 does, bound to a lightweight `ToolContext` (no `taskId` — see §1.4).
5. Compose persona via `composeAssistantPrompt(soulPromptText)` (§4). For builtin: pass as `config.composedPrompt`. For SDK: write CLAUDE.md to the (ephemeral) workspace. **Same string both ways** — the canonical-persona contract.
6. `harness.startSession({...})` then drain `streamEvents`:
   - On `completion` → persist (or update) the assistant reply message (`type:"plain"`, `senderId:"ast-${userId}"`), emit `thread_message_appended`. (Streaming: see §3.)
   - On `tool_call` → invoke registry (builtin executes internally), surface as `toolCalls` on the reply payload (overlay already renders these via `renderToolCallSummaries`).
   - On `error` → persist `provider_error` message (§2), stop.
7. `stopSession`, release adapter. No task/bet accounting, no workspace destroy beyond the ephemeral one.

### 1.4 Conversational context (no task)
The assistant turn has no task/bet. `composeAssistantPrompt` (§4) replaces `composePrompt`'s task path: persona + tools + a short workspace orientation + the thread transcript as the message history. **Do NOT call `buildSessionContextData`** (requires taskId/productId). This is the explicit decoupling from `runSession`.

### 1.5 Where the trigger fires
In `threads.ts` POST `/api/threads/:id/messages`, after the append + `thread_message_appended` emit (line ~1318), add:
```ts
if (isAssistantThread(thread.hostKind, thread.hostId, participants)
    && senderId === thread.hostId /* human, not the assistant */
    && input.type === "plain") {
  void runAssistantTurn(turnDeps, { userId: thread.hostId, threadId, triggerMessageId: messageId })
    .catch((e) => persistTurnFailure(db, eventBus, thread.hostId, threadId, e));
}
```
- Fire-and-forget (`void` + `.catch`), mirroring `startSessionProvision`'s detach. The POST returns 201 immediately; the reply streams in via WS.
- `turnDeps` (adapterPool, credentialResolver) must be threaded into `createThreadRoutes`. **Plumbing change** — `createThreadRoutes(db, eventBus)` gains an optional `assistantTurnDeps`. When absent (pure-unit tests), the trigger is a no-op (the assistant simply doesn't reply — acceptable for chrome tests; the live lane (AH5) supplies real deps).
- Guard against re-entrancy: only fire when sender is the human and message is plain. An assistant-sent reply (senderId = `ast-*`) must NOT re-trigger.

### 1.6 Web: overlay live updates
`useAssistantThread`: add WS subscription (copy `useThreadDetail.ts` ~173–186). On mount with a known `thread.id`, `ws.subscribe(\`thread:${thread.id}\`, …)`; on `thread_message_appended` → `refresh()`. Add a transient **"Assistant is thinking…"** indicator (overlay idle→streaming state, §design) shown between user-send and the first assistant `thread_message_appended` for that thread.

---

## 2. Error surface (specific, no secret leak)

Three distinct, actionable classes. Each is persisted as a normal assistant **thread message** (so it renders in the existing timeline) with a discriminating `payload.kind` so the overlay styles it as guidance, not a chat bubble.

| Class | Detection | User-facing copy (no secret) | Action affordance |
|---|---|---|---|
| `missing_key` | `MissingCredentialError` from model/credential resolution. | "I can't think yet — no API key is configured. Add your Anthropic key in Settings → Credentials." | Link/route to Settings → Credentials. |
| `missing_harness` | `adapterPool.select(...)` returns null / `NoEligibleHarnessError`. | "My runtime isn't set up. Choose a harness for this assistant in Settings → Agents." | Link to Settings → Agents. |
| `provider_error` | harness `error` event, or thrown LLM call (timeout, 4xx/5xx from provider). | "The model provider returned an error and I couldn't complete that. Try again in a moment." (+ provider's `code` if non-sensitive, e.g. `rate_limited`). | Retry button (re-sends the trigger message turn). |

Implementation:
- Extend the assistant reply message payload with an optional `kind: "missing_key" | "missing_harness" | "provider_error"` discriminator (a new optional field on `PlainPayload`, or a dedicated `assistant_notice` payload variant — **prefer extending PlainPayload** to avoid a new MessageType; design-it-twice §B). The overlay renders these with the `ErrorState`-style treatment (design-system has `ErrorState`).
- **Secret-handling boundary:** never include the key, env var name, or resolver internals in the persisted message. `MissingCredentialError.message` currently embeds hints like "set it in Settings > Models" — for the assistant notice, map the error *class* to the fixed copy above; do not echo `error.message` verbatim (it may name internals). `summarizeToolArgs`-style scrubbing already exists for tool args; reuse the principle.
- A `persistTurnFailure(db, eventBus, userId, threadId, err)` helper maps any thrown error to one of the three classes (default `provider_error`) and persists the notice.

---

## 3. Streaming (must work in web/E2E so Playwright can prove it)

Two granularities — pick by cost:
- **Minimum viable (locked default):** persist the assistant reply message once on `completion`; the "thinking…" indicator covers the gap; WS `thread_message_appended` flips the overlay to the answered state. The Playwright proof asserts a real model response distinct from the seeded welcome text — satisfied by the final message. This is what AH5's lane screenshots.
- **Token-granular (optional, if cheap):** emit incremental `assistant_stream_delta` WS events on `completion` deltas and render partial text. Adds a WS event type + overlay buffer. **Recommend deferring** to keep blast radius small; the AC says "streaming response" which the thinking→answered transition + (optionally) progressive text both satisfy. Decision: ship minimum-viable streaming (thinking indicator + landed reply) as the contract; mark token-granular as a follow-up. Flag for reviewer: confirm the AC "streaming" wording is met by the thinking→answered transition.

E2E reachability: the turn runs server-side via the same `AdapterPool`; AH5's lane supplies a real OpenRouter/Anthropic key with no mocked routes. The overlay's WS subscription is the only web-side streaming dependency and works in Playwright (real server).

---

## 4. Single canonical persona source

**Canonical source:** `users.soulPrompt` on row `ast-${userId}`. One column, one row.

- One composer: `composeAssistantPrompt(soulPromptText: string): { composedPrompt: string }` in `packages/fabric` (sibling to `composePrompt`, no task context). Both harness adapters consume the SAME output: builtin via `config.composedPrompt`, SDK via CLAUDE.md written from the same string. This is the "regardless of which harness executes" guarantee — proven by a test that runs the same persona through both adapter paths and asserts identical persona text reaches the model boundary.
- **Single edit surface:** keep `Settings → Assistant` (`PATCH /api/users/:id/assistant`) as the ONE place. **Remove the assistant agent from the Settings → Agents editable list** (or render its soul field read-only with a "Edit in Settings → Assistant" link). `SettingsAgents.tsx` must filter out `role === "assistant"` agents from its editable table, OR disable the soul textarea for that row. Decision: **filter the assistant out of Settings → Agents entirely** — it already has a dedicated tab; showing it twice is the duplication. (Team agents keep their soul editor in Settings → Agents.)
- Verification of "exactly one editing surface": a test asserts (a) PATCH assistant updates `ast-*.soulPrompt`; (b) Settings → Agents does not list/accept a write to the `ast-*` agent's soulPrompt (the route either 403s or the UI omits it). The AC "no second field writing the same data" is met by removal, not by sync.

Migration: existing `ast-*` rows with null `soulPrompt` get a sensible default persona on backfill (same default used at registration).

---

## 5. Shared textarea fix

Root cause: raw `<textarea className="textarea textarea-bordered">` (DaisyUI) in `SettingsAssistant.tsx` and `SettingsAgents.tsx`. DaisyUI's `.textarea` carries the field radius that reads as a pill at large heights. The design-system `Input` (textarea mode) is already correct (`rounded-[var(--r-default)]`, `min-h-[80px]`, `resize-y`).

**Fix = migrate both raw instances to `<Input textarea …>`.** This is the shared style: the design-system primitive is the single source of textarea chrome. After migration, grep must show zero `className="textarea` in `packages/web/src/settings/`.

- `SettingsAssistant.tsx`: replace raw `<textarea>` + raw `<button className="btn btn-primary">` with `<Input textarea label="Persona instructions" …>` + design-system `Button` (the consolidated persona surface per spec + design/approved.md).
- `SettingsAgents.tsx`: replace the Soul Prompt raw `<textarea>` with `<Input textarea …>` (the second distinct instance the Playwright proof checks).
- Note: AI1 (separate WP) fixes the dead `--color-error`/`--color-success` tokens; AH3 uses the design-system `Input`/`Button` whose error styling uses `--status-error` (already defined), sidestepping the dead tokens. Do not reintroduce `--color-error`.

Static guard (cheap, catches regressions): an ESLint/grep lint asserting no `class*="textarea"` raw usage in `packages/web/src/settings/**`. Optional — the Playwright screenshot is the primary proof.

---

## Design-it-twice

**§A — Assistant turn: reuse `provisionSession` vs new `runAssistantTurn`.**
- *Reuse provisionSession:* shape — synthesize a throwaway task per message, run the full pipeline. Trade-off: zero new orchestration code. Reject: pollutes tasks/bets tables with fake rows, runs the task state machine + bet cost accounting for a chat, couples chat lifecycle to task lifecycle (a chat reply could strand a fake task `in_progress`). High coupling, wrong altitude.
- *New runAssistantTurn (chosen):* shape — a task-free service reusing only AdapterPool + harness + streamEvents + model resolution. Trade-off: ~one new service file + context-builder, some duplication of harness-start boilerplate. Reject reason for the *other* option is decisive: the task coupling is exactly what makes the assistant inert-shaped. Pick this; factor shared harness-start helpers if duplication is painful.

**§B — Error surface: new MessageType vs extend PlainPayload.**
- *New `assistant_notice` MessageType:* clean discriminator. Reject: touches the message zod schema, all message renderers, the AF4 payload-drift lore — wide blast radius for three notices.
- *Extend PlainPayload with optional `notice?: { kind }` (chosen):* the message is a normal plain message the overlay already renders; an optional field flags the three guidance styles. Trade-off: PlainPayload grows one optional field. Pick this — minimal surface, the overlay branches on `payload.notice?.kind`.

---

## Acceptance criteria → verification

| AC | Verification |
|---|---|
| Sending a message produces a visible streaming response when configured. | (Playwright, AH5 lane) fresh install + valid key → open Assistant → send → screenshot shows a real model reply distinct from seeded welcome text. + integration test: `runAssistantTurn` with a real/registered adapter persists a `plain` reply message from `ast-*` and emits `thread_message_appended`. |
| Turn that can't run → clear specific error, never silent. | (Playwright, AH5) no-key install → message → screenshot shows `missing_key` guidance. + integration tests: force each class (no credential / null adapter / harness error event) → assert a notice message of the right `kind` is persisted with no secret substring. |
| Persona editable in exactly one place; running agent provably uses it regardless of harness. | Integration test: PATCH persona → run turn through builtin AND through SDK path → assert the persona text reaches each adapter's model-boundary input identically (`composeAssistantPrompt` output equality). + test asserting Settings → Agents does not write `ast-*` soulPrompt (removed surface). |
| Multi-line fields render rectangular, not pills, across Settings. | (Playwright) Settings → Assistant + Settings → Agents → screenshot ≥2 distinct textareas as rectangles (border-radius ≤ `--r-default`, not pill). + grep-lint: no raw `class*="textarea"` in settings. |
| First-time user with valid key gets a real answer with no extra config. | (Playwright, AH5) onboarding-with-key → first assistant message → real answer. Depends on §reconciliation fix: assistant agent created with harness+model+persona defaults. |

---

## Ordered task list (builder)

1. **Assistant agent defaults** (closes reconciliation gap #3). Update `users.ts` registration insert + both lazy-create paths in `assistant.ts` to set `harnessType:"builtin"`, `modelId:DEFAULT_AGENT_MODEL_ID`, `modelProvider:"anthropic"`, default `soulPrompt`. Migration backfills existing `ast-*` rows. Test: read-back of a registered/lazy-created assistant agent shows all four fields non-null. *(sharedFiles: users.ts, schema/migrations)*
2. **`composeAssistantPrompt`** in `packages/fabric` — persona-only composer (no task context). Unit test: persona text passes through verbatim (after frontmatter strip + var substitution) into composedPrompt. Export from fabric index.
3. **`runAssistantTurn` service** (`assistant-turn.ts`) — model/credential resolve, adapter select, conversational context, harness start, stream drain, reply persistence. Plus `persistTurnFailure` mapping errors → notice classes (§2). Integration tests: happy path persists reply; each failure class persists the right notice with no secret leak.
4. **PlainPayload `notice?`** field (`packages/shared`) — optional discriminator. Update message zod schema (`threads-schema.ts` / shared payload schema). Unit test: round-trips through persistence. *(sharedFiles: shared payload types/schema)*
5. **Trigger wiring** in `threads.ts` POST messages — fire `runAssistantTurn` on assistant-thread human plain messages; thread `assistantTurnDeps` through `createThreadRoutes` and the server factory (`server-factory.ts`/`app.ts`). Integration test: POST a human plain message to the assistant thread (with a registered adapter dep) → a reply message from `ast-*` appears. Re-entrancy test: an `ast-*`-sent message does NOT re-trigger. *(sharedFiles: threads.ts, server-factory.ts, app.ts)*
6. **Overlay live updates** — `useAssistantThread` WS subscribe + "thinking…" indicator; overlay idle/streaming/answered states per design. Component test: on a mocked `thread_message_appended` WS event, the hook refreshes. *(sharedFiles: none beyond hook/overlay)*
7. **Overlay error/guidance rendering** — branch on `payload.notice?.kind` → three guidance treatments with action affordances (link to Settings, Retry). Component test: each kind renders its copy + affordance.
8. **Consolidated persona surface** — rebuild `SettingsAssistant.tsx` on design-system `Input textarea` + `Button` (idle/saving/saved/error states per design/approved.md). Remove undefined-token usage. Stories updated. Component test: load/dirty/save/error states.
9. **Remove duplicate persona surface** — filter `role==="assistant"` agents out of `SettingsAgents.tsx` editable table. Test: assistant agent not listed there; PATCH-to-`ast-*`-soul via agents path rejected/absent.
10. **Textarea fix in SettingsAgents** — migrate Soul Prompt raw `<textarea>` → `<Input textarea>` (the 2nd proof instance). Grep-lint added.
11. **E2E specs** (handed to AH5 lane): streaming-answer, no-key-error, two-rectangular-textareas, persona-roundtrip. (AH3 writes the spec; AH5 supplies the real-model lane + CI job.)

Dependencies: 1→3, 2→3, 4→{3,7}, 3→5, 5→6, 6→7, 8→{9,10}. 11 after 1–10.

---

## Route checklist
| Route / file | Change |
|---|---|
| POST `/api/threads/:id/messages` (`threads.ts`) | fire `runAssistantTurn` on assistant-thread human plain append; thread deps. |
| `createThreadRoutes` (`threads.ts`) + `server-factory.ts` + `app.ts` | thread `assistantTurnDeps` (adapterPool, credentialResolver). |
| `PATCH /api/users/:id/assistant` (`assistant.ts`) | canonical persona write — unchanged contract; lazy-create gains defaults. |
| `GET /api/users/:id/assistant` (`assistant.ts`) | lazy-create gains defaults. |
| `POST /api/users` (`users.ts`) | assistant insert gains harness/model/persona defaults. |
| Settings → Agents agent PATCH (`agents.ts`/route) | reject soul write for `ast-*` (or UI omits — confirm one is enough). |

## Security & abuse cases
- **Rate-limit / re-entrancy:** `runAssistantTurn` fires only for human-sent plain messages on the assistant thread; assistant-sent replies must not re-trigger (loop guard in §1.5). N/A broader rate-limit — single-founder local app; one in-flight turn per thread (guard: skip if a turn is already running for the thread — track in-memory set).
- **Secret-handling:** error notices map error *class* → fixed copy; never echo `error.message`, env var names, key material, or resolver internals into a persisted/wire message. (Applicable, §2.)
- **Input-trust:** the persona is human-authored (founder), bounded at 50k chars (existing). The thread transcript fed to the model is user+assistant content — no new injection surface beyond existing chat.
- **Path-traversal / SSRF:** N/A — no new path or URL inputs (SDK workspace path is server-controlled ephemeral; model baseUrl comes from the existing gateway config, not user input on this path).
- **Authz:** trigger derives `userId` from the authenticated principal (existing `requireBoundary` on the POST route); the assistant agent id is derived `ast-${userId}` — no client-supplied id.

## protectedTests
- `packages/server/src/routes/__tests__/AD8b-assistant.routes.integration.test.ts` (assistant thread + soul CRUD contract — must keep passing).
- `packages/server/src/harness/__tests__/builtin-harness-adapter.test.ts`, `claude-agent-sdk-adapter.test.ts` (adapter behavior unchanged).
- `packages/server/src/routes/__tests__/AH2-agent-config.integration.test.ts` (per-agent model/harness selection — AH3 must not regress).
- AF14 thread-WS web tests (overlay subscribe must not break existing thread WS behavior).

## sharedFiles
`packages/server/src/routes/threads.ts`, `packages/server/src/routes/users.ts`, `packages/server/src/server-factory.ts`, `packages/server/src/app.ts`, `packages/shared/src/types.ts` (+ payload schema), `packages/server/src/routes/threads-schema.ts`, `packages/db/schema.ts` (+ migration), `packages/fabric/src/index.ts`.

## Risks / ambiguities
- **R1 (largest):** the trigger + task-free turn is net-new orchestration; reuse of harness-start boilerplate from `runSession` risks drift. Mitigate by extracting a shared `startHarnessAndDrain` helper if duplication exceeds ~30 lines.
- **R2:** AH2 was supposed to give the assistant agent a working harness+model but didn't (reconciliation #3). If AH2 follow-up lands the same fix concurrently, coordinate the `users.ts` insert change (sharedFile overlap). Flag to pipeline.
- **R3:** streaming granularity — minimum-viable (thinking→landed) chosen; reviewer should confirm it satisfies the AC "streaming response" wording before AH5 builds the screenshot assertion.
- **R4:** SDK adapter path for a chat turn needs an ephemeral workspace to write CLAUDE.md. The builtin path (default for the assistant) doesn't. Default assistant harness = builtin, so the SDK path is exercised only by the cross-harness persona-equality test, not the live lane. Acceptable.
