# AU28 — Founder rulings

Binding input to `/refine`, `/architecture`, and every downstream phase. Recorded verbatim at the
requirement gate. These supersede any conflicting statement in `docs/`, `CLAUDE.md`, or a prior
work package's architecture log.

---

## Ruling 1 — legality is the founder's call, and defining it IS AU28's job (2026-08-04)

> "what is legal is my decision. And exactly what we discuss. once core aspect that is DI is only
> legal within the same layer. a layer can only import from shared or from its layer. conversation
> across layers need to go through api/mcp or events. What I exactly want to challenge here in AU28
> is the defintion of what is legal and then ensure the repo has architectural governance linting
> that enforces these rules."

### What this settles

**Escalation B is settled: AFFIRMED as a deliberate rule change.** `refine` found that
`docs/architecture/runtime-simplification.md:30-31` and `:164-172`, plus `CLAUDE.md:84`, state a
*hierarchy* rule (downward dependencies legal, cross-Layer DI explicitly sanctioned) under which 38
of the 39 live crossings are legal. AU28 replaces that with an *isolation* rule. AU21's guard was
not half-built by oversight — it implemented the rule as written. The founder is ratifying a new
rule; those three statements are superseded, not clarified.

### The rule, as stated

1. **DI is legal only within the same Layer.** An injected port crossing a Layer boundary is
   forbidden — this is the crossing the founder names first and the one invisible to import-based
   checks by construction.
2. **A Layer may import only from `shared` or from within its own Layer.** (Foundation-set
   boundary — see Open question 1.)
3. **Cross-Layer conversation goes through API / MCP or events.** Those are the only legal
   inter-Layer mechanisms. Nothing else works.
4. **AU28's deliverable is two things, both required:** (a) the *definition* of what is legal —
   challenged and settled, not inherited; (b) **architectural governance linting** in the repo that
   mechanically enforces that definition.

### Consequences for `requirements.md`

- §7-B is no longer an open escalation — it is decided. The contract supersedes the three
  ground-truth statements and must say so.
- The 7-kind taxonomy must name **MCP** explicitly as a legal cross-Layer conversation mechanism
  (founder vocabulary), not fold it silently into "seam call".
- **Injected port across a Layer boundary = Forbidden** is now a stated rule, not a proposal.
- The framing shifts from "extend AU21's guard" to **architectural governance linting** — the
  governance surface is the deliverable, not a patch.

---

## Ruling 2 — AU28 is rules + linters; relocation is a later round (2026-08-04)

> "lets start with a round of building the rules and the linters and then we figure out what we do
> where."

**Settles escalation C and the composition-root question.** AU28's deliverable is (a) the settled
definition of what is legal and (b) the architectural governance linting that enforces it. Deciding
*where code should move* — the composition-root split, the 26 Application-role crossings inside
`packages/core-api/src/**`, AU26's relocation — is explicitly a **separate, later round**, not
AU28's job.

Consequences:

- Do **not** perform the composition-root split in AU28. `plan.md`'s out-of-scope line stands.
- The governance lint must therefore *report* the full, real violation set — including the 26 —
  rather than exempting them, so the later "what we do where" round is scoped from live data.
- **AC #6** ("`core-api → agent-execution` resolved first and completely") is re-scoped: AU28 owns
  the rule and its enforcement for that pair, not the relocation that closes it. Amend the AC.
- The reviewer's condition stands and is now load-bearing: Open debt needs a **mechanical ratchet**
  (a committed count that can only shrink), not a convention. Without it the 26 warn-rows become
  permanent — and convention already failed at exactly this spot one work package ago
  (`composition-edge-anti-regrowth-guard.ts:56-58`).

---

## Ruling 3 — foundation importability is per-Layer, and `db` is ACL'd per table (2026-08-04)

> "also not sure whats in the api contract but also not everything is allowed to import api
> contract. everything has a depends on the layer. maybe even shared and shared needs to be split up
> furter"
>
> "yeah we need proper inventory of what is in api contract and shared. db defintely has an ACL
> where only the owner service is allowed to import its table"

**Kills the flat "Foundation is always importable" row.** `refine` §2 and §3.3 assume a uniform
Foundation set any Layer may import. That is rejected.

1. **Foundation importability is itself per-Layer.** Not every package may import
   `@hyperidle/api-contract`. The contract needs a matrix over (importing package role/identity ×
   foundation package), the same shape as the Layer-pair matrix — not one blanket Allowed row.
