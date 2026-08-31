# AU30 — Every table has an owner, and only its owner touches it

## What we need

As a maintainer, I want every table in the schema to name exactly one service that may read and
write it, and every production access to go through that service — so "who is allowed to change
this data" is answerable from the schema instead of from a grep.

An unowned table is not a style problem. It is a table where any package may invent its own
invariants and no package is responsible for keeping them. Six of the forty-five tables had no
owner: `sessions`, `propagationLog`, `taskDispatchAttempts`, `userSkills`, `agentRunConfig` and
`teamRunConfigDefaults`. The ownership model was 87% true, and a partly-true rule is worse than
none because reviewers stop checking the part they assume holds. It was also the last structural
block in the governance model: the table rules aggregate across all six tables, so not one could
be promoted until every one was owned. That all-or-nothing shape is why this is a single work
package rather than six small ones.

Done means: `governance/table-owners.json` has an empty `unowned` block; every production read
and write reaches its table through the owning service; a service that needs data it does not own
asks the owner, with no cross-owned-table query in production; the table and table-symbol import
rules fail the build in both directions with no baseline entry behind them; every group key this
work package clears is deleted from `governance/rule-severity.json` in the same pull request that
clears its last site; and `npm run verify` is green with relocated accessors proven unchanged.

The constraints were absolute. Zero exceptions in the ownership rule — no allowlist, no
foreign-import ceiling, no named carve-out. Exclusivity covers reads as well as writes. No
production export may be added that only tests consume. Out of scope: `framework/db`'s own table
writes (AU29), the development-world companion violations (AU32), and reducing any service's
exposed method surface (AU20).

## How it works

Five founder rulings at the concept gate settled the ownership questions, and together they mean
this work package creates no new package and no new service. It is placement throughout, plus one
deletion.

- **`sessions` is owned by the existing `run-orchestration` service.** `sessions` is the product
  primitive Session, distinct from `loginSessions`, `agentSessionRequests` and the in-memory
  `sessionRunRegistry`. `run-orchestration` already consumes the row for its own decisions —
  capacity gating, boot recovery, live-runtime terminal writes. Naming it owner legalises 74 sites
  with zero code change; any other owner leaves 30 more, each needing an injected port.
- **`filesystemCaptures` is corrected to `filesystem-mounting`** and **`serverCredentials` to
  `core-api/credentials`.** Both registry entries named packages that never touch the table. For
  `serverCredentials` the correction was forced: routing through the registered owner would be
  cross-layer, where DI is forbidden, making the access criteria unsatisfiable any other way.
- **`user_skills` is deleted, not owned.** The table is `agent_skills` mechanically renamed and
  never re-scoped; it holds a per-agent-per-skill autonomy score sheet whose feature was killed by
  product decision long ago; no production insert exists anywhere, so a production database has it
  permanently empty. Deleting it satisfies the ownership criterion by removing the table and clears
  nine production sites without adding an accessor. This deliberately executed the charter of the
  registered-but-never-started AL9 inside this package. Whether skills should become knowledge
  items stays open and is untouched — both plausible destinations lead away from this table.
- `propagationLog` goes to `policy`, `taskDispatchAttempts` to `work`, and `agentRunConfig` and
  `teamRunConfigDefaults` to `agent-run-config` as registry-only fills.

Every production query touching the six tables was read: not one joins across an ownership
boundary, so the no-cross-query criterion was satisfied by owner-surface design rather than query
surgery. The one genuine cross-ownership transition that moved is the no-live-runtime terminal
compare-and-swap and its `session_ended` emit, which relocates into the owner with its rowcount
invariant intact.

The work landed as one sequential builder over eight commits, ordered so the tree passes at every
boundary. Registry entry and accessor relocation are inseparable for `propagationLog` and
`sessions` — splitting them flips layer-world sites to hard error. The promotion commit is a
strict join point: nine keys deleted, then a tenth once the last blocker cleared. Production
violations went 191 → 90, table crossings to zero, development violations zero.

The last blocker was `bet.schema.ts` importing a table-derived zod schema for a table owned by
`work`. The planned fix — re-exporting it from the owner — is a hard build error, because
owner-ship *is* the laundering vector the rule exists to catch. Instead core-api hand-writes the
bet list-item wire shape and drops the table import, consistent with its already hand-written
sibling response schema. That surfaced a latent bug: the table-derived schema was wrong, not
merely misplaced — `bets.atRisk` is an integer that the route normalises to a boolean before
responding, so fed the row the endpoint actually emits the schema rejects it. It survived because
the only test validating it had never inserted a bet. Drift is now pinned by a compile-time
conditional type against the `Bet` row type, plus an integration case with a real bet row.

## How we work on this

The work is complete and green: two review rounds, the second returning DONE with no blocking
findings, and a pull request open against `main` awaiting human merge.

Residual and deferred:

- **Standing instruction from Ruling 5.** One net-new `layer → service (other layer) [import]`
  warning was accepted from the `tool-handlers` sessions wiring. When this branch rebases onto
  AU31, that wiring must be *resolved*, not carried — and resolved by copying the pattern AU31
  introduces, not by inventing a second one. Do not build the zero-crossing alternative of
  constructing the tool context inside the owner here.
- **Filed, not assigned.** `schema.ts`'s `delegationAllowed` lore claims a behaviour nothing reads
  (same defect class as the deleted skills path, different file); an AU15 routine-scheduler test
  cross-references the suite deleted here; `session-stream-hub` answers an existence question via
  an eighteen-column select.
- `satisfies z.ZodType<...>` does not work in zod 4 (TS1360, both spellings) — use a
  conditional-type pin.
