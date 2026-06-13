# AH2 Architecture — Per-agent model and a harness that actually selects

**Spec:** `.pipeline/work-packages/TRACK-AH.md` lines 64–101
**Inputs (locked, not re-litigated):** `plans/AH2/concept.md`, `plans/AH2/design/approved.md`.

---

## Required reading (for the builder)

- `plans/AH2/concept.md` + `plans/AH2/design/approved.md` — locked contracts.
- `packages/shared/src/model-gateway.ts` — `ModelProvider`, `ModelTierConfig`, `ResolvedModel`. **New `MODEL_CATALOG` lands here.**
- `packages/shared/src/types.ts` — `ModelTier`, `MODEL_TIERS` (catalog defaults reference these).
- `packages/db/src/schema.ts` lines 68–72 — `users.harnessType`, `users.modelTierPreference`; **add `model_id`, `model_provider`.**
- `packages/server/src/services/model-gateway.ts` — `BUILT_IN_GATEWAY_CONFIG` (stale IDs), `resolveModelTier()`. **Add `resolveAgentModel()`.**
- `packages/server/src/harness/builtin-harness-adapter.ts` lines 83–89 — `COST_PER_MILLION_TOKENS` (stale IDs, keyed-by-model). **Re-key to catalog ids (Task 1).**
- `packages/server/src/harness/context-window.ts` lines 13–21 — `MODEL_CONTEXT_WINDOWS` (stale IDs, keyed-by-model). **Re-key to catalog ids (Task 1).**
- `packages/web/src/settings/SettingsModels.stories.tsx` lines 19–25 — story fixtures with stale ids. **Update to catalog ids (Task 1).**
- `packages/server/src/services/session-provisioning.ts` lines 278–334 — tier resolution + `adapterPool.select({ harnessType })`. **Per-agent model + harness-validation lands here.**
- `packages/server/src/routes/sessions-routes.ts` lines 238–286 — credential pre-flight via `resolveModelTier(body.modelTier, …)`. **Switch to per-agent resolution.**
- `packages/server/src/harness/adapter-pool.ts` — `select()`, `AdapterMeta.type`, `list()`, `getCapabilitiesByType()`, `createLocalAdapterPool()`.
- `packages/server/src/routes/agents.ts` lines 39–50, 140–198, 261 — agent CRUD validation + response. **Add `modelId`/`modelProvider`, validate harness server-side.**
- `packages/server/src/routes/agent-profile.ts` lines 392–403 — `resolveHarnessAvailable()` (currently treats null as "any" — adjust meaning).
- `packages/server/src/routes/teams-routes.ts` lines 382–417 — team-creation agent seed (no harness/model today).
- `packages/db/src/factory-bootstrap.ts` lines 84–135 — assistant + facilitator seeds (no harness/model today).
- `packages/web/src/settings/SettingsAgents.tsx`, `SettingsModels.tsx`, `settings-types.ts`.
- `docs/agent-layer/model-routing-and-cost.md` §6 — **must be amended** (concept CRITICAL).

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| Model is per-agent | `users` has NO model column; model lives globally in `server_config.modelGateway` | **Add `users.model_id` + `users.model_provider`** (migration 0032). |
| Harness validated server-side against registry | `agents.ts` accepts `harnessType: z.string().max(100)` — any string; provisioning passes `harnessType ?? undefined` to `select()`, null = "any adapter" | Add server-side registry validation in agent create/PATCH; change provisioning so a configured harness with no adapter **errors**, never falls through to "any". |
| Current model IDs | Stale `*-20250514`/`claude-haiku-3-5-*` ids live in **five** keyed-by-model-id places: `BUILT_IN_GATEWAY_CONFIG` (`model-gateway.ts`), `SettingsModels.KNOWN_ANTHROPIC_MODELS`, **`builtin-harness-adapter.ts:84–86` cost table, `context-window.ts:15–17` context-window map, `SettingsModels.stories.tsx:19–25` fixtures** | Re-key all five to `MODEL_CATALOG` ids (`claude-opus-4-8`/`claude-sonnet-4-6`/`claude-haiku-4-5`/`claude-fable-5`). The cost + context-window maps are keyed by model id — leaving them stale means new catalog ids resolve to **no cost data + wrong/default context window** (silent regression). See Task 1. |
| Onboarding/team agents runnable by construction | factory-bootstrap + teams-routes insert agents with **no** `harnessType`/`model*` | Seed a registered default harness + catalog model on every agent insert + backfill migration for existing rows. |
| Resolver respects per-agent model before system default | `sessions-routes` calls `resolveModelTier(body.modelTier, gateway, …)` — purely tier→gateway, agent never consulted for model | New `resolveAgentModel(agent, gateway, resolver)` that uses agent `model_id`/`model_provider` first, falls back to tier gateway. |
| `GET /api/harnesses` for the UI | No such route; `GET /api/workers` returns `AdapterInfo[]` but requires `X-API-Key` (worker-auth, not founder-auth) | **Add `GET /api/harnesses`** (founder/public-data boundary) returning `{ type, name, modelProviders }[]` from `adapterPool.list()` deduped by `type`. |

