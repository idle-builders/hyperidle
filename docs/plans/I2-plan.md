# I2 Plan — Security Hardening

**Track:** I (Hardening & Quality)
**Branch:** `feat/I2-security-hardening`
**Worktree:** `/workspace/.worktrees/I2`
**Effort:** L (~4d)
**Depends on:** I1 (merged — see commit `9dc26a2 Merge I1`)

---

## 1. Context

The 12-agent review surfaced five clusters of security defects that I2 closes. Each cluster has independent ACs but shares a common philosophy: **assume the agent process is hostile by default** and lock down every channel the host opens to it.

1. **Agent sandbox is a leaky bucket.** `ClaudeAgentSdkAdapter.startSession` (`packages/server/src/harness/claude-agent-sdk-adapter.ts:60-64`) forwards the entire `process.env` into the agent subprocess. That includes `HYPERIDLE_API_KEY` (lets the agent drive the Meta Layer), `DATABASE_URL` (lets it bypass Drizzle), and any SMTP/ntfy/Langfuse credentials configured via `factory_settings` or env. The same file also unconditionally passes `allowDangerouslySkipPermissions: true` (line 58) — a blanket consent grant that has no env-var gate. `LocalWorkspaceAdapter` (`harness/local-workspace-adapter.ts`) executes commands directly on the host filesystem with no production guard. `DockerWorkspaceAdapter.exec` (`harness/docker-workspace-adapter.ts:68-69`) builds `docker exec ${id} sh -c "${cmd}"` by string interpolation — host-side shell metacharacters in `cmd` are interpreted before they reach the container.
2. **Authentication is non-constant-time and over-shares the API key.** `auth.ts:13` does `apiKey !== expectedKey`, vulnerable to timing oracles on small surface but trivial to fix. The WS upgrade (`routes/ws.ts:62-72`) auths via `?token=<HYPERIDLE_API_KEY>` — leaks the master key into URL access logs, browser history, the server's request logger, and reverse-proxy logs. `index.ts:7` calls `createBunServer` which does not check that `HYPERIDLE_API_KEY` is set — auth.ts then silently rejects every request with no startup signal.
3. **Input validation has soft spots.** `transitionTaskSchema` is `z.object({ state: z.string() })` — pushes invalid states past Zod into `transitionTask`, where they surface as 500 from the state-machine. `updateBetSchema.field` is `z.string()`; the route passes it to `updateBetField` which then re-validates against a hard-coded `MUTABLE_FIELDS` set and throws a generic Error caught as 500. Knowledge `:layer` path param is taken raw — `eq(knowledgeItems.layer, layer)` on a wrong value returns empty (silent miss) instead of 400. Knowledge `/search` builds `LIKE %q%` with no escape of `%` and `_` (`routes/knowledge.ts:120`), so a query like `_` matches every row. `PATCH /api/status/settings` accepts any key — including `notifications.smtp_password`, `git_export.*`, `observability.*` — bypassing the redacted domain-specific routes. (I1 H-1 fixed read-side redaction; I2 H-1 closes the write side.)
4. **No rate limiting, no body size cap.** Hono is stood up with CORS + auth + error handler only. A single attacker (or a misbehaving agent re-using its API key) can flood `/api/conversations/items` or POST a 1 GiB JSON to crash the process.
5. **Tool registry does not enforce role.** `tool-registry.ts:132` (`buildToolRegistry`) ignores role and exposes `ALL_TOOL_DEFINITIONS` to every caller. Today `session-provisioning.ts:303` passes `toolsForRole(role).map(d => d.name)` to the harness as the visible tool list, so the boundary holds at the harness — but the registry's `invoke()` will still execute a facilitator tool if a builder somehow names it. We need defence-in-depth: the registry must filter as well.

## 2. Constraints

