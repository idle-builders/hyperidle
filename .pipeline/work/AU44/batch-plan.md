# AU44 — how the merge and simplify pass runs

399 rows (72 merge, 327 simplify), 21 framework packages carrying a dissolve verdict, plus 64 rows
the delete pass left open. This is how that is cut into batches, and what each batch has to prove
before it merges.

## The shape of the work

Batches are cut by **area**, not by verdict type. A package dissolve, the merges inside the package it
lands in, and the simplify rows on the surviving methods are all the same edit to the same files; doing
them as three separate passes would touch the same code three times and review it three times.

Each batch runs in its own worktree off the consolidation branch, proves itself, gets reviewed, and
merges. The consolidation branch is green at every merge — that is the checkpoint.

## The harness disagreement, settled

The AU44 plan flagged that two audits disagreed about whether `harness-capability` and
`harness-protocol` are one package. They do disagree, and the evidence settles it against merging.

`harness-capability`'s own audit says merge them, "no hesitation" — thirteen type declarations are not a
package. But both other audits say keep them apart, and both give the same reason: `core-ui` imports
`harness-capability` in seven files and must never see `SessionConfig`, the worker protocol, or the
EventBus types that live next door. That is an audience boundary, not tidiness.

The tempting counter is that `harness-protocol` is itself shedding four of its six modules — worker
protocol and event normalisation both leave for `harness-registry` — so the thing core-ui must not see
is largely leaving anyway. It does not survive contact: the residue that stays shared is the adapter
contract, and the adapter contract is exactly where `SessionConfig` lives.

**Settled: three packages become two.** `tool-protocol` dies into `harness-protocol` (identical
audience, zero UI consumers). `harness-capability` stays as the UI-facing vocabulary.
`harness-protocol` sheds four modules to their single owners and keeps the adapter contract.
The real leak both audits name — `HarnessCapabilities` duplicating `HarnessRuntimeCapabilities`
field-by-field — is fixed by declaring one as an extension of the other, which needs no merge at all.

## Batches

Sized so no batch is a token gesture and none is too big to review in one sitting. Row counts are
merge + simplify from the audit.

**0 — Close the delete list.** 64 rows carried from AU43. Ten are the KEEP-marked routes the delete
pass restored on purpose — they need a line on the survivor list, not code. Eleven are the invite and
login-session substrate: hand to the auth work package, do not touch. Thirteen have no explanation on
file and need their rows re-read. Thirty survive only as package-internal code — a row convicted as dead
*export* surface is answered by unexporting, but each row has to be read to know which kind it was.
Goes first for the same reason AU43 went before AU44: deleting shrinks what the later batches carry.

**1 — Org, identity and the teams table.** ~22 rows. `org` (10 merges, including folding `teamMembers`
into `teams` — this batch owns a migration), `users`, `factory-defaults` dissolving into core-api, and
the two duplicate team doors. The `getTeamMembers` / `listTeamMembers` overload families collapse into
`getTeam` / `listTeams` once the tables are one.

**2 — Filesystems, mounting, connections, credentials, settings.** ~31 rows. Dissolves `filesystem-contract`
(a 160-line type file with zero functions) into `filesystems`, and `credential-access` into
`credentials`. Folds the probe/persist trio into one service method, widens `listConnections` to absorb
its duplicate reader. `settings` rides here whole: its one merge row folds credential migration into
`credentials`, and its two simplify rows drop the dead `observability` member from the server config
read and write shapes.

**3 — Work, routine and session requests.** ~41 rows. Dissolves `cron` into `routine`. Collapses the two
session-start/task-run resolver families into one discriminated resolver, and the two guarded-field-set
mechanics on bets into one patch path.

**4 — Review, knowledge, conversation, notifications.** ~50 rows. Moves review-item creation into
`knowledge` where its only consumer is, killing a port and a currying factory. Folds the two direct-
message dedupe paths into one. Two duplicate doors fold here. **Care: `knowledge` and `routine` carry
PLUGIN rows owned by the finish-and-plugin track — those must not be touched.**

**5 — The harness seam.** ~38 rows. `tool-protocol` dies into `harness-protocol`; `harness-protocol`
sheds four modules to `harness-registry` and `run-orchestration`; `harness-capability` stays and loses
its duplicated capability fields. `tool-handlers` simplifies alongside. **`harness-registry` is not only
a destination here — it carries ten rows of its own**: the four-copy CLI probe collapse in
`discoverLocalHarnesses`, the capability-catalog and return-enforcement factories, the adapter/bridge/
sandbox shrinks, and two merges that derive the model context window from the catalog and fold the MCP
bridge URL into `open`.

**6 — Host and run substrate.** ~69 rows. The homeless-helper packages `host-process`,
`query-escaping` and `toon-codec` die, split to their real owners. `diagnostics` keeps a two-file core
and sheds the rest. `run-orchestration`, `policy`, `fw-db`, `event-bus` and `agent-run-config` simplify.
`api-contract` is gutted to the one seam it really is — the core-api to agent-orchestration contract —
which belongs here rather than with the type spine: it has zero UI consumers and it writes into nothing
a later batch reshapes.

