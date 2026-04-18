# H3 — Security Review (Observability)

Scope: `packages/server/src/services/observability/*.ts`, `packages/server/src/routes/observability-routes.ts`, `packages/shared/src/net/ssrf.ts`, `packages/shared/src/redact.ts`. Read-only.

## Summary (< 250 words)

The H3 observability track demonstrates mature secret-handling discipline: Langfuse keys are redacted to `***` in GET /config, in the admin audit log, and in Langfuse error surfaces; the shared SSRF helper blocks RFC1918, loopback, CGNAT 100.64.0.0/10, 169.254.169.254 metadata, fc00::/7, fe80::/10, `.local` mDNS, cloud metadata hostnames, userinfo, non-http(s) protocols, and CR/LF/NUL; `basicAuth` base64-encodes the credential so no header injection is possible even if a future sanitizer regresses; JSON.stringify on the log extra prevents log injection via `\n`/ANSI. All observability routes sit behind `authMiddleware` on `/api/*`. No CRITICAL vulnerabilities found.

Findings:

- **HIGH** — DNS-rebinding TOCTOU in `assertUrlNotSSRF`: the IP resolved by the pre-check is not pinned for the subsequent `fetch()`; an attacker-controlled DNS record can flip between check and connect.
- **MEDIUM** — Short Langfuse keys (length 1-3) bypass the context-wholesale scrub in error messages because `scrubErrorMessage` ignores replacement substrings with `length < 4`.
- **MEDIUM** — `ObservabilityEvent.argsSummary` is caller-sanitized only; no enforcement at the type/ingest boundary. No bus subscription wires `tool_call` today, but `summarizeToolArgs` has narrow coverage (misses AWS AKIA, Slack xox, Google AIza, JWT `eyJ`, Stripe live keys).
- **MEDIUM** — Dispatcher is built once at startup. PATCH /config changes (including secret-key rotation, disable, and adapter switch) do not take effect until server restart; revoked keys stay hot in memory.
- **LOW** — zod validation errors surface `issues` including `path`; low risk but inconsistent with normal error-message hygiene.
- **LOW** — No persistent audit trail (audit "log line" only). Repudiation-weak for config changes.

See detail below.

---

## Method

- STRIDE pass against each route and each adapter.
- Code review with checklist: input validation, authz, SSRF, CRLF/NUL, secret exposure paths, DoS vectors, log-injection, header injection, error-message info disclosure.
- Cross-referenced `sanitizeHttpUrl` / `assertUrlNotSSRF` behavior against the RFC1918 + link-local + metadata + `.local` + userinfo checks.
- Traced each Langfuse-key flow: persist (`factorySettings`), read-back (redactObservabilityConfig), outbound Basic auth (`basicAuth`), error echo (`scrubLangfuseError`).
- Verified console adapter emits via shared logger (JSON.stringify extra; console.log/warn/error the formatted string).

---

## Findings

### CRITICAL

None.

### HIGH

#### H-1 — DNS-rebinding TOCTOU between SSRF pre-check and outbound fetch

File: `/workspace/.worktrees/H3/packages/shared/src/net/ssrf.ts:152-176`
File: `/workspace/.worktrees/H3/packages/server/src/services/observability/langfuse-adapter.ts:205-224`

Issue: `assertUrlNotSSRF` resolves the hostname via `dns.lookup({all:true})`, validates each address is public, then returns `ok`. The adapter subsequently calls `fetch(`${base}/api/public/ingestion`, …)`, which performs its **own** DNS lookup. If the attacker's authoritative DNS returns a public IP during the pre-check and a private IP (e.g., `169.254.169.254`, `10.0.0.x`, link-local) for the second lookup, the fetch connects to an internal service — classic DNS rebinding. TTL can be 0 to force re-lookup.

STRIDE: Information Disclosure + Elevation of Privilege (reach cloud metadata, internal services) via user-controlled `langfuseBaseUrl`.

Impact: HIGH. An operator-level writer of `observability.langfuse_url` can coerce the server to POST Basic-auth-bearing traffic into internal addresses. Even with loopback-only HTTP, HTTPS targets are unbounded.
Likelihood: MEDIUM. Requires operator-level config write, but operator key is the sole auth.

Fix: (a) Resolve the host once, then pass the resolved IP as the fetch target with `Host` header preserved (requires `undici` dispatcher or manual `node:http.request({host:ip, headers:{Host}})`). (b) Or add an `http.Agent` with a `lookup` that re-validates `isPrivateIPv4/isPrivateIPv6` for every connect and throws. (c) Document the residual risk until pinned.
Tier: **ASK FIRST** — operator-controlled and currently has swallowErrors=true in production, but fix is recommended.