- **Three-layer boundary intact.** All work lives in Meta Layer / Agent Runtime. No UI changes, no new DB schema (we only add an in-memory upgrade-token store and an env allow-list).
- **TypeScript strict.** No `any`, no `@ts-ignore`, explicit return types, no `console.log` (use `createLogger`).
- **Hono framework only.** Use the bundled `hono/body-limit` for body cap (verified at `node_modules/.bun/hono@4.12.14/.../body-limit/index.js`). For rate limiting the project has no dep installed; I'll roll a small in-process middleware (token-bucket per IP/key) rather than add `hono-rate-limiter` — this is one ~40 LOC file with explicit semantics, fewer transitive deps, and no upstream API surface to track. Adversary will challenge.
- **No new database migration.** Upgrade tokens live in a process-local `Map<string, { expiresAt, used }>` with a 60s TTL; restart invalidates all tokens (acceptable — tokens are short-lived by design).
- **Bun's `crypto.timingSafeEqual`.** Available via `node:crypto` import (Bun supports the node:crypto API surface). The function throws on different-length inputs, so the wrapper must hash both sides to a fixed-length digest first (or pad). Plan: SHA-256 both inputs and compare digests.
- **All existing tests must stay green.** Test helpers and integration tests pass `HYPERIDLE_API_KEY` via env or header — once we fail-fast on missing key, every test process must set it. Tests that spawn the server already do (see `websocket.test.ts:38`); in-process `createTestApp` callers go through `authMiddleware` only when they hit auth-protected routes, so most are unaffected. The fail-fast lives in `index.ts` (production entrypoint), not inside `createApp`, so test imports never trigger it.
- **Adapters are still optional.** `LocalWorkspaceAdapter` is a dev convenience. Refusing to instantiate when `NODE_ENV === "production"` is a guard at construction; tests and dev are unaffected.
- **Docker `spawn` API.** `node:child_process` `spawn(file, args[], opts)` does not invoke a shell when `shell: false` (default). We replace `execAsync(\`docker exec ${id} sh -c "${command}"\`)` with `spawn("docker", ["exec", id, "sh", "-c", command])` and stream stdout/stderr — argv is passed verbatim, so a `$(cat /etc/passwd)` payload reaches the container's `sh -c` instead of being expanded by the host shell. (Inside the container, `sh -c` will still expand it — which is what we want when the agent intentionally runs shell. The threat model is host-shell injection at the spawn boundary, not in-container shell semantics.)

## 3. Design (summary, no implementation code)

### 3.1 Agent sandbox

**File:** `packages/server/src/harness/claude-agent-sdk-adapter.ts`

- Replace the `env: { ...process.env, [apiKeyEnvVar]: apiKey }` spread with an explicit allow-list:
  ```
  const ALLOWED_ENV_KEYS = ["PATH", "HOME", "LANG"] as const;
  // plus this.apiKeyEnvVar (default ANTHROPIC_API_KEY)
  ```
  Build the env via `Object.fromEntries(ALLOWED_ENV_KEYS.map(k => [k, process.env[k]]).filter(([,v]) => v != null))` and add `[this.apiKeyEnvVar]: apiKey`.
- Gate `allowDangerouslySkipPermissions` behind `process.env.HYPERIDLE_UNSAFE_AGENT_MODE === "true"`. When the gate is on, log a `WARN` once at startup via `createLogger({ pkg: "harness.claude-sdk" }).warn(...)`. Default behavior: omit the flag (and set `permissionMode: "default"` instead of `"bypassPermissions"`).
- `@lore` comment on the env allow-list referencing this story so the next agent doesn't merge `...process.env` back in for convenience.

**File:** `packages/server/src/harness/local-workspace-adapter.ts`

- Constructor (or `spawn()`) throws if `process.env.NODE_ENV === "production"`. Error: `"LocalWorkspaceAdapter is not allowed in production. Use DockerWorkspaceAdapter."`
- Constructor is the cleaner gate (fails fast at wiring time), but the adapter is currently constructed at module-import time in some test paths. Decision: gate inside `spawn()` to avoid breaking tests that import the class for type assertions. Adversary: challenge.

**File:** `packages/server/src/harness/docker-workspace-adapter.ts`

- Replace the `execAsync(`docker exec ${id} sh -c "${command.replace(...)}"`)` pattern in `exec()` with `child_process.spawn("docker", ["exec", containerId, "sh", "-c", command])`. Capture stdout/stderr via stream listeners, resolve when the process exits with `{ stdout, stderr, exitCode }`. Same for `destroy()` (`spawn("docker", ["stop", containerId])`) and `spawn()` (`spawn("docker", ["run", ...args])` — no string concat, args array is the command).
- Keep the `execAsync` import for any non-docker shell helpers (none currently — full removal of `execAsync` is acceptable).

### 3.2 Authentication

**File:** `packages/server/src/middleware/auth.ts`

- Replace `apiKey !== expectedKey` with a constant-time comparison helper exported from a new file `packages/server/src/middleware/timing-safe.ts`. The helper hashes both inputs to SHA-256 and calls `crypto.timingSafeEqual(Buffer.from(hash1), Buffer.from(hash2))` — guarantees equal-length comparison. Returns `false` (not an error) when either input is missing.

**File:** `packages/server/src/routes/ws.ts` + new `packages/server/src/services/upgrade-token-store.ts`

