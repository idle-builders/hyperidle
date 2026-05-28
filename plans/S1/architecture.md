# S1 Architecture Plan -- Per-User Authentication

**Workpackage:** S1
**Depends on:** P2 (users table), P3 (backend mode, credentials, server config)
**Concept:** `plans/shared-server/concept.md` (locked)

---

## 1. Schema

### 1.1 `login_sessions` table

New table in `packages/db/src/schema.ts`. Follows existing patterns (text PKs, text timestamps, FK references with `onDelete`).

```typescript
export const loginSessions = sqliteTable(
  "login_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    index("login_sessions_user_id_idx").on(table.userId),
    index("login_sessions_token_hash_idx").on(table.tokenHash),
  ],
);
```

**Design decisions:**

- `onDelete: "cascade"` -- when a user is deleted, their login sessions are cleaned up. Sessions have no audit value beyond the user's lifetime (unlike knowledge_edit_log which uses `restrict`).
- `tokenHash` has a unique index for fast lookup during auth. The `_idx` is technically redundant with the unique constraint but makes the intent explicit for query planning.
- ISO 8601 text timestamps for consistency with every other table in the schema.
- No `updatedAt` -- LoginSessions are append-only per the concept. The only mutation is `revokedAt` being set.

### 1.2 `invite_codes` table

```typescript
export const inviteCodes = sqliteTable(
  "invite_codes",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    claimedBy: text("claimed_by")
      .references(() => users.id, { onDelete: "set null" }),
    role: text("role").notNull().default("member"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("invite_codes_code_uq").on(table.code),
  ],
);
```

**Design decisions:**

- `createdBy` uses `restrict` -- the creator's user record must not be deleted while their invite codes exist (audit trail).
- `claimedBy` uses `set null` -- if the claiming user is deleted, the invite code becomes unclaimed (not a practical scenario but safer than cascading).
- `role` defaults to `"member"`. The S1 spec includes it in the table but the role system is minimal for now (admin vs member).
- `code` is a URL-safe random string (base64url, 24 bytes = 32 chars). Not UUID -- shorter, easier to copy/paste in a terminal.

### 1.3 Migration

File: `packages/db/drizzle/0021_S1_login_sessions.sql`

```sql
-- S1: Per-user authentication tables
CREATE TABLE IF NOT EXISTS `login_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `token_hash` text NOT NULL UNIQUE,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL,
  `revoked_at` text
);

CREATE INDEX IF NOT EXISTS `login_sessions_user_id_idx` ON `login_sessions` (`user_id`);
CREATE INDEX IF NOT EXISTS `login_sessions_token_hash_idx` ON `login_sessions` (`token_hash`);

CREATE TABLE IF NOT EXISTS `invite_codes` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL UNIQUE,
  `created_by` text NOT NULL REFERENCES `users`(`id`) ON DELETE RESTRICT,
  `claimed_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `role` text NOT NULL DEFAULT 'member',
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `invite_codes_code_uq` ON `invite_codes` (`code`);
```

### 1.4 Inferred types

Add to the bottom of `schema.ts`:

```typescript
export type LoginSession = typeof loginSessions.$inferSelect;
export type NewLoginSession = typeof loginSessions.$inferInsert;

export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;
```

---

## 2. Types

### 2.1 Shared types (`packages/shared/src/auth.ts`)

New file. Exported from `packages/shared/src/index.ts`.

```typescript
/** Roles assignable to users via invite codes. */
export const INVITE_ROLES = ["admin", "member"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

/** Default LoginSession TTL: 30 days in milliseconds. */
export const LOGIN_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Default InviteCode TTL: 7 days in milliseconds. */
export const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Auth-specific error codes added to API_ERROR_CODES. */
export const AUTH_ERROR_CODES = {
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  INVITE_CLAIMED: "INVITE_CLAIMED",
  INVITE_EXPIRED: "INVITE_EXPIRED",
} as const;
```

### 2.2 API error codes

