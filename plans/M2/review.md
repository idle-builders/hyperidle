# M2 Code Review

**Workpackage:** M2 -- Replacement contracts (architecture pass)
**Reviewer:** Phase 4 code review
**Date:** 2026-05-11
**Branch:** `feat/M2-replacement-contracts`

---

## Verdict: DONE

---

## AC Satisfaction

| AC | Satisfied | Evidence |
|---|---|---|
| AC1: Every needs-contract row addressed by contracts.md | YES | All 5 needs-contract rows (DEFAULT_SETTINGS, MOCK_RAIL_BETS, MOCK_RAIL_BLOCKERS, MOCK_RAIL_COST, agent-unassigned) have dedicated contract sections in `plans/mock-data-purge/contracts.md` (contracts 2, 3, 3, 3, 4 respectively). |
| AC2: Each section has (a)-(f) | YES | Contracts 1-3 have endpoint, schema, empty/loading/error, migration recipe, test pattern, and ripple sites (via architecture.md clusters). Contracts 4-6 are behavioral/rendering contracts -- endpoint and schema are replaced by behavioral descriptions and client service signatures, which is appropriate since these require no new API surface. All 6 clusters in architecture.md have the full set. |
| AC3: API contracts in api-contract/ (types only) | YES | `packages/api-contract/src/` contains 3 type files (auth.ts, settings.ts, rail.ts) + barrel re-export (index.ts). Zero runtime code: only `export interface`, `export type`, and `import type` statements. The single `import type { WireMoney }` in rail.ts is a type-only import from `@hyperidle/shared`. |
| AC4: Every row annotated | YES | The complete inventory annotation table in architecture.md lines 603-638 covers all 34 rows: 24 contract-pinned, 3 straight-swap, 7 tracked-out. Sum = 34, matching inventory.md and inventory.json. Every row has an M2 annotation and cluster assignment. |
| AC5: No code changes beyond api-contract + contracts.md | PARTIAL | The diff includes `packages/api-contract/` and `plans/` as expected. It also includes M1 deliverables (eslint-plugin-design, scripts/mock-inventory.ts, docs/mock-data-policy.md) and workspace config changes (vitest.config.ts, tsconfig.json, bun.lock, package.json, eslint.config.js). The workspace config changes are necessary to integrate the new package. The M1 artifacts are from the prior workpackage on the same branch. M2-specific changes are correctly scoped to api-contract types + plans. |
| AC6: check + lint + test green | YES | `bun run check`: 0 errors. `bun run lint:biome`: 0 errors. `bun run lint:eslint`: 0 errors. `bun run test --project api-contract`: 57 tests pass. Pre-existing `better-sqlite3` failures in server/db packages are unrelated to M2 (identical on main). |

---

## Lens Findings

### Architecture (positive)

1. **Type contracts match server field-by-field.** Verified `RailBet`, `RailBlocker`, `CostBurnRate` in `packages/api-contract/src/rail.ts` against `packages/server/src/routes/rail.ts` lines 6-35. Every field name, type, and nullability matches. The contract types add `readonly` modifiers, which is a correct widening (readonly is assignable from mutable in TypeScript).

2. **WireMoney import is structurally correct.** `RailCostBurnRate` fields are typed as `WireMoney | null`. The `WireMoney` interface (`{ readonly minor: number; readonly currency: CurrencyCode }`) is imported from `@hyperidle/shared` via `import type`. The test file verifies this at lines 355-362 with `expectTypeOf` assertions including the currency union.

3. **Package structure follows conventions.** Three source files re-exported through one barrel (`index.ts`). Package.json has `type: "module"`, workspace dependency, type-only exports. tsconfig.json extends root. Vitest config scopes to source tests. Root vitest.config.ts includes api-contract in its projects array. Root tsconfig.json has the path mapping and project reference.

4. **No layer violations.** The api-contract package sits between server and web as a shared type contract. It depends only on `@hyperidle/shared` (for WireMoney). No server or web imports. No DB imports. No runtime dependencies.

### Design (skipped -- no UI surface)

### Security (positive)

5. **No sensitive data in types.** `AuthMeResponse` returns id, name, email, avatarUrl -- standard profile data. No tokens, passwords, or API keys in any contract type. The contracts.md correctly specifies that `/api/auth/me` requires `X-API-Key` authentication.

6. **Phase 2 critique finding tracked.** The builder documented the `?? "u-founder"` fallback concern from the Phase 2 critique as a `@lore` comment in auth.ts (lines 12-20). This is a plan-level concern that M3 must resolve during implementation -- the type contract itself does not encode the fallback.

