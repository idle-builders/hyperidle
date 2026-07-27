# model-gateway — Product Re-Architecture (AU20, BOTH lenses)

**Layer:** core-api · **Owned tables:** 0 · **Current surface:** 4 exports (2 methods, 2 types) ·
**Depends on:** `connections` (credential lookup, DI port)

**Verdict up front:** this service was already collapsed to its coherent floor in AU20 Increment Ab1.
The re-architecture below re-derives it INSIDE-OUT from substrate (the lens the first pass skipped)
and confirms the floor is **1 method + 2 types**. Nothing more is justified; nothing is lossy.

---

## 1. INSIDE-OUT — substrate, floor, owned capabilities

### Substrate: EXTERNAL-API adapter (over LLM providers)

model-gateway owns **zero tables** and runs **no persistent state**. It is an *adapter* over the set
of LLM providers the product can talk to — `anthropic`, `openrouter`, `openai-compatible`. Its job is
the one thing every one of those backends needs before it can be called: turn an *abstract* model
request (a tier, or a per-agent override) into a *concrete, credentialed* selection
`{ provider, model, apiKey, baseUrl }`.

It is NOT substrate (c) arbitrary internal logic. It is substrate (b): a provider adapter. The
"algorithm" inside it is entirely dictated by the external capability — each provider has its own
credential name (`anthropic_api_key` / `openrouter_api_key` / `openai_compatible_api_key`), its own
base URL, and its own eligibility for the per-agent path (`openai-compatible` is rejected there). That
per-provider knowledge is the adapter's whole reason to exist.

### The FLOOR: one unified resolve op — **1 method**

The minimal coherent adapter surface over N LLM backends is **ONE unified operation**, not one method
per backend and not the union of every provider's call:

```
resolve(request) → ResolvedModel     // { provider, model, apiKey, baseUrl }
```

The provider fan-out (`anthropic` | `openrouter` | `openai-compatible`) lives **inside** one internal
`resolveProvider` switch — adding a 4th provider is one switch arm, never a new export. This is the
frame's "unified HarnessAdapter" shape applied to model selection: the backends differ, the product
op does not. **Floor = 1.**

### Genuine owned capabilities beyond the floor: NONE

Everything the service genuinely owns is *policy folded into the single resolve op*, not a separate
method:

- **tier → provider/model/baseUrl** application (reads injected config, never owns it).
- **per-agent override → tier fallback** (a per-agent request with `modelId === null` *is* a tier
  request — already one operation with a discriminated input).
- **provider → credential-name** mapping + the **agent-path eligibility** rule (`openai-compatible`
  rejected on the agent path).

None of these is a demand-bearing standalone capability. There is no "list tiers" (config is owned by
`settings`, tiers are a fixed 3-value enum in `@hyperidle/shared`), no "validate config" (owned by the
`settings`/`model-gateway` HTTP route, a different service), no write path (zero tables). So the
product lands **exactly at the floor: 1 method.**

---

## 2. OUTSIDE-IN — real consumer demand

Four live call sites, three packages, and every one already constructs a request and calls the single
resolver:

| Consumer | What it asks for | Request it builds |
|---|---|---|
| `core-api/server-factory.ts` (dispatcher wiring) | resolve a tier at boot | `{ kind:"tier", tier }` |
| `core-api/services/dispatch-bindings.ts` | resolve per-agent + resolve tier | `{ kind:"agent", … }` / `{ kind:"tier", tier }` |
| `eval/runner.ts` (offline harness) | resolve `workhorse` offline | `{ kind:"tier", tier:"workhorse" }` |
| `run-orchestration/agent-layer-boot.ts` | resolve a tier for a spawned agent | `{ kind:"tier", tier }` |

The service-data demand (`resolve`, `resolveAgentModel`, `resolveModelTier`) is **three names for one
capability**: "resolve a model request." `resolveAgentModel` already delegated to the tier path on the
null-`modelId` branch. The outside-in demand is therefore a single parameterized resolver keyed on a
discriminated request — never a method per caller. (Note: `dispatch`'s `ports.ts` still carries a
`resolveModelTier` mirror + `AgentModelParams` mirror — those are *consumer-side* structural mirrors
of the old shape; they are dispatch's to retire, not part of model-gateway's product surface.)

---

