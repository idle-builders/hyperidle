# AH2 Architecture Critique — Per-agent model and a harness that actually selects

**Reviewer persona (Phase 2 evaluation). Producer = designer; independent scoring against the 9-dimension architectural rubric.**
**Artifact:** `plans/AH2/architecture.md` (cross-checked vs `concept.md`, `design/approved.md`, spec lines 64–101, and the live codebase).

## Verdict: 7 / 10 — APPROVED for build with revisions. No CRITICAL. Two WARNINGs (one is a correctness gap that must be closed before build, one is a coverage gap). Several INFO.

The plan is strong on the load-bearing items: it gets the resolver order right (per-agent model before tier fallback via `resolveAgentModel`), it makes server-side harness validation real (422 at API boundary + provision-time `NoEligibleHarnessError` backstop), it kills the "null = any adapter" fallback, the migration backfills both `harnessType` and `model_id`/`model_provider` for every AI agent (no agent left unrunnable), the catalog IDs are current and verified, and it keeps the X5 adapter interface untouched (call-site + guard only). The AC→verification table is concrete and correctly typed (runtime→integration, static→unit/grep, visual→Playwright AH5 lane). Codebase claims verified: `createAgentRoutes(db, adapterPool?)` already takes the pool; agents routes already use `requireBoundary({ kind: "public-data" })`; `migrate-pg.ts` reads the same `../drizzle` folder via `readMigrationFiles` so the backfill SQL applies to both drivers; migration 0031 is latest so 0032 is correct; `users.harnessType` comment literally reads "null = any adapter eligible" — the exact bug targeted.

## 9-dimension scoring

| Dimension | Score | Note |
|---|---|---|
| Spec alignment | 8 | All 5 ACs + 4 validation scenarios mapped to typed verification. Resolver-order contract and server-side-validation contract both honored. |
| Decomposition | 8 | 12 ordered tasks with a dependency graph; each task names files + test. Clean separation shared→db→server→web→docs. |
| Interface clarity | 8 | `resolveAgentModel`, `MODEL_CATALOG`, `NoEligibleHarnessError`, `GET /api/harnesses` shapes all specified. The `resolveProvider` refactor is the right move (shared provider-switch). |
| Data model | 8 | Two flat columns (`model_id`/`model_provider`) chosen over JSON blob with sound rationale (mirrors `ResolvedModel`, queryable, closed-union-validatable). Design-it-twice present and honest. |
| Migration safety | 7 | Backfill covers both columns + harness for all AI agents; dual-driver path verified. **WARNING-2:** backfill scope predicate (`kind='ai'` + `status != 'retired'`) needs to match the actual seed scope, and the tier-aware backfill reads `modelTierPreference` which may itself be null — handled (falls to sonnet) but assert it in the migration test. |
| Error handling | 7 | `NoEligibleHarnessError` surfaced as 4xx is correct. **WARNING-1 lives here:** cross-axis provider/harness compatibility (concept hard rule) is dropped at provision time. |
| Security | 8 | Correct boundary for `/api/harnesses` (`public-data`, not `X-API-Key`); no secret leak (reads `AdapterMeta` only — verified `AdapterInfo` carries only `type`/`name`/`modelProviders`, no apiKey/baseUrl); zod enum on `modelProvider`; catalog validation on `modelId`. STRIDE-clean for this surface. |
| Testability | 8 | Each AC has an import-based test; static props (catalog ids, X5 interface) enforced by unit/grep not by reading source as a test. Protected-test edit (X4 stale-id assertions) is correctly scoped and flagged. |
| Doc/lore | 7 | Task 11 amends `model-routing-and-cost.md` §6 — confirmed this resolves the concept's CRITICAL contradiction (see below). **WARNING-3 coverage:** catalog-freshness doc/grep scope is incomplete. |

## Findings

