# I1 Security Review — Production Server Data Integrity

**Reviewer:** security-researcher (read-only)
**Worktree:** `/workspace/.worktrees/I1`
**Branch:** `feat/I1-production-server-data-integrity`
**Base:** `main`
**Scope:** Net-new attack surface introduced by I1. I2 (auth/sandbox hardening) items are explicitly out of scope and marked.

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH     | 1 |
| MEDIUM   | 3 |
| LOW      | 4 |
| INFO     | 3 |

**Top issue: HIGH H-1.** I1's `createBunServer` now wires the full `createApp` domain-route tree into the production Bun process (previously only `/health`, `/api/health`, `/api/ws` were mounted). This makes the **pre-existing** `GET /api/status/settings` endpoint — which returns `db.select().from(factory_settings).all()` unfiltered — reachable in production for the first time. That table stores plaintext `notifications.smtp_password`, `notifications.ntfy_auth_token`, and `observability.langfuse_secret_key`. Any caller holding a valid `X-API-Key` (the only auth factor) can exfiltrate every outbound secret the factory holds. I1 did not author the endpoint, but I1 is what makes it exploitable.

---

## HIGH

### H-1. `GET /api/status/settings` leaks plaintext secrets now that the route is production-reachable (ALWAYS violation → CRITICAL by tier, HIGH by scope)

**File:** `/workspace/.worktrees/I1/packages/server/src/routes/status.ts:59-62`
**Net-new via:** `/workspace/.worktrees/I1/packages/server/src/server-factory.ts:55-84` and `/workspace/.worktrees/I1/packages/server/src/app.ts:201`

```ts
// GET /settings — List all factory settings
router.get("/settings", (c) => {
    const allSettings = db.select().from(factorySettings).all();
    return c.json(allSettings);
});
```

Facts:
- Pre-I1 `createFullApp` in `server-factory.ts` (old) mounted only `/health`, `/api/health`, `/api/ws`, and test routes. Every `/api/status/*` request 404'd in production.
- I1 replaces that with `createApp({ db, eventBus, registerWebSocket })`, which wires `api.route("/status", createStatusRoutes(options.db))`.
- `factorySettings` is the durable KV for `NotificationConfig` (includes `notifications.smtp_password`, `notifications.ntfy_auth_token`) and `ObservabilityConfig` (includes `observability.langfuse_secret_key`). See `/workspace/.worktrees/I1/packages/server/src/services/notifications/config.ts:18,23` and `/workspace/.worktrees/I1/packages/server/src/services/observability/config.ts:13`.
- `GET /api/notifications/config` + `GET /api/observability/config` both go through `redactNotificationConfig` / `redactObservabilityConfig` and return `"***"` for secrets — but `GET /api/status/settings` bypasses that and returns the raw row set.

**STRIDE:** Information Disclosure (I). Also ELEVATION-adjacent because the leaked SMTP / ntfy / Langfuse creds enable outbound impersonation from any endpoint the operator configured.

**Exploit:**
```bash
curl -H "X-API-Key: $HYPERIDLE_API_KEY" http://server:3001/api/status/settings
# => [{"key":"notifications.smtp_password","value":"<plaintext>","updatedAt":"..."}, ...]
```

**Impact:** Credentials for outbound channels leak to any actor holding a valid API key. In a single-operator deployment the set of principals is `{operator}`, so the in-memory blast radius is low; in any shared-key or leaked-key scenario an attacker pivots directly into the operator's SMTP/ntfy/Langfuse accounts. H-1 also silently defeats the `redactNotificationConfig` / `redactObservabilityConfig` guarantees that the rest of the codebase relies on.

**CVSS 3.1 (rough):** 7.7 HIGH — `AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:L/A:N`. Network, low complexity, high privilege (api key), scope-changed (creds leak to downstream services), confidentiality high.

**Fix:** Two-step, both small.
1. `status.ts` `GET /settings` must filter out `notifications.*_password`, `notifications.*_auth_token`, `observability.langfuse_*_key` (and any other `*secret*`/`*password*`/`*token*` keys) and/or mask their `value` to `"***"`. Prefer an allowlist of non-secret key prefixes since more secret-bearing keys will be added.
2. `PATCH /settings` (same file, 65-88) accepts arbitrary `{key, value}` via `updateSettingSchema` and upserts into `factorySettings`. It should reject the same sensitive keys on write to prevent an attacker from overwriting the redacted config shape (or from adding a new secret key via this catch-all lane that bypasses the sanitizers in notifications/observability routes).

