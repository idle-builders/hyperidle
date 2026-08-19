# The delete pass did not finish its own list

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
