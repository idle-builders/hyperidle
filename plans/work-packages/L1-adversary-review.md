# L1 Adversary Review (Step 7)

Read-only adversarial review at HEAD `e3118ee` of branch `feat/L1-thread-primitive`. Focus areas: error paths, coupling, type safety, races, security, hidden assumptions, concurrency, and test gaps.

---

## CRITICAL — must fix before DoD

### C1. WebSocket subscribe has zero authorization — anyone with a valid upgrade token can read every thread

**File:** `packages/server/src/routes/ws.ts:81-96` and `packages/server/src/services/ws-broadcaster.ts:94-99`

`onMessage` accepts `{ type: 'subscribe', topic: 'thread:<any-id>' }` and forwards to `WsBroadcaster.subscribe(client, topic)` with no participant check. Once a single upgrade token is consumed, a connected client can join `thread:<arbitrary-id>` and receive every `thread_message_appended`, `thread_resolved`, `thread_reopened`, `thread_archived` for any thread, including DMs they aren't a participant in. The plan §6.2 explicitly contracts the per-thread topic for participants only; the impl ignores membership entirely.

**Failure mode.** Compromised or low-privilege agent gets a WS upgrade, subscribes to `thread:<founder-coach-id>`, exfiltrates every coach message in real time. Bypasses all REST-side authz.

**Fix.** Pass the authenticated identity through to `WsBroadcaster.subscribe(...)` (or wrap subscribe in `routes/ws.ts` with a DB lookup). For `thread:<id>` topics, parse the id and verify `senderId ∈ threads.participants`. For `conversations`, allow only authenticated identities. Add an integration test: agent-2 attempts to subscribe to a thread containing only u-founder + agent-1 → reject.

---

### C2. `POST /api/agents/:id/inbox` allows sender spoofing via request body

**File:** `packages/server/src/routes/agents.ts:181-212`

`sendMessageSchema` reads `senderId` from the request body without verifying it matches the authenticated identity. Combined with the shared `X-API-Key` model (the comment in `threads.ts:51-55` confirms identity is intentionally non-binding for L1a), any caller can post messages "from" any agent. The route also does not run the verdict authz / participant authz that `routes/threads.ts` enforces, so a posted plain message is attributed to a fabricated `senderId` and inserted into `messages` with that sender_id — corrupting the audit trail and the (thread_id, sender_id, client_key) idempotency namespace.

**Failure mode.** Attacker posts as `u-founder` to any direct thread; victim sees a forged "founder said X". Idempotency partitioning means the attacker can also burn legitimate `clientKey`s for u-founder.

**Fix.** Drop `senderId` from the schema; derive it from `readSenderId(c)` (the same helper threads.ts uses). Also: verify the derived sender is one of the two participants of the resolved direct thread before inserting.

---

### C3. Idempotency replay returns success even when the duplicate payload differs from the original

**File:** `packages/server/src/routes/threads.ts:382-401`

The replay short-circuit returns `200 { message: rowToMessage(existing) }` without comparing the incoming `(type, payload)` to the stored row. A client that replays the same `clientKey` with a *different* payload is silently told "your write succeeded" but the persisted row is the OLD one. Plan §6.1 ("Server returns existing canonical id on duplicate") was intended for retry semantics — not for accepting divergent payloads. A bug client that mutates payload between attempts will look correct from the API's perspective and quietly drift from server state.

**Failure mode.** Founder posts a verdict `decision='reject'` with clientKey `K`; the request times out client-side; founder edits to `decision='approve'` and retries with clientKey `K`. Server returns 200 with the original `reject` record. UI shows "approve" because it trusts the client-state; the DB records `reject`. Audit-trail divergence.

**Fix.** On replay, compare `(type, JSON.stringify(payload))` to the existing row. If they diverge, return 409 `idempotency_conflict`. If they match, return 200. Add a test: same clientKey + different payload → 409.

---

### C4. `host_kind` / `host_id` immutability is documented in the plan but not enforced anywhere

**File:** `packages/db/src/schema.ts:175-192` and `packages/db/src/schema.pg.ts` (no triggers/constraints), `packages/server/src/routes/threads.ts` (no UPDATE endpoint, but no protective trigger either)

The plan §5 specifies that `host_kind` and `host_id` are immutable post-creation. Nothing enforces this — there is no DB trigger, no application-level guard in any service that touches the `threads` table, and no test covering the invariant. Several services (`builtin-routines.ts`, `handoff-protocol.ts`, `agents.ts`) write into `threads` directly using Drizzle's update API. A future change could quietly mutate these columns without any failing test.

