# I2 Adversary Review

Scope: 50 files / +2184 LOC on `feat/I2-security-hardening` vs `main`.
Findings only — no code changes. Findings already covered by `I2-simplification-scan.md` or `I2-slop-scan.md` are NOT repeated here.

---

## CRITICAL

### A1. WebSocket auth middleware reads token from query string — leaks via referer + access logs
- File: `packages/server/src/routes/ws.ts:71-89`
- Severity: **HIGH**
- Issue: The whole I2 A3/A4/A5 redesign exists because passing `?token=<HYPERIDLE_API_KEY>` leaked the master key into URL access logs (see `upgrade-token-store.ts:9-12`). The new scheme still uses `?token=<minted>` (line 72: `c.req.query("token")`). The token is one-shot and TTL=60s, which mitigates replay, but during that 60s window the token sits in: the browser's `window.location` (Referer headers on subresource fetches), nginx/Cloudflare access logs, browser history, OS-level crash dumps, and any L7 proxy that mirrors traffic. A single-use credential reduces blast radius from "forever" to "60s + first reader wins" — but a compromised log shipper or an attacker on the same proxy can race the legitimate handshake.
- Recommended fix: Send the token via `Sec-WebSocket-Protocol` subprotocol header (RFC 6455 §1.9) or as a header on the `POST /api/auth/ws-token` response that the browser sends back via `Cookie` on the WS upgrade (HttpOnly, Secure, SameSite=Strict). Both paths keep the token out of URL space entirely. Document the residual risk if `?token=` is the only feasible path on Bun.

### A2. `body-limit` middleware buffers chunked POSTs into memory, defeating the entire DoS protection it claims
- File: `packages/server/src/middleware/body-limit.ts:66-90`
- Severity: **HIGH**
- Issue: When a request omits `Content-Length`, the middleware reads the entire body into a `chunks: Uint8Array[]` until `total > maxSize` (line 75). It rejects only AFTER the byte that pushes it over the limit. An attacker who omits `Content-Length` and sends `maxSize - 1` bytes very slowly (one byte per second) ties up the request handler for `maxSize` seconds with the entire payload pinned in memory — the protection middleware becomes the slowloris vector. Additionally, on rejection (line 75-78) the chunks already buffered are GC'd but during the read loop they are not bounded by anything other than the cumulative `maxSize`. A single oversize request that hits the limit on byte N still allocates ~`maxSize` bytes plus one chunk before bailing.
- Recommended fix: Drop the streaming branch entirely. If `Content-Length` is missing on POST, return 411 (Length Required) immediately. The set of legitimate clients sending chunked transfer-encoding to this server is empty (all the route handlers `JSON.stringify` their bodies, which always sets Content-Length). The simplification scan already flagged this branch as untested (Finding 7) — but the security risk is the more important reason to delete it.

### A3. `LocalWorkspaceAdapter` production guard runs on `spawn()`, not construction — instances can leak past the gate
- File: `packages/server/src/harness/local-workspace-adapter.ts:13-26`
- Severity: **HIGH**
- Issue: The lore comment at line 19-21 claims the gate lives in `spawn()` "so type-only imports in tests still work." That's a runtime check that fires AFTER an adapter has been constructed, registered with a session, and possibly handed to other components. If `NODE_ENV` is set to `"production"` after construction (e.g., by a downstream `wireObservability` rebuild that mutates env), or if a test fixture forgot to reset `NODE_ENV` and the adapter is reused, the guard fires unpredictably (some calls succeed, others throw). Worse: any code path that constructs but never calls `spawn()` (e.g., `exec()` against a workspace handle restored from disk on a process restart) bypasses the guard entirely — `exec()` and `destroy()` only check `this.workspaces.has(...)`, which on an existing handle returns true.
- Recommended fix: Move the `NODE_ENV === "production"` check to the constructor. The "type-only imports" rationalization doesn't hold — `import type` already prevents runtime execution. The actual risk is `exec(handle, ...)` running an arbitrary host command in production through a handle minted before `NODE_ENV` was checked.

