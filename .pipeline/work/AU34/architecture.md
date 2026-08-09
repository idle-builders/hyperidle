# AU34 — Architecture

**Authority.** `plan.md` (outcomes, ACs, constraints) > `founder-rulings.md` (Ruling 1 and its scoped
predicate, Ruling 2) > `requirements.md` (the package set, the audience table, the fold set, the scope
inventory). This document adds no outcome and no scope. It decides **order, mechanism, ownership and
evidence**.

`requirements.md`'s measurements were verified independently four times and are **not** re-derived here.
Measurements taken for this phase are in `feasibility.md` (P1–P6).

**Two design rules govern this revision, and every decision below is checked against them:**

> **R-A. The atomic window contains no judgement.** Every decision lands in Phase A, where a wrong one is a
> revert. Phase B contains moves, generated rewrites, and values printed by an existing tool.
>
> **R-B. A guarantee is enforced by something that fails a build, not by a hand-list entry.** Where the only
> available enforcement is a hand-list, say so and prefer a mechanism that is already a gate.

**Tier: production.** Every package in the repo depends on the thing being split.

---

## 1. AC → obligation map

| AC (`plan.md:47-52`) | what discharges it | where |
|---|---|---|
| `framework/shared` no longer exists; what it held lives in framework packages named for what they contain | Phase B's atomic move; 18 packages per `requirements.md` §4 | §3, §4 |
| every package has a decided audience, and the build fails on a package with no audience decided | 18 `surfaces` entries + the new framework-surface check in `registries-honest` | §6.3 |
| only justified `everyone`; the rest reachable only by their stated audience, enforced by the lint | `reach-declared-surfaces-only`; Ruling 1's clause under its scoped predicate, **gated by two `decided-rules.json` rows** | §6.1, §6.2 |
| no package's dependency closure carries a toolchain it does not use | `deps:check` — already a two-directional gate | §5 |
| no module survives that nothing outside its own package reaches | Ruling 2's nine folds (`requirements.md` §4.9) | §3 A4, §7 |
| `npm run verify` green **and** the application behaves identically, proven by running it | §7 | §7 |

---

## 2. What is reused, and the change boundary

**Reused, not built.** Four existing mechanisms carry work this WP would otherwise invent:

- **`scripts/dep-manifest-lint.ts` (`deps:check`)** — "every workspace package must declare exactly what it
  imports: no more, no less", failing in both directions with per-package sites. The AC-4 mechanism and the
  manifest-derivation engine (§5).
- **`scripts/typecheck-gate.ts`** — discovers packages by scanning role roots for `tsconfig.json`.
  `typecheck-debt.json` is `{ packages: {} }`: **zero debt**, so the eighteen are clean from first commit.
- **`framework/db/src/__tests__/governance-model.test.ts`** — the frozen row-reproduction loop
  (`:200-232`). §6.2 turns this into the gate for Ruling 1's predicate, because the attack harness cannot be.
- **`npm run governance:floors`** (`scripts/governance-floors.ts`) — prints each floor's live count, slack,
  allowance and the value to write. §3 B8 uses it rather than hand-computing.

**The change boundary.** Placement only. No function's behaviour changes (`plan.md:36`). The folds, the four
edge rewrites, the two module splits and the test splits are all moves of declarations between files.

---

## 3. Order of operations

`plan.md:34` forbids a shim, so the split is atomic — there is no state in which both `@hyperidle/shared`
and the eighteen resolve. The architecture's job is to make the atomic window contain **nothing but
mechanism**.

### Phase A — every decision, each step green on its own

`verify:quick` runs **no tests** (`package.json`), so the verification column names the actual command.

