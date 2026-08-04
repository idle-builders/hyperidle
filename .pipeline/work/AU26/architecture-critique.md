# Architecture Critique: AU26

ARCHITECTURE-SCORE: **6/10**  rounds=1  score-line: SA:7 IM:4 LI:5 AC:5 DM:7 N:9 MD:7 FMC:5 S:7 V:6 FE:7

**Verdict: REVISE.** The document is unusually well-evidenced and its sizing is honest, but the
Job-2 route split — the largest and highest-risk piece — rests on a route inventory that is wrong
on the load-bearing family, and the plan's own gate rule contradicts the plan's own placements. Two
further increments (D1's `sessions` conversion, D1's handoff change) are under-scoped against code.

Every claim below was re-traced independently with `rg -a` / an AST census on branch `pipeline/AU26`
(`f5fa535e`, base `origin/main` @ `75d85687`), and the Hono probe was re-run on the installed
`hono@4.12.30`.

---

## CRITICAL

### C1 · [§D-H site 14, §5, §12 B1a] `sessions-routes.ts` cannot move to `agent-orchestration` as specified — it imports three core-api Services

§D-H #14 and §12 B1a state `routes/sessions-routes.ts` "**moves wholesale to orchestration-api**"
into `packages/agent-orchestration/src/routes/sessions.ts`. Its import block
(`packages/core-api/src/routes/sessions-routes.ts:1-33`) is:

```ts
import { resolveInjectedConnectionsForAgent } from "@hyperidle/connections";
import { resolveInjectedFilesystemsForAgent } from "@hyperidle/filesystems";
import { readServerConfig } from "@hyperidle/settings";
import { findUser, requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { resolveSessionStartRequest } from "@hyperidle/work";
```

`@hyperidle/work`, `@hyperidle/users` and `@hyperidle/settings` are **core-api Services**. All five
are called inside the `POST /` handler's `db.transaction` (`:396-424`). Moving the file makes
`agent-orchestration` import core-api Services — the exact violation this WP exists to prevent, and
one the composition-edge anti-regrowth guard (currently zero exemptions, verified:
`scripts/composition-edge-anti-regrowth-guard.ts:417` `DEFERRED_FOLLOWUP = new Set([])`, `ALLOWLIST`
and `STATELESS_METHODS` absent) would fire on.

§2's blast-radius item 4 identifies only the *middleware* stack as Job 2's blocker
(`agent-orchestration-sessions-routes.ts:9-12`). The real blocker is larger and unaddressed.

**Fix:** split `sessions-routes.ts` per route before B1a rather than moving the file. Under §D-A's own
rule the emit-path routes stay core-hosted (see C2); only the record-only reads move. State the
per-route disposition explicitly — do not leave the builder to discover this mid-increment.

### C2 · [§D-A applied table, §5] The gate rule is stated but not applied to the routes it governs — two moved routes have core gates

§D-A rule 2: *"A route lands on the layer that owns its gate… A route whose gate is core-domain stays
on `createCoreApiApp()` even if its record lives on the other side."* Applied honestly to the routes
the plan moves, it reverses two of them:

- **`GET /api/tasks/:id/sessions`** — `packages/core-api/src/routes/tasks.ts:185-190`:
  `const task = await work.get(db, "task", taskId); if (!task) return c.json({... NOT_FOUND}, 404);`
  before it touches `sessions`. That is a **core gate** with observable behaviour (404 vs `{sessions: []}`).
  §D-A's table asserts "Gate: orchestration's own" — false. Moving it either drops the 404 (an AC7
  behaviour change) or forces orchestration to read `tasks` (forbidden).
- **`POST /api/sessions`** — `sessions-routes.ts:363-366` gates identically on `work.get(db,"task",…)`,
  then resolves `requireRunnableAgent` + `readServerConfig` + both injection resolvers in-tx. Core gate,
  core Services. §5 moves it to the orchestration app.

The applied table therefore reads as written **after** the placements were chosen, not derived from
them. That is the "post-hoc rationalization" risk in its sharpest form: the rule is sound, but it was
not run against its own inputs.

**Fix:** re-run the gate table against every route in `sessions-routes.ts` and `tasks.ts` with the
handler body open, and correct the placements the rule reverses. Note the happy consequence: keeping
`GET /tasks/:id/sessions` core-hosted also removes the one `useTaskSessions.ts` URL change from AC7.

### C3 · [§5, §6, §7 AC5, §D-H #14] The route checklist for the sessions family is wrong on 3 of 5 rows

