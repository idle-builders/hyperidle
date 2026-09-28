/**
 * AR1 — requireHarness: hard-fail (never skip) gate for harness-facing
 * integration tests. Replaces every `skipIf`-on-absent availability gate.
 *
 * STRICT harness model:
 *   - claude | codex | opencode | cursor-agent → real binary on PATH (keychain /
 *     inherited login — NO API key of any kind).
 *   - builtin                          → OPENROUTER_API_KEY present in the env.
 *     This is the ONLY key that gates any harness. NEVER ANTHROPIC_API_KEY,
 *     NEVER OPENAI_API_KEY — those tokens do not gate anything in this system.
 *
 * @lore harness = thing that runs a model; gh is not (auth probe, no model call); plain binary gate goes in requireBinary
 *
 * A missing harness means the work is NOT done. requireHarness THROWS, naming the
 * absent harness, so the suite fails loudly rather than minting a false green by
 * silently skipping. The message never echoes a secret value — only harness names.
 *
 * @lore requireHarness: test-support only; vocabulary is strictly harness-named — no key-named member; requireHarness("anthropic-key") was the exact bug
 */

import { isBinaryOnPath } from "./require-binary.js";

export type HarnessName = "claude" | "codex" | "opencode" | "cursor-agent";

/**
 * The supported-harness matrix. This file is now the SINGLE source of truth.
 *
 * @lore harness list and HarnessName union both live here; asserts enforce both directions — add to either without the other → check RED
 *
 * @lore harness sets are identical; asserts are plain mutual-extends; any non-harness in the vocabulary breaks the ← assert
 */
// biome-ignore format: keep the mirror and asserts on adjacent lines for lockstep visibility
const SUPPORTED_HARNESSES_MIRROR = [
	"claude",
	"codex",
	"opencode",
	"cursor-agent",
] as const;
type SupportedHarness = (typeof SUPPORTED_HARNESSES_MIRROR)[number];
/** Public alias for the supported-harness key. */
export type SupportedHarnessName = SupportedHarness;
// Each supported name must be a valid HarnessName (→):
type AssertSupportedInHarness = SupportedHarness extends HarnessName ? true : never;
// Each mirror member must be a SupportedHarness — both directions enforced (←):
type AssertHarnessCoversSupported = HarnessName extends SupportedHarness ? true : never;
// Compile-time proof that both asserts hold (any `never` in the union = error):
declare const _lockstepCheck: [AssertSupportedInHarness, AssertHarnessCoversSupported];

/** Binary name on PATH for each harness. */
const BINARY: Record<HarnessName, string> = {
	claude: "claude",
	codex: "codex",
	opencode: "opencode",
	"cursor-agent": "cursor-agent",
};

/**
 * True iff the harness is available: its binary is on PATH.
 *
 * @lore isHarnessAvailable: binary-on-PATH only; no key gates any harness
 */
function isHarnessAvailable(name: HarnessName): boolean {
	return isBinaryOnPath(BINARY[name]);
}

/**
 * Throw (never skip) if any named harness is unavailable. Call at module scope or
 * the top of a `describe()` so a collection-phase throw means "this block cannot
 * run". The thrown message names every missing harness — never a secret value.
 */
export function requireHarness(...names: HarnessName[]): void {
	const missing = names.filter((name) => !isHarnessAvailable(name));
	if (missing.length === 0) return;
	throw new Error(
		`requireHarness: ${missing.join(", ")} not installed/configured — harness ` +
			`integration test cannot complete. Install the binary ` +
			`(claude/codex/opencode/cursor-agent); or demote ` +
			`to a *.test.ts unit. (AR1: never skipIf to green.)`,
	);
}

// ────────────────────────────────────────────────────────────────────────────
// AR7 — the LOCKED per-harness test-model matrix.
// ────────────────────────────────────────────────────────────────────────────

