# AU34 — Architecture

**Authority.** `plan.md` > `founder-rulings.md` (Ruling 1 and its scoped predicate, Ruling 2) >
`requirements.md`. This document adds no outcome and no scope. It decides **order, mechanism, ownership and
evidence**.

`requirements.md`'s measurements were verified independently four times and are **not** re-derived here.
Measurements for this phase are in `feasibility.md` (P1–P8).

> **R-A. The atomic window contains no judgement.** Every decision lands in Phase A, where a wrong one is a
> revert. Phase B contains moves, generated rewrites, and values printed by an existing tool.
>
> **R-B. A guarantee is enforced by something that fails a build, not by a hand-list entry.** Where the only
> available enforcement is convention, say so plainly rather than claiming a gate.

**Naming caution for every task below.** Attack-case ids, rule ids, file names and lint messages are
behavioural (`unowned-new-table`, `alias-import-control`). **The work-package identifier must not appear in
any of them** — only in `@lore` comments and under `.pipeline/**`.

**Tier: production.**

---

## 1. AC → obligation map

| AC (`plan.md:47-52`) | what discharges it | where |
|---|---|---|
| `framework/shared` no longer exists; what it held lives in packages named for what they contain | Phase B; 18 packages per `requirements.md` §4 | §3, §4 |
| every package has a decided audience; the build fails on one without | a **new registered rule**, `framework-surfaces-declared` | §6.3 |
| only justified `everyone`; the rest enforced by the lint | `reach-declared-surfaces-only`; Ruling 1 scoped, **gated by three `decided-rules.json` rows** | §6.1, §6.2 |
| no closure carries an unused toolchain | `deps:check` | §5 |
| no module survives that nothing outside its own package reaches | Ruling 2's nine folds | §3 A5, §7 |
| `verify` green **and** the application behaves identically, proven by running it | §7 | §7 |

---

## 2. What is reused

- **`scripts/dep-manifest-lint.ts` (`deps:check`)** — two-directional import-vs-manifest gate; the AC-4
  mechanism and the manifest-derivation engine (§5).
- **`scripts/typecheck-gate.ts`** — discovers packages by scanning; `typecheck-debt.json` is `{}`, so the
  eighteen are clean from first commit.
- **`framework/db/src/__tests__/governance-model.test.ts`** — the frozen row-reproduction loop (`:205-214`,
  `:220-229`). §6.2 makes it the gate for Ruling 1's predicate.
- **`npm run governance:floors`** — prints live/declared/slack/allowed and the value to write (§3.3).

**Change boundary:** placement only (`plan.md:36`).

---

## 3. Order of operations

### Phase A — every decision, each step green on its own

`verify:quick` runs **no tests**, so each row names the real command.

| # | step | verified by |
|---|---|---|
| A1 | **Ruling 1's clause**, scoped (§6.1); `frameworkSurfacesOf` fix (`scripts/governance-context.ts:187-195`) + twin (`governance-attacks.ts:928`); `governance/README.md` | `npm run lint` — but see §3.4: A1's effect on the live tree is nil, so its real verification is A3 |
| A2 | **The predicate's gate**: three `forbidden` rows (§6.2); `governance-model.test.ts` fixture work — `makeActor`'s 25 packages, **`makeTarget`'s bare-`framework` case**, and the row bookkeeping (§6.6) | `npx vitest run framework/db/src/__tests__/governance-model.test.ts` |
| A3 | **Attack cases**: Ruling 1's positive case; the three `db:*` control twins; **the `frameworkSurfacesOf` case** — an undeclared-but-imported framework package expecting "is not a declared surface", not the composition-root message | `npm run lint` |
| A4 | **Delete `format/money.ts`** + ten dead exports; **and every construct with no successor**: the two namespace imports (`harness-registry/src/__tests__/{return-gate,return-status-tool}.test.ts:14,23`) and the barrel-namespace assertion at `core-api/src/__tests__/AL7-no-kernel-executor.test.ts:73-76` (§3.5); the ten test consequences | `npm run check`, `npm run test:full` |
| A5 | **The nine folds** (Ruling 2) | `npm run check`, `npm run test:full` |
| A6 | **Split the cross-destination tests** (§3.6) | `npm run test:full` |
| A7 | **The four edge rewrites**, pre-split spelling — D1's two acts, plus `console-adapter.ts:1` and the two `http/*` self-imports as **relative** imports | `npm run check` |
| A8 | **Six republication removals + two repoints** (§3.7) | `npm run check`, `npm run lint` |
| A9 | **Split `model-gateway.ts` and `credential.ts`** in place, relative imports between halves | `npm run check` |
| A10 | **Fix the in-package layout convention** (§3.2) — a written decision, no code | it is B1's input; see §3.2 |

