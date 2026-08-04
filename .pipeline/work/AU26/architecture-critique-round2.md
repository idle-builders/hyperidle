# Architecture Critique: AU26 — round 2

ARCHITECTURE-SCORE: **7/10**  rounds=2  score-line: SA:8 IM:6 LI:9 AC:8 DM:9 N:9 MD:8 FMC:7 S:7 V:7 FE:8

**Verdict: PASS, conditional.** The five round-1 CRITICALs are genuinely closed — I re-traced each
against HEAD rather than reading §13. C1, C4 and C5 are fixed outright; C2's placement rule is now
mechanical and I re-ran it row by row; C3's guard resolution is *directionally* right (a derived scope
beats a package allowlist) but its load-bearing census claim is **false**, and the closure it derives
does not contain two of the directories it says it contains.

Waves 0–3 (A1, A2, B1a, B1b, C1, C2, D1, G1) are buildable as written. **D2 must not start until the
two CRITICALs below are closed** — as specified its own proof obligation (AC8(c), "`inspect()` returns
zero findings on the real tree") cannot be met.

Every claim below re-verified with `rg -a` / direct file reads on branch `pipeline/AU26` (`94cc2dfe`,
base `origin/main` @ `75d85687`), plus three probes I ran myself.

---

## Round-1 CRITICAL dispositions — verified, not taken on trust

| # | Claim in §13 | Verdict |
|---|---|---|
| **C1** | `sessions-routes.ts` splits 4-move / 1-stays | **Genuinely fixed.** Verified all five registrations (`rg -an 'router\.(get\|post\|patch\|delete\|put)\('` → `:321 :352 :512 :529 :557`). Traced each moved handler's *transitive* table set to the bottom: `findSessionRequest` → `session-requests/src/service.ts` touches only `agentLifecycleInbox`/`agentSessionRequests`/`explicitSessionStarts`; `transitionRun` → `transition-run.ts` touches `sessions` **only** (`:371`, single `.update`); the activity buffer is agent-execution's. **Zero core-Service reach in the four movers.** `@hyperidle/run-orchestration` is confirmed a `core-api` dependency (`packages/core-api/package.json:39`), so `createBareRun` is a legal downward call, not a new package edge. `POST /` retains `work`/`users`/`settings` and sheds `sessions` — no upward import survives. I also probed the routing shape this creates (below): it works |
| **C2** | Placement rule restated mechanically, §5 re-derived | **Genuinely fixed.** Re-ran the rule myself. `tasks.ts:186-190` `work.get(db,"task",…)` 404 gate → `GET /:id/sessions` two-sided → core-api: **correct, reversed correctly**. `tasks.ts:~292` handoff gates on `work.get` then reads `sessions` → two-sided → core: correct. `routes/connections.ts` imports **no** `@hyperidle/users`, `work`, `org`, and no `teamMembers` (grep returns nothing) → single-sided `service_connections` → orchestration: correct. `/api/ws` authorizer is four-table two-sided → core: correct (see C5). Rule 4 (auth excluded) is now stated, not assumed. Two residual holes in the rule's mechanicality — see W5 |
| **C3** | Scan scope derived from the Application closure; eval falls out by principle | **Mechanism right, facts wrong.** eval verified `private: true` with **zero dependents** (`rg -a -l '"@hyperidle/eval"' --glob package.json` → only its own). But the closure includes `packages/db/src` and **excludes** `packages/agent-orchestration/src`. See CRITICAL 1 + 2 |
| **C4** | Terminal write stays in policy's tx via `endRunForHandoff(tx, …)` | **Genuinely fixed, and the "no behaviour change" claim holds.** Verified `handoff-protocol.ts:104-107` (the `session_ended` suppression comment) and the write at `:120-124` — unconditional `tx.update(sessions).set({state:"done", endedAt})`, no CAS. Delegating it with the same `tx`, same fields, no emit is byte-for-byte the same effect. Passing a tx handle across the boundary is **this codebase's shipped pattern**, not an invention: `WriteExecutor` is the first parameter of essentially every port method in `policy/src/ports.ts`, `run-orchestration/src/contracts.ts` already names it, and core-api **already** passes a live tx into an orchestration Service today (`sessions-routes.ts:394` `createSessionRequest(tx as HyperIdleDb, …)`). Consistent with AU21's blind-executor rule: core sends the request, orchestration never reacts |
| **C5** | Scenario 4 split; WS half deliberately narrowed | **Genuinely fixed, and the narrowing is genuinely forced.** Verified the authorizer's table set at HEAD: `threads` (`deps.conversation.getThreadById`, `ws-connection-hub.ts:152`), `users` (`deps.users.getUserById`, `:162`), `teamMembers` (`deps.org.getTeamMembersById`, `:164`), `sessions` (direct select `:200-206`). Four tables, two sides → rule 3 → core-api. Both rejected alternatives hold under scrutiny: a second orchestration-owned `session:` listener still cannot decide `canSubscribeToTaskFreeSession`'s `threadId`/`teamId` branches (`:178-182`) without core reads, and injecting a core-implemented authorizer into orchestration is the identical construction §D-A rejects for `FilesystemInjectionValidator`. **Could the authorizer be decomposed to close it? Not without moving thread/team subscribe authz off the socket entirely — which the doc names and correctly scopes to a separate WP.** The narrowing is honest, not an artifact |
| **C4 (r1) 15th reader** | `lifecycle-propagation.ts` assigned | **Fixed.** Verified `:288-293` and that the rows are consumed only by `${n} other active session(s) still running` at `:301` — `countOtherActiveRunsForTask` really is the whole need |

**Regressions checked and intact:** `createServer` callers confirmed (`remote-server/src/index.ts:22,36`,
`desktop/src/boot-server.ts:15-18,30`); AC10's Hono `notFound` trap survives and I re-ran the probe
(`probes/two-app-mount/poc.ts` still yields `text/plain "404 Not Found"` on the naive mount; `poc2.ts`
confirms only the root `notFound` fires; `poc3.ts` confirms parent middleware + `onError` cover both
sub-apps, 4/4 middleware hits). `feasibility.md:19-21` now cites `hono@4.12.30` — verified installed
(`node -e "require('hono/package.json').version"` → `4.12.30`). AC2's 15-service coverage holds:
`packages/core-api` has exactly 15 Service packages; group1 covers 5, group2 5, group3 4, and
`connections` carries AU21 Decision J's founder-locked verdict + `git-export-rechallenge.md`.

**Round-1 WARNING/SUGGESTION spot-checks:** W1 fixed (`inspect()` at `:604-630` does run the
`core-api/src` second pass; `UNOWNED_SHARED_TABLES` at `:349-354` is the only thing making the nine
Layer readers pass). W3 fixed (the `@lore` at `boot-server.ts:6-14` does name the deleted
`HYPERIDLE_PROFILE` branch — the child-process rejection rests on a real shipped decision). W5 fixed
(D2/F1/C3 now address the post-B1b composition root). **W8 fixed and correct** — of `conversation`,
`users`, `org`, `work`, exactly one (`work`) leaves by FK-redundancy; I re-confirmed `senderInTeam`
(`:161-166`) is reachable from `canSubscribeToTaskFreeSession` (`:181`), which survives. S1 fixed (both
`routes/status.ts:41` and `api-availability.integration.test.ts:39` exist and are now listed). S2, S3,
S4 fixed. **W4 only half-fixed — see W3 below.**

---

## CRITICAL

### 1 · [§D-G "the scan scope", §7 AC8(c), §12 D2] The derived closure pulls in `packages/db/src`, where the guard fires on **19** owned-table accesses the plan says do not exist

§D-G: *"Census at HEAD: **12 pairs, all inside `packages/core-api/src`**, all on the four tables this WP
is assigning owners to. **Zero new work.**"* That is false.

`packages/db` is in the runtime dependency closure of every shipped Application (`remote-server` →
`@hyperidle/core-api` → `@hyperidle/db`; `desktop` names it directly). Under the derived scope,
`packages/db/src` becomes scanned. It contains two **non-test** files with direct owned-table access:

- `packages/db/src/demo-fixture.ts` — 10 accesses: `.insert(teams):43`, `.insert(teamMembers):55`,
  `.insert(users):67,82,98`, `.update(teamMembers):115`, `.insert(bets):121`, `.insert(tasks):134`,
  `.insert(routines):150`, `.update(users):183`
- `packages/db/src/factory-bootstrap.ts` — 9 accesses: `.insert(users):68,87,130`,
  `.update(users):108,185,214`, `.insert(knowledgeItems):223`, `.insert(knowledgeAppProjection):240`

Every one of those tables has a `TABLE_OWNER` row (`teams`/`teamMembers` → `org`, `users` → `users`,
`bets`/`tasks` → `work`, `knowledgeItems`/`knowledgeAppProjection` → `knowledge`, `routines` →
`routine`). **Importing from `./schema.js` does not evade the guard**: the direct-access branch
(`table-ownership-guard.ts:565-575`) calls `consider(arg.text, …)` on the *identifier name* of the
first argument to `.from/.insert/.update/.delete`, with no import-specifier condition — only the
*value-import* branch is scoped to `@hyperidle/db`. So all 19 fire.

D2's stated proof (`inspect()` returns zero findings on the real tree, AC8(c)) is therefore unreachable
as specified, and the increment cannot go green.

**This also breaks the principle, not just the census.** §D-G justifies eval's exclusion as *"the ACL
governs code that runs inside a shipped Application"* and characterises eval as *"a fixture-seeding
harness that stands the domain up rather than consuming it."* `factory-bootstrap.ts` is the production
first-boot seeder — the same shape, **inside** a shipped Application. The principle as stated therefore
does not exclude it, which means the boundary the WP actually needs is *"the seed/bootstrap layer is
out of the ACL, wherever it lives"* — a different, broader claim than the one written, and one that
readmits the exemption question C3 existed to close.

**Fix (pick one, state it):** (a) make the seed/bootstrap exclusion the stated principle, define it
structurally (as the guard already does for `__tests__`) rather than by package, and re-derive AC8's
wording plus the eval argument from it; or (b) keep the Application-closure principle and accept that
`packages/db/src`'s 19 sites must route through owning Services — in which case that is a second D3-class
increment, not "zero new work", and it belongs in §12 with its own row and its own founder gate.
Either way, re-run the census over the **actual** closure and publish the real number.

### 2 · [§D-G point 2, §12 B1b/D2] `agent-orchestration/src` and `agent-execution/src` are **not** in the closure at HEAD — and the derivation reads a `dependencies` field `desktop` does not use

§D-G point 2 asserts: *"`core-api/src`, **`agent-orchestration/src`**, **`agent-execution/src`**,
`remote-server/src`, `remote-worker/src`, `shared/src`, `api-contract/src` are all in the closure and
all become scanned."* Verified false for two of the seven:

- `rg -a -l '"@hyperidle/agent-orchestration"' --glob package.json` → **only its own package.json.**
  Same for `"@hyperidle/agent-execution"`. Nothing depends on either umbrella package; what core-api
  depends on is the *nested* Services (`run-orchestration`, `dispatch`, `session-requests`,
  `tool-handlers`, `harness-registry`), which `nestedServiceRoots()` already walks.
- `packages/agent-orchestration/src/index.ts` is literally `export {}`, with a `@lore` stating the
  barrel *"intentionally exports nothing until a future Increment gives the `agent-orchestration` Layer
  package itself a real consumer."*
- `packages/agent-orchestration/package.json` declares **no `dependencies` field at all**.

So the derivation, applied at HEAD, misses exactly the directory §D-G says it must cover — the one
B1a creates route files in. It only works if B1b adds `"@hyperidle/agent-orchestration": "*"` to
`remote-server`'s `dependencies` (and B1a adds `hono` + `@hyperidle/db`/`session-requests`/
`run-orchestration`/`shared` to the orchestration package). Neither edit is named anywhere in §12,
§10's shared-files list, or the ACs — yet CRITICAL-1's fix and D2's whole guarantee ride on it.
`agent-execution/src` never enters the closure under **any** increment in this plan.

