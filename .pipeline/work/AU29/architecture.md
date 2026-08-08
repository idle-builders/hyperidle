# AU29 — Architecture: the framework stops acting

Authority: `.pipeline/work/AU29/plan.md` (outcomes, ACs, scope) and
`.pipeline/work/AU29/requirements.md` (settled nouns; §4 legality lattice binding). This plan adds no
outcome. Tier: production. Everything below was verified against this worktree (branch
`pipeline/AU29` @ `f9b0dbe1`, code identical to `origin/main` @ `bbe82e9a`); feasibility probes ran
live — results in `feasibility.md` alongside this file.

Three factual slips in requirements.md, re-derived per the refine critique — the corrected facts
govern here:

1. **Five** (not three) service files hold legal `db:util` imports today:
   `layers/core-api/knowledge/src/knowledge-repository.ts`, `layers/core-api/users/src/user-store.ts`,
   `layers/core-api/work/src/work-service.ts`, `layers/core-api/work/src/dependency-watcher.ts`
   (all `escapeLikePattern`) and `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts`
   (`resolveAgentScaffoldSpecs` — `tool-definitions.ts:22` import, uses at `:1037,1132`).
2. `layers/core-api/src/routes/agents.ts:32` imports **only** `readSystemPromptTemplateForRole`;
   `SYSTEM_PROMPT_TEMPLATE_FILES` appears there only in comments. `SYSTEM_PROMPT_TEMPLATE_FILES`
   therefore needs its own production consumer post-move (§2.3 below provides one) or it becomes a
   knip-dead export.
3. `toolsForRole`'s real callers are `layers/core-api/src/services/tool-provider-bindings.ts:65`,
   `layers/agent-execution/harness-registry/src/tool-registry.ts:70`, **and a third the requirements
   missed**: `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:1646`
   (import at `:47`). `mcp/mcp-bridge.ts:141` is a comment, not a call. All three inline (§2.7).

---

## 1. Change boundary

**Reused unchanged:** the governance engine (`scripts/lib/governance-model.ts`,
`scripts/governance-lint.ts`, the census/detectors), `framework/db`'s connection/migration/
write-executor/schema surface, `migrate-pg.ts` and the deploy migrate init-container, both
applications' server boot flows, all service internals not named below, the event bus itself and
`framework/shared/src/events.ts` (event *types* stay — `architecture.json` `eventBus.typesModule`
points at it).

**Changed:** `framework/db` loses eight modules (three to `framework/shared`, one dissolved into
layer faces, four to a new tool package); `framework/shared` gains three modules plus two constants,
loses its two bus-acting sites and one layer-wired function; two layers gain one bootstrap face
each; the owning services gain factory writers; one new tool package hosts the CLIs;
`governance/architecture.json`, `governance/decided-rules.json`, `governance/baseline.json`,
`scripts/lib/governance-attacks.ts`, `framework/db/src/__tests__/governance-model.test.ts`,
`knip.json`, `vitest*.config.ts`, root `package.json` scripts, `deploy/bin/setup`, and seven doc
files update to match.

---

## 2. End-state contracts

### 2.1 `framework/db` exports only the database

`framework/db/src/index.ts` post-state exports exactly: the `connection.ts` block (`createPgDb`,
`createPgliteDb`, `createPostgresDb`, `DbHandle`, `HyperIdleDb`, pool symbols), `applyMigrations` /
`isDowngrade` / `MigrationResult`, `WriteExecutor`, `export * as schema`, the schema
tables + row types block, and the `./zod-schemas` subpath. Deleted from the barrel (and from the
package): `resolveAgentScaffoldSpecs` block, `seedDemoWorld`, `applyFactoryBootstrap`,
`escapeLikePattern`, the `profiles.ts` block, `runSetup`/`RunSetupContext`/`RunSetupIo`, the
`system-prompt-templates.ts` block. **No re-export shim of any moved symbol** (Ruling 12 +
`scripts/rules/no-laundered-re-exports.ts`).

Files leaving `framework/db/src`: `like-escape.ts`, `profiles.ts`, `agent-scaffold.ts`,
`system-prompt-templates.ts`, `seed-fixtures.ts` → `framework/shared/src` (§2.2–2.4);
`factory-bootstrap.ts` → dissolved into the two layer faces (§2.5); `setup-cli.ts`,
`bootstrap-pg.ts`, `demo-fixture.ts`, `__testing__/seed-pg-cli.ts` → the tool package (§2.6).
`db:testing` (`__testing__/test-utils.ts`, `test-pool.ts`, `test-fixtures.ts`, `pg-test-runner.ts`)
stays — confirmed pure database machinery (requirements §3.8).

### 2.2 Pure string/config substrate → `framework/shared`, moved verbatim

