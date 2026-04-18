# I2 Security Hardening — Security Review

Branch `feat/I2-security-hardening`, diff against `main`. Read-only review of the I2 changes covering auth, rate/body limits, upgrade tokens, agent sandbox, tool-role enforcement, and LIKE escape.

Severity legend: **Critical / High / Medium / Low**. Tier per the project's three-tier system: **ALWAYS / ASK FIRST / NEVER**.

---

## Verified strengths (no action)

- `packages/server/src/middleware/timing-safe.ts:18-22` — both inputs are SHA-256 hashed before `timingSafeEqual`, so the comparator is total over different lengths and the runtime is independent of either input length. SHA-256 is itself not constant-time over input length, but the leak is bounded to header-string length (the attacker already controls that), and the `expectedKey` side is hashed against the same fixed expected key on every request, so no information about the secret leaks. **Q4 (timing-safe length leak): not a real concern.**
- `packages/server/src/services/upgrade-token-store.ts:59` — `randomBytes(32).toString("base64url")` provides 256 bits of entropy, well above the 128-bit threshold. **Q4 (entropy): satisfied.**
- `packages/server/src/harness/claude-agent-sdk-adapter.ts:84` — strict literal compare `=== "true"`, no truthy variants. Tests pin `"1"` rejection. **Q6 (strict env compare): satisfied.**
- `packages/server/src/skill-tools/tool-registry.ts:127-149` + `services/session-provisioning.ts:289,303` — role filter applies at BOTH the registry constructor AND the harness `tools` list passed to the SDK. Defence-in-depth. **Q6 (role enforcement at multiple layers): satisfied for builder→facilitator-tool blocking.**
- `packages/server/src/services/like-escape.ts` + `routes/knowledge.ts:149-160` — escapes `\`, `%`, `_` in correct order and pairs with `ESCAPE '\\'`. **Q5 / OWASP A03 injection (LIKE wildcards): closed.**
- `packages/server/src/harness/docker-workspace-adapter.ts:32-48,72-83,111-117` — argv form throughout; host shell never sees agent payload. **Q6 / CWE-78 host-shell injection: closed.**

---

## Findings

### CRITICAL-1 — Body-limit middleware buffers entire over-limit request before rejection
File: `packages/server/src/middleware/body-limit.ts:68-90`
Tier: **ALWAYS** violated. Severity: **High** (DoS resource hold). CWE-770 (allocation of resources without limits).
Threat: A request without a `Content-Length` header (chunked transfer or Bun's body without CL) bypasses the cheap header check at line 58-64 and falls into the streaming branch. The streaming branch reads chunks into `chunks: Uint8Array[]` and only checks `total > maxSize` AFTER pushing — so the moment the size is exceeded the handler still holds `maxSize` bytes plus the most recent chunk in memory. More importantly, on the success path (under-limit chunked body) the middleware **buffers the entire body** into `Uint8Array(total)` and reconstructs `c.req.raw`. With per-process body limit 1 MiB and rate limit 60 rpm, a single API key can pin ~60 MiB/min of resident memory just from the buffer copy, before any handler runs. The double-copy (chunks → contiguous buffer) doubles peak memory.
Exploit: Authenticated client opens N chunked POSTs of just-under-1 MiB each within a window. Each request holds 1 MiB during the pre-handler buffer phase plus another 1 MiB during the handler. With the default 60 rpm rate limit, sustained traffic from a single tenant can hold > 100 MiB; with a leaked key and many parallel tenants the bound is `MAX_BUCKETS × maxSize × 2`.
Fix: (a) Move the `total > maxSize` check **before** the `chunks.push(value)` so an over-limit request never grows past `maxSize`; current code pushes first, checks second — for the LAST chunk that pushes `total` past the limit, the chunk has already been retained. (b) Skip the body reconstruction entirely: when Content-Length IS present and within budget, call `next()` without re-wrapping; only buffer when CL is missing. (c) For the chunked branch, document and enforce a hard cap on concurrent in-flight body buffers (e.g., per-bucket counter) — the rate limiter alone does not bound *concurrent* requests, only request rate.

### HIGH-1 — Upgrade-token store has no per-key issuance cap; one authed key can mint 100k tokens before TTL
File: `packages/server/src/services/upgrade-token-store.ts:42-78`, `routes/auth.ts:21-26`
Tier: **ALWAYS** (cost / DoS) violated. Severity: **High**. CWE-770.
Threat: `POST /api/auth/ws-token` is rate-limited at the global 60 rpm bucket per identity (`app.ts:187`), but `purgeExpired` is O(n) and tokens persist for the full TTL (default 60 s). Within a 60 s window the SAME authenticated key can issue at most 60 tokens via the rate limiter — that is bounded. HOWEVER: if the operator raises `HYPERIDLE_RATE_LIMIT_PER_MIN` for batch work, the token Map grows linearly with no upper bound, and `purgeExpired` walks the entire Map on every issue (O(n) per request becomes O(n²) over the window).
Exploit: Operator with batch jobs sets rate limit to 10000/min; an authed key issues 600 k tokens over 60 s; lookup latency on legitimate WS upgrades degrades quadratically.
Fix: Add a hard cap (e.g. `MAX_LIVE_TOKENS = 10_000`) on `tokens.size`; reject `issue()` with HTTP 503 once exceeded so the operator sees a clear signal rather than memory pressure. Replace the linear `purgeExpired` walk with either a min-heap keyed on `expiresAt` or a bounded LRU; both make purge O(log n) or O(1) amortised.

### HIGH-2 — Failed authentication attempts are not logged (repudiation gap)
File: `packages/server/src/middleware/auth.ts:21-27`
Tier: **ALWAYS** violated. Severity: **High** (incident-response blocking). CWE-778 (insufficient logging).
Threat: When an attacker probes a leaked or guessed API key, the only signal is a 401 returned to the caller. Nothing lands in stdout, the audit logger, or any persistent store. There is also no log on `/api/auth/ws-token` issuance, no log of WS upgrade-token consumption failures (`routes/ws.ts:75-87`), and no log when the unsafe-mode env flag is observed (`claude-agent-sdk-adapter.ts:86-91` does log but only ONCE per process via the `unsafeModeWarningEmitted` latch — so a process that toggled the flag once never re-emits the warning). Investigating "did key X get used after the suspected leak?" is impossible.
Fix: Emit a structured log line via `createLogger({ pkg: "server.auth" })` on every 401 with: source IP (if proxy trusted), the SHA-256 prefix of the supplied key (NEVER the raw key — see CWE-532), request path, method, and timestamp. Same for upgrade-token failures and for the `HYPERIDLE_UNSAFE_AGENT_MODE=true` warning (drop the once-only latch — periodic re-emission is the right pattern for ambient unsafe configurations).

### HIGH-3 — Rate-limit identity hash truncated to 64 bits — collision risk
File: `packages/server/src/middleware/rate-limit.ts:37-39`
Tier: **ALWAYS** violated. Severity: **Medium** (DoS amplification). CWE-328 (use of weak hash).
Threat: `hashIdentity` truncates SHA-256 to 16 hex chars = 64 bits. With `MAX_BUCKETS = 10_000` the birthday-collision probability is negligible for honest traffic, but an attacker who can request arbitrary API-key headers (no auth required to trip rate limiting — auth runs after) can deliberately craft headers whose first 16 hex chars collide with a victim's bucket. Two victims can also collide naturally at scale. The result: A's quota counts toward B's bucket; B gets 429s caused by A.
Exploit: Attacker sends 60 unauthenticated requests/min with `X-API-Key: <crafted>` chosen via offline brute force to collide with a high-value tenant key. Tenant gets locked out without ever sending a request.
Fix: Use the full SHA-256 hex (or at least 128 bits / 32 hex chars). The cost of 32 extra bytes per Map key is negligible vs. the collision-DoS surface.

### HIGH-4 — Rate-limit eviction picks "oldest resetAt" — wrong ordering for poisoning resistance
File: `packages/server/src/middleware/rate-limit.ts:65-75,86-90`
Tier: **ALWAYS** violated. Severity: **Medium** (DoS, eviction of legitimate tenant state). CWE-400.
Threat: When `buckets.size >= MAX_BUCKETS`, `evictOldest` removes the bucket with the smallest `resetAt`. Newly-created buckets have `resetAt = now + windowMs`, so they have the LARGEST resetAt and are the LAST to be evicted. An attacker who fills the table with 10 000 fake-key buckets RIGHT NOW will hold them for 60 s, while every legitimate caller arriving in seconds 1-59 of that window finds the table full and evicts the OLDEST legitimate bucket — including tenants who just had their counters reset. Net effect: legitimate tenants have their quota state evicted, then re-created as a fresh bucket on their next request — effectively raising their quota to unbounded for the duration of the attack (the opposite of "limit"), while filling the table again.
Cost-per-fake-key: ~150 bytes (hash key + Bucket struct). Cost to fill: 10 000 × 1 request = 10 000 requests within 60 s = ~167 rps. Trivial. Note that auth runs AFTER rate limit, so the attacker does not need a valid key.
Fix: (a) Evict by **least-recently-used** (track `lastSeenAt` and evict smallest), not by smallest `resetAt`. (b) Add a per-source-IP cap so a single direct-connection address cannot create more than N buckets even if it varies the `X-API-Key` header. (c) Consider a probabilistic structure (count-min sketch) for unauthenticated traffic so the per-bucket memory cost does not scale with attacker-chosen identities.

### HIGH-5 — Knowledge LIKE search is O(n) full-table scan, no input length cap, ESCAPE clause-shape sensitive
File: `packages/server/src/routes/knowledge.ts:134-165`
Tier: **ASK FIRST** (raw `sql` template). Severity: **Medium**. CWE-1284 (improper validation of specified quantity).
Threat: (a) The `q` parameter has no maximum length — an attacker can submit a 1 MiB query string (capped only by the new body-limit on POST, but `/search` is GET so the body limit does not apply; the URL line will be capped by Bun/Hono's URL parser at ~16k typically, but verify). (b) Three `LIKE` clauses per request × full table scan. Combined with the rate-limit collision/eviction issues above, this is a cheap CPU DoS vector. (c) The `sql\`${col} LIKE ${pattern} ESCAPE '\\'\`` template trusts that `pattern` is bound as a parameter — Drizzle DOES parameterize template-tag holes, but if a future maintainer accidentally interpolates user input into the LITERAL portion (e.g. column name) it would become injectable. Defensible today, fragile.
Fix: (a) Add `z.string().min(1).max(256)` validation on `q`. (b) Document at the call site that `pattern` is a Drizzle-bound parameter (it is — verified). (c) Consider FTS5 `MATCH` instead of `LIKE %x%` for both performance and cleaner injection surface.

