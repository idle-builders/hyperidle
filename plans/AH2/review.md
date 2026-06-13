# AH2 Code Review — Per-agent model and a harness that actually selects

**Branch:** `feat/AH2-per-agent-model-harness` · **Reviewed against:** `origin/main...HEAD`

---

## ROUND 2 (re-review after fixes) — 2026-06-13

### Verdict: DONE

All four round-1 findings RESOLVED; no regression introduced; no new findings.

**Gates (re-run round 2):** `npm run check` PASS (12 pkgs, 0 errors) · `npm run lint` PASS (exit 0; warnings only, all pre-existing categories) · AH2 tests 102 green (55 unit/component + 47 integration) · X3/X4 regression suites 37 green.

| Finding | Status | Evidence |
|---|---|---|
| **H-1** auth boundary | **RESOLVED** | `harnesses.ts` now only `requireBoundary({ kind: "public-data" })` — in-route `X-API-Key`/`constantTimeStringEqual`/`process.env` block deleted; `@lore` records why. New regression test `AH2-harnesses.integration.test.ts` "200 with valid Bearer token (no X-API-Key sent)" runs with `sharedMode:true` + a real `createLoginSession` token and asserts 200 — would 401 if the in-route check returned. Auth still enforced: "401 without auth" and new "401 with invalid Bearer token" both green (global middleware rejects). Not opened up. |
| **H-2** migration backfill | **RESOLVED** | `0032_wild_nova.sql` now has TWO updates: (1) `harness_type='builtin' WHERE agent_category IS NOT NULL AND harness_type IS NULL`; (2) tier-aware model backfill `WHERE agent_category IS NOT NULL` (no harness_type restriction — claude-code now included). Tier map opus-4-8/sonnet-4-6/haiku-4-5, default sonnet-4-6, provider anthropic. Human rows (`agent_category IS NULL`) untouched. Invariant holds: every migrated AI row → non-null registered harness + non-null catalog model. With harness_type now non-null on every AI row, provisioning's `if (agent.harnessType)` guard is always true → `NoEligibleHarnessError` path active, any-adapter fallback hole closed for legacy rows. Drizzle journal idx 32 + `0032_snapshot.json` carry the new `model_id`/`model_provider` columns; snapshot consistent. |
| **M-1** migration test | **RESOLVED** | `AH2-migration.integration.test.ts` — 10 tests (exceeds the planned 9). Asserts the REAL invariant via `isCatalogModel()`/`REGISTERED_HARNESSES`, not weakened to a buggy migration. Covers both H-2 gaps explicitly: dedicated "claude-code-harness AI agent gets model_id (H-2b: previously excluded)" + "null-harness gets harness_type='builtin'", plus tier mapping (reasoning/fast/null), human-untouched, and a mixed-batch loop. Fixture runs the REAL `drizzle/` migration folder via `migrate()` against PGlite (test-pool.ts:55), so an actual 0032 syntax error would fail every integration test; the inline backfill replay exists only because fixture rows are truncated per-test. |
| **L-1** test describe rename | **RESOLVED** | Renamed to "AH2 AC2: Warns when agent harness is unavailable (server 422 is the save gate)" — matches what it asserts (renders "harness unavailable" warning chip). No overpromise. |

**Re-confirmed no regression:** cross-axis check (single-field PATCH both directions) green; provisioning passes `modelProviders:[agent.modelProvider]` to `select()`; openai-compatible rejected at boundary (`UNSUPPORTED_PROVIDER`) + resolver; no any-adapter fallback for backfilled rows; X5 adapter interface untouched (AC8). Core AC logic commits unchanged by the 4 fix commits (surgical). Incidental: commit 4bf0ef36 adds an `Array.isArray` guard before `setHarnesses()` + an AF15 `/api/harnesses` mock — a legitimate fetch-boundary guard, not slop.

