# S1 Code Review -- Per-User Authentication

**Reviewer:** Phase 4 Code Review (same reviewer as Phase 2 architecture critique)
**Branch:** `feat/S1-per-user-auth`
**Worktree:** `.worktrees/S1`
**Verification:** `npm run check` (0 errors), `npm run lint` (0 errors), `npm run test` (5067 passed, 0 failures)

---

## 1. Lens Findings

### 1.1 Architecture (positive)

The implementation faithfully follows the architecture plan across all structural promises.

**Schema.** Both `loginSessions` and `inviteCodes` in `schema.ts` match the plan section 1.1/1.2 field-by-field. Column types, FK references, `onDelete` policies, index naming, and `@lore` annotations are all correct. The `schema.pg.ts` has matching table definitions with PG-appropriate types. Migration `0021_S1_login_sessions.sql` matches the planned DDL. Inferred types (`LoginSession`, `NewLoginSession`, `InviteCode`, `NewInviteCode`) are exported from `db/src/index.ts`.

**Service layer.** `login-session.ts` and `invite-code.ts` follow the plan's function-based pattern (no classes). Both take `db: HyperIdleDb` as first argument, consistent with `server-config.ts` and `direct-thread.ts`. All functions from plan section 3.1/3.2 are implemented except `verifyTokenHash` (intentionally omitted, see SF-1 follow-up below).

**Middleware.** `createAuthMiddleware` signature changed to `(options: AuthMiddlewareOptions)` as planned (section 4.2). `HyperIdleEnv.Variables` extended with `authMethod` and `loginSessionId`. Dual-strategy logic correctly implements the plan's shared-mode flow: Bearer first, API key fallback, then reject. Local mode is unchanged.

**Routes.** `auth-public.ts` (public claim) and extended `auth.ts` (invite, logout) match the plan's section 5. Route mounting order in `app.ts` follows the plan: rate limiter -> public auth routes (shared mode only) -> auth middleware -> authenticated routes.

**Layer integrity.** No reaching past neighbors. Services call DB, routes call services, middleware calls services. Clean.

### 1.2 Design (positive)

SKIPPED -- no UI surface in S1.

### 1.3 Security (positive)

**Token storage.** Plaintext tokens are never stored. `login-session.ts:28-33` generates tokens with `randomBytes(32)` and stores only the SHA-256 hash. The plaintext is returned once from `createLoginSession` and `claimInvite` and discarded.

**Token leakage.** The `@lore` comment at the top of `login-session.ts` explicitly documents that plaintext tokens are never stored. Test `S1-e2e-flow.test.ts:344-361` verifies the `/me` response body does not contain the bearer token. Test `S1-e2e-flow.test.ts:363-373` verifies the `/invite` response does not contain a bearer token.

**Error codes.** Expired tokens return 401 with `SESSION_EXPIRED` (not generic 401). Revoked tokens return 401 with `SESSION_REVOKED`. Error messages do not leak sensitive information -- they describe the condition ("Session has expired") without revealing internal state.

**Invite claim safety.** The check-then-write in `claimInvite` has a TOCTOU window (steps 1-3 are outside the transaction at lines 81-95, while steps 5-7 are inside the transaction at lines 98-124). On SQLite this is safe because writes are serialized. On PostgreSQL this would need a `SELECT ... FOR UPDATE` or a unique constraint check to prevent double-claim. Since the codebase currently only uses SQLite, this is acceptable for now but noted as a concern for the future PG path (see finding ADV-1).

**Auth middleware.** Bearer token validation returns hard-stop responses for `SESSION_EXPIRED` and `SESSION_REVOKED` (no fall-through to API key). Only `INVALID_TOKEN` falls through, which is correct -- an invalid bearer token should try API key, but a valid-but-expired/revoked token should not.

**Admin-only enforcement.** `POST /api/auth/invite` correctly checks `c.get("authMethod") !== "api_key"` and returns 403. This prevents Bearer token holders from creating invites.

### 1.4 Adversarial (negative)