`rg -an 'router\.(get|post|patch|delete|put)\(' packages/core-api/src/routes/sessions-routes.ts`
returns exactly five registrations: `:321 GET /`, `:352 POST /`, `:512 GET /starts/:startId`,
`:529 GET /:id/activity`, `:557 PATCH /:id`.

| §5 says | Reality |
|---|---|
| `GET /api/sessions/:id` | **does not exist** |
| `POST /api/sessions/:id/abort` | **does not exist** — abort is a branch of `PATCH /:id` (`applyStateChangePatch`, CAS write at `:259-263`). §D-H #14's "the abort write at `:260`" is a helper line, not a route |
| `PATCH /api/sessions/:id` | **missing from the checklist** — the only real mutation in the file |
| `GET /api/sessions` (list, `?task_id=&state=`) | **missing** — live caller `packages/web/src/pages/Conversations.tsx:118` |

Downstream damage: AC5(b) prescribes an integration test "hitting `GET /api/sessions/:id`", and §6's
privilege-change row prescribes "`POST /api/sessions/:id/abort` → 401" — both against routes that do
not exist. A builder writing to those ACs writes tests that cannot be made to pass honestly.

**Fix:** regenerate §5 from the registrations, not from prose; re-point AC5(b) and §6's abort row at
`PATCH /api/sessions/:id`; add `GET /api/sessions` and name `Conversations.tsx:118` in AC7's web-diff
allowance (it is a fourth file if that path is re-prefixed).

### C4 · [§2 blast-radius 1, §D-H, §12 D1/D2] A 15th `sessions` reader is unassigned — `policy/lifecycle-propagation.ts`

An AST census over every Layer `src/` and nested Service `src/` (value imports of `sessions` from
`@hyperidle/db`, non-test) returns **15 non-test core-api files**, not the 13 §2 claims:

- 9 Layer routes (as stated), **plus 6 Service files**: `policy/handoff-protocol.ts`,
  **`policy/lifecycle-propagation.ts`**, `realtime/ws-connection-hub.ts`,
  `review/session-review-creator.ts`, `work/bet-kill-cascade.ts`, `work/work-service.ts`.

§D-H enumerates 5 numbered sites + the 9 Layer readers = 14. `lifecycle-propagation.ts:288-293` is
absent from `architecture.md` entirely:

```ts
const otherActiveSessions = await db.select().from(sessions)
  .where(and(eq(sessions.taskId, taskId), eq(sessions.state,"active"), ne(sessions.id, sessionId)));
```

It **gates** the task `in_progress → review` transition (`:304`). `group2.md:81` found it and parked it
as "an ownership/ACL question for the AU-track table-ownership axis, not a relocation" — but §D-G
*makes it this WP's axis* by assigning `sessions` to `run-orchestration` and deleting
`UNOWNED_SHARED_TABLES`. D2's stated proof ("`inspect()` returns zero findings on the real tree") is
therefore unreachable as planned.

**Fix:** add it as §D-H site 15 with its design (`port.sessions.listByTaskId(taskId)` filtered to
`state==="active" && id!==sessionId`; the port contract already carries `state`), and correct §2's
"13 non-test files" to 15.

### C5 · [§D-H #1, §11 risk 2, §12 D1] The handoff change is not the channel-swap it is described as, and the stated mitigation is false

Three things do not hold:

1. **The existing subscriber does not end the session.** `start-runtime.ts:320-336` handles
   `session_handoff_completed` by calling
   `ports.sessionLifecycle.requestAgentTermination(...)` — and only if
   `findSessionRequest({by:"sessionId"})` returns a row (`request ? … : undefined`). It never writes
   `sessions.state`. Today's determinism comes from the in-tx write at `handoff-protocol.ts:120-124`
   (`{state:"done", endedAt}`). Deleting that write does not "move the same effect to an existing
   channel"; it substitutes a different, conditional mechanism with a different terminal state.
2. **It very likely re-introduces a suppressed event.** `handoff-protocol.ts:104-107` states outright:
   *"`session_ended` is NOT emitted here — handoff does not record a session-end outcome, so
   subscribers like `session-review-creator` must not fire on handoff."* Routing the end through the
   runtime termination path emits `session_ended` on the normal path — which fires
   `review/session-review-creator.ts` and creates a review item on **every handoff**. That is a
   user-visible regression the document does not consider.
3. **The reaper does not cover the gap.** §11 risk 2 says "`runtime-reapers.ts` already reaps
   stale-active runs." Its stale-active query is `runtime-reapers.ts:180-183`:
   `eq(sessions.state,"active") AND sql`${sessions.routineId} is not null` AND lt(startedAt, cutoff)`
   — **routine sessions only**. A handed-off task/agent session left `active` is never reaped. The
   accepted risk is accepted against a mitigation that does not exist.

