# L7 — Architecture review

Reviewer: Staff Architect (read-only).
Inputs: `docs/work-packages/TRACK-L.md` lines 238–265, `docs/work-packages/L7-plan.md`, full implementation diff (tracked + untracked) on branch `feat/L7-thread-response-unblock`.

Scope of review: layer boundaries, plan/spec drift, contract correctness on `await_thread_response`, data model alignment for `agent_thread_cursor`, coverage of plan §7 failure modes.

---

## Summary

- **Blocking (CRITICAL): 2**
- **Warnings: 5**
- **Observations: 4**

The story's load-bearing primitive (the agent-side unblock) is **not actually wired in production** — the `AgentResponseRouter` is never instantiated by `server-factory` or `session-provisioning`, so `responseRouter` is `undefined` on every real `ToolContext`. The skill tool returns `INTERNAL "responseRouter is not wired into ToolContext"` for every drain-miss path. Tests pass because they construct the router inline. AC §246 ("the response becomes an event that unblocks the agent waiting on it (sync) … the architect specifies the response-as-event contract") is therefore unverified end-to-end despite the green unit tests.

The second blocking issue is a **schema/migration self-contradiction** in `agent_thread_cursor`: column declared `NOT NULL` with FK action `ON DELETE SET NULL`. The implementation patched around the contradiction with a SQLite trigger that the Postgres schema does not carry — production parity is broken.

The remaining warnings are local: error-classification gaps versus plan §7 (idempotency-conflict semantics, async-ack false negatives), tool-role narrowing tighter than the spec called for, and a few minor naming/contract drifts.

---

## CRITICAL — blocking

### C1 — `AgentResponseRouter` is never instantiated; production tool context has no `responseRouter`
**Files**
- `packages/server/src/skill-tools/tool-registry.ts:41` — `responseRouter?: AgentResponseRouter` is **optional**.
- `packages/server/src/skill-tools/await-thread-response.ts:91-93` — handler returns `err("INTERNAL", "responseRouter is not wired into ToolContext")` when missing.
- `packages/server/src/server-factory.ts` — no reference to `AgentResponseRouter`. (`grep` confirms zero hits in non-test server source.)
- `packages/server/src/services/session-provisioning.ts` — no reference.

**Spec / plan reference**
- Plan §5 ("Modified" list): "`packages/server/src/server-factory.ts` — instantiate `AgentResponseRouter` and pass into `ToolContext`."
- Plan §8.1: "**`ToolContext` extension:** add `readonly responseRouter: AgentResponseRouter` to `ToolContext`." (Plain `readonly`, not optional.)
- Story L246: "the response becomes an event that **unblocks the agent waiting on it (sync)**".

**Impact**
- Every production call to `await_thread_response` that has to *wait* (drain miss → real harness path) returns `INTERNAL`. That is the entire sync-unblock contract the story is named after.
- The drain-hit path silently works in production because it never references `router` — masking the regression in any happy-path smoke test.
- The unit tests in `await-thread-response.test.ts` and `agent-response-router.test.ts` pass because the tests construct the router themselves (`new AgentResponseRouter(bus, db)` in each `beforeEach`). Coverage looks complete; integration is not.

**Required fix**
1. Make `responseRouter` non-optional on `ToolContext` (per plan §8.1).
2. Construct one `AgentResponseRouter` in `server-factory.ts` against the singleton `EventBus` + DB; thread it through to every `ToolContext` builder (`session-provisioning.ts:303`, harness loop, any test helper).
3. Add an integration test that exercises `await_thread_response` through the registry without manual router construction so the wiring gap is caught next time.

### C2 — `agent_thread_cursor` schema declares `NOT NULL` + `ON DELETE SET NULL` (contradiction); SQLite-only trigger papers over it
**Files**
- `packages/db/src/schema.ts:240-242` — `lastSeenMessageId: text(...).notNull().references(() => messages.id, { onDelete: "set null" })`.
- `packages/db/src/schema.pg.ts:227-229` — identical contradiction.
- `packages/db/drizzle/0009_agent_thread_cursor.sql:20` — `FOREIGN KEY (last_seen_message_id) REFERENCES messages(id) ... ON DELETE set null`, plus a `BEFORE DELETE ON messages` trigger to manually cascade-delete cursor rows.
- The migration trigger exists **only in the SQLite migration**; `schema.pg.ts` does not declare an equivalent, and no Postgres migration adds one.

