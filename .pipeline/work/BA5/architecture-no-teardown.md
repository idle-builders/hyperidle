# BA5 — No teardown · Architecture

The ruling of 2026-09-16 (`plan.md` §Rulings "No teardown", §"When a session ends", gate G2b) applied to the
code as built. It **revises** `architecture.md` §5.2 (kept copy: location and lifetime), §5.4 (recognition),
§5.5 (Teardown), the placement path, and test T9 — those sections are now wrong. It absorbs BA12.

Every `file:line` below was read on this branch (`feature/pipeline-ba5-1fa5e1`, HEAD `12b9fb19f`) today.
Claims marked UNVERIFIED were not read. Re-check a line before building on it.

---

## 1. What goes, and what may stay

Nothing is removed when a session ends. Three deletions and one keep:

| Goes | Where (verified) | Why |
|---|---|---|
| `unmountFilesystems` and its doc comment | `run-orchestration/src/provisioner.ts:737-765` | nothing is unmounted any more |
| its three call sites | `provisioner.ts:2027-2030` (crash), `:2079-2082` (not-returned), `:2106-2109` (normal end) | same |
| session-end `workspace.destroy` | `provisioner.ts:2093` (not-returned), `:2118-2131` (normal end, incl. the `sessionAwaitsVerdict` guard and the BA2 lore block above it) | the workspace is the agent's, not the session's |
| the workspace delete that actually matters | `transition-run.ts:239-256` — the `sessionAwaitsVerdict` early return and `fs.promises.rm(context.sandboxPath, …)` | its own lore says this, not `workspace.destroy`, is the delete that removes the tree |
| `MountAdapter.unmount` and all four implementations | `mounter.ts:91`, `:102-104`, `:146-149`, `:322-328`, `:346-348`; the port field `filesystem-provisioning.ts:48` | replaced by §4 |
| the admission-failure unmount loop | `provisioner.ts:1279-1284` | a worktree at that moment may already hold earlier work of the same task (§3). Never remove it on a failure |
| `recognizeAdoptedWorktree` | `mounter.ts:206-238` | replaced by a plain "does the task's worktree already exist" check (§3) |
| `MountedFilesystem.adopted` | `mounter.ts:84`, set at `:136`, `:266`, `:314`; its only reader is `provisioner.ts:1281`, which goes | scan first; delete if `npm run check`/knip agree |

**Stays: exactly one `workspace.destroy`** — `provisioner.ts:1285-1287`, on an admission failure of a
**non-resume** session. That directory was spawned seconds earlier (`provisioner.ts:1205-1207`) and, after §3,
holds nothing durable: the kept copy, the worktree and the person's folder all live outside it. Keeping it
would leak one empty directory per failed admission.

**Also stays: the workspace reaper** (`runtime-reapers.ts:21,47-100`, enabled by
`applications/desktop/src/create-server.ts:297-299`), which reclaims a terminal session's directory 24 h after
it ended. After §3 that costs nothing the ruling protects; §7 argues one four-line change to it.

---

## 2. Where each place lives

| Filesystem | Where the real files are | Lives until |
|---|---|---|
| a person's folder | their own folder; `<workspace>/<name>` is a symlink to it (`mounter.ts:107-146`) | they delete it themselves — never HyperIdle |
| git, local repo | their own repository — the kept copy *is* their repo (`mounter.ts:249-250`) | same |
| git, remote | `<keptCopiesRoot>/<filesystemId>`, cloned once, fetched after (`mounter.ts:287-296`) | `DELETE /api/filesystems/:id` → `forgetKeptCopy` (`routes/filesystems.ts:346`, `mounter.ts:357-364`) |
| git worktree | **`<keptCopiesRoot>/worktrees/<taskKey>/<folderName>`** (new, §3); `<workspace>/<folderName>` is a symlink to it | the task is done (§4), or a person deletes it |
| Google Drive (phase 2) | `<keptCopiesRoot>/<filesystemId>`, same shape as a remote git kept copy — see `architecture-phase2.md` | `DELETE /api/filesystems/:id` |

