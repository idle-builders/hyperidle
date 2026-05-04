## Architecture Review: L1 (implementation)

**Score: 7.6/10** (LI:9 AC:8 DM:9 TS:7 SA:7 N:9 MD:6 FMC:6 MP:8)

Worktree: `/Users/tobiasgrundmann/Development/hyperidle/.claude/worktrees/L1-thread-primitive` · branch `feat/L1-thread-primitive` · base HEAD `e3118ee`.

Sources audited: `docs/work-packages/L1-plan.md` (1250 LOC), concept §4.5 (HUMAN_INTERFACE_LAYER.md L488-L620), `SHARED.md` (Thread primitive entry), `plans/design-explorations/L1/approved.md`, and the implementation diff `git diff main...feat/L1-thread-primitive`.

---

### 1. Layer integrity — 9/10
The three-layer rule holds. `packages/web/src/pages/ConversationsReview.tsx:89-102` only goes through `fetch('/api/threads/...')` — never reaches DB. `packages/shared/src/thread.ts:1-241` has zero runtime deps (Zod stays in `packages/server/src/routes/threads-schema.ts:1-145` per the plan §13 Risk 2 contract). `packages/server/src/routes/threads.ts:14-46` imports only `@hyperidle/db` types + `@hyperidle/shared` types — no model calls, no fabric reach-past. One soft scratch: the route reads the `agents` table directly (`threads.ts:74,415`) instead of going through a repo (T5 was deferred — see MD).

### 2. API contract conformance — 8/10
The four endpoints match plan §6.1 shapes: list (host/participant scopes; 400 on missing scope at `threads.ts:160-163`), detail with messages (`:id` at L218-243), atomic create (L246-346), append (L349-516). Verdict authorization is correctly enforced (`threads.ts:415-420`): founder role + non-self check both fire with `code: 'verdict_authorization'`. Idempotency replay returns 200 not 201 (`threads.ts:393-401`). Re-open semantics clear `resolvedAt` and emit `thread_reopened` (`threads.ts:453-457, 491-500`). **Gap:** `clientKey` regex `min(1)` (`threads-schema.ts:16`) instead of plan §6.1's `min(8)` — deliberate per the comment, but means the plan and the schema disagree on a security-relevant cap.

### 3. Data model conformance — 9/10
`packages/db/src/schema.ts:175-222` and `schema.pg.ts:171-214` carry the full §5.1 contract: `host_kind`, `host_id`, `initiator_id`, `participants`, `pinned`, `resolved_at`, `last_active_at`, `created_at`. Messages table has `type`, `payload`, `client_key`, `deleted_at`, `redacted_at`, `resolved_at`, `legacy_item_id`. All four indexes exist (`schema.ts:188-221`, `schema.pg.ts:184-213`). `messages_idempotency_uq` is UNIQUE (verified at `migration-l1.test.ts:138-148`). The `responses` table is dropped in both drivers. Closed enums are NOT enforced at the DB layer (TEXT) — the closure rule is enforced only via Zod (`threads-schema.ts:110,118`). Acceptable per plan §5.1.

### 4. Type signatures match plan §4 — 7/10
`packages/shared/src/thread.ts` exports `HOST_KINDS` (8 entries), `MESSAGE_TYPES` (4 entries closed at `thread.ts:29`), `VERDICT_DECISIONS` (5 entries), `ARTIFACT_KINDS` (5 entries), the `Message` discriminated union (L126-142), `Thread` interface, all five payload interfaces, the redacted variant, `headCollapsePredicate`, `isBlocking`, `classifyThreadConfiguration`, `isRedactedPayload`, `exhaustiveAssert`. **Gap (CRITICAL for AC-11):** `exhaustiveAssert` is exported but never called by any renderer. `CommentRow.tsx:65-92` uses `if/else if` chains that fall through to `null` for unhandled types — adding a 5th `MessageType` would silently render nothing, NOT trigger a TS narrowing error. The structural `_MESSAGE_TYPES_COVERED` constant in `threads-schema.ts:138-144` catches drift between the Zod discriminator and the shared union, but the renderer-side exhaustiveness promised by plan §4 ("Adding a 5th type without updating MessageType triggers a `never`-narrowing failure in the renderer") is not realized.

