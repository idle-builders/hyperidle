# AU34 — Feasibility

Probes for the architecture phase. `requirements.md`'s measurements were verified independently four times
and are **not** re-derived; each probe answers a question only this phase asks. Method is stated so each is
reproducible.

**Verdict: deliverable in one PR.** No probe found a blocker. Eight risks are real; each has a named
mitigation. Three (R1, R2, R7) are cases where the obvious safety net does not exist and a different
mechanism had to be found — twice for the *same* reason, which is recorded as a pattern in R7.

---

## P1 — Does an existing gate already enforce AC-4's manifest property?

**Question.** Must the architecture invent a check for "each consumer declares the subset it actually uses",
or does one exist?

**Method.** Read `package.json` scripts; `scripts/dep-manifest-lint.ts`; `scripts/lib/dep-manifest-verdict.ts`.

**Result.** `npm run deps:check`, in `verify` between `knip:production` and `mock-inventory:check`. Contract
(`dep-manifest-verdict.ts:1-19`): *"Every workspace package must declare exactly what it imports: no more, no
less."* Divergences are emitted in both directions — `direction: "unused"` at `:143-177` for a
declared-but-not-credited dependency, with package, directory and name. Workspace-internal dependencies are
covered: `creditedDependencies` would not credit a copied `hono`. The only escape is `JUSTIFIED_UNUSED`, a
two-entry hand list with one real entry. `@lore` records why knip cannot do this job.

**Verdict.** No new mechanism. AC-4's named failure mode — copying `shared`'s block into eighteen manifests —
fails `verify` per package per unused dependency. `architecture.md` §5 makes `deps:check` the derivation
engine.

---

## P2 — Do any of the 640 names collide with packages outside the eighteen?

**Method.** Extracted the export sets of `shared`'s barrel + five subpaths (640) and of the three other
framework packages; intersected. `collide.mjs`, TypeScript compiler API.

**Result.** `@hyperidle/db` 148 exports, **3** collisions (`Message`, `ProposedCall`, `Thread` — Drizzle row
types, different symbols). `@hyperidle/api-contract` 70 exports, **1** (`AutonomyLevel`).
`@hyperidle/design-system` 202 exports, **3** (`AgentOperationalStatus`, a re-export *of* shared's;
`ArtifactPreview` and `Block`, React components).

**Verdict.** Six of the seven are different symbols sharing a name. They are outside the codemod's range, so
they cannot be emitted — but they are the concrete reason the rewrite must be **name-driven over a closed
map, never textual and never by hand**. `architecture.md` §4.2 carries this as binding.

---

## P3 — Can the eighteen be zero-error from their first commit?

**Method.** Read `scripts/typecheck-gate.ts`; `typecheck-debt.json`; `framework/shared/tsconfig.json` and a
service tsconfig.

**Result.** The gate **discovers by scanning** the four role roots for `tsconfig.json` — a package without one
is invisible to `check`, a silent pass rather than a failure. `typecheck-debt.json` is `{ "packages": {} }`:
zero debt repo-wide, no ratchet to lean on. Shape note: `framework/shared/tsconfig.json` extends the **root**
`tsconfig.json`; services extend `tsconfig.base.json` with `composite: true` and explicit `references`. The
eighteen follow the service shape.

**Verdict.** Feasible, with the invisibility trap named. `architecture.md` §7 AC-1 makes the eighteen
appearing in the gate's own package list part of the evidence.

---

## P4 — Does property 4 force Ruling 1's attack case?

**Question.** `architecture.md` sequences Ruling 1's clause before the split, on a tree with no
narrow-surface framework→framework import. An earlier draft claimed the attack harness's property 4 makes
the break-test mandatory. Is that true for a **clause** change?

**Method.** Read `governance-attacks.ts:804-831` (`coverageGaps`); enumerate the registered rule ids passed
to it from `governance-lint.ts:238-250` and `scripts/rules/*.ts`; check `decided-rules.json` for
`source: "framework"` rows against `db:*` targets.