Compounding it: **`desktop` declares `@hyperidle/core-api`, `db`, `shared` and `remote-worker` under
`devDependencies`**, not `dependencies` (`packages/desktop/package.json`). §D-G says the closure is
*"computed from `package.json` `dependencies`, transitively"* — read literally, `desktop`'s closure is
`{@electric-sql/pglite}`, and the scan only survives because `remote-server` independently pulls
`core-api` in. That also falsifies the self-maintenance claim (*"the day anything shipped depends on
`@hyperidle/eval`, eval enters the closure and all 67 pairs fire"*): under this repo's own conventions
a shipped Application's real dependency can sit in `devDependencies` and never enter.

**Fix:** (a) name the two `package.json` dependency edits as explicit B1a/B1b deliverables and assert
them in AC8; (b) state whether the derivation reads `dependencies` only or `dependencies` +
`devDependencies` — and if only the former, fix `desktop`'s classification in B1b; (c) drop
`agent-execution/src` from the "all become scanned" list or state what puts it there.

---

## WARNING

### W1 · [§D-H #16] The explicit-start projection helpers are used by **both** sides of the split, and the doc assigns them to one

§D-H #16's table says `GET /starts/:startId` *"moves with `projectExplicitStart`/`pendingStart`/
`sendStartProjection`."* But `POST /` — which stays core-hosted — calls `projectExplicitStart` at
`:437`, `:445`, `:461` and `:466`, and `sendStartProjection` at `:438`, `:447`, `:467`. The triple
cannot simply move.

`projectExplicitStart` is the one with the DB read (`:60-68`, `sessions` by `start.sessionId`), which
the doc separately says becomes `port.sessions.getById` on the core side and an in-layer read on the
orchestration side. So the builder faces an unresolved decision: duplicate the triple across both apps
(two implementations of one wire shape — the 202/422/429/500 projection that AC5(b) asserts is
byte-identical), or give it a single home. A single home is legal (a `run-orchestration` /
`session-requests` export core imports downward), but it **cannot** be the moved route module — AC5(a)'s
static guard forbids any `packages/core-api/src` file importing under
`packages/agent-orchestration/**/routes/**`.

**Fix:** name the home explicitly in §D-H #16 and in §4's contract block, and state that both apps call
it. `tsc` catches an outright omission, but not silent divergence between two copies.

### W2 · [§D-K bullet 1 vs §D-A row 10] The withdrawn rendering argument survives verbatim in §D-K

§D-A (line 149) withdraws it by name: *"Derived from rule 2/3, **not** from 'it renders core rows' —
that argument is outlawed by `requirements.md:42` and is withdrawn."* §D-K bullet 1 (line 640) still
reads: *"`GET /api/filesystems?agentUserId=` stays core-hosted (§D-A — **it renders core `filesystems`
rows**)."* A builder working the filesystems split reads §D-K, not §D-A. Re-derive that sentence from
rule 2/3 (`filesystems` core + `filesystem_injections` orchestration → two-sided → core, composed).