### 5. Spec alignment (AC traceability) — 7/10
- AC-1 (concept-doc updates): landed in HIL §4.5.1/4.5.8 (L504, L604, L609); SHARED.md line 70; `ARCHITECTURE.md` updated. Verified.
- AC-3, AC-4, AC-7: covered by `thread.test.ts:1-150` and `threads.routes.test.ts:131-181` (parametric over `HOST_KINDS`).
- AC-8 (back-compat): the migration legacy projection path is exercised by `migration-l1.test.ts:172-206` only at the post-migration schema-write level; the actual read-back of pre-migration row content (snapshot insert + run + assert projected payload) is NOT covered. AC-8 is verified against API back-compat in `e2e/threads.spec.ts:66-82` but the e2e relies on a fixture that no harness seeds — see FMC.
- AC-10, AC-12: covered (threads.routes.test.ts:131-271; round-trips every `MessageType`).
- AC-11 (discriminant exhaustiveness): NOT verifiable as plan promised — see TS gap above.
- AC-13 (Playwright e2e): the spec file `packages/web/e2e/threads.spec.ts` exists but every case calls `page.goto('/conversations/review')` without a query string — given `ConversationsReview.tsx:80-84` returns `EmptyState` when `?id=` is absent, every case fails on first assertion. The "post follow-up review" affordance (`threads.spec.ts:97`) does not exist anywhere in the codebase. **The e2e suite is unrunnable as authored.**
- AC-14 (rollback): the SQL migration uses snapshot tables (`0007_thread_primitive_l1.sql:13-16`) but `packages/db/L1-rollback.md` is missing — search returns no file.

### 6. Naming — 9/10
Per concept §4.5.7 vocabulary table: `Thread`, `Message`, `Plain message`, `Review message`, `Verdict`, `Host entity` are all used as named. No forbidden aliases (`conversation`, `dialog`, `comment` as a noun) leak into the L1 type or function surface. `routes/threads.ts` uses the exact contract terms. The DS component `CommentRow` is a presentational name (the design picked it; concept §4.5.7 forbids `comment` as a noun synonym for `Message`, not as a row-component label). The legacy `routes/conversations.ts` survives as a deprecation surface — that's per plan §6.4 and its docstring at L11-17 explicitly acknowledges the legacy noun.

### 7. Module depth — 6/10
The shared surface is wider than any consumer needs. `classifyThreadConfiguration`, `isBlocking`, `AgentSessionStateSnapshot`, `HeadCollapseResult`, `exhaustiveAssert`, and `InlineRef` (used only inside `Composer.tsx:8`) are exported from `@hyperidle/shared` but have **zero non-test consumers in the worktree**. `isBlocking`'s only call site is its own test. Plan §10 named `isBlocking` as the "blocking-first sort hint" implementation — that wiring never landed (`ThreadHostBanner` receives a hardcoded `blocking={false}` from `ThreadShell.tsx:117`). The plan is honest about T5 (repo layer) being absorbed into the route — that's fine — but the DEAD shared exports are public API surface that exists only to satisfy the plan's signature inventory. Either wire them or scope them.

### 8. Failure-mode coverage — 6/10
- Idempotency path: covered (`threads.routes.test.ts:303-359`).
- Verdict authz (self + non-founder): covered (`threads.routes.test.ts:482-516`).
- Re-open semantics: covered (`threads.routes.test.ts:597-647`).
- clientKey validation: covered (`threads.routes.test.ts:362-444`).
- Resource not found: covered (`threads.routes.test.ts:723-729`).

