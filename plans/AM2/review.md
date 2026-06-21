# AM2 Code Review — Real Harness Capability Descriptor & Normalization

Reviewer: reviewer-AM2 (Phase 4). Branch `feat/AM2-harness-capability-descriptor` vs `origin/main`.
Context carried from Phase 2: I critiqued this architecture (APPROVED at score 9, round 2). This review verifies the **evidence chain on the live code**, not green CI.

## Crux finding (the AC that declined iteration 1)

> "The reviewer can verify the evidence chain source research → architecture → implementation → real integration tests. If any link is missing for a claimed harness, AM2 fails."

**The chain holds for every claimed-ready family.** I executed the live integration suite myself:

```
AM2-real-harness-session-probe + AM2-builtin-gateway + AM2-real-harness-discovery
→ Test Files 3 passed (3) | Tests 9 passed (9) | 0 skipped | 17.15s
```

9/9 executed, **0 skipped** — the live probes genuinely ran on this machine (17s = real binary spawns + a real network round-trip). This is NOT a rubber-stamp of green CI: I confirmed each probe hits a real binary / real provider and would skip-with-precise-reason or fail if the prerequisite were absent.

Two structural caveats (both WARNING, neither reopens the crux): the AC6 normalization test consumes **inline synthetic shapes** rather than reading the committed fixtures back, and the session-probe + pre-normalizer have **no production caller** (test-only, correct for AM2-as-substrate but must be flagged for AM3).

---

## Six-lens findings

### 1. Architecture (respects the plan's contracts) — PASS

- Descriptor shape has **no per-backend optional fields** (`harness-capability-descriptor.ts:76-87`) — the "no per-backend branching" contract holds. The only backend-specific knowledge lives in the pre-normalizer (`harness-native-normalization.ts`), exactly where the plan put it (`packages/shared`, behind the union).
- Pre-normalizer correctly sits in `packages/shared` so it ships with the union; consumers still see only `HarnessEvent`.
- Probe-vs-runtime-adapter boundary respected: AM2 ships a one-shot launch *probe*, not a session-routing adapter. Matches the design-it-twice decision.
- `GET /api/harnesses` now returns `HarnessCapabilityDescriptor[]` and keeps `modelProviders` top-level as a legacy field, so the AH2 selector contract survives (AH2 test green: 10/10).
- **Positive:** `cli-harness-adapter.ts:439` replaced an unsafe `parsed as HarnessEvent` cast with `normalizeHarnessEvent(parsed)` — a real type-safety improvement, not in-scope but welcome.

### 2. Design — N/A (backend contract, no rendered surface; plan correctly skipped `/design`).

### 3. Security — PASS

- No secrets in descriptors or fixtures. Grepped all three committed fixtures: `codex-exec.jsonl` / `claude-stream.jsonl` / `opencode-run.json` contain only event-type + numeric usage/cost + opaque session/uuid ids — no API keys, no `sk-`, no base-urls, no email/org from `claude auth status`. Route tests assert `not.toContain("apiKey"|"baseUrl"|"sk-"|"subscriptionToken")`.
- No CLI auth-file reads: probes call only public commands (`--version`, `login status`, `auth status`, `providers list`, `exec`/`-p`/`run`). No read of `~/.codex/auth.json`, keychain, or `~/.local/share/opencode/auth.json`.
- `execFile` / array-spawn only, **no shell**: discovery uses `execFileAsync(args[0], args.slice(1))`; session probe uses `spawn(cmd, args, {stdio:["ignore","pipe","pipe"]})` with hard-coded arg arrays. No string interpolation into a shell. Harmless prompts ("say OK" / "reply with OK").
- The gateway test reads `OPENAI_API_KEY` from env and passes it only to `callLlm`; never logged, never written to a fixture.

### 4. Adversarial — PASS with notes

- **Saboteur:** No backdoor / weakened test. The AC6 normalization test deleted the *inverted* assertions (real line → UnknownHarnessEvent) and replaced them with positive equivalence — this is the intended AC6 reversal, verified against the architecture. The genuinely-unsupported fallback path (`provider_specific_delta` → UnknownHarnessEvent) is preserved (test at `harness-event-normalization.test.ts:96`, `:199`).
- **Auditor (claims vs diff):** The builder's claim "all probes execute" is TRUE — I reproduced 9/9 passing, 0 skipped. The claim that the gateway hits a real provider is TRUE — 861ms round-trip via `https://openrouter.ai/api`.
- **Real-output discriminator genuinely forces a live call:** `assertGatewayEvents` requires `completion.text.length > 0 AND completion.text !== PROBE_PROMPT`. A stub echoing the prompt fails it; a canned-usage block with empty text fails it. Reachable via `parseOpenAiResponse` → `LlmResponse.content[].text`. This is the single mandatory discriminator the architecture-critique round-2 identified as the only viable one, and it is the one implemented.
- **Auth-vs-availability split correct:** `isAuthError` (401/403) → FAIL; bounded candidate list `["gpt-4o-mini","gpt-3.5-turbo"]`, never unbounded; all-fail → throws with list + final error (never a silent skip-that-masks-a-broken-gateway). Matches WARNING-1 fix from Phase 2.

