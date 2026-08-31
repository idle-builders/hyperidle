# AU34 — Split `shared` into named framework packages, each with a decided audience

**Status: shipped 2026-08-09.**

## What we need

`framework/shared` broken into smaller framework packages, each named for what it holds and each with its
own decided audience — so "who may reach this" becomes a set of deliberate answers rather than one blanket
permission covering 92 modules. `shared` was the only target in the governance model whose audience was
`everyone`, a permission granted to a substrate of types, errors and formatting that had since come to
cover the harness protocol, the HTTP middleware stack, the credential-encryption primitive, the markdown
block toolchain, the content-kind registry and an agent work-intent recorder. Reach is the one permission
granted unconditionally and everything else rests on it being narrow, so `shared` was the one place the
model could not say no — the path of least resistance for exactly the code that most needs a boundary,
growing monotonically because adding to it was never a violation. Nobody ever decided the harness adapter
interface should be reachable from the web UI; it was true because of where the file sat. The second cost
was concrete: the manifest carried `hono`, `remark-*`, `unified`, `github-slugger` and `@noble/hashes`, so
a markdown toolchain, an HTTP framework and a hash library sat in the closure of every package naming it.

Done means `shared` no longer exists as one package; every successor has a decided audience recorded with
its reason and the build fails on one that has none; only packages whose reason for universal reach
survives being written down keep `everyone`; no dependency closure carries a toolchain it does not use; no
module survives that nothing outside its own package reaches; and `verify` is green with the application
proven identical by running it. Constraints: no new barrel beyond each package's own `src/index.ts`; the
end state is stated as the end state, no shim and no deprecation period; nothing only tests consume
survives; no behaviour changes, because this is placement. Out of scope: taking the framework off the
event bus, table and composition-root and cross-layer boundary work, reducing what the substrate exports
on the merits.

## How it works

`shared` became **eighteen packages**, each named for what it holds and each carrying a `surfaces` entry
in `governance/architecture.json` with its audience and a written reason — that registry, not this file,
is the authoritative record. `reach` names `everyone`, a role, or a package, with no layer inheritance:
naming `agent-execution` does not admit `harness-registry`.

**Exactly one of the eighteen is universal.** `domain-model` keeps `everyone` because these are the names
the whole system uses for the same things — a task state, a bet status, a knowledge scope, a thread, a
team, a model in the catalog. Nothing there has behaviour beyond a predicate over its own closed set,
declares a port, or carries a dependency a browser cannot run. A shape is not an access path — the same
reason `db:row-type` already had `everyone`.

**A role is granted instead of names only when the permission is a rule about the role** and a substantial
share already exercises it; otherwise enumerate. `event-bus → service` and `diagnostics → service` are
granted; `diagnostics → layer` refused, because "every layer logs" is false: `core-ui` must not.

**A framework package may name another framework package** (Ruling 1). The split turned nine internal
imports into cross-package crossings, each with a matching manifest crossing, so without this the new
packages could not declare one another as dependencies — and no precedent existed, since none of the
model's ten surfaces granted the `framework` role. It is a property of the model rather than sibling names
in each audience list, which is why `reach` lists carry no framework entries. **It is deliberately
scoped:** read literally it is satisfied by any surface *of* a framework package, including
`db:schema-ns`, `db:unknown` and `db:testing` — granting all eighteen production reach to the one import
that hands over every table at once. So the clause admits a `framework` source only where the target label
is `framework/<name>`, pinned by three forbidden rows: `→ db:schema-ns` and `→ db:unknown` forbidden in
both worlds (a door production has only one of), and `→ db:testing` forbidden in production but
**allowed** in development, because it is not a one-door surface and the relaxation crosses it as for any
layer or service — the tidier-looking row would have been the wrong one.

**A module nothing outside its own package reaches does not survive** (Ruling 2) — deleted, or folded into
its real consumer; co-location is not satisfaction. Nine folded, one deleted, computed to a fixpoint so a
module stranded by the folding itself is caught. **Audience rows are recorded minimally** (Ruling 3): a
row per named source plus one contrast row per surface, not a row per pair.

**Two gates ship with it.** `framework-surfaces-declared` reports in both directions — a framework package
with no `surfaces` entry, and a declared surface with no package behind it — because a package nobody
imports yet emits no crossing at all, so the detector never asks it the audience question. It is its own
registered rule id, because only a registered id with no positive attack case is a build error, and its
floor is the framework subset, so a scan finding none errors rather than passing. A refused import now
names file, line, surface **and** the audience it is not in. And the rule forbidding a cross-package
`export … from` a non-`everyone` framework surface starts biting: six production sites stopped
republishing, and no audience was widened to accommodate them.

## How we work on this

**Hoist every decision out of the irreversible window.** Eleven independently green preparation commits
carried the model change and its break-tests, the forbidden rows, the new rule, the folds, the deletions,
the edge rewrites, the republication removals, and the written inputs the atomic commit would consume.
Phase B was then one atomic 917-file commit of mechanism only. Every module kept its path relative to
`src/`, so same-package relative imports were byte-identical after the move; the accepted cost is
redundant segments like `harness-protocol/src/harness/`.

**Derive on the exported name, not the module.** Three symbols crossed a package boundary independently of
their module, and a module-level audit contributes zero consumers for those — it cannot see its own error.
The choice paid twice: it caught a missing audience entry that would have been a red build on a legal
import, and kept a 768-site codemod from resolving colliding names onto the wrong package. Relatedly,
listing a rewritten dependency under `dependencies` or `devDependencies` silently decides which world its
crossing is judged in.

Residual risks. **The harness lane is red and was red before** — 5 failed / 62 passed, reproduced on a
throwaway `origin/main` worktree, every failure a model-behaviour assertion against real CLI binaries; it
is release-gated, so per-merge verify never runs it, and stabilising those assertions wants its own
package. **Ruling 1's general widening is flagged, not actioned** — a framework package may now name
`framework/api-contract` and `framework/design-system`, whose written reason ("there is exactly one user
interface") this most plainly relaxes; reversible on request. The attack harness's control-twin property
is prose nothing evaluates — what forces the two `db:*` twins is the three forbidden rows plus the frozen
model test. Two facts the audiences make visible rather than hide: `core-api` is in `harness-protocol`'s
audience because it hosts `/api/workers` and the run-orchestration composition, and `toon-codec` has
exactly one consumer. The bundle did not shrink and never would: what the split removes is the parser from
the closure of every *other* package.