Order: A1 → A2 → A3. A4 → A5 → A6. A7 → A9. A8 and A10 independent.

**Two Phase-A decisions have no code and therefore no per-step command**: A10 (§3.2) and the floor
justification (§3.3). Both are recorded here, executed mechanically in B, and verified at B8's green gate. Calling them
"steps" would overstate; they are inputs.

### 3.2 A10 — the in-package file layout, decided

`framework/domain-model` receives `types.ts`, `blocks/types.ts`, `types/money.ts`, `types/artifact.ts` and
`observability/types.ts` is elsewhere — **flattening collides three ways**. And any layout change alters the
depth of every surviving relative import — the population the codemod's second pass owns (§4.1).

> **Decision: every module keeps its path relative to `src/`.** `harness/harness-adapter.ts` becomes
> `framework/harness-protocol/src/harness/harness-adapter.ts`; `blocks/derive-blocks.ts` becomes
> `framework/block-derivation/src/blocks/derive-blocks.ts`; `types.ts` and `types/money.ts` land side by side
> in `domain-model/src/` exactly as they sit today.

**Why, and it is the reason this is not a style preference:** preserving the `src/`-relative path makes every
*same-package* relative import **byte-identical after the move**. The ~192 intra-package imports that do not
cross a destination need no edit, and pass 2's rewrite population collapses to exactly the 47 that do.
Flattening would require re-deriving all 239.

The cost is accepted deliberately: `block-derivation/src/blocks/…` and `harness-protocol/src/harness/…`
carry a redundant directory. Nothing in `.claude/rules/typescript.md` forbids it (the file-name rule is about
exports, and no sub-barrel survives), and the alternative trades a cosmetic redundancy for 192 avoidable
edits inside the irreversible window.

### 3.3 The floor raise, decided here and executed mechanically

`floors-tight.ts:57` errors when slack exceeds `max(ceil(live × 0.2), 5)`. Measured with
`npm run governance:floors`:

| floor | live | declared | slack | allowed | headroom |
|---|---|---|---|---|---|
| `detector:manifest` | 131 | 111 | 20 | 27 | **7** |
| `detector:import` | 3776 | 3307 | 469 | 756 | 287 |

A `manifest` crossing is emitted per declared workspace dependency; 30 `@hyperidle/shared` declarations
become each consumer's subset — ~107 from `requirements.md` §4.7's production lists alone. `detector:manifest`
lands ~210–250 against a floor of 111.

**Justification (the thing that has to be honest):** the population grew and no violation was absorbed. Floors
are magnitude trackers; violations are reported separately by the `crossing-<kind>` rules, so raising a floor
cannot hide one. One package with 30 declarers becomes eighteen with the same consumers declaring a subset
each. **Only the floors that argument covers are raised** — checkable from `governance:floors`' own verdict
column; any other floor going red is a finding, not a bump.

**The value written is `suggestedFloor` — the middle of the band, which is what the tool prints.** Not the
live count: `floors-tight.ts:66-72` says in terms that a floor at the edge is one removed crossing from red,
"which is how the whole floor set came to sit on the edge at once". An earlier draft said "raise to the live
counts"; that was wrong and is withdrawn.

### 3.4 What A1 can and cannot verify

Ruling 1's clause has **nil effect on the live tree** (`framework/db → framework/shared` is already allowed
because `shared` is `everyone`), and the `frameworkSurfacesOf` fix is a no-op today because all four framework
packages have surface entries. So `npm run lint` is green with or without A1, and **A1's verification is A3's
attack cases, not the lint run**. Stated rather than implied.

