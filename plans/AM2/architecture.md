# AM2 Architecture — Real Harness Capability Descriptor

Date: 2026-06-20

## Required reading

- `.pipeline/work-packages/TRACK-AM.md` § AM2 — revised workpackage with failed-review notice and real-harness proof ACs.
- `plans/AM2/concept.md` — failed-review concept, real harness capability, research dossiers.
- `plans/AM2/research/cli-harness-surface.md` — local CLI probes for Codex, Claude Code, OpenCode, Cursor.
- `plans/AM2/research/t3code-source-map.md` — t3code source paths for provider/harness discovery, auth, launch, status, events, UI.
- `docs/agent-layer/harness-capability-descriptor.md` — ground truth contract.
- `docs/architecture/kernel-strategy-split.md` §§ 1, 2a, 6.
- `docs/agent-layer/model-routing-and-cost.md` § 6.
- `docs/process-layer/canonical-shapes.md` Money and TokenUsage entries.
- `docs/agent-layer/harness-error-taxonomy.md`.
- Existing HyperIdle harness code:
  - `packages/shared/src/harness/harness-capability-descriptor.ts`
  - `packages/shared/src/harness/harness-adapter.ts`
  - `packages/shared/src/harness/harness-event-normalization.ts`
  - `packages/server/src/harness/adapter-pool.ts`
  - `packages/server/src/harness/harness-capability-descriptors.ts`
  - `packages/server/src/harness/builtin-harness-adapter.ts`
  - `packages/server/src/harness/claude-agent-sdk-adapter.ts`
  - `packages/server/src/harness/cli-harness-adapter.ts`
  - `packages/server/src/routes/harnesses.ts`

## What the second iteration still missed (why this rework exists)

The reworked implementation does real **version + auth-status** discovery and ships research dossiers with real binary versions. That is necessary but does NOT close the AM2 evidence chain. Three AC links are still open, and they are the same *class* of gap that got iteration 1 declined — a plausible shape that was never executed against the real harness:

1. **No real session probe.** AC5 requires "at least one harmless real session/probe per supported harness where credentials/auth allow it." Discovery stops at `auth status`. `codex`, `claude`, `opencode` are all installed AND authenticated on this machine (dossier confirms ChatGPT / max / OpenRouter), so a real `exec`/`-p`/`run` probe MUST actually execute here — not be written as a skipped test.
2. **Built-in gateway never calls a provider.** AC3 + validation scenario 3 require a *real provider call through the gateway path* emitting normalized events/cost/tokens, OR a present-and-skipped test with a precise missing-credential reason. `probeBuiltinGateway` only checks `ANTHROPIC_API_KEY` *presence*, finds none (env has `OPENAI_API_KEY`), and reports `unauthenticated` — a bare presence check that satisfies neither branch of AC3.
3. **Normalization fixtures prove the wrong thing.** AC6 + validation scenario 4 require that equivalent actions from two harnesses become the *same* downstream event. The current `harness-event-normalization.test.ts` asserts that real Codex `turn.completed` and Claude `result` lines normalize to `UnknownHarnessEvent` **error** — i.e. it proves the normalizer does NOT understand real harness output. That is the inverse of the AC: a real Codex turn-completed and a real Claude result both report token/cost usage and must both become a downstream `token_usage` + `completion` pair, indistinguishable to consumers.

This rework rewrites the AC+verification, task list, and risks to demand each, traceably.

## Plan reconciliation

