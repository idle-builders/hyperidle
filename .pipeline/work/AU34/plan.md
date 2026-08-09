# AU34 — Split `shared` into named framework packages, each with a decided audience

**Status: shipped.** This file is the consolidated record. The phase artifacts it replaces
(`requirements.md`, `architecture.md`, `feasibility.md`, `refine-critique.md`, `phase-b-inputs.md`,
`development-file-placement.md`, `place-development-files.ts`) were folded in here and removed; git history
keeps them. `founder-rulings.md`, `progress.json` and `retro.jsonl` stay alongside.

---

## Work package

**Work package.** As a maintainer, I want `framework/shared` broken into several smaller framework packages, each named for what it actually holds and each with its own decided audience — so that "who may reach this" becomes a set of deliberate answers instead of one blanket permission covering 92 modules. `shared` is the only target in the whole governance model whose audience is `everyone`, and that permission was granted to a substrate of types, errors and formatting. It now also covers the harness protocol, the HTTP middleware stack, the credential-encryption primitive, the markdown block toolchain, the content-kind registry and an agent work-intent recorder. When this ships, each of those is its own package with its own `reach` entry and a written reason, and the modules that are genuinely universal are the only ones left with `everyone`.

**Why this matters.** Reach is the one permission the model grants unconditionally, and everything else in the design rests on it being narrow. Every module that lands in `shared` inherits it silently — nobody decides that the harness adapter interface should be reachable from the web UI, or that `agent-work-intent-recorder` should be reachable from anywhere; it is simply true because of where the file sits. The maintainer's cost of not fixing this is that `shared` is the one place where the governance model cannot say no, so it is the path of least resistance for exactly the code that most needs a boundary — and it grows monotonically, because adding to it is never a violation. There is a second, concrete cost already visible: the package's manifest carries `hono`, `remark-parse`, `remark-gfm`, `unified`, `github-slugger` and `@noble/hashes`, so a markdown toolchain, an HTTP framework and a hash library sit in the dependency closure of every package that names `shared` — including the browser bundle.

**Type.** framework. **Engineering tier.** production — every package in the repo depended on this one.