### 3.5 The barrel-namespace constructs that have no successor

Three sites take the barrel as an object rather than named imports. Two are mechanical, one is a decision,
and the decision is made here so it does not recur inside the window:

| site | disposition |
|---|---|
| `explicit-session-start.production.integration.test.ts:195,234` — `new (await import("@hyperidle/shared")).EventBus()` | **mechanical** — `@hyperidle/event-bus`; the codemod handles it (§4.1) |
| `AL7-no-kernel-executor.test.ts:73-76` — `expect("StagedOperationSpec" in shared).toBe(false)` | **delete, in A4.** It asserts a symbol's absence from a package that will not exist. The nearest successor ("absent from `@hyperidle/domain-model`") is a different and weaker claim about a symbol retired long ago |
| `harness-registry/src/__tests__/{return-gate,return-status-tool}.test.ts:14,23` — `import * as sharedAll` | **rewrite to named imports, in A4** — the names they actually use resolve normally |

A4 therefore owns *every* construct with no successor, repo-wide — not only the dead exports.

### 3.6 A6 — the test split, criterion corrected

Three files span destinations (verified live): `o1-event-split.test.ts:17-18` (`../events.js` **and**
`import * as sharedIndex from "../index.js"`), `AE6-kind-registry.test.ts:7-15` (eight `kinds/*` A5 folds),
`types.test.ts`.

1. Imports resolving to **one** destination → move whole.
2. Spanning **two or more** → split along the destination boundary, one file per destination.
   **What backs this is `deps:check`, not the audience lint.** A test is a development file, and
   `relaxForDevelopment` (`governance-model.ts:350-398`) allows every crossing except the three
   `oneDoorSurfaces` — none of the eighteen is one. So a cross-package test import is *not* an audience
   violation; it is a manifest obligation, and `deps:check` will demand the declaring package take a
   dependency it has no production reason for. An earlier draft claimed the audience lint rejects it. It does
   not, and the claim is withdrawn.
3. An assertion **on the barrel object** has no successor. The one instance is
   `o1-event-split.test.ts:74` — `expect(sharedIndex).toBeDefined()`, vacuous, and
   `.claude/rules/testing.md:58` forbids that shape anyway. **Delete it**; no pre-split package name is
   needed, which also removes the naming problem an earlier draft introduced here.
4. A folded module's test asserts through the module it was folded into.

The split happens inside `framework/shared/src/__tests__/` so B1 moves whole files.

### 3.7 A8 — the repoints

`credential-resolver.ts:31` is a **pure re-export**; `@hyperidle/credentials` declares nothing. So
`layers/core-api/src/app.ts:2` and `applications/remote-server/src/create-server.ts:67` repoint at the
**declaring** package — `@hyperidle/shared` in A, `@hyperidle/credential-access` when the codemod runs — with
the two follower tests.

### Phase B — mechanism only

1. `git mv` the 79 surviving modules, the post-A6 development files and the 15 fixtures into eighteen
   `framework/<name>/src/` trees, **preserving `src/`-relative paths** (§3.2).
2. Write eighteen × `package.json`, `tsconfig.json` (service shape), `src/index.ts`, `vitest.config.ts`.
3. **Delete `framework/shared`.** ← **point of no return**
4. Run the codemod: pass 1 over the 771 external sites, pass 2 over the moved trees (§4.1).
5. Manifests: **30 rewritten + 1 deleted + 18 new**. Tsconfigs: **28 package files + root = 29**, plus
   `tsconfig.base.json` `paths`.
6. Registries and configs: `governance/architecture.json` (18 surfaces in, `framework/shared` out,
   `eventBus.typesModule` repointed); **`decided-rules.json` — retire the twelve `framework/shared` rows**
   (§6.2); `knip.json`; `vitest.config.ts` projects; root `workspaces`;
   **`framework/design-system/vitest.config.ts:14`** (`server.deps.inline`); `scripts/typecheck-gate.ts` leaf
   list **in dependency order** (§6.5); `package-lock.json` **and `bun.lock`** regeneration.