### WARNING-1 — Cross-axis harness↔provider compatibility is specified in the concept but dropped in provisioning (correctness gap)
- **Location:** `architecture.md` "Provisioning — session-provisioning.ts" snippet (lines ~151–163); concept Phase 4 Harness hard rule "Cross-axis compatibility: the chosen harness must support the chosen model's provider".
- **What's wrong:** The concept makes it a **hard rule** that the selected harness must advertise the model's provider in `AdapterMeta.modelProviders` (or be provider-agnostic with empty `modelProviders`). The architecture's provisioning snippet calls `adapterPool.select({ harnessType })` and passes **only** `harnessType` — it never passes `modelProviders`. Verified against `adapter-pool.ts`: `select()` filters by `modelProviders` *only when the caller supplies them* (line 153). So a `claude-code` harness (anthropic-only, verified: `modelProviders: ["anthropic"]`) paired with an `openrouter` agent model would be selected anyway, then fail at the actual LLM call — a silent-ish mismatch, the exact failure class AH2 exists to eliminate. The API-boundary validation snippet (lines 140–148) also validates harness-exists and model-in-catalog **independently** but never checks the pair is compatible.
- **Why it matters now:** AH2's picker is Anthropic-only, so in the happy path provider is always `anthropic` and the gap is masked. But the schema/API accept `modelProvider: openrouter|openai-compatible` (zod enum allows all three), and the default harness is `builtin` which supports all three — yet `claude-code` does not. The moment any agent is set to a non-anthropic provider with an anthropic-only harness (reachable today via API even if not via the AH2 picker), this is a dead session with no clear error. The concept hard rule is currently unimplemented.
- **Fix direction:** Either (a) implement the cross-axis check: at the API boundary reject a `(harnessType, modelProvider)` pair where the adapter's `modelProviders` is non-empty and excludes `modelProvider` (422, new code e.g. `INCOMPATIBLE_HARNESS_MODEL`), AND pass `modelProviders: [agent.modelProvider]` into `select()` at provision time so selection itself enforces it; or (b) if AH2 genuinely scopes this out, the architecture must say so explicitly and the concept's hard rule must be downgraded with rationale (not silently unimplemented). (a) is preferred — it's a few lines and closes a real dead-session path. Note `select()` already supports `modelProviders` so no X5 interface change is needed.

### WARNING-2 — Catalog-freshness coverage is incomplete; stale IDs survive in cost + context-window maps
- **Location:** `architecture.md` Task 1 + AC4 grep guard ("no stale id strings in `services/` or `web/settings/`").
- **What's wrong:** Grep of the live tree shows stale model IDs in **four** locations the plan does not enumerate:
  - `packages/server/src/harness/builtin-harness-adapter.ts:84–86` — per-model cost table (`claude-opus-4-20250514` etc.).
  - `packages/server/src/harness/context-window.ts:15–17` — per-model context windows.
  - `packages/web/src/settings/SettingsModels.stories.tsx:19–25` — story fixtures.
  - (plus the two the plan does cover: `model-gateway.ts` `BUILT_IN_GATEWAY_CONFIG` and `SettingsModels.tsx` `KNOWN_ANTHROPIC_MODELS`.)
  These are keyed-by-model-id maps. If the catalog ships `claude-opus-4-8`/`claude-sonnet-4-6`/`claude-haiku-4-5`/`claude-fable-5` but the cost and context-window maps only key the `*-20250514` strings, every new model resolves to **no cost data and a default/wrong context window** — a silent correctness regression in cost tracking and context budgeting. AC4's grep guard scoped to `services/` + `web/settings/` would pass while these stay stale.
- **Fix direction:** Add `harness/builtin-harness-adapter.ts` and `harness/context-window.ts` to Task 1's scope: re-key both maps to the current catalog IDs (and decide what to do with `claude-fable-5`'s cost/context entries — it has none today). Update `SettingsModels.stories.tsx` fixtures. Broaden the AC4 grep guard to `packages/server/src` + `packages/web/src` (excluding migrations/tests-asserting-legacy), so the static check actually catches all stale ids, not just two files.

### WARNING-3 — `resolveProvider` refactor for `openai-compatible` must not read key/baseUrl from the agent
- **Location:** `architecture.md` `resolveAgentModel` snippet (lines ~91–104) + "Refactor the provider-switch out of `resolveModelTier`".
- **What's wrong:** The plan factors the provider switch into a shared `resolveProvider(provider, model, config, resolver)`. For `openai-compatible`, the existing `resolveModelTier` reads `tierConfig.baseUrl` + `tierConfig.apiKey` from the **gateway config** (verified, lines 85–101). But `resolveAgentModel` passes the *agent's* `modelId`/`modelProvider` only — the agent row carries no baseUrl/apiKey. The plan doesn't say where `resolveProvider` sources baseUrl/apiKey for a per-agent `openai-compatible` model. If it naively reads from `config[tier]` it will use the *wrong tier's* endpoint; if it reads nothing it throws. The concept scopes the picker to Anthropic, so this is latent — but the schema/API permit `modelProvider: "openai-compatible"`, so the path is reachable.
- **Fix direction:** Specify it: for a per-agent `openai-compatible` model, `resolveProvider` must source baseUrl/apiKey from the gateway's `openai-compatible` tier config (or whatever the single openai-compatible credential source is post-AH1), not from a tier index. State this in the `resolveProvider` contract, and add an integration assertion. If AH2 chooses to reject per-agent `openai-compatible` entirely at the API boundary (consistent with the Anthropic-only picker), that is cleaner — but then say so and enforce it (422), don't leave `resolveProvider` to guess.