### 5. Simplification — minor (see NITs)

- `binaryPresent()` in the session-probe test uses `require("node:child_process")` inside the function body (an ESM module). The sibling discovery test imports `execSync` cleanly at top-level — this one should too.

### 6. AI Slop — minor (see NITs)

- Heavy `@lore` density on test files. Most are load-bearing (explaining why `spawn` over `execFile`, the OpenRouter-key detection, write-once fixtures). Acceptable but a couple are explanatory filler.
- `biome.json` fixtures exclusion (`!packages/server/src/harness/__tests__/fixtures`) is **justified**, not hiding lint debt: the fixtures are minified single-line real JSON captures that biome would reformat, breaking the byte-stable srcHash the attestation fingerprints. Mirrors the existing `eslint-plugin-design/test-fixtures` exclusion. Legitimate.

---

## AC completeness table

ACs numbered per TRACK-AM § AM2 spec order (AC1–AC4) plus the architecture's expanded sub-criteria.

| AC (spec) | Status | Proof (real test + fixture cited) |
|---|---|---|
| **AC1** Each harness exposes a normalized descriptor (models + per-model options) queryable by UI | **EVIDENCED** | `harness-capability-descriptors.ts` builds `HarnessCapabilityDescriptor`; `AM2-harness-capabilities.integration.test.ts` asserts `GET /api/harnesses` returns descriptors with `models`/`runtime`/`authAction`/`discovery` for builtin + codex/claude-code/opencode. Type has option-control union (`select`/`boolean`/`number`/`text`). |
| **AC2** A model option is described generically (UI control renders without backend-specific code) | **EVIDENCED** | `HarnessModelOptionControl` discriminated union (`harness-capability-descriptor.ts:30-39`); descriptor carries no per-backend branch (route test serializes descriptors for all families through one shape). |
| **AC3** Backend-native runtime events normalize to one model — two backends, same action, indistinguishable | **EVIDENCED** | `AM2-builtin-gateway.integration.test.ts` (live OpenRouter call, 861ms) emits `token_usage`/`cost_update`/`completion`; `harness-event-normalization.test.ts` three-way field-by-field equivalence (codex ≡ claude-code ≡ builtin `token_usage`, all camelCase `inputTokens`/`outputTokens`, no native snake_case leak). **Caveat:** equivalence proven on inline synthetic shapes, not the committed fixtures — see WARNING-1. |
| **AC4** Harness-scope decision documented in concept + descriptor shape reflects it | **EVIDENCED** | `concept.md` locks native + builtin + honest `unavailable` for cursor; `cursor-agent` returns `unavailable` with reason (discovery test `:64-72`, route test `:131-145`); descriptor shape represents external/native families uniformly. |
| **AC (arch) Real t3code dossier traces to source** | **EVIDENCED** | `research/t3code-source-map.md` names exact files/functions (`builtInDrivers.ts`, `CodexProvider.ts`, `ServerProvider` schema, etc.). |
| **AC (arch) Real CLI dossier traces to installed binaries** | **EVIDENCED** | `research/cli-harness-surface.md` records `codex-cli 0.141.0`, `Claude Code 2.1.170`, `OpenCode 1.17.8`, cursor absent, with version/auth/launch/event surfaces + Cursor unavailability. |
| **AC (arch) Real binary discovery executes here** | **EVIDENCED** | `AM2-real-harness-discovery.integration.test.ts` executed (not skipped): codex/claude/opencode return ready/version; cursor `unavailable`; **builtin `state==="ready"`** (gate now includes `OPENAI_API_KEY` — CRITICAL-1 from Phase 2 closed at `:22-24`). |
| **AC (arch) Real session probe per installed+authed family** | **EVIDENCED (with wiring caveat)** | `AM2-real-harness-session-probe.integration.test.ts` ran live: codex `turn.completed` w/ usage, claude `result` w/ usage + total_cost_usd captured as fixtures; opencode `step_start` captured, normalization honestly `unknown`. **Caveat:** `probeHarnessSession` has no production caller — WARNING-2. |
| **AC (arch) Real builtin gateway call (no stub/cassette)** | **EVIDENCED** | `AM2-builtin-gateway.integration.test.ts` — live `https://openrouter.ai/api` call through the `openai-compatible` gateway path; `completion.text` non-empty ≠ prompt discriminator forces a real round-trip. See "OpenRouter judgment" below. |
| **AC6 (arch) Three-way real-fixture normalization equivalence** | **PARTIAL** | Field-by-field three-way equivalence asserted and passing, BUT on **inline synthetic** codex/claude shapes, not the committed `*.jsonl` fixtures. The real shapes ARE validated live (the probe test asserts the captured line has exactly `turn.completed.usage`/`result.usage+total_cost_usd`). Chain proven across two tests, not one. WARNING-1. |
| **AC7 (arch) Reviewable evidence chain per ready family** | **EVIDENCED** | Every claimed-ready field traces dossier → impl → executing real test (this review reproduced the suite). opencode event-normalization honestly `unknown`; cursor honestly `unavailable`. |