**Result.** **The earlier claim is false.** `coverageGaps` keys entirely on **registered rule ids**, and the
registered set is the ten ids declared in `scripts/rules/` — `classification-total`, `crossings`,
`db-symbols-all-placed`, `floors-tight`, `misplacement-ledger`, `no-laundered-re-exports`,
`no-per-file-allowances`, `no-production-imports-development`, `no-stale-build-artifacts`, `pattern-live`,
`registries-honest`. `reach-declared-surfaces-only` is a **clause** id, not a registered rule id, and
`architecture.md` §6.1 keeps `CLAUSES` from growing. Verdicts surface through the `crossing-<kind>` rules,
which already carry positive cases — so the coverage check is already satisfied and forces nothing new.

Separately: `decided-rules.json` holds **no** `source: "framework"` row for any `db:*` target
(`db:schema-ns` has only `layer` and `tooling`; `db:unknown` has `layer` and `application`), so
`governance-model.test.ts` reproduces all 118 rows under **both** the broad and the scoped reading.

**Verdict.** Neither named gate constrains the predicate. The attack cases are hand-list entries a later edit
deletes on a green build. **The mechanism had to change** — see R1.

---

## P5 — How is `import type` actually spelled at the 771 sites?

**Question.** The codemod must preserve type-onlyness. `architecture.md`'s first draft covered only
statement-level `import type`. Is that the whole population, and does `tsc` catch a mistake?

**Method.** AST scan of every tracked `.ts`/`.tsx` outside `framework/shared`, counting import declarations
naming `@hyperidle/shared` or a subpath by clause shape; checked `tsconfig.base.json` and `tsconfig.json`
for `verbatimModuleSyntax` / `isolatedModules`.

**Result.**

| shape | count |
|---|---|
| statement-level `import type { … }` | **383** |
| value imports carrying **inline** `type` specifiers | **128** statements (**87** production) |
| inline `type` specifiers within those | **291** |
| namespace imports (`import * as`) | **2** |

`run-orchestration/src/provisioner.ts:6` alone carries 19 inline `type` specifiers. **Neither
`verbatimModuleSyntax` nor `isolatedModules` is set**, so dropping an inline `type` is **not** a `tsc` error.

**Verdict.** The inline form is a third of the population and the argument that `tsc` catches every codemod
mistake does not cover it. `architecture.md` §4.1 requires per-specifier `isTypeOnly` preservation and §4.3
adds a before/after inline-specifier count as the check `tsc` cannot provide. The two namespace imports are
why the abort guard is widened from "unmapped name" to "any specifier shape it cannot decompose".

---

## P6 — Is any name exported by two of the eighteen?

**Question.** The codemod's correctness argument is that a wrong destination is a name the target does not
export. That holds only if no name is exported by two destinations. An earlier draft attributed this to
`requirements.md` §1.2, which does not state it, and P2 measured against the *other three* framework
packages, not the eighteen against each other.

**Method.** Took the module-level export set of every module under the §4 destination map, applied the three
symbol relocations, grouped by destination, and intersected every pair.

**Result.** **656 names across the eighteen, zero cross-package collisions.** (656 > 640 because the
module-level set includes names the barrel never published.) Also: of the 640 published names, **zero**
resolve to more than one declaring file.

**Verdict.** The claim the whole codemod argument rests on is true and is now measured in the right place.
`architecture.md` §4.3 cites this probe rather than `requirements.md`.

---

## P7 — Does property 4 force an attack case for a new *check* on an existing rule?

**Question.** `architecture.md`'s previous draft added the framework-surface check to `registries-honest` and
claimed property 4 forced its positive case and control twin. Same shape as the claim P4 already demolished
one level up — is it true one level down?

**Method.** Read `coverageGaps` (`governance-attacks.ts:804-831`); enumerate the cases naming
`registries-honest`.