## 3. THE COHERENT PRODUCT API — 1 interface

```ts
// The one product operation. Adapter over all LLM providers, unified.
export async function resolveModel(
  request: ModelRequest,
  config: ModelGatewayConfig,               // owned by `settings`, injected
  credentialResolver: ModelGatewayCredentialResolver,  // DI port → connections
): Promise<ResolvedModel>;                   // ResolvedModel lives in @hyperidle/shared

// The discriminated request — fuses tier + per-agent demand into one spec.
export type ModelRequest =
  | { readonly kind: "tier";  readonly tier: ModelTier }
  | { readonly kind: "agent"; readonly modelId: string | null;
      readonly modelProvider: string | null; readonly tierFallback: string };

// DI port for the one outbound edge (connections' credential lookup).
export interface ModelGatewayCredentialResolver {
  resolve(name: CredentialName): Promise<string | null>;
}

// Error surfaced when a per-agent request names a provider the agent path forbids.
export class UnsupportedAgentProviderError extends Error { … }
```

| Interface | Lens | Sourced from |
|---|---|---|
| `resolveModel(request, config, resolver)` | **both** | Inside-out: the single unified adapter op over LLM providers (the floor). Outside-in: serves 100% of the `resolve`/`resolveAgentModel`/`resolveModelTier` demand via one discriminated request. |
| `ModelRequest` (type) | both | The general spec that parameterizes intent (tier vs per-agent) — no method per intent. |
| `ModelGatewayCredentialResolver` (type) | inside-out | DI port for the one owned outbound edge (`model-gateway → connections`). |
| `UnsupportedAgentProviderError` (value/error) | inside-out | The adapter's owned agent-path eligibility policy, surfaced as a typed error. |

**Composability / evolvability proof (inside-out):**
- new provider → one arm in the internal `resolveProvider` switch, zero new exports.
- new request kind (e.g. a future `{ kind:"session", … }`) → one branch in `resolveModel`, zero new
  exports.
- new tier → a value in `@hyperidle/shared`'s `ModelTier`, zero change here.

**Completeness proof (not lossy — every real feature still deliverable):** tier resolution (dispatcher
boot, eval, agent-layer boot), per-agent model override (dispatch), tier fallback when an agent has no
pinned model, all three providers with correct credential + baseUrl, and the agent-path provider
restriction — all reachable through the single `resolveModel(request)`. No current user-facing feature
loses a path.

---

## 4. TARGET NUMBERS

| | Current | Target | Floor |
|---|---|---|---|
| Methods | 2 | **1** | 1 (single unified adapter resolve op) |
| Types | 2 | **2** | — (`ModelRequest` spec + `ModelGatewayCredentialResolver` port) |

**targetMethods = 1** = floor (1) + 0 justified extras. `resolveModel` is the whole product.
**targetTypes = 2** = `ModelRequest` (the discriminated spec that keeps it 1 method) +
`ModelGatewayCredentialResolver` (the one DI port). `UnsupportedAgentProviderError` is an owned
error *value*, not counted in the type floor; `ResolvedModel` / `ModelTier` / `ModelProvider` /
`ModelGatewayConfig` / `CredentialName` are all `@hyperidle/shared`'s, not owned here.

### What gets DELETED (not internalized)

Already executed in AU20 Increment Ab1 and confirmed correct by this inside-out pass:

- **`resolveModelTier` + `resolveAgentModel` → deleted**, replaced by the single `resolveModel(request)`
  (they were one op with a discriminated input; `resolveAgentModel` already delegated to the tier path).
- **`AgentModelParams` type → deleted**, folded into `ModelRequest`'s `agent` branch.
- **`BUILT_IN_GATEWAY_CONFIG` re-export → deleted** — it is `@hyperidle/shared`'s constant; consumers
  (dispatch) import it from shared directly. model-gateway is not a pass-through for shared's data.

Downstream cleanup (dispatch-owned, not this service's surface): `dispatch/src/ports.ts` should retire
its `resolveModelTier`/`AgentModelParams` mirror in favor of the `ModelRequest` shape — a consumer
migration, tracked separately.

**Net:** the service is at its substrate-appropriate floor. It is neither bloated (1 method, no
keep-just-in-case) nor lossy (every real feature reachable). MVP-coherent and cheap to evolve.