| # | step | kind | verified by |
|---|---|---|---|
| A1 | **Ruling 1's clause** under the scoped predicate (§6.1); `scripts/governance-context.ts:187-195` `frameworkSurfacesOf` fix + its twin at `governance-attacks.ts:928` (§6.4); `governance/README.md` | judgement | `npm run lint` |
| A2 | **The predicate's gate**: two `forbidden` rows in `decided-rules.json` (§6.2) + `governance-model.test.ts` fixture work — `makeActor`'s 25 packages, `totals.rows` 118→120 and the six hardcoded totals | judgement | `npx vitest run framework/db/src/__tests__/governance-model.test.ts` |
| A3 | **Framework-surface check** in `registries-honest`, both directions, subset floor (§6.3), attack + control twin | judgement | `npm run lint` |
| A4 | **Delete `format/money.ts`** + the ten dead exports; fix the ten test consequences (`requirements.md` §1.3 four + §4.6 six) — including the two namespace imports at `harness-registry/src/__tests__/{return-gate,return-status-tool}.test.ts:14,23` | mechanical | `npm run check`, `npm run test:full` |
| A5 | **The nine folds** (Ruling 2, `requirements.md` §4.9) | judgement on the 7-way collapse | `npm run check`, `npm run test:full` |
| A6 | **Split the cross-destination tests** (§3.1) | **judgement — this is BL-1's fix** | `npm run test:full` |
| A7 | **The four edge rewrites**, pre-split spelling — D1's two acts, plus `console-adapter.ts:1` and the two `http/*` self-imports as **relative** imports (`../logger.js`, `../api-types.js`) | judgement | `npm run check` |
| A8 | **The six republication removals + two repoints** (§3.2) | judgement | `npm run check`, `npm run lint` |
| A9 | **Split `model-gateway.ts` and `credential.ts`** in place, inside `framework/shared`, using **relative** imports between the halves | judgement | `npm run check` |
| A10 | **Decide the floor raise** (§3.3) — the justification, not the numbers | judgement | recorded, executed in B8 |

Order: A4 → A5 → A6 (deleting an export the fold would carry; folding before splitting tests that import the
folded modules). A7 → A9. A1 → A2. A3 and A8 are independent.

### 3.1 A6 — the test split, and the criterion that decides it

`requirements.md` §6 says distributing the tests is a decision, not a move, and names three files that span
destinations. Verified live:

- **`__tests__/o1-event-split.test.ts:17-18`** imports `../events.js` *and* `import * as sharedIndex from
  "../index.js"` — the barrel B3 deletes.
- **`__tests__/AE6-kind-registry.test.ts:7-15`** imports eight `kinds/*` modules that A5 folds into
  `kinds/registry.ts`.
- **`__tests__/types.test.ts`** — spans destinations.

**The criterion, so the builder does not re-decide it per file:**

1. A test whose imports resolve to **one** destination moves whole, into that package's `src/__tests__/`.
2. A test spanning **two or more** splits along the destination boundary — one file per destination, each
   asserting only what that package owns. It does not "pick a home and import across": a cross-package test
   import is a production→? crossing `reach-declared-surfaces-only` judges, and a test asserting on a package
   outside its own audience is a red build B3 cannot roll back cheaply.
