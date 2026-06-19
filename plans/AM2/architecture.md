# AM2 Architecture — Real Harness Capability Descriptor

Date: 2026-06-20

## Required reading

- `.pipeline/work-packages/TRACK-AM.md` § AM2 — revised workpackage with failed-review notice and real-harness proof ACs.
- `plans/AM2/concept.md` — failed-review concept, real harness capability, research dossiers.
- `plans/AM2/research/cli-harness-surface.md` — local CLI probes for Codex, Claude Code, OpenCode, Cursor.
- `plans/AM2/research/t3code-source-map.md` — t3code source paths for provider/harness discovery, auth, launch, status, events, UI.
- `docs/agent-layer/harness-capability-descriptor.md` — ground truth contract.
- `docs/architecture/kernel-strategy-split.md` §§ 1, 2a, 6.
- `docs/agent-layer/model-routing-and-cost.md` § 6.
- `docs/process-layer/canonical-shapes.md` Money and TokenUsage entries.
- `docs/agent-layer/harness-error-taxonomy.md`.
- Existing HyperIdle harness code:
  - `packages/shared/src/harness/harness-capability-descriptor.ts`
  - `packages/shared/src/harness/harness-adapter.ts`
  - `packages/shared/src/harness/harness-event-normalization.ts`
  - `packages/server/src/harness/adapter-pool.ts`
  - `packages/server/src/harness/harness-capability-descriptors.ts`
  - `packages/server/src/harness/builtin-harness-adapter.ts`
  - `packages/server/src/harness/claude-agent-sdk-adapter.ts`
  - `packages/server/src/harness/cli-harness-adapter.ts`
  - `packages/server/src/routes/harnesses.ts`

## Plan reconciliation

| Spec assumption | Reality | Plan adjustment |
|---|---|---|
| Known CLI harnesses (`codex`, `claude-code`, `cursor-agent`, `opencode`) are known families. | `cursor`/`cursor-agent` is not installed and has no usable local CLI surface. | Descriptor builder treats `cursor-agent` as `unavailable` with an explicit reason, not as a missing/unauthenticated family to install.
| CLI harnesses can be registered from a static config table. | Existing `CLI_TOOL_CONFIGS` only covers `aider`, `goose`, `opencode`; `codex` and `claude` are not wired. | Add dynamic discovery; only register adapters when the binary is found and the registration can point at real launch args. For AM2 we surface descriptors via discovery rather than registering full runtime adapters, because event normalization still needs per-CLI mapping that is not yet fully proven.
| `missingKnownHarnessDescriptors` can fill in default capabilities. | Default `fileEditing`/`toolUse: true` for missing harnesses is a guessed claim. | For missing/unavailable harnesses set runtime capability booleans to `false`; only set `true` when the live family is proven or when a real registered adapter declares it.
| `builtin` harness is always ready. | Default gateway is Anthropic; only `OPENAI_API_KEY` is present in this environment. | Built-in readiness is keyed to the configured provider credential. If absent, descriptor reports `unauthenticated` with the missing credential name.
| `ClaudeAgentSdkAdapter` is the `claude-code` harness. | It is an internal SDK runtime that requires an Anthropic API key; the public `claude` CLI is a separate installed surface. | Keep the SDK adapter registered for existing session-routing tests. Add descriptor-level real discovery from the `claude` CLI via `claude auth status`. The runtime mismatch is noted as an unresolved boundary: a future workpackage should either migrate `claude-code` to the CLI adapter or split the internal SDK path into its own harness type.
| t3code uses a single `ServerProvider` snapshot. | HyperIdle has an `AdapterPool` + `/api/harnesses` route. | Preserve existing registry shape; add a discovery map that feeds descriptor emission so `/api/harnesses` reports evidence-backed readiness.

## Acceptance criteria + verification

1. **Research dossiers exist and trace to source.**
   - Verification: Read `plans/AM2/research/cli-harness-surface.md` and `plans/AM2/research/t3code-source-map.md`; assert they name exact t3code files/functions, exact CLI commands, and observed outputs.

2. **Descriptor builder only emits claims backed by evidence.**
   - Unit test `AM2-harness-capability-descriptors.test.ts`: passes a probe-state map into `missingKnownHarnessDescriptors`; asserts that a missing/cursor family has `discovery.state` of `missing` or `unavailable`, empty models, and `fileEditing`/`toolUse` false. Asserts `describeRegisteredHarness` copies the supplied `discovery`/auth action/caps rather than inventing defaults.

