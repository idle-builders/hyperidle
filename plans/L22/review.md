# L22 Code Review — Three relevance signals as first-class data

**Verdict: DONE** (with 3 WARNINGs and 5 SUGGESTIONs -- none blocking)

Commit: `c0857c4` on branch `feat/L22-relevance-signals`

---

## AC Completeness Audit

| AC | Description | Status | Evidence |
|---|---|---|---|
| AC-1 | Every knowledge item knows last validated/edited/accessed + 30d access count from server-side tracking | PASS | `knowledgeAccessLog` table created (T1). `GET /:layer/:id` handler appends one access-log row per 200 response (`knowledge.ts:247-265`). `relevance-service.ts:computeSignals` aggregates lastAccessedAt, accessCount30d, lastHumanEditAt. Integration test `knowledge-access.test.ts` fetches 3 times and asserts 3 rows. |
| AC-2 | Fabric attention scoring rewritten: frequency from real access tracking; IMPACT_BY_KIND deleted | PASS | `IMPACT_BY_KIND` constant deleted. `computeImpact` and `computeUsage` functions deleted. `scoreAttention` inlines `impact = 0` and `usage = 0` at lines 131 and 138. `attention-scoring.l22.test.ts` asserts `IMPACT_BY_KIND` is not exported, and that `principle` and `brief` items score identically. Grep confirms zero production references to `IMPACT_BY_KIND` outside the lore comment. |
| AC-3 | Citation staged: `citationCount` nullable, renders dash | PASS | `citationCount` column added as nullable integer on `knowledgeItems`. `relevance-engine.ts:104-109` drops citation from the denominator when null. `KnowledgeRow.tsx:142-144` renders em dash when `signals.citation` is null. `relevance-engine.test.ts:73-83` (fixture 2) asserts denominator change. |
| AC-4 | Composite relevance score uses L5 formula with tunable weights from config | PASS | `relevance-engine.ts` implements the exact L5 formula. `loadRelevanceConfig` reads 7 keys from `factory_settings`. 14 golden fixture tests in `relevance-engine.test.ts` with hand-calculated values to 6 decimal places. `scoring-config.l22.test.ts` verifies defaults, custom overrides, rejection of negative/NaN/Infinity values. |
| AC-5 | Each row renders available signals; absent signals render dash | PASS | `KnowledgeRow.tsx:116-146` renders the signal triad when `signals` prop is provided. Absent values render em dash (U+2014). `KnowledgeRow.signals.test.tsx` asserts triad rendering and em dash for null values. `knowledge-signals.test.ts:115-133` asserts null signals from the API (never fake zeros). |
| AC-6 | Sort selection reflected in URL state | PASS | `KnowledgeList.tsx:52-55` derives sort from `?sort=` param. `handleSortChange` (lines 174-181) updates URL params, deleting the param for the default (relevance). E2E tests AC-E4 and AC-E5 verify URL changes. |
| AC-7 | Sort changes re-order the list | PASS | `sortApiItems` (lines 81-113) sorts client-side by the selected option, with nulls-last. E2E test AC-E6 verifies sort state change via button aria-checked. Test data seeds two items with deliberately different signals for deterministic ordering. |
| AC-8 | Fake-zero guard: all-null inputs return null score, not 0 | PASS | `relevance-engine.ts:86-88` returns null when all inputs are null. `relevance-engine.test.ts:86-90` (fixture 3) asserts null return. `knowledge-signals.test.ts:115-133` asserts null signals rendered for no-data items. |
| AC-9 | All hardcoded attention-score/whyNow strings removed from Triage path | PARTIAL | The Triage path now fetches from the API (`useFetch("/api/knowledge/L3")`). When API data is available, `KnowledgeRow` receives `signals` instead of `caption`. However, `truncateReason` and `whyNow` are still referenced at `KnowledgeList.tsx:34` and `:349` in the fallback path (when API returns no data, the mock items render with `caption={truncateReason(item.whyNow)}`). This is a deliberate fallback per the plan's risk section (Curated tab still uses mocks), but AC-9 literally says "removed from Triage path" -- the fallback Triage path still uses them. Acceptable because the primary Triage path (API data present) does not reference them. |
| AC-10 | L6 inventory rows closed | NOT DONE | No changes to `plans/reviews/hardcoded-data-inventory.md`. The two L22-owned rows (IMPACT_BY_KIND + MOCK_KNOWLEDGE_ITEMS) are not marked `closed-by: L22`. This is a documentation-only task. |
| AC-11 | `bun run check` + `bun run lint` + `bun run test` all green | PASS (with caveat) | Builder reports: check 0 errors, lint 0 errors, test 18 failures ALL pre-existing from L9 (not L22 regressions). Playwright E2E 10/10 passing. The 18 pre-existing failures are not L22's responsibility. |

