# X4 Concept Probe: Model Gateway

## Verdict: NOT a new domain primitive. Proceed.

The Model Gateway is infrastructure, not a domain concept. Here is the analysis:

### What IS a Model Gateway?

A resolution layer that maps `ModelTier` to concrete `{ provider, model, apiKey, baseUrl }` tuples. It replaces the hardcoded `MODEL_TIER_MAP` in `packages/server/src/harness/model-tier-map.ts` with a configurable lookup backed by `serverConfig`.

### Why it does NOT require /concept founder work

1. **No new user-facing noun.** Users never interact with "a gateway" as an entity. They configure model providers in Settings. The gateway is plumbing between the Settings UI and the harness adapter.

2. **The three-tier vocabulary is unchanged.** `ModelTier = "reasoning" | "workhorse" | "fast"` remains the only abstraction users and agents see. The gateway does not add tiers, rename tiers, or change what tiers mean.

3. **No lifecycle, no identity, no authority.** A domain primitive has an ID, a state machine, ownership semantics. The gateway has none of these. It is a pure function: `(ModelTier, config) => ResolvedModel`.

4. **No vocabulary collision.** "Gateway" is used in its standard infrastructure sense (a component that routes between internal abstraction and external service). It does not collide with any existing HyperIdle domain noun.

5. **No composition with other primitives.** The gateway is consumed by harness adapters. It does not appear in Bets, Tasks, Sessions, Threads, or Knowledge. It is invisible to the process layer.

### What it IS NOT

- NOT a proxy (it does not relay API calls)
- NOT a load balancer (no failover, no round-robin)
- NOT per-agent (tier-level configuration only in v1)
- NOT a new credential store (reuses existing `CredentialResolver`)
- NOT a model registry (no model catalog, no capability metadata)

### Upstream concepts already defined

- `ModelTier` (types.ts line 79) -- stable, unchanged
- `CredentialResolver` (credential-resolver.ts) -- reused as-is
- `SessionConfig` (harness-adapter.ts) -- extended with resolved model info
- `serverConfig` table (schema.ts line 663) -- extended with gateway config shape

### Conclusion

The Model Gateway is a configuration-to-resolution function with a Settings UI surface. It introduces no new domain primitives. The existing `ModelTier` type and `CredentialResolver` interface are sufficient upstream concepts. Proceed to /design and /architecture.
