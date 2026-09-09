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
 * @lore AU28 Ruling 15: a harness is the thing that RUNS A MODEL, and nothing else
 *   is one, ever. `gh` used to be a `HarnessName`; it is the GitHub CLI and its one
 *   production use is an auth probe that makes no model call. A test that needs the
 *   `gh` binary now says so with `requireBinary("gh")` (./require-binary.ts) — the
 *   gate survives, the misfiling does not.
 *
 * A missing harness means the work is NOT done. requireHarness THROWS, naming the
 * absent harness, so the suite fails loudly rather than minting a false green by
 * silently skipping. The message never echoes a secret value — only harness names.
 *
 * @lore AR1: lives in `harness/__tests__/` (a test-support module, not production
 *   code) because it is consumed only by harness-facing integration tests. The
 *   reverted first attempt used key-named tokens (`requireHarness("anthropic-key")`)
 *   — that is the exact bug that got AR1 reverted. The vocabulary here is strictly
 *   harness-named; there is no key-named member.
 */

import { isBinaryOnPath } from "./require-binary.js";

export type HarnessName = "claude" | "codex" | "opencode" | "cursor-agent";

/**
 * The supported-harness matrix. This file is now the SINGLE source of truth.
 *
 * @lore ci-move: this was one half of a cross-file mirror — the other half,
 * `SUPPORTED_HARNESSES` in `scripts/lib/honest-harness-predicate.ts`, existed
 * only to feed the attestation's per-harness floor. The attestation is gone and
 * the predicate with it, so there is nothing left to mirror. The list and the
 * `HarnessName` union both live here, and the asserts below now check this
 * file against itself:
 *   _AssertSupportedInHarness: every listed name is a valid HarnessName (→).
 *   _AssertHarnessCoversSupported: every HarnessName is in the list (←).
 * Adding to either without the other → `npm run check` RED, in both directions.
 *
 * @lore AU28 Ruling 15: the two sets are now IDENTICAL. They used to differ by exactly one
 * member — `gh`, carved out of the ← direction by hand — and that carve-out was the type system
 * being told to tolerate a non-harness in the harness vocabulary. With `gh` gone the assert is a
 * plain mutual-extends, which is the shape a mirror should have had all along.
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
 * @lore There used to be a second arm here — `builtin` was "available" when
 * `OPENROUTER_API_KEY` was set, the one key that gated any harness. With the
 * built-in harness gone, availability is a question about installed binaries
 * only, and no key gates any harness.
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
 * @lore AR7: Values are founder-set 2026-06-30. `haiku` is the claude CLI tier
 * alias resolving to the latest Haiku (smallest tier); `gpt-5.6-luna` is the
 * smallest codex tier our ChatGPT-account login accepts. `gpt-5.4-mini` (the
 * prior entry) was retired by OpenAI — codex now rejects it outright with
 * "GPT-5.4 Mini is no longer available", and offers `gpt-5.6-luna` as its
 * direct replacement (the CLI's own migration message names it as such); nano
 * and `gpt-5-codex-mini` remain API-key-only and rejected under the
 * ChatGPT-account login. Re-verified live 2026-09-09: enumerated candidate
 * slugs against `codex exec --model <id> "say hi"` — unknown ids fail fast
 * with "Model metadata ... not found" plus a 400 from the account gate;
 * `gpt-5.6-luna` returned a real completion with no warning. The slug itself
 * was confirmed by grepping the installed `codex` binary's embedded strings
 * for its model registry (`"slug": "gpt-5.6-luna"`), not guessed. Both entries
 * are the TINY baseline — see the header block. Every harness authenticates
 * itself, so none of these carry a key.
 *
 * @lore AR7: All four harnesses are argument-enforced on the model — each
 * receives it via `--model {{model}}` in its adapter config, resolved from
 * `config.selectedModel`. `HARNESS_TEST_MODELS` is therefore load-bearing for
 * every supported harness. A hand-written model id seeded straight onto an
 * agent's run config remains an accepted residual gap (catching it would require
 * the brittle model-id string-matching we rejected). Code review + the absence of
 * any other imported model source make an off-matrix literal an obvious,
 * isolated red flag rather than a routine reach.
 */
export interface HarnessTestModelSpec {
	/** The locked model id passed to the harness. */
	readonly model: string;
}

// biome-ignore lint/style/useNamingConvention: SCREAMING_SNAKE_CASE constant per typescript.md.
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

// @lore This map used to carry a `provider`, a `baseUrl` and an `apiKeyEnv`
// alongside each model, and a `harnessTestResolvedModel` helper assembled them
// into the `resolvedModel` a test handed to `runSession`. All three described the
// model gateway: which provider to call, where, with whose key. No harness makes
// that call — each authenticates itself — so the only thing left worth locking is
// which model a lane runs. A test seeds it onto the agent's own run config, the
// same place production puts it, and it arrives as `SessionConfig.selectedModel`.