**Fix:** either keep the terminal write and route it as a downward call into orchestration
(`requestRunEndForHandoff(db, sessionId)` — same shape as `requestRunStopForTasks`, in-layer, still
same-transaction-adjacent and event-free), or specify the subscriber change in full: what terminal
state it writes, whether `session_ended` is emitted, what `session-review-creator` must do about it,
and a reaper that actually covers non-routine sessions. Do not ship the current framing.

---

## WARNING

### W1 · [§2 row 3, §D-G, feasibility P6] The guard scan-root finding's premise is false — `packages/core-api/src` is already scanned

§2 asserts `nestedServiceRoots()` "scans only `packages/<layer>/<service>/`. **All Layer code is
invisible**, including 9 more `sessions` readers", and §D-G concludes "Without that, deleting
`UNOWNED_SHARED_TABLES` is theatre."

`scripts/table-ownership-guard.ts:604-630` — `inspect()` — runs `nestedServiceRoots()` **and then**
an explicit second pass over `const coreApiSrc = join(root, "packages/core-api/src")` (the AU19
Increment 5 scan-widening, documented in the comment at `:612-624`). The nine Layer readers are
**already visited**; they pass solely because `sessions ∈ UNOWNED_SHARED_TABLES` (`:349-354`, filtered
at `:543`). Deleting the Set alone makes all nine fire immediately.

The **numbers** are right. I re-ran the census independently (AST-free import parse over every
`packages/*/src/**` non-test file, tables parsed from `schema.ts`): **12** non-eval non-test
Layer-level pairs — 9 `sessions`, 2 `userSkills`, 1 `propagationLog` — matching P6 exactly. So the
work is unchanged. But the stated justification is wrong, and it hides the *real* residual gap: the
unscanned roots are the **other** Layers' `src/` (`agent-orchestration/src`, `agent-execution/src`,
`remote-server/src`, …). That matters concretely: after B1a, orchestration gets route files under
`packages/agent-orchestration/src/routes/**` which the guard would not visit at all.

**Fix:** rewrite §2 row 3 and §D-G's justification. The scan extension is still correct — for
orchestration's new Layer-level routes and for `remote-server/src` (see W5) — but say so on the true
reason.

### W2 · [§7 AC8, §D-G] AC8's "no allowlist of any kind" is contradicted by the `packages/eval` package-name exclusion

AC8 reads: *"Both guards end with no allowlist of any kind."* §D-G simultaneously institutes
`packages/eval` "excluded **by package name** with a stated reason."

Measured: `packages/eval/src` non-test code has **67 file×table pairs across 18 owned tables in 26
files** (`agentWorkIntents, artifacts, bets, items, knowledgeAppProjection, knowledgeConflicts,
knowledgeEditLog, knowledgeItems, messages, routineRuns, routines, sessions, tasks, teamMembers,
teams, threads, userSkills, users`). That is not a rounding error — it is the single largest
concentration of direct owned-table access in the repo, and a one-entry package allowlist is what
would hide it.

The exclusion may well be defensible (a seeding harness, and the guard already skips `__tests__`
structurally at `:405`), but two things must change: (a) AC8's wording must stop claiming zero
exceptions of *any* kind and instead claim "zero **table-level** carve-outs; exactly one stated
**scope** exclusion"; (b) §11 risk 5 already flags eval as a future problem — say explicitly whether
the founder's zero-exceptions ruling applies to scope exclusions or only to table carve-outs, rather
than deciding it in a parenthesis.

### W3 · [§D-C, §11 risk 1] The `createServer` relocation is acceptable; its design-it-twice is straw-manned

**On the call itself: it stands.** `packages/desktop/src/boot-server.ts:15-18` already imports
`@hyperidle/core-api/server-factory`, and `remote-server/src/index.ts:22` does the same. Re-pointing
`desktop` at `@hyperidle/remote-server/create-server` swaps one Application→Layer-composition import
for one Application→Application import. It does not invent a relationship class, `runtime-simplification.md`'s
Applications rule ("only wiring/bootstrap") is satisfied at both ends, and the requirement forbids the
third package. **Judgement: legitimate.** Do not reopen it.