### W3 · [§12 wave table] Wave labels still contradict the dependency column — for the connections chain

Round 1's W4 was fixed for C3/D2 and G1, but **E1, E2, E3 and E4 are all labelled "wave 4"** while
E2←E1, E3←E2, E4←E3 — a four-deep serial chain inside one wave, which is precisely the defect raised.
The critical-path block even draws the chain correctly two paragraphs later. Either the column means
*workstream* (say so, and rename it) or E1–E4 span waves 3–6.

### W4 · [§12 header, doc preamble] "13 independently shippable PRs" contradicts the doc's own 16-row table

The preamble's headline sizing claim — *"This is **not one PR.** It is **13 independently shippable
PRs** across 7 waves"* — and §12's title both say 13. The table has **16** rows: A1, A2, B1a, B1b, C1,
C2, C3, D1, D2, E1, E2, E3, E4, F1, F2, G1. Plus D3 as a live fallback (§D-G), plus whatever CRITICAL-1
forces. This is the most-quoted line in the document and the one round 1 singled out as its best
instance of honesty; it should match its own table.

### W5 · [§D-A rule 2] Two residual seams in the rule's mechanicality

The rule survived my re-run, but two cases are undefined and a future WP will hit them:

- **Events are not covered.** `PATCH /api/sessions/:id` emits `session_ended`, whose subscriber
  `review/session-review-creator.ts` writes core tables. After the move that emit happens on
  orchestration's side. Under a literal reading of "every table its handler touches" this is arguable
  either way. One sentence closes it, in the same register as rule 4: *an emitted event is not a table
  touch; subscribers are judged on their own layer.*