### A4. `DockerWorkspaceAdapter.exec` does not validate that the container is still alive — agent commands run against a recycled container ID
- File: `packages/server/src/harness/docker-workspace-adapter.ts:102-119`
- Severity: **HIGH**
- Issue: `runDocker("docker", ["exec", container.containerId, ...])` doesn't check whether the container is still running. Container is launched with `--rm` (line 75), so if it exits for ANY reason (OOM kill, crash, host restart, manual `docker stop`), the ID is freed and may be reassigned to a different container with the same ID prefix — `docker exec` then runs the agent's command in the wrong container. The `containers` map is in-memory and not validated against `docker inspect` between calls. Note: full container IDs are 64 chars so re-use risk is low, but on multi-tenant Docker hosts using prefix-matching tools, a 12-char prefix collision is plausible.
- Recommended fix: Either validate container state via `docker inspect <id> --format '{{.State.Running}}'` before each `exec`, or remove `--rm` so dead containers are visible (and call `docker rm` explicitly in `destroy`). Capture the failure mode: if the container is gone, return `ExecResult { exitCode: -1, stderr: "container not running" }` rather than letting `docker exec` fail with an opaque error string.

---

## WARNINGS

### W1. `unsafeModeWarningEmitted` is module-scoped mutable state — bypass mode silently re-enables across test runs
- File: `packages/server/src/harness/claude-agent-sdk-adapter.ts:31, 86-91`
- Severity: MED
- Issue: Per-process `let unsafeModeWarningEmitted = false`. If a test runs with `HYPERIDLE_UNSAFE_AGENT_MODE=true` and then a later test forgets to reset it, the next adapter instance silently uses bypass mode WITHOUT logging the warning — because `unsafeModeWarningEmitted` is still true from the prior test. The warning was the only operator-visible signal that bypass is on. The S3 test (`claude-agent-sdk-adapter.security.test.ts:170-196`) does not reset this flag between tests; its assertions check `allowDangerouslySkipPermissions` but not the warning emission.
- Recommended fix: Move the flag to instance state, or drop the dedup entirely (one warning per session start is acceptable for an explicitly-unsafe mode). See also slop-scan O6.

### W2. `auth.ts:19` — `expectedKey.length > 0` short-circuits BEFORE constant-time compare runs
- File: `packages/server/src/middleware/auth.ts:19`
- Severity: MED
- Issue: `const ok = expectedKey.length > 0 && constantTimeStringEqual(apiKey, expectedKey);` — the `&&` short-circuits when `expectedKey` is empty, so a deployment without `HYPERIDLE_API_KEY` set will skip the comparator entirely. This is fine for security (request is rejected) but it means the timing-attack mitigation is bypassed in the server-misconfigured case. An attacker probing a misconfigured server gets a constant-time-fast 401, which is observable as different from the configured-server 401. The `index.ts` A6 fail-fast guard is the actual defense, but the middleware claims (lore line 11-13) "we still run the comparator against a fixed empty string so authentication latency is independent of header presence" — that claim is FALSE for the missing-env case.
- Recommended fix: Either drop the `expectedKey.length > 0` guard (the `index.ts` fail-fast already prevents this state) or call `constantTimeStringEqual(apiKey, "")` explicitly when `expectedKey` is empty so the comparator timing is consistent. Update the lore to match.

