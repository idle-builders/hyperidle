# AB0 Architecture Critique

**Reviewer:** Phase 2 Reviewer
**Plan:** `plans/AB0/architecture.md`
**Concept:** `plans/AB0/concept.md`, `docs/agent-layer/agent-structure.md`
**Round:** 1

---

## Scores

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Correctness | 8 | Plan faithfully implements the concept. One critical omission (see F-01). |
| 2 | Completeness | 5 | Three files missed entirely (F-01, F-02, F-03). One AC partially addressed. |
| 3 | Consistency | 9 | Types, schema, seed data, and catalog are internally consistent. |
| 4 | Testability | 8 | Verification methods are well-defined. Minor gap on prompt-composition tests. |
| 5 | Security | 8 | Open role string is properly bounded. Category immutability is enforced. |
| 6 | Simplicity | 9 | No over-engineering. Catalog approach is the minimum viable structure. |
| 7 | Dependency correctness | 8 | Task ordering is mostly correct. One dependency error (F-05). |
| 8 | Migration safety | 7 | Migration SQL is safe. Migration checklist incomplete (F-01, F-02, F-03). |
| 9 | Contract stability | 8 | Contracts are stable for AB1-AB3. Minor concern about `defaultRoster` signature. |

**Overall: 7.8 -- PASS**

---

## Findings

### Critical (must fix before build)

**F-01: `prompt-composition.ts` is missing from the plan entirely.**

`packages/fabric/src/prompt-composition.ts` imports `ROLE_TO_COMMUNITY` (line 24) and uses it in `buildTemplateVariables()` (line 96):

```ts
const community =
    ROLE_TO_COMMUNITY[context.agent.role as keyof typeof ROLE_TO_COMMUNITY] ?? context.agent.role;
```

This file is not listed in the "Required reading" section, not in any Task's "Files to modify" list, not in the migration checklist, and not in any AC. When `ROLE_TO_COMMUNITY` is replaced with `communityForRole()` in Task 3, this consumer will break at compile time (the named export no longer exists). The builder will discover this during `npm run check`, but it should be planned, not discovered.

**Required action:** Add `packages/fabric/src/prompt-composition.ts` to Task 3 or Task 4 with instructions to replace the `ROLE_TO_COMMUNITY` import with `communityForRole`, remove the unsafe `as keyof typeof` cast, and update the call to `communityForRole(context.agent.role)`.

**F-02: `fabric/src/index.ts` re-exports `ROLE_TO_COMMUNITY` and is missing from the plan.**

`packages/fabric/src/index.ts` line 355 exports `ROLE_TO_COMMUNITY` from the role-community-map module:

```ts
export { ROLE_TO_COMMUNITY } from "./role-community-map.js";
```

When Task 3 replaces the file to export `communityForRole` instead, this barrel re-export will break. It must be updated to re-export `communityForRole` instead of `ROLE_TO_COMMUNITY`. Any external consumers importing from `@hyperidle/fabric` will also break.

**Required action:** Add `packages/fabric/src/index.ts` to Task 3 with instructions to replace the `ROLE_TO_COMMUNITY` re-export with `communityForRole`.

**F-03: `packages/web/src/settings/SettingsAgents.tsx` imports `USER_ROLES` and uses it to render role dropdowns -- missing from the plan.**

This file imports `USER_ROLES` from `@hyperidle/shared` (line 19) and iterates it in two places (lines 366, 529) to render `<option>` elements for the role selector. When `USER_ROLES` is removed in Task 1, this file will fail to compile.

The plan's concept says role is now an open string. The UI should either use `AGENT_ROLE_CATALOG.map(e => e.role)` for the dropdown or allow free-text entry. This is a decision the plan must make.

**Required action:** Add `packages/web/src/settings/SettingsAgents.tsx` to the migration checklist and to a task (likely Task 5 or a new task). Replace `USER_ROLES.map(...)` with `AGENT_ROLE_CATALOG.map(e => e.role)` for the dropdown options.

**F-04: `packages/server/src/routes/org.ts` uses `USER_ROLES` for org-edge `function` mechanism validation -- missing from the plan.**

`org.ts` line 94 validates that a `function`-mechanism org edge target is a member of `USER_ROLES`:

```ts
if (!(USER_ROLES as readonly string[]).includes(target)) {
```

This validation rejects unknown roles, which contradicts the open-string concept. With `USER_ROLES` removed, this code will not compile. The plan must decide: should org-edge function targets accept any role string, or should they validate against the catalog?

**Required action:** Add `packages/server/src/routes/org.ts` to the migration checklist. Replace `USER_ROLES` validation with either catalog-based validation or accept any non-empty string.

### Major

**F-05: Task 8 (seed data) depends on Task 9 (soul templates), but the dependency graph shows Task 9 depending on Task 8.**

The dependency graph says:

```
Task 9 (soul templates) ──> Task 8 (seed data)
```

This is backwards. Task 8 seed data loads soul templates from `docs/souls/`. If Task 9 creates the template files, then Task 8 must run after Task 9 (or handle missing files gracefully, which the existing code already does via `readSoulTemplate` returning null). The recommended execution order correctly lists Task 9 in the parallel group with Tasks 1+2, but the dependency graph arrow is inverted: it should be Task 9 --> Task 8 (Task 8 depends on Task 9), which is what is shown, but the description "Task 9 (soul templates) --> Task 8 (seed data)" is ambiguous about direction. Looking more carefully, the arrow does mean "Task 9 feeds into Task 8" -- so the direction is actually correct. However, the narrative "Recommended execution order: 1+2+9 (parallel)" is also correct. I retract this as a major finding but note the ambiguity.

