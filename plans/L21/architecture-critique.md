# L21 Architecture Critique

## Scoring (9 Dimensions)

### 1. Correctness — 8/10

The plan solves the stated requirements. The coach thread maps to the existing Thread primitive with `hostKind: "user"` and `pinned: true`, correctly reusing L1 infrastructure. The `classifyThreadConfiguration` function in `@hyperidle/shared` already recognizes this as `"coach"` -- verified in the codebase (line 180 of `packages/shared/src/thread.ts`).

**Issue (MEDIUM):** The plan uses `"agent-coc"` as the CoC agent's well-known id, but the existing seed data uses `"seed-agent-cos"`. The plan must either:
- (a) Use the existing `"seed-agent-cos"` id, or
- (b) Add a new `"agent-coc"` row to the seed and document why both exist.

Option (a) is simpler. The plan's `COC_AGENT_ID = "agent-coc"` constant should be `"seed-agent-cos"` to match the existing seed. Alternatively, define the constant as a config value that the seed populates (so the source of truth is one place).

### 2. Completeness — 9/10

All ACs are covered:
- CoC trigger bottom-right of Rail: T6
- Overlay opens, underlying view stays visible: T7/T9
- Uses L1 Thread primitive in coach config: T3 (endpoint creates thread with hostKind=user, pinned=true)
- "Add as context": T10-T13
- CoC response persists in Conversations: T14
- System can initiate CoC session: Section 2.3 (server POSTs to coach thread)
- Vitest + Playwright tests: T15, T7 tests, T6 tests, T3 tests
- bun run check + lint + test: T16

Minor gap: AC says "knowledge entry" and "message" are attachable items, but T12-T13 only list BetCard, TaskCard, KnowledgeRow, ThreadRow. "Message" as an attachable context type is specified in the data model (InlineRef.kind gets `"message"`) but no implementation task describes WHERE the user would click to attach a specific message. If the intent is attaching a message from the Conversations view, that surface (CommentRow in ThreadShell) is not listed in T12-T13. The builder should either add a T13b for CommentRow attachment or acknowledge this as deferred.

### 3. Simplicity — 9/10

Minimal moving parts:
- One new endpoint (`GET /api/threads/coach`)
- One new shell composition (`CocOverlay.tsx`)
- One new context (`CocContext`)
- Two hooks (`useCocThread`, `useCocAttach`)
- Extension of one type union (`InlineRef.kind`)
- No new DB tables, no new schema migrations

The design is appropriately lean. The builder could even collapse `useCocThread` into a thin wrapper around the existing `useHostThread` pattern (which does a similar two-step fetch), but having a dedicated hook with the create-on-first-open semantics is justified.

### 4. Consistency — 8/10

Follows established patterns:
- Shell-level compositions in `packages/web/src/shell/` (same as SettingsPanel location pattern)
- Hook naming follows `use<Entity>` convention (useThreadDetail, useHostThread, useCocThread)
- Endpoint follows Hono router pattern with `createXRoutes(db, eventBus)` factory
- Context provider follows standard React context pattern

**Issue (LOW):** The plan places `CocContext` in a new `packages/web/src/contexts/` directory that does not currently exist. Every other piece of shared state in the web package lives as a hook in `packages/web/src/hooks/` or directly in the consuming component. Creating a new top-level directory for one context is a slight inconsistency. Consider placing it in `hooks/` or colocating with the overlay in `shell/`.

**Issue (LOW):** The plan mentions `resolveIdentities(db, existing)` in the endpoint pseudocode (Section 7), but this function does not exist. The existing `GET /api/threads/:id` endpoint does NOT return identities (confirmed: response is `{ thread, messages, headMessageId, nextMessagesCursor }`). The frontend `useThreadDetail` hook gracefully handles missing identities by defaulting to `{}`. The new coach endpoint would need to build identities from the participants list by querying the agents table. This is not difficult but the plan should be explicit that it is implementing a new identity-resolution function (not reusing an existing one).

### 5. Extensibility — 9/10

The design is forward-compatible:
- The `CocContext` could generalize to "add to any thread" without breaking consumers.
- The `useCocThread` hook's interface matches what a future real-time subscription could replace.
- The `InlineRef.kind: "message"` extension is backward-compatible (additive to the Zod enum).
- The overlay pattern could be reused for other agent popovers without architectural change.

### 6. Testability — 9/10