**ADV-1: TOCTOU race condition in `claimInvite` (SQLite-safe, PG-unsafe).** OBSERVATION.
File: `packages/server/src/services/invite-code.ts:80-95`
The invite code lookup and claimed/expired checks (steps 1-3) happen outside the transaction. Two concurrent requests could both pass the `claimedBy !== null` check before either enters the transaction. On SQLite the write serialization prevents this. On PostgreSQL (which the codebase supports via `schema.pg.ts`), this is a real race condition. The architecture plan section "Risk 2" acknowledges this and says "SQLite serializes writes" -- correct for the current deployment. When PG support ships, the claim flow must be restructured (e.g., move the SELECT inside the transaction with FOR UPDATE, or use a conditional UPDATE with a WHERE clause checking claimedBy IS NULL).

**ADV-2: `tx as unknown as HyperIdleDb` cast in `claimInvite`.** SHOULD FIX.
File: `packages/server/src/services/invite-code.ts:121`
The `createLoginSession(tx as unknown as HyperIdleDb, userId)` uses a double cast (`as unknown as HyperIdleDb`) to pass the transaction handle to the session service. This bypasses type safety. If the transaction handle type diverges from `HyperIdleDb` in a future Drizzle version, this cast would silently succeed at compile time while breaking at runtime. The proper fix is either: (a) make `createLoginSession` accept the transaction type directly, or (b) extract the token generation and do a raw insert inside the transaction, calling the session insert logic inline. This is the most concerning type-safety gap in the diff.

**ADV-3: `handleBearerAuth` return type is `Response | null | "ok"`.** OBSERVATION.
File: `packages/server/src/middleware/auth.ts:111`
The three-value return (`Response`, `null`, `"ok"` string literal) is an unusual pattern. It works correctly but the string literal `"ok"` as a sentinel alongside two reference types is brittle. A discriminated union or a dedicated type would be clearer. The caller at line 184 checks `bearerResult === "ok"` which is correct but non-obvious.

**ADV-4: Role validation in `/invite` has redundant null-coalesce.** OBSERVATION.
File: `packages/server/src/routes/auth.ts:139,142`
`resolvedRole` at line 139 is cast to `(typeof INVITE_ROLES)[number]` then null-coalesced with `"member"`. Then at line 142, `resolvedRole` is again null-coalesced with `"member"` inside `createInvite(db, createdBy, resolvedRole ?? "member")`. The double-coalesce is redundant -- `resolvedRole` can never be nullish at line 142 because `role` at line 129 defaults to `"member"` when not present, and the INVITE_ROLES check at line 131 already validates it. Not harmful, but sloppy.

### 1.5 Simplification (negative)

**SIMP-1: Invite claim checks outside transaction could be inside.** OBSERVATION.
File: `packages/server/src/services/invite-code.ts:80-97`
Steps 1-3 (lookup, claimed check, expired check) could be inside the transaction alongside steps 5-7. This would simplify the flow to a single transaction block and eliminate the TOCTOU concern (ADV-1). The architecture plan explicitly separates them, so the builder followed the plan correctly. This is a simplification opportunity for future iteration, not a defect.

**SIMP-2: `auth.ts` `/invite` body parsing is verbose.** OBSERVATION.
File: `packages/server/src/routes/auth.ts:120-142`
The try-catch for JSON parsing, the `as { role?: unknown } | null` cast, and the manual field extraction is 23 lines for what is essentially "read optional role from body." Other routes in the codebase use similar patterns, so this is consistent. Not a defect, but a candidate for a shared body-parsing utility in a future pass.

### 1.6 AI Slop (negative)

**SLOP-1: No AI slop detected.** The code is clean, concise, and free of common AI tells. No unnecessary comments on self-documenting code, no `=== true` comparisons, no single-use helpers, no "TODO: implement" on implemented code, no verbose naming. The `@lore` annotations are purposeful and follow codebase convention. Function names are honest (`generateToken`, `hashToken`, `validateBearerToken`). Test names describe the scenario being tested. The implementation is appropriately terse without being cryptic.

---

## 2. AC Completeness Table

