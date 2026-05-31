# Architecture Critique: T5

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:7 DM:8 N:9 MD:9 FMC:6 S:8 V:8

---

## Dimension Scores

### 1. Spec Alignment (9/10)

All 5 ACs map to plan tasks with explicit verification methods (section 7). The AC mapping table is clean and traceable. The plan does not invent requirements -- the only scope-extending decision (building the server-side `block_id` query param but not wiring it client-side) is explicitly documented with rationale (section 4.3, Option A vs B). The `/design` skip decision is justified: both UI changes are within-component, single-path modifications.

Minor deduction: the spec (TRACK-T.md line 192) says "Thread rendering can filter to show only messages for a specific block (block-scoped thread view)." The plan's client-side filter (section 4.3) activates only when `prefill.blockId` is set (i.e., user clicked "Discuss"). There is no standalone "filter by block" toggle on the thread section itself. The AC implies the user can independently choose to view block-scoped messages, not only as a side effect of entering "Discuss" mode. This is a plausible interpretation but should be called out as a scope decision.

### 2. Layer Integrity (9/10)

Clean separation. DB changes in `packages/db`, server query changes in `packages/server`, UI changes in `packages/web`. No cross-layer violations. The dual-write pattern (section 3.2) keeps the column as a server concern; clients continue reading from the payload. The anchor-lost derivation stays render-time in the web package.

### 3. API Contracts (7/10)

The `GET /api/threads/:id?block_id=X` endpoint (section 3.4) is described but loosely specified:

- No validation schema is defined for the `block_id` query parameter. Section 3.4 says "No new schema needed -- the block_id is a simple query parameter on an existing endpoint. It will be validated inline." This contradicts the codebase pattern: `listThreadsQuerySchema` validates all query params via Zod for `GET /api/threads`. The `GET /:id` endpoint should follow the same pattern. "Validated inline" is not a contract.
- No error response is specified for invalid `block_id` values (empty string, excessively long string).
- The response shape is documented as "unchanged" which is correct and sufficient.
- No mention of what happens when `block_id` is provided but no messages match -- does it return an empty messages array? (It should, and likely does, but the plan should say so.)

The dual-write code (section 3.2) uses `as { blockId?: string }` cast on the payload. The plan itself acknowledges this and suggests a type-narrowing helper, but does not specify it. The codebase rule (`.claude/rules/typescript.md`) says "No `any`, no `@ts-ignore`, no unsafe `as` casts." The plan should prescribe the safe narrowing path, not suggest it as optional.

### 4. Data Model Alignment (8/10)

The column spec (section 1) is precise: nullable text, B-tree index, no FK, no default. This matches codebase conventions (all IDs are text, nullable columns have no default). Migration naming (`0020_T5_block_id_column.sql`) follows the established convention and the next sequence number is correct (latest is `0019`).

The backfill SQL (section 2) uses PostgreSQL-specific `payload::json->>'blockId'` syntax. The tech stack section in CLAUDE.md says "Drizzle ORM (SQLite + PostgreSQL)" -- the plan does not address SQLite compatibility. However, checking the migration files, all recent migrations use PostgreSQL syntax (e.g., `0018_U1_schema_migration.sql`), so this appears to be the established pattern post-PGlite migration. The plan should note this explicitly.

The backfill risk mitigation ("wrap in `DO $$ ... EXCEPTION WHEN ...` block if needed") is deferred to failure time rather than proactive. For a production migration, the defensive wrapping should be the default, not the fallback.

### 5. Naming (9/10)

Names are honest and consistent:
- `blockId` column matches the existing `PlainPayloadWithBlockId.blockId` field name.
- `anchorLost` boolean prop is descriptive.
- `filterBlockId` prop is clear.
- `messages_block_id_idx` follows the existing index naming convention (`messages_thread_id_idx`, `messages_unresolved_idx`).
- `anchor-lost-indicator` data-testid is testable and descriptive.

No naming conflicts with existing primitives.

### 6. Module Depth (9/10)

The plan keeps the surface area minimal:
- One new column, one new index.
- One new prop (`anchorLost`) on an existing local helper function.
- One new prop (`filterBlockId`) on `HostThreadSection`.
- One new query parameter on an existing endpoint.
- No new components, no new files (except tests and migration).

The `AnchoredMessages` component change is a single boolean prop addition -- deep module hiding the anchor-lost detection logic. The filter is a simple JS array filter on existing data. No new abstractions, no new wrappers.

### 7. Failure-Mode Coverage (6/10)

This is the weakest dimension. Several gaps:

**Missing error paths:**
- The `block_id` query parameter on `GET /api/threads/:id` has no input validation. What if `block_id` is an empty string? What if it contains SQL injection attempts? The Drizzle ORM parameterizes queries so SQL injection is not a concern, but empty-string validation is still needed -- an empty `block_id` would match no messages and return an empty set, which is misleading vs. returning all messages (the no-filter behavior).
- The backfill migration has no error handling for the case where `payload` is valid JSON but `blockId` is not a string (e.g., `blockId: 42` or `blockId: null` stored as a JSON literal). The `IS NOT NULL` check would pass for `blockId: 42`. This is unlikely given Zod validation on the write path, but the plan should acknowledge it.

**Missing security/abuse block:**
- No explicit security & abuse cases section. For T5 this is low-risk (no new auth boundaries, no new POST endpoints, the new query param is read-only and parameterized), but the plan should at least have a "Security: N/A" note with rationale, per the rubric (CC-003).
- The `block_id` query parameter is not validated against the authenticated user's access to the thread. However, this is inherited from the existing `GET /api/threads/:id` endpoint which already has no per-user access control (see @lore L8 HIGH-1/HIGH-2 in `threads.ts` line 199). The plan should note this as inherited debt, not new debt.