**All AC1–8 + AC2b/2c + 4 validation scenarios MET.** See round-1 AC table below; AC3 (was PARTIAL/NOT MET) and AC6 caveat are now fully MET via H-2 + M-1.

**DONE — proceed to retro + ship.**

---

## ROUND 1 (initial review)

**Reviewed against:** `origin/main...HEAD` (9 impl commits on red-phase tests)
**Gates observed:** `npm run check` PASS (12 pkgs) · `npm run lint` PASS (warnings only, all pre-existing categories) · AH2 targeted tests 64 green (server 43 + web 21)

## Verdict: NOT DONE

Two substantive defects block: (H-1) the `GET /api/harnesses` auth boundary is wrong — re-implements `X-API-Key` worker auth instead of the founder boundary the plan mandated, breaking the Settings UI in shared mode; (H-2) migration 0032 omits the `harness_type` backfill the plan required and excludes `claude-code` agents from the model backfill, leaving existing rows in the exact unrunnable/silent-fallback state AC3 exists to prevent — and there is no migration test to catch it. The core API/resolver/cross-axis logic is otherwise correct and well-tested.

---

## AC table

| AC | Verdict | Evidence |
|---|---|---|
| **AC1** — per-agent model, two agents differ | **MET** | `agents.ts` create/PATCH persist `modelId`/`modelProvider`; `users` columns added (schema.ts:78,86). Test `AH2-agent-config.integration.test.ts:109` "two agents can have different modelId" green. |
| **AC2** — harness from registry, no free-text, server-side reject | **MET (server)** | `validateAgentConfig` rejects unregistered harness 422 `UNKNOWN_HARNESS` on POST+PATCH (agents.ts:124-133). UI uses `Select` only (SettingsAgents.tsx:408,648); test asserts no free-text input (`AH2-SettingsAgents.test.tsx:160`). Server is the real gate. Note: client Save is NOT disabled for an unavailable harness (no disabled "stale" option per plan line 233) — relies on server 422 + inline error. Acceptable but weaker than plan. |
| **AC3** — every agent (onboarding/team) runnable by construction | **PARTIAL / NOT MET** | New agents: seeds set builtin+sonnet (factory-bootstrap.ts:96-98,111-113; teams-routes.ts:411-413) and POST defaults (agents.ts:257-259) — good, tested. **Existing agents via migration: NOT MET** — see H-2. Migration omits `harness_type` backfill and skips claude-code rows. No migration test exists (`AH2-migration.integration.test.ts` named in plan task 3 was never written). |
| **AC4** — current catalog, no stale ids, defaults current | **MET** | `MODEL_CATALOG` = the 4 current ids (model-gateway.ts:93-103); `BUILT_IN_GATEWAY_CONFIG`, `COST_PER_MILLION_TOKENS`, `MODEL_CONTEXT_WINDOWS` all re-keyed (model-gateway.ts:56-60, builtin-harness-adapter.ts:86-89, context-window.ts:18-21). Zero stale ids in production source. Stale ids remaining are all in test fixtures only — see stale-id decision below. |
| **AC5** — tier table demoted, no contradiction | **MET** | `resolveAgentModel` resolves per-agent first, tier fallback only when null (model-gateway.ts:187-205); SettingsModels helper copy "Used only when an agent has no per-agent model" (SettingsModels.tsx:378-381); docs §6 rewritten. Tests `AH2-resolve-agent-model.integration.test.ts:26-70`. |
| **AC2b** — cross-axis pair rejected; provisioning never picks incompatible | **MET** | `validateAgentConfig` step 4 rejects 422 `INCOMPATIBLE_HARNESS_MODEL` using effective pair (agents.ts:146-154); single-field PATCH both directions covered (test:373,405). Provisioning passes `modelProviders:[agent.modelProvider]` to `select()` and throws `NoEligibleHarnessError` (session-provisioning.ts:330-345). |
| **AC2c** — per-agent openai-compatible rejected at boundary | **MET** | Boundary 422 `UNSUPPORTED_PROVIDER` first in chain (agents.ts:116-122); resolver defensive `UnsupportedAgentProviderError` (model-gateway.ts:116-118). Tests:447-505 + resolver test:103-112. |
| **AC6** — provisioning selects matching adapter + resolves model, no "any" mask | **MET (with caveat)** | sessions-routes wired to `resolveAgentModel` (sessions-routes.ts:260-265); provisioning throws on no-eligible-harness (test `X3-session-provisioning.integration.test.ts:488`). **Caveat:** the no-fallback guarantee only holds when `agent.harnessType` is non-null. With null harness (the migration gap, H-2), `select({harnessType: undefined})` reverts to "any adapter" — the exact path AH2 kills. So AC6 is sound for correctly-seeded rows but H-2 reopens the hole for legacy rows. |
| **AC7** — resolver respects per-agent before default | **MET** | Covered by AC5 evidence. |
| **AC8** — X5 adapter interface intact | **MET** | No edits to `HarnessAdapter` / `AdapterPool.select` signature; `select()` called with existing `modelProviders` filter param. |

