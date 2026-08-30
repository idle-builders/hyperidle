# AU43 — Delete everything the audit convicted

## Work package

**Outcome.** Every method, export, door, table and column the destroyer audit marked `DELETE` is gone
from the repository, with the tests that only existed to reach it. Behaviour is unchanged, because none
of it was reachable.

**Why this matters.** 423 convicted rows against 1,713 audited — code every reader must understand and
every rename drags along. It also misleads: several convictions are features that *look* implemented (a
settings screen that saves, a table that gets written) and do nothing. `work/AU20/destroy/FULL-AUDIT.md`
holds one row per symbol with its verdict and traced evidence.

**Complexity.** L · **Engineering tier.** mvp · **Depends on.** None. **Constraints:**
- **Rows marked `FINISH` or `PLUGIN` must not be touched.** Track BA owns that code and cleans it up as
  it finishes each feature; removing it here deletes a capability instead of relocating it.
- Table and column drops are in scope, migrations included. Simplifying what survives is not, nor is any
  behaviour change.
- Work in small batches, each ending committed or reverted. Within a batch make every edit first and
  typecheck once — re-running the full check after each micro-edit stalled the previous attempt.
- A row may survive only with a recorded reason. Silent scope reduction is the failure mode this work
  package is most exposed to, given its size.

**Acceptance.** Every `DELETE` row removed or carrying a written reason, on a survivor list short enough
for the founder to accept (**not met — see below**); no `FINISH`/`PLUGIN` row modified; no orphan import,
route registration, scheduled job or reach-only test left behind; dropped tables and columns migrated,
with a from-scratch create and an upgrade both clean; `npm run verify` and the full suite green.

---

# As built

Shipped. 217 convicted symbols removed, 52 entry doors (216 → 164), 5 tables (44 → 39). Roughly 34,000
lines across 94 commits, as 12 batches plus a doors stage and a tables stage, each in its own worktree
and merged one at a time so every merge was a green checkpoint.

Eight defects surfaced that the audit had not listed, all fixed in the pass — removing code forces every
remaining dependency to prove itself. The two worth remembering: a pool method convicted against a dead
HTTP door was still declared as contract by an interface, breaking both production servers; and the org
chart, filesystems settings page and hints were all deleted while marked KEEP.

Two things the execution taught, in order of what they cost. **`check` and `lint` prove compilation,
not behaviour** — green at all 19 checkpoints while the service-integration lane was red throughout and
the product was broken in four places. And **an escape hatch beats a target**: nine times an agent told
"if a test asserts something that should still work, stop and report rather than delete" was right.

## Survivors and one posture change

Eight rows survived structurally: obliged by an enforced architecture boundary, or called by code the
feature track owns. Three coverage gaps were opened and not filled — review participant routing and the
session-review unsubscribe path lost their integration coverage with the risk-tier gate they were
bundled with; the knowledge flag, merge and split tests left with routes that move to a plugin.

`POST /api/harnesses/redetect` now has no throttle. It spawns about ten CLI probes with fifteen-second
timeouts and carried a dedicated limiter for that reason; the limiter died with the global rate limiter,
convicted fairly (pre-auth, principal-blind, and behind a proxy it collapsed a team into one bucket). If
redetect becomes a problem, that is what earns a narrow, route-scoped guard back.

## The list is not closed — resume here

The pass's own accounting tool (`destroy/tools/check-deletions.ts`) was built to gate this work, exits
non-zero while work remains, and was never run at ship. Its repo-wide number is also wrong: it asks
"does this name appear anywhere", so same-named symbols in other packages (`list`, `exec`, `exists`,
`Toast`, `Notification`) count as survivors. Use `destroy/tools/check-deletions-scoped.ts` instead.

**Re-measured 2026-08-24 against `main` at `23c160242`, after AU44 merged.** Of 322 convicted symbol
rows: 199 gone, 8 accepted, **40 still declared in the package that convicted them**, down from 64 —
AU44's batch 0 closed part of it. Of those 40:

- **Nine** are KEEP routes this pass restored deliberately — the org chart edge writers, hints, and the
  filesystems configuration readers. They belong on the accepted-survivor list and were never added.
- **Eleven** are the invite / login-session substrate: `createInvite`, `claimInvite`,
  `createLoginSession`, `validateBearerToken`, `revokeLoginSession`, `InviteRole`, `INVITE_ROLES`,
  `LOGIN_SESSION_TTL_MS`, `INVITE_CODE_TTL_MS`, `NewLoginSession`, `NewInviteCode`. Under the A7 ruling
  the shared backend stays and access comes through an OIDC provider, so the invite half is still
  convicted while the session half is substrate a shared backend needs. Splitting that is the auth work
  package's call, not a mechanical deletion.
- **Twenty have no explanation on file** and each needs its row re-read before action: the twelve
  `redact.ts` token regexes in `framework/diagnostics`; `KernelEvent` and `StrategyEvent` in
  `framework/domain-model`; `AgentTerminationReason`, `FileWatcher` and `FileWatcherConfig` in
  `run-orchestration`; `scrubErrorMessage` and `classifySmtpRetriable` in `notifications`;
  `PostBetRetroArgs` in `routine`.

**A second gap opened underneath the first.** AU44 dissolved fifteen of the packages these verdicts are
filed under, and the scoped checker resolves a verdict file to a directory by name — so it now skips
**75 DELETE rows** as "no resolvable dir" rather than checking them, saying so only in a one-line
footnote. Re-checked repo-wide by name, 62 are gone from production and 13 are still declared somewhere,
most legitimately relocated (design-token sets now in `tools/repo-gates`, conversation part kinds in
`core-ui`). **The checker needs a package-to-new-home mapping before it can be a gate again.**

Nothing here is a regression — the shipped product is fine; it is an accounting failure. The lesson is
one the pass recorded twice in other forms: a gate that is built and not run is not a gate.

## Where the evidence lives

The full audit — 1,681 verdict rows, per-package and revised verdicts, batch assignments, census and
tooling — was working material, committed during the pass and removed at ship. It survives on branch
`pipeline/AU44` under `.pipeline/work/AU20/destroy/` and `.pipeline/work/AU43/`, and at the tag
`au20-audit-evidence`; the branch is the copy to rely on.