| # | Acceptance Criterion | Status | Evidence |
|---|---|---|---|
| **LoginSession model** | | | |
| 1 | `login_sessions` table with id (UUID PK), userId (FK), tokenHash (SHA-256, unique), expiresAt, createdAt, revokedAt (nullable) | DONE | `schema.ts:676-692`, migration `0021_S1_login_sessions.sql:2-8` |
| 2 | Tokens are 256-bit random, returned plaintext once, stored only as SHA-256 hash | DONE | `login-session.ts:28-33` (randomBytes(32)), `login-session.ts:39-41` (hashToken), test `S1-login-session.test.ts:107-111` |
| 3 | Constant-time hash comparison. Default TTL: 30 days | DONE (see note) | TTL: `login-session.ts:54` uses `LOGIN_SESSION_TTL_MS` (30 days). Constant-time: architecture plan SF-1 addressed -- `verifyTokenHash` removed; DB indexed lookup by hash is used instead (no timing side-channel on unique index). Test `S1-login-session.test.ts:119-129`. |
| **Invite codes** | | | |
| 4 | `invite_codes` table with code (unique random), createdBy (FK), claimedBy (nullable FK), role, expiresAt, createdAt | DONE | `schema.ts:702-716`, migration `0021_S1_login_sessions.sql:15-23` |
| 5 | `POST /api/auth/invite` -- admin-only, creates invite, returns code | DONE | `auth.ts:110-145`, test `S1-auth-routes.test.ts:71-82` (201), test `S1-auth-routes.test.ts:93-101` (403 for non-admin) |
| 6 | `POST /api/auth/claim` -- public, accepts {code, name, email?}, creates user+session, returns {token, user}. 410 if claimed/expired | DONE | `auth-public.ts:29-110`, test `S1-auth-routes.test.ts:137-148` (201), `S1-auth-routes.test.ts:151-167` (410 CLAIMED), `S1-auth-routes.test.ts:169-179` (410 EXPIRED) |
| 7 | 7-day default expiry | DONE | `auth.ts` (INVITE_CODE_TTL_MS), `invite-code.ts:39` defaults to `INVITE_CODE_TTL_MS`, test `S1-invite-code.test.ts:70-77` |
| **Auth middleware** | | | |
| 8 | Shared mode: Bearer -> LoginSession lookup -> userId. Fallback X-API-Key -> admin key -> first human user | DONE | `auth.ts:177-211`, test `S1-auth-middleware.test.ts:127-142` (bearer), `S1-auth-middleware.test.ts:171-180` (API key fallback) |
| 9 | Local mode: unchanged (API key only) | DONE | `auth.ts:213-234`, test `S1-auth-middleware.test.ts:69-78`, `S1-auth-middleware.test.ts:94-102` (bearer rejected in local mode) |
| 10 | `c.set("userId")` reflects correct user in all modes | DONE | `auth.ts:115,199,229`, test `S1-auth-middleware.test.ts:76` (local), `S1-auth-middleware.test.ts:139` (shared bearer), `S1-auth-middleware.test.ts:178` (shared API key) |
| **Endpoints** | | | |
| 11 | `POST /api/auth/logout` -- revokes current LoginSession | DONE | `auth.ts:154-172`, test `S1-auth-routes.test.ts:225-234`, `S1-auth-routes.test.ts:236-252` (token fails after logout) |
| 12 | `GET /api/auth/me` -- returns authenticated user | DONE | `auth.ts:60-81` (pre-existing, now works with per-user identity), test `S1-auth-routes.test.ts:288-295` |
| 13 | `POST /api/auth/ws-token` -- binds LoginSession's userId to WS upgrade token | DONE | `auth.ts:85-98` (uses `c.get("userId")` in shared mode, X-Identity fallback in local), test `S1-auth-routes.test.ts:316-338` |
| **Validation scenarios** | | | |
| 14 | Admin creates invite -> new user claims -> bearer token works -> messages carry user's identity | DONE | `S1-e2e-flow.test.ts:65-98` (full flow), `S1-e2e-flow.test.ts:249-326` (two-user thread) |
| 15 | Expired token -> 401 SESSION_EXPIRED | DONE | `S1-e2e-flow.test.ts:117-133` |
| 16 | Revoked token -> 401 SESSION_REVOKED | DONE | `S1-e2e-flow.test.ts:151-161` |
| 17 | Local desktop mode -> auth unchanged, no LoginSession involved | DONE | `S1-e2e-flow.test.ts:189-195` (X-API-Key works), `S1-e2e-flow.test.ts:198-205` (bearer rejected), `S1-e2e-flow.test.ts:207-219` (claim not accessible) |
| 18 | Two users post to same thread -> each message has correct authorId | DONE | `S1-e2e-flow.test.ts:249-326` (senderId verified per user) |
| **Contracts / constraints** | | | |
| 19 | Plaintext tokens never stored, never logged, never in GET responses | DONE | `login-session.ts:1-14` (@lore), `S1-e2e-flow.test.ts:344-373` (security tests verify token not in /me or /invite responses) |
| 20 | HYPERIDLE_API_KEY remains as server admin key | DONE | `auth.ts:195-204` (shared mode API key fallback), `auth.ts:214-234` (local mode unchanged) |
| 21 | LoginSessions are append-only (no updates, only revocation) | DONE | `login-session.ts:128-133` (revokeLoginSession only sets revokedAt), no UPDATE on any other field |
| 22 | No OAuth, no SSO, no passwords | DONE | No such code exists. Only bearer tokens and invite codes. |