**Result.** **False, for the same reason.** `coverageGaps` demands, per **registered rule id**, (a) ≥1 case
naming it and (b) ≥1 case whose `expect.sort !== "clean"`. `registries-honest` already satisfies both via
`unowned-new-table` (`governance-attacks.ts:701-715`, `expect: { sort: "finding", … }`). Adding a *check* to
an existing rule therefore forces nothing at all. Separately, **control twins are not mechanically enforced
anywhere**: property 2 is prose at `governance-attacks.ts:20-21` and nothing in `coverageGaps` reads it.

**Verdict.** The check must ship as a **new registered rule** (`framework-surfaces-declared`) for property 4
to bite on its positive case — `architecture.md` §6.3. The control twin remains convention-backed, and that is
stated rather than claimed. See R7.

---

## P8 — Does the audience lint constrain where a test file lives?

**Question.** `architecture.md`'s test-split criterion said a cross-package test import is rejected by
`reach-declared-surfaces-only`. Is it?

**Method.** Read `relaxForDevelopment` (`governance-model.ts:350-398`); check `oneDoorSurfaces` membership
for the eighteen; probe a `framework` source against `db:testing`.

**Result.** **No.** A test file is a development file, and `relaxForDevelopment` allows every crossing whose
production verdict is `forbidden` **except** the three `oneDoorSurfaces` (`db:schema-ns`, `db:unknown`,
`framework/design-system`) and the raw-runtime door. None of the eighteen is a one-door surface. Probed
directly: `framework → db:testing [import]` is `forbidden` in production and `allowed` in development.

**Verdict.** The audience lint does **not** gate test placement. What does is `deps:check`: a cross-package
test import obliges the owning package to declare a dependency it has no production reason for.
`architecture.md` §3.6 criterion 2 is corrected to say so, and the earlier claim is withdrawn.

The same probe shows a third `decided-rules.json` row is expressible and reproduces today, so
`architecture.md` §6.2 adds `framework → db:testing [import]` alongside the other two — `founder-rulings.md`
names three `reach: []` surfaces and §7.5 already argues a further twin costs nothing.

---

## P9 — Where do the 86 development files go, and how many span destinations?

**Question.** `architecture.md`'s first draft named three spanning files and moved "the post-A6 development
files" in B1. Is three the number, and does A6 in fact assign every file a destination?

**Method.** AST scan of all 86 development files under `framework/shared/src`, resolving each relative
specifier against the §4 destination map and resolving the six dissolving barrels **by symbol** through the
same map pass 1 uses.

**Result.**

| | count |
|---|---|
| development files reaching **two or more** destinations | **17** — 16 tests + `harness/__testing__/mock-harness-adapter.ts` |
| relative import statements in development files | **115** |
| …resolving to a dissolving barrel | **27**, in 27 files |

Both files the draft named are wrong: `__tests__/types.test.ts` and `__tests__/AE6-kind-registry.test.ts`
each reach **one** destination. Unnamed and real: `AL7-proposed-call-types.test.ts` and
`AM3-session-adapter.test.ts` (three destinations each), five `__tests__/blocks/*.test.ts`,
`event-bus.test.ts`, `resolve-model.test.ts`, `agent-work-intent-recorder.test.ts`, and five more.

**Verdict.** Three consequences, all now carried. The 47 in `requirements.md` §4.8 is the **production**
half of pass 2's population; the 115 development statements are the other half. The 27 barrel statements have
no destination in the map and would have fired the abort guard on every one — they are resolved by symbol
instead. And a *split* rule shreds coherent tests (`derive-blocks.test.ts` would lose its `BlockPayload`
import), so `architecture.md` §3.6 replaces it with a **placement** rule whose subject function is computed:
the destination supplying the most value bindings, ties broken by first import.

---

## P10 — Does anything decide or check the dependency block?

**Question.** §5 derives each manifest's dependency *set* from the codemod and `deps:check`. Neither carries
a world. Does the block matter, and does anything catch a wrong one?

**Method.** Read `scripts/lib/crossings.ts:187-200` and `scripts/lib/dep-manifest-verdict.ts:35-37`;
cross-reference `requirements.md` §4.7's dev-only column.