**Note:** This endpoint existed pre-I1. The finding is attributed to I1 because I1 is the change that made it reachable in production. Decision on whether to treat it as "I1 scope" vs "landed-pre-I1 known risk that I1 must gate" is a judgement call — at minimum the plan should document the risk before merging; at best the filter lands in I1.

---

## MEDIUM

### M-1. `handoff` no longer zeroes `session.cost` — cost accumulation is now visible to new authenticated surfaces

**File:** `/workspace/.worktrees/I1/packages/server/src/services/handoff-protocol.ts:60-64`
**Also:** `/workspace/.worktrees/I1/packages/server/src/routes/sessions-routes.ts:33-36`

Pre-I1 handoff implicitly reset `sessions.cost` to 0 on handoff. I1 fixes a correctness bug (cost-cap, digest, observability all read running totals) but also means the `cost` column now carries the full lifetime spend of any handed-off session.

- `GET /api/sessions` (`sessions-routes.ts:33-36`) returns `db.select().from(sessions).all()` including the `cost` column unfiltered. This route is NEW in I1 (was a 404 before).
- `GET /api/status` (`status.ts:29-56`) aggregates `totalCost` across `agents.costActual`. Pre-existing but now reachable.

**STRIDE:** Information Disclosure (I) — low sensitivity (operational metric, not a secret), but a metric that previously did not survive handoff now does.

**CVSS 3.1:** 3.7 LOW/MEDIUM — `AV:N/AC:L/PR:H/UI:N/S:U/C:L/I:N/A:N`. Bumped to MEDIUM because downstream cost-aggregation surfaces will use this data for billing/threshold decisions — the change in semantics needs explicit documentation.

**Fix (non-code):**
- Confirm the cost persistence is intentional and align any cost-display UI + daily-digest to the new semantics (it is — see `/workspace/.worktrees/I1/packages/server/src/services/handoff-protocol.ts:55-64` `@lore` comment and the handoff-protocol tests).
- Document in `docs/plans/I1-plan.md` that `GET /api/sessions.cost` is now a cumulative handoff-preserving value.
- No new leakage of secrets; cost is operational metadata.

### M-2. `registerWsRoute` disposer races with in-flight `emit()` — not net-new DoS, but new stop/start lifecycle

**File:** `/workspace/.worktrees/I1/packages/server/src/routes/ws.ts:32-126` and `/workspace/.worktrees/I1/packages/server/src/server-factory.ts:60-82`

The I1 disposer path is:
```
server.stop() → no longer accepts connections
wsDispose()   → busDisposers.forEach(off); clients.clear()
```

`EventBus.emit` iterates `handlers.get(type)` synchronously — `emit` holds the `Set<EventHandler>` reference. If a `knowledge.POST /` call emits `item_created` on thread A and simultaneously thread B calls `dispose()`, the `Set.delete` during iteration is well-defined in ES (continues iterating the already-yielded entries), so the existing emit completes. However, if the handler inside `ws.ts` calls `ws.send(...)` against a `WSContext` that has been closed by `server.stop`, Bun's WS stack returns a throw — which I1 now **swallows** via EventBus's new `try/catch`. Net effect: no crash, but one dropped WS notification.

**STRIDE:** Denial of Service (D) — bounded. Worst case is a single dropped event per close.

**CVSS 3.1:** 3.1 LOW — `AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:N/A:L`. Requires timing. Moved to MEDIUM only because the new EventBus try/catch is what makes this "silent", so the category is newly-introduced-observability-loss rather than newly-introduced-crash.

**Fix (non-code):** Confirm EventBus error log (`event handler threw`) is high enough signal to surface these close-race events if they stack up. Current logger shape already logs `{type, error}` — adequate.

### M-3. `handoff-protocol.ts` re-reads + rewrites `tasks.auditTrail` without a row lock → audit entries can be lost under concurrency

**File:** `/workspace/.worktrees/I1/packages/server/src/services/handoff-protocol.ts:105-128`

```ts
const freshTask = db.select().from(tasks).where(eq(tasks.id, sessionContext.taskId)).get();
const existingAudit: TaskAuditEntry[] = freshTask?.auditTrail
    ? (JSON.parse(freshTask.auditTrail) as TaskAuditEntry[])
    : [];
const auditEntry: HandoffAuditEntry = { ... };
db.update(tasks).set({ auditTrail: JSON.stringify([...existingAudit, auditEntry]), ... })...
```

Read-modify-write against a JSON column with no `UPDATE ... WHERE auditTrail = <old>` optimistic guard. Two concurrent handoffs on the same task (possible if two agents hold a session on one task — unusual but not impossible given the system allows `maxConcurrentSessions > 1`) can clobber one entry.