So the plan's sentence "**every place lives outside the session's directory** — the session only links to it"
becomes literally true for every kind: **no plan reword is needed.** `keptCopiesRoot` already reaches the
mounter from both server applications (`boot.ts:332-335`, `mounter.ts:51-54`), so the worktrees root needs
**no new configuration** — `worktreesRoot = path.join(keptCopiesRoot, "worktrees")`, a fixed name that a UUID
filesystem id can never collide with.

---

## 3. The worktree's home: option (b), a long-lived directory keyed by task

**Decision: (b).** The worktree leaves the session directory and is symlinked back into it. Four reasons,
each checked against the code:

1. **A new session for the same task must find the work.** A session that is not a resume gets a brand-new
   directory (`provisioner.ts:1205-1207`: `workspace.adopt` only when `params.resume?.sandboxPath` is set).
   Under (a) it would find nothing there and cut a second worktree on a second branch. G2b asks for the
   opposite.
2. **Under (a) the reaper would undo the ruling.** It deletes a terminal session's directory after 24 h
   (`runtime-reapers.ts:21,84-90`) and it cannot know whether the task is done — it lives in orchestration,
   which never reads core. So (a) either loses the worktree a day later or forces us to stop reaping
   terminal directories at all.
3. **The shape is already shipped.** A folder filesystem is exactly this — a symlink in the workspace
   pointing at a real directory elsewhere, declared to codex through `trustedPath` (`mounter.ts:115-136`,
   `provisioner.ts:1690`, and the trust block's own note at `cli-mcp-config.ts:152-163`, which names a
   symlinked-in folder as the case it exists for). (b) gives git the shape folders already have.
4. **cursor-agent is untouched.** The harness cwd is the session workspace, and a resume adopts the same path
   (`provisioner.ts:1205-1207`). Nothing here changes that string.

**Keying and branch.** `taskKey = "task-" + params.taskId` when the session has a task
(`ProvisionSessionParams.taskId: string | null`, `provisioner.ts:971`), else `"session-" + sessionId` — a
taskless session's worktree is its own and nothing removes it automatically; say so, do not build for it. The
branch follows the key: `hyperidle/<taskId>`, or `hyperidle/<sessionId>` (today always the latter,
`mounter.ts:303`). It is cut once, with the worktree; later sessions of the task keep it. The instructions
render the branch from the record (`filesystem-instructions.ts`), so their wording holds.

**`GitRepositoryAdapter.mount` (replaces `mounter.ts:240-328`):**

```
home = <worktreesRoot>/<taskKey>/<folderName>
link = <workspace>/<folderName>
reused = fs.existsSync(home)
if !reused:
    kept copy: local → the person's repo; remote → clone once / fetch (unchanged, mounter.ts:276-297)
    runner.worktreePrune(); runner.worktreeAdd(home, branch, base)     (unchanged verbs)
else:
    branch = git -C home rev-parse --abbrev-ref HEAD
if link exists:  must be a symlink whose realpath is home, else { ok:false, "folder '<name>' already exists …" }
else:            fs.symlinkSync(home, link)
→ { ok:true, mounted: { folder: link, trustedPaths: [keptCopy, home], git:{ keptCopy, branch, base, remote }, agentEnv } }
```

This answers both adoption cases with one question — *does the task's worktree exist?* — and deletes the
gitdir-pointer forensics of `recognizeAdoptedWorktree` (`mounter.ts:206-238`). The link check is the folder
adapter's existing realpath check (`mounter.ts:115-124`).