**Result.** **The block decides the world**: on a shipping package, `dependencies` is a production manifest
crossing and `devDependencies` a development one. **`deps:check` is block-agnostic** — it compares declared
against imported and nothing else — so it neither guides nor catches the choice. And §4.7 records **eight**
destinations reached only from development files on shipping packages, every consumer deliberately absent
from the target's `reach` because §4.7 refuses dev-only evidence, and every one declaring
`@hyperidle/shared` in `dependencies` today.

**Verdict.** A block-preserving rewrite emits eight production manifest crossings that
`reach-declared-surfaces-only` forbids — red lint after B3, on a decision no artifact had made.
`architecture.md` §5.1 states the rule (a destination reached only from development files is declared in
`devDependencies`), shows it is mechanical (the codemod already classifies every consumer file by
`CLAUDE.md`'s rule — that classification produced §4.7's two columns), and makes it checkable: the resulting
dev-only edges must be exactly those eight plus the eighteen packages' own, and a ninth is a finding.

---

## Risks

### R1 — Ruling 1's scoped predicate has no automatic gate, and the one named does not exist. **Highest.**

Ruling 1 read literally admits any surface *of* a framework package, including `db:schema-ns`, `db:unknown`
and `db:testing` — all `reach: []`, the first two `oneDoorSurfaces`. The broad reading grants eighteen
packages production reach to the schema namespace and the undecided-surface catch-all, against `plan.md:40`.

P4 shows **both** named gates fail: property 4 keys on registered rule ids and the clause is not one; and
`decided-rules.json` reproduces identically under either reading.

**Mitigation — replace the hand-list with a real gate.** Add **three** rows to `decided-rules.json`:
`framework → db:schema-ns`, `db:unknown` and `db:testing` (`[import]`). The first two are `forbidden` in
both worlds; **`db:testing` is forbidden in production and allowed in development**, because it is not a
`oneDoorSurface` — P8 measured exactly that, and `architecture.md` §6.2 now carries the split verdicts.
The frozen reproduction loop at `governance-model.test.ts:200-232` then fails loudly if anyone widens the
clause, permanently and without anyone remembering to. The attack twins stay as belt. `architecture.md`
§6.2 and T2 carry it, sequenced in Phase A because they gate T1.

### R2 — `floors-tight` goes red inside the irreversible window, and a floor raise is a judgement.

`floors-tight.ts` errors when slack exceeds `allowedSlack` (`:65`) = `max(ceil(live × 0.2), 5)`. Measured with
`npm run governance:floors`:

| floor | live | declared | slack | allowed | headroom |
|---|---|---|---|---|---|
| `detector:manifest` | 131 | 111 | 20 | 27 | **7** |
| `detector:import` | 3776 | 3307 | 469 | 756 | 287 |
| `census:tracked-files` | 3360 | 2976 | 384 | 672 | 288 |

A `manifest` crossing is emitted per declared workspace dependency (`crossings.ts:179-217`). The 30
`@hyperidle/shared` declarations become each consumer's subset — ~107 from `requirements.md` §4.7's
production lists alone, before dev-only declarers and the eighteen packages' own sibling declarations. Live
lands ~210–250 against a floor of 111: slack ~100–140 where ~42–50 is allowed. `detector:import` follows,
since the codemod emits one statement per destination against 726 today. Neither artifact previously
mentioned `governance:floors` or a floor rewrite.

**Mitigation.** The *decision* and its justification move to Phase A (`architecture.md` §3.3) — the population
grew, no violation was absorbed: floors are magnitude trackers and violations are reported separately by the
`crossing-<kind>` rules, so a raise cannot hide one. The *act* is **B7**, mechanical.

**Two corrections to an earlier draft.** The value written is `suggestedFloor` — the **middle** of the band,
which is what `governance:floors` prints — not the live count: `floors-tight.ts:66-72` states that a floor at
the edge is one removed crossing from red, "which is how the whole floor set came to sit on the edge at
once". And the raise must precede the green gate, because `verify` → `lint` → `floors-tight`; the earlier
ordering (green, then raise) was unachievable.