3. **Real binary discovery is implemented.**
   - Unit/integration test `AM2-real-harness-discovery.integration.test.ts`: calls `discoverLocalHarnesses()` and asserts that installed binaries (`codex`, `claude`, `opencode`) return `ready` or `unauthenticated` with precise reasons; asserts `cursor-agent` returns `unavailable` with reason; asserts built-in gateway probe returns `ready`/`unauthenticated` keyed to the configured provider credential. Uses `test.skipIf` when the prerequisite is absent.

4. **`/api/harnesses` reflects real discovery and leaks no secrets.**
   - Integration test `AM2-harness-capabilities.integration.test.ts`: mounts the router with a pool fed by real discovery; asserts each first-class family appears, every `ready` claim is backed by an installed/authenticated binary or credential, no API keys/base URLs in JSON, and cursor is `unavailable`.

5. **Event normalization uses captured real output fixtures.**
   - Unit test `harness-event-normalization.test.ts` already covers the generic union. AM2 adds captured fixture cases: a Claude CLI `result` event line and a Codex `--json` `thread.started`/`turn.completed` line, showing the normalize function maps native shapes to the HyperIdle union and maps unknown native types to `error` with code `UnknownHarnessEvent`.

6. **No per-backend branching in descriptor shape.**
   - Type-level check: `HarnessCapabilityDescriptor` has no optional backend-specific fields. ESLint keeps the no-per-backend-branch rule. Reviewer manual check on `harness-capability-descriptors.ts`.

7. **`npm run check`, `npm run lint`, `npm run test`, `npm run test:integration` pass.**
   - Verification: run the commands before marking done.

## Ordered task list

1. **Write CLI surface research dossier** — done in `plans/AM2/research/cli-harness-surface.md`.
2. **Confirm t3code source map** — existing `plans/AM2/research/t3code-source-map.md` covers t3code files/functions.
3. **Implement discovery layer** (`packages/server/src/harness/harness-discovery.ts`):
   - `probeCodexCli()`, `probeClaudeCodeCli()`, `probeOpenCodeCli()`, `probeCursorAgentCli()`, `probeBuiltinGateway()`.
   - Each runs version/auth commands via `child_process.spawn` and parses public, non-secret output.
   - Exports `discoverLocalHarnesses()` returning a map keyed by known family.
4. **Update descriptor builder** (`packages/server/src/harness/harness-capability-descriptors.ts`):
   - Add optional `discoveries` argument to `describeRegisteredHarness` and `missingKnownHarnessDescriptors`.
   - Default missing/unavailable families to no models and conservative runtime flags (`fileEditing`/`toolUse: false`).
   - Map real discovery state to `HarnessDiscoveryStatus` with version/reason.
   - Keep existing `builtin` descriptor defaults but allow an injected discovery to override readiness.
5. **Wire discovery into `AdapterPool`** (`packages/server/src/harness/adapter-pool.ts`):
   - Add `createLocalAdapterPool({ discover? })` injection for testability.
   - `listCapabilityDescriptors` calls discovery once per invocation and passes the map to descriptor builders.
6. **Keep `GET /api/harnesses` unchanged** — it already calls `pool.listCapabilityDescriptors();` no route change needed.
7. **Update tests**:
   - `packages/server/src/harness/__tests__/AM2-harness-capability-descriptors.test.ts` — add probe-state test case.
   - `packages/server/src/harness/__tests__/AM2-real-harness-discovery.integration.test.ts` — new file, real binary tests with skip reasons.
   - `packages/server/src/routes/__tests__/AM2-harness-capabilities.integration.test.ts` — use real discovery.
   - `packages/shared/src/harness/__tests__/harness-event-normalization.test.ts` — add captured Claude + Codex JSONL fixture cases.
8. **Update `docs/agent-layer/harness-capability-descriptor.md`** as-built note: list research dossiers and explicit cursor unavailability.
9. **Update `.pipeline/progress/AM2.json`** from `blocked` to a new step reflecting rework.
10. **Run verification gates** — `check`, `lint`, `test`, `test:integration`.

## Type signatures / schemas

### New: `HarnessDiscoveryInput` (probe result consumed by descriptor builder)

```ts
export interface HarnessDiscoveryInput {
  readonly state: HarnessReadinessState;
  readonly version?: string;
  readonly reason?: string;
  readonly authAction?: HarnessAuthActionDescriptor;
  readonly models?: readonly HarnessModelDescriptor[];
  readonly runtime?: Partial<HarnessRuntimeCapabilities>;
}
```

### Existing shared types remain unchanged