### MEDIUM-1 — `c.req.raw` reassignment with `duplex: "half"` cast-via-`as`
File: `packages/server/src/middleware/body-limit.ts:90`
Tier: **ALWAYS** (TS strictness rule "no unsafe `as`"). Severity: **Medium** (correctness + project-rule violation). CWE-704.
Threat: `new Request(raw, { body: buffer, duplex: "half" } as RequestInit)` uses an `as RequestInit` cast because `duplex` is not in the standard `RequestInit` type. This works on Bun/Node 20+ but the cast hides the contract; if a future runtime drops the `duplex` field, the cast silently masks the regression. Separately, mutating `c.req.raw` is undocumented Hono behavior — the framework does not guarantee downstream middleware (notably `validateBody` / `c.req.json()`) re-reads from the new `raw` rather than a cached parsed body.
Fix: Verify against Hono source that `c.req.raw =` invalidates internal body-parsing caches; if not, use Hono's documented approach (e.g., `c.req.bodyCache = undefined` or buffer-then-replay via a custom body reader). Replace `as RequestInit` with a typed extension declaration.

### MEDIUM-2 — `c.env.remoteAddr` typed via inline object cast — direct-IP fallback may be wrong
File: `packages/server/src/middleware/rate-limit.ts:41-44`
Tier: **ALWAYS** (no unsafe `as`). Severity: **Medium**. CWE-940 (improper verification of source).
Threat: `(c.env ?? {}) as { remoteAddr?: { address?: string } }` is a coerce-and-hope. On Bun the actual shape is `{ remoteAddr: { address: string; family: string; port: number } }` BUT the field exists only when the request is served via the Bun HTTP server — under `app.request(...)` (used by every test) `c.env` is empty and the code falls into the `"global:fallback"` bucket. That means in production the limiter degrades silently if Bun ever changes the field name. The "global:fallback" bucket is also a single shared bucket — once any single unauthenticated/un-XFF caller trips the limit, every other unauthenticated/un-XFF caller is locked out.
Fix: (a) Log a one-time WARN when `readDirectAddr` returns null in production so the degraded mode is observable. (b) Replace the inline cast with a Bun-typed import (`import type { ServerWebSocket } from "bun"`) or document the contract via a typed helper.