Only the floors the argument covers are raised — checkable from the tool's own verdict column; any other
floor going red is a finding, not a bump.

### R3 — The `governance-model.test.ts` fixtures gate everything downstream.

`makeActor` (`:79-101`) knows three package names and its `default` branch returns
`{ role: <package-name> as Role }`, not a valid role. The eighteen reach lists name **25 distinct packages**.
The row count is hardcoded **four** times — `:170`, `:171`, `:214`, `:229` — plus the test title at `:169`
and the doc comment at `:4`/`:7` ("236 answers (118 rows × 2 worlds)"). `:170` was named in no earlier
artifact. Four further totals sit at `:176-189` (`65`, `53`, `112`, `6`) with
`totals.production`/`totals.development` in the JSON. **`makeTarget:150-151` is stale too** — it returns
`name: "shared"` for a bare `framework` target and three live rows use it; earlier drafts named only
`makeActor`.

**Consequence.** If T2 is incomplete the model test fails and nothing after it verifies — this file gates L3
entirely. **Mitigation:** T2 sits immediately after T1 in L1 and owns the 118→121 move R1's three rows force.
**B6 owns a further −12**: the twelve `framework/shared` rows must retire with the surface, or
`governance-model.ts:294-299` returns `forbidden` for all twelve and both loops go red — and since `verify`
runs no tests, B could otherwise be declared green with the frozen gate red. `architecture.md` B8 therefore
defines green as `verify` **plus** the model test. T15 moves the counts a third time for the AU34 surface
rows.

Related, named rather than papered over: `governance/README.md` says **124** at **six** sites (`:31`, `:39`,
`:42`, `:44`, `:46`, and "248 verdicts (124 rows × 2 worlds)") while `totals.rows` is **118** — a six-row
drift predating AU34 (AU29 deleted six rows without touching the prose). T15 corrects all six.

### R4 — The atomic step has no coherent intermediate state, by construction.

`plan.md:34` forbids a shim, so between deleting `framework/shared` and finishing the rewrite the tree does
not typecheck.

**Mitigation.** Make it one commit and put every decision outside it. `architecture.md` §3 now carries **ten** Phase-A steps
(A1–A10), two of which produce a written decision rather than code — the layout convention (A10) and the
floor justification. B contains only moves, generated rewrites, and a printed value. Local `npm run check` is the feedback
loop; nothing is pushed until green.

### R5 — The harness lane will not run itself.

This WP moves `harness-adapter.ts`, `worker-protocol.ts`, `return-actions.ts` and the event normalizer into
a new package: harness plumbing under `.claude/rules/testing.md:71`. Per-merge verify runs only the
`service` integration project, so `npm run test:integration:harness` must be run by hand and be green before
shipping. Easy to miss on a diff that looks like pure movement. **Mitigation:** T17.

### R6 — A stale `typecheck-gate` leaf list degrades silently.

`scripts/typecheck-gate.ts:472-514` hardcodes a leaf list containing `"framework/shared"`, used to pre-build
composite declarations (`:279-292`, `:584`) so reference-consumers measure against real `.d.ts`. The
`execSync` is wrapped in `catch {}` (`:516-521`), and the list **already carries two entries that are not
packages** — `layers/core-api/realtime` and `layers/agent-execution/tool-provider`, both verified absent from
the tree. So a stale entry produces no error at all.

**Consequence.** If the list is not updated, `npm run check` — the gate B7 drives to green — measures the
eighteen against absent declarations and may report noise or a false clean, without saying so.
**Mitigation:** `architecture.md` §6.5 puts the file in scope and in T12, requires the builder to verify the
**effect** (declarations emitted for each of the eighteen) rather than the exit code, and notes that the list
is **topologically sorted, not appended** — `:292-298` builds leaves in dependency order, and the eighteen
carry nine sibling edges plus `credential-access → domain-model`, with `db` and `design-system` depending on
several.

### R7 — "property 4 forces the break-test" was claimed twice and was false both times. **Pattern, not incident.**