**On the arithmetic used to reject the alternative: it is inflated ~10×.** §D-C prices duplication at
"~90 lines × 7 = ~630 lines" — computed against **today's** 388-line monolith, before B1a moves every
reactor into `bootCoreApi()`/`bootAgentOrchestration()`. After that, the residual per-Application
bootstrap is: open db, EventBus, wsHub, mcpBridge, call both boots, apply the middleware stack, mount,
`notFound` branch, `serve`, dispose — realistically 50–70 lines. And 5 of the 7 "sites" are not
production Applications: three are `web/scripts/*-test-server.ts` harnesses and two are core-api's own
shipped fixtures, all of which may legitimately share a *test* helper (they already share
`test-utils.ts`/`test-fixtures.ts`). Honest duplication cost: **2 Applications × ~60 lines ≈ 120
lines**, not 630.

**A fourth option the document does not name:** `desktop` already speaks HTTP to the server over
`127.0.0.1` on an OS-assigned port (`boot-server.ts:28-31`, `waitForHealth` at `:49`), so it could spawn
`remote-server` as a child process instead of importing it. I checked why this is unattractive and it
is: the only in-process difference is the injected `adapterPool`/`workspaceAdapter`
(`createLocalAdapterPool()` + `createSandboxAdapter("local")` vs `new AdapterPool()` +
`"disabled"`), and selecting those by env is precisely the `HYPERIDLE_PROFILE` runtime branch AU19
Increment 5 **deliberately deleted** (`boot-server.ts:7-14` `@lore`). So it should be named and
rejected on that ground — not omitted.

**Fix:** keep the decision; replace the 630-line figure with the post-B1a number and add the
child-process option with its AU19 counter-argument. A rejected alternative priced at pre-refactor
scale is exactly the design-it-twice theatre the rubric flags.

### W4 · [§12 wave table] Wave labels contradict the dependency column, and the stated critical path is incomplete

- **C3 is labelled "wave 2 · dissolve" and depends on `B1a, D1`.** D1 is **wave 3**. A wave-2 increment
  cannot depend on a wave-3 increment. Either C3 is wave 4, or the wave column is decorative.
- **Critical path** is given as `A1 → B1a → B1b → E4`. But E4 also depends on **E3 ← E2 ← E1**
  (S + M + L). That chain is at least as long as B1a→B1b and is omitted from the path entirely.
- **G1 depends on `A1`** with no stated reason. G1 keeps its route core-hosted (§D-A) and touches no
  route/middleware file that A1 moves. If the dependency is real, name it; if not, drop it — G1 is an
  L-sized increment sitting behind a needless gate.

### W5 · [§12 B1b vs D2/F1/C3, §D-G] Later increments reference files that B1b has already moved, and the scan-root wording misses where they land

B1b (wave 1) relocates `server-factory.ts` into `packages/remote-server/src/create-server.ts`. Three
later increments still address it at its old path:

- **D2** (wave 3): "`server-factory.ts`'s reaper → policy's exported `reapPropagationLog`". The
  `propagationLog` value import is in `server-factory.ts` today (census-confirmed, the single
  `propagationLog` Layer pair) — by D2 it is in `remote-server/src`.
- **F1** (wave 5, depends only on `A2`): the mount engine's composition is `server-factory.ts:1006`.
  By F1 that construction lives in `remote-server`. F1 therefore has an unstated dependency on B1b.
- **C3**: names `server-factory.ts:65` as one of `realtime`'s two real importers — same drift.

More consequential: §D-G says the scan extends to "**Layer** `src/` roots". `packages/remote-server`
is an **Application**, not a Layer. Read literally, the extension misses exactly the directory the
`propagationLog` import moves into.

**Fix:** state the scan root as "every `packages/*/src/**` outside a nested Service package", and
re-express D2/F1/C3's file references as "the Application composition root (post-B1b:
`packages/remote-server/src/create-server.ts`)".

### W6 · [Validation scenario 4, §D-E] The live-activity scenario is not closed — the WS stream still terminates on core-api's hub

`plan.md` scenario 4: *"when the UI connects for streaming updates, then it reaches
agent-orchestration's own route directly."* §D-E keeps `WsConnectionHub` in `packages/core-api/src/`
and has orchestration broadcast through an **injected `{broadcast}` port** on the core-owned listener,
noting `useSessionActivity.ts`'s WS URL "does not change". Verified: `useSessionActivity.ts:223-230`
subscribes via the shared `getWsClient()` to `session:${sessionId}`.

So the HTTP snapshot (`GET /api/sessions/:id/activity`) moves, but the **streaming half** — the part
the scenario and `plan.md` AC5 ("core-ui dials in without a core-api gateway hop") actually name —
still hops through core-api. §D-E's verdict may be right on the merits (three of four topics are
core-domain), but the document never states that it is *re-interpreting* the scenario. It reads as
closed when it is half-closed.