7. **Raise the two floors** to the printed `suggestedFloor`, recording before/after (§3.3).
8. **Green** = `npm run verify` **and** `npx vitest run framework/db/src/__tests__/governance-model.test.ts`.
   The second is not optional: `verify` runs no tests, so B could otherwise be declared green with the
   frozen row gate red (§6.2).

The floor raise precedes the green gate because `verify` → `lint` → `floors-tight`, and both floors are red
until it lands. An earlier draft ordered these the other way; that sequence is unachievable.

**Point of no return: B3.** From B3 until B8 the tree does not typecheck — `plan.md:34` forbids a shim.
**Every other step preserves coherence, and B now contains no decision.**

### Phase C

| # | step | when |
|---|---|---|
| C1 | `eslint.config.ts` ×16, `governance-attacks.ts:429` prose, `.claude/rules/design-system.md:17`, `docker-compose.yml:46`, the four `scripts/` sites (§6.5) | **required for B8 to be green** |
| C2 | `decided-rules.json` **AU34 surface rows** + totals + `governance/README.md`'s six `124` sites (§6.6) | **after the concept gate** |
| C3 | 58 docs files | after green |

Only C3 is genuinely trailing.

---

## 4. The rewrite

### 4.1 Mechanism — two passes, four node shapes

A **name-driven codemod** over the TypeScript AST (compiler API + `tsx`), driven by the symbol→package map in
`requirements.md` §4.4/§4.7. Not committed — under `scripts/` it would be a knip entry dead on arrival.

**Pass 1 — the 771 external sites.** Four node shapes, not one; an earlier draft named only the first two and
was therefore blind to the third and fourth:

| shape | population | handling |
|---|---|---|
| `ImportDeclaration` naming `@hyperidle/shared` or a subpath | 718 | resolve each name, group by destination, one statement per destination |
| `ExportDeclaration … from` | 8 statements / 13 bindings | same |
| `ImportTypeNode` — `import("@hyperidle/shared").X` in a type slot | 29 | rewrite the specifier to `X`'s destination |
| `CallExpression` with `ImportKeyword` — `await import("@hyperidle/shared")` | 16, all in development files | rewrite to the destination of the property accessed on the result; §3.5 removes the one site where no single destination exists |

**Pass 2 — inside the moved trees.** Every cross-destination edge inside `framework/shared` is a **relative**
specifier, so pass 1 never sees one. 239 cross-file relative import statements exist under
`framework/shared/src`; `requirements.md` §4.8 puts **47** across a destination boundary. Pass 2 re-resolves
each relative specifier against the destination map:

- **same destination** → unchanged. Because §3.2 preserves `src/`-relative paths, this is byte-identical for
  all ~192 of them; the pass asserts that rather than rewriting.
- **different destination** → replaced with `@hyperidle/<dest>` (e.g. `event-bus.ts:8` `./logger.js` →
  `@hyperidle/diagnostics`; `tool.ts:27,28`; `harness-port.ts:45,46`;
  `harness/harness-capability-read-model.ts:40`; `git/git-runner.ts:16`; `http/access-boundary.ts:31`).

**Type-onlyness has two spellings** (P5): 383 statement-level `import type` and **128 statements carrying
inline `type` specifiers** (87 production, 291 specifiers; `run-orchestration/src/provisioner.ts:6` carries
19). The codemod preserves **per-specifier** `isTypeOnly` when regrouping.

### 4.2 Why name-driven (P2)

Seven of the 640 names collide with exports outside the eighteen — `Message`, `ProposedCall`, `Thread`
(`@hyperidle/db`, Drizzle row types), `AutonomyLevel` (`api-contract`), `AgentOperationalStatus`,
`ArtifactPreview`, `Block` (`design-system`). Six are different symbols sharing a name. A human resolving
`Thread` from memory lands on `@hyperidle/db` and compiles.

### 4.3 Completeness and correctness

**Dead specifiers.** A missed pass-1 site keeps a `@hyperidle/shared` specifier; `check` fails on each, and a
residual grep must return zero. **That grep is blind to pass 2** — a missed relative import is not
`@hyperidle/shared`-shaped. Pass 2's own check is the assertion above: after the move, **no file under
`framework/*/src` may hold a relative specifier that resolves outside its own package root**. That is
checkable from the tree and is what `check` would otherwise only catch by accident.