P4 found it for a **clause** change (clause ids are not registered rule ids). P7 found the same claim one
level down for a **check added to an existing rule** (`registries-honest` already satisfies `coverageGaps`
via `unowned-new-table`). The shape recurs because the harness's four properties read as stronger than they
are: only property 4 is mechanical, it keys solely on registered rule ids, and **property 2 — the control
twin — is prose that nothing evaluates**.

**Mitigation, applied twice.** For the clause: the three `decided-rules.json` rows (R1), which the frozen
loop enforces. For AC-2's check: ship it as a **new registered rule**, `framework-surfaces-declared`, so
property 4 bites on its positive case (`architecture.md` §6.3).

**Residual, stated rather than claimed:** control twins remain convention-backed everywhere. No mechanism in
this repo enforces them, and inventing one is not in AU34's scope.

### R8 — two rewrite classes sit outside the codemod's original node shape.

The first draft scoped the codemod to `import`/`export … from` naming `@hyperidle/shared`. Two populations
fall outside it and each would have landed as hand work inside the window:

- **Relative imports inside the package.** 239 statements in the production modules, 47 of them crossing a
  destination (`requirements.md` §4.8) — **plus 115 more in development files**, 27 of which resolve to a
  dissolving barrel (P9). A relative specifier is never `@hyperidle/shared`-shaped, so both the codemod and
  the residual-grep check were structurally blind to all of them.
- **45 `import("@hyperidle/shared")` sites** — 29 `ImportTypeNode` type positions and 16 runtime
  `CallExpression`s — which are neither import nor export declarations.

**Mitigation.** `architecture.md` §4.1 makes the codemod **two passes over four node shapes**, and §3.2 fixes
the in-package layout so pass 2's population collapses from 239 to 47 (preserving `src`-relative paths leaves
every same-package relative import byte-identical). §4.3 now names **`npm run check` (TS2307)** as pass 2's
real and total gate, rather than the outside-the-package-root assertion an earlier draft offered — that
predicate does not fire on pass 2's own failure mode, since a missed rewrite leaves a specifier resolving
*inside* its own root to a file that is gone. The assertion is kept as a cheap secondary for a different
mistake. The sites that take the barrel as an *object* are resolved in Phase A
(`architecture.md` §3.5): three `EventBus()` constructions are mechanical, one namespace assertion is
deleted, and the **identifier-bound** site at `model-gateway-package-dissolved.test.ts:24-27` — which the
codemod's property-access rule does not reach and the guard rejects — takes the whole file with it, its
premise having been falsified by this work package.

---

## The one-PR question

**Deliverable in one PR, and it is the only available shape.** `plan.md:34`'s no-shim rule means there is no
intermediate state to ship, so this is not a preference.

What makes it tractable:

- **Every decision is now outside the irreversible window.** Ten Phase-A steps (A1–A10), two of which — the
  layout convention (A10) and the floor justification — produce a written decision rather than code, and both
  of which B consumes as inputs.
- **Every rewrite class is mechanized.** Two codemod passes over four node shapes cover the external sites,
  the intra-package relative imports and the dynamic-import forms (R8).
- **The bulk of B is machine-generated**, and its correctness is checked by two independent derivations that
  would have to fail identically to be silent (`architecture.md` §4.3) — plus the inline-`type` count check
  P5 showed `tsc` cannot provide.
- **The two hardest judgements are already made** — Ruling 1's predicate in `founder-rulings.md`, the folds
  in `requirements.md` §4.9.

**No evidence was found that the constraint is undeliverable.** The honest caveat remains scale, not
feasibility: the PR touches every package and its diff is dominated by mechanical rewrites. Mitigation is
commit structure — Phase A as several small reviewable commits, Phase B as one large mechanical commit whose
reviewability rests on the codemod being deterministic against a published map, Phase C as documentation.

---

## Nothing marked UNVERIFIED

All six probes read repository state, which is the live surface for this change. There is no deployed or
remote state this WP depends on.