**Fix:** state explicitly that scenario 4 is satisfied for the HTTP surface and deliberately **not**
for the WS surface, with §D-E's one-listener/one-topic-space reason, and get that re-interpretation
through the founder gate alongside the realtime verdict — it narrows a founder-written AC.

### W7 · [§D-A] The gate rule is undefined for read routes, and silently exempts authentication

Two holes in a rule the document explicitly positions as reusable by future WPs:

- **Reads.** The gate is defined as "what the handler must *read* to decide whether the **mutation**
  is legal." `GET /api/filesystems?agentUserId=` has no mutation, and §D-A's table fills the Gate cell
  with "core (renders core `filesystems` rows)" — a **rendering** argument, which `requirements.md:42`
  disqualifies by name ("Rendering it into a `core-api` response is not a use: every core route renders
  in core, so counting that would make everything stay by construction"). The rule's one worked read
  example is decided by the criterion the WP outlawed.
- **Auth.** `createAuthMiddleware` reads `@hyperidle/users` (§D-B says so). If authentication counted
  as part of the gate, *every* route would be core-gated and orchestration-api could not exist. The
  document relies on this exclusion without stating it.

**Fix:** two sentences. (1) "Authentication is Application-applied and is never part of a route's gate."
(2) For reads: "a read route lands on the layer that owns the **majority of the rows it returns**;
where it composes both, it lands on the layer whose rows the response is *keyed* by, and composes the
other side at the route." Then re-derive the `GET /api/filesystems` row from it.

### W8 · [§D-E] "Two of four DI edges leave" is one

§D-E corrects `group2.md`'s "three of its four DI edges leave" to "**two** leave (`work` by
FK-redundancy, **and nothing else**); `users`/`org` stay". The four edges are `conversation`, `users`,
`org`, `work`. If `conversation`, `users` and `org` all stay, exactly **one** leaves — the sentence
contradicts its own parenthesis. (The substantive correction is right and I verified it:
`ws-connection-hub.ts:161-166` `senderInTeam` is reachable only from `canSubscribeToTaskFreeSession`
at `:181`, which survives because the `session:` topic survives.)

---

## SUGGESTION

- **S1 · [§D-D, §8]** The observability deletion's call-site list omits `packages/core-api/src/routes/status.ts:41`
  (a doc comment naming `/api/observability/config`) and the two API-surface tests that enumerate it
  (`src/__tests__/api-availability.integration.test.ts`, `src/__tests__/api-e2e.integration.test.ts`).
  Add them to §8's row so C2 does not fail verify on a surface-inventory assertion.
- **S2 · [feasibility P1]** Cites `hono@4.12.27`; installed is `4.12.30`. I re-ran the probe on the
  installed version — the finding holds exactly (naive mount → `text/plain "404 Not Found"`; the
  root-level `startsWith("/api")` branch → `{"error":…,"code":"NOT_FOUND"}` with
  `content-type: application/json`). Just update the version string.
- **S3 · [§D-L, §12 G1]** The DDL gives `max_concurrent_sessions integer NOT NULL DEFAULT 1` but the
  backfill rule is stated only as a §11 risk ("agents with all-null run-config must still resolve
  defaults identically"). Promote it to a written invariant with the current `users` column's
  nullability/default named, and add a one-line rollback note (the migration drops 11 columns —
  forward-only is fine, but say so).
- **S4 · [§7 AC7(c)]** "Exactly three files may change" in `packages/web` — if C2/C3's URL work touches
  `Conversations.tsx:118` (`/api/sessions?task_id=`), that is a fourth. Reconcile after C3 is fixed.

---

## What's Working Well

- **The probes are real and they hold.** I re-ran P1 on the installed Hono and reproduced the
  `notFound` trap exactly, re-verified P4's FK (`schema.ts:229`, `onDelete:"restrict"` — the
  `deps.work.getTaskById` check at `ws-connection-hub.ts:211` is genuinely free to delete),
  re-verified P5's dead-exporter claim, and re-ran P6's census numerically (12 pairs, exactly as
  stated). Six probes, each on a genuinely load-bearing unknown, none on the obvious — and P2/P3
  correctly read shipped precedent instead of manufacturing a POC. This is the strongest dimension
  in the document.
- **The document argues against itself in the right places.** §D-C flags its own weakest call for the
  reviewer instead of burying it; §D-E overturns `group2.md`'s DI-edge claim and §D-A overturns
  `group3.md`'s ordering claim with evidence rather than deference; §11 records the handoff semantics
  change as accepted rather than hiding it. The sizing block ("this is **not one PR**… 13 PRs across
  7 waves") is the kind of honesty that makes a plan usable. The failures above are failures of
  *coverage*, not of candour.
