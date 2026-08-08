# AU29 — Requirements: the framework stops acting

`plan.md` is authoritative. This artifact settles the three destinations the plan left open, confirms
the two side-questions the plan's "Plan calls" section directs, and pins the success conditions. It adds
no outcome. Every claim below was verified against this worktree (branch `pipeline/AU29`, cut from
`origin/main` @ bbe82e9a); the governance lint runs green on it today at
**221 production + 67 development known violations across 38 baseline groups** (live `governance-lint`
run, this worktree).

## 1. Value and intended impact

`framework/db` and `framework/shared` are the only two targets with `reach: everyone`
(`governance/architecture.json` surfaces block). That universal permission is safe only while the two
packages hold pure substrate. Today `db` exports functions that touch no database and hosts a routine
that writes service-owned tables, and `shared` both provides the event bus and speaks on it. When this
ships, the sentence "the shared substrate is the one target every role may name" is true again, and
the owner-routing work the next table-ownership package needs becomes structurally possible.

## 2. What success means — mapped to every plan AC

| Plan AC | Success condition, concrete |
|---|---|
| 1. Zero `db:unknown` symbols | The lint's `NOTE n database symbol(s) fall to db:unknown` disappears. Today it lists exactly 4: `readSystemPromptTemplate`, `readSystemPromptTemplateForRole`, `SYSTEM_PROMPT_TEMPLATE_FILES` (module unmapped) and `seed` (phantom — §3.4). |
| 2. No non-database function reachable through `db` | `like-escape.ts`, `agent-scaffold.ts`, `profiles.ts`, `system-prompt-templates.ts`, `seed-fixtures.ts` are gone from `framework/db/src`; the barrel (`framework/db/src/index.ts`) exports only connection/migration/write-executor plumbing, schema tables, row types, `schema` ns and the zod subpath. No re-export shim of any moved symbol remains in `db` (a re-export is both a transitional surface, forbidden by Ruling 12, and a laundering vector per `scripts/rules/no-laundered-re-exports.ts`). |
| 3. First boot from a composition root; `db` writes no service-owned table | `factory-bootstrap.ts`, `demo-fixture.ts`, `setup-cli.ts`, `bootstrap-pg.ts` leave `framework/db` per §3.5. Zero `table:read`/`table:write` crossings originate from `framework/db` production files. |
| 4. Framework off the bus | The two sites — `framework/shared/src/agent-run-admission.ts:65` (emits `agent_run_admission_failed`) and `framework/shared/src/observability/dispatcher.ts:473` (subscribes `*`) — are resolved per §3.6. The lint reports zero `framework → EventBus` crossings in either world. Declaring event TYPES in `framework/shared/src/events.ts` is not speaking and stays (the model itself points at that module: `architecture.json` `eventBus.typesModule`). |
| 5. Baseline groups gone, rules at error | The ~30 production + 1 development entries in §7 are deleted by `npm run governance:baseline` because their sites are fixed — never re-keyed into a new group (§4 is what makes that possible). Deleting a group's last site puts its rule at error from the same commit; no separate promotion step exists. |
| 6. Baseline-empty contingency | Will not trigger here: 38 groups exist today and this WP clears ~10. Carry the criterion anyway — if this WP unexpectedly clears the last entry, delete `governance/baseline.json` and the `--adopt` escape hatch in the same commit. |
| 7. Verify green + identical first boot, proven by running it | `npm run verify` green, and a clean-database first boot on BOTH paths (desktop launch sequence; `npm run setup` / `db:bootstrap:pg` CLI) produces row-identical `users`, `knowledgeItems`, `knowledgeAppProjection` — and the same `agentRunConfig` runnable defaults (AH2 behaviour, `factory-bootstrap.ts:136-143,171-177`) — as `origin/main`, compared by executing both, not by reading code. |

## 3. The settled nouns

### 3.1 `escapeLikePattern` → `framework/shared`

Pure string escaping, zero I/O (`framework/db/src/like-escape.ts:20-22`). Production consumers span
services and the layer: `layers/core-api/knowledge/src/knowledge-repository.ts`,
`layers/core-api/users/src/user-store.ts`, `layers/core-api/work/src/work-service.ts`,
`layers/core-api/work/src/dependency-watcher.ts`, `layers/core-api/src/routes/{search,threads,users}.ts`.
`framework/shared` (`reach: everyone`) is the only home legal for all seven, and shared already holds
exactly this kind of string substrate (`redactDbUrl`, imported by `setup-cli.ts:4`).
**Rejected:** keeping it in `db` (AC 2 forbids — it performs no database access); duplicating into
seven files (pointless divergence of a security-relevant escape, see its own `@lore I2 V4`).

