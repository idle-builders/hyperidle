# H2 Simplification Scan

Read-only scan of the H2 notification adapter implementation. Findings ordered by impact. Paths absolute. No code changes made.

---

## CRITICAL — Rule Violations / Unambiguous Dead Code

### 1. `services/notifications/index.ts` is a forbidden barrel file
**File:** `/workspace/.worktrees/H2/packages/server/src/services/notifications/index.ts`
**Rule:** `.claude/rules/typescript.md` — *"No barrel files except `packages/*/src/index.ts`."*

This is a sub-package barrel inside `packages/server/src/services/notifications/`. It exists, and the file's own header comment even admits the convention: *"siblings import their peers through the individual `.ts` files"* — yet production code (`app.ts`, `notifications-routes.ts`, `policy-engine.ts`) all already bypass it. It is consumed by exactly **one test** (`__tests__/notifications/notifications-routes.test.ts`).

**Action:** Delete the file. Update the single test import to point directly at `config.js` / `dispatcher.js`.

### 2. `getNotificationKeys()` — exported but never called anywhere
**File:** `config.ts:297-299` (re-exported by `index.ts:30`)

```ts
export function getNotificationKeys(): typeof KEYS {
    return KEYS;
}
```

`grep` across the whole worktree returns **zero** non-definition call sites. Dead accessor leaking the internal `KEYS` map. `KEYS` is already `as const` so the indirection adds nothing.

**Action:** Delete.

### 3. `NOTIFICATION_CONFIG_DEFAULTS` — public only by accident
**File:** `config.ts:89-96` (re-exported by `index.ts:28`)

Used exclusively inside `config.ts` (`buildConfig`). No external consumer. Exporting it from the module and through the barrel is premature "just in case."

**Action:** Drop `export` and remove from `index.ts`.

### 4. `classifyItem`, `classifyCostBreach`, `classifyCostWarning` — exported, never consumed externally
**File:** `dispatcher.ts:57,64,69` (re-exported by `index.ts:45-47`)

Each classifier is called exactly once, from the `bus.on(...)` subscriber defined 350 lines later in the same file. No test imports them directly (tests exercise them through the dispatcher). They could all be `function` (no export) or inlined into the three subscriber bodies; the subscribers already contain a bespoke pattern per event, and the classifiers are trivial branch tables (2-3 lines each).

**Action:** Drop `export`; optionally inline. Remove from `index.ts`.

### 5. `sendWithAdapter` — exported single-use helper
**File:** `dispatcher.ts:189-204` (re-exported by `index.ts:52`)

Wraps `adapter.send(...)` in a try/catch that returns a `SendResult`. Called twice — both inside `dispatcher.ts`. Not referenced by any test or external module.

**Action:** Drop `export`. Keep the helper (it does deduplicate 10 lines of error shaping), but it is module-private.

### 6. `buildDigestMessage` — exported solely to satisfy AC6 "unit-testable pure function"
**File:** `digest.ts:28-40` (re-exported by `index.ts:55`)

The H2 plan (line 101) explicitly calls this out: *"pure — unit-testable in isolation (AC6)."* That is a valid reason to keep it extracted, but it does not need to leave the notifications folder. No test actually imports it via the barrel; direct test import would suffice.

**Action:** Keep the function, but remove from `index.ts`.

---

## WARNINGS — Duplication / Over-abstraction