- **Table sets are stated at the wrong point in time.** `POST /api/sessions`'s row lists
  `tasks + users + server_config + explicit_session_starts + agent_work_intents + sessions`, but at
  B1a (wave 1) the handler also reaches `filesystems`/`filesystem_injections` and `service_connections`
  through `resolveInjectedFilesystemsForAgent` / `resolveInjectedConnectionsForAgent` (called in-tx at
  `:415-421`). Those bakes only die in E3/F2 (wave 4). The verdict is unchanged (still core-hosted), but
  the table sets are written as of the *end* of the WP, not as of the increment that applies the rule.
  Say so, or state the sets at HEAD.

### W6 · [§12 founder-confirmation table, §7 AC13(b), §D-G] Three blocking gates with no autonomous default

C3 blocks on the founder confirming the WS narrowing, D2 blocks on *"does zero-exceptions govern scope,
or only table carve-outs?"*, and AC13(b) declares *"a silent pass is a **failed** AC."* This repo's
binding rule is that a pipeline run has no human (`CLAUDE.md` ABSOLUTE RULE 1: never pause, never wait
for feedback — handle it or mark it blocked and move on). As written, an autonomous run reaches wave 4
and stalls on three unanswerable questions.

**Fix:** give each gate a stated default that the run takes and records, so the gate becomes a
*ratification* rather than a *block* — e.g. D2 proceeds on the derived scope with D3 deferred and the
question logged; C3 proceeds narrowed with AC13(b) recorded as accepted-pending-review. Escalating a
founder-written AC's narrowing is right; making the build unable to proceed without an answer is not.