### 3.2 `resolveProfile` (+ `PROFILE_DEFAULTS`, `DeploymentProfile`, `DbDriver`, `SandboxAdapterKind`, `ProfileDefaults`, `ResolveOptions`) → `framework/shared`

Pure constants + env-string resolution, zero I/O (`framework/db/src/profiles.ts`). Production
consumers: `applications/remote-server/src/create-server.ts:77,418` (the current
`application → db:util` baseline site) and `setup-cli.ts` (which becomes tooling, §3.5). Verified: no
other file in the repo names any of these symbols. `shared` is legal for both worlds.
**Rejected:** moving it into `applications/remote-server` — `setup-cli` becomes a tool, and
tooling may not import an application (`governance-model.ts` clause 9 allows a root to reach only a
*layer*'s face; an application target falls to `forbidden`), so the tool would need a diverging copy
of the deployment defaults.

### 3.3 `resolveAgentScaffoldSpecs` and the whole of `system-prompt-templates.ts` → `framework/shared`

These two move together: `agent-scaffold.ts:2` calls `readSystemPromptTemplateForRole`.

The plan's open question "named `db` surface or leaves the package" is settled **by AC 2 itself**:
neither module performs any database access (no SQL, no schema symbol, no connection — confirmed by
reading both files), and both have consumers outside `db`, so a named `db` surface for them would be
exactly the reach-through AC 2 forbids. **They leave.**

Production consumers span two layers, which forces the destination:
- `resolveAgentScaffoldSpecs`: `layers/core-api/src/routes/{users,teams-routes,assistant}.ts` (layer)
  and `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:22,1037,1132` (a service in a
  *different* layer, importing it deliberately as a leaf — `ports.ts:50-60` records the port it
  replaced).
- `readSystemPromptTemplateForRole` + `SYSTEM_PROMPT_TEMPLATE_FILES`:
  `layers/core-api/src/routes/agents.ts:32` (layer), plus `agent-scaffold.ts` internally, plus the
  relocated bootstrap (§3.5).

The only surfaces both a `core-api` route file and an `agent-orchestration` service may legally name
are `framework/shared` and `framework/db` (surfaces block: `api-contract` reach `[layer]` excludes
services; `design-system` reach `[core-ui]`). `db` is excluded by AC 2. So: **shared**, as named
exports — an explicit, founder-gated decision replacing today's "reachable from anywhere by nobody's
decision". The successor package that splits `shared` into audience-scoped packages then assigns these
their final, narrower audience; that is that WP's deliverable, not this one's.

Two facts to carry into architecture, not re-litigate:
- This introduces the first `fs.readFileSync` into `framework/shared` production code (verified: zero
  today). The reader's cwd-relative `docs/system-prompts/` resolution and its closed allowlist map are
  load-bearing (`system-prompt-templates.ts:25-33,80-85` — the map IS the traversal defense); move
  verbatim, do not "improve".
- The governance model has no rule against filesystem reads; nothing about this move is a crossing.

**Rejected:** a new `framework/agent-config` package (a new package + new surface + new audience is a
founder-scale registry change duplicating what the shared-split WP will do properly); homing them in a
`core-api` service (would make `tool-handlers`' import a forbidden `service → service (other layer)`
crossing and require an API/event redesign no AC asks for).

### 3.4 `seed` is a phantom, not an export

`framework/db` exports no `seed` — it was deleted under AU28 Ruling 9 step 1. The `db:unknown` entry
comes from `applications/desktop/__tests__/migrate.test.ts:63`, which `vi.mock`s `@hyperidle/db`
(`:28`) and then destructures `seed` from its own mock to assert "desktop does NOT call seed()". The
fix is to fix the stale test (the assertion now protects against a function that cannot exist), which
clears both the fourth unplaced symbol and the `application → db:unknown [import] development` entry.
**Rejected:** re-adding a `seed` export to satisfy the mock (a production export only a test consumes —
`knip:production` deletes it, and the plan forbids it).

### 3.5 First-boot state: owned by each application's boot procedure; the CLIs become tooling

**Who boots today (live tree):**
- **Desktop** — `applications/desktop/src/main.ts:449-456`: opens PGlite, calls
  `applyFactoryBootstrap(handle.db)` on every launch before the server starts, idempotently. This is
  the ONLY production-process bootstrap invoker in the repo.
- **Remote/shared server** — no in-process bootstrap at all: `applications/remote-server/src/index.ts`
  goes straight to `createServer`; the deploy chart runs only the migration init-container
  (`deploy/chart/values.yaml:35`); first-boot state comes from operator-run CLIs —
  `deploy/bin/setup` → `framework/db/src/setup-cli.ts`, `npm run db:bootstrap:pg` →
  `bootstrap-pg.ts` (its "second init-container" doc comment is aspiration; nothing in `deploy/`
  wires it — `docs/deployment/shared-backend.md:70` records the gap. Do not close that gap here; it
  is not an AC).

**Settled:** there is no single shared code home. First-boot state is owned by **two composition
roots of different worlds**, and the answer holds for both applications because that is already how
both boot:

1. **Production path (desktop launch).** `applications/desktop/src/main.ts` remains the invoker. The
   rows it establishes must be produced through the owning services behind their layers' public faces
   — `core-api` for the `users` rows and the `knowledgeItems`/`knowledgeAppProjection` seed pair,
   `agent-orchestration` for the `agentRunConfig` runnable defaults — because §4 leaves no other
   legal shape. An application importing a layer's face is `allowed`
   (`governance-model.ts` clause 9, `reach-across-only-from-a-composition-root`); a layer calling its
   own service is `allowed` (`reach-your-own-contents`); a service writing its own table is `allowed`
   (`store-owner-only`).
2. **Development-machinery path (server installs, demo, dev seeding).** `setup-cli.ts`,
   `bootstrap-pg.ts`, `demo-fixture.ts` (+ its `__testing__/seed-pg-cli.ts` caller) relocate to the
   tooling world (`tools/` — the role clause 2 exempts: `store-tooling-measures-everything`,
   Ruling 7). `deploy/bin/setup:6` and the root `package.json` scripts (`setup`, `db:bootstrap:pg`,
   `db:seed:pg` at `package.json:52-65`) repoint to the new paths; script NAMES do not change.
3. **`seed-fixtures.ts`** (`PRACTICE_COMMUNITIES`, `COMMUNITY_DISPLAY_NAMES` — pure constants, zero
   database access; consumers: `factory-bootstrap.ts:6`, `demo-fixture.ts`) → `framework/shared`,
   beside `factory-roster.ts`, which already documents the derivation
   (`framework/shared/src/factory-roster.ts:32`). Both boot paths need the facilitator display-name
   derivation, and tooling may not import an application, so shared is the one home both reach.

**One source of truth requirement:** the factory row-set (which users, which run-config defaults,
which knowledge seed) must be defined once and consumed by both paths — two diverging copies of
first-boot truth is a defect. Mechanism (layer-face functions the tool also calls, vs. a shared
constant both compose) is architecture's choice within §4.

**Rejected:** relocating `applyFactoryBootstrap`'s raw writes into `applications/desktop` or
`applications/remote-server` verbatim — §4 shows this cannot land at all; homing the routine in
`applications/remote-server` for desktop to import — grows the baselined
`application → application [import]` group, which the generator refuses.

### 3.6 The two bus sites

- **`reportAdmissionFailure`** (`agent-run-admission.ts:53-76`) — a typed `eventBus.emit` wrapper.
  Production consumers: exactly two sibling services,
  `layers/agent-orchestration/run-orchestration/src/runtime.ts` and
  `layers/agent-orchestration/session-requests/src/service.ts`. It lives in `shared` only because the
  two must not import each other (its own doc comment, `:44-51`). **Settled: the emit act moves into
  the two services** (local helper each, or a within-layer shared spot — both legal; clause 4 allows
  any non-framework publisher). The pure type guards `isAgentWorkIntentKind` /
  `isAgentWorkIntentSourceKind` and the event type stay in `shared` — guards and declarations are not
  bus acts.
- **The observability dispatcher** (`observability/dispatcher.ts:473` — `bus.on("*")`) — exactly one
  production consumer wires it: `layers/core-api/src/observability-runtime.ts`. **Settled: the
  dispatcher module moves to `core-api`** beside its only wiring site. The observability types it
  imports remain in `shared` (types are substrate); the lint confirms dispatcher.ts holds `shared`'s
  only subscribe.

### 3.7 A third framework-acting site the plan prose did not enumerate — in scope by AC 5's letter

AC 5 requires every `framework → *` production entry gone. Besides the table and bus groups, the
baseline holds one more: `framework → layer [di] production` — "shared receives `allToolDefinitions`
from core-api" at `layers/core-api/src/services/tool-provider-bindings.ts:65`, i.e. the pure
one-line filter `toolsForRole` (`framework/shared/src/tool.ts:398-403`) being handed a layer's wired
tool list. This is the same disease at its smallest: the framework participating in a layer's wiring.
It is inside the WP's stated theme ("the framework stops acting") and inside AC 5's letter, so it is
**in scope, not an amendment**. The fix direction is dissolution (inline the filter at its callers or
relocate it out of `shared`); note `toolsForRole` is also called from `agent-execution`
(`harness-registry/src/tool-registry.ts`, `mcp/mcp-bridge.ts`), so architecture must pick the shape
that leaves no framework file receiving layer values — without creating any new cross-layer crossing.

### 3.8 Plan-call confirmations: `db:testing` and the `db:bootstrap` fixtures

Checked against the live tree, as directed:
- **`db:testing` (`framework/db/src/__testing__/test-utils.ts`, `test-pool.ts`, `test-fixtures.ts`)
  does NOT carry the problem.** All three are PGlite pool/migration/vitest-fixture plumbing —
  database machinery through and through, development world, no bus act, no non-database behaviour.
  They stay.
- **`__testing__/seed-pg-cli.ts`** calls `applyFactoryBootstrap` — repoints to the relocated tool
  (development naming development; legal).
- **The `db:bootstrap` fixture module `seed-fixtures.ts` DOES carry the problem** — two pure
  constants with zero database access, mapped to a database surface. Resolved in §3.5(3).

## 4. The legality lattice that forces the destinations (binding on architecture)

Four enforced facts compose; the end state must satisfy all of them simultaneously:

1. **`store-owner-only`** (`governance-model.ts` clause 2): any production actor except tooling
   touching a table it does not own is forbidden — applications and composition roots included. An
   unowned table (`agentRunConfig`, `governance/table-owners.json` unowned block) has NO legal
   production accessor at all.
2. **The baseline is shrink-only in both directions** (`governance/README.md`): the generator refuses
   a new group and refuses a raised count. There is no "park the moved write as new debt" move.
3. **The plan forbids re-keying**: entries this WP clears are deleted, never moved to another group.
   So `framework → db:table (…)` may not reappear as `application → db:table (…)` — with or without
   `--adopt`.
4. **Production never names development** (clause 1), and only development machinery may name tooling
   (clause 9) — so the desktop runtime cannot lean on the tooling exemption.

Consequences, stated so nobody designs the illegal versions:
- The production first-boot path must terminate in the **owning services' existing legality**: new
  writer code is free inside a table's OWNER (its writes are legal), but for the unowned
  `agentRunConfig` the bootstrap must reuse the owning-service-to-be's **already-baselined** writer
  (`layers/agent-orchestration/agent-run-config/src/agent-run-config-store.ts:121`
  `writeAgentRunConfig`) without adding any new `agentRunConfig` crossing site anywhere — a new
  write site would raise a baselined count and fail the build. **Feasibility flag for architecture:**
  verify `writeAgentRunConfig` can express the bootstrap's upsert-with-patch semantics
  (`factory-bootstrap.ts:33-55`). If it cannot, the fallback is pulling forward the one-line
  `agentRunConfig` owner assignment the successor ownership WP already describes as trivial — that is
  a **proposed plan amendment** to raise then, not a decision to make silently now.
- The CLI paths get their legality from the tooling role, not from ownership.
- Do not touch `--adopt` (it survives until whichever clearing WP empties the baseline).

## 5. Registry and harness consequences (required by the end state, no new scope)

- `governance/architecture.json`: delete the `db:util` surface entry (plan contract — deleted, not
  emptied); remove `db:util` from `oneDoorSurfaces.surfaces`; prune `moduleSurface` entries for every
  departed module; when `db:bootstrap` maps zero modules, delete that surface entry too — an entry
  naming nothing is exactly the zero-match rot the governance design refuses. `db:unknown`,
  `db:testing`, `db:client`, `db:row-type`, `db:schema-ns` remain.
- `governance/decided-rules.json` holds rows targeting `db:util` (3) and `db:bootstrap` (3). Deleting
  a surface deletes its rows and moves the reproduction count in
  `framework/db/src/__tests__/governance-model.test.ts`. Verdict edits are founder-only; here
  `plan.md`'s explicit `db:util`-deletion contract is the founder instrument for `db:util`, and the
  `db:bootstrap` consequence must be surfaced at the mandatory human review gate, not slipped in.
- `scripts/lib/governance-attacks.ts` references `db:util` (1 site) and uses moved modules as overlay
  anchors; the attack table must stay total under its own four properties (every rule an attack, every
  attack a control twin, anchors must exist, zero-case rules fail the build).
- `npm run governance:baseline` is the only writer of the baseline, before and after.

## 6. Scope and non-goals

In scope: everything in §3; repointing every consumer import of every moved symbol (including the
three service files whose `db:util` imports are legal today — the module they import from ceases to
exist); the npm-script/`deploy/bin/setup` path updates; the registry/attack updates of §5.

Out of scope (verbatim from the plan, plus the boundaries found here):
- Splitting `framework/shared` wholesale — the successor split WP; this WP only takes the two bus
  sites off it and lands the moved substrate as plain named exports.
- Assigning owners to unowned tables and routing service-owned writes through owners — the successor
  ownership WP (except the narrow feasibility fallback flagged in §4, which requires an explicit plan
  amendment first).
- The development-world writes in `framework/db`'s own schema/migration tests
  (`framework → db:table (other) [table:write] development`, 10 sites) — the fixtures WP.
- Wiring `bootstrap-pg` into the deploy chart (a pre-existing, documented gap; relocation must not
  make it worse, and `npm run db:bootstrap:pg` must still work).
- Every other baseline group (application→service, layer→service, layer/service→db:table, schema-ns,
  MCP, raw-runtime…) — the composition-roots and ownership WPs.

## 7. Baseline entries this WP clears (and no others)

Production (~30 sites): `application → db:util [import]` (1) · `layer → db:util [import]` (6) ·
`layer → db:unknown [import]` (1) · `framework → db:table (other) [table:read]` (2) ·
`framework → db:table (other) [table:write]` (15) · `framework → db:table (unowned) [table:write]`
(2) · `framework → EventBus [event]` (2) · `framework → layer [di]` (1).
Development (1): `application → db:unknown [import]` (the phantom-`seed` test).
Each group's deletion puts its rule at error in the same commit. Matches the track registration's
"~31 production + 1 development".

## 8. Verification expectations (definition, not implementation)

- **Static:** the governance lint is the enforcement instrument for ACs 1–5 — zero unplaced db
  symbols, zero `framework → EventBus`/`framework → layer` crossings, zero table crossings from
  `framework/db`, the §7 groups absent from the baseline, and the two regression scenarios in the
  plan (new non-database `db` export; new `eventBus.emit` in `shared`) failing by name via the
  existing unplaced-symbol error path and the promoted-group errors, break-tested through the attack
  table.
- **Runtime:** first-boot equivalence (AC 7) is proven by executing both boot paths against a clean
  database and comparing produced rows with `origin/main`'s output — the existing factory-bootstrap
  integration suites (AF17 ×2, factory-and-demo, X3, AD8a, propagation-bootstrap — 110 assertions)
  relocate with the code and must stay green; the desktop-path equivalence needs an executed check,
  not source reading.
- **Hygiene:** `npm run verify` green; no moved export may end up consumed only by tests or tooling
  (`knip:production` treats that as dead — flagged risk: `readSystemPromptTemplate(docsRoot, file)`
  loses its last production consumer when the bootstrap becomes a tool; make it internal to the
  templates module rather than exported, or let architecture find the shape where production consumes
  it).

## 9. DOC-CLASS: update

One reason: relocations invalidate cited paths in `docs/deployment/self-hosting.md:64` and
`docs/deployment/shared-backend.md:70` (`framework/db/src/bootstrap-pg.ts` et al.); command NAMES and
behaviour are unchanged, so this is a path-accuracy update, not a rewrite.