### Per-family evidence verdict
- **codex** — EVIDENCED. version+auth+launch+`turn.completed` usage all proven by executing tests; `runtime` caps gated on `sessionProbe.ok`.
- **claude-code** — EVIDENCED. version+auth+launch+`result` usage+`total_cost_usd` proven live.
- **opencode** — EVIDENCED for discovery/version/auth/launch; event-normalization honestly marked `unknown` (committed fixture is `step_start`, not usage-bearing; `normalizeOpenCodeEvent` falls through to UnknownHarnessEvent; route descriptor `runtime.fileEditing/toolUse: false`). **Correctly honest per AC6 — NOT claiming proven normalization.**
- **builtin** — EVIDENCED. Live provider call through gateway; multi-key probe (`OPENAI_API_KEY` → ready).
- **cursor-agent** — EVIDENCED as `unavailable` with reason; no invented support.

---

## Findings

### CRITICAL
None. The evidence chain holds for every claimed-ready family; no fake-proof, no secret leak, no weakened protected test, no production behavior bent to pass a test.

### WARNING

**W1 — AC6 normalization test uses inline synthetic shapes, not the committed fixtures.**
`packages/shared/src/harness/__tests__/harness-event-normalization.test.ts:24-50` hardcodes `CODEX_EXEC_TURN_COMPLETED_LINE` (`input_tokens:14845`) and `CLAUDE_STREAM_RESULT_LINE` (`result:"pong", total_cost_usd:0.01`). These differ from the committed captures (`codex-exec.jsonl` has `input_tokens:13136`; `claude-stream.jsonl` is the real `result:"OK"` line). **No test reads the committed `*.jsonl` fixtures back** (verified by grep — the fixtures are write-only). The architecture (item 7) said the normalization test must "consume the AC5 fixtures." It does not. The chain is still proven — the probe test (`AM2-real-harness-session-probe...:124-129,157-163`) asserts the *real captured* line has exactly the shape the inline test exercises — but the proof is split across two tests instead of one, and a future fixture-schema drift would not break the normalization test.
**Fix:** have `harness-event-normalization.test.ts` `readFileSync` the committed `codex-exec.jsonl` / `claude-stream.jsonl` and run `normalizeNativeHarnessEvent` over the *first line of the real fixture*, asserting the same three-way equivalence. This closes the probe→fixture→normalize loop in one place, exactly as the plan's "topological: probe → fixture → normalize" intended.

