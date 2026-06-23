# AL7 — Review execution loop · Architecture

Reads the locked concept (`plans/AL7/concept.md`), ground-truth primitive
(`docs/process-layer/staged-operation.md`), canonical shape (`docs/process-layer/canonical-shapes.md`
§ StagedOperation), and the approved design (`plans/AL7/design/approved.md`). Concept is fixed
input — this plan binds it to schema, dispatch, and UI **within** the concept.

## 0. The seam in one sentence

A binding `approve` verdict already resolves a thread inside one atomic transaction in
`packages/server/src/routes/threads.ts` (first-verdict-wins, `WHERE resolvedAt IS NULL`). AL7 hangs
**staged-operation execution** off that exact resolution event: after the verdict transaction
commits, the Kernel claims each pending staged operation attached to the resolved Subject via a
second persisted conditional transition (`WHERE status='pending'`), then dispatches the frozen spec
through the tool registry and records an immutable Operation Outcome.

```
approve verdict tx commits  ──▶  resolveStagedOperations(subjectThreadId)
  (existing threads.ts seam)        │  for each staged op attached to the Subject:
                                    │    claim: UPDATE ... SET status='executing'
                                    │           WHERE id=? AND status='pending'   ← at-most-once
                                    │    if claimed (rows===1):
                                    │      dispatch frozen spec via tool registry (trigger→tool)
                                    │      record OperationOutcome (ok|failed), set status accordingly
                                    │    if not claimed (rows===0): skip — already ran / held
```

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
    // Attachment within a Subject. The Subject is the bet host thread (review lives there);
    // we anchor to the thread that resolves + the artifact the canvas rendered.
    subjectThreadId: text("subject_thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "restrict" }),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    consequenceId: text("consequence_id").notNull(),   // the consequence it commits (concept)
    // Capability resolved via the harness capability descriptor (OPEN vocab) — NOT a hardcoded map.
    capabilityTool: text("capability_tool").notNull(), // e.g. "stripe" / the registered tool name
    capabilityHarnessType: text("capability_harness_type"), // optional; null = built-in registry
    operation: text("operation").notNull(),            // the verb/call, e.g. "refund_payment"
    params: text("params").notNull(),                  // JSON; fully-bound, IMMUTABLE once staged
    idempotencyKey: text("idempotency_key").notNull(), // at-most-once identity (agent-authored)
    reversibility: text("reversibility").notNull(),    // undo path, or "irreversible"
    status: text("status").notNull().default("pending"),
    // pending | executing | executed | failed | held
    stagedByAgentId: text("staged_by_agent_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("staged_ops_subject_idx").on(table.subjectThreadId, table.status),
    index("staged_ops_artifact_idx").on(table.artifactId),
    // The at-most-once identity. One row per idempotency key — a re-stage with the
    // same key is rejected at insert, so the agent cannot fork two live commits.
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
- **`status` as the claim column** (not a separate `claimed` boolean): mirrors `threads.resolvedAt`
  exactly — one column, one conditional `UPDATE`, no extra coupling surface. Cost: status string is
  unconstrained text (like `messages.type`); validated at the app boundary via a shared const tuple.
- **`idempotencyKey` UNIQUE**: the at-most-once identity lives at the data layer, not only in the
  claim. Two independent guards: (a) UNIQUE prevents a second *row* for the same key; (b) the
  `WHERE status='pending'` claim prevents a second *execution* of the same row. Cost: an agent
  re-staging with a fresh key is a *new* op (concept: retry = new staged op, new key) — intended.
- **Outcome PK = staged-op id**: enforces 0..1 and immutability structurally; a second write throws
  on PK conflict rather than overwriting (rule: Outcome immutable once recorded). Cost: none — a
  retry produces a new staged op with its own Outcome row.
- **No per-archetype branch** (concept Phase 6 resolution): A/B/C execute identically — one schema,
  one dispatch path. Avoiding archetype C is the connector's job, not this model's.

Migration: `npm run db:generate` then `npm run db:migrate` (existing flow). One generated migration
adding both tables.

## 3. The staging tool (Agent Runtime → registry)

New tool `packages/server/src/tools/stage-operation.ts`, registered in
`packages/server/src/tools/tool-registry.ts` `ALL_TOOL_DEFINITIONS` (same `toRegistered(...)`
pattern as `submitReviewTool`). Input (Zod):

```ts
const stageOperationInputSchema = z.object({
  artifactId: z.string().min(1),         // the operative artifact the canvas renders
  consequenceId: z.string().min(1),
  capability: z.object({ tool: z.string().min(1), harnessType: z.string().optional() }),
  operation: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(1),
  reversibility: z.string().min(1),
});
```

Handler: derive `subjectThreadId` from the artifact's producing task → bet host thread (same lookup
chain `submit-review.ts` uses: task → betId → bet host thread). Insert a `staged_operations` row
`status='pending'`. **The tool does NOT execute** — it only stages. This is the capability split:
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
  readonly executeCapability: (op: StagedOperationSpec) => Promise<{ payload: unknown }>;
}

