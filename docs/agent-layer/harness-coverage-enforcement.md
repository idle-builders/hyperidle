# Harness Coverage Enforcement

Every harness-facing integration test must cover the full supported harness matrix. **Nothing enforces this automatically.**

> **This page describes a convention, not a gate.** The execution-level floor that used to enforce it — `assertHarnessSymmetry`, reading per-harness execution counts out of a signed attestation — was deleted along with the whole attestation mechanism when test execution moved into CI. The harness lane needs four real CLI binaries and real LLM credentials, so it has no CI job; it is a local command on the release checklist (`npm run test:integration:harness`). Nothing blocks a merge, or a release, whose harness matrix never ran.
>
> The floor was also near-blind for most of its life: `isHarnessIntegrationPath` matched **1 of the 12** files that call `requireHarness`, so a green attestation was never the coverage evidence it appeared to be. Losing it costs less than the number of gates suggests — but it does cost something, and the honest statement is that per-harness breadth is now maintained by the author, not by a machine.

What remains automated is the **source-level** gate: `requireHarness(<name>)` hard-fails a run when the named binary or credential is absent, so a harness-facing test can never `skipIf` its way to green. That is a check on *how a test is written*, not on *whether it ran*.

The completed/not-returned outcome split below rides the return-gate mechanics — see [return-gate-enforcement.md](return-gate-enforcement.md). The run-on-host execution model and sandbox capture seam live in [run-unit-model.md](../architecture/run-unit-model.md). Day-to-day test commands and the affected-slice verify flow live in [guides/developer/testing.md](../guides/developer/testing.md), which links here for mechanism depth.

Harness/session error classes live in `framework/domain-model/src/errors.ts`.

---

## Supported harness matrix

`SUPPORTED_HARNESSES` in `layers/agent-execution/harness-registry/src/__tests__/require-harness.ts` is the single source of truth — **four** harnesses:

```ts
export const SUPPORTED_HARNESSES = ["claude", "codex", "opencode", "cursor-agent"] as const;
```

There were five. `builtin` was an in-process model-calling harness, and it is gone — every entry
here is now a real binary a person installs and signs into.

`gh` is a tool, not an agent harness, and is deliberately outside the matrix.

This was previously mirrored from `scripts/lib/honest-harness-predicate.ts` via a bidirectional compile-time assert. That predicate existed only to tell the attestation floor which files were harness-facing; with the floor gone it had no non-test consumer left and was deleted, so `require-harness.ts` now holds the list outright rather than mirroring it.

---

## The former gate — attestation harness-symmetry floor (removed)

Recorded because the shape of the problem outlives the mechanism.

`scripts/verify-attest.ts` parsed `vitest --reporter=json` output and wrote a signed attestation carrying `agenticExecutedByHarness` — a `Record<string, { executed: number; skipped: number }>` keyed by the `[harness:<name>]` describe-title tag. `scripts/check-attestation.ts` then called `assertHarnessSymmetry`, which passed only if every supported harness reported the **same positive** executed count: a zero-count harness meant one was silently dropped, unequal counts meant a harness-specific probe had inflated a bucket.

The rule it encoded is still the rule — **every supported harness, equal counts, no carve-outs** — it simply has no enforcer now. When you add or change a harness-facing test, that symmetry is yours to check by reading the run output.

### How the tag is parsed

Each harness lane's describe title carries its tag:

```ts
describe("[harness:claude]", () => { … })
describe("[harness:codex]", () => { … })
describe("[harness:opencode]", () => { … })
describe("[harness:cursor-agent]", () => { … })
```

The tag lives on the describe block, not the leaf test title. Keep tagging lanes this way: it is how a human reads per-harness breadth out of a run, and it is what any future enforcer would key on.

---

## Why the floor is not worth rebuilding as-is

Its predicate had two arms: a directory rule (`…/harness/__tests__/<anything>.integration.test.ts`) and an explicit path-suffix list. **The directory rule matched zero files** — the harness code lives at `layers/agent-execution/harness-registry/src/__tests__/`, which has no `/harness/` path segment — so the floor saw exactly one of the twelve files calling `requireHarness`. A supported harness could have stopped running in eleven of them with the attestation still green.

It broke when the packages moved, not when any guard was deleted, and it stayed broken because a path regex is not something a package move updates. Any replacement must derive "is this harness-facing" from something that survives a move — the `requireHarness` call itself, for instance — rather than from where the file happens to sit.

