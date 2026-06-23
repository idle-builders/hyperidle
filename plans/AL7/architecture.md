# AL7 — Review execution loop · Architecture

Reads the locked concept (`plans/AL7/concept.md`), ground-truth primitive
(`docs/process-layer/staged-operation.md`), canonical shape (`docs/process-layer/canonical-shapes.md`
§ StagedOperation), and the approved design (`plans/AL7/design/approved.md`). Concept is fixed
input — this plan binds it to schema, dispatch, and UI **within** the concept.

## 0. The seam in one sentence

A binding `approve` verdict resolves a **specific review message** inside one atomic transaction in
`packages/server/src/routes/threads.ts` (first-verdict-wins on `messages.resolvedAt`,
threads.ts:1288–1298). AL7 hangs **staged-operation execution** off that exact resolution event: the
verdict that resolves review message `M` claims each pending staged operation **staged against `M`**
via a second persisted conditional transition (`WHERE status='pending'`), then dispatches the frozen
spec through the tool registry and records an immutable Operation Outcome.

```
verdict resolves review message M  ──▶  resolveStagedOperations(reviewMessageId = M)
  (threads.ts:1288 messages.resolvedAt)   │  for each staged op WHERE reviewMessageId = M:
                                          │    claim: UPDATE ... SET status='executing'
                                          │           WHERE id=? AND status='pending'  ← at-most-once
                                          │    if claimed (rows===1):
                                          │      dispatch frozen spec via tool registry (trigger→tool)
                                          │      record OperationOutcome (ok|failed), set status
                                          │    if not claimed (rows===0): skip — already ran
```

**Granularity is the review message, NOT the bet host thread.** This is the load-bearing correction
(critique C1). The ground truth in code:
- A verdict resolves a **specific message** — `messages.resolvedAt` set `WHERE id =
  resolvesMessageRow.id AND resolvedAt IS NULL` (threads.ts:1288–1298). The thread is **not** the
  unit of resolution; the review message is.
- `submit-review.ts` **finds-or-creates exactly one bet host thread per bet** (`hostKind="bet"`,
  `hostId=betId`) and reuses it across the bet's whole life. One bet thread therefore accumulates
  **many review messages and, over time, many staged ops**.

So dispatch keyed on `subjectThreadId` would fire review B's approve against review A's still-pending
op — breaking "a non-approving verdict's op stays pending/un-executed" and "a never-approved op is
never executed." Dispatch is keyed on **`reviewMessageId`** (the staged op's FK to the review
`messages.id` it was staged against), invoked with the message id the verdict just resolved
(`resolvesMessageRow.id`). `subjectThreadId` is retained only as a loader index, never as the
dispatch key.

