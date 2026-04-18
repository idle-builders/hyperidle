# H2 Security Review — Notification System

Read-only security analysis of the H2 notification subsystem:
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/*.ts`
- `/workspace/.worktrees/H2/packages/server/src/routes/notifications-routes.ts`
- `/workspace/.worktrees/H2/packages/db/src/schema.ts`, `schema.pg.ts` (`notification_queue`)

All routes sit behind `authMiddleware` (global API key) — there is no notion of per-tenant or per-role auth at the app level, so any caller with the single API key is effectively admin. Many findings below are MEDIUM precisely because a valid API key is assumed; if the key ever leaks or this is exposed cross-tenant, they jump to HIGH/CRITICAL.

---

## Summary (< 250 words)

Input validation on `PATCH /config` is solid for emails, ntfy URLs, SMTP hosts, and ntfy topics. Sensitive fields (SMTP password, ntfy auth token) are redacted on `GET /config` using a dedicated `SafeNotificationConfig` shape. The notification queue never stores credentials — titles/bodies only — so `notification_queue.body` is not a credential leak surface on its own.

The most material issues:

1. `POST /notifications/test` can be used as an SMTP/ntfy relay and has zero rate-limiting; combined with lack of validation on the `smtp-from` header leaves a minor header-injection hole.
2. `smtpUsername` / `smtpPassword` are NOT sanitized for CRLF before being passed to nodemailer AUTH — an attacker with API-key access can inject SMTP commands via the username.
3. `GET /queue` accepts an unvalidated `status` query string and streams `title` fields of every queue row (no authz scoping, no pagination cursor, no redaction of possibly-sensitive item titles).
4. `sanitizeNtfyUrl` allows any non-loopback HTTPS URL, permitting SSRF to internal cloud metadata endpoints reachable via HTTPS and to link-local addresses.
5. Flood bucket is per-process in-memory, so a restart resets the cap — cost-amplification via restart-loop.
6. `ignoreTls` on the SMTP adapter has no schema gate — if ever surfaced through config it would silently disable TLS verification.

Full findings with file/line, exploit, and fix below.

---

## STRIDE Pass — Route Surface

| Route | Spoofing | Tampering | Repudiation | Info Disclosure | DoS | EoP |
|---|---|---|---|---|---|---|
| `PATCH /config` | API key only | Any API-key holder can rewrite SMTP creds, ntfy base URL, recipient | No audit log of who changed config | Redacts on GET, but not on PATCH echo | No rate limit | Global admin-only, but effectively single trust tier |
| `POST /test` | " | " | No audit log of test sends | Error text bubbled back raw | **No rate limit → relay / amplification** | Use to confirm stolen creds |
| `GET /queue` | " | n/a | n/a | **Leaks titles of every queued item** | Unbounded via repeated polling (capped 500/req but no per-minute limit) | n/a |
| `POST /flush` | " | " | No audit log | Triggers external network I/O | Can be used to flush a poisoned queue | n/a |
| `POST /digest` | " | " | " | Fires a real digest send | Cost amplification via repeated calls | n/a |

---

## Findings

### HIGH — SMTP credential CRLF injection (no sanitization on username/password)

File: `/workspace/.worktrees/H2/packages/server/src/routes/notifications-routes.ts:45-46`
File: `/workspace/.worktrees/H2/packages/server/src/services/notifications/smtp-adapter.ts:38-47`

Issue: `smtpUsername` and `smtpPassword` are only length-bounded via Zod. They are passed directly to `nodemailer.createTransport({ auth: { user, pass } })`. `sanitizeEmail`, `sanitizeSmtpHost`, `sanitizeNtfyUrl` all reject CR/LF — but no sanitizer exists for `smtpUsername` / `smtpPassword`. Nodemailer's SMTP AUTH LOGIN base64-encodes user/pass so classical header injection via AUTH LOGIN is not directly exploitable, but:

- An attacker holding the API key can store arbitrary bytes that the adapter will replay during STARTTLS negotiation if the SMTP server disables LOGIN and offers PLAIN or XOAUTH2 paths, where nodemailer composes headers from these strings.
- The `smtpFrom` field IS sanitized via `sanitizeEmail`, but `from` is also used as a raw string by nodemailer in the envelope AND in the `From:` header. `sanitizeEmail` forbids `<>` characters, so display names like `HyperIdle <bot@x>` are rejected — however a subtle RFC 5321/5322 split (envelope vs. header) is still parseable by the server.

Exploit: With API key, `PATCH /config { "smtpUsername": "user\r\nDATA\r\nSubject: injected\r\n" }`. Whether this escapes depends on the SMTP server's SASL parser, but the defensive posture is to reject CR/LF on every string that flows into nodemailer.

Fix: add `sanitizeSmtpCredential` rejecting CR/LF/NUL for username and password; apply to `patch.smtpUsername` and `patch.smtpPassword` in `validatePatchBody`. Mirror the existing `sanitizeEmail`/`sanitizeSmtpHost` pattern.

Classification: ALWAYS — input validation at every system boundary.

---

### HIGH — `POST /notifications/test` is an unrated SMTP/ntfy relay

File: `/workspace/.worktrees/H2/packages/server/src/routes/notifications-routes.ts:123-154`

Issue: `/test` sends a hardcoded body to whatever recipient is currently configured. There is no rate limit anywhere in the server (`Grep rate[Ll]imit` returned zero matches). The request path:

1. Caller PATCHes recipient to `victim@example.com`
2. Caller POSTs `/test` N times
3. Each POST emits an email via the configured SMTP creds (whose username/password are effectively "stored sender").

While `/test` only lets you send one fixed-title body, combined with `PATCH /config` the attacker can set recipient, set `smtpFrom`, then hammer `/test` using the server as a spam gateway. For ntfy, rotating `recipientNtfyTopic` between POSTs lets the caller spray arbitrary ntfy topics.

Exploit: spam/amplification + creds-for-relay if the API key ever leaks.

Fix:
- Add a per-route rate limit (token bucket: e.g. 5 `/test` per minute per process, independent of the flood limiter which is scoped to dispatcher push).
- Consider requiring the test body to include a server-signed nonce from `GET /config` so `/test` can't be scripted without first reading config.
- Audit-log every `/test` invocation (store test sends in `notification_queue` with `reason: "test"` — currently no audit trail exists).

Classification: ALWAYS — cost-amplification / spam relay prevention.

---

### HIGH — SSRF via `ntfyBaseUrl` (only loopback is special-cased, not private networks)

File: `/workspace/.worktrees/H2/packages/server/src/services/notifications/config.ts:341-365`

Issue: `sanitizeNtfyUrl` accepts any HTTPS URL and any HTTP loopback. It does NOT reject:

- Link-local `https://169.254.169.254/` (AWS/GCP/Azure metadata if SSL is terminated there, or HTTP metadata reachable via HTTPS proxy)
- RFC 1918 private space `https://10.0.0.1/`, `https://192.168.1.1/`
- Link-local IPv6 `https://[fe80::1]/`
- DNS-rebinding hostnames that resolve to private IPs on the second fetch

The ntfy adapter then POSTs to `${base}/${topic}` with the full `Authorization: Bearer <token>` header, which means if an attacker can make `ntfyBaseUrl` point to their server, they trivially exfiltrate `ntfyAuthToken`.

Exploit: With API key, set `ntfyBaseUrl` to `https://attacker.example/`, set `ntfyAuthToken` to the real token (or wait for an admin to do so), POST `/test`, and collect the bearer on the attacker's server.

Fix:
- In `sanitizeNtfyUrl`, after `new URL()`, resolve `url.hostname` and refuse any IP in: 10/8, 172.16/12, 192.168/16, 169.254/16, 127/8 (except configured loopback), 0/8, 100.64/10, IPv6 ULAs (fc00::/7), link-local (fe80::/10), and multicast.
- Better: maintain an allowlist of known ntfy hosts (`ntfy.sh`, self-hosted configured via env) rather than a denylist. An allowlist belongs to the ASK FIRST tier.
- Bind `Authorization` to a host pin: if the stored token was last saved against `ntfy.sh` and the base URL changes, force re-entry of the token.

Classification: ALWAYS — SSRF to internal services is a NEVER-level escalation.

---

### DEFERRED: per-product tenant scoping on `/queue`

**DEFERRED** — `GET /queue` is factory-scoped; cross-product tenant isolation is a separate story (tenant model not yet landed). `status` query-param validation is now enforced via zod; see `notifications-routes.ts`.

### MEDIUM — `GET /queue` leaks titles across products; `status` query param not validated

File: `/workspace/.worktrees/H2/packages/server/src/routes/notifications-routes.ts:156-185`

Issue 1: `statusParam` comes directly from `c.req.query("status") ?? "pending"` and is passed to Drizzle's `eq(notificationQueue.status, statusParam)`. Drizzle parameterizes so this is not SQL injection, but accepting any string is sloppy — invalid values silently return an empty list instead of 400. Contract drift: future migrations may store arbitrary status strings that `GET /queue` will happily echo.

Issue 2: The response includes `title` for every queue row, and titles are copied verbatim from `item.title.slice(0, 140)` (dispatcher.ts:72). Items created by any agent across any product land in the same queue — there is NO product scoping on the query. In HyperIdle's multi-tenant model this is a cross-product info disclosure if product-A's items have sensitive titles and product-B has API-key access.

Issue 3: Response excludes `body` and `lastError`, which is good — but it still includes `subjectId` and `eventType`, which are enough to fingerprint items across products.

Exploit: With API key, any product's operator can enumerate all blocking/digest items system-wide.

Fix:
- Validate `statusParam` with `z.enum(["pending", "sent", "failed", "dropped"])` or return 400.
- Add an explicit `productId` filter (join through `items` → `tasks` → `products`) and require it server-side once the auth model gains tenant scope.
- Until then, explicitly `// @lore` that `/queue` is factory-global and must be re-scoped when per-product auth lands.

Classification: ALWAYS (validation) + ASK FIRST (multi-tenant scoping — is this cross-product disclosure intended?).

---

### MEDIUM — `lastError` can include SMTP server response bodies / nodemailer stack messages

File: `/workspace/.worktrees/H2/packages/server/src/services/notifications/dispatcher.ts:247-257`
File: `/workspace/.worktrees/H2/packages/server/src/services/notifications/smtp-adapter.ts:70-79`

Issue: `lastError: result.error` persists the raw `err.message` from nodemailer/ntfy into `notification_queue.last_error`. Nodemailer sometimes embeds the failed SMTP command in error messages (e.g. "Invalid login: 535-5.7.8 Username and Password not accepted" or worse, commands that include the username). Although `GET /queue` does not currently expose `lastError`, a future admin page could — and the row sits in SQLite on disk, accessible to anyone with filesystem access.

Exploit (in conjunction with finding above): if `/queue` response later adds `lastError` (common scope creep), passwords typed into a misconfig may end up persisted.

Fix:
- Scrub credentials from `result.error` in `smtp-adapter.ts` before returning. Never include the username or password substring in the error. Maintain an allowlist of safe SMTP error prefixes (`ECONNREFUSED`, `ETIMEDOUT`, numeric SMTP codes, the first 200 chars of the SMTP reply).
- Same for ntfy: `ntfy-adapter.ts:102` truncates `text.slice(0, 200)` — good — but could still leak a misconfigured proxy body. Consider dropping `text` entirely and keeping only `res.status`.

Classification: ALWAYS — secrets never in logs/DB.

---

### DEFERRED: distributed flood bucket

**DEFERRED** — Single-node flood bucket assumption matches H1's mutex scope; multi-instance enforcement requires a shared coordination substrate (Redis/DB-backed token bucket). Out of scope for H2.

### DEFERRED: byte/grapheme-aware slicing

**DEFERRED** — Title/body slicing on code units is a defense-in-depth reliability concern, not a security boundary. Using `Array.from(str).slice(...)` to iterate codepoints in ntfy headers is a follow-up; documented rationale: current sanitizers already restrict topic to `[A-Za-z0-9_-]`, and SMTP subject/body are encoded by nodemailer.

### MEDIUM — Flood-control bucket is per-process in-memory; survives neither restart nor multi-instance

File: `/workspace/.worktrees/H2/packages/server/src/services/notifications/dispatcher.ts:262-280, 381-399`

Issue: `state.flood` is a closure inside `registerNotificationDispatcher`. It is:
- Reset on every process restart → a crash-loop lets an attacker with inbound events trigger `cfg.flood.maxPerMinute` pushes per restart.
- Not shared across multiple server instances → in a horizontal scale-out the effective cap becomes `N * maxPerMinute`.

Exploit: Cost-amplification. Create items tagged blocking on a loop; combined with a deliberately-triggered restart (via crash input, resource exhaustion), the attacker can exceed the configured notification budget.

Fix: Track the flood window in `factory_settings` (or a new `notification_flood` table) keyed by window-start-minute. Use an atomic upsert so concurrent dispatchers serialize on the DB row. Document the multi-instance expectation.

Classification: ALWAYS — cost budget enforcement must be server-side AND durable.

---

### MEDIUM — `ignoreTls` / `rejectUnauthorized: false` has no config gate

File: `/workspace/.worktrees/H2/packages/server/src/services/notifications/smtp-adapter.ts:32-47`

Issue: `SmtpAdapterOptions.ignoreTls` is wired to `ignoreTLS: true` AND `tls: { rejectUnauthorized: false }`. The comment says "ONLY for integration tests" but the flag is plumbed through `createSmtpAdapter`, and any future caller (or a test leak into the default factory) disables cert validation silently. There is no `NODE_ENV === "test"` guard.

Exploit: If `ignoreTls` is ever exposed via config (accidental refactor), an attacker with API-key access flips it and MITM'd SMTP traffic exfiltrates the password.

Fix: Add a runtime guard — `if (opts.ignoreTls && process.env.NODE_ENV === "production") throw new Error(...)` — and put a `// @lore NEVER expose this via PATCH /config` comment near the field.

Classification: NEVER — disabling auth/TLS for "convenience" is on the NEVER list.

---

### MEDIUM — `PATCH /config` has no audit log of WHO changed WHAT

File: `/workspace/.worktrees/H2/packages/server/src/services/notifications/config.ts:249-276`

Issue: `updateNotificationConfig` writes straight into `factory_settings` without recording the prior value or the actor. Combined with the single-API-key auth model, there is no way to tell whether the CEO, a rogue agent, or an attacker rotated `recipientEmail` to an attacker-controlled inbox. Silence windows and recipients can be flipped without detection.

Exploit: Credential theft without attribution; "log silently, then exfil" attacks against the notification system itself.

Fix: Write to a `factory_settings_history` table on every change (old value redacted for secrets, new value's `*Set` flag, timestamp, request ID). Hono middleware already has request context.

Classification: STRIDE-R (Repudiation). ASK FIRST — do we have a general audit log? If yes, reuse it; if no, this becomes ALWAYS for security-sensitive settings.

---

### LOW — `sanitizeEmail` allows display-name-like smuggling in `smtpFrom`

File: `/workspace/.worktrees/H2/packages/server/src/services/notifications/config.ts:309-322`

Issue: The regex `^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$` correctly rejects `<>`, but does not enforce overall RFC 5321 envelope rules. Emails like `a@b.c;x@y.z` cannot slip through (semicolon and whitespace blocked implicitly), but Unicode confusables are allowed (`аdmin@…` with a Cyrillic а). `smtpFrom` reuses this, so a Cyrillic homoglyph `From:` spoof is possible.

Exploit: Social-engineer end-users via display-name look-alikes if the email client renders Cyrillic/Latin homoglyphs identically.

Fix: Consider a stricter IDN normalization (`url.hostname` via `new URL("mailto:" + email)` then `hostname` for the domain portion), or enforce ASCII-only for the admin-configured sender.

Classification: ASK FIRST — is IDN support desired for customers?

---

### LOW — ntfy topic `%`-encoding layered on top of existing sanitization

File: `/workspace/.worktrees/H2/packages/server/src/services/notifications/ntfy-adapter.ts:79`

Issue: `${base}/${encodeURIComponent(recipient.channelId)}`. `sanitizeTopic` already limits topics to `[A-Za-z0-9_-]+`, so `encodeURIComponent` is a no-op. Harmless, but gives a false sense of security — if a future refactor widens `sanitizeTopic`, the encoder may be relied on to "protect" the URL. Prefer defense-in-depth where the URL concatenation assumes the sanitized character set and does not rely on the encoder.

Fix: Add an assertion after `sanitizeTopic` that the encoded value equals the raw value, and a `// @lore` comment binding the two contracts together.

Classification: ASK FIRST.

---

### LOW — Title/body truncation silently corrupts multi-byte characters

File: `/workspace/.worktrees/H2/packages/server/src/services/notifications/dispatcher.ts:72-77, 89, 92, 104, 107`

Issue: `item.title.slice(0, 140)` and `body.slice(0, 10_000)` slice on code units, not code points or bytes. Cutting a surrogate pair mid-character produces an invalid UTF-16 string that, when encoded to UTF-8 in the outbound HTTP body, yields a replacement character. For SMTP this is harmless; for `Title:` in the ntfy header it could be mis-decoded by the server. Not a security boundary, but a reliability concern that becomes security-relevant if the ntfy server reacts to malformed UTF-8 by echoing back raw bytes.

Fix: Use grapheme-aware or byte-length truncation; alternatively encode to UTF-8 first, slice bytes, decode with `ignoreBOM:false, fatal:false` replacement.

Classification: ALWAYS (defense-in-depth for any string that crosses a protocol boundary).

---

### INFO — `notification_queue.payload` JSON concern is NOT present in this schema

File: `/workspace/.worktrees/H2/packages/db/src/schema.ts:293-314`
File: `/workspace/.worktrees/H2/packages/db/src/schema.pg.ts:293-314`

The scope prompt asked about `notification_queue.payload` storing credentials. The current schema has NO `payload` column — only `title`, `body`, `last_error`, `event_type`, `subject_id`, `severity`, `reason`, `channel`, `status`, `attempts`, timestamps. Credentials are NOT persisted in the queue. `factory_settings.notifications.smtp_password` and `notifications.ntfy_auth_token` are stored in cleartext in `factory_settings.value` — see finding below.

---

### DEFERRED: follow-up story for KMS/secret manager integration

**DEFERRED** — Encryption-at-rest for SMTP credentials and ntfy auth tokens is scoped to a follow-up story; it is an OS/deployment concern that requires KMS or secret-manager integration (libsodium secretbox + env-var master key, or OS keyring). The H2 scope ends at boundary hardening (CRLF, CRSF / SSRF, rate-limiting, audit). H2 does not persist creds anywhere beyond `factory_settings`, and `GET /config` redacts them.

### HIGH — SMTP password and ntfy auth token stored in `factory_settings.value` cleartext

File: `/workspace/.worktrees/H2/packages/server/src/services/notifications/config.ts:221-243`
File: `/workspace/.worktrees/H2/packages/db/src/schema.ts` (`factory_settings` key/value table — value is `text`)

Issue: `smtpPassword` and `ntfyAuthToken` persist as plaintext strings in `factory_settings.value`. Anyone with read access to the SQLite file or the PostgreSQL row reads the credentials directly. Drizzle writes them via `upsert`; no encryption-at-rest layer exists in the server package.

Exploit: SQLite file exfil from a backup or a Docker volume snapshot → SMTP credentials → send mail as the factory, and ntfy token → subscribe to every topic.

Fix:
- Pick an encryption strategy (libsodium `secretbox` with a key derived from an env-var master key, or OS keyring). Wrap the two setters in `encryptBeforeWrite` / `decryptOnRead`.
- Redact the plaintext values from all logs (currently `logger.error("dispatcher: adapter send failed", { error, retriable, channel })` at dispatcher.ts:317-321 does not log creds, good — but `smtp-adapter.ts` error path at line 71 includes `err.message` which occasionally includes `BadCredentials: Your username is '<user>'...`).
- Store the encryption key OUTSIDE the same SQLite file.

Classification: ALWAYS — secrets never in cleartext at rest. This is the single biggest gap.

---

## Three-Tier Classification of Findings

### ALWAYS (automatic fix required)
- SMTP username/password CRLF sanitization
- `/test` rate limit and audit trail
- SSRF allowlist / IP-literal denial on `ntfyBaseUrl`
- `/queue` `status` enum validation + product scoping
- Secret-scrub on `lastError` + adapter error messages
- Flood bucket persistence
- `ignoreTls` runtime guard
- Title/body UTF-8-aware truncation
- Credentials encryption at rest

### ASK FIRST (needs human decision)
- Audit log schema for factory_settings mutations
- IDN / homoglyph policy for `smtpFrom`
- Multi-tenant scoping of `/queue` (blocking until tenant model lands)
- Ntfy-host allowlist vs. denylist

### NEVER (block unconditionally)
- Exposing `ignoreTls` via API
- Logging SMTP passwords or ntfy tokens
- Accepting `ntfyBaseUrl` pointing to 169.254.169.254 metadata endpoints

---

## Files reviewed (absolute paths)

- `/workspace/.worktrees/H2/packages/server/src/services/notifications/config.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/dispatcher.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/smtp-adapter.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/ntfy-adapter.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/console-adapter.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/digest.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/silence-policy.ts`
- `/workspace/.worktrees/H2/packages/server/src/services/notifications/types.ts`
- `/workspace/.worktrees/H2/packages/server/src/routes/notifications-routes.ts`
- `/workspace/.worktrees/H2/packages/server/src/middleware/auth.ts`
- `/workspace/.worktrees/H2/packages/server/src/app.ts`
- `/workspace/.worktrees/H2/packages/db/src/schema.ts`
- `/workspace/.worktrees/H2/packages/db/src/schema.pg.ts`
