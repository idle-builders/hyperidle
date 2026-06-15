# AH5 — Live agent-path smoke lane — Architecture Plan

**Workpackage:** AH5 (Track AH). Complexity M. Depends on AH1 (credential reaches runtime), AH2 (per-agent model + harness). Becomes the proof vehicle for AH1–AH4.

**Skill calls per spec:** `/architecture` only. No `/concept` (no new nouns), no `/design` (test/CI infrastructure, not a user surface).

**Critique pass (8/10 APPROVED, precision-tightening):** pinned `provisionSession`/`runSession` as the single production seam both probe and gate-test drive (no hand-built adapter); pinned `encryptCredentialValue` for the net-new credential seed; corrected the eval-reuse prose (catalog fetchers are net-new); pinned cost to existing `totalCostCents` (no third helper); resolved the prescriptive tool to `write_session_notes({notes:"AH5-SMOKE-OK"})`; flagged completion-only price gate as a deliberate spec reading; switched selection fixtures to a captured real OpenRouter response; made `ah5-assert-budget.ts` fail closed on a missing cost file; `test.fixme()`-gated the UI-trigger assertion (AH3's job) while AH5's DoD gates on the probe; added the selection test to `protectedTests`.

---

## Required reading (engineer reads these before implementing)

- `.pipeline/work-packages/TRACK-AH.md` § AH5 (the spec; § AH1/AH3 for the path it proves)
- `packages/web/playwright.ah1.config.ts` — the sibling real-backend lane template
- `packages/web/vite.ah1.config.ts` — the configurable-proxy Vite config template
- `packages/web/scripts/ah1-test-server.ts` — the real-backend boot script template (PGlite + createServer + injected DB)
- `packages/web/e2e/ah1-onboarding-credentials.spec.ts` — the no-mock spec template
- `packages/server/src/services/model-gateway.ts` — `resolveAgentModel` (openrouter per-agent path), `BUILT_IN_GATEWAY_CONFIG`
- `packages/server/src/harness/llm-client.ts` — `callLlm`: openrouter uses `${baseUrl}/v1/messages` (Anthropic format), appends nothing to model id
- `packages/server/src/services/session-provisioning.ts` — `provisionSession(deps, params)` (L998) → `runSession` (L516): the SINGLE production turn entrypoint the probe + gate-test drive (NOT a hand-built adapter). Wraps `admitSession`+`runSession`; surfaces `result.totalCostCents`.
- `packages/server/src/harness/builtin-harness-adapter.ts` — the turn loop, `tool_call`/`completion`/`error` events (driven BY `runSession`, not instantiated directly)
- `packages/server/src/services/credential-encryption.ts` — `encryptCredentialValue(value, serverSecret)` (AES-256-GCM); the exact helper the test-server uses to seed the OpenRouter key into `server_credentials`
- `packages/eval/src/provision-harness.ts` — L103 surfaces `result.totalCostCents`; the precedent the probe mirrors for cost
- `packages/server/src/server-factory.ts` — `createServer(port, deps)`, `DbCredentialResolver` wiring, `getServerSecret`, env var names
- `packages/server/src/services/credential-resolver.ts` — `DbCredentialResolver` (production), `EnvCredentialResolver` (eval-only)
- `packages/eval/src/runner.ts` + `cli.ts` — real-LLM OpenRouter patterns (`OPENROUTER_API_KEY`, model-id `/` → openrouter, cost reporting)
- `packages/eslint-plugin-design/src/mock-data-policy.ts` — permitted-surface fragments (`/e2e/`, `.spec.ts`)
- `.github/workflows/ci.yml` — the hot per-PR job; AH5 adds a SEPARATE workflow, off this path
- OpenRouter docs (verified 2026-06-15): models list https://openrouter.ai/docs/api/api-reference/models/get-models ; endpoints list https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints ; nitro https://openrouter.ai/docs/guides/routing/model-variants/nitro

---

## Plan reconciliation (spec ⇆ codebase)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "reuse openrouter provider path; no new adapter" | `resolveAgentModel` (model-gateway.ts) supports `openrouter` per-agent directly (model id containing `/`, baseUrl `https://openrouter.ai/api`); `callLlm` openrouter branch posts `${baseUrl}/v1/messages` Anthropic-format with `Authorization: Bearer`. ✅ exists | Lane sets the assistant agent's `users.model_id` = resolved OpenRouter id + `users.model_provider` = `"openrouter"`. No adapter, no gateway change. |
| AH5 depends only on AH1, AH2 | Manifest confirms `depends: [AH1, AH2]`. The message→turn→stream **trigger** the lane asserts is **AH3's** deliverable (`depends:[AH1,AH2]`, sibling). **Verified absent on current main:** `POST /api/threads/:id/messages` (`packages/server/src/routes/threads.ts` ~L883) inserts the row + emits `thread_message_appended` and stops — no `provisionSession` fires off a posted plain message (`AssistantOverlay.tsx` L202 POSTs + renders, nothing drives a turn). So the UI assertion cannot pass against main today. **But the real model-call SPAN is reachable today without AH3** via `provisionSession → runSession → BuiltinHarnessAdapter → resolveAgentModel openrouter branch → callLlm` with the production `DbCredentialResolver`. | AH5 builds the **lane harness + CI infra + model-selection module**. The end-to-end "real streamed response renders" assertion is the lane's contract but is *satisfied* once AH3 lands. AH5's own green bar: the **`provisionSession`-driven real-turn probe** stands up real backend+web+OpenRouter credential and reaches a real `callLlm` (the same production seam AH3's trigger will call). See § "Sequencing & the AH3 dependency" — this is the one genuine risk; resolution below. |
| `users` has per-agent model columns | `schema.ts`: `model_id`, `model_provider`, `harness_type`, `soul_prompt`. ✅ (AH2 shipped) | Lane configures the assistant agent (`ast-{userId}`) via these columns through the API/DB-seed, harness = `builtin`. |
| OpenRouter `GET /models` returns `pricing.{prompt,completion}`, `supported_parameters`, `created`, `context_length` | Verified. `pricing.*` are **per-token USD strings** (OpenRouter convention) — multiply by 1e6 for per-1M. `created` is unix seconds. `supported_parameters` on the **model** is a union across providers — NOT authoritative for per-provider tool support. | Gate logic: 2026 generation via `created`; price ceiling via `pricing.completion`. **Deliberate reading:** the spec wording is self-contradictory ("combined prompt+completion price under a documented ceiling (~$0.50/1M completion)") — the plan gates on **completion price only**, since completion dominates cost for the lane's short prescriptive prompts and the spec pins the number to `$0.50/1M completion`. Flagged so the reviewer/builder do not treat it as drift. Per-provider `tools` gate uses the **endpoints** API, not the model-level `supported_parameters`. |
| `GET /models/{id}/endpoints` returns per-provider `supported_parameters`, `uptime_last_30m`, `throughput_last_30m`, `latency_last_30m`, `pricing`, `status` | Verified. `throughput_last_30m`/`latency_last_30m` are percentile objects `{p50,p75,p90,p99}` (use `p50`). These populate only on **authenticated** reads. | Per-provider `tools` gate, `uptime_last_30m ≥ 0.99`, ≥2 such providers; rank by `throughput_last_30m.p50` desc, `latency_last_30m.p50` asc, price tiebreak. |
| `:nitro` suffix routes fastest provider | Verified: `:nitro` == `provider.sort:"throughput"`; append to model slug. | Winner routed as `${id}:nitro`. |
| Exclude `:free` | `:free` is a model-id suffix variant in the catalog. | Filter ids ending `:free`. |
| Real key as CI secret, env-injected | `OPENROUTER_API_KEY` already the eval convention; `createServer` + `DbCredentialResolver` read the credential **from the DB store**, not env. **Correction:** `ah1-test-server.ts` does NOT seed any credential — it drives real `PUT /api/credentials/*` from the spec; `migrateCredentialsToStore` only relocates legacy `server_config` blobs and never reads `OPENROUTER_API_KEY` from env. So AH5's env→store seed is **net-new**, not a reuse. | The lane's test server **seeds** `openrouter_api_key` into `server_credentials` at boot from `process.env.OPENROUTER_API_KEY` via the production helper **`encryptCredentialValue(value, serverSecret)`** (`services/credential-encryption.ts`, AES-256-GCM — the same helper `routes/credentials.ts` L230 uses), with `serverSecret` from `getServerSecret`, inserting into `serverCredentials` (`@hyperidle/db`). No `EnvCredentialResolver` on the proof path → production `DbCredentialResolver` is exercised against a real encrypted row. |
| `apiFetch` injects `X-API-Key` from `VITE_HYPERIDLE_API_KEY` | Confirmed by AH1 config (web `apiFetch` sends `X-API-Key`; Hono auth validates). | AH5 Vite/Playwright configs reuse the same `VITE_HYPERIDLE_API_KEY`↔`HYPERIDLE_API_KEY` handshake. |