**Two contract changes.** `MountInput` (`mounter.ts:58-66`) gains `taskId: string | null`, threaded from
`provisioner.ts:1270-1276` through `mountFilesystemsForAgent` (`filesystem-provisioning.ts:191-235`).
`MountedFilesystem.trustedPath` (`mounter.ts:73`) becomes `trustedPaths: readonly string[]` — a git mount now
has two real paths that matter, the kept copy (where the worktree's git directory lives) and the worktree
itself, which is outside the sandbox. `provisioner.ts:1690` becomes a `flatMap`. Folder and Drive return one
element.

**No `keptCopiesRoot`, no git.** A local repo mounts without one today; after this change every git
filesystem needs it and otherwise fails with the existing reason "this server has no folder to keep repository
copies in" (`mounter.ts:285`). That widens the known limit of `architecture.md` §17.7 (a Postgres
remote-server has no data folder) from remote repositories to all of them — accepted: the documented shared
backend runs no agents, and both real applications pass the root. Tests that build a mounter without one
(`core-api/src/__tests__/filesystem-hold-task-stays-ready.integration.test.ts:303`,
`git-repository-adapter.integration.test.ts:143,172`) pass a temporary directory instead.

**Two sessions of one task share one worktree** — the ruling's own words: a worktree is only an isolation
mechanism, and the unit it isolates is the task.

---

## 4. Removing the worktree when the task is done

**Trigger: core observes the task reaching `done` and asks orchestration**, over the door that already
exists. Orchestration cannot see this itself — a task's state is core's, an agent marks it through
`edit_task` → `coreApi.updateTaskById` (`tool-handlers/src/tool-definitions.ts:559-606`), and a session
ending is not a task finishing. Subscribing to a core event from inside orchestration would be core pushing
state into a blind executor, which the standing ruling forbids.

- **Core side, new:** `layers/core-api/src/services/task-done-worktree-reactions.ts`, registered in
  `service-bootstrap.ts` beside the five reaction services already there (`:262,271,285,297,312,324`; the
  `agentOrchestration` port is in scope at `:257`). It subscribes to `task_state_changed`
  (`events.ts:112-118`, emitted post-commit at `core-api/work/src/task-state-machine.ts:384`), acts on
  `toState === "done"`, calls the door, and logs and swallows any failure.
- **The door, one new verb:** `AgentOrchestrationFilesystemsPort` (`framework/api-contract/src/agent-orchestration-port.ts:239-256`)
  gains `releaseForTask(taskId: string): Promise<void>`; the route goes beside its two siblings in
  `layers/agent-orchestration/src/routes/agent-orchestration-intake.ts:293-320`; the in-process spelling
  beside `stopForTasks` in `core-api/src/services/agent-orchestration-port-composition.ts:251-258`.
  `createAgentOrchestrationIntakeRoutes(db)` (`agent-orchestration-intake.ts:125`, mounted at `app.ts:79`)
  gains the two values the release needs — `keptCopiesRoot` and the git runner factory — both already held by
  `app.ts` for `POST /:id/check` and for `forgetKeptCopy` (`routes/filesystems.ts:52,346`).
- **Orchestration side:** `RegistryFilesystemMounter.releaseForTask(taskId)` replaces the deleted `unmount`
  (`mounter.ts:346-348`). For each child of `<worktreesRoot>/task-<taskId>`: read its `.git` file, take the
  path before `/worktrees/` as the repository, run `worktreeRemove(child, {force:true})`
  (`git-runner.ts:106,413`, `mounter-ports.ts:39` — that verb gets its production caller back), then `rm -rf`
  the task directory. **The branch is never touched.** Every step is wrapped: a missing directory, a deleted
  kept copy or a failing git all end as a log line, and `worktreePrune()` before every `worktreeAdd`
  (`mounter.ts:302`) cleans whatever a failed remove left.

**Nothing reaps a worktree whose task never finishes.** Deliberate: that is a person's own `DELETE` or `rm`.
Do not design a reaper for it.