- `like-escape.ts` → `framework/shared/src/like-escape.ts`. Barrel-export `escapeLikePattern`.
  Repoint seven production consumers (the five service files in the header note №1 minus
  `tool-definitions.ts`, plus `layers/core-api/src/routes/{search,threads,users}.ts`) — change the
  specifier `@hyperidle/db` → `@hyperidle/shared`, nothing else. Keep the `@lore I2 V4` comment and
  the `ESCAPE '\\'` contract comment verbatim — security-relevant escape, do not "improve".
- `profiles.ts` → `framework/shared/src/profiles.ts`, verbatim. Barrel-export **`resolveProfile`
  and `type DeploymentProfile` only** — the only symbols named outside the module
  (`applications/remote-server/src/create-server.ts:77,418`; relocated `setup-cli.ts:7`).
  `PROFILE_DEFAULTS`, `ProfileDefaults`, `DbDriver`, `SandboxAdapterKind`, `ResolveOptions` stay
  module-level exports **not** re-exported from `framework/shared/src/index.ts`: their only external
  consumers are the moved unit test (imports relatively) and nothing else (repo-grep verified). This
  is the knip-hygiene shape §8 of the requirements asks architecture to find.
  `framework/db/src/__tests__/profiles.test.ts` moves to `framework/shared/src/__tests__/`.
- `seed-fixtures.ts` constants → fold into `framework/shared/src/factory-roster.ts` (which already
  documents the display-name derivation at `factory-roster.ts:32`): `COMMUNITY_DISPLAY_NAMES`
  barrel-exported (production consumer: the core-api face, §2.5), `PRACTICE_COMMUNITIES` +
  `PracticeCommunity` kept as module-internal (not barrel-exported) — their only use is typing the
  record; repo-grep found zero external consumers. No new module; `seed-fixtures.ts` deleted.
  Correction to requirements §3.5(3): `demo-fixture.ts` does **not** import `seed-fixtures.ts`
  (verified — its imports are drizzle, connection, schema, system-prompt-templates); only
  `factory-bootstrap.ts:6` does.

### 2.3 Agent scaffold + system-prompt templates → `framework/shared`, moved together

`agent-scaffold.ts` → `framework/shared/src/agent-scaffold.ts` and `system-prompt-templates.ts` →
`framework/shared/src/system-prompt-templates.ts`, both verbatim — including the cwd-relative
`docs/system-prompts/` resolution and the closed allowlist map (`SYSTEM_PROMPT_TEMPLATE_FILES` IS
the traversal defense; requirements §3.3 forbids "improving" it). `agent-scaffold.ts`'s imports
(`AGENT_ROLE_CATALOG`, `defaultRoster` from `@hyperidle/shared`) become relative imports within
shared. This is the first `fs.readFileSync` in shared production code — settled in requirements
§3.3; the governance model has no filesystem-read rule, so nothing about it is a crossing.

Barrel exports and their production consumers (knip-safe, every one):

| symbol | production consumers post-move |
|---|---|
| `resolveAgentScaffoldSpecs`, `AgentScaffoldRequest`, `AgentScaffoldSpec` | `layers/core-api/src/routes/{users,teams-routes,assistant}.ts`, `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts` |
| `readSystemPromptTemplateForRole` | `layers/core-api/src/routes/agents.ts:32`, `agent-scaffold.ts` (in-module-family), relocated `demo-fixture.ts` (tool) |
| `SYSTEM_PROMPT_TEMPLATE_FILES` | the agent-orchestration face (§2.5.3 iterates it for the prompt backfill — exactly what `factory-bootstrap.ts:191` does today) |
| `readSystemPromptTemplate` | **none** — becomes module-internal (un-exported). Its only callers today are `factory-bootstrap.ts:192` (whose successor, the face, calls `readSystemPromptTemplateForRole` — see §2.5.3 equivalence note) and one governance attack overlay (re-anchored, §4.4). This closes the knip risk requirements §8 names. |

`framework/db/src/__tests__/agent-scaffold.test.ts` moves to `framework/shared/src/__tests__/`.
The templates half of `X3-agent-config.integration.test.ts` moves with it; the bootstrap half moves
with the factory suites (§5, task D).

### 2.4 `framework/shared` stops speaking on the bus

- **`reportAdmissionFailure` dissolves into its two callers.** The typed construction+emit
  (`framework/shared/src/agent-run-admission.ts:53-76`) is inlined at
  `layers/agent-orchestration/run-orchestration/src/runtime.ts:285` and
  `layers/agent-orchestration/session-requests/src/service.ts:749` — each site builds the
  `agent_run_admission_failed` event literal (typed by `events.ts`, which stays) and calls
  `deps.eventBus.emit(...)` itself. Carry the B4 doc comment's substance to both sites (the two
  services deliberately do not import each other — that constraint is unchanged; they now share the
  event *type*, not an emit helper). `isAgentWorkIntentKind` / `isAgentWorkIntentSourceKind` and
  all event types stay in shared (both guards have production consumers in both services —
  verified `runtime.ts:13-14,279-280`, `service.ts:25-26,746-747`). `reportAdmissionFailure` is
  removed from `agent-run-admission.ts` and from the shared barrel (`index.ts:7`).
  A service emitting is `allowed` (`governance-model.ts:249-256`, `publish-anyone-but-the-bus-host`
  — forbidden only for `source.role === "framework"`), so the two new emit sites create no
  baseline entry.