### W3. `tool-registry.invoke()` returns `NOT_FOUND` for filtered-out facilitator tools — leaks role boundary
- File: `packages/server/src/skill-tools/tool-registry.ts:153-163`; `__tests__/tool-registry-role.test.ts:71-77`
- Severity: MED
- Issue: When a `builder` tries to invoke `promote_knowledge`, the registry returns `NOT_FOUND` (B2 test at line 76 asserts this). `NOT_FOUND` is the same code returned for genuinely-unknown tools. Two problems: (1) An adversarial agent can enumerate the role boundary by probing tool names — `promote_knowledge` returns NOT_FOUND for builders but routes for facilitators, so any facilitator-only tool can be enumerated. (2) Operationally, when a real bug causes a tool to vanish (typo in tool name), the failure looks identical to "wrong role" — debuggers will chase the wrong cause. The harness already filters tool names (session-provisioning.ts:303), so the registry-level filter is defence-in-depth — but defence-in-depth that's indistinguishable from "tool doesn't exist" leaks information.
- Recommended fix: Return distinct codes — `FORBIDDEN` (filtered out by role) vs `NOT_FOUND` (genuinely unknown). Match the harness behavior. Update the B2 test to assert `FORBIDDEN`.

### W4. Rate-limit middleware mounted globally on `/api/*` — `/api/health` is rate-limited
- File: `packages/server/src/app.ts:184-194`
- Severity: MED
- Issue: `api.use("*", createRateLimiter(...))` mounts BEFORE `api.get("/health", ...)` is checked, so the public liveness endpoint is rate-limited. Liveness probes from k8s/systemd/uptime monitors fire every 5–10s; with the default `60/min`, a single k8s readiness+liveness probe pair (12 probes/min) consumes 20% of the budget for the IP, and a load-balancer with multiple probe addresses sharing the bucket via XFF will trip throttling on the actual users. Worse: a 429 on `/api/health` causes the orchestrator to mark the pod unhealthy and restart it — the rate limit becomes a self-inflicted outage.
- Recommended fix: Mount `/api/health` BEFORE the rate-limiter (line 176-182 already defines it; just move the rate-limiter `use("*",...)` call to a more specific path or to a `use("*", skipHealth)` wrapper). Alternatively, exempt health from rate-limiting via path check inside the limiter.

### W5. Body-limit + rate-limit both mounted globally — order means rate-limit fires AFTER full-body buffer
- File: `packages/server/src/app.ts:188-205`
- Severity: MED
- Issue: Order is rate-limiter (line 188) → body-limit (line 200). For a request that's BOTH oversized AND over the rate limit, the rate-limiter rejects first — good. But the body-limit's streaming-buffer branch (`body-limit.ts:66-90`) reads chunks into memory BEFORE the next middleware runs. If a rate-limited attacker sends a chunked POST, the rate-limiter rejects on the bucket check (correct), but the body buffer has already been allocated by the body-limit middleware running BEFORE the route handler — wait, actually rate-limit runs first, so this is OK in the current order. The risk is the inverse: if a future refactor reorders middleware (mount body-limit first to "fail fast on large payloads"), an unauthenticated chunked POST consumes memory before any auth or rate check runs. The current order is correct but fragile. No comment in `app.ts` documents the order dependency.
- Recommended fix: Add a comment at line 188 / 200 pinning the order: "rate-limit MUST run before body-limit so unauthenticated/unbucketed clients can't drive memory through the streaming-buffer branch." Or, better, fix A2 (drop streaming branch) which removes the order dependency entirely.

### W6. `routes/ws.ts:71` middleware does not check `tokenStore` is defined — silent passthrough on misconfiguration
- File: `packages/server/src/routes/ws.ts:71-89`
- Severity: MED
- Issue: `if (!(token && tokenStore)) { return 401 }` collapses two failure modes into one. If `registerWsRoute` is called WITHOUT a `tokenStore`, every WS request gets a generic 401 — the operator sees "wrong token" and chases client-side bugs while the actual bug is server-side wiring. The Optional `tokenStore` parameter is the smell — `registerWsRoute(apiApp, eventBus?, tokenStore?)` makes a security-critical dependency optional. The production wiring (`server-factory.ts:64-67`) always passes it, so the optionality only serves dead test paths.
- Recommended fix: Make `tokenStore` REQUIRED in the `registerWsRoute` signature. If a test wants to register WS without auth, it should pass a fake store with a permissive `consume()`. Surface configuration errors as crashes-at-startup (consistent with A6 / index.ts fail-fast philosophy).