**Gaps:**
- **WS subscribe authorization (plan §6.2 + §11 row "Authorization: who can subscribe to thread:<id>"):** `WsBroadcaster.subscribe()` (`ws-broadcaster.ts:94-99`) accepts ANY topic for ANY client. There is no auth check on `thread:<id>` subscribe. The plan §6.2 specifies "Server fetches the thread on subscribe; caller.identityId ∈ thread.participants required. Otherwise replies forbidden". Plan §9 names a "WS subscribe authorization" test under threads.routes — that test does not exist in `ws-broadcaster.thread-topic.test.ts` (which only covers fanout). **A non-participant who can connect to the WebSocket can subscribe to any thread topic and receive every message append, resolution, and re-open event.** The threads route enforces auth on REST GET — but the WS channel leaks the same data unauthenticated.
- **Error taxonomy:** the plan's reference to SHARED.md harness errors does not apply to this surface (REST endpoints, not harness). REST errors use `{error, code}` (`api-types.ts`) consistently. Acceptable.
- **Idempotency cross-sender (plan §11):** the test at `threads.routes.test.ts:342-359` only checks one half (founder posts) — no second sender posts the same key concurrently. Test text says it does, the body does not. False-positive coverage.
- **Migration audit query (plan §5.3 step 7):** the pre-migration audit `SELECT count(*) FROM responses LEFT JOIN ... WHERE m.id IS NULL` is documented but never run as a test assertion — `migration-l1.test.ts` only verifies post-migration shape on a fresh DB. The fallback path ("pick the most recent review message in r.item.thread_id") is neither implemented nor tested.

### 9. Migration parity — 8/10
Side-by-side, SQLite (`drizzle/0007_thread_primitive_l1.sql`) and Postgres (`drizzle-pg/0006_thread_primitive_l1.sql`) execute the same logical pipeline: snapshot → backfill threads → backfill messages → backfill verdicts → drop legacy → indexes. Constraint-drop ordering is correctly different per driver (PG drops FKs explicitly at L19-21; SQLite folds them via table-rebuild). The projection rules match (`coach → user+pinned`, `direct → agent`, `post-bet-retro → bet`, others → `task`). Both use `legacy_item_id` for the verdict-resolves-message backfill. **Subtle drift:** the SQLite version sets `host_kind` via a four-arm `CASE` that includes a `LEFT JOIN items i` lookup (L41-46) so a `kind='review'/'chat'` thread referenced by an item still resolves to `'task'`. The PG version uses a three-arm CASE (`schema.pg/0006:34-40`) without the items join — every non-coach/direct/retro thread defaults to `'task'`, dropping the items.kind="review/questionnaire" branch the SQLite version has. The functional effect is the same (both pick `'task'`) only because the SQLite arm `WHEN i.kind='review' OR... THEN 'task' ELSE 'task'` is degenerate. Worth flagging as code drift even if the output is identical. Both migrations are forward-only; rollback doc (plan §5.3 + §AC-14) is missing.

---

### CRITICAL
- **`packages/server/src/services/ws-broadcaster.ts:94-107`** — `subscribe` / `unsubscribe` accept any topic from any client, including `thread:<id>` topics, in violation of plan §6.2 + §11. Any authenticated WebSocket connection can listen to any thread's append/resolve/reopen events. → Fix: thread the `db` + `senderId` into the broadcaster (or wrap the subscribe call in the WS route handler) and verify `caller ∈ thread.participants` before adding the topic to the client's set. Add a `ws-subscribe-authz.test.ts` that drives a non-participant subscribe and asserts no events are delivered.
- **AC-11 is unverifiable as built. `packages/design-system/src/CommentRow.tsx:65-92` and `ThreadHead.tsx:46-117`** use `if/else if` falls-through-to-null in the renderer rather than the `switch + exhaustiveAssert(message.type as never)` pattern that plan §4 binds to AC-11. Adding a 5th `MessageType` to the union would compile cleanly through `CommentRow` (silently rendering nothing). → Fix: convert one of `CommentRow`'s body chooser or `ThreadShell`'s dispatch to a `switch (message.type)` with `default: return exhaustiveAssert(message.type)`. The structural `_MESSAGE_TYPES_COVERED` in `threads-schema.ts:138-144` catches Zod drift but is not the renderer test plan §4 promised.
- **`packages/web/e2e/threads.spec.ts` is unrunnable.** Every case `page.goto('/conversations/review')` without `?id=` (so the page renders `EmptyState`); the "post follow-up review" affordance does not exist; no fixture seeding harness wires up any thread. AC-13 has no real e2e backing in L1a. → Fix: either wire a `playwright.config.ts` `webServer` fixture that seeds via `POST /api/threads`, or stub `fetch` per case as the unit tests already do. The minimum is one e2e that actually executes a verdict round-trip end-to-end against the running stack.