- **The observability dispatcher moves to its only wiring site.**
  `framework/shared/src/observability/dispatcher.ts` (both `createObservabilityDispatcher` and
  `registerObservabilityDispatcher` — the `bus.on("*")` at `:473`) →
  `layers/core-api/src/observability/dispatcher.ts`. `layers/core-api/src/observability-runtime.ts`
  imports it relatively instead of from `@hyperidle/shared/observability`. The dispatcher's imports
  of shared types (`DomainEvent`, `ObservabilityEvent`, `FlushOutcome`, …) become
  `@hyperidle/shared` / `@hyperidle/shared/observability` imports — all those types stay in shared
  and keep the relocated dispatcher as their production consumer.
  `framework/shared/src/observability/index.ts` drops the two dispatcher exports; everything else
  in that sub-barrel stays (verified: `observability-runtime.ts` is the sub-barrel's only external
  production consumer). The two dispatcher test files
  (`framework/shared/src/__tests__/observability-dispatcher*.test.ts`) move to
  `layers/core-api/src/observability/__tests__/`. A layer subscribing is `allowed` (same clause 4).

### 2.5 First-boot state: two layer faces + owner writers

The factory row-set is defined **once** — in the two layer faces and the owner writers they call —
and consumed by both worlds: the desktop production path calls the faces directly; the tool CLIs
call the same faces (tooling → layer face is `allowed`, `governance-model.ts:330-337`,
`reach-across-only-from-a-composition-root`). This is the "layer-face functions the tool also
calls" mechanism, chosen over a shared row-set constant because a constant would still need two
write implementations — the divergence the requirement exists to prevent. Composition in each root
is two ordered calls; everything with content lives behind the faces.

**2.5.1 Shared vocabulary.** Add to `framework/shared/src/factory-roster.ts`:

```ts
/** One factory agent the bootstrap ensured — the id/role pair the run-config backfill needs. */
export interface FactoryAgentRef {
  readonly id: string;
  readonly role: string;
}
```

Barrel-exported; production consumers: both faces. (It cannot live in either layer — the other
layer importing it would be a new `layer → layer (other)` site, which the baseline generator
refuses.)

**2.5.2 core-api face** — `layers/core-api/src/bootstrap/factory-state.ts`, barrel-exported from
`@hyperidle/core-api`:

```ts
export async function applyFactoryCoreState(db: HyperIdleDb): Promise<readonly FactoryAgentRef[]>
```

Semantics — `factory-bootstrap.ts`'s non-run-config half, verbatim in content, routed through the
owning services:

1. `system:propagation` user (insert `onConflictDoNothing`) — via the users service.
2. Roster users: `seed-agent-cos` iff `defaultFactoryRoster.systemAssistant !== null`; one
   facilitator per `roster.facilitators` entry with `name = COMMUNITY_DISPLAY_NAMES[community] ??
   community` + `" Facilitator"` — via the users service. All values byte-identical to
   `factory-bootstrap.ts:101-170` (ids, roles, categories, `status`, ISO `createdAt`).
3. `agentCategory` backfill: the `categoryByRole` update loop (`factory-bootstrap.ts:225-249`) —
   via the users service.
4. Knowledge seed: `seed-ki-1` + `seed-ksf-1` inserts `onConflictDoNothing`
   (`factory-bootstrap.ts:254-279`) — via the knowledge service. Note: NOT
   `knowledge-repository.create()` — that writer also writes `knowledgeEditLog`, which would change
   first-boot state. A dedicated factory writer with the verbatim insert pair is required.
5. Resolve and return the roster agents: select `{id, role}` from `users` where `kind='ai'` and
   `id IN` the roster id-hints — via the users service (owner reads its own table). Returning the
   *queried* rows (not the roster constant) preserves the upgrade-path semantics of
   `factory-bootstrap.ts:213-216`, where an existing row's actual role decides which template it
   gets.

