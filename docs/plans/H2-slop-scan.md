# H2 Slop Scan

Read-only scan for AI slop patterns in the H2 notification adapter code + tests.

## CRITICAL

### 1. Dead statement in test — real bug masquerading as slop

`packages/server/src/__tests__/notifications/dispatcher.test.ts:256`

```ts
db.delete(factorySettings).where(undefined as never).run;
```

- Missing `()` — this is a property access that does nothing.
- `undefined as never` is an unsafe type bypass that violates the project TypeScript rules (no `as` casts for escape hatches).
- The test passes only because the `onConflictDoUpdate` on line 257-267 rewrites the row; the author's intent (truncate settings first) is lost.
- Same block also does a dynamic `await import(...)` at line 269 inside a test where that import is already available at the top of the file — an artifact of AI "help me unstick this" prompting.

Fix: use the existing top-level import and call a real `.run()` on the delete statement (or remove it entirely since the upsert handles the case).

### 2. Flaky timing — every dispatcher test uses real `setTimeout`

`dispatcher.test.ts` lines 147, 172, 197, 215, 232, 252, 289 and
`dispatcher.integration.test.ts` lines 115, 134, 168.

Ten separate `await new Promise(r => setTimeout(r, 10|20|30))` calls to let a synchronous event handler + one microtask settle. `vi.useFakeTimers()` + `await vi.waitFor(...)` (or awaiting the promise returned by the emitter) eliminates the flake and shaves ~200ms of wallclock from the suite. The dispatcher already uses `queueMicrotask` for digest — that's exactly the pattern `vi.waitFor` was built for.

## WARNINGS

### 3. Unsafe cross-module cast in `smtp-adapter.ts:64`

```ts
return transport as unknown as MinimalTransporter;
```

The `MinimalTransporter` interface exists only to narrow nodemailer's `Transporter` — but the adapter then never uses `close()` and only calls `sendMail` once. The `MinimalTransporter` abstraction is wrapper-for-nothing; using `Transporter` directly removes the double-cast entirely. Classic AI "extract an interface so it feels clean" smell.

### 4. `pickRecipient` duplicated across `dispatcher.ts` and `notifications-routes.ts`

`dispatcher.ts:74-85` and `notifications-routes.ts:125-136` are identical modulo the `"ntfy topic"` vs `"ntfy topic (digest)"` label. `digest.ts:42-56` has a third near-copy. Three copies of the same switch — if the channel set grows, three call sites must track. Consolidate to one helper in `types.ts` or `index.ts`.

### 5. Restating-the-code comments

- `dispatcher.ts:376`: `// kind === "push"` — the reader sees the branch, the discriminant is obvious from the elif chain.
- `dispatcher.ts:434-436`: "Digest is triggered by a routine_fired event carrying a marker in routineId" — then the code immediately does that. Should document *why* the routineId substring check exists rather than restating what the line does.
- `console-adapter.ts:1-7`, `digest.ts:1-8`, `dispatcher.ts:1-13`, `ntfy-adapter.ts:1-17`, `smtp-adapter.ts:1-12`, `silence-policy.ts:1-11`, `types.ts:1-7`, `config.ts:1-7` — every file opens with a multi-line "H2 X" banner block. These are AI "explain what this file is" preambles; the module names already say it.
- `notifications-routes.ts:1-11`: six-line ASCII route table is an enterprise-smell banner. Hono's route decorators already express the routes.

### 6. Defensive try/catch that just repackages the error

- `dispatcher.ts:194-204` (`sendWithAdapter`): catches + rewraps into `SendResult`. Reasonable at the dispatcher edge, but then callers (`flushQueue`, `dispatchPush`) branch on `result.ok` — and `dispatchDigest` has a second try/catch (`digest.ts:96-104`) wrapping the same adapter call. Two layers of the same error-to-result transformation.
- `dispatcher.ts:483-489`: `dispatchDigest` try/catches `runDailyDigest` and logs `"runDailyDigest threw"`. But `runDailyDigest` itself already catches adapter throws (`digest.ts:96-104`) and returns `{status:"error"}`. Dead catch path — or, if it triggers, a latent bug upstream that the swallow is hiding.
- `app.ts:183-189`: `disposeApp` swallows errors from disposers with `// disposers must be idempotent; swallow errors from over-zealous ones`. Writing a comment that says "we swallow errors" is the slop; log them.