### WARNING
- **`packages/db/L1-rollback.md` is missing** (plan §5.3, AC-14). The migration writes snapshot tables but the recovery procedure is undocumented.
- **`packages/design-system/src/ThreadShell.tsx:117`** hardcodes `blocking={false}`. `isBlocking()` (the function the plan exported for this exact purpose) is never called by any renderer or page. → Fix: thread an `agentSessionState` snapshot through `ThreadShellProps` and call `isBlocking(thread, messages, snapshot)` to drive the banner chip; or remove `isBlocking` from the shared API.
- **`packages/server/src/routes/threads-schema.ts:16`** allows `clientKey.min(1)` while plan §6.1 (REVISED for M1) specifies `min(8)`. The schema's docstring acknowledges the divergence — but the gap means short keys (`'a'`) pass, weakening the per-sender dedupe namespace test surface and the body-size constraint.
- **`packages/db/src/__tests__/migration-l1.test.ts:160-256`** does not actually exercise the legacy-data projection path. It runs the migration on a fresh empty DB and inserts the post-migration shape directly, asserting the post-shape accepts the rows. The migration's projection logic (steps 5-7 of plan §5.3) is exercised only by happy-path read of an empty DB. The plan's "seed pre-migration data, run up, assert projected output" path is not implemented.
- **`packages/server/src/routes/__tests__/threads.routes.test.ts:342-359`** asserts cross-sender idempotency without actually running a second sender. The test body posts as `u-founder` and never tests the duplicate from a second identity.
- **PG migration projection drift** vs SQLite: `drizzle-pg/0006:34-40` lacks the `items.kind` join arm that `drizzle/0007:41-47` has. Functionally equivalent today (both fall through to `'task'`) but a subsequent edit to one branch will silently drift the other.

### SUGGESTION
- **`packages/shared/src/thread.ts`** exports `classifyThreadConfiguration`, `AgentSessionStateSnapshot`, `HeadCollapseResult`, `exhaustiveAssert`, `InlineRef` (only used by Composer), `isBlocking` (no consumer). Either wire each into a real call site or move to `internal/` and drop from the public barrel.
- **`packages/server/src/routes/threads.ts:74,415`** read the `agents` table inline. Plan T5 named a `repos/thread-repo.ts` mediation layer; rolling that into the route is acceptable but the same `db.select().from(agents)` lookup happens in two places — the second-occurrence call in the verdict branch could share a helper or repo function.
- **`packages/db/src/schema.ts:215`** keeps `legacy_item_id` as a permanent column. Plan §5.1 said "eligible for drop after the snapshot retention window in a follow-up cleanup story" — track that follow-up explicitly so it doesn't drift into a permanent migration-only column.

### What's Working Well
- Concept-doc closure: HIL §4.5 was actually edited to close the `verdict` enum at four (line 504, 604, 609) AS PART OF the L1a commit, satisfying §4.5.8.5 and adversary C1.
- Discriminated union in `packages/shared/src/thread.ts:126-142` is properly typed with each variant's payload narrowed; `isRedactedPayload` is a real type guard, not a cast — and the route + DS components use it consistently (no `as` casts at the boundary per S-C2 / SL-C1).
- Verdict authorization is enforced both ways (founder-only AND non-self) in the same transactional path before message insert.
- Migration uses `legacy_item_id` audit column to make `responses → verdict-message` mapping deterministic — adversary C2 fix landed cleanly.
- Forward-only migration with explicit snapshot tables (`_l1_snapshot_*`).
- Schema parity between SQLite + Postgres at the column level; pglite-driven PG migration test in `pg-migration.test.ts:13-49` runs forward.

---

**Verdict: PASS** (average 7.6, no dimension <5).

The two architectural risks worth the developer's time before DoD:
1. **Wire (or remove) the WS subscribe authorization.** This is a real data-leak surface, and the plan promised it. Five lines + one test.
2. **Make AC-11 verifiable.** Convert `CommentRow.renderBody` (or add a sibling `MessageRenderer`) to a `switch + exhaustiveAssert` so the closure is enforced by the compiler the way plan §4 binds it.

A third item (e2e suite unrunnable) is high-leverage but lower architectural-risk — it's a verification gap, not a design flaw.