- New REST endpoint `POST /api/auth/ws-token` (lives in a new `routes/auth.ts` and is mounted in `app.ts` BEFORE the `/ws` registration). Requires standard auth middleware. Returns `{ token, expiresAt }` where token is `crypto.randomUUID()` and `expiresAt = now + 60s`.
- `UpgradeTokenStore`: in-memory `Map<string, { expiresAt: number; used: boolean }>`. `issue()` adds a token; `consume(token)` returns `true` exactly once (sets `used = true`) and only if `now < expiresAt`. A periodic `setInterval` (or lazy cleanup on `consume`/`issue`) prunes expired entries to bound memory.
- WS auth middleware in `routes/ws.ts` reads `?token=` and calls `store.consume(token)`. The store is constructed once in `createBunServer` and passed to both `createApp` (for the REST route) and `registerWsRoute` (for the consume call). Plumb via a new field on `AppOptions` and a new arg on `registerWsRoute(apiApp, eventBus, tokenStore)`.
- Frontend impact: `packages/web` callers must change from `WebSocket(\`ws://...?token=${apiKey}\`)` to `fetch("/api/auth/ws-token") -> WebSocket(\`ws://...?token=${oneShotToken}\`)`. We update the existing WS hook (`packages/web/src/hooks/useWebSocket.ts` if present — to be located during implementation). Any web E2E test that opens WS directly with the API key needs the same dance.

**File:** `packages/server/src/index.ts`

- After reading port and BEFORE `await createBunServer(port)`, assert `process.env.HYPERIDLE_API_KEY` is non-empty. If missing: log a fatal error via `createLogger` and `process.exit(1)`. Message: `"HYPERIDLE_API_KEY is required. Set it in your environment before starting the server."`
- This guard lives only in the production entrypoint (`index.ts`), not in `createApp` — test harnesses that build apps without auth wiring must continue to work.

**Files touched:** `auth.ts`, new `timing-safe.ts`, `routes/ws.ts`, new `routes/auth.ts`, `app.ts` (mount auth route + plumb token store), `server-factory.ts` (construct store), new `services/upgrade-token-store.ts`, `index.ts` (env guard), and `packages/web/src/hooks/useWebSocket.ts` (or equivalent — locate during implementation).

### 3.3 Input validation

**File:** `packages/server/src/routes/tasks.ts`

- `transitionTaskSchema.state` becomes `z.enum(["proposed","accepted","hold","in_progress","blocked","review","done","killed"])`. Source the array from a new exported constant `TASK_STATES` in `packages/shared/src/types.ts` (the union already exists at line 1; we add a `readonly TASK_STATES = [...] as const` alongside it and have the union derive from it via `(typeof TASK_STATES)[number]` to guarantee they cannot drift).

**File:** `packages/server/src/routes/bets.ts`

- `updateBetSchema.field` becomes `z.enum(["done_condition","hypothesis","appetite"])`. Mirror constant `MUTABLE_BET_FIELDS` in `packages/shared/src/types.ts` so `bet-state-machine.ts` and the route share one source.

**File:** `packages/server/src/routes/knowledge.ts`

- Add a `LayerSchema = z.enum(KNOWLEDGE_LAYERS)` parser used on every `c.req.param("layer")`. On parse failure, return 400 with a `VALIDATION_ERROR` ApiErrorResponse. Apply to all six handlers that read `:layer` (GET list, GET one, POST create, PATCH, POST merge/split/archive/flag). `KNOWLEDGE_LAYERS` already exists at `packages/shared/src/types.ts:13`.
- `/search`: escape `%` and `_` and `\` in `query` before constructing `pattern`. Helper `escapeLikePattern(s: string): string` lives in a new `packages/server/src/services/like-escape.ts` (also re-usable by future LIKE callers). The escape character is `\` and we must add `escape "\\"` to each Drizzle `like()` call so SQLite interprets it. Drizzle's `like()` operator accepts a third `escape` parameter; ⚠️ UNVERIFIED: confirm against current Drizzle docs (`like(column, pattern, "\\")` or via raw `sql` if the helper does not expose it). If Drizzle does not expose the escape clause, fall back to `sql\`${column} LIKE ${pattern} ESCAPE '\\'\`` or simply strip `%`/`_` from input (lossy but safe). Decision recorded in implementation notes.

**File:** `packages/server/src/routes/status.ts`