New owner writers this needs (new writer code inside a table's owner is free — requirements §4):
in `layers/core-api/users/src` something like `insertUserIfAbsent(exec, values)` (insert
`onConflictDoNothing` — the existing `insertUser` at `user-store.ts:143` is a plain insert and
would throw on relaunch), `setAgentCategoryForRole(db, role, category)`, and a
`listFactoryAgents(db, ids)` reader; in `layers/core-api/knowledge/src` a
`ensureFactoryKnowledgeSeed(db, now)` writing the verbatim pair. Exact names are the builder's;
the conflict-clause semantics and the no-edit-log constraint are not.

**2.5.3 agent-orchestration face** — `layers/agent-orchestration/src/factory-run-config.ts`,
barrel-exported from `@hyperidle/agent-orchestration`:

```ts
export async function applyFactoryRunConfigDefaults(
  db: HyperIdleDb,
  rosterAgents: readonly FactoryAgentRef[],
): Promise<void>
```

Semantics — `factory-bootstrap.ts`'s run-config half:

1. AH2 runnable defaults for the system assistant (iff `defaultFactoryRoster.systemAssistant !==
   null`) and each facilitator, by roster `idHint`, via the agent-run-config service's existing
   `writeAgentRunConfig` (`agent-run-config-store.ts:121`) with the patch
   `{ harnessType: "builtin", modelId: "claude-sonnet-4-6", modelProvider: "anthropic",
   maxConcurrentSessions: 1 }`.
2. Prompt backfill: iterate `SYSTEM_PROMPT_TEMPLATE_FILES` entries; for each `(role, filename)`
   read the template via `readSystemPromptTemplateForRole(role)` (equivalent to today's
   `readSystemPromptTemplate(path.resolve(cwd,"docs"), filename)` — `ForRole` resolves the same
   `docsRoot` and indexes the same map, `system-prompt-templates.ts:80-85`); for each passed
   `rosterAgents` entry with matching `role`, `writeAgentRunConfig(db, id, { systemPrompt })`.

**Feasibility flag resolved — no plan amendment needed.** `writeAgentRunConfig` accepts
`WriteExecutor`, a union that includes `HyperIdleDb` (`write-executor.ts:29`), so the boot handle
passes directly. Its upsert semantics match `factory-bootstrap.ts:33-55`'s `upsertRunConfig` for
every patch shape the bootstrap uses — proven **by executing both against clean PGlite databases
and diffing the resulting `agent_run_config` rows: identical** (`feasibility.md` §2, probe
`probes/run-config-equivalence.ts`). The one shape difference (`writeAgentRunConfig` inserts
`modelTierPreference: null` explicitly; `upsertRunConfig` omits the column and takes the schema
default, which is also null — `schema.ts:116`) produces the same row. No new `agentRunConfig`
crossing site appears anywhere: the only table-touching code is the already-baselined
`agent-run-config-store.ts`, and the face passes only local values into it (the DI detector fires
only on *imported* identifiers passed into a foreign package's function —
`crossing-detectors.ts:949-973` — so `applyFactoryRunConfigDefaults(db, …)` with a local `db`
records nothing). The AU30 pull-forward fallback is therefore **not** exercised.

**2.5.4 Composition roots.** Ordering is load-bearing: `agent_run_config.agentUserId` has an FK to
`users.id` (`schema.ts:110-113`), so `applyFactoryCoreState` must complete before
`applyFactoryRunConfigDefaults`. Both calls are idempotent; the pair replaces
`applyFactoryBootstrap(db)` 1:1.

- **Desktop** (`applications/desktop/src/main.ts:449-458`): inside the existing non-fatal
  try/catch, replace the `applyFactoryBootstrap` dynamic import + call with dynamic imports of the
  two faces and the two ordered calls on `handle.db`. `applications/desktop/package.json` adds
  `@hyperidle/core-api` and `@hyperidle/agent-orchestration` — an application naming a layer's
  face is `allowed` (clause 9; `remote-server/package.json:19,23` is the standing precedent), so
  no baseline entry appears. Keep the log lines and the non-fatal error handling as they are.
- **The tool CLIs** share one internal helper in the tool package (§2.6),
  `runFactoryBootstrap(db)` = the same two calls, so the three CLIs cannot diverge from each
  other. Desktop cannot import that helper (production never names tooling — clause 1/9), so the
  two-call sequence appears exactly twice in the repo: once in `main.ts`, once in the tool helper.
  That duplication is composition (two ordered calls), not row-set definition, and is accepted.
- **remote-server** is untouched: it runs no in-process bootstrap today (verified
  `applications/remote-server/src/index.ts`), and the unwired-`bootstrap-pg`-init-container gap
  (`docs/deployment/shared-backend.md:70`) stays open by explicit non-goal.

### 2.6 The tool package: `tools/setup`

New workspace package `tools/setup` (name `@hyperidle/setup`; role `tooling` via the existing
`tools/*` glob — `architecture.json:23-26`, so **no registry edit** and no new audience decision;
`governance/README.md:129` — "a new package → add it to `workspaces` … nothing else").
Contents, moved verbatim except import specifiers and the bootstrap call:

- `src/setup-cli.ts` — `runSetup` + `validateDbPath` + entrypoint. Its factory step calls
  `runFactoryBootstrap(handle.db)`; `--demo` calls `seedDemoWorld` as today. `resolveProfile` /
  `DeploymentProfile` now from `@hyperidle/shared`; `applyMigrations` / `createPgliteDb` still from
  `@hyperidle/db` (`db:client`, reach everyone). Its `defaultRoot` walk (`setup-cli.ts:91-95`,
  `framework/db/src → root`) is re-derived for the new path depth (`tools/setup/src → root` is the
  same `../../..` — verify, don't assume, when moving).
- `src/bootstrap-pg.ts` — as today but `runFactoryBootstrap` instead of `applyFactoryBootstrap`.
- `src/seed-pg-cli.ts` — same substitution (file leaves `__testing__/`; the whole package is
  development machinery).
- `src/demo-fixture.ts` — verbatim, including its direct table writes and its private
  `upsertDemoRunConfig`: tooling touching any table is `allowed`
  (`governance-model.ts:207-213`, `store-tooling-measures-everything`, Ruling 7), so **no**
  rerouting through services here, and its `agentRunConfig` write is legal under the tooling
  clause — it is not a new production crossing site. Update its stale header allowlist comment
  (`demo-fixture.ts:1-16` references a deleted guard).
- `src/factory-bootstrap-runner.ts` (name free) — `runFactoryBootstrap(db)`: the two face calls.
  Tool-internal, not a public contract.

Dependencies of `tools/setup`: `@hyperidle/db`, `@hyperidle/shared`, `@hyperidle/core-api`,
`@hyperidle/agent-orchestration` — all legal for tooling (clause 9 for the layers; surfaces for
db/shared). Repoints, script **names unchanged** (requirements §3.5): root `package.json:52-65`
`setup` → `tsx tools/setup/src/setup-cli.ts`, `db:bootstrap:pg` → `npx tsx
tools/setup/src/bootstrap-pg.ts`, `db:seed:pg` → `npx tsx tools/setup/src/seed-pg-cli.ts`;
`deploy/bin/setup:6` → `exec npx tsx tools/setup/src/setup-cli.ts "$@"`. `test:pg`
(`__testing__/pg-test-runner.ts`) stays in `framework/db` — it is db test machinery, not
bootstrap.

Relocated test suites (development world; they exercise the composed bootstrap, which now lives
here): `AF17-factory-bootstrap`, `AF17-factory-isolation`, `factory-and-demo`,
`AD8a-category-rename`, `U1-schema-migration` (it is a seed-then-migrate suite — its arrangement
is the seeds), `setup-cli.test.ts`, and the bootstrap half of `X3-agent-config.integration.test.ts`
→ `tools/setup/src/__tests__/`, importing the faces/CLIs from the new homes and `createTestDb`
from `@hyperidle/db/testing` (development naming development). They must pass unmodified in their
assertions — the ~117 assertions across the six suites are the behavioural spec of first boot.
`layers/core-api/src/__tests__/AF17-propagation-bootstrap.integration.test.ts` stays where it is
and repoints `applyFactoryBootstrap` → `applyFactoryCoreState` (it asserts the propagation user,
which is core-api-face state; core-api must not devDepend on the tool package — that would be a
workspace cycle with `tools/setup → @hyperidle/core-api`).

Harness updates in the same task: `knip.json` — remove `src/bootstrap-pg.ts!` and
`src/__testing__/seed-pg-cli.ts!` from the `framework/db` workspace entry, add a `tools/setup`
workspace with the three CLI entries; `vitest.config.ts` / `vitest.integration.config.ts` — add
`tools/setup` to `projects` (pattern: `tools/eval` is already listed).

### 2.7 `toolsForRole` dissolves

Delete `toolsForRole` from `framework/shared/src/tool.ts:398-403` and from the shared barrel
(`index.ts:650`). Inline the one-line filter
`allToolDefinitions.filter((d) => d.roles === undefined || d.roles.includes(role))` at all three
callers (header note №3). This removes the `framework → layer [di]` crossing at
`tool-provider-bindings.ts:65` and leaves **no framework file receiving layer values** — including
the two callers the detector happens not to flag today (`tool-registry.ts:70`,
`tool-definitions.ts:1646` pass non-imported identifiers, so the DI heuristic is blind to them; the
requirement is about the act, not the detection). No new crossing appears: each inlined filter uses
only in-package values. Three copies of a one-line predicate beat a shared behavioural function
that structurally invites layer values into the framework; the `RegisteredTool.roles` contract
comment on the type is the single place the rule stays documented — add one sentence there noting
the filter is intentionally inlined at its callers.

`core-api`'s wrapper `toolsForRole(role)` (`tool-provider-bindings.ts:64`) keeps its name and
export — its consumer `run-orchestration-composition.ts:36,150` is untouched.

### 2.8 The `seed` phantom

`applications/desktop/__tests__/migrate.test.ts:28-36,63-69` mocks a `seed` export into
`@hyperidle/db` and destructures it back to assert desktop never calls it. `framework/db` exports
no `seed` (deleted under AU28 Ruling 9). Fix the test: drop `seed` from the mock and delete the
stale assertion (it guards a function that cannot exist); keep the real assertions about
migrations. While in the file, the mock must also stop naming any other symbol the barrel no
longer exports after §2.1 (re-derive the mock surface from the post-state barrel). This clears the
fourth `db:unknown` symbol and the `application → db:unknown [import] development` baseline entry.

---

## 3. AC → obligation map

| Plan AC | Obligations (sections) |
|---|---|
| 1 — zero `db:unknown` | §2.1 (barrel), §2.3 (templates module leaves), §2.8 (`seed` mock). Lint NOTE disappears. |
| 2 — no non-database function reachable through `db` | §2.1–2.3, §2.6: the five modules leave; no shim. Regression guard: the unplaced-symbol error path + promoted rules (§4). |
| 3 — first boot from composition roots; `db` writes no service-owned table | §2.5, §2.6. Zero `table:*` crossings originate in `framework/db` production files. |
| 4 — framework off the bus | §2.4. Zero `framework → EventBus` in either world; `events.ts` declarations stay. |
| 5 — baseline groups gone, rules at error | §4.2 (the ~30+1 sites), each group deleted by `npm run governance:baseline` as its last site clears — promotion is automatic (shrink-only). Includes `framework → layer [di]` (§2.7). |
| 6 — baseline-empty contingency | Will not trigger: 38 groups today, this WP clears 10 (§4.2). Carried anyway: if the regenerated file ends empty, delete `governance/baseline.json` + the `--adopt` path in `scripts/governance-baseline.ts` in that same commit. |
| 7 — verify green + identical first boot, executed | §6 evidence plan; control captured at architecture time (`feasibility.md` §3). |

Validation scenarios 3 and 4 (new non-database `db` export; new `emit` in shared) are covered by
the existing unplaced-symbol error (`db:unknown` reach `[]`) and the promoted
`framework → EventBus` rule, both break-tested through the attack table (§4.4) — no new mechanism.

---

## 4. Governance consequences

### 4.1 Legality of every new edge (clause-verified)

| new edge | clause | verdict |
|---|---|---|
| desktop `main.ts` / `package.json` → `@hyperidle/core-api`, `@hyperidle/agent-orchestration` (import+manifest) | `reach-across-only-from-a-composition-root` (`governance-model.ts:330-337`) | allowed |
| `tools/setup` → the two layers (import+manifest) | same clause — tooling is a composition root | allowed |
| `tools/setup` → `@hyperidle/db` (`db:client`), `@hyperidle/shared` | `reach-declared-surfaces-only` — both reach everyone | allowed |
| `tools/setup/src/demo-fixture.ts` → any table | `store-tooling-measures-everything` (`:207-213`) | allowed |
| core-api face → users/knowledge services | `reach-your-own-contents` (`:316-318`) | allowed |
| users/knowledge services → own tables (new writers) | `store-owner-only` (`:214-219`) | allowed |
| agent-orchestration face → `@hyperidle/agent-run-config` | `reach-your-own-contents` | allowed |
| run-config writes | **no new site** — only the baselined `agent-run-config-store.ts` touches the table (§2.5.3) | unchanged |
| the two services' inlined `emit` | `publish-anyone-but-the-bus-host` (`:249-256`) | allowed |
| core-api dispatcher `bus.on("*")` | same clause | allowed |
| faces receiving `db` from roots | DI detector fires only on imported identifiers (`crossing-detectors.ts:949-958`); `handle.db`/local `db` are local values | no crossing recorded |

Also verified: nothing new imports `db:schema-ns`, nothing touches `--adopt`, and no entry of any
baselined group gains a site (the generator would refuse; §4.2 only removes).

### 4.2 Baseline groups this WP clears (site-exact, matches requirements §7)

Production: `application → db:util [import]` 1 · `layer → db:util [import]` 6 ·
`layer → db:unknown [import]` 1 · `framework → db:table (other) [table:read]` 2 ·
`framework → db:table (other) [table:write]` 15 · `framework → db:table (unowned) [table:write]` 2 ·
`framework → EventBus [event]` 2 · `framework → layer [di]` 1. Development:
`application → db:unknown [import]` 1. Ten groups, 31 sites. `npm run governance:baseline` is the
only writer, run after each increment; each group's disappearance puts its rule at error in that
commit. The `framework → db:table (other) [table:write] development` group (the 10 schema-test
sites) is AU32's and must be untouched — the relocations in §2.6 do not touch those four files.

### 4.3 `architecture.json` (registry facts, not verdicts)

- Delete the `db:util` surface entry (`architecture.json:76-79`) — deleted, not emptied (plan
  contract; that contract is the founder instrument).
- Remove `"db:util"` from `oneDoorSurfaces.surfaces` (`:130`).
- `moduleSurface` (`:88-102`): remove `factory-bootstrap.ts`, `demo-fixture.ts`, `setup-cli.ts`,
  `seed-fixtures.ts` (db:bootstrap), `like-escape.ts`, `agent-scaffold.ts`, `profiles.ts`
  (db:util), and `bootstrap-pg.ts` (db:client — the module relocates). Remaining:
  `connection.ts`, `migrate.ts`, `write-executor.ts`, `migrate-pg.ts`, `pg-ssl.ts`, all
  `db:client`.
- `db:bootstrap` then maps zero modules → delete the surface entry (`:60-63`) — zero-match rot.
  **Authorization note:** the plan's deletion contract names only `db:util`; the `db:bootstrap`
  deletion is a *consequence of the end state* (the surface's three exports all leave the package)
  and must be explicitly surfaced at the mandatory human review gate, per requirements §5 — it is
  listed in §7 below so the gate cannot miss it.
- `db:unknown`, `db:testing`, `db:client`, `db:row-type`, `db:schema-ns`, and the four
  package-level surfaces remain untouched.

### 4.4 `decided-rules.json`, model test, attack table

- Six rows delete with their surfaces: 3 × `db:util` (layer/service/application × import) and 3 ×
  `db:bootstrap` (application/tooling/layer × import) — verified present, exactly six, no other
  row names either surface. `totals.rows` 124 → 118. Authorization: same two instruments as §4.3
  (plan contract for `db:util`; human-gate-surfaced end-state consequence for `db:bootstrap`).
  No verdict on any *surviving* row changes — this is row deletion following surface deletion,
  not a verdict edit.
- `framework/db/src/__tests__/governance-model.test.ts` reproduction counts move: 124 → 118 rows,
  248 → 236 verdicts (lines 167-219 carry the literals).
- `scripts/lib/governance-attacks.ts`: the `db:util` narrow-surface attack + control
  (`:428-431`, `:456`) lose their target surface — re-anchor the laundered-re-export attack to a
  surviving narrow surface; the `db:unknown` deep-import attack (`:605`) overlays
  `readSystemPromptTemplate from "@hyperidle/db"`, which stops resolving — re-anchor to a
  fabricated unmapped module overlay in `framework/db/src`. The four attack-table properties
  (every rule an attack, control twins, anchors must exist, zero-case rules fail) are the
  mechanical check that the re-anchoring is complete — `npm run lint` runs `--attacks` and fails
  loudly on a stale anchor. `framework/db/src/__tests__/governance-crossings.test.ts` fixtures
  that name moved modules re-anchor the same way.
- `scripts/rules/no-laundered-re-exports.ts:49` names `escapeLikePattern` in a comment — update
  the comment; the rule itself is symbol-agnostic and keeps firing on any moved-symbol shim.

---

## 5. Tasks, ordering, and what may run in parallel

Every task ends with the tree green (`check`, `lint` incl. all three governance passes, affected
tests) and, where it fixes baselined sites, `npm run governance:baseline` in the same commit.

- **A — substrate to shared** (§2.2, §2.3): move `like-escape.ts`, `profiles.ts`,
  `agent-scaffold.ts` + `system-prompt-templates.ts`, fold `seed-fixtures.ts` constants; repoint
  all consumers (incl. the interim `factory-bootstrap.ts` / `demo-fixture.ts` / `setup-cli.ts`
  imports, which now cross into shared legally); prune the db barrel of the moved blocks;
  `moduleSurface` prunes for the three `db:util` modules; delete the `db:util` surface +
  `oneDoorSurfaces` entry + 3 decided rows + model-test count (124→121 interim); re-anchor the two
  attacks; move the two unit tests; baseline regen (clears `application → db:util`,
  `layer → db:util`, `layer → db:unknown`).
- **B — `toolsForRole` dissolution** (§2.7): three inlines, delete from `tool.ts` + barrel;
  baseline regen (clears `framework → layer [di]`). *Parallel leaf — touches no file A touches.*
- **C — bus silence** (§2.4): inline the two emits, remove `reportAdmissionFailure`; move
  dispatcher + its two tests to core-api, prune the observability sub-barrel; baseline regen
  (clears `framework → EventBus`). *Parallel leaf.*
- **D — bootstrap to composition roots** (§2.5, §2.6): owner writers; two faces + barrel exports +
  `FactoryAgentRef`; `tools/setup` package (workspaces entry, deps, four CLIs + runner helper);
  desktop `main.ts` + `package.json`; delete `factory-bootstrap.ts`, `demo-fixture.ts`,
  `setup-cli.ts`, `bootstrap-pg.ts`, `seed-pg-cli.ts` from db; npm scripts + `deploy/bin/setup`;
  `moduleSurface` prune (four modules) + delete `db:bootstrap` surface + 3 decided rows +
  model-test count (121→118); relocate the factory suites; repoint
  `AF17-propagation-bootstrap`; `knip.json` + vitest projects; baseline regen (clears the three
  `framework → db:table` production groups). **Sequential: requires A** (shared homes for
  `COMMUNITY_DISPLAY_NAMES`, templates, `resolveProfile`).
- **E — seed phantom** (§2.8): fix `migrate.test.ts`; baseline regen (clears
  `application → db:unknown` development). *Parallel leaf, but its mock re-derivation must land
  after A and D settle the final barrel — run it last or re-check the mock then.*
- **F — evidence + docs**: run the §6 equivalence protocol on both paths; update the doc paths
  (§8); full `npm run verify`; `npm run test:all` for the relocated suites.

Order: A → D → F, with B and C free to land anywhere before F, and E after the barrel is final
(practically: A ∥ B ∥ C, then D, then E, then F). One builder can do A–F sequentially; if the
orchestrator parallelises, B and C are the safe leaves.

---

## 6. End-to-end evidence (AC 7) — executed, not read

**Control (captured now, at architecture time, while the branch is code-identical to
`origin/main`):** `probes/first-boot-capture.ts` (kept under `.pipeline/work/AU29/probes/`) creates
a clean PGlite database, runs migrations + `applyFactoryBootstrap` — the exact function both
production paths call today — and dumps `users`, `knowledge_items`, `knowledge_app_projection`,
`agent_run_config` ordered by primary key with timestamp columns normalised to `"<ts>"` (they are
`new Date().toISOString()` at run time and can never be byte-stable across runs; everything else
must be byte-identical). Control output: `.pipeline/work/AU29/probes/first-boot-control.json`
(committed). See `feasibility.md` §3 for the run.

**Branch runs (builder, task F):**

1. **CLI path:** `npm run setup -- --db-path <scratch>` (the relocated tool), then the same capture
   script against that data dir → diff against `first-boot-control.json` must be empty.
2. **Desktop path:** the desktop boot's bootstrap step is the two face calls (§2.5.4). Execute
   them as desktop executes them — clean PGlite dir, `applyMigrations`, then
   `applyFactoryCoreState` + `applyFactoryRunConfigDefaults` on the handle — by switching the
   capture script's `--bootstrap` mode to the two face calls (the switch point is marked inline in
   the script) → diff must be empty. (This executes the identical statements `main.ts` runs;
   launching the Electron shell adds no additional database writes on this path —
   `main.ts:449-458` is the only bootstrap call — and stays available as a manual smoke check.)
3. Record both diffs (empty) in the PR body / progress notes so review can re-run; the capture
   script's header documents both modes and the exact control/branch commands. The harness is
   already proven end-to-end: at architecture time the real `npm run setup` CLI dump diffed empty
   against the control (`feasibility.md` §3).

Plus the standing lanes: the relocated factory suites (~117 assertions) green under
`npm run test:integration:service`; `npm run verify` green; the governance lint reporting zero
`db:unknown` symbols and none of the §4.2 groups.

---

## 7. Human review gate — items that must be surfaced explicitly

1. The `db:bootstrap` surface deletion + its 3 decided-rules rows (end-state consequence, not a
   plan-named contract — requirements §5 requires it surfaced, not slipped in).
2. The two-call composition appearing in both `main.ts` and the tool runner (the accepted
   duplication boundary, §2.5.4).
3. `readSystemPromptTemplate` and the profile-type exports becoming module-internal (knip-driven
   narrowing of what shared publishes, §2.2/§2.3).

---

## 8. Documentation made false by this change

Path-accuracy updates (DOC-CLASS: update, requirements §9 + critique follow-up):
`docs/deployment/self-hosting.md:30,42,64`, `docs/deployment/shared-backend.md:70`,
`docs/deployment/laptop.md:8`, `docs/guides/developer/commands.md:10`,
`docs/guides/developer/getting-started.md:50`, `docs/agent-layer/agent-model.md:53` — every
`framework/db/src/{setup-cli,bootstrap-pg,factory-bootstrap,demo-fixture}.ts` citation repoints to
the `tools/setup` / face homes. Command names and behaviour are unchanged. Sweep with
`rg -n "framework/db/src/(setup-cli|bootstrap-pg|factory-bootstrap|demo-fixture|seed-fixtures|like-escape|profiles|agent-scaffold|system-prompt-templates)" docs/`
rather than trusting this list.

---

## 9. Failure behaviour and security surfaces

- **Changed failure behaviour:** none intended. Desktop bootstrap failure stays non-fatal with the
  same log shape (`main.ts:459-465` retained). CLI exit codes unchanged. A newly possible failure:
  desktop importing two layer barrels at boot — a load-time error in either barrel now surfaces in
  `main.ts`'s try/catch instead of inside `@hyperidle/db`; same containment, same retry-next-launch
  semantics.
- **Security surfaces touched:** only the system-prompt template reader moves. Its path-traversal
  defense is the compile-time allowlist map itself (`system-prompt-templates.ts:25-33`); the
  contract here is *verbatim move* — any "improvement" (regex validation, dynamic filenames) is a
  regression and a review-blocker. `escapeLikePattern` likewise moves verbatim with its
  `ESCAPE '\\'` caller contract. No endpoint, credential, or outbound-request surface changes; no
  new input crosses a trust boundary (the roster and template map are compile-time constants).
- **No new mechanism:** no rollback layer, no compatibility shim, no transitional export, no new
  observability — Ruling 12 and the tier both forbid inventing them.
