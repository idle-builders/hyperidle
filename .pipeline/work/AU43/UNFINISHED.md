# The delete pass did not finish its own list

> **Re-measured 2026-08-24 against `main` at `23c160242`, after AU44 merged.** AU44's batch 0 closed part
> of this. The scoped checker now reports **40 still declared in the package that convicted them**, not 64:
> 322 convicted symbol rows, 199 gone, 8 accepted survivors, 40 alive. Of the 40, nine are the deliberate
> KEEP restorations described below, eleven are the invite / login-session substrate, and **twenty have no
> explanation on file**: the twelve `redact.ts` token regexes in `framework/diagnostics`, `KernelEvent` and
> `StrategyEvent` in `framework/domain-model`, `AgentTerminationReason` / `FileWatcher` / `FileWatcherConfig`
> in `run-orchestration`, `scrubErrorMessage` and `classifySmtpRetriable` in `notifications`, and
> `PostBetRetroArgs` in `routine`.
>
> **A second gap opened underneath the first.** AU44 dissolved fifteen of the packages these verdicts are
> filed under, and the scoped checker resolves a verdict file to a directory by name — so it now skips
> **75 DELETE rows** as "no resolvable dir" instead of checking them, and says so only in a one-line
> footnote. Re-checked repo-wide by name, 62 of those are gone from production and 13 are still declared
> somewhere, most of them legitimately relocated (the design-token sets now live in `tools/repo-gates`, the
> conversation part kinds in `core-ui`). The checker needs a package-to-new-home mapping before it can be
> trusted as a gate again. The numbers below are the 2026-08-19 measurement, kept as the original record.

Found on 2026-08-19, after the pass had shipped, by running the pass's own accounting tool
(`destroy/tools/check-deletions.ts`) against merged `main`. It was never run at ship. It exits
non-zero while work remains, so it was built to gate the pass and then not used as one.

## The numbers, and why the tool's own number is wrong

The shipped tool reports **105 convicted symbols still present**. That number is inflated: it asks
"does this name appear anywhere in the repo", so a same-named symbol in another package counts as a
survivor — `list`, `exec`, `exists`, `Toast`, `Notification` and a stray `ts` are all matched that way.

Re-checked scoped to the package that convicted each symbol
(`destroy/tools/check-deletions-scoped.ts`), against 322 symbol-bearing DELETE rows:

| | count |
|---|---|
| gone from its own package | 248 |
| accepted survivors, recorded with a reason | 8 |
| **still declared in the package that convicted it** | **64** |

Of those 64, **34 are still on the package's public surface** and 30 survive only as package-internal
code. The internal 30 partly satisfy their conviction — a row convicted as dead *export* surface is
answered by un-exporting — but each still needs its row re-read, because some were convicted as code
to remove outright, not merely to unexport.

## The 34 still-public survivors, grouped by what explains them

**Ten are explained and correct — the pass restored them deliberately.** `listOrgEdges`,
`deleteOrgEdge`, `upsertOrgEdge`, `UpsertOrgEdgeInput`, `ActiveTeamMembersWithTeamName` came back with
the org chart and the founder-edge writer; `listDismissedHints`, `dismissHint`, `DismissedHint` came
back with hints; `listConfiguration`, `writeConfigurationOverride` came back with the filesystems
settings page. These are the four routes deleted while marked KEEP. They belong on the accepted-survivor
list and were never added to it.

**Eleven are the auth substrate, and the A7 ruling changed their standing.** `createInvite`,
`claimInvite`, `createLoginSession`, `validateBearerToken`, `revokeLoginSession`, `InviteRole`,
`INVITE_ROLES`, `LOGIN_SESSION_TTL_MS`, `INVITE_CODE_TTL_MS`, `NewLoginSession`, `NewInviteCode`.
The shared backend stays and access comes through an OIDC provider, not invites — so the invite half is
still convicted and the session half is the substrate a shared backend needs. Splitting that is the
auth work package's call, not a mechanical deletion.

**Thirteen have no explanation on file and need a verdict.** `NewConfigurationOverrideRow`,
`NewProposedCall`, `NewTailoredGrant`, `NotificationChannel`, `Notification`, `NotificationAdapter`,
`isTriggerEventType`, `AgentBehaviorConfigErrorResponse`, `deriveComposerPills`,
`SYSTEM_PROMPT_TEMPLATE_FILES`, `AdapterDeps`, `HarnessOptionControlKind`, `PostBetRetroArgs`.
Each still has at least one referencing file, so none is a bare orphan — but a declaration plus a barrel
re-export also counts as two, and that is exactly the shape a missed deletion leaves behind. Read the
row before acting on any of them.

## What this changes

AU43's acceptance criterion — every DELETE row removed or carrying a written reason — is not met, and
was reported as met. The gap is an accounting failure, not a behaviour failure: nothing here is a
regression, and the shipped product is fine. But the list is not closed, and the next pass must not
assume it is.

The lesson underneath it is the same one the pass already recorded twice in a different form: a gate
that is built and not run is not a gate. This one printed a non-zero exit and nobody read it.
