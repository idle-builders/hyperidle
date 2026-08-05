# AU28 — round 2, recommended verdicts for the 17 unsettled rules

One verdict per row, with the argument for it. Every claim is read off the real files in `layers/`,
`framework/`, `applications/`, `tools/`, `scripts/` on branch `pipeline/AU28`
(`scratchpad/census2.json`, commit `4af3c0e6`, was used only to *find* instances; each was opened).

Read-only. Nothing in the repo was modified.

Grouped by confidence so you can accept a block at a time. **Block 1 costs nothing** — eight rows,
zero code change, green the day you adopt them. **Block 2** is five rows that each open exactly one
follow-up work package Ruling 12.3 already names. **Block 3** is the four repo-root rows, which
collapse into one rule and answer your "is a rule needed at all?" question with *no — but a
different rule is*.

Two premises in the brief turned out to be wrong on inspection; both are flagged inline and repeated
at the end.

---

## Block 1 — adopt as-is. Zero code change, green on adoption. (8 rows)

### 1.1 `layer → db:client [import]` — **prod: allowed · dev: allowed** (narrowed to the handle types)

**Reason.** Every one of the 56 production instances is a *type* import; a layer never holds a
database it constructed, it receives one and threads it into the services it composes — that is
wiring, not data access.

**Evidence.** Measured over all layer-root production files (`layers/*/src/**`, excluding `__*`,
`.test.*`, `.stories.*`), the `@hyperidle/db` symbol tally is **55 × `HyperIdleDb` + 8 ×
`WriteExecutor`** and nothing else from this surface. Both are pure TypeScript types —
`framework/db/src/connection.ts:15` (`export type HyperIdleDb = PgDatabase<…>`) and
`framework/db/src/write-executor.ts:29` (`export type WriteExecutor = HyperIdleDb | …`). The three
*value* symbols in the surface appear in exactly three production files, all Applications:
`applications/remote-server/src/create-server.ts:73,407` (`createPgliteDb`),
`applications/desktop/src/main.ts:450,452` (`createPgliteDb`),
`applications/desktop/src/migrate.ts:8,56,63` (`applyMigrations`, `isDowngrade`).

The real data access a layer performs is already caught elsewhere, completely: **all 20 production
`layer → db:table (other) [table]` instances are the three unowned tables** — `sessions` ×14
(`layers/agent-orchestration/src/routes/sessions.ts:193-362`,
`routes/agent-orchestration-sessions.ts:98-206`, `services/session-stream-hub.ts:73`), `userSkills`
×5 (`layers/core-api/src/routes/users.ts:244,312,324,330`,
`services/routine-scheduler-bindings.ts:76`), `propagationLog` ×1
(`layers/core-api/src/service-bootstrap.ts:136`). All three are on Ruling 12.2's completeness list.
So the table rule owns 100% of layer-root querying; `db:client` need not carry any of it.

The remaining layer-root use of the handle is `db.transaction(cb)`, and every site opens one
transaction spanning **two or more service calls** — `layers/core-api/src/routes/teams-routes.ts:265`
(`createTeam` + `writeTeamRunConfigDefaults`), `routes/bets.ts:924` (`listKnowledgeItems` +
`work.update` + `getKnowledgeItem`), `routes/knowledge.ts:890`, `routes/threads.ts:1070,1155,1213,1440`,
`routes/agents.ts:270`, `routes/sessions-routes.ts:167`. Cross-service atomicity is a thing only a
composition root can do.

**Rule text.** *A Layer may import the database handle TYPES (`HyperIdleDb`, `WriteExecutor`) in
order to thread a handle it was given. Constructing, migrating or downgrading a database is
Application-tier.*

**If you accept.** Nothing changes. Zero violations today, in either world.

**Follow-up implied.** None of its own. The `sessions` / `userSkills` / `propagationLog` ownership
work is already Ruling 12.3's.

**Free consistency amendment (optional).** The same narrowing is green for
`service → db:client [import]` (84p, which you ruled `allowed` in round 1) — no service imports a
value from this surface either. Adopting it there too gives one sentence covering both roles: *only
an Application constructs a database.*

---

### 1.2 `service → framework/db [manifest]` — **prod: allowed · dev: allowed**

**Reason.** The brief's premise is wrong: these are not phantom declarations. All 18 are backed by
real production imports.

**Evidence.** Per-package measurement of declaring services and the count of their production source
files importing `@hyperidle/db`: `run-orchestration` 12, `knowledge` 15, `work` 11, `policy` 7,
`users` 7, `notifications` 6, `org` 6, `connections` 5, `conversation` 5, `review` 5, `routine` 4,
`settings` 4, `credentials` 3, `filesystems` 3, `tool-handlers` 3, `agent-run-config` 3,
`filesystem-mounting` 2, `session-requests` 2. Manifest sites are
`layers/core-api/*/package.json:14` and `layers/agent-orchestration/*/package.json:14-15`.
The one service that does **not** declare it — `@hyperidle/harness-registry`
(`layers/agent-execution/harness-registry/package.json`, deps: `shared`, `@modelcontextprotocol/sdk`,
`hono`, `zod`) — also does not import it; its only two mentions are comments at
`src/tool-registry.ts:16,21`. **Zero declared-but-unimported, zero imported-but-undeclared.**

