# AH2 Concept — Per-agent model and a runnable harness

**Workpackage:** AH2 — "Per-agent model and a harness that actually selects"
**Spec:** `.pipeline/work-packages/TRACK-AH.md` lines 64–101
**Status:** LOCKED (autonomous mode — `/architecture` spec-alignment scoring is the downstream check)

---

## Phase 0 — The nouns

| Noun | Working definition | Classification |
|---|---|---|
| **AgentModel** | The provider + model-id pair an individual agent's turns run on. | **New** (extracted out of the global tier table; promoted to a per-agent property) |
| **Harness** | The runnable adapter an agent's session executes through, chosen from the live registry. | **Reshaped** (was free-text `harness_type`; becomes a constrained choice over registered adapters) |
| **ModelTier** (`reasoning\|workhorse\|fast`) | A global cost-posture bucket the Scheduler uses for routing. | **Reshaped** (demoted: no longer the per-agent model mechanism; becomes a system-default fallback) |
| **ModelCatalog** | The closed list of currently-runnable models offered in the picker. | **New** (didn't exist — model IDs were hard-coded in two places) |
| **AdapterRegistry** (`AdapterPool`) | The in-process set of registered `HarnessAdapter` instances. | **Stable** — used as-is. AH2 reads it for validation; does not change the adapter interface (X5 constraint). |
| **ModelProvider** (`anthropic\|openrouter\|openai-compatible`) | Closed union of provider kinds. | **Stable** — reused; AH2 does not add a provider. |

Stable inputs (no concept work): `AdapterRegistry`, `ModelProvider`, `HarnessAdapter` interface, `CredentialResolver`.

---

## Required reading (downstream `/architecture` + `/pipeline`)

- `docs/agent-layer/model-routing-and-cost.md` — **§6 contradicts AH2 and must be updated** (see Phase 6 / CRITICAL).
- `packages/db/src/schema.ts` lines 68–72 — `users.harnessType`, `users.modelTierPreference` columns.
- `packages/shared/src/model-gateway.ts` — `ModelTierConfig`, `ModelGatewayConfig`, `ResolvedModel`, `ModelProvider`, `BUILT_IN_GATEWAY_CONFIG` (stale IDs live in `services/model-gateway.ts`).
- `packages/server/src/services/model-gateway.ts` — `resolveModelTier()`, `BUILT_IN_GATEWAY_CONFIG` (stale `claude-opus-4-20250514` etc.).
- `packages/server/src/services/session-provisioning.ts` lines 289–334 — tier resolution + `adapterPool.select({ harnessType })`.
- `packages/server/src/routes/sessions-routes.ts` lines 238–286 — credential pre-flight via `resolveModelTier(body.modelTier, …)`.
- `packages/server/src/harness/adapter-pool.ts` — `select()`, `AdapterMeta.type`, `createLocalAdapterPool()`, `getCapabilitiesByType()`.
- `packages/server/src/routes/agents.ts` lines 39–50, 140–198, 261 — agent CRUD validation + response shape.
- `packages/server/src/routes/workers.ts` — `GET /api/workers` → `AdapterInfo[]` (registry exposed to clients; auth via `X-API-Key`).
- `packages/server/src/routes/teams-routes.ts` lines 225–284, 408, 671–678 — team creation seeds agents; `resolveHarnessAvailable()` helper already exists.
- `packages/db/src/factory-bootstrap.ts` lines 75–121 — assistant + factory agent seeding (onboarding-created agents).
- `packages/web/src/settings/SettingsAgents.tsx`, `SettingsModels.tsx`, `settings-types.ts`.

---

## Phase 1 — Essence

### AgentModel (new per-agent property)

1. **Identity.** An AgentModel is a *configuration property* on an agent: the `(provider, modelId)` pair the agent's turns run on. It is NOT a resolution result and NOT a credential — it names *which brain*, the gateway still resolves the *key* at use-time.
2. **Essential properties.** `provider: ModelProvider` (closed union) + `modelId: string` (a catalog entry's id). Both must be present together for the property to be set; a half-set (provider without model) is invalid.
3. **Rejection list** — see Phase 2.
4. **Composition.** Lives on the agent (`users` row). Resolved at session-provision time into a `ResolvedModel` by combining with a credential. Referenced by the gateway, never by the UI directly.
5. **Lifecycle.** Set at creation (default), editable in Settings → Agents, persisted. No states — it's a scalar pair, replaced wholesale on edit.
6. **Authority.** The founder sets it per agent. The system supplies a default at creation so no agent is ever model-less. Source of truth = the agent row.
7. **Vocabulary collision.** `model` is overloaded: the gateway's `ResolvedModel.model` is a *resolution result*; the agent's model is a *preference*. Lock the per-agent field name to **`modelId`** + **`modelProvider`** to disambiguate from `ResolvedModel.model`/`.provider`. The tier table's `ModelTierConfig.model` stays as-is (it's the system-default mechanism now).

### Harness (reshaped: free-text → constrained)

1. **Identity.** A Harness is the *body* — the registered adapter an agent's session executes through. The agent stores a `harnessType` string; that string is only valid if a registered adapter advertises that `type`.
2. **Essential properties.** `harnessType: string` that MUST match `AdapterMeta.type` of a currently-registered adapter. Non-null for every runnable agent.
3. **Rejection list** — see Phase 2.
4. **Composition.** Stored on the agent (`users.harnessType`). Validated against `AdapterRegistry`. Consumed by `adapterPool.select({ harnessType })`.
5. **Lifecycle.** Set at creation (default = a guaranteed-registered adapter), editable, validated server-side on every write.
6. **Authority.** Founder chooses from the registry-derived list. The *registry* (not the founder, not free text) is the authority on what is selectable.
7. **Vocabulary collision.** None new. `harnessType` already exists; AH2 narrows its domain from "any string or null" to "a registered adapter type" (null no longer means "any").

### ModelTier (reshaped: demoted)

1. **Identity.** After AH2, ModelTier is *only* the Scheduler's global cost-posture bucket + the system-default model mechanism. It is NOT the per-agent model selector anymore.
2. **Essential properties.** Closed enum `reasoning|workhorse|fast` (unchanged). The `server_config.modelGateway` table maps each tier → a current model, used as the **fallback** when an agent has no per-agent model.
3. **Rejection list.** ModelTier is not a per-agent brain selector. `users.modelTierPreference` is demoted to a legacy/optional hint, superseded by `modelId` when present.
4. **Composition.** Lives in `server_config.modelGateway`. Consumed by `resolveModelTier()` as the fallback path.
5. **Lifecycle.** Unchanged. The Settings → Models surface now edits *system defaults*, not the primary per-agent control.
6. **Authority.** Deployer/system, not per-agent.
7. **Vocabulary collision.** `docs/agent-layer/model-routing-and-cost.md` §6 says "Agents don't pick their own model." **This is now false** — see CRITICAL below.

---

## Phase 2 — Rejection lists (what these are NOT)

### AgentModel is NOT…
- **…a tier.** A tier is a global cost bucket shared across all agents; an AgentModel is a per-agent concrete id. Two agents on one team can hold different AgentModels — a tier cannot express that (this is the spec's headline requirement).
- **…a credential.** The model names the brain; the key is resolved separately by the gateway from the encrypted store (AH1's domain). Setting a model never stores or implies a key.
- **…a ResolvedModel.** `ResolvedModel` carries `apiKey` + `baseUrl` and is the *output* of resolution at session time. AgentModel is the *input preference*. Folding them would leak credentials into agent config (the X4 A-SEC-3 mistake AH1 is fixing).
- **…a free-form string.** `modelId` must be a member of the current ModelCatalog (or, for `openai-compatible`, a deployer-supplied id — out of scope to design the picker UX for; AH2 offers the Claude catalog). It is not arbitrary text.
- **…a provider switch by itself.** Changing `modelId` within `anthropic` is the common path; per-agent provider is allowed by the schema but the picker scope for AH2 is the Anthropic catalog (other providers remain reachable via the system-default tier table).

### Harness is NOT…
- **…free text.** The entire defect AH2 closes: no text box, no typo path, no unregistered value. The selector lists exactly the registry's advertised types.
- **…"any adapter" when null.** Today `harnessType: null` means "any adapter eligible." AH2 rejects that: null is not a valid runnable state. Every agent carries a concrete, registered type. (Backward-compat fallback for legacy rows is a migration concern, not a steady-state meaning.)
- **…a model.** The harness is the execution body; the model is the brain. `claude-code` (harness) can run `claude-opus-4-8` (model). They are orthogonal axes — the form presents two separate controls.
- **…a provider.** A harness advertises which providers it *supports* (`AdapterMeta.modelProviders`), but the harness is not itself a provider. Selecting a harness must be compatible with the chosen model's provider (cross-axis constraint — see Phase 4).

### ModelTier is NOT…
- **…the per-agent brain selector.** Demoted. It survives only as (a) the Scheduler's cost-posture routing input and (b) the system-default model fallback when an agent has no `modelId`.
- **…removed.** The spec allows "removed OR clearly demoted." We **demote**, not remove — `resolveModelTier()` and the cost-posture downgrade logic (`docs/agent-layer/model-routing-and-cost.md` §6.3) still depend on the tier vocabulary, and ripping it out is out of scope (cost-model changes are explicitly out of scope). Demotion = the per-agent model wins when set; the tier table is the labeled fallback.

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **AgentModel** | The `(modelProvider, modelId)` pair stored on an agent. | "model tier", "agent tier", "brain config" |
| **modelId** | The catalog model-id string on the agent row (e.g. `claude-opus-4-8`). | "model" (collides with `ResolvedModel.model`), "modelName" |
| **modelProvider** | The provider for the agent's model, a `ModelProvider` value. | "provider" alone (ambiguous with gateway provider) |
| **Harness** | The execution adapter; `harnessType` must match a registered `AdapterMeta.type`. | "worker type", "free-text harness", "runner" |
| **ModelCatalog** | The closed list of current selectable models (Claude IDs + metadata). | "model list", "dropdown options" |
| **ModelTier** | Global cost-posture bucket `reasoning\|workhorse\|fast`; now the system-default fallback only. | "per-agent tier" (it is no longer per-agent-authoritative) |
| **AdapterRegistry** | The `AdapterPool` of registered adapters; authority on selectable harnesses. | "worker pool" (UI-facing term is "Harness") |

Authoritative language: English. Schema columns: existing `users.harness_type` reused; **new** `users.model_id` + `users.model_provider` (architecture decides exact column names).

---

## Phase 4 — Contracts

**AgentModel**
- **Cardinality.** Each agent has at most one AgentModel pair. Zero is allowed only transiently pre-migration; steady state = exactly one (default-filled at creation).
- **Closure.** `modelProvider` is the closed `ModelProvider` union. `modelId` for `anthropic` is validated against the ModelCatalog (closed, code-owned); for `openai-compatible` it is deployer-supplied (open) — but AH2's picker scope is the Anthropic catalog.
- **Mutability.** Mutable by the founder via Settings → Agents. Replaced wholesale.
- **Identity.** The pair is the value; no separate ID.
- **Hard rule.** **The resolver MUST respect a per-agent model before any system-default tier fallback.** (Spec contract: "the resolver must respect it before falling back to any system default.")

**Harness**
- **Cardinality.** Each agent has exactly one `harnessType` (non-null in steady state).
- **Closure.** The selectable set is *open at runtime* (registry membership varies by host: `claude-code`, `builtin` always; `aider/goose/opencode` only if on PATH) but *closed at validation time* — the server rejects any `harnessType` not currently in the registry.
- **Mutability.** Mutable; re-validated against the live registry on every write.
- **Identity.** The `harnessType` string.
- **Hard rules.**
  - **Server-side validation against the live `AdapterRegistry` is mandatory** — UI constraint is not sufficient (spec contract). A save with a harness that has no registered adapter is rejected (HTTP 400/422).
  - **No free-text harness entry** anywhere (UI or API).
  - **No agent may be saved/created harness-less** — onboarding and team creation must assign a registered default.
  - **Cross-axis compatibility:** the chosen harness must support the chosen model's provider (`AdapterMeta.modelProviders` includes `modelProvider`, OR the adapter advertises no provider constraint, i.e. empty `modelProviders` = provider-agnostic like the CLI adapters). Validated server-side.

**ModelTier (demoted)**
- **Cardinality / closure / mutability.** Unchanged from X4.
- **Hard rule.** The tier table is **only** consulted when an agent has no per-agent model. It must never contradict a per-agent setting (it can't — per-agent wins). Settings → Models is relabeled as "system default models," not "the models."
- **Hard rule (catalog freshness).** `BUILT_IN_GATEWAY_CONFIG` and any default tier mapping MUST point at current catalog IDs (`claude-opus-4-8` / `claude-sonnet-4-6` / `claude-haiku-4-5`), never the stale `*-20250514` / `claude-haiku-3-5-*` strings.

**ModelCatalog**
- **Cardinality.** One global catalog, code-owned (in `@hyperidle/shared`).
- **Closure.** Closed; adding a model is a code change (mirrors `ModelProvider` being a closed union — A-TYPE rationale from X4). Catalog entries: `{ id, label, provider, contextWindow?, default?: tier-mapping }`.
- **Identity.** `id` is the API model-id string.
- **Hard rule.** Catalog IDs are the *exact* API strings from the `claude-api` skill — no date suffixes on aliases. Current set: `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5` (full id `claude-haiku-4-5-20251001`), `claude-fable-5`. All provider `anthropic`. Defaults: workhorse→`claude-sonnet-4-6`, reasoning→`claude-opus-4-8`, fast→`claude-haiku-4-5`. Per-agent creation default → `claude-sonnet-4-6` (workhorse-equivalent), harness default → `builtin` (always registered, supports all providers) **or** `claude-code` — architecture picks; `builtin` is the safer default because it supports all providers and has high concurrency.

---

## Phase 5 — Ground-truth doc updates required

1. **`plans/AH2/concept.md`** — this file (always).
2. **`docs/agent-layer/model-routing-and-cost.md`** — **§6 must be amended** (CRITICAL, Phase 6). Add a "Per-agent model overrides tier" subsection: agents MAY carry a concrete model; the tier remains the cost-posture/fallback mechanism. The opening sentence "Agents don't pick their own model" is rewritten.
3. No `canonical-shapes.md` exists under `docs/agent-layer/`; the ModelCatalog shape is documented in this concept + the architecture types. (If a shapes doc is desired later it lives in `@hyperidle/shared`.)

---

## Phase 6 — Self-critique

- **CRITICAL — concept-doc contradiction.** `docs/agent-layer/model-routing-and-cost.md` §6 opens "Agents don't pick their own model. The process layer assigns models based on the task's requirements, the agent's role, and the factory's current cost posture." AH2 directly reverses this for the per-agent axis. This is a genuine concept reshape, not a silent redefinition: the architecture step MUST update §6 so per-agent model is the primary axis and tier is the cost-posture/fallback. Flagged, not silently re-defined. Resolution: per-agent model is the *what*; tier remains the cost-posture downgrade lever (§6.3 unchanged) and the no-per-agent-model fallback. The two coexist — tier downgrade can still cap an over-expensive per-agent choice if cost-model wiring later opts in (out of scope here).
- **Rejection list distinctness.** AgentModel's rejections (tier / credential / ResolvedModel / free-text / provider-switch) are five genuinely distinct concepts, not flavors of one. Harness's (free-text / "any when null" / model / provider) are distinct. Good.
- **Contracts complete?** Cardinality, closure, mutability, identity, hard rules all specified for all four nouns. The one judgment call left to architecture: exact default harness (`builtin` vs `claude-code`) and exact column names. Both are noted as open with a recommended default — not hand-waved.
- **"null harness = any adapter" is the load-bearing bug.** The concept makes null an invalid steady state explicitly; the architecture must (a) migrate legacy null rows to a registered default and (b) change `select()`/provisioning so a configured-but-unregistered harness errors loudly instead of silently falling through to "any adapter." This is the spec's "no 'any adapter' fallback masking a missing harness" criterion.
- **Rationale concrete?** Yes — driven by the 2026-06-12 founder feedback (inert Assistant, two of the three root causes) and the carried realizations in TRACK-AH.md lines 14–16. Not generic.

**Concept LOCKED.** Downstream `/design` and `/architecture` explore inside these contracts.
