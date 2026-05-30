# S1 Architecture Critique — Per-User Authentication

**Reviewer:** Phase 2 Architecture Critique
**Plan reviewed:** `plans/S1/architecture.md`
**Spec source:** `plans/work-packages/TRACK-S.md` (S1 section)
**Concept:** `plans/shared-server/concept.md` (locked)

---

## Score Table

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Completeness | 8 | Every AC is covered. Minor: the `id` column on `invite_codes` is an addition beyond the spec schema (spec says code, createdBy, claimedBy, role, expiresAt, createdAt — no `id`). Justified addition (REST addressing), but worth noting. Validation scenarios in Task 6 map 1:1 to the spec's validation scenarios. |
| 2 | Correctness | 9 | Schema follows existing patterns exactly: text PKs, text timestamps, FK references with `onDelete`, index naming. Token mechanics are sound (SHA-256 + timingSafeEqual). Middleware dual-strategy is cleanly designed. Migration number 0021 is correct (latest is 0020). |
| 3 | Consistency | 9 | Follows every codebase convention: text PKs (not UUID type), ISO 8601 text timestamps, `onDelete` policies matching rationale (cascade for owned resources, restrict for audit trails), index naming with `_idx` suffix, service functions taking `db: HyperIdleDb` as first arg (not classes). The `createPublicAuthRoutes` function mirrors `createUserSetupRoute` for pre-auth mounting. |
| 4 | Security | 8 | Constant-time comparison via SHA-256 + timingSafeEqual. Plaintext token never stored. Token never logged (explicitly stated in contracts). Bearer token as header (not cookie — no CSRF). One concern noted in SHOULD FIX below regarding `validateBearerToken` flow. |
| 5 | Simplicity | 8 | No unnecessary abstractions. Two-file split for auth routes is well-justified. No premature generics. The `authMethod` discriminator on HyperIdleEnv is the minimal addition needed. The plan explicitly avoids token refresh, password auth, and OAuth — correct scoping. |
| 6 | Testability | 9 | Task list includes specific test scenarios for each component. Unit tests for service functions, integration tests for full flow, end-to-end validation scenarios. TTL can be overridden for testing (1ms TTL test). |
| 7 | Deployability | 9 | Migration is additive (CREATE TABLE IF NOT EXISTS). Local mode behavior unchanged. The `HYPERIDLE_SHARED_MODE` env var is read once at startup. No destructive schema changes. |
| 8 | Maintainability | 8 | Clean file boundaries. Service layer is separated from route layer. New files are purposeful. The HyperIdleEnv extension is additive (existing code unaffected). |
| 9 | Risk awareness | 7 | Risks 1-3 are real and well-mitigated. Missing one risk noted in SHOULD FIX. Self-critique section is honest and thorough. |

**Aggregate score: 8.3 / 10**

---

## Findings

### MUST FIX

None. The plan is well-constructed and meets all ACs.

### SHOULD FIX

**SF-1: `validateBearerToken` performs a DB lookup by token hash, making constant-time comparison partially redundant.**

Plan section 3.1 says `verifyTokenHash(plaintext, storedHash)` does `timingSafeEqual` on two SHA-256 digests. But the actual flow in `validateBearerToken` is: hash the plaintext, look up by `tokenHash` in the DB (unique index), then check `revokedAt` and `expiresAt`. The DB lookup itself returns 0 or 1 rows — there is no stored hash to compare against using `timingSafeEqual`. If the hash matches the index, the row is returned. If it does not match, no row is returned. The timing difference between "row found" and "row not found" on a unique index is negligible, but `verifyTokenHash` as described (which takes a `plaintext` and a `storedHash`) would never be called in this flow because there is no stored hash to pass to it — the lookup already found the row by hash.

The plan defines `verifyTokenHash(plaintext, storedHash)` as a function but the `validateBearerToken` flow described in section 3.1 does not actually use it. The flow is: `hashToken(plaintext)` then `findLoginSessionByTokenHash(db, hash)`. The `verifyTokenHash` function becomes dead code unless the flow is changed.

**Recommendation:** Either (a) remove `verifyTokenHash` and rely on the indexed hash lookup (simpler, still safe — index lookups are constant-time for a given row), or (b) restructure the flow to fetch a candidate by userId (not by hash) and then use `verifyTokenHash` to compare (more paranoid but adds a required userId to the token format). Option (a) is recommended for simplicity. Document why the index lookup is sufficient.

**SF-2: Missing risk — `createAuthMiddleware` signature change is breaking.**

Risk 1 mentions `HyperIdleEnv` changes but does not call out that the `createAuthMiddleware(db)` signature change (from positional `HyperIdleDb` to `AuthMiddlewareOptions`) is a breaking change for any code importing this function. Section 9 lists it under "Mutable contracts" but Risk section should explicitly note: all callers of `createAuthMiddleware` must be updated. In the current codebase, `app.ts` is the only caller (line 253), plus the `authMiddleware` static export which is unchanged. The test files for auth middleware also call `createAuthMiddleware` and must be updated. This is low risk but should be in the risk section.