Extend `API_ERROR_CODES` in `packages/shared/src/api-types.ts`:

```typescript
export const API_ERROR_CODES = {
  // ... existing codes ...
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  INVITE_CLAIMED: "INVITE_CLAIMED",
  INVITE_EXPIRED: "INVITE_EXPIRED",
} as const;
```

**Decision:** Add directly to `API_ERROR_CODES` rather than a separate `AUTH_ERROR_CODES` constant. The codebase uses a single `API_ERROR_CODES` object everywhere. A separate constant would break the pattern and require callers to import from two places.

---

## 3. Service Layer

### 3.1 Auth service (`packages/server/src/services/login-session.ts`)

New file. Pure functions that take `db: HyperIdleDb` as first argument (no class -- follows the pattern of `server-config.ts`, `direct-thread.ts`).

```typescript
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// --- Token generation ---

/** Generate a 256-bit random token, return { plaintext, hash }. */
export function generateToken(): { plaintext: string; hash: string }

/** SHA-256 hash a plaintext token. */
export function hashToken(plaintext: string): string

/** Constant-time comparison of a plaintext token against a stored hash. */
export function verifyTokenHash(plaintext: string, storedHash: string): boolean

// --- LoginSession CRUD ---

/** Create a new LoginSession. Returns the plaintext token (once). */
export function createLoginSession(
  db: HyperIdleDb,
  userId: string,
  ttlMs?: number,
): { session: LoginSession; token: string }

/** Look up a LoginSession by token hash. Returns null if not found. */
export function findLoginSessionByTokenHash(
  db: HyperIdleDb,
  tokenHash: string,
): LoginSession | null

/**
 * Validate a bearer token. Returns the LoginSession if valid, or an error
 * reason if not.
 *
 * Checks: token hash exists, session not revoked, session not expired.
 * Uses constant-time hash comparison.
 */
export function validateBearerToken(
  db: HyperIdleDb,
  plaintextToken: string,
): { ok: true; session: LoginSession } | { ok: false; reason: "SESSION_EXPIRED" | "SESSION_REVOKED" | "INVALID_TOKEN" }

/** Revoke a LoginSession by setting revokedAt. */
export function revokeLoginSession(
  db: HyperIdleDb,
  sessionId: string,
): void

/** Revoke all active LoginSessions for a user. */
export function revokeAllUserSessions(
  db: HyperIdleDb,
  userId: string,
): number
```

**Token mechanics:**

1. `generateToken()` calls `randomBytes(32)` to produce 256 bits of randomness. Returns `plaintext` as base64url encoding and `hash` as hex-encoded SHA-256 of the raw bytes.
2. `verifyTokenHash(plaintext, storedHash)` hashes the plaintext with SHA-256, then uses `timingSafeEqual` on the two 32-byte digests. This is the same constant-time pattern as `timing-safe.ts` but compares hash-of-input against stored-hash (both are already 32 bytes, so no length-leak concern).
3. `validateBearerToken()` does: hash the plaintext -> look up by tokenHash -> check revokedAt -> check expiresAt. The lookup is by hash (indexed), so a timing side-channel on the DB query is minimal (all queries return 0 or 1 row in constant time for a unique index).

### 3.2 Invite service (`packages/server/src/services/invite-code.ts`)

New file.

```typescript
/** Generate a URL-safe random invite code (24 bytes = 32 chars base64url). */
export function generateInviteCode(): string

/** Create an invite code. Admin-only (enforced at the route layer). */
export function createInvite(
  db: HyperIdleDb,
  createdBy: string,
  role: InviteRole,
  ttlMs?: number,
): InviteCode

/**
 * Claim an invite code. Creates a new user (kind=human) and a LoginSession.
 * Returns the user, the LoginSession, and the plaintext bearer token.
 *
 * Errors:
 * - Code not found -> null
 * - Code already claimed -> { error: "INVITE_CLAIMED" }
 * - Code expired -> { error: "INVITE_EXPIRED" }
 */
export function claimInvite(
  db: HyperIdleDb,
  code: string,
  name: string,
  email?: string,
): { ok: true; user: User; token: string } | { ok: false; error: "INVITE_CLAIMED" | "INVITE_EXPIRED" | "NOT_FOUND" }
```

