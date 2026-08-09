# AU34 — Feasibility

Probes for the architecture phase. `requirements.md`'s measurements were verified independently four times
and are **not** re-derived; each probe answers a question only this phase asks. Method is stated so each is
reproducible.

**Verdict: deliverable in one PR.** No probe found a blocker. Six risks are real; each has a named
mitigation, and two of them (R1, R2) are cases where the obvious safety net does not exist and a different
mechanism had to be found.

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

## Risks

### R1 — Ruling 1's scoped predicate has no automatic gate, and the one named does not exist. **Highest.**

Ruling 1 read literally admits any surface *of* a framework package, including `db:schema-ns`, `db:unknown`
and `db:testing` — all `reach: []`, the first two `oneDoorSurfaces`. The broad reading grants eighteen
packages production reach to the schema namespace and the undecided-surface catch-all, against `plan.md:40`.

P4 shows **both** named gates fail: property 4 keys on registered rule ids and the clause is not one; and
`decided-rules.json` reproduces identically under either reading.

**Mitigation — replace the hand-list with a real gate.** Add two rows to `decided-rules.json`:
`framework → db:schema-ns [import]` and `framework → db:unknown [import]`, both `forbidden` in both worlds.
The frozen reproduction loop at `governance-model.test.ts:200-232` then fails loudly if anyone widens the
clause, permanently and without anyone remembering to. The attack twins stay as belt. `architecture.md`
§6.2 and T2 carry it, sequenced in Phase A because they gate T1.

### R2 — `floors-tight` goes red inside the irreversible window, and a floor raise is a judgement.

`floors-tight.ts:57` errors when slack exceeds `max(ceil(live × 0.2), 5)`. Measured with
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

**Mitigation.** The *decision* moves to Phase A (A10) with its justification stated — the population grew, no
violation was absorbed: one package with 30 declarers becomes eighteen with the same consumers declaring a
subset each. The *act* is B8, mechanical, using the value `governance:floors` prints, with before/after
recorded. Only the floors that argument covers are raised; any other floor going red is a finding. This
respects `floors-tight`'s own lore that reflexive bumping is the rot floors exist to prevent.

### R3 — The `governance-model.test.ts` fixtures gate everything downstream.

`makeActor` (`:79-101`) knows three package names and its `default` branch returns
`{ role: <package-name> as Role }`, not a valid role. The eighteen reach lists name **25 distinct packages**.
The row count is hardcoded at `:171` and twice at `:214`/`:229`, and four further totals at `:176-189`
(`65`, `53`, `112`, `6`) plus `totals.production`/`totals.development` in the JSON.

**Consequence.** If T2 is incomplete the model test fails and nothing after it verifies — this file gates L3
entirely. **Mitigation:** T2 sits immediately after T1 in L1, and it owns the 118→120 move that R1's two rows
force. T15 moves the counts again for the AU34 surface rows; the two edits are sequenced, not competing.

Related, and named rather than papered over: `governance/README.md:31` says **124** verdicts while
`totals.rows` is **118** — a six-row drift predating AU34 (AU29 deleted six rows without touching the prose).
T15 corrects the README to the true count.

### R4 — The atomic step has no coherent intermediate state, by construction.

`plan.md:34` forbids a shim, so between deleting `framework/shared` and finishing the rewrite the tree does
not typecheck.

**Mitigation.** Make it one commit and put every decision outside it. `architecture.md` §3 now has **ten**
Phase-A steps — the test split (A6) and the floor decision (A10) moved out of the window in this revision —
so B contains only moves, generated rewrites, and a printed value. Local `npm run check` is the feedback
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
**Mitigation:** `architecture.md` §6.5 puts the file in scope and in T12, and requires the builder to verify
the **effect** (declarations emitted for each of the eighteen) rather than the exit code.

---

## The one-PR question

**Deliverable in one PR, and it is the only available shape.** `plan.md:34`'s no-shim rule means there is no
intermediate state to ship, so this is not a preference.

What makes it tractable:

- **Every decision is now outside the irreversible window.** Ten Phase-A steps; B is moves, generated
  rewrites, and one printed value.
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