---

## No source-level gate

Nothing checks harness-facing test *source* any more. `npm run lint` runs biome, eslint, and `tools/governance/src/governance-lint.ts` (twice — once against its fixtures, once against the live tree). No lint step reads a harness test for coverage, stubs, or model-seam imports.

Concretely, none of the following exist: a coverage rule asserting every `SUPPORTED_HARNESSES` member appears as a real `requireHarness(…)` call; a stub/mock detector for harness seams; an import ban on the raw model-callers; a coverage-debt or stub-debt allowlist.

So these remain true as rules and are enforced by review alone:

- A harness-facing `*.integration.test.ts` drives the real installed binary — no scripted, mocked, or hand-rolled adapter.
- It gates with `requireHarness(<name>)`, never `skipIf`-on-absent.
- It covers every supported harness. Subset coverage is still a false green.
- It takes its model from the locked matrix, not from a hand-written `resolvedModel` literal.

---

## Locked test models (AR7)

`HARNESS_TEST_MODELS` in `require-harness.ts` is the founder-set, tiny-baseline model matrix — locked
at the seam, never bumped to pass a flake. Each entry locks a **model and nothing else**: it used to
carry a provider, a base URL and the env var naming the key that billed for the run, all of which
described the model gateway. A lane seeds its locked model onto the agent's own run config, where
production puts it, and it reaches the harness as `SessionConfig.selectedModel`:

| Harness | Model | Notes |
|---|---|---|
| claude | `haiku` | Smallest claude tier; inherited keychain login |
| codex | `gpt-5.6-luna` | ChatGPT-account floor — nano is API-key-only and rejected; `gpt-5.4-mini` was retired by OpenAI (2026-09) and `gpt-5.6-luna` is its replacement; enforced via `--model {{model}}` in `CLI_TOOL_CONFIGS.codex.args` |
| opencode | `openrouter/z-ai/glm-4.7-flash` | Provider-prefixed; `--model` requires the `openrouter/` prefix |
| cursor-agent | `auto` | Cursor's default/cheapest routing tier |

All four are argument-enforced: each receives its model via `--model {{model}}` in its adapter config, resolved from `SessionConfig.selectedModel`. Consume via `HARNESS_TEST_MODELS[harness].model` and seed it onto the agent's run config. No key travels with it — every harness authenticates through its own login, and injecting one would risk overriding that native auth.

Nothing statically prevents a test from hand-writing a raw `resolvedModel` literal. That gap is accepted: catching it would need brittle model-id string-matching. An off-matrix literal is an obvious, isolated red flag in review.

---

## The harness-facing tests

Twelve files call `requireHarness`. What each covers:

| File | Harnesses |
|---|---|
| `layers/core-api/src/__tests__/thread-turn-live-harness.integration.test.ts` | all four |
| `layers/core-api/src/__tests__/real-harness-return-enforcement-realbinary.integration.test.ts` | all four |
| `layers/core-api/src/__tests__/AL7-two-session-trust-first.integration.test.ts` | all four |
| `layers/agent-execution/harness-registry/src/__tests__/AM2-real-harness-discovery.integration.test.ts` | all four |
| `layers/agent-execution/harness-registry/src/__tests__/cli-adapter-real-binary.integration.test.ts` | claude, codex, opencode, cursor-agent |
| `layers/agent-execution/harness-registry/src/__tests__/AM2-real-harness-session-probe.integration.test.ts` | claude, codex, opencode |
| `layers/agent-execution/harness-registry/src/__tests__/AN1-real-harness-inherited.integration.test.ts` | claude, codex, opencode (+ `requireBinary("gh")` probe — not a harness) |
| `layers/agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts` | claude, codex, opencode (+ `requireBinary("gh")` probe — not a harness) |
| `layers/core-api/src/__tests__/AU9-assistant-handoff-realbinary.integration.test.ts` | all four |
| `layers/agent-execution/harness-registry/src/__tests__/opencode-model-probe.integration.test.ts` | opencode |
| `layers/agent-execution/harness-registry/src/__tests__/ar1-require-harness.test.ts` | none — it is the unit test *of* `requireHarness` |

Four of them emit `[harness:X]` tags: the two `core-api` all-harness files, `AL7-two-session-trust-first`, and `AU9-assistant-handoff-realbinary`. The rest do not, so their per-harness breadth is only visible by reading the file.