**Claim flow:**

1. Look up invite code by `code` (unique index).
2. If not found, return `NOT_FOUND`.
3. If `claimedBy` is set, return `INVITE_CLAIMED`.
4. If `expiresAt < now`, return `INVITE_EXPIRED`.
5. Create user with `kind: "human"`, `role: invite.role`, `status: "active"`.
6. Set `invite.claimedBy = user.id`.
7. Create LoginSession for the new user via `createLoginSession()`.
8. Return user + plaintext token.

Steps 5-7 are a transaction (SQLite serializes writes, but wrapping in `db.transaction()` ensures atomicity for the multi-table write).

---

## 4. Auth Middleware Changes

### 4.1 Current state

`createAuthMiddleware(db)` checks `X-API-Key` header against `HYPERIDLE_API_KEY` env var. On success, resolves `userId` from the users table (first human user). Sets `c.set("userId", ...)`.

### 4.2 New behavior

The middleware needs to handle two auth strategies, selected by deployment mode:

**Local mode** (default, `HYPERIDLE_SHARED_MODE` not set or falsy):
- Unchanged. `X-API-Key` check only. Resolves to first human user.
- No LoginSession involvement.

**Shared mode** (`HYPERIDLE_SHARED_MODE=true`):
1. Check `Authorization: Bearer <token>` header first.
   - If present: validate via `validateBearerToken()`.
   - If valid: set `c.set("userId", session.userId)`. Continue.
   - If expired: return 401 with code `SESSION_EXPIRED`.
   - If revoked: return 401 with code `SESSION_REVOKED`.
   - If invalid token: fall through to step 2.
2. Check `X-API-Key` header (admin key fallback).
   - If present and matches `HYPERIDLE_API_KEY`: resolve to first human user (admin access). Continue.
   - If invalid: return 401 `UNAUTHORIZED`.
3. No credentials: return 401 `UNAUTHORIZED`.

**File changes:** `packages/server/src/middleware/auth.ts`

The `createAuthMiddleware` function signature changes to accept an options object:

```typescript
interface AuthMiddlewareOptions {
  db: HyperIdleDb;
  sharedMode: boolean;
}

export function createAuthMiddleware(
  options: AuthMiddlewareOptions,
): MiddlewareHandler<HyperIdleEnv>
```

**Backward compatibility:** The caller in `app.ts` currently calls `createAuthMiddleware(options.db)`. This changes to `createAuthMiddleware({ db: options.db, sharedMode })`. The `sharedMode` boolean is derived from `process.env.HYPERIDLE_SHARED_MODE === "true"` at app construction time.

The stateless `authMiddleware` export remains unchanged for backward compatibility with code paths that do not have DB access.

### 4.3 `HyperIdleEnv` extension

The `HyperIdleEnv` type adds an `authMethod` variable so downstream routes can distinguish admin-key auth from LoginSession auth:

```typescript
export type HyperIdleEnv = {
  Variables: {
    userId: string;
    authMethod: "api_key" | "login_session";
  };
};
```

This is needed by `POST /api/auth/invite` (admin-only) and `POST /api/auth/logout` (needs current session ID). The `authMethod` defaults to `"api_key"` in local mode.

We also stash the LoginSession ID when auth is via bearer token:

```typescript
export type HyperIdleEnv = {
  Variables: {
    userId: string;
    authMethod: "api_key" | "login_session";
    loginSessionId: string | undefined;
  };
};
```

---

## 5. API Routes

### 5.1 Auth routes changes (`packages/server/src/routes/auth.ts`)

Extend `createAuthRoutes` to accept the DB and add new endpoints. The function signature changes:

```typescript
export function createAuthRoutes(
  db: HyperIdleDb | null,
  store: UpgradeTokenStore | null,
  sharedMode: boolean,
): Hono<HyperIdleEnv>
```

#### `POST /api/auth/invite` (new)

- **Auth:** Admin-only. Checks `c.get("authMethod") === "api_key"` (only admin key holders can create invites).
- **Body:** `{ role?: "admin" | "member" }` (defaults to `"member"`)
- **Response:** `{ code: string, expiresAt: string }` (201)
- **Errors:** 403 if not admin. 400 if invalid role.
- **Only mounted in shared mode.**

#### `POST /api/auth/claim` (new)

- **Auth:** Public (no auth required). This route must be registered BEFORE the auth middleware in the route chain.
- **Body:** `{ code: string, name: string, email?: string }`
- **Response:** `{ token: string, user: { id, name, email, kind, role } }` (201)
- **Errors:** 410 if claimed (`INVITE_CLAIMED`) or expired (`INVITE_EXPIRED`). 404 if code not found.
- **Only mounted in shared mode.**
- **Rate limited:** Uses the existing rate limiter. No dedicated bucket (invite claims are infrequent).

#### `POST /api/auth/logout` (new)

- **Auth:** Requires LoginSession auth (not admin key).
- **Body:** None.
- **Response:** `{ ok: true }` (200)
- **Behavior:** Calls `revokeLoginSession(db, c.get("loginSessionId"))`.
- **Errors:** 400 if auth method is `api_key` (admin key has no session to revoke). Only meaningful in shared mode, but harmless as a no-op in local mode.

#### `GET /api/auth/me` (modified)

- **Existing behavior preserved.** Already reads from users table.
- **No changes needed.** The `userId` in context is now correctly set by the updated auth middleware for both auth methods.

#### `POST /api/auth/ws-token` (modified)

- **Current behavior:** Uses `X-Identity` header to bind identity to the upgrade token.
- **New behavior in shared mode:** Instead of reading `X-Identity`, use `c.get("userId")` from the auth middleware. The identity is already authenticated -- no need for a separate header.
- **Backward compatibility:** In local mode, continue to accept `X-Identity` header as fallback (existing clients send it). In shared mode, always use `c.get("userId")`.

```typescript
// Shared mode: identity comes from auth middleware
// Local mode: identity comes from X-Identity header (legacy) or auth context
const identityId = sharedMode
  ? c.get("userId")
  : (c.req.header("X-Identity") ?? c.get("userId"));
const { token, expiresAt } = store.issue(identityId);
```

### 5.2 Public route registration for `/api/auth/claim`

The claim endpoint must be accessible without authentication. It needs to be registered in `app.ts` BEFORE the auth middleware, following the same pattern as `createUserSetupRoute`:

```typescript
// In app.ts, after rate limiter but before auth middleware:
if (options?.db && sharedMode) {
  api.route("/auth", createPublicAuthRoutes(options.db));
}
```

This means splitting the auth routes into two parts:
- `createPublicAuthRoutes(db)` -- mounted pre-auth, contains only `POST /claim`.
- `createAuthRoutes(db, store, sharedMode)` -- mounted post-auth, contains `/me`, `/ws-token`, `/invite`, `/logout`.

Alternatively, use a single factory that returns two routers. The cleaner approach is a separate function since the claim route has fundamentally different auth requirements.

**Decision:** Two separate functions. `createPublicAuthRoutes(db)` returns a `Hono` (no `HyperIdleEnv`) with just the claim endpoint. This is consistent with how `createUserSetupRoute` works.

New file: `packages/server/src/routes/auth-public.ts`

```typescript
export function createPublicAuthRoutes(db: HyperIdleDb): Hono
```

---

## 6. WebSocket Token Binding

### 6.1 Current flow

1. Client calls `POST /api/auth/ws-token` with `X-API-Key` and `X-Identity` headers.
2. Server mints an upgrade token bound to the identity.
3. Client connects to `GET /api/ws?token=<upgrade-token>`.
4. `ws.ts` middleware consumes the token, extracts `identityId`.
5. `WsBroadcaster.addClient(adapter, identityId)` registers the client.

