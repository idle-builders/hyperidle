# BA5 — No teardown · Architecture

The ruling of 2026-09-16 (`plan.md` §Rulings "No teardown", §"When a session ends", gate G2b) applied to the
code as built. It **revises** `architecture.md` §5.2 (kept copy: location and lifetime), §5.4 (recognition),
§5.5 (Teardown), the placement path, and test T9 — those sections are now wrong. It absorbs BA12.

Every `file:line` below was read on this branch (`feature/pipeline-ba5-1fa5e1`, HEAD `55b64dcac`, directly on
`origin/main` `286628f7b`). Claims marked UNVERIFIED were not read. Re-check a line before building on it.

**Revision 2, after the critique** (`critique-no-teardown.md`). The release no longer fires under a running
session (§4, two occasions plus orchestration's own liveness guard), `--force` is gone (§4), the reaper change
is part of the design rather than an option (§1, §7), and §3 gains the second `trustedPath` reader, the
Postgres remote-server fact, the two-agents-on-one-task hazard and the instruction for a reused worktree.

## 1. What goes, and what may stay

Nothing is removed when a session ends. Everything in this table goes; two things stay, one changes:

| Goes | Where (verified) | Why |
|---|---|---|
| `unmountFilesystems` and its doc comment | `run-orchestration/src/provisioner.ts:737-765` | nothing is unmounted any more |
| its three call sites | `provisioner.ts:2027-2030` (crash), `:2079-2082` (not-returned), `:2106-2109` (normal end) | same |
| session-end `workspace.destroy` | `provisioner.ts:2093` (not-returned), `:2118-2131` (normal end, incl. the `sessionAwaitsVerdict` guard and the BA2 lore block above it) | the workspace is the agent's, not the session's |
| the workspace delete that actually matters | `transition-run.ts:239-256` — the `sessionAwaitsVerdict` early return and `fs.promises.rm(context.sandboxPath, …)` | its own lore says this, not `workspace.destroy`, is the delete that removes the tree |
| `MountAdapter.unmount` and all four implementations | `mounter.ts:91`, `:102-104`, `:146-149`, `:322-328`, `:346-348`; the port field `filesystem-provisioning.ts:48` | replaced by §4 |
| the admission-failure unmount loop | `provisioner.ts:1280-1284` | a worktree at that moment may already hold earlier work of the same task (§3). Never remove it on a failure |
| `recognizeAdoptedWorktree` | `mounter.ts:213-238` (doc comment `:207-212`) | replaced by a plain "does the task's worktree already exist" check (§3) |
| `MountedFilesystem.adopted` **renamed** `reused` | `mounter.ts:84`, set at `:136`, `:266`, `:314`; its only reader `provisioner.ts:1281` goes | it now means "the place already existed before this session", and the instructions read it (§3) |

**Stays: exactly one `workspace.destroy`** — `provisioner.ts:1285-1287`, on an admission failure of a
**non-resume** session. That directory was spawned seconds earlier (`provisioner.ts:1208-1210`) and, after §3,
holds nothing durable: the kept copy, the worktree and the person's folder all live outside it. Keeping it
would leak one empty directory per failed admission.

**Stays, doing more work than before: the workspace reaper** (`runtime-reapers.ts:21,78-99`, enabled at
`applications/desktop/src/create-server.ts:297-299`). It reclaims a terminal session's directory 24 h after it
ended, and after §3 that directory holds only scratch — the materialised zones (`context.ts:1003-1006`),
`AGENTS.md`, and symlinks into places that live elsewhere. **Nothing is deleted at session end; the reaper is
what reclaims those trees.** That is enough, and it is one rule instead of two.

**Changes: the reaper skips a session that is owed a verdict** — four lines, argued in §7. Not optional: it is
what keeps the promise that a resume finds its files.

## 2. Where each place lives

| Filesystem | Where the real files are | Lives until |
|---|---|---|
| a person's folder | their own folder; `<workspace>/<name>` is a symlink to it (`mounter.ts:107-146`) | they delete it themselves — never HyperIdle |
| git, local repo | their own repository — the kept copy *is* their repo (`mounter.ts:249-250`) | same |
| git, remote | `<keptCopiesRoot>/<filesystemId>`, cloned once, fetched after (`mounter.ts:287-296`) | `DELETE /api/filesystems/:id` → `forgetKeptCopy` (`routes/filesystems.ts:346`, `mounter.ts:357-364`) |
| git worktree | **`<keptCopiesRoot>/worktrees/<taskKey>/<folderName>`** (new, §3); `<workspace>/<folderName>` is a symlink to it | the task is done (§4), or a person deletes it |
| Google Drive (phase 2) | `<keptCopiesRoot>/<filesystemId>`, same shape as a remote git kept copy — see `architecture-phase2.md` | `DELETE /api/filesystems/:id` |

The session's own directory holds nothing but scratch, and the reaper reclaims it 24 h after the session ends
(§1). So the plan's sentence "**every place lives outside the session's directory** — the session only links
to it" becomes literally true for every kind: **no plan reword is needed.** `keptCopiesRoot` already reaches
the mounter (`boot.ts:332-335`, `mounter.ts:51-54`) wherever an application sets it (§3), so the worktrees
root needs **no new configuration** — `worktreesRoot = path.join(keptCopiesRoot, "worktrees")`, a fixed name
a UUID filesystem id can never collide with.

## 3. The worktree's home: option (b), a long-lived directory keyed by task

**Decision: (b).** The worktree leaves the session directory and is symlinked back into it. Four reasons,
each checked against the code:

1. **A new session for the same task must find the work.** A non-resume session gets a brand-new directory
   (`provisioner.ts:1208-1210`: `workspace.adopt` only when `params.resume?.sandboxPath` is set), so under (a)
   it finds nothing and cuts a second worktree on a second branch. G2b asks for the opposite.
2. **Under (a) the reaper would undo the ruling.** It deletes a terminal session's directory after 24 h
   (`runtime-reapers.ts:78-99`) and cannot know whether the task is done — it lives in orchestration, which
   never reads core. So (a) loses the worktree a day later, or we stop reaping terminal directories at all.
3. **The shape is already shipped.** A folder filesystem is exactly this — a symlink in the workspace pointing
   at a real directory elsewhere, declared to codex through `trustedPath` (`mounter.ts:115-136`,
   `provisioner.ts:1690`, and the trust block's note at `cli-mcp-config.ts:152-163`, which names a
   symlinked-in folder as the case it exists for).
4. **cursor-agent is untouched.** The harness cwd is the session workspace and a resume adopts the same path
   (`provisioner.ts:1208-1210`).

**Keying and branch.** `taskKey = "task-" + params.taskId` when the session has a task
(`ProvisionSessionParams.taskId: string | null`, `provisioner.ts:863`), else `"session-" + sessionId` — a
taskless session's worktree is its own and nothing removes it automatically; say so, do not build for it. The
branch follows the key: `hyperidle/<taskId>`, or `hyperidle/<sessionId>` (today always the latter,
`mounter.ts:303`). It is cut once, with the worktree; later sessions of the task keep it, and the
instructions render it from the record (`filesystem-instructions.ts:12-20`).

**A reused worktree is announced.** A second, non-resume session gets a fresh chat and a fresh workspace but
an old worktree, and today's sentence ("You are on branch `X`, started from `Y`") reads as if it were fresh.
When `reused` is true, `describeOne` (`filesystem-instructions.ts:9-23`) appends one sentence: *this worktree
already holds earlier work on this task — check `git status` and `git log` before you start*.

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
→ { ok:true, mounted: { folder: link, trustedPaths: [keptCopy, home], git:{ keptCopy, branch, base, remote }, agentEnv, reused } }
```

One question — *does the task's worktree exist?* — answers both adoption cases and deletes the gitdir-pointer
forensics of `recognizeAdoptedWorktree` (`mounter.ts:213-238`); the link check is the folder adapter's
existing realpath check (`mounter.ts:115-124`).

**Two contract changes.** `MountInput` (`mounter.ts:58-66`) gains `taskId: string | null`, threaded from
`provisioner.ts:1270-1276` through `mountFilesystemsForAgent` (`filesystem-provisioning.ts:191-235`).
`MountedFilesystem.trustedPath` (`mounter.ts:73`) becomes `trustedPaths: readonly string[]` — a git mount now
has two real paths that matter, the kept copy (where the worktree's git directory lives) and the worktree
itself, which is outside the sandbox. It has **two** production readers: `provisioner.ts:1690` becomes a
`flatMap` (the port already declares an array, `provisioner.ts:269`), and `filesystem-instructions.ts:22`
prints it in the folder branch ("the folder ${…}, linked in as it is") — there it becomes the first element,
and its unit test follows (`filesystem-instructions.test.ts:31,55,72`). Folder and Drive return one element.

**No `keptCopiesRoot`, no git.** A local repo mounts without one today; after this change every git
filesystem needs it and otherwise fails with the existing reason "this server has no folder to keep repository
copies in" (`mounter.ts:285`). Desktop always sets it (`applications/desktop/src/create-server.ts:173`);
`applications/remote-server/src/create-server.ts:255-257` sets it **only when the driver is pglite**, so on a
Postgres remote-server every git filesystem — local ones included, which mount there today — would hold. That
widens the limit its own comment already accepts for remote repositories (`:232-237`). Accepted for the
documented reason stated there: the shared backend runs no agents. Tests that build a mounter without a root
(`core-api/src/__tests__/filesystem-hold-task-stays-ready.integration.test.ts:303`,
`git-repository-adapter.integration.test.ts:143,172`) pass a temporary directory instead.

**Two sessions of one task share one worktree — an accepted hazard, not a proven impossibility.** Concurrency
is limited **per agent** (`provisioner.ts:1159-1173`, `maxConcurrentSessions`, default 1 at
`agent-run-config-store.ts:95`); nothing is task-scoped. Two agents on one task, or one agent with the limit
raised, would put two harnesses in one working directory and one git index — which today's per-session
worktree makes impossible. The ruling's own words point here ("a worktree is only an isolation mechanism", and
the unit it isolates is the task), so this design accepts the hazard and adds no guard. If the maintainer
wants one, the cheapest is a per-task admission check beside the per-agent one — say so before building.

## 4. Removing the worktree when the task is done

**The invariant: a worktree is only ever removed when its task is `done` and no session of it is running.**
A task reaching `done` does not end its session — `task-kill-cascade.ts:105-117` says so outright, and an
agent marks its own task done mid-turn through `edit_task` (`tool-handlers/src/tool-definitions.ts:557-606`)
while the harness keeps working. So the release has two occasions and one guard.

**Occasion (i) — the task turns `done`.** The core reaction subscribes to `task_state_changed`
(`events.ts:112-118`, emitted post-commit at `core-api/work/src/task-state-machine.ts:382-389`) and calls the
door on `toState === "done"`. Usually no session is left and the worktree goes then.

**Occasion (ii) — a session of an already-`done` task ends.** The same reaction subscribes to `session_ended`
(`events.ts:176-188`, carrying `taskId: string | null`; core already subscribes at
`core-api/src/services/work-session-end-reactions.ts:113`), and when **core's own** work row for that task is
`done` it calls the door. This finishes what (i) declined.

**The guard, inside orchestration.** `releaseForTask(taskId)` first asks its **own** `sessions` table for an
active session of that task — the shape already at `request-run-stop-for-tasks.ts:43`
(`inArray(sessions.taskId, …)` + `eq(sessions.state, "active")`) — and returns having touched nothing if there
is one. The test lives here, not in core: the read door gives core no per-task session query
(`AgentOrchestrationSessionsPort` has only `getById`, `agent-orchestration-port.ts:64-69`), and a core-side
check would be a separate round trip a starting session could invalidate. Core decides *the task is done*;
orchestration decides *nothing is running*. (Deviation from the orchestrator's wording — §10 item 6.)

**Removal is a doesn't-matter op — no `--force`.** For each child of `<worktreesRoot>/task-<taskId>`: read its
`.git` file, take the path before `/worktrees/` as the repository, and run `worktreeRemove(child)` **without**
`force` (`git-runner.ts:106,413` — the option stays, this caller does not pass it). Git refuses a worktree
with uncommitted or untracked changes; that refusal is logged as a skip and **the worktree stays**, for a
person to look at. `--force` would delete exactly the work the ruling assumes is on the branch — nothing makes
an agent commit, the instructions only ask (`filesystem-instructions.ts:18-20`). Then `rmdir` the task
directory, which succeeds only when it is empty. **The branch is never touched**, nothing is ever `rm -rf`'d,
and every step is wrapped: a missing directory, a deleted kept copy or a failing git all end as a log line.
`worktreePrune()` before every `worktreeAdd` (`mounter.ts:302`) cleans what git left behind.

**Core side, new:** `layers/core-api/src/service-bootstrap.ts` registers
`services/task-done-worktree-reactions.ts` beside the six reaction services already there
(`:262,271,285,297,312,324`; the `agentOrchestration` port is in scope at `:257`). Both subscriptions live in
that file; every failure is logged and swallowed.

**The door, one new verb:** `AgentOrchestrationFilesystemsPort` (`framework/api-contract/src/agent-orchestration-port.ts:239-256`)
gains `releaseForTask(taskId: string): Promise<void>`; the route goes beside its two siblings in
`layers/agent-orchestration/src/routes/agent-orchestration-intake.ts:293-320`; the in-process spelling beside
`stopForTasks` in `core-api/src/services/agent-orchestration-port-composition.ts:251-258`.
`createAgentOrchestrationIntakeRoutes(db)` (`agent-orchestration-intake.ts:125`, mounted at `app.ts:79`) gains
the two values the release needs — `keptCopiesRoot` and the git runner factory — both already held by `app.ts`
for `POST /:id/check` and for `forgetKeptCopy` (`routes/filesystems.ts:52,59`).

**Why not a tool-side trigger.** `edit_task` is orchestration-hosted, so orchestration sees the *request* and
a trigger there looks cheaper. It is not: the state machine decides whether the transition happens
(`task-state-machine.ts:370-389`), and a human, a direct state edit or the parent-propagation path never
passes through the tool. `ProvisionSessionResult` (`provisioner.ts:968-976`) carries `outcome` and
`returnVerdict` — session facts, never task state.

**Nothing reaps a worktree whose task never finishes, or one git refused to remove.** Deliberate: that is a
person's own `DELETE` or `rm`.

**Open, one word:** `killed` is the other terminal task state, and the kill cascade already asks this same
door to stop the runs (`core-api/work/src/task-kill-cascade.ts:114-117`). Including it is one literal. The
plan says "done", so this document stays at `done` — **maintainer's call**.

## 5. Folders and Drive

HyperIdle never removes a folder or a Drive copy except through `DELETE /api/filesystems/:id`
(`routes/filesystems.ts:343-346`) → `forgetKeptCopy` (`mounter.ts:357-364`), which already refuses to touch a
local repository; phase 2 extends it to the Drive kept copy. A person's own folder, never.

`DELETE` does **not** hunt down the task worktrees cut from that filesystem: they are keyed by task, not by
filesystem, and the agent's files in them are worth more than the tidiness. Sweeping them there would mean
putting the filesystem id in the worktree's name — say so before building, not after.

## 6. Tests

Assertions that **flip** (all verified as written today):

- `admit-session-live-filesystems.integration.test.ts` (T9) — header (`:1-11`) and both worktree cases
  (`:185`, `:272`): "unmounts the worktree while the branch stays" becomes **"leaves the worktree and the
  branch"**, and the verdict case stops being a special case.
- `git-repository-adapter.integration.test.ts` case **(h)** (`:475-501`) — `unmount` becomes `releaseForTask`.
- `review-sandbox-lifetime.integration.test.ts` — the `survives === false` assertions at `:269`, `:276`,
  `:294` and the tail of the resume case become `true`, and the header comment (`:1-15`) is rewritten.
- `filesystem-hold-task-stays-ready.integration.test.ts:112` stubs `worktreeRemove` — drop it, keep a
  kept-copies root.

New red tests for G2b:

| # | Behaviour | File · lane | Red if reverted |
|---|---|---|---|
| N1 | a session run to completion leaves the worktree in `git worktree list`, its branch, the file the agent wrote, and the session directory | T9 file, extended · service | any `unmount`/`destroy`/`rm` put back |
| N2 | a **resume** finds a file the first session wrote, through the same symlink, at the same workspace path | T9 file · service | the worktree returning to the session directory |
| N3 | a **second, non-resume session for the same task** (new session id, new workspace) sees that file, reports the same branch, and its `AGENTS.md` carries the reused-worktree sentence | `git-repository-adapter.integration.test.ts` + `filesystem-instructions.test.ts` · service + unit | keying the worktree by session; the `reused` sentence dropped |
| N4 | `releaseForTask` removes a **clean** worktree and leaves a **dirty** one (uncommitted and untracked changes) in place; **the branch survives both**; the task directory goes only once empty; a second call is a no-op | same file (replaces (h)) · service | `--force` added back — the dirty case loses the agent's work; the branch deleted with the worktree |
| N5 | `releaseForTask` with the kept copy already deleted, and with a missing task directory, resolves without throwing and removes nothing it could not remove through git | same file · service | any un-wrapped call; any `rm -rf` of a worktree |
| N6 | `releaseForTask` while a session of that task is `active` touches **nothing**; after that session's row leaves `active`, the same call removes the worktree | same file, with the DB fixture · service | the liveness guard dropped — the release runs under a live harness |
| N7 | the reaction: `task_state_changed → done` calls the door once; `session_ended` whose task is `done` calls it; `session_ended` whose task is not `done` does not; a door that throws does not fail either path | `core-api/src/services/__tests__/task-done-worktree-reactions.integration.test.ts` · service | either subscription missing (a task done mid-session never releases); the not-done case calling the door |
| N8 | a terminal session past the reaper TTL that awaits a verdict keeps its directory; one that does not is reclaimed | `run-orchestration/src/__tests__/` reaper test · service | the skip dropped — a verdict answered on day two resumes into nothing |

All eight test runtime behaviour through imports, and all are `*.integration.test.ts` in the service lane
(N3's instruction half is a unit test). The deletions in §1 are proven by `npm run check` and knip.

## 7. Why the reaper must skip a verdict (part of §1, not an option)

`reapSandboxesOnce` deletes a terminal session's directory once its `endedAt` is past the TTL
(`runtime-reapers.ts:78-99`), knowing nothing about a pending verdict. So a verdict answered two days later
resumes into a directory that is gone and the harness hangs — the exact failure BA2's lore describes
(`transition-run.ts:242-250`). The hole exists today; after §3 it is the **only** remaining way to break the
ruling's promise that a resume finds its files.

**The change:** four lines in `reapSandboxesOnce` — skip a directory whose session has a `review_sessions`
row, through the existing `sessionAwaitsVerdict` (`review-sessions.ts:75-82`), which otherwise becomes dead
code when its three callers go (`provisioner.ts:55,753,2129`, `transition-run.ts:11,251`). N8 is its test.
G2b's "a resume finds the files" is not honest without it.

## 8. Documentation for G3 (`docs/process-layer/filesystem-primitive.md` — do not edit yet)

- `:3`, `:7` — "AO2 (**mount + capture**)": capture is gone, and `filesystem_captures` and the package paths
  named there no longer exist.
- `:26`, `:28` — the *Cloud drive* row and "No Drive/Dropbox two-way sync engine exists": the second stays
  true and load-bearing; the first must say a Drive folder is a placed filesystem (phase 2).
- `:34`, `:88` — "`source` … derived from the Connection": false for Drive and for a plain folder. `:46` —
  "the forge auth … is provisioned into the sandbox": it is the CLIs' now, through the person's home.
  `:41`, `:90`, `:112` — the write-back axis: the column is deleted; work gets out **by kind**.
- `:57` — "**Not the sandbox** — the sandbox is the ephemeral per-session mount target": the sentence the
  ruling contradicts most directly. A filesystem's place outlives every session; only a git worktree is
  disposable, and only once the task is done.
- `:68-76` — the **Lifecycle** block: `mounted → authored → captured back` and "captured back before sandbox
  teardown" are both false. Replace with the three lifetimes of §2 and "nothing is torn down at session end".

## 9. Size

Added versus deleted; deletions never count toward the 1,000-line stop.

| Area | Prod + | Prod − | Test + | Test − |
|---|---|---|---|---|
| `mounter.ts` — worktree home, symlink, `trustedPaths`, `reused`, `releaseForTask` **with its liveness guard**; minus four `unmount`s and `recognizeAdoptedWorktree` | ~95 | ~65 | — | — |
| `provisioner.ts`, `transition-run.ts`, `filesystem-provisioning.ts` — `taskId` through; minus `unmountFilesystems`, its three calls, two destroys, the workspace delete, both verdict guards, the port's `unmount` | ~10 | ~85 | — | — |
| `filesystem-instructions.ts` — `trustedPaths`, the reused sentence (S1, S6) | ~10 | — | ~15 | — |
| The door (api-contract, intake route + factory args, `app.ts`, port composition) | ~35 | — | ~40 | — |
| The core reaction — two subscriptions, the task-state read, registration | ~60 | — | ~90 | — |
| Reaper skip (§1, §7) | ~5 | — | ~25 | — |
| T9, adapter cases (incl. N4-N6), lifetime tests, hold fixture | — | — | ~215 | ~60 |
| **Total** | **~215** | **~150** | **~385** | **~60** |

About **215 added production lines** (the critique's independent count was ~185-195 before S1 and S6) — far
under the stop, and the change removes most of what it adds.

**L7 (one leaf, one builder, one PR on top of phase 1):** move the git worktree to
`<keptCopiesRoot>/worktrees/<taskKey>/` and symlink it in; delete every session-end unmount, destroy and
workspace delete; add `releaseForTask` (liveness-guarded, no `--force`) behind the existing door, called by a
new core reaction on both `task_state_changed → done` and `session_ended`; make the reaper skip a verdict;
flip T9, adapter case (h) and the sandbox-lifetime tests and add N1-N8 — green on `npm run check`,
`npm run lint` and `npm run test:integration:service` over the five touched test files. Session provisioning
changes, so `npm run test:integration:harness` runs locally before ship.

## 10. What I was unsure about

1. **`killed` tasks** (§4) — one literal, maintainer's call.
2. **Requiring `keptCopiesRoot` for a local repository** (§3) stops git filesystems mounting on a Postgres
   remote-server. Accepted for the reason that file's own comment gives; reversible.
3. **Two agents on one task** (§3) — an accepted hazard, no guard. Say the word and it becomes a per-task
   admission check.
4. **Exactly what git refuses on a dirty worktree** — UNVERIFIED; I did not run it. Any failure is a skip, so
   a stricter or looser refusal only changes how often a worktree stays.
5. **Governance**: no census entry needed (the critique read the rules). `npm run lint` is still the authority
   and neither of us ran it.
6. **Deviation from the orchestrator's wording** (§4): the "no live session" test sits in orchestration, not
   in core. Putting it in core needs a second door verb (a per-task session read) and would still be racy.
   Reject this and the cost is that verb.