### MEDIUM-3 — `LocalWorkspaceAdapter.exec` runs raw shell command via `promisify(exec)`
File: `packages/server/src/harness/local-workspace-adapter.ts:36-52`
Tier: **NEVER** boundary partially relaxed for dev. Severity: **Medium** (unrestricted in non-prod). CWE-78.
Threat: The S4 production gate (`spawn` throws when `NODE_ENV === "production"`) is good. However, `exec(handle, command)` still uses `child_process.exec` (shell-string interpretation), and `command` is whatever the agent emits. In dev/test, this means a sandbox-escape PoC works trivially against the host machine of any developer running `bun dev`. The Docker adapter was hardened against this; the local adapter was left with the original shell-eval semantics.
Fix: (a) Replace `execAsync(command, { cwd })` with `spawn("sh", ["-c", command], { cwd })` — or better, document loudly that `LocalWorkspaceAdapter` is FOR TESTS ONLY and forbid its construction outside of test files via the same `NODE_ENV` gate the `spawn()` method enforces. (b) Apply the gate in the constructor too; today a test could instantiate it under `NODE_ENV=test` and then `exec` arbitrary host commands if the test loop is reused in production.

### MEDIUM-4 — Knowledge layer guard mounted only on `/:layer` and `/:layer/*` — `GET /search` bypasses layer scoping
File: `packages/server/src/routes/knowledge.ts:134-165,172-173`
Tier: **ALWAYS** (cross-tenant data access). Severity: **Medium**. CWE-285 (improper authorization).
Threat: `GET /search` returns matches across **every layer** (L0…L4) without checking what the caller is authorized to see. The tier system explicitly calls out cross-product knowledge sharing (L3-L4) as ASK FIRST. The current handler returns L4 (factory) items to any authenticated caller. There is no per-product or per-layer authorization at the knowledge endpoints today (the auth model is a single shared API key), so this is more of a future-proofing concern, but it is the exact shape of multi-tenant leak the threat-model warns against.
Fix: Add a `layer` query-param filter to `/search` and validate against `KNOWLEDGE_LAYERS`. When future per-tenant auth lands, filter by tenant before the SQL query. Document that `/search` is intentionally cross-layer (if so) and gate it behind a separate role.