**The abort guard, in explicit terms.** The codemod aborts on: an unmapped name; **any `@hyperidle/shared`
specifier in any of the four node shapes that it cannot decompose into names** (namespace import, default
import, bare side-effect import, a dynamic import whose result is not property-accessed); and any relative
specifier in pass 2 that resolves to no module under the map.

**Correctness within the range (P6).** The module-level export sets of the eighteen give **656 names with
zero cross-package collisions**. A wrong destination is a name the target does not export and `tsc` fails.
Measured in `feasibility.md` P6 — not in `requirements.md` §1.2, which does not state it.

**The hole `tsc` does not close, and the check that does.** `tsconfig.base.json` sets neither
`verbatimModuleSyntax` nor `isolatedModules`, so dropping an inline `type` is not a type error. A per-file
*cardinality* check is defeatable — `import { type A, B }` split into `import { A }` (type dropped) plus
`import { type B }` (type added) preserves the count. **The codemod therefore asserts the set of
`(name → isTypeOnly)` pairs is preserved per file**, not a count. It already reads `isTypeOnly` per specifier.

**Cross-check.** The codemod's per-consumer output and `deps:check`'s independent scan derive the same fact
from different inputs.

---

## 5. Manifest and tsconfig derivation

Derived twice and reconciled: (1) the codemod's emitted destinations per consumer; (2) `deps:check`, which
scans each package's files and reports divergences in both directions with sites. Write (1), drive (2) to
zero. AC-4's named failure mode is closed by construction (P1). `tsconfig` `references` are the same
derivation over the 29 sites in B5.

---

## 6. Model and tooling changes

### 6.1 Ruling 1 — the clause, scoped

> The clause admits a `framework`-role source **only when the target surface label is `framework/<name>`**.
> `db:*` surfaces keep their declared audiences.

In clause 7 (`governance-model.ts:292-302`), before `inAudience`, a `framework` source whose target label
matches `framework/<name>` is `allowed`; `db:client`, `db:row-type`, `db:schema-ns`, `db:unknown`,
`db:testing` fall through unchanged. The clause id stays `reach-declared-surfaces-only`; `CLAUSES` does not
grow.

### 6.2 What gates the predicate — and the twelve rows that must retire

**Property 4 does not force the clause's attack case** (P4): `coverageGaps`
(`governance-attacks.ts:804-831`) keys on **registered rule ids**, and `reach-declared-surfaces-only` is a
*clause* id.

**The gate is `decided-rules.json`.** Three rows, all `forbidden` in both worlds — the third added because
`founder-rulings.md` names three `reach: []` surfaces and a further row costs nothing:

| source | target | kind |
|---|---|---|
| `framework` | `db:schema-ns` | `import` |
| `framework` | `db:unknown` | `import` |
| `framework` | `db:testing` | `import` |

All three reproduce today (probed) and would return `allowed` under a broadly-written clause, failing the
frozen loop loudly. They land in **A2**, because they gate A1.

**The twelve `framework/shared` rows retire in B6, not C2.** Six sources × two kinds, all `allowed`. Once
B6 removes the surface, `governance-model.ts:294-299` returns `forbidden` ("is not a declared surface") for
every one, and both loops (`:205-214`, `:220-229`) go red. Leaving them to C2 — which is gated behind the
concept gate — would mean B cannot go green. **Bookkeeping: 118 → 121 at A2 (+3), → 109 at B6 (−12),
then C2 adds the AU34 surface rows.** Both moves touch the four assertions, the test title and the doc
comment listed in §6.6. What matters here is that **B6 owns a −12 no earlier draft stated**.

### 6.3 AC-2's delivery — a new registered rule, so property 4 bites

An earlier draft added the framework-surface check to `registries-honest` and claimed property 4 forced its
attack case and control twin. **False** (P7): `coverageGaps` demands ≥1 case naming the rule id and ≥1
non-control case, and `registries-honest` already satisfies both via `unowned-new-table`
(`governance-attacks.ts:701-715`). Adding a *check* to an existing rule forces nothing.