### 7. `pickRecipient` duplicated three times
**Files:**
- `dispatcher.ts:74-85` — `pickRecipient`
- `digest.ts:42-56` — `pickDigestRecipient` (only difference: label suffixes `" (digest)"`)
- `notifications-routes.ts:125-136` — `pickRecipient` (identical to dispatcher's)

Three near-identical copies of the same 11-line switch. The only meaningful difference is the three label strings; labels are **only used for logging**, never for routing or display outside the process.

**Action:** Consolidate to one exported `pickRecipient(cfg, channel, kind?: "push" | "digest")` in one place (probably `config.ts` since it reads from `cfg.recipient`). Delete the other two.

### 8. `defaultAdapterFactory` duplicated in two files
**Files:**
- `app.ts:49-69` — `defaultNotificationAdapterFactory`
- `notifications-routes.ts:103-123` — `defaultAdapterFactory`

Identical 20-line switch producing `createConsoleAdapter | createNtfyAdapter | createSmtpAdapter`. `notifications-routes.ts` already accepts an injectable `adapterFactory` via options; `app.ts` passes one in. The in-route fallback is never exercised by production code — production always wires through `app.ts`. It only runs when tests construct `createNotificationRoutes(db)` without options.

**Action:** Delete the duplicate inside `notifications-routes.ts`. Make the factory option **required**, not optional (tests can still pass whatever adapter they want — they already do).

### 9. `DispatchDigestResult` and `DigestResult` are the same type
**Files:**
- `dispatcher.ts:460-464` — `DispatchDigestResult`
- `digest.ts:15-19` — `DigestResult`

```ts
// Both are:
{ status: "sent" | "noop" | "error"; notificationsIncluded: number; error?: string }
```

Two interface declarations, identical shape. `dispatchDigest` returns one; `runDailyDigest` returns the other; `dispatchDigest` literally `return await runDailyDigest(...)`. TypeScript structurally assigns between them, but having both is pure duplication.

**Action:** Keep `DigestResult` in `digest.ts`. Have `dispatchDigest` reuse it. Delete `DispatchDigestResult`.

### 10. `NotificationConfig` vs. `SafeNotificationConfig` — two hand-maintained parallel shapes
**File:** `config.ts:35-87`

52 lines declaring two interfaces that differ in exactly two properties: `ntfy.authTokenSet: boolean` and `smtp.passwordSet: boolean`. Every other field is copy-pasted. When a new config field is added, both shapes must be updated in lockstep.

**Action:** Derive `SafeNotificationConfig` from `NotificationConfig` via a mapped/intersection type, e.g.
`type SafeNotificationConfig = Omit<NotificationConfig, "ntfy" | "smtp"> & { ntfy: ...; smtp: ... }`. Or compute the redacted view without a distinct type — the JSON shape is fully determined by `redactNotificationConfig`.

### 11. `SafeNotificationConfig` carries both `authTokenSet: boolean` AND `authToken: string | null`
**File:** `config.ts:71-72, 79-80`

The UI can already infer "configured" from `authToken === "***"` (the `REDACTED` sentinel) vs. `null`. Carrying both fields is redundant signal in the API. The comment at line 196-198 rationalises this as *"gives the UI enough signal to display 'configured / not configured'"* — but the redacted sentinel already does.

**Action:** Keep one of the two. Prefer dropping `*Set` booleans; the redacted string value is self-documenting. Simplifies both the interface and `redactNotificationConfig`.

### 12. `MinimalTransporter` — invented wrapper interface to hide nodemailer
**File:** `smtp-adapter.ts:39-64`

```ts
interface SendMailAddress { from; to; subject; text; }
interface MinimalTransporter {
    sendMail(opts: SendMailAddress): Promise<unknown>;
    close?(): void;
}
...
return transport as unknown as MinimalTransporter;
```

Three layers of wrapping: nodemailer's `Transporter` → `buildTransporter` → `MinimalTransporter` → use. Requires a `as unknown as` cast (prohibited by TypeScript rules: *"no unsafe `as` casts"*). `close` is declared optional and never called. `buildTransporter` is called exactly once.

**Action:** Inline `buildTransporter` into `createSmtpAdapter`. Use nodemailer's `Transporter` directly (it already types `sendMail`). Delete `MinimalTransporter`, `SendMailAddress`, and the `as unknown as` cast.

### 13. `ConsoleAdapterOptions.now` is never used
**File:** `console-adapter.ts:13-15, 19`

```ts
const now = opts.now ?? ((): Date => new Date());
...
const sentAt = now().toISOString();
```

OK, it *is* used — but it's the only useful option on this adapter. However `opts` is an options bag with just `logger` and `now`, both of which could be positional parameters on a 15-line function. Options-bag-for-two-fields is premature.

**Action:** Low priority. Acceptable as-is. Flag only if a broader pattern emerges.

DEFERRED: Options bag of two fields is below the fix-vs-cost threshold; no pattern drift to justify churn.

### 14. `@lore` for "store disposers on the app"
**File:** `app.ts:140-143` — not H2-specific, out of scope.

DEFERRED (item 14): already addressed — replaced `as unknown as { __disposers }` with a module-scoped `WeakMap<Hono, Array<() => void>>` in `app.ts`.

---

## OBSERVATIONS — Patterns to Watch

### 15. `SanitizeResult` shape duplicates `ApiErrorResponse`-like envelope
**File:** `config.ts:305`

```ts
type SanitizeResult = { ok: true } | { ok: false; reason: string };
```

One-off result shape local to four sanitizers, all of which collapse in the route into `reason: string | null`. The caller (`validatePatchBody`) already rewraps: *"if (!r.ok) return r.reason; ... return null"*. The discriminated union adds a layer that every call unwraps.

**Action:** Consider returning `string | null` (null = ok, string = reason). Or throw on invalid — but then routes need a catch. Low priority.

DEFERRED: the discriminated `SanitizeResult` keeps the ok/reason pairing type-safe at each call site; collapsing to nullable string would weaken exhaustiveness and the sanitizers are already stable.

### 16. `interface DigestBuild` is internal and only returned from one function
**File:** `digest.ts:21-25`

```ts
interface DigestBuild { subject: string; body: string; count: number; }
```

Used as the return of `buildDigestMessage`. Not exported. Fine, but a `ReturnType<>` inference would do. Minor.

DEFERRED: explicit shape is clearer than inferred `ReturnType` for a 3-field record; no call sites to churn.

### 17. `classifyCostWarning` vs `classifyCostBreach` — near-identical
**File:** `dispatcher.ts:64-72`

Two functions whose only difference is matching `"hard"` vs `"critical"`. Because they operate on different event types (`CostCapBreachedEvent` vs `CostCapWarningEvent`), they cannot be collapsed without introducing a generic — which would be worse. Accept as-is. Noted only because the symmetry invites a future over-abstraction.

### 18. `queueCount` uses `.all().length` instead of `count(*)`
**File:** `dispatcher.ts:136-139`

```ts
function queueCount(db: HyperIdleDb, status: QueueStatus): number {
    return db.select().from(notificationQueue).where(eq(notificationQueue.status, status)).all().length;
}
```

Loads every pending row into memory just to check the 10 000 cap. At scale (and this is the mechanism that enforces scale bounds!) this is N+1's cousin. Not a simplification finding per se — a performance landmine — but it simplifies: use Drizzle's `count()`.

---

## File-by-file summary

| File | Lines | Verdict |
|---|---|---|
| `types.ts` | 66 | Clean. `NotificationChannel`, `NotificationSeverity`, `Recipient`, `Notification`, `SendResult`, `NotificationAdapter`, `Classification`, `QueueReason`, `QueueStatus` all earn their keep. |
| `config.ts` | 381 | Large. Twin `SafeNotificationConfig` and `*Set` booleans (§10–11), dead `getNotificationKeys` (§2), over-exported `NOTIFICATION_CONFIG_DEFAULTS` (§3). Sanitizers OK. |
| `console-adapter.ts` | 36 | Minimal; fine. |
| `ntfy-adapter.ts` | 115 | Fine. Header names annotated with `@lore`, good. |
| `smtp-adapter.ts` | 101 | `MinimalTransporter` indirection + `as unknown as` cast (§12). |
| `digest.ts` | 123 | Duplicate `pickRecipient` (§7); `DigestResult` twin (§9). |
| `silence-policy.ts` | 96 | Clean. Extracted with `@lore` explaining why. |
| `dispatcher.ts` | 491 | Heaviest file. Duplicate `pickRecipient` (§7); 5 single-use exports (§4–6); `DispatchDigestResult` twin (§9); `queueCount` full-scan (§18). |
| `notifications-routes.ts` | 256 | Duplicate `pickRecipient` (§7) and duplicate `defaultAdapterFactory` (§8). |
| `app.ts` (H2 wiring) | 14 lines | Clean wiring. Only smell: five separate imports from the notifications sub-folder because there's no barrel — but the barrel is forbidden, so this is correct. |
| `schema.ts` / `schema.pg.ts` (`notification_queue`) | 24 lines each | Clean. SQLite + pg definitions are identical in shape. Indexes `(status, created_at)` and `(severity)` match the query patterns in `flushQueue` / `runDailyDigest` / `enqueueNotification`. No simplification opportunity. |

---

## Suggested cleanup order (lowest risk → highest)

1. Delete `index.ts` barrel, rewire the one test import. (Pure deletion.)
2. Drop `export` on `getNotificationKeys`, `NOTIFICATION_CONFIG_DEFAULTS`, classifiers, `sendWithAdapter`. (Pure visibility change.)
3. Collapse `DispatchDigestResult` → `DigestResult`. (One-line type change.)
4. Remove `MinimalTransporter` + `as unknown as` cast in `smtp-adapter.ts`. (Drops rule violation.)
5. Consolidate `pickRecipient` (×3) into one implementation.
6. Consolidate `defaultAdapterFactory` (×2); require it as a non-optional param on `createNotificationRoutes`.
7. Decide: drop `*Set` booleans OR derive `SafeNotificationConfig` from `NotificationConfig`.
8. Replace `.all().length` with `count()` in `queueCount`.

Net delta: roughly **-120 lines** removed or deduped without changing behavior, plus one rule violation resolved (`as unknown as`) and one rule violation resolved (barrel file).