**Model catalog (verified via `claude-api` skill, 2026-06-13):** all `anthropic`. `claude-opus-4-8` (Opus 4.8, 1M), `claude-sonnet-4-6` (Sonnet 4.6, 1M), `claude-haiku-4-5` (Haiku 4.5, 200K; full id `claude-haiku-4-5-20251001` — use the alias `claude-haiku-4-5`), `claude-fable-5` (Fable 5, 1M). No date suffixes on aliases.

---

## Phase 0 — Interrogation (resolved, autonomous)

1. **Column names — `model_id`+`model_provider` vs a single JSON `model` blob?** → **Two columns** `model_id TEXT`, `model_provider TEXT`. Rationale: mirrors `ResolvedModel`'s flat shape, queryable, no JSON parse at resolve-time, and `model_provider` is the closed `ModelProvider` union (validated at the API boundary). A JSON blob buys nothing at 2 fields.

2. **Default harness on create — `builtin` or `claude-code`?** → **`builtin`.** Always registered (concept), supports all three providers (`modelProviders: ["anthropic","openrouter","openai-compatible"]`), max concurrency 8. `claude-code` is anthropic-only. `builtin` is the safe universal default for AH3's assistant turn and any provider.

3. **Default model on create?** → **`claude-sonnet-4-6`** (workhorse-equivalent, 1M context, cheap-enough, current). Applied at: factory-bootstrap assistant seed, teams-routes roster seed, add-agent form initial values, and the backfill migration.

4. **Does `select()` itself need changing, or just the call site?** → **Call site (provisioning) + a guard.** `select({ harnessType })` already filters by type and returns `null` when no match. The bug is provisioning passing `harnessType ?? undefined` (null→"any"). Fix: provisioning passes the agent's concrete `harnessType` (now always non-null post-migration); if `select()` returns null for a configured harness, **throw `NoEligibleHarnessError`** (new, surfaced as 4xx/визible) instead of the current generic "all adapters at capacity" message. Do NOT change `select()`'s signature (X5 constraint: adapter interface intact).

5. **Harness validation — reject at API boundary or only at provision time?** → **Both.** API create/PATCH validates against the live `adapterPool` (reject 422 with `{ error, code: "UNKNOWN_HARNESS" }`); provision-time guard is the backstop for a harness that de-registered after save (CLI left PATH). Concept hard rule: server-side, not just UI.