**Failure mode.** Re-host attack via a future endpoint or migration: thread originally `host_kind='task', host_id='task-1'` gets re-hosted to `host_kind='bet', host_id='bet-x'`, losing the link to the underlying task and orphaning every UI that filters by `host_id`. Discovered only when a stale URL stops resolving.

**Fix.** Add a SQLite `BEFORE UPDATE` trigger (and Postgres equivalent) that `RAISE`s when `OLD.host_kind <> NEW.host_kind OR OLD.host_id <> NEW.host_id`. Or a check at the schema level. Add a regression test that an update changing host_kind throws.

---

### C5. SQLite vs Postgres migration host_kind backfill diverges — silent data corruption on PG

**File:** `packages/db/drizzle-pg/0006_thread_primitive_l1.sql:34-40` vs `packages/db/drizzle/0007_thread_primitive_l1.sql:41-47`

The SQLite branch joins `threads` with `items` and projects review/chat threads to `host_kind` based on `i.kind` (line 45). The PG branch (lines 35-40) only switches on `t.kind` — it has no `LEFT JOIN items` and no `i.kind = 'review'` branch. Every `kind='review'` and `kind='chat'` legacy thread on Postgres gets `host_kind='task'` blindly via the `ELSE 'task'` arm; SQLite gets the same thing because the SQLite SQL also collapses to `'task'` in the ELSE clause but at least appears intentional. Either way the SQLite code reads as if it has special-cased review/chat (it doesn't — both branches write `'task'`), but the comment claims a different intent (`host_kind from referencing item/task`). Two failures: (a) the branches are not identical even though the comment in pg `--Step 4` claims the canonical-shapes contracts under docs/ parity; (b) neither matches the documented projection.

**Failure mode.** A founder-coach thread on a fresh Postgres install is migrated correctly via `kind='coach' → 'user'`, but a `kind='direct'` review-style thread that should be `host_kind='knowledge_item'` (per docs) gets `'task'`. Downstream queries scoped by `host_kind` miss it.

**Fix.** Make the PG migration mirror the SQLite branch (add the LEFT JOIN items + `i.kind` cases). Add a test in `pg-migration.test.ts` that seeds a kind='review' thread with a referencing items row and asserts the post-migration `host_kind` matches the the canonical-shapes contracts under docs/ rule.

---

## WARNING — should fix, creates risk

### W1. `isRedactedPayload` is exported but never called — redaction narrowing has zero coverage at runtime

**File:** `packages/shared/src/thread.ts:158-164`, used nowhere

`messageRowSchema` accepts a redacted variant per branch, and the comment in `threads-schema.ts:85` claims `isRedactedPayload` "narrows in the consumer". It does not. `rowToMessage` constructs the Message object and returns the union to callers without distinguishing redacted from concrete payloads. UI and any downstream renderer must perform the narrowing themselves; if they assume the typed payload shape (e.g., `payload.text`), a redacted row crashes the renderer. The guard exists but the redaction story is incomplete.

**Fix.** Either (a) call `isRedactedPayload` at the boundary and tag the returned message with an explicit `redacted` flag, or (b) document that consumers must narrow and add a test that the API emits a redacted-shape payload that round-trips through `rowToMessage`. Today neither test nor consumer exists.

---

### W2. `routes/threads.ts:373` uses `as string[]` on JSON.parse — exact type-safety hole the rules forbid

**File:** `packages/server/src/routes/threads.ts:373`

```ts
const participants = JSON.parse(threadRow.participants) as string[];
```

`.claude/rules/typescript.md` states: "no unsafe `as` casts". The Zod schema `threadParticipantsSchema` already exists and is used in `rowToThread` (line 89) — it is bypassed here in the hot path of every message append. If a malformed row reached this line, `.includes(senderId)` would still type-check on `unknown[]` and return false (silent authz bypass) or throw (depending on what `.includes` does on undefined element types).

**Fix.** Replace with `const participants = threadParticipantsSchema.parse(JSON.parse(threadRow.participants));`.

---

### W3. Verdict authz read happens outside the transaction — TOCTOU race window

**File:** `packages/server/src/routes/threads.ts:404-421` vs the transaction at `431-461`

The `resolvesMessageRow` lookup, `senderAgent` role check, and self-verdict check all run with non-transactional reads. Between those reads and the transaction, another request can soft-delete or redact the review message, change the agent's role from `founder` back to `builder`, or post a competing verdict that resolves the same review. The transaction inserts the verdict and updates the review's `resolved_at` blindly. SQLite's serialized writes paper over the data corruption, but the audit narrative ("sender was a founder at write time") is no longer guaranteed.

**Fix.** Move the sender-role and resolves-message lookups inside the transaction (or use `SELECT ... WHERE resolvedAt IS NULL` as part of the UPDATE for the review-resolution step so a concurrent verdict's update sees zero rows changed and aborts).

---

### W4. Concurrent verdict resolution: no "is already resolved" guard

**File:** `packages/server/src/routes/threads.ts:444-452`

If two founders submit verdicts for the same review at the same millisecond, both pass the authz checks (different senders → different idempotency rows allowed) and both `UPDATE messages SET resolved_at = now WHERE id = <review>` and `UPDATE threads SET resolved_at = now`. The second update overwrites the first's timestamp; both `thread_resolved` events fire; UI sees two "thread resolved by …" notifications. Plan §6.1 expected the first verdict to win and the second to be rejected.

**Fix.** Make the messages UPDATE conditional: `UPDATE messages SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL`. Inspect `db.changes()` (better-sqlite3) — if 0, throw and abort the transaction; return 409 to the second caller. Add a concurrency test using two parallel `app.request(...)` promises.

---

### W5. Migration step 7 (verdict backfill) silently drops orphaned `responses`

**File:** `packages/db/drizzle/0007_thread_primitive_l1.sql:147-151` and pg parity

The `WHERE EXISTS (...)` filter and the `IN (SELECT id FROM agents)` filter quietly skip any `responses` row whose `item_id` doesn't backfill to a review message OR whose approver is not in the agents table. There is no warning, no audit row, no count comparison — the migration just emits N verdict messages for some subset of M responses. Plan §5.3 step 7 mentions a pre-migration audit ("must equal 0") but no test or runtime assertion enforces it. An orphaned `responses` row is silently dropped.

**Fix.** Either (a) refuse to run the migration if the audit query returns >0 (raise a SQLite error from the migration), or (b) emit synthetic verdict messages with `sender_id = 'unknown-agent'` (after inserting that agent) so audit history survives. The current behavior — silent dropout — is the worst of both options.

---

### W6. `participant_id` LIKE-probe is correct under the JSON-encoding assumption, but no test verifies the assumption

**File:** `packages/server/src/routes/threads.ts:192-208` and `routes/agents.ts:157-167`

The probe `%${escapeLikePattern(JSON.stringify(participantId))}%` only works because `threads.participants` always contains JSON-quoted strings. If a future code path writes `participants` as a JSON object instead of an array, or as bare strings, the probe still type-checks but matches nothing. The `findOrCreateDirectThread` writes the array correctly; nothing structurally enforces this column shape. There's no test that an injection-style participant id like `","u-founder","` is treated literally (it should be — `JSON.stringify` quotes it, and the LIKE escape neutralizes the `%`/`_`, but corner cases like a participant id of literally `\` are worth a test).

**Fix.** Add a check constraint or runtime assertion (in `findOrCreateDirectThread` and the create-thread path) that `participants` is a JSON-encoded array. Add a test with a participant id containing `%`, `_`, `\`, and `"` to confirm the probe doesn't false-match.

---

### W7. `thread_archived` event is wired through WS broadcaster but no production code emits it

**File:** `packages/server/src/services/ws-broadcaster.ts:57-59` (forwarding) — no callsite that emits

`grep -rn "emit.*thread_archived"` returns zero hits in production code. `bet-state-machine.ts` (where bets are archived per the plan's L1 host_kind='bet' attachment) does not emit `thread_archived` for the bet's threads. The contract is half-built — clients can subscribe to the event, but it never fires.

**Fix.** Either implement the bet-archived → thread_archived cascade or remove the WS forwarding + the event type until L1b. Today, the unused event suggests a feature that doesn't exist.

---

### W8. The headCollapsePredicate runs over the FULL message list — pagination breaks the head

**File:** `packages/server/src/routes/threads.ts:227-242`

GET `/api/threads/:id` reads ALL messages with no LIMIT (line 228-232: `db.select().from(messages).where(eq(messages.threadId, id)).orderBy(...).all()`). Plan §6.1 talks about pagination ("the first page is the most-recent N; subsequent pages walk backward"); the impl loads them all unbounded. `headCollapsePredicate` then walks the array. For a thread with 10K messages, every GET is a 10K-row read. For pagination correctness, when the day comes, the head must be computed from the full thread, not the visible page — this is fine, but the unbounded read needs an explicit bound now and a SQL query for the head separately.

**Fix.** Add a LIMIT and a `nextMessagesCursor` real implementation. The head can be computed by `SELECT id FROM messages WHERE thread_id = ? AND type IN ('review','questionnaire') AND resolved_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1` — a single index hit, not a full table read.

---

## SUGGESTION — nice to have

### S1. Determinism of `(createdAt, id)` ordering relies on `crypto.randomUUID()` lex-comparable, which it isn't

**File:** `packages/server/src/routes/threads.ts:268, 276, 424` (all use `crypto.randomUUID()`)

Plan §4 commits to `(createdAt, id)` as the deterministic message order. UUIDv4 is not lex-monotonic; two messages inserted at the same millisecond have a 50/50 chance of being ordered against insertion order. For most uses this is fine, but for audit reconstruction it makes the message-order non-deterministic across ties. Consider UUIDv7 (time-ordered) for messages, or add a monotonic sequence column.

### S2. `routes/conversations.ts` still reads `threads` directly — partial cleanup

**File:** `packages/server/src/routes/conversations.ts:97-128`

The legacy `GET /:threadId` endpoint still exists and returns a hand-rolled shape (`{ ...thread, items: [...] }`) different from the canonical `GET /api/threads/:id`. The `responses: []` placeholder is wire compat but the entire endpoint is duplicate work — two read paths to the same thread. Keep it for one release per the comment, but track its removal explicitly in L1b.

### S3. `direct-thread.ts` race: SELECT-then-INSERT without unique constraint

**File:** `packages/server/src/services/direct-thread.ts:24-53`

Two simultaneous `findOrCreateDirectThread(senderId, recipientId)` calls can both find no existing thread, both create a new one, and the database happily accepts both. There's no UNIQUE constraint on `(host_kind='agent', host_id, sorted-participants)`. After the race, a recipient has two parallel direct threads with the same sender, and which one is "the" direct thread is non-deterministic. Add a unique partial index or sort participants and add the unique constraint.

### S4. `messageInputSchema` doesn't reject excess keys (Zod's default)

**File:** `packages/server/src/routes/threads-schema.ts:59-80`

Zod by default strips unknown keys silently. A client sending `{ type:'plain', payload:{text:'x',evil:'data'}, clientKey:'k', __secret:1 }` gets accepted; the `__secret` is dropped without warning. Use `.strict()` on top-level schemas to reject unknown keys (defense-in-depth).

### S5. JSON.parse on payload column has no size limit

**File:** `packages/server/src/routes/threads.ts:106`

`JSON.parse(row.payload)` runs on whatever the DB returns. If a malicious migration or a data corruption inserted a 100MB payload, the parse blocks the event loop. Mitigated by the Zod schema's individual field length limits at write time, but read-time has no defense. Worth a future story: enforce a `payload` column max length at the DB layer.

### S6. Tests miss: orphaned legacy responses, divergent-payload idempotency replay, two-founder verdict race, empty participants array, `participants` shape corruption

The migration test (`migration-l1.test.ts`) doesn't seed an orphaned `responses` row to verify the WHERE-EXISTS filter is intentional. The route tests don't cover divergent-payload replay (C3). Concurrency tests don't exist for two-verdict races (W4). No test rejects a thread with `participants: []` (the schema requires `min(1)` but no integration test asserts it).

---

## VERDICT

**REVISE.** Five CRITICAL findings (C1 WS authz, C2 sender spoof, C3 idempotency-replay payload divergence, C4 host immutability, C5 PG migration parity) make this unfit to merge. The C1 finding alone is a confidentiality breach: any agent that obtains a WS upgrade token reads every thread.

Top 2 critical findings:

1. **C1 — WebSocket subscribe authz is missing.** Any authenticated WS client can subscribe to `thread:<arbitrary-id>` and receive every message-appended / resolved / reopened event. This is a data-exfiltration vector that survives the REST-side participant checks. Fix: enforce `senderId ∈ participants` on subscribe.

2. **C2 — `POST /api/agents/:id/inbox` accepts caller-supplied `senderId` in the request body.** Any caller can post messages "from" any agent. Audit trail and idempotency partitioning are corrupted. Fix: derive sender from auth, never trust the body.

After C1–C5 are fixed and W1–W8 reviewed, the implementation is close to advance-able.