- Add a `BLOCKED_SETTING_PREFIXES = ["git_export.", "notifications.", "observability."] as const` to the file. `PATCH /settings` checks `BLOCKED_SETTING_PREFIXES.some(p => body.key.startsWith(p))`; on match, return 400 with `VALIDATION_ERROR` and message `"Use the dedicated /api/{notifications,observability,git-export} routes to update '${body.key}'"`.
- Read-side `GET /settings` already redacts via `SECRET_SETTING_KEYS` (I1 H-1). We extend the read-side filter to also exclude any key starting with `BLOCKED_SETTING_PREFIXES` from the response so the structured config domains remain the single source of truth.

### 3.4 Rate limiting + body size

**New file:** `packages/server/src/middleware/rate-limit.ts`

- In-memory token-bucket per identity. Identity = API key if header present (hashed via SHA-256 to avoid storing raw keys), else client IP from `c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.env.remoteAddr`. ⚠️ UNVERIFIED: Bun's Hono context exposes `remoteAddr` via `c.env` — verify exact accessor against `hono/bun` types (current 4.12.x). Fall back to `x-forwarded-for` only if direct addr is unreachable.
- Config: `{ limit: 600, windowMs: 60_000 }` defaults (10 req/s sustained per identity). Configurable via env `HYPERIDLE_RATE_LIMIT_PER_MIN` and `HYPERIDLE_RATE_LIMIT_WINDOW_MS`.
- On exceed: respond 429 with `Retry-After` header set to `Math.ceil(msUntilReset / 1000)` and `ApiErrorResponse{ error: "Rate limit exceeded", code: API_ERROR_CODES.RATE_LIMITED }`. Add `RATE_LIMITED` to `API_ERROR_CODES` in `packages/shared/src/api-types.ts`.
- Bucket store: `Map<identityHash, { count: number; resetAt: number }>`. Lazy reset on access (no setInterval). LRU cap (e.g. 10_000 entries) to bound memory under DoS — when full, evict the oldest expired bucket; if none expired, evict the oldest entry outright.
- Order in `app.ts`: CORS → error handler → public `/health` → `/auth/ws-token` (auth) → WS register → **rate limit** → **body limit** → `authMiddleware` → domain routes. Rate-limit BEFORE auth so unauthenticated floods are also throttled. Body-limit AFTER rate-limit so rejected requests do not buffer.

**File:** `packages/server/src/app.ts`

- Mount `bodyLimit({ maxSize: 1_048_576 })` from `hono/body-limit`. On exceed: `bodyLimit` throws `HTTPException(413)` by default; we keep that behavior. Configurable via `HYPERIDLE_MAX_BODY_BYTES` env.

### 3.5 Role-based tool access

**File:** `packages/server/src/skill-tools/tool-registry.ts`

- Change `buildToolRegistry(ctx: ToolContext)` to `buildToolRegistry(ctx: ToolContext, role: AgentRole)`. The registry's `definitions` and `byName` map are derived from `toolsForRole(role)`, not `ALL_TOOL_DEFINITIONS`. `invoke()` continues to look up by name in the role-filtered map — a builder asking for `promote_knowledge` returns `NOT_FOUND` (matches the validation scenario at TRACK-I.md:106).
- Update the public `ToolRegistry` shape — no breaking type change, but the constructor signature is breaking. Plan: introduce `buildToolRegistry(ctx, { role })` taking a small options object so future additions (e.g. `extraTools`) don't require another positional arg.

**File:** `packages/server/src/services/session-provisioning.ts`

- Pass `agentRole` to `buildToolRegistry` (currently constructs registry without role context — line 289). The `allowedToolNames` derivation at line 303 is then redundant but kept as a defence-in-depth layer (the harness still receives only the role-filtered names).

**Test impact:** `packages/server/src/skill-tools/__tests__/tool-registry.test.ts` constructs a registry without a role. Update every call site to pass `"chief_of_staff"` (full registry) by default; add new tests for the builder filter (see verification matrix B-1, B-2 below).

## 4. Acceptance Criteria — Verification Matrix