**SF-3: Dual definition of auth error codes.**

Section 2.1 creates a `packages/shared/src/auth.ts` file with `AUTH_ERROR_CODES`. Section 2.2 says "Add directly to `API_ERROR_CODES` rather than a separate `AUTH_ERROR_CODES` constant." This contradicts section 2.1 which defines `AUTH_ERROR_CODES` in the new `auth.ts` file. The decision note in section 2.2 is correct (single `API_ERROR_CODES` object is the right pattern), but then the `AUTH_ERROR_CODES` constant in `auth.ts` should not be created. The builder will need clarity on which approach to follow.

**Recommendation:** Remove `AUTH_ERROR_CODES` from section 2.1 (`auth.ts`). Keep the error codes only in `API_ERROR_CODES` in `api-types.ts`. The `auth.ts` file should contain only `INVITE_ROLES`, `LOGIN_SESSION_TTL_MS`, and `INVITE_CODE_TTL_MS`.

**SF-4: Rate limiting on `POST /api/auth/claim` — spec says out of scope but plan has a note.**

The spec says "Out of scope: Rate limiting on auth endpoints." The plan (section 5.1, claim endpoint) says "Rate limited: Uses the existing rate limiter. No dedicated bucket." These are in tension. The existing rate limiter already applies to all `/api/*` routes in `app.ts` (line 191-201) and `/api/auth` is in the `skipPaths` list. So the claim endpoint, mounted as `/api/auth/claim`, would be exempted from the base rate limiter by the `skipPaths: ["/api/auth"]` rule. However, the public auth routes are mounted *before* the rate limiter in the plan's description (section 5.2: "after rate limiter but before auth middleware"). The current `app.ts` mounts rate limiter at line 191, then `createUserSetupRoute` at line 208 (after the rate limiter). So the claim route would be rate-limited by the base limiter but exempted by the skipPath — contradictory. The builder needs clarity.

**Recommendation:** Since the spec says rate limiting on auth endpoints is out of scope, the plan should note that the public claim route sits before the auth middleware but after the base rate limiter, and the `skipPaths` exemption for `/api/auth` should be reviewed. Either remove `/api/auth` from `skipPaths` (which would affect the existing `authMintLimiter` setup) or explicitly document that claim is unprotected by rate limiting (matching the spec's "out of scope").

### OBSERVATION

**O-1: `invite_codes` has both a `.unique()` constraint on `code` and a `uniqueIndex` on `code`.**

Section 1.2 defines `code: text("code").notNull().unique()` AND in the index section `uniqueIndex("invite_codes_code_uq").on(table.code)`. The `.unique()` modifier already creates a unique index. The explicit `uniqueIndex` is redundant but not harmful — Drizzle will generate two identical constraints. Analogous to the plan's own note about `login_sessions.tokenHash` where the plan says "the `_idx` is technically redundant with the unique constraint." For `invite_codes`, the plan does not acknowledge this redundancy.

**O-2: `createAuthRoutes` signature change adds `sharedMode` but the existing callers in `app.ts` pass `(db, tokenStore)`.**

The plan correctly identifies this in the file inventory (section 8) but the ordered task list (Task 5) should note that the `app.ts` caller at line 270 must be updated from `createAuthRoutes(options.db, tokenStore ?? null)` to `createAuthRoutes(options.db, tokenStore ?? null, sharedMode)`.

**O-3: The plan does not specify the `id` generation strategy for `login_sessions` and `invite_codes`.**

Existing tables use text `id` PKs. The plan says "UUID PK" for login_sessions (spec says "UUID PK") but the schema code uses `text("id").primaryKey()` — no generation logic specified. The codebase uses UUID v4 generation in route handlers (e.g., `crypto.randomUUID()`). The builder should follow the same pattern in the service layer.

**O-4: The `claimInvite` function creates a user with `role: invite.role`.**

The `users` table already has a `role` column (line 31 of schema.ts). The plan assumes `invite.role` (from `invite_codes.role`) maps to `users.role`. This is consistent, but the plan should note that the `users.role` field's value space is not validated — it is a free text column. The `INVITE_ROLES` constant constrains it at the API boundary, which is the correct pattern for this codebase.

**O-5: Self-critique point 5 is important context for Phase 4.**

The plan correctly notes that `role` is stored but not enforced. The builder should not add role-based authorization checks — that is future work. The reviewer (Phase 4) should not flag the absence of role checks as a gap.

---

## Verdict

**PASS (8.3/10)**

The plan is well-structured, follows codebase conventions, covers all acceptance criteria, and makes sound technical decisions. The SHOULD FIX items are all clarity/consistency issues that the builder can resolve during implementation — none block advancement.

The plan is approved for implementation.