The claim is **independent of the at-least-once event bus** (concept rule #1). A re-delivered
`thread_resolved`, a re-opened review, or a re-rendered canvas re-enters `resolveStagedOperations`
but the `WHERE status='pending'` claim returns 0 rows on the second pass — never double-executes.

## 1. Layer placement (Human Interface → Meta → Agent Runtime)

- **Agent Runtime** stages: a tool the agent calls (`stage_operation`) writes a `staged_operations`
  row with `status='pending'`. The agent holds only the draft form (concept capability split — the
  live verb is the dispatcher's, never the agent's session).
- **Meta Layer (Kernel)** owns execution: `resolveStagedOperations` + the dispatcher live in
  `packages/server/src/services/staged-operation-dispatcher.ts`, invoked from the threads route's
  verdict path. The Kernel resolves the capability, runs the tool, records the Outcome.
- **Human Interface** renders: `ReviewActionOperation` shows the staged op + its Outcome band
  (design approved). No layer reaches past its neighbor — the UI reads Outcome rows via the reviews
  loader; it never invokes a tool.

## 2. Data model (Drizzle — `packages/db/src/schema.ts`)

Schema is a single `pgTable` source; Drizzle's dialect translation produces SQLite for local/desktop
and PG for shared (mirrors every existing table). Two new tables.

```ts
export const stagedOperations = pgTable(
  "staged_operations",
  {
    id: text("id").primaryKey(),                       // opaque stable id
    // C1 DISPATCH KEY — the review message this op is staged against. The verdict
    // resolves THIS message; resolveStagedOperations filters on it. This is the
    // at-most-once *scope*: one approve fires only the ops of the review it resolves.
    reviewMessageId: text("review_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "restrict" }),
    // Loader/index anchor ONLY (never the dispatch key). The bet host thread the
    // review lives on — reused across many reviews, so it must NOT gate dispatch.
    subjectThreadId: text("subject_thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "restrict" }),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    consequenceId: text("consequence_id").notNull(),   // the consequence it commits (concept)
    // Capability validated against kernel-dispatchable-verb allowlist (AL7); per-agent descriptor (OPEN vocab) deferred to AL8/AM2.
    capabilityTool: text("capability_tool").notNull(), // e.g. "stripe" / the registered tool name
    capabilityHarnessType: text("capability_harness_type"), // optional; null = built-in registry
    operation: text("operation").notNull(),            // the verb/call, e.g. "refund_payment"
    params: text("params").notNull(),                  // JSON; fully-bound, IMMUTABLE once staged
    idempotencyKey: text("idempotency_key").notNull(), // anti-fork identity (agent-authored) — see W1
    reversibility: text("reversibility").notNull(),    // undo path, or "irreversible"
    status: text("status").notNull().default("pending"),
    // pending | executing | executed | failed   (NO `held` column value — see §5)
    stagedByAgentId: text("staged_by_agent_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    // C1: dispatch + re-open re-entry both query by reviewMessageId + status.
    index("staged_ops_review_msg_idx").on(table.reviewMessageId, table.status),
    index("staged_ops_subject_idx").on(table.subjectThreadId),   // loader only
    index("staged_ops_artifact_idx").on(table.artifactId),
    // W1: anti-fork guard ONLY. UNIQUE prevents a second *row* for the same key, so an
    // agent cannot fork two live commits from one stage. It is NOT the at-most-once-
    // *execution* guard — that is solely the `WHERE status='pending'` claim (§4). Stated
    // as co-equal in r0; corrected here. Agent-authored fresh key ⇒ new row by design
    // (concept: retry = new staged op, new key); UNIQUE is vacuous against that, intentionally.
    uniqueIndex("staged_ops_idempotency_uq").on(table.idempotencyKey),
  ],
);

export const operationOutcomes = pgTable(
  "operation_outcomes",
  {
    // 0..1 Outcome per staged op → the staged-op id IS the PK (one-to-one, immutable once written).
    stagedOperationId: text("staged_operation_id")
      .primaryKey()
      .references(() => stagedOperations.id, { onDelete: "restrict" }),
    status: text("status").notNull(),                  // "ok" | "failed"
    payload: text("payload"),                          // JSON tool return on ok
    error: text("error"),                              // surfaced verbatim on failed — never null+failed
    executedAt: text("executed_at").notNull(),
  },
);
```

**Why these choices, with costs:**
- **`reviewMessageId` is the dispatch key, `subjectThreadId` is the loader index** (C1): resolution
  is per-message in `threads.ts`, and one bet thread hosts many reviews. Keying dispatch on the
  thread fires unrelated reviews' ops. Cost: one extra FK column + index; the stage tool must derive
  and write the review message id (§3).
- **`status` as the claim column** (not a separate `claimed` boolean): mirrors `messages.resolvedAt`
  exactly — one column, one conditional `UPDATE`, no extra coupling surface. Cost: status string is
  unconstrained text (like `messages.type`); validated at the app boundary via a shared const tuple
  `STAGED_OPERATION_STATUSES` (§9 task 1) — the *single* source for the strings, imported by both
  the dispatcher and the canvas (N2: the canvas's inline `StagedOperationStatus` union is replaced by
  the tuple-derived type so they cannot drift).
- **`idempotencyKey` UNIQUE is an anti-fork guard, not the execution guard** (W1, corrected):
  the at-most-once-*execution* guarantee is **solely** the `WHERE status='pending'` claim (§4). The
  UNIQUE index only prevents a second *row* for the same key. The key is agent-authored
  (`z.string().min(1)`), so an agent issuing a fresh key gets a fresh row — UNIQUE is vacuous against
  that, by concept design (retry = new op, new key). The DB UNIQUE constraint is the requested
  **DB-level defense backing the app-level claim**: it makes "two live commits forked from one stage"
  structurally impossible, complementing (not duplicating) the claim. Additionally, the dispatcher
  **forwards `idempotencyKey` to the tool call** (§4/§6 `executeCapability` contract) so the
  *external tool/Kernel dedupes on it* — without that, the at-most-once promise stops at HyperIdle's
  boundary, contradicting trigger-not-executor.
- **Outcome PK = staged-op id**: enforces 0..1 and immutability structurally; a second write throws
  on PK conflict rather than overwriting (rule: Outcome immutable once recorded). Cost: none — a
  retry produces a new staged op with its own Outcome row.
- **No per-archetype branch** (concept Phase 6 resolution): A/B/C execute identically — one schema,
  one dispatch path. Avoiding archetype C is the connector's job, not this model's.
- **FK `onDelete` (W5):** `reviewMessageId`/`subjectThreadId`/`artifactId` → `restrict`,
  `stagedByAgentId` → `restrict`. Build task must confirm no existing path deletes a
  message/thread/artifact/user with a live staged op (test teardown, agent removal, bet cleanup). If
  any does, decide `set null`/cascade per FK intentionally rather than letting a lingering staged op
  throw a constraint error on delete. Default-`restrict` is acceptable for AL7's own surface but is a
  latent foot-gun for the broader suite — verify before shipping.

Migration: `npm run db:generate` then `npm run db:migrate` (existing flow). One generated migration
adding both tables.

## 3. The staging tool (Agent Runtime → registry)

New tool `packages/server/src/tools/stage-operation.ts`, registered in
`packages/server/src/tools/tool-registry.ts` `ALL_TOOL_DEFINITIONS` (same `toRegistered(...)`
pattern as `submitReviewTool`). Input (Zod):

```ts
const stageOperationInputSchema = z.object({
  reviewMessageId: z.string().min(1),    // C1: the review message this op commits-on-approve
  artifactId: z.string().min(1),         // the operative artifact the canvas renders
  consequenceId: z.string().min(1),
  capability: z.object({ tool: z.string().min(1), harnessType: z.string().optional() }),
  operation: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(1),
  reversibility: z.string().min(1),
});
```

Handler:
1. Resolve `reviewMessageId` → its thread (`messages.threadId`); set `subjectThreadId` from that row
   (the bet host thread). The review message id is the **dispatch anchor**; the thread is derived
   from it (not the other way around), so the op is always bound to the exact review whose approve
   will fire it. Reject if the message is not a `review`/`questionnaire`-type message in a bet host
   thread (an op can only hang off a reviewable Subject).
2. **Capability validation at stage time (W2 — narrowed):** check `(capabilityTool, operation)`
   against the **kernel-dispatchable-verb allowlist** (`KERNEL_DISPATCHABLE_CAPABILITIES`). Reject
   the stage if the kernel has no executor for the requested verb. This prevents an agent from
   staging an arbitrary/forged capability string. NOTE: this is the **kernel-held-verb gate only**
   — it is NOT a per-agent provisioning check. Per-agent capability grants (an agent can only stage
   ops for capabilities it was provisioned) are deferred: **AL8** (tool grant / trust tier) owns
   the provisioning surface, and **AM2** (harness capability descriptor, OPEN vocab) owns the
   descriptor lookup that would replace this closed allowlist. Until those land, `buildToolRegistry`
   gates by ROLE only, and per-agent external-capability grants don't exist.
3. Insert a `staged_operations` row `status='pending'` with the derived `subjectThreadId` +
   `reviewMessageId`. **The tool does NOT execute** — it only stages. This is the capability split:
   the agent's only verb is `stage_operation`; there is no agent-facing `execute_operation`. Returns
   `{ stagedOperationId }`.

> ⚠️ The agent never receives a live commit tool. The dispatcher (§4) is server-internal, reachable
> only from the verdict path — it is not in `ALL_TOOL_DEFINITIONS`, so it cannot appear in any
> agent's `buildToolRegistry` output. This is the provisioning-layer enforcement of concept rule #3.

## 4. The dispatcher (Meta Layer / Kernel)

`packages/server/src/services/staged-operation-dispatcher.ts`.

```ts
export interface StagedOperationDispatchDeps {
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
  // The connected-tool boundary. Resolves capabilityTool+operation → a runnable side-effect.
  // For AL7 this is a small Map seeded with the fixture tool + ONE real tool path (§6).
  // Receives the FROZEN spec INCLUDING idempotencyKey so the external tool dedupes (W1).
  readonly executeCapability: (op: StagedOperationSpec) => Promise<{ payload: unknown }>;
}

// C1: keyed on the resolved REVIEW MESSAGE, never the thread.
export async function resolveStagedOperations(
  deps: StagedOperationDispatchDeps,
  reviewMessageId: string,
): Promise<void> {
  const pending = await deps.db.select().from(stagedOperations)
    .where(and(eq(stagedOperations.reviewMessageId, reviewMessageId),
               eq(stagedOperations.status, "pending")));
  for (const op of pending) {
    // (a) CLAIM — the at-most-once conditional transition (mirrors threads.ts first-verdict-wins).
    const claimed = await deps.db.update(stagedOperations)
      .set({ status: "executing" })
      .where(and(eq(stagedOperations.id, op.id), eq(stagedOperations.status, "pending")))
      .returning({ id: stagedOperations.id });
    if (claimed.length === 0) continue;   // already claimed by a concurrent/re-delivered pass
    // (b) DISPATCH the FROZEN spec — params read from the row, never rebound (no TOCTOU).
    //     toSpec(op) carries idempotencyKey so the tool dedupes on its side (W1).
    const executedAt = new Date().toISOString();
    try {
      const { payload } = await deps.executeCapability(toSpec(op));
      await writeOutcome(deps, op.id, { status: "ok", payload: JSON.stringify(payload),
        error: null, executedAt }, "executed");
    } catch (cause) {
      // (c) FAILURE SURFACES — failed Outcome with the error verbatim. NEVER swallowed.
      //     Includes the no-capability case: an unknown (tool,operation) throws here and
      //     surfaces as `failed` — never a silent skip (W2). "approve did nothing" is forbidden.
      await writeOutcome(deps, op.id, { status: "failed", payload: null,
        error: surfaceError(cause), executedAt }, "failed");
    }
    // EVERY claimed op now has a terminal Outcome row + terminal status. No path leaves a
    // claimed op without an Outcome except a hard crash mid-(b) — see sweep below.
    deps.eventBus.emit({
      type: "operation_executed",
      streamId: op.subjectThreadId,        // UI subscribes per thread
      stagedOperationId: op.id,
      reviewMessageId: op.reviewMessageId,
      status: /* "executed" | "failed" */,
    });
  }
}
```

`writeOutcome` inserts the `operation_outcomes` row and sets the staged-op status in that order;
the Outcome PK = staged-op id makes the insert idempotent-safe (a duplicate throws on PK, never
overwrites).

**`operation_executed` event payload (N3):** `{ type, streamId: subjectThreadId, stagedOperationId,
reviewMessageId, status: "executed" | "failed" }`. Registered in the shared event union so the
reviews loader / live canvas refreshes the Outcome band on it.

**Claim semantics + crash safety (C2).** The tool call is an external network side-effect; you
cannot hold a DB transaction open across it. So the claim (`pending → executing`) commits *first*
and alone — that is the at-most-once gate. The Outcome write + `executing → executed|failed` is the
second commit. Re-entry can never re-claim a non-`pending` row, so at-most-once holds. The remaining
window is a **hard crash between claim (a) and Outcome write (b/c)**: a row stranded `executing` with
no Outcome.

This window is **closed, not ignored** (C2):
- **Recovery sweep (in AL7 scope, minimal):** `sweepStrandedOperations(deps)` runs on **server boot**
  and finds any `status='executing'` row with **no** `operation_outcomes` row. For each, it writes a
  `failed` Outcome with `error = "Execution interrupted — server restarted before the result was
  recorded; the side-effect may or may not have run. Re-stage to retry."` and sets status `failed`.
  This is **not** a re-execution (we cannot know if the side-effect landed — honest surfacing over
  silent retry). It guarantees the concept invariant: **every claimed op reaches a terminal,
  surfaced Outcome (executed OR failed)** — there is no `executing`-forever invisible state. Cost:
  one boot-time query; no scheduler, no rollback engine (the broad transactional-rollback sweep
  stays out of scope — this is the narrow "no claimed op without an Outcome" guarantee only).
- The transient `executing` state the UI shows between (a) and (b) is the *normal* in-flight band
  (§7); a stranded `executing` is converted to `failed` at next boot, so the reviewer always ends on
  a terminal band.

⚠️ UNVERIFIED (mirror of an in-repo verified pattern): the `.update(...).where(...).returning(...)`
+ `length` check is already the proven first-verdict-wins idiom in `threads.ts:1290` (the `.changes`
→ `.returning()` switch is documented there as the PGlite-compat fix). AL7 copies it verbatim — no
new Drizzle API surface.

## 5. Wiring into the verdict path

`createThreadRoutes(db, eventBus, assistantTurnDeps?, dispatchDeps)` gains a 4th dep. **Unlike
`assistantTurnDeps`, this dep is NOT optional-into-a-no-op (C3).** AL7's whole point is that an
approve executes the staged op; an absent dep that silently no-ops degrades at-most-once to
**at-most-zero** with no visibility — the exact failure AL7 exists to eliminate. Therefore:
- The **live server boot wiring is a mandatory build task**: `app.ts:412` must change from
  `createThreadRoutes(options.db, eventBus, options.assistantTurnDeps)` to pass `dispatchDeps`, and a
  test asserts **the production app constructs the threads route WITH dispatch** (not merely that the
  function works when given deps). A green build cannot exist with the feature silently absent.
- For the test seam it remains injectable, but its absence in the verdict branch is treated as a
  **wiring bug, not a graceful degradation**: if a `verdict`/`approve` is processed and no
  `dispatchDeps` is present, surface it (assertion/observability error in non-prod; the prod boot
  always supplies it). It must never be a quiet skip.

In the verdict branch, after the resolution transaction commits and `thread_resolved` is emitted
(threads.ts ~line 1364), and **only** for an approving decision, dispatch is keyed on the
**resolved review message** (`resolvesMessageRow.id`), never the thread:

```ts
if (input.type === "verdict" && resolvesMessageRow) {
  eventBus.emit(resolvedEvent);
  const decision = input.payload.decision;
  if (decision === "approve" || decision === "approve-with-comments") {
    // dispatchDeps is required in the live boot. Keyed on the RESOLVED MESSAGE (C1).
    await resolveStagedOperations(dispatchDeps, resolvesMessageRow.id);
    // No top-level swallow (C3): resolveStagedOperations writes a `failed` Outcome PER OP and
    // does not throw for tool failures (rule #8 surfaces those on the canvas). A throw that
    // ESCAPES it (e.g. a DB error on the claim) is an infrastructure fault — it must surface,
    // not vanish into an observability `.catch()`. Let it propagate to the route's error handler
    // (logged + 500-equivalent), so an op that could not even be ATTEMPTED is visible, never a
    // silent at-most-zero. (The 201 contract: the verdict already committed in its own tx above;
    // dispatch runs after that commit, so a dispatch fault does not roll back the verdict.)
  }
}
```

- **Approving decisions only** (`approve` / `approve-with-comments`) trigger dispatch; the other
  three (`request-changes` / `edit` / `reject`) leave staged ops `pending` and untouched.
- **No `held` column value (concept lifecycle + W4 re-open identity).** A non-approving verdict
  simply does not dispatch; the op stays `pending`. `held` is the *conceptual* label for
  "parked-for-this-resolution," not a stored status. **Re-open re-entry (W4):** a re-open writes no
  verdict (threads.ts:1303, clears `threads.resolvedAt`), and a later approve resolves the **same**
  review message again — because re-open clears `messages.resolvedAt` for that message and the next
  verdict re-resolves *it* (the review message is stable across re-open; the dispatch key
  `reviewMessageId` therefore survives re-open). The still-`pending` op is found by `WHERE
  reviewMessageId = <same message> AND status='pending'` and claimed once. An op that already reached
  `executing`/`executed`/`failed` is not re-claimed (`WHERE status='pending'` returns 0). This is the
  concept's "may re-enter executing only if never reached executing/executed," now bound to the
  stable review-message identity rather than thread granularity.
  > ⚠️ Build must confirm the re-open path re-resolves the **same** `resolvesMessageId`. If the
  > product instead posts a *new* review message on re-open (new id), the staged op must be
  > re-anchored to the new message at re-open time, OR the dispatch must resolve by a stable
  > `subjectId` that survives re-open. The integration test for re-open (§8) exercises the real
  > re-open → re-approve path and asserts single execution — it will fail if this assumption is wrong.
- Dispatch is **awaited inside the approve handler** (not fire-and-forget). It is fast (claim +
  in-process fixture / one forge call) and its terminal Outcome must exist before the response so the
  reviews loader returns it on the next read. Tool *execution failure* is captured as a `failed`
  Outcome, never thrown into the HTTP response (rule #8 — surfaces on the canvas, not as an API 500).

## 6. The fixture tool + one real tool path (WP scope)

`executeCapability` is a `Map<string, (spec) => Promise<{payload}>>` keyed by `capabilityTool`.
AL7 seeds exactly two, per the WP ("the loop + at least one real tool path; broad coverage is
follow-on AL8"):

1. **Fixture tool** (`fixture:staged-op`) — deterministic, in-process: echoes params as the ok
   payload; throws a typed error when `params.simulateFailure === true`. Proves the loop, the
   at-most-once claim, and failure surfacing without a network.
2. **One real tool path — GitHub PR merge/landing (archetype A).** Chosen over Stripe refund
   because it is the concept's load-bearing example (the diff+landing pair), is genuinely
   irreversible-at-landing yet safe to exercise against a throwaway test repo, needs no money/PCI
   handling, and the forge is already the system-boundary integration target
   (`project_git_host_boundary`: "AL7 = trigger not executor; landing = operative staged op behind
   review"). The real path resolves `capability.tool === "github"`, `operation === "merge_pr"` and
   calls the forge via its MCP/API to land the branch — HyperIdle triggers, the forge executes.

   **Plan-vs-reality flag (not a redesign):** the WP allows *any one* real tool path. The canvas
   design fixture is a Stripe refund (archetype C-ish, money). The real proven path is a GitHub
   merge (archetype A). These are consistent — the canvas renders *any* operative artifact; the
   real loop proof picks the cheapest-to-exercise irreversible verb.

   **Live proof is non-optional (N1, MEMORY `live_proof_lanes_run_before_ship`).** The real GitHub
   merge path must **actually execute once against a real forge** (a throwaway test repo/PR) in a
   **local-only proof lane** before AL7 is DONE — a recorded/contract test is NOT proof of the live
   path (AH5 shipped mocked 3× this way). If no live credential exists in the build env, the WP's
   real-path AC is **honestly downgraded and flagged**: "fixture-proven loop + contract-tested forge
   client; live forge path UNPROVEN" — never silently substituted by the fixture. The fixture tool
   proves the loop/claim/failure-surfacing; it does not stand in for the live path. Does not change
   the schema or dispatch path.

## 7. Reviews loader — the real data path (W3)

**Reality check.** `packages/server/src/routes/reviews.ts` is **not** wired to the DB today: it is a
hardcoded `FIXTURE_REVIEW`, `createReviewRoutes()` takes **no `db` argument** (`app.ts:406` calls it
with none), and it 404s anything but `rev-1`. There is no `review → subject → staged-op` query path
in existence. r0 referenced "the loader gains rows" as if wired — corrected here to the real work.

The Outcome must be returned by **a loader that actually queries the new tables**. The build task:

1. **Give the route a `db` dep:** `createReviewRoutes(db)`; update `app.ts:406`
   `api.route("/reviews", createReviewRoutes(options.db))`. (Same shape as every other DB-backed
   route.)
2. **Define the join.** A `reviewId` on this surface maps to the review **message** (the dispatch
   anchor). Loader query: given the review's `reviewMessageId`, select `staged_operations WHERE
   reviewMessageId = ?` LEFT JOIN `operation_outcomes ON operation_outcomes.stagedOperationId =
   staged_operations.id`. (For the existing fixture-shaped fields, keep the stub data until the
   broader reviews-loader wiring lands — AL7 only adds the staged-op/outcome branch to the response,
   it does not rewrite the whole fixture.)
3. **Response shape addition** (per operative artifact in the review):
   ```ts
   stagedOperation?: {
     stagedOperationId: string;
     status: "pending" | "executing" | "executed" | "failed";
     outcome?: {
       status: "ok" | "failed";
       receipt?: string;            // ok: tool return identity
       error?: string;              // failed: verbatim, un-truncated
       executedAt: string;          // HUMANIZED at this boundary (design W2) — e.g. "2 min ago",
                                    // never the raw ISO `operation_outcomes.executedAt`.
     };
   }
   ```
   The loader humanizes `executedAt` (stored ISO) into the surface's relative/short-time string here
   — the same boundary that produces `producedAgo`. The component never parses time (design W2).
4. **A loader test** asserts the loader returns the Outcome for a resolved Subject (an integration
   test through the route, not just the component rendering it from props) — closing the W3 gap that
   "result visible against the review" was half-verified against a fictional surface.

## 7a. UI wiring (Human Interface)

- `ReviewActionOperation` already extended (design): optional `status` + `outcome` props render the
  Outcome band. Build task: thread the loader's `stagedOperation.status` + `stagedOperation.outcome`
  through `ReviewComposition` → the canvas. The canvas's inline `StagedOperationStatus` union is
  replaced by the shared tuple-derived type (N2) so it cannot drift from the dispatcher.
- Build also wires the transient `executing` state (spinner) the design deliberately omitted (states
  empty/loading are build concerns) — the design covers only the terminal `executed`/`failed` bands.
  A stranded `executing` is converted to `failed` by the boot sweep (§4), so the reviewer never sits
  on a permanent spinner.

## 8. Acceptance-criteria → verification map

| AC (from TRACK-AL.md) | Verification | Where |
|---|---|---|
| Approving a Subject with a staged op executes it through the tool, without leaving the review | integration test: post approve verdict resolving review message M → assert `executeCapability` invoked + `status='executed'` + Outcome `ok` row | `staged-operation-dispatcher.integration.test.ts` |
| **C1 — multi-review-per-thread isolation** (NEW, the test that would catch C1) | integration test: stage op-A against review msg A and op-B against review msg B **on the same bet host thread**, both `pending`. Approve **only** B → assert op-B `executed`, **op-A still `pending`, no Outcome, `executeCapability` NOT called for A**. A single-review fixture would pass while C1 is broken — this case must exist or C1 regresses silently. | dispatcher integration test |
| Non-approving verdict does not execute; op stays pending | integration test: post `request-changes` resolving M → assert `executeCapability` NOT called, op still `pending`, no Outcome | same |
| After execution, result (ok/failure) returns + visible against the review | integration test: assert Outcome row written + **reviews-loader route returns `stagedOperation.outcome` for the resolved review** (the real loader, not props); component test: canvas renders Executed/Failed band | dispatcher test + `reviews.integration.test.ts` (W3) + `ReviewActionOperation.test.tsx` |
| At-most-once: re-open does not double-execute | integration test: **the real re-open path** — approve resolves M (op executes), re-open the review (clears `messages.resolvedAt`/`threads.resolvedAt`), approve again resolving the **same** M → assert `executeCapability` called **exactly once**, `status='executed'`, one Outcome row. NOT just a double-call of `resolveStagedOperations`. | dispatcher integration test (real re-open, W4) |
| A staged op never approved is never executed | integration test: stage op, post non-approving verdict (or never resolve) → assert no Outcome, `executeCapability` not called | dispatcher test |
| Descriptive artifacts do not execute on approve; only operative do | integration test: review with only a `code_diff` artifact (no staged op row) → approve → `executeCapability` not called. Operative = "has a staged_operations row"; descriptive = none | dispatcher test |
| At-most-once is idempotent per approval (constraint) | unit test: two concurrent claims on one `pending` row → exactly one returns rows; **DB UNIQUE on idempotencyKey rejects a duplicate stage** (the DB-level defense) | dispatcher unit test + `stage-operation.integration.test.ts` |
| Capability validated at stage; unknown capability surfaces (W2) | integration test: (a) stage against a capability the **kernel cannot dispatch** → stage FORBIDDEN at write boundary (kernel-held-verb gate via `KERNEL_DISPATCHABLE_CAPABILITIES`); ~~stage against a capability the agent does NOT hold~~ **DEFERRED to AL8/AM2** — per-agent provisioning surface does not exist yet (`buildToolRegistry` gates by ROLE only); (b) approve an op whose `(tool,operation)` has no `executeCapability` entry → **`failed` Outcome surfaced, never a silent skip** | stage-tool + dispatcher test. Scope note: row (a) narrowed to kernel-verb gate; per-agent enforcement (AL8 tool grant + AM2 harness capability descriptor) is follow-on work. |
| Crash recovery: a stranded `executing` op reaches a terminal Outcome (C2) | integration test: insert an `executing` op with no Outcome → run `sweepStrandedOperations` → assert it becomes `failed` with the interrupted-message Outcome | dispatcher integration test |
| Live server boot wires dispatch (C3) | integration test: construct the production app (`createApp`) and assert the threads route was built **with `dispatchDeps`** — an approve through the real app executes the op (not a no-op) | `app.integration.test.ts` |
| Verdict grammar unchanged (constraint) | no change to `VERDICT_DECISIONS`; `tsc` — no new verdict decision added | `npm run check` |
| Execution failure surfaces, never swallowed (constraint) | integration test: `executeCapability` throws → assert `failed` Outcome with the error verbatim, `status='failed'`, **no exception thrown into the HTTP response**; a throw that escapes `resolveStagedOperations` (DB claim error) propagates to the route error handler, not a silent `.catch()` | dispatcher test |
| No bypass of the human gate (constraint) | static: `stage_operation` is the only agent-facing tool; the dispatcher is NOT in `ALL_TOOL_DEFINITIONS` → unreachable from `buildToolRegistry`. Unit test asserts `toolsForRole(role)` never contains an execute verb for any role | `tool-registry.test.ts` |
| Spec immutable once staged / approved spec is what executes (constraint) | unit test: dispatcher reads params from the row, no rebind; `params` written once at stage, never updated | dispatcher unit test |

All runtime ACs → integration/component/unit tests through imports (per CLAUDE.md). The two static
properties (grammar unchanged; dispatcher not agent-reachable) → type system + a registry unit test,
not file-grepping. **The C1 multi-review case and the real re-open case are mandatory — the r0 tests
would have shipped green against a thread-granularity bug because no fixture exercised two reviews on
one thread.**

## 9. Ordered build tasks

1. Schema: add `stagedOperations` (incl. **`reviewMessageId` FK** as the dispatch key) +
   `operationOutcomes`; the `staged_ops_review_msg_idx` + UNIQUE-on-idempotencyKey indexes;
   `db:generate` + `db:migrate`. Add `STAGED_OPERATION_STATUSES` (no `held`) /
   `OPERATION_OUTCOME_STATUSES` const tuples + `StagedOperationSpec` / `OperationOutcome` types in
   `@hyperidle/shared`. Confirm no existing deletion path breaks under `onDelete: restrict` (W5).
2. Red tests for every runtime AC — including the **C1 multi-review-per-thread isolation** case, the
   **real re-open** case, the **crash-sweep** case, the **app-boot-wires-dispatch** case, and the
   **unknown-capability surfaces** case (dispatcher + stage-tool + reviews-loader integration +
   registry unit) — TDD.
3. `stage-operation.ts` tool + register in `ALL_TOOL_DEFINITIONS`: derive `subjectThreadId` from
   `reviewMessageId`, **validate the capability against the harness descriptor at stage time** (W2),
   write the `pending` row.
4. `staged-operation-dispatcher.ts`: `resolveStagedOperations(deps, reviewMessageId)` (claim →
   dispatch frozen spec incl. idempotencyKey → terminal Outcome incl. unknown-capability → `failed`);
   `sweepStrandedOperations(deps)`; `executeCapability` map (fixture tool + GitHub merge path);
   define + register the `operation_executed` event payload.
5. Wire dispatch into the verdict path: keyed on `resolvesMessageRow.id`, approving decisions only,
   **awaited (not detached), no swallowing `.catch()`**. **Make `dispatchDeps` non-optional in the
   live boot — update `app.ts:412` to pass it** + a test that the production app wires it (C3).
6. Reviews loader: **give `createReviewRoutes` a `db` dep, update `app.ts:406`**, define the
   review-message → staged-op LEFT JOIN outcome query, humanize `executedAt`, return
   `stagedOperation` in the response shape (W3); loader integration test.
7. UI: thread `stagedOperation.status`/`.outcome` through `ReviewComposition` → `ReviewActionOperation`
   (band already built); replace the inline `StagedOperationStatus` union with the shared tuple-derived
   type (N2); wire the `executing` transient.
8. Design WARNING fold-ins (already applied to `ReviewActionOperation.tsx` by the designer): success
   band uses `--accent-primary-dim` (not the warning `--accent-secondary-dim`); failure error
   `whitespace-pre-wrap break-words` (un-truncated, rule #8); `executedAt` is a pre-humanized display
   string (loader formats it). Builder: add the `Failed` story's realistic multi-line error (design
   finding #5) and re-bless the DOM-snapshot net (builder, not designer).

## 10. What this plan deliberately does NOT build (scope discipline)

- Broad per-tool dispatch coverage — AL8 (`executeCapability` is a 2-entry map here, open by design).
- Harness return-enforcement — AL6.
- Multi-step transactional rollback — out of scope (single staged op, its own undo only). **NOTE:**
  the *narrow* boot sweep that converts a crash-stranded `executing` op to a surfaced `failed`
  Outcome IS in scope (§4) — it is the minimum needed to honor the concept invariant "every claimed
  op reaches a terminal, surfaced Outcome." The broad transactional-rollback / retry engine is not.
- The graduated-autonomy auto-flow path (reversible consequences flowing without a review) — read
  from the existing `user_skills.autonomyLevel`, not redefined; AL7's loop is the *gated* arm only.
- A policy engine / thresholds / allowlists — explicitly rejected by the concept (enterprise smell).
