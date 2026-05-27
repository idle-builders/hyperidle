# P5 FirstTimeHints -- Architecture Critique

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:9 AC:7 DM:8 N:9 MD:9 FMC:7 S:9 V:8

---

## Scoring Breakdown

### 1. Spec Alignment (8/10)

Every AC from the workpackage spec maps to a plan task:
- AC "hint_progress table" -> Task 1 (schema)
- AC "catalog of 5 hints" -> Task 2 (shared types)
- AC "hints render inline" -> Task 5 (view integration)
- AC "fires at most once per user / dismisses permanently" -> Task 3 (API) + Task 4 (React context, optimistic dismiss)
- AC "non-blocking" -> inherent in inline rendering
- AC "extensible" -> catalog + hook pattern
- AC "bun run verify passes" -> Task 7
- AC "Playwright tests" -> Task 6

The plan's AC section (AC1-AC9) is more granular than the spec's ACs, which is good -- it decomposes vague spec criteria ("hints render inline in the relevant view") into verifiable sub-criteria.

The plan introduces one item not in the spec: a `context.hasValidCredential` field on the GET response (Risk #1). This is scope creep but arguably necessary -- hint #2's trigger condition requires credential state, and without this field the client needs an extra fetch to `/api/credentials`. The plan correctly identifies this as a risk/ambiguity and proposes a minimal solution. This is honest scope management, not silent scope creep.

### 2. Layer Integrity (9/10)

Clean layer separation:
- `packages/db` owns the schema (kernel)
- `packages/shared` owns the catalog types (contract between layers)
- `packages/server` owns the API routes (kernel HTTP surface)
- `packages/web` owns the React context, hook, and view integration (human interface)

No layer reaches past its neighbor. The shared package correctly contains only the type union and catalog constant (no business logic). The server imports from `@hyperidle/db` and `@hyperidle/shared` (downward). The web imports from `@hyperidle/shared` (downward) and calls the server API via HTTP (no direct DB access).

The spec says "hints are strategy-layer code in packages/fabric." The plan correctly overrides this: "The fabric connection point is zero for v1 -- hints don't subscribe to kernel events, they check view state." The catalog is contract (shared), persistence is kernel (db), evaluation is presentation (web). This is the correct layering. The spec's suggestion to put hints in fabric would have created a cross-layer dependency (UI checking fabric state).

### 3. API Contracts (7/10)

Both endpoints are well-specified with HTTP method, path, request shape, response shape, and status codes:

**GET /api/hint-progress:**
- Response: `{ dismissed: Array<{ hintId: string; seenAt: string }> }`
- No error codes specified beyond the implicit 401 from auth middleware.

**POST /api/hint-progress/:hintId/dismiss:**
- Request: no body (hintId in URL, userId from auth)
- Success: `{ ok: true }`
- 400 for invalid hintId
- 409 for already dismissed

The error response shape is specified with `error` and `code` fields. This matches the existing `ApiErrorResponse` type from `@hyperidle/shared` in spirit, but the plan does NOT reference `ApiErrorResponse` or `API_ERROR_CODES`. The plan should use the existing error type for consistency.

The `context` field extension (Risk #1) is described but not formalized as a type signature in section 3. It appears only in section "Risks and ambiguities." If the builder implements it, there is no contract to build against.

### 4. Data Model Alignment (8/10)

The schema is clean and correct:
- `userId` (text, FK to users.id with onDelete cascade, NOT NULL)
- `hintId` (text, NOT NULL)
- `seenAt` (text, NOT NULL, ISO timestamp)
- Composite PK on (userId, hintId)

Both SQLite and PostgreSQL versions are specified with identical shapes. The FK cascade on user deletion is correct (deleting a user cleans up their hint progress). The composite PK serves as both the unique constraint and the primary lookup pattern.

The `seenAt` column is `text` storing ISO timestamps, matching the existing pattern in the codebase (e.g., `createdAt` on products, users). No type mismatch risk.

The inferred types `HintProgressRow` and `NewHintProgressRow` are specified via Drizzle's `$inferSelect`/`$inferInsert`, which is the standard pattern.

### 5. Naming (9/10)

Names are honest and descriptive:
- `hint_progress` -- describes what the table tracks (progress through hints)
- `HintId` -- a closed union type, not a generic string
- `HINT_CATALOG` -- clearly a constant catalog
- `isHintId` -- type guard naming follows the `is*` convention
- `useHint` -- standard React hook naming
- `HintProvider` -- standard React context provider naming
- `createHintRoutes` -- follows the `create*Routes` factory pattern used by all other route files

No naming conflicts with existing primitives (Bet, Task, Session, Thread, Block, Artifact). "Hint" is a new noun that does not shadow or alias any existing concept.

### 6. Module Depth (9/10)

The public surface is minimal:
- Shared: `HintId`, `HintCatalogEntry`, `HINT_CATALOG`, `HINT_IDS`, `isHintId` (5 exports -- the closed union, catalog, and type guard are all independently needed)
- Server: `createHintRoutes(db)` returns a Hono router (1 export)
- Web: `HintProvider` (1 component) + `useHint(hintId)` (1 hook)

The `useHint` hook hides the entire context machinery (fetch, dismissed set, optimistic update, fire-and-forget POST) behind a simple `{ visible, dismiss, copy, testId }` return. This is a deep module -- small interface hiding significant complexity.

The caller pattern is pleasantly simple:
```tsx
const hint = useHint("create-bet");
if (hint.visible && activeBets.length === 0) { /* render */ }
```

No per-consumer wrappers. No custom hooks per hint. One API serves all 5 views.

### 7. Failure-Mode Coverage (7/10)

**Covered:**
- API failure on hint fetch: graceful degradation (treat all hints as dismissed)
- API failure on dismiss POST: fire-and-forget (hint stays hidden locally)
- Invalid hintId on dismiss: 400 response
- Already-dismissed hintId: 409 response
- Rate limiting: inherits global 60 req/min limiter
- Input trust boundary: hintId validated against closed enum via `isHintId`

**Missing:**
- RACE CONDITION on dismiss. The plan's POST handler does `SELECT ... WHERE (userId, hintId)` then `INSERT`. Between these two operations, a concurrent request could insert the same row, causing an unhandled unique constraint violation (SQLite: UNIQUE constraint failed; PG: duplicate key value). The plan should use `INSERT ... ON CONFLICT DO NOTHING` (Drizzle: `.onConflictDoNothing()`) or wrap the insert in a try-catch for the constraint violation. The current code would throw a 500 to the client.

- No explicit timeout/retry behavior for the client-side fetch. The `HintProvider`'s useEffect uses `apiFetch` which delegates to `fetch()`. If the server is slow, the hint context stays in `ready: false` indefinitely. For a non-critical feature this is acceptable, but should be documented as a known limitation.

- The `context.hasValidCredential` field (Risk #1) introduces a dependency on the credential subsystem from the hint progress endpoint. If the credential check throws, it could take down the entire hint-progress GET response. The plan should specify that the credential check is wrapped in a try-catch with a default of `false`.

### 8. Simplicity / Over-Engineering Risk (9/10)

The plan is admirably simple:
- No abstraction layer -- raw Hono routes, raw Drizzle queries
- No event subscriptions -- pure request/response
- No hint scheduling or queueing system
- Auto-dismiss is a pure render gate (no server round-trip)
- `seenAt` is only written on explicit dismiss (avoiding the complexity of auto-dismiss server writes)
- The design-it-twice sections (catalog location, HintProvider placement) are genuine alternatives with real tradeoffs -- not straw-manned

The only area of mild concern is the `context` field on GET response (Risk #1). This introduces a cross-concern (credential state) into the hint endpoint. A simpler alternative: the client already has access to credential state via the existing `GET /api/credentials` endpoint. The hint #2 view could check credential state independently rather than coupling it to the hint progress API. However, the plan correctly notes this is extensible for future trigger conditions, and the cost is one additional DB query on a cached GET.

### 9. Verifiability (8/10)

Every AC has a concrete verification method:
- AC1: "Migration runs without error. Unit test inserts a row, reads it back. Unit test inserts duplicate, asserts unique constraint violation."
- AC2: "bun run check passes. Unit test asserts catalog has >= 5 entries."
- AC3: "Integration test: insert 2 rows for user A and 1 for user B. GET as user A returns 2."
- AC4: "POST dismiss. GET shows dismissed. POST same returns 409. POST invalid returns 400."
- AC5-AC7: "Playwright E2E for each hint" with specific assertion steps.
- AC8: "Integration test on API: dismiss as user A, GET as user B shows empty."
- AC9: "Run bun run verify."

Test-before-implementation ordering is respected: each task lists its test file before describing the implementation.

The protected-tests block is correctly empty (no existing tests are modified).

The plan correctly notes that Task 6 might use "Vitest component tests for each view, since Playwright E2E requires a running server." This is an honest acknowledgment of the test harness constraint.

---

## CRITICAL

None.

## WARNING

- [Plan section 3, POST dismiss handler] Race condition between SELECT and INSERT. The handler checks `existing.length > 0` then inserts. Two concurrent dismiss requests for the same (userId, hintId) will both pass the existence check and one will get an unhandled constraint violation (500). Fix: use `db.insert(hintProgress).values({...}).onConflictDoNothing()` and return `{ ok: true }` regardless (idempotent dismiss). The 409 response becomes unnecessary -- idempotent POST is simpler and more robust than check-then-insert.

  Alternatively, if the 409 is considered valuable API feedback, wrap the insert in a try-catch for the unique constraint error and return 409 there. But idempotent POST is the better pattern for fire-and-forget clients.

- [Plan section "Risks and ambiguities" #1] The `context.hasValidCredential` field is described in the risks section but not formalized in the type signatures (section 3). If the builder implements it, there is no type contract. Either promote it to the GET response type signature in section 3, or explicitly defer it with a note that hint #2 should check credential state via the existing `GET /api/credentials` endpoint.

- [Plan section 4, HintProvider] The `dismissed` state uses `Set<string>` but the type should be `Set<HintId>`. Using `string` weakens the type safety -- a typo in a hint ID would not be caught by the compiler. The `useHint` hook parameter is typed as `HintId`, but the dismissed set accepts any string. This creates a gap where `dismissed.has(hintId)` works but `setDismissed(new Set([...prev, hintId]))` accepts arbitrary strings from the API response without validation.

## SUGGESTION

- [Plan section 3, error responses] The error response shape uses `{ error: string, code: string }` but the codebase already exports `ApiErrorResponse` and `API_ERROR_CODES` from `@hyperidle/shared`. The hint routes should use the existing error type for consistency with other routes.

- [Plan section 5, trigger conditions table] Hint #4's trigger condition says "Thread is loaded AND has review-type messages (check messages array for review content)." This is vague. The plan should specify what constitutes a "review-type message" -- is it `message.type === "review"`, `thread.kind === "review"`, or the presence of verdict buttons in the UI? The builder needs a concrete field check.

- [Plan section "Ordered task list", Task 6] The plan acknowledges uncertainty about Playwright vs Vitest component tests. Since the workpackage spec explicitly requires "Playwright tests cover: hint appears on trigger, hint disappears after action, hint never reappears," the plan should commit to Playwright E2E tests as the primary verification, with Vitest component tests as supplementary unit coverage.

- [Plan section 4, HintProvider useEffect] The fetch in the provider runs once on mount with an empty dependency array. If the user's session changes (e.g., re-authentication), the hint state will be stale. For v1 this is acceptable (single-user desktop app), but worth noting for shared-backend scenarios where the user identity could change.

## What's Working Well

- The Phase 0 interrogation is thorough and decisive. Each question is answered with a clear decision, rationale, and trade-off. Q5 (auto-dismiss vs explicit-dismiss) is particularly good -- the plan identifies the over-complexity of writing seenAt on auto-dismiss and simplifies to a pure render gate. This is the kind of design decision that prevents implementation headaches.

- The design-it-twice sections are genuine. Both the catalog-location and HintProvider-placement sections present real alternatives with honest tradeoffs. The rejected alternatives are plausible enough that a different architect might have chosen them. This is how design-it-twice should work.