### MEDIUM-5 — Generic 401 message on WS upgrade and ws-token mints — token-leak signal hidden
File: `packages/server/src/routes/ws.ts:71-89`, `routes/auth.ts:21-26`
Tier: **ASK FIRST**. Severity: **Low** (operational visibility) / **Medium** (attack detection). CWE-778.
Threat: The WS upgrade returns the same 401 + identical message for every failure mode (missing token, expired token, already-consumed token, unknown token). This is correct from a defender's perspective (no oracle) but it ALSO hides reuse attacks from the operator. There is no telemetry distinguishing "client retried after expiry" (benign) vs "attacker is replaying a token they sniffed from a log" (malicious). Combined with HIGH-2 above, the system has no way to surface this.
Fix: Keep the 401 response generic, BUT log internally with the failure mode (`unknown`, `expired`, `already_consumed`) plus client IP. The store's `consume()` already returns just `{ ok: boolean }` — extend the internal API to return a discriminated reason while keeping the public response unchanged.

### MEDIUM-6 — Unsafe-mode warning emitted only once per process lifetime
File: `packages/server/src/harness/claude-agent-sdk-adapter.ts:31,86-91`
Tier: **ALWAYS**. Severity: **Medium** (operational visibility). CWE-778.
Threat: `unsafeModeWarningEmitted` is module-scoped, so the WARN line surfaces once at first session start and is silent for every subsequent session — even though every session is running with `allowDangerouslySkipPermissions: true`. Logs aggregated over time will show one warning at boot and zero ongoing signal. An operator who restarts the process at boot only ever sees the warning once and may miss it in noisy startup output.
Fix: Drop the once-only latch. Emit on every `startSession` when the flag is set. If log volume is a concern, sample (e.g. every 10th session) but never silence completely.