| Spec assumption | Reality | Plan adjustment |
|---|---|---|
| Known CLI harnesses (`codex`, `claude-code`, `cursor-agent`, `opencode`) are known families. | `cursor`/`cursor-agent` is not installed and has no usable local CLI surface. | Descriptor builder treats `cursor-agent` as `unavailable` with an explicit reason, not as a missing/unauthenticated family to install.
| CLI harnesses can be registered from a static config table. | Existing `CLI_TOOL_CONFIGS` only covers `aider`, `goose`, `opencode`; `codex` and `claude` are not wired. | Add dynamic discovery; only register adapters when the binary is found and the registration can point at real launch args. For AM2 we surface descriptors via discovery rather than registering full runtime session-routing adapters, because session-routing event normalization for live user sessions is AM3+ scope. **What is NOT deferred (and IS AC-mandated): a harmless real session *probe* + a captured real-output *fixture* per installed+authed family.** The probe is a one-shot `exec`/`-p`/`run` that proves launchability + emits a captured event line; it is distinct from the full runtime adapter that routes ongoing user sessions.
| `missingKnownHarnessDescriptors` can fill in default capabilities. | Default `fileEditing`/`toolUse: true` for missing harnesses is a guessed claim. | For missing/unavailable harnesses set runtime capability booleans to `false`; only set `true` when the live family is proven by a real session probe (not by `auth status` alone) or when a real registered adapter declares it.
| `builtin` harness is ready when `ANTHROPIC_API_KEY` is present. | The gateway's `callLlm` supports `provider: "openai-compatible"` (`callOpenAi` → `Authorization: Bearer`, `${baseUrl}/v1/chat/completions`); `OPENAI_API_KEY` IS present. The gateway CAN make a real call with the available key. | **Take the maximal-real-proof path (AC3 option a).** The built-in real-gateway integration test constructs a `ResolvedModel` with `provider: "openai-compatible"`, `baseUrl: https://api.openai.com`, `apiKey: OPENAI_API_KEY`, a cheap model (`gpt-4o-mini`), drives one harmless turn through `BuiltinHarnessAdapter`, and asserts real normalized `token_usage` + `cost_update` + `completion` events. The descriptor's `builtin` readiness becomes credential-keyed across the *ordered provider set the gateway can actually use* (`anthropic_api_key` OR `openai_compatible_api_key` OR `openrouter_api_key`) — `ready` when any usable key is present. The default-Anthropic-only assumption in `probeBuiltinGateway` is a real bug to fix, not a constraint to honor.
| `ClaudeAgentSdkAdapter` is the `claude-code` harness. | It is an internal SDK runtime that requires an Anthropic API key; the public `claude` CLI is a separate installed surface. | Keep the SDK adapter registered for existing session-routing tests. Add descriptor-level real discovery from the `claude` CLI via `claude auth status` AND a real `claude -p` session probe. The runtime mismatch is an unresolved boundary: a future workpackage should either migrate `claude-code` to the CLI adapter or split the internal SDK path into its own harness type.
| t3code uses a single `ServerProvider` snapshot. | HyperIdle has an `AdapterPool` + `/api/harnesses` route. | Preserve existing registry shape; add a discovery map that feeds descriptor emission so `/api/harnesses` reports evidence-backed readiness.

## Acceptance criteria + verification

