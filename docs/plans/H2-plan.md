# H2 — Notification Adapter: Implementation Plan

**Worktree:** `/workspace/.worktrees/H2` (branch `feat/H2-notification-adapter`)
**Story source:** `docs/work-packages/TRACK-H.md` §H2
**Dependencies claimed:** E2 (policy engine silence/queue + item_created routing), A3 (event bus + cost_cap events). Both are merged on main — policy-engine.ts, daily-digest.ts, cost-cap.ts, event-bus.ts, events.ts.
**Architecture anchor:** ARCHITECTURE.md §2.9 (Notification Adapter — Meta Layer adapter pattern). REQUIREMENTS.md §S-8 (ntfy.sh / SMTP default). UX-3.1 (blocking + urgent only). UX-3.2 (non-urgent → daily digest). UX-3.3 (quiet hours per-human / per-product).

---

## 1. Context

Blocking review items and cost-cap breaches already produce structured events (`item_created` with `blocking=1`; `cost_cap_breached`; `cost_cap_warning`). Policy Engine (E7) already decides `push | queue | auto_resolve` and emits the synthetic `notification` event for `push`. Today the `notification` event has no subscriber — the rail/WS broadcaster shows the item in-app, but nothing reaches a founder's phone or mailbox when the app is closed.

H2 delivers the missing subscriber: a pluggable **Notification Dispatcher** that listens for push-worthy domain events, re-evaluates silence policy defensively, applies a push-vs-digest routing decision, and emits through a swappable **NotificationAdapter** (Console for dev, Ntfy for self-hosted push, SMTP for email fallback). During silence windows, items enqueue to a persistent queue table; a scheduled routine flushes a batched daily digest through SMTP.

---

## 2. Acceptance criteria → verification map

| # | AC | Verification method | Test file(s) |
|---|----|--------------------|--------------|
| AC1 | Console adapter: blocking item logged to console | Unit test: build fake logger; call `ConsoleAdapter.send(recipient, { title, body, severity:"blocking" })`; assert logger captured a structured line containing the title, severity, and recipient id. No real `console.log` (uses injected `Logger`). | `packages/server/src/__tests__/notification-console-adapter.test.ts` |
| AC2 | Ntfy adapter: push sent to ntfy.sh topic (integration test) | Integration test: start a `createServer(handler)` HTTP fixture bound to `127.0.0.1:0`; point `NtfyAdapter.send(...)` at `http://127.0.0.1:<port>/<topic>`; assert handler received `POST /<topic>`, body=message, headers `Title`, `Priority`, `Tags` present. No network call to ntfy.sh. | `packages/server/src/__tests__/notification-ntfy-adapter.integration.test.ts` |
| AC3 | SMTP adapter: email sent (integration test with MailHog) | Integration test using `smtp-server` library as in-process MailHog replacement: start server on `127.0.0.1:0`; `SmtpAdapter.send(...)`; assert server received one RCPT TO equal to recipient email, DATA contains subject + body. Skipped on CI with `it.skipIf(process.env.CI_SKIP_SMTP)` with clear rationale. | `packages/server/src/__tests__/notification-smtp-adapter.integration.test.ts` |
| AC4 | Silence mode: items queued during quiet hours, not pushed | Integration test: seed `notifications.silence_mode = "true"`; emit a non-urgent `item_created`; assert (a) `notification_queue` has one row with the item id, (b) the Console/Ntfy fake adapter recorded ZERO `send` calls. Second test flips silence off, calls `flushQueue(db, adapter)`, asserts adapter received exactly one call and queue is empty. | `packages/server/src/__tests__/notification-dispatcher.test.ts` |
| AC5 | Push policy: only blocking items + cost breaches (not low-risk) | Dispatcher unit test parametrized over event fixtures: (a) blocking `item_created` → pushes, (b) `cost_cap_breached` → pushes, (c) `cost_cap_warning` level=warning → does NOT push (queues for digest), (d) non-blocking low-risk `item_created` → does NOT push. Uses a FakeAdapter that records calls. | `packages/server/src/__tests__/notification-dispatcher.test.ts` |
| AC6 | Daily digest: non-urgent items accumulated and sent | Integration test: enqueue three non-urgent items over 24h window; call `runDailyDigest(db, adapter)`; assert adapter received exactly one `send` with a body summarizing all three item titles; assert queue rows are marked `status="sent"` (not deleted — for audit). Second test: digest with zero pending items is a no-op. | `packages/server/src/__tests__/notification-digest.test.ts` |

**Additional invariants (test-protected but not AC numbered):**