**No `/concept` gap found.** No spec/doc contradiction.

---

## Sequencing & the AH3 dependency (the one real risk)

The spec's headline AC ("the lane sends a message to the Assistant and asserts a real, streamed model response renders") requires the **AH3 trigger** (message→turn→stream→render). AH5 depends on AH1+AH2, **not** AH3. Two coherent readings; the plan commits to one:

**Decision: AH5 ships the harness + CI + model-selection as the reusable vehicle, and ships the full Playwright proof spec, but the proof spec is allowed to be the surface AH3 turns green.** Rationale: the spec explicitly says "This lane is the execution vehicle for every other workpackage's Playwright proof" and "those workpackages do not stand up their own parallel real-path harness." That makes AH5's *deliverable* the harness; AH3 plugs into it. To keep AH5 itself provably alive without AH3, AH5 also ships a **deterministic real-turn server probe** (`packages/web/scripts/ah5-real-turn-probe.ts`) that **drives the production `provisionSession(deps, params)` entrypoint** (`session-provisioning.ts` L998 → `runSession` L516) — the SAME seam AH3's eventual message→turn trigger will call. It does **NOT** instantiate `BuiltinHarnessAdapter` by hand with bespoke wiring; a parallel re-implementation would prove a different path than production and make the gate theater. Running one real OpenRouter turn through `provisionSession` and asserting a `tool_call` fired proves the credential + model-gateway + harness + `callLlm` span is alive end-to-end with no mocks, on the production path, independent of the UI trigger.

- If AH3 is already merged when AH5 runs: the UI spec is the primary proof; the probe is the redundancy/fallback test.
- If AH3 is not yet merged: the **UI-trigger assertion** (send-message→streamed-response→tool-summary-row) is written and committed but marked `test.fixme()` with an explicit `@lore AH5: un-fixme when AH3 trigger lands`; the **`provisionSession`-driven probe is the gating proof** for AH5's own DoD. This keeps AH5 honest (real production path exercised, fails closed) without blocking on a sibling.

