# X4 Architecture Critique: Model Gateway

**Reviewer:** Phase 2 architecture critique  
**Artifact:** `plans/X4/architecture.md`  
**Spec:** `.pipeline/work-packages/TRACK-X.md` lines 132-169

---

## Dimension Scores

### 1. Spec fidelity — 7/10

The plan addresses most ACs. The AC checklist at the bottom is thorough. However:

**Finding A-SPEC-1 (blocking):** The spec AC says "the gateway formats requests to OpenRouter's API, passes the `X-Title` header, and handles OpenRouter-specific response fields." The architecture explicitly defers this to X6 ("This is a concern for X6 (Built-in Harness), not X4. The gateway only provides config"). This is a defensible scope reduction, but the plan should acknowledge this AC explicitly as "deferred to X6" rather than implicitly omitting it. The AC checklist at the bottom does NOT list this AC, which looks like an oversight rather than a deliberate deferral. The Known Gaps section (item 5) does mention it but only for response normalization, not for the X-Title header.

**Finding A-SPEC-2 (minor):** The spec says "Gateway configuration is stored in `factory_settings` (or equivalent DB table)". The plan correctly maps this to `serverConfig`, which is the successor to `factorySettings`. No issue, but the plan should note this mapping explicitly to avoid confusion for the builder.

**Finding A-SPEC-3 (minor):** The spec says "resolves a ModelTier + optional provider preference." The plan's `resolveModelTier(tier, config, resolver)` does not accept an "optional provider preference" -- it reads the provider from the config directly. This is correct behavior (the config IS the provider preference), but the function signature does not match the spec's phrasing exactly. The spec's "optional provider preference" is satisfied by the agent's `modelTierPreference` in the session provisioning flow, not by the gateway itself. No code change needed, but the plan should make this distinction explicit.

### 2. Layering — 9/10

The gateway is correctly placed in the server package (Meta Layer). Types are in shared. UI is in web. No cross-layer violations. The "resolution layer, not proxy" contract is well-stated and consistently applied.

The `SessionConfig` extension in shared is appropriate -- it is the boundary type between meta-layer and agent runtime.

No issues.

### 3. Type safety — 9/10

`ModelProvider` is a closed union. `ModelGatewayConfig` uses `Record<ModelTier, ModelTierConfig>` which ensures all three tiers are present. `ResolvedModel` has all fields readonly. No `any`, no unsafe casts.

**Finding A-TYPE-1 (minor):** The `ModelTierConfig` in Part 1 (shared types) does NOT include `apiKey`, but the `ModelTierConfigSchema` in Part 3 (server config) DOES include `apiKey: z.string().optional()`. This is a deliberate split: the shared type represents the clean domain model (no secrets), while the Zod schema includes the storage concern. However, this means the `ModelGatewayConfig` TypeScript type does not include `apiKey`, but the runtime data stored in serverConfig DOES include it. The builder needs to handle this gap -- when reading from serverConfig, the parsed data will have `apiKey` but the TypeScript type from shared won't. The plan should either (a) add `apiKey` to the shared type as optional, or (b) create a separate `StoredModelTierConfig` type that extends `ModelTierConfig` with `apiKey`. Option (a) is simpler and recommended.

### 4. Error model — 8/10

`MissingCredentialError` with provider + tier identification is well-specified. The Zod validation on PATCH returns 400 for invalid input. The fallback to `DEFAULT_GATEWAY_CONFIG` when no config exists is correct.

**Finding A-ERR-1 (minor):** The plan does not specify what happens when `resolveModelTier` is called with an `openai-compatible` provider but the config has no `apiKey` (the user configured OpenAI-compatible but forgot to enter a key in the Settings UI). The resolution logic (Part 2) says "API key comes from the tier config itself" but does not specify the error when it is missing. Presumably the same `MissingCredentialError` is thrown, but this should be explicit in the resolution logic.

**Finding A-ERR-2 (minor):** The plan does not specify what happens when `resolveModelTier` is called with an `openai-compatible` provider but `baseUrl` is missing. The PATCH endpoint validates that `baseUrl` is required for `openai-compatible`, but what if the stored config was written by an older version without this validation? Defensive check in `resolveModelTier` should throw a clear error.

### 5. Testability — 8/10

The test plan is adequate: unit tests for `resolveModelTier`, API endpoint tests (GET/PATCH), adapter update tests, UI tests. The test file inventory is explicit.

**Finding A-TEST-1 (minor):** The plan does not specify a test for the `apiKey` stripping on GET responses. This is a security-critical behavior and deserves an explicit test case: "GET /api/model-gateway with an openai-compatible provider that has an apiKey stored returns `***` instead of the actual key."

**Finding A-TEST-2 (minor):** No test specified for the DEFAULT_GATEWAY_CONFIG matching current MODEL_TIER_MAP values. The plan mentions this in Task 2's verification but does not specify HOW: does the test import both constants and assert equality? This should be a snapshot assertion or a direct comparison to catch drift.