| Invariant | Test |
|-----------|------|
| No secrets leaked by `GET /config` (SMTP password redacted to `"***"`, ntfy server URL shown but auth token redacted) | `notification-routes.test.ts` |
| Recipient email/topic validated on PATCH — rejects NUL, CRLF, control chars, leading `-` (flag injection) | `notification-routes.test.ts` |
| Dispatcher re-checks silence AFTER debounce / between enqueue and send (defensive — operator may have toggled silence) | `notification-dispatcher.test.ts` |
| Flood guard: if >N pushes in M seconds, coalesce to one "N new items" notification | `notification-dispatcher.test.ts` |
| Config disabled → dispatcher is a no-op; no adapter calls; no queue writes (items still reach the Rail via WS) | `notification-dispatcher.test.ts` |
| Route `POST /test` sends through the configured adapter and reports success/failure without mutating queue | `notification-routes.test.ts` |

---

## 3. Constraints (fixed)

- TypeScript strict, Bun runtime, Vitest, Drizzle ORM (SQLite first, dual-driver required — same migration lands on Postgres).
- Event bus is synchronous in-process. Emit handlers MUST NOT block the producing caller for longer than a few ms — offload network I/O to `queueMicrotask` / `setImmediate` and never `await` in the synchronous handler path.
- `factory_settings` is a `key/value/updatedAt` KV table. Reuse it for config. Do NOT add per-user preference columns in v1 — per-human prefs are UX-3 scope but only one "founder" recipient is configurable in v1.
- No `console.log` in production code — all adapters log through `@hyperidle/shared` `Logger`.
- No new runtime deps unless justified. Approved additions in §7.
- H2 is backend-only. No UI budget spend. Settings panel (UI-42) wires to the routes in a later story.
- Strict layer compliance: Notification Dispatcher lives in the Meta Layer (`packages/server/src/services/`). It subscribes to the event bus; it NEVER calls into the Agent Runtime and NEVER calls back into the Human Interface.

---

## 4. Design

### 4.1 Data flow

```
 item_created (blocking=1)                 cost_cap_breached
 cost_cap_warning (level=critical)         ┃
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━▼━━━━━━━━━━━━━━━━━━━━━
        Notification Dispatcher  (subscribes once at createApp)
        │
        ├─ 1. classify(event) → Severity { "blocking" | "cost_breach" | "digest" | "drop" }
        ├─ 2. loadConfig(db) → NotificationConfig (channel, recipient, adapter settings)
        ├─ 3. if config.enabled === false → drop; return
        ├─ 4. if severity === "drop" → return
        ├─ 5. if isSilenced(db, event, now) OR severity === "digest" →
        │        enqueue(db, event, reason)  (persisted row in notification_queue)
        │        return
        ├─ 6. floodGuard.tryReserve(severity) → if coalesced → enqueue with coalesce marker
        └─ 7. adapter.send(recipient, notification) → SendResult
                 on failure → log + enqueue retry row (best-effort, single retry)

 routine: daily-digest    (triggered by routine-scheduler, calendar cron)
        │
        └─ runDailyDigest(db, adapter) → selects pending `notification_queue` rows,
                                         builds a batched Notification, calls adapter.send,
                                         marks rows status="sent" with sent_at stamp.

 manual flush on silence lift: flushQueue(db, adapter)  (called from PATCH /config
                                                          when silence_mode flips off)
```

### 4.2 New files (and responsibilities)

- `packages/server/src/services/notification-adapter.ts` — adapter interface + three implementations.
  - `export interface NotificationAdapter { name: string; send(recipient, notification): Promise<SendResult> }`
  - `createConsoleAdapter(logger): NotificationAdapter`
  - `createNtfyAdapter(opts: { baseUrl, authToken?, fetch? }): NotificationAdapter`
  - `createSmtpAdapter(opts: SmtpOptions): NotificationAdapter`
- `packages/server/src/services/notification-config.ts` — typed loader/validator over `factory_settings` with `notifications.*` prefix. Mirrors `git-export-config.ts` shape: `readNotificationConfig(db)`, `loadNotificationConfig(db)` (returns `null` when disabled), `updateNotificationConfig(db, patch)`, sanitizers (`sanitizeTopic`, `sanitizeEmail`, `sanitizeNtfyUrl`, `sanitizeRecipient`), `redactNotificationConfig(cfg)` for GET `/config`.
- `packages/server/src/services/notification-dispatcher.ts` — dispatcher + queue.
  - `registerNotificationDispatcher(db, eventBus, deps): () => void` — subscribes to `item_created`, `cost_cap_breached`, `cost_cap_warning`; returns unsubscribe.
  - `classifyEvent(event, item?): Severity` pure.
  - `enqueueNotification(db, event, severity, reason)` — persisted.
  - `flushQueue(db, adapter, now)` — called on silence lift.
  - `FloodGuard` small stateful helper (`tryReserve(key, now): "allow" | "coalesce"`).
