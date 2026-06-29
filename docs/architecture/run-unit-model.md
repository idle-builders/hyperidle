# Run-Unit Model — As Built (AQ1)

An agent session runs in a **per-session working directory on the host machine**. The agent binary (Claude Code CLI, codex, opencode, or the builtin SDK loop) spawns as a **host child process** — same user account, same `$HOME`, same environment. There is no isolation boundary. The working directory is created at session start and deleted when the session ends.

This is the only local run path as of AQ1. The code noun `Sandbox*` (`SandboxAdapter`, `LocalSandboxAdapter`) names the working-directory abstraction, not an isolation layer.

## Lifecycle

```
spawn    → mkdir working dir under $HYPERIDLE_WORKSPACES_DIR
         → AN2 provisioning applies held connections into the dir
         → harness starts as a host child process (cwd = working dir, env = PATH/HOME/LANG from host)
session  → agent reads/writes the working dir; inherited tools available via real $HOME
destroy  → rm -rf working dir
```

Inherited tools (e.g. `gh`, `git`) work with no per-session login — the harness reads the real `$HOME`, so `~/.config/gh`, `~/.ssh`, and other user config are accessible.

## Two independent axes

The run-unit is shaped by two orthogonal concerns:

| Axis | What it controls | AQ1 status |
|---|---|---|
| **Scheduling / distribution** | *Where* a task runs — this desktop, or a joined remote desktop | Kept. A joined remote desktop runs the task host-local via `RemoteHarnessAdapter`; it is distribution, not isolation. End-to-end transport is stubbed; AQ3 completes it. |
| **Isolation** | *How isolated* the agent runs — a per-**agent** property | Deferred to AQ2. No isolation machinery exists. |

These axes are independent. "Remote" does not mean "isolated." A task dispatched to a joined desktop executes host-local there, exactly as it would on the local desktop.

## SandboxAdapter implementations

After AQ1, two implementations of `SandboxAdapter` exist:

| Class | Role |
|---|---|
| `LocalSandboxAdapter` | The host run path. Creates the working dir, sets `cwd` for the harness spawn, removes the dir on destroy. |
| `DisabledSandboxAdapter` | Server-profile boot guard. Refuses to provision sessions. Not isolation — it prevents any agents from running on a shared backend where `HYPERIDLE_PROFILE != laptop`. |

`DockerSandboxAdapter` and `IsolatedHarnessAdapter` were deleted in AQ1. They created the appearance of isolation while the default path already ran host-local. See `plans/AQ1/concept.md` for the rationale.

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `HYPERIDLE_WORKSPACES_DIR` | Base directory for working dirs | `os.tmpdir()/hyperidle-workspaces` |
| `HYPERIDLE_PROFILE` | Must be `laptop` for `LocalSandboxAdapter`; server profiles use `DisabledSandboxAdapter` | — |
| `HYPERIDLE_WORKER_TOKEN` | Join token for remote workers (distribution axis) | — |

## Why no isolation now

ETHOS §2: security is earned from real learnings, not built preemptively. The single-user laptop case is served directly — the user trusts their own machine and their agents. Isolation adds friction without a concrete threat model to justify it. When a shared-server or untrusted-code case arises, AQ2 will add opt-in isolation as an explicit per-agent property designed from research.

## Capture Seam — `onBeforeTeardown` (AR2)

The `destroy` step deletes the working directory via `fs.promises.rm`. Normally nothing observes those files — they are ephemeral by design. For testing purposes `ProvisionSessionDeps` exposes one optional observation hook:

```ts
interface ProvisionSessionDeps {
  // ...
  readonly onBeforeTeardown?: (ctx: BeforeTeardownContext) => void | Promise<void>;
}

interface BeforeTeardownContext {
  readonly sessionId: string;
  readonly sandboxPath: string;
}
```

`runSession` fires it once after the agent's turn fully drains and the sandbox is written, **before** `endSession`/`crashSession` delete the directory (`session-lifecycle.ts:341`). If the hook throws, the error is logged and swallowed — teardown always runs. Production callers omit this field entirely (no behavior change). The hook is strictly for test observation; it cannot pause, defer, or cancel teardown.

This is the correct and only observation window: the drain has completed (`harness.stopSession` has returned, all native writes flushed, the adapter slot released), but neither `endSession` nor `crashSession` has been called yet. Any earlier hook would see an incomplete sandbox; any later hook would observe an already-deleted directory.

### Harness Integration Pattern (AR2 — template for AR3–AR6)

Harness integration tests that need to assert on real agent output use this four-step recipe (`packages/server/src/harness/__tests__/provision-real-session.ts`):

1. `requireHarness(<name>)` at `describe` scope — hard-fail if the harness is absent, never `skipIf`.
2. Seed domain rows; `setActiveStrategy(fabricStrategy)`; register the real adapter in an `AdapterPool`; set up `LocalSandboxAdapter`; CLI harnesses also need `startMcpBridgeServer()`.
3. `const cap = createSandboxCapture()`; pass `onBeforeTeardown: cap.onBeforeTeardown` into `ProvisionSessionDeps` alongside real deps; `await provisionSession(deps, params)`.
4. Assert on `cap.files` (relative path → string content, populated when the seam fired) and/or DB rows the agent's tools wrote and/or `result`.

The helpers `createSandboxCapture` and `startMcpBridgeServer` are exported from `packages/server/src/harness/__tests__/provision-real-session.ts`. See `.claude/rules/testing.md` §Integration tests: two archetypes for the rule-level description.

## Next steps

- **AQ2** — opt-in isolation as a per-agent property, built from research. The run-unit model here is the baseline AQ2 builds on top of.
- **AQ3** — full remote transport implementation (the joined-desktop scheduling path end-to-end).