2. **`@hyperidle/db` is ACL'd at table grain.** Only the owning Service may import its table.
   Importing `@hyperidle/db` is not a Layer-wide right; the existing `table-ownership-guard.ts`
   concept becomes a *contract row enforced at the import*, not just at the query.
3. **`@hyperidle/shared` may need splitting.** Open — depends on what the inventory shows. If
   `shared` is a grab-bag, a Layer importing "shared" is importing far more than the rule intends.
4. **Inventory required before the rule can be written.** A real, evidenced inventory of what is
   actually in `@hyperidle/api-contract` and `@hyperidle/shared` (and db table→owner mapping) is a
   precondition — the founder is not ruling on these blind. Lands at
   `.pipeline/work/AU28/foundation-inventory.md`.

---

## Ruling 4 — the ACs are not binding; the dead RPC client goes in AU28 (2026-08-04)

> "1. yeah  2. fuck the ACs."

1. **Delete the dead Hono RPC client inside AU28.** `packages/web/src/api/client.ts` has zero call
   sites, `AppType = Hono` (bare — `BlankSchema`, zero route inference), is unreachable from
   `main.tsx`, and is protected by a bespoke eslint carve-out (`eslint.config.ts:481-483`) that
   exists only to exempt it. Removing it — plus the `@hyperidle/core-api` and `hono` deps from
   `packages/web/package.json:24` and the carve-out — makes `packages/web/src` clean under the rule
   with no behaviour, bundle, or type change. Note this does NOT close the underlying risk: every
   response shape in `packages/web` is an unchecked cast (`hooks/useFetch.ts:29`,
   `res.json() as Promise<T>`; 156 `apiFetch` occurrences), so server/client drift is undetectable
   by `tsc`. That is a separate work package.
2. **`plan.md`'s acceptance criteria are explicitly released.** ACs #5/#6/#7 (clean up the 38, close
   `core-api → agent-execution` "first and completely") assumed AU28 does the cleanup; Ruling 2 says
   it does not. Rewrite the AC set to match the real deliverable — the contract, the governance
   lint, the ratchet — rather than contorting the plan to satisfy stale criteria. This is a founder
   release, not a silent scope reduction.

---

## Ruling 5 — architectural constraint: role is never derived from path (2026-08-04)

The founder is considering reorganizing packages (`layer/<package>`, `shared/<package>`). Therefore
a package's **role must be derived from its manifest / an explicit registry, never from its
directory path**. If the governance lint infers roles from paths, a later restructure silently
invalidates every rule. Path-independent role assignment keeps the reorganization free.

---

## Ruling 6 — no unowned tables; `sessions` is a missing Service (2026-08-04)

> "also example no unowned tables. the sessions tables seems to be such an very bad code smell."

**`UNOWNED_SHARED_TABLES` is abolished as a concept.** Every table gets an owning Service. There is
no "cross-cutting table" state.

The four current members — `sessions`, `propagationLog`, `taskDispatchAttempts`, `userSkills`
(`scripts/table-ownership-guard.ts:276-330`) — are exempt on a **circular rationale**: the guard
argues that because many Services access the table, naming one owner "would be a false-ownership
claim the zero-exceptions ACL principle forbids." That inverts the principle. Many Services
touching a table directly *is* the violation the ACL exists to prevent; the exemption preserves the
smell and calls it rigor. An unowned table is the exception.

**Measured sprawl for `sessions`** (this worktree, `rg` over non-test `.ts`): 34 files across
**8 package areas in 3 Layers** — `eval/src` 12, `core-api/src` 9,
`agent-orchestration/run-orchestration` 7, `core-api/policy` 2, `core-api/{work,review,realtime}` 3,
`agent-orchestration/tool-handlers` 1.

Two consequences for the contract:

1. **A shared table is a cross-Layer communication channel with no import.** It bypasses every rule
   in Ruling 1 by construction — nothing crosses a package boundary, so no import- or DI-based check
   can see it. The contract must name *owned table* as a crossing kind whose cross-Layer verdict is
   Forbidden, closed structurally by single-Service ownership. Without that, the biggest bypass in
   the system is unlisted.
2. **`sessions` has no Service. One should exist.** Assigning an owner is not bookkeeping — it is
   identifying a missing boundary. Scoping that is follow-on work (a sessions-ownership WP), but
   AU28's contract must state the rule (`every table has exactly one owning Service`, completeness
   enforced) and the lint must *report* the four unowned tables as debt rather than exempting them.
   Tooling (`eval`) reading domain tables directly needs its own verdict in the same pass.