**Spec / plan reference**
- Plan §4.4: defines the column as `text NOT NULL` with `FOREIGN KEY (last_seen_message_id) REFERENCES messages(id) ON DELETE SET NULL`. The plan itself contains the contradiction.
- Plan §3 reconciliation row: claims "Postgres … uses identical column names; types `text NOT NULL`".

**Impact**
- A literal `SET NULL` action against a `NOT NULL` column will raise a constraint failure on hard-delete. The SQLite trigger sidesteps this; **Postgres has no trigger and will fail** (or, if FKs aren't yet enforced in tests, will fail in production once they are).
- The trigger silently changes the FK semantics from "cursor survives message deletion with null pointer" to "cursor row is deleted". Either choice is defensible, but they are different choices, and the two engines now disagree.
- The `@lore` comment on `schema.ts:235-239` documents the known conflict but does not resolve it — it tells callers "soft-delete or remove the cursor first", which is a leak of internal invariants into the call site.

**Required fix** — pick one of:
- (a) Drop the FK action (`onDelete` clause) entirely; add the cleanup trigger to **both** SQLite *and* Postgres migrations. Document the trigger as the canonical cleanup mechanism. Or
- (b) Make the column nullable (`text NOT NULL` → `text`); keep `ON DELETE SET NULL`; add an application-level invariant that a row with `last_seen_message_id IS NULL` is logically empty and rebuilt on next pickup. Update plan §4.4.
- Either way: schema.ts, schema.pg.ts, the migration SQL, and the plan must agree.

---

## WARNINGS

### W1 — Tool role list narrower than the plan demanded
**Files**
- `packages/server/src/skill-tools/await-thread-response.ts:213` — `roles: ["builder", "chief_of_staff", "practice_facilitator"]`.
- `packages/shared/src/types.ts:123-129` — `AgentRole` union has six members: `builder`, `growth`, `product_manager`, `practice_facilitator`, `chief_of_staff`, `brand_voice`.

**Spec / plan reference**
- Plan §4.3: "Roles: every harness role EXCEPT founder (founders never run as harness agents)."

The implementation excludes `growth`, `product_manager`, and `brand_voice` for no documented reason. There is no `founder` member in `AgentRole`, so "every harness role except founder" reduces to "every harness role". Either:
- the plan/AGENT_LAYER definition of "harness role" is narrower than the type union (in which case the narrowing must be documented), or
- this is a silent contraction of agent capability that will surface as `FORBIDDEN` for product-manager and growth agents waiting on threads.

**Required fix:** restate roles to either `undefined` (all roles) or to the explicit subset with a sentence in the tool's docstring citing the AGENT_LAYER section that justifies it.

### W2 — Error classification missing the 409 `idempotency_conflict` branch
**Files**
- `packages/web/src/pages/ConversationsReview.tsx:95-110` — `classifyHttpError` only branches on `status >= 500`, falling everything else through the 4xx body-read path.
- `packages/server/src/routes/threads.ts:412-418` — server returns 409 `{error, code: "idempotency_conflict"}`.

**Spec / plan reference**
- Plan §7.2 row "Idempotency conflict (different payload)": "server returns 409 `idempotency_conflict` … `error` row using server's message".
- Plan §7.2 row "Idempotency replay (same payload)": "server returns 200 + existing message … no error, no duplicate".

**Impact**
- Idempotency replay (same `clientKey`, same payload) is supposed to look like success: refresh the thread, no error, no duplicate. The current `performCommit` does that correctly because the server returns 200, so this half is fine.
- Idempotency conflict (same `clientKey`, **different** payload) returns 409. The current code reads `body.error` and surfaces it — also fine — **but** the plan's failure-mode table promised an explicit code-based branch and a test. There is no test that asserts the 409 path produces the expected text.
- 409 on `verdict_race` is the same shape and same gap.

**Required fix:** either add explicit assertions in `ConversationsReview.commit.test.tsx` for both 409 codes (verdict_race, idempotency_conflict) using the server's actual error body, or simplify the plan §7.2 mapping to "all 4xx use the body string". Don't leave the table claiming coverage that the tests don't carry.

### W3 — Async-ack toast detection logic is fragile
**Files**
- `packages/web/src/pages/ConversationsReview.tsx:215-234`

The logic that decides "this was an async commit, fire the toast" reads:
```
nextResolvedAt = body?.thread?.resolvedAt ?? null
if (nextResolvedAt === null && priorResolvedAt === null) toast.show(ASYNC_ACK_COPY)
```

**Spec / plan reference**
- Plan §4.5: "An async thread is one where: `thread.resolvedAt === null` AND the appended message did NOT cause resolution."

**Issues**
- A `plain` (non-verdict) reply on an already-resolved thread (`priorResolvedAt !== null`) does NOT fire the toast. The plan's definition is ambiguous on this case but the intent — "the response is recorded and the agent picks it up on its next session" — clearly applies. A plain reply on a resolved thread is still async by spec line 257.
- Conversely, a verdict commit that fails to resolve (e.g. server rejected it but with 200 — should not happen) would falsely fire the toast.

**Required fix:** rephrase the predicate as "the commit was not a head-resolving verdict on a previously-unresolved thread". Mirror the test matrix in §7.2 row "Async commit ack" against this condition explicitly.

### W4 — `await_thread_response` writes the cursor only with the resolved message's `lastSeenMessageId`, not its `createdAt`; drain comparison is timestamp-based via a JOIN on every call
**File**
- `packages/server/src/skill-tools/await-thread-response.ts:120-150`

**Issue**
- The drain check first reads the cursor row, then **runs a second SELECT against `messages` to fetch the cursor's `createdAt`**, then runs the actual drain SELECT. That's three queries per call.
- The plan §4.4 explicitly described `last_seen_message_id` as the cursor; comparing on `messages.createdAt > (SELECT createdAt FROM messages WHERE id = last_seen_message_id)` was the spec'd shape, and this matches what's implemented — so this is a minor **observation** about cost, not a contract miss. But it is worth noting that storing `last_seen_created_at` directly on the cursor (a denormalized copy) would let the drain run as a single SELECT and would also remove the need for the second `messages` lookup. If we expect this tool to be called on every harness loop iteration, the extra round-trip per agent per loop matters.

**Required fix (optional):** add `last_seen_created_at TEXT NOT NULL` to the cursor; populate at write time; drop the second SELECT.

### W5 — Tool's `ToolResult` error union uses string codes that don't match the closed set declared in `tool-result.ts`
**File**
- `packages/server/src/skill-tools/await-thread-response.ts:89, 92, 104, 116, 171, 174, 176`

The plan §4.3 declared the closed error-code union: `FORBIDDEN | NOT_FOUND | TIMEOUT | SUPERSEDED | VALIDATION | INTERNAL`. The implementation also emits these codes — but I did not verify that the registry-level `ToolResult` type narrows the union to only these codes. The other registered tools use `INVALID_INPUT` for Zod failures (e.g. `tool-registry.ts:185-186`), while `await_thread_response` uses `VALIDATION`. Two codes for the same concept across the same tool surface is a smell.

**Spec / plan reference**
- Plan §4.3 specifies `VALIDATION`; the surrounding registry uses `INVALID_INPUT`.
- `tool-result.ts` (not edited by L7) is the source of truth for the closed code set — re-read needed before merge.

**Required fix:** either align this tool to emit `INVALID_INPUT` like its siblings, or update the registry-wide convention to `VALIDATION` and migrate the others. Don't ship two synonyms.

---

## OBSERVATIONS

### O1 — Plan and tests claim 13 tools; both are now consistent. Good.
`tool-registry.test.ts` was updated from `12` → `13`, `tool-schemas.test.ts` adds `await_thread_response`, `tool-registry-role.test.ts` adds the role assertions. The augmentable-test contract from plan §10.2 is honoured.

### O2 — `ToastRegion` lives in `packages/web/src/shell/` (Tier 3) per the design-system.md rule. Correct boundary.
Plan §4.7 said "NOT a new design-system component". The component is mounted once at `AppShell.tsx:416` and wraps the rest of the shell. `useToast` throws (loud failure) when used outside the provider — also correct per the standing rule against silent no-ops.

### O3 — `ConversationsReview` keeps a fallback `localMessage` toast path when `ToastContext` is absent
`packages/web/src/pages/ConversationsReview.tsx:120-142`. This is defensible (Storybook / unit tests) but the page now has two toast paths that must stay in sync. A comment explains it; consider replacing the fallback with a test-only mock provider so production has exactly one path.

### O4 — Layer integrity holds
- The server-side router subscribes to the in-process `EventBus` (Meta layer) and never reaches across to the harness or the human interface.
- The web client uses only HTTP routes that already exist (`POST /api/threads/:id/messages`, `GET /api/threads/:id`); no new HTTP endpoints — matches plan §8.
- The skill-tool surface is the only agent-facing addition; it does not call models, does not access the Primitive Store across layers, and inherits the existing role authz.
- `agent_thread_cursor` is a Meta-layer table; FKs cascade to `agents` and `threads` only.

The three-layer boundary is clean apart from the wiring gap in C1.

---

## Cross-check against plan §7 failure-mode table

| Plan row | Implementation status |
|---|---|
| Network down | Covered (`classifyError` returns the right copy) |
| Timeout (15s) | Covered (`AbortController` + timer + `AbortError` branch) |
| 4xx with `{error: string}` | Covered (`classifyHttpError` reads `body.error`, truncates 120) |
| 4xx without body | Covered (fallback string) |
| 5xx | Covered (explicit branch) |
| Idempotency replay (same payload) | Covered transitively (server returns 200) — **no test** |
| Idempotency conflict (different payload) | Falls through 4xx body branch — **no explicit test, see W2** |
| Verdict race (concurrent verdict) | Falls through 4xx body branch — **no explicit test, see W2** |
| Race: commit before waiter | Drain check covers it (await-thread-response.test.ts "drain hit") |
| Race: waiter then second commit | Router test "only one waiter resolution per qualifying event" |
| Waiter timeout | Router test + tool test — covered |
| Multiple waiters same `(agent, thread)` | Router test "supersedes an older waiter" — covered |
| Server identity mismatch | Covered transitively via 4xx |
| Server restart between commit + waiter | Drain check + cursor — covered by tool test "drain skips messages older than the cursor" |
| Async commit ack | Covered with caveat W3 |
| Composer keyboard suppression | Covered in `Composer.pending-error.test.tsx` (per plan T7) |
| Cursor-write race | Plan claimed `INSERT … ON CONFLICT DO UPDATE`; implementation does this (`await-thread-response.ts:193-204`). Test for concurrent-call assertion exists in router test "only one waiter resolution". |
| Drain SELECT vs concurrent INSERT | Covered |
| Toast XSS | `ToastRegion` renders `{message}` as a text node (React default escapes) — covered structurally |
| Async toast double-fire | Covered by `ToastRegion.test.tsx` single-toast invariant |

Net: **3 rows have weaker coverage than the plan claimed** (idempotency-replay test, idempotency-conflict test, verdict-race explicit test). All three are W2.

---

## Required changes before merge

1. **C1** — Wire `AgentResponseRouter` into `server-factory.ts`. Make `responseRouter` non-optional on `ToolContext`. Add an integration-level test that proves end-to-end unblock without manually constructing a router.
2. **C2** — Resolve the `NOT NULL` + `SET NULL` contradiction in `agent_thread_cursor`. Pick (a) drop `onDelete` and add the cleanup trigger to Postgres too, or (b) make the column nullable. Update schema.ts, schema.pg.ts, both migrations, and plan §4.4 to agree.

## Recommended

3. **W1** — Either widen the role list to all six harness roles or document why three are excluded.
4. **W2** — Add explicit test rows for 409 `idempotency_conflict` and `verdict_race` paths in `ConversationsReview.commit.test.tsx`.
5. **W3** — Tighten the async-ack predicate to handle "plain reply on already-resolved thread".
6. **W5** — Pick one of `VALIDATION` / `INVALID_INPUT`; align across the registry.

## Optional

7. **W4** — Denormalize `last_seen_created_at` onto the cursor row to drop one round-trip per call.
# L7 Architecture Critique — `docs/work-packages/L7-plan.md`

Inputs: `docs/work-packages/TRACK-L.md` lines 238–265, `docs/design-explorations/L7/approved.md`, `docs/work-packages/L7-plan.md`.

## Final Score: 7.8 / 10

Breakdown (after one fix-iteration):

| Dim | Code | Round 1 | Round 2 (final) |
|---|---|---|---|
| Spec alignment | SA  | 7 | 8 |
| Layer integrity | LI  | 8 | 8 |
| API contracts | AC  | 6 | 8 |
| Data model | DM  | 7 | 8 |
| Naming | N   | 8 | 8 |
| Module depth | MD  | 7 | 7 |
| Failure-mode coverage | FMC | 6 | 8 |
| Simplicity / over-engineering | S   | 7 | 7 |
| Verifiability | V   | 6 | 8 |
| **Average** |  | **6.9** | **7.8** |

Threshold (≥ 7.0) reached on iteration 1 — proceed to `/write-tests`.

---

## Round 1 — findings (resolved in iteration 1)

### CRITICAL

- **[plan §13 — Open Questions]** Three open questions left unresolved at the end of an architecture plan is a contract gap, not a discussion prompt. `/write-tests` cannot encode the cursor-write policy or default `timeoutMs` without a frozen decision.
  → **FIXED.** Renamed §13 to "Resolved decisions"; D-A frozen on single canonical event, D-B frozen at 60_000 ms default with 600_000 ms hard cap, D-C frozen on cursor-write only via `await_thread_response`.

- **[plan §4.3 — `await_thread_response`]** Output type and error-code set were not enumerated. The pseudocode said `return ok(message)` and `err("TIMEOUT", ...)` but never specified the closed error union or the success body shape. Without that union the harness cannot exhaustively type-check the result.
  → **FIXED.** §4.3 now declares the closed error-code union (`FORBIDDEN | NOT_FOUND | TIMEOUT | SUPERSEDED | VALIDATION | INTERNAL`), the success body (`{message, thread}` mirroring `rowToMessage`/`rowToThread`), and the role visibility (every harness role except founder).

- **[plan §4.4 — schema]** Column nullability on the composite PK members was implicit; FK on `last_seen_message_id` was missing; cursor-write atomicity was unspecified; rollback note missing.
  → **FIXED.** §4.4 now states explicit `NOT NULL` on all four columns, FK to `messages(id) ON DELETE SET NULL`, an index on `thread_id`, the upsert SQL on conflict, the `<NNNN>_add_agent_thread_cursor.sql` migration name, and a `DROP TABLE` rollback note. Both SQLite and Postgres column types stated.

- **[plan §10 — Protected tests]** Single flat list mixed frozen and augmentable contracts; new protected tests for the cursor table and the new skill tool were not enumerated; existing Composer / ReviewVerdictBar / ThreadShell tests were not protected against selector drift even though L7 changes those components' props.
  → **FIXED.** §10 now has three explicit layers: §10.1 frozen (12 files including existing E2E and design-system component tests), §10.2 augmentable (4 files; `tool-registry.test.ts` count bump 12→13 documented), §10.3 new-protected (8 files introduced by L7).

### WARNING

- **[plan §8 — Route checklist]** "No new HTTP routes" was correct, but the registry impact of the new skill tool was understated as "alongside the 14 existing tools" — the registry today has 12 tools, not 14 (verified at `tool-registry.test.ts:32-49` which asserts `toHaveLength(12)`). Spec/codebase drift (CC-007).
  → **FIXED.** §8 split into a route table (zero new rows) and §8.1 skill-tool registry checklist with the corrected canonical-set count, the role-visibility matrix, and the additive `responseRouter` field on `ToolContext`.

- **[plan §7 — Failure-mode coverage]** Several failure modes from `approved.md` were not represented: the async ack toast, Cmd/Ctrl+Enter suppression while pending, toast XSS via server-provided 4xx string, double-toast on rapid retries. Cursor-side races (concurrent `await_thread_response` calls landing the same message; drain SELECT vs concurrent INSERT) were also missing.
  → **FIXED.** §7 now has §7.1 design ⇆ plan error cross-check matrix tying every design error string to a test row, plus six new rows in §7.2 covering async ack, keyboard suppression, cursor PK race, drain race, XSS, and toast queue depth.

- **[plan §4.2 — race contract]** "Subscribes synchronously" is true but doesn't address the registration-before-emit ordering hazard inside `waitFor` itself.
  → **FIXED.** New §4.4b documents the register-then-drain critical section invariant and tags it for a `@lore` comment in the implementation.

### SUGGESTION

- **[plan §6 — T7]** Storybook stories required by `approved.md` §10 (`Idle`/`Pending`/`Error`/`ErrorThenRetry`) were not enumerated as deliverables in T7; only "matches the four Storybook stories" mentioned.
  → **FIXED.** T7 now lists the story exports per component plus the assertion list (focus, aria, keyboard) that the component tests must cover.

---

## Round 2 — final findings (none blocking)

### SUGGESTION (non-blocking, may be picked up during implementation)

- **[plan §4.7]** `ToastRegion` is described as a "Tier 3 shell wrapper, NOT a new design-system component." That's defensible because no shared-component slot is consumed, but the toast surface IS visible to users in production and would benefit from a Storybook entry under a "shell" section. Consider adding a Storybook page that mounts `ToastRegion` with a button to fire test toasts — gives `/visual-polish` a screenshotable artifact without breaching the 19-component budget.
- **[plan §4.5]** The 15-second client-side timeout is a plan invention (not in `approved.md`). It's reasonable, but `approved.md` §3.3 only covers the copy for "Request timed out" — it doesn't pin the duration. If founders' real-world flows ever sit on a slow network, 15s may be too aggressive. Worth a short telemetry note in implementation: log timeout fires so we can tune later.
- **[plan §4.2]** The router being in-process means the EventBus Redis adapter (`events.ts:247-251`) is the migration path for multi-process deploys. The plan flags this in §12 (design-it-twice) but does not emit a `@lore` comment requirement on the in-process assumption. When the implementation lands, that lore tag will save the next agent a re-discovery.

---

## What's working well

- **Single canonical event with role-aware filtering.** Reusing `thread_message_appended` rather than introducing `thread_response_received` keeps the event taxonomy crisp and avoids forcing every existing subscriber to ignore a new noise event. The waiter-side filter (`senderId !== agentId`, `event.threadId === waiter.threadId`, `(agentId, threadId)` keying) is the right place to encode "is this a response *for me*."
- **Race-free pickup loop.** The "drain-then-wait" sequencing inside `await_thread_response`, paired with the `agent_thread_cursor` table, gives the harness a deterministic "did I miss anything?" check that survives server restarts. The plan correctly identifies the EventBus's synchronous emit as the property that closes the registration-before-emit window, and the §4.4b note documents it for the implementation.
- **No optimistic UI; payload-preserved retries.** The web-side state machine matches `approved.md` §3.3 verbatim, including the contract that the textarea is never cleared until commit succeeds. This is the kind of small detail that gets dropped in reviews; the plan pinned it explicitly.
- **Plan reconciliation is honest.** The §3 reconciliation table flagged the stale fixture reference at `ConversationsReview.tsx:132` (the line mentioned in the story spec is no longer the bug; the bug moved to line 107) instead of pretending the spec is the final word. This is the right behavior for CC-007.
- **Layer integrity unbroken.** No frontend reaches into the Primitive Store; no Meta-layer call to a model; the new skill tool stays inside the harness boundary; the EventBus dependency is in-process and crosses no layer.

---

`/architecture-critique` clears at 7.8. Proceed to `/write-tests`. The plan should not be re-edited unless `/write-tests` discovers a contract gap; in that case, restart at §4.3 (the load-bearing contract) and re-run this critique.
