# model-gateway — Service-as-Product Audit (AU20)

**Layer:** core-api · **Owned tables:** none · **Current public exports:** 6

## 1. Existence / Consolidation verdict — STANDALONE

model-gateway answers exactly one question: *"given a model request (an abstract tier, or a
per-agent override with a tier fallback) + the gateway config + a credential resolver, what
concrete `{provider, model, apiKey, baseUrl}` should be used?"* It is a pure, stateless, zero-table
function service. Its product is **model resolution**: the single place that turns abstract
tier/agent-override semantics into a concrete, credentialed provider selection.

**It is an infra/platform primitive — its customers are other services, not end users:**
- `dispatch` (agent-orchestration) — `resolveAgentModel` + `resolveModelTier` at spawn time.
- `packages/core-api/src/server-factory.ts` — `resolveModelTier` at boot wiring.
- `packages/eval/src/runner.ts` — `resolveModelTier` in the offline eval harness.

**Candidate-cluster hypothesis (dissolve into `dispatch`/agent-selection) — REJECTED.** The steer
is grounded on "smallest service, 1 consumer." That is wrong on the demand signal: model resolution
has **three independent consumers across three packages**, and two of them — the `eval` harness and
`core-api` boot — are NOT dispatch and must never depend on it. Dissolving model-gateway into
dispatch would force the eval harness (a lean offline package) to import the entire dispatch bundle
(task dispatch, assistant dispatch, routine scheduling, builtin handlers, and its DB-side
tool-handlers sibling) purely to resolve `fast → concrete model`. That is a coupling regression, not
a consolidation. model-gateway earns its boundary the correct way — not by owning a table (it owns
none) but by being **the one dependency-light primitive shared across the live and offline execution
paths**. Its only outbound edge is a single DI port (`connections`' credential lookup). Keeping it
standalone also keeps `connections` free of model-tier semantics and keeps `dispatch` free of being
eval's transitive dependency. **STANDALONE.**

## 2. Deliberate target public API — 6 → 4 exports

The current surface exposes two near-identical resolution entry points plus a pass-through re-export
of a constant that actually lives in `@hyperidle/shared`. Collapse to one intent-parameterized
resolver.

| # | Target export | Shape | Replaces |
|---|---|---|---|
| 1 | `resolveModel` | `(request: ModelRequest, config, resolver) => Promise<ResolvedModel>` | `resolveModelTier`, `resolveAgentModel` |
| 2 | `ModelRequest` | `{ kind:"tier"; tier } \| { kind:"agent"; modelId; modelProvider; tierFallback }` | `AgentModelParams` (folded into the agent branch) |
| 3 | `UnsupportedAgentProviderError` | error class | unchanged |
| 4 | `ModelGatewayCredentialResolver` | DI port `{ resolve(name): Promise<string\|null> }` | unchanged |

**Dropped:** `BUILT_IN_GATEWAY_CONFIG` — a re-export of a pure static constant that already lives in
`@hyperidle/shared` (moved there in AU19 Increment 1f). model-gateway re-exports it only for
import-site stability. Its real consumer (dispatch's `agent-work-assistant.ts`) should import the
config from `@hyperidle/shared` directly; model-gateway is not a pass-through for shared's data. This
removes a fake export from the surface.

**Why `resolveModel` is the meaningful shared capability:** `resolveAgentModel` already *calls*
`resolveModelTier` internally as its fallback — the two are one operation with a discriminated input,
not two capabilities. A per-agent request with `modelId === null` **is** a tier request. Unifying
them into `resolveModel(request)` exposes the true primitive ("resolve a model request") and lets the
agent-vs-tier distinction live entirely in data, where callers already assemble it.

## 3. Inside lens — how it stays clean

Pure function, zero state, zero tables. Two orthogonal seams already exist and are preserved: the
config is injected as a plain parameter (owned by `settings`, never read here), and credentials come
through the `ModelGatewayCredentialResolver` DI port (satisfied by `connections`' concrete resolvers).
All provider-specific logic stays funneled through the single internal `resolveProvider` switch keyed
on `ModelProvider`. A new provider = one switch arm. A new request kind = one branch in `resolveModel`.
Provider-capability policy (e.g. openai-compatible is rejected on the agent path) stays centralized in
`resolveProvider`, not scattered across entry points.

## 4. Scaling argument — sub-linear

The parameterized `resolveModel(request)` absorbs new occasions without new methods:
- *"resolve a model for a background routine at the `batch` tier"* → `resolveModel({kind:"tier",
  tier:"batch"})` — no new export.
- *"resolve for a new offline eval scenario"* → `resolveModel({kind:"tier", tier:"fast"})` — the eval
  harness composes, no new export.
- *"per-agent override that also permits a new provider"* → one arm in `resolveProvider`, still one
  entry point.

The method-per-intent alternative (`resolveModelTier`, `resolveAgentModel`, `resolveModelForRoutine`,
`resolveModelForEval`, `resolveModelForAssistant`…) grows one export per consumer — linear in call
sites. `resolveModel(request)` grows zero. Add dozens of services and hundreds of calls: they all
route through the same single resolver, parameterized by a request they already construct from their
own data. This passes the scaling test.

## 5. Key collapses

- **Two resolvers → one.** `resolveModelTier` + `resolveAgentModel` collapse into
  `resolveModel(request)`; the agent/tier split becomes a discriminated `ModelRequest`, matching the
  fact that `resolveAgentModel` already delegates to the tier path.
- **`AgentModelParams` folded** into `ModelRequest`'s agent branch — callers construct one request
  object instead of naming a separate params type.
- **`BUILT_IN_GATEWAY_CONFIG` re-export dropped** — the constant lives in `@hyperidle/shared`;
  consumers import it there instead of treating model-gateway as a shared pass-through.
- **Net: 6 → 4 exports**, and the two "methods" the three consumers actually request become one
  general interface.