---

## 3. Architecture Critique Follow-Up

| ID | Finding | Builder Resolution | Status |
|---|---|---|---|
| SF-1 | `verifyTokenHash` is dead code -- the flow hashes then looks up by index, never compares two hashes | Removed `verifyTokenHash` entirely. Added `@lore S1 SF-1` comment at top of `login-session.ts` explaining why it was not needed. Flow correctly uses `hashToken()` then `findLoginSessionByTokenHash()`. | ADDRESSED |
| SF-2 | `createAuthMiddleware` signature change is breaking -- callers must be updated | Signature changed to `(options: AuthMiddlewareOptions)`. `app.ts:283` updated to `createAuthMiddleware({ db: options.db, sharedMode })`. `@lore S1 SF-2` comments in both `auth.ts:33` and `auth.ts:57-63`. Test files use the new signature. | ADDRESSED |
| SF-3 | Dual definition of `AUTH_ERROR_CODES` -- should only be in `API_ERROR_CODES` | `AUTH_ERROR_CODES` is NOT defined in `auth.ts`. Error codes added directly to `API_ERROR_CODES` in `api-types.ts:22-25`. `auth.ts:4` has `@lore S1 SF-3` comment documenting the decision. | ADDRESSED |
| SF-4 | Rate limiting on auth endpoints -- spec says out of scope but plan has conflicting notes | No special rate limiting added to auth endpoints. The public claim route sits after the base rate limiter in `app.ts` but the `/api/auth` skipPath exempts it (as noted in SF-4). This matches the spec's "out of scope" statement. No attempt to add auth-specific rate limiting. | ADDRESSED (deferred per spec) |

All four SHOULD FIX items from the Phase 2 critique were addressed.

---

## 4. Summary of Findings by Severity

| Severity | Count | IDs |
|---|---|---|
| MUST FIX | 0 | -- |
| SHOULD FIX | 1 | ADV-2 |
| OBSERVATION | 5 | ADV-1, ADV-3, ADV-4, SIMP-1, SIMP-2 |

**ADV-2 (SHOULD FIX):** The `tx as unknown as HyperIdleDb` double cast in `invite-code.ts:121` bypasses type safety. This should be addressed by either: making `createLoginSession` accept the Drizzle transaction type, or inlining the session creation logic within the transaction. This is not blocking because it works correctly at runtime with the current Drizzle version, but it creates a silent failure mode for future Drizzle upgrades.

---

## 5. Verdict

**DONE**

All 22 acceptance criteria are DONE with test evidence. Zero MUST FIX items. The single SHOULD FIX (ADV-2) is a type-safety concern with the transaction cast -- it does not affect correctness on the current codebase and can be addressed in a follow-up. The implementation is clean, well-tested (5 dedicated test files, 70+ test cases), follows codebase conventions, and addresses all four Phase 2 critique findings.
