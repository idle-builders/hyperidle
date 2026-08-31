# Codex sandbox trust

## What was broken

Codex agents in HyperIdle never worked. `codex-cli` (0.150.1) refuses to run with "Not inside a
trusted directory and --skip-git-repo-check was not specified" and exits before the model is ever
called. HyperIdle spawns every codex session inside its own session sandbox — a plain directory with
no git repo and no trust declared. Every codex session died at startup, silently, with no LLM call.

## What the precondition actually is

Two earlier attempts got this wrong. The first passed `--skip-git-repo-check`, masking the symptom.
The second (BA2 ruling 18) removed the bypass and wrote codex's own
`[projects."<path>"] trust_level = "trusted"` into `.codex-home/config.toml` — which does **not**
satisfy `codex exec`'s precondition. Reproduced against the installed binary:

| sandbox is a git repo | `trust_level = "trusted"` declared | `codex exec` runs |
|---|---|---|
| no  | no  | fails: "Not inside a trusted directory..." |
| no  | yes | fails: identical message |
| yes | no  | **runs** |
| yes | yes | **runs** |

The refusal tracks git-repo-ness alone; the trust declaration made no observed difference either way.
The earlier probe never tried a git repo *without* a trust declaration, so it never saw the trust entry
doing nothing. The end-to-end test cited as proof of the ruling-18 fix
(`cli-adapter-real-binary.integration.test.ts`) `git init`s the sandbox itself before spawning codex,
so it passed for the wrong reason and could never have caught this.

## The fix (BA2 ruling 22)

**Make the session sandbox a git repository.** `ensureSandboxGitRepo` (`run-orchestration/mounter.ts`)
runs a bare `git init --quiet` — no initial commit, verified empirically that a zero-commit repo
satisfies codex exactly as well as one with a commit. No-op when `.git` already exists. A versioned
scratch directory is useful beyond codex: an agent working in it can diff or revert its own work.

**It must run after Phase 4.5 filesystem mounting, never before.** `GitCloneAdapter` and
`GitWorktreeAdapter` — the two mount adapters that write straight into `sandboxPath` for a "code"
filesystem — call real `git clone` / `git worktree add`, which refuse a target directory that already
contains a `.git` ("already exists" / "not an empty directory", verified empirically). Mounting a code
filesystem already makes the sandbox a repo as a side effect, so `ensureSandboxGitRepo` only inits
where mounting did not — the no-filesystem and doc_set-only sessions, exactly where the bug lived.
`run-orchestration/provisioner.ts` calls it unconditionally right after the mount block.

**Keep the trust declaration** (founder ruling) as the general shape: where a harness has its own
trusted-directory mechanism, declare the filesystems we inject as trusted through it — regardless of
whether it is load-bearing for this particular codex precondition. No code change beyond ruling 18's
`buildCodexTrustBlock`.

## Two defects fixed in the same area

- `localTrustedPath` returned a local code filesystem's `repo` path verbatim, but `isLocalRepoPath`
  accepts `~/`, `./`, `../` and `file://` spellings — none of which are real filesystem paths a
  harness's trust config can use. `normalizeLocalPath` expands `~`, resolves relative segments, strips
  the `file://` scheme, and canonicalizes through `realpathSync`.
- `buildCodexTrustBlock` interpolated a trusted path (a doc_set folder name — user-influenced) into
  the TOML string unescaped, so a `"` or newline broke the file or let the rest parse as arbitrary
  TOML keys. `escapeTomlString` now escapes backslash, quote, and TOML's three C0 whitespace escapes.

## Lore corrected

`adapter-pool.ts`'s `@lore BA2 ruling 18` claimed "it is not a git-repo check" and that a prior commit
"removed" `--skip-git-repo-check`. Both false: it empirically **is** a git-repo check, and
`--skip-git-repo-check` was never on `main` at all — it existed only in an abandoned branch.
`buildCodexTrustBlock`'s comment made the same false claim. Both corrected under ruling 22, with the
verification matrix inline.

## Proof, and the one hole in it

`cli-adapter-real-binary.integration.test.ts`'s codex test was rebuilt to exercise production's own
path: `LocalSandboxAdapter.spawn()` followed by `ensureSandboxGitRepo` — the same two calls in the same
order as real session provisioning, replacing the hand-rolled `git init` + `git commit --allow-empty`
that let the previous version pass regardless. With the `ensureSandboxGitRepo` call removed, the real
binary fails with "no completion event from codex"; restored, it passes end-to-end against a real,
logged-in `codex` 0.150.1 with a real LLM turn and no bypass flag in the spawn args.

**The hole:** the unit test that proves `ensureSandboxGitRepo` is a no-op over an existing `.git` uses
a `gitRunnerFactory` fake that just writes a `.git` file. It proves the no-op, but it does **not**
prove the call-site ordering in `provisioner.ts`, and it does not prove that real
`git clone` / `git worktree add` refuse a directory with a `.git`. Both are confirmed only against the
real binary, out of band. Anything that reorders provisioning needs that real-binary check again.