### 6. Migration safety — 9/10

No DB schema migration required. The gateway config is stored as JSON in the existing `server_config.config` text column. The `modelGateway` field is optional in the Zod schema, so existing rows without it parse correctly and fall back to defaults. The `model-tier-map.ts` deletion (Task 6) happens last in the dependency chain.

The `resolvedModel` field on `SessionConfig` is optional, preserving backward compatibility.

No blocking issues.

### 7. Security — 7/10

API keys are stripped from GET responses (good). The credential resolver is reused for Anthropic and OpenRouter keys (good). Rate limiting exists on the API from the global middleware.

**Finding A-SEC-1 (blocking):** The plan says the PATCH endpoint accepts `apiKey` for `openai-compatible` providers. However, the plan does not specify rate limiting specific to the model-gateway endpoint. The global rate limiter (60 req/min) covers it, but credential mutation endpoints (PUT /api/credentials) have a dedicated `mutateLimiter` (20 req/min). The model-gateway PATCH endpoint effectively becomes a credential mutation endpoint when it stores API keys. It should have its own rate limiter OR the plan should explicitly state that the global rate limiter is sufficient and justify why.

**Finding A-SEC-2 (important, non-blocking):** The plan says `apiKey: "***"` is returned for present keys in GET responses. This leaks information about whether a key is set. A better approach is to return a boolean `hasApiKey: true/false` or omit the field entirely. The `***` string is a convention but it is also a common source of bugs (a UI might accidentally send `***` back to the server as the key value on PATCH). The plan should specify that the PATCH endpoint rejects `apiKey: "***"` or that the GET response uses a different field like `hasApiKey`.

**Finding A-SEC-3 (important, non-blocking):** The `openai-compatible` API key is stored as plain JSON in `serverConfig`. The plan acknowledges this as a known gap, which is acceptable for v1. However, the plan should also note that in shared mode, this key is readable by anyone with access to the `server_config` table. In local mode, the SQLite file has filesystem-level protection. This risk differentiation should be documented in the plan so the builder adds a `@lore` comment.

### 8. Performance — 9/10

The gateway is a pure function call (config lookup + credential resolve). No N+1 queries. The `readServerConfig` is a single-row read. The `updateServerConfig` does a read-then-write (two queries) which is acceptable for a settings endpoint.

No issues.

### 9. Implementability — 6/10

The plan is mostly implementable, but has two structural errors that would cause the builder to redesign on the fly.

**Finding A-IMP-1 (blocking):** The plan says (Part 5) that model resolution should happen in `sessions-routes.ts`:

```typescript
// In the session creation flow (sessions-routes.ts or provisioning orchestrator):
const serverCfg = await readServerConfig(db);
const resolvedModel = await resolveModelTier(
  body.modelTier,
  serverCfg.modelGateway,
  credentialResolver,
);
```

But `sessions-routes.ts` does NOT construct the `SessionConfig`. The `SessionConfig` is constructed inside `session-provisioning.ts` at line 442:

```typescript
harnessHandle = await harness.startSession({
  workspacePath,
  soulPromptPath: "",
  composedPrompt,
  modelTier,
  tools: allowedToolNames,
});
```

The plan says to add `resolvedModel` to `SessionConfig` and then the adapter uses it. But the adapter is called via `session-provisioning.ts`, not `sessions-routes.ts`. The `CredentialResolver` is available in `SessionRouteDeps` but not in `ProvisionSessionDeps`. The resolution logic must either:

(a) Happen inside `session-provisioning.ts`, which requires adding `credentialResolver` and `readServerConfig` access to `ProvisionSessionDeps`, or  
(b) Happen in `sessions-routes.ts` and pass the `ResolvedModel` into `provisionSession` via `ProvisionSessionParams`.

Option (b) is cleaner (keeps provisioning unaware of the gateway), but the plan does not specify this parameter addition to `ProvisionSessionParams`. Option (a) requires the plan to add `credentialResolver` to `ProvisionSessionDeps`.

The current plan says "sessions-routes.ts or provisioning orchestrator" but does not resolve which one, and does not address the parameter plumbing for either option. **The builder will need to make an architectural decision the plan should have made.**

Additionally, the current `sessions-routes.ts` hardcodes `const apiKey = await deps.credentialResolver?.resolve("anthropic_api_key")` at line 113 as a pre-flight check. With the gateway, this check needs to be provider-aware (different credential name per provider). The plan does not mention this pre-flight check update.

**Finding A-IMP-2 (important, non-blocking):** The plan says (Part 5) the adapter should have a legacy fallback path:

```typescript
if (config.resolvedModel) {
  // use resolved model
} else {
  // Legacy path: resolve from tier map + credential resolver
  model = resolveModel(config.modelTier);
}
```