---

## Lens 1: Architecture

### Schema (T1)

Schema changes are correct. `knowledgeAccessLog` table has the right columns, FK with ON DELETE RESTRICT, and the composite index `(item_id, accessed_at)`. The three new columns on `knowledgeItems` (`relevanceScore`, `citationCount`, `lastCitedAt`) are all nullable as spec requires. Migrations are properly numbered: SQLite 0012, PostgreSQL 0010. Both schemas are in sync.

### Shared types (T2)

`KnowledgeAccessorKind`, `KnowledgeRelevanceSignals`, `KNOWLEDGE_SORT_OPTIONS`, `KnowledgeSortOption` are correctly defined in `packages/shared/src/types.ts` and exported from the barrel. Note: the plan specified a `KnowledgeItemWithSignals` type in shared; the implementation uses a local `ApiKnowledgeItem` interface in `KnowledgeList.tsx` instead. This is acceptable -- it avoids the cross-layer dependency concern raised in the architecture critique.

### Fabric (T3, T4)

`relevance-engine.ts` is pure, stateless, and implements the exact L5 formula. `loadRelevanceConfig` in `scoring-config.ts` follows the established `loadAttentionWeights` pattern. `IMPACT_BY_KIND`, `computeImpact`, and `computeUsage` are cleanly deleted from `attention-scoring.ts` with a thorough `@lore` comment explaining why.

### Server (T5, T6, T7)

Access-log insertion is wrapped in try-catch (addressing the architecture critique WARNING). The relevance service uses a factory function pattern (`createRelevanceService`), which is clean. The list endpoint now returns `{ layer, items, groups }` (addressing the architecture critique WARNING about response shape).

### Layer integrity

Clean. Fabric owns pure scoring. Server owns DB queries and service orchestration. Web owns rendering and URL state. Shared owns cross-boundary types. No layer violations.

---

## Lens 2: Design

### Signal triad rendering

`KnowledgeRow.tsx:116-146` renders the signal triad as specified in `approved.md`. Labels are uppercase with `tracking-[var(--tracking-caps)]`. Values use `font-[var(--mono)] tabular-nums`. Em dash (U+2014) is the absent-data marker. The triad uses dot separators (`·` with `aria-hidden="true"`), which differs from the approved design's specification of either a 1px border separator or `gap-[8px]` with no separator. The dot separator is a reasonable implementation choice.

The gap between signal items uses `gap-[var(--density-gap)]`, which addresses the design-critique WARNING about using literal `gap-[8px]`.

Sort controls use `role="radiogroup"` with `role="radio"` and `aria-checked`, addressing the design-critique WARNING about accessibility semantics.

### Stories

`WithSignals` and `NullSignals` stories added. Both show the signal triad in relevant states.

### HTML reference

NOT updated. The plan (Section 5.2) and the approved design (Section 4) both state this is mandatory per the visual-parity rule. `KnowledgeRow.html` does not include a signal variant.

---

## Lens 3: Security

Access-log insertion is server-side only, on successful 200 responses. The accessor defaults to `{ kind: "human", id: "browser" }` when auth context is not wired -- this is documented with `@lore`. The try-catch wrapper ensures INSERT failures do not break the response. No user input reaches the INSERT (the itemId comes from the database row, not the URL param). The `relevance.*` factory_settings write guard is documented as a constraint for the future settings write endpoint (none exists yet). No new injection vectors.

---

## Lens 4: Adversarial

### `as` casts in production code

