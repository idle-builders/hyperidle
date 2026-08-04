# AU27 — Architecture critique, **round 2 of max 3** (against `architecture.md` **rev 3** + `feasibility.md` **rev 2**)

**Reviewer:** independent evaluator (not the producer). **Base:** `origin/main@75d85687`, read in
`.worktrees/pipeline-AU27`. **Contract:** `plan.md` as amended 2026-08-04 (AMD-1 / AMD-2 / AMD-3), 9 ACs.

Every file:line below was opened on this pass. Round-1 findings are re-adjudicated in §5 (CLOSED / OPEN), and
five new findings are raised against what rev 3 added.

**Headline.** Rev 3 genuinely closes C1, C2, C5, C6 and eight of ten WARNINGs, with real source work behind each.
It is a materially better plan. But AMD-3 — the founder amendment that drove the L→XL jump — is implemented
against a **false premise about how threads are identified in this codebase**, and that single error generates
the migration, the NOT NULL constraint, the `knowledge_items` column, the desktop-upgrade smoke, the
"find every task-creation path" risk, and most of the new effort. It is the highest-value thing to fix, and
fixing it makes the WP *smaller*, not larger.

---

## 0. Verified correct (spot-checked at source, not taken on trust)

| Rev-3 claim | Verdict |
|---|---|
| `create_bet` fix: `teamMembers.teamId → teams.id .notNull()` (`schema.ts:107-109`); `getTeamMembers(db,{id})` (`org/src/team-lookup.ts:113-135`); `users.teamId → teamMembers.id` (`schema.ts:58`); `tasks.teamId → teams.id` (`schema.ts:189-193`) | ✅ all four — baking `callingTeamId` yields a real `teams.id` |
| The latent id-space defect is real: `ctx.teamId` is consumed as a `teams.id` at `tool-definitions.ts:238-241` (`??`-fused with a genuine `task.teamId`, then used as a `product` `scopeId`) and `:426` (`resolveReviewRecipientsForItem`) | ✅ real; NOT repurposing it is the right call |
| `resolveModel({kind:"agent", modelId, modelProvider, tierFallback})` already exists (`shared/src/model-gateway.ts:327-348`), and `modelId === null` falls through to the tier | ✅ exact |
| `resolvedFastModel` is unwired on the durable drain (`start-runtime.ts:127` is `deps.resolveModel?.(tier)`, tier-only) | ✅ |
| `CompletionEvent.toolCalls` is **builtin-only** — populated solely at `builtin-harness-adapter.ts:607`, inside `runChatTurn` | ✅ |
| The **six** force/adjudication sites, complete: `builtin:581` (synthetic gate, gated by `hasReturnActionInRegistry:579`), `builtin:751` (synthetic gate, **not** gated), `mcp-route:140`, `cli-harness-adapter:773`, `return-status-tool:72`, `run-orchestration-composition:125` vs port type `provisioner.ts:210`. A full non-test sweep of `shouldForceReturn|createGate|createReturnGate` returns exactly these plus two barrel re-exports — **no seventh site** | ✅ complete |
| Both builtin sites build a *synthetic* gate literal `{ returned: session.returnSeen }`, so a closure-held predicate cannot reach them | ✅ verified at `:581` and `:751` |
| Migration workflow correction — `0043`–`0054` are hand-authored; `npm run db:generate` is not the path; stated verbatim in `0053_AU21_remove_bet_decomposition.sql:6-8` and `0051:4-7`; journal ends at `idx 54` | ✅ verbatim, exactly as claimed |
| AMD-2 cheapness claim, re-run with `rg -a` (the hazard CLAUDE.md warns about): **exactly one** production marker annotation — `remote-worker/src/remote-worker-client.ts:223`; 13 occurrences in `no-ungated-stream-drain.ts`, 12 in its test. Allowlist holds **8** `AL6-*` rows at `scripts/test-naming-guard.allowlist.json:3-7,27,57,58`. 373 total `AL6` occurrences | ✅ all four lockstep pairs confirmed |
| Sole production task-creation call site: `work.create(db,"task",…)` appears **once** (`routes/tasks.ts:111`); the `create_task` tool routes through `CoreApiPort.createTask` → that route (`tool-definitions.ts:574`); decomposition genuinely removed by `0053`; non-route inserts `demo-fixture.ts:134`, `eval/seeding.ts:187` | ✅ enumeration correct |
| `persistTurnFailureInternal`'s callers are all inside `dispatch` (`service.ts:233,241,403,411,420`) ⇒ AMD-1's subtraction is safe | ✅ |
| Assistant self-retrigger is structurally impossible: `recordsAssistantIntent` requires `!senderId.startsWith("ast-")` (`routes/threads.ts:1452-1455`) | ✅ Decision 1's no-`threadId`-argument reasoning holds |
| §4's per-area rows sum to **exactly 52** (9+4+5+3+8+6+10+2+3+1+1) | ✅ the arithmetic was checked this time |

