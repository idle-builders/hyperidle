# Architecture Critique: R4

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:10 AC:8 DM:10 N:9 MD:9 FMC:7 S:10 V:7

## CRITICAL

None.

## WARNING

- [plan section 9, Self-Critique] The `thread.participants` to `identityFor` mapping at ThreadShell line 251 means participants who have NOT sent a message will still show "Unknown". The plan's self-critique acknowledges this but calls it "acceptable." This is technically outside the R4 scope (it was already broken), but the plan should be explicit that R4 does NOT fix this case, rather than hand-waving it as acceptable. The plan should add a sentence: "R4 scope: identities are built from message senderIds only. Participants who joined but never sent a message remain 'Unknown' -- this is pre-existing behavior unchanged by this fix."

- [plan section 8, task 1] The test description says "two senders" but does not specify what assertions are made on the identity values (name, role). A test that only asserts `expect(body.identities).toBeDefined()` would pass the plan's description but prove nothing. The assertion should verify: `identities["u-founder"].name === "Founder"` and `identities["agent-1"].name === "Agent One"` (or whatever the seeded names are), and that `role` is present when set.

## SUGGESTION

- [plan section 4.1] The function signature uses synchronous Drizzle `.all()`, which is correct for the SQLite driver (better-sqlite3 is synchronous). Worth a one-line `@lore` noting that this is intentionally synchronous and will need `await` when migrating to PostgreSQL async driver.

- [plan section 8, task 1] Add a second test case for the zero-messages edge case: create a thread with no messages, verify `identities` is `{}`. This exercises the `senderIds.length === 0` early return.

- [plan section 7] The edge-case table should include "thread with many unique senders (e.g., 50)" to confirm the `IN (...)` clause has no practical limit issue with SQLite. This is not a real risk at current scale but documents the assumption.

## Dimension Scores

### 1. Spec Alignment: 9/10

Both acceptance criteria are addressed. AC-1 (GET /api/threads/:id includes identities map) maps directly to tasks 1 and 2. AC-2 (ThreadShell renders names correctly) is addressed by the correct observation that no frontend changes are needed -- the server fix alone resolves the "Unknown" fallback. No scope creep. The plan correctly avoids refactoring the coach endpoint. One minor gap: the plan does not explicitly state the verification method for AC-2 (visual rendering of sender names). The test in task 1 only verifies the API response shape, not the UI outcome.

### 2. Layer Integrity: 10/10

The change is entirely within `packages/server`. No cross-layer violations. The frontend already consumes the data shape correctly -- the plan correctly identifies that no frontend changes are needed. The server queries its own DB via Drizzle ORM through the standard pattern.

### 3. API Contracts: 8/10

The response shape is specified via inline code showing the exact JSON structure with `identities` added. The identity map shape `Record<string, { name: string; role?: string }>` is explicit. However, the plan does not specify that this is backward-compatible (adding a new field to an existing response) -- it assumes this implicitly in section 8 task 3 but does not formally state the response contract evolution. The type shape matches the frontend decoder at `useThreadDetail.ts` line 67-75 exactly. No new error shapes introduced.

### 4. Data Model Alignment: 10/10

No schema changes. The plan correctly identifies that `users.id`, `users.name`, and `users.role` already exist (confirmed: schema.ts lines 25-31). The FK constraint `messages.senderId -> users.id` with `onDelete: "restrict"` is correctly cited (schema.ts line 223-225). The plan's claim that orphaned senderIds are impossible is accurate.

### 5. Naming: 9/10

`buildThreadIdentities` is honest -- it builds identities for a thread's message senders. The distinction from the coach endpoint's `buildIdentities` is well-documented in the `@lore` comment. The parameter name `senderIds` accurately describes what is passed. The name does not conflict with any existing vocabulary.

### 6. Module Depth: 9/10

The function has a small interface (db + senderIds) hiding a query + map-build. It is not exported -- private to threads.ts. One caller today. The plan explicitly justifies not extracting to a shared module (section 3), which is the correct call. The `ReadonlyArray<string>` parameter type is appropriately constrained.

### 7. Failure-Mode Coverage: 7/10

The plan covers empty messages (returns `{}`), deleted senders (impossible per FK), and missing role (omits key). However:

- No mention of the security/abuse cases block. For this workpackage, the relevant questions are: does the identities map leak information about users who are NOT participants of the thread? The answer is no -- senderIds come from messages in the thread, and only participants can post messages. But the plan should state this explicitly.
- No rate-limiting concern (GET endpoint, pre-existing, not introduced by this change -- acceptable but should be noted as N/A).

### 8. Simplicity / Over-Engineering Risk: 10/10

This is a model of appropriate simplicity. One private function, three lines in the handler. No abstractions, no generics, no future-proofing. The plan explicitly rejects the shared-utility and coach-refactor approaches with sound reasoning.

### 9. Verifiability: 7/10

The plan names a concrete test (task 1): create thread with two senders, fetch GET /:id, assert identities present. This is good but incomplete:

- The test does not cover the edge case of a thread with zero messages (empty identities map).
- AC-2 (ThreadShell renders sender names) has no verification method specified. For an S-complexity bug fix with no UI changes, an integration test proving the API response shape is arguably sufficient, but the plan should explicitly state why no E2E test is needed (the UI already works -- it just lacked data).
- No protected-tests list. The existing `threads.routes.test.ts` GET /:id tests will need to be checked for response-shape assertions that might break when `identities` is added. The plan should enumerate this.

## What's Working Well

- The decision to keep `buildThreadIdentities` private to `threads.ts` and NOT refactor the coach endpoint is exactly right. The coach version hard-codes domain-specific fallbacks ("You", COC_AGENT_ROLE) that would make a shared function worse for both callers. The plan articulates this reasoning clearly in section 3.

- The plan's structure -- problem statement, key insight, approach with rejected alternatives, inline code, edge cases, ordered tasks with red/green/verify -- is a model for S-complexity workpackages. No bloat, every section earns its space.