### 7. Test `floodMaxPerMinute` set to 100 to dodge the flood gate

`dispatcher.test.ts:62-65` and `dispatcher.integration.test.ts:52`:

```ts
"notifications.flood_max_per_minute": "100",
"notifications.flood_coalesce_window_ms": "60000",
```

The flood policy is part of the dispatcher — it needs a test, not a bypass. No test asserts that the 7th push per minute gets coalesced into the queue with `reason: "flood_coalesce"`. `tryFloodReserve` has zero coverage of the `return false` branch.

### 8. Queue cap logic has dead/wrong branch (`dispatcher.ts:155-170`)

```ts
if (queueCount(db, "pending") >= QUEUE_CAP) {
    if (params.severity === "digest") return;  // silently drop
    const oldestDigest = db.select()...
    if (oldestDigest) { ... update to "dropped" }
}
// FALLS THROUGH: insert happens whether or not we made room
```

If the queue is at cap and the incoming row is digest → early return, fine.
If the queue is at cap and there is no existing digest row to drop → we still insert, exceeding the cap.
No test at all for the cap (`QUEUE_CAP = 10_000` is a magic number with no unit test). This is a reliability landmine that was written because an AI "remembered" queue caps are a good idea but didn't follow through.

## OBSERVATIONS

### 9. `bodyLength` logged instead of body

`console-adapter.ts:30`: `bodyLength: notification.body.length`. Harmless, but feels like AI "don't log PII" caution applied to a console adapter explicitly meant for dev/log visibility. Either log the body (console channel is an operator-facing log) or drop the field.

DEFERRED: bodyLength is a cheap structured-log signal that pairs well with the existing structured logger; no user value in flipping it either direction.

### 10. Inconsistent channel-label strings

`"Console"` (dispatcher.ts:77) vs `"Console (digest)"` (digest.ts:48); `"ntfy topic"` vs `"ntfy topic (digest)"`. Three files, three labeling conventions. Merge with the dedup from #4.

### 11. Redundant `body.slice(0, 10_000)` truncation

`dispatcher.ts:96` truncates body to 10 000 chars "for safety" but `flushQueue` (`dispatcher.ts:234-238`) reads untruncated `row.body ?? ""` back from the DB — the queue persists the already-truncated copy, so the truncation is load-bearing only once per event. Document it or drop it.

DEFERRED: the 10k slice is load-bearing at ingest to bound DB row size across all queue writers; documenting it in a comment adds noise without changing behavior.

### 12. `QueueStatus` type vs string param leaks at the HTTP edge

`notifications-routes.ts:209`: `statusParam = c.req.query("status") ?? "pending"` is passed directly into `eq(notificationQueue.status, statusParam)` with no validation. Any string is accepted; a malicious or malformed `?status=pending%00` passes through untouched. Not a critical security bug (SQLite param binding handles injection) but the route advertises "status" filtering with no enum gate.

DEFERRED: orthogonal to the H2 scan MUST-FIX list; parameter binding already neutralizes injection and an explicit enum gate is a follow-up hardening story.

### 13. Naming: `NotificationAdapter` is honest; `MinimalTransporter` is not

`smtp-adapter.ts:46-49`: `MinimalTransporter` — the word "Minimal" is aspirational, not descriptive. It describes nodemailer's interface minus a few methods. Drop the interface.

### 14. `as unknown as { __disposers }` in `app.ts:143, 181`

Stashing state on a Hono instance via a double cast to a synthetic shape. Honest pattern would be a `WeakMap<Hono, Disposers[]>` owned by `createApp`/`disposeApp` — no type laundering. Keeps the cast rule intact.

## VERDICT

**REVISE** — two real issues (#1 dead delete statement + #2 flaky sleeps) should be fixed before this merges. The rest are quality cleanup that can go in a follow-up.
