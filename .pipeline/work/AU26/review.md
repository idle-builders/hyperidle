# AU26 — code review (Phase 8)

> **Fix pass, 2026-08-04.** Every CRITICAL and WARNING below is either fixed or
> rejected with a reason, listed in **§Disposition** at the end of this file.
> The findings above it are left exactly as the reviewer wrote them.


Branch `pipeline/AU26` @ `19f76214`, base `origin/main` @ `75d85687`. 47 commits (20 build), 491 files, +18599/−14565.

**Verdict: NOT DONE.** 3 CRITICAL, 12 WARNING, 7 NOTE.

Gate state, run here, not taken from a report:
`npm run check` PASS (34 packages) · `npm run lint` PASS (all 14 guards incl. `table-ownership-guard`, `composition-edge-anti-regrowth-guard`) · `npm run knip` PASS · `npm run test` 3512 passed / 375 files · `npm run test:integration:service` 2802 passed, 1 file + 4 tests skipped, exit 0. `npm run knip:production` **FAILS** (exit 1) — see W11.

---

## Sweep-verdict execution audit (the founder's bar)

Every pass-A verdict and every pass-B "relocate" is executed. Nothing parked.

| Verdict source | Verdict | Executed |
|---|---|---|
| `group1.md` connections | moves (whole) | YES — `packages/agent-orchestration/connections/`; core half renamed `@hyperidle/credentials`; `TABLE_OWNER.serviceConnections` repointed; K1 bake deleted |
| `group1.md` conversation | stays | n/a (assistant-turn bake correctly deferred to AU27) |
| `group1.md` filesystems | stays + 3 parts | SUPERSEDED by founder ruling → whole domain moved. Record, injections, probe, engine, captures all in `agent-orchestration`; `filesystem` knowledge scope removed |
| `git-export-rechallenge.md` | exporter DELETE + runner relocate | YES — package gone; `createGitRunner` → `@hyperidle/shared/git` |
| `group1.md` knowledge / notifications | stays | n/a |
| `group2.md` observability | dissolves | YES — translator+adapter → `@hyperidle/shared/observability`, config pair → `settings`, routes deleted, `TraceIdResolver` sub-finding deleted too |
| `group2.md` org | stays + 3 `teams` columns move | YES — `team_run_config_defaults` |
| `group2.md` policy | stays + handoff write moves | YES — `endRunForHandoff`, no EventBus (structural suppression) |
| `group2.md` realtime | dissolves | YES — `WsConnectionHub` + authorizer into `packages/core-api/src/`, package gone |
| `group2.md` review | stays + redundant read deleted | YES — `session-review-creator.ts` reads the event |
| `group3.md` routine | stays | n/a |
| `group3.md` settings | stays + connections projection re-pointed | YES — port wired from the Application to `@hyperidle/connections` |
| `group3.md` users | stays + 6 columns move + 2 dead drop | YES — `agent_run_config`, migration `0055` with backfill |
| `group3.md` work | stays + W1 subquery + W2 bet-kill write | YES — subquery deleted/recomposed in UI; `requestRunStopForTasks` |
| §5 Job 2 | orchestration hosts its own app | YES — `createAgentOrchestrationApp`, composition → `remote-server`, one listener |

Pass-B minimum coverage (mount engine, `users` columns, `WsConnectionHub`) all verdicted and executed.

---

## CRITICAL

### C1 — The composition root that hid a months-long production bug is still unproven, and the cast that hid it is still there
`packages/remote-server/src/create-server.ts:496`

The live bug the build found is real and correctly fixed: `serviceConnectionResolver` was wired to a `CredentialResolver` (`resolve(name)`) where a `ServiceConnectionResolver` (`resolve(userId, connectionId)`) was expected, so AN2 provisioning silently provisioned nothing. `create-server.ts:480` now passes `new ServiceConnectionResolver(db)`.