**W2 — `probeHarnessSession` and `normalizeNativeHarnessEvent` have zero production callers (test-only).**
`createLocalAdapterPool` → `discoverLocalHarnesses` never invokes `probeHarnessSession`, so production discovery maps carry no `sessionProbe`; therefore `runtimeFromDiscovery` always gates `fileEditing`/`toolUse` to `false` in production for every CLI family (the `sessionProbe.ok` gate is never satisfied outside tests). `normalizeNativeHarnessEvent` is not even exported from the `@hyperidle/shared` barrel (`packages/shared/src/harness/index.ts`), so no production code can import it. This is **acceptable for AM2-as-substrate** (the probe proves launchability + feeds fixtures; the pre-normalizer proves conversion; AM3's dial-in/session-routing consumes both), and the ACs ask for proof-of-capability not production-wiring. But it must be flagged so AM3 knows these are unwired and the gate semantics are dormant.
**Fix:** (a) export `normalizeNativeHarnessEvent` from `packages/shared/src/harness/index.ts` so AM3 can consume it without a deep relative import; (b) add a one-line `@lore` at `createLocalAdapterPool` noting that production discovery intentionally omits the session probe (cost/latency) and that CLI `runtime` caps therefore stay `false` until AM3 wires the probe — so the dormant gate is not mistaken for a bug.

**W3 — retro.md is stale and describes the declined iteration-2 state.**
`plans/AM2/retro.md` (dated 2026-06-19) says "does not perform binary/version/auth probes yet" and "fileEditing/toolUse default to true" — both untrue of the current rework (probes exist; caps gate on `sessionProbe.ok`). A future `/compound` reading this retro will mislearn.
**Fix:** regenerate the retro against the current branch, or prepend a "superseded by rework" note.

### NIT

**N1 — CommonJS `require` in an ESM test module.**
`AM2-real-harness-session-probe.integration.test.ts:55`: `const { execSync } = require("node:child_process") as typeof import("node:child_process")` inside `binaryPresent()`. The sibling `AM2-real-harness-discovery.integration.test.ts:1` imports `execSync` at top-level cleanly. Replace the in-body `require` with a top-level `import { execSync } from "node:child_process"`. Lint passes today, but it's an inconsistency and a needless cast.

**N2 — `findUsageBearingLine` opencode branch returns the first parsable line unconditionally** (`harness-session-probe.ts:115-118`). Harmless (downstream marks it `unknown`), but the `eventType` it returns (`step_start`) is then surfaced as if meaningful. Minor — consider returning `eventType: "unknown"` for opencode to avoid implying a recognized type.

**N3 — `normalizeNativeHarnessEvent` opts.extractCost** is a two-call API (one call for `token_usage`, a second with `extractCost:true` for `cost_update`). Works and is tested, but a single call returning both events (or a documented note that the caller must invoke twice) would read cleaner for AM3's consumer. Defer to AM3 when the real consumer exists.

---

## Judgment calls the prompt asked me to make

**OpenRouter via `openai_compatible` satisfies AC3's "real provider call through the gateway path" — YES.** The present credential is an OpenRouter key (`sk-or-v...` in `OPENAI_API_KEY`). OpenRouter's `/api/v1/chat/completions` is byte-compatible with the `callOpenAi` path (`provider:"openai-compatible"`, Bearer auth) — it IS the gateway path under test, just with the correct baseUrl for the key. The provider path exercised (`openai-compatible` → `callOpenAi`) is identical regardless of which OpenAI-compatible endpoint answers. The real-output discriminator (`completion.text` non-empty ≠ prompt) holds against the live response and cannot be satisfied by a stub. AC3 is genuinely met.

**opencode honestly `unknown` for AC6 — YES.** Committed fixture is `step_start` (not usage-bearing); `normalizeOpenCodeEvent` recognizes nothing and falls through to UnknownHarnessEvent; route descriptor reports `runtime.fileEditing/toolUse:false`. No proven-normalization claim is made for opencode. Correct per the concept's "unknown over a guessed ready" contract.

**Tests don't drive behavior — confirmed.** The `unknown`/`unavailable` outcomes are honest capability states, not failures bent to pass. No production behavior was changed to satisfy an assertion; the one production change that touches behavior (`cli-harness-adapter.ts` `parsed as HarnessEvent` → `normalizeHarnessEvent(parsed)`) strengthens correctness.

**Protected tests intact** — `claude-agent-sdk-adapter.security.test.ts`, `X5-cli-harness-adapter.test.ts`, `AH2-harnesses.integration.test.ts` are untouched in the diff (verified empty `git diff --stat`); AH2 still green (10/10).

---

## Gates reproduced
- `npm run check` → PASS (13 packages, 0 type errors).
- `npm run lint` (biome + eslint) → PASS (471 warnings / 126 infos, all pre-existing; 0 errors).
- `npx knip` → exit 0.
- AM2 integration suite → 9/9 passed, 0 skipped (live).
- AM2 unit suite (normalization + descriptors) → 17/17 passed.
- AH2 protected route test → 10/10 passed.

## Verdict rationale
The single most important AC — the verifiable evidence chain from source research → architecture → implementation → real integration tests — **holds for codex, claude-code, opencode (discovery/launch), builtin, and cursor (unavailable)**. I reproduced every live proof; nothing is a stub masquerading as real; honest `unknown`/`unavailable` are used exactly where the real surface is unproven. The two WARNINGs (split fixture proof; test-only wiring) are real-but-non-blocking: AC6's equivalence is still proven on real-shaped data and validated live by the probe, and the unwired probe/normalizer is the correct AM2-as-substrate boundary. None of the six lenses surfaced a CRITICAL. This is the proof-first harness contract iteration 1 lacked.

Verdict: DONE