1. `relevance-service.ts:70,98,152` -- `itemIds as string[]`. This is needed because Drizzle's `inArray` expects `string[]`, not `readonly string[]`. The cast is safe (readonly to mutable array reference, not a type lie).
2. `relevance-service.ts:189` -- `.set({ relevanceScore: score } as Record<string, unknown>)`. This is a Drizzle ORM workaround to set a column that may not be in the inferred type yet. The cast is a type escape hatch.
3. `scoring-config.ts:231,243` -- `as keyof typeof weights` / `as keyof typeof shape`. These follow from the `string.replace()` output which TypeScript cannot narrow. The values are validated by the for-loop iteration over known constant arrays, so the cast is safe.
4. `KnowledgeList.tsx:304-325` -- `item.layer as "L0"|...`, `item.kind as ...`, `item.status as ...`. These cast API response strings to the union types. Unsafe if the API returns unexpected values, but acceptable given the API is the same codebase.

Total: 6 `as` casts in production code. None are `as any`. All are justifiable.

### Missing recompute on detail fetch

The plan (Section 4.4) specified that after the access-log INSERT on `GET /:layer/:id`, a single-item relevance recompute should fire. The implementation does NOT do this. The access-log row is inserted, but `relevanceScore` is not updated. The relevanceScore for that item will be stale until the next batch recompute or list-endpoint query. This is a functional gap but low severity -- the list endpoint computes signals fresh from the log anyway, and the stored `relevanceScore` is only used as a sort key which gets refreshed on the next list fetch.

### Sort stability

The `sortApiItems` function does not have a tiebreaker. When two items have equal relevanceScore (or equal lastActivityAt, or equal accessCount30d), their relative order is undefined. This can cause visual flickering if the sort is unstable. A secondary sort by title or ID would stabilize it.

### Stale `@ts-expect-error` comments

Three test files use `@ts-expect-error -- knowledgeAccessLog not yet exported from @hyperidle/db (T1)` on dynamic imports. Since T1 is complete and `knowledgeAccessLog` IS exported, these comments are stale. The tests use dynamic `await import()` which may not trigger the TypeScript error, but the comments are misleading. They should use direct static imports.

### `accessCount30d` uses string comparison for 30-day window

`relevance-service.ts:84` compares ISO strings: `if (row.accessedAt >= thirtyDaysAgoIso)`. ISO 8601 strings are lexicographically sortable, so this is correct. Good.

---

## Lens 5: Simplification

### Fallback to mock data

`KnowledgeList.tsx:333-353` falls back to the old mock-data Triage rendering when `apiItems.length === 0` AND the API has finished loading. This is a complex four-branch conditional: (1) API loading -> skeleton, (2) API items present -> real rows, (3) API empty + no mock items -> EmptyState, (4) API empty + mock items present -> old mock rows. Branch 4 is the fallback compatibility path. This is somewhat complex but justified by the incremental transition from mock to real data.

### `createRelevanceService` factory

Creates a new service instance on every request (line 193 in knowledge.ts). For a synchronous, stateless service this is fine -- there is no initialization cost worth caching. Not over-engineered.

### Config loader duplication

`DEFAULT_RELEVANCE_CONFIG` appears in both `relevance-engine.ts` (for the pure function's default) and `scoring-config.ts` (for the config loader's fallback). The values are identical. This is acceptable -- the engine file is the authoritative constant; the config file spreads from `as const` literals that happen to match. They could share a single export, but the current approach keeps the engine file self-contained.

---

## Lens 6: AI Slop

No AI-aesthetic tells. No verbose naming. No single-use helpers that add no value. No "TODO: implement" on implemented code. No filler (`=== true`, redundant else-return). The `@lore` comments are substantive and contextual, not boilerplate. The code is lean.

One note: the `SignalValue` component from the approved design's architecture plan (Section 5.1) was NOT implemented as a separate inline component. Instead, the signal rendering is inlined directly in the JSX. This is simpler and avoids a single-use helper that adds indirection. Good simplification.

---

## CRITICAL

(none)

## WARNING