---

## 1. Per-dimension scores (rev 2 → rev 3)

| # | Dimension | Rev 2 | Rev 3 | Why |
|---|---|---|---|---|
| 1 | Source grounding | 7 | **9** | Every corrected line ref checks out; `rg -a` used where it mattered; the migration-workflow correction is verbatim-accurate. |
| 2 | Requirement coverage (9 ACs) | 6 | **7** | All ACs mapped with a method; AC-0's type-level device is mechanically sound. AC-0 itself is aimed at the wrong target (C7/C8). |
| 3 | Boundary / architecture fit | 6 | **6** | `reply`-through-the-seam and the `dispatch` deletion move toward the should-graph. But Decision 0.1 puts a `threads` write inside `@hyperidle/knowledge` with no ownership-compliant mechanism (C10). |
| 4 | Decomposition / increments | 6 | **7** | Inc 4a/4b split is right; deletion-after-replacement ordering is right. Inc 0 is a large, wrong-premise increment; Inc 3 omits two edit sites (W12/W15). |
| 5 | Risk analysis | 6 | **8** | R1-R12 are real and honestly stated; R10/R11 name the migration and the product-visibility change. Misses C11. |
| 6 | Test strategy / proof | 7 | **8** | Sanity-break discipline named per assertion; the pre-migration-shape test is the right instinct; N6/N7 lane honesty is exemplary. |
| 7 | Migration & data safety | — | **6** | Ordering, adopt-guard, idempotency, PGlite note and real-data smoke are all correct *given* the migration is needed. It is not (C8), and the constraint's test blast radius is uncounted (C9). |
| 8 | Scope discipline | 5 | **6** | AMD-1 struck cleanly and completely. AMD-3 was folded in by *maximising* it rather than by finding the cheapest true closure. |
| 9 | Effort honesty | 4 | **6** | L→XL correction is the right direction and honestly flagged; §4 sums correctly. Still contradicted by §13 and understated ~4x on tests (C9/W14). |
| 10 | Deletion safety | 7 | **8** | W4's missed consumers all assigned; knip watch list is real. |
| 11 | Reviewability / actionability | 7 | **8** | The finding index and revision log make verification cheap. Two internal self-contradictions remain (C12, W13). |

**Weighted: 7.1 / 10** (rev 2: 6.2). Better, and still not buildable as written.

---

## 2. CRITICAL findings

### C7 — AMD-3's `knowledge_item` = **FIX** verdict is factually wrong. A thread host does not need an FK column, and knowledge items demonstrably have working conversations today.

**Rev 3 says** (`architecture.md:227`): `knowledge_item` ❌ "**no `threadId` column at all** (`schema.ts:863-890`)" ⇒ **FIX — founder-named**, driving a new `knowledge_items.threadId … .notNull()` column, its half of migration `0055`, and half of Inc 0.

**Source says thread identity is `(hostKind, hostId)`, not a column on the host:**
- `GET /api/threads?host_kind=…&host_id=…` → `listThreads(db, { host: { kind, id }, … })` — `routes/threads.ts:880-886`.
- Index `threads_host_idx` on `(hostKind, hostId, lastActiveAt)` — `schema.ts:739`.
- `resolveOrCreateHostThread(hostKind, hostId, founderId, agentParticipantId)` — `web/src/services/host-threads.ts:35-77`: GET by host, else `POST /api/threads` with an initial "Thread started." message. Generic over **all 8** `HOST_KINDS` (`shared/src/thread.ts:19-28`).
- `POST /api/threads` writes `hostKind`/`hostId` and nothing else host-side — `routes/threads.ts:736-746`.

**And knowledge items already have real, shipped conversations:**
- `KnowledgeDetail.tsx:588` — `useHostThread("knowledge_item", item.id)`.
- `KnowledgeDetail.tsx:998` — `<HostThreadSection hostKind="knowledge_item" …>`, which resolves via `resolveOrCreateHostThread` (`HostThreadSection.tsx:180-183`) and posts through `postPlainHostMessage`.
- `KnowledgeDetail.tsx:774` — block-anchored `hostKind: "knowledge_item"` post.
- The threads route even derives titles for `hostKind === "knowledge_item"` (`routes/threads.ts:571+`).