### MEDIUM

#### M-1 — Short Langfuse keys evade context-aware error scrubbing

File: `/workspace/.worktrees/H3/packages/server/src/services/notifications/redact.ts:39`
File: `/workspace/.worktrees/H3/packages/server/src/services/observability/config.ts:200-211`

Issue: `scrubErrorMessage` skips replacement strings with `value.length < 4`. `sanitizeLangfuseKey` accepts any non-empty key up to 512 chars (self-hosted Langfuse may issue short tokens). A 1-3 char key embedded in a 5xx body from Langfuse would not be wholesale-scrubbed; it must then match a generic `sk-` / `pk-` / hex/bearer shape to be redacted — unlikely for arbitrary short tokens.

STRIDE: Information Disclosure via error-path echo (only when `swallowErrors=false`; in prod it is true, so error messages are silenced — but tests and any future change to enable propagation risk leaking).

Impact: MEDIUM. Likelihood: LOW.

Fix: Enforce a minimum Langfuse key length (e.g. 8 chars) in `sanitizeLangfuseKey` to match the 4-char minimum scrub threshold; or change `scrubErrorMessage` to scrub any non-empty context value verbatim.
Tier: **ALWAYS** (secrets never leak).

#### M-2 — `argsSummary` contract is caller-trust; patterns miss common credential shapes

File: `/workspace/.worktrees/H3/packages/server/src/services/observability/dispatcher.ts:363-367`
File: `/workspace/.worktrees/H3/packages/shared/src/redact.ts:17-56`

Issue: `ObservabilityEvent.argsSummary` is typed `string` with a comment (“bounded preview of args, secrets scrubbed. Never the raw object.”) but nothing structural enforces the sanitization invariant. No bus subscription is wired for `tool_call` today (verified: `registerObservabilityDispatcher` subscribes `session_started`, `session_ended`, `task_state_changed`, `bet_state_changed`, `bet_shipped`, `cost_cap_warning`, `cost_cap_breached`, `knowledge_updated`; no `tool_call`). When a future call site wires tool-call emission it is expected to call `summarizeToolArgs` — if not, raw args flow to Langfuse. `summarizeToolArgs` redacts `Bearer`, `sk-`, `pk-`, `gh[pousr]_` only. It misses:

- AWS access keys (`AKIA[0-9A-Z]{16}`)
- Slack tokens (`xox[abpsr]-…`)
- Google API keys (`AIza[0-9A-Za-z\-_]{35}`)
- JWTs (`eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`)
- Stripe live keys (`(sk|pk|rk)_live_[…]`, `(sk|pk|rk)_test_[…]`)
- PEM private-key bodies (`-----BEGIN …`)