- `packages/server/src/services/notification-digest.ts` — scheduled digest runner.
  - `runDailyDigest(db, adapter, now?): Promise<DigestResult>` — reads pending queue rows, builds one digest notification, sends, marks rows.
  - `buildDigestMessage(rows): { subject, body }` pure — unit-testable in isolation (AC6).
- `packages/server/src/routes/notifications-routes.ts` — Hono router mounted at `/api/notifications`.
  - `GET  /config` → `SafeNotificationConfig` (redacted SMTP password, redacted ntfy token).
  - `PATCH /config` → validated partial update.
  - `POST /test` → sends a synthetic test notification through the configured adapter. Body: `{ channel?: "console"|"ntfy"|"smtp" }` (defaults to primary); returns `SendResult` without touching queue.
  - `GET  /queue` → `{ pending: QueueRow[], sent: number, total: number }` — last 24h, redacted bodies (title only).
- Tests:
  - `packages/server/src/__tests__/notification-console-adapter.test.ts`
  - `packages/server/src/__tests__/notification-ntfy-adapter.integration.test.ts`
  - `packages/server/src/__tests__/notification-smtp-adapter.integration.test.ts`
  - `packages/server/src/__tests__/notification-dispatcher.test.ts`
  - `packages/server/src/__tests__/notification-digest.test.ts`
  - `packages/server/src/__tests__/notification-routes.test.ts`
  - `packages/server/src/__tests__/notification-config.test.ts` (sanitizers + redaction)

### 4.3 Files to modify

- `packages/server/src/app.ts` — register router and dispatcher at boot (mirrors existing `registerGitExportHandler` / `registerPolicyEngine` wiring):
  ```
  disposers.push(registerNotificationDispatcher(options.db, eventBus, {
    adapterFactory: options.notificationAdapterFactory ?? createAdapterFromConfig,
    now: options.now,
  }));
  api.route("/notifications", createNotificationRoutes(options.db, eventBus));
  ```
  Add `notificationAdapterFactory?: (cfg) => NotificationAdapter` to `AppOptions` so tests can inject a FakeAdapter.
- `packages/db/src/schema.ts` — add `notification_queue` table (see §4.4). No changes to existing tables.
- `packages/db/src/schema.pg.ts` — mirror the table for Postgres.
- `packages/db/drizzle/migrations/` — `drizzle-kit generate` produces the new migration file for both drivers.
- `packages/db/src/__tests__/migration.test.ts` — extend to assert the new table + indexes exist on both drivers.
- `packages/db/src/seed.ts` — seed default `notifications.*` rows (enabled=false, channel=console). Operator opts in.
- `packages/server/src/__tests__/api-scaffold.test.ts` — assert `/api/notifications/*` is mounted + authed.
- `packages/server/src/services/daily-digest.ts` — **NO edit.** The existing `getDailyDigest()` computes pending items for E7's "accumulation list". H2's digest reads from its own `notification_queue` which is a push-intent queue, not a policy-queued-items query. The two serve different purposes:
  - `daily-digest.ts` (E7): what items are queued in the Rail today?
  - `notification-digest.ts` (H2): what notifications are pending delivery to a founder's inbox/phone?

  CONFUSION flag below addresses the overlap.

### 4.4 Data model change — `notification_queue` table

```ts
export const notificationQueue = sqliteTable(
  "notification_queue",
  {
    id: text("id").primaryKey(),                    // uuid
    eventType: text("event_type").notNull(),        // "item_created" | "cost_cap_breached" | "cost_cap_warning" | "test"
    subjectId: text("subject_id"),                  // itemId or entityId the event referred to
    severity: text("severity").notNull(),           // "blocking" | "cost_breach" | "digest"
    title: text("title").notNull(),
    body: text("body"),
    reason: text("reason").notNull(),               // "silence" | "digest" | "flood_coalesce" | "retry"
    channel: text("channel"),                       // "console" | "ntfy" | "smtp" | null for "any configured"
    status: text("status").notNull(),               // "pending" | "sent" | "failed" | "dropped"
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    sentAt: text("sent_at"),
  },
  (table) => [
    index("nq_status_created_idx").on(table.status, table.createdAt),
    index("nq_severity_idx").on(table.severity),
  ],
);
```