But Task 6 deletes `model-tier-map.ts` (which exports `resolveModel`). After Task 6, the legacy fallback path would be dead code with a broken import. The plan should either (a) delete the fallback in Task 6, or (b) inline the default resolution logic. The task ordering implies the fallback is temporary (Tasks 4 before Task 6), but the plan should make it explicit that Task 6 removes the fallback path.

**Finding A-IMP-3 (minor):** The plan's file inventory says `Modify: packages/server/src/routes/sessions-routes.ts` but does not specify WHAT to modify. Given A-IMP-1, this is either adding `resolvedModel` computation before `provisionSession()` and updating the pre-flight check, OR it's a no-op if resolution happens inside `session-provisioning.ts`. The builder cannot follow this instruction without redesigning.

**Finding A-IMP-4 (minor):** The dependency graph shows `Task 6 (delete model-tier-map)` depending on `Task 4 (SessionConfig + adapter)`. But Task 6 also needs Task 3 (API endpoints) and Task 5 (Settings UI) to be done, because once the old file is deleted, there is no way to configure models except through the new gateway. The dependency should be: Task 6 depends on Tasks 3, 4, AND 5. Otherwise the system has no model configuration surface for the window between Task 4 and Task 5.

Actually, re-reading: the `DEFAULT_GATEWAY_CONFIG` (Task 2) provides the same defaults as the old `MODEL_TIER_MAP`, so the system works without the UI. The dependency graph is technically correct but fragile.

---

## Summary

| Dimension | Score |
|---|---|
| Spec fidelity | 7 |
| Layering | 9 |
| Type safety | 9 |
| Error model | 8 |
| Testability | 8 |
| Migration safety | 9 |
| Security | 7 |
| Performance | 9 |
| Implementability | 6 |
| **Average** | **8.0** |

**Verdict: PASS (8.0 >= 7.0)**

## Blocking Findings

1. **A-IMP-1:** The plan places model resolution in `sessions-routes.ts` but `SessionConfig` is constructed inside `session-provisioning.ts`. The plan must specify which module resolves the model AND provide the parameter plumbing. Additionally, the hardcoded `anthropic_api_key` pre-flight check in `sessions-routes.ts` line 113 must become provider-aware. **Recommended resolution:** Add `resolvedModel` to `ProvisionSessionParams` (optional). Compute `resolvedModel` in `sessions-routes.ts` (where `credentialResolver` is available). Pass it through to `session-provisioning.ts`. Update the pre-flight check to use the gateway's error (remove the hardcoded `anthropic_api_key` check, let `resolveModelTier` throw `MissingCredentialError` instead).

2. **A-SPEC-1:** The AC about OpenRouter X-Title header and request formatting is not covered and not explicitly deferred. The plan should add this to the Known Gaps section with explicit text: "AC 'gateway formats requests to OpenRouter's API, passes the X-Title header' is deferred to X6 -- the gateway resolves config, it does not format requests."

3. **A-SEC-1:** The PATCH endpoint stores API keys but has no dedicated rate limiter. Either add one or explicitly justify using the global rate limiter.

## Important Non-Blocking Findings

4. **A-TYPE-1:** `ModelTierConfig` (shared type) and `ModelTierConfigSchema` (Zod schema) disagree on `apiKey`. Add `apiKey?: string` to the shared type or create a `StoredModelTierConfig`.

5. **A-SEC-2:** GET response uses `apiKey: "***"` which can be accidentally sent back on PATCH. Consider `hasApiKey: boolean` or rejecting `***` on PATCH.

6. **A-IMP-2:** The legacy fallback path in the adapter references `resolveModel()` from `model-tier-map.ts`, which Task 6 deletes. Task 6 must also remove the fallback path.

7. **A-ERR-1:** Missing error specification for `openai-compatible` with no `apiKey`.

8. **A-ERR-2:** Missing defensive check in `resolveModelTier` for `openai-compatible` with no `baseUrl`.

## Minor Findings

9. **A-TEST-1:** Add explicit test for `apiKey` stripping on GET.
10. **A-TEST-2:** Add test asserting `DEFAULT_GATEWAY_CONFIG` matches `MODEL_TIER_MAP`.
11. **A-SEC-3:** Document the risk differentiation between local mode (filesystem protection) and shared mode (DB access) for `openai-compatible` API keys.
12. **A-IMP-3:** Clarify what changes in `sessions-routes.ts`.
13. **A-IMP-4:** Task 6 dependency graph should include Task 5 for completeness, even though defaults cover the gap.
14. **A-SPEC-2:** Note the `factory_settings` to `serverConfig` mapping explicitly.
15. **A-SPEC-3:** Clarify that "optional provider preference" is satisfied by the agent's `modelTierPreference`, not the gateway function signature.
