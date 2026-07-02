# AO3 Architecture Critique — APPROVED (proceed to build)

All load-bearing citations verified against real origin/main code. No CRITICAL. Spine reuse genuine (router/grant/Outcome unchanged; only additive edits to `reviews.ts` GET select + a `land_change` branch). Zero migrations confirmed (`proposed_calls.originSessionId` exists `schema.ts:1092`). At-most-once rides existing CAS. Capture stores a git bundle + commitSha; `git show <sha>` = the authored diff. Complexity M honest.

## WARNING — fold into Task 4 (handler resolution) BEFORE building
The **loader** resolves the capture exactly (`filesystem_captures.sessionId == proposedCall.originSessionId AND writeback='git'`), but the planned **handler** (session 2) resolves by a *different* path — "most-recent git capture for `ctx.taskId` where `session_id != ctx.sessionId`". Under the single-loop model these coincide today (safe), but the two sites use non-identical logic for the same fact → the instant the single-loop invariant relaxes, the human reviews diff A (loader) while the handler pushes diff B (task-recency). High blast radius — exactly what this gate guards.

**Required fix (pure read, no spine edit):** in the `land_change` handler, re-read the just-consumed grant —
`tailoredGrants WHERE taskScope=ctx.taskId AND agentScope=ctx.agentId AND approvedToolId='land_change' AND consumed=true ORDER BY consumedAt DESC LIMIT 1` → `proposedCallId` → `proposedCalls.originSessionId` → resolve the capture by **that** sessionId. Loader and handler then resolve the identical row by the identical key; the "reviewed-A/pushed-B" failure mode becomes structurally impossible. The grant is already `consumed=true` with its `proposedCallId` before the handler runs (`tool-registry.ts:639-642`). Drop the task-recency query.

## NICE-TO-HAVE (fold where cheap)
- **@lore on the handler:** clone-adapter captures bundle `refs/heads/<resourceRef.branch>` (`git-clone-adapter.ts:103`), so for a clone of `main` the land target is `main` directly (not an `agent/*` branch — that only holds for the worktree adapter). Document so no one is surprised the land target is the source branch.
- **Assert single head** in `bundleListHeads` consumers: each writer bundles exactly one ref, so >1 head = malformed/foreign bundle → error explicitly, don't silently `[0]`.
- **CodeDiffPayload type:** if cheap, land the shared type in `@hyperidle/shared` to forestall drift between `review-artifact.ts` and the loader; structural server-side mirror checked by `tsc` is acceptable for v1.
- **Citation hygiene:** real paths are `packages/server/src/filesystem/*` etc.

## Verified substrate (for builder reference)
- `filesystem_captures`: `schema.ts:951`, mig `0041`; cols capturePath(bundle), commitSha(nullable), sessionId, filesystemId, writeback. Writer `mounter-registry.ts:177` in `captureBack` (only when `captured===true` → git rows always carry a real bundle+sha).
- Worktree adapter bundles `refs/heads/agent/<basename(sandboxPath)>` (`git-worktree-adapter.ts:92,147`); clone adapter bundles `refs/heads/<branch>` (`git-clone-adapter.ts:103`). Row stores neither → read ref via `git bundle list-heads`.
- Router/CAS/Outcome: `tool-registry.ts:612-678` (capture→CAS-consume 626-637→recordOutcome 643). `land_change` w/ `reversibility:"irreversible"` rides identically to `commitFileTool` (`commit-file.ts:71-80`, registered `:387`).
- `CodeDiffPayload`: `review-artifact.ts:162-181` (`files[].hunks[].lines`). reviews.ts GET select `109-121` lacks `originSessionId` — add it + a `toolId==="land_change"` branch (additive, fall-through preserves current behavior).
- GitRunner: `push`/`remoteAdd`/`clone`/`bundle` exist `git-export-runner.ts:44/390/436/461`; add `cloneBundle`/`show`/`bundleListHeads`.
- AC5 legit pusher: `git-export.ts:478` `runner.push("origin", cfg.branch)`.