This is the **founder-feedback-safe** reading: it guarantees a real, no-mock, model-call path is exercised and gated by AH5 itself, while delivering the UI harness AH3 needs. The reviewer should confirm this sequencing call.

---

## §1 — Model-selection module

### Location & rationale (design-it-twice)

**Option A — in `packages/eval/src/`** (e.g. `openrouter-catalog.ts` + `select-smoke-model.ts`). Shape: pure functions; `selectSmokeModel(catalog, endpointsByModel, policy) → ResolvedSelection`; a thin `fetchCatalog(apiKey)` HTTP layer. Trade-off: eval owns the `OPENROUTER_API_KEY` convention and the real-LLM posture, so it's the natural home and keeps real-LLM concerns out of `server`. **Note (not a reuse):** eval owns the OpenRouter *inference* key convention only — there is **no** catalog/`/models`/`/endpoints` fetch code in `packages/eval/src` to reuse (verified: zero hits for `/models`, `endpoints`, `fetchCatalog`). `fetchSmokeCatalog`/`fetchModelEndpoints` are entirely net-new; placement is about posture, not code reuse. Reason to reject: `eval` is not currently imported by `web`/Playwright; the lane (in `packages/web`) would need a cross-package import of `@hyperidle/eval`.

**Option B — new `packages/smoke-lane/`** package owning selection + the test-server + the probe. Trade-off: clean ownership, importable by web e2e and CI. Reason to reject: new package = more surface (tsconfig, knip, build wiring) for an M workpackage; violates "boring technology / smallest useful version."

**Chosen: A**, with the selection logic placed in **`packages/eval/src/smoke/`** and exported from `@hyperidle/eval`. The pure selection function is unit-tested in `packages/eval/src/smoke/__tests__/`. The lane test-server (in `packages/web/scripts/`) imports `selectSmokeModel` + `fetchSmokeCatalog` from `@hyperidle/eval` (workspace hoisting already lets `packages/web/scripts/*` import workspace packages — see AH1 server `@lore`). This reuses eval's existing OpenRouter posture and avoids a new package.

### Files

- `packages/eval/src/smoke/openrouter-catalog.ts` — HTTP layer.
- `packages/eval/src/smoke/select-smoke-model.ts` — pure gate/rank/fallback logic (no I/O).
- `packages/eval/src/smoke/policy.ts` — the policy constants (price ceiling, uptime floor, min providers, generation cutoff).
- `packages/eval/src/smoke/index.ts` (or extend `packages/eval/src/index.ts`) — re-exports.
- `packages/eval/src/smoke/__tests__/select-smoke-model.test.ts` — unit tests (no live key).
- `packages/eval/src/smoke/__tests__/fixtures/openrouter-endpoints.captured.json` — a **captured REAL** authenticated `GET /models/{id}/endpoints` (+ `GET /models`) response snapshot, committed verbatim. Tests narrow synthetic gate/rank cases from this real shape rather than hand-authoring JSON, so field shapes (`pricing.*` per-token USD strings, `created` unix-seconds, `throughput_last_30m`/`latency_last_30m` `{p50,...}` objects) are real and the test breaks loudly if OpenRouter changes them.

### Types (contracts)

```ts
// policy.ts
export interface SmokeModelPolicy {
  /** Models created on/after this unix-seconds cutoff qualify as "2026-generation". */
  readonly minCreatedUnixSec: number;        // 2026-01-01T00:00:00Z = 1767225600
  /** Max completion price, USD per 1M tokens. Gate on completion price only — prompt price is
   *  negligible for the lane's short prescriptive prompts. Completion-only ceiling, per the spec's
   *  `$0.50/1M completion` (the spec's "combined prompt+completion" wording is overridden by its own
   *  concrete number; see Plan reconciliation row 4). */
  readonly maxCompletionPricePerMillion: number; // 0.50
  /** Min per-provider uptime_last_30m (0..1). */
  readonly minUptimeLast30m: number;         // 0.99
  /** Min count of tool-capable providers above the uptime floor. */
  readonly minToolProviders: number;         // 2
}
export const DEFAULT_SMOKE_POLICY: SmokeModelPolicy;

// openrouter-catalog.ts — verbatim OpenRouter field names
export interface OpenRouterModel {
  readonly id: string;                        // e.g. "deepseek/deepseek-v4-flash"
  readonly created: number;                   // unix seconds
  readonly pricing: { readonly prompt: string; readonly completion: string }; // USD/token strings
  readonly supported_parameters?: readonly string[]; // model-level union (NOT used for tool gate)
  readonly context_length?: number;
}
export interface OpenRouterEndpoint {
  readonly provider_name: string;
  readonly supported_parameters: readonly string[]; // per-provider — authoritative for "tools"
  readonly pricing: { readonly prompt: string; readonly completion: string };
  readonly uptime_last_30m: number | null;          // 0..1
  readonly throughput_last_30m: { readonly p50: number } | null;
  readonly latency_last_30m: { readonly p50: number } | null;
  readonly status: string;                          // EndpointStatus
}
export interface ModelEndpoints {
  readonly id: string;
  readonly endpoints: readonly OpenRouterEndpoint[];
}

/** Live HTTP. Only called inside the CI lane (has the key). */
export async function fetchSmokeCatalog(apiKey: string): Promise<readonly OpenRouterModel[]>;
export async function fetchModelEndpoints(apiKey: string, modelId: string): Promise<ModelEndpoints>;

// select-smoke-model.ts — PURE, no I/O, fully unit-testable
export interface SmokeCandidate {
  readonly id: string;                 // bare id (no :nitro)
  readonly routedId: string;           // `${id}:nitro`
  readonly completionPricePerMillion: number;
  readonly toolProviderCount: number;
  readonly bestThroughputP50: number;
  readonly bestLatencyP50: number;
}
export interface SelectionInput {
  readonly models: readonly OpenRouterModel[];
  /** Endpoints keyed by model id. The caller fetches endpoints for the price/age survivors only. */
  readonly endpointsByModel: ReadonlyMap<string, ModelEndpoints>;
  readonly policy: SmokeModelPolicy;
}
export interface SelectionResult {
  /** Ranked survivors, best first. Empty → no qualifying model. */
  readonly ranked: readonly SmokeCandidate[];
}
export function selectSmokeModel(input: SelectionInput): SelectionResult;
```