But:
- `} as ProvisionSessionDeps;` at `:496` — the escape hatch that suppressed the arity mismatch from `tsc` — is **retained**, with a `@lore` at `:470-479` that describes the bug it hid without removing it. A second `as RuntimeDeps["composition"]` sits at `:511`.
- **No test asserts the wiring.** The repo already has the exact precedent it needs: `ServerHandle.credentialResolver` is exposed *specifically* so `packages/core-api/src/__tests__/server-factory.resolver.test.ts:87` can assert `instanceof DbCredentialResolver` (`create-server.ts:186-193`). Nothing analogous was added for `serviceConnectionResolver`, `heldConnections` or `injectedFilesystems`.
- **Both bake-deletion proofs bypass the composition root.** `connections-added-after-emit.integration.test.ts:118-133` and `filesystems-added-after-emit.integration.test.ts:152-169` each hand-build the port (`{ listHeldForProvisioning: () => listHeldConnectionsForProvisioning(db) }`) and call `buildProvisioningPlan` / `mountFilesystemsForAgent` directly. Both docblocks say "wired exactly as `provisioner.ts` wires it" — that is a manual mirror, not the real wiring. Delete `heldConnections:` from `create-server.ts` and every test in this branch stays green while production provisions nothing again.

The tests themselves are honest about what they *do* cover: `expect(payloadJson).not.toContain("injectedConnections")` genuinely reds against K1's bake, and the signature change makes the read half structurally red against the old shape. The sanity-break claim holds. The gap is scope, not integrity — the WP's headline claim ("the staleness defect is gone at spawn") is proven for the reader function, not for the spawn.

**Ask:** one integration assertion on the real `createServer` handle that the three provisioning deps are the real implementations, and drop the `as ProvisionSessionDeps` cast (or narrow it to the one field that needs it).

### C2 — Held-connection provisioning is no longer scoped to one user
`packages/agent-orchestration/connections/src/held-connections-for-provisioning.ts:66-79`

```ts
const rows = await db.select().from(serviceConnections)
  .where(inArray(serviceConnections.authSource, [...HELD_AUTH_SOURCES]));
```

No `userId` predicate at all. The deleted K1 helper did `listConnections(db, { userId })` after resolving one human — so it provisioned **one** user's connections. The replacement provisions **every** human's held connections, each decrypted against its own owner, into **every** agent sandbox.

The file's `@lore` at `:23-33` claims this is "strictly SAFER than the old shape". That is false in the dimension that matters: it is safer against *mis-attribution* (it never resolves a row under the wrong owner) and strictly broader against *disclosure* (N owners' plaintext tokens now land in one sandbox instead of one owner's).

- `connections-added-after-emit.integration.test.ts:214-262` encodes the leak as the expected result: `OTHER_HUMAN_ID`'s Stripe token and `HUMAN_ID`'s GitHub token land in the same plan, and the test asserts exactly that.
- The same package's own HTTP surface still enforces per-user isolation on every CRUD path (`packages/agent-orchestration/src/routes/connections.ts:9` "Every query scoped on userId (AC5 — per-user isolation)", `:206`, `:340`, `:349`). One package now enforces per-user isolation at the route and abandons it at the spawn.
- Multi-human is a **shipped** mode, not a hypothetical: `HYPERIDLE_SHARED_MODE=true` (`packages/core-api/src/boot.ts:52`, `middleware/auth.ts:173`) plus invite codes (`packages/core-api/users/src/invite-code.ts`). `docs/architecture/authorization-model.md:36` names `multi-user-trust` as a supported trust mode.

Inert in the locked single-founder desktop deployment. Live the moment a second human joins. Either restore the owner filter (carried on the request by the emitting core resolver, as the `@lore` itself says multi-tenancy will require) or correct the `@lore`, record the widening as accepted, and stop calling it "strictly SAFER".

### C3 — Ten build artifacts committed into `packages/db/src/`
`packages/db/src/{agent-scaffold,connection,demo-fixture,factory-bootstrap,index,schema,seed,setup-cli,test-utils,write-executor}.d.ts.map`

Added in `b13a508e`. `CLAUDE.md` §Git: "Before committing, reject stray build artifacts (`*.d.ts`/`*.js` in source dirs …)". The equivalents under `scripts/` are gitignored (`.gitignore:77,79`); `.d.ts.map` under `packages/db/src` is not covered, so these slipped through. Delete them and extend `.gitignore`.

---

## WARNING

**W1 — A whole new source root sits outside the Table ACL guard.**
`scripts/table-ownership-guard.ts:625-645` scans nested Service packages (those with a `package.json`) plus one hard-coded widening for `packages/core-api/src`. AU26 created `packages/agent-orchestration/src/` — app, boot, 4 route modules, 3 services — which has no `package.json` and no widening. `packages/agent-orchestration/src/routes/sessions.ts:27`, `routes/agent-orchestration-sessions.ts:25` and `services/session-stream-hub.ts:36` already import the `sessions` table object directly; that is legal only because `sessions` is in `UNOWNED_SHARED_TABLES`. A future import of `threads` or `items` there fires nothing. The guard's PASS is partly vacuous for the newest code in the WP. The symmetric widening is one line.