A **missing column is not a missing capability.** The audit asked "is the host guaranteed a thread?" and answered it by looking for an FK, which is not where the answer lives.

**Required change.** Reclassify `knowledge_item` as **PASSES** (same basis as `user`). Delete from the plan: the
`knowledge_items.threadId` column, its `.notNull()`, its `ADD COLUMN`/backfill/`SET NOT NULL` block in `0055`,
the `knowledge-repository.ts:264,1431` edits, `factory-bootstrap.ts:223`, `eval/seeding.ts:229`, and the knowledge
half of Inc 0's test. If the founder still wants an eager thread row per knowledge item, that is a *product*
question about what appears in conversation lists — raise it in Inc 8 with the other five, do not encode it as a
schema constraint.

---

### C8 — `tasks.threadId` is a **denormalized cache**, and rev 3 proposes to promote the cache to source of truth. The WP's real requirement is satisfiable with **zero schema change**.

**The plan's own feasibility says this, verbatim** (`feasibility.md:258-260`):
> "**The canonical task thread is not the FK column** — it is `threads.hostKind = "task" AND hostId = task.id`
> (`routes/threads.ts:563`; `session-review-creator.ts:70-82` creates exactly that shape and then back-fills the
> column as a cache)."

…and `feasibility.md:262-266` + verdict item 5 (`:310-311`) recommend **find-or-create at emit**. Architecture rev 3
does the opposite without addressing the contradiction (see W13).

**Every production reader of `tasks.threadId` — exhaustive:**
| Site | Shape |
|---|---|
| `review/src/session-review-creator.ts:68` | `let threadId = task.threadId; if (!threadId) { … create … }` — find-or-create already |
| `policy/src/handoff-protocol.ts:265,283` | `if (task.threadId) { … }` — null-guarded |
| `work/src/work-service.ts:377` | column projection |

**Nothing requires it to be non-null.** The UI never reads it — `WorkTask.tsx:330` renders
`<HostThreadSection hostKind="task" hostId={taskId}>`, i.e. the host lookup, exactly like knowledge and bets.

**What AU27 actually needs** is that `callingThreadId` be **bakeable at emit**. That is one core-side
resolve-or-create against `(hostKind:"task", hostId:task.id)` inside the resolver — and the repo already has the
exact idiom: `TaskRunResolverDeps` (`work/src/task-run-resolver.ts:37-60`) is a Mechanism-C injected-dep bag whose
own `@lore` states `@hyperidle/work`'s `package.json` depends only on `@hyperidle/db` + `@hyperidle/shared` and
must never import a sibling Service. Add
`resolveOrCreateHostThread?(db, hostKind, hostId, initiatorId): Promise<string>` to that bag (implemented by
`@hyperidle/conversation`, wired at the composition root beside the four deps already wired at
`routes/threads.ts:1483-1491`), bake the result at `task-run-resolver.ts:255-268`, same for
`session-start-resolver` and `proposed-call-workflow`.

**This is AU21-compliant:** the write is core-side at emit; orchestration still reads nothing on the run path
(AU21 AC #2 untouched — the guard only inspects `agent-orchestration → core-api` edges,
`composition-edge-anti-regrowth-guard.ts:455-478`).

**What it deletes from the plan:** migration `0055` entirely, the `NOT EXISTS` adopt guard, the `SET NOT NULL`, the
PGlite-`pgcrypto` question, the real-data desktop-upgrade smoke, R10, the "a missed creation path means inserts
start failing in production" risk, C9's test churn, and most of the L→XL jump.

**If the planner wants to keep eager creation**, the *cheap* version is: create the `hostKind:"task"` thread in
`routes/tasks.ts:111`'s handler via the already-precedented `insertThread` import from `@hyperidle/conversation`
(`routes/knowledge.ts:26`, `routes/assistant.ts:18`, `routes/teams-routes.ts:21` all do this) — **without** touching
the column, **without** NOT NULL, and **without** a migration. Existing tasks are covered by resolve-or-create.
That satisfies "each task must have a thread by definition" for every task created from now on, at ~15 lines.