### Adoption pattern

There is no shared lane table and no loop. A matrix test writes **one explicit tagged describe per harness**, each gating itself with `requireHarness` at describe scope, and all delegating to one shared proof function that takes the harness name:

```ts
import { HARNESS_TEST_MODELS, requireHarness } from "…/__tests__/require-harness.js";

async function runProof(harness: SupportedHarnessName, db: HyperIdleDb) {
  // The locked model is seeded onto the agent, not handed to the session — there
  // is no resolvedModel override any more.
  await seedAgent(db, { harnessType: harness, modelId: HARNESS_TEST_MODELS[harness].model });
  const result = await runSession({ …deps });
  expect(["completed", "not_returned"]).toContain(result.outcome);
}

describe("[harness:claude]", () => {
  requireHarness("claude");
  dbTest("… on claude-code …", async ({ db }) => runProof("claude", db), 180_000);
});

// … one more each for codex, opencode, cursor-agent
```

Spelling the lanes out is deliberate: the tag makes per-harness breadth legible in a run's output, and `requireHarness` sits at describe scope so a collection-phase throw means that lane cannot run. Each lane needs a generous timeout — a real binary plus a real model round trip runs 30–90s.

`layers/core-api/src/__tests__/thread-turn-live-harness.integration.test.ts` is the reference implementation.

---

## No harness-only carve-out

A `BUILTIN_ONLY_INTEGRATION` carve-out used to live here: a list of files whose production paths were
genuinely builtin-only by construction and therefore exempt from the full-matrix expectation. The
list was already empty, and the harness it exempted is gone. **Every harness-facing integration test
covers the full matrix.** There is no exemption to claim.

---

## Known honest behavior differences across harnesses

Findings surfaced by real matrix runs.

### `claude` → `completed`; `codex` + `opencode` → `not_returned` (on file-write tasks)

`claude` fires the MCP return tool (`send_message`) in response to the task prompt — outcome `"completed"`. `codex` and `opencode` do real billable work on the file task but do not call the MCP return tool — outcome `"not_returned"` (the return-gate enforcer triggers but they exhaust the force budget). Honest harness behaviour, not a test gap. The correct assertion:

```ts
expect(["completed", "not_returned"]).toContain(result.outcome);
expect(result.outcome).not.toBe("crashed"); // a crash = stub or binary failure
```

A `"crashed"` outcome on any harness is an unconditional hard fail — a real run does not crash.

### Harness telemetry is token usage, not cost

Adapters record token counts, never a cost figure. `CliHarnessAdapter` captures claude-family metrics on the terminal `type === "result"` line and opencode metrics on `step_finish`, and both feed `recordTokenUsage`. Never assert a per-session cost from harness telemetry.

### opencode `tool_use` event mapping

opencode emits tool calls on a `tool_use` event; `framework/harness-protocol/src/harness/harness-event-normalization.ts` maps `tool_use` → `tool_call` for opencode so `isReturnAction` receives the tool name and the return gate fires.

### opencode completion text lives in `part.text`

opencode's `text` events carry content in `event.part.text`, not `event.text`. The normalizer reads `part.text` — without this, every opencode completion normalized to an empty string. `step_finish` carries only metadata (reason, tokens), no output field.

### CLI harnesses emit multiple completion events per session

Init/system lifecycle events produce empty completions, intermediate blocks carry partial text, the final event carries the full response. Code that returns on the first completion event receives `""`. Always take the **last non-empty** completion.

---

## Files at a glance

| File | Role |
|---|---|
| `layers/agent-execution/harness-registry/src/__tests__/require-harness.ts` | `SUPPORTED_HARNESSES` (source of truth) + the hard-fail-on-absent gate |
| `layers/agent-execution/harness-registry/src/__tests__/require-harness.ts` | `requireHarness` hard-fail helper; mirrors `SUPPORTED_HARNESSES`; `HARNESS_TEST_MODELS` + `harnessTestResolvedModel` |
| `layers/core-api/src/__tests__/thread-turn-live-harness.integration.test.ts` | Reference five-harness matrix test; the only file the predicate matches |
| `layers/agent-execution/harness-registry/src/cli-harness-adapter.ts` | `CLI_TOOL_CONFIGS`, per-family metric extraction |
| `framework/harness-protocol/src/harness/harness-event-normalization.ts` | Per-family event pre-maps: `tool_use` → `tool_call`, `part.text` extraction |