---

## Ruling 7 — a bench may seed the database (2026-08-04)

> "eval is allowed to access db. evals are like tests necessary to access the db to setup the
> environment in such a way that it can run its evaluation in a controlled scenario."

**Tooling → `db` is Allowed, including tables it does not own.** An eval is a test: it must be able
to put the database into a known state before it can evaluate anything. Reaching the owning
Service's API for setup would make the bench depend on the very surface it is benching.

This overturns `rule-matrix.md` §7's "Tooling gets no privileged database access" and its
recommended alternative ("seed and assert through the owning Service's API"). The
zero-exceptions-in-ownership-ACLs rule still holds — this is not an exception, it is a **general
rule for the Tooling role**, written once and applying to any bench.

**Measured impact:** removes **278 of 443** production violations (63%) —
`V.eval→foreigntable.table` 225, `V.eval→foreigntable.table-import` 52, `V.eval→dbschemans.import` 1.
Remaining production violations: **165**.

**Not covered by this ruling** (still Forbidden, 9 production instances): `eval` reaching *past a
Layer barrel into a Service* — `@hyperidle/harness-registry`, `@hyperidle/settings`,
`@hyperidle/users` (3 imports + 3 manifest rows) — and `eval/src/judges.ts:502` dynamic-importing
`@anthropic-ai/sdk` instead of routing through the model gateway. Database access and Service
reach-through are different rules; do not let the former launder the latter.

---

## Open question 7 — `packages/web/scripts/` is a bench, not UI (2026-08-04)

Founder asked what `web` is, given how much of the violation list is `web/scripts`.

**What it is:** seven files, all Playwright e2e infrastructure, none shipped to users.
`ah{1,5,6}-test-server.ts` boot a **real Hono server** via `createServer` on a port, with in-memory
PGlite, seeded users/teams/credentials, and cassette-intercepted LLM calls — the servers the e2e
specs run against. Plus two budget-assertion scripts, a model resolver
(imports `@hyperidle/eval/smoke`), and `l23-screenshots.ts` (visual-proof capture). Their own
`@lore` comments concede the irregularity: *"npm workspace hoisting means `@hyperidle/server`,
`@hyperidle/db` are accessible from node_modules even though `packages/web` doesn't declare them."*

**Measured:** of `web`'s 44 production violations, **38 are in `web/scripts`**, 5 are the
`package.json` rows serving them, and **exactly 1 is in `web/src`** — the dead `client.ts` already
being deleted under Ruling 4.1. **The shipping UI is already clean.**

**Therefore:** `web/scripts` is the same category as `eval` — a bench that boots the real system and
seeds the database. Ruling 7's rationale applies to it identically. Two ways to land it, for the
founder to pick:

1. **Relocate** the scripts out of `packages/web` into a Tooling package. Cleanest: a Layer package
   containing code that boots another Layer's server is the actual smell, and after the move
   `packages/web` is 100% clean with zero rule changes. This is `rule-matrix.md` §2's own
   recommendation.
2. **Classify by path** — treat `packages/web/scripts/**` as Tooling in place. Rejected on sight by
   **Ruling 5**: role comes from the registry, never from a directory path. Adopting it here would
   reintroduce exactly the file-grained map that rotted `au6-agent-boundary-guard.ts`.

Recommendation: **(1)**. Relocation closes all 43 without weakening a rule. Combined with Ruling 7,
production violations drop from 443 to **121**.

---

## Ruling 8 — production and test/tooling are two worlds; separate them first (2026-08-04)

> "I think the first thing we need to do now very clean rule about and then also move these things
> into dedicated folders or have the files explicitly labeled is seperating production code from
> testing & tooling code. a proper seperation and then we need these analysis and what can access
> what in seperate production code verus tooling & testing code. those are complete different worlds
> with different rules and standards."
>
> "the important piece being testing/tooling files may never be imported by production code."

**This reorders AU28.** The production/test/tooling separation is now the *first* deliverable, and
the access rules are stated **twice** — once for the production world, once for the test/tooling
world — rather than once with exemptions bolted on. Recorded as a founder-directed scope change, not
an agent's re-scoping.

### 8.1 — The hard rule

**A production file may never import a test or tooling file.** One direction, no exceptions.