---

## Findings (prioritized)

### H-1 — `GET /api/harnesses` uses wrong auth boundary (X-API-Key worker auth, not founder boundary)
**File:** `packages/server/src/routes/harnesses.ts:32-38`
**Issue:** The route declares `requireBoundary({ kind: "public-data" })` but then re-implements an in-route `X-API-Key` === `HYPERIDLE_API_KEY` check (copied from `workers.ts`). The plan explicitly rejected this (architecture.md:39 "`/api/workers`… requires `X-API-Key` (worker-auth, not founder-auth)… wrong boundary for the Settings UI"; routes plan line 142 "Founder-auth via `requireBoundary({ kind: "public-data" })` (same as agents routes — **no `X-API-Key`**)"). The global `/api/*` middleware (`app.ts:338`) already authenticates the founder — in **shared mode** via a `Bearer` token (auth.ts:177-209), with no X-API-Key sent. A Bearer-authenticated founder reaching `/api/harnesses` is then rejected 401 by the redundant in-route check → the harness Select fails to populate, the entire AH2 picker breaks in shared mode. In local mode it happens to pass (apiFetch sends the dev key) so tests are green, but the test suite never exercises the shared-mode/Bearer path, so the defect is uncaught.
**Fix direction:** Delete the in-route key check and the `constantTimeStringEqual`/`process.env` block entirely. Match `agents.ts` — rely on the global auth + `requireBoundary({ kind: "public-data" })`. The "401 without auth" test still passes because the global middleware rejects unauthenticated requests. (Do not change tests to make this pass — the fix is to the route, and the existing "401 without auth" assertion remains valid.)

### H-2 — Migration 0032 leaves existing agents unrunnable / re-opens the any-adapter fallback
**File:** `packages/db/drizzle/0032_wild_nova.sql:9-19`
**Issue:** Two gaps vs. plan (architecture.md:216, "Every AI agent with `harness_type IS NULL` → set `harness_type='builtin'`"; line 219 "No agent ends unrunnable"):
1. **No `harness_type` backfill at all.** The UPDATE only sets `model_id`/`model_provider`. An existing onboarding/legacy agent with `harness_type IS NULL` keeps null after migration → provisioning calls `select({harnessType: undefined})` → "any adapter" fallback (session-provisioning.ts:331,339 — `if (agent.harnessType)` is false, so `NoEligibleHarnessError` is skipped and the generic capacity path/any-pick is taken). This is precisely the silent dead-session path AC3/AC6 exist to eliminate.
2. **`WHERE … ("harness_type" IS NULL OR "harness_type" = 'builtin')`** excludes any agent with `harness_type='claude-code'` (or a CLI harness). Those rows end with `model_id = NULL` → rely solely on tier fallback, never get the "current-model assignment" AC3's validation scenario requires ("non-null… current-model assignment — provably runnable").
**Fix direction:** Add `UPDATE "users" SET "harness_type" = 'builtin' WHERE "agent_category" IS NOT NULL AND "harness_type" IS NULL;` (or fold into the existing statement). Broaden/remove the `harness_type = 'builtin'` restriction on the model backfill so every AI agent (claude-code included — anthropic models are catalog-valid for it) gets a non-null catalog model. Verify the PG path applies the same SQL. **Add the missing `packages/db/src/__tests__/AH2-migration.integration.test.ts`** (plan task 3): insert legacy null-harness + null-model rows AND a claude-code row, run migration, assert every AI row has non-null registered harness + catalog model.