---

## SUGGESTION

- **S1 · [probes/two-app-mount]** The one routing shape this revision *invented* — same path prefix,
  different methods, split across the two apps — is not in P1. I probed it independently and **it
  works**: with `api.route("/", core)` then `api.route("/", orch)`, `POST /api/sessions` → core's
  handler, `GET /api/sessions` → orchestration's, `GET /api/sessions/starts/:id`,
  `GET /api/sessions/:id/activity` and `PATCH /api/sessions/:id` → orchestration's, and
  `DELETE /api/sessions/:id` → the root JSON 404. Add this as a fourth checked-in probe so the artifact
  covers §D-H #16's construction rather than only the prefix case.
- **S2 · [§4, §10]** `packages/agent-orchestration/package.json` declares **zero** dependencies today.
  B1a must add `hono` + `@hyperidle/{db,shared,session-requests,run-orchestration}`. Mechanical, but
  unlisted — and CRITICAL-2 shows the package.json is load-bearing for the guard, not just for the build.
- **S3 · [§7]** AC ordering is `AC8, AC9, AC10, AC12, AC13, AC11`. Renumber so AC11 ("whole-change
  correctness") lands last; a builder reading top-to-bottom will otherwise think an AC is missing.

---

## What's Working Well

- **The withdrawals are the best thing in this revision.** §D-H #1 does not defend round 1's handoff
  design — it re-traces all three of its legs at HEAD, states that each was wrong, and replaces it with
  a design that is verifiably net-zero. §D-A does the same to its own rule and then *re-derives the
  table it had already written*, reversing two of its own placements. §D-K's alternative is repriced
  against the planner's own inflated figure and the decision is left standing on a different, honest
  reason. That is a producer scoring itself, which is rare and worth reinforcing.
- **The route checklist is now generated, not narrated,** and it matches `rg` output exactly — including
  the deliberate note that the string `GET /api/sessions/:id` appears in a 202 message
  (`sessions-routes.ts:211`) pointing at a route that does not exist, "noted so nobody restores it."
  That is the difference between a checklist and an inventory.
- **The port discipline is exactly right.** Read door stays read-only and grows one family; commands go
  down as direct calls; core Services take Mechanism-C DI bags and never touch the Port; the count-only
  `countOtherActiveRunsForTask` refuses to let a row shape cross the boundary. All four confirmed
  against the shipped `WriteExecutor` precedent.
