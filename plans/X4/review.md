# X4 Code Review: Model Gateway

**Reviewer:** Phase 4 code review (6 lenses + AC audit)
**Commit:** 995acabf
**Spec:** TRACK-X.md lines 132-169
**Architecture:** plans/X4/architecture.md
**Design:** plans/X4/design/approved.md

---

## AC Completeness

| # | AC | Verdict | Evidence |
|---|---|---|---|
| 1 | Settings UI allows provider per model tier | PASS | `SettingsModels.tsx` renders 3 tier rows with provider dropdown each; stories cover states |
| 2 | Gateway resolves ModelTier to { provider, model, apiKey, baseUrl } | PASS | `resolveModelTier()` in `services/model-gateway.ts` returns `ResolvedModel` with all four fields; tested for all 3 providers |
| 3 | Built-in harness (X6) uses gateway (resolvedModel on SessionConfig) | PASS | `SessionConfig.resolvedModel` added in `harness-adapter.ts`; `claude-agent-sdk-adapter.ts` consumes it at line 93 |
| 4 | External harnesses receive resolved model in session config | PASS | `resolvedModel` on `SessionConfig` (shared type); plumbed through `ProvisionSessionParams` at line 459 of `session-provisioning.ts` |
| 5 | OpenRouter supported as provider | PASS | `resolveModelTier` handles `"openrouter"` case (lines 70-83); tested in `X4-model-gateway.test.ts` |
| 6 | Direct Anthropic and OpenAI-compatible supported | PASS | All 3 provider branches in `resolveModelTier`; tests cover all 3 |
| 7 | Config stored in serverConfig, editable via Settings UI | PASS | `modelGateway` key in `ServerConfigSchema`; GET/PATCH `/api/model-gateway`; `SettingsModels.tsx` auto-saves |
| 8 | model-tier-map.ts replaced by gateway | PASS | File deleted; `BUILT_IN_GATEWAY_CONFIG` provides the same model IDs; no remaining imports |
| 9 | Fallback to Anthropic direct when no config | PASS | `BUILT_IN_GATEWAY_CONFIG` matches old `MODEL_TIER_MAP`; `readServerConfig` returns defaults when no row exists; tested |
| 10 | Clear error on invalid API key | PASS | `MissingCredentialError` thrown with provider + tier context in all 3 branches; tested |

**AC Verdict: ALL 10 PASS**

---

## Phase 2 Finding Resolution

| Finding | Status | How Addressed |
|---|---|---|
| A-IMP-1 (blocking): Model resolution placement + pre-flight check | ADDRESSED | Resolution happens in `sessions-routes.ts` lines 124-144. `resolvedModel` added to `ProvisionSessionParams` (line 189). Old hardcoded `anthropic_api_key` pre-flight replaced by gateway-aware `resolveModelTier`. |
| A-SEC-1 (blocking): PATCH rate limiting | ADDRESSED | `@lore` in `server-config.ts` lines 57-59 documents the global limiter as sufficient with justification. Acceptable for v1. |
| A-SEC-2 (important): hasApiKey boolean instead of "***" | ADDRESSED | `stripApiKey()` in `model-gateway.ts` route returns `hasApiKey: boolean`, not `"***"`. Tests verify `apiKey` is `undefined` in response. |
| A-TYPE-1 (minor): apiKey on shared ModelTierConfig | ADDRESSED | `apiKey?: string` added to shared type with `@lore` comment explaining the trade-off (lines 29-52 of `model-gateway.ts`). |
| A-IMP-2 (important): Legacy fallback after model-tier-map.ts deleted | ADDRESSED | Adapter inlines a `tierModelMap` constant (lines 110-115 of `claude-agent-sdk-adapter.ts`) instead of importing deleted module. Fallback is self-contained. |
| A-ERR-1 (minor): openai-compatible missing apiKey | ADDRESSED | Explicit `MissingCredentialError` at line 92 of `services/model-gateway.ts`. Tested. |
| A-ERR-2 (minor): openai-compatible missing baseUrl | ADDRESSED | Explicit `throw new Error(...)` at line 89. Tested. |
| A-SPEC-1 (blocking): OpenRouter X-Title header deferral | ADDRESSED | `@lore` in `routes/model-gateway.ts` lines 13-16 explicitly defers to X6. |
| F-ERR-1 (blocking): No dead link to Credentials | ADDRESSED | No navigation link to Credentials section. Status dot + label only. `@lore` at line 14 of `SettingsModels.tsx`. |

---

## Lens 1: Architecture

The 3-layer structure is respected. Types in `@hyperidle/shared`, service logic in `packages/server/src/services/`, routes in `packages/server/src/routes/`, UI in `packages/web/src/settings/`. No cross-layer violations. `SessionConfig` (the boundary type) correctly carries `resolvedModel` as optional for backward compatibility. The gateway is a pure resolution function with no state -- matches the "resolution layer, not proxy" contract.

