# Architecture Critique: R2

ARCHITECTURE-SCORE: 8/10 rounds=1 score-line: SA:8 LI:10 AC:8 DM:9 N:9 MD:9 FMC:7 S:9 V:7

---

## Dimension Scores

### 1. Spec Alignment — 8/10

Every acceptance criterion maps to at least one task:

| AC | Plan Task | Covered? |
|----|-----------|----------|
| Setup has two required fields (name, API key). Repo path optional. Product name optional (defaults). | Task 2 (SetupFlow simplification) | Yes |
| Backend mode selection removed from setup | Task 2 | Yes |
| Email field removed from setup | Task 1 (email optional in API) + Task 2 | Yes |
| Product created silently with defaults | Task 2 (handleSubmit derives product name) | Yes |
| After setup, routes to /work/portfolio | Task 2 + Task 5 (FirstRunRedirect) | Yes |
| BetCreateDialog requires only title and pitch. Product picker removed. | Task 3 | Yes |
| "Create bet" is most prominent action on WorkPortfolio when no bets exist | Task 4 | Yes |

Constraint: "Setup must still create valid user + product + team" — Task 2 calls POST /api/users and POST /api/products, which creates the team via the existing product creation endpoint. Verified: the product creation route in the codebase creates a team alongside the product. Covered.

Constraint: "Existing Settings must still allow editing product name, adding repo path, configuring email" — The plan correctly marks Settings as out-of-scope for changes. The PATCH /api/users/:id endpoint already accepts optional email. Covered.

Constraint: "No new UI components" — The plan explicitly states zero component budget. Covered.

**WARNING: The spec says "BetCreateDialog requires only title and pitch."** The architecture plan (Task 3) removes the product picker and appetite fields, leaving pitch textarea + title preview. However, "title" in the spec could mean a title input field, not the derived title preview. The plan interprets "title" as the derived preview (read-only), which matches the existing component behavior where the title is derived from the pitch via `deriveTitleFromPitch`. This interpretation is correct given the existing codebase semantics, but the plan should state this interpretation explicitly to prevent a builder from adding a separate title input field.

No scope-creep tasks detected. Every task traces to an AC or a forced dependency (Task 1 is a forced dependency for Task 2; Task 6 is a forced consequence of Tasks 1-5).

### 2. Layer Integrity — 10/10

The plan maintains strict layer boundaries:
- Task 1 (backend): modifies `packages/server` Zod schema only. No frontend changes.
- Tasks 2-5 (frontend): modify `packages/web` components only. No server-side changes beyond Task 1.
- No cross-layer reach. The frontend calls the same REST endpoints (POST /api/users, POST /api/products) through `apiFetch`. No direct DB access from web.
- No new packages or cross-package imports introduced.

No findings.

### 3. API Contracts — 8/10

The plan clearly specifies the single API change:

| Endpoint | Change | Request shape | Response shape |
|----------|--------|---------------|----------------|
| POST /api/users | `email` becomes optional | `{ name: string, email?: string }` | Unchanged (user object) |
| POST /api/products | No change | Unchanged | Unchanged |
| POST /api/bets | No change (costAppetite already optional) | `{ productId, pitch }` | Unchanged |

The plan correctly identifies that making `email` optional in the Zod schema (`z.string().email().max(200).optional()`) is the only backend change, and that the DB column is already nullable (`text("email")` without `.notNull()`). Verified against codebase: line 42 of `packages/db/src/schema.ts` confirms `email: text("email")` — no `.notNull()`.

**WARNING: The plan does not specify what happens to the existing test `"returns 400 when email is missing"` in `users-create.test.ts` (line 133-140).** After making email optional, this test should now expect 201 (success) instead of 400. The plan's Task 6d says "add test for user without email" and "creates user with email (backward compatible)" but does not explicitly call out that the existing "returns 400 when email is missing" test must be removed or inverted. The builder will discover this when tests fail, but the plan should enumerate it.

### 4. Data Model Alignment — 9/10