Each row ties to a TRACK-AM § AM2 acceptance criterion (AC#) and/or validation scenario (VS#). The AM2 ACs are numbered here in spec order: AC1 = t3code dossier, AC2 = CLI dossier, AC3 = real builtin gateway proof, AC4 = evidence-traceable descriptor fields, AC5 = real binary discovery + harmless real session probe per family, AC6 = real-fixture normalization to one downstream model, AC7 = reviewable evidence chain. VS1–VS5 are the five validation scenarios in spec order.

1. **(AC1) t3code research dossier traces to source.**
   - Verification: `plans/AM2/research/t3code-source-map.md` names exact t3code files/functions for discovery, auth/readiness, launch, status/version, event handling, UI-facing capability shape; the architecture cites those findings (VS1). Reviewer reads the dossier.

2. **(AC2) Real-CLI research dossier traces to installed binaries.**
   - Verification: `plans/AM2/research/cli-harness-surface.md` records binary names, version commands, login/readiness commands, non-interactive launch feasibility, event/output formats, model/option surfaces, limitations, and explicit Cursor unavailability. Reviewer reads the dossier.

3. **(AC4) Descriptor builder only emits evidence-backed claims.**
   - Unit test `AM2-harness-capability-descriptors.test.ts`: passes a probe-state map into `missingKnownHarnessDescriptors`; asserts a missing/cursor family has `discovery.state` `missing`/`unavailable`, empty models, `fileEditing`/`toolUse` false. Asserts `describeRegisteredHarness` copies supplied `discovery`/authAction/caps rather than inventing defaults. **Adds: a probe that proved `auth status` only (no session probe) yields `fileEditing`/`toolUse` `false`; flags turn `true` ONLY when the probe carries `sessionProbe: { ok: true }`.** (Closes the "ready ≠ proven-runnable" gap.)

4. **(AC5 — discovery half) Real binary discovery is implemented and executes here.**
   - Integration test `AM2-real-harness-discovery.integration.test.ts`: calls `discoverLocalHarnesses()`; asserts installed binaries (`codex`, `claude`, `opencode`) return `ready`/`unauthenticated`/`installed` with precise reasons and a version string; asserts `cursor-agent` returns `unavailable` with reason; asserts builtin probe is `ready`/`unauthenticated` keyed to the configured-provider credential set. `test.skipIf` only for genuinely-absent binaries, with the exact missing prerequisite as the skip label (VS2, VS5).
   - **Builtin gateway-key gate MUST include `OPENAI_API_KEY` (CRITICAL fix).** The existing test's `gatewayKeyConfigured = Boolean(process.env.ANTHROPIC_API_KEY ?? process.env.OPENROUTER_API_KEY)` (`:18`) excludes the only key present on this machine, so the builtin assertion (`:70`) skips today. The implementer MUST update that expression to the full gateway-usable credential set — `Boolean(process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY)` (plus any `openai_compatible_api_key` config credential the gateway reads). On this machine (`OPENAI_API_KEY` present) the builtin discovery assertion MUST EXECUTE — not skip — and assert `result.builtin.state === "ready"` with the matched credential name (`OPENAI_API_KEY`/`openai_compatible_api_key`) surfaced in the auth action. Fixing `probeBuiltinGateway` (task 3) without also fixing this test gate leaves a provable path unexecuted — the exact iteration-1 failure mode. **An all-skipped builtin discovery assertion on this machine is a review FAILURE**, mirroring the AC5 session-probe risk language.

5. **(AC5 — real-session-probe half) ⭐ A harmless real session per installed+authed family actually runs.**
   - New integration test `AM2-real-harness-session-probe.integration.test.ts`. For each installed+authed family it executes a real one-shot session via `execFile` (hard-coded arg array, no shell) and asserts a non-empty machine-readable event line is captured:
     - `codex exec "reply with the single word OK" --json` → assert at least one JSONL line with a known `type`. **The line committed as the AC6 fixture MUST be the usage-bearing event — `turn.completed` carrying a `usage` object** (`{input_tokens, output_tokens}`). The probe may observe earlier lines (`thread.started` / `item.completed`) to confirm launch, but the *committed* fixture line is the usage-bearing `turn.completed`.
     - `claude -p "say OK" --output-format stream-json --verbose --no-session-persistence` → assert an NDJSON event stream; **the committed AC6 fixture line MUST be the usage-bearing `result` event carrying `usage` and `total_cost_usd`** (not an intermediate `assistant`/`system` line).
     - `opencode run "say OK" --format json` → assert a JSON event is emitted; if a usage-bearing line can be parsed, capture it; otherwise record the raw line and mark opencode event-normalization `unknown`.
   - **Capture-selector rule (WARNING fix):** the AC5 launch proof (a non-empty event line exists) and the AC6 fixture (the usage-bearing line) are distinct gates. A probe MUST NOT commit a usage-free line (e.g. Codex `thread.started`) as the AC6 fixture — that would pass AC5 while silently leaving AC6's normalization unprovable. If an installed+authed family emits **no** usage-bearing event line in the one-shot probe, the probe records that fact and that family's event-normalization is marked `unknown` (same treatment as opencode) rather than committing a usage-free fixture; its launch proof (AC5) still stands on the non-empty line.
   - This is a **live-proof workpackage**: these probes MUST execute on this machine (binaries authed per dossier), not be written as universally-skipped. `test.skipIf(!installed || !authed)` only, with a precise reason (`codex binary not found` / `codex not logged in`). Each successful probe writes its usage-bearing captured line into a committed fixture file under `packages/server/src/harness/__tests__/fixtures/` (`codex-exec.jsonl`, `claude-stream.jsonl`, `opencode-run.json`) for the AC6 normalization test to consume. Probes are cheap, harmless, copy no provider secrets, and read no CLI auth files (VS2).

6. **(AC3) ⭐ Built-in / API-gateway proven against a real configured gateway path.**
   - New integration test `AM2-builtin-gateway.integration.test.ts`. **Real-call branch (taken when `OPENAI_API_KEY` is present, as it is here):** build `ResolvedModel { provider: "openai-compatible", baseUrl: "https://api.openai.com", apiKey: process.env.OPENAI_API_KEY, model: "gpt-4o-mini" }`; drive one harmless turn through `BuiltinHarnessAdapter` (single `config.messages` chat turn, `maxIterations: 1`); collect `streamEvents`; assert real normalized `token_usage` (input/output > 0), `cost_update`, and `completion` events, and a `SessionResult` with non-zero `cost`/`tokenUsage`.
   - **Real-output discriminator MUST be asserted (CRITICAL fix).** Presence-of-events plus `input/output > 0` and `cost > 0` can be satisfied by a local stub returning a canned usage block; nothing in those assertions pins the call to a live provider. The test MUST additionally assert at least one property that only a real OpenAI round-trip produces, picking whichever is reachable through `LlmResponse`:
     - `completion.text` is non-empty AND not equal to the prompt string (a stub echoing input fails this), OR
     - the response carries a real OpenAI `model` (matches the requested `gpt-4o-mini`, possibly with a date-suffixed variant) or `id` (`chatcmpl-…`) echoed through `LlmResponse`, OR
     - `cost` matches the published `gpt-4o-mini` rate within tolerance for the observed prompt/completion token counts (compute expected = tokens × published per-token rate; assert `|actual − expected| / expected < 0.05`).
   - **No stub server / no fixture / no recorded cassette for AC3 — the call hits `https://api.openai.com` live**, paralleling the AC5 "MUST execute here" language. Skip only with a precise missing-credential reason (next bullet); never substitute a local responder.
   - **Skip branch:** when NO usable gateway key (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY`) is present, the test is PRESENT and SKIPPED with the exact reason `no built-in gateway provider credential present (checked OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY)`. A bare credential-presence check that never calls the provider does NOT satisfy AC3 (VS3).

7. **(AC6) ⭐ Real-fixture normalization to ONE downstream model — THREE-way equivalence, not ignorance.**
   - Rewrite `harness-event-normalization.test.ts` (or add `AM2-harness-event-normalization.test.ts`) to consume the AC5 fixtures (`codex-exec.jsonl`, `claude-stream.jsonl`) AND the real builtin `token_usage` event captured from the AC3 call in #6. Assert **three-way structural equivalence** of the downstream `token_usage` events — **the same downstream shape, indistinguishable to consumers** (VS4):
     - `normalizeNativeHarnessEvent("codex", codexFixtureLine)` → `token_usage`,
     - `normalizeNativeHarnessEvent("claude-code", claudeFixtureLine)` → `token_usage` (+ a `cost_update` for Claude's `total_cost_usd`),
     - the real builtin `token_usage` emitted by the AC3 `BuiltinHarnessAdapter` call (#6).
   - The three `token_usage` events MUST be structurally identical on the compared fields: `type === "token_usage"`, and the same prompt/completion token-count keys carrying the matching field shape (e.g. `inputTokens`/`outputTokens` — the exact union field names per `HarnessEvent`), so a downstream consumer cannot tell which harness produced which. Assert field-by-field, not `toEqual` on whatever shape happens to emerge. **The builtin leg is explicitly included** because it reaches the union via a *different* code path (`BuiltinHarnessAdapter.trackUsage`, no pre-normalizer) than the Codex/Claude fixtures (`normalizeNativeHarnessEvent`); proving Codex↔Claude alone leaves the builtin↔native equivalence — the leg the AM3 dial-in renders most — unasserted.
   - This requires a per-family pre-normalizer (see "Normalization direction" below) that maps native `turn.completed`/`result` shapes into the HyperIdle union BEFORE `normalizeHarnessEvent`. Genuinely-unsupported native types (e.g. a provider-specific delta) still become `error`/`UnknownHarnessEvent` — that path stays. Where a family's real fixture could not be captured (e.g. opencode schema unparsed), that family's event-normalization commitment is marked `unknown`/absent in its descriptor, never a guessed claim.

8. **(AC4) `/api/harnesses` reflects real discovery and leaks no secrets.**
   - Integration test `AM2-harness-capabilities.integration.test.ts`: pool fed by a discovery map; asserts each first-class family appears, every `ready` claim is backed by an installed/authenticated binary or credential, no API keys/base URLs/subscription tokens in JSON, cursor is `unavailable` (VS5).

9. **No per-backend branching in descriptor shape.**
   - Type-level: `HarnessCapabilityDescriptor` has no optional backend-specific fields; ESLint keeps the no-per-backend-branch rule; reviewer manual check on `harness-capability-descriptors.ts`.

10. **(AC7) Reviewable evidence chain.**
   - The "Evidence chain" table below maps each descriptor field per family → dossier line → source/impl file → real test. Any field without a backing row is `unknown`/`unavailable`/absent. Reviewer verifies source-research → architecture → implementation → real integration test for every claimed-`ready` family (VS5).

11. **Gates pass.** `npm run check` + `npm run lint` + `npm run test` + `npm run test:integration` green. The real session probe + real gateway tests run in `test:integration` (local lane only — never a GitHub Actions job, per the e2e/live-proof local-lane rule).

## Evidence chain (AC4 + AC7)

Each descriptor field is `ready`/`true` only with a row here. Fixture files live under `packages/server/src/harness/__tests__/fixtures/`.

| Family | Field | Evidence (dossier line) | Source / impl | Real test |
|---|---|---|---|---|
| codex | binary + version | cli-harness-surface §Codex "codex-cli 0.141.0" | `harness-discovery.ts probeCodexCli` | discovery test: version matches `codex-cli` |
| codex | auth/readiness | §Codex "Logged in using ChatGPT" (stderr) | `probeCodexCli` auth branch | discovery test: state ∈ ready/unauth |
| codex | launchable (session) | §Codex `codex exec --json` fixture line | session-probe test | session-probe test: real `codex exec` emits JSONL; AC6 fixture line MUST be the usage-bearing `turn.completed` (not `thread.started`) |
| codex | event normalization | captured `codex-exec.jsonl` `turn.completed.usage` | per-family pre-normalizer | normalization test: → downstream `token_usage` |
| codex | fileEditing/toolUse | §Codex sandbox/approval flags + session probe ok | `runtimeFromDiscovery` gated on `sessionProbe.ok` | descriptor unit test |
| claude-code | binary + version | §Claude "2.1.170 (Claude Code)" | `probeClaudeCodeCli` | discovery test |
| claude-code | auth/readiness | §Claude `auth status` JSON `loggedIn:true`, `max` | `probeClaudeCodeCli` JSON parse | discovery test |
| claude-code | launchable (session) | §Claude `-p --output-format stream-json` fixture | session-probe test | session-probe test: real `claude -p` emits NDJSON; AC6 fixture line MUST be the usage-bearing `result` (carrying `usage` + `total_cost_usd`) |
| claude-code | event normalization | captured `claude-stream.jsonl` `result.total_cost_usd`+`usage` | per-family pre-normalizer | normalization test: → `token_usage` + `cost_update` |
| opencode | binary + version | §OpenCode "1.17.8" | `probeOpenCodeCli` | discovery test |
| opencode | auth/readiness | §OpenCode OpenRouter cred + `OPENAI_API_KEY` | `probeOpenCodeCli` providers-list parse | discovery test |
| opencode | launchable (session) | §OpenCode `run --format json` | session-probe test | session-probe EXECUTES here (installed + OpenRouter cred per dossier); only its event-schema *normalization* may end `unknown`, not its launch proof. Skip only if genuinely absent/unauthed, with precise reason. |
| opencode | event normalization | **unknown** unless `opencode-run.json` captured | — | marked `unknown`/absent in descriptor |
| builtin | gateway readiness | §built-in credential names; gateway-usable key set | `probeBuiltinGateway` (multi-key) | discovery test: `gatewayKeyConfigured` includes `OPENAI_API_KEY`/`openai_compatible_api_key`; builtin assertion EXECUTES here (not skipped) and asserts `state === "ready"` + matched credential name. All-skipped builtin here = review failure. |
| builtin | real provider call | §built-in `OPENAI_API_KEY` present + `callOpenAi` path | `BuiltinHarnessAdapter` + `callLlm` | builtin-gateway test: live `https://api.openai.com` call (no stub/fixture/cassette) asserting a real-output discriminator — non-empty `completion.text` ≠ prompt, OR echoed OpenAI `model`/`id`, OR `cost` within 5% of published `gpt-4o-mini` rate |
| builtin | event/cost/token normalization | builtin emits union events natively | `BuiltinHarnessAdapter.trackUsage`/`emitEvent` | builtin-gateway test asserts `token_usage`/`cost_update`/`completion` |
| cursor-agent | all | §Cursor "not installed, no headless CLI surface" | `probeCursorAgentCli` unavailable branch | discovery test: `unavailable` + reason |

## Normalization direction (AC6 decision)

The current normalizer treats every native event whose `type` is not already a HyperIdle union member as an `error`. That is correct as a *fallback* but wrong as the *whole story*: real Codex `turn.completed` and Claude `result` lines carry usage/cost that the AC requires to surface as the SAME downstream `token_usage`/`cost_update`. Decision: introduce a thin per-family pre-normalizer (`normalizeNativeHarnessEvent(family, nativeLine)`) that maps the captured real shapes:
- Codex `turn.completed.usage.{input_tokens,output_tokens}` → `token_usage`.
- Claude `result.usage.{input_tokens,output_tokens}` → `token_usage`; `result.total_cost_usd` → `cost_update`.
- OpenAI-compatible chunk usage (builtin) already flows through `trackUsage` → union events; no pre-normalizer needed.
Everything still unrecognized falls through to `normalizeHarnessEvent` → `UnknownHarnessEvent` error. This keeps "two harnesses, same action, indistinguishable downstream" true for the proven actions and keeps graceful degradation for the rest. The pre-normalizer lives in `packages/shared/src/harness/` so it ships with the union, and it stays declarative (no per-backend branching leaks into descriptor shape or UI — consumers still see only the union).

## Ordered task list

Ordered so that real probes capture fixtures BEFORE the normalization test that consumes them (topological: probe → fixture → normalize). Red-phase tests for items 6–9 are written first (TDD), then implementation.

1. **CLI surface research dossier** — done in `plans/AM2/research/cli-harness-surface.md` (AC2).
2. **t3code source map** — done in `plans/AM2/research/t3code-source-map.md` (AC1).
3. **Fix `probeBuiltinGateway` to be multi-key** (`harness-discovery.ts`): check the ordered gateway-usable credential set (`ANTHROPIC_API_KEY` → `OPENAI_API_KEY`/`openai_compatible_api_key` → `OPENROUTER_API_KEY`); `ready` when ANY usable key is present, with the matched credential name in the auth action; `unauthenticated` with the full checked-list reason otherwise (AC3, AC4).
4. **Add the real session-probe layer** (`packages/server/src/harness/harness-session-probe.ts`):
   - `probeCodexSession()`, `probeClaudeSession()`, `probeOpenCodeSession()` — each `execFile` (hard-coded arg array, no shell, short timeout) the one-shot command from AC5, capture the first machine-readable event line, return `{ ok, family, capturedLine, eventType }`.
   - Never reads CLI auth files; never copies provider secrets; harmless prompts only.
   - Feed `sessionProbe` into the discovery input so `runtimeFromDiscovery` can gate `fileEditing`/`toolUse` on a proven launch (AC5).
5. **Per-family event pre-normalizer** (`packages/shared/src/harness/harness-native-normalization.ts`): `normalizeNativeHarnessEvent(family, nativeLine)` mapping captured Codex/Claude shapes into the union, falling through to `normalizeHarnessEvent` for the rest (AC6). No descriptor/UI branching.
6. **Update descriptor builder** (`harness-capability-descriptors.ts`): `discoveries` arg already wired; ensure missing/unavailable families stay conservative; runtime `true` flags gated on `sessionProbe.ok`; opencode event-normalization marked `unknown` until its fixture is captured (AC4).
7. **Wire discovery into `AdapterPool`** — already wired (`createLocalAdapterPool` calls `discoverLocalHarnesses`; constructor takes the map). Confirm session-probe results flow into the discovery map (AC4, AC5).
8. **`GET /api/harnesses` unchanged** — already calls `pool.listCapabilityDescriptors()`.
9. **Tests (red first):**
   - `AM2-harness-capability-descriptors.test.ts` — add the "auth-status-only ⇒ caps false; sessionProbe.ok ⇒ caps true" case (AC4).
   - `AM2-real-harness-discovery.integration.test.ts` — keep; add builtin multi-key assertions (AC5 discovery half).
   - **`AM2-real-harness-session-probe.integration.test.ts`** — NEW; real `codex exec`/`claude -p`/`opencode run`; MUST execute here; `skipIf` only on absent/unauthed binary with precise reason; writes captured lines to `__tests__/fixtures/` (AC5 session half).
   - **`AM2-builtin-gateway.integration.test.ts`** — NEW; real `openai-compatible` call via `BuiltinHarnessAdapter` asserting `token_usage`/`cost_update`/`completion`; present-and-skipped with precise reason when no usable key (AC3).
   - `harness-event-normalization` test — REWRITE to assert real Codex+Claude fixtures normalize to the SAME downstream `token_usage`(+`cost_update`) shape, not to `UnknownHarnessEvent` (AC6). Delete the inverted "treats real line as unknown" assertions.
   - `AM2-harness-capabilities.integration.test.ts` — keep; ensure `ready` claims trace to a probe (AC4).
10. **Capture fixtures** — run the session-probe + gateway tests once locally; commit `fixtures/codex-exec.jsonl`, `fixtures/claude-stream.jsonl`, `fixtures/opencode-run.json` (if parsable), redacted/truncated, no secrets.
11. **Docs/progress** — `docs/agent-layer/harness-capability-descriptor.md` as-built note (dossiers, cursor unavailability, real-probe evidence); `.pipeline/progress/AM2.json` reflects rework.
12. **Gates** — `check`, `lint`, `test`, `test:integration` (the last runs the live probes on the local lane).

## Type signatures / schemas

### New: `HarnessDiscoveryInput` (probe result consumed by descriptor builder)

```ts
export interface HarnessDiscoveryInput {
  readonly state: HarnessReadinessState;
  readonly version?: string;
  readonly reason?: string;
  readonly authAction?: HarnessAuthActionDescriptor;
  readonly models?: readonly HarnessModelDescriptor[];
  readonly runtime?: Partial<HarnessRuntimeCapabilities>;
  /**
   * AC5: result of the harmless real one-shot session probe. `runtimeFromDiscovery`
   * only sets fileEditing/toolUse `true` when `sessionProbe?.ok === true` — `auth status`
   * alone proves login, NOT launchability. Absent ⇒ no session probe ran ⇒ caps stay false.
   */
  readonly sessionProbe?: HarnessSessionProbeResult;
}
```

### New: `HarnessSessionProbeResult` (real one-shot session probe)

```ts
export interface HarnessSessionProbeResult {
  readonly ok: boolean;
  readonly family: "codex" | "claude-code" | "opencode";
  /** First captured machine-readable event line; committed as a fixture for AC6. */
  readonly capturedLine?: string;
  /** Parsed native event type, e.g. "turn.completed" | "result". */
  readonly eventType?: string;
  /** Precise reason when ok === false (binary absent / not authed / launch failed). */
  readonly reason?: string;
}

export async function probeHarnessSession(
  family: "codex" | "claude-code" | "opencode",
  deps?: { run?: (args: readonly string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }> },
): Promise<HarnessSessionProbeResult>;
```

### New: per-family native pre-normalizer (AC6)

```ts
// packages/shared/src/harness/harness-native-normalization.ts
// Note: `builtin` is intentionally NOT in this union. Builtin events are already
// union-shaped (emitted by BuiltinHarnessAdapter.trackUsage → token_usage/cost_update)
// and never pass through this pre-normalizer — that different code path is exactly
// why AC6 item 7 asserts three-way equivalence (builtin vs the two normalized fixtures).
export function normalizeNativeHarnessEvent(
  family: "codex" | "claude-code" | "opencode",
  nativeLine: unknown,
): HarnessEvent; // Codex turn.completed / Claude result usage → token_usage(+cost_update);
                 // unrecognized → falls through to normalizeHarnessEvent → UnknownHarnessEvent.
```

### Existing shared types remain unchanged

- `HarnessCapabilityDescriptor` (shared)
- `HarnessReadinessState`: `"missing" | "installed" | "unauthenticated" | "ready" | "unavailable"`
- `HarnessAuthActionKind`: `"enter_api_key" | "native_cli_login" | "none"`
- `HarnessModelDescriptor`, `HarnessModelOptionDescriptor`

### Discovery function signature

```ts
export interface HarnessDiscoveryResult {
  readonly codex: HarnessDiscoveryInput;
  readonly "claude-code": HarnessDiscoveryInput;
  readonly opencode: HarnessDiscoveryInput;
  readonly "cursor-agent": HarnessDiscoveryInput;
  readonly builtin: HarnessDiscoveryInput;
}

export async function discoverLocalHarnesses(
  deps?: {
    run?: (args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
    env?: NodeJS.ProcessEnv;
  },
): Promise<HarnessDiscoveryResult>;
```

## Security & abuse cases

| Concern | Treatment |
|---|---|
| Secret leakage in descriptors | Descriptors never contain API keys, base URLs, subscription tokens, or auth files. Auth actions reference credential names only. |
| CLI command injection | Discovery runs commands with hard-coded argument arrays (no shell), no user input. Spawning uses `execFile` / array spawn. |
| Reading provider CLI auth files | AM2 only observes stdout of public commands; it never reads `~/.codex/auth.json`, system keychain, or `~/.local/share/opencode/auth.json`. |
| Timing / resource abuse | Discovery commands have short timeouts and are run on-demand at route time, not in tight loops. |
| Built-in gateway credential proof | Real test runs when a gateway-usable key is present (`OPENAI_API_KEY` here) and uses a cheap model (`gpt-4o-mini`), one harmless turn; the key is read from env, passed only to `callLlm`, never logged or written to a fixture. |
| Real session probe safety (AC5) | Probes run via `execFile` with hard-coded arg arrays (no shell, no user input), short timeout, harmless prompts ("say OK"). They never read `~/.codex/auth.json`, keychain, or `~/.local/share/opencode/auth.json`; they capture only the public stdout event line. Captured fixtures are redacted/truncated and carry no token. |
| Fixture hygiene | Committed fixtures (`codex-exec.jsonl`, `claude-stream.jsonl`, `opencode-run.json`) contain only event-type + numeric usage/cost; no prompt text beyond "OK", no API key, no auth token, no email/org from `claude auth status`. |

## Migrations

- No database schema migration.
- No route changes.
- Test updates in existing AM2 test files; existing tests in other suites that assert `claude-code` presence must not change their runtime assertions (the pool will still register `claude-code` via the SDK adapter, so existing expectations remain satisfied).
- `Cursor`/`cursor-agent` descriptor changes from `missing` to `unavailable` with explicit reason. AM4 onboarding should treat `unavailable` differently from `missing` (no install prompt for Cursor).

## Shared files

- `packages/shared/src/harness/harness-capability-descriptor.ts` — no breaking changes, only consumption.
- `packages/server/src/harness/adapter-pool.ts`
- `packages/server/src/harness/harness-capability-descriptors.ts`
- `packages/server/src/routes/__tests__/AM2-harness-capabilities.integration.test.ts`
- Possible touch: `packages/server/src/harness/cli-harness-adapter.ts` if we refactor for reuse.

## Protected tests

Do not change the assertion intent of:
- `packages/server/src/harness/__tests__/claude-agent-sdk-adapter.security.test.ts`
- `packages/server/src/harness/__tests__/X5-cli-harness-adapter.test.ts`
- `packages/server/src/routes/__tests__/AH2-harnesses.integration.test.ts`

**Cross-suite normalizer-change check (WARNING fix).** Changing the AC6 normalizer behavior (real Codex/Claude lines now → `token_usage` instead of `UnknownHarnessEvent`) is shared-package surface (`packages/shared`). Before implementing, the builder MUST `grep -rn "UnknownHarnessEvent" packages/**/*.test.ts` (and `*.test.tsx`) and confirm no suite OTHER than `harness-event-normalization.test.ts` asserts that a **real native** Codex/Claude line normalizes to unknown. Any suite that does MUST be listed here with its required update before the normalizer changes — an un-enumerated cross-suite assertion is a silent break. A test that asserts a *genuinely-unsupported* native type (a provider-specific delta) still maps to unknown is unaffected and stays; only assertions on the now-recognized usage-bearing lines change.

## Risks / ambiguities

- **Risk (AC5, primary):** A reviewer must see the real session probes EXECUTE, not skip. On this machine all three are installed+authed (dossier), so `test:integration` MUST show them running and capturing fixtures. **Mitigation:** the builder runs `test:integration` locally and the captured fixtures are committed; an all-skipped probe run on a machine that *does* have the binaries is a review failure, not a pass. The skip path exists ONLY for genuinely-absent/unauthed binaries (CI / other machines) and must name the exact missing prerequisite.
- **Risk (AC3):** The maximal-real-proof gateway path depends on `OPENAI_API_KEY` being usable against `https://api.openai.com` with `gpt-4o-mini`. If the key is org-scoped without that model, the test errors rather than skips. **Mitigation (bounded, fail-on-auth):** model fallback is bounded to a closed, named list — `["gpt-4o-mini", "gpt-3.5-turbo"]` — and the test tries them in order. Distinguish error classes explicitly: on a **401/403 (auth) error → FAIL**, not skip — a configured-but-invalid key means the `openai-compatible` path is broken, which is a real bug AC3 must catch; on **404 / model-not-available across the *whole* named list → skip**, with the full model list AND the final provider error in the skip reason (so a skip can never silently mean "the gateway is broken"). An unbounded "fall back to whatever the key can call" is forbidden — it can degrade into a legitimate-looking skip that masks a fully-broken gateway. A bare presence check is forbidden.
- **Risk (AC6):** Codex/Claude native JSONL schema drift between versions could break the pre-normalizer. **Mitigation:** the pre-normalizer reads only `usage.{input_tokens,output_tokens}` and `total_cost_usd` (stable fields); anything unrecognized falls through to `UnknownHarnessEvent`, so drift degrades gracefully. Fixtures are versioned with the dossier's recorded binary version.
- **Risk:** OpenCode `run --format json` schema was not captured live in the dossier. **Mitigation:** the session probe attempts it; if the line is parsable it becomes a fixture and opencode normalization is proven, otherwise opencode's event-normalization commitment is marked `unknown`/absent — never guessed. opencode's discovery/version/auth/launch claims remain proven independently.
- **Risk:** The existing `ClaudeAgentSdkAdapter` runtime and the local `claude` CLI do not share auth. A user whose `claude` CLI is logged in but has no Anthropic API key sees a ready descriptor but an SDK session would fail with `MissingCredentialError`. Flagged as an unresolved runtime boundary; the AM2 descriptor is evidence-based, but full SDK-vs-CLI alignment is out of scope (AM3+).
- **Risk:** `test:integration` is a local lane only — these live probes never run as a GitHub Actions job (per the e2e/live-proof local-lane rule). The builder's DONE requires a local `test:integration` run with the probes executing; "runs in CI" means the local lane.

## Route checklist

N/A — no new routes, no middleware changes. `GET /api/harnesses` already exists and will continue to return descriptors.

## Design-it-twice notes

The decision of whether to register real CLI runtime adapters now vs only emit descriptors was the main alternative. The key distinction the critique must not conflate: a **real session PROBE** (one-shot, captures one event line, proves launchability + feeds AC6 fixtures) is IN scope and AC5-mandated; a **runtime session-routing ADAPTER** (routes ongoing user sessions, streams events, handles approvals/credentials) is AM3+ scope.

- Option A: Build full `CodexCliAdapter`, `ClaudeCodeCliAdapter`, `OpenCodeCliAdapter` that route real user sessions now. Rejected: per-CLI streaming/approval/credential handling exceeds AM2's evidence-first scope and ripples into sessions, tests, and the SDK adapter — and is not required to close any AM2 AC.
- Option B: Emit descriptors from a real discovery layer + run a harmless one-shot real session PROBE per installed+authed family that proves launch and captures the real event fixture, while leaving runtime session-routing adapters for AM3. **Selected.** This is what closes AC5 (real session) and AC6 (real fixtures) without building the full adapters. The earlier reading of Option B as "discovery only, no session" is exactly the gap that left AC5/AC6 open — the probe is the minimal real-session proof, not deferred work.

## Migrations (additions)

- New files: `harness-session-probe.ts` (server), `harness-native-normalization.ts` (shared), `__tests__/fixtures/{codex-exec.jsonl,claude-stream.jsonl,opencode-run.json}` (server). New tests: `AM2-real-harness-session-probe.integration.test.ts`, `AM2-builtin-gateway.integration.test.ts`.
- `HarnessDiscoveryInput` gains `sessionProbe`; `discoverLocalHarnesses` optionally runs session probes for installed+authed families and merges the result. No DB/schema/route changes.
- `harness-event-normalization.test.ts` assertion intent CHANGES (inverted "real line → unknown" cases deleted, replaced with "real line → same downstream token_usage"). This is intentional per AC6 and is NOT a protected test. **Before the change**, the builder MUST `grep -rn "UnknownHarnessEvent" packages/**/*.test.ts` to confirm no *other* suite asserts a real native Codex/Claude line → unknown; any that does is enumerated in Protected tests with its required update (see Protected-tests cross-suite check). The normalizer ships in `packages/shared`, so this guards against a silent cross-package break.