### 6.2 New flow (shared mode)

1. Client calls `POST /api/auth/ws-token` with `Authorization: Bearer <token>`.
2. Auth middleware resolves the LoginSession, sets `userId`.
3. `/ws-token` handler reads `c.get("userId")` and issues an upgrade token bound to it.
4. Steps 3-5 from the current flow are unchanged.

**No changes to `ws.ts` or `upgrade-token-store.ts`.** The identity binding mechanism is the same -- only the source of the identity changes (from `X-Identity` header to auth context).

---

## 7. Shared Mode Detection

### 7.1 Environment variable

`HYPERIDLE_SHARED_MODE=true` enables shared mode. This is the simplest detection mechanism.

**Why not read from `serverConfig` table?** The mode needs to be known at middleware construction time (before any request). Reading from the DB on every request to check mode would add latency. An env var is read once at startup.

**Why not use `backendMode` from `client-config.ts`?** That is a desktop-side concept. The server does not read the desktop's config file.

### 7.2 Where it is read

In `app.ts`, at app construction time:

```typescript
const sharedMode = process.env.HYPERIDLE_SHARED_MODE === "true";
```

Passed to:
- `createAuthMiddleware({ db, sharedMode })`
- `createAuthRoutes(db, tokenStore, sharedMode)`
- Conditionally mounting `createPublicAuthRoutes(db)` (only when shared mode)

---

## 8. File Inventory

### New files

| File | Purpose |
|---|---|
| `packages/db/drizzle/0021_S1_login_sessions.sql` | Migration for both tables |
| `packages/shared/src/auth.ts` | Shared auth types (InviteRole, TTL constants, error codes) |
| `packages/server/src/services/login-session.ts` | Token generation, LoginSession CRUD, validation |
| `packages/server/src/services/invite-code.ts` | Invite code generation and claim flow |
| `packages/server/src/routes/auth-public.ts` | Public claim endpoint (pre-auth) |

### Modified files

| File | Changes |
|---|---|
| `packages/db/src/schema.ts` | Add `loginSessions` + `inviteCodes` tables + inferred types |
| `packages/shared/src/api-types.ts` | Add `SESSION_EXPIRED`, `SESSION_REVOKED`, `INVITE_CLAIMED`, `INVITE_EXPIRED` to `API_ERROR_CODES` |
| `packages/shared/src/index.ts` | Export new auth types |
| `packages/server/src/middleware/auth.ts` | Dual-strategy auth (Bearer token + API key fallback), `HyperIdleEnv` extension |
| `packages/server/src/routes/auth.ts` | Add `/invite`, `/logout` endpoints; update `/ws-token` identity binding |
| `packages/server/src/app.ts` | Pass `sharedMode` to middleware/routes; mount public auth routes pre-auth |

### Unchanged files (confirmed)

| File | Why unchanged |
|---|---|
| `packages/server/src/routes/ws.ts` | Identity binding uses upgrade token store, which is unchanged |
| `packages/server/src/auth/upgrade-token-store.ts` | Token store interface is unchanged; identity source changes upstream |
| `packages/server/src/services/credential-resolver.ts` | Not involved in auth flow |
| `packages/server/src/middleware/timing-safe.ts` | Reused as-is for admin key comparison |
| `packages/server/src/server-factory.ts` | Only passes through to `createApp`; no auth logic changes needed here (sharedMode read from env inside app.ts) |
| `packages/server/src/validate-env.ts` | `HYPERIDLE_API_KEY` remains required in all modes |

---

## 9. Contracts

### Immutable (must NOT change)