3. An assertion **on the barrel itself** (`o1-event-split.test.ts`'s `sharedIndex` namespace) has no
   successor — the object it asserts on will not exist. Re-express it against the destination package's own
   `src/index.ts` where the assertion is about that package's surface; delete it where it was asserting the
   union of a package that is being dissolved.
4. A test of a **folded** module (A5) asserts through the module it was folded into.

The split happens **inside `framework/shared/src/__tests__/`**, in Phase A, for the same reason the folds
do: it is self-contained and independently verifiable, and it turns B1 into a `git mv` of whole files.

### 3.2 A8 — the repoints, corrected

`layers/core-api/credentials/src/credential-resolver.ts:31` is `export type { CredentialResolver } from
"@hyperidle/shared"` — a **pure re-export**; `@hyperidle/credentials` declares nothing of the sort. So the
two production importers repoint **at the declaring package**: `@hyperidle/shared` in Phase A, and
`@hyperidle/credential-access` when the codemod runs in B. The sites are
`layers/core-api/src/app.ts:2` and `applications/remote-server/src/create-server.ts:67`, plus the two tests
that follow them (`core-api/src/services/__tests__/AH2-resolve-agent-model.integration.test.ts:13`,
`core-api/src/routes/__tests__/X4-model-gateway.integration.test.ts:24`).

### 3.3 A10 — the floor raise, decided before it is needed

`floors-tight` errors when slack exceeds `max(ceil(live × 0.2), 5)` (`scripts/rules/floors-tight.ts:57`).
Measured now with `npm run governance:floors`:

| floor | live | declared | slack | allowed | headroom |
|---|---|---|---|---|---|
| `detector:manifest` | 131 | 111 | 20 | 27 | **7 crossings** |
| `detector:import` | 3776 | 3307 | 469 | 756 | 287 |
| `pattern:test-runner-config:vitest.config.ts` | 30 | 1 | — | existence | n/a |
| `census:tracked-files` | 3360 | 2976 | 384 | 672 | 288 |

A `manifest` crossing is emitted per declared workspace dependency. The 30 `@hyperidle/shared` declarations
become each consumer's subset — ~107 from `requirements.md` §4.7's production lists alone, before dev-only
declarers and the eighteen packages' own sibling declarations. `detector:manifest` therefore lands around
210–250 against a floor of 111. **It goes red inside the window unless the raise is planned.**

**The decision, made here so B8 is mechanical:** the floors for `detector:manifest` and `detector:import`
are raised to the post-split live counts. The justification — which `floors-tight`'s own lore demands,
because reflexive bumping is the rot floors exist to prevent — is that **the population grew, no violation
was absorbed**: one package with 30 declarers becomes eighteen packages with the same consumers declaring a
subset each, so the crossing count rises while the number of *distinct dependency relationships a human
would recognise* is unchanged. The builder records the before/after live counts so the raise is auditable,
and raises **only** the floors whose growth this argument covers. Any other floor going red is a finding,
not a bump.

### Phase B — the atomic step, mechanism only

One commit. Every item is a move, a generated rewrite, or a value printed by an existing tool.

1. `git mv` the 79 surviving modules, the (post-A6) development files and the 15 non-`.ts` fixtures into
   eighteen `framework/<name>/src/` trees.
2. Write eighteen × `package.json`, `tsconfig.json` (service shape: `extends ../../tsconfig.base.json`,
   `composite: true`, explicit `references`), `src/index.ts`, `vitest.config.ts`.
3. **Delete `framework/shared`.** ← **point of no return**
4. Run the codemod over all 771 sites (§4).
5. Manifests: **30 rewritten + 1 deleted + 18 new** (the 31 includes `shared`'s own). Tsconfigs: **28
   package files + root `tsconfig.json` `references` = 29**, plus `tsconfig.base.json` `paths` (one alias
   out, eighteen in).
6. Registries: `governance/architecture.json` (18 surfaces in, `framework/shared` out, `eventBus.typesModule`
   repointed), `knip.json` workspaces, `vitest.config.ts` projects, root `workspaces`,
   `scripts/typecheck-gate.ts`'s leaf list (§6.5), `package-lock.json` regeneration.
7. `npm run verify` until green.
8. **Raise the two floors** to the printed values, per A10's decision, recording before/after.

**Point of no return: B3.** From B3 until B7 is green the tree does not typecheck — there is no shim, so
nothing resolves between the delete and the last rewrite. `plan.md:34` and "coherent at each step" cannot
both hold for this one step. **Every other step preserves coherence, and B now contains no decision.**

### Phase C — what is genuinely trailing

Only **C3** lands after `verify` is green. C1 and C2 are inside the window's tail: `lint` demands C1 to go
green at all, and C2 is blocked on the concept gate.

| # | step | when |
|---|---|---|
| C1 | `eslint.config.ts` ×16, `governance-attacks.ts:429` prose, `.claude/rules/design-system.md:17`, `docker-compose.yml:46`, and the four other `scripts/` sites in §6.5 | **required for B7 to be green** |
| C2 | `decided-rules.json` AU34 surface rows + the totals + `governance/README.md` (§6.6) | **after the concept gate** — the row policy is a founder decision (`requirements.md` §7.2) |
| C3 | 58 docs files | after green |

---

## 4. The import rewrite

### 4.1 Mechanism

A **name-driven codemod** over the TypeScript AST (compiler API + `tsx`, both already devDependencies),
driven by the post-split symbol→package map in `requirements.md` §4.4/§4.7. For each `import`/`export … from`
naming `@hyperidle/shared` or a subpath: resolve **each imported name** to its destination, group by
destination, emit one statement per destination.

**Type-only imports have two spellings and the second is the larger population** (P5): 383 statement-level
`import type` versus **128 statements carrying inline `type` specifiers inside a value import** — 87 of them
production, 291 specifiers in total, with `run-orchestration/src/provisioner.ts:6` carrying 19 alone. The
codemod preserves **per-specifier** `isTypeOnly` when regrouping, and a statement whose specifiers split
across destinations may yield a value import to one and a type import to another.

**The codemod is not committed** — under `scripts/` it would be a knip entry dead from the moment it runs.

### 4.2 Why name-driven (P2)

Seven of the 640 names collide with exports of packages **outside** the eighteen — `Message`,
`ProposedCall`, `Thread` (`@hyperidle/db`, Drizzle row types), `AutonomyLevel` (`api-contract`),
`AgentOperationalStatus`, `ArtifactPreview`, `Block` (`design-system`, the latter two React components).
Six are different symbols sharing a name. A human resolving `Thread` from memory, or a regex keyed on the
old specifier, lands on `@hyperidle/db` and compiles. The codemod's target is a pure function of the
imported name over a closed map whose range is the eighteen; it cannot.

### 4.3 How completeness and correctness are proven

**Completeness — dead specifiers.** A missed site keeps a `@hyperidle/shared` specifier that no longer
resolves; `npm run check` fails on every one, and a residual grep for the specifier across tracked files must
return zero. That is a build check, not a test.

**Completeness — the abort guard, widened.** A name-keyed guard is blind to a **namespace import**, which
carries no names: it neither maps nor aborts. Two live sites exist
(`harness-registry/src/__tests__/{return-gate,return-status-tool}.test.ts:14,23`) and A4 removes them, but
nothing checks A4 was complete. **The guard therefore aborts on any surviving `@hyperidle/shared` specifier
it cannot decompose into names** — namespace import, default import, bare side-effect import — not only on an
unmapped name.

**Correctness within the range (P6).** Taking the module-level export set of every module under the §4 map
gives **656 names with zero cross-package collisions among the eighteen**. So a wrong destination is always a
name the target does not export, and `tsc` fails. This is the claim the whole argument rests on and it is
measured in `feasibility.md` P6 — not, as an earlier draft said, in `requirements.md` §1.2, which does not
state it.

**The hole `tsc` does not close.** `tsconfig.base.json` sets neither `verbatimModuleSyntax` nor
`isolatedModules`, so **dropping an inline `type` specifier is not a type error**. The completeness argument
at §4.3 does not cover it. The check that does: the codemod counts inline type specifiers per file before
and after, and the totals must match (291 across 128 statements). A mismatch aborts.

**Cross-check.** The codemod's per-consumer output and `deps:check`'s independent scan of the tree derive
the same fact from different inputs; a codemod bug invisible to `tsc` would have to be invisible to
`deps:check` too, and `deps:check` reads imports, not the map.

---

## 5. Manifest and tsconfig derivation

Derived twice and reconciled: (1) the codemod's emitted destinations per consumer, unioned per package —
the proposed `dependencies` block; (2) `deps:check`, which scans each package's own files and reports every
divergence in both directions with sites. Write (1), drive (2) to zero.

**AC-4's named failure mode is closed by construction** (P1): copying `shared`'s block into eighteen
manifests declares packages nothing reaches, and each is reported `direction: "unused"`.
`requirements.md` §5.2's table is this loop's output.

`tsconfig` `references` are the same derivation on a different file, over the 29 sites in B5.

---

## 6. The model and tooling changes

### 6.1 Ruling 1 — the clause, scoped

The surface clause (`governance-model.ts:292-302`) decides **every** `sort: "surface"` target.
`founder-rulings.md` scopes it:

> The clause admits a `framework`-role source **only when the target surface label is `framework/<name>`**.
> `db:*` surfaces keep their declared audiences unchanged.

**Contract.** In clause 7, before `inAudience` decides, a `framework`-role source whose target label matches
`framework/<name>` is `allowed`. `db:client`, `db:row-type`, `db:schema-ns`, `db:unknown`, `db:testing` fall
through to `inAudience` unchanged. The clause id stays `reach-declared-surfaces-only` and `CLAUSES` does not
grow.

**Effect on the live tree is nil** — `framework/db` imports `framework/shared` today and is allowed because
`shared` is `everyone`.

### 6.2 What actually gates the predicate — and what does not

**Correction to an earlier claim.** Property 4 does **not** make the attack case mandatory here.
`governance-attacks.ts:804-831` keys coverage on **registered rule ids**, and the registered set is the ten
rule ids in `scripts/rules/` — `reach-declared-surfaces-only` is a *clause* id and is not among them. So
nothing forces the positive case or the `db:*` twins; as hand-list entries a later edit deletes them on a
green build, which is precisely what they exist to prevent.

**The gate is `decided-rules.json`.** Add two rows:

| source | target | kind | production | development |
|---|---|---|---|---|
| `framework` | `db:schema-ns` | `import` | `forbidden` | `forbidden` |
| `framework` | `db:unknown` | `import` | `forbidden` | `forbidden` |

The file today holds **no** `source: "framework"` row for any `db:*` target, which is exactly why it cannot
currently tell the broad reading from the scoped one. With these rows the frozen reproduction loop at
`governance-model.test.ts:200-232` enforces the predicate permanently: a broad implementation returns
`allowed` and the loop fails loudly. `development` is `forbidden` too because both are `oneDoorSurfaces` —
the development relaxation does not cross them.

Rows land in **A2**, not C2, because they gate A1. `totals.rows` 118→120 and the forbidden counts move with
them, in A2. C2 moves them again for the AU34 surface rows — the two edits are sequenced, not competing.

**Keep the attack cases as well.** The positive case (a framework package naming a `framework/<name>`
surface → allowed) and the two `db:*` control twins remain, because they run against the live tree and
report at the right altitude. They are belt; the rows are the load-bearing gate.

### 6.3 The framework-surface check — AC-2's delivery

An addition to `registries-honest`, whose population is already `census.packages` and whose role comes from
the `framework/*` workspace glob — so a new `framework/foo` is in scope from its first lint with no importer.
That is `plan.md:62`, which §6.4 provably cannot deliver.

Two directions: (1) every `framework`-role package resolves to a declared `framework/<name>` surface;
(2) every declared `framework/<name>` surface resolves to a package that exists — without (2), leaving the
retired `framework/shared` entry lints clean.

**Its floor cannot be `minScope`**: that floors the rule's whole 34-directory scope, so a framework subset
matching zero would still read clean — the `au6` shape one level down. The subset needs its own explicit
non-zero assertion (4 today, 21 after). This is a *registered rule*, so property 4 **does** apply: attack +
control twin are forced.

### 6.4 `frameworkSurfacesOf` — in scope, and now owned

`scripts/governance-context.ts:187-195` maps a framework package to its label **only when the label already
exists in `architecture.surfaces`**, so an undeclared package never becomes a `surface` target and the
failure reports the wrong clause (`requirements.md` §7.1). The fix — map every framework package
unconditionally — plus its twin at `governance-attacks.ts:928`, lands in **A1**. An earlier draft depended on
this and gave it no task.

### 6.5 Four `scripts/` sites an inventory called "measured" had missed

- **`scripts/typecheck-gate.ts:472-514`** hardcodes a leaf list containing `"framework/shared"`, used to
  pre-build composite declarations so reference-consumers measure against real `.d.ts` (`:279-292`, `:584`).
  Its `execSync` is wrapped in `catch {}` (`:516-521`), and the list already carries two entries that are
  **not packages** — `layers/core-api/realtime` and `layers/agent-execution/tool-provider`, both verified
  absent. **A stale entry degrades silently rather than going red**, so the builder verifies the *effect*
  (declarations emitted for each of the eighteen) and not the exit code.
- `scripts/governance-new-cells.ts:49,74` — `TARGETS_BY_KIND` hardcodes `framework/shared` for both kinds.
- `scripts/rules/no-laundered-re-exports.ts:17,32` — the `@lore` whose reasoning AU34 invalidates.
- `scripts/lib/crossings.ts:55` — the doc comment's example.

### 6.6 A pre-existing drift to name, not paper over

`governance/README.md:31` says **124** verdicts; `decided-rules.json` `totals.rows` is **118** and three
assertions say 118. That six-row drift predates AU34 (AU29 deleted six rows without updating the prose).
C2 corrects the README to the true count rather than silently carrying the error forward; it is not
AU34's defect and is not presented as one.

---

## 7. Evidence plan

Per CLAUDE.md and `.claude/rules/testing.md`: runtime behaviour → test; static property → lint rule or type
system; a script reading the filesystem is a build check, never a test.

| AC | kind | evidence |
|---|---|---|
| **AC-1** | static | `npm run check` — the gate discovers by scanning, so the eighteen appear with zero errors against an empty `typecheck-debt.json`; plus `registries-honest` direction 2 (§6.3), which fails if the retired surface entry survives |
| **AC-2** | lint rule + attack | §6.3's check; **`plan.md:62` scenario** is its positive attack case with a control twin — forced by property 4 |
| **AC-3** | lint rule + rows + attack | `reach-declared-surfaces-only` over the live tree; **the two `decided-rules.json` rows** (§6.2) as the permanent gate; **`plan.md:58` scenario** as an attack case with a control twin — owner in §8 |
| **AC-4** | lint rule | `deps:check` green; and the manifests: `domain-model` declares `zod` only, `hono` only in `http-middleware`, `remark-*`/`unified`/`github-slugger`/`@noble/hashes` only in `block-derivation` |
| **AC-5** | build check | Ruling 2's folds in A5; the §4.9 fixpoint re-run against the shipped tree reports zero. One-time — `plan.md:51` scopes it to the split |
| **AC-6** | mixed | below |

### `plan.md:58` needs the message extended, not just asserted

The scenario asks the build to name **"the audience it is not in"**. It does not today: `crossings.ts:69-77`
builds `groupKey — detail. why`, and `governance-model.ts:302` returns the surface's prose reason. The
message names the file and the target surface, never the `reach` list. **Decision: extend the finding to
append the declared audience** — a small change in the surface clause's `why`, owned by T14. Without it the
scenario is not met and should not be claimed.

### AC-6, concretely

`verify` covers check + lint + knip ×2 + **deps:check** + mock-inventory + web build + desktop build +
attestation. It runs **no tests**. So:

1. **`npm run test:all`** — the affected-slice default is meaningless here (every package changed).
2. **`npm run test:integration:harness`** — obligatory. This WP moves `harness-adapter.ts`,
   `worker-protocol.ts`, `return-actions.ts` and the event normalizer into a new package; that is harness
   plumbing under `.claude/rules/testing.md:71`, and per-merge verify runs only the `service` project.
3. **`npm run test:e2e`** — committed to, not hedged. For a change that rewrites imports in every `core-ui`
   file it is the cheapest broad UI net.
4. **All three applications booted, not one.** `plan.md:52` says the application behaves identically, proven
   by running it:
   - **`remote-server`** — boot and drive one real agent session from the browser: `core-ui` → `core-api` →
     `agent-orchestration` → `agent-execution` → harness → back through the event bus. That path crosses
     exactly the boundaries this WP redraws. Expected: the session starts, streams, completes, and appears
     in the UI with its outcome.
   - **`remote-worker`** — boot it and let it register. It is explicitly in `harness-protocol`'s audience
     (`requirements.md` §4.2) and hosts the worker wire protocol being moved; an earlier draft only built it.
     Expected: it connects to `/api/workers` and appears as a registered worker.
   - **`desktop`** — `npm run -w @hyperidle/desktop build` is in `verify`; boot it once and confirm the app
     window loads and reaches its local server.

### The bundle scenario (`plan.md:60`)

Satisfiable only under `requirements.md` §1.4's reading: the markdown toolchain stays because `core-ui`
production code genuinely calls `deriveBlocks`. Evidence is a `vite build --sourcemap` of `layers/core-ui`,
reading the sourcemap `sources`:

- **`hono` absent** — already true; now also true of every manifest but one.
- **the three `node:*` externalization warnings gone** — no `node:fs`/`node:path` from
  `system-prompt-templates.ts`, no `node:crypto` from `tool.ts`. New, and the cheapest proof the substrate
  stopped over-reaching.
- **`harness-event-normalization.ts` absent** from the module list — it ships today with zero interface
  consumers, purely as a barrel re-export.
- **`remark-*`, `unified`, `github-slugger`, `@noble/hashes` still present**, for the named reason. **The
  bundle does not get smaller and is not expected to.**

---

## 8. Leaves and write ownership

| leaf | owns (write) | may run |
|---|---|---|
| **L1 — governance model & rules** | `scripts/lib/governance-model.ts`, `scripts/lib/governance-attacks.ts`, `scripts/governance-context.ts`, `scripts/rules/registries-honest.ts`, `governance/README.md`, `governance/decided-rules.json`, `framework/db/src/__tests__/governance-model.test.ts` | ∥ L2 |
| **L2 — pre-split source hygiene** | `framework/shared/**` (src, `__tests__`, `__testing__`, fixtures); and the consumer files A4/A7/A8 touch: `layers/agent-execution/harness-registry/src/{index,adapter-pool,cli-harness-adapter,provision-return-hook}.ts` + its six `__tests__/adapter-pool*.ts` + `__tests__/{return-gate,return-status-tool}.test.ts`; `layers/core-api/credentials/src/credential-resolver.ts`; `layers/core-api/src/app.ts`; `applications/remote-server/src/create-server.ts`; `layers/core-api/src/services/__tests__/{AH2-resolve-agent-model.integration,model-gateway-package-dissolved}.test.ts`; `layers/core-api/src/routes/__tests__/X4-model-gateway.integration.test.ts`; `layers/core-ui/src/utils/scope-labels.ts` + `src/pages/KnowledgeDetail.tsx`; `framework/design-system/src/__tests__/AM5-compose-artifact-body.test.tsx` | ∥ L1 |
| **L3 — the split** | everything else | **after both, alone** |

L1 and L2 write disjoint file sets. **L3 is one sequential leaf and must not be split**: between B3 and B7
no sub-leaf can run `check`, so two builders would both be unable to verify. Saying so is the honest answer.

**Seam:** L3 consumes L1's clause and rows (its manifests and imports are legal only once Ruling 1 lands)
and L2's tree (it moves files L2 has folded and split).

---

## 9. Failure behaviour and security

**Changed failure behaviour.** One class, intended: an import legal today becomes a lint error because the
target's audience no longer includes the importer. That is AC-3 working, and §7 extends the message to name
the audience.

**Security, from the surfaces actually reached.** No behaviour changes, so no new abuse case; what changes is
*who may name* four security-relevant surfaces, and the abuse case is **accidental widening**:

- **a credential** — `crypto/credential-encryption.ts` + the `CredentialResolver` port move into
  `credential-access`, six named packages. Abuse: a nineteenth package quietly decrypting credentials.
  Closed by the audience; before this WP the same import was unconditionally legal.
- **an outbound request** — `net/ssrf.ts` into `host-process`, four named packages.
- **a path / subprocess** — `git/git-runner.ts` (spawns `git`) and `system-prompt-templates.ts` (reads disk)
  leave the universal barrel; today both are reachable from the browser's module graph.
- **untrusted input** — `http/validate.ts`, `body-limit.ts`, `rate-limit.ts`, `timing-safe.ts` into
  `http-middleware`, four named packages.

**Not touched:** no endpoint added, moved or reshaped; no table read or written differently (`plan.md:40`);
no agent-authored field; no authn/authz decision moves. Per ETHOS nothing here is preemptive — every
audience is the measured consumer set written down.

**The one genuine risk of the model change is the opposite of a wall.** Ruling 1 read broadly *grants*
eighteen packages reach to `db:schema-ns` and `db:unknown`. §6.2's two rows are what close it, permanently.

---

## 10. Documentation made false

- **58 files under `docs/`** (57 `framework/shared`, 2 `@hyperidle/shared`) — `DOC-CLASS: update`.
- **`governance/README.md`** — Ruling 1's clause and predicate; and the 124→118 drift (§6.6).
- **`.claude/rules/design-system.md:17`** — names `@hyperidle/shared` as the registry to check.
- **`eslint.config.ts:963-964`** — restricts `@hyperidle/shared/harness`, a specifier that **never
  resolved**; pre-existing dead configuration the rewrite surfaces.
- **`scripts/rules/no-laundered-re-exports.ts:17,32`** — its `@lore` reasons from `shared` being `everyone`.

---

## 11. Tasks

| id | task | leaf | depends on |
|---|---|---|---|
| T1 | Ruling 1's clause, scoped; `frameworkSurfacesOf` + twin; `governance/README.md` | L1 | — |
| T2 | The two `forbidden` rows; `makeActor`'s 25 packages; `totals.rows`→120 + the six hardcoded totals | L1 | T1 |
| T3 | Ruling 1's attack case + the two `db:*` control twins | L1 | T1 |
| T4 | `registries-honest` framework-surface check, both directions, subset floor, attack + twin | L1 | — |
| T5 | Delete `format/money.ts` + ten dead exports; ten test consequences incl. the two namespace imports | L2 | — |
| T6 | The nine folds | L2 | T5 |
| T7 | **Split the cross-destination tests** per §3.1's criterion | L2 | T6 |
| T8 | The four edge rewrites, pre-split spelling | L2 | — |
| T9 | Six republication removals + two repoints (§3.2) | L2 | — |
| T10 | Split `model-gateway.ts` / `credential.ts` in place | L2 | T8 |
| T11 | Build the codemod (incl. the widened abort guard and the inline-`type` count check); dry-run; reconcile its map against `requirements.md` §4.4/§4.7 | L3 | T1–T10 |
| T12 | **Atomic:** eighteen packages, delete `shared`, codemod, manifests + tsconfigs, registries, `typecheck-gate` leaf list, `verify` green, floor raise per A10 | L3 | T11 |
| T13 | `eslint.config.ts` + the four `scripts/` sites + remaining prose | L3 | T12 |
| T14 | **Extend the surface finding to name the declared audience**, and write `plan.md:58`'s attack case + control twin against the shipped eighteen | L3 | T12 |
| T15 | `decided-rules.json` AU34 surface rows + totals + README count | L3 | concept gate |
| T16 | 58 docs files | L3 | T12 |
| T17 | Evidence: `test:all`, `test:integration:harness`, `test:e2e`, all three applications booted, the bundle sourcemap read, the AC-5 fixpoint re-run | L3 | T12 |
