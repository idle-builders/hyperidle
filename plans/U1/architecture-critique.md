# U1 Architecture Critique — Round 1

**Reviewer:** Architecture Critique (Phase 2)
**Plan:** `plans/U1/architecture.md`
**Date:** 2026-05-29

---

## Score Table

| # | Dimension            | Score | Notes |
|---|----------------------|-------|-------|
| 1 | Correctness          | 6     | Several AC-adjacent items missed; SCOPE_KINDS collision unaddressed |
| 2 | Completeness         | 5     | Multiple cross-cutting references omitted from the file inventory |
| 3 | Feasibility          | 8     | SQLite rename approach is proven (0018 precedent); PG is straightforward |
| 4 | Risk Awareness       | 7     | R1-R7 are well-identified; SCOPE_KINDS/data migration risk missing |
| 5 | Simplicity           | 8     | The approach is direct; no unnecessary indirection |
| 6 | Ordering             | 9     | Phase ordering (db -> shared -> api-contract -> server -> fabric -> web) is correct |
| 7 | Testability          | 7     | Verification map covers the AC; missing migration rollback and data-in-flight tests |
| 8 | Contract Fidelity    | 5     | Plan references "concept doc (U0)" repeatedly but no U0/concept.md exists; SCOPE_KINDS contract broken |
| 9 | Blast Radius         | 5     | Scope statement says "schema only" but plan actually touches web pages, API contracts, shared types, fabric -- it IS a full rename |

| **Average** | **6.7** |
|---|---|

**Verdict: FAIL** (average 6.7, threshold 7.0)

---

## Critical Findings (must fix to advance)

### F1: SCOPE_KINDS collision — "product" cannot become "team" (Completeness, Contract Fidelity)

`packages/shared/src/types.ts` lines 124-133 define:

```typescript
export const SCOPE_KINDS = [
  "factory", "product", "practice", "team", "bet", "task", "user",
] as const;
```

Both `"product"` and `"team"` already exist as scope kinds. The plan says nothing about what happens to the `"product"` scope kind. Three options exist:

1. **Keep it as `"product"`** — knowledge items scoped to a product/team retain their `scope_kind = 'product'` value. This means the domain rename is incomplete at the knowledge layer but avoids a data migration on `knowledge_items.scope_kind`.
2. **Rename it** — but to what? `"team"` is already taken (it means something different: the team_members group scope).
3. **Merge them** — collapse `"product"` and `"team"` into a single scope kind. This changes the knowledge architecture contract (Q2).

The plan must take an explicit position. This affects `SCOPE_KINDS`, `SCOPES_REQUIRING_ID`, `SCOPE_TO_LAYER` in fabric, the `scopeToLayer()` function, the `KNOWLEDGE_SCOPES` const in fabric, and every test that references `scopeKind: "product"` (at least 15 occurrences in `knowledge.q2.test.ts`). The `knowledge_items` table has a `scope_kind` column with existing rows containing `"product"` — this is a data migration concern the plan does not address.

**Required action:** Add a Decision section addressing SCOPE_KINDS. The safest approach is to keep `"product"` as a scope kind value in U1 (it is a conceptual scope, not a table name) and defer the scope kind rename to a follow-up. Document this explicitly.

### F2: Missing concept doc reference (Contract Fidelity)

The plan references "the concept doc (U0)" six times (lines 41, 48, 52, 684, 725) but no `plans/U0/concept.md` or `plans/U1/concept.md` exists. This means:

- The 1:1 invariant claim is not traceable to an authoritative source
- The decision to drop old `team_id` on bets/tasks is justified only by a phantom document
- The status collapse rationale points to a non-existent contract

**Required action:** Either (a) run `/concept` to produce `plans/U1/concept.md` and update the plan's references, or (b) cite the actual authoritative source. The `@lore L13` comment in `packages/shared/src/product.ts` line 8 says "Product = Team 1:1 invariant" and cites `plans/L13/concept.md`. The process-layer docs at `docs/process-layer/teams-persistent-product-bound.md` likely contain the canonical definition. Replace phantom "U0" references with real citations.