### W7. `crypto.timingSafeEqual` mock factory in `auth.timing-safe.test.ts` re-implements production logic
- File: `packages/server/src/middleware/__tests__/auth.timing-safe.test.ts:35-53`
- Severity: MED
- Issue: The mock wraps `timingSafeEqual` with: "if lengths differ, hash both sides with SHA-256 first." This is the EXACT logic that `timing-safe.ts:18-22` implements in production. The test's mock never calls the real `timingSafeEqual` with mismatched lengths because the wrapper hashes them first. So the test verifies that "the production code passes equal-length buffers to `timingSafeEqual`" but only because the mock guarantees that — not because the production code does. If the production code ever stopped hashing first, the mock would silently paper over the bug. Tautological test.
- Recommended fix: Remove the SHA-256 normalization from the mock — pass `a` and `b` straight through. The production code's hashing means the assertion `actualTimingSafeEqualCalls.length > 0` still passes; if production stopped hashing, `timingSafeEqual` would throw on mismatched lengths and the test would correctly fail.

### W8. `app.ts` `Number.isFinite(x) && x > 0 ? x : default` chain is duplicated — risks divergence
- File: `packages/server/src/app.ts:187, 199`; `services/upgrade-token-store.ts:34-40`
- Severity: LOW (covered by simplification Finding 14, but flagging for risk)
- Issue: Three independent re-implementations of "parse positive int env, fall back to default." `app.ts` uses inline `Number.isFinite && > 0`; `upgrade-token-store.ts` uses a private `readTtlMs()`. They will diverge: `app.ts` accepts `0` as falsy and uses default; `upgrade-token-store.ts` rejects `parsed <= 0`. Already a subtle divergence — `parseInt("0")` would behave differently across the two sites (the `app.ts` form treats 0 as falsy via the ternary `> 0` check). For rate-limit a `0` gets caught by `> 0`; for token TTL a `0` gets caught by `<= 0`. Same outcome by accident, not by design.
- Recommended fix: One shared `readPositiveIntEnv(name, default)` helper. (Listed in simplification Finding 14 but the divergence risk makes it more than cosmetic.)

---

## OBSERVATIONS

### O1. `buildToolRegistry` signature change blast radius — every caller must pass `{ role }`
- File: `packages/server/src/skill-tools/tool-registry.ts:140-148`
- Issue: The new required `options: { role }` second arg is a breaking change. 11 call sites updated (all in tests + session-provisioning). No backward-compat shim. Net effect: positive (forces explicit auth decision per the lore at line 132-138). But any out-of-tree caller (e.g., a future plugin loader, CLI tool that builds its own registry) will fail at the type level — which is good IF that's caught at compile time. Worth a `@since I2` JSDoc tag so `git blame` users can find the change rationale faster than reading the full @lore block.

### O2. `MAX_BODY_BYTES = 1_000_000` in `app.ts` — knowledge bodies can legitimately exceed this
- File: `packages/server/src/app.ts:199-205`
- Issue: 1 MiB body limit applies to ALL `/api/*` routes including `POST /api/knowledge/:layer` and `PATCH /api/knowledge/:layer/:id`. Knowledge items are "patterns, briefs, decisions" — long-form markdown. A 1 MiB cap is fine for typical content but a long retro doc with embedded base64 images (or one of the `routine` payloads) could plausibly exceed it. There's no per-route override. The configurability via `HYPERIDLE_MAX_BODY_BYTES` is process-wide. Will likely need per-route caps before knowledge ingestion of large docs lands.