**Decision: ship it as a new registered rule, `framework-surfaces-declared`.** Then property 4 does bite — a
registered id with no positive attack case is a build error, so `plan.md:62`'s scenario cannot ship as a
deletable hand-list entry. Two directions:

1. every `framework`-role package resolves to a declared `framework/<name>` surface;
2. every declared `framework/<name>` surface resolves to a package that exists — without which the retired
   `framework/shared` entry lints clean.

Its floor is its own explicit non-zero subset assertion (4 today, 21 after), **not** `minScope`, which floors
the whole 34-directory scope and would read clean over an empty framework subset.

**Stated plainly, per R-B: the control twin is convention-backed, not gate-backed.** Property 2 is prose
(`governance-attacks.ts:20-21`); nothing in `coverageGaps` reads it. The positive case is forced; the twin is
not. That is the honest position and it is why the rule is new rather than a check.

### 6.4 `frameworkSurfacesOf`

`scripts/governance-context.ts:187-195` maps a framework package to its label only when the label already
exists, so an undeclared package never becomes a `surface` target and the failure reports the wrong clause.
Fixed in A1, with its attack case in A3 (§3.4 — without that case nothing exercises the fix).

### 6.5 `scripts/` sites

- **`scripts/typecheck-gate.ts:472-514`** hardcodes a leaf list containing `"framework/shared"`, pre-building
  composite declarations (`:279-292`, `:584`). Its `execSync` is wrapped in `catch {}` (`:516-521`) and the
  list already carries two entries that are **not packages** (`layers/core-api/realtime`,
  `layers/agent-execution/tool-provider`, both verified absent) — **a stale entry degrades silently**. The
  builder verifies the *effect* (declarations emitted for each of the eighteen), not the exit code. **Order
  matters**: `:292-298` builds leaves in dependency order, and the eighteen carry nine sibling edges plus
  `credential-access → domain-model`, with `db` and `design-system` depending on several — the list is
  topologically sorted, not appended.
- `scripts/governance-new-cells.ts:49,74` — `TARGETS_BY_KIND` hardcodes `framework/shared`.
- `scripts/rules/no-laundered-re-exports.ts:17,32` — its `@lore` reasons from `shared` being `everyone`.
- `scripts/lib/crossings.ts:55` — doc-comment example.

### 6.6 Row and count bookkeeping, exactly

`governance-model.test.ts` carries `118` at **`:169` (the test title), `:170`, `:171`, `:214`, `:229`** —
four assertions plus the title — and again in the doc comment at `:4` and `:7` ("236 answers (118 rows × 2
worlds)"). `:170` was named in no earlier artifact. Four further totals are hardcoded at `:176-189` (`65`,
`53`, `112`, `6`), mirrored by `totals.production`/`totals.development` in the JSON.
**`makeTarget:150-151` is stale too** — it returns `name: "shared"` for a bare `framework` target, and three
live rows use it; an earlier draft named only `makeActor`.

`governance/README.md` says **124** at six sites (`:31`, `:39`, `:42`, `:44`, `:46`, plus "248 verdicts
(124 rows × 2 worlds)") against a live `totals.rows` of 118 — a six-row drift predating AU34 (AU29 deleted
six rows without touching the prose). C2 corrects all six to the true count; it is not AU34's defect and is
not presented as one.

---

## 7. Evidence plan

| AC | kind | evidence |
|---|---|---|
| **AC-1** | static | `npm run check` — the eighteen appear with zero errors against an empty `typecheck-debt.json`; plus `framework-surfaces-declared` direction 2, which fails if the retired surface entry survives |
| **AC-2** | lint rule + forced attack | `framework-surfaces-declared`; **`plan.md:62` scenario** is its positive case, forced by property 4 because the rule id is registered (§6.3). Its control twin is convention-backed |
| **AC-3** | lint rule + rows + attack | `reach-declared-surfaces-only`; **the three `decided-rules.json` rows** as the permanent gate; **`plan.md:58` scenario** as an attack case, owned by T14 |
| **AC-4** | lint rule | `deps:check` green; `domain-model` declares `zod` only; `hono` only in `http-middleware`; `remark-*`/`unified`/`github-slugger`/`@noble/hashes` only in `block-derivation` |
| **AC-5** | build check | the folds in A5; the §4.9 fixpoint re-run reports zero. One-time — `plan.md:51` scopes it to the split |
| **AC-6** | mixed | below |

