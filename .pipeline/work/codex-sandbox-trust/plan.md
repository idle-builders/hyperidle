# Codex sandbox trust

## What was broken

Codex agents in HyperIdle never worked. `codex-cli` (0.150.1) refuses to run
in any directory it does not consider trusted — it prints "Not inside a
trusted directory" and exits before the model is ever called. HyperIdle
spawns every codex session inside its own session sandbox, a plain directory
that was never declared trusted anywhere. Every codex session died at
startup, silently, with no LLM call ever made.

This was discovered as a side effect of unrelated work, not reported by any
user or test — nothing in the suite exercised the real codex binary against a
freshly created, untrusted sandbox.

An earlier attempt at a fix passed `--skip-git-repo-check` to the codex spawn
args. That masked the symptom for one binary version but was wrong on two
counts: the message is not a git-repository check (codex runs fine outside
git), it is codex's own trust check; and bypassing a check is not the same as
satisfying it. A bypass flag makes the refusal disappear without making
anything trusted — brittle (tied to exact flag/version behavior) and against
the standing rule this fix restates: when a harness refuses on trust, grant
the trust through its own mechanism, never reach for the flag that silences
the refusal.

## The fix

Codex has its own trust-declaration mechanism: a `[projects."<path>"]
trust_level = "trusted"` entry in `config.toml`. HyperIdle already writes
`<sandbox>/.codex-home/config.toml` for the MCP bridge entry it wires codex
up with, so the trust declaration is added right beside it, in the same file,
by the same writer.

What gets declared trusted comes from the filesystem primitive: the session's
sandbox, plus any of its mounted filesystems that live at a real path outside
the sandbox (a local folder symlinked in, or a git worktree backed by a local
repo — a cloned repo has no separate path and is already covered by the
sandbox's own declaration).

Changes:
- `cli-mcp-config.ts` — `writeCliMcpConfig`'s codex-toml dialect now appends a
  dedup'd trust block for the sandbox path plus any caller-supplied
  `trustedPaths`, alongside the MCP entry it already writes.
- `adapter-pool.ts` — `--skip-git-repo-check` removed from the codex spawn
  args; the `@lore` comment explains why it was wrong and points at the real
  fix.
- `provision-harness-environment.ts` / `boot.ts` — `trustedPaths` threaded
  generically through the harness-runtime port, so any future harness with
  the same shape of check can reuse the field.
- `run-orchestration/mounter.ts` — a new `localTrustedPath` helper: the real
  local path a mounted filesystem stands on, if it has one distinct from the
  sandbox.
- `run-orchestration/provisioner.ts` — the `writeCliMcpConfig` call site
  populates `trustedPaths` from the session's already-mounted filesystems.

## How it was proven

- `cli-mcp-config.test.ts` — four new cases: the sandbox path gets declared
  trusted; each mounted filesystem's real path gets declared trusted
  alongside it; a `trustedPaths` entry equal to the sandbox does not
  duplicate the trust block; the existing `[mcp_servers.hyperidle]` block is
  left undisturbed.
- `cli-adapter-real-binary.integration.test.ts` — its `provisionCodexHome`
  helper drives `CliHarnessAdapter` directly (no bridge, so the production
  provisioning path above isn't in its call chain) and declares its own
  ephemeral sandbox trusted the same way, so the test proves the real codex
  binary will actually start once trust is granted through its own
  mechanism, with no bypass flag on the spawn args at all.
- Full harness-registry unit suite (492 tests), run-orchestration suite (92
  tests), and agent-execution suite (26 tests) all pass.
- `npm run check` (0 errors across 39 packages) and `npm run lint` both exit
  clean.
- The real-binary integration test was run against the actually-installed,
  logged-in `codex` CLI (0.150.1): `codex CLI adapter (real binary,
  production CliHarnessAdapter path) > drives CliHarnessAdapter
  (CLI_TOOL_CONFIGS.codex) against real codex → completion + outcome
  completed` — passed, ~4.9s, with a real LLM call and no
  `--skip-git-repo-check` or any other bypass flag anywhere in the spawn
  args.