**Missing rate-limiting note:**
- The existing `GET /api/threads/:id` endpoint has no rate limiting. T5 adds a query parameter but no new endpoint. The plan should note that rate limiting is inherited (or absent) from the existing endpoint.

### 8. Simplicity / Over-Engineering Risk (8/10)

The plan is appropriately simple. The "build the server endpoint but wire client-side filtering" decision (section 4.3) is well-reasoned -- the endpoint is cheap to build and future-proofs without adding client complexity. This is not over-engineering because:
- The server query is 3 lines of code (one condition push).
- Client-side filtering is simpler for the current scale.
- The plan explicitly says "can be wired later."

One minor over-engineering risk: the plan builds a "Show all messages" toggle (section 4.3) in `HostThreadSection`. This adds UI chrome for a feature that activates only when the user is in "Discuss" mode. The toggle's UX is not fully specified -- what does it look like? Where does it render? Is it a link, a button, a chip? The plan leaves this to the builder, which risks inconsistency with the existing design language.

No abstract base classes, no plugin points, no feature flags, no unnecessary generics.

### 9. Verifiability (8/10)

Test files are named and scoped (section 5, table). Test scenarios are concrete:
- "Insert message, assert column value" (AC-1)
- "Create thread with 3 messages (2 with blockId 'abc', 1 without), GET with `?block_id=abc`, assert only 2 returned" (AC-5 server)
- "Render KnowledgeBody with orphan messages, assert 'anchor lost' text appears" (AC-2)

The E2E test scenario (section 5.1, Task 5.1) covers the full flow including body edit and anchor-lost verification.

Deductions:
- No protected-tests list. The plan touches `KnowledgeDetail`, `KnowledgeBody`, `WorkBet`, and `HostThreadSection` -- all of which likely have existing tests. The plan should enumerate which existing test contracts must not break (CC-008).
- The backfill verification method is not specified. How does the builder verify that existing messages with `blockId` in their payload now have the column populated? A test against a seeded database? A manual query? The plan says "Run `npm run db:migrate` to verify the migration applies cleanly" but that only checks the migration runs without error, not that the backfill is correct.

---

## CRITICAL

None. The plan is structurally sound and all ACs are addressed.

## WARNING

1. **[plan section 3.2]** The dual-write code uses `as { blockId?: string }` cast. The codebase rule prohibits unsafe `as` casts. The plan acknowledges this but makes the fix optional ("the builder should extract blockId from the Zod-parsed result using a type narrowing helper"). This should be mandatory, not advisory. The plan should specify the narrowing approach: after `messageInputSchema.safeParse`, the parsed result for type `"plain"` already includes `blockId?: string` from `plainPayloadSchema`. Use the parsed output directly instead of re-casting the raw input. Specific fix: replace the `as` cast with a reference to `parsed.data.payload.blockId` after narrowing on `parsed.data.type === "plain"`.

2. **[plan section 7, Failure-Mode Coverage]** No security & abuse cases section. Even for a low-risk workpackage, the plan should include a brief "Security: N/A" block with rationale (e.g., "No new auth boundaries. No new POST endpoints. The `block_id` query param is read-only, parameterized via Drizzle, and inherits the existing thread access model. No new secrets or external calls."). This satisfies CC-003 without overhead.

3. **[plan section 3.4]** The `block_id` query parameter has no validation schema. The plan should specify: (a) Zod validation (e.g., `z.string().min(1).optional()`) to reject empty strings, and (b) behavior when `block_id` matches no messages (return empty messages array with normal 200 envelope).

## SUGGESTION

1. **[plan section 2]** The backfill SQL should proactively wrap in a `DO $$ ... EXCEPTION` block rather than deferring to failure. The risk is low (Zod on the write path), but a migration that fails midway through a production deploy is more costly than 3 extra lines of SQL.

2. **[plan section 5]** Add a protected-tests block listing existing test files for `KnowledgeDetail`, `KnowledgeBody`, `WorkBet`, and `HostThreadSection` that must remain green after T5 changes. This prevents test-contract drift (CC-008).

3. **[plan section 4.3]** Specify the "Show all messages" toggle's visual form. A `<button>` with `text-xs text-[var(--text-lo)]` underlined link style would be consistent with the existing minimal chrome. Leaving it unspecified risks the builder inventing UI that clashes with the design language.

4. **[plan section 2]** Note explicitly that the backfill SQL uses PostgreSQL-specific JSON extraction (`::json->>'blockId'`), consistent with the post-PGlite migration baseline. This prevents a future reader from flagging it as a SQLite incompatibility.

5. **[plan section 9]** The plan correctly says "No new custom components" but does not mention Storybook. The `AnchoredMessages` helper gains a new state (with/without `anchorLost`). Since it is a local helper function (not a design-system component), no `.stories.tsx` is required per the frontend rules. This is correct but worth noting explicitly so the builder does not create an unnecessary story file.

## What's Working Well

1. **The dual-write + deferred server-wiring decision (section 3.2 + 4.3)** is the right call. Building the queryable column and server endpoint now while wiring client-side filtering is simple, cheap, and leaves the architecture clean for a future switch to server-side filtering. The trade-off analysis (Option A vs B) is honest -- neither option is straw-manned.

2. **The anchor-lost indicator design (section 4.1)** correctly uses `var(--text-lo)` italic instead of danger/error styling. The reasoning ("informational, not an error") matches the AC's "honest" requirement and avoids alarm fatigue. The plan traces this directly to AC-3.

3. **Current-state analysis (section 0)** is thorough. It identifies exactly where `blockId` lives today, what works, and what the gap is. Every line-number reference checked out against the actual source code. This is what a good plan looks like -- grounded in code, not imagination.