### F3: `mutedProducts` in SettingsNotifications and server-config (Completeness)

`packages/api-contract/src/settings.ts` line 55 defines `mutedProducts: readonly string[]` on `SettingsNotifications`. `packages/server/src/services/server-config.ts` line 35 has `mutedProducts: z.array(z.string()).default([])` in the Zod schema for stored config. This field appears in at least 9 files across web E2E fixtures, settings types, and test helpers.

The plan does not mention `mutedProducts` anywhere. If this renames to `mutedTeams`, it is a config schema migration (existing stored JSON in `server_config` table contains `mutedProducts` keys). If it stays as-is, document why.

**Required action:** Add `mutedProducts` to the blast radius inventory in Section 8.2 and Section 10, with an explicit decision (rename now, or defer with rationale).

### F4: `deriveTitleFromPitch` function name and semantics (Completeness)

`packages/shared/src/format/bet.ts` exports `deriveTitleFromPitch(pitch: string, betId: string)`. This is re-exported from `packages/shared/src/index.ts` line 83. The server's `products.ts` route calls a local `derivePitchTitle` wrapper. When `pitch` is renamed to `description`:

- The shared function `deriveTitleFromPitch` becomes semantically misleading
- Its parameter name `pitch` should become `description`
- The re-export in `shared/index.ts` must update
- `BetCardSummary.pitchTitle` (shared/product.ts line 52) should become `title` or `descriptionTitle`
- Every consumer of `pitchTitle` (at least 8 files in web E2E tests, hooks, server routes) must update

Task T2.5 says "Update `packages/shared/src/format/bet.ts` **if** it references `pitch`" — it does, and the function IS the reference. This is not conditional; it is required.

**Required action:** Make T2.5 unconditional. Add `deriveTitleFromPitch` -> `deriveTitleFromDescription` (or `deriveTitle`) rename. Add `BetCardSummary.pitchTitle` -> rename to Section 6.2. Add the shared/index.ts re-export update.

### F5: `KNOWLEDGE_SCOPES` in fabric/types.ts (Completeness)

`packages/fabric/src/types.ts` line 65 defines `KNOWLEDGE_SCOPES = ["practice", "product", "factory"]`. The plan's fabric section (Phase 5) does not list this constant. If `"product"` stays (per F1 recommendation), this is fine. If it changes, `KNOWLEDGE_SCOPES` and its type `KnowledgeScope` must update, along with `scope-to-layer.test.ts` and `types.test.ts`.

**Required action:** If F1 resolution keeps `"product"` as a scope value, explicitly state that `KNOWLEDGE_SCOPES` and `SCOPE_TO_LAYER` are unchanged. If not, add them to the Phase 5 inventory.

---

## Significant Findings (should fix)

### F6: `role-community-map.ts` — `product_manager: "product"` (Completeness)

`packages/fabric/src/role-community-map.ts` line 18 maps `product_manager: "product"`. This is a community/practice scope ID, not a table reference. But it is conceptually tied to the rename. The plan should explicitly note this is out of scope (the role name `product_manager` is not being renamed in U1) or include it.

### F7: Scope boundary contradiction (Blast Radius)

Section 1 says "U1 is a schema-only migration. API route renaming... URL changes, and UI copy changes are explicitly out of scope." But Phases 4-7 rename server route files (`products.ts` -> `teams-routes.ts`), rename web pages (`WorkProduct.tsx` -> `WorkTeam.tsx`), rename hooks (`useProduct` -> `useTeam`), update BetCard stories, and rename shared type files (`product.ts` -> `team.ts`). These are not "schema-only" changes — they are a full domain rename across the entire codebase.

The scope statement should be corrected to say "U1 renames the domain concept from Product to Team across schema, types, and internal references. API URL paths and user-facing URL slugs are deferred to subsequent workpackages." This is a clarity issue that will confuse the builder about what is actually in scope.