Rationale: a persistent queue survives process restart (the in-memory closure pattern used by git-export's debounce is acceptable for a debouncer but unacceptable for a silence-hold queue where losing a blocking notification is a UX-3 violation). SQLite writes are <1ms; the table stays tiny because `runDailyDigest` marks rows `sent` rather than letting them accumulate.

### 4.5 Public API surface

```ts
// notification-adapter.ts
export type NotificationSeverity = "blocking" | "cost_breach" | "digest";

export interface Recipient {
  /** Adapter-specific identifier: email for SMTP, topic for ntfy, "console" for console. */
  channelId: string;
  /** Display name for logging/audit. */
  label?: string;
}

export interface Notification {
  title: string;          // short subject line, max 140 chars
  body: string;           // plain text, max 10KB after truncation
  severity: NotificationSeverity;
  /** Opaque link back into the app (e.g. "/conversations/item/<id>") for clients that render it. */
  deepLink?: string;
  /** Tags for channels that support categorization (ntfy `Tags` header). */
  tags?: readonly string[];
  /** Monotonic clock timestamp when the notification was produced. */
  timestamp: number;
}

export type SendResult =
  | { ok: true; channel: string; sentAt: string }
  | { ok: false; channel: string; error: string; retriable: boolean };

export interface NotificationAdapter {
  readonly name: "console" | "ntfy" | "smtp";
  send(recipient: Recipient, notification: Notification): Promise<SendResult>;
}

// notification-config.ts
export interface NotificationConfig {
  enabled: boolean;
  /** Primary adapter for blocking pushes. */
  primaryChannel: "console" | "ntfy" | "smtp";
  /** Digest adapter; defaults to primaryChannel when unset. Usually "smtp". */
  digestChannel: "console" | "ntfy" | "smtp";
  recipient: { email: string | null; ntfyTopic: string | null };
  ntfy: { baseUrl: string; authToken: string | null } | null;
  smtp: {
    host: string;
    port: number;
    secure: boolean;        // STARTTLS on 587 vs TLS on 465
    username: string | null;
    password: string | null;
    from: string;
  } | null;
  silence: {
    mode: boolean;                 // factory-wide silence (reuses policy-engine semantics)
    windowStartUtc: string | null; // "HH:MM"
    windowEndUtc: string | null;   // "HH:MM"
  };
  flood: { maxPerMinute: number; coalesceWindowMs: number }; // defaults 6 / 60000
  digest: { cron: string };                                   // default "0 8 * * *" (08:00 UTC)
}

// notification-dispatcher.ts
export interface DispatcherDeps {
  adapterFactory: (cfg: NotificationConfig) => NotificationAdapter;
  now?: () => Date;
  logger?: Logger;
}
export function registerNotificationDispatcher(
  db: HyperIdleDb,
  bus: EventBus,
  deps: DispatcherDeps,
): () => void;

// notification-digest.ts
export interface DigestResult {
  status: "sent" | "noop" | "error";
  notificationsIncluded: number;
  error?: string;
}
export function runDailyDigest(
  db: HyperIdleDb,
  adapter: NotificationAdapter,
  now?: Date,
): Promise<DigestResult>;
```

### 4.6 Configuration — `factory_settings` keys

Prefix: `notifications.`. All defaults opt-out; console-only until operator configures.

| Key | Value | Default | Redacted by GET /config? |
|-----|-------|---------|--------------------------|
| `notifications.enabled` | `"true" \| "false"` | `"false"` | no |
| `notifications.primary_channel` | `"console" \| "ntfy" \| "smtp"` | `"console"` | no |
| `notifications.digest_channel` | same | inherits primary | no |
| `notifications.recipient_email` | email string | unset | no |
| `notifications.recipient_ntfy_topic` | topic slug | unset | no |
| `notifications.ntfy_base_url` | `https://...` | `"https://ntfy.sh"` | no (token-free) |
| `notifications.ntfy_auth_token` | bearer token | unset | YES → `"***"` |
| `notifications.smtp_host` | hostname | unset | no |
| `notifications.smtp_port` | integer | `587` | no |
| `notifications.smtp_secure` | `"true" \| "false"` | `"false"` | no |
| `notifications.smtp_username` | string | unset | no |
| `notifications.smtp_password` | string | unset | YES → `"***"` |
| `notifications.smtp_from` | email | unset | no |
| `notifications.silence_mode` | `"true" \| "false"` | `"false"` — **alias of existing `silence_mode`** used by policy-engine. Single source of truth; see §4.7. | no |
| `notifications.silence_window_start` | `"HH:MM"` UTC | alias of existing `silence_window_start` | no |
| `notifications.silence_window_end` | `"HH:MM"` UTC | alias of existing `silence_window_end` | no |
| `notifications.flood_max_per_minute` | int | `"6"` | no |
| `notifications.flood_coalesce_window_ms` | int | `"60000"` | no |
| `notifications.digest_cron` | cron | `"0 8 * * *"` | no |

### 4.7 Silence integration — reuse policy-engine (not duplicate)

Policy-engine already reads `silence_mode`, `silence_product_<productId>`, `silence_window_start`, `silence_window_end` from `factory_settings` and computes `isSilenced(item, now)`. The dispatcher calls into an **exported** version of that predicate rather than re-implementing:

- Extract the existing private `isSilenced()` + `isInSilenceWindow()` in `policy-engine.ts` into a new shared module `packages/server/src/services/silence-policy.ts` exporting `isSilenced(db, { sourceAgentId }, now): boolean`.
- `policy-engine.ts` imports from `silence-policy.ts` — behavior-preserving refactor, unit tests stay green.
- Dispatcher imports the same function. Single source of truth, no drift.

This is the minimum refactor required to honor the spec's "integrate with the existing policy-engine silence checker rather than duplicating".

### 4.8 Push policy — classification

```
classifyEvent(event): NotificationSeverity | "drop"

  item_created:
    load item (blocking, riskTier)
    if blocking === 1                     → "blocking"
    if riskTier === "high"                → "blocking"
    if riskTier === "medium"              → "digest"
    else                                  → "drop"     // low-risk; policy-engine may auto-resolve

  cost_cap_breached:
    if level === "hard"                   → "cost_breach"
    else                                  → "digest"

  cost_cap_warning:
    if level === "critical"               → "cost_breach"   // treat as push-worthy
    if level === "warning"                → "digest"

  (all other events)                      → ignored (no subscription)
```

`"drop"` emits no queue row and no send — this matches AC5 explicitly (not all events become notifications; low-risk items are silent).

### 4.9 Adapter implementations — key shape

**Console adapter.** Pure: calls injected `Logger.info(title, { severity, recipient, body })`. No side effects beyond logging. AC1 verified without any mocking of `console.log`.

**Ntfy adapter.** `fetch(POST {baseUrl}/{topic}, { headers: { Title, Priority, Tags, Authorization? }, body: notification.body })`. Priority mapping: blocking→`"urgent"`, cost_breach→`"high"`, digest→`"default"`. Accepts an injected `fetch` for testing. On non-2xx response: return `{ ok: false, retriable: status >= 500 }`.

Docs verified: ntfy HTTP POST shape with `Title`, `Priority`, `Tags` headers is current per https://docs.ntfy.sh/publish/#publish-as-json and https://docs.ntfy.sh/publish/#message-priority. `Authorization: Bearer <token>` per https://docs.ntfy.sh/publish/#access-tokens.

**SMTP adapter.** Uses `nodemailer` — mature, no-deps-of-consequence, battle-tested, supports STARTTLS (port 587) and TLS-on-connect (port 465). Docs: https://nodemailer.com/smtp/ — transporter config shape verified. Key calls: `nodemailer.createTransport({ host, port, secure, auth })` then `transporter.sendMail({ from, to, subject, text })`. No HTML — plain text only in v1 (reduces phishing signatures, simpler digest formatting).

Chosen over `bun:smtp` (⚠️ UNVERIFIED — Bun has no first-party SMTP module as of 2026-04; relying on runtime-specific APIs restricts dual-runtime future). Chosen over `emailjs` (smaller user base, less mature TLS handling).

### 4.10 Integration test strategy for SMTP — `smtp-server` over MailHog

Two options:
- **MailHog via Docker.** Realistic SMTP server. Cost: Docker in CI, port management, slower (~3–5s cold start). Non-hermetic.
- **In-process `smtp-server` library (haraldreisinger/smtp-server on npm).** Implements the SMTP protocol in Node. Bind on `127.0.0.1:0`, capture session state. Cost: one dev dep. Gain: hermetic, no Docker, <50ms per test.

**Chosen: `smtp-server` in-process.** The adapter code is identical against either — we are testing OUR adapter, not MailHog. If H4 (deployment profiles) later adds a Docker-based end-to-end smoke test against MailHog, it's additive. Plan documents this deviation from the AC wording (AC3 says "MailHog" — we read that as "a test SMTP server", same intent).

### 4.11 Daily digest scheduling — integrate with routine-scheduler

The plan spec §11 ("integrate with C5 routine scheduler, not self-scheduled") is honored:

- H2 ships a **service function** `runDailyDigest(db, adapter, now?)` — NO setInterval, NO cron string parsed inside this package.
- Routine scheduler integration: extend `routine-scheduler.ts` with a minimal service-registry escape hatch. Adds `registerService(id, fn)` + `unregisterService(id)`, and when `checkAndFireRoutine` sees a routine with `triggerConfig.serviceId` set, invokes the registered service INSTEAD of creating a session. ~25 LOC + tests. This is the smallest possible change; session-based routines stay untouched.
- Seed adds an idempotent routine row (idempotent via `ON CONFLICT DO NOTHING`):
  ```
  routines:
    id = "seed-routine-daily-notification-digest"
    ownerAgentId = "seed-agent-cos"            // Chief of Staff
    triggerType = "calendar"
    triggerConfig = '{"cron":"0 8 * * *","serviceId":"notification_digest"}'
    active = 1
  ```
- On `createApp` boot, wiring calls `registerService("notification_digest", () => runDailyDigest(db, adapterFromConfig(db)))`. Disposer calls `unregisterService("notification_digest")` — standard pattern for graceful teardown.
- Routine-scheduler tests extend to cover: service-registry dispatch, unknown-serviceId warn-log + no-op, service function throws → routine next_run_at still updated (doesn't wedge), disposer unregisters.

**Rationale for rejecting a separate cron in H2:** the spec calls out "not self-scheduled". A parallel scheduler would duplicate cron state across services and make "what runs when" impossible to reason about. The 25-LOC escape hatch is additive + reusable (scheduled git-export can migrate later). Flag for review.

### 4.12 HTTP surface

Under `/api/notifications`, behind `authMiddleware`:

```
GET   /config          → SafeNotificationConfig (redacted)
PATCH /config          body: NotificationConfigPatch (Zod) → SafeNotificationConfig
POST  /test            body: { channel?: "console"|"ntfy"|"smtp" } → SendResult
GET   /queue           query: ?status=pending|sent|failed (default pending), ?limit=50 → QueueRow[]
POST  /flush           body: {} → { flushed: number }   // admin: lift silence + send queued pushes
```

Validation via existing `validateBody(zodSchema)` pattern and per-field sanitizers in `notification-config.ts`. No route may return raw passwords or auth tokens — redaction enforced by `toSafeConfig()`.

---

## 5. Trade-offs

- **Persistent queue vs. in-memory debounce.** Chose persistent (`notification_queue` table) for silence-mode holds — losing a blocking notification because the server restarted is a UX-3 violation. Cost: one migration, ~five Drizzle queries. Acceptable.
- **nodemailer vs. smtp-server vs. bun:smtp.** Nodemailer is the only option in this trio that is a mature, broadly-deployed SMTP CLIENT; the other two are servers or don't exist. Cost: ~4 transitive deps (all small, well-audited).
- **In-process `smtp-server` vs MailHog in Docker.** Chose in-process (hermetic, fast). Cost: AC wording says "MailHog" — documented deviation.
- **Service-routine escape hatch vs. separate cron.** Chose escape hatch (one source of truth for scheduling). Cost: 20 lines of new code in routine-scheduler.ts.
- **Dedicated `notification_queue` vs reusing `daily-digest.ts`'s items view.** Chose dedicated queue because the two serve different intents: `daily-digest.ts` is an "items needing attention" read model; `notification_queue` is a "notifications awaiting delivery" outbox. Reusing would entangle policy-engine with delivery state. Cost: one new table.

---

## 6. Sequencing (each step independently testable, TDD red-first)

1. **Schema migration** — add `notification_queue` (SQLite + Postgres); run `drizzle-kit generate`; migration.test.ts asserts the table and indexes exist on both drivers.
2. **Silence policy extraction** — move `isSilenced` / `isInSilenceWindow` from `policy-engine.ts` to new `silence-policy.ts`, export, import back. Existing `policy-engine.test.ts` stays green (behavior-preserving refactor proof).
3. **Config module** — sanitizers + loader + redaction + `updateNotificationConfig`. Tests: `notification-config.test.ts` covering empty / partial / full round-trip + each sanitizer's rejection list.
4. **Adapter interface + Console adapter** — simplest adapter proves AC1. Tests: `notification-console-adapter.test.ts`.
5. **Ntfy adapter** — with injected fetch. Tests: happy path, 5xx retriable, 4xx non-retriable, auth header, priority mapping, `Title` header. Integration test with in-process HTTP fixture (AC2).
6. **SMTP adapter** — with injected nodemailer `createTransport` factory. Unit test with a fake transporter spy. Integration test with in-process `smtp-server` (AC3).
7. **Dispatcher classifier + flood guard** — pure functions. Tests: classify each event shape; flood guard coalesces after N within window.
8. **Dispatcher event handler** — subscribes to the three events, calls into classify / silence / enqueue / adapter. Uses a FakeAdapter injected via DispatcherDeps. Tests: AC4 (silence queues), AC5 (low-risk drops, cost warning queues, blocking pushes, cost breach pushes).
9. **Queue flush** — `flushQueue(db, adapter, now)` drains `pending` rows; marks `sent`; adapter failures increment `attempts` with `lastError`. Tests + integration with Console adapter.
10. **Digest service** — `runDailyDigest(db, adapter)`. Pure builder tested in isolation; service tested with DB fixture seeding three queue rows → one adapter call (AC6).
11. **Routine-scheduler escape hatch** — `registerService(id, fn)`; when a calendar routine has `triggerConfig.serviceId`, invoke it instead of creating a session. Tests in `routine-scheduler.test.ts`. Seed registers `"notification_digest"`.
12. **Router** — `createNotificationRoutes(db)` with the five endpoints. Tests in `notification-routes.test.ts` cover auth, validation, redaction, `POST /test`, `POST /flush`, `GET /queue`.
13. **`createApp` wiring** — register dispatcher disposer, register digest service on routine-scheduler, mount route. `api-scaffold.test.ts` asserts presence + auth.
14. **Seed** — add defaults for `notifications.*` and the daily-digest routine row; idempotent. `seed.test.ts` asserts presence.
15. **Dual-driver validation** — migration test passes against SQLite and Postgres. Dispatcher + digest services run a minimal smoke test against Postgres driver (via existing `HyperIdleDb` abstraction — no query rewrites). Cost: extend one integration test to parametrize over driver.
16. `bun run check` + `bun run lint` + `bun run test` — zero errors.

---

## 7. Library choices

**Runtime deps added:**
- `nodemailer` (MIT, ~90k stars-adjacent deployment footprint). Docs verified at https://nodemailer.com/smtp/. Only for SMTP adapter.

**Dev deps added:**
- `smtp-server` (npm `smtp-server` by Andris Reinman, same author as nodemailer — MIT). In-process SMTP for AC3 integration tests. Docs: https://nodemailer.com/extras/smtp-server/.

**No new deps for ntfy** — uses platform `fetch`. Docs: https://docs.ntfy.sh/publish/.

⚠️ UNVERIFIED: behavior of `smtp-server` under Bun's Node compat layer — both libraries are Node-flavored EventEmitters over `net.Socket`. Bun's `net.Socket` shim is mature but confirm with a smoke test during step 6. Fallback plan if incompatible: spin a MailHog container in the integration test and `it.skipIf(!process.env.MAILHOG_AVAILABLE)`.

---

## 8. Edge cases (each has a test)

1. **Notifications disabled** → dispatcher no-ops; queue untouched; adapter never instantiated.
2. **Recipient not configured but enabled** → dispatcher logs a single warn per boot (rate-limited), drops the event, does NOT enqueue.
3. **Adapter `send` throws synchronously** — handler catches, logs, marks queue row as `failed` with `lastError`.
4. **Non-retriable 4xx from ntfy** — single attempt, `status=failed`, no retry (avoids spam loops on bad topic).
5. **Retriable 5xx from ntfy** — one retry with 2s backoff; second failure marks `failed`.
6. **Malformed recipient email** — `sanitizeEmail` rejects at PATCH boundary; no dispatch possible.
7. **Flood: 50 blocking items in 10s** — first N sent individually, rest coalesced to one "N more items" notification; assertion on FakeAdapter call count.
8. **Silence lifted while queue has 12 pending items** — `POST /flush` returns `{ flushed: 12 }`; adapter receives ≤ configured coalesce-batch; queue rows marked `sent`.
9. **Cross-day digest boundary** — rows created before cron fires carry over; rows created after the cron window start don't double-fire.
10. **Concurrent dispatcher invocations** — two events arriving simultaneously under Node's single-threaded model — JS turns guarantee sequentiality; test asserts queue insert ordering matches event order.
11. **Config change at runtime** — PATCH `/config` mid-burst; dispatcher re-reads config on each event (not cached across calls).
12. **Schema upgrade on running DB** — migration additive (new table + indexes); existing data untouched.
13. **Test notification `POST /test`** — sends through the configured adapter, does NOT touch `notification_queue`, reports success/failure verbatim.
14. **Cost cap breach without `reviewThreadId`** — still fires a push notification (treated as cost_breach severity); the absence of a review item is orthogonal to the push decision.
15. **`item_created` where the item row was deleted before dispatcher reads it** — dispatcher logs + drops silently (race; no crash).

---

## 9. Security

- SMTP password + ntfy auth token NEVER returned by any GET route — redaction enforced centrally in `toSafeConfig()`; unit test inspects response JSON to assert `"***"` is present and original value is not.
- Sanitizers reject NUL, CRLF, leading `-`, control chars on all operator-supplied strings: topic, email, ntfy URL, SMTP host, SMTP username.
- Ntfy URL sanitizer: must be `https://` or `http://` (localhost only for http), must parse as URL, must have no userinfo, must not contain `\0` / CRLF. Default to `https://ntfy.sh`.
- Email sanitizer: reuses `git-export-config.ts`'s `sanitizeAuthorEmail` regex (same shape needed).
- SMTP host sanitizer: RFC 1123 hostname or IPv4 literal; reject IPv6 link-local; reject `localhost` only when `notifications.enabled=true` in production (env check) — operator override via `NOTIFICATIONS_ALLOW_LOCALHOST=true`.
- DoS flood guard — flood-coalesce caps outbound sends at `maxPerMinute`. Queue depth cap at 10,000 rows: when exceeded, ONLY `severity="digest"` rows are evicted (oldest first) and marked `status="dropped"` with a warn log. `severity="blocking"` and `severity="cost_breach"` rows are NEVER silently dropped; if the cap cannot be met even after evicting digest rows, the dispatcher logs an error and returns a failure (surfaces to caller / future rail item). A unit test seeds 10001 rows of each severity and asserts the invariant.
- No PII in logs: adapter log lines carry `recipient.label` if set, otherwise a hash prefix of the channel id. Title + severity logged; body redacted to `<N chars>` length only.
- API routes behind `authMiddleware` (same X-API-Key pattern as git-export).
- `POST /test` rate-limited: one test notification per 10s per process via an in-memory token bucket — prevents using the app as a spam relay.

A fuller threat model will run via `/threat-model` after implementation.

---

## 10. Event wiring — subscription table

| Event | Subscriber | Action |
|-------|-----------|--------|
| `item_created` | Notification Dispatcher | Load item; classify; route to push/queue/drop |
| `cost_cap_breached` | Notification Dispatcher | Classify `cost_breach`; push immediately unless silenced |
| `cost_cap_warning` | Notification Dispatcher | Classify `digest` (warning) or `cost_breach` (critical) |
| `notification` (legacy emitted by policy-engine) | **NOT subscribed by H2** — this event is for the in-app WS broadcaster (rail). H2 subscribes to the upstream sources so policy (silence/flood/classification) runs once in the dispatcher. Policy-engine keeps emitting `notification` unchanged — duplicate delivery to the Rail and the push channel is intentional and correct (they're different surfaces). |
| `knowledge_updated` | **Out of scope.** Attention-item notifications deferred. |

### CONFUSION: `notification` event overlap with H2's subscriptions — RESOLVED
I was uncertain whether H2 should subscribe to `item_created` directly or to the `notification` event emitted by policy-engine. Resolution: H2 subscribes to `item_created`; policy-engine's `notification` emission is left intact (it drives the in-app Rail via WS broadcaster — a separate concern). No behavior change to policy-engine. This avoids touching shared machinery for a new story and keeps the dispatcher as the sole owner of push-delivery decisions. Follow-up cleanup to collapse duplicate decision paths is deferred to a future retrospective. Flag for review.

---

## 11. Open questions (human decision)

1. **Multiple recipients.** v1 models one founder recipient per channel. UX-3.3 hints at per-human silence. Follow-up story for two-recipient fan-out.
2. **Mobile push (APNs/FCM).** Listed in ARCHITECTURE.md §2.9 but deferred per TRACK-H §H2 scope. Plan leaves the adapter interface flexible enough (the three shapes share `send(Recipient, Notification)`).
3. **Escalation policy.** If a blocking notification is unacknowledged for N minutes, retry / escalate to secondary channel? Not in v1 AC. Out of scope.
4. **Template system.** Digest builder uses string concat. If product asks for HTML or brand-styled emails, follow-up story.
5. **Per-product silence.** `policy-engine` already reads `silence_product_<productId>`. Dispatcher inherits for free via `silence-policy.ts` — no extra keys needed. Confirm product wants factory-wide + per-product at this layer too.

---

**End of plan.**