No schema changes. No new tables, columns, or migrations. The plan correctly identifies this as zero schema impact.

The plan's claim that "the email column in the users table is already nullable (text type, no `.notNull()`)" is verified against line 42 of `packages/db/src/schema.ts`: `email: text("email")`. Correct.

The plan's claim that "Drizzle handles undefined as NULL" for the email field insertion is correct for Drizzle ORM's SQLite driver — undefined values in the insert object are treated as NULL when the column allows it.

No findings.

### 5. Naming — 9/10

No new names introduced. The plan uses existing names throughout:
- `canStart` — existing variable, condition changes
- `derivedProductName` — new local variable, name is self-documenting
- `singleProduct` — new local boolean, clear
- `resolvedProductId` — new local variable, describes exactly what it does

No domain-term conflicts. "Default product" is correctly identified in the concept assessment as a presentation concern, not a new entity.

No findings.

### 6. Module Depth — 9/10

The plan modifies existing components in place. No new modules, no new exports, no new abstractions. The BetCreateDialog's conditional product picker logic (`singleProduct ? products[0].id : productId`) is inline, not extracted to a helper — appropriate for a single-use conditional.

The only new export-level concern is the EmptyState `action` slot usage, which is already part of the EmptyState public interface (`action?: ReactNode`). Verified against `packages/design-system/src/EmptyState.tsx` line 18.

No findings.

### 7. Failure-Mode Coverage — 7/10

**WARNING: The plan does not address what happens if the credential storage call fails.**

Task 2's `handleSubmit` sequence is: create user -> create product -> store API key -> navigate. The current code (line 119) stores the API key via `window.__HYPERIDLE__.credentials.set("anthropic", apiKey.trim())`. In the current implementation, this is wrapped in a conditional (`if (apiKey.trim() && window.__HYPERIDLE__?.credentials?.set)`), but in R2 the API key is required. If the bridge's `credentials.set` throws or the bridge is unavailable (web-only mode without Electron), the user has completed setup (user + product created in DB) but the API key is not stored. The plan does not specify error handling for this case.

This is a pre-existing issue (the current code also has this gap), but R2 makes it worse because the API key is now required — a user who fails to store the key has no way to re-enter setup.

**SUGGESTION:** Add a note that `credentials.set` failure should be caught and the user should be warned but setup should still complete (the key can be re-added in Settings).

**The plan correctly identifies these error paths:**
- Product creation failure: show error inline (existing pattern)
- User creation failure: show error inline (existing pattern)
- Invalid repo path: tolerate gracefully, fall back to "My Product"

**Security assessment (STRIDE):**
- The API change (email optional) does not weaken any security boundary. POST /api/users still has the auth-bypass-only-when-no-human check.
- No new endpoints, no new trust boundaries, no new input surfaces.
- Rate-limiting: not applicable (no new endpoints).
- The existing authentication model is unchanged.

### 8. Simplicity / Over-Engineering Risk — 9/10

The plan is admirably simple. It is pure subtraction with minimal addition:
- Remove 4 state variables from SetupFlow
- Remove 3 JSX sections from SetupFlow
- Remove 2 state variables from BetCreateDialog
- Remove 1 JSX section from BetCreateDialog
- Add 1 conditional (product picker visibility)
- Add 1 EmptyState with action prop
- Change 1 redirect target
- Change 1 Zod schema field from required to optional

No abstractions, no helpers, no feature flags, no registries. No design-it-twice needed — there is only one reasonable way to remove fields from a form.

**One potential over-engineering smell:** The BetCreateDialog plan keeps the `products` prop and adds conditional rendering based on `products.length > 1`. This is forward-compatible for multi-product scenarios. Since the spec says "product picker is removed (uses default product)," the simplest approach would be to hard-code `products[0].id` and remove the select entirely. However, the plan's approach is only 3 lines of extra code and prevents a future regression when multi-product support is needed. This is reasonable pragmatism, not over-engineering.

No findings.

### 9. Verifiability — 7/10

