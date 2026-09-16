# BA5 — Review: the no-teardown leaf (L7)

Read cold against `architecture-no-teardown.md`, `plan.md` (§"No teardown", §"When a session ends", G2b)
and `critique-no-teardown.md`. Diff `c412464b7..700219460`, 23 files, five commits. Every `file:line`
below is one I opened on this branch.

## Verdict

**Ship-ready for this leaf, with the fix list below.** The shape the design locked is what got built:
the worktree lives at `<keptCopiesRoot>/worktrees/task-<id>/<folder>` and is symlinked in, every
session-end unmount/destroy/delete is gone, `releaseForTask` is liveness-guarded and never forces, the
reaper skips a verdict-awaiting session, and the reaction fires on both occasions. No blocking finding.
S1–S3 are code fixes; S4 needs the maintainer's word; S5 is a fact to write down, not a bug.

## Findings

| # | Sev | Finding, evidence, and the exact fix |
|---|---|---|
| S1 | should-fix | **The `destroy` half of N1 and of the flipped lifetime tests cannot go red.** The fake workspace's `destroy` records a path and deletes nothing (`review-sandbox-lifetime.integration.test.ts:204-206`, `admit-session-live-filesystems.integration.test.ts:242`), while production's really deletes the tree. So re-adding `await workspace.destroy(sandboxHandle)` at session end would delete the session directory on every real run and every one of these assertions would stay green — the guard only covers `transition-run.ts`'s deleted `fs.rm`. The file's own `@lore` (`:234-238`) says "the adapter's destroy removes an already-removed tree"; that reasoning died with the `fs.rm`. The `destroyed` array is collected at `:240` and asserted nowhere. **Fix:** `expect(destroyed).toEqual([])` in the three flipped cases (`:268`, `:276`, `:315`). (I verified the behaviour myself instead: `provisioner.ts:1260` is the only `workspace.destroy` left in the package.) |
| S2 | should-fix | **Stale `@lore` contradicting the change it documents.** `filesystem-provisioning.ts:35-40` still says the failure carries the placed mounts "so it can unmount exactly those, never an adopted resume's) before it runs the full hold: release the adapter, destroy the workspace unless resuming". Nothing unmounts any more; the class doc 20 lines below (`:106-111`) was updated, this one was missed. A `@lore` that lies is worse than none. **Fix:** drop the unmount clause and the adopted-resume parenthesis. |
| S3 | should-fix | **19 new non-`@lore` comments carry the package id plus section numbers of a document that only exists in `.pipeline/`** — `mounter.ts:75,96,110,278,341`, `filesystem-instructions.ts:33`, `filesystem-provisioning.ts:29,109`, `agent-orchestration-port.ts:252`, `agent-orchestration-intake.ts:282,288,356`, `app.ts:79`, `service-bootstrap.ts:320`, `runtime-reapers.ts:93`, `provisioner.ts:1657`. A reader outside the pipeline cannot resolve "§3"/"§4"/"§7". The standing rule keeps package ids in `.pipeline/`, `@lore` exempt. **Fix:** fold each into an `@lore` tag or drop the id and the §-reference and state the fact plainly. (No configured lint rule covers this and these files already carry a pre-existing baseline of the same, so it is not blocking.) |
| S4 | should-fix (maintainer's call) | **A killed task's worktree is never released — a new permanent leak.** The reaction only tests `done` (`task-done-worktree-reactions.ts:36,44`), and `done` leads only to `killed` (`framework/domain-model/src/task-transition.ts:47`), so any task killed from `in_progress`/`review`/`hold` keeps its worktree and its task directory forever. Before this change, session-end unmount reclaimed it. The design named this as one literal and the plan says "done", so the builder followed the plan — but it should be a decision, not a silence. **Fix (if approved):** `toState === "done" || toState === "killed"` at `:36`, and the same widening in `reactToSessionEnded`'s state test at `:44`. |
| S5 | should-fix (write it down) | **Nothing reaps `<keptCopiesRoot>/worktrees` — ever.** A taskless session's worktree (`session-<sessionId>`, `mounter.ts:225-227`) is never removed by anything; neither is a worktree whose task never reaches `done`, nor one git refused as dirty (`mounter.ts:374-381`), nor the whole tree on a `DELETE /api/filesystems/:id`. The sandbox reaper only sweeps `sandboxBasePath` (`runtime-reapers.ts:56,108`), and `keptCopiesRoot` sits beside the database. Each of these is explicitly accepted in the design, but together they mean unbounded disk growth with no reclaim path except a person's `rm`. **Fix:** say it in G3's doc update (`docs/process-layer/filesystem-primitive.md` lifecycle block), so the next reader does not discover it from a full disk. |
| N-a | note | **The builder's deletion claims hold.** `provisioner.ts:1260` is the only `workspace.destroy` (non-resume admission failure, as designed). The only deletes left in the package are the reaper (`runtime-reapers.ts:108`), `forgetKeptCopy` (`mounter.ts:439`) and `rmdir` of the now-empty task directory (`mounter.ts:384`). No `rm -rf` of a worktree, no `--force` (`mounter.ts:377`), the branch is never named. No credential, token or home-directory write path is added. Grep for `unmount`, `adopted`, `trustedPath`, `recognizeAdoptedWorktree` across the tree returns prose only — no live code reference. |
| N-b | note | **The two concurrency questions both come out clean.** Double-fire (task→`done`, then `session_ended` of that same done task) is harmless: the second call returns at `mounter.ts:361-363` with the directory already gone. Concurrency is per agent, but the guard is per **task** (`mounter.ts:353-358`), and any session working in `task-<id>`'s worktree carries `sessions.taskId = <id>` (`provisioner.ts:1199`) — so another agent's live session on the same task does block the release. The ending session never blocks its own release: the row is CAS'd terminal (`transition-run.ts:369-381`) before `session_ended` is emitted (`:203-206`). Crashes emit `session_ended` too (`:277`), so the crash path is covered; a handoff-ended session is not, but its task's own `done` transition still releases. |
| N-c | note | **Orchestration reads no core state.** `releaseForTask` touches only its own `sessions` table; the task-state read lives in core (`task-done-worktree-reactions.ts:43`, `get(db,"task",…)`), and core pushes through the door. Correct direction. Registration is real (`service-bootstrap.ts:321-328`) and the bootstrap-owners census carries it (`O3-service-move-bootstrap.integration.test.ts:105-110,274-279`). |
| N-d | note | **A collision I went looking for and did not find.** `hyperidle/<taskId>` (`mounter.ts:273`) would clash with a surviving branch if a task's worktree were ever cut twice, but `done` leads only to `killed`, so a released task can never remount. |
| N-e | note | **Deviations judged.** `db` per call (`mounter.ts:352`) — fine, though it pulls `@hyperidle/db` + drizzle into what was a pure fs/git module; the design placed it there, so it stands. N4/N5 on the db fixture — right, the guard needs a real `sessions` table. Replacing adapter case (h) rather than keeping it — right, `unmount` no longer exists. No census entry — confirmed: lint is green and `tools/governance/architecture.json` has no per-verb registry. N7 fakes the door and proves only the two occasions; the door itself is proven for real in N4–N6. That split is honest. |
| N-f | note | **Comment density.** 184 of the 415 added production lines are comment or blank (44%); code added is 231 against the design's ~215, deleted 160 against ~150 — size is on target. Several comments restate the line below (`filesystem-instructions.ts:34-35`, `agent-orchestration-intake.ts:355-359`). Worth trimming, not a defect. |
| N-g | note | **G2b and the harness lane are still owed.** Everything green here ran against a fake harness adapter. The design's own L7 says `test:integration:harness` runs locally before ship, and the plan's G2b wants the running app: session end leaves the worktree, a resume finds the files, task done removes it and keeps the branch. The residual risk is narrow — a folder filesystem is already an out-of-sandbox symlink and `git commit` already writes into the kept copy outside the sandbox, both proven live at G2 — but it is not zero, because the worktree's real path moved outside the harness cwd for the first time. Do not read these green gates as G2b. |
| N-h | note | **A misleading log line, pre-existing.** N5's deleted-kept-copy case logs `[filesystem-release] … git is not installed` — that is `git-runner`'s message for an ENOENT cwd, not a missing binary. The path is a deliberate skip, so nothing breaks; the wording would mislead whoever reads the log. |

## Gates (verbatim exit codes)

| Command | Exit |
|---|---|
| `npm run check` | **0** — `typecheck-gate: PASS — all 38 packages checked.` |
| `npm run lint` | **0** — `governance-lint: PASS — 2574 tracked files … 0 production + 0 development known violation(s)`; fixtures PASS (61), attacks PASS (70) |
| `npm run verify:quick` | **0** — check + lint + knip + knip:production + deps:check |
| `npx vitest run --config vitest.integration.config.ts --project service admit-session-live-filesystems git-repository-adapter review-sandbox-lifetime task-done-worktree-reactions filesystem-hold-task-stays-ready filesystem-instructions reap-sandboxes-verdict-skip` | **0** — 6 files, 30 tests passed |
| `npx vitest run filesystem-instructions` | pass — 1 file, 5 tests (it is a unit test, so the integration filter above never matched it; run separately) |

## The red run I re-did

Reinstated `{ force: true }` at `mounter.ts:377` (`worktreeRemove(worktreePath, { force: true })`) and ran
N4 alone. **FAIL**, at `git-repository-adapter.integration.test.ts:631`:
`expect(fs.existsSync(dirty.mounted.folder)).toBe(true)` → received `false`. With `--force`, git deletes
the dirty worktree and the agent's uncommitted `uncommitted.txt` with it — which is exactly the loss the
ruling forbids. Restored with `git checkout -- layers/agent-orchestration/run-orchestration/src/mounter.ts`;
`git status --short` was empty before this file was written. The green run's own log shows the real git
refusal being logged as a skip: `fatal: '…/dirty-repo' contains modified or untracked files, use --force`.

## Size

Production only (tests and `.pipeline/` excluded): **+415 / −227** raw, **+231 / −160** excluding comments
and blank lines, against the design's estimate of ~215 / ~150. On target; nowhere near the stop.
