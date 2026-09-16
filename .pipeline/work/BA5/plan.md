# BA5 — The filesystem works

## What we need

A filesystem someone configures actually works: the agent's working folder really contains their
repository or their folder, with or without credentials, and the agent's work gets back out. Proven
both ways on the running app. The registered package (2026-08-17) was voided by the maintainer on
2026-09-10; its framing was also stale — see `seams.md` for what the code really does.

### Where it breaks today
1. Nothing can create a filesystem that uses a connection — Settings' *Add filesystem* does nothing.
2. Onboarding registers a filesystem but picks it for no agent, so nothing is ever mounted (BA14).
3. The clone carries no credential, and a public remote repo with no connection cannot mount at all.
4. A failed mount tells nobody — the agent runs in an empty folder.
5. Checking a connection cannot catch a revoked token, and nothing in the product calls it.
6. Every resume of an agent with a repository already fails its mount, silently.
7. Every session end destroys the workspace, so an agent resumed after a verdict loses its files (BA12).

### Rulings
- **The workspace is the person's own computer**, composed per agent: **everything it needs, no
  bloat.** Filesystems stay picked per agent; onboarding picks for the agent it creates. No sandbox
  platform, no vendor remote workspace (`research.md`).
- **We assemble and drive existing tools; we don't build them.** Authentication belongs to each
  service's official CLI; the agent inherits the person's logins through their real home folder. A
  stored PAT is only a fallback, handed to the CLI through its own variable. No OAuth, no sync engine.
  **We ship detection** of the CLIs a workspace needs — installed, logged in. Installing them and
  guiding login through them come later.
- **One git adapter** replaces the two: clone if needed, then a worktree — always, for now; a setup
  without one may come later. The old two are deleted.
- **Work gets out by kind.** Git: the agent commits and pushes. Folder: worked in place. Drive: the
  agent puts changes back through the Drive CLI itself.
- **A filesystem that cannot be put in place puts the agent's sessions on hold — not the task.** The
  task stays ready, just not started. The person is told once; the sessions start when it works again.
- **Google Drive is phase 2**, through a CLI both the agent and HyperIdle can steer.
- **No teardown (2026-09-16, absorbs BA12).** A folder or Drive filesystem is a reference to a place
  that lives until a person deletes it; it may be shared by several teams. Putting it in place only
  coincides with an agent starting when the place does not exist here yet. Only a git worktree is
  disposable — isolation of the repository, not removal of it — and it goes when the task is done; the
  branch keeps everything. Removing anything is a doesn't-matter op: skipped or failed, nothing is lost.

**Out:** isolation, OAuth, a sync engine, Dropbox, S3, renaming `sandbox`.

## How it works

**When a session starts**, before the agent runs:
1. **Its filesystems are the ones picked for it.**
2. **Each goes into the workspace, in its own named folder.** A **git repository** has one kept copy
   — the person's own repo if local, or one HyperIdle clones once and fetches afterwards if remote — and
   the session gets its own worktree off it, on the configured branch, on a branch of its own. A
   **folder** is linked in as it is; the agent works on the real files. A **Google Drive** folder has one
   kept copy too, brought down with `rclone` once and refreshed before each session; the agent puts its
   changes back with `rclone` itself, as it pushes git. **Every place lives outside the session's
   directory** — the session only links to it, so losing the session directory loses nothing.
3. **The agent is told what it has** — each filesystem, where it sits, and how its work gets out.
   Today its instructions never mention what was mounted.
4. The agent starts.

**Credentials are the CLIs'.** Git asks `gh` for them — set for the clone and for the agent's process
only, never written into the person's config. `gh` uses the person's login, or the stored PAT of the
filesystem's connection. `rclone` holds its own Drive login. A credential never lands in the workspace,
a stored run or a log. A public repository needs only git. HyperIdle stops building login headers.

**Detection and Check.** Each filesystem knows which CLIs it needs. *Check* asks each one whether it is
installed, logged in, and can reach the resource — using the CLI's own status command where it has one.