**Required change.** Drop the `tasks.threadId` NOT NULL + backfill + migration. Replace Inc 0 with (a) eager
thread creation at `routes/tasks.ts:111` via `@hyperidle/conversation`'s `insertThread`, and (b) a resolver-side
resolve-or-create injected dep that bakes `callingThreadId`. If you believe the constraint is nonetheless
required, the plan must state a **read path that cannot afford the `(hostKind,hostId)` lookup** or an
**emit-time constraint forbidding the write** — neither exists in the source I read.

---

### C9 — The NOT NULL blast radius is undercounted by ~4×: it breaks **128 test files**, and §4 does not count one of them.

Measured on this tree:

| Constraint | Insert sites | Distinct test files |
|---|---|---|
| `tasks.threadId` NOT NULL | **145** `db.insert(tasks)` in tests | **91** |
| `knowledge_items.threadId` NOT NULL | **64** `db.insert(knowledgeItems)` in tests | **37** |

These are `*.integration.test.ts` against a real PGlite DB — every one fails with a NOT NULL violation at insert
unless it is edited to create a thread first. §4 claims "**Tests / fixtures: 31** … **Total ≈ 95**". The dominant
cost item in the WP is absent from the count that exists specifically to prevent that.

This also makes the XL (~8-11d) estimate unreliable in the same direction rev 2's W4 flagged: not a number that is
too small, a number produced without looking.

**Required change.** Either accept C7+C8 (the count becomes moot — no constraint, no churn), or re-derive §4 and
§13 with the 128 files counted and re-size accordingly. Do not ship a third estimate.

---

### C10 — Decision 0.1's knowledge half has **no ownership-compliant mechanism**, and its "no caller changes" claim is false. (Moot if C7 is accepted; blocking if any of it survives.)

`architecture.md:144,253` asserts: *"Callers `routes/knowledge.ts:585` and `routes/bets.ts:946` need no change
**because the owning Service creates the thread** — that is the design: no caller can forget."*

- `knowledge-repository.create` is `(db, input, options)` — **no ports bag** (`knowledge-repository.ts:254-258`).
- `@hyperidle/knowledge`'s `package.json` dependencies are exactly `@hyperidle/db`, `@hyperidle/shared`,
  `drizzle-orm` — no `@hyperidle/conversation`.
- `threads` is owned by `@hyperidle/conversation` (AU12). The founder's rule has **zero exceptions**, and it covers
  reads *and* writes.
- Mechanism C forbids a Service importing a sibling Service even in the same Layer — stated in-tree at
  `shared/src/harness/enforcement-registry.ts:11-19`.

So the repository can only do this by (a) a raw `db.insert(threads)` — an ownership violation; (b) importing
`@hyperidle/conversation` — a Mechanism-C violation; or (c) taking a new injected dep — which **changes every
caller**, refuting the quoted claim. And a **third caller is unassigned**: `server-factory.ts:1025`
(`create: createKnowledgeItem`, the port binding through which agent tools create knowledge items). §4's Inc-0 row
lists neither it nor any composition wiring.

**Required change.** Delete the knowledge half (C7). If retained: name mechanism (c) explicitly, list all three
callers plus the composition-root wiring, and state which package owns the `threads` write.

---

### C11 — Decision 7 converts a working per-agent setting into an **unbounded re-claim loop** for the five non-assistant kinds.

`resolveModel({kind:"agent", …})` **throws** `UnsupportedAgentProviderError` when
`modelProvider === "openai-compatible"` (`model-gateway.ts:315-317`, enforced at `:338-343` via
`resolveProvider(..., { agentPath: true })`). `openai-compatible` is a **selectable per-agent provider** in the UI
(`web/src/settings/AgentEditor.tsx:116` reads `descriptor.modelProviders`; fixtures list
`["anthropic","openrouter","openai-compatible"]`, e.g. `AgentEditor.stories.tsx:52`).

Today the durable drain never takes the agent shape — `start-runtime.ts:127` is `deps.resolveModel?.(tier)`,
tier-only — so such an agent runs fine on the tier model. Decision 7 makes the drain issue `{kind:"agent"}` for
**all six kinds**, so that agent now **throws at `:127`**. And `plan.md`'s *Out of scope* (c) explicitly accepts,
unbounded, that a throw at `:127` escapes `runClaimedRequest`, leaves the row `claimed`, and re-claims forever.
Decision 7 is presented as pure upside ("Every kind gains the override"); it in fact widens the population of the
one defect the WP knowingly leaves unbounded, from assistant-only to `task_run` as well.