export async function resolveStagedOperations(
  deps: StagedOperationDispatchDeps,
  subjectThreadId: string,
): Promise<void> {
  const pending = await deps.db.select().from(stagedOperations)
    .where(and(eq(stagedOperations.subjectThreadId, subjectThreadId),
               eq(stagedOperations.status, "pending")));
  for (const op of pending) {
    // (a) CLAIM — the at-most-once conditional transition (mirrors threads.ts first-verdict-wins).
    const claimed = await deps.db.update(stagedOperations)
      .set({ status: "executing" })
      .where(and(eq(stagedOperations.id, op.id), eq(stagedOperations.status, "pending")))
      .returning({ id: stagedOperations.id });
    if (claimed.length === 0) continue;   // already claimed by a concurrent/re-delivered pass
    // (b) DISPATCH the FROZEN spec — params are read from the row, never rebound (no TOCTOU).
    const executedAt = new Date().toISOString();
    try {
      const { payload } = await deps.executeCapability(toSpec(op));
      await deps.db.insert(operationOutcomes).values({
        stagedOperationId: op.id, status: "ok",
        payload: JSON.stringify(payload), error: null, executedAt,
      });
      await deps.db.update(stagedOperations).set({ status: "executed" })
        .where(eq(stagedOperations.id, op.id));
    } catch (cause) {
      // (c) FAILURE SURFACES — write a failed Outcome with the error verbatim. NEVER swallowed.
      await deps.db.insert(operationOutcomes).values({
        stagedOperationId: op.id, status: "failed",
        payload: null, error: surfaceError(cause), executedAt,
      });
      await deps.db.update(stagedOperations).set({ status: "failed" })
        .where(eq(stagedOperations.id, op.id));
    }
    deps.eventBus.emit({ type: "operation_executed", streamId: subjectThreadId, /* ... */ });
  }
}
```

**Claim semantics — why two transitions, not one tx wrapping the tool call.** The tool call is an
external network side-effect; you cannot hold a DB transaction open across it. So the claim
(`pending → executing`) commits *first* and alone — that is the at-most-once gate. If the process
dies mid-dispatch, the op is left `executing` (a crash-recovery sweep is follow-on, out of AL7
scope — single staged op, no transactional rollback per WP "Out of scope"). The Outcome write +
`executing → executed|failed` is the second commit. This is the standard claim-then-act durable-job
pattern; it is correct for at-most-once because re-entry can never re-claim a non-`pending` row.

⚠️ UNVERIFIED (mirror of an in-repo verified pattern): the `.update(...).where(...).returning(...)`
+ `length` check is already the proven first-verdict-wins idiom in `threads.ts:1290` (the `.changes`
→ `.returning()` switch is documented there as the PGlite-compat fix). AL7 copies it verbatim — no
new Drizzle API surface.

## 5. Wiring into the verdict path

`createThreadRoutes(db, eventBus, assistantTurnDeps?, dispatchDeps?)` gains a 4th optional dep,
following the **exact** `assistantTurnDeps` precedent (concept-faithful: optional → no-op in unit
tests; the live server boot supplies it). In the verdict branch, after the resolution transaction
commits and `thread_resolved` is emitted (threads.ts ~line 1364), and **only** for an approving
decision:

```ts
if (input.type === "verdict" && resolvesMessageRow) {
  eventBus.emit(resolvedEvent);
  const decision = input.payload.decision;
  if (dispatchDeps && (decision === "approve" || decision === "approve-with-comments")) {
    void resolveStagedOperations(dispatchDeps, threadId)
      .catch((e) => /* observability adapter; never throw into the response */);
  }
}
```

- **Approving decisions only** (`approve` / `approve-with-comments`) trigger dispatch; the other
  three (`request-changes` / `edit` / `reject`) leave staged ops `pending` and untouched — they are
  effectively `held` for this resolution (concept lifecycle). No `held` status write is needed: a
  non-approving verdict simply does not dispatch, and a later re-open + approve can still claim the
  still-`pending` row. (`held` in the concept is the *conceptual* terminal-for-this-resolution
  label; the column value stays `pending` so a re-open can legitimately re-enter — matching the
  concept's "may re-enter executing only if never reached executing/executed".)
- Fire-and-forget after the response, like `runAssistantTurn` — the POST returns 201; the Outcome
  arrives via the reviews loader / event. Execution failure is captured as a `failed` Outcome, not
  thrown into the HTTP response (rule #8 — surfaces on the canvas, not as an API 500).

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
   real loop proof picks the cheapest-to-exercise irreversible verb. If a live GitHub credential is
   unavailable in the build env, the real path proof falls back to a recorded/contract test against
   the forge client and the *fixture* tool carries the live at-most-once proof. Raised for the
   builder; does not change the schema or dispatch path.

## 7. UI wiring (Human Interface)

- `ReviewActionOperation` already extended (design): optional `status` + `outcome` props render the
  Outcome band. Build task: thread the staged op's `status` + its `OperationOutcome` from the
  reviews loader through `ReviewComposition` → the canvas. The reviews loader
  (`packages/server/src/routes/reviews.ts`, today a fixture stub) gains the staged-op + outcome rows
  for the Subject in its response shape.
- Build also wires the transient `executing` state (spinner) the design deliberately omitted (states
  empty/loading are build concerns) — the design covers only the terminal `executed`/`failed` bands.

## 8. Acceptance-criteria → verification map

| AC (from TRACK-AL.md) | Verification | Where |
|---|---|---|
| Approving a Subject with a staged op executes it through the tool, without leaving the review | integration test: post approve verdict → assert `executeCapability` invoked + `status='executed'` + Outcome `ok` row | `staged-operation-dispatcher.integration.test.ts` |
| Non-approving verdict does not execute; op stays pending | integration test: post `request-changes` → assert `executeCapability` NOT called, row still `pending`, no Outcome | same |
| After execution, result (ok/failure) returns + visible against the review | integration test: assert Outcome row written + reviews loader returns it; component test: canvas renders Executed/Failed band from props | dispatcher test + `ReviewActionOperation.test.tsx` |
| At-most-once: re-open/re-show does not double-execute | integration test: call `resolveStagedOperations` twice → assert `executeCapability` called exactly once, `status='executed'`, one Outcome row | dispatcher test (the claim-returns-0 path) |
| A staged op never approved is never executed | integration test: stage op, post non-approving verdict (or never resolve) → assert no Outcome, `executeCapability` not called | dispatcher test |
| Descriptive artifacts do not execute on approve; only operative do | integration test: Subject with only a `code_diff` artifact (no staged op row) → approve → `executeCapability` not called. Operative = "has a staged_operations row"; descriptive = none | dispatcher test |
| At-most-once is idempotent per approval (constraint) | unit test: two concurrent claims on one `pending` row → exactly one returns rows; UNIQUE on idempotencyKey rejects duplicate stage | dispatcher unit test + `stage-operation.test.ts` |
| Verdict grammar unchanged (constraint) | type test / no change to `VERDICT_DECISIONS`; ESLint/`tsc` — no new verdict decision added | `npm run check` (the tuple is untouched) |
| Execution failure surfaces, never swallowed (constraint) | integration test: `executeCapability` throws → assert `failed` Outcome with the error string, `status='failed'`, no exception thrown into the HTTP response | dispatcher test |
| No bypass of the human gate (constraint) | static: `stage_operation` is the only agent-facing tool; the dispatcher is NOT in `ALL_TOOL_DEFINITIONS` → unreachable from `buildToolRegistry`. Unit test asserts `toolsForRole(role)` never contains an execute verb for any role | `tool-registry.test.ts` |
| Spec immutable once staged / approved spec is what executes (constraint) | unit test: dispatcher reads params from the row, no rebind; `params` written once at stage, never updated | dispatcher unit test |

All runtime ACs → integration/component/unit tests through imports (per CLAUDE.md). The two static
properties (grammar unchanged; dispatcher not agent-reachable) → type system + a registry unit test,
not file-grepping.

## 9. Ordered build tasks

1. Schema: add `stagedOperations` + `operationOutcomes`; `db:generate` + `db:migrate`. Add
   `STAGED_OPERATION_STATUSES` / `OPERATION_OUTCOME_STATUSES` const tuples + the
   `StagedOperationSpec` / `OperationOutcome` types in `@hyperidle/shared`.
2. Red tests for every runtime AC (dispatcher integration + stage-tool + registry unit) — TDD.
3. `stage-operation.ts` tool + register in `ALL_TOOL_DEFINITIONS`.
4. `staged-operation-dispatcher.ts`: `resolveStagedOperations` (claim → dispatch → Outcome) +
   `executeCapability` map (fixture tool + GitHub merge path).
5. Wire `dispatchDeps` into `createThreadRoutes` + the verdict branch (approving decisions only).
6. Reviews loader: return staged-op `status` + `OperationOutcome` for the Subject.
7. UI: thread `status`/`outcome` through `ReviewComposition` → `ReviewActionOperation` (band already
   built); wire the `executing` transient.
8. Green: implementation to pass red tests; re-bless the DOM-snapshot net for the new
   ReviewActionOperation stories (builder, not designer).

## 10. What this plan deliberately does NOT build (scope discipline)

- Broad per-tool dispatch coverage — AL8 (`executeCapability` is a 2-entry map here, open by design).
- Harness return-enforcement — AL6.
- Multi-step transactional rollback / crash-recovery sweep for stranded `executing` rows — out of
  scope (single staged op, its own undo only).
- The graduated-autonomy auto-flow path (reversible consequences flowing without a review) — read
  from the existing `user_skills.autonomyLevel`, not redefined; AL7's loop is the *gated* arm only.
- A policy engine / thresholds / allowlists — explicitly rejected by the concept (enterprise smell).