**`plan.md:58` needs the message extended.** The scenario asks the build to name "the audience it is not
in". It does not: the message is built at **`scripts/rules/crossings.ts:70`** as
`` `${violation.key} — ${violation.found.detail}. ${violation.why}` `` and `governance-model.ts:302` supplies
the surface's prose reason — file and surface, never the `reach` list. T14 extends the surface clause's `why`
to append the declared audience. (An earlier draft cited `scripts/lib/crossings.ts:69-77`; the message lives
in `scripts/rules/crossings.ts`.)

### AC-6, concretely

`verify` runs **no tests**. So, in addition:

1. **`npm run test:all`** — the affected-slice default is meaningless (every package changed).
2. **`npm run test:integration:harness`** — obligatory. This WP moves `harness-adapter.ts`,
   `worker-protocol.ts`, `return-actions.ts` and the event normalizer; that is harness plumbing under
   `.claude/rules/testing.md:71`, and per-merge verify runs only the `service` project.
3. **`npm run test:e2e`** — committed to. Cheapest broad net for a change rewriting imports in every
   `core-ui` file.
4. **All three applications booted:**
   - **`remote-server`** — drive one real agent session from the browser: `core-ui` → `core-api` →
     `agent-orchestration` → `agent-execution` → harness → back through the event bus. Expected: the session
     starts, streams, completes, and appears in the UI with its outcome.
   - **`remote-worker`** — boot it and let it register. It is in `harness-protocol`'s audience and hosts the
     worker wire protocol being moved. Expected: it connects to `/api/workers` and appears registered.
   - **`desktop`** — built by `verify`; boot once and confirm the window loads and reaches its local server.
5. **`npx vitest run framework/db/src/__tests__/governance-model.test.ts`** — the frozen gate, which `verify`
   does not run (§6.2).

### The bundle scenario (`plan.md:60`)

`vite build --sourcemap` of `layers/core-ui`, reading the sourcemap `sources`: **`hono` absent**; **the three
`node:*` externalization warnings gone**; **`harness-event-normalization.ts` absent** from the module list;
**`remark-*`, `unified`, `github-slugger`, `@noble/hashes` still present** because `core-ui` calls
`deriveBlocks`. **The bundle does not get smaller and is not expected to.**

---

## 8. Leaves and write ownership

Ownership is **exclusive within a phase**. L1 and L2 are Phase A and write disjoint sets. L3 is Phase B+C and
inherits everything once A is complete — so T14/T15 writing files L1 touched is sequential, not contended.

| leaf | owns (write) during its phase |
|---|---|
| **L1 — governance model & rules** (Phase A) | `scripts/lib/governance-model.ts`, `scripts/lib/governance-attacks.ts`, `scripts/governance-context.ts`, `scripts/rules/` (the new rule), `governance/README.md`, `governance/decided-rules.json`, `framework/db/src/__tests__/governance-model.test.ts` |
| **L2 — pre-split source hygiene** (Phase A) | `framework/shared/**`; `harness-registry/src/{index,adapter-pool,cli-harness-adapter,provision-return-hook}.ts` + `src/__tests__/{adapter-pool.test.ts,adapter-pool-ab1.test.ts,adapter-pool-s4.test.ts,AM2-harness-capability-descriptors.test.ts,AM4-adapter-pool-disabled.test.ts,X3-adapter-pool-type.test.ts,return-gate.test.ts,return-status-tool.test.ts}`; `core-api/credentials/src/credential-resolver.ts`; `core-api/src/app.ts`; `remote-server/src/create-server.ts`; `core-api/src/__tests__/AL7-no-kernel-executor.test.ts`; `core-api/src/services/__tests__/{AH2-resolve-agent-model.integration,model-gateway-package-dissolved}.test.ts`; `core-api/src/routes/__tests__/X4-model-gateway.integration.test.ts`; `core-ui/src/utils/scope-labels.ts` + `src/pages/KnowledgeDetail.tsx`; `design-system/src/__tests__/AM5-compose-artifact-body.test.tsx` |
| **L3 — the split** (Phase B+C) | everything |