**7 — The UI substrate.** ~66 rows. `design-system` and `conversation-parts` dissolve into `core-ui`,
with `block-derivation` folding in on the way. `presentation-format` dies here too, not in batch 6: its
time module's stated target is `design-system`, and landing it there first would move it twice. The
largest visible-surface risk in the pass.

**8 — The shared type spine.** ~82 rows. `domain-model` splits — 55% of its surface moves to its real
owners, a slimmed shared core stays — and `work-intent-port` folds into it. `http-middleware` dies here
rather than in batch 6, because its wire-contract slice targets `domain-model` and must land after the
split settles, not before it.

Last on purpose: 456 files import `domain-model`, and going last means every symbol moves once, into the
home the earlier batches settled. **Two of the audit's stated targets are stale by the time this batch
runs** and must be retargeted, not followed literally: the display-helper and `segmentMentions` slice is
written as going to `design-system`, and the block types slice to `block-derivation` — batch 7 dissolved
both. Both go to `core-ui`.

This batch is past what one reviewer covers in a sitting. Review it as two scopes — the split itself, and
everything that lands downstream of it — rather than shrinking the split, which would defeat moving once.

## The door rows

Seven door rows carry a merge or simplify verdict and are easy to lose because no package owns them.
Each belongs to exactly one batch: the two duplicate team doors and the `POST /api/threads/scaffold`
fold to batch 1 and batch 4 respectively; `GET /api/knowledge/search` folding into `GET /api/search`
goes to batch 4; the session-read response shrink goes to batch 5; the agent-layer reap tick folding
into the wake drain goes to batch 6 with `run-orchestration`. The retention reaper's simplify row goes
to **batch 0**, not batch 6 — what it drops is the `login_sessions` and `invite_codes` sweeps, which are
the auth substrate, so it moves or waits with that decision rather than ahead of it.

## What each batch proves before it merges

The delete pass held `check` and `lint` green through nineteen checkpoints while the integration lane
was red and the product was broken in four places. Compilation gates cannot tell you a route still
answers. So, every batch, no exceptions:

1. `npm run check` and `npm run lint` — exit codes read directly, never through a pipe. A gate piped to
   `tail` returns the pipe's status, which is how the delete pass reported green while failing.
2. `npm run test:full` — the whole fast suite, not the affected slice. Merges move symbols across
   package lines, which is exactly what change-detection misses.
3. `npm run test:integration:service` — **every batch**, not at the end.
4. `npm run knip` and `npm run knip:production`. These are in `verify` but not in the compile-and-test
   gates, so a batch that deletes a package leaves a workspace entry pointing at nothing and every gate
   still passes. Two batches did exactly that.
5. **If the batch adds or removes a package, regenerate `package-lock.json` and commit it.** The
   standing rule against committing the lockfile is right when it churns incidentally and wrong here:
   CI runs `npm ci`, which hard-fails when the manifests and the lockfile disagree, and every local gate
   runs against the already-installed `node_modules` and cannot see it. Regenerate with Node 24 — the
   default shell node is v22 and writes a lockfile full of phantom errors.
6. A reviewer agent on the batch diff, briefed with the rows the batch claimed and asked to find what
   moved that shouldn't have.

**Read the failed FILE count, not just the failed test count.** A file that fails to load runs zero
tests, so a broken build reports the same "2 failures" as the healthy baseline. One batch shipped
thirteen non-loading files behind a test count that looked clean. The baseline on this branch is
2 files / 2 tests.

Batch-specific, on top:

- **Batch 1** — migration proven both ways: fresh database migrates clean, and an existing database
  migrates without loss. Team and org surfaces exercised in the running app.
- **Batches 2, 3, 4 and 7** — the running app, walked surface by surface. Batch 7 is the one where
  reading the source is not a check; the painted output is. Batches 2 and 3 are on the list because they
  change runtime behaviour the service integration lane does not necessarily exercise: batch 3 folds a
  cron parser into the routine scheduler, so the next-run time it computes needs asserting directly, and
  batch 2 folds a probe-and-persist trio into one method behind the filesystems and connections pages.
- **Batch 5** — the harness lane (`npm run test:integration:harness`), local, since it has no CI job.
- **Batch 8** — full `npm run verify`, because a type-spine change is exactly what breaks a build that
  every other gate passes.

At the end of the pass, on the consolidation branch: `npm run verify`, `npm run test:all`, and
`npm run test:e2e:full` — the full e2e script, not `npm run test:e2e`, which runs an affected slice and
exits 0 having run nothing. Compare the e2e result against `main`'s known-red baseline (19 failures)
rather than reading red as a regression.

## The rule that broke both servers last time

A symbol convicted against its call sites can still be **obliged by an interface that declares it**.
Removing one such method took down both production servers in the delete pass. Before folding or
unexporting anything, check what declares it, not only what calls it.

## Where a row is allowed to survive

A row survives only with a written reason, recorded as it happens rather than reconstructed at the end.
Two reasons are legitimate: an enforced governance boundary forbids the fold, or the code belongs to the
finish-and-plugin track. "Seemed risky" is not one. The survivor list is read and accepted by the
founder, so it has to stay short enough to read.