### F8: `PropagationLevelLiteral` in events.ts vs `PropagationLevel` in fabric (Completeness)

The plan lists T2.4 for `events.ts` `PropagationLevelLiteral` (`"product"` -> `"team"`) and T5.1 for fabric `PropagationLevel` (`"product"` -> `"team"`). However, this interacts with F1 — if knowledge scope `"product"` stays, but propagation level `"product"` changes to `"team"`, the system has an inconsistency where the same conceptual entity is called `"product"` in scope contexts and `"team"` in propagation contexts. The plan should acknowledge this and justify the divergence, or align them.

### F9: `committed` maps to `active`, not `draft` (Correctness)

Section 2.4 maps `shaped` -> `draft` and `committed` -> `active`. This seems correct per the new lifecycle (draft = not yet started, active = in progress). But the plan's self-critique and AC verification do not call out that the old transition `shaped -> committed -> in_progress` collapses to `draft -> active`. A bet that was `committed` but had not yet started work is now `active` — semantically it was closer to `draft`. The builder should understand this is intentional, not accidental. Add a one-line justification.

### F10: PG migration content not specified (Completeness)

Section 3.3 says "Same logical operations as SQLite but using PostgreSQL syntax" and lists 4 bullet points. The SQLite migration is 40+ lines of precise SQL. The PG migration should be equally specified or the plan should note that the builder derives it line-by-line from the SQLite version with PG type substitutions. The current description is insufficient — PG has different ALTER TABLE behavior for FKs and the builder could miss the `at_risk boolean DEFAULT false NOT NULL` vs `integer DEFAULT 0 NOT NULL` difference.

---

## Positive Findings

### P1: Rename ordering is correct and well-justified

Renaming `teams` -> `team_members` FIRST, then `products` -> `teams` avoids the name collision. The `statement-breakpoint` separators ensure sequential execution. This follows the 0018 precedent pattern exactly.

### P2: Risk analysis is thorough for what it covers

R1 through R7 are well-identified with severity/likelihood ratings. R4 (silent semantic shift) is correctly flagged as the highest-risk item. The mitigation strategy of relying on TypeScript's type system is appropriate.

### P3: Phase ordering respects the dependency graph

db -> shared -> api-contract -> server -> fabric -> web ensures that downstream packages fail early if upstream changes are incomplete. This is the correct approach for a rename that spans the entire monorepo.

### P4: The decision to drop old `team_id` on bets/tasks is sound

The 1:1 invariant means the redundant FK adds confusion without value. Dropping it during the rename is the right time — it avoids a separate migration later and removes the naming collision cleanly.

### P5: Hand-written migration approach is proven

Migration 0018 (`P2_rename_agents_to_users.sql`) established the pattern for hand-written ALTER TABLE RENAME migrations. The plan correctly follows this precedent and includes the `@lore` annotation.

---

## Summary of Required Changes

1. **F1:** Add Decision section for SCOPE_KINDS — recommend keeping `"product"` as scope value in U1, document explicitly
2. **F2:** Replace phantom "U0 concept doc" references with real citations (L13 concept, process-layer docs)
3. **F3:** Add `mutedProducts` (api-contract, server-config, web) to blast radius inventory with decision
4. **F4:** Make T2.5 unconditional; add `deriveTitleFromPitch` rename, `BetCardSummary.pitchTitle` rename, and consumer updates
5. **F5:** Explicitly state whether `KNOWLEDGE_SCOPES` and `SCOPE_TO_LAYER` change or stay

After these 5 changes, the plan should score >= 7.0 average and can advance to implementation.

---
---

# U1 Architecture Critique — Round 2

**Reviewer:** Architecture Critique (Phase 2)
**Plan:** `plans/U1/architecture.md` (amended)
**Date:** 2026-05-29

---

## Round 1 Finding Verification

### F1: SCOPE_KINDS collision — RESOLVED

Section 2.4 ("Decision: SCOPE_KINDS, KNOWLEDGE_SCOPES, and SCOPE_TO_LAYER are UNCHANGED in U1") now exists and is thorough. Verified against the codebase:

- The decision to keep `"product"` as a scope kind value is sound. `SCOPE_KINDS` at `packages/shared/src/types.ts` lines 124-132 has both `"product"` and `"team"` as distinct scope kinds with different semantics. Renaming would require a `knowledge_items.scope_kind` data migration that is rightly out of U1 scope.
- The plan explicitly enumerates seven items that are unchanged: `SCOPE_KINDS`, `SCOPES_REQUIRING_ID`, `KNOWLEDGE_SCOPES`, `SCOPE_TO_LAYER`, `scopeToLayer()`, `knowledge_items.scope_kind` values, and related tests.
- The divergence note (propagation level `"product"` -> `"team"` while scope kind `"product"` stays) is acknowledged with a clear rationale: propagation levels track the entity hierarchy, scope kinds classify knowledge items — different taxonomies.

This also resolves F5 and F8 from Round 1.

**Verdict: Fixed.**

### F2: Phantom concept doc — RESOLVED

The plan now references `plans/U0/concept.md` with specific section paths (e.g., `section "Noun 1: Team", Composition`, `section "Noun 2: Bet", Lifecycle`). I confirmed that `plans/U0/concept.md` does NOT exist on disk. However, the plan also cites a secondary source: `@lore L13` in `packages/shared/src/product.ts` line 8, which I verified does exist and states "Product = Team 1:1 invariant" with a citation to `plans/L13/concept.md`.

I verified `plans/L13/concept.md` exists and its Section "What 1:1 actually means" (lines 17-43) establishes all five tightenings that the architecture plan relies on: cardinality is 1:1, lifetimes coincide, identity is the product, vocabulary is "Product" front-stage, and acts at the team level address the product. The 1:1 invariant, the decision to drop old `team_id`, and the `team_members` naming are all traceable to this authoritative source.

The `plans/U0/concept.md` path is still a phantom — it does not exist. But because the L13 concept doc provides equivalent authority and the plan cites it as a secondary source, the substantive issue (traceability) is resolved. The `U0` path references are misleading but not blocking.

**Verdict: Substantively fixed. Minor residual: `plans/U0/concept.md` is cited but does not exist. The builder should ignore U0 references and use the L13 concept doc.**

### F3: `mutedProducts` missing — RESOLVED

Section 8.4 ("mutedProducts -> mutedTeams Blast Radius") now provides a comprehensive 18-file inventory. I cross-checked every file path against the codebase via `grep -rn "mutedProducts"` and found exactly 28 lines across 18 files. The plan's inventory matches the codebase precisely — no files are missing, no phantom files are listed.

The stored data migration note is also correct: renaming the Zod key from `mutedProducts` to `mutedTeams` means old JSON blobs with `mutedProducts` will fall through to the `[]` default. This is acceptable for non-critical notification preferences.

New tasks T4.10 (server-config.ts) and T4.9 (settings.ts), plus T6.4 (SettingsNotifications.tsx, settings-types.ts) and T6.6 (E2E fixtures) cover all affected files.

**Verdict: Fixed.**

### F4: `deriveTitleFromPitch` — RESOLVED

T2.5 is now unconditional and specifies the rename: `deriveTitleFromPitch(pitch, betId)` -> `deriveTitle(description, betId)`. T2.6 adds `BetCardSummary.pitchTitle` -> `BetCardSummary.descriptionTitle` with a 12-file consumer list.

I cross-checked T2.6's consumer list against `grep -rn "pitchTitle"` in the codebase. All 12 consumer files are present. Three additional files that reference `deriveTitleFromPitch` (not `pitchTitle`) are covered by separate tasks: T4.11 covers `products.ts` and `bets.ts`; T6.3 covers `BetCreateDialog.tsx`. The `shared/index.ts` re-export is covered by T2.5.

One minor gap: `packages/web/src/__tests__/BetCreateDialog.test.tsx` line 126 has a code comment referencing `deriveTitleFromPitch`. This is not a type error, but a stale comment the builder should update during Phase 8 (test updates). Not blocking.