1. **HarnessAdapter interface.** Not touched by S1.
2. **`HYPERIDLE_API_KEY` as server admin key.** Survives. Still required. Still works for all routes.
3. **Local mode behavior.** No LoginSession involvement. `X-API-Key` only. Same UX.
4. **Plaintext tokens never stored.** Only the SHA-256 hash in `login_sessions.token_hash`.
5. **Plaintext tokens never logged.** Auth logger emits path, method, source IP -- never the token value.
6. **Constant-time hash comparison.** Both for admin key (existing `constantTimeStringEqual`) and bearer token (new `verifyTokenHash`).

### Mutable (changed by S1)

1. **`createAuthMiddleware` signature.** From `(db: HyperIdleDb)` to `(options: AuthMiddlewareOptions)`.
2. **`HyperIdleEnv.Variables`.** Gains `authMethod` and `loginSessionId`.
3. **`createAuthRoutes` signature.** Gains `sharedMode` parameter.
4. **`API_ERROR_CODES`.** Four new codes.

---

## 10. Ordered Task List

### Task 1: Schema + migration + types
**Files:** `packages/db/src/schema.ts`, `packages/db/drizzle/0021_S1_login_sessions.sql`, `packages/shared/src/auth.ts`, `packages/shared/src/api-types.ts`, `packages/shared/src/index.ts`
**Depends on:** Nothing
**Deliverable:** Tables exist, types compile, migration runs.

1. Add `loginSessions` and `inviteCodes` tables to `schema.ts`.
2. Add inferred types.
3. Write migration SQL.
4. Add `AUTH_ERROR_CODES` (SESSION_EXPIRED, SESSION_REVOKED, INVITE_CLAIMED, INVITE_EXPIRED) to `API_ERROR_CODES` in `api-types.ts`.
5. Create `packages/shared/src/auth.ts` with `INVITE_ROLES`, TTL constants.
6. Export from `packages/shared/src/index.ts`.
7. Run `npm run db:generate` to verify schema sync.
8. Run `npm run check` to verify types.

### Task 2: Login session service
**Files:** `packages/server/src/services/login-session.ts`
**Depends on:** Task 1
**Deliverable:** `generateToken`, `hashToken`, `verifyTokenHash`, `createLoginSession`, `findLoginSessionByTokenHash`, `validateBearerToken`, `revokeLoginSession`, `revokeAllUserSessions` all implemented with tests.

1. Implement token generation (256-bit random, base64url + SHA-256 hex).
2. Implement constant-time verification using `timingSafeEqual` on SHA-256 digests.
3. Implement CRUD functions.
4. Write unit tests covering: create, validate (happy path), validate (expired), validate (revoked), validate (invalid token), revoke, revoke-all.

### Task 3: Invite code service
**Files:** `packages/server/src/services/invite-code.ts`
**Depends on:** Task 1, Task 2
**Deliverable:** `generateInviteCode`, `createInvite`, `claimInvite` all implemented with tests.

1. Implement code generation (24-byte random, base64url).
2. Implement `createInvite` (insert row with expiry).
3. Implement `claimInvite` (lookup, validate, create user, create LoginSession, update invite -- all in a transaction).
4. Write unit tests covering: create invite, claim (happy path), claim (already claimed -> 410), claim (expired -> 410), claim (not found -> 404).

### Task 4: Auth middleware update
**Files:** `packages/server/src/middleware/auth.ts`
**Depends on:** Task 2
**Deliverable:** Dual-strategy auth in shared mode, unchanged behavior in local mode.

1. Add `authMethod` and `loginSessionId` to `HyperIdleEnv.Variables`.
2. Change `createAuthMiddleware` to accept `AuthMiddlewareOptions`.
3. In local mode: existing behavior + set `authMethod: "api_key"`, `loginSessionId: undefined`.
4. In shared mode: check Bearer token first, fall back to X-API-Key.
5. Update `app.ts` to pass `sharedMode` and use new signature.
6. Write tests: local mode unchanged, shared mode with valid bearer, shared mode with expired bearer (401 SESSION_EXPIRED), shared mode with revoked bearer (401 SESSION_REVOKED), shared mode admin key fallback, shared mode no credentials (401).

