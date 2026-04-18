# I2 Simplification Scan

Scope: 50 files, +2253/-146 LOC. Branch `feat/I2-security-hardening` vs `main`.
Scan focus: over-abstraction, dead code, unused exports, premature generalisation, indirection without value, configurability that should be a constant.

---

## HIGH — Dead code that ships

### 1. `_crypto-spy.ts` test helper is fully duplicated and unused
- File: `/workspace/.worktrees/I2/packages/server/src/middleware/__tests__/_crypto-spy.ts:1-46`
- Severity: HIGH (entire file)
- Issue: The file exports `actualTimingSafeEqualCalls` and registers a `vi.mock("node:crypto", ...)`. The only importer (`auth.timing-safe.test.ts:22`) imports the array — but then redeclares the SAME `vi.mock("node:crypto", ...)` factory inline at lines 29–47 of the test file (with the comment "vi.mock must live in the test file" explaining why). The helper's own `vi.mock` is therefore irrelevant; only the array re-export survives, and the array could be a single `const` declared at the top of the test file.
- Fix: Delete `_crypto-spy.ts`. Move `export const actualTimingSafeEqualCalls: Array<...> = []` to the top of `auth.timing-safe.test.ts` (it's already imported only there).

### 2. `LIKE_ESCAPE_CHAR` exported but never read
- File: `/workspace/.worktrees/I2/packages/server/src/services/like-escape.ts:19`
- Severity: HIGH
- Issue: `export const LIKE_ESCAPE_CHAR = "\\"` has zero call sites. `routes/knowledge.ts:154-156` hardcodes `ESCAPE '\\'` directly in the SQL template tag.
- Fix: Either delete the export, or replace the literal in `knowledge.ts` with `ESCAPE ${sql.raw(\`'${LIKE_ESCAPE_CHAR}'\`)}` and use the constant. Pick one source of truth.

### 3. `UpgradeTokenStore.size()` is dead
- File: `/workspace/.worktrees/I2/packages/server/src/services/upgrade-token-store.ts:29-31, 86-88`
- Severity: HIGH
- Issue: Comment says "Test-only: snapshot the current size so tests can assert cleanup" — but no test (or any production caller) invokes `.size()`. The doc string promises a contract that does not exist.
- Fix: Remove `size` from the interface, the implementation, and the return object. If a future test wants it, add it then.

### 4. `expiresInSec` field on `/api/auth/ws-token` response is unverified
- File: `/workspace/.worktrees/I2/packages/server/src/routes/auth.ts:23-24`
- Severity: HIGH
- Issue: The response carries `{ token, expiresAt, expiresInSec }`. No test asserts `expiresInSec`. The two helpers (`websocket.test.ts`, `server-factory.integration.test.ts`) only read `body.token`. The client-derived seconds value is also redundant — clients can compute `Math.ceil((expiresAt - Date.now())/1000)` themselves, and they have to anyway because `Date.now()` differs between server and client.
- Fix: Drop `expiresInSec` from the response; ship only `{ token, expiresAt }`. Saves a field, removes a server-clock-skew footgun.

### 5. `ConsumeResult.reason` discriminator never read
- File: `/workspace/.worktrees/I2/packages/server/src/services/upgrade-token-store.ts:22-24`
- Severity: HIGH
- Issue: `ConsumeResult` is a discriminated union with three failure reasons (`expired`/`consumed`/`unknown`). The only consumer (`routes/ws.ts:80-87`) checks `result.ok` and returns the same generic 401 message for every failure. The `reason` channel produces no observable behaviour and isn't surfaced in logs either.
- Fix: Collapse `ConsumeResult` to `boolean`. If telemetry on failure reasons is wanted later, log it from inside `consume()` instead of pushing it through the type.

---

## MED — Premature generality / over-abstraction

### 6. Rate-limiter eviction (MAX_BUCKETS / evictOldest) is unproven
- File: `/workspace/.worktrees/I2/packages/server/src/middleware/rate-limit.ts:35, 65-75, 86-88`
- Severity: MED
- Issue: `MAX_BUCKETS = 10_000` plus a 10-line linear-scan `evictOldest()`. No test exercises the eviction branch. Buckets self-reset after `windowMs` (60s default) so memory growth is bounded by request rate × 60s; a 10k cap requires ~166 RPS of unique identities sustained — implausible for a single-tenant tool. The eviction is also wrong-by-design: it picks the bucket with the smallest `resetAt`, which is the OLDEST window, but a recently-created bucket may also have `resetAt = now + windowMs` (largest); the scan ends up evicting whatever the iterator hit first when `resetAt` ties at `Number.POSITIVE_INFINITY` no longer holds — making the eviction non-deterministic in practice.
- Fix: Drop `MAX_BUCKETS` and `evictOldest()`. The `purge-on-issue` pattern already used by `upgrade-token-store.ts` would be more consistent if cleanup is wanted at all; otherwise rely on the natural reset.

### 7. Body-limit streaming fallback has no test
- File: `/workspace/.worktrees/I2/packages/server/src/middleware/body-limit.ts:53-83`
- Severity: MED
- Issue: 30 lines manually buffer chunked-upload bytes, then re-construct `c.req.raw` with a fresh body via `new Request(raw, { body: buffer, duplex: "half" } as RequestInit)`. The cast to `RequestInit` is needed because `duplex` isn't on the lib type — that alone is a smell. There's no test that POSTs without `Content-Length`. The comment explains why this branch exists but the route handlers in this codebase all `JSON.stringify` their bodies (which always sets Content-Length); the only consumer the streaming branch protects against is a hypothetical raw-stream client that doesn't exist.
- Fix: Either delete the streaming fallback (let unsized requests pass through and rely on Hono's downstream parsing to bound them) and document the limitation, or write a chunked-upload test. Don't ship a load-bearing branch with zero coverage.

### 8. `BLOCKED_SETTING_PREFIXES` + `isBlockedSettingKey` for a single call site
- File: `/workspace/.worktrees/I2/packages/server/src/routes/status.ts:51-55, 128`
- Severity: MED
- Issue: A 3-element constant + a 1-line predicate function used exactly once at line 128. The helper function adds a name lookup with no readability gain.
- Fix: Inline as `if (BLOCKED_SETTING_PREFIXES.some((p) => body.key.startsWith(p)))`. Keep the constant (it documents the contract); kill the helper.

### 9. `parseLayer` + `invalidLayerResponse` ceremony in knowledge.ts
- File: `/workspace/.worktrees/I2/packages/server/src/routes/knowledge.ts:65-80`
- Severity: MED
- Issue: `parseLayer` returns `KnowledgeLayer | null`; `invalidLayerResponse` returns `{ response, status: 400 }`; eight handlers then do the four-line `const layer = parseLayer(...); if (!layer) { const { response, status } = invalidLayerResponse(); return c.json(response, status); }` dance. The destructure-then-pass pattern serves no purpose — the `status` is always 400, so threading it through a tuple is over-engineered.
- Fix: One helper `requireLayer(c): KnowledgeLayer | Response` that either returns the parsed layer or a `c.json(...,400)` response. Caller does `if (layer instanceof Response) return layer;`. Cuts 24 lines and removes the destructure indirection.

### 10. Dual `tooLargeResponse` definition vs the rate-limit pattern
- File: `/workspace/.worktrees/I2/packages/server/src/middleware/body-limit.ts:31-37` vs `/workspace/.worktrees/I2/packages/server/src/middleware/rate-limit.ts:97-102`
- Severity: MED
- Issue: Both middlewares build an `ApiErrorResponse` and ship it as JSON inline. `body-limit.ts` factored the helper out, `rate-limit.ts` did not. Tiny inconsistency, but if a third middleware lands the divergence costs more than the share.
- Fix: Either pull a shared `errorResponse(c, code, status, msg)` helper into `middleware/` and use from both, or inline both. Pick one direction.

---

## LOW — Style / minor

### 11. `observability-routes.ts` `requestSizeCap` overlaps the new global body-limit
- File: `/workspace/.worktrees/I2/packages/server/src/routes/observability-routes.ts:22-39`
- Severity: LOW
- Issue: The route ships its own per-route 8 KiB cap returning `code: VALIDATION_ERROR` (not `PAYLOAD_TOO_LARGE`). Now that `app.ts:198-205` mounts a global body-limit middleware that returns the canonical `PAYLOAD_TOO_LARGE` shape at 1 MiB, two layers compete: the per-route cap fires first (8 KiB) but with the wrong error code, masking the canonical contract. Tests assert `VALIDATION_ERROR` (line 33) so the divergence is locked in.
- Fix: Either drop the per-route cap entirely (1 MiB is fine for `/observability/flush`) or change its error code to `PAYLOAD_TOO_LARGE` so the contract matches the new global middleware.

### 12. `_crypto-spy.ts` underscore-prefix file name in `__tests__/`
- File: `/workspace/.worktrees/I2/packages/server/src/middleware/__tests__/_crypto-spy.ts`
- Severity: LOW (subsumed by Finding 1)
- Issue: Vitest globs `*.test.ts`; `_`-prefix files are a common "exclude me" convention but not idiomatic in this repo (no other `_*.ts` files exist anywhere under `packages/server/src`). Even ignoring Finding 1, the file's location signals "test" but isn't one.

### 13. `ALLOWED_ENV_KEYS` is a constant tuple but used as a runtime array
- File: `/workspace/.worktrees/I2/packages/server/src/harness/claude-agent-sdk-adapter.ts:27`
- Severity: LOW
- Issue: `["PATH", "HOME", "LANG"] as const` — the readonly tuple buys nothing; the loop at lines 71-76 iterates the values and never indexes by position. A plain `string[]` is simpler.
- Fix: Drop `as const` if the literal-string type narrowing isn't used elsewhere (it isn't).

### 14. `Number.parseInt(... ?? "60", 10)` pattern repeated three times
- File: `/workspace/.worktrees/I2/packages/server/src/app.ts:187, 199` and `/workspace/.worktrees/I2/packages/server/src/services/upgrade-token-store.ts:35-41`
- Severity: LOW
- Issue: Three independent "read int env var with default + sanity check" implementations. `app.ts` does it inline twice (once for rate-limit, once for body-limit) with `Number.isFinite(x) && x > 0 ? x : default`; `upgrade-token-store.ts` puts it in a private `readTtlMs()`. Same logic, three sites.
- Fix: One `readPositiveIntEnv(name: string, default: number): number` in a shared util. Or live with it — the repeat is small. Worth flagging because a fourth instance is likely.

---

## VERDICT

**REVISE.** Six high-severity dead-code findings (one whole helper file, two unused exports, two unused fields, one unused interface method) total ~120 lines that ship without verification. Plus one untested branch (body-limit streaming) and one premature optimization (rate-limiter eviction) that add risk without test coverage. None block merge; all are low-cost to remove now and high-cost to remove once a downstream consumer accidentally couples to them.

Recommended action before merge:
1. Delete `_crypto-spy.ts`, `size()`, `expiresInSec`, `LIKE_ESCAPE_CHAR`, `ConsumeResult.reason`, `MAX_BUCKETS`/`evictOldest`.
2. Decide on body-limit streaming: cover with a test or delete.
3. Decide on `requestSizeCap` overlap in `observability-routes.ts`.

Items 8-14 can wait for a follow-up cleanup pass.
