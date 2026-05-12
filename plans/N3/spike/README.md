# N3 Spike — Agent Execution Scope Decision

Proves that `LocalWorkspaceAdapter` + any `HarnessAdapter` implementation can be wired through `provisionSession` end-to-end without modifying production code.

## Run

```bash
bun run plans/N3/spike/run-spike.ts
```

Results are captured to `plans/N3/spike/results.txt`.

## What it proves

1. **Interface contract holds.** `provisionSession` composes `WorkspaceAdapter` + `HarnessAdapter` without referencing concrete classes. Both `MockHarnessAdapter` (Phase B) and `StubHarnessAdapter` (Phase C) complete successfully through the same `LocalWorkspaceAdapter`.

2. **Adapter swap is a one-assignment change.** Swapping `MockHarnessAdapter` for `StubHarnessAdapter` requires zero changes to workspace wiring, DB seeding, or provisioning logic. The next adapter (Cursor, Codex, custom) drops in the same way.

3. **Surface is characterized.** Phase E enumerates binaries (`sh`), filesystem paths (workspace subdirectories), env vars (allow-list in `ClaudeAgentSdkAdapter`, full `process.env` in `LocalWorkspaceAdapter.exec()`), and network calls (vendor API only).

## Phases

| Phase | Adapter | What it tests |
|-------|---------|---------------|
| B | `MockHarnessAdapter` | Deterministic end-to-end proof with the existing mock |
| C | `StubHarnessAdapter` | Harness-agnostic swap — a second adapter proving the interface |
| D | `ClaudeAgentSdkAdapter` | Real vendor smoke test (requires `ANTHROPIC_API_KEY`) |
| E | N/A | Surface audit: binaries, filesystem, env, network |

## Environment notes

- Uses `bun:sqlite` + `drizzle-orm/bun-sqlite` because `better-sqlite3` is not supported by Bun's native runtime. The Drizzle ORM abstraction is driver-agnostic — same pattern as the harness abstraction being adapter-agnostic.
- `NODE_ENV` must not be `"production"` (LocalWorkspaceAdapter's constructor guard).