**Open, one word:** `killed` is the other terminal task state, and the kill cascade already asks this same
door to stop the runs (`core-api/work/src/task-kill-cascade.ts:114-117`). Including it is one literal. The
plan says "done", so this document stays at `done` — **maintainer's call**.

---

## 5. Folders and Drive

HyperIdle never removes a folder or a Drive copy except through `DELETE /api/filesystems/:id`
(`routes/filesystems.ts:343-346`) → `forgetKeptCopy`, which already refuses to touch a local repository
(`mounter.ts:357-364`); phase 2 extends it to the Drive kept copy. A person's own folder, never.

`DELETE` does **not** hunt down the task worktrees cut from that filesystem: they are keyed by task, not by
filesystem, and the agent's uncommitted files in them are worth more than the tidiness. They go when the task
is done. Sweeping them at `DELETE` would mean putting the filesystem id in the worktree's name — say so before
building, not after.

---

## 6. Tests

Assertions that **flip** (all verified as written today):

- `admit-session-live-filesystems.integration.test.ts` (T9) — header (`:1-11`) and both worktree cases
  (`:185`, `:272`): "unmounts the worktree while the branch stays" becomes **"leaves the worktree and the
  branch"**, and the verdict case stops being a special case.
- `git-repository-adapter.integration.test.ts` case **(h)** (`:475-501`) — `unmount` becomes `releaseForTask`.
- `review-sandbox-lifetime.integration.test.ts` — `:264`, `:272`, `:289` and the tail of `:297` assert
  `survives === false`; every one becomes `true`, and the header comment (`:1-15`) is rewritten.
- `filesystem-hold-task-stays-ready.integration.test.ts:112` stubs `worktreeRemove` — drop it, keep a
  kept-copies root.

New red tests for G2b:

| # | Behaviour | File · lane | Red if reverted |
|---|---|---|---|
| N1 | a session run to completion leaves: the worktree in `git worktree list`, its branch, the file the agent wrote, and the session directory itself | T9 file, extended · service | any `unmount`/`destroy`/`rm` put back |
| N2 | a **resume** finds a file the first session wrote, through the same symlink, at the same workspace path | T9 file · service | the worktree returning to the session directory |
| N3 | a **second, non-resume session for the same task** (new session id, new workspace) sees that file and reports the same branch | `git-repository-adapter.integration.test.ts` · service | keying the worktree by session instead of task |
| N4 | `releaseForTask` removes the worktree and the task directory and **keeps the branch**; a second call is a no-op | same file (replaces (h)) · service | `--force` dropped, or the branch deleted with it |
| N5 | `releaseForTask` with the kept copy already deleted, and with a missing directory, resolves without throwing and still removes what it can | same file · service | any un-wrapped call |
| N6 | a task reaching `done` calls the door exactly once with that task id; a door that throws does not fail the transition | `core-api/src/services/__tests__/task-done-worktree-reactions.integration.test.ts` · service | subscriber not registered; error not swallowed |

All six test runtime behaviour through imports; N1-N5 need a real git repository and N6 a real DB, so all are
`*.integration.test.ts` in the service lane. The deletions in §1 are proven by `npm run check` and knip.

---

## 7. One deliberate extra: the reaper and a review answered late

`reapSandboxesOnce` deletes a terminal session's directory 24 h after it ended (`runtime-reapers.ts:84-90`).
A session that filed a review is terminal in that sense, so a verdict answered two days later resumes into a
directory that is gone and the harness hangs — the exact failure BA2's lore describes
(`transition-run.ts:239-251`). The hole exists today and this change neither opens nor closes it, but after §3
it is the **only** remaining way to break the ruling's promise that a resume finds its files.

**Recommended:** four lines in `reapSandboxesOnce` — skip a directory whose session has a `review_sessions`
row, through the existing `sessionAwaitsVerdict` (`review-sessions.ts:75-82`), which otherwise becomes dead
code when its three callers go (`provisioner.ts:55,753,2129`, `transition-run.ts:11,251`). One test: a
terminal session past the TTL that awaits a verdict keeps its directory. **Cuttable.**