### Algorithm (gate → rank → fallback)

1. **Pre-filter models (cheap, model-level, no endpoints needed):** drop ids ending `:free`; drop `created < policy.minCreatedUnixSec`; drop where `pricing.completion * 1e6 > policy.maxCompletionPricePerMillion`. (The HTTP caller fetches endpoints only for survivors — keeps live calls bounded.)
2. **Per-model endpoint gates (using `endpointsByModel`):**
   - Keep only endpoints whose `supported_parameters` includes `"tools"` AND `uptime_last_30m != null && >= policy.minUptimeLast30m` AND `status` is healthy (not `"deprecated"`/`"disabled"`).
   - `toolProviderCount = ` count of such endpoints. **Disqualify the model if `toolProviderCount < policy.minToolProviders`** (redundancy gate).
3. **Build candidates:** `completionPricePerMillion` from model pricing; `bestThroughputP50 = max(throughput_last_30m.p50)` over qualifying endpoints (null → 0); `bestLatencyP50 = min(latency_last_30m.p50)` over qualifying endpoints (null → +∞); `routedId = ${id}:nitro`.
4. **Rank survivors:** sort by `bestThroughputP50` desc, then `bestLatencyP50` asc, then `completionPricePerMillion` asc. Return as `ranked`.
5. **Fallback:** the caller iterates `ranked` in order. `ranked[0]` is the default. **Delisting / uptime-drop fallthrough** is expressed by `ranked` being an *ordered list*: if the top id later fails (delisted between selection and use, or a provisioning call returns a "model not available" error), the lane retries with `ranked[1]`, etc. This makes "top choice delisted → next candidate" a **pure, unit-testable** property of `selectSmokeModel` (remove the top model from the fixture → assert `ranked[0]` becomes the previous `ranked[1]`).

### Unit-testability without a live key (AC requirement)

All gate/rank/fallback logic is in `selectSmokeModel` (pure). Tests derive cases from the **captured real OpenRouter response fixture** (`fixtures/openrouter-endpoints.captured.json`), not hand-authored JSON — so the field shapes under test are the ones OpenRouter actually returns:

- `select-smoke-model.test.ts` cases:
  - **Tool gate per-provider:** a model whose model-level `supported_parameters` includes `tools` but whose only cheap endpoint lacks it (the gpt-oss-20b case) → disqualified.
  - **Generation gate:** a 2024-`created` model under the price ceiling → disqualified.
  - **Price ceiling:** a 2026 tool-capable model at `completion` > ceiling → disqualified.
  - **Redundancy gate:** a 2026 tool-capable model with only **one** provider ≥99% uptime → disqualified; with two → qualifies.
  - **`:free` exclusion:** `:free` id dropped.
  - **Ranking:** two survivors; higher throughput wins; equal throughput → lower latency; equal both → cheaper.
  - **`:nitro` routing:** `routedId === \`${id}:nitro\``.
  - **Fallback (the load-bearing AC):** given `ranked = [A, B]`, removing A's model from the input yields `ranked[0] === B` and the lane still has a candidate. Asserts the delisting-fallthrough behavior deterministically, no network.

The live HTTP (`fetchSmokeCatalog`/`fetchModelEndpoints`) is exercised **only** in the CI lane (which has the key); it is deliberately thin (fetch + JSON parse + field-narrowing) so almost no logic is untested. **One additional assertion:** a test feeds the captured fixture through `fetchModelEndpoints`'s field-narrowing logic (the pure parse half, factored out of the HTTP wrapper) and asserts the narrowed shape matches the captured fixture's shape — so a silent OpenRouter API-shape drift reddens the unit suite, not just the live lane.

---

## §2 — The Playwright lane

### Files (mirror AH1's trio)