**W2 — The policy sibling-guard `@lore` asserts an invariant its own analysis document contradicts.**
`packages/core-api/policy/src/lifecycle-propagation.ts:283-296` says the guard "defended a state no normal path produces" and lists only the reasons it cannot happen. `.pipeline/work/AU26/policy-sibling-guard.md:74-87` names **two reachable paths**, and I confirmed both against the code: `POST /api/sessions` (`packages/core-api/src/routes/sessions-routes.ts:125-200`) checks only that the task exists and the agent is runnable — fire it twice and two runs are `active` on one task (`concurrency.ts` caps per-agent, not per-task); and `accepted → hold → accepted` (`shared/src/task-transition.ts:6,9`) mints a second dispatch attempt while the first intent is still queued. Consequence: the first run to complete flips the task `in_progress → review` while the second is still working. The deletion itself is defensible under `ETHOS.md` (no preemptive walls, fully recoverable, `review → in_progress` is legal) and the doc's "no screen calls `POST /api/sessions`" claim checks out (`rg -a "api/sessions" packages/web/src` shows reads only). The defect is that the founder will read the code comment, not the artifact, and the comment omits the residue. Copy the two paths into the `@lore`.

**W3 — AC7(c) is not met as written.**
"the only permitted `packages/web` diff is base-URL / route wiring — a `git diff` confined to the fetch/config layer, zero change to render logic or user-visible copy." The actual `packages/web` diff is **+1110/−285 across 42 files**, including a net-new 300-line `hooks/useAgentRunState.ts` and render-logic rewrites in `pages/AgentProfile.tsx`, `pages/WorkTeam.tsx`, `pages/WorkBet.tsx`, `settings/SettingsAgents.tsx`. The founder's J4 ruling (quoted verbatim at `services/agent-runs.ts:4-9`) authorises moving the composition into the browser and supersedes the AC in substance — but `plan.md` was not amended and nothing in the record states AC7 is now unmet as literally written. Record it or amend the AC; do not leave it looking satisfied.

**W4 — A documented N+1 optimisation was reverted, into the browser.**
`packages/web/src/hooks/useAgentRunState.ts:46-63` issues one `GET /api/tasks/:id` **per task**. The route it replaces carried an explicit `@lore AB1 S2` on `origin/main:packages/core-api/src/routes/agent-profile.ts:269-271`: *"Replaced N+1 pattern (one query per session) with a single Drizzle query that JOINs sessions with tasks."* Agent profile: 1 profile + 1 runs + up to 11 task fetches where it used to be 1 request. Team roster: 1 runs + N task fetches. `useRecipients.ts:89-94` additionally awaits the run-count fetch *after* the recipient fetch resolves, serialising two round-trips.

**W5 — Loading flicker: what the user sees, and when, changed.**
`useAgentRunState` seeds `emptyAgentRunState` and `useRosterRunState` seeds an empty map, so the agent profile paints "0 sessions · 0% success rate · idle · No sessions recorded" and the roster paints every agent idle/healthy (`DEFAULT_ROSTER_RUN_STATE`, `WorkTeam.tsx:505`) before the second round-trip lands. Previously the server-composed response arrived atomically. AC7's "what the user sees **and when** does not [change]" is not satisfied.

**W6 — Health display now fails open, silently.**
`useAgentRunState.ts:139-143` and `:236-239` both `.catch(() => setState(empty))`. A failed or slow orchestration read renders a crashed agent as healthy and idle with no error surface — no toast, no chip, no console. The degraded-health banner is a safety signal; failing it open with no indication is worse than failing it closed.

**W7 — The replacement logic is untested; every consumer mocks it out.**
`useAgentRunState.ts` (300 lines) has no test file. `packages/web/src/__tests__/WorkTeam.AB2.test.tsx:83-89` does `vi.mock("../hooks/useAgentRunState", …)` returning a fixed map; `AgentProfile.tsx:79` grew an `overrideRunState` prop that stories and tests use to bypass the hook entirely. Meanwhile ~1470 lines of route integration tests were deleted for the same behaviour (`routes/__tests__/agent-profile.integration.test.ts` −701, `AB2-teams-list-agents` −260, `AB2-team-agents` −242, `bets.session-enrichment` −266). The pure derivations survive with new coverage (`packages/shared/src/__tests__/health-signals.test.ts`, +269) — what is now untested is the hook's orchestration: active-run selection, group-by-agent, task-ref/`betId` resolution, the 10-item slice, and the error fallback.