### O3. Rate-limit identity collisions across tenants on shared NAT
- File: `packages/server/src/middleware/rate-limit.ts:46-63`
- Issue: When `HYPERIDLE_TRUST_PROXY` is unset, the limiter falls back to `c.env.remoteAddr.address` — which behind a corporate NAT is shared across hundreds of users. One noisy client throttles every other user behind the same egress IP. The `pickIdentity` flow is correct (API-key first, XFF when trusted), but the deployment guidance in the lore doesn't mention that single-tenant behind shared NAT effectively disables per-user limiting. Document or accept.

### O4. `evictOldest` linear scan picks the soonest-to-reset bucket — wrong semantics
- File: `packages/server/src/middleware/rate-limit.ts:65-75`
- Issue: The function picks the bucket with the smallest `resetAt`, which is the bucket about to self-evict in the next request anyway. So `evictOldest` removes the bucket that would have been removed for free moments later, while preserving the buckets with the largest `resetAt` (which are recently-created and most likely to keep firing). Net effect: under load, the eviction policy actively preserves the heaviest hitters. Not a security bug — `MAX_BUCKETS=10000` keeps memory bounded — but the semantics are inverted from the function name. (Simplification scan Finding 6 already says delete the eviction. Agreed.)

### O5. `handoff-protocol.ts` rolled to use `db.transaction` — no test that the transaction actually rolls back on tx-internal failure for the I2 changes
- File: `packages/server/src/services/handoff-protocol.ts:91-271`
- Issue: The I2 diff touches only 7 lines here (line 7: import VALID_TRANSITIONS from task-state-machine). The transactional path was added in I1. No I2 test exercises a rollback against the new B1-B4 + V1-V5 changes interacting with handoff. Low risk for THIS branch; flagging because the test surface around handoff didn't grow.

### O6. `routes/auth.ts` `POST /ws-token` is rate-limited by the same identity bucket as everything else
- File: `packages/server/src/app.ts:188` + `routes/auth.ts`
- Issue: With default `60/min` per identity, a single browser that does 60 normal API calls in a minute can't mint a WS token. WS reconnect-on-drop loops will hit this. The token endpoint deserves either a separate (lower) bucket or exemption — token issuance is itself a rate limit on later WS use, so double-limiting is cargo-cult. Will surface as flaky WS reconnects under load.

### O7. `app.ts:210` `tokenStore = options?.upgradeTokenStore ?? createUpgradeTokenStore()` — store created even when WS is not registered
- File: `packages/server/src/app.ts:210, 217, 225`
- Issue: Every `createApp()` call (including non-Bun integration tests with no WS) instantiates an `UpgradeTokenStore` whose `Map<string, TokenRecord>` lives for the app's lifetime. Tiny memory cost; the issue is that `POST /api/auth/ws-token` is mounted at line 225 unconditionally. A non-Bun test app will issue tokens that are never consumable (no WS route), and the tokens accumulate in the map until expiry. Not a leak (TTL bounds it), but the route exposes a feature that doesn't work in that configuration. Should be conditional on `options?.registerWebSocket` being present.

---

## VERDICT

**REVISE.**

Four high-severity findings need decisions before merge:
- **A1** (token in URL): document residual risk OR move to subprotocol/cookie; the lore claims the URL-token problem is solved but the token still lives in the URL.
- **A2** (body-limit slowloris): drop the streaming branch — it's both untested (per simp scan) AND a DoS vector.
- **A3** (LocalWorkspaceAdapter prod gate): move check to constructor; current placement leaves `exec()` ungated.
- **A4** (Docker container liveness): add an inspect-before-exec check OR drop `--rm`; current code can run agent commands in the wrong container after a restart.

Warnings W1-W6 should be addressed but do not block merge. W4 (rate-limit on /health) is the most likely to bite operationally on day one.

The B1-B4 role-filter work (tool-registry) and S1-S6 sandbox work (env allow-list, argv spawn, NODE_ENV gate) are sound. The R-track (rate-limit + body-limit) is where most of the remaining risk lives.