**Measured: already true.** Exactly one production→tooling reference exists repo-wide —
`packages/web/package.json` declaring `@hyperidle/eval`, a manifest row that exists only to serve
`packages/web/scripts/`. **Zero production source files import test or tooling code.** The rule
costs nothing to adopt today and is pure regression protection.

### 8.2 — Two worlds, two standards

The same crossing gets a different verdict depending on the file kind. Ruling 7 is the first
instance (a bench may seed the database; production may not). The contract must therefore carry
**two rule tables**, not one table with carve-outs — because a carve-out is what rots.

### 8.3 — Classifying a file: the fork the founder must settle

Note the tension with **Ruling 5** (role comes from a registry, never a path) and resolve it
explicitly: Ruling 5 governs **package role**; there is no per-file manifest, so **file kind** must
come from path or name. The safeguard is that the set of patterns is **enumerated in the contract
and closed**, not an ad-hoc regex that drifts — drift is exactly how `au6-agent-boundary-guard.ts`
rotted into a no-op.

**Measured current state — the separation is already ~97% true by folder:**

| Location | Files | Dedicated? |
|---|---|---|
| `__tests__/` directories | 885 | yes, consistent — and it already catches non-`.test.` helpers (`_helpers.ts`, `test-ports.ts`, `require-harness.ts`) |
| `packages/web/e2e/` | 91 | yes, consistent |
| `packages/eval/` | whole package | yes — a Tooling-role package |
| `packages/web/scripts/` | 7 | **no** — benches inside a Layer package |
| `*.stories.tsx` | 136 | **no** — interleaved with components in `src/` |

Three options:

1. **Folder-only.** Production = anything not under `__tests__/`, `e2e/`, `scripts/`, or in a
   Tooling package. Requires relocating the 136 `.stories.tsx` files out of `src/`. **Rejected on
   sight:** a story living beside its component is a deliberate standing decision (the
   `.stories.tsx` *is* the design artifact under the TSX-first rule). Moving them fights an existing
   ruling to satisfy a lint.
2. **Label every file.** Explicit, zero ambiguity, no drift — but ~1,300 files need a label, and a
   label can go stale exactly like a path can.
3. **Hybrid — folder for the bulk, closed suffix set for the interleaved cases.** Already true for
   885 + 91 files. `.stories.tsx`, `.test.ts(x)`, `.spec.ts` remain legal beside production source
   because they are self-identifying by name. The pattern set is written into the contract as a
   closed list, and the guard hard-throws if it ever matches zero files (the anti-rot check that
   `au6` lacked).

**Recommendation: (3).** It is already the de-facto layout, it costs two moves rather than 136, and
it does not overturn the TSX-first decision. The only real relocation left is
`packages/web/scripts/` → a Tooling package, which Open question 7 already recommends and which
closes 43 violations by itself.

### 8.4 — Precision requirement (founder correction)

> "you need to be very precise if you talk about production code or test/tooling. the standards are
> two completely different worlds there."

Every count, every finding and every violation statement must name its world. Reporting a bench-file
issue in production language overstates it. Concretely: the `@anthropic-ai/sdk` finding is
`packages/eval/src/judges.ts:502` — a **bench** file. **Raw-LLM-SDK usage in production code is
zero.** It remains a real bench-quality problem (it bypasses `callLlm`, so it cannot be
cassette-replayed and is locked to one provider) but it is not a production boundary breach and must
not be described as one.

---

## Ruling 10 — clean slate: every past rule is assumed wrong (2026-08-04)

> "we are redesigning the architecturall goverannce complete new here. you have to assume that all
> explicit or implicit rules in the past are wrong."
>
> "yeah all those useless guards lets directly delete them… we will anyhow build better architectural
> governance… i assume delete them all thats overengineering garbage."

**Every existing guard script is deleted.** Not audited for keeps, not migrated — deleted. The new
governance re-derives what it needs from first principles.

**No past rule carries protective weight, including rulings a founder made in an earlier work
package.** They were made inside the frame AU28 exists to replace. Explicitly stripped of authority
for this purpose: table ownership, the execution boundary, AU21's `agent-orchestration → core-api`
zero-edge end state, AR1's honest-harness tests, the visual-regression net. If any of those rules
belongs in the new governance, it must be **re-derived and re-argued from scratch**, not inherited.

