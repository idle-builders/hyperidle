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