- `packages/web/playwright.ah5.config.ts` — Playwright config, `testMatch: "**/ah5-*.spec.ts"`, two webServers (API + Vite), serial, `screenshot: "on"`, `trace: "on"`. Ports: **API 3097, Vite 5182** (avoid AH1's 3099/5180 and dev 3001/5179).
- `packages/web/vite.ah5.config.ts` — clone of `vite.ah1.config.ts` with `port 5182`, `VITE_API_PORT` proxy target default `3097`.
- `packages/web/scripts/ah5-test-server.ts` — real-backend boot: in-memory PGlite → migrate → **seed `openrouter_api_key` into `server_credentials` via `encryptCredentialValue(process.env.OPENROUTER_API_KEY, getServerSecret())`** (AES-256-GCM, the production helper from `services/credential-encryption.ts`) → `createServer(3097, { db, workspaceBasePath })`. Also seeds the assistant agent's `model_id`/`model_provider`/`harness_type` if the spec needs a pre-configured agent (else onboarding + AH2 defaults handle it). Emits `[ah5-test-server] ready ...`.
- `packages/web/scripts/ah5-resolve-model.ts` — tiny launcher the test-server (or a Playwright `globalSetup`) calls: reads `OPENROUTER_API_KEY`, calls `fetchSmokeCatalog`/`fetchModelEndpoints` + `selectSmokeModel`, writes the chosen `routedId` (+ ordered fallback list) to a file/env the test-server reads when seeding the agent model. Keeps the live selection call once per run, off the unit-test path.
- `packages/web/e2e/ah5-live-agent-path.spec.ts` — the no-mock UI proof.
- `packages/web/scripts/ah5-real-turn-probe.ts` — deterministic real-turn server probe driving **`provisionSession(deps, params)`** (the production seam; NOT a hand-built adapter). Asserts a real `completion` + the `write_session_notes` `tool_call` fired and `result.totalCostCents ≤ cap`; writes `ah5-cost.json`. The AH5-own gating proof; see §4 and Sequencing.

### How it stands up real server+web+credential with zero proof-path mocks

- API server: real Hono via `createServer` with injected migrated PGlite, exactly like AH1. **`DbCredentialResolver` is the resolver** (production wiring) — the OpenRouter key is read from the encrypted store, not env, so the real production credential path is exercised.
- Web: real Vite build proxying `/api → 3097`; `apiFetch` sends `X-API-Key` from `VITE_HYPERIDLE_API_KEY`.
- **No `page.route()` on the assistant/session/credential/LLM path.** Per the AH1 precedent, shell-scaffolding mocks for `auth/me`/`teams`/`settings` are tolerated *only* to render the app shell, and only where they are NOT on the proof path. The credential, thread-message, session, and any LLM-bound route reach the real backend. A static guard (§5) asserts the AH5 spec contains no `page.route` matching assistant/session/credential/model/openrouter globs.

### Flow (onboarding → assistant → message → real response)

1. `page.goto("/setup")`; fill name; **enter the real OpenRouter key** in onboarding (or, if onboarding only collects Anthropic, the test-server pre-seeds the openrouter credential and the spec verifies it as set). Submit; wait for `/work/portfolio`.
2. Ensure the assistant agent (`ast-{userId}`) has `model_provider="openrouter"`, `model_id=<routedId>`, `harness_type="builtin"` (seeded by test-server from `ah5-resolve-model` output).
3. Open the Assistant overlay (`sidebar` assistant trigger → `AssistantOverlay`).
4. Send a **prescriptive-prompt** message via the composer (POST `/api/threads/{id}/messages`, real).
5. Assert a **real streamed response** renders, distinct from the seeded welcome text:
   - Wait for an assistant message bubble whose text is NOT the welcome string.
   - Assert the streaming/working indicator appeared then resolved (whatever testid AH3 exposes; coordinate with AH3 — see §6).
   - Screenshot the answered state → `playwright-report-ah5/`.

### Prescriptive-tool-call scenario + asserting the tool effect in the UI

- **RESOLVED tool choice (do NOT defer to AH3):** the probe and lane invoke the builtin **`write_session_notes`** tool — registered in the builtin harness loop and reachable on the `provisionSession`-driven turn today, so it is the safe, AH3-independent choice. **Exact prompt + arguments:** `"Call the write_session_notes tool with notes set to 'AH5-SMOKE-OK'. Do not respond with prose; emit only the tool call."` → tool call `write_session_notes({ notes: "AH5-SMOKE-OK" })`. Determinism comes from the prescriptive prompt, not model intelligence.
- **Tool effect observable in UI:** the overlay renders `data-testid="tool-call-summaries"` rows on the assistant's response (see `AssistantOverlay.tsx`). The lane asserts a `tool-call-summaries` row appears naming `write_session_notes`, and screenshots that state. **Caveat (rides the same gate as the rest of the UI spec):** the `tool-call-summaries` UI row only appears once AH3's message→turn trigger drives the overlay; pre-AH3 the UI-effect half is `test.fixme()`-gated with the rest of the UI spec. The **probe** carries the AH3-independent half: it asserts the `tool_call` event for `write_session_notes` (with `notes === "AH5-SMOKE-OK"`) fired in the real `provisionSession` turn. No state-changing tool is required; if a richer UI-visible builtin (e.g. `create_task`) is later confirmed registered on the overlay turn, the lane may additionally assert the created entity — but `write_session_notes` is the committed baseline.
- The lane never judges answer *quality* (per spec) — only that the prescribed tool call fired.

### Token budget + cost reporting + fail-closed (lane-side)

- **Cost source (pinned — no third helper):** the probe reads **`result.totalCostCents`** directly off the `provisionSession`/`runSession` result — the already-aggregated total, mirroring `packages/eval/src/provision-harness.ts` L103. It does **not** re-derive cost from `cost_update` events, and does **not** add a `computeCostCents` helper (`estimateCostUsd` in builtin-harness-adapter.ts is module-private and is not re-exported). The only new pure code is a cap **comparison** against `totalCostCents`. Token total likewise comes off the result's usage aggregate.
- **Budget cap:** an env `AH5_MAX_TOKENS` (default e.g. 20_000) and `AH5_MAX_COST_CENTS` (default 5). The probe reads `totalCostCents` (+ token total); if either exceeds the cap, the probe/test **fails** (`expect(totalCostCents).toBeLessThanOrEqual(cap)`), and the CI step also asserts it (§3). Report is written to `playwright-report-ah5/ah5-cost.json` and echoed to the CI log. "Fail closed" = the assertion is `toBeLessThanOrEqual`; an overflow reddens the lane.

---

## §3 — CI wiring

### New workflow (off the hot per-PR path)

- **New file `.github/workflows/ah5-smoke.yml`** (separate from `ci.yml` so the per-PR gate is untouched and never blocked on OpenRouter latency/cost).
- **Triggers:**
  - `schedule:` nightly cron (e.g. `cron: "0 6 * * *"`).
  - `workflow_dispatch:` (manual run).
  - `pull_request:` **only when labeled** `run-smoke` (use `if: contains(github.event.pull_request.labels.*.name, 'run-smoke')`) — opt-in, never automatic on every PR.
- **Secret:** `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}` injected into the lane's env. Never committed; absent on forks → step is skipped/neutral (guard with `if: ${{ secrets.OPENROUTER_API_KEY != '' }}` at job level).
- **Job steps:** checkout → setup-node 26 → `npm ci` → `npx playwright install --with-deps chromium` → run model-selection unit tests (fast, fail early) → run the lane: `npm run -w @hyperidle/web test:e2e:ah5` (new script) with `OPENROUTER_API_KEY`, `AH5_MAX_TOKENS`, `AH5_MAX_COST_CENTS` in env → upload `playwright-report-ah5` + `ah5-cost.json` as artifacts (`actions/upload-artifact@v4`, `if: always()`).
- **Cost gate in CI:** a final step `npx tsx packages/web/scripts/ah5-assert-budget.ts` (`if: always()`, so it runs even on lane failure) reads `ah5-cost.json` and exits non-zero if over budget — redundant with the in-test assertion, so budget overflow fails CI even if the test harness mis-handles it. **Fail closed on absence, not just overflow:** if `ah5-cost.json` is **missing or unparseable** (e.g. the lane crashed before writing it — empty `ranked`, turn threw, selection failed), the step exits **non-zero**. A skipped cost-write must NOT read as "no overflow → green."

### New npm scripts

- `packages/web/package.json`: `"test:e2e:ah5": "playwright test --config playwright.ah5.config.ts"`.
- root `package.json`: `"test:e2e:ah5": "npm run -w @hyperidle/web test:e2e:ah5"` (optional convenience).
- `ci.yml` is **not modified** (the hot path stays as-is). The mock-inventory/knip/lint in `verify` continue to pass because the new files live on permitted surfaces (`/e2e/`, `scripts/`, `.spec.ts`).

---

## §4 — "Genuinely gates" proof (an AC)

The lane must demonstrably FAIL when the trigger/stream path is broken. Mechanism (no hand-waving):

- **A standalone test asserts the lane's gating contract by deliberately breaking the path and observing red**, runnable in `packages/` without a live key:
  - `packages/server/src/harness/__tests__/ah5-gates-on-broken-stream.integration.test.ts`: drives **`provisionSession`/`runSession`** — the SAME production entrypoint the probe and the future AH3 trigger use, NOT a hand-built `BuiltinHarnessAdapter` — but injects the break **at that seam** (a harness deps stub whose adapter emits NO `completion` event, simulating the re-broken stream). Because the break is injected at the production seam, the assertion proves the **production** turn path, not a parallel one. Asserts the probe's "real response observed" check **throws/returns failure** (i.e. the assertion that proves liveness is the one that fails). This proves the probe's success condition is load-bearing — a dead stream cannot pass, and it cannot pass while production stays broken.
- **Plus a documented manual/CI demonstration:** a `@lore AH5` note + a commented `xtest` (or a `--prove-gating` flag on the probe) that, when the trigger is reverted, the lane reddens. The integration test above is the automated, always-run proof; the live demonstration is recorded in the PR.
- Crucially, the probe's pass condition is **"a real `completion`/streamed assistant text + a tool-call event were observed"** — not "the HTTP request returned 200." Breaking the trigger removes those events → probe fails → lane fails.

This makes "deliberately re-broken trigger/stream path makes the lane fail" a **unit/integration-testable** property, satisfying the AC without depending on a live model for the gating proof itself.

---

## §5 — Acceptance criteria → verification method

| AC | Type | Verification |
|---|---|---|
| **AC1** Frontend-driven lane asserts a real streamed response, no mocks on the path | Visual/E2E + static | `ah5-live-agent-path.spec.ts` drives onboarding→overlay→message→asserts non-welcome streamed text + screenshot. **Static guard** (ESLint custom rule or `knip`-adjacent script) asserts the AH5 spec source contains no `page.route(` matching assistant/session/credential/model/openrouter path globs. (The **UI-trigger assertion is `test.fixme()`-gated** until AH3 lands — per Sequencing; the **`provisionSession`-driven real-turn probe** is the AH5-own runtime proof that the real `callLlm` fired through the production seam with no mock, and it gates AH5's DoD.) |
| **AC2** Model selected at run time by the documented gates, ranked, `:nitro`, not hardcoded; delisting → next candidate | Runtime (pure) | `select-smoke-model.test.ts` — gate, rank, `:nitro`, and the **delisting-fallthrough** cases (fixture JSON, no key). **Static guard:** lint/grep asserts no permanent OpenRouter model id is hardcoded as the lane's model (the id only appears as a fixture or is produced by `selectSmokeModel`). |
| **AC3** ≥1 real tool-using action via prescriptive prompt; tool effect observable in UI | Visual/E2E | The lane's prescriptive-prompt step + assertion on `data-testid="tool-call-summaries"` (and/or created-entity visibility) + screenshot. The **probe** also asserts a `tool_call` event fired in the real turn. |
| **AC4** Runs in CI off hot path; genuinely gates (broken trigger → fail) | CI + integration | `.github/workflows/ah5-smoke.yml` (scheduled + dispatch + labeled-PR). `ah5-gates-on-broken-stream.integration.test.ts` proves the success condition is load-bearing (§4). |
| **AC5** Token cost bounded by a cap and reported; cents not dollars; fail closed | Runtime + CI | Probe reads `result.totalCostCents` (existing aggregate, no new helper); in-test `expect(totalCostCents).toBeLessThanOrEqual(AH5_MAX_COST_CENTS)` + `ah5-cost.json` artifact + CI budget-assert step (`ah5-assert-budget.ts`, **fail-closed on missing/unparseable file**). A pure `isWithinCostCap` unit test asserts the cap comparison. |

### Static-property guards (not tests — lint/script)

- **No-mock-on-proof-path guard:** a script `scripts/ah5-no-mock-guard.ts` (run in `ah5-smoke.yml` AND addable to `verify`) that reads `packages/web/e2e/ah5-*.spec.ts` and fails if any `page.route(` argument matches the proof-path glob set (`**/threads/**/messages`, `**/credentials/**`, `**/sessions/**`, `**/model-gateway**`, `openrouter.ai`). This is a static property → script, not a vitest test (per testing rules).
- **No-hardcoded-model guard:** same script asserts no string literal matching a permanent OpenRouter slug pattern (`<vendor>/<model>` not ending in a fixture marker) is assigned as the lane's model outside `__tests__/` fixtures.

---

## §6 — Coordination notes (AH3 selectors)

The lane asserts on AH3's streaming/response surface. AH3 owns: the streaming indicator testid, the assistant-response bubble testid, and the error-state testid. **AH5 must use whatever AH3 exposes** — do not invent parallel testids. If AH3 is unmerged at AH5 build time, the spec references the *intended* testids and is `test.fixme()`-gated, with the probe carrying the gating proof. Capture this as `@lore AH5` in the spec.

---

## §7 — Ordered task list (red → green)

1. **Policy + types** — `packages/eval/src/smoke/policy.ts`, `openrouter-catalog.ts` (types + thin fetchers), `select-smoke-model.ts` (signatures only, throwing stubs). *(no test yet)*
2. **RED: selection unit tests** — `packages/eval/src/smoke/__tests__/select-smoke-model.test.ts` with fixture JSON for all gate/rank/`:nitro`/**fallthrough** cases. Fails (stubs throw). Proves AC2.
3. **GREEN: implement `selectSmokeModel`** — pure gate→rank→fallback until step-2 tests pass.
4. **RED: cost-cap test** — pure test asserting a cap comparison against `result.totalCostCents` (the value read off the `provisionSession` result; no new cost-derivation helper). Proves AC5 math.
5. **GREEN: implement the cap comparison** — read `result.totalCostCents` (mirroring `eval/src/provision-harness.ts` L103) and a pure `isWithinCostCap(totalCostCents, capCents)` predicate. Do NOT re-derive cost from events; do NOT export `estimateCostUsd` (module-private).
6. **RED: gating integration test** — `packages/server/src/harness/__tests__/ah5-gates-on-broken-stream.integration.test.ts` driving **`provisionSession`/`runSession`** (the production seam) with a harness-deps stub whose adapter emits no `completion`; asserts the liveness check fails. Proves AC4-gating against the production path, NOT a parallel adapter.
7. **GREEN: implement the real-turn probe** — `packages/web/scripts/ah5-real-turn-probe.ts` driving `provisionSession`; success condition (real `completion` + `write_session_notes` `tool_call` observed, `totalCostCents ≤ cap`) is the one the step-6 test pins.
8. **Lane infra** — `vite.ah5.config.ts`, `playwright.ah5.config.ts`, `packages/web/scripts/ah5-test-server.ts` (PGlite + encrypted openrouter-credential seed + createServer), `ah5-resolve-model.ts`. Mirror AH1 trio.
9. **UI proof spec** — `packages/web/e2e/ah5-live-agent-path.spec.ts`: onboarding→overlay→prescriptive message→assert real streamed response + `write_session_notes` tool-call summary + screenshots. **`test.fixme()`-gate the UI-trigger assertion** (the send-message→streamed-response + tool-summary-row checks — AH3's deliverable) with `@lore AH5: un-fixme when AH3 trigger lands`, while AH5's own DoD gates on the `provisionSession`-driven probe (step 7). Onboarding + credential-seed-verification steps can stay live (they don't depend on the trigger). If AH3 is already merged, drop the fixme.
10. **Static guards** — `scripts/ah5-no-mock-guard.ts` (+ no-hardcoded-model). Wire into `ah5-smoke.yml`; optionally add to `verify`. Proves AC1/AC2 static halves.
11. **npm scripts** — `test:e2e:ah5` (web + root).
12. **CI workflow** — `.github/workflows/ah5-smoke.yml` (schedule + dispatch + labeled-PR, secret-gated, artifact upload, budget-assert step). **Test the workflow on the feature branch before merge** (MEMORY: test CI before merge) via `workflow_dispatch` on the branch.
13. **Verify** — `npm run check` + `npm run lint` + `npm run test` (unit) green; run the lane locally with a real key once (`OPENROUTER_API_KEY=... npm run -w @hyperidle/web test:e2e:ah5`) and inspect the screenshot + cost artifact (Proof & DoD).

---

## §8 — Risks / ambiguities

1. **AH3 trigger dependency (primary).** Resolved by the probe-as-gating-proof + fixme-gated UI spec (Sequencing). Reviewer should confirm the call; if the pipeline guarantees AH3 merges before AH5, the UI spec is the live proof and the probe is redundancy.
2. **OpenRouter `pricing.*` units.** Verified as per-token USD strings; the plan converts ×1e6. If a future API change makes them per-1M, the `* 1e6` must drop — covered by a unit test asserting the conversion against a known fixture.
3. **`throughput_last_30m`/`latency_last_30m` only on authenticated reads.** The lane has the key; unit tests use fixtures. No anonymous read in the proof path.
4. **CI flakiness from a single provider blip.** Mitigated by the ≥2-provider redundancy gate + `:nitro` + ordered-fallthrough retry across `ranked`. If `ranked` is empty (no qualifying model), the lane fails with a clear "no qualifying smoke model" error (a real signal, not a flake) rather than silently passing.
5. **Tool choice for the prescriptive prompt — RESOLVED.** `write_session_notes({ notes: "AH5-SMOKE-OK" })` is the committed baseline: a builtin registered in the harness loop, reachable on the `provisionSession` turn today (AH3-independent), surfaced via `tool-call-summaries` in the overlay. The probe asserts the `tool_call` event (AH3-independent); the UI-row assertion rides the `test.fixme()` gate with the rest of the UI spec. No deferral to AH3.
6. **`createServer` + workspace adapter in CI.** AH1 runs `HYPERIDLE_PROFILE=laptop` with a tmp workspace dir; AH5 reuses that. The builtin harness does not need a real workspace for a single prescriptive tool call, but the probe must run with a writable tmp dir.

---

## Security & abuse cases

- **Secret handling (new credential surface in CI):** `OPENROUTER_API_KEY` is a GitHub Actions secret, never committed, never echoed (mask by default). The test-server seeds it **encrypted** into `server_credentials` via the existing AES-256-GCM path — no plaintext key in logs, DB, or artifacts. Cost/report artifacts contain tokens+cents only, never the key. **Addressed.**
- **Rate-limit / budget abuse:** the budget cap + fail-closed prevents a runaway loop from burning the key; `BuiltinHarnessAdapter` already bounds `maxIterations`. **Addressed.**
- **SSRF (outbound URL):** the only outbound URL is the fixed `https://openrouter.ai/api` baseUrl from the gateway constant + the catalog endpoints; no user-controlled URL. **N/A (fixed host).**
- **Input-trust boundary (agent-authored field):** the prescriptive prompt is test-authored, not user-supplied in production; the tool effect assertion reads server state, not agent prose. **N/A for this lane.**
- **Path traversal:** test-server uses a fixed tmp workspace base path; no path input from the lane. **N/A.**

---

## route-checklist

AH5 adds no production routes. It may add an **e2e-only** provisioning entrypoint if the probe needs one; if so, it must be mounted only on the test-server (not `createServer`'s production routes) OR be a direct in-process call. Checklist: **(none in production)**. If an e2e route is introduced, it must NOT be reachable from `createServer` without the test-server's explicit wiring — a guard test asserts the route is absent from the default app.

## protectedTests

```
protectedTests: [
  "packages/web/e2e/ah1-onboarding-credentials.spec.ts",   // AH1 lane must keep passing
  "packages/server/src/services/__tests__/credential-runtime-path.integration.test.ts", // AH1 runtime-key proof
  "packages/eval/src/smoke/__tests__/select-smoke-model.test.ts" // AH5: encodes the documented gates; guards against "loosen the uptime floor to make CI pass"
]
```
AH5 must not alter AH1's assertions; it adds a sibling lane. The selection test is added to `protectedTests` once written (red phase) so the gate policy it encodes cannot be silently disabled.

## sharedFiles

```
sharedFiles: [
  ".github/workflows/ci.yml",          // read-only here; AH5 adds a NEW workflow, must not edit ci.yml
  "packages/web/package.json",         // add test:e2e:ah5 script
  "package.json",                      // optional root convenience script
  "packages/eval/src/index.ts"         // re-export smoke selection
]
```
None of these conflict with concurrent AH workpackages' likely edits (AH3 touches assistant/overlay/server; AH4 touches teams/org). AH5's only server-side test files are new.

## migrations

No schema rename/move/delete. No call-site migration. (Uses existing `users.model_id/model_provider/harness_type` and `server_credentials` as-is.)
