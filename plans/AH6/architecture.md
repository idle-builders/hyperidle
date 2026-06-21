# AH6 — Real assistant-interaction e2e lane (record/replay + live refresh) — Architecture

**Workpackage:** AH6 (Track AH). Complexity L. TEST-INFRASTRUCTURE — no `/concept`, no `/design`.
**Branch / worktree:** `feat/AH6-real-interaction-lane` @ `.worktrees/AH6`.

Replace AH5's synthetic probe (`ah5-real-turn-probe.ts` + the `write_session_notes("AH5-SMOKE-OK")` task) with three real-interface scenarios proven two ways:
1. **Everyday replay run** — $0, offline, no key, no network. Replays committed cassettes at the `callLlm` choke point inside the normal e2e lane.
2. **Live refresh run** — LOCAL ONLY. Re-records cassettes against a real cheap OpenRouter model, asserts loose invariants, budget-capped, fail-closed.

---

## Required reading (engineer reads before implementing)

- `packages/server/src/harness/llm-client.ts` — the `callLlm` definition (interception target).
- `packages/server/src/harness/builtin-harness-adapter.ts` — 6 `callLlm` call sites; `runChatTurn` (L439–533) is the assistant-turn path.
- `packages/server/src/services/model-gateway.ts` — `resolveModelTier` (L148) + `resolveAgentModel` (L188). Interception must sit BELOW these.
- `packages/server/src/services/assistant-turn.ts` — routes through `resolveAgentModel` (L314).
- `packages/server/src/server-factory.ts` (L230–340) + `packages/server/src/app.ts` (L186, L412) — `assistantTurnDeps` wiring gap (see Plan reconciliation R-1).
- `packages/web/src/shell/AssistantOverlay.tsx` — real testids: `tool-call-summaries` (L173), `ThinkingRow` text "Assistant is thinking…" (L409); trigger `getByRole("button",{name:/assistant/i})`.
- AH5 infra (reused verbatim): `packages/web/scripts/ah5-resolve-model.ts`, `ah5-test-server.ts`, `ah5-assert-budget.ts`; `packages/web/playwright.ah5.config.ts`, `packages/web/vite.ah5.config.ts`; `scripts/ah5-no-mock-guard.ts`; `scripts/ah5-smoke-local.ts`.
- The two disabled specs: `packages/web/e2e/AH3-assistant-responds.spec.ts` (`test.skip` Scenario-1, L209), `packages/web/e2e/ah5-live-agent-path.spec.ts` (`test.fixme` blocks, L116 / L163).
- `plans/AH5/architecture-rework.md` — local-lane wiring, AC4 "CI = local lane" reinterpretation, fail-closed contract.

---

## Plan reconciliation (spec ⇆ reality)

Every spec/prompt assumption checked against the worktree. Conflicts and how the plan handles each:

| # | Spec/prompt assumption | Reality | Plan handles |
|---|---|---|---|
| **R-1** | AH3 wired `runAssistantTurn` into the POST-message route, so "the trigger exists and the disabled tests can be enabled." | `createThreadRoutes(db, eventBus, assistantTurnDeps?)` fires `runAssistantTurn` ONLY when `assistantTurnDeps` is passed (threads.ts L611–631). `createServer`/`createApp` (server-factory L292; app.ts L412) do **NOT** build/pass `assistantTurnDeps`. So through the AH5 test-server the message→turn trigger is a silent **no-op** today. | **Load-bearing task.** The live/replay test-server must build `assistantTurnDeps = { db, eventBus, adapterPool, credentialResolver }` and pass it into `createServer`→`createApp`. Add an `assistantTurnDeps?` passthrough to `CreateServerDeps` (or build it inside `createServer` from the already-constructed `adapterPool` + `credentialResolver`) so production and the lane share one wiring. This is the single largest real-code change in AH6 — without it neither replay nor live drives a turn. |
| **R-2** | Prompt names `playwright.ah5.config.ts` / `vite.ah5.config.ts` at repo root. | They live in `packages/web/`. | Paths corrected throughout; AH6 configs sit beside them in `packages/web/`. |
| **R-3** | "Interception choke point is `callLlm` in `builtin-harness-adapter.ts`." | `callLlm` is *defined* in `llm-client.ts` and *imported/called* (6 sites) in the adapter. | Interception wraps the **definition module** (`llm-client.ts`), transparent to all 6 call sites and to `createLocalAdapterPool`'s zero-arg `new BuiltinHarnessAdapter()`. Still BELOW the gateway + `resolveAgentModel` (those run in `assistant-turn.ts` before any `callLlm`). See Design-it-twice §A. |
| **R-4** | `ah5-live-agent-path.spec.ts` fixme block references testids `assistant-overlay`, `assistant-composer`, `streaming-indicator`, `setup-name-input`, `setup-submit`. | None of those exist on `AssistantOverlay`. Real handles: trigger `getByRole("button",{name:/assistant/i})`, composer `getByRole("textbox")`, tool rows `[data-testid="tool-call-summaries"]`, thinking `getByText(/thinking/i)`. There is no dedicated `streaming-indicator` — the thinking→answered transition is `ThinkingRow` appearing then disappearing. | New AH6 specs use the **real** handles. The placeholder testids are abandoned, not invented in the component. |
| **R-5** | "Per-agent seam (`resolveAgentModel`) exercised by a real turn." | `assistant-turn.ts` calls `resolveAgentModel` ONLY when `deps.credentialResolver` is present (L311). The assistant agent is lazy-created with `modelId:"claude-sonnet-4-6"`, `modelProvider:"anthropic"` (L264–266). For the OpenRouter live lane the seeded assistant agent must carry `modelProvider:"openrouter"` + the resolved `modelId` so `resolveAgentModel` takes the per-agent branch (gateway L194). | Live test-server seeds the `ast-<userId>` assistant agent row with `modelProvider:"openrouter"` + resolved `modelId`, and passes `credentialResolver` in `assistantTurnDeps`. Per-agent-seam observation via a recorder tap (Design-it-twice §B). |
| **R-6** | AH5 lane "runs in CI" / has a GitHub Actions workflow. | No `ah5`/OpenRouter workflow in `.github/workflows/` (reverted, PR #301). | AH6 live refresh stays LOCAL ONLY — `npm run smoke:ah6`, never a GH Actions job. The replay run rides `npm run verify`/e2e (key-free). |
| **R-7** | Probe asserts `provisionSession` path + `resolveModelTier` (W4 lore). | Confirmed — the synthetic probe uses `resolveModelTier`, not `resolveAgentModel`; it is exactly the "divorced from a real interaction" path AH6 removes. | Probe + its `AH5-SMOKE-OK` task deleted; the per-agent seam is now proven through the real UI turn instead. |
| **R-8** | `ah5-gates-on-broken-stream.integration.test.ts` is AH5's "genuinely gates" proof tied to the probe predicate. | It drives `provisionSession` with a broken-stream stub and asserts the probe predicate fails. After the probe is deleted its `AH5-SMOKE-OK` framing is stale. | Keep the integration test (it proves the production `provisionSession` stream path gates) but reword AH6's "deliberately re-broken trigger" negative proof to the **assistant-turn** path (see §7). Do not delete broken-stream coverage. |

No spec↔doc contradiction requiring a `/concept` gap. All nouns (cassette, replay, refresh) are standard test-infra terms.

---

## 1. Interception design — record/replay at the `callLlm` choke point

### Where it wraps

A new module `packages/server/src/harness/llm-cassette.ts` exports a `callLlm` **interceptor** that the harness uses instead of importing the raw provider function directly. To keep the choke point at exactly one place and transparent to all 6 adapter call sites:

- Rename the raw provider implementation in `llm-client.ts` from `callLlm` → **`callLlmDirect`** (same signature; the network/Anthropic/OpenAI body unchanged).
- `llm-client.ts` re-exports `callLlm` as a thin dispatcher:
  ```ts
  export async function callLlm(options: CallLlmOptions): Promise<LlmResponse> {
    const mode = process.env.LLM_CASSETTE_MODE; // "replay" | "record" | undefined
    if (mode === "replay") return replayLlm(options);   // never touches network, no key needed
    if (mode === "record") return recordLlm(options, callLlmDirect); // real call + persist
    return callLlmDirect(options); // production: untouched, zero overhead
  }
  ```
  `replayLlm` / `recordLlm` live in `llm-cassette.ts`; `llm-client.ts` imports them. Production (no env var) is byte-for-byte the old path.

**Why the definition module, not the adapter (Design-it-twice §A):** wrapping at `llm-client.ts` is transparent to `new BuiltinHarnessAdapter()` (zero-arg, used by `createLocalAdapterPool` in prod) AND to every other `callLlm` importer (`harness-discovery.ts`). No constructor-injection plumbing, no per-call-site edits in the adapter, no change to `resolveAgentModel`/gateway ordering. The gateway and `resolveAgentModel` run in `assistant-turn.ts` strictly **before** the adapter's first `callLlm`, so they always stay on the proof path above the interception point. **Constraint honored:** "do not intercept above the gateway."

**Env-gate, not a flag arg:** `LLM_CASSETTE_MODE` is read per-call from `process.env`. Replay needs no API key and makes no network call (R-3, AC2). The everyday e2e lane sets `LLM_CASSETTE_MODE=replay` and NO `OPENROUTER_API_KEY`; the live refresh sets `LLM_CASSETTE_MODE=record` + a real key.

### Cassette keying — prompt hash (exact input)

Key = SHA-256 hex of the **canonical JSON** of the request shape that determines the model's reply, normalized so the same logical turn keys stably across runs:

```
hashInput = stableStringify({
  model:    options.model.model,            // model id only — NOT apiKey/baseUrl/provider
  system:   options.system ?? "",
  messages: options.messages.map(normalizeMessage), // role + normalized content blocks
  tools:    (options.tools ?? []).map(t => ({ name: t.name, inputSchema: t.inputSchema }))
              .sort(byName),               // tool order-independent
  maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
})
key = sha256hex(hashInput)
```

`normalizeMessage` strips/normalizes the non-deterministic parts so replay keys match record keys:
- tool_use `id` / tool_result `toolUseId` → replaced by a **positional token** `__tooluse_<n>__` (ids are random per run).
- timestamps in text content → `__ts__` (ISO-8601 + ms-epoch regex, same normalizer the DOM-snapshot net uses).
- the assistant agent id / userId-derived `ast-<uuid>` substrings → `__agent__`.
- `betId`/session `crypto.randomUUID()` echoes in transcript text → `__uuid__`.

**Deliberately excluded from the hash:** `apiKey`, `baseUrl`, `provider`, `timeoutMs` — they don't change model output and would break the offline/no-key invariant. The model **id** is included (a model swap is a meaningful cassette change). The OpenRouter `:nitro` routing suffix is stripped before hashing so a routing-policy change to the same base model reuses the cassette.

A turn fires multiple `callLlm` calls (tool round-trips). Each call keys independently on its full message history, so the Nth call's growing transcript yields a distinct key — replay returns each recorded response in turn deterministically. **Collision/missing-key policy:** in replay mode a missing key throws `CassetteMissError` (fail-closed: a missing cassette must FAIL the lane, never silently fall through to a network call). The error names the offending key + the cassette path so a maintainer re-records.

### Cassette storage + format

- Location: `packages/web/e2e/cassettes/<scenario>.json` — committed to git, text-diffable in PR review. One file per scenario (3 files), each an **ordered array** of `{ key, request, response }` entries (request stored pretty for human review; only `key` is matched).
- `response` is the serialized `LlmResponse` (`{ stopReason, content, usage }`). Usage is preserved so cost-tracking math in `trackUsage` runs identically under replay (cost will be derived from recorded token counts; see §3 note).
- Determinism: replay returns the recorded `LlmResponse` exactly; no model, no randomness. The same cassette → identical DOM → the Playwright assertions are stable offline.
- Record mode appends/overwrites entries keyed by hash, writing the file at process exit (the live test-server flushes on SIGTERM). Re-recording a scenario regenerates its file; the git diff is the maintainer's review surface.

---

## 2. The three scenarios — enabled specs

One new everyday replay spec file drives all three interactions key-free; the live refresh spec re-records the same three. Both target the **real** AssistantOverlay handles (R-4).

**Everyday replay spec:** `packages/web/e2e/AH6-assistant-interaction.spec.ts` (runs in the normal e2e lane, `LLM_CASSETTE_MODE=replay`, no key).

| Scenario | Drives | Replay assertion (offline, deterministic) |
|---|---|---|
| **S1 — assistant DM round-trip** (from AH3 `test.skip` L209) | open Assistant → send "What is 1 + 1?" → turn | reply bubble appears, distinct from seeded welcome text, non-empty (`lastReply !== welcomeText && length>0`). |
| **S2 — real tool action visible in UI** (from `ah5-live-agent-path` `test.fixme` L116) | send a prescriptive bet-shaping message → `create_bet` tool fires | `[data-testid="tool-call-summaries"]` visible and contains the tool name; for `create_bet`, `[data-testid="bet-draft-card"]` renders (overlay L141). The **tool effect visible in UI** = the tool-call row + draft bet card. |
| **S3 — thinking→answered streaming transition** (new) | send message → observe transition | `getByText(/thinking/i)` (ThinkingRow, overlay L409) visible, THEN not-visible once the reply lands (`isThinking` flips when an assistant message arrives — overlay L536). Reply bubble present after. |

**Tool-action-visible-in-UI mechanism (S2):** the recorded cassette's `runChatTurn` response contains a `tool_use` block for `create_bet`. Under replay the adapter executes the **real** `buildAssistantDraftRegistry` handler (tool execution is NOT mocked — only the LLM is), so a real draft bet row is created in the test-server DB, `CapturedToolCall[]` rides the completion event, `runAssistantTurn` persists `payload.toolCalls`, and `renderToolCallSummaries` (overlay L166) renders the row + `BetDraftCardForToolCall` fetches and renders the card. The assertion reads the rendered DOM. (This is the key reason interception is at `callLlm`, not higher: the registry/tool path stays live.)

**Notes for the builder:** the no-mock rule from AH5 applies — these specs must NOT `page.route()` the assistant/turn/session/credential/LLM/openrouter paths. Shell-scaffolding mocks (auth/me, teams, settings) are tolerated only to render the shell. The new spec must satisfy `scripts/ah6-no-mock-guard.ts` (a clone/extension of the AH5 guard, §5). The AH5 `test.skip`/`test.fixme` cases are **converted, not deleted** — per spec, the ~77 chrome-determinism mocked specs stay mocked; only these 3 interactions move to the real lane.

---

## 3. Live refresh run

**Command:** `npm run smoke:ah6` → `tsx --env-file-if-exists=.env scripts/ah6-smoke-local.ts` (a clone of `ah5-smoke-local.ts` re-pointed at AH6 artifacts). LOCAL ONLY; never GH Actions (R-6).

**Ordered steps (mirrors the AH5 orchestrator, probe step replaced):**
1. Assert `OPENROUTER_API_KEY` present — fail closed if absent.
2. Run `npx tsx scripts/ah6-no-mock-guard.ts` (no proof-path mocks).
3. Pre-flight: model-selection unit test (`packages/eval/src/smoke/__tests__/select-smoke-model.test.ts`) — money-saver, not the gate.
4. **Resolve model** — REUSE `packages/web/scripts/ah5-resolve-model.ts` unchanged (writes `routedId` to `RESOLVE_MODEL_FILE`). Honors `AH6_MODEL_OVERRIDE` like AH5.
5. **Record cassettes** — run the AH6 Playwright lane with `LLM_CASSETTE_MODE=record` + `OPENROUTER_API_KEY` against the live test-server. The three real turns fire real OpenRouter calls; `recordLlm` writes the three cassette files; a cost report `ah6-cost.json` is written (see cost note).
6. Backup `ah6-cost.json` to `/tmp` before Playwright clears its report dir (AH5 Fix5 pattern).
7. **Budget assert** — REUSE `packages/web/scripts/ah5-assert-budget.ts` logic via an `ah6-assert-budget.ts` thin wrapper that points `COST_FILE` at the AH6 report dir and reads `AH6_MAX_COST_CENTS` (default 10). Fail-closed: missing/unparseable report → exit 1.
8. Summary.

**Live invariant assertions (loose — never exact-string match):** the live spec (`LLM_CASSETTE_MODE=record`) asserts, per the spec's AC:
- reply **non-empty** and **distinct** from the seeded welcome text;
- the expected tool **fired** (`tool-call-summaries` row present) and its **effect visible** (draft bet card);
- **cost > 0 ≤ cap** (real LLM call happened, within budget).
Answer quality is NOT judged (that's the evals' job).

**Cost wiring:** the existing adapter `trackUsage` accumulates `totalCostUsd` from recorded/real token counts. For the live run, cost must reach a report file. Two reuse options (Design-it-twice §B picks the recorder tap): the recorder accumulates a per-process cost total from each real `LlmResponse.usage` × the model rate and writes `ah6-cost.json` on flush. This reuses AH5's `ah5-assert-budget.ts` contract verbatim. **Fail-closed on cap:** the recorder hard-aborts the process (non-zero) the moment cumulative cost exceeds `AH6_MAX_COST_CENTS`, so a runaway turn cannot silently overrun before the post-lane assert.

**Reuse ledger (no parallel harness):**
- `ah5-resolve-model.ts` — used as-is (model selection).
- `ah5-test-server.ts` — extended in place to (a) wire `assistantTurnDeps` (R-1) and (b) seed the assistant agent with `modelProvider:"openrouter"` + resolved `modelId` (R-5). The encrypted-credential seed path is untouched. (No fork — AH6 IS the AH-track lane; AH5's test-server becomes the shared lane server.)
- `ah5-assert-budget.ts` — wrapped by `ah6-assert-budget.ts` (path/env only).
- `playwright.ah5.config.ts` / `vite.ah5.config.ts` — AH6 adds a sibling `playwright.ah6.config.ts` that boots the same test-server + a vite config, with `testMatch: "**/AH6-*.spec.ts"` and passes `LLM_CASSETTE_MODE` through `webServer.env`. (See Design-it-twice §C on config reuse vs. clone.)

---

## 4. Per-agent seam proof (`resolveAgentModel`, cost > 0)

The live turn must *observably* pass through `resolveAgentModel` (per-agent), not only `resolveModelTier`.

**How it's driven:** the live test-server seeds `ast-<userId>` with `modelProvider:"openrouter"` + resolved `modelId` and passes `credentialResolver` into `assistantTurnDeps`. `runTurnInternal` (assistant-turn.ts L314) then calls `resolveAgentModel({ modelId, modelProvider }, "workhorse", cfg, resolver)`. Because `modelId` is set, `resolveAgentModel` takes the **per-agent branch** (gateway L194), NOT the tier fallback. This is the seam the synthetic probe never exercised (probe used `resolveModelTier`, R-7).

**How it's observed (Design-it-twice §B — recorder tap):** `recordLlm` records, on each real call, `model.model` + `model.provider` + `usage` into the cost report. The live spec asserts:
- the recorded request `model` equals the **per-agent** resolved model id (the OpenRouter `routedId`), proving the per-agent branch produced the model that reached `callLlm` (a tier-fallback would have produced `claude-*` from `BUILT_IN_GATEWAY_CONFIG`, which the assertion excludes);
- reported `cost > 0`.
This is an end-to-end observation (resolution → callLlm → cost), not a unit assertion on the gateway. Additionally a key-free **integration test** `assistant-turn-per-agent-seam.integration.test.ts` asserts that with `modelProvider:"openrouter"`/`modelId` set, `runAssistantTurn` resolves through `resolveAgentModel` and the model that reaches a stubbed `callLlm` carries the per-agent id (this is the deterministic everyday guard; the live run is the periodic real proof).

---

## 5. Synthetic-artifact removal — exact deletes + cleanup sites

**Delete:**
- `packages/web/scripts/ah5-real-turn-probe.ts` (the probe).
- The `write_session_notes("AH5-SMOKE-OK")` task — it lives ONLY inside the probe (seeded in-script, L222–233). No DB migration / seed file carries it. Deleting the probe deletes the task.

**Reference cleanup (every site grepped):**
| Site | Action |
|---|---|
| `scripts/ah5-smoke-local.ts` L160–166 (STEP 5 runs the probe) | Superseded by `scripts/ah6-smoke-local.ts` (record step). Either delete `ah5-smoke-local.ts` + `smoke:ah5` npm script, or leave AH5's orchestrator but remove its probe step. **Decision:** retire `ah5-smoke-local.ts` and the `smoke:ah5` script (package.json L63); `smoke:ah6` replaces it. The AH track has one live lane. |
| `packages/web/playwright.ah5.config.ts` L19–22 (lore mentions probe as gating proof) | Update lore OR retire the AH5 config in favor of `playwright.ah6.config.ts`. **Decision:** keep `ah5-*.spec.ts` running under a renamed `AH6` config umbrella; reword the probe lore. Avoid orphaning the encrypted-credential AC1 test in `ah5-live-agent-path.spec.ts` (still valuable). |
| `packages/web/scripts/ah5-assert-budget.ts` L24 (comment cites probe path) | Comment reword in the `ah6-assert-budget.ts` wrapper; AH5 file may stay or be wrapped. |
| `packages/server/src/harness/__tests__/ah5-gates-on-broken-stream.integration.test.ts` L156 ("mirrors ah5-real-turn-probe.ts assertions") | KEEP the test (proves `provisionSession` stream gating). Reword the comment to reference the assistant-turn liveness predicate. Do NOT couple it to the deleted probe. (R-8) |
| `packages/web/e2e/ah5-live-agent-path.spec.ts` L11–13 (cites probe as AC4 proof) | The AC3/AC5 `test.fixme` cost-artifact block (L163) depended on the probe writing `ah5-cost.json`; it is superseded by the live refresh recorder. Convert AC3 fixme → enabled S2 in the new AH6 spec; delete the stale AC5-cost fixme (cost is asserted by `ah6-assert-budget.ts`). Keep the AC1 credential-seed test. |
| package.json L34–35, L63 (`ah5-mock-guard:check`, `smoke:ah5`) | Add `ah6-mock-guard:check`; verify still runs the (renamed) guard. Retire `smoke:ah5`, add `smoke:ah6`. The `verify` chain keeps a no-mock guard step. |
| `.pipeline/work-packages/TRACK-AH.md` references | Spec text — not code; no edit. |

**Guard against silent re-introduction:** `scripts/ah6-no-mock-guard.ts` (extends the AH5 guard) additionally fails if `AH5-SMOKE-OK` or `ah5-real-turn-probe` string literals reappear anywhere under `packages/` or `scripts/` (a static grep-guard, not a test). This makes the removal load-bearing — re-adding the synthetic artifact breaks `npm run verify`.

---

## 6. Ordered task list (red tests first)

Dependencies noted. Files are absolute-from-repo-root.

**Phase A — red (failing proofs first)**
1. **A1** Write `packages/server/src/harness/__tests__/llm-cassette.test.ts` (unit): record→replay round-trip — given a recorded `{key,response}`, `replayLlm(options)` returns the exact `LlmResponse` and makes no network call; `replayLlm` on a missing key throws `CassetteMissError`; the prompt-hash normalizer maps two requests differing only in tool_use ids / timestamps to the **same** key, and differing in `model.model` to **different** keys. (Pure unit; no DB.) *Proves §1.*
2. **A2** Write `packages/server/src/__tests__/assistant-turn-per-agent-seam.integration.test.ts`: with assistant agent `modelProvider:"openrouter"`/`modelId` set + a `credentialResolver`, `runAssistantTurn` resolves through `resolveAgentModel` (per-agent branch) and the model reaching a stubbed `callLlm` carries the per-agent id (not a `BUILT_IN_GATEWAY_CONFIG` tier id). *Proves §4 key-free.*
3. **A3** Write the everyday replay spec `packages/web/e2e/AH6-assistant-interaction.spec.ts` with S1/S2/S3 using real handles (R-4), asserting against committed cassettes (cassettes added in B4). Initially red (cassettes absent + interception absent). *Proves §2 / AC1 / AC2.*

**Phase B — green (implementation)**
4. **B1** `llm-client.ts`: rename `callLlm`→`callLlmDirect`; add the env-gated `callLlm` dispatcher importing `replayLlm`/`recordLlm`. (No other call site changes — 6 adapter sites + `harness-discovery.ts` keep importing `callLlm`.) *Depends A1.*
5. **B2** `packages/server/src/harness/llm-cassette.ts`: `replayLlm`, `recordLlm`, prompt-hash + normalizer, `CassetteMissError`, cost accumulator + fail-closed cap, flush-on-exit + cost-report writer. *Depends A1.*
6. **B3 (load-bearing)** Wire `assistantTurnDeps` into `createServer`→`createApp` (server-factory + app.ts) built from the existing `adapterPool` + `credentialResolver`; extend `ah5-test-server.ts` to seed the assistant agent with `modelProvider:"openrouter"` + resolved `modelId`. *Closes R-1 + R-5; unblocks any real/replay turn through the UI.*
7. **B4** Run the AH6 lane once in `record` mode locally to generate `packages/web/e2e/cassettes/{S1,S2,S3}.json`; review the diffs; commit. *Depends B1–B3. This is a designer-as-builder boundary — recording is part of the live run; the builder regenerates if the prompt/model changes.*
8. **B5** `packages/web/playwright.ah6.config.ts` + `packages/web/vite.ah6.config.ts` (sibling of ah5; `testMatch:"**/AH6-*.spec.ts"`; pass `LLM_CASSETTE_MODE` via `webServer.env`). Add npm scripts `test:e2e:ah6` (replay; key-free) and `smoke:ah6` (record). *Depends B3.*
9. **B6** `scripts/ah6-smoke-local.ts` (clone of ah5 orchestrator, probe step → record step, reuse resolve-model + budget-assert). `packages/web/scripts/ah6-assert-budget.ts` (path/env wrapper). *Depends B2, B5.*
10. **B7** `scripts/ah6-no-mock-guard.ts` (extend AH5 guard: AH6 spec proof-path + the `AH5-SMOKE-OK`/`ah5-real-turn-probe` re-introduction grep-guard). Add `ah6-mock-guard:check` to `verify`. *Depends A3.*
11. **B8** Negative-proof spec (see §7).

**Phase C — removal**
12. **C1** Delete `packages/web/scripts/ah5-real-turn-probe.ts`. Retire `scripts/ah5-smoke-local.ts` + `smoke:ah5` script. Reword the lore in `ah5-gates-on-broken-stream.integration.test.ts`, `playwright.ah5.config.ts`, `ah5-assert-budget.ts`. Convert/clean the `ah5-live-agent-path.spec.ts` fixme blocks (keep AC1). *Depends B-phase green so coverage moves before the probe leaves.*

**Phase D — wire into the everyday lane**
13. **D1** Ensure `npm run test:e2e` (or the verify e2e step) runs `AH6-assistant-interaction.spec.ts` with `LLM_CASSETTE_MODE=replay` and NO key — confirm offline/no-network (AC2). *Depends B1–B5, B4.*

---

## 7. Negative proof — "deliberately re-broken trigger fails the lane"

Structured as a **key-free integration test** (deterministic, runs every commit), not a manual step — the gate must be always-on.

`packages/server/src/__tests__/AH6-lane-gates-broken-turn.integration.test.ts`:
- **Term 1 (trigger broken):** build `createTestApp` WITHOUT `assistantTurnDeps` (or with a deps whose `runTurn` no-ops), POST a human message on the assistant thread, assert **no** assistant reply message is appended within the turn window — i.e. the "message→turn trigger" is load-bearing: remove it and the round-trip produces nothing. This is the exact regression class AH6 guards (R-1).
- **Term 2 (stream/turn path broken):** inject a `callLlm` that throws / returns empty content via `LLM_CASSETTE_MODE=replay` against an **empty** cassette → `CassetteMissError` (replay) or an error completion → `runAssistantTurn` persists a `provider_error` notice, NOT a real reply; assert the S1 distinct-reply predicate **fails** against that state.

Plus the existing `ah5-gates-on-broken-stream.integration.test.ts` (kept, reworded) covers the `provisionSession` stream path. Together: re-breaking either the **trigger** or the **stream** makes a gate red. The live refresh run additionally exercises this against the real path (a broken trigger → empty UI → S1/S2 fail).

---

## 8. Acceptance criteria → verification method

| AC | Verification |
|---|---|
| Each essential interaction (DM round-trip, real tool action visible, thinking→answered) covered real-model-backed e2e through the real interface | `AH6-assistant-interaction.spec.ts` S1/S2/S3 drive the real AssistantOverlay (replay) + the live refresh re-records them (record). Real handles, no synthetic task. |
| Everyday run $0, offline, deterministic — replays committed cassettes through the choke point, no key, no network | A3 spec runs with `LLM_CASSETTE_MODE=replay`, no `OPENROUTER_API_KEY`; `llm-cassette.test.ts` (A1) proves `replayLlm` makes no network call + is deterministic; D1 confirms the e2e lane runs it key-free. |
| Local live refresh re-records + asserts loose invariants (non-empty/distinct reply, tool fired + effect visible, cost>0 ≤ cap); DoD live proof | `smoke:ah6` record run; live spec asserts the loose invariants; `ah6-assert-budget.ts` fail-closed on cost. |
| A real turn routes through `resolveAgentModel` (per-agent, not only `resolveModelTier`) with cost>0 | A2 integration test (key-free, every commit) + live recorder asserts recorded model == per-agent id ∧ cost>0 (§4). |
| Live cost bounded, reported, fail-closed if exceeded, cents/run; local-only no GH Actions | `ah6-assert-budget.ts` (reuses AH5 contract) + recorder hard-abort on cap; `smoke:ah6` is local-only, no workflow added (R-6). |
| Synthetic AH5 artifacts removed (`ah5-real-turn-probe.ts` + `AH5-SMOKE-OK` task) | C1 deletes them; `ah6-no-mock-guard.ts` grep-guard fails `verify` if either string reappears (§5). |
| AH5 infra (selector, encrypted test-server, budget cap) reused not rebuilt | Reuse ledger §3: `ah5-resolve-model.ts` as-is, `ah5-test-server.ts` extended in place, `ah5-assert-budget.ts` wrapped. No parallel harness — `knip` would flag a duplicate. |
| Lane genuinely gates (re-broken trigger/stream → fail) | §7 negative-proof integration tests (always-on) + kept broken-stream test. |

---

## Design-it-twice

**§A — Interception point: `llm-client.ts` definition wrapper (CHOSEN) vs. constructor-injected adapter dependency.**
- *A1 (chosen):* env-gated dispatcher in `llm-client.ts`. Trade-off: a module-level `process.env` read per call (negligible; one branch). Reject reason for the alternative below outweighs it.
- *A2 (rejected):* inject a `callLlm` impl into `BuiltinHarnessAdapter` constructor. Reject: `createLocalAdapterPool` builds `new BuiltinHarnessAdapter()` zero-arg in production; threading an injected client to the lane-only instance means a parallel construction path + touching all 6 call sites + `harness-discovery.ts`. More coupling surface, more diff, easy to leave a call site un-wrapped. The definition wrapper is one file, transparent, zero production behavior change.

**§B — Per-agent-seam observation: recorder tap (CHOSEN) vs. spy/log assertion on `resolveAgentModel`.**
- *B1 (chosen):* the recorder already sees every real request's `model.model`/`provider`; asserting the recorded model == the per-agent OpenRouter id proves the per-agent branch produced what reached `callLlm` — an end-to-end observation, free (the recorder exists for cassettes anyway). Same tap feeds the cost report.
- *B2 (rejected):* spy on `resolveAgentModel` or scrape a log line. Reject: a spy proves the function was *called*, not that its result reached the model call; a log scrape is brittle and not a real assertion. The recorder tap proves the whole span.

**§C — AH6 Playwright config: clone (CHOSEN) vs. parametrize the AH5 config.**
- *C1 (chosen):* a thin `playwright.ah6.config.ts` beside `ah5` with `testMatch:"**/AH6-*.spec.ts"` + `LLM_CASSETTE_MODE` in `webServer.env`. Trade-off: ~40 lines duplicated. Worth it: the everyday replay run is key-free and must NOT inherit AH5's "requires OPENROUTER_API_KEY" framing; a clone keeps the two modes' env contracts cleanly separate and lets the same config serve replay (verify) and record (smoke) by env.
- *C2 (rejected):* one config branching on env. Reject: a single config that is sometimes key-free and sometimes key-required is the exact ambiguity that let AH5 ship a CI-vs-local confusion (PR #301). Separate the lanes by config.

---

## Risks / ambiguities

1. **R-1 is the real risk.** The whole lane is dead if `assistantTurnDeps` isn't wired into the lane server. B3 is the first green task and is itself a small production change (`createServer`→`createApp`) that touches the production boot path — keep it additive (build deps from existing adapterPool+resolver; default behavior unchanged when not on the lane). Flag for the architecture-critique: is wiring `assistantTurnDeps` in production `createServer` in-scope for AH6, or should it be a sibling? My read: in-scope — it's the minimum to make the founder's headline interaction actually fire, and AH3's threads route was explicitly built to receive it.
2. **Cassette drift / over-broad normalization.** If the normalizer is too aggressive (e.g. collapses message content that DOES affect the reply) two logically different turns could collide and replay the wrong response. Mitigation: normalize only ids/timestamps/uuids, never semantic text; A1 asserts model-id and content differences produce distinct keys.
3. **Tool determinism under replay.** S2 executes the real `create_bet` handler; if that handler's output embeds a fresh `betId` in transcript text that later `callLlm` calls hash over, the second call's key must be stable — handled by the `__uuid__` normalizer. If a scenario needs >1 tool round, each round's cassette entry must be recorded; the spec must drive the same turn shape on replay (deterministic prompt).
4. **Live model variance.** A cheap OpenRouter model may occasionally not emit the `create_bet` tool for S2 → live record fails. Mitigation: prescriptive message (as AH5 did) makes the tool call near-deterministic; a live failure is a real signal (fail closed), not flake.
5. **Cassette commit churn.** Re-recording rewrites 3 JSON files; PR diffs show model output. Acceptable — it's the maintainer's drift-detection surface (the whole point of "cassettes don't silently drift").

---

## Security & abuse cases

- **Secret handling (live key):** OpenRouter key only from local shell / `.env`, never committed, never in cassettes (apiKey excluded from hash AND from the stored request — store `model.model` only, not `model.apiKey`/`baseUrl`). **Addressed.**
- **No new POST/PATCH route** — no rate-limit surface added. **N/A.**
- **Input-trust boundary:** cassette files are committed test fixtures, loaded only when `LLM_CASSETTE_MODE` is set (never in production — the env var is unset in prod boot). A malicious cassette can only change a test's recorded reply, not production behavior. **Addressed by env-gate.**
- **SSRF / path-traversal:** cassette path is a fixed repo-relative constant per scenario; no user/path input. **N/A.**
- **Fail-open risk:** the dangerous failure is replay silently falling through to a network call (would need a key + break offline). Prevented: missing-key → `CassetteMissError` (throw), and replay mode never calls `callLlmDirect`. **Addressed.**

## route-checklist

N/A — AH6 adds no HTTP routes. The one production-code touch (B3) wires `assistantTurnDeps` into the existing `/threads` mount (app.ts L412); no new route, no new guard.

## protectedTests

- `packages/server/src/harness/__tests__/ah5-gates-on-broken-stream.integration.test.ts` — kept; only its probe-referencing **comment** is reworded. Its assertions must not change.
- `packages/web/e2e/AH3-assistant-responds.spec.ts` no-key path (`test.describe("AH3: no-key path…")`) — unchanged; only the `test.skip` Scenario-1 is migrated out to the AH6 spec.
- The DOM-snapshot net (`catalog-snapshot.test.tsx`) — AH6 touches no design-system component; snapshots must not change.

## sharedFiles

- `packages/server/src/harness/llm-client.ts` (rename + dispatcher — coordinate with any concurrent harness WP).
- `packages/server/src/server-factory.ts` + `packages/server/src/app.ts` (assistantTurnDeps wiring).
- `packages/web/scripts/ah5-test-server.ts` (extended in place).
- `package.json` + `packages/web/package.json` (scripts).
- `scripts/` (new ah6 guard/orchestrator; retire ah5 orchestrator).

## migrations

- **Rename** `callLlm`→`callLlmDirect` inside `llm-client.ts`; the exported `callLlm` name is preserved (dispatcher), so the 6 adapter call sites + `harness-discovery.ts` + all `*.test.ts` importers of `callLlm` need **no** change. Verify with `npm run check`.
- **Delete** `packages/web/scripts/ah5-real-turn-probe.ts`; **retire** `scripts/ah5-smoke-local.ts` + `smoke:ah5` script. Update every reference site listed in §5.
- No DB schema / column migration (the `AH5-SMOKE-OK` task is in-script only).