**Rationale.** AU28's own investigation is the evidence: the "rules" were never one thing. Roughly
twenty guards, each with its own scan scope, two of them provably no-ops (`au6`, `au9` — both scan
the deleted `packages/server/src`), ground-truth docs stating a rule the founder had already
overturned, and one direction of one Layer pair checked while the reverse sat unguarded. Inheriting
any of it inherits the incoherence. That is the whole problem.

**What the old guards ARE good for:** evidence of real pain someone hit once. Mine them for signal —
what went wrong, whether it can still happen, and any hard-won detection technique (e.g. manifest
and import checks are both needed because hoisting resolves undeclared imports; AST parsing beats
name-voting) — then discard the scripts.

**Note:** rulings 1–9 in this file are the *new* design, made in this session, and stand. Ruling 10
applies to rules inherited from before it.

---

## Ruling 9 — the agreed sequence (2026-08-04)

> "lets get going with the prod/dev split while we wait for AU26 to finish… then when AU26 is
> finished we start moving packages around. And then once that is done we go back to discussing the
> layer access patterns within the prod & dev domains."

**Four steps, in this order. Do not merge them.** Each is founder-directed; AU28's scope is now
step 1 only, with steps 2–4 recorded as named successors (an explicit narrowing, not a silent one).

| # | Step | Gate |
|---|---|---|
| **1** | **Production/development split** — the rule, the file moves, the governance lint. **AU28, now.** | plan → fresh critique → build → review |
| **2** | **Move packages into role folders** — `layers/`, `framework/`, `applications/`, `tools/`, `deploy/`. | **blocked on AU26** (29 commits in, no PR yet) |
| **3** | **Layer access patterns**, stated separately for the production world and the development world. | after step 2 |
| **4** | **Split `shared`** + clear the remaining violations. | after step 3 |
| **5** | **Rewrite `CLAUDE.md` + `.claude/rules/`** to the settled structure and rules. | after step 3 (but see the two live errors below) |
| **6** | **Purge dead concepts** — `strategy` (sense 1 confirmed dead; sense 2 pending founder call), stale package references. | founder decision pending |

### Step 5 — the docs are wrong now, not just after the refactor

**Two errors are live today and actively mislead any agent that reads them:**

1. **`CLAUDE.md:84`** — *"Three-layer system with strict downward dependency: Human Interface → Meta
   Layer → Agent Runtime. No layer reaches past its neighbor."* Wrong twice: the real model is four
   Layers (`core-ui`, `core-api`, `agent-orchestration`, `agent-execution`), and **"strict downward
   dependency" is precisely the rule Ruling 1 overturned** (a Layer imports only itself or `shared`;
   cross-Layer talk goes over API/MCP/events). `refine` found the same statement in
   `docs/architecture/runtime-simplification.md:30-31` and `:164-172`. Fix early — every agent
   currently reads the superseded rule as binding.
2. **Dead packages cited as real** — `packages/server` (`CLAUDE.md`, `.claude/rules/frontend.md`,
   `.claude/rules/testing.md`), `packages/fabric` (`CLAUDE.md`), `packages/strategy-minimal`
   (`CLAUDE.md`, `.claude/rules/testing.md`). None exist.

**Goes stale as a consequence of the refactor** (so it waits): the test-file-naming table in
`CLAUDE.md` (step 1 changes it), every package path reference (step 2), the layer access rules
(step 3).

### Step 6 — `strategy` is two concepts; only one is confirmed dead

**Sense 1 — the strategy package / kernel-vs-strategy split. DEAD, purgeable now.**
`packages/strategy-minimal` does not exist. AK6's roster-injection seam that served it is test-only
reachable: `minimalFactoryRoster` (`shared/src/factory-roster.ts:139`) has zero production callers,
no production code passes a second argument to `applyFactoryBootstrap`, and
`core-api/org/src/scaffold-agents.ts` mentions `FactoryRosterSpec` only in a comment. Delete the
seam, the `roster?` parameter, and `db/src/__tests__/AK6-factory-roster.integration.test.ts`. AK6's
"hard-rule #1: no hardcoded roster in factory-bootstrap" dies with it — it existed only to serve the
seam.