**Required change.** In Decision 7, state the fallback: the durable drain resolves the agent shape and treats
`UnsupportedAgentProviderError` as *fall back to the tier* (preserving today's behaviour for every non-assistant
kind), **or** bakes `modelId` only when the provider is agent-path-supported. Add a test for an
`openai-compatible` agent on a `task_run`: it resolves to the tier model, no throw.

---

### C12 — C3 stays **OPEN**. The proposed follow-up does not work as described, and the header contradicts §4.

Three separate problems:

**(a) The `refs` claim is false as stated.** `renderRefEmbedsForAssistant` filters
`refs.filter((r): r is BlockRef => r.kind === "block")` and renders `BlockRefEmbed`
(`AssistantOverlay.tsx:189+`). A bet reference is an `EntityRef { kind: "bet", id }`
(`shared/src/thread.ts:111-114`) — it renders **nothing** in the overlay. So *"a `reply` that references the bet
renders via `AssistantOverlay`'s existing `refs` embeds"* (`architecture.md:550-553`, `feasibility.md:290-293`) is
wrong on the ref kind, and there is no BetCard on the entity-ref path.

**(b) Nothing would produce the ref anyway.** Decision 1's `reply` posts
`payload: { text: parsed.data.text }` — no `refs` field. Server-side enrichment
(`routes/threads.ts:1440-1446`) enriches *supplied* refs and `@`-mentions; it does not mine bet references out of
prose. So the "existing generic ref mechanism" has no input.

**(c) The plan contradicts itself on whether UI is touched.** `architecture.md:4`:
*"**Type:** backend + one DB migration; **no UI file is edited**."* §4's `web` row: *"`src/shell/AssistantOverlay.tsx`
(Decision 8 — delete two dead branches)"*. And `plan.md:35` carries the founder constraint *"The UI's assistant
rendering … is unchanged — this is backend-only."*

Rev 3 documents the loss honestly (that is real progress over rev 2), but honest documentation of a user-facing
subtraction is not compliance with a constraint that forbids it. Per the round-2 brief: an unmitigated regression
stays CRITICAL.

**Required change — pick one and write it down:**
1. **Mitigate in-WP (cheap, uniform, ~30 lines).** Give `reply` an optional `refs` argument — the port already
   takes `payload: Record<string, unknown>` (`tool-handlers/src/ports.ts:263-271`), so no new port — and extend
   `renderRefEmbedsForAssistant` to render `EntityRef {kind:"bet"}` through the `BetCard` the overlay already
   builds (`AssistantOverlay.tsx:140-150`). Works on **every** harness, unlike today's builtin-only `toolCalls`
   path. This turns the regression into an upgrade and satisfies `plan.md:35` in substance.
2. **Get the loss explicitly signed off** as a fourth founder amendment in `plan.md` (same shape as AMD-1),
   *before* build — and delete the false `refs` follow-up sentence from both artifacts either way.

---

## 3. WARNING findings

### W11 — The required set cannot physically reach the two builtin sites; the plumbing channel is unnamed.
Decision 4 says *"pass the entry's set; apply it to `session.returnSeen`"*. But `BuiltinSession`
(`builtin-harness-adapter.ts:80-99`) carries only `returnSeen`/`forceCount`, and the adapter has **no access to the
enforcement registry** (verified: no `enforcementRegistry` reference in the file). The set must therefore ride a new
field on `SessionConfig` (`shared/src/harness/harness-adapter.ts`) → `BuiltinSession` → the `isReturnAction` check at
`:836-838`. Neither `SessionConfig` nor `:836` appears in Inc 3's file list. `SessionConfig` is a cross-process
seam type shared with `cli-harness-adapter` and `HarnessPort` — precisely the kind of edit that must be planned,
not improvised. **Required:** name the channel and add both files to Inc 3.

### W12 — The static force message at builtin **site 1** (`:592`) is unlisted.
Both builtin loops inject the computed `forceMsg` into `session.messages` but emit the **static**
`AL6_FORCE_RETURN_MESSAGE` as the completion event — `:592` (chat) and `:763` (execute). Decision 4's table names
only site 2's static emit. AC-8 requires the message to name the needed action, and Inc 7 proves it on the
real-harness lane by reading the stream, which carries the static string. **Required:** add `:592` to Inc 3.