- `HarnessCapabilityDescriptor` (shared)
- `HarnessReadinessState`: `"missing" | "installed" | "unauthenticated" | "ready" | "unavailable"`
- `HarnessAuthActionKind`: `"enter_api_key" | "native_cli_login" | "none"`
- `HarnessModelDescriptor`, `HarnessModelOptionDescriptor`

### Discovery function signature

```ts
export interface HarnessDiscoveryResult {
  readonly codex: HarnessDiscoveryInput;
  readonly "claude-code": HarnessDiscoveryInput;
  readonly opencode: HarnessDiscoveryInput;
  readonly "cursor-agent": HarnessDiscoveryInput;
  readonly builtin: HarnessDiscoveryInput;
}

export async function discoverLocalHarnesses(
  deps?: {
    run?: (args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
    env?: NodeJS.ProcessEnv;
  },
): Promise<HarnessDiscoveryResult>;
```

## Security & abuse cases

| Concern | Treatment |
|---|---|
| Secret leakage in descriptors | Descriptors never contain API keys, base URLs, subscription tokens, or auth files. Auth actions reference credential names only. |
| CLI command injection | Discovery runs commands with hard-coded argument arrays (no shell), no user input. Spawning uses `execFile` / array spawn. |
| Reading provider CLI auth files | AM2 only observes stdout of public commands; it never reads `~/.codex/auth.json`, system keychain, or `~/.local/share/opencode/auth.json`. |
| Timing / resource abuse | Discovery commands have short timeouts and are run on-demand at route time, not in tight loops. |
| Built-in gateway credential proof | Real test only runs when the relevant key is present and uses a cheap or free endpoint; no key is logged. |

## Migrations

- No database schema migration.
- No route changes.
- Test updates in existing AM2 test files; existing tests in other suites that assert `claude-code` presence must not change their runtime assertions (the pool will still register `claude-code` via the SDK adapter, so existing expectations remain satisfied).
- `Cursor`/`cursor-agent` descriptor changes from `missing` to `unavailable` with explicit reason. AM4 onboarding should treat `unavailable` differently from `missing` (no install prompt for Cursor).

## Shared files

- `packages/shared/src/harness/harness-capability-descriptor.ts` — no breaking changes, only consumption.
- `packages/server/src/harness/adapter-pool.ts`
- `packages/server/src/harness/harness-capability-descriptors.ts`
- `packages/server/src/routes/__tests__/AM2-harness-capabilities.integration.test.ts`
- Possible touch: `packages/server/src/harness/cli-harness-adapter.ts` if we refactor for reuse.

## Protected tests

Do not change the assertion intent of:
- `packages/server/src/harness/__tests__/claude-agent-sdk-adapter.security.test.ts`
- `packages/server/src/harness/__tests__/X5-cli-harness-adapter.test.ts`
- `packages/server/src/routes/__tests__/AH2-harnesses.integration.test.ts`

## Risks / ambiguities

- **Risk:** The existing `ClaudeAgentSdkAdapter` runtime and the local `claude` CLI do not share auth. A user whose `claude` CLI is logged in but has no Anthropic API key will see a ready descriptor but a session would fail with `MissingCredentialError`. This is flagged in the architecture as an unresolved boundary; the AM2 descriptor is evidence-based, but full runtime alignment is out of scope unless tests prove the SDK path too.
- **Risk:** OpenCode event normalization is not yet proven with a real session fixture. The descriptor will set `fileEditing`/`toolUse` based on documentation only if available; otherwise it will leave them `false` and document the gap.
- **Risk:** Codex JSONL schema may drift between versions. The normalization function is intentionally permissive (unknown → `error`) so drift degrades gracefully rather than crashes.
- **Risk:** CI may not have `codex`/`claude`/`opencode`. Tests must skip with precise reasons; a missing binary must not fail the suite.

## Route checklist

N/A — no new routes, no middleware changes. `GET /api/harnesses` already exists and will continue to return descriptors.

## Design-it-twice notes

The decision of whether to register real CLI runtime adapters now vs only emit descriptors was the main alternative.
- Option A: Build full `CodexCliAdapter`, `ClaudeCodeCliAdapter`, `OpenCodeCliAdapter` and route sessions through them. Rejected: it requires per-CLI event parsing and credential handling that exceeds the AM2 evidence-first scope and would ripple into sessions, tests, and existing SDK adapter expectations.
- Option B: Emit descriptors from a real discovery layer while leaving the runtime adapters unchanged. Selected: it satisfies the failed-review requirement (real research, real auth/version probes, real integration tests) without breaking existing session routing. Runtime adapter work becomes a follow-up extension.