6. **Cross-axis harness↔provider compatibility — enforced where?** → **Both API boundary AND provisioning** (concept Phase 4 Harness hard rule: the chosen harness must advertise the model's provider in `AdapterMeta.modelProviders`). API create/PATCH validates the `(harnessType, modelProvider)` *pair* (not just each axis independently): reject 422 `{ error, code: "INCOMPATIBLE_HARNESS_MODEL" }` when the adapter's `modelProviders` is non-empty and excludes the agent's `modelProvider`. Provisioning passes `modelProviders: [agent.modelProvider]` into `select()` so adapter selection itself enforces compatibility (and throws `NoEligibleHarnessError` when no compatible adapter exists). `select()` already supports a `modelProviders` filter (`adapter-pool.ts:153`) — **no X5 interface change**. This closes the dead-session path AH2 exists to kill: a `claude-code` (anthropic-only) harness + an `openrouter`/`openai-compatible` agent model is rejected at save, not silently selected and killed at the LLM call.

---

## Types & contracts

### `packages/shared/src/model-gateway.ts` — add `MODEL_CATALOG`
```ts
export interface ModelCatalogEntry {
  readonly id: string;          // exact API model-id (alias, no date suffix)
  readonly label: string;       // friendly, e.g. "Sonnet 4.6"
  readonly provider: ModelProvider;
  readonly contextWindow: number;
}

/** Closed catalog — adding a model is a code change (mirrors ModelProvider closure). */
export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  { id: "claude-opus-4-8",   label: "Opus 4.8",   provider: "anthropic", contextWindow: 1_000_000 },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "anthropic", contextWindow: 1_000_000 },
  { id: "claude-haiku-4-5",  label: "Haiku 4.5",  provider: "anthropic", contextWindow:   200_000 },
  { id: "claude-fable-5",    label: "Fable 5",    provider: "anthropic", contextWindow: 1_000_000 },
] as const;

export const DEFAULT_AGENT_MODEL_ID = "claude-sonnet-4-6";
export const DEFAULT_AGENT_MODEL_PROVIDER: ModelProvider = "anthropic";
export const DEFAULT_AGENT_HARNESS = "builtin";

export function isCatalogModel(id: string): boolean { /* MODEL_CATALOG.some(m => m.id === id) */ }
export function catalogEntry(id: string): ModelCatalogEntry | undefined { /* find */ }
```
Export all from `packages/shared/src/index.ts`.

### `packages/server/src/services/model-gateway.ts` — `resolveAgentModel()`
```ts
/**
 * Resolve the model for a specific agent.
 * Per-agent model wins; falls back to the tier gateway only when the agent has none.
 * Concept hard rule: respect per-agent model before any system default.
 */
export async function resolveAgentModel(
  agent: { modelId: string | null; modelProvider: ModelProvider | null },
  tier: ModelTier,
  config: ModelGatewayConfig,
  credentialResolver: CredentialResolver,
): Promise<ResolvedModel> {
  if (agent.modelId && agent.modelProvider) {
    // resolve key for agent.modelProvider via credentialResolver, same provider switch as resolveModelTier:
    //   anthropic → anthropic_api_key
    //   openrouter → openrouter_api_key
    //   openai-compatible → NOT a valid per-agent provider (see below) — resolveProvider throws if reached.
    return resolveProvider(agent.modelProvider, agent.modelId, config, credentialResolver);
  }
  return resolveModelTier(tier, config, credentialResolver); // unchanged fallback
}
```
Refactor the provider-switch out of `resolveModelTier` into a shared `resolveProvider(provider, model, config, resolver)` so both paths share it. **Update `BUILT_IN_GATEWAY_CONFIG` to current IDs.**

**`openai-compatible` per-agent decision (ARCH-3 — resolved):** a per-agent `openai-compatible` model has **no baseUrl/apiKey on the agent row** — those live only on a gateway *tier* config, and `resolveAgentModel` is not tier-indexed, so `resolveProvider` has no non-guessing source for them. **Decision: reject per-agent `openai-compatible` at the API boundary (422), do not let `resolveProvider` guess.** This is consistent with the Anthropic-only AH2 picker (the UI never offers it) and avoids silently borrowing the wrong tier's endpoint. Concretely:
- `agents.ts` create/PATCH: `if (data.modelProvider === "openai-compatible") return c.json({ error: "Per-agent openai-compatible models are not supported; use a system default tier.", code: "UNSUPPORTED_PROVIDER" }, 422);` (runs before the catalog/cross-axis checks).
- `resolveProvider`'s `openai-compatible` branch throws `UnsupportedAgentProviderError` (defensive — unreachable post-validation; guards against a legacy/raw-DB row). It does **not** read `config[tier].baseUrl`/`apiKey`.
- `MODEL_PROVIDERS` zod enum on the schema still accepts all three values (shared union unchanged); the boundary check above is what narrows the *per-agent* set to `anthropic` | `openrouter`. The shared `resolveProvider` keeps full `openai-compatible` support for the tier path (`resolveModelTier`), which sources baseUrl/apiKey from the tier config as today.

### New error — `packages/shared/src/errors.ts` (alongside `MissingCredentialError`)
```ts
export class NoEligibleHarnessError extends Error {
  constructor(public readonly harnessType: string) {
    super(`No registered adapter for harness "${harnessType}". Configure a registered harness in Settings → Agents.`);
    this.name = "NoEligibleHarnessError";
  }
}
```

### Schema — `packages/db/src/schema.ts` (users table)
```ts
/** AH2: per-agent model id (catalog id). null only transiently pre-migration. */
modelId: text("model_id"),
/** AH2: per-agent model provider (ModelProvider). Derived from catalog entry at write. */
modelProvider: text("model_provider"),
```
`modelTierPreference` and `harnessType` stay (tier demoted to fallback hint; harness now validated).

### API: `GET /api/harnesses` (new, `packages/server/src/routes/harnesses.ts`)
```
GET /api/harnesses  → 200 [{ type: string, name: string, modelProviders: string[] }]
```
Founder-auth via `requireBoundary({ kind: "public-data" })` (same as agents routes — no `X-API-Key`). Source: `adapterPool.list()`, dedupe by `type` (multiple entries can share a type), drop entries with no `type`. Mount in `app.ts`.

### API: `agents.ts` create/PATCH — add fields + harness validation
```ts
// createSchema + patchSchema add:
modelId: z.string().max(100).nullable().optional(),
modelProvider: z.enum(MODEL_PROVIDERS).nullable().optional(),
// harnessType stays z.string().max(100) but is now validated against the registry (below)
```
Validation (both create + PATCH, when harnessType present and non-null). The three checks run in order: harness-exists → model-in-catalog → cross-axis compatibility. **All three must run on POST and PATCH** — for PATCH, validate against the merged state (existing row fields the request does not change) so a PATCH that flips only `modelProvider` is still checked against the stored `harnessType`, and vice-versa.
```ts
const caps = data.harnessType ? adapterPool.getCapabilitiesByType(data.harnessType) : undefined;
// 1. harness exists in registry
if (data.harnessType && !caps) {
  return c.json({ error: `Unknown harness: ${data.harnessType}`, code: "UNKNOWN_HARNESS" }, 422);
}
// 2. model: if modelProvider === "anthropic", reject modelId not in MODEL_CATALOG
if (data.modelProvider === "anthropic" && data.modelId && !isCatalogModel(data.modelId)) {
  return c.json({ error: `Unknown model: ${data.modelId}`, code: "UNKNOWN_MODEL" }, 422);
}
// 3. cross-axis: chosen harness must advertise the model's provider (concept Phase 4 hard rule).
//    Empty modelProviders = provider-agnostic adapter (no restriction). Use the effective pair
//    (request value falling back to the stored row) so single-field PATCHes are still checked.
const effProvider = data.modelProvider ?? existing?.modelProvider;
if (caps && effProvider && caps.modelProviders.length > 0 && !caps.modelProviders.includes(effProvider)) {
  return c.json(
    { error: `Harness "${data.harnessType}" does not support provider "${effProvider}".`, code: "INCOMPATIBLE_HARNESS_MODEL" },
    422,
  );
}
```
(`getCapabilitiesByType` returns `AdapterMeta` carrying `modelProviders: string[]` — verified non-secret. For PATCH, `existing` is the current agent row loaded before applying the patch.)
`adapterPool` must be injected into the agents route (it's already available in app wiring via the workers route). Response shape adds `modelId`, `modelProvider`.

### Provisioning — `session-provisioning.ts`
Replace lines ~289–332:
```ts
// model: per-agent first, tier fallback (resolveAgentModel happens at the route's credential pre-flight)
// harness: agent.harnessType is now non-null (post-migration). Pass it directly.
const harnessType = agent.harnessType ?? DEFAULT_AGENT_HARNESS; // defensive; migration guarantees non-null
// Cross-axis enforcement (concept Phase 4 hard rule): constrain selection to adapters that
// advertise the agent's model provider. select() filters by modelProviders only when supplied
// (adapter-pool.ts:153); a provider-agnostic adapter (empty modelProviders) still matches.
const selected = adapterPool.select({
  harnessType,
  modelProviders: agent.modelProvider ? [agent.modelProvider] : undefined,
});
if (!selected) {
  adapterPool.release?.(/* none reserved */);
  // null here = no adapter for this harness OR no adapter for this harness that supports
  // the agent's provider. Both are unrunnable configs — error loudly, never fall through.
  throw new NoEligibleHarnessError(harnessType);
}
```
The `sessions-routes.ts` credential pre-flight switches `resolveModelTier(body.modelTier, …)` → `resolveAgentModel(agent, body.modelTier ?? agentTier, gateway, resolver)` (load the agent row first, which the route already does downstream — hoist the lookup, or pass agent fields through).

---

## Design-it-twice — model storage shape

**A — two flat columns (`model_id`,`model_provider`)** *(chosen)*. Trade-off: a schema migration + 2 columns. Reject reason: none material. Mirrors `ResolvedModel`, queryable, closed-union-validatable, zero parse cost.

**B — JSON `model` column `{provider, id}`**. Trade-off: one migration column, but every read parses JSON and TS sees `unknown` until validated; can't index/filter by provider; diverges from the flat `ResolvedModel`/`ModelTierConfig` shape the codebase already uses. Reject: parse-at-use overhead and type-erosion for zero gain at 2 fields.

Synthesis: **A.** `model_provider` is the closed `ModelProvider` enum, validated at the API boundary, identical to how `ModelTierConfig.provider` is handled.

---

## Migration (0032 — `packages/db/drizzle/0032_AH2_per_agent_model.sql` via `db:generate`)

1. `ALTER TABLE users ADD COLUMN model_id TEXT;`
2. `ALTER TABLE users ADD COLUMN model_provider TEXT;`
3. **Backfill (data migration, same file):**
   - Every AI agent (`kind='ai'`, `status != 'retired'`) with `model_id IS NULL` → set `model_id='claude-sonnet-4-6'`, `model_provider='anthropic'`. (Tier-aware optional: map `reasoning→claude-opus-4-8`, `fast→claude-haiku-4-5`, else sonnet — **chosen: tier-aware backfill** so an agent that picked `reasoning` keeps a reasoning-class model. Use `modelTierPreference` to pick.)
   - Every AI agent with `harness_type IS NULL` → set `harness_type='builtin'`. (Concept: null harness is no longer a valid steady state.)
4. Generated via `npm run db:generate` (drizzle-kit) for the ADD COLUMNs; the backfill UPDATE statements appended to the generated SQL (drizzle migrations are plain SQL — backfill is allowed in the migration file). Verify the PostgreSQL path (`migrate-pg.ts`) applies the same file (single SQL dir, dual-driver).

**Migration is part of the plan, not a follow-up.** No agent ends unrunnable (spec contract).

### Seed defaults (so NEW agents are runnable by construction)
- `factory-bootstrap.ts` assistant seed (`seed-agent-cos`) + facilitator seeds: add `harnessType: "builtin"`, `modelId: "claude-sonnet-4-6"`, `modelProvider: "anthropic"`.
- `teams-routes.ts` roster insert (line ~400): add the same three defaults (tier-class optional; sonnet is fine for all roles).
- `SettingsAgents.tsx` add-form initial `addValues`: `harnessType: "builtin"` (or first registered), `modelId: "claude-sonnet-4-6"`, `modelProvider: "anthropic"`. No more empty-string harness.

---

## UI changes (per `approved.md` — do not re-litigate)

### `SettingsAgents.tsx`
- `EditFormValues`: drop `modelTierPreference`; add `modelId: string`, `modelProvider: string`.
- Table columns: `Name | Role | Model | Harness | Sessions | Actions` (remove "Model Tier", add "Model" rendering catalog label; Harness cell shows `StatusChip status="warning"` "Harness unavailable" when `harnessType ∉ registered`).
- Replace harness free-text `<input>` (edit + add) with `Select` fed by `GET /api/harnesses` types (+ disabled stale option if current value unregistered).
- Replace tier `Select` with model `Select` fed by `MODEL_CATALOG` (`label="${m.label} (${m.id})"`).
- Fetch registered harness types on mount (`GET /api/harnesses`). Save disabled when selected harness is the disabled "not available" option.
- PATCH/POST bodies send `modelId`, `modelProvider`, `harnessType` (no `modelTierPreference`).

### `SettingsModels.tsx`
- Replace `KNOWN_ANTHROPIC_MODELS` const with `MODEL_CATALOG.filter(m => m.provider === "anthropic")` ids.
- Add helper `<p className="text-[13px] text-[var(--text-tertiary)]">System default models. Used only when an agent has no model of its own — set per-agent models in Settings → Agents.</p>` above tier rows.

### `agent-profile.ts` `resolveHarnessAvailable`
- Keep signature, but the null branch (`return adapterPool.size > 0`) is now dead for steady-state agents (all have a concrete harness). Leave as-is for defensive legacy rows; the UI computes "available" from the registered set directly.

---

## Acceptance criteria → verification

| # | AC (from spec) | Verification |
|---|---|---|
| AC1 | Each agent's model is per-agent; two agents differ | **Integration** (`agents.integration.test.ts`): create 2 agents with `claude-opus-4-8` / `claude-sonnet-4-6`; GET each; assert distinct `modelId`. **Playwright (AH5 lane):** set different models on two agents, reload, screenshot shows each persisted. |
| AC2 | Harness chosen from registry; no free-text; unregistered rejected | **Integration:** PATCH agent `harnessType:"nonsense"` → 422 `UNKNOWN_HARNESS`; PATCH `"builtin"` → 200. **Component test** (`SettingsAgents.test.tsx`): harness field is a `<select>` (no text input), options = registered types. **Playwright:** open harness control, screenshot shows constrained selector + Save prevented for invalid. |
| AC3 | Every agent (incl. onboarding/team) has working default model+harness; runnable w/o config | **Integration:** run factory-bootstrap + team-create; query seeded agents; assert `harnessType` is registered AND `modelId ∈ catalog`. **Migration test:** insert legacy null-harness/null-model agent, run 0032, assert backfilled. |
| AC4 | Choices reflect current catalog; defaults point at current | **Unit** (`model-catalog.test.ts`): `MODEL_CATALOG` ids === `["claude-opus-4-8","claude-sonnet-4-6","claude-haiku-4-5","claude-fable-5"]`; `BUILT_IN_GATEWAY_CONFIG`, `COST_PER_MILLION_TOKENS`, and `MODEL_CONTEXT_WINDOWS` contain no `*-20250514`/`claude-haiku-3-5-*` and **resolve every catalog id to non-default cost + context** (assert `contextWindowForModel("claude-fable-5") === 1_000_000`, `COST_PER_MILLION_TOKENS["claude-fable-5"]` defined). **Lint/grep guard (broadened):** no stale id strings (`-20250514`, `claude-haiku-3-5-`) anywhere in `packages/server/src` + `packages/web/src` (exclude `**/drizzle/**` migrations and protected tests that intentionally assert legacy ids). |
| AC5 | Global tier table no longer per-agent mechanism; demoted, no contradiction | **Integration:** agent with `modelId` set → `resolveAgentModel` returns the agent's model (NOT the tier gateway's). Agent with null `modelId` → returns tier gateway. **Component:** `SettingsModels` shows the "system default" helper copy. |
| AC2b | Cross-axis: incompatible (harness, provider) pair rejected; provisioning never selects a provider-incompatible adapter | **Integration** (`AH2-agent-config.integration.test.ts`): PATCH agent to `harnessType:"claude-code"` (anthropic-only) + `modelProvider:"openrouter"` → 422 `INCOMPATIBLE_HARNESS_MODEL`; same pair where harness is `builtin` (multi-provider) → 200. PATCH single field that creates an incompatible *merged* pair (e.g. flip only `modelProvider` against a stored anthropic-only harness) → 422. **Provisioning integration:** agent whose only registered harness can't serve its provider → `NoEligibleHarnessError` (not a silent any-adapter pick). |
| AC2c | Per-agent `openai-compatible` rejected at boundary (ARCH-3) | **Integration:** POST/PATCH agent `modelProvider:"openai-compatible"` → 422 `UNSUPPORTED_PROVIDER`. Tier path (`resolveModelTier` with an openai-compatible tier) still resolves — `resolveProvider` retains tier support; only the per-agent path rejects. |
| AC6 | Provisioning selects matching adapter + resolves configured model; no "any adapter" fallback masking missing harness | **Integration** (`session-provisioning.integration.test.ts`): provision for agent with `harnessType:"builtin"` → selects builtin (passing `modelProviders:[agent.modelProvider]`), `resolveAgentModel` returns agent model. Provision for agent whose harness has no adapter → throws `NoEligibleHarnessError` (NOT a silent any-adapter pick). |
| AC7 (contract) | Resolver respects per-agent model before system default | covered by AC5 integration. |
| AC8 (contract) | X5 adapter interface intact | **Type/grep:** `HarnessAdapter` interface + `AdapterPool.select` signature unchanged (`git diff` shows no edits to the interface). |

---

## Ordered task list

1. **shared/MODEL_CATALOG + re-key all stale-id maps** — add `ModelCatalogEntry`, `MODEL_CATALOG`, `DEFAULT_AGENT_*`, `isCatalogModel`, `catalogEntry`; export from index. Re-key **all five** stale-id locations to current catalog ids:
   - `model-gateway.ts` `BUILT_IN_GATEWAY_CONFIG` → catalog ids.
   - `builtin-harness-adapter.ts` `COST_PER_MILLION_TOKENS` (input/output $ per 1M tokens, current Anthropic pricing): `claude-opus-4-8` `{ input: 5, output: 25 }`, `claude-sonnet-4-6` `{ input: 3, output: 15 }`, `claude-haiku-4-5` `{ input: 1, output: 5 }`, `claude-fable-5` `{ input: 10, output: 50 }`. (Keep `DEFAULT_COST = { input: 3, output: 15 }`.)
   - `context-window.ts` `MODEL_CONTEXT_WINDOWS`: `claude-opus-4-8` `1_000_000`, `claude-sonnet-4-6` `1_000_000`, `claude-haiku-4-5` `200_000`, `claude-fable-5` `1_000_000`. (Keep `DEFAULT_CONTEXT_WINDOW = 128_000` for unknown models; these match `MODEL_CATALOG.contextWindow`.)
   - `SettingsModels.stories.tsx` fixtures → catalog ids.
   - **`claude-fable-5` entries decided here** (pricing $10/$50, 1M context — verified via `claude-api` skill 2026-06-13) so the new catalog id is fully resolvable in cost + context lookups, not just present in the picker.
   *(proves AC4)* — files above; test `packages/shared/src/__tests__/model-catalog.test.ts`.
2. **shared/NoEligibleHarnessError** — `packages/shared/src/errors.ts` + export.
3. **schema + migration 0032** — add `model_id`/`model_provider`; `db:generate`; append tier-aware backfill + harness backfill. *(proves AC3 migration)* — `packages/db/src/schema.ts`, `packages/db/drizzle/0032_*.sql`; test `packages/db/src/__tests__/AH2-migration.integration.test.ts`.
4. **resolveAgentModel + resolveProvider refactor** — `packages/server/src/services/model-gateway.ts`; test `__tests__/AH2-resolve-agent-model.integration.test.ts`. *(proves AC5/AC7)*
5. **GET /api/harnesses** — `packages/server/src/routes/harnesses.ts` + mount in `app.ts`; test `routes/__tests__/AH2-harnesses.integration.test.ts`. *(feeds UI)*
6. **agents.ts** — add `modelId`/`modelProvider` to schemas + response; inject `adapterPool`; server-side validation in order, on **both POST and PATCH** (PATCH against the merged row): (a) reject `modelProvider:"openai-compatible"` → 422 `UNSUPPORTED_PROVIDER` (ARCH-3); (b) harness-exists → 422 `UNKNOWN_HARNESS`; (c) anthropic model-in-catalog → 422 `UNKNOWN_MODEL`; (d) cross-axis pair compat → 422 `INCOMPATIBLE_HARNESS_MODEL` (ARCH-1). *(proves AC1/AC2/AC2b/AC2c API)* — test `packages/server/src/__tests__/AH2-agent-config.integration.test.ts`.
7. **session-provisioning + sessions-routes** — per-agent model resolution via `resolveAgentModel`; `select({ harnessType, modelProviders: agent.modelProvider ? [agent.modelProvider] : undefined })` so selection enforces cross-axis compat (ARCH-1); throws `NoEligibleHarnessError` instead of "any" fallback. `resolveProvider` `openai-compatible` branch throws `UnsupportedAgentProviderError` (defensive). *(proves AC6/AC2b)* — test `services/__tests__/AH2-provisioning.integration.test.ts`.
8. **seed defaults** — factory-bootstrap + teams-routes insert `harnessType:"builtin"` + sonnet model. *(proves AC3 seed)* — extend existing seed/team integration tests.
9. **SettingsAgents.tsx** — columns, two `Select`s (each `className="max-md:text-[16px]"` per DESIGN-2), fetch `/api/harnesses`, drop tier field, client Save gating, StatusChip warning, **and the save-error surface (DESIGN-1):** on a 422 from POST/PATCH `/api/agents`, parse the `{ error, code }` body and render `error` inline near the form actions in `text-[var(--status-error)]` (the existing settings-form error token — `--color-error`/`text-error` are dead, use `--status-error`), keeping the form open with values intact. Replace the current swallow-and-generic-toast path (`showToast("Failed to save agent")`) so server codes `UNKNOWN_HARNESS`/`UNKNOWN_MODEL`/`INCOMPATIBLE_HARNESS_MODEL`/`UNSUPPORTED_PROVIDER` reach the user. — test `settings/__tests__/AH2-SettingsAgents.test.tsx` (assert inline error rendered on a mocked 422).
10. **SettingsModels.tsx** — catalog-backed model select + demoted helper copy. — test `settings/__tests__/AH2-SettingsModels.test.tsx`.
11. **docs** — amend `docs/agent-layer/model-routing-and-cost.md` §6 (per-agent model overrides tier; tier = cost-posture + fallback). Lint/prose only.
12. **Playwright (AH5 lane)** — the three required real-backend scenarios (AC1, AC2, AC3) — owned by AH5 lane per track rule; specs named here for the builder.

Dependencies: 1→{3,4,6}; 2→7; 3→{6,7,8}; 4→7; 5→9; 6→9; 8 after 3.

---

## Route checklist
- `GET /api/harnesses` — new, mounted in `app.ts`, founder boundary (`public-data`), returns deduped registered types. *(reviewer greps app.ts mount + route file.)*
- `POST /api/agents`, `PATCH /api/agents/:id` — both must apply the full validation chain (not just one handler, not just one axis): `UNSUPPORTED_PROVIDER` (openai-compatible) → `UNKNOWN_HARNESS` → `UNKNOWN_MODEL` → `INCOMPATIBLE_HARNESS_MODEL` (the cross-axis pair check). PATCH validates against the merged row so single-field edits can't slip an incompatible pair through. *(reviewer greps both handlers for all four codes.)*
- Credential pre-flight in `POST /api/sessions` switches to `resolveAgentModel`.

## Security & abuse cases
- **Input-trust on `modelId`/`harnessType`** — agent-config is founder-authored; still validate `modelProvider ∈ MODEL_PROVIDERS` (zod enum), `harnessType ∈ registry` (422), `modelId ∈ catalog` for anthropic (422). No free-text reaches `select()` or the LLM call unvalidated.
- **No secret handling** — AH2 stores no credentials (AH1's domain). `modelId`/`modelProvider` are non-secret. N/A for secret-handling/SSRF/path-traversal.
- **Rate-limit** — agent CRUD already behind founder auth boundary; no new public POST. `GET /api/harnesses` is read-only, founder-auth, returns no secrets (only `type`/`name`/`modelProviders`). N/A new limits.
- **No plaintext leak** — `GET /api/harnesses` must NOT include any apiKey/baseUrl (it only reads `AdapterMeta`, which has none). Assert in test.

## Protected tests
```
protectedTests:
  - packages/server/src/harness/__tests__/X5-adapter-pool-multi.test.ts   # X5 adapter interface intact
  - packages/server/src/harness/__tests__/adapter-pool.test.ts            # select() semantics
  - packages/server/src/routes/__tests__/X4-model-gateway.integration.test.ts  # gateway resolution (update stale-id assertions ONLY where they assert the old ids — flagged)
```
Note: `X4-model-gateway` asserts exact (now-stale) model ids — those specific assertions MUST update to current ids as part of task 1 (the `@lore X4 A-TEST-2` drift-catch is doing its job). This is the one sanctioned protected-test edit; reviewer confirms only stale-id strings changed.

## Shared files
```
sharedFiles:
  - packages/db/src/schema.ts                  # users columns
  - packages/shared/src/model-gateway.ts       # MODEL_CATALOG
  - packages/shared/src/index.ts               # exports
  - packages/server/src/app.ts                 # mount /api/harnesses
  - packages/db/src/factory-bootstrap.ts       # seed defaults
  - packages/server/src/harness/builtin-harness-adapter.ts  # COST_PER_MILLION_TOKENS re-key (X-track owns this file)
  - packages/server/src/harness/context-window.ts           # MODEL_CONTEXT_WINDOWS re-key (X-track owns this file)
```

## Risks / ambiguities
- **Tier-aware backfill** maps `modelTierPreference` → model class; agents with null tier get sonnet. Low risk; documented in migration.
- **`GET /api/harnesses` vs reusing `/api/workers`** — chose a new founder-auth route because `/api/workers` is `X-API-Key`-gated (worker auth), wrong boundary for the Settings UI. Small new surface, justified.
- **AQ-005 (≥16px mobile input) — RESOLVED (DESIGN-2, decided in `approved.md`):** the two AH2 `Select`s get `className="max-md:text-[16px]"` so AH2's new controls comply at ≤768px (the design-system `Select` base stays `text-[15px]` — global fix is out of scope). Build applies this to both the Model and Harness selects in `SettingsAgents.tsx` (edit + add forms). No hot-potato; the architecture owns the wiring, the design owns the decision.
- **Cost-posture interaction** — per-agent model + tier downgrade (§6.3) coexistence is documented but not wired (cost-model changes out of scope). No runtime conflict: per-agent wins for resolution; tier remains the downgrade lever if later opted in.
