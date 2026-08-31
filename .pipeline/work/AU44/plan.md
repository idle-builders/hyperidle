# AU44 — Fold the packages and shrink what survived

**Status: shipped 2026-08-24** (PR #507, squash-merged as `23c160242`).

## What we need

The packages the audit found to be boundaries nobody needed are dissolved into the code that actually
uses them, and the methods and types that survived the deletion pass are cut back to the shape they would
have if written today.

After the deletion pass the repository was smaller but still shaped by decisions nobody would make again:
type-only packages centralising contracts one consumer reads, "port" packages with a single
implementation, formatters and helpers that lived together only because they were homeless, and surviving
functions carrying parameters and options no caller passes. Package boundaries are the expensive kind of
clutter — they force import ceremony, dependency blocks and build wiring onto work that should be a
function call. The input was 72 rows marked `MERGE` and 327 marked `SIMPLIFY`, plus a package-level
verdict for most framework packages — dissolve into a named service or consumer, split between owners, or
genuinely stay shared — with the measured consumer list behind it.

Done means every merge and simplify row is performed or carries a written reason it survived, the survivor
list short enough for the founder to read and accept; every package marked for dissolution is gone with
its survivors relocated, or recorded as surviving with a reason; no row marked `FINISH` or `PLUGIN` is
touched, because track BA owns those; `verify` and the full suite pass; observable behaviour is unchanged;
and no package remains whose only exports re-export another package's symbols.

Boundaries enforced by the governance rules are decided by those rules, not by this work — a fold that
would violate one does not happen and is recorded as surviving with that reason. Out of scope: deleting
anything, rewriting a surviving implementation beyond the shrink the audit names, changing which service
owns which table.

## How it works

Batches are cut by **area**, not by verdict type: a package dissolve, the merges inside the package it
lands in, and the simplify rows on the surviving methods are all the same edit to the same files. Each
batch runs in its own worktree off a consolidation branch that is green at every merge — that is the
checkpoint. Each batch is committed or reverted whole; every edit first, then one typecheck.

Two corrections the deletion pass earned governed this one. A symbol convicted against its call sites can
still be obliged by an interface that declares it — removing one such method broke both production servers
— so check interface obligations before folding, not only callers. And `check` and `lint` prove
compilation, not behaviour: the deletion pass held them green through nineteen checkpoints while the
service lane was red and the product broken in four places. Run the integration lane per checkpoint.

**Result: the framework went from 21 packages to 7** — `api-contract`, `db`, `diagnostics`,
`domain-model`, `event-bus`, `harness-capability`, `harness-protocol` — and the typecheck gate from 55
packages to 39: fourteen dissolved into their users, three verdicted to stay shared did, three carrying a
split verdict survive as a slimmed core.

**The harness disagreement, settled.** `harness-capability`'s own audit said merge it into
`harness-protocol` without hesitation — thirteen type declarations are not a package — but two other
audits keep them apart for the same reason: `core-ui` imports `harness-capability` in seven files and must
never see `SessionConfig`, the worker protocol, or the EventBus types next door. That is an audience
boundary, not tidiness, and it holds even as `harness-protocol` sheds four of its six modules, because the
residue that stays shared is exactly the adapter contract where `SessionConfig` lives. So three packages
became two: `tool-protocol` dies into `harness-protocol`, `harness-capability` stays as the UI-facing
vocabulary, and the leak both audits named — `HarnessCapabilities` duplicating `HarnessRuntimeCapabilities`
field by field — is fixed by declaring one an extension of the other, needing no merge at all. One audience
did widen: `tool-handlers`, `review` and `settings` now reach `harness-protocol`; the two audiences were
identical only in that neither had UI consumers.

**Deliberate behaviour changes**, all accepted: patching a non-active bet returns 400 rather than 500;
`WorkIntentInput.bakedRequest` is required; direct-message threads key on recipient kind so agent- and
user-kind threads stop colliding; the knowledge list is recency-only, without frequency and relevance
pills; notification config is SMTP-only and its test endpoint returns 400 when unconfigured;
`GET /sessions` drops `agentId`, `limit` and `offset`. Two migrations: `team_members` folded into `teams`,
`propagation_log` dropped. `@hyperidle/design-system` is gone but every component lives under
`core-ui/src/ds/`.

**The one honest regression against the pass's own goal.** Governance forbids service-to-service imports,
so a symbol two services need has no legal shared home once `domain-model` stops being one:
`isAgentWorkIntentKind`, the transition error classes and the system-prompt template reader each exist
twice, documented with `@lore` and open for a founder call.

## How we work on this

The audit and its rulings live off `main`, on branch `pipeline/AU44` under `.pipeline/work/AU20/destroy/`
(110 files) and reachable from the tag `au20-audit-evidence` — working files, not product. Track BA needs
them for the `FINISH` and `PLUGIN` rows; do not re-derive the list by re-running the audit, because the
rulings that reshaped it exist only there.

Removing code forced what remained to prove itself and surfaced six real bugs, none on the audit's list —
among them an env-seeded Anthropic key written under a name no resolver reads, killing a fresh boot at its
first agent run.

**Rules for whoever cleans up next.** When a row's write-up names a plugin, trigger or routine as its
replacement, it belongs to track BA — deleting the core half early destroys the capability rather than
relocating it — hence the restored bet-retro knowledge upsert and facilitator roster seeding. Three
knowledge routes (`merge`, `split`, `flag`) were deleted despite carrying `PLUGIN` verdicts, so BA
inherits them to rebuild rather than relocate. Ask git, not the filesystem, whether a
package is gone — a deleted directory usually survives holding untracked build output — and remove a
dissolution from every registry, not just the directory: root and base tsconfig, knip, the typecheck gate
list, vitest projects, dependency manifests, the governance data files, the lockfile.

Five things this and the deletion pass left worth rebuilding, each with the cheap version named: commit
the agent's work to its `agent/<sandbox>` branch before the sandbox is destroyed (the reachable half of
capture-back died with the unreachable bundle, so an agent that does not push loses its work); give the org-chart edges a consumer again or retire the page, since edges can be drawn today
and change nothing; inherit a late-added agent's harness and model from the commonest choice among its
teammates; restore the redetect throttle as a route-scoped guard on a route that spawns ten CLI probes;
and bring back a static check that a new data route wires authorization — none exists anywhere now, since
the lint rules keyed off a stamp that was rightly deleted.