**Depended on** AU29 (merged in #463), which took `observability/dispatcher.ts` out of the framework role.
`agent-run-admission.ts` did not move in AU29; it is 32 lines of type guards over the closed kind list in
`events.ts` and landed beside that list here, renamed `agent-work-intent-kinds.ts`.

**Constraints held throughout.**
- Every new package gets an entry in `governance/architecture.json` `surfaces` with an explicit audience and a written reason. A package with no decided audience does not ship.
- `everyone` is granted only where the reason survives being written down.
- No new barrel beyond each package's own `src/index.ts`.
- The end state is stated as the end state — no re-export shim left in `shared`, no deprecation period.
- Nothing that only tests consume survives the split.
- No behaviour changes. This is placement.

**Out of scope.** Taking the framework off the event bus (AU29). Table, composition-root and cross-layer
boundary work (AU30, AU31). Reducing what the substrate exports on the merits beyond what `knip` flagged
during the move.

## Acceptance criteria

- `framework/shared` no longer exists as a single package; what it held lives in framework packages named for what they contain.
- Every one of those packages has a decided audience recorded with its reason, and the build fails on a package with no audience decided.
- Only the packages whose reason for universal reach survives being written down are reachable by everyone; the rest are reachable only by their stated audience, enforced by the lint.
- No package's dependency closure carries a toolchain it does not use — in particular, naming the substrate no longer pulls in a markdown parser or an HTTP framework.
- No module survives the split that nothing outside its own package reaches.
- `npm run verify` is green and the application behaves identically — proven by running it, not by reading the code.

**Validation scenarios.** (1) Every framework package resolves to a declared surface with a stated audience;
none falls back to an undecided one. (2) Importing the harness protocol from outside its audience fails
`npm run lint`, naming the file and the audience it is not in. (3) The browser bundle carries the markdown
toolchain only because a package that genuinely renders markdown is in the graph. (4) A new framework package
with no `reach` entry fails `npm run lint`, naming the package.

---

## What shipped

### The eighteen packages and their audiences

`reach` is the vocabulary the model already speaks: `everyone`, a **role** name, or a **package** short name.
There is no layer inheritance — naming `agent-execution` does not admit `harness-registry`. Under Ruling 1 a
`reach` list names who may reach the package **from outside the framework role**, so no list carries a sibling
framework package. Development-only consumers are recorded in the derivation audit and are never granted.

| package | what it holds | reach |
|---|---|---|
| `domain-model` | the product's nouns: closed sets, wire shapes, pure predicates over them | **everyone** |
| `presentation-format` | a value turned into the string a human reads | `core-ui`, `core-api` |
| `harness-capability` | what an installed harness *is* — readiness, models, tools, auth action, return-enforcement provisioning | `core-ui`, `core-api`, `harness-registry`, `connections`, `run-orchestration` |
| `harness-protocol` | how a run is dispatched to a harness and how its output comes back | `harness-registry`, `agent-orchestration`, `run-orchestration`, `session-requests`, `agent-run-config`, `core-api`, `remote-worker` |
| `tool-protocol` | the descriptor/dispatch contract between tool provider and tool handlers, and the built-in catalog | `harness-registry`, `tool-handlers`, `core-api`, `review`, `settings` |
| `work-intent-port` | the recorder/reader seam a `core-api` route uses to write an agent work intent | `core-api`, `conversation`, `knowledge`, `policy`, `review`, `routine`, `work`, `run-orchestration` |
| `filesystem-contract` | the Filesystem primitive's vocabulary and its mount/auth/capture seams | `core-api`, `agent-orchestration`, `filesystems`, `filesystem-mounting`, `run-orchestration` |
| `conversation-parts` | the Part vocabulary and the adapters that derive Parts | `core-ui` |
| `block-derivation` | markdown text into the block tree, plus the content-addressed block id | `core-ui` |
| `event-bus` | the in-process publish/subscribe object | `core-api`, `agent-execution`, `agent-orchestration`, `service`, `application` |
| `http-middleware` | the primitives a route file on a Hono app needs | `core-api`, `agent-orchestration`, `harness-registry`, `run-orchestration` |
| `diagnostics` | structured logger, secret scrubber, observability event/adapter contract, console sink | `core-api`, `service`, `application` |
| `host-process` | the host as seen from a server process — spawning `git`, DNS, env at boot, deployment profile | `agent-orchestration`, `run-orchestration`, `notifications`, `remote-server` |
| `factory-defaults` | the roster and system-prompt templates a fresh installation is seeded with | `core-api`, `agent-orchestration`, `tool-handlers` |
| `credential-access` | everything that needs a live secret: the resolver port, the AES-256-GCM cipher, model resolution | `core-api`, `credentials`, `agent-orchestration`, `connections`, `remote-server` |
| `cron` | parsing a cron expression and computing the next run | `core-api`, `routine`, `tool-handlers` |
| `toon-codec` | the TOON text codec and its parse error | `run-orchestration` |
| `query-escaping` | user text turned into a literal a query engine cannot read as syntax | `core-api`, `knowledge`, `users`, `work` |

**Why `domain-model` keeps `everyone`:** these are the names the whole system uses for the same things — a
task state, a bet status, a knowledge scope, a thread, a team, a model in the catalog. Nothing here has
behaviour beyond a predicate over its own closed set, nothing here declares a port, and nothing carries a
dependency a browser cannot run (it imports `zod` and no `node:` builtin). A shape is not an access path —
the same reason the model already grants `everyone` to `db:row-type`. Measured: 25 packages import it in
production, covering every production role.

`architecture.json` still holds `everyone` on `framework/db`, `db:client` and `db:row-type`, so the file
carries four such grants after this work, not one. The claim this work package makes is the narrower one: of
the eighteen packages the substrate became, exactly one is universal.

**Where a role was granted instead of names.** A role may be granted when the permission is a rule about the
role — true of any member by virtue of what the role is — **and** a substantial share already exercises it.
Otherwise enumerate. Against 19 services / 3 applications / 4 layers: `event-bus → service` (9 of 19, any
service may publish) granted; `event-bus → application` (1 of 3, an application composes the bus at boot)
granted on the first clause; `diagnostics → service` (6 of 19) granted; `diagnostics → application` (1 of 3)
granted; `diagnostics → layer` **refused** — "every layer logs" is false, `core-ui` must not, so `core-api` is
enumerated; `presentation-format → service` **refused** (0 of 19, and `reach` permits rather than forces
reuse).

### The two gates

**`framework-surfaces-declared`** — a new registered rule, both directions: a framework package with no
`surfaces` entry is reported at its manifest; a declared `framework/<name>` with no package behind it is
reported at the registry. It exists because a package **nobody imports yet** emits no crossing at all, so the
crossing detector never asked it the audience question — adding a package is exactly when the question gets
asked and exactly when nothing was asking it. It shipped as its own **registered rule id** rather than as a
check folded into `registries-honest`, because `coverageGaps` keys on registered rule ids: a registered id
with no positive attack case is a build error, while a check added to a rule that already has one forces
nothing. Its floor is the **framework subset**, not the package set, so a scan that finds no framework
packages is a `DeadRuleError` rather than a silent pass.

**The surface clause, widened and scoped** (`scripts/lib/governance-model.ts` and its twin in
`governance-attacks.ts`) — a `framework`-role source is admitted at a surface target only when the target
label is `framework/<name>`.

**The refusal message now names the audience.** The surface clause's `why` appends the declared `reach`, so a
forbidden import is refused with file, line, surface **and** the audience it is not in — which is what
validation scenario 2 asks for and what the message did not previously do.

### The three rulings

Recorded verbatim with their context in `founder-rulings.md`; summarised here so this file stands alone.

**Ruling 1 — a framework package may name another framework package.** Founder: *"framework to framework
imports should be fine. lets adapt the rule to allow that."* Splitting one package into eighteen turns nine
internal imports into cross-package crossings (`event-bus → diagnostics`, `harness-protocol → event-bus`,
`tool-protocol → harness-protocol`, `conversation-parts → harness-capability`, and five more), each with a
matching `manifest` crossing — so without the ruling the new packages could not even declare one another as
dependencies. No precedent existed: not one of the model's ten existing surfaces granted the `framework` role.
The ruling is a property of the model, not sibling names threaded through each audience list, which is why
`reach` lists carry no framework entries and ~36 rule rows were never needed.

**Ruling 1 is scoped.** Read literally, "a framework package naming another framework package" is satisfied by
any surface *of* a framework package — including `db:schema-ns`, `db:unknown` and `db:testing`, all
`reach: []`, the first two one-door surfaces. That reading would have granted all eighteen new packages
production reach to the one import that hands over every table at once, and to the undecided-surface
catch-all — a line AU30/AU31 own. **The clause admits a `framework` source only when the target label is
`framework/<name>`; `db:*` surfaces keep their audiences unchanged.** Because `decided-rules.json` held no
`source: "framework"` row for any `db:*` target, the scoping is pinned by **three new forbidden rows**:
`framework → db:schema-ns` and `framework → db:unknown` forbidden in **both** worlds (a door production has
only one of), and `framework → db:testing` forbidden in production, **allowed** in development — because
`db:testing` is not a one-door surface, so the development relaxation crosses it exactly as it does for a
layer or a service. Recording that third row forbidden in both worlds would have been the tidier-looking row
and the wrong one. All three are reproduced by the frozen `framework/db/src/__tests__/governance-model.test.ts`
loop: broaden the clause and all three go red.

**Flagged, not actioned:** the ruling is general, so it also admits a framework package naming
`framework/api-contract` (`reach: ["layer"]`) and `framework/design-system` (`reach: ["core-ui"]`). Nothing
imports either from a framework package today. `design-system`'s written reason — "there is exactly one user
interface; a second consumer means a second interface, which is a product decision, not an import" — is the
one whose intent this most plainly relaxes. `framework/db` is not a third: it already carries `everyone` and
was never refused.

**Ruling 2 — AC-5 is literal.** Founder: *"A module without a consumer makes no sense, that module can be
deleted or just folded into something that actually has a consumer."* The requirement artifact had
reinterpreted the criterion as co-location, reading "package" as "module"; the reinterpretation was surfaced
rather than absorbed and was withdrawn. Nine modules folded into their real consumers — seven `kinds/*` into
`kinds/registry.ts`, `blocks/slug.ts` into `blocks/normalise.ts`, `toon-errors.ts` into `toon-codec.ts` — and
one module, `format/money.ts`, was deleted as the only one with no consumer anywhere. Computed to a
**fixpoint**, so a module stranded by the folding itself is caught: a naive "fold into your first importer"
would have sent `kinds/kind-definition.ts` into `kinds/code.ts`, which is itself being folded. Folding moves
declarations between files and changes no function, so it is placement and does not collide with the
no-behaviour-change constraint.

**Ruling 3 — the audience table is approved; rule rows are recorded minimally.** The founder approved the
eighteen packages and their audiences with the derivation audit. `decided-rules.json` records them in the
shape `framework/api-contract` and `framework/design-system` already used — a row per named source plus one
general contrast row per surface, rather than a row for every source→target pair. The file went from 118 to
195 rows. Enforcement is not weakened: the audience lives in `architecture.json` `surfaces` and the rows
record verdicts the model must reproduce. What the minimal shape gives up is an explicit written row for
every pair; what it buys is a file that stays readable.

### The three symbol relocations

Names that crossed a package boundary independently of their module — the reason the whole derivation had to
run on the exported **name**, not the module.

- `ReturnEnforcementChannel` left `harness/harness-adapter.ts` for `harness-capability`, breaking the
  descriptor ↔ adapter cycle. It is also the only reason `run-orchestration` is in `harness-capability`'s
  audience: a module-level derivation attributes that import to `harness-protocol` and produces a list that
  fails the lint on a legal import.
- `CredentialResolver` left `credential.ts` for `credential-access`; the closed sets and predicates stayed in
  `domain-model`.
- `resolveModel`, `resolveProvider`, `resolveModelTier` and `UnsupportedAgentProviderError` left
  `model-gateway.ts` for `credential-access` — each takes a `CredentialResolver`, and leaving the private
  helpers behind would make the universal package import the narrow one. `UnsupportedAgentProviderError` moved
  with its only throw site and is not exported from the new package's barrel. `ResolvedModel`,
  `ModelGatewayConfig`, `MODEL_PROVIDERS`, `MODEL_CATALOG` and the rest stayed in `domain-model`, whose
  `everyone` admits all their importers.

### Republication, stopped

`no-laundered-re-exports` forbids a cross-package `export … from` a framework surface whose reach is not
`everyone`. It passed before only because the substrate's reach was `everyone`; this work removes that reason.
Five production sites flip to error and one more exists in a two-statement spelling the rule cannot see
(`harness-registry/src/provision-return-hook.ts`). In every case the laundering was not load-bearing, so all
six stop republishing and **no audience was widened to accommodate them**. Two readers were repointed at the
package that owns the name (`core-api/src/app.ts` and `remote-server/src/create-server.ts` for
`CredentialResolver`; `core-ui/src/pages/KnowledgeDetail.tsx` for `scopeKindToLabel`).

---

## As-built architecture

**One PR, three phases, with the decisions hoisted out of the irreversible window.** The governing invariant:
*the atomic window contains no judgement; every decision lands in Phase A, where a wrong one is a revert.*
Phase A was eleven independently green preparation commits — the model change and its break-tests, the three
forbidden rows, the new rule, the folds, the deletions, the four edge rewrites, the republication removals,
and the written Phase-B inputs. Phase B was one atomic commit of 917 files that contains mechanism only.
Phase C was follow-ups. Total diff: 1008 files, +9892 / −3860, 26 commits.

**The Phase-B inputs were written as artifacts the atomic commit merely consumes** — the src-relative layout
convention, the post-fold 80-module destination map, the floor baseline table, and an 86-row development-file
placement with a computed subject rule. That is what made a no-shim, no-deprecation, every-package-touched
change tractable.

**In-package layout, decided mechanically rather than stylistically.** Every module keeps its path relative to
`src/`, so every **same-package** relative import is byte-identical after the move — collapsing the codemod's
second-pass population from 239 statements to 47. The accepted cost is redundant directory segments like
`block-derivation/src/blocks/` and `harness-protocol/src/harness/`, written down here rather than discovered
later.

**The rewrite moved 768 external sites by name, not by module.** Seven substrate names collide with exports
elsewhere in the repo, so a module-driven rewrite would have resolved e.g. `Thread` onto the database package
and still compiled.

**Two rewrite classes fell outside the codemod's first node shape** and were mechanised explicitly: relative
imports inside the package (239 production statements, 47 crossing a destination, plus 115 in development
files, 27 resolving to a dissolving barrel) and 45 `import("@hyperidle/shared")` sites (29 type positions, 16
runtime calls). A relative specifier is never `@hyperidle/shared`-shaped, so both the codemod and the
residual-grep check were structurally blind to all of them until this was made explicit.

**The dependency block is a decision, not a derivation.** Whether a rewritten manifest lists a package under
`dependencies` or `devDependencies` silently decides which world its manifest crossing is judged in. Deciding
it explicitly is what kept eight forbidden production manifest crossings from being emitted.

**The mechanical surface AC-4 depended on**, all rewritten: 31 consumer manifests, 28 per-package tsconfigs,
the root project reference and path alias, the vitest projects array (1 → 18), 16 `eslint.config.ts`
references, the knip workspaces block (1 → 18), the `eventBus.typesModule` path in `architecture.json`, a
`docker-compose.yml` comment, a project rule, 58 files under `docs/`, and the lockfile.

---

## Evidence

- **`npm run verify`** exit 0 on the committed tree.
- **`npm run check`** — 52 packages, zero errors, empty typecheck debt.
- **`npm run lint`** exit 0, including the three governance-lint passes.
- **`npm run test:full`** — 6188 passed. **`npm run test:integration:service`** — 2795 passed, 4 skipped.
  **`npm run test:e2e`** — green. The frozen `governance-model.test.ts`, which `verify` does not run — 27
  passed.
- **Both new gates shown to bite and shown to go red when disabled.** `framework-surfaces-declared` has a
  break-test in each direction. The Ruling-1 widening shipped with five cases including **two control twins**
  — a `framework` source must still be refused at `db:schema-ns` and at `db:unknown` — which are the cases
  that tell the scoped reading from the literal one on the live tree. The audience-naming message shipped with
  a positive/negative pair so it tests the audience and not the package name.
- **Browser bundle, measured from the sourcemap:** 683 modules, `hono` **0**, `node:` externalization
  warnings **0**, `harness-event-normalization.ts` **absent**. The markdown toolchain (`remark-*`, `unified`,
  `github-slugger`, `@noble/hashes`) is **still present, legitimately** — `layers/core-ui` production code
  genuinely calls `deriveBlocks`. **The bundle does not get smaller and was never expected to;** what the
  split removes is the parser from the closure of every *other* package. Before this change the same
  measurement found `hono` absent from the bundle but present in 31 manifests, and found the harness event
  normalizer shipped to the browser purely as a value re-export from the universal barrel with zero
  interface consumers — the defect, visible in shipped output.
- **Three applications booted:** `remote-server` (a real agent session driven from the browser, through
  `core-ui` → `core-api` → `agent-orchestration` → `agent-execution` → harness → back through the event bus),
  `remote-worker` (registered against `/api/workers`), `desktop` (window loads and reaches its local server).
- **0 of 96 modules stranded** — no module in any of the eighteen packages is reached only from inside it.
- **`framework/shared` absent from every registry** — `architecture.json`, `decided-rules.json`, `knip.json`,
  the vitest projects array, the root tsconfig, `eslint.config.ts`.
- Implementation review returned **DONE** with all six criteria independently re-verified against the live
  tree rather than read off the build's own claims. Ten non-blocking findings, three of which were
  inaccuracies in artifacts this work package itself delivered.

---

## Known limitations, residual risk, and what this leaves for later

- **The harness lane is red, and it was red before this change.** `npm run test:integration:harness` reports
  **5 failed / 62 passed** — four `codex`, one `opencode`. Investigated on a throwaway `origin/main` worktree
  and it reproduces there: same harnesses, same failure count, membership shifting between runs, every failure
  a model-behaviour assertion (`codex` reports `MCP server not ready` and calls `list_mcp_resources` instead
  of the provisioned tool; `opencode` does not emit `step_finish`). This is real-CLI nondeterminism against
  the current binaries, pre-existing on `main`; this branch does not make the lane redder, and it was the
  first run in which the `builtin` half executed at all. The lane is release-gated, so per-merge verify does
  not run it. **It wants its own work package** — stabilising or re-scoping these assertions is not placement
  work and was never in this one's scope.
- **Control twins remain convention-backed.** The attack harness's "property 2" is prose that nothing
  evaluates. What forces the two `db:*` twins to exist is the three forbidden `decided-rules.json` rows and
  the frozen model test, not the harness. Stated plainly rather than claimed.
- **Ruling 1's general widening is flagged and not actioned** — a framework package may now name
  `framework/api-contract` and `framework/design-system`. Reversible on request.
- **Two facts the audiences now make visible rather than hide:** `core-api` is in `harness-protocol`'s
  audience because it hosts `/api/workers` and the run-orchestration composition — a live architectural
  question; and `framework/toon-codec` has exactly one consumer. Neither is scope here.
- **The browser carries two markdown stacks** — `remark`/`micromark` via `block-derivation`, and
  `markdown-it` + `tiptap-markdown` via the editor. Consolidating them is not this work package.
- **`eslint.config.ts` restricted `"@hyperidle/shared/harness"` specifiers that never resolved** — `harness`
  was not a declared subpath, so the pattern had never matched anything. Pre-existing; surfaced by the
  rewrite.
- **`governance/README.md` stated 124 decided rows against a live 118** before this change, and the
  governance-model fixture invented a role for every package name it did not know, so a named row was decided
  by whichever clause caught it first. Both corrected here; neither is this work package's defect.

---

## Durable learnings

Full observations with evidence are in `retro.jsonl`. The ones that generalise:

- **The unit of a reach derivation is the exported name, not the module.** A symbol relocated across a package
  boundary contributes zero consumers to a module-level audit, and the audit cannot see its own error. The
  same choice paid twice: it found a missing audience entry that would have been a red build on a legal
  import, and it kept a 768-site codemod from resolving colliding names onto the wrong package.
- **Define the measured population to include edges that only exist after the change.** Nine
  framework→framework edges did not exist before split day, so three critique rounds never saw them; each
  would have been forbidden twice over.
- **A founder ruling gets recorded verbatim and scoped separately, in writing, reversibly.** The literal text
  of Ruling 1 would have opened three zero-audience database surfaces belonging to a different work package.
- **A guarantee belongs on something that fails a build.** Twice, one level apart, an artifact claimed the
  attack harness's coverage property forced a break-test, and both times it forced nothing — `coverageGaps`
  keys on registered rule ids, so a clause id forces nothing and a check folded into a rule that already has a
  positive case forces nothing either. Both were closed by moving the guarantee (three forbidden rows under
  the frozen model test; a new registered rule id), not by restating it.
- **`vi.mock` takes its specifier as an argument, not as an import.** A codemod never sees it, and a relative
  `vi.mock` of a path that no longer resolves is silently a no-op. `verify` runs no tests, so nothing in the
  verify chain could have caught it; it was found only because a test lane was run and went red. Captured as
  `@lore` at the site.
- **Hoist every decision out of the irreversible window.** Eleven green, individually revertible preparation
  commits plus one mechanical atomic commit is what made a change with no shim and no deprecation period
  reviewable.
- **Artifacts that state counts go stale against the tree they describe, even within one work package.** The
  plan's own enumerations undercounted at least four times; each was corrected inside a preparation commit
  rather than by re-planning.
- **Cost signal.** Sized L (~4d); ran in ~11h wall clock across 26 commits. 28 blocking findings across four
  refinement critique rounds and three architecture rounds, all before any code. The large majority of the
  effort went to deciding and mechanising *what could be measured and enforced*, not to the move itself.