### Task 5: Auth routes
**Files:** `packages/server/src/routes/auth-public.ts`, `packages/server/src/routes/auth.ts`, `packages/server/src/app.ts`
**Depends on:** Task 3, Task 4
**Deliverable:** All four endpoints working end-to-end.

1. Create `auth-public.ts` with `POST /api/auth/claim` (public, pre-auth).
2. Add `POST /api/auth/invite` to `auth.ts` (admin-only).
3. Add `POST /api/auth/logout` to `auth.ts` (LoginSession auth only).
4. Update `POST /api/auth/ws-token` to use `c.get("userId")` in shared mode.
5. Mount `createPublicAuthRoutes` in `app.ts` before auth middleware (conditional on shared mode).
6. Write integration tests for the full flow: admin creates invite -> user claims -> bearer token works -> user logs out -> bearer fails.

### Task 6: End-to-end validation scenarios
**Files:** Test files
**Depends on:** Task 5
**Deliverable:** All AC validation scenarios pass.

1. **Full flow test:** Admin creates invite -> new user claims -> bearer token works -> messages carry user's identity.
2. **Expired token test:** Create session with 1ms TTL, wait, attempt request -> 401 SESSION_EXPIRED.
3. **Revoked token test:** Create session, revoke it, attempt request -> 401 SESSION_REVOKED.
4. **Local mode test:** Start app without HYPERIDLE_SHARED_MODE, verify auth is unchanged (X-API-Key only, no LoginSession).
5. **Two-user thread test:** Two users post to the same thread -> each message has correct `authorId`.
6. **Security assertions:** Token never appears in response bodies (except creation), never in logs.

---

## 11. Risks and Mitigations

### Risk 1: `HyperIdleEnv` change breaks existing route type signatures
**Likelihood:** Medium. Adding `authMethod` and `loginSessionId` to `Variables` means `c.get("authMethod")` returns `string | undefined` until TypeScript knows the variable exists.
**Mitigation:** The new variables are set unconditionally in the middleware (defaults for local mode). Existing routes that only read `userId` are unaffected -- TypeScript allows reading any declared Variable.

### Risk 2: Invite claim race condition
**Likelihood:** Low. Two requests claiming the same invite code simultaneously.
**Mitigation:** SQLite serializes writes. The `db.transaction()` in `claimInvite` ensures the check-and-set is atomic. The unique constraint on `claimedBy` is a secondary safety net -- though actually `claimedBy` is not unique (multiple invites can be claimed by the same user), the check is `claimedBy IS NOT NULL` which is read-then-write. SQLite's write lock handles this.

### Risk 3: Token hash index performance
**Likelihood:** None for current scale. The `login_sessions` table will have at most hundreds of rows for a team of 2-10.
**Mitigation:** Unique index on `tokenHash` gives O(log n) lookup. No concern at this scale.

---

## 12. Self-Critique

1. **The `HYPERIDLE_SHARED_MODE` env var is a new concept.** P3 established `backendMode` in the desktop's client-config, but the server has no equivalent. This env var is the server-side equivalent. It could alternatively be derived from the server_config table, but that adds a DB read to middleware construction. The env var is simpler and consistent with how `HYPERIDLE_API_KEY` works.

2. **Splitting auth routes into two files (`auth.ts` and `auth-public.ts`) adds a file.** The alternative is a single function that returns two routers (a tuple). The two-file approach is clearer -- each file has one responsibility and one auth context.

3. **No password auth.** The spec explicitly excludes this. A returning user who lost their bearer token has no way to re-authenticate without a new invite. This is intentional for the initial implementation (teams of 2-5 where the admin can issue new invites trivially).

4. **No token refresh.** Sessions last 30 days and then expire. No refresh token flow. This is acceptable for the initial scope -- the admin issues a new invite or the user re-claims.

5. **The `role` field on invite codes is stored but not enforced anywhere in S1.** The concept of "admin" vs "member" is defined but no routes check `user.role` for authorization. This is intentional -- S1 establishes the primitives; S3 or later can add role-based access control.