### M-1 — AC3 migration is entirely unverified by tests
**File:** (absent) `packages/db/src/__tests__/AH2-migration.integration.test.ts`
**Issue:** No test asserts 0032's backfill. The plan's AC3 verification ("Migration test: insert legacy null-harness/null-model agent, run 0032, assert backfilled") was never written. This is why H-2 shipped silently. Per CLAUDE.md First Principle, a runtime-behavior AC must have a test.
**Fix direction:** Write the migration test (see H-2 fix). Runtime behavior → integration test, not a SQL-string grep.

### L-1 — "Save blocked when harness unavailable" test does not test save-blocking
**File:** `packages/web/src/settings/__tests__/AH2-SettingsAgents.test.tsx:401-431`
**Issue:** The `describe` is titled "Save blocked when harness is unavailable" but the only assertion is that the StatusChip warning renders. No client Save-gating exists (intentionally — server 422 is the gate), so the title overpromises. Not a behavior defect; the real protection is the server 422 + inline-error path, which IS tested (:290-396).
**Fix direction:** Rename the describe to reflect what it asserts ("warns when harness unavailable"), or drop it. No production change.

### L-2 — Incidental, unrelated edit in E2E spec
**File:** `packages/web/e2e/time-vocabulary.spec.ts:213-214` (`_specDir` → `SpecDir`)
**Issue:** A Biome naming-convention rename unrelated to AH2 crept into the diff. Harmless, but pollutes the changeset (Auditor lens: PR scope vs. diff).
**Fix direction:** Acceptable to leave; note for the record.

---

## Stale-id decision (AC4 scrutiny)

**Decision: NOT an AC4 violation. Acceptable test-fixture drift, outside AH2's surface. But the builder's framing is wrong on one point.**