---

## 8. Documentation for G3 (`docs/process-layer/filesystem-primitive.md` — do not edit yet)

- `:3` — "Built by AO1 … and AO2 (**mount + capture**)": capture is gone; the packages named have moved.
- `:26`, `:28` — the *Cloud drive* row and "No Drive/Dropbox two-way sync engine exists": the second stays
  true and load-bearing; the first must say a Drive folder is a placed filesystem (phase 2).
- `:34`, `:88` — "`source` … derived from the Connection": false for Drive and for a plain folder.
- `:41`, `:90`, `:112` — the write-back axis (`WRITEBACK_MODES`, "Write-back is a capability axis", the
  vocabulary row): the column is deleted; work gets out **by kind**. `:46` — "the forge auth … is provisioned
  into the sandbox": it is the CLIs' now, through the person's home.
- `:57` — "**Not the sandbox** — the sandbox is the ephemeral per-session mount target": the sentence the
  ruling contradicts most directly. A filesystem's place outlives every session; only a git worktree is
  disposable, and only when the task is done.
- `:68-76` — the whole **Lifecycle** block: `mounted → authored → captured back` and "captured back before
  sandbox teardown" are both false. Replace with the three lifetimes of §2 and "nothing is torn down at
  session end".
- `:7` — names `filesystem_captures` and a package path that no longer exists.

---

## 9. Size

Production and tests, added versus deleted. Deletions never count toward the 1,000-line stop.

| Area | Prod + | Prod − | Test + | Test − |
|---|---|---|---|---|
| `mounter.ts` — worktree home, symlink, `trustedPaths`, `releaseForTask`; minus four `unmount`s and `recognizeAdoptedWorktree` | ~70 | ~65 | — | — |
| `provisioner.ts`, `transition-run.ts`, `filesystem-provisioning.ts` — `taskId` through; minus `unmountFilesystems`, its three calls, two destroys, the workspace delete, both verdict guards, the port's `unmount` | ~10 | ~85 | — | — |
| The door (api-contract, intake route + factory args, `app.ts`, port composition) and the core reaction + registration | ~80 | — | ~110 | — |
| Reaper skip (§7, cuttable) | ~5 | — | ~25 | — |
| T9, adapter cases, lifetime tests, hold fixture | — | — | ~170 | ~60 |
| **Total** | **~165** | **~150** | **~305** | **~60** |

About **165 added production lines** — far under the stop, and the change removes nearly as much as it adds.

**L7 (one leaf, one builder, one PR on top of phase 1):** move the git worktree to
`<keptCopiesRoot>/worktrees/<taskKey>/` and symlink it into the workspace; delete every session-end unmount,
destroy and workspace delete; add `releaseForTask` behind the existing orchestration door, called by a new
core reaction on a task reaching `done`; flip T9, adapter case (h) and the sandbox-lifetime tests and add
N1-N6 — ending green on `npm run check`, `npm run lint`, and
`npm run test:integration:service -- admit-session-live-filesystems git-repository-adapter review-sandbox-lifetime task-done-worktree-reactions filesystem-hold-task-stays-ready`.
Session provisioning changes, so `npm run test:integration:harness` runs locally before ship.

---

## 10. What I was unsure about

1. **`killed` tasks** (§4) — one literal, maintainer's call.
2. **The reaper skip** (§7) — a deliberate addition outside the letter of the ruling; cuttable.
3. **Requiring `keptCopiesRoot` for a local repository** (§3) widens an accepted limit. Reversible.
4. **`git worktree remove` on a worktree whose repository is gone** — UNVERIFIED as a git fact; I did not run
   it. That is why the whole call is wrapped and N5 pins it.
5. **Whether the new door verb needs a governance census entry.** No new package, table, event or endpoint
   family, but `npm run lint` is the authority. UNVERIFIED.