**WARNING: Task 6 is listed as a separate final step, but the plan itself says "in practice, each task includes its own test updates."** This contradiction leaves the test ordering ambiguous. The TDD discipline requires failing tests first, then implementation. The plan should either:
(a) Remove Task 6 and fold test changes into each task (making each task a red-green cycle), or
(b) Keep Task 6 but explicitly label Tasks 1-5 as "implementation only" and Task 6 as "update broken tests + add new assertions."

Option (a) aligns with the project's TDD rules. Option (b) is the plan's actual structure. The plan says both things simultaneously.

**The plan specifies concrete test names for each change area:**
- Task 6a: 8 test cases listed for SetupFlow (add/remove/update)
- Task 6b: 4 test cases listed for BetCreateDialog
- Task 6c: 3 test cases listed for WorkPortfolio
- Task 6d: 2 test cases listed for users-create

**WARNING: The plan does not mention existing tests that will break due to the WorkPortfolio changes.** The existing `WorkPortfolio.test.tsx` has a test "does not render the bet Canvas" (line 76) that asserts `data-droppable="shaped"` and `data-droppable="committed"` are NOT present. However, the production `WorkPortfolio.tsx` already renders the Canvas component. This is a pre-existing test/code mismatch. R2's Task 4 adds an EmptyState above the Canvas, which does not change the Canvas rendering itself, but the builder should be aware of this pre-existing inconsistency. The plan should flag it.

**SUGGESTION:** The plan does not mention Playwright E2E tests. The project rules say "Every workpackage with UI must have E2E tests proving the feature works through the browser." R2 touches three UI surfaces (SetupFlow, WorkPortfolio, BetCreateDialog). At minimum, the plan should note whether E2E tests are in scope or explicitly deferred with rationale.

---

## Pre-Existing Codebase Issue Flagged

The existing `WorkPortfolio.test.tsx` test at line 76-86 asserts "does not render the bet Canvas" but the production component at line 204-213 does render `<Canvas>`. This test passes because the mock of `useProducts` does not mock `useCanvasBets`, which returns empty bets by default, and the Canvas with empty bets may not render the `data-droppable` attributes. This is a fragile test that will break if `useCanvasBets` changes its default return value. R2 does not cause this issue, but the builder should be aware.

---

## Findings Summary

### CRITICAL
None.

### WARNING
- [Plan, Task 3] The spec says "BetCreateDialog requires only title and pitch" but the plan interprets "title" as the derived preview, not an input field. This is the correct interpretation given the existing codebase, but the plan should state this explicitly to prevent builder confusion.
- [Plan, Task 6d] The plan does not enumerate that the existing test "returns 400 when email is missing" (`users-create.test.ts` line 133-140) must be removed or inverted after making email optional. Builder will discover this at test runtime, but the plan should list it.
- [Plan, Task 6 vs Tasks 1-5] The test ordering is contradictory: Task 6 is a separate step, but the plan says tests should be written alongside each task. Pick one structure.
- [Plan, Task 6c] The plan does not mention the pre-existing `WorkPortfolio.test.tsx` assertion "does not render the bet Canvas" (line 76) which contradicts the production code. The builder should be made aware.

### SUGGESTION
- [Plan, Task 2] Specify error handling for `credentials.set` failure when the bridge is unavailable. This is a pre-existing gap that R2 amplifies.
- [Plan, Task 6] Add a note about Playwright E2E test scope — either in-scope with specific test names, or explicitly deferred with rationale.

### What's Working Well
- The plan is genuinely subtractive. Zero new components, zero new endpoints, zero schema changes, zero new abstractions. This is the hardest kind of plan to write well because the temptation to "improve while you're in there" is strong. The plan resists it.
- The API change table clearly separates what changes (POST /api/users email optional) from what doesn't (every other endpoint). This makes the blast radius immediately clear to the builder.

## Verdict

Score 8/10 — passes the 7/10 threshold. The plan is ready for the build phase. The warnings are documentation gaps and a test-ordering ambiguity, none of which block implementation. The builder should read this critique alongside the plan to be aware of the flagged edge cases.