### W13 — `feasibility.md` rev 2 was not re-synced with AMD-3 and now contradicts the architecture.
`feasibility.md:262-266` and verdict item 5 (`:310-311`) instruct *"find-or-create the canonical `hostKind:"task"`
thread **at emit**"*; `architecture.md` Decision 0 does creation-time + backfill + NOT NULL instead. A builder
reading both gets two incompatible designs. (The irony: feasibility is the correct one — see C8.) **Required:**
re-sync feasibility, or mark item 5 superseded with the reason.

### W14 — §13 introduces a third file count.
§4: 52 production + 31 test + 12 new ≈ **95**. §13: *"~89 files touched"*. Rev 2's W4 was exactly this class of
error. All three numbers are wrong under C9. **Required:** one number, derived once, after C7/C8 land.

### W15 — Inc 3 omits the `createReturnGate` **call** site.
`provisioner.ts:1269` (`const returnGate = ports.harnessRuntime.createReturnGate();`) is where the per-session set
is actually passed; Inc 3 lists only the port *type* (`:210`) and the composition binding (`:125`). The
`registry.register(...)` site that must carry `requiredReturnActions` (`provisioner.ts:1381-1385`) is likewise
unlisted. **Required:** add both.

### W16 — This is an XL work package with an obvious three-way seam. Split it.
Even after C7/C8 shrink it, three independent deliverables are bundled:
1. **Additive capability (Inc 1-4)** — `reply` + `ToolContext.threadId`/`callingTeamId` + the return-gate
   adjustment. Shippable alone; valuable alone (every agent kind gains a reply channel); nothing is deleted.
2. **The switchover + demolition (Inc 5-7)** — collapse the execution entry, delete `conversational` + the
   `dispatch` package + the dead UI branches. Irreversible, and the only genuinely risky half.
3. **The AL6 rename (Inc 9)** — mechanical, zero coupling to either, guarded by its own lint script.

