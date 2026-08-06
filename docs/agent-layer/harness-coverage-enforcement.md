# Harness Coverage Enforcement

Every harness-facing integration test must cover the full supported harness matrix. **One gate enforces this**: the attestation harness-symmetry floor, which blocks an attestation whose tagged per-harness execution counts are unequal or missing. There is no source-level check — see [No source-level gate](#no-source-level-gate).

> **The floor is near-blind today.** `isHarnessIntegrationPath` matches **1 of the 12** files that call `requireHarness`. Read [The floor's blind spot](#the-floors-blind-spot) before treating a green attestation as coverage evidence.

The completed/not-returned outcome split below rides the return-gate mechanics — see [return-gate-enforcement.md](return-gate-enforcement.md). The run-on-host execution model and sandbox capture seam live in [run-unit-model.md](../architecture/run-unit-model.md). Day-to-day test commands and the affected-slice verify flow live in [guides/developer/testing.md](../guides/developer/testing.md), which links here for mechanism depth.

Harness/session error classes live in `framework/shared/src/errors.ts`.

---

## Supported harness matrix

`SUPPORTED_HARNESSES` in `scripts/lib/honest-harness-predicate.ts` is the single source of truth — **five** harnesses:

```ts
export const SUPPORTED_HARNESSES = [
	"builtin",
	"claude",
	"codex",
	"opencode",
	"cursor-agent",
] as const;
```

`gh` is a tool, not an agent harness, and is deliberately outside the matrix.

`layers/agent-execution/harness-registry/src/__tests__/require-harness.ts` mirrors this as a compile-time-checked literal (a bidirectional type assert — `AssertSupportedInHarness` / `AssertHarnessCoversSupported`). A package cannot import `scripts/`; the mirror keeps both in lockstep without a package-graph cycle. Divergence is a `npm run check` error.

---

## The gate — attestation harness-symmetry floor

`scripts/verify-attest.ts` parses `vitest --reporter=json` output and produces a signed attestation under `.verify-attestations/`. The attestation writer adds:

- **`agenticExecutedByHarness`** — a `Record<string, { executed: number; skipped: number }>` keyed by the `[harness:<name>]` describe-title tag.

`scripts/check-attestation.ts` calls **`assertHarnessSymmetry`** (`scripts/lib/attestation-floor.ts`). Three cases:

1. `agenticExecuted === 0` → **pass**. The numeric count is zero — typical when no harness-facing file was in the changed set; the condition is purely numeric, not a file-change check.
2. `agenticExecuted > 0` with no `[harness:X]` buckets → **fail** (untagged guard). A harness-facing test ran but bucketed nothing per harness; tag it before it can count as coverage.
3. Tagged buckets present → **pass iff every supported harness has the same positive executed count**. A zero-count harness means one was silently dropped; unequal counts mean a harness-specific probe inflated a bucket. Harness-specific, transport-only, or admission-only probes must stay parity-neutral — untagged, outside the parity floor.

`assertPerHarnessFloor` in the same file is the superseded AR2 form, retained only for its own tests.

### How the tag is parsed

Each harness lane's describe title carries its tag:

```ts
describe("[harness:builtin]", () => { … })
describe("[harness:claude]", () => { … })
describe("[harness:codex]", () => { … })
describe("[harness:opencode]", () => { … })
describe("[harness:cursor-agent]", () => { … })
```

The floor reads the `ancestorTitles` array from the vitest JSON reporter — the tag lives on the describe block, not the leaf test title. `HARNESS_TAG = /\[harness:([a-z-]+)\]/` (`attestation-floor.ts`) extracts the harness name and routes each assertion into its bucket.

---

## The floor's blind spot

**The floor can only see files that `isHarnessIntegrationPath` matches, and it matches almost nothing.**

The predicate has two arms:

1. a directory rule — `…/harness/__tests__/<anything>.integration.test.ts`
2. an explicit list, `EXPLICIT_HARNESS_INTEGRATION`, matched by path suffix

**The directory rule matches ZERO files.** The harness code lives at `layers/agent-execution/harness-registry/src/__tests__/`, which has no `/harness/` path segment. So the predicate identifies exactly **one** of the twelve files that call `requireHarness` — `assistant-reply-live-harness.integration.test.ts`, via the explicit list.

The consequence: the attestation floor can prove that one file's lanes executed, and nothing else. Every other harness-facing test is invisible to it. A supported harness could stop running in eleven of the twelve files and the attestation would still be green.

This broke when the packages moved, not when the source-level guard was deleted. It is a **false-green risk, not a cosmetic defect**, and it is registered as AU27 review follow-up **N12**. It is also recorded in the code as `@lore harness-predicate-blind` in `scripts/lib/honest-harness-predicate.ts`.

The fix is to re-derive the rule from something that survives a package move — not to patch the regex at a new path.

---

## No source-level gate

Nothing checks harness-facing test *source* any more. `npm run lint` runs biome, eslint, and `scripts/governance-lint.ts` (twice — once against its fixtures, once against the live tree). No lint step reads a harness test for coverage, stubs, or model-seam imports.

Concretely, none of the following exist: a coverage rule asserting every `SUPPORTED_HARNESSES` member appears as a real `requireHarness(…)` call; a stub/mock detector for harness seams; an import ban on the raw model-callers; a coverage-debt or stub-debt allowlist.

So these remain true as rules and are enforced by review alone:

- A harness-facing `*.integration.test.ts` drives the real installed binary — no scripted, mocked, or hand-rolled adapter.
- It gates with `requireHarness(<name>)`, never `skipIf`-on-absent.
- It covers every supported harness. Subset coverage is still a false green.
- It takes its model from the locked matrix, not from a hand-written `resolvedModel` literal.

---

## Locked test models (AR7)

`HARNESS_TEST_MODELS` in `require-harness.ts` is the founder-set, tiny-baseline model matrix — locked at the seam, never bumped to pass a flake:

| Harness | Model | Notes |
|---|---|---|
| builtin | `deepseek/deepseek-v4-flash` | OpenRouter, `OPENROUTER_API_KEY` |
| claude | `haiku` | Smallest claude tier; inherited keychain login |
| codex | `gpt-5.4-mini` | ChatGPT-account floor — nano is API-key-only and rejected; enforced via `--model {{model}}` in `CLI_TOOL_CONFIGS.codex.args` |
| opencode | `openrouter/z-ai/glm-4.7-flash` | Provider-prefixed; `--model` requires the `openrouter/` prefix |
| cursor-agent | `auto` | Cursor's default/cheapest routing tier |

All five are argument/request-enforced. Consume via `harnessTestResolvedModel(harness)`, which resolves provider, model, base URL, and key from this map. `apiKeyEnv: null` entries (claude, codex, cursor-agent) authenticate through the installed CLI's own keychain login and resolve an empty `apiKey` on purpose — a non-empty placeholder would inject a garbage env var into the subprocess and risk overriding native auth.

Nothing statically prevents a test from hand-writing a raw `resolvedModel` literal. That gap is accepted: catching it would need brittle model-id string-matching. An off-matrix literal is an obvious, isolated red flag in review.

---

## The harness-facing tests

Twelve files call `requireHarness`. What each covers:

| File | Harnesses |
|---|---|
| `layers/core-api/src/__tests__/assistant-reply-live-harness.integration.test.ts` | all five |
| `layers/core-api/src/__tests__/real-harness-return-enforcement-realbinary.integration.test.ts` | all five |
| `layers/core-api/src/__tests__/AL7-two-session-trust-first.integration.test.ts` | all five |
| `layers/agent-execution/harness-registry/src/__tests__/AM2-real-harness-discovery.integration.test.ts` | all five |
| `layers/agent-execution/harness-registry/src/__tests__/cli-adapter-real-binary.integration.test.ts` | claude, codex, opencode, cursor-agent |
| `layers/agent-execution/harness-registry/src/__tests__/AM2-real-harness-session-probe.integration.test.ts` | claude, codex, opencode |
| `layers/agent-execution/harness-registry/src/__tests__/AN1-real-harness-inherited.integration.test.ts` | claude, codex, opencode, `gh` |
| `layers/agent-execution/harness-registry/src/__tests__/AN2-connection-provisioning.integration.test.ts` | claude, codex, opencode, `gh` |
| `layers/core-api/src/__tests__/AU9-assistant-handoff-realbinary.integration.test.ts` | builtin |
| `layers/agent-execution/harness-registry/src/__tests__/AM2-builtin-gateway.integration.test.ts` | builtin |
| `layers/agent-execution/harness-registry/src/__tests__/opencode-model-probe.integration.test.ts` | opencode |
| `layers/agent-execution/harness-registry/src/__tests__/ar1-require-harness.test.ts` | none — it is the unit test *of* `requireHarness` |

Four of them emit `[harness:X]` tags and so reach the parity floor: the two `core-api` five-harness files, `AL7-two-session-trust-first`, and `AU9-assistant-handoff-realbinary` (builtin only). Of those, only `assistant-reply-live-harness` is visible to the predicate — see [the blind spot](#the-floors-blind-spot).

### Adoption pattern

There is no shared lane table and no loop. A matrix test writes **one explicit tagged describe per harness**, each gating itself with `requireHarness` at describe scope, and all delegating to one shared proof function that takes the harness name:

```ts
import { harnessTestResolvedModel, requireHarness } from "…/__tests__/require-harness.js";

async function runProof(harness: SupportedHarnessName, db: HyperIdleDb) {
  const result = await runSession({
    …deps,
    resolvedModel: harnessTestResolvedModel(harness),
  });
  expect(["completed", "not_returned"]).toContain(result.outcome);
}

describe("[harness:builtin]", () => {
  requireHarness("builtin");
  dbTest("… on builtin …", async ({ db }) => runProof("builtin", db), 180_000);
});

describe("[harness:claude]", () => {
  requireHarness("claude");
  dbTest("… on claude-code …", async ({ db }) => runProof("claude", db), 180_000);
});

// … one more each for codex, opencode, cursor-agent
```

Spelling the lanes out is deliberate: the tag is a literal the floor can read, and `requireHarness` sits at describe scope so a collection-phase throw means that lane cannot run. Each lane needs a generous timeout — a real binary plus a real model round trip runs 30–90s.

`layers/core-api/src/__tests__/assistant-reply-live-harness.integration.test.ts` is the reference implementation.

---

## `BUILTIN_ONLY_INTEGRATION` carve-out

`BUILTIN_ONLY_INTEGRATION` in `scripts/lib/honest-harness-predicate.ts` registers files whose production path is genuinely builtin-only by construction. A file on this list is exempted from the full-matrix coverage expectation, but must still declare `requireHarness("builtin")`, carry zero stubs, and use no `skipIf`-on-absent gate.

**The list is empty — keep it empty** unless a future production path structurally cannot run CLI harnesses and still must be tested as a harness-facing integration. The assistant turn is not such a case: it runs through the same durable poller as every other agent kind and is proven across all five harnesses by `assistant-reply-live-harness.integration.test.ts`.

---

## Known honest behavior differences across harnesses

Findings surfaced by real matrix runs.

### `builtin` + `claude` → `completed`; `codex` + `opencode` → `not_returned` (on file-write tasks)

`builtin` and `claude` fire the MCP return tool (`send_message`) in response to the task prompt — outcome `"completed"`. `codex` and `opencode` do real billable work on the file task but do not call the MCP return tool — outcome `"not_returned"` (the return-gate enforcer triggers but they exhaust the force budget). Honest harness behaviour, not a test gap. The correct assertion:

```ts
expect(["completed", "not_returned"]).toContain(result.outcome);
expect(result.outcome).not.toBe("crashed"); // a crash = stub or binary failure
```

A `"crashed"` outcome on any harness is an unconditional hard fail — a real run does not crash.

### Harness telemetry is token usage, not cost

Adapters record token counts, never a cost figure. `CliHarnessAdapter` captures claude-family metrics on the terminal `type === "result"` line and opencode metrics on `step_finish`, and both feed `recordTokenUsage`. Never assert a per-session cost from harness telemetry.

### opencode `tool_use` event mapping

opencode emits tool calls on a `tool_use` event; `framework/shared/src/harness/harness-event-normalization.ts` maps `tool_use` → `tool_call` for opencode so `isReturnAction` receives the tool name and the return gate fires.

### opencode completion text lives in `part.text`

opencode's `text` events carry content in `event.part.text`, not `event.text`. The normalizer reads `part.text` — without this, every opencode completion normalized to an empty string. `step_finish` carries only metadata (reason, tokens), no output field.

### CLI harnesses emit multiple completion events per session

Init/system lifecycle events produce empty completions, intermediate blocks carry partial text, the final event carries the full response. Code that returns on the first completion event receives `""`. Always take the **last non-empty** completion.

---

## Files at a glance

| File | Role |
|---|---|
| `scripts/lib/honest-harness-predicate.ts` | `SUPPORTED_HARNESSES` + `isHarnessIntegrationPath` + `EXPLICIT_HARNESS_INTEGRATION` + `BUILTIN_ONLY_INTEGRATION`. Carries the `@lore harness-predicate-blind` defect note. |
| `scripts/lib/attestation-floor.ts` | `extractAgenticCounts` + `assertHarnessSymmetry` (live); `assertPerHarnessFloor` superseded |
| `scripts/verify-attest.ts` | Writes `agenticExecutedByHarness` into a signed attestation under `.verify-attestations/` |
| `scripts/check-attestation.ts` | Calls `assertHarnessSymmetry` on `agenticExecutedByHarness` |
| `layers/agent-execution/harness-registry/src/__tests__/require-harness.ts` | `requireHarness` hard-fail helper; mirrors `SUPPORTED_HARNESSES`; `HARNESS_TEST_MODELS` + `harnessTestResolvedModel` |
| `layers/core-api/src/__tests__/assistant-reply-live-harness.integration.test.ts` | Reference five-harness matrix test; the only file the predicate matches |
| `layers/agent-execution/harness-registry/src/cli-harness-adapter.ts` | `CLI_TOOL_CONFIGS`, per-family metric extraction |
| `framework/shared/src/harness/harness-event-normalization.ts` | Per-family event pre-maps: `tool_use` → `tool_call`, `part.text` extraction |