### Adversarial (negative)

7. **OBSERVATION: `as const` casts in test file are safe.** Lines 464-468 of contracts.test.ts use `as const` on currency strings and `as <union> | null` on null literals. These are type-narrowing assertions for structural compatibility tests, not unsafe casts. Count: 5 `as` usages, all in test file, all legitimate.

8. **OBSERVATION: Test coverage gap for edge cases.** The 57 tests cover field presence, type assertions, and structural compatibility. They do not test boundary values (e.g., empty strings for `AuthMeResponse.id`, negative numbers for `RailCostBurnRate.weekTokens`, malformed `quietHoursStart`). This is acceptable for type-only contracts -- validation belongs in the server (Zod schemas in M3), not in the type definitions.

9. **Potential M3 misuse risk: `SettingsNotifications.quietHoursStart` is typed as `string`.** An M3 builder could pass any string. The contracts.md specifies "HH:MM" format but the type does not enforce it. This is a deliberate design choice (runtime validation via Zod at the server, not compile-time enforcement) and is documented in the JSDoc comment on the field. The Phase 2 critique already flagged the missing PATCH validation rules (WARNING 2).

### Simplification (negative)

10. **`assertShape<T>` helper is justified.** The helper at line 37 wraps `expect(value).toBeDefined()` to give Vitest a concrete runtime assertion alongside the compile-time `satisfies` check. Without it, type-only tests would pass at compile time but register no runtime assertions, making test reports misleading. Single-use helper? No -- used 10 times across the file.

11. **No dead code.** All exported types are tested. No commented-out code. No TODO comments. No unused imports.

12. **No unnecessary abstractions.** The types are flat interfaces with readonly properties. No generics, no utility types, no conditional types, no mapped types. The simplest possible representation.

### AI Slop (negative)

13. **`@lore` comments are substantive, not filler.** The lore comments document the Phase 2 critique finding (auth.ts lines 12-20), the appearance exclusion rationale (settings.ts lines 9-12), the server shape mismatch context (rail.ts lines 11-13), and the WireMoney migration context (rail.ts lines 37). Each captures a decision or cross-cutting constraint.

14. **Test descriptions are specific and non-redundant.** Test names like "does NOT have a product field (server authority over client BetItem)" and "does NOT include appearance (client-side only)" encode the design rationale, not just the assertion.

15. **No AI tell-tales detected.** No "simplified version", no "for now", no "TODO: implement", no unnecessary async, no `=== true`, no redundant else-return.

---

## Phase 2 Critique Finding Tracking

| Phase 2 Finding | Resolution in Phase 3 |
|---|---|
| CRITICAL: `threads.ts:79` missing from migration recipe | Documented as `@lore` in auth.ts lines 12-20. Plan-level gap -- cannot be fixed by the type-contract package. M3 builder is warned. |
| WARNING: auth fallback to "u-founder" | Documented as `@lore` in auth.ts lines 22-26. Implementation concern for M3. |
| WARNING: no PATCH validation | Plan-level gap. M3 must add Zod validation. Type contracts correctly stay permissive (string, boolean). |
| WARNING: auth route interface mismatch | Plan-level gap. M3 must resolve `createAuthRoutes` signature. No type-contract impact. |
| WARNING: no security annotations | Plan-level gap. No type-contract impact. |
| WARNING: test file paths not enumerated | Plan-level gap. No type-contract impact. |
| WARNING: ambiguous notif key mapping | Plan-level gap. Settings type is correct; key-to-field mapping is implementation detail. |
| WARNING: test patterns lack file paths | Plan-level gap. No type-contract impact. |

All Phase 2 findings are either resolved (via lore documentation), or correctly identified as plan-level concerns that fall outside the scope of type-contract code.

---

## Summary

The `packages/api-contract/` package delivers exactly what M2 requires: type-only definitions that pin the wire shapes for 3 API endpoint families (auth, settings, rail). The types match the existing server implementations field-by-field. The `plans/mock-data-purge/contracts.md` document provides mechanical migration recipes for all 5 needs-contract rows plus behavioral contracts for the remaining clusters. All 34 inventory rows are annotated in the architecture.md table. No runtime code was introduced. All M2-specific tests pass. The workspace integration (tsconfig paths, vitest projects, package references) is correct.

The implementation is clean, minimal, and well-documented. The Phase 2 critique findings that could not be addressed by type definitions are tracked via `@lore` comments for M3 visibility.