### LOW-1 — `RequestInit` cast and `as never` casts elsewhere violate the "no unsafe as" project rule
Files: `packages/server/src/middleware/body-limit.ts:90`, `routes/bets.ts:93,118,145`, `routes/tasks.ts:59,83`, `routes/knowledge.ts:221,254,345,435,557`, `routes/status.ts:126`
Tier: **ALWAYS** (TS strictness). Severity: **Low**. CWE-704.
Threat: Each `c.req.valid("json" as never) as z.infer<...>` is a double cast that bypasses the type system entirely. If `validateBody` is ever silently swapped out (e.g. by middleware-order regression where validation runs AFTER the route handler), the Zod-parsed shape would not actually be there and the cast hides the resulting runtime error class until it reaches user code. The project rule explicitly forbids `as` casts that bypass type checking.
Fix: Refactor `validateBody` to attach a typed accessor (`c.var.body` via a generic context type), so handlers can read `c.var.body` with the proper inferred type and no cast.

### LOW-2 — `evictOldest` uses linear scan over MAX_BUCKETS on every overflow request
File: `packages/server/src/middleware/rate-limit.ts:65-90`
Tier: **ALWAYS**. Severity: **Low** (latency under attack). CWE-407.
Threat: When the table is full, every new bucket triggers an O(n) linear scan to evict. Under the attack scenario in HIGH-4 (10 000 entries), each unauthenticated request triggers a 10 000-entry walk before being processed. CPU cost amplifies the DoS.
Fix: Use a min-heap on `resetAt` (or LRU as in HIGH-4 fix) for O(log n) eviction.

### LOW-3 — `process.env.HYPERIDLE_API_KEY` read on every request
File: `packages/server/src/middleware/auth.ts:17`
Tier: **Informational**. Severity: **Low**. CWE-1295 (debug info / info disclosure side channel).
Threat: Reading `process.env` in the hot path is fine for correctness but means a key rotation (operator sets the env var to a new value mid-process) silently switches auth without any log line. There is also no defense against an in-process exploit that mutates `process.env.HYPERIDLE_API_KEY` to a value the attacker knows.
Fix: Snapshot the key at startup (after the existing fail-fast check in `index.ts:10`); rotate via process restart. If hot-rotation is a requirement, gate it through an explicit `/api/auth/rotate` route with auth + audit log.

---

## Summary table

| ID | Severity | Tier | File |
|---|---|---|---|
| CRITICAL-1 | High | ALWAYS | middleware/body-limit.ts |
| HIGH-1 | High | ALWAYS | services/upgrade-token-store.ts |
| HIGH-2 | High | ALWAYS | middleware/auth.ts |
| HIGH-3 | Med | ALWAYS | middleware/rate-limit.ts |
| HIGH-4 | Med | ALWAYS | middleware/rate-limit.ts |
| HIGH-5 | Med | ASK FIRST | routes/knowledge.ts |
| MEDIUM-1 | Med | ALWAYS | middleware/body-limit.ts |
| MEDIUM-2 | Med | ALWAYS | middleware/rate-limit.ts |
| MEDIUM-3 | Med | NEVER (dev relaxed) | harness/local-workspace-adapter.ts |
| MEDIUM-4 | Med | ALWAYS | routes/knowledge.ts |
| MEDIUM-5 | Med | ASK FIRST | routes/ws.ts |
| MEDIUM-6 | Med | ALWAYS | harness/claude-agent-sdk-adapter.ts |
| LOW-1 | Low | ALWAYS | multiple |
| LOW-2 | Low | ALWAYS | middleware/rate-limit.ts |
| LOW-3 | Low | Info | middleware/auth.ts |

I2 successfully closes the largest pre-existing exposures (env-spread leak S1, host-shell injection S5, plain-string key compare A1, raw API key in WS query A3, missing rate/body limits R1-R5, builder→facilitator-tool privilege escalation B1-B4, LIKE wildcard injection V4). Remaining work clusters in three areas: (1) DoS resilience of the new middleware (body-limit buffering, rate-limit collision/eviction, token-store unbounded growth), (2) repudiation gaps (no audit log for failed auth, token-replay, or unsafe-mode), (3) downstream Hono cast hygiene that violates the project's strict-TS rule.