**L3 must not be split.** Between B3 and B8 no sub-leaf can run `check`.

---

## 9. Failure behaviour and security

**Changed failure behaviour:** an import legal today becomes a lint error because the target's audience no
longer includes the importer — AC-3 working; T14 makes the message name the audience.

**Security, from the surfaces reached.** No behaviour changes; what changes is *who may name* four
security-relevant surfaces, so the abuse case is **accidental widening**:

- **a credential** — `crypto/credential-encryption.ts` + `CredentialResolver` into `credential-access`, six
  named packages. Before this WP the same import was unconditionally legal.
- **an outbound request** — `net/ssrf.ts` into `host-process`, four named packages.
- **a path / subprocess** — `git/git-runner.ts` and `system-prompt-templates.ts` leave the universal barrel;
  today both are reachable from the browser's module graph.
- **untrusted input** — `http/validate.ts`, `body-limit.ts`, `rate-limit.ts`, `timing-safe.ts` into
  `http-middleware`, four named packages.

**Not touched:** no endpoint added, moved or reshaped; no table read or written differently (`plan.md:40`);
no agent-authored field; no authn/authz decision moves.

**The one genuine risk of the model change is the opposite of a wall** — Ruling 1 read broadly *grants*
eighteen packages reach to `db:schema-ns`, `db:unknown` and `db:testing`. §6.2's three rows close it.

---

## 10. Documentation made false

58 files under `docs/`; `governance/README.md` (Ruling 1's clause, and the six `124` sites);
`.claude/rules/design-system.md:17`; `eslint.config.ts:963-964` (restricts `@hyperidle/shared/harness`, a
specifier that **never resolved** — pre-existing dead config the rewrite surfaces);
`scripts/rules/no-laundered-re-exports.ts:17,32`.

---

## 11. Tasks

| id | task | leaf | depends on |
|---|---|---|---|
| T1 | Ruling 1's clause, scoped; `frameworkSurfacesOf` + twin; `README` clause text | L1 | — |
| T2 | Three `forbidden` rows; `makeActor`'s 25 packages; **`makeTarget`'s bare-`framework` case**; the row bookkeeping (§6.6) | L1 | T1 |
| T3 | Attack cases: Ruling 1 positive; three `db:*` twins; **the `frameworkSurfacesOf` case** | L1 | T1 |
| T4 | New registered rule `framework-surfaces-declared`, both directions, subset floor, forced positive case + twin | L1 | — |
| T5 | Delete `format/money.ts` + ten dead exports; **every no-successor construct** (§3.5); ten test consequences | L2 | — |
| T6 | The nine folds | L2 | T5 |
| T7 | Split the cross-destination tests (§3.6) | L2 | T6 |
| T8 | Four edge rewrites, pre-split spelling | L2 | — |
| T9 | Six republication removals + two repoints | L2 | — |
| T10 | Split `model-gateway.ts` / `credential.ts` in place | L2 | T8 |
| T11 | Build the codemod — **four node shapes, two passes**, the explicit abort guard, the `(name → isTypeOnly)` set check; dry-run; reconcile its map | L3 | T1–T10 |
| T12 | **Atomic:** eighteen packages (layout per §3.2), delete `shared`, both codemod passes, manifests + tsconfigs, registries incl. **the −12 rows**, `design-system/vitest.config.ts`, `typecheck-gate` leaf list in dependency order, both lockfiles, floor raise, then green = `verify` **+** the frozen model test | L3 | T11 |
| T13 | `eslint.config.ts` + the four `scripts/` sites + remaining prose | L3 | T12 |
| T14 | Extend the surface finding to name the declared audience (`scripts/rules/crossings.ts:70` / `governance-model.ts:302`); write `plan.md:58`'s attack case + twin | L3 | T12 |
| T15 | `decided-rules.json` AU34 surface rows + totals + README's six `124` sites | L3 | concept gate |
| T16 | 58 docs files | L3 | T12 |
| T17 | Evidence: `test:all`, `test:integration:harness`, `test:e2e`, three applications booted, bundle sourcemap read, AC-5 fixpoint re-run, frozen model test | L3 | T12 |