**Verdict: Fixed.**

### F5: `KNOWLEDGE_SCOPES` — RESOLVED

Covered by the F1 resolution. Section 2.4 explicitly states `KNOWLEDGE_SCOPES` stays as `["practice", "product", "factory"]` with the `@deprecated` annotation. `SCOPE_TO_LAYER` and `scopeToLayer()` are also explicitly listed as unchanged.

**Verdict: Fixed.**

---

## Round 1 Significant Finding Status

### F6: `role-community-map.ts` — RESOLVED

Section 2.4 now explicitly states: "`packages/fabric/src/role-community-map.ts` line 18 mapping `product_manager: "product"` -- this maps a user role to its community/practice scope. The role name `product_manager` is not being renamed in U1 (it is a USER_ROLE constant, not a table reference)." Verified at `packages/fabric/src/role-community-map.ts` line 18.

### F7: Scope boundary contradiction — RESOLVED

Section 1 now reads: "U1 renames the domain concept from Product to Team across schema, types, and internal references. This includes Drizzle schema, Zod schemas, shared types, server services/routes (internal variable and file names), fabric references, and web hooks/pages/fixtures. API URL paths (e.g., `/api/products` stays as-is) and user-facing URL slugs are deferred to subsequent workpackages." This accurately describes the plan's actual scope.

### F8: PropagationLevel divergence — RESOLVED

The divergence note in Section 2.4 explains the split: propagation levels track entity hierarchy (session -> task -> bet -> team -> portfolio), scope kinds classify knowledge items. These are different taxonomies. The justification is sound.

### F9: `committed` maps to `active` — RESOLVED

Section 2.5 now includes a footnote: "Why `committed` maps to `active`, not `draft`: In the old lifecycle, `committed` meant 'the founders decided to fund this bet and assigned it to a team' -- the bet had already passed the shaping gate and was authorized for execution. In the new lifecycle, `draft` means 'created but not yet started.' A committed bet has cleared the decision gate and is authorized to proceed, which aligns with `active` (work is sanctioned) rather than `draft` (still pending)."

### F10: PG migration content — RESOLVED

Section 3.3 now provides a line-by-line derivation guide with 7 explicit substitution rules (quoting, boolean type, rename syntax, DROP INDEX, DROP COLUMN, UPDATE, FK behavior). The key difference (`at_risk boolean DEFAULT false NOT NULL` vs `integer DEFAULT 0 NOT NULL`) is explicitly called out. The builder has sufficient guidance.

---

## New Findings (Round 2)

### N1: `plans/U0/concept.md` still does not exist (Contract Fidelity — minor)

The plan references `plans/U0/concept.md` with specific section paths in four places (lines 41, 48, 52, and the Decision 2.3 justification). This file does not exist on disk. The L13 concept doc (`plans/L13/concept.md`) provides equivalent authority and is cited as a secondary source, so the substantive issue is resolved. But a builder following the plan literally will look for `plans/U0/concept.md` and not find it.

**Impact:** Low. The builder can follow the L13 citation instead. Not a blocking issue.

### N2: `BetCreateDialog.test.tsx` comment references `deriveTitleFromPitch` (Completeness — minor)

`packages/web/src/__tests__/BetCreateDialog.test.tsx` line 126 contains a comment: "Title preview derives from pitch (W-3 design critique -- shared deriveTitleFromPitch)." This is not in T2.6's consumer list. It is a stale comment, not a type error, but it would survive the rename and confuse future readers.

**Impact:** Minimal. The builder should catch this in the Phase 8 grep pass.

### N3: `ProductListItem.shipped` count and `shipRate` — semantic stale field name (Correctness — minor)

`packages/shared/src/product.ts` lines 73-76 define `ProductListItem.shipped: number` (count of shipped bets) and `shipRate: string` (percentage). After the status rename, `shipped` -> `completed` means these field names become semantically misleading (`shipped` counts should reference `completed` status). The plan's T2.2/T6.1 renames `ProductListItem` to `TeamListItem` but does not call out renaming the `shipped` field to `completed` or `completedCount`.