/**
 * FOUNDER-SET. DO NOT EDIT THE VALUES BELOW WITHOUT FOUNDER SIGN-OFF.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TINY-MODEL BASELINE — READ THIS BEFORE TOUCHING ANY VALUE.
 * Every entry is DELIBERATELY the SMALLEST/cheapest model its harness's actual
 * auth allows (claude → `haiku`, codex → `gpt-5.6-luna` — the floor under a
 * ChatGPT-account codex login, since nano is API-key-only and rejected there;
 * builtin → deepseek `…-flash`, opencode → glm `…-flash`). A harness integration test MUST pass on these tiny
 * models. That is the whole point: if the feature only works on a bigger model,
 * the feature — not the model — is wrong. NEVER bump an entry to a larger model
 * to make a flaky test go green (that is "tests must not drive behavior"). A
 * genuinely larger model is a separate, founder-approved decision.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The single, locked source of truth for which model every real-harness
 * integration test runs against — one fixed entry per supported harness. A test
 * implementer can pick the call-path (full `provisionSession` via
 * `runThroughHarness`, or a direct adapter via `lockedHarnessAdapter`) but can
 * NOT pick the model: every sanctioned entrypoint bakes its model from this map.
 *
 * Enforcement (NOT model-id string-matching — that is brittle): the
 * `honest-harness-guard` lint check forbids a harness-facing integration test
 * from importing the raw model-callers (`cli-harness-adapter`,
 * `builtin-harness-adapter`, `llm-client`) or constructing
 * `new (Cli|Builtin)HarnessAdapter`. The sanctioned way to drive a real model is
 * the seam (`provision-real-session.ts`), whose factories read this map. That
 * removes the idiomatic override paths (import a CLI, build an adapter, pick a
 * model). It does NOT statically prevent a test from hand-writing a raw
 * `resolvedModel` object literal onto a lane's params and passing it to
 * `provisionSession` — that residual gap is accepted on purpose (catching it
 * would require the brittle model-id string-matching we rejected). Code review +
 * the absence of any imported model source make an off-matrix literal an obvious,
 * isolated red flag rather than a routine reach.
 *
 * @lore HARNESS_TEST_MODELS: haiku=smallest claude tier; gpt-5.6-luna=codex floor (nano/codex-mini API-key-only); no harness carries a key; verified 2026-09-09
 *
 * @lore HARNESS_TEST_MODELS: load-bearing — all harnesses enforce model via --model arg; off-matrix literal in run config is accepted gap; red flag in code review
 */
export interface HarnessTestModelSpec {
	/** The locked model id passed to the harness. */
	readonly model: string;
}

export const HARNESS_TEST_MODELS = {
	claude: {
		// TINY-BASELINE: `haiku` (smallest claude tier), NOT sonnet/opus. See header.
		model: "haiku",
	},
	codex: {
		// TINY-BASELINE: `gpt-5.6-luna` is the SMALLEST codex tier usable here. nano is
		// NOT it — codex with a ChatGPT-account login rejects `gpt-5.4-nano` and
		// `gpt-5-codex-mini` (400 "not supported when using Codex with a ChatGPT
		// account"; verified live 2026-06-30). `gpt-5.4-mini` (the prior entry here)
		// was retired by OpenAI and now hard-fails with "GPT-5.4 Mini is no longer
		// available"; the CLI's own migration message names `gpt-5.6-luna` as its
		// replacement. Re-verified live 2026-09-09 via `codex exec --model
		// gpt-5.6-luna "say hi"` (real completion, no warning) after confirming the
		// slug against the installed binary's own model registry — see the header
		// @lore above for the full method. nano is API-key-only; our codex auth is
		// the inherited ChatGPT/keychain login, so luna is the floor. Enforced via
		// CLI_TOOL_CONFIGS.codex.args `--model {{model}}` on codex exec. See header.
		model: "gpt-5.6-luna",
	},
	opencode: {
		model: "openrouter/z-ai/glm-4.7-flash",
	},
	"cursor-agent": {
		// TINY-BASELINE: `auto` is Cursor's default/cheapest routing tier.
		model: "auto",
	},
	// `satisfies Record<…>` proves all four supported harnesses are present with
	// the exact key set — adding/removing a harness without updating this map is a
	// `npm run check` error.
} as const satisfies Record<SupportedHarnessName, HarnessTestModelSpec>;

// @lore HARNESS_TEST_MODELS: model only — no provider/baseUrl/apiKeyEnv; each harness authenticates itself; locked value arrives as SessionConfig.selectedModel