The architecture **already identifies this seam** and then ignores it (§9: *"Inc 5 is the single switchover commit;
0-4 are inert additions that survive a revert of it"*). Repo memory says a single L work package already exceeds
one builder session (`project_builder_green_phase_timeout`) and that real scope has run 2.6× spec
(`project_au18_notification_settings_ownership_shipped`). **Required:** land (1) and (3) as their own PRs; keep
(2) as AU27 proper. If the founder wants one PR, say so explicitly with that risk named.

---

## 4. NOTE findings

- **N9.** AC-0's type-level device is mechanically sound — `NewTask = typeof tasks.$inferInsert`
  (`schema.ts:1600`), so `.notNull()` without a default does make `threadId` required. What it would actually
  catch is C9's 145 test call sites.
- **N10.** If any migration survives the C7/C8 rework, the SQL idiom is right: the `INSERT` covers every NOT NULL
  column on `threads` (`schema.ts:712-737` — `pinned` has a default, `direct_key`/`resolved_at` are nullable),
  `initiator_id` has **no FK**, so the `'u-founder'` sentinel cannot violate one, and thread ids are bare
  `crypto.randomUUID()` (`routes/threads.ts:736`), so `gen_random_uuid()::text` matches the convention. The
  backfill-then-constrain ordering, `NOT EXISTS` adopt guard, and idempotency reasoning are all correct.
- **N11.** The `ctx.teamId` fence is correct but lives in a doc comment on a *new* field. The next reader meets the
  hazard at the *consumption* sites. Put the same `@lore` at `tool-definitions.ts:239` and `:426`.
- **N12.** Decision 7 restores the per-agent override end to end (bake `modelId` → `{kind:"agent"}` →
  `tierFallback` for `null`), and `resolvedFastModel` is a genuine catch — **except** C11.
- **N13.** AC-9 as a repo guard script (`scripts/al6-naming-guard.ts` in `npm run lint`, matching
  `composition-edge-anti-regrowth-guard.ts` / `honest-harness-guard.ts`) is the right instrument, and *not* a
  `readFileSync` test. The `@lore <WP-ID>` exclusion (Q4) is correct, not a dodge — `@lore AL6 v2:` is the same
  shape as `@lore AU21`/`@lore AK4` used repo-wide.
- **N14.** AMD-1's sweep is clean: no struck work survives in §4/§6/§7/§8/§11; §8 marks AC-6 struck rather than
  silently deleting the row; no remaining increment depends on it.
- **N15.** C5's six-site table is **complete** — an independent non-test sweep found no seventh site.
- **N16.** `user`/chat "passes tautologically" is sound — but for a *stronger* reason than the plan gives. It
  passes because thread identity is `(hostKind, hostId)`, which is true of **all eight** hosts. Under that reading
  "leave 5 hosts lazy" is not a compromise; it *is* the architecture, and the founder's *"any task, knowledge, chat
  is a thread"* is already structurally true — every host is addressable as a thread, on demand, by construction.
  Inc 8 should say that, rather than presenting five ❌ rows with a recommendation to tolerate them.
- **N17.** Decision 9's tool-surface expansion (3 → ~17) and the W8 AL7 analysis both hold; the "HIGH RISK:
  requires human approval" reword in `create_bet`'s description (`tool-definitions.ts:1116-1117`) is a good catch.
- **N18.** `insertMessage`'s port takes `payload: Record<string, unknown>` (`tool-handlers/src/ports.ts:263-271`),
  so C12's mitigation (1) needs **no new port** — relevant to costing it.
- **N19.** Inc 5's `completion: "admit"` detach analysis and the poll-don't-await test guidance are correct
  (`start-runtime.ts:134`; route fire-and-forget since AU9, `routes/threads.ts:1557-1561`).

---

## 5. Rev-2 findings: CLOSED vs OPEN

| Finding | Status | Basis |
|---|---|---|
| **C1** create_bet unusable | **CLOSED** | `callingTeamId` bake verified sound end to end (§0); three seam reads genuinely deleted, not relocated; the latent `ctx.teamId` id-space defect is real, correctly diagnosed, and correctly left alone (see N11 for the one improvement). |
| **C2** model override dropped | **CLOSED (with C11 attached)** | `{kind:"agent"}` shape verified at `model-gateway.ts:327-348`; `resolvedFastModel` wired; gateway-config improvement real. New defect C11 arises from the *uniform-for-all-kinds* choice. |
| **C3** assistant UI regression | **OPEN → C12** | Loss now admitted, which is progress; but the follow-up shape is unverified and wrong (ref kind + no ref producer), and the plan self-contradicts on whether UI is edited. |
| **C4** `tasks.threadId` null at run time | **OPEN → C7/C8** | Superseded by AMD-3, then implemented against a false premise. The underlying defect (reply inert for `task_run`) is closable with zero schema change. |
| **C5** gate reaches 3 of 6 | **CLOSED** | Six-site table verified complete and correct, including the synthetic-gate asymmetry and the `hasReturnActionInRegistry` asymmetry. W11/W12/W15 are residual wiring detail, not a re-opening. |
| **C6** out-of-scope entanglement | **CLOSED** | Inc 4a/4b split; struck rows marked, not dropped; no surviving dependency on struck work (`persistTurnFailureInternal` verified caller-complete). |
| **A1** AL6 purge missing | **CLOSED** | Decision 10 + Inc 9; `rg -a` claim independently reproduced; four lockstep pairs and the 8-row allowlist confirmed; enforcement instrument correct. |
| **W1** singular required action | **CLOSED** | Set-valued `requiredReturnActions`; Q1/R5 genuinely closed by the `taskId != null` exclusion, and `params.taskId` is `string | null` (`provisioner.ts:732`), so `== null` is sound. |
| **W2** `resolvedFastModel` | **CLOSED** | Decision 7.3. |
| **W3** re-claim loop | **CLOSED as recorded** | Named in `plan.md` *Out of scope* (c) with reasoning. **But C11 widens its population** — that part is new. |
| **W4** file count | **PARTIALLY CLOSED → W14/C9** | §4 now sums to 52 exactly and the missed consumers are assigned; §13 contradicts it, and tests are undercounted ~4×. |
| **W5** AC-4 instrument | **CLOSED** | `check` + `knip`; the surviving `builtin-harness-adapter.ts:397` chat fork is disclosed in the AC table, keyed on generic input. |
| **W6** `session_not_returned` scoping | **CLOSED** | `callingThreadId?` on the event; absent → no-op; ordered after the switchover. |
| **W7** `DEFERRED_FOLLOWUP` | **CLOSED** | Zero-new-entries is an explicit AC-2b constraint; the set is genuinely `new Set([])` (`composition-edge-anti-regrowth-guard.ts:417`). |
| **W8** AL7 / reversibility | **CLOSED** | `sessionWorkflow` present only for the AL7 two-session flow; assistant bet-drafting is not gated. |
| **W9** hollow AC-5 proof | **CLOSED** | Durable-lifecycle assertion + sanity-break. |
| **W10** tool-surface expansion | **CLOSED** | Decision 9 + R12. |
| **N1-N8** | **ALL CLOSED** | Each addressed at the cited site; N1's `agent-scaffold.ts:77-86` and N3's `APP_ASSISTANT_SYSTEM_PROMPT` corrections are right. |

---

## 6. Corrective-closure rule (`.pipeline/AU.md:9`) vs `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`

Re-applied. **No forbidden edge is introduced; AU27 moves toward the should graph.**

- *"Agent layer modules must not own Work, Conversation, Knowledge, Users, or Settings CRUD"* (`:303`) — the
  `reply` tool writes through `CoreApiPort.insertMessage` → `POST /threads/:id/messages`, the same route a human
  uses. Deleting `dispatch`'s orchestration-side `ports.conversation.insertMessage` write **removes** an
  existing violation-shaped edge. ✅
- *Conversation Service — "Must not own: Assistant provisioning"* (`:116`) — deleting `dispatch-bindings.ts`,
  `routines.ts:24`'s `dispatchOps` re-export and `core-api/package.json:27` removes core-api's last
  assistant-provisioning surface. ✅
- **One caution, not a violation:** C10's `@hyperidle/knowledge → threads` write would create a new core-internal
  Service-owns-another-Service's-table edge. It is not an `agent-orchestration → core-api` edge, so the mechanical
  guard would not catch it — the same "guard classifies by kind, not purpose" blind spot AU21's Decision K1
  recorded. Resolve it by construction (C7/C10), not by relying on the guard.

---

## 7. What must change before this plan is buildable

Precise, executable, no guessing required.

1. **C7** — `knowledge_item` → **PASSES**. Delete the `knowledge_items.threadId` column, its NOT NULL, its
   migration block, and the `knowledge-repository.ts:264,1431` / `factory-bootstrap.ts:223` /
   `eval/seeding.ts:229` edits from Inc 0 and §4.
2. **C8** — Delete migration `0055`, the `tasks.threadId` NOT NULL, the backfill, R10, and the desktop-upgrade
   smoke. Replace Inc 0 with: (a) eager `hostKind:"task"` thread creation in `routes/tasks.ts:111` via
   `insertThread` imported from `@hyperidle/conversation` (precedent: `routes/knowledge.ts:26`); (b)
   `resolveOrCreateHostThread` as an injected dep on `TaskRunResolverDeps` /
   `session-start-resolver` / `proposed-call-workflow`, baking `callingThreadId`. State in one line that thread
   identity is `(hostKind, hostId)` and the FK column is a cache, citing
   `web/src/services/host-threads.ts:35-77` + `routes/threads.ts:880-886` + `schema.ts:739`.
3. **C9/W14** — Re-derive the file count once, post-C7/C8, and give §4 and §13 the same number.
4. **C10** — Moot if C7 lands; otherwise name the ownership-compliant mechanism and all three callers incl.
   `server-factory.ts:1025`.
5. **C11** — Decision 7 must state the `UnsupportedAgentProviderError` → tier fallback (or provider-gated
   `modelId` bake) plus a `task_run` + `openai-compatible` test.
6. **C12** — Either add `reply(refs)` + an `EntityRef {kind:"bet"}` branch in
   `renderRefEmbedsForAssistant`, or record the loss as a fourth `plan.md` founder amendment. Delete the false
   "`refs` embeds already do this" sentence from `architecture.md:550-553` and `feasibility.md:290-293`, and
   reconcile `architecture.md:4` ("no UI file is edited") with §4's `web` row.
7. **W11/W12/W15** — Add to Inc 3: `SessionConfig` (`shared/src/harness/harness-adapter.ts`), `BuiltinSession` +
   `builtin-harness-adapter.ts:836-838`, the static emit at `:592`, `provisioner.ts:1269`, and
   `provisioner.ts:1381-1385`.
8. **W13** — Re-sync `feasibility.md` verdict item 5 with the final Decision 0.
9. **W16** — Split, or state explicitly why one PR is accepted.
10. **N16** — Reframe Inc 8: the five remaining hosts are not five failures to tolerate; lazy
    `(hostKind, hostId)` resolution is the architecture. Present it that way to the founder.

**Round 3 note.** Items 1, 2, 3 and 10 are one coherent rework of Inc 0 that makes the WP *smaller*. Items 5, 6, 7
are localized additions. Nothing here requires re-deriving the design frame — the rest of rev 3 is sound and
should not be touched.

VERDICT: REVISE