File contents (e.g. an agent's Read tool result) are not sanitized at all.

STRIDE: Information Disclosure across trust boundary (agent context → third-party SaaS Langfuse).

Impact: MEDIUM-HIGH when wired. Likelihood: MEDIUM once `tool_call` is emitted.

Fix: (a) Add a branded type `ArgsSummary` that can only be produced by `summarizeToolArgs`. (b) Extend `scrubInlineTokens` to cover AKIA, xox, AIza, JWT, Stripe, PEM. (c) Gate any `enqueue({kind:"tool_call"})` call sites behind a central helper.
Tier: **ALWAYS**.

#### M-3 — Dispatcher is single-instance; PATCH /config does not rotate credentials

File: `/workspace/.worktrees/H3/packages/server/src/app.ts:188-208`
File: `/workspace/.worktrees/H3/packages/server/src/routes/observability-routes.ts:88-107`

Issue: The dispatcher + adapter are constructed once from `readObservabilityConfig(db)` at `createApp` time. `PATCH /config` updates `factory_settings` but the in-memory adapter continues to use the original URL, publicKey, and secretKey. Disabling observability (`enabled=false`) does not stop delivery; rotating keys does not invalidate the prior key in memory.

STRIDE: Repudiation (operator believes key is revoked; deliveries continue), Information Disclosure (events continue to flow post-"disable"), Elevation of Privilege (if config is switched to `noop`, events still ship to old adapter until restart).

Impact: MEDIUM. Likelihood: HIGH once PATCH is used operationally.

Fix: Rebuild the dispatcher+adapter on successful PATCH (dispose old, construct new from updated config). Add a test that asserts post-PATCH deliveries use the new URL/keys.
Tier: **ALWAYS** (secrets must be revocable).

### LOW

#### L-1 — zod validation error surfaces `issues` shape

File: `/workspace/.worktrees/H3/packages/server/src/middleware/validate.ts:13-19`

Issue: `details: { issues: result.error.issues }` returns zod internals (`path`, `code`, `message`, `expected`, `received`). Zod's `issues` typically exclude raw input, but the `path` array tells an attacker which field names the server recognizes on a strict schema, and `unrecognized_keys` issues include the unknown key names. Low info-disclosure risk.

Impact: LOW. Likelihood: N/A (observability routes require auth).

Fix: If the project targets general hygiene, consider mapping to `issues.map(i=>({path:i.path.join('.'), code:i.code, message:i.message}))` and dropping `received`/`expected`.
Tier: **ASK FIRST**.

#### L-2 — Config change audit is log-only (no persistent trail)

File: `/workspace/.worktrees/H3/packages/server/src/routes/observability-routes.ts:100-105`

Issue: The admin audit emits a structured log line (`config_changed`) but there is no DB row recording who changed what. `actor` is hard-coded `"api-key"`. On log rotation the audit is lost; the operator cannot prove non-repudiation of credential changes later.

STRIDE: Repudiation.

Impact: LOW. Likelihood: HIGH (any config change).

Fix: Persist an `audit_events` row (actor, resource, diff-redacted, ts) in the same transaction that writes `factory_settings`.
Tier: **ASK FIRST**.

#### L-3 — Batch POST body size unbounded

File: `/workspace/.worktrees/H3/packages/server/src/services/observability/langfuse-adapter.ts:205-224`
File: `/workspace/.worktrees/H3/packages/server/src/services/observability/dispatcher.ts:122-140`

Issue: `batchSize` caps at 1000 and `argsSummary` at 512 chars. Upper-bound body ≈ 1000 × ~2KB = ~2MB per POST. Langfuse may 413 the request; the whole batch is then dropped. Not a DoS against HyperIdle (disposable telemetry); worth flagging.

Impact: LOW. Likelihood: LOW.

Fix: Add a soft JSON body cap (e.g., 1MB) with auto-subdivide; or reduce batchSize ceiling.
Tier: **ASK FIRST**.

---

## STRIDE Summary

| Threat | Route/Component | Status |
|---|---|---|
| Spoofing | authMiddleware (`X-API-Key` compare vs env) | OK; constant-time compare not used — but single-key model ≤ auth gate; LOW. |
| Tampering | DB writes via upsert on `factory_settings` | OK; Drizzle parameterized. No raw SQL in scope. |
| Repudiation | `/config PATCH` audit | WEAK (log-only) — L-2. |
| Info Disclosure | GET /config, GET /status, error paths | OK (keys `***`; status has no events/buffer contents); short-key scrub gap — M-1. |
| Info Disclosure (outbound) | Langfuse adapter | OK headers (`Authorization` basic-encoded; swallowErrors=true in prod); argsSummary coverage gap — M-2; DNS rebind — H-1. |
| DoS | dispatcher buffer / interval | OK (bufferCap, drop-oldest, drain on failure, unref timer, non-blocking enqueue). POST /flush only triggers existing buffer drain. |
| Elevation of Privilege | agent → outbound URL | Mitigated by SSRF helper; TOCTOU gap — H-1. |

---

## Positive observations (do not regress)

- `basicAuth` uses `Buffer.from(...).toString("base64")`; byte-level header injection impossible.
- `sanitizeLangfuseKey` blocks `\0\r\n` defense-in-depth even though base64 already neutralises.
- `sanitizeHttpUrl` blocks userinfo, non-http(s), metadata hostnames, `.local`, CGNAT, and all loopback paths.
- `redactObservabilityConfig` masks keys before any JSON response; `auditDiff` masks before log emission.
- Dispatcher disposes the timer via `unref()` and drains on dispose.
- Langfuse 207 Multi-Status handled as success; 4xx/5xx body is truncated to 200 chars + scrubbed before surfacing.
- Logger `JSON.stringify` neutralises `\n`/ANSI in log-extra fields (log injection resistant).
- Observability routes mounted under `/api/observability` and require `authMiddleware`.
- `tool_call` is not currently wired on the bus — the DoS/scrub risk is latent, not live.

---

## Recommendations by tier

**ALWAYS fix (CRITICAL if shipped as-is):** none.

**ALWAYS fix (next iteration):** M-2 (extend inline scrub patterns + brand `ArgsSummary`); M-3 (PATCH must rebuild dispatcher so credential rotation takes effect).

**ASK FIRST:** H-1 (DNS rebind mitigation), M-1 (raise min key length), L-1 (zod issue shape), L-2 (DB audit trail), L-3 (batch body cap).

**NEVER violations:** none observed.