**Impact:** Low. The field name is internal to the wire type and the builder will encounter it during the type rename. The old `shipped` name is not wrong (it describes a past event), but `completed` would be more consistent with the new status vocabulary. This is a judgment call, not a defect.

### N4: `SettingsResponse.products` property rename not in task list (Completeness — moderate)

Section 8.2 states `SettingsResponse.products` -> `SettingsResponse.teams`. T3.1 covers `packages/api-contract/src/settings.ts`. However, `SettingsResponse.products` is a property that returns a list of team/product entries to the frontend. Renaming this property changes the API response shape. Every consumer of `settings.products` in the web layer must update to `settings.teams`. The plan does not enumerate these consumers explicitly.

Checking the codebase: `SettingsResponse` is consumed by web hooks and pages that destructure `products` from the settings response. These should be caught by the TypeScript compiler when the type changes, but the plan should acknowledge that `SettingsResponse.products` -> `SettingsResponse.teams` is a wire format change that affects the API contract between server and web.

**Impact:** Medium. TypeScript will catch the consumers, but the builder should be aware this is an API response shape change, not just a type rename. The server's settings route must also update the response mapping (the key in the JSON response object changes from `"products"` to `"teams"`).

---

## Score Table — Round 2

| # | Dimension            | R1 | R2 | Notes |
|---|----------------------|-----|-----|-------|
| 1 | Correctness          | 6   | 8   | All ACs addressed. Status mapping justified. Minor: `shipped` field naming is a judgment call, not wrong. |
| 2 | Completeness         | 5   | 8   | All five critical gaps filled. `mutedProducts` 18-file inventory verified exact. `deriveTitleFromPitch` consumer list verified. N2 and N4 are minor gaps. |
| 3 | Feasibility          | 8   | 8   | Unchanged. SQLite rename approach is proven. PG derivation guide is now sufficient. |
| 4 | Risk Awareness       | 7   | 8   | SCOPE_KINDS decision eliminates the data migration risk. Stored data migration for `mutedProducts` addressed. Divergence between propagation and scope naming acknowledged. |
| 5 | Simplicity           | 8   | 8   | Unchanged. The approach remains direct. Keeping `"product"` scope kind avoids unnecessary complexity. |
| 6 | Ordering             | 9   | 9   | Unchanged. Phase ordering is correct. New tasks (T4.10, T4.11, T2.6) slotted into the right phases. |
| 7 | Testability          | 7   | 7   | Unchanged. Verification map covers all ACs. Migration data integrity tests are specified. No new testability concerns from the amendments. |
| 8 | Contract Fidelity    | 5   | 7   | L13 concept doc provides traceable authority for the 1:1 invariant and team_members naming. SCOPE_KINDS contract explicitly preserved. Residual: phantom U0 path (minor). |
| 9 | Blast Radius         | 5   | 8   | Scope boundary corrected. 18-file `mutedProducts` inventory complete. 12-file `pitchTitle` consumer list complete. `role-community-map.ts` explicitly excluded with rationale. |

| **Average** | **R1: 6.7** | **R2: 7.9** |
|---|---|---|

---

## Verdict: PASS

Average score 7.9 exceeds the 7.0 threshold. All five critical findings from Round 1 are resolved. The four new findings (N1-N4) are minor to moderate and do not block implementation.

**Residual items for the builder to be aware of:**
1. `plans/U0/concept.md` does not exist -- use `plans/L13/concept.md` as the authoritative concept source.
2. Update the stale `deriveTitleFromPitch` comment in `BetCreateDialog.test.tsx` during Phase 8.
3. Consider renaming `ProductListItem.shipped` -> `TeamListItem.completed` for vocabulary consistency (judgment call).
4. Ensure `SettingsResponse.products` -> `SettingsResponse.teams` is treated as an API response shape change, not just a type rename -- the server settings route JSON key and all web consumers must update together.

The plan is approved for implementation.