| # | AC (TRACK-I.md line) | Verification method | Test file |
|---|---|---|---|
| **S1** | Agent env contains only PATH/HOME/LANG/ANTHROPIC_API_KEY (l.67) | Inject a `queryFn` mock in `ClaudeAgentSdkAdapter`, capture the `options.env` arg from the call. Assert `Object.keys(env).sort() === ["ANTHROPIC_API_KEY","HOME","LANG","PATH"]` and that `env.HYPERIDLE_API_KEY` is `undefined` even when `process.env.HYPERIDLE_API_KEY` is set. | `harness/__tests__/claude-agent-sdk-adapter.test.ts` (extend) |
| **S2** | `allowDangerouslySkipPermissions` removed by default (l.68) | Same harness: assert the captured `options` does not include `allowDangerouslySkipPermissions` and `permissionMode === "default"` when `HYPERIDLE_UNSAFE_AGENT_MODE` is unset. | Same |
| **S3** | `HYPERIDLE_UNSAFE_AGENT_MODE=true` enables it + logs WARN (l.68) | Same harness with env set; assert `allowDangerouslySkipPermissions: true` in captured options AND a logger `warn` spy was called with a message containing "UNSAFE". | Same |
| **S4** | `LocalWorkspaceAdapter` refuses production (l.69) | Unit: set `process.env.NODE_ENV = "production"`, call `adapter.spawn(tmp)`, assert it throws with message containing "production". Restore env in afterEach. | `harness/__tests__/workspace-adapter.test.ts` (extend) |
| **S5** | Docker `exec` does not invoke host shell (l.70, l.103) | Unit: replace the spawn invocation with a `vi.fn()` capturing the args array; call `adapter.exec(handle, "$(echo INJECTED)")`; assert the `args` argv array contains the literal string `"$(echo INJECTED)"` as one element. Bonus: assert `shell` option is `false`/absent. | `harness/__tests__/workspace-adapter.test.ts` (extend) |
| **S6** | Docker `spawn`/`destroy` use argv arrays | Same approach: assert no element of the captured argv is shell-interpolated, e.g. no `;`, no `&&`, no `$()` *constructed by the adapter itself*. | Same |
| **A1** | Auth uses `crypto.timingSafeEqual` (l.78) | Unit: `vi.spyOn(crypto, "timingSafeEqual")`, fire a request through the middleware with a valid + invalid key; assert the spy was called both times. | `middleware/__tests__/auth.test.ts` (NEW) |
| **A2** | timingSafeEqual handles different-length keys (constraint l.110) | Unit: pass keys of length 8 and 64 to the comparator helper; assert it returns `false` and does NOT throw. | `middleware/__tests__/timing-safe.test.ts` (NEW) |
| **A3** | WS auth uses one-shot upgrade token (l.76, l.79) | Integration: hit `POST /api/auth/ws-token` with valid X-API-Key, get token; open WS with `?token=`, assert connect; reuse same token in a 2nd WS open, assert 401. | `__tests__/websocket.test.ts` (extend) |
| **A4** | WS rejects expired token (l.79) | Integration: issue a token, advance fake clock 61s (or set the store's TTL to 100 ms via DI for the test), open WS, assert 401. | Same |
| **A5** | WS rejects unknown token | Integration: open WS with `?token=garbage`, assert 401. | Same |
| **A6** | Server fails fast on missing API key (l.77, l.104) | Integration (subprocess): spawn `bun run src/index.ts` with `HYPERIDLE_API_KEY` unset, assert exit code != 0 within 3s and stderr contains the required message. | `__tests__/index.startup.integration.test.ts` (NEW) |
| **V1** | `transitionTaskSchema` rejects invalid state with 400 (l.82, l.105) | Integration: `createTestApp`, `POST /api/tasks/:id/transition` body `{ state: "banana" }`, assert response status 400 and code `VALIDATION_ERROR`. | `__tests__/tasks.test.ts` (extend) |
| **V2** | `updateBetSchema.field` rejects unknown field with 400 (l.83) | Integration: `PATCH /api/bets/:id` body `{ field: "evil", value: "x", reason: "y" }`, assert 400 + `VALIDATION_ERROR`. | `__tests__/bets.test.ts` (extend) |
| **V3** | Knowledge `:layer` rejects invalid value with 400 (l.84) | Integration: `GET /api/knowledge/L9`, assert 400 + `VALIDATION_ERROR`. Test against all six handlers (parametrize). | `__tests__/knowledge.test.ts` (extend) |
| **V4** | Knowledge `/search` escapes LIKE wildcards (l.85) | Unit: seed two knowledge items with titles `"AB"` and `"AxB"`. `GET /api/knowledge/search?q=A_B` returns only the literal-match row, not both. Then `q=%` returns zero rows, not all rows. | `__tests__/knowledge.test.ts` (extend) |
| **V5** | `PATCH /status/settings` blocks namespaced keys (l.86) | Integration: `PATCH /api/status/settings` body `{ key: "notifications.smtp_password", value: "leaked" }`, assert 400 + `VALIDATION_ERROR`. Repeat for `git_export.repo_path` and `observability.langfuse_secret_key`. Verify the underlying `factory_settings` row was NOT inserted/updated. | `__tests__/status.test.ts` (extend) |
| **V6** | `GET /status/settings` excludes blocked-prefix keys | Integration: seed `factory_settings` with `notifications.x`, `observability.y`, `git_export.z`, plus a `factory_start_time` row; `GET /api/status/settings` returns only `factory_start_time`. | Same |
| **R1** | Rate-limit returns 429 on excess (l.92) | Integration: configure middleware with `limit=3, windowMs=60_000`. Fire 4 requests against `/api/health` (or any auth-free route — the limiter sits before auth). Assert request 4 returns 429, `Retry-After` header present, body code `RATE_LIMITED`. | `middleware/__tests__/rate-limit.test.ts` (NEW) |
| **R2** | Rate-limit per-identity isolation | Integration: client A hits limit; client B (different IP/header) still gets 200. | Same |
| **R3** | Rate-limit normal-request latency <1ms (constraint l.109) | Bench: 1_000 sequential `next()` calls through the middleware against the same identity (under the limit), assert wall-time / 1000 < 1 ms median. Use `performance.now()`. Acknowledged: vitest is not a true benchmark harness — this is a smoke check, not a microbench. | Same |
| **R4** | Body limit returns 413 on oversize (l.93) | Integration: configure with `maxSize=1024`. POST a 2KB body to any POST route; assert 413. | `middleware/__tests__/body-limit.test.ts` (NEW) |
| **B1** | `buildToolRegistry` accepts role + filters (l.96, l.97) | Unit: `buildToolRegistry(ctx, { role: "builder" }).definitions.map(d => d.name)` does NOT include `promote_knowledge`, `route_item`, `score_attention`, `create_conflict_review`. Other 8 tools present. | `skill-tools/__tests__/tool-registry.test.ts` (extend) |
| **B2** | Builder registry returns NOT_FOUND for facilitator tool (l.98, l.106) | Unit: builder registry `invoke("promote_knowledge", {})`, assert `success: false, code: "NOT_FOUND"`. | Same |
| **B3** | Facilitator registry contains all tools (l.99) | Unit: `buildToolRegistry(ctx, { role: "chief_of_staff" }).definitions.length === 12` and includes all four facilitator tools. | Same |
| **B4** | session-provisioning passes role to registry | Integration: existing `session-provisioning.test.ts` already provisions a builder agent — extend the registry-injection point (or spy on `buildToolRegistry`) to assert it was called with `{ role: "builder" }`. | `__tests__/session-provisioning.test.ts` (extend) |

Validation gate: `bun run check` + `bun run lint` + `bun run test` all green before ship.

## 5. Ordered Task List

Each task is its own atomic commit. Tests land red before code (TDD red → green) for every task. Tasks 1-3 are independent and can be done in any order; Task 4 depends on Task 3 (rate-limit must be in place before app.ts wiring lands).

1. **Shared constants for validation enums** (unblocks V1, V2, V3)
   - Add `TASK_STATES`, `MUTABLE_BET_FIELDS` to `packages/shared/src/types.ts`. Re-derive `TaskState` union from the constant.
   - Touches: `packages/shared/src/types.ts`. No new tests beyond `bun run check` (type derivation is the assertion).
   - Risk: nothing — adding a constant is additive.

2. **Agent sandbox lockdown** (S1, S2, S3, S4, S5, S6)
   - 2a. `harness/claude-agent-sdk-adapter.ts`: env allow-list + `HYPERIDLE_UNSAFE_AGENT_MODE` gate. Tests S1, S2, S3.
   - 2b. `harness/local-workspace-adapter.ts`: production refusal in `spawn()`. Test S4.
   - 2c. `harness/docker-workspace-adapter.ts`: replace `execAsync` with `child_process.spawn` argv arrays in `exec`, `destroy`, `spawn`. Tests S5, S6.
   - Risk: existing harness/workspace tests assert behavior under default env; adding a startup WARN may need a logger spy in S3. The Docker spawn rewrite changes the return-value plumbing (stream vs Promise) — keep the public `exec()` signature `Promise<ExecResult>` and convert internally.

3. **Authentication hardening** (A1, A2, A3, A4, A5, A6) — split into sub-commits because the WS-token piece touches the web client.
   - 3a. New `middleware/timing-safe.ts` + tests A2. Replace comparator in `auth.ts`. Test A1.
   - 3b. New `services/upgrade-token-store.ts` + new `routes/auth.ts` + plumb through `app.ts` + `server-factory.ts`. Update `routes/ws.ts` to consume tokens. Tests A3, A4, A5.
   - 3c. Update `packages/web` WS hook to fetch upgrade token first. Run web E2E to confirm.
   - 3d. Add the env-guard to `packages/server/src/index.ts`. Test A6 via subprocess.
   - Risk: 3b changes `AppOptions` and `registerWsRoute` signatures — sweep all callers (`server-factory.ts`, in-process integration tests, any test that builds the app directly). 3c changes browser semantics: unauth WebSocket connections will break. 3d changes startup; ensure CI sets `HYPERIDLE_API_KEY` (verified — `websocket.test.ts:38` does, but `bun dev` may not — document in CLAUDE.md or update `.env.example`).

4. **Input validation** (V1, V2, V3, V4, V5, V6)
   - 4a. `routes/tasks.ts`: `transitionTaskSchema` uses `z.enum(TASK_STATES)`. Test V1.
   - 4b. `routes/bets.ts`: `updateBetSchema.field` uses `z.enum(MUTABLE_BET_FIELDS)`. Test V2.
   - 4c. `routes/knowledge.ts`: `LayerSchema` parser, applied to all six `:layer` handlers. Test V3.
   - 4d. New `services/like-escape.ts` + apply to `routes/knowledge.ts` `/search`. Test V4.
   - 4e. `routes/status.ts`: `BLOCKED_SETTING_PREFIXES` write-side block + read-side filter. Tests V5, V6.
   - Risk: 4a-4b change error shape from 500 → 400 for previously-bad inputs — existing tests asserting 500 must flip. 4d's Drizzle `escape` arg is ⚠️ UNVERIFIED — fall back to `sql\`... ESCAPE '\\'\`` if needed. 4e overlaps with I1 H-1 (`SECRET_SETTING_KEYS`) — keep both filters; namespace block is broader.

5. **Rate limit + body size** (R1, R2, R3, R4)
   - 5a. New `middleware/rate-limit.ts` + tests R1, R2, R3. Add `RATE_LIMITED` to `packages/shared/src/api-types.ts` `API_ERROR_CODES`.
   - 5b. `app.ts`: mount rate-limit + `bodyLimit({ maxSize: ... })` in correct order. Test R4.
   - Risk: rate-limit ordering (before auth) means unauthenticated probes get throttled — desired. Tests that hit `/health` 50× in a tight loop may now trip the limit. Audit `__tests__/health.test.ts` and `server-factory.integration.test.ts` for loop counts; raise the test-config limit if needed via env.

6. **Role-based tool access** (B1, B2, B3, B4)
   - 6a. `skill-tools/tool-registry.ts`: add `role` parameter to `buildToolRegistry`. Tests B1, B2, B3.
   - 6b. `services/session-provisioning.ts`: pass `agentRole` into `buildToolRegistry`. Test B4.
   - 6c. Update `skill-tools/__tests__/tool-registry.test.ts` existing call sites.
   - Risk: breaking signature. Sweep all callers: only `session-provisioning.ts:289` and the registry test file. Adversary should challenge whether a default role fallback is acceptable — plan: NO default; the call site must be explicit so misuse is a TypeScript error.

7. **Update CLAUDE.md / docs** (housekeeping)
   - Add a short note to `CLAUDE.md` "Tech Stack" or new "Security" section listing the env vars: `HYPERIDLE_API_KEY` (required), `HYPERIDLE_UNSAFE_AGENT_MODE` (opt-in, dev only), `HYPERIDLE_RATE_LIMIT_PER_MIN`, `HYPERIDLE_RATE_LIMIT_WINDOW_MS`, `HYPERIDLE_MAX_BODY_BYTES`. Update `.env.example` if present.
   - Update `docs/work-packages/SHARED.md` if it lists shared env vars.
   - No tests; documentation parity is the deliverable.

## 6. Risks & Open Questions

- **R-1 (Drizzle LIKE escape API).** ⚠️ UNVERIFIED whether `like(col, pattern, "\\")` is supported in Drizzle 0.44.x (current). Need to confirm or fall back to raw `sql\`... ESCAPE '\\'\``. Fallback is safe but slightly less idiomatic.
- **R-2 (Bun `c.env.remoteAddr`).** ⚠️ UNVERIFIED whether `hono/bun` exposes the client IP through `c.env`. If not, the rate-limiter falls back to `x-forwarded-for` and a fixed `"unknown"` bucket — degrades to a global limit when behind a proxy without trusted-XFF parsing, which is a known weak spot. Document the assumption ("HyperIdle runs behind a single trusted reverse proxy or directly").
- **R-3 (WS upgrade-token store TTL choice).** 60s is a guess. If the frontend does any pre-flight latency (e.g. waits for user click after fetching the token), 60s may expire. Empirically test in E2E; raise to 300s if needed. Tradeoff: longer TTL widens the steal window. Open question for product.
- **R-4 (Test isolation of rate-limiter).** The middleware uses module-level state by default; add a constructor seam (`createRateLimiter(opts) -> middleware`) so each test creates its own instance and there is no cross-test leak.
- **R-5 (Backward-compat: in-process tests bypass auth).** Today many integration tests hit `/api/*` routes in-process without setting `HYPERIDLE_API_KEY` because they call `createApp` directly — the auth middleware is wired but rejects every request. Audit confirms most use `createTestApp` which sets the key in env or skips authed routes. The fail-fast in `index.ts` does NOT trigger for these. No regression expected, but verify by running the full test suite.
- **R-6 (Tool-registry signature is breaking).** All callers in-tree are within `packages/server`. No external consumers. Acceptable.
- **R-7 (LocalWorkspaceAdapter `NODE_ENV` check at construction vs spawn).** Constructing-time check is cleaner but breaks tests that import the class for type reasons. Plan: gate inside `spawn()`. Adversary should challenge — alternative is to gate via factory function and never let production wiring instantiate it.
- **CONFUSION (env allow-list scope).** TRACK-I.md:67 says "only `PATH`, `HOME`, `LANG`, `ANTHROPIC_API_KEY`". The Claude SDK subprocess may need `USER`, `SHELL`, `TMPDIR`, or locale vars (`LC_*`) on some platforms. If the SDK fails without them, we either (a) extend the allow-list with the smallest necessary set (and document why each is needed), or (b) accept the failure mode and document it. Proceeding with (a) — add only on observed failure, default to the four-key list. Flag for review.
- **CONFUSION (rate-limiter library vs hand-rolled).** TRACK-I.md:90 says "Global rate limiting middleware added" — does not specify implementation. Hand-rolled (Plan: ~40 LOC, no deps, explicit semantics) vs `hono-rate-limiter` (mature, ~1k weekly downloads, adds one dep). Proceeding with hand-rolled per "prefer boring" + dep-minimization in the codebase ethos. Flag for adversary challenge.

---

## Appendix: Files Touched (sorted)

- `packages/shared/src/types.ts` — add `TASK_STATES`, `MUTABLE_BET_FIELDS` constants; re-derive `TaskState` union.
- `packages/shared/src/api-types.ts` — add `API_ERROR_CODES.RATE_LIMITED`.
- `packages/server/src/index.ts` — env guard + fail-fast.
- `packages/server/src/app.ts` — mount auth route, rate-limit, body-limit; plumb upgrade-token store through `AppOptions`.
- `packages/server/src/server-factory.ts` — construct upgrade-token store; pass to `createApp` + `registerWsRoute`.
- `packages/server/src/middleware/auth.ts` — use timing-safe comparator.
- `packages/server/src/middleware/timing-safe.ts` — NEW.
- `packages/server/src/middleware/rate-limit.ts` — NEW.
- `packages/server/src/middleware/__tests__/auth.test.ts` — NEW.
- `packages/server/src/middleware/__tests__/timing-safe.test.ts` — NEW.
- `packages/server/src/middleware/__tests__/rate-limit.test.ts` — NEW.
- `packages/server/src/middleware/__tests__/body-limit.test.ts` — NEW.
- `packages/server/src/services/upgrade-token-store.ts` — NEW.
- `packages/server/src/services/like-escape.ts` — NEW.
- `packages/server/src/routes/auth.ts` — NEW (POST /auth/ws-token).
- `packages/server/src/routes/ws.ts` — consume upgrade token.
- `packages/server/src/routes/tasks.ts` — z.enum on transition state.
- `packages/server/src/routes/bets.ts` — z.enum on update field.
- `packages/server/src/routes/knowledge.ts` — layer schema + LIKE escape.
- `packages/server/src/routes/status.ts` — write-side namespace block.
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` — env allow-list + unsafe-mode gate.
- `packages/server/src/harness/local-workspace-adapter.ts` — production refusal.
- `packages/server/src/harness/docker-workspace-adapter.ts` — `child_process.spawn` argv.
- `packages/server/src/skill-tools/tool-registry.ts` — role parameter on `buildToolRegistry`.
- `packages/server/src/services/session-provisioning.ts` — pass role to registry.
- `packages/web/src/hooks/useWebSocket.ts` (or equivalent) — fetch upgrade token before WS open.
- `packages/server/src/__tests__/index.startup.integration.test.ts` — NEW.
- Various `__tests__/*.test.ts` extensions per the verification matrix.
- `CLAUDE.md` / `.env.example` — env var documentation.