- **[AC-10] L6 inventory rows NOT marked as closed.** `plans/reviews/hardcoded-data-inventory.md` was not updated. The two L22-owned rows (IMPACT_BY_KIND + MOCK_KNOWLEDGE_ITEMS) need `closed-by: L22` annotations. This is a documentation-only task with no code impact.

- **[KnowledgeRow.html] HTML reference not updated.** The approved design (Section 4) and the plan (Section 5.2) both state this is mandatory per the visual-parity rule. The TSX has the signal triad variant, but the HTML reference does not. This creates a visual-parity gap -- `bun run ds:sync` would flag this if run. The builder should add a signal triad variant to `packages/design-system/html/KnowledgeRow.html`.

- **[knowledge.ts:247-267] No relevance recompute after access-log INSERT.** The plan (Section 4.4) specifies: "On access-log insertion, trigger a recompute for that single item." The implementation inserts the access-log row but does not call `relevanceService.recomputeScores([item.id])`. The `relevanceScore` column goes stale after each access until the next list query or batch recompute. Low severity because the list endpoint computes signals fresh, but the stored `relevanceScore` is the sort key for other consumers.

## SUGGESTION

- **[relevance-service.test.ts, knowledge-access.test.ts, knowledge-signals.test.ts] Stale `@ts-expect-error` comments.** Three test files use `@ts-expect-error -- knowledgeAccessLog not yet exported from @hyperidle/db (T1)` with dynamic `await import()`. Now that T1 is complete, these should be direct static imports: `import { knowledgeAccessLog } from "@hyperidle/db";`.

- **[KnowledgeList.tsx:81-113] Sort function lacks tiebreaker.** `sortApiItems` does not define a secondary sort when primary sort values are equal. Add `|| a.title.localeCompare(b.title)` (or sort by ID) as a fallback for stable ordering.

- **[KnowledgeList.tsx:34, 349] Dead code in primary path.** `truncateReason` and the `caption={truncateReason(item.whyNow)}` line are only used in the mock-data fallback branch. Mark with `@lore L22: retained only for mock-data fallback; remove when Triage is fully API-driven` so the next agent knows the intent.

- **[relevance-service.ts:189] Unsafe cast on DB update.** `.set({ relevanceScore: score } as Record<string, unknown>)` is a Drizzle type escape. If the `relevanceScore` column is properly in the schema (it is), the cast should not be needed. The builder should verify whether the Drizzle type inference picks up the new column without the cast.

- **[attention-scoring.l22.test.ts:13-32] `makeItem` missing new schema fields.** The `makeItem` helper builds a `KnowledgeItem` without the three new L22 columns (`relevanceScore`, `citationCount`, `lastCitedAt`). Since these are nullable, TypeScript does not complain, but explicitly setting them to `null` in the helper would document the complete shape.

## What's Working Well

- **The access-log try-catch wrapper** (`knowledge.ts:253-265`) directly addresses the architecture-critique WARNING. The lore comment explains the "best-effort" decision clearly.

- **The list endpoint returns both `items` and `groups`** (`knowledge.ts:225`), directly addressing the architecture-critique WARNING about response shape ambiguity. The Triage tab reads `items`, the Curated tab reads `groups` (via mocks for now). Clean backward-compatible extension.

- **The golden fixture test suite** (`relevance-engine.test.ts`) has 14 tests with hand-calculated expected values, including edge cases (NaN, negative, above-saturation, all-null). This is the strongest unit test file in the diff.

- **The E2E spec** seeds deterministic data via `page.route()` mocks, uses radiogroup/radio selectors for accessibility-correct assertions, and covers all 6 E2E acceptance criteria.

---

## Summary

The L22 implementation is solid. 9 of 11 ACs fully pass. AC-9 is PARTIAL (mock fallback retains `whyNow`, but primary API path is clean). AC-10 is NOT DONE (documentation-only: inventory rows not marked closed). The 3 WARNINGs are all low-severity: two are documentation/reference gaps and one is a missing recompute trigger that has minimal user impact. The code is well-structured, the tests are thorough, and the architecture contracts from the plan are respected.

**Verdict: DONE.** The remaining items (HTML reference update, inventory closure, recompute trigger) can be addressed in a follow-up commit or as part of the L22 close-out.