**W8 — The new run reads are deliberately uncapped.**
`packages/agent-orchestration/src/routes/agent-orchestration-sessions.ts:130-133`: *"These reads carry no cap."* `GET /runs?agent_ids=…` returns every run row ever recorded for up to 500 agents, and the team page calls it with the whole roster on every load. The old server-side aggregate read the same rows but shipped 10 + two integers over the wire. This grows without bound.

**W9 — Session-stream authorization widened, and is now inconsistent with the thread it belongs to.**
`packages/agent-orchestration/src/services/session-stream-hub.ts:60-79`: any authenticated identity + the run exists. The builder's account of the old check is accurate (I diffed `origin/main:packages/core-api/realtime/src/ws-connection-hub.ts:184-215`): the task-backed branch admitted every authenticated principal, and only the **task-free** branch enforced correlation-user / thread-participant / same-team. So the widening is real and confined to task-free runs (assistant, routine, knowledge). The documented residue is right as far as it goes, but understates one thing: core's socket **still** enforces thread participation for `thread:<id>` (`packages/core-api/src/ws-subscribe-authorizer.ts:96`). A user who is refused the thread can now watch that same thread's assistant run — tool names plus `argsSummary` (`packages/shared/src/events.ts:362-369`) — on the other socket. Same product, two contradictory answers for the same conversation.

**W10 — Agent and team creation lost atomicity.**
`packages/core-api/src/routes/agents.ts:262-279` (`insertUser` then `writeAgentRunConfig`), `routes/teams-routes.ts:307-322` (`createTeam` then `writeTeamRunConfigDefaults`), `:449-466` (assistant stub). Each was one insert before the column move; each is two unwrapped writes now. A failure between them leaves an agent whose run config silently resolves the all-null default (builtin, `maxConcurrentSessions` 1) instead of the requested harness. `writeAgentRunConfig(exec: WriteExecutor, …)` (`agent-run-config-store.ts:121`) already accepts a transaction handle — the fix is a `db.transaction`.