The same pattern exists in `session-provisioning.ts:90-107` (`revertTaskToAccepted`) — also I1-authored.

**STRIDE:** Repudiation (R) — an agent's handoff can vanish from the audit trail without a log line.

**CVSS 3.1:** 4.3 MEDIUM — `AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:L/A:N`. Integrity-low (single missing row), not confidentiality.

**Fix (non-code):** Either (a) wrap the read + write in a `db.transaction(() => { ... })` the same way `transitionBet` now does in I1 B1-B3, or (b) use an append-only audit table keyed on `(taskId, timestamp, random)` instead of a JSON column — stops the lost-update pattern at the schema level.

---

## LOW

### L-1. `createBunServer` happily opens a `DATABASE_URL` pointing at any absolute path — including `/etc/passwd`

**File:** `/workspace/.worktrees/I1/packages/server/src/server-factory.ts:55-67`

```ts
const dbPath = process.env.DATABASE_URL ?? "./hyperidle.db";
const db = await openProductionDb(dbPath);
```

Reading unspecified env at boot is standard and the threat model is "operator controls env" (the operator could just as easily point bun itself anywhere). The finding is that there is no sanity check: a typo in `systemd` unit file → server opens any readable file as sqlite, `sqlite.exec("PRAGMA journal_mode = WAL")` may fail with an opaque error, and worst case (non-sqlite file is writable) corrupts the file. Not a security boundary crossing — operator-local.

**STRIDE:** Tampering (T) — operator misconfiguration.

**CVSS 3.1:** 2.4 LOW — `AV:L/AC:H/PR:H/UI:N/S:U/C:N/I:L/A:N`.