**Sense 2 — `strategy` as an agent category. CONFIRMED DEAD by the founder (2026-08-04): *"strategy
was completely killed a long time ago and shouldn't exist."*** Everything below is a leftover to be
removed, not a live concept — no new code may build on it. Removal is its own work package because
it is a schema migration against live rows.
`AGENT_CATEGORIES = ["team","strategy","individual"]` (`shared/src/types.ts:134`);
`users.agent_category` column (`db/src/schema.ts:94`); **four roles carry `category: "strategy"`**
(`shared/src/agent-roles.ts:152,162,171,180`); zod enum at `core-api/src/routes/org.ts:73`; also
`db/src/agent-scaffold.ts:34`, `shared/src/team.ts:55`; knowledge strategy-layer columns
(`schema.ts:859`). **119 code files, 37 doc files** mention it; 55 mention `kernel`. Removing it is a
schema migration with live rows plus a product change — comparable to the Rail and CoS purges, and
its own work package.

**`applyFactoryBootstrap` itself stays** — `desktop/src/main.ts:451` calls it on boot to write the
`system:propagation` user, the system-assistant singleton, the facilitator agents and a knowledge
seed. The *name* is legacy; the behaviour is shipped. `factory_settings` the **table** was already
retired by AU18.

### Step 1 — the settled rule

**A file is development if any of:** a path segment starts with `__`; the filename ends `.stories.tsx`;
it belongs to a wholly-development package (`eval`, `eslint-plugin-authz`, `eslint-plugin-design` —
a three-entry list that deletes itself at step 2 when they move into `tools/`); or it sits outside
`packages/`. **Otherwise it is production.**

**The crossing rule:** a production file may never import a development file. One direction.

`__` means development, full stop — no provision for `__generated__` or anything else that does not
exist yet (founder: *"no need to plan for something that doesn't exist yet"*).

`.stories.tsx` is the one suffix that survives, because a story must sit beside its component under
the standing TSX-first decision.

**Known work:** ~22 development files currently sit in production paths and must move into `__`
folders (chiefly `db/src`'s 9, `core-api/src`'s 5, `shared`'s mock harness,
`design-system/research`'s 81, `web/scripts`). **`seed.ts` is deleted** — 26 lines, `@deprecated` in
its own docblock, only callers are five in one integration test; the production path is
`applyFactoryBootstrap`.

**Today's breaches, which no folder convention would have caught:** `shared/src/index.ts:333`
publicly exports `MockHarnessAdapter`; `db/src/index.ts` exports `createTestDb`/`warmPool`/
`closeAllInstances`; `db/package.json` advertises `./test-fixtures` and `./test-pool` as public
entry points.

### Step 2 — the structure, already agreed in shape

`layers/` is today's `packages/` renamed, **unchanged inside** — services stay nested packages inside
their layer package, which is what makes layer→service ownership free (no ownership list, no
inference). `framework/` (shared, db, api-contract, design-system), `applications/`, `tools/`,
`deploy/` (chart, homebrew, bin) move out. **Package names do not change, so no import in the repo
changes** — only workspace globs, seven tsconfig aliases, and 34 deep relative imports.

Deferred with it: whether the layers become `core`/`orchestration`/`execution` and whether `ui` is a
layer or a deployment unit. Founder: *"core api is so wrong designed… we need to get the api out of
core api… that still hurts."* AU26 already carries the substance (each Layer owns its own Hono app;
composition moves to the Application tier), so the naming is downstream of it.

### Governance-lint principle (applies from step 1 onward)

**One census, many rules.** One pass builds the connection graph and classifies every file; rules are
declarative predicates over it and never scan for themselves. Every file must classify — unclassified
is a build error — and **a rule matching zero files fails loudly**. That is the defect that turned
`au6-agent-boundary-guard.ts` into a silent no-op and left 57 table violations outside
`table-ownership-guard.ts`'s scan scope. Known violations warn, new ones fail, the count only shrinks.

---

## Open question 6 — is the architecture complete enough to state every rule? (2026-08-04)

> "Not sure if our architecture is already complete are we already able to define each legal and
> illegal connection as rules?"

**Answered by construction, not by opinion:** the contract must enumerate *every* cell and mark each
one `Allowed` / `Forbidden` / `Unsettled — blocked on <WP>`. Incompleteness becomes explicit and
countable instead of invisible. Known structural blockers at the time of asking: (1) `core-api`'s
dual Layer/Application role; (2) the in-flight foundation re-cut (`shared` split, `api-contract`
relocation). Known open cells: `web/scripts/*` package-vs-file role; Foundation→Foundation
(live, unruled); Application→Application (no verdict); MCP unnamed as a kind; the
`apiFetch` + WebSocket traffic carrying 100% of UI data matches no named kind.