**Retracted.** The arrow direction is correct (output flows left to right). No action needed.

**F-06: `prompt-composition.test.ts` references `ROLE_TO_COMMUNITY` and is missing from Task 11.**

`packages/fabric/src/__tests__/prompt-composition.test.ts` lines 176, 182 assert on `ROLE_TO_COMMUNITY` behavior in `buildTemplateVariables`. When the named export changes, these tests will break. Task 11 does not list this test file.

**Required action:** Add `packages/fabric/src/__tests__/prompt-composition.test.ts` to Task 11.

**F-07: Migration number should be `0022` per the last existing migration `0021`, but the journal entry timestamp `1782961400000` is hardcoded.**

The timestamp `1782961400000` corresponds to a date in 2026, which is fine. But hardcoding a journal timestamp is fragile -- Drizzle's `generate` command produces these. The builder should use `npm run db:generate` to produce the migration and journal entry, then verify the SQL matches the plan, rather than hand-writing the journal entry.

**Required action:** Note for the builder: prefer `npm run db:generate` over hand-writing journal entries.

### Minor

**F-08: `UserRole` kept as `type UserRole = string` introduces a "lie" type alias.**

The plan keeps `export type UserRole = string` for backward compatibility. This is pragmatic but misleading: downstream code that types a variable as `UserRole` is communicating "this is a validated agent role" when it is actually just `string`. The type alias provides zero type safety -- `const x: UserRole = "hello world"` compiles. This is fine for AB0 (migration scope), but the plan should note this as technical debt for future cleanup. Eventually, `UserRole` should be replaced with `string` everywhere or with a branded type.

**F-09: `defaultRoster` returns `readonly string[]` but the concept says the roster should also consider lifecycle phase ramp-up (section 5.3).**

The concept doc section 5.3 says not all roster agents are active from day one. The `defaultRoster` function returns just role strings with no indication of which should start as "paused". This is acceptable for AB0 scope (the function computes the roster, not the activation), but the plan should note this gap for AB1/AB2.

**F-10: `z.string().min(1).max(100)` for role validation -- max length 100 is undocumented in the concept.**

The concept says "any non-empty string is valid." The plan adds a 100-character max. This is a reasonable security constraint but it is not in the concept doc. The concept should be updated to note this constraint, or the plan should cite a security rationale.

**F-11: Category default is `"team"` for unknown catalog roles (Task 5, line 451).**

```ts
const category = data.agentCategory ?? catalogEntry?.category ?? "team";
```

If a user creates an agent with an unknown role and does not specify a category, it defaults to `"team"`. This is a reasonable default, but the concept doc does not specify a default category for unknown roles. This decision should be documented.

**F-12: The `teams` table schema shows the column will be added after `principlesPath`, but the actual schema has additional columns after that (`factoryDbPath`, `createdAt`).**

The plan says to add `functions` after `principlesPath`, but the actual `teams` table definition at schema.ts:16-26 shows `principlesPath` is followed by `factoryDbPath` and `createdAt`. The plan's instruction to add "after `principlesPath`" is positionally ambiguous in Drizzle (column order in the pgTable definition is semantic for TypeScript, not for SQL). This is cosmetic but could cause confusion.

---

## AC Coverage Audit

| AC | Covered by Task | Complete? | Notes |
|---|---|---|---|
| AC1 | Task 1 | Yes | |
| AC2 | Task 1, Task 12 | Yes | |
| AC3 | Task 1, Task 12 | Yes | |
| AC4 | Task 1 | Partial | Missing web and org.ts consumers (F-03, F-04) |
| AC5 | Task 2 | Yes | |
| AC6 | Task 2 | Yes | |
| AC7 | Task 3 | Partial | Missing prompt-composition.ts consumer (F-01), missing index.ts re-export (F-02) |
| AC8 | Task 5 | Yes | |
| AC9 | Task 8 | Yes | |
| AC10 | Task 8, Task 9 | Yes | |
| AC11 | Task 4, Task 6, Task 7 | Yes | |
| AC12 | Task 3, Task 4 | Yes | |
| AC13 | N/A (static) | Yes | File already exists |
| AC14 | Task 10 | Yes | |

---

## Verdict

**PASS (7.8/10)**

The plan is structurally sound and faithfully implements the concept. The catalog-based approach is well-designed. Type system changes, schema migration, and seed updates are consistent.

However, four files are entirely missing from the plan (F-01 through F-04). These will cause compile failures that the builder will discover during `npm run check`, but they should be planned -- a builder should not need to debug missing migrations. The builder should treat F-01 through F-04 as amendments to the plan and include those files in the appropriate tasks.

The plan can proceed to build with these amendments applied by the builder:

1. Add `prompt-composition.ts` to Task 3/4 (F-01)
2. Add `fabric/src/index.ts` to Task 3 (F-02)
3. Add `SettingsAgents.tsx` to a task (F-03)
4. Add `org.ts` to a task (F-04)
5. Add `prompt-composition.test.ts` to Task 11 (F-06)
