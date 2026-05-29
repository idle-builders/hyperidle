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