Each piece is independently testable:
- Coach endpoint: pure Hono route with DB fixture injection (same pattern as existing `threads.routes.test.ts`)
- CocOverlay: can be rendered in isolation with mock thread data
- CocTrigger: simple button render test
- useCocThread: mockable fetch
- useCocAttach: context-dependent but trivially wrappable in test providers
- E2E covers the integration seam

One concern: the E2E spec (T15) says "CoC response renders" but with no polling or WebSocket, the only way to see a response is to close/reopen or manually refresh. The E2E test will need to directly seed a response into the DB and then trigger a refresh -- the plan should specify this mechanism rather than leaving it ambiguous.

### 7. Performance — 9/10

- Lazy fetch on first overlay open (not on mount): correct
- No polling (explicit scope decision): correct for v1
- Context provider memoized: correct
- CocOverlay conditionally rendered (not mounted until opened): correct

No concerns. The only potential issue is if the coach endpoint's `WHERE hostKind = 'user' AND hostId = :userId AND pinned = 1` query is slow, but with a user table in single-digit rows this is irrelevant. An index on `(hostKind, hostId, pinned)` would future-proof it but is not needed for v1.

### 8. Security — 8/10

- The endpoint uses `readSenderId(c)` which reads from `X-Identity` header (same trust model as all other thread endpoints)
- No new attack surface beyond what `POST /api/threads/:id/messages` already exposes
- The `agent-coc` can post to the coach thread via the same message endpoint (no privilege escalation)
- Context refs are client-provided metadata in the payload -- the server already validates `PlainPayload` shape via Zod

**Issue (LOW):** The endpoint creates a thread if absent. A malicious client could call `GET /api/threads/coach` repeatedly with different `X-Identity` values and create unbounded coach threads. Rate limiting is not specified. The existing thread creation endpoint (`POST /api/threads`) is a POST (semantically correct for creation) -- making creation a side-effect of a GET is unconventional and harder to rate-limit independently. Consider making the create-if-absent logic a POST (or at minimum, document that GET with side-effects is a pragmatic choice for this specific "resolve or create" pattern).

### 9. Operability — 8/10

- Error handling is specified (ErrorState in overlay, retry button)
- The `eventBus.emit({ type: "thread.created" })` call means the thread creation is observable in logs/events
- The overlay state being session-local (React state in AppShell) means it survives route changes but is lost on page reload -- acceptable for v1

Gap: No observability guidance for the coach endpoint itself (e.g., logging on thread creation, metrics on usage frequency). Minor for v1 but worth noting.

---

## Summary

| Dimension | Score |
|-----------|-------|
| 1. Correctness | 8 |
| 2. Completeness | 9 |
| 3. Simplicity | 9 |
| 4. Consistency | 8 |
| 5. Extensibility | 9 |
| 6. Testability | 9 |
| 7. Performance | 9 |
| 8. Security | 8 |
| 9. Operability | 8 |
| **Average** | **8.6** |

## Verdict: APPROVED

The average score of 8.6 exceeds the 7.0 threshold. The architecture is well-structured, correctly maps to existing patterns, and the implementation task ordering is logical.

## Required Fixes (Builder Must Address)

1. **Agent ID mismatch:** The plan uses `"agent-coc"` but the existing seed has `"seed-agent-cos"`. The builder must use the existing seed id OR explicitly add a new agent row in T2 and document the decision. Using the existing id is strongly preferred.

2. **Identity resolution:** The `resolveIdentities(db, existing)` function referenced in the endpoint pseudocode does not exist. The builder must implement it (query agents table for participant names/roles) or hardcode the two identities for the coach thread (user + CoC agent) since participants are always exactly these two.

## Suggestions (Non-Blocking)

1. **CocContext location:** Consider `packages/web/src/hooks/CocContext.tsx` or `packages/web/src/shell/CocContext.tsx` instead of creating a new `contexts/` directory for a single file.

2. **GET with side-effects:** The create-on-read pattern for `GET /api/threads/coach` is pragmatic but unconventional. If future auth middleware adds rate-limiting by method, GETs typically get higher limits than POSTs. Add a `@lore` comment explaining why this was chosen over a separate `POST /api/threads/coach/ensure`.

3. **E2E test mechanics:** T15 should specify that the test seeds a CoC response message directly into the DB, then triggers a refresh (or close/reopen cycle) to verify the response renders.

4. **Message attachment surface:** Add a note (or T13b) specifying where "message" attachment happens. If it is deferred, update the InlineRef extension to note that `"message"` kind is data-model ready but UI attachment for messages is a follow-up.