Route registration in `app.ts` follows the existing pattern (line 378). The `createModelGatewayRoutes` factory takes `db` only, consistent with other settings routes.

No findings.

## Lens 2: Design

The implementation deviates from the approved design in one significant way:

**FINDING 1 — IMPORTANT: Collapsible tier rows replaced with always-expanded flat layout.**
The approved design specifies "Each tier row has two states: Collapsed state (default) / Expanded state" with chevron toggle, Enter/Space keyboard toggle, and Escape to collapse. The implementation renders all 3 tiers as always-expanded cards with no collapse/expand mechanism. No `aria-expanded`, no `aria-controls`, no disclosure pattern. The keyboard navigation spec (Tab between collapsed rows, Enter/Space to toggle, Escape to collapse) is not implemented.

This is a design simplification that removes interaction complexity. The flat layout is arguably better for a 3-item configuration surface (nothing is hidden, all fields immediately scannable). However, it diverges from the approved design without explicit justification.

Files: `packages/web/src/settings/SettingsModels.tsx` (entire component)

**FINDING 2 — MINOR: Credential status reduced from 3 states to 2.**
The approved design specifies 3 credential states: green/"Valid", yellow/"Present", gray/"Not set". The implementation has 2 states: `bg-success`/"Credential set" vs `bg-warning`/"No credential". The "valid vs present" distinction is lost because the API only returns `hasApiKey: boolean`, not credential validation status. This is acceptable since credential validation is deferred, but the color mapping differs from the design (gray/"Not set" became `bg-warning`/"No credential").

File: `packages/web/src/settings/SettingsModels.tsx` line 173

**FINDING 3 — MINOR: Missing ARIA attributes.**
The design critique (F-A11Y-1) noted that the disclosure pattern needs `aria-expanded`, `aria-controls`, and `aria-label` on status dots. Since the collapse/expand was removed, `aria-expanded`/`aria-controls` are moot, but the credential status dots still lack `aria-label` -- they use `title` attribute only (line 174). Title attributes are not consistently announced by screen readers. The provider and model selects have redundant `aria-label` on top of `htmlFor`/`id` binding -- the `aria-label` should be removed (the `<label>` is sufficient).

File: `packages/web/src/settings/SettingsModels.tsx` lines 127, 149, 165, 174

## Lens 3: Security