**When a filesystem cannot be put in place** — repository gone, no access, a CLI missing, folder moved —
the session does not start. It waits, the way a session already waits when too many are running, and
so does every other session of that agent, since they all need the same workspace. The task stays
ready and not started. The filesystem is marked *needs attention* with the reason, and **one**
notification names the agent, the filesystem and what to fix. When the person fixes it and *Check*
passes, the waiting sessions start. Nothing retries a broken filesystem on its own.

**A resumed session reuses its workspace**, so a filesystem already in place is recognised and left
alone — without this, the resume bug above would hold every resume of an agent with a repository.

**When a session ends, nothing is torn down.** Kept copies and the person's folders stay where they are
until the person deletes the filesystem. The worktree stays until the task is done — a session resumed
after a verdict finds its files as it left them (BA12's case) — and is then removed; the branch stays.
If that removal fails, nothing cares.

**Surfaces**, on existing patterns: a real *Add filesystem* dialog, a *Check* action, *needs attention*
with its reason and any missing CLI, and the inbox notification. **Goes away:** the two git adapters,
the write-back setting, the unused connection check, the session-end unmount and workspace destroy.

**Deliberately simple:** one shared inbox (BA7 adds per-person addressing); a private GitLab repository
relies on the person's own git setup; Google Docs and Sheets are not files — editing them is a tool's
job. `rclone` needs a one-time Google setup the person does, which Google forces on every Drive CLI;
whether its login then expires weekly is checked in phase 2. Making setup easy is a later UX design
(maintainer: every tool expects some user setup). Moving sessions off the person's computer
would break inherited logins.

## How we work on this

- **G1 — approach. PASSED 2026-09-11.** This section approved before anything is built. Surfaces follow existing
  patterns: approved in words here, shown live at G2.
- **G2 — phase 1 proven on the running app:** a local repository, a public remote, a private remote
  through a `gh` login and through a PAT, a folder; a broken filesystem holding the agent, one
  notification, and starting after *Check*; a resume. **PASSED 2026-09-15** on the packaged desktop app.
- **G2b — no teardown, proven on the running app:** a session end leaves the worktree and the kept copy;
  a resume finds the files; task done removes the worktree and keeps the branch. **PASSED 2026-09-16** on the
  packaged desktop app: clean worktree removed and branch kept on GitHub; dirty worktree kept, skip logged.
- **G3 — before ship:** Drive through `rclone` proven, the filesystem doc brought up to date, one
  CI-green PR. The maintainer merges. **Status 2026-09-17:** Drive proven against a local rclone backend;
  the real Google account proof is the maintainer's (`architecture-phase2.md` §9.4); the doc is updated;
  the branch is rebased on main; the harness lane is running; the PR follows.
- **Size accepted (maintainer, 2026-09-11):** the rulings add up to ~2,000–2,400 lines; built in six
  ordered steps, each ending green. The no-teardown change (2026-09-16) is mostly deletion.
- A fresh reviewer per phase over the integrated diff. Dials: suite · new context · user-facing surface.

## Confusions

- `docs/process-layer/filesystem-primitive.md` is authoritative and already stale (capture-back into a
  deleted table, a moved package, write-back as a contract). Updating it is a deliverable.
- A comment in admission claims failures happen before the session record exists; it does not.

## Proposed items

- **Install the CLIs a workspace needs, and guide login through them** — maintainer, 2026-09-11, "later".
- **Rename `sandbox` → `workspace`** — reverses AK1; 2,012 occurrences plus a column migration.
- **Correct BA14's recorded cause** — this package now fixes it; touching BA14's folder needs your word.
- **Dead `Provisioner.mount`** — no callers, tests included. (The full-migration rule now deletes it inside
  this package.)
- **Two more files carry NUL bytes** — `layers/core-ui/src/block/block-id.ts` and its test. Git shows them
  as binary, so they are unreviewable in any diff and invisible to plain grep. Pre-existing; found by the scan
  this package's own fix prompted. (The full-migration rule now deletes it inside
  this package.)
- **Connections page shows GitHub working whenever `gh` is installed, even logged out** — an existing
  detection bug found by the critique; not fixed here.