**Fix (non-code):** Defensive nice-to-have; log `dbPath` resolved to absolute at boot (already safe — path alone isn't a secret). Not required.

### L-2. `bun:sqlite` + `drizzle-orm/bun-sqlite` dynamic-import supply-chain

**File:** `/workspace/.worktrees/I1/packages/server/src/server-factory.ts:27-38`

`bun:sqlite` is a Bun built-in module (ships with the Bun binary), so the supply-chain surface is Bun itself — identical to before. `drizzle-orm/bun-sqlite` is a subpath of the already-depended-on `drizzle-orm` npm package. No new npm dependency. No signature-verification gap net-new; the `as unknown as HyperIdleDb` cast is a type-hole (structural-compat assertion) not a security hole.

**STRIDE:** Tampering (T) — dependency chain.

**CVSS 3.1:** n/a — informational confirmation.

**Fix:** None. Type-cast justified by `@lore` at line 22-26.

### L-3. `GET /api/status/health` returns a timestamp behind auth — no info leak

**File:** `/workspace/.worktrees/I1/packages/server/src/routes/status.ts:24-26`

```ts
router.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
});
```

Mounted AFTER `api.use("*", authMiddleware)` at `app.ts:183`, so a missing/invalid `X-API-Key` returns 401. Timestamp is the server wallclock, which is already discoverable via TLS `Date` header and `/api/health` (unauth). Not a leak. Plan §S1 requirement met.

### L-4. The 5 new `GET /` root-route handlers disclose no secrets

Files:
- `/workspace/.worktrees/I1/packages/server/src/routes/git-export-routes.ts:107-112` — `toSafeConfig` (redacts remoteUrl).
- `/workspace/.worktrees/I1/packages/server/src/routes/knowledge.ts:84-87` — lists `knowledgeItems` across all layers. L0-L4 knowledge is not secret by design BUT see INFO-3.
- `/workspace/.worktrees/I1/packages/server/src/routes/notifications-routes.ts:195-201` — uses `redactNotificationConfig`.
- `/workspace/.worktrees/I1/packages/server/src/routes/observability-routes.ts:129-135` — uses `redactObservabilityConfig`.
- `/workspace/.worktrees/I1/packages/server/src/routes/sessions-routes.ts:33-36` — full sessions table (see M-1 for `sessions.cost` note).

All five sit behind `authMiddleware`. Secrets are redacted on notifications + observability + git-export. Knowledge index is per design. Sessions index carries cumulative `cost` (M-1).

---

## INFO

### INFO-1. EventBus new logger does not leak stack traces

**File:** `/workspace/.worktrees/I1/packages/shared/src/event-bus.ts:101-126`

```ts
catch (err) {
    getLogger().error("event handler threw", {
        type: event.type,
        error: err instanceof Error ? err.message : String(err),
    });
}
```

Logs `err.message` only — stack traces, file paths, and internals are NOT serialized. `Logger.formatEntry` JSON-serializes the extra object, so a handler throwing an `Error` whose `message` is caller-controlled (e.g. an agent-supplied string propagated through a tool) will land in logs. Logs go to `console.error` (line 52 of `logger.ts`) — operator-visible. Not a cross-tenant issue; single-operator assumption holds.

### INFO-2. `task-audit.ts` union — no unescaped serialization concern

**File:** `/workspace/.worktrees/I1/packages/server/src/services/task-audit.ts`

Two entry shapes persisted via `JSON.stringify`. The only user-controlled fields are `reason` (from `HandoffMetadata.reason`) and the agent-supplied strings in `StateTransitionAuditEntry.reason` / `revertTaskToAccepted`. `JSON.stringify` handles escaping. The audit blob is read via `JSON.parse` inside `handoff-protocol.ts:110-112` and `session-provisioning.ts:90-92` — both of which will throw synchronously on malformed JSON (propagates to errorHandler → 500 with generic "Internal server error"). No XSS vector because these strings flow to API JSON responses that are content-type `application/json`; React consumers render them through `{string}` which escapes.

### INFO-3. Prompt-injection exposure unchanged — I1 reads `knowledgeItems` unfiltered in `GET /api/knowledge`

`/workspace/.worktrees/I1/packages/server/src/routes/knowledge.ts:84-87` returns every knowledge item. No sanitization. This is pre-existing: L0-L4 knowledge is agent-facing by design and the injection risk sits at the agent context boundary (fabric materialize + soul prompt assembly), not at the API read. Not I1's problem, but worth flagging: now that the route is production-reachable (it was a 404 pre-I1 — same reason as H-1), any API-key holder can inspect (and, via PATCH/POST, modify) every knowledge item, including L3/L4 which have factory-wide blast radius. This is the real-world instantiation of the "poisoned knowledge propagation" threat in the agent-specific checklist. **I2 territory — out of scope for this review** per plan scoping. Flag only.

---

## Explicitly Out of Scope (I2 territory)

- API-key timing-safety: `authMiddleware` does a plain `!==` comparison at `/workspace/.worktrees/I1/packages/server/src/middleware/auth.ts:13`. Known. Tracked for I2.
- WS query-token auth has the same timing-attack shape at `/workspace/.worktrees/I1/packages/server/src/routes/ws.ts:63-72`. Same I2 scope.
- Rate limiting: single token bucket for `POST /notifications/test` only. No global rate limiting. I2.
- Sandbox workspace env-var scrubbing (session-provisioning.ts → harness.startSession). I2.
- Crypto: `crypto.randomUUID()` is fine for IDs; nothing I1-added requires signature or encryption. Out of scope anyway.
- `dangerouslySetInnerHTML` in `web/src/shell/ArtifactView.tsx:113` — DOMPurify'd, pre-existing, unrelated to I1 server changes.

---

## Three-Tier Classification

| Finding | Tier | Reason |
|---|---|---|
| H-1 `/api/status/settings` leaks secrets | ALWAYS violation | "Secrets never in code, config, or knowledge items" — factory_settings stores them and the endpoint exposes them unfiltered. |
| M-1 session.cost persisted through handoff | INFO / ASK FIRST | Operator semantics change — not a violation. |
| M-2 WS disposer race | ALWAYS violation (minor) | Output side-effect lost; bounded. |
| M-3 audit lost-update | ALWAYS violation | "Can actions be performed without audit trail?" — yes, under concurrency. |
| L-1 DATABASE_URL | ASK FIRST | Operator misconfiguration vector; log the resolved path. |
| L-2 bun:sqlite | n/a | Built-in. |
| L-3 /status/health | n/a | Behind auth, no leak. |
| L-4 5 root GETs | n/a | Secrets redacted where they matter; M-1 already covers sessions. |
| INFO-3 knowledge unfiltered | I2 scope | Prompt-injection attack surface expands with newly-reachable routes. Flag, defer. |

---

## Recommendation

**Block merge on H-1 only.** Fix: add a filter or allowlist to `GET /api/status/settings` so secret-bearing keys are either omitted or masked; reject secret-key writes on `PATCH /api/status/settings`. All other findings are acceptable for I1 or explicitly I2 scope.

M-3 should be fixed in I1 if the handoff-protocol and session-provisioning changes are still open for edit — it is a direct consequence of the I1 audit-trail work and sharing the `db.transaction` pattern from B1-B3 is consistent with the story's integrity theme. If deferred, track as an explicit follow-up — not an I2 catch-all.