**FINDING 4 — IMPORTANT: PATCH endpoint does not validate that `baseUrl` is required for `openai-compatible` providers.**
The `PatchModelGatewaySchema` refinement (lines 43-56 of `routes/model-gateway.ts`) only checks that `apiKey` is not allowed for non-openai-compatible providers. It does NOT enforce that `baseUrl` is present when `provider` is `"openai-compatible"`. The comment at line 39 claims "baseUrl is required when provider is openai-compatible" but the code does not implement this check. A user can PATCH an openai-compatible tier with no `baseUrl`, which will succeed (Zod's `baseUrl: z.string().url().optional()` allows omission). The error will only surface at session start when `resolveModelTier` throws at line 87 of `services/model-gateway.ts`.

The defensive check in `resolveModelTier` catches this at runtime, so it is not a security vulnerability -- it is a validation gap that produces a confusing UX (config saves successfully, then sessions fail with an opaque error about missing baseUrl).

File: `packages/server/src/routes/model-gateway.ts` lines 43-56

**API key stripping**: properly implemented via `stripApiKey()`. GET and PATCH responses both strip apiKey and return `hasApiKey: boolean`. Tests verify this behavior. No information leakage.

**Rate limiting**: Global rate limiter covers the PATCH endpoint. Documented with `@lore` justification. Acceptable.

No injection risks identified. Input validation via Zod schemas is consistent with existing patterns.

## Lens 4: Adversarial

**FINDING 5 — IMPORTANT: Adapter legacy fallback duplicates model IDs without a single source of truth.**
The `claude-agent-sdk-adapter.ts` (lines 110-115) inlines a `tierModelMap` constant with the same model IDs as `BUILT_IN_GATEWAY_CONFIG`. These two maps can drift independently -- if someone updates `BUILT_IN_GATEWAY_CONFIG` they must also update the adapter's inline map. The adapter test at lines 164-178 of `claude-agent-sdk-adapter.test.ts` asserts on the `KNOWN_MODELS` constant (defined in the test file), which is a third copy of the same data. There is no test that asserts these three copies are equal.

This is the classic "multiple sources of truth" problem. The adapter should import `BUILT_IN_GATEWAY_CONFIG` from `../services/model-gateway.js` and derive its fallback from it.

Files:
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` lines 110-115
- `packages/server/src/harness/__tests__/claude-agent-sdk-adapter.test.ts` lines 9-13

**FINDING 6 — IMPORTANT: No test coverage for the `resolvedModel` path in the adapter.**
The adapter test file mentions `resolvedModel` only in comments (lines 160-163) but never constructs a `SessionConfig` with `resolvedModel` set and verifies that the adapter uses its `model` and `apiKey` fields. The entire `resolvedModel` branch (lines 93-96 of `claude-agent-sdk-adapter.ts`) is untested. This is the primary production path -- sessions going through the gateway will always provide `resolvedModel`.

File: `packages/server/src/harness/__tests__/claude-agent-sdk-adapter.test.ts`

**FINDING 7 — MINOR: `as never` cast on line 104 of `routes/model-gateway.ts`.**
`c.req.valid("json" as never) as ModelGatewayConfig` uses two unsafe casts. The `as never` is a workaround for Hono's generic validator typing. This pattern exists in other routes (`sessions-routes.ts` line 111) so it is consistent, but it silences type errors if the schema and the cast type diverge.

File: `packages/server/src/routes/model-gateway.ts` line 104

**FINDING 8 — MINOR: `saveConfig` is triggered inside `setEditState` callback, which creates a closure over stale state.**
In `SettingsModels.tsx` lines 324-344, the `handleChange` function calls `setEditState` with a callback that captures `saveConfig` via the `useCallback` dependency. Inside the `setEditState` callback, it sets a timer that calls `saveConfig(updated)` where `updated` is the new state. This works because `updated` is computed from `prev` (the React-provided previous state), so the data is fresh. However, `saveConfig` itself is captured from the outer closure and depends on `showToast` -- if `showToast` identity changes between the state update and the timer firing, the saved closure will use the old `showToast`. In practice `showToast` is stable (from context), so this is not a bug, but the pattern is fragile.

File: `packages/web/src/settings/SettingsModels.tsx` lines 324-344

## Lens 5: Simplification

**FINDING 9 — MINOR: `responseToEditState` helper manually maps each tier.**
The `responseToEditState` function (lines 68-89 of `SettingsModels.tsx`) manually creates `reasoning`, `workhorse`, `fast` entries with identical transformation logic. This could be a `Object.fromEntries(ALL_TIERS.map(...))` one-liner, matching how `saveConfig` already builds the PATCH body (lines 282-295). The manual expansion is not wrong, but it adds 20 lines that must be updated if a tier is added.

File: `packages/web/src/settings/SettingsModels.tsx` lines 68-89

**FINDING 10 — MINOR: Storybook stories use `require()` and global `fetch` mutation.**
The stories file (`SettingsModels.stories.tsx`) patches `globalThis.fetch` and uses `require()` for dynamic import. This is a test utility pattern, not a production concern, but the `require()` call defeats tree-shaking analysis and the global fetch mutation can leak between stories if they run in the same process.

File: `packages/web/src/settings/SettingsModels.stories.tsx`

## Lens 6: AI Slop

**No significant slop detected.** The code is concise. Comments explain "why" not "what". `@lore` annotations are well-placed and reference specific architecture critique findings by ID. No verbose naming, no unnecessary abstractions, no defensive over-engineering. The `BUILT_IN_GATEWAY_CONFIG` naming (with `@lore` explaining the ESLint mock-data-policy constraint) is justified.

One minor note: the `// hearth-internal-padding` directive at line 25 of `SettingsModels.tsx` appears to be a lint directive, not a comment -- this is consistent with other component files.

---

## Findings Summary

| # | Severity | Finding |
|---|---|---|
| 1 | IMPORTANT | Collapsible tier rows replaced with always-expanded flat layout; deviates from approved design |
| 2 | MINOR | Credential status reduced from 3 states to 2; color mapping differs from design |
| 3 | MINOR | Missing `aria-label` on credential status dots; redundant `aria-label` on labeled inputs |
| 4 | IMPORTANT | PATCH does not validate `baseUrl` required for openai-compatible; comment claims it does |
| 5 | IMPORTANT | Adapter legacy fallback duplicates model IDs; three independent copies can drift |
| 6 | IMPORTANT | No test for `resolvedModel` path in adapter -- the primary production path is untested |
| 7 | MINOR | `as never` + `as ModelGatewayConfig` double cast on PATCH body |
| 8 | MINOR | `saveConfig` closure captured inside `setEditState` callback is fragile |
| 9 | MINOR | `responseToEditState` manually expands tiers instead of mapping |
| 10 | MINOR | Stories use `require()` and global fetch mutation |

---

## Verdict: PASS

All 10 ACs are met. All Phase 2 blocking findings are addressed. No BLOCKING findings in the implementation.

Four IMPORTANT findings should be addressed before merge:
- Finding 4 (baseUrl validation gap) is a confusing UX gap but has a runtime safety net.
- Finding 5 (duplicated model IDs) is a maintenance hazard.
- Finding 6 (untested resolvedModel path) is a test coverage gap on the primary production path.
- Finding 1 (design deviation) is a conscious simplification but should be documented.
