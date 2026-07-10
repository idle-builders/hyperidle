# Track AW: Harness Family Expansion

**What this track is.** Extend HyperIdle's supported agent-harness matrix beyond the current four (`builtin`, `claude`, `codex`, `opencode`) by wiring new installed CLI harnesses through the same production adapter, discovery, settings, and honest-integration-test machinery. Each new harness must reach parity: real `CliHarnessAdapter` config, discovery probe, settings auth/toggle, `SUPPORTED_HARNESSES` membership, locked test model, `SUPPORTED_HARNESS_LANES` entry, and a real-binary integration test lane.

**Scope rules.** Reuse existing harness infrastructure — no parallel adapter type. Every new harness follows the claude/codex/opencode pattern: inherited login (no API key injection), `requireHarness` binary gate, stream-json or ndjson event dialect, and matrix coverage enforced by `honest-harness-guard`.

---

### AW1 — Cursor Agent CLI harness support

**Work package.** As a user who runs Cursor Agent locally, I want HyperIdle to discover, authenticate, and drive my installed `cursor-agent` CLI the same way it drives Claude Code, Codex, and OpenCode — including honest integration tests against the real binary — so I can assign agents to Cursor without a separate workflow.

**Why this matters.** Cursor Agent is installed and authenticated on developer machines (including this one) and exposes a headless `--print --output-format stream-json` surface compatible with the existing CLI adapter. Leaving it marked "unavailable" blocks a real harness users already pay for. Cost of not building: users with Cursor installed still cannot select it; the harness matrix lies about what the machine can run.

**Type.** backend

**What exists today.** `cursor-agent` is in `KNOWN_HARNESS_FAMILIES` and discovery returns `unavailable` (POLISH-060). `CliHarnessAdapter`, `requireHarness`, `SUPPORTED_HARNESS_LANES`, and `cli-adapter-real-binary.integration.test.ts` cover claude/codex/opencode. Settings renders cursor-agent as non-actionable.

**What's genuinely missing.** A `CURSOR_AGENT_CLI_CONFIG`, live discovery/auth probe, adapter-pool registration, fifth matrix lane, locked test model, MCP config dialect (`.cursor/mcp.json`), settings authability, and integration test coverage matching other CLI harnesses.

**Depends on.** None (AR1–AR7 harness honesty infrastructure is done).

**Complexity.** M

**Pre-build gates.**
- **Refinement:** Not required — goal is clear; extends existing harness primitive.
- **Design:** Not required — backend/infra; no new UI surface beyond existing Settings harness row behavior.

**Human concept review.** No — routine extension of existing Settings harness list pattern.

**Acceptance criteria.**
- `cursor-agent` is a member of `SUPPORTED_HARNESSES` and `requireHarness("cursor-agent")` gates on the `cursor-agent` binary on PATH.
- `CURSOR_AGENT_CLI_CONFIG` drives the real `cursor-agent` binary via `CliHarnessAdapter` with stream-json event parsing.
- `probeCursorAgentCli` reports `ready` when the binary is installed and `cursor-agent status` shows logged in; `unauthenticated`/`missing` otherwise with a native login CTA.
- `createLocalAdapterPool` registers a `cursor-agent` adapter when the binary is on PATH.
- `SUPPORTED_HARNESS_LANES` includes a `cursor-agent` lane with locked test model `auto`.
- `cli-adapter-real-binary.integration.test.ts` includes a real-binary lane for cursor-agent proving completion through the production adapter.
- Settings tests reflect cursor-agent as authable (toggle + login CTA when unauthenticated), not permanently unavailable.
- `npm run check` + `npm run lint` + harness integration test for cursor-agent pass on a machine with the binary installed.

**Validation scenarios.**
- Given `cursor-agent` on PATH and logged in, when discovery runs, then state is `ready` with version string.
- Given the integration test lane runs, when `CliHarnessAdapter(CURSOR_AGENT_CLI_CONFIG)` drives a one-turn prompt, then a completion event is captured and outcome is not `crashed`.
- Given a harness-facing integration test file, when the guard runs, then it declares `requireHarness("cursor-agent")` alongside the other supported harnesses.

**Plan calls.** Standard architecture pass — adapter config, discovery probe, matrix expansion, MCP dialect, test lane. No `/design`.

**Contracts / constraints.**
- Inherited login only — no `CURSOR_API_KEY` injection in production adapter envMap.
- Equal matrix coverage: every harness-facing integration test must declare all five harnesses or loop `SUPPORTED_HARNESS_LANES`.
- Locked test model: `auto` (smallest/default Cursor tier).

**Out of scope.** Cursor IDE ACP protocol, cloud worker mode, return-enforcement hooks for cursor (drain-gate floor only initially).

**Effort.** M (~4h)