### INFO — `getCapabilitiesByType` vs the API validation check
- The plan validates harness existence at the API boundary via `adapterPool.getCapabilitiesByType(data.harnessType)` returning truthy. Verified this works: `getCapabilitiesByType(type)` returns `null` when no adapter matches that type (line 197). Correct. One subtlety: `getCapabilitiesByType(null)` returns *any* adapter's capabilities — but the validation snippet guards `if (data.harnessType && ...)`, so null is skipped at the API layer (null only arrives for legacy rows, handled by migration). Consistent. No action.

### INFO — Provisioning defensive fallback contradicts the "null is invalid" stance, mildly
- `const harnessType = agent.harnessType ?? DEFAULT_AGENT_HARNESS;` (line 156) silently coerces a null harness to `builtin` at provision time. The migration guarantees non-null, so this is dead defensive code. It's harmless but it's the kind of "defensive over-engineering" the negative lens flags — and it slightly contradicts the concept's "null is not a valid runnable state, error loudly." Acceptable as a belt-and-suspenders given migration is the real guarantee, but consider logging a warning if it ever fires (a null post-migration means the migration missed a row — worth knowing). Minor.

### INFO — §6 doc contradiction resolution confirmed
- The concept flagged a CRITICAL: `docs/agent-layer/model-routing-and-cost.md` §6 says "Agents don't pick their own model." Task 11 amends §6 to "per-agent model is the primary axis; tier = cost-posture + fallback." This is a genuine doc update (not a silent redefinition) and it correctly resolves the contradiction the concept raised. The coexistence story (per-agent wins for resolution; tier downgrade lever remains for future cost wiring, out of scope) is coherent. No action — just confirming the gate is met.

### INFO — Tier-table demotion has no contradiction with per-agent model
- Verified: `resolveAgentModel` consults the tier gateway **only** when `agent.modelId`/`modelProvider` are both null. Per-agent always wins. Settings → Models relabeled to "system default." AC5 asserts both branches. The demotion is clean; ModelTier survives only as Scheduler cost-posture + fallback. No contradiction. No action.

## Re-score guidance
- WARNING-1 (cross-axis compatibility) is the one that most affects the score — it's an unimplemented concept hard rule and a reachable dead-session path. Closing it (or explicitly, justified scoping-out) moves Error-handling 7→8 and Spec-alignment 8→9.
- WARNING-2 (stale-id coverage) is a real silent-regression risk; broadening Task 1 + the AC4 guard moves Doc/lore 7→8 and de-risks the build.
- WARNING-3 (openai-compatible resolution source) is latent but should be nailed down to avoid a guessing `resolveProvider`.
- With all three addressed: 8–9/10. As written: **7/10, build may start but the builder must treat WARNING-1/2/3 as in-scope, not optional.**

---

# Round-2 re-critique (2026-06-13) — verifying the 5 WARNING resolutions

**Re-scored against the revised `architecture.md`. Codebase claims re-verified live.**

## Round-2 verdict: 8.5 / 10 — APPROVED, proceed to build. No CRITICAL, no unresolved WARNING. One NEW finding (build-time note, test-backstopped) + one cosmetic type-name nit.

## Per-WARNING verdict