- Zero stale ids exist in production source (`packages/*/src/**/*.{ts,tsx}` excluding `__tests__` and `drizzle/`). All four re-key sites are correct. AC4's substance is met.
- The flagged ids at `AF15-SettingsPage.test.tsx:67-75` (`claude-opus-4-5`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`) are a mock of the **`/api/model-gateway` tier config** (reasoning/workhorse/fast) consumed by `SettingsModels` — the **system-tier surface, not the AH2 per-agent surface**. The diff does not touch those lines; they predate AH2. They are arbitrary fixture strings exercising the gateway component's rendering, not assertions that any production code emits a stale id. Test fixtures may legitimately use any string. Leaving them is fine.
- **Correction to the builder's claim:** there is **no AC4 grep guard in the codebase.** The "broadened grep guard over `packages/web/src`" described in the plan/task brief was never implemented as code — the AH2 tests only assert `MODEL_CATALOG` contents and `isCatalogModel()` return values (`AH2-model-catalog.test.ts`, `AH2-cost-context.test.ts` assert on the in-memory maps, not the file tree). So "the guard did not flag them" is misleading: nothing scans the tree. This is consistent with CLAUDE.md (a stale-string-in-source check is a lint rule, not a test) — but it means AC4's "no stale ids anywhere in scope" is enforced only by the re-key being correct, not by an automated guard. **Optional follow-up (not blocking):** add an ESLint rule banning `/-20250514|claude-(haiku-3-5|opus-4-5|3-5-)/` in `packages/{server,web}/src` non-test source if you want the guard the plan assumed. Not required for DONE.

---

## Docs rubric (`/write-docs`, 10 dims, threshold ≥35 total & all ≥3)

Scope: `docs/agent-layer/model-routing-and-cost.md` §6 (rewrite) + `docs/guides/user/settings.md` (per-agent section).

| Dimension | Score | Note |
|---|---|---|
| Attention capture (lede) | 4 | §6 opens with the load-bearing fact (per-agent model resolved first); user guide leads with "Each agent can run a different model." |
| Scannability | 4 | Tables, numbered resolution order, bolded terms. |
| Progressive disclosure | 4 | Overview → tiers → routing → cost posture, each self-contained. |
| Accuracy vs. code | 5 | Resolution order, provider support (anthropic+openrouter, openai-compatible tier-only), catalog ids all match implementation exactly. |
| Completeness | 4 | Covers per-agent, fallback, defaults, the unavailable-harness badge, openai-compatible exclusion. Minor: doesn't mention the cross-axis (harness↔provider) rejection a founder may hit. |
| Activation / next step | 4 | User guide gives concrete click-path (Settings → Agents → Edit → select). |
| Tone / voice | 4 | Matches existing house style. |
| Terminology consistency | 4 | "tier", "per-agent model", "harness" used consistently with code. |
| No filler / honesty | 4 | No marketing fluff; concrete model examples. |
| Visual/structure aids | 4 | Tier table + mapping table aid comprehension. |

**Total: 41/50. All dims ≥3.** Docs PASS.

---

## Lens summary

- **Architecture:** Layer integrity respected; `select()`/adapter interface untouched (AC8). Validation chain ordering matches plan (UNSUPPORTED_PROVIDER → UNKNOWN_HARNESS → UNKNOWN_MODEL → INCOMPATIBLE). One contract miss: harnesses route boundary (H-1). One data-model contract miss: migration backfill (H-2).
- **Design:** Two `Select`s with `max-md:text-[16px]` (AQ-005/DESIGN-2 satisfied); inline 422 surface uses `--status-error` (DESIGN-1 satisfied); StatusChip warning present. Pre-existing raw-DaisyUI usage + dead `text-error` token at lines 332/560/568 are X3 legacy, out of AH2 surface.
- **Security:** No secrets in `/api/harnesses` response (only type/name/modelProviders), tested. No new public POST. Input validated against closed catalog + registry. H-1 is an availability bug, not a leak.
- **Adversarial:** No backdoors. Tests are genuinely behavioral (not `toBeDefined()` shells) and cover both single-field PATCH directions of the cross-axis check. The Auditor catch: builder's "grep guard didn't flag" claim doesn't correspond to any real guard (see stale-id decision). The Saboteur catch: H-2's silent any-adapter fallback for legacy rows.
- **Simplification:** `harnesses.ts` in-route auth block is dead/harmful duplication of global middleware (folds into H-1 fix). `AgentModelParams` interface is single-purpose but justified (shared shape across route + service).
- **Slop:** Comments are load-bearing (`@lore` decisions, validation-order rationale), not filler. No "TODO: implement" on implemented code. Clean.

---

## What the builder must fix to reach DONE
1. **H-1** — remove the X-API-Key block from `harnesses.ts`; rely on global auth + `public-data` boundary (match `agents.ts`).
2. **H-2** — add `harness_type='builtin'` backfill for null-harness AI rows; broaden the model backfill to cover all AI agents (incl. claude-code); verify PG path.
3. **M-1** — write `AH2-migration.integration.test.ts` proving both backfills leave no AI row unrunnable.
4. (L-1 optional) rename the mis-titled SettingsAgents test describe.

Re-run `npm run verify` after fixes. No finding here asks for a behavior change merely to satisfy a test.
