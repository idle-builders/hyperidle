# Codex sandbox trust

## What was broken

Codex agents in HyperIdle never worked. `codex-cli` (0.150.1) refuses to run
with "Not inside a trusted directory and --skip-git-repo-check was not
specified" and exits before the model is ever called. HyperIdle spawns every
codex session inside its own session sandbox, a plain directory with no git
repo and no trust declared anywhere. Every codex session died at startup,
silently, with no LLM call ever made.

An earlier attempt at a fix passed `--skip-git-repo-check` to the codex spawn
args, masking the symptom rather than satisfying the precondition. The next
attempt (BA2 ruling 18) removed the bypass flag and instead wrote codex's own
`[projects."<path>"] trust_level = "trusted"` declaration into
`.codex-home/config.toml` — but this alone does **not** satisfy `codex exec`'s
precondition, proven independently by a reviewer and reproduced here on the
installed binary:

| sandbox is a git repo | `trust_level = "trusted"` declared | `codex exec` runs |
|---|---|---|
| no  | no  | fails: "Not inside a trusted directory..." |
| no  | yes | fails: identical message |
| yes | no  | **runs** |
| yes | yes | **runs** |

The refusal tracks git-repo-ness alone; the trust declaration made no observed
difference in either direction. The end-to-end test that was cited as proof
of the ruling-18 fix (`cli-adapter-real-binary.integration.test.ts`) `git
init`s the sandbox itself before spawning codex, so it passed for the wrong
reason and could never have caught this — removing the trust declaration
entirely still leaves that test green, because the git repo it hand-rolls is
what was actually satisfying codex all along.

## The fix (BA2 ruling 22)

1. **Make the session sandbox a git repository.** `ensureSandboxGitRepo`
   (`run-orchestration/mounter.ts`) runs a bare `git init --quiet` on the
   sandbox — no initial commit; verified empirically that a repo with zero
   commits satisfies codex's check exactly as well as one with a commit. It
   is a no-op when `.git` already exists.

   This must run **after** Phase 4.5 filesystem mounting, never before:
   `GitCloneAdapter` and `GitWorktreeAdapter` (the two mount adapters that
   write straight into `sandboxPath` for a "code" filesystem) both call real
   git commands (`git clone`, `git worktree add`) that refuse a target
   directory which already contains a `.git` — verified empirically ("already
   exists" / "not an empty directory"). Mounting a code filesystem already
   makes the sandbox a git repo as a side effect; `ensureSandboxGitRepo` only
   inits when mounting didn't already do that (the no-filesystem and
   doc_set-only sessions — exactly where the original bug lived).
   `run-orchestration/provisioner.ts` calls it unconditionally, right after
   the Phase 4.5 mount block, regardless of whether a mounter is configured.

   A versioned scratch directory is also useful beyond codex: an agent
   working in it can diff or revert its own work.

2. **Keep the trust declaration**, per the founder's ruling, as the general
   shape: where a harness has its own trusted-directory mechanism, declare
   the filesystems we inject as trusted through it — regardless of whether it
   was observed to be load-bearing for this specific codex-cli precondition.
   No code change here beyond what ruling 18 already shipped
   (`cli-mcp-config.ts`'s `buildCodexTrustBlock`).

3. **Two related defects, fixed while in this area:**
   - `run-orchestration/mounter.ts`'s `localTrustedPath` returned a local code
     filesystem's `repo` path verbatim, but `isLocalRepoPath` accepts `~/`,
     `./`, `../` and `file://` spellings — none of which are real filesystem
     paths a harness's trust config can use. `normalizeLocalPath` expands
     `~`, resolves relative segments, strips a `file://` scheme, and
     canonicalizes through `realpathSync`.
   - `cli-mcp-config.ts`'s `buildCodexTrustBlock` interpolated a trusted path
     (a doc_set folder name — user-influenced) into the TOML string
     unescaped. A `"` or newline in that value broke the file or let the rest
     be parsed as arbitrary TOML keys. `escapeTomlString` now escapes
     backslash, quote, and the three C0 whitespace escapes TOML defines.

## Lore corrections

- `adapter-pool.ts`'s `@lore BA2 ruling 18` comment claimed "it is not a
  git-repo check" and that a prior commit "removed"
  `--skip-git-repo-check`. Both are wrong: it empirically IS a git-repo
  check (see the table above — the earlier probe never tried a git repo
  WITHOUT a trust declaration, so it never saw the trust entry doing
  nothing), and `--skip-git-repo-check` was never present on `main` at all —
  it existed only inside an abandoned branch. Corrected under ruling 22,
  with the full verification matrix inline.
- `cli-mcp-config.ts`'s `buildCodexTrustBlock` comment made the same false
  claim ("codex refuses to run... unless [trust_level] carries trusted") and
  is corrected the same way: the block is kept as the general
  declare-what-we-inject-as-trusted shape, not because it changes whether
  `codex exec` runs.

## How it was proven

- Red-before-green, `local-sandbox-adapter`/`mounter-registry` test suite
  (`run-orchestration/src/__tests__/mounter-registry.test.ts`,
  `describe("ensureSandboxGitRepo")`): reverting `ensureSandboxGitRepo` to a
  no-op turns "initializes a bare sandbox... as a git repository" red;
  restored, green. A separate test proves the ordering constraint directly —
  mounting a fake code filesystem into the sandbox first, then calling
  `ensureSandboxGitRepo`, must be a no-op that never touches the mount's own
  `.git`.
- `mounter-registry.test.ts`'s `describe("localTrustedPath")`: four new
  cases (red before the `normalizeLocalPath` fix, green after) covering
  `~/`, `./`, `file://`, and a real symlink resolved to its canonical path.
- `cli-mcp-config.test.ts`: a new case proves a quote+newline payload in
  `trustedPaths` is escaped into a single `[projects."..."]` table rather
  than injecting a second TOML table (red before `escapeTomlString`, green
  after).
- `cli-adapter-real-binary.integration.test.ts`'s codex test rebuilt to
  exercise **production's own provisioning path**: `LocalSandboxAdapter.spawn()`
  (the exact adapter `run-orchestration`'s provisioner uses to create a
  session sandbox) followed by `ensureSandboxGitRepo` (the exact function it
  calls afterwards) — same two calls, same order, as the real
  session-provisioning flow, replacing the hand-rolled `git init` +
  `git commit --allow-empty` that let the previous version of this test pass
  regardless of whether production actually initialized anything.
  Red-before-green: with the `ensureSandboxGitRepo` call removed from the
  test, the real codex binary fails with "ADAPTER PROOF FAILED: no completion
  event from codex" (codex exits before ever emitting one, per the table
  above); restored, the test passes end-to-end against the real, logged-in
  `codex` 0.150.1 binary with a real LLM turn and no bypass flag anywhere in
  the spawn args.
- `npm run check` and `npm run lint` exit 0. harness-registry, run-orchestration
  and agent-execution suites pass in full.