- **ARCH-1 (cross-axis harness↔provider) — RESOLVED.** API boundary now validates the *pair* (Phase 0 Q6; Types §`agents.ts` lines 162-172): `INCOMPATIBLE_HARNESS_MODEL` 422 when `caps.modelProviders` is non-empty and excludes the provider; provisioning passes `modelProviders: agent.modelProvider ? [agent.modelProvider] : undefined` into `select()` (lines 185-188), and `select()` already supports the filter (`adapter-pool.ts:153`, verified — ALL-providers-must-match semantics, correct for a single-element array). `NoEligibleHarnessError` thrown on null select. Adapter facts verified live: `claude-code` = `["anthropic"]`, `builtin` = all three, CLI = `[]` (provider-agnostic, correctly exempted by the `.length > 0` guard). Sad-path (claude-code + openrouter → 422) and happy-path (builtin + openrouter → 200) are both real. No X5 interface change.

- **ARCH-2 (catalog freshness) — RESOLVED.** Task 1 now enumerates all five stale-id sites incl. `builtin-harness-adapter.ts` `COST_PER_MILLION_TOKENS` and `context-window.ts` `MODEL_CONTEXT_WINDOWS`, with concrete re-key values for all four catalog ids **including `claude-fable-5`** (cost $10/$50, ctx 1M) so new ids resolve to real cost+context, not defaults. AC4 grep broadened to `packages/server/src` + `packages/web/src` (excl. drizzle + protected legacy-asserting tests), and the unit test now asserts `contextWindowForModel("claude-fable-5") === 1_000_000` and `COST_PER_MILLION_TOKENS["claude-fable-5"]` defined — closing the silent-regression hole the round-1 grep scope missed.

- **ARCH-3 (per-agent openai-compatible) — RESOLVED, cleanly.** Decision: reject per-agent `openai-compatible` at the API boundary (422 `UNSUPPORTED_PROVIDER`, runs first in the chain); `resolveProvider`'s `openai-compatible` branch throws `UnsupportedAgentProviderError` defensively (never reads a tier's baseUrl/apiKey — kills the "borrow the wrong tier's endpoint" guess from round-1 WARNING-3). The shared `resolveProvider` keeps full `openai-compatible` support for the **tier** path (`resolveModelTier`), so no existing tier capability is lost. New AC2c covers both: per-agent reject + tier-path still resolves. The `MODEL_PROVIDERS` zod enum stays all-three (shared union unchanged) — the boundary check narrows only the per-agent set. No migration-path break: no agent is seeded/backfilled with `openai-compatible` (defaults are anthropic/sonnet), so no existing row becomes un-PATCHable. Verified clean.

## NEW finding (round-2)

- **NEW-1 (build-time note, test-backstopped, NOT blocking) — merged-pair cross-axis check uses merged *provider* but not merged *harness*.** `agents.ts` snippet derives `caps` from `data.harnessType` only (`const caps = data.harnessType ? getCapabilitiesByType(data.harnessType) : undefined`) and `effProvider = data.modelProvider ?? existing?.modelProvider`. A PATCH that flips **only `modelProvider`** (omits `harnessType`) yields `caps === undefined` → cross-axis check skipped → an incompatible merged pair slips through. But the plan's prose (lines 151, 164-165) and **AC2b explicitly require** this exact case to 422 ("flip only `modelProvider` against a stored anthropic-only harness → 422"). The words and the snippet disagree. Resolution is one line — derive an `effHarness = data.harnessType ?? existing?.harnessType` and fetch `caps` from that. The AC2b integration test is written to fail unless the builder does this, so it's backstopped, not silent. Flagging so the builder fixes the snippet, not the test. (Verified: PATCH handler loads `existing` before applying the patch — `agents.ts:211` — so `effHarness` is in scope.)

## Cosmetic nit (no action)
- The plan calls `getCapabilitiesByType`'s return `AdapterMeta` (line 173 prose). It actually returns `HarnessCapabilities` (`adapter-pool.ts:189`, via `adapter.getCapabilities()`). The field read (`modelProviders: readonly string[]`) exists on `HarnessCapabilities` too (`harness-adapter.ts:77`, verified), so the check is correct at runtime — only the type name in prose is wrong. Harmless.

## Round-2 dimension deltas
- Error handling 7→8 (ARCH-1 cross-axis now enforced at both boundary + provisioning; `NoEligibleHarnessError` covers provider-incompat).
- Spec alignment 8→9 (cross-axis hard rule implemented; AC2b/AC2c added and typed).
- Doc/lore 7→8 (catalog-freshness coverage complete incl. cost+context maps).
- Others unchanged. Overall **8.5/10**.

**APPROVED — round 2.** No CRITICAL, no unresolved WARNING. NEW-1 is a build-time snippet fix already enforced by AC2b. Proceed to build.