**Rule text.** *A manifest row grants only the right to declare a dependency. It cannot express a
surface (`@hyperidle/db` names the whole package), so what may actually be imported is decided
entirely by the surface rows at the import site.*

**If you accept.** Nothing changes.

**Follow-up implied.** None.

---

### 1.3 `layer → framework/db [manifest]` — **prod: allowed · dev: allowed**

**Reason.** Two of the three are the composition roots that thread the handle and import `db`
heavily; the third is a devDependency the census mis-attributes to production.

**Evidence.** `layers/core-api/package.json:35` and `layers/agent-orchestration/package.json:17` are
in `dependencies` and back 48 + 8 production `db:client` imports respectively.
`layers/core-ui/package.json:29` is in **`devDependencies`**, and its only consumers are
`layers/core-ui/__scripts__/ah1-test-server.ts:27-28`, `ah5-test-server.ts:37-38`,
`ah6-test-server.ts:45-46` — all development by the `__` clause. The shipping UI imports `db` nowhere
(`layers/core-ui/src/hooks/useNotifications.ts:8` states it: *"It does NOT import from @hyperidle/db
— all data flows through the HTTP API"*).

**If you accept.** No code change. **One lint change:** a `devDependencies` manifest row belongs to
the development world. Today the census reads `dependencies` + `devDependencies` +
`peerDependencies` into one bucket and files the result under the production kind of the
`package.json` file, which is why core-ui shows up here as production. Fix it or this row will
always carry one phantom.

**Follow-up implied.** None (census fix, in AU28 itself).

---

### 1.4 `layer → db:testing [import]` — **prod: forbidden (delete the row) · dev: allowed**
### 1.5 `service → db:testing [import]` — **prod: forbidden (delete the row) · dev: allowed**

**Reason.** On the production side these are the same rule seen twice, and the enforced rule already
owns it. What is genuinely left is the development-world question, and the answer there is obviously
yes — a shared test fixture is exactly what this surface is.

**Evidence.** `db:testing` is `framework/db`'s three subpaths — `package.json:9-11`:
`"./test-fixtures": "./src/__testing__/test-fixtures.ts"`, `"./testing": "./src/__testing__/test-utils.ts"`,
`"./test-pool": "./src/__testing__/test-pool.ts"`. Every target file sits under `__testing__/`, so it
is **development by the `__` clause of Ruling 9 step 1**. A production file importing one is
therefore already `→ development file [import]`, the single rule the lint enforces today
(`scripts/rules/no-production-imports-development.ts`). Both `db:testing` rows are at **prod 0**, and
so are all four `E.* → development file` rows.

The 64 development instances are ordinary fixture use:
`layers/agent-orchestration/src/services/__tests__/session-stream-hub.integration.test.ts:19`
(`import { test as dbTest } from "@hyperidle/db/test-fixtures"`),
`layers/core-api/src/__testing__/vitest-setup.ts:6` (`warmPool`),
`layers/core-api/src/__tests__/bets.integration.test.ts:2` (`createTestDb`), and 61 more across 16
service packages. The symbols reported as `test` / `describe` / `expect` / `afterEach` are vitest
helpers re-exported by the fixture module, not separate surfaces.

**Which rule should own it.** `→ development file [import]` — the enforced rule, file-kind based, one
direction, no exceptions. Keep `db:testing` as a **census label** so you can still see the traffic,
but delete both rows from the *rule* set. Two rows saying what one enforced rule already says is how
a rule set starts drifting from itself.

**If you accept.** No code change. Two rows removed from the worksheet.

**Follow-up implied.** None. (Ruling 9's named breach here is already closed on this branch —
`framework/db/src/index.ts:180-185` records that `createTestDb`/`warmPool`/`closeAllInstances` were
moved off the production barrel behind the `./testing` subpath.)

---

### 1.6 `framework → framework [di]` — **prod: forbidden · dev: forbidden**

**Reason.** Framework is a ranked DAG, and inside a DAG there is no boundary to invert — the direct
import the rank rule already permits is strictly *less* machinery than an injected port, so DI
between framework packages is never needed and always either dead indirection or a smuggled port.

**Evidence.** The rank is real, measured from the manifests: `framework/shared/package.json` declares
**zero** `@hyperidle/*` deps (rank 0); `framework/db/package.json` and
`framework/design-system/package.json` each declare `@hyperidle/shared` only;
`framework/api-contract/package.json` declares no dependencies at all. `framework → framework/shared
[import]` is already allowed (40p). So a `shared` value handed to `db` as an argument is a weaker
coupling than the import that is already legal — allowing it adds a second, invisible channel for
nothing.

Production is **0**. All 12 development instances are one file and one dead seam:
`framework/db/src/__tests__/AK6-factory-roster.integration.test.ts:145,155,171,181,193,212,219,235,236,240,244`
passing `defaultFactoryRoster` / `minimalFactoryRoster` into `applyFactoryBootstrap`. **No production
caller passes a roster** — every production call is arity-1: `applications/desktop/src/main.ts:454`,
`framework/db/src/setup-cli.ts:160`, `framework/db/src/bootstrap-pg.ts:21`,
`framework/db/src/__testing__/seed-pg-cli.ts:17`. Ruling 9 step 6 already schedules the seam, the
`roster?` parameter (`framework/db/src/factory-bootstrap.ts:102-104`) and this test file for deletion.

**If you accept.** No code change now; the 12 warn rows go to zero when Ruling 9 step 6's deletion
lands. This is exactly Ruling 12's shape — the rule states the end state, the dial says warn.

**Follow-up implied — and this is the row's real value.** DI between framework packages is not where
the danger is; **a port interface parked in `framework/shared` is.** A port whose implementer and
consumer sit in different Layers, declared in shared, is a cross-Layer DI channel that no
import-based check can see, because both sides legally import `shared`. Add a completeness rule —
*`framework/shared` holds data types and pure helpers, never a port interface whose implementer and
consumer are in different Layers* — and open a WP to audit the eight candidates:
`AgentWorkIntentRecorder` (`framework/shared/src/agent-work-intent-recorder.ts:343`), `HarnessPort`
(`harness-port.ts:151`), `ProposedCallWorkflowPort` (`tool.ts:172`), `HarnessAdapter`
(`harness/harness-adapter.ts:322`), `GitRunner` (`git/git-runner.ts:47`), `ObservabilityAdapter`
(`observability/types.ts:11`), `EventBusAdapter` (`events.ts:660`).

---

### 1.7 `layer → framework/design-system [import]` — **prod: forbidden · dev: forbidden**
### 1.8 `layer → framework/design-system [manifest]` — **prod: forbidden · dev: forbidden**

**Reason.** Forbidding the general row makes the named `core-ui` row the only door, which is what you
want; the three other Layers are server-side and importing React primitives into them is a category
error, so the rule costs nothing.

**Evidence.** 0 production / 0 development on the general rows. `core-ui` is already settled and
named — `N.coreui.designsystem.import` 61p / 57d, `N.coreui.designsystem.manifest` 1p (Ruling 11.3).
`core-ui` is the only Layer with a browser surface; `layers/core-api`, `layers/agent-orchestration`
and `layers/agent-execution` are all Node-hosted.

**What this means procedurally.** Under the census's own collapse principle a forbidden cell with
zero instances is the *default* and earns no row. So the honest outcome is not "write a forbidden
row" — it is **the general row disappears and the named `core-ui` row is the whole rule**. That is
also the cheapest thing to maintain.

**If you accept.** No code change. Two rows collapse.

**Follow-up implied.** None — but note the dependency: Ruling 11's open question (*"web … will
anyhow be split and just become the framework"*) re-points the named row when it lands.
Forbidden-by-default plus one named door survives that unchanged, which is a second argument for it.

---

## Block 2 — adopt; each opens exactly one follow-up work package. (5 rows)

### 2.1 `layer → db:util [import]` — **prod: forbidden · dev: forbidden**
### 2.2 `application → db:util [import]` — **prod: forbidden · dev: forbidden**

**Reason.** Ruling 12 is categorical — the rule states the end state, and in the end state `db:util`
does not exist. Blessing it for any role is how the move never happens.

**Evidence.** None of the three symbols touches a database. `escapeLikePattern`
(`framework/db/src/like-escape.ts:20`) is a pure string function in a file with zero imports.
`resolveAgentScaffoldSpecs` (`framework/db/src/agent-scaffold.ts:48`) says so in its own docblock at
`:44` — *"Pure — no DB access, no injected deps"*; `agent-scaffold.ts:8-14` records that it landed in
`db` only because `db` "already owns `system-prompt-templates.ts`". `resolveProfile`
(`framework/db/src/profiles.ts:62`) is deployment configuration — driver, default URL, sandbox
adapter, ports — in a file with zero imports.

The 5 layer instances: `layers/core-api/src/routes/assistant.ts:25` and `teams-routes.ts:28`
(`resolveAgentScaffoldSpecs`), `routes/search.ts:25`, `routes/threads.ts:27`, `routes/users.ts:2`
(`escapeLikePattern`). The 1 application instance:
`applications/remote-server/src/create-server.ts:72` (`resolveProfile`) — needed at boot to decide
how to construct the server, a legitimate need that is only a `db` import because the profile record
happens to carry `dbDriver` and `dbUrlDefault`.

**⚠️ This is the one place I am recommending you overturn yourself.** Round 1 ruled
`service → db:util [import]` = **allowed** ("assume necessary — check"). The check says: necessary,
yes; a database surface, no. Ruling 12.3 lists *"move `db:util` out of `db`"* as required follow-up
and says **"None of these may be written into the rule set as a permitted state."** Ruling 12 is
later and general. Recommend forbidding all three roles — layer, service **and** application — so
the rule set is internally coherent. The service instances are
`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:22`,
`layers/core-api/knowledge/src/knowledge-repository.ts:19`,
`layers/core-api/users/src/user-store.ts:30`, `layers/core-api/work/src/work-service.ts:42`.
If you keep `service` allowed instead, say so explicitly — the consequence is that one role is
permanently blessed to import a surface the other two are forbidden, and the migration loses its
forcing function.

**If you accept.** Nothing changes today; 10 production instances warn.

**Follow-up WP.** Move `like-escape.ts`, `profiles.ts` and `agent-scaffold.ts` to
`@hyperidle/shared`. Direction is clean and nothing inverts — `shared` is already a dependency of
`db` (`framework/db/package.json`). `resolveAgentScaffoldSpecs` moves with (or after)
`system-prompt-templates.ts`, its only non-bootstrap caller inside `db`
(`agent-scaffold.ts:60,73`). When it lands, all three rows and the `db:util` surface delete
themselves — the outcome that needs no policing.

---

### 2.3 `tooling → db:schema-ns [import]` — **prod: forbidden · dev: forbidden.** Ruling 11.2 wins, and Ruling 7 loses nothing.

**Reason.** The census flags this as a live conflict between two binding rulings. It dissolves on
inspection: **not one instance in the repo uses the namespace to reach a table.**

**Evidence.** All 8 `db:schema-ns` instances repo-wide — 2 tooling, 6 development in `core-ui` — are
`drizzle(client, { schema })`, i.e. constructing a Drizzle handle:
`tools/eval/src/runner.ts:14` → used only at `:71`;
`layers/core-ui/__scripts__/ah1-test-server.ts:28` → `:52`; `ah5-test-server.ts:38` → `:63`;
`ah6-test-server.ts:46` → `:92`. **Zero `schema.<table>` references exist anywhere outside
`framework/db/src`.** The bench that actually needs a table imports it by name —
`tools/eval/src/runner.ts:175`, `const { bets } = await import("@hyperidle/db")`.

So Ruling 7 (a bench may seed the database) and Ruling 11.2 (`db:schema-ns` forbidden everywhere —
one symbol hands all 45 tables through, defeating any name-based ACL) are not actually in tension.
Ruling 7 grants table access; the namespace is not how a bench gets it. Forbidding the namespace
touches nothing Ruling 7 protects — it moves Ruling 7's headline number by exactly one, which the
census already warned about.

**If you accept.** 2 development instances warn.

**Follow-up WP.** `framework/db` exports an in-memory handle factory that binds `schema` internally —
the same shape `createPgliteDb(dataDir)` (`framework/db/src/connection.ts:71`) already uses for the
on-disk case and `createTestDb()` (`framework/db/src/__testing__/test-utils.ts:141`) for the pooled
test case. The four hand-rolled `new PGlite()` + `drizzle(…, {schema})` + `migrate()` bootstraps
collapse onto it, and then `export * as schema` (`framework/db/src/index.ts:32`) — the single line
that creates the surface — can be deleted. The surface stops existing; no rule has to police it.

---

### 2.4 `service → agent-execution [api]` — **prod: forbidden · dev: allowed**
### 2.5 `layer → agent-execution [api]` — **prod: forbidden · dev: allowed**

**Reason.** Neither production instance is a dial, and the thing that *is* happening — a package in
one Layer hard-coding a route path declared in another — is exactly what AU26's locked design will
silently break. Rule it forbidden as the end state and close it with a two-line change, not an
exception.

**Evidence, production.** `layers/agent-orchestration/run-orchestration/src/provisioner.ts:1349`
builds the string `${mcpBaseUrl}/api/mcp/${bridge.token}` and writes it into the sandbox's
`.mcp.json`; three more sites do the same (`:1419`, `:1449`, `:1462`) for the CLI dialect config and
the env. It never sends a request. `mcpBaseUrl` arrives injected from
`applications/remote-server/src/create-server.ts:552,608,725,742`. The route it names is declared in
the other Layer — `layers/agent-execution/harness-registry/src/mcp/mcp-route.ts:36-51` — and today it
is hosted by neither Layer but by the Application (`create-server.ts:788`,
`api.route("/", mcpBridgeRegistry.router)`). When AU26's design lands and `agent-execution` exports
its own app for the Application to mount the way it already mounts the other two
(`create-server.ts:800-801`), the base moves and `provisioner.ts` breaks with no compile error.

**Evidence, development.** All 14 instances are one file —
`layers/core-api/src/__tests__/real-harness-return-enforcement-realbinary.integration.test.ts:380…1352`
— a real-binary test standing in for a harness.

**Rule text (act-based, so it reads the same for both roles).** *`/api/mcp/:token` is a harness
process's door. No production package may name or dial an `agent-execution` route path. A
development file standing in for a harness may dial it.*

Re-derived, not inherited (Ruling 10): the MCP router's only client is an out-of-process holder of a
per-session token (`mcp-bridge.ts:125` mints 64 hex chars; `mcp/index.ts:44` 401s an unknown token).
A test that verifies the router must therefore *be* that client. A rule forbidding it forces the test
to stub the router, which makes the test prove nothing about the router.

The asymmetry with `layer → MCP router [mcp]` (forbidden, 11 dev) is real and correct, not an
oversight: those instances **construct and mount** the bridge in-process
(`layers/core-api/src/__tests__/mcp-bridge-registry.test.ts:39,51,69`,
`AL7-two-session-trust-first.integration.test.ts:295`), which is a different act from dialling its
door.

**Interim.** Warn. 1 production instance.

**Closer — small, and it removes the row rather than excusing it.** Have `bridge.open()` return
`{ token, url }` instead of `{ token }`. `layers/agent-execution/harness-registry/src/mcp/mcp-bridge.ts:119-125`
already mints the token and is the only code that knows the route shape. The provisioner then writes
a URL it was handed and never constructs an `agent-execution` path. Do it with the AU26 follow-up
(*"give `agent-execution` its own app so it hosts the MCP router"*, Ruling 12.3), because the same WP
is what moves the base.

**Follow-up WP.** AU26's locked design — `agent-execution` exports an app carrying the MCP router;
the Application mounts it. That single move also closes `application → MCP router [mcp]` (2p) and
the `layers/core-api/src/services/tool-provider-bindings.ts:20-22` three-Layer reach-through.

---

## Block 3 — the four repo-root rows collapse into one rule. (4 rows)

### 3.1 `repo root → layer [import]` — **prod: allowed · dev: allowed**
### 3.2 `repo root → tooling [import]` — **prod: allowed · dev: allowed**
### 3.3 `layer → repo root [import]` — **prod: forbidden · dev: forbidden**
### 3.4 `framework → repo root [import]` — **prod: forbidden · dev: forbidden**

**Your question was: is a rule needed at all, or should the role simply be out of scope?**
**Answer: the *role* should be out of scope — but a different rule is needed, and it is better than
these four.**

**Why the role should go.** "Repo root" is a pseudo-role derived purely from a path, which is the
exact inference Ruling 5 forbids. It is not a workspace package, so Ruling 11.1's "rules live at the
role level" has nothing to attach to. And every file under it is development by Ruling 9 step 1
(outside a workspace package) — confirmed by the census: all four rows are at production 0.

**Why the rows still can't just be deleted — two of them carry real signal.**

*`framework → repo root` (13 dev).* `framework/db` and `framework/api-contract` host the unit tests
for repo-root scripts. `framework/db/src/__tests__/au28-governance-lint.test.ts:17-19,28-30` imports
`../../../../scripts/lib/{governance-fixtures,governance-rules,repo-census}.js` and
`../../../../scripts/rules/{classification-total,no-production-imports-development,pattern-live}.js`;
same shape at `ar1-attestation-floor.test.ts:29`, `ar1-harness-predicate.test.ts:24`,
`ar2-per-harness-floor.test.ts:19`, `at1-attestation-scope.test.ts:23`,
`at1-harness-symmetry.test.ts:17`, and `framework/api-contract/src/__tests__/dep-manifest-verdict.test.ts:13`,
`typecheck-verdict.test.ts:25`. **They live there because there is nowhere else:** `vitest.config.ts:17-49`
has one project per workspace package and none for the repo root. AU28's own governance lint is
tested from inside the database package. That is the smell.

*`layer → repo root` (1 dev) + 2 of `repo root → layer` (12 dev).* `scripts/validation-composition.ts:1,5`
composes `../layers/core-ui/__e2e__/support/validation-contract.js` and `review-trust.js`, and
`layers/core-ui/src/__tests__/review-trust.test.ts:13` imports it straight back. A root script parked
in the middle of one Layer's own e2e support, with the Layer reaching back out for it.

**The rule I would actually write instead.** *A cross-package reference goes by package name. A
relative path that leaves its own package directory is forbidden — in both worlds.*

Measured tail, repo-wide: **4 production + 28 development instances.** Production:
`layers/core-api/src/service-bootstrap.ts → ../knowledge/src/relevance-listener.js` (a Layer root
bypassing `@hyperidle/knowledge`'s barrel — a bonus catch, and a real one),
`scripts/mock-inventory.ts:18 → ../tools/eslint-plugin-design/src/mock-data-policy.js`, and the two
`scripts/validation-composition.ts` lines. Development: 11 `framework/db → repo root`, 10
`repo root → core-ui`, 2 `framework/api-contract → repo root`, 2 `core-api → harness-registry`, plus
three singletons. `eslint.config.ts:10-11` stays legal because it imports `eslint-plugin-authz` and
`eslint-plugin-design` **by package name** — which is the distinction the rule is built on, and it is
also the distinction that makes it survive Ruling 9 step 2's folder move.

One rule, mechanically checkable, no "repo root" actor required, closes every real instance in all
four rows plus one production barrel bypass.

**If you accept the four rows as written above** (outward allowed, inward forbidden — the same
two-cell shape Ruling 12.2 gave the table rule): no code change today, 14 development instances warn.

**Census scope note, not a verdict.** 10 of the 12 `repo root → layer` instances are
`.pipeline/work/AU20/design/current-contract/real-stories/*.stories.tsx` — design artifacts from a
past work package, swept in because the census file set is `git ls-files`
(`scratchpad/census2.ts:45`). Scope the census to source roots (`layers/`, `framework/`,
`applications/`, `tools/`, `deploy/`, `scripts/`, plus root config). `.pipeline/` and `plans/` are
pipeline state, not code, and governing them is noise that will make the ratchet unreadable.

**Follow-up WPs.**
1. Move `scripts/lib/**` and `scripts/rules/**` into a `tools/` package with its own vitest project,
   and move the 13 tests with them. Closes `framework → repo root` entirely and gives the governance
   lint a home where it is tested next to itself.
2. Move `scripts/validation-composition.ts` into `layers/core-ui/__e2e__/support/` — it composes two
   modules that already live there. Closes `layer → repo root` and 2 of `repo root → layer`.
3. Narrow the census file set (do this inside AU28 — it is a lint-scope fix).

---

## Two premises in the brief that the code contradicts

1. **"`framework/db [manifest]` with zero imports … a manifest with no import is a lie."** Not the
   case. All 18 service declarations and 2 of the 3 layer declarations are backed by real production
   imports; the third is a devDependency serving development files. There are **zero** phantom `db`
   declarations and **zero** undeclared-but-imported `db` edges in the repo. The one package that
   might have looked like a phantom — `harness-registry` — declares nothing and imports nothing.
   Nothing to strip.

2. **"`db:client` — should a *layer* hold a DB handle at all?"** It does not hold one. It holds a
   *type*. 55 `HyperIdleDb` + 8 `WriteExecutor`, and not a single value symbol from the surface in
   any layer file. The value symbols exist in three Application files and nowhere else.

## The one inconsistency I could not avoid

`service → db:util [import]`, which you ruled **allowed** in round 1, has to become **forbidden** for
the rule set to be coherent with Ruling 12.3. See §2.1. If you prefer to keep it allowed, the rule
set still functions — it just blesses one role's access to a surface that is scheduled to stop
existing, and the migration loses its forcing function.

---

## Ready to paste — worksheet export shape

```json
{
 "au28Rulings": true,
 "census": "4af3c0e6",
 "at": "2026-08-05",
 "round": 2,
 "scope": "the 17 unsettled rules — agent recommendations, founder to accept or overturn",
 "rules": [
  {"from":"layer","to":"db:client","via":"import","prod":"allowed","dev":"allowed","why":"All 56 production instances are TYPE imports — 55 HyperIdleDb + 8 WriteExecutor, both pure TS types (connection.ts:15, write-executor.ts:29). No layer imports a value from this surface; createPgliteDb/applyMigrations/isDowngrade appear only in remote-server/create-server.ts:407 and desktop/main.ts:452 + migrate.ts:8. The layer receives a handle and threads it into the services it composes; db.transaction() sites (teams-routes.ts:265, bets.ts:924, knowledge.ts:890) each span 2+ service calls, which only a composition root can do. All 20 real layer-root table accesses are the 3 unowned tables and are already forbidden by the table rule. Narrow to the handle TYPES: constructing or migrating a database is Application-tier."},
  {"from":"service","to":"framework/db","via":"manifest","prod":"allowed","dev":"allowed","why":"Not phantoms — all 18 declaring services import @hyperidle/db in production source (run-orchestration 12 files, knowledge 15, work 11, ... session-requests 2). The one service that does not declare it, harness-registry, does not import it either (comments only, tool-registry.ts:16,21). Zero declared-but-unimported, zero imported-but-undeclared. A manifest cannot express a surface, so it grants only the right to declare; what may be imported is decided at the import."},
  {"from":"layer","to":"framework/db","via":"manifest","prod":"allowed","dev":"allowed","why":"core-api/package.json:35 and agent-orchestration/package.json:17 are honest dependencies backing 48 + 8 db:client imports. The third, core-ui/package.json:29, is a devDependency whose only consumers are core-ui/__scripts__/ah{1,5,6}-test-server.ts — a development instance the census files as production. Fix the census to attribute devDependencies to the development world."},
  {"from":"layer","to":"db:testing","via":"import","prod":"forbidden","dev":"allowed","why":"Same rule seen twice on the production side: db:testing resolves into framework/db/src/__testing__/** (package.json:9-11), which is development by the __ clause, so a production importer is already caught by the enforced '-> development file' rule. Prod is 0 today. DELETE this row from the rule set and let the enforced rule own it; keep db:testing as a census label. The 11 development instances are ordinary shared-fixture use."},
  {"from":"service","to":"db:testing","via":"import","prod":"forbidden","dev":"allowed","why":"Identical to the layer row — prod 0, and the enforced '-> development file' rule already owns the production side. The 53 development instances across 16 service packages are shared test fixtures (e.g. session-stream-hub.integration.test.ts:19, import { test as dbTest } from '@hyperidle/db/test-fixtures'), which is exactly what the subpath exists for. Delete the row, keep the label."},
  {"from":"framework","to":"framework","via":"di","prod":"forbidden","dev":"forbidden","why":"Framework is a ranked DAG (shared declares zero @hyperidle deps; db and design-system declare only shared; api-contract declares none) and framework -> framework/shared [import] is already allowed. Inside a DAG there is no boundary to invert, so an injected port is strictly more machinery than the import already permitted. Production 0. All 12 development instances are AK6-factory-roster.integration.test.ts:145-244 passing a roster into applyFactoryBootstrap; no production caller passes one (desktop/main.ts:454, setup-cli.ts:160, bootstrap-pg.ts:21 are all arity-1) and Ruling 9 step 6 already schedules the seam for deletion. Companion rule needed: framework/shared may hold data types and pure helpers, never a port interface whose implementer and consumer are in different Layers — that is the one cross-Layer DI channel no import check can see."},
  {"from":"layer","to":"framework/design-system","via":"import","prod":"forbidden","dev":"forbidden","why":"0/0 today, and core-ui is already the named allowed row (61p/57d, Ruling 11.3). The other three Layers are Node-hosted; importing React primitives into them is a category error. Forbidding the general row makes the named core-ui row the only door and costs nothing. Under the collapse principle this cell is the default and should simply carry no row."},
  {"from":"layer","to":"framework/design-system","via":"manifest","prod":"forbidden","dev":"forbidden","why":"Same as the import row: 0/0, with core-ui named and allowed (1p). Collapse the general row; the named door is the whole rule."},
  {"from":"layer","to":"db:util","via":"import","prod":"forbidden","dev":"forbidden","why":"Ruling 12: the rule states the END STATE, and in the end state db:util does not exist. None of the three symbols touches a database — like-escape.ts:20 is a pure string function with zero imports, agent-scaffold.ts:44 says 'Pure — no DB access' in its own docblock, profiles.ts:62 is deployment config with zero imports. The 5 instances (assistant.ts:25, search.ts:25, teams-routes.ts:28, threads.ts:27, users.ts:2) warn until the files move to @hyperidle/shared."},
  {"from":"application","to":"db:util","via":"import","prod":"forbidden","dev":"forbidden","why":"One instance, remote-server/create-server.ts:72 importing resolveProfile — a real boot-time need that is only a db import because the profile record carries dbDriver and dbUrlDefault. Ruling it allowed freezes a misfiling; the relocation to @hyperidle/shared is the answer and Ruling 12.3 already requires it. NOTE: for coherence this also revises the round-1 'allowed' on service -> db:util (4 instances: tool-definitions.ts:22, knowledge-repository.ts:19, user-store.ts:30, work-service.ts:42) — otherwise one role is permanently blessed to import a surface scheduled to stop existing."},
  {"from":"tooling","to":"db:schema-ns","via":"import","prod":"forbidden","dev":"forbidden","why":"The Ruling 7 vs Ruling 11.2 conflict dissolves: all 8 db:schema-ns instances repo-wide are drizzle(client, { schema }) constructing a handle (eval/runner.ts:14 used at :71; core-ui/__scripts__/ah1:28->52, ah5:38->63, ah6:46->92). ZERO use schema.<table> to reach a table — the bench that needs a table imports it by name (runner.ts:175). So 11.2 wins and Ruling 7 loses nothing but one instance off its headline count. Follow-up: db exports an in-memory handle factory that binds schema internally, then 'export * as schema' (index.ts:32) can be deleted and the surface stops existing."},
  {"from":"service","to":"agent-execution","via":"api","prod":"forbidden","dev":"allowed","why":"The single production instance is not a dial: provisioner.ts:1349 (also :1419, :1449, :1462) builds '${mcpBaseUrl}/api/mcp/${token}' as a string and writes it into the sandbox's .mcp.json. The defect is that a package in agent-orchestration hard-codes a route declared in agent-execution (mcp-route.ts:36-51) — when AU26's design lands and agent-execution hosts its own app, the base moves and this breaks with no compile error. End state: no production package may name or dial an agent-execution route path; the door's only caller is a harness process holding a per-session token. Closer: bridge.open() returns { token, url } instead of { token } (mcp-bridge.ts:119-125 already knows the route shape). Warn until then."},
  {"from":"layer","to":"agent-execution","via":"api","prod":"forbidden","dev":"allowed","why":"Production 0. All 14 development instances are one file — core-api/src/__tests__/real-harness-return-enforcement-realbinary.integration.test.ts:380-1352 — standing in for a harness. Re-derived from first principles, not inherited: the MCP router's only client is an out-of-process token holder (mcp-bridge.ts:125 mints the token, mcp/index.ts:44 401s an unknown one), so a test that verifies the router must BE that client; forbidding it forces a stub, and a stubbed router proves nothing about the router. The asymmetry with layer -> MCP router [mcp] (forbidden, 11 dev) is correct: those instances construct and mount the bridge in-process, a different act from dialling its door."},
  {"from":"repo root","to":"layer","via":"import","prod":"allowed","dev":"allowed","why":"Build configuration at the repo root composes the repo — that is what a config file is, and forbidding it breaks the build. Production is 0 by construction (everything outside a workspace package is development, Ruling 9 step 1). But 10 of the 12 instances are .pipeline/work/AU20/design/.../real-stories/*.stories.tsx, swept in because the census file set is `git ls-files` (census2.ts:45) — scope the census to source roots. The other 2 are scripts/validation-composition.ts:1,5 reaching into layers/core-ui/__e2e__/support/, which the cross-package-relative-import rule below should catch instead."},
  {"from":"repo root","to":"tooling","via":"import","prod":"allowed","dev":"allowed","why":"eslint.config.ts:10-11 imports eslint-plugin-authz and eslint-plugin-design BY PACKAGE NAME — legitimate and unavoidable; the lint cannot run otherwise. The third instance, scripts/mock-inventory.ts:18, reaches ../tools/eslint-plugin-design/src/mock-data-policy.js by relative path, bypassing the package barrel — that is the thing worth forbidding, and it is a path-shape rule, not a role rule."},
  {"from":"layer","to":"repo root","via":"import","prod":"forbidden","dev":"forbidden","why":"A package must never reach out of the workspace into an un-roled root file — if the code is worth importing it is worth being a package. One instance: core-ui/src/__tests__/review-trust.test.ts:13 importing ../../../../scripts/validation-composition.js, which itself composes two modules that already live in layers/core-ui/__e2e__/support/. Follow-up: move validation-composition.ts into that support folder and both directions close."},
  {"from":"framework","to":"repo root","via":"import","prod":"forbidden","dev":"forbidden","why":"13 instances, all the same smell: framework/db and framework/api-contract host the unit tests for repo-root scripts (au28-governance-lint.test.ts:17-19,28-30 imports scripts/lib/* and scripts/rules/*; also ar1-attestation-floor.test.ts:29, at1-attestation-scope.test.ts:23, dep-manifest-verdict.test.ts:13, typecheck-verdict.test.ts:25). They live there because vitest.config.ts:17-49 has a project per workspace package and none for the repo root — AU28's own governance lint is tested from inside the database package. Follow-up WP: move scripts/lib/** and scripts/rules/** into a tools/ package with its own vitest project and take the 13 tests with them."}
 ],
 "companionRules": [
  {"from":"any package","to":"any other package","via":"import","prod":"forbidden","dev":"forbidden","why":"PROPOSED, replaces the four repo-root rows: a cross-package reference goes by PACKAGE NAME; a relative path that leaves its own package directory is forbidden. Measured tail repo-wide is 4 production + 28 development. Production: core-api/src/service-bootstrap.ts -> ../knowledge/src/relevance-listener.js (barrel bypass), scripts/mock-inventory.ts:18, scripts/validation-composition.ts:1,5. eslint.config.ts:10-11 stays legal because it uses package names. One rule, no 'repo root' actor needed, closes every real instance in all four repo-root rows plus one production barrel bypass, and survives Ruling 9 step 2's folder move."},
  {"from":"framework/shared","to":"cross-layer port interface","via":"di","prod":"forbidden","dev":"forbidden","why":"PROPOSED completeness rule surfaced by the framework -> framework [di] row: a port interface declared in framework/shared whose implementer and consumer sit in different Layers is a cross-Layer DI channel that no import-based check can see, because both sides legally import shared. Audit candidates: AgentWorkIntentRecorder (agent-work-intent-recorder.ts:343), HarnessPort (harness-port.ts:151), ProposedCallWorkflowPort (tool.ts:172), HarnessAdapter (harness/harness-adapter.ts:322), GitRunner (git/git-runner.ts:47), ObservabilityAdapter (observability/types.ts:11), EventBusAdapter (events.ts:660)."}
 ]
}
```