**W11 — `npm run knip:production` fails; three dependencies are production-dead.**
`drizzle-orm` in `packages/agent-orchestration/filesystem-mounting/package.json:16` (new package), `@hono/node-server` in `packages/core-api/package.json:32` (unused since `serve()` moved to `remote-server`), `@hyperidle/filesystem-mounting` in `packages/core-api/package.json:40` — reachable only from `packages/core-api/src/__tests__/scaffolding-drift-guard.test.ts:51`, i.e. test-only, which this repo's standing rule calls dead. `knip:production` is not in `verify` or CI (`.github/workflows/ci.yml:104` runs plain `knip`), so it will not block the merge — but it is the repo's declared guardrail for exactly this. (The dangling `./services/run-orchestration-runtime` export it also reports is pre-existing on `main`, not this WP's.)

**W12 — The new socket duplicates a race-prone identity handoff.**
`packages/agent-orchestration/src/routes/session-stream-ws.ts:57-62`: one module-scoped `pendingIdentity` slot set in the upgrade middleware and read in `onOpen`, with the comment "safe because the middleware → onOpen handoff is synchronous. Same shape as core's socket." The middleware is `async` and `onOpen` fires on the runtime's upgrade event; two concurrent upgrades can interleave and cross identities. It is a carried-over pattern, not a new invention, but the branch now runs two copies of it, and W9's authorizer makes the mixed-up identity indistinguishable from the right one.

---

## NOTE

- **N1** `packages/core-api/src/services/__tests__/connections-provisioning-e2e.integration.test.ts:136` — `describe` still reads `"DB row -> resolveInjectedConnectionsForAgent (baked at emit) -> …"`, naming a function this WP deleted.
- **N2** `packages/agent-orchestration/run-orchestration/src/request-run-stop-for-tasks.ts:26-28` — `STOP_DISPOSITIONS` is a one-key map behind `opts: { reason: keyof typeof … }` with one caller. A `reason` parameter with one legal value is not a seam yet.
- **N3** Deleted wire fields still stubbed in e2e mocks: `activeAgentCount`/`agentHealthWarning` in `packages/web/e2e/{AG2-portfolio-arrival,ag5-dropdown,AG3-bet-authoring}.spec.ts`.
- **N4** `GET /api/tasks/:id/sessions` (404 on unknown task) became `GET /runs?task_id=` (200 `{runs:[]}`). An unknown task is no longer distinguishable from a task with no runs. Small, but a wire behaviour change not recorded anywhere.
- **N5** `scripts/composition-edge-anti-regrowth-guard.ts:497-519` only scans `packages/core-api/**` for route imports. The symmetric half of the stated rule ("neither Layer imports the other's routes") is unguarded.
- **N6** `packages/shared/src/types.ts:172-179` asserts "There is no production data, so nothing is migrated" for the removed `filesystem` scope kind. There is no CHECK constraint on `scope_kind` and no migration, so any surviving row silently reclassifies to "Shared" via `scope-labels.ts:38-42`'s fallback. The assertion is not verifiable from the code.
- **N7** `.pipeline/work/AU26/progress.json` is stale — `currentStep: "build-wave-0"`, `sizing.prs: 19`, `approvals.final: false`, and all six `founderConfirmationPoints` still `"pending"` after 20 build commits.

---

## Acceptance criteria

| # | Criterion (abridged) | Verdict | Evidence |
|---|---|---|---|
| 1 | `service_connections` one Service importer, guard-enforced, K1 bake deleted, add-after-emit test | **MET, weakly proven** | Sole importer is `packages/agent-orchestration/connections/src/{service-connection-store,held-connections-for-provisioning}.ts`; `TABLE_OWNER` repointed and `table-ownership-guard` PASS; `resolve-injected-connections-for-agent.ts` deleted; `connections-added-after-emit.integration.test.ts` proves the read. Weakened by **C1** (test bypasses the composition root) and **C2** |
| 2 | Whole-service verdict for all 15, evidenced; reverse direction confirmed once | **MET** | `service-verdicts/group{1,2,3}.md` + `git-export-rechallenge.md`; every row carries a `file:line` |
| 3 | Part-level test inside services that stay; engine, `users` columns, `WsConnectionHub` each verdicted | **MET** | `group1.md` §Part 1-3, `group3.md` per-column table, `group2.md` §realtime |
| 4 | Mount engine relocates; record + probe resolved separately | **MET** | `packages/agent-orchestration/filesystem-mounting/`; record's own verdict reached on evidence first (`group1.md:52-73`), then superseded by the founder's whole-domain ruling |
| 5 | Orchestration hosts its own session/harness route; `WsConnectionHub` verdicted | **MET** | `packages/core-api/src/app.ts` no longer imports `agent-orchestration-sessions-routes.js`; new route-import guard + fixture; `two-app-mount-session-routes.integration.test.ts` asserts zero duplicate `method+path` and canonical 404 |
| 6 | Every "relocate"/"delete" executed here, not parked | **MET but for one documented read** | Table above. The exception is `packages/core-api/src/routes/teams-routes.ts:696-709` — the roster's `sessions` read survives because it also feeds `maybeNotifyAgentError`, a shipped `agent.health.degraded` producer with no alternative. Correctly scoped down to three columns and reported in code as a blocker, not hidden. Not counted against the builders; it awaits the founder |
| 7 | Settings + live-activity behave identically; zero required frontend behavior change; `packages/web` diff confined to fetch/config wiring | **NOT MET** | **W3** (diff is render logic, not wiring), **W5** (loading behaviour changed), **W6** (fail-open health), **W4** (per-interaction request count changed). Superseded in substance by the founder's J4 ruling, but `plan.md` was never amended |

---

## What the builders' reports got wrong

1. `held-connections-for-provisioning.ts:23-33` — "strictly SAFER than the old shape". It is not; it removes the owner filter entirely (**C2**).
2. `lifecycle-propagation.ts:283-296` — "a state no normal path produces", with no mention of the two reachable paths the WP's own `policy-sibling-guard.md:74-87` documents (**W2**).
3. Both add-after-emit tests say "wired exactly as `provisioner.ts` wires it". They are hand-built mirrors; the real composition root is exercised by neither (**C1**).
4. `agent-run-read-removal.md` and the J4 commit present the UI move as behaviour-preserving. It is not: loading order, request count and error behaviour all changed (**W4-W6**).
5. AC7 is treated as satisfied. As literally written it is not (**W3**).

## Single most important finding

**C1.** This work package's own headline discovery is that a composition-root mis-wiring, hidden by an `as` cast, disabled AN2 provisioning in production for months without a single test noticing. The fix repairs the instance and leaves both the cast (`create-server.ts:496`) and the blind spot in place: neither new bake-deletion proof goes through `createServer`, and nothing asserts that `serviceConnectionResolver`, `heldConnections` or `injectedFilesystems` are the real implementations. The repo already has the pattern for this two files up (`ServerHandle.credentialResolver` + `server-factory.resolver.test.ts:87`). Until that assertion exists, the WP has replaced one stale-snapshot defect with an equally silent wiring defect, and the ACs it claims are provable only by reading `create-server.ts` by hand.

---

## Disposition (fix pass, 2026-08-04)

Commits on `pipeline/AU26`, oldest first: `a0ef9af6`, `7add9f11`, `8abc1c2a`,
`442875a3`, `f0f11efe`, `60519144`, `58a4e651`, `f9b32858`.

### CRITICAL — all three fixed

| # | Fix | Proof |
|---|---|---|
| C1 | The three provisioning ports are a **typed** `ProvisioningWiring` value instead of riding inside `as ProvisionSessionDeps` (which is `Pick<…,"db"\|"eventBus"\|"onHarnessStarted">` and erased them entirely), and are exposed on `ServerHandle` — the `ServerHandle.credentialResolver` precedent, applied. `create-server.ts:538` | New `packages/core-api/src/__tests__/server-factory.provisioning-wiring.integration.test.ts` boots the real `createServer` and asserts, against a real DB: the resolver is a `ServiceConnectionResolver` and decrypts on the two-argument call the provisioner makes (a `CredentialResolver` there returns null — the exact production bug), the held-connection reader reads live and owner-scoped, the injected-filesystem reader filters by agent. Deleting `heldConnections:` from the composition root is now a **compile error** (`TS2741`) and wiring it to an inert stub reds the test. Both verified by doing it. |
| C2 | `listHeldConnectionsForProvisioning(db, ownerUserId)` filters on `userId`. The owner is resolved by the **Application** (`create-server.ts`'s `resolveProvisioningOwnerUserId`, deterministic: oldest human, id as tiebreak) and handed down, so orchestration still reads zero core state. No human → no connections (no `u-founder` sentinel; the FK makes that the same answer). The false "strictly SAFER" `@lore` is rewritten to say what actually happened. | `connections-added-after-emit.integration.test.ts` no longer encodes the leak: a plan for one human contains that human's token and **not** the other's, in either direction, asserted on the serialised plan. **Sanity-break:** restoring the unfiltered query reds both that test and the composition-root test (`expected [ 'sc-au26-c1-owner', …(1) ] to deeply equal [ 'sc-au26-c1-owner' ]`). |
| C3 | Ten `packages/db/src/*.d.ts.map` deleted; `.gitignore` now covers `packages/*/src/**/*.d.ts.map`, `packages/*/src/**/*.js.map` and `packages/db/src/*.d.ts`, with a `@lore` naming the `tsc -p` + stale-`dist` emit. `.d.ts` stays tracked elsewhere — `vite-env.d.ts`/`window.d.ts`/`css-modules.d.ts` are real sources. | `git ls-files` clean; the emit reproduced during this pass and was ignored, not committed. |

### WARNING

| # | Disposition |
|---|---|
| W1 | **Recorded, not fixed** — `scripts/table-ownership-guard.ts`'s scan scope is AU28's work package, and this pass was told not to touch it or `UNOWNED_SHARED_TABLES`. The finding stands as written: `packages/agent-orchestration/src/` has no `package.json` and no widening, so the guard does not scan it. |
| W2 | **Fixed** — `lifecycle-propagation.ts` now names both reachable paths (`POST /api/sessions` twice; `accepted → hold → accepted` while a request is queued), states the residue (first run to finish flips the task to `review` under the second), and says why the deletion still stands. The deletion itself is unchanged — founder-ruled. |
| W3 | **Recorded** — `plan.md`'s AC7 carries an `AMENDED` block: not met as literally written, superseded in substance by the founder's J4 ruling, with the residue (two round-trips) named. |
| W4 | **Fixed** — `GET /api/tasks?ids=` batches the read (`work.list`'s `ids` filter already existed; only the route could not ask for it), and `useRecipients` now issues its two independent reads in parallel instead of serially. Tests: `tasks.batch-ids.integration.test.ts`, plus a hook test that counts the calls (8 runs → 1 task request). |
| W5 | **Fixed** — the hooks report `loading`/`ready`/`error`. The profile shows "—" and "Loading runs…" until the read settles instead of "0 sessions · 0% · No sessions recorded"; the roster shows an unknown dot and a "—" status tile instead of a full green column that re-paints. |
| W6 | **Fixed** — a failed read no longer renders as healthy: the profile shows a `role="alert"` "Run state unavailable" banner (and suppresses the health banner it can no longer compute), the roster shows neutral dots labelled "Run state unavailable". Covered by hook tests and `AgentProfile.run-state-unavailable.test.tsx`, plus a `RunStateUnavailable` story. |
| W7 | **Fixed** — `useAgentRunState.test.tsx` covers active-run selection, group-by-agent, task-ref/`betId` resolution, the 10-item slice, the batching, and the error fallback for both hooks. |
| W8 | **Recorded, not fixed** — the uncapped run reads are deliberate and documented at `agent-orchestration-sessions.ts:130-133`. A cap cannot be behaviour-preserving here: `performance.totalSessions` counts every run and `idleDurationMs` reads the newest ended run of any age, so a limit changes what the screen states. Narrowing it is a product decision about what the profile should count, not a review fix. |
| W9 | **Recorded, not fixed** — the widening is real and the contradiction with core's `thread:<id>` rule is real. It is also the residue the founder **named and accepted** on the record (`session-stream-hub.ts:22-34`), and the obvious tightening (`sourceCorrelationJson.userId === senderId` when the correlation carries one) is a change to an accepted authorization decision. That is a founder call, not a review-fix pass's. |
| W10 | **Fixed** — `POST /api/agents`, `POST /api/teams` and the assistant stub each wrap their two writes in one `db.transaction`; `insertUser` and `createTeam` widened from `HyperIdleDb` to `WriteExecutor` to accept the handle. `agent-and-team-creation-atomicity.integration.test.ts` injects a failure at the second write only and asserts no row survives — red before the fix, green after. |
| W11 | **Fixed** — `npm run knip:production` exits 0. The three production-dead dependencies are test-only and moved to `devDependencies` (`drizzle-orm` in `filesystem-mounting`, `@hono/node-server` and `@hyperidle/filesystem-mounting` in `core-api`). The dangling `./services/run-orchestration-runtime` export is pre-existing on `main` (the file is missing there too) and is left alone. |
| W12 | **Fixed** — the identity now travels on the request, in a `WeakMap` keyed by the upgrade's Hono `Context` (which `upgradeWebSocket`'s factory receives), not a module-scoped slot. `session-stream-ws.test.ts` forces the interleave (middleware A → middleware B → onOpen A) and asserts each socket subscribes under its own token's identity — red before (`expected 'user-bob' to be 'user-alice'`), green after. Core-api's socket carries the same older shape; this Layer cannot import it, so that half is a separate change. |

### NOTE

| # | Disposition |
|---|---|
| N1 | **Fixed** — the `describe` names `listHeldConnectionsForProvisioning (live at spawn)`. |
| N2 | **Recorded** — `STOP_DISPOSITIONS`' one-key map is real but harmless; collapsing it is a tidy-up with no behavioural claim attached. |
| N3 | **Recorded** — the three e2e specs still stub `activeAgentCount`/`agentHealthWarning`. Extra keys in a mock response are inert; the specs pass. |
| N4 | **Recorded** — `GET /runs?task_id=` returning `200 {runs:[]}` for an unknown task is a real wire-behaviour change from the deleted `404`. No consumer distinguishes the two, and restoring the distinction would mean orchestration reading core's `tasks`. |
| N5 | **Recorded** — the anti-regrowth guard's route-import scan is one-directional. Same file-ownership situation as W1. |
| N6 | **Recorded** — the removed `filesystem` scope kind's "no production data" claim is not verifiable from the code, as the reviewer says. |
| N7 | **Fixed** — `progress.json` updated: `currentStep`, the six founder gates marked `default-taken` with the date, the 19-PR sizing corrected to what actually happened (one branch), and this review round plus its fix disposition recorded. |
