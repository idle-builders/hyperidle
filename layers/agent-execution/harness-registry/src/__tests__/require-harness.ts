/**
 * AR1 — requireHarness: hard-fail (never skip) gate for harness-facing
 * integration tests. Replaces every `skipIf`-on-absent availability gate.
 *
 * STRICT harness model (plans/AR/concept.md):
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

export type HarnessName = "claude" | "codex" | "opencode" | "cursor-agent" | "builtin";

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
	"builtin",
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

/** Binary name on PATH for each binary-backed harness. */
const BINARY: Record<Exclude<HarnessName, "builtin">, string> = {
	claude: "claude",
	codex: "codex",
	opencode: "opencode",
	"cursor-agent": "cursor-agent",
};

/** True iff the harness is available (binary on PATH, or OPENROUTER_API_KEY set). */
function isHarnessAvailable(name: HarnessName): boolean {
	if (name === "builtin") {
		// The ONLY key gate. Read process.env at call time (tests stub it).
		return Boolean(process.env.OPENROUTER_API_KEY);
	}
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
			`(claude/codex/opencode/cursor-agent) or set OPENROUTER_API_KEY for builtin; or demote ` +
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
 * auth allows (claude → `haiku`, codex → `gpt-5.4-mini` — the floor under a
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
 * @lore AR7: Values are founder-set 2026-06-30. builtin + opencode bill through
 * OpenRouter (shared credit pool, `OPENROUTER_API_KEY`). claude + codex use the
 * inherited keychain login of the installed CLI — no key, the `apiKey` field is
 * an empty string (the CLI ignores it; injecting a non-empty placeholder would
 * feed the subprocess a garbage env var and risk overriding native auth). `haiku`
 * is the claude CLI tier alias resolving to the latest Haiku (smallest tier);
 * `gpt-5.4-mini` is the smallest codex tier our ChatGPT-account login accepts
 * (nano/codex-mini are rejected there), argument-enforced via `--model {{model}}`.
 * Both are the TINY baseline — see the header block.
 *
 * @lore AR7: All four harnesses are now argument/request-enforced on the model:
 * builtin passes it in the OpenRouter request body; claude, codex, and opencode
 * all receive it via `--model {{model}}` in `CLI_TOOL_CONFIGS.<harness>.args`
 * (cli-harness-adapter.ts resolves `{{model}}` from `config.resolvedModel?.model`).
 * `HARNESS_TEST_MODELS` is therefore load-bearing for every supported harness —
 * not just the OpenRouter ones. A hand-written raw `resolvedModel` object literal
 * passed directly to `provisionSession` remains an accepted residual gap (catching
 * it would require the brittle model-id string-matching we rejected). Code review +
 * the absence of any imported model source make an off-matrix literal an obvious,
 * isolated red flag rather than a routine reach.
 */
export interface HarnessTestModelSpec {
	/** Model-gateway provider the resolved model routes through. */
	readonly provider: "openai-compatible" | "anthropic" | "openrouter";
	/** The locked model id passed to the harness. */
	readonly model: string;
	/** Base URL for the provider. */
	readonly baseUrl: string;
	/**
	 * Env var that supplies the API key, or `null` when auth is inherited from the
	 * installed CLI's keychain login (no key — the resolved `apiKey` is a placeholder).
	 */
	readonly apiKeyEnv: "OPENROUTER_API_KEY" | null;
}

// biome-ignore lint/style/useNamingConvention: SCREAMING_SNAKE_CASE constant per typescript.md.
export const HARNESS_TEST_MODELS = {
	builtin: {
		provider: "openai-compatible",
		model: "deepseek/deepseek-v4-flash",
		baseUrl: "https://openrouter.ai/api",
		apiKeyEnv: "OPENROUTER_API_KEY",
	},
	claude: {
		provider: "anthropic",
		// TINY-BASELINE: `haiku` (smallest claude tier), NOT sonnet/opus. See header.
		model: "haiku",
		baseUrl: "https://api.anthropic.com",
		apiKeyEnv: null,
	},
	codex: {
		provider: "openai-compatible",
		// TINY-BASELINE: `gpt-5.4-mini` is the SMALLEST codex tier usable here. nano is
		// NOT it — codex with a ChatGPT-account login rejects `gpt-5.4-nano` and
		// `gpt-5-codex-mini` (400 "not supported when using Codex with a ChatGPT
		// account"; verified live 2026-06-30). nano is API-key-only; our codex auth is
		// the inherited ChatGPT/keychain login, so mini is the floor. Enforced via
		// CLI_TOOL_CONFIGS.codex.args `--model {{model}}` on codex exec. See header.
		model: "gpt-5.4-mini",
		baseUrl: "https://api.openai.com",
		apiKeyEnv: null,
	},
	opencode: {
		// The MODEL is untouched and stays founder-set. The PROVIDER label is
		// corrected: this route is OpenRouter, and `openai-compatible` means
		// something else in this product — an endpoint the person typed in, with no
		// fixed host, which the adapter answers by declaring a provider in the
		// session config and addressing the model through it. Applying that to an
		// id already routed by `openrouter/` double-prefixes it and the turn fails.
		provider: "openrouter",
		model: "openrouter/z-ai/glm-4.7-flash",
		baseUrl: "https://openrouter.ai/api",
		apiKeyEnv: "OPENROUTER_API_KEY",
	},
	"cursor-agent": {
		provider: "openai-compatible",
		// TINY-BASELINE: `auto` is Cursor's default/cheapest routing tier.
		model: "auto",
		baseUrl: "https://api.cursor.com",
		apiKeyEnv: null,
	},
	// `satisfies Record<…>` proves all four supported harnesses are present with
	// the exact key set — adding/removing a harness without updating this map is a
	// `npm run check` error.
} as const satisfies Record<SupportedHarnessName, HarnessTestModelSpec>;

/** The resolved-model shape a harness run consumes. */
export interface ResolvedTestModel {
	readonly provider: "openai-compatible" | "anthropic" | "openrouter";
	readonly model: string;
	readonly apiKey: string;
	readonly baseUrl: string;
}

/**
 * This is the sanctioned way a test obtains a locked model; the inherited-auth
 * `apiKey` is an empty string (claude/codex authenticate via the CLI's own
 * keychain/CODEX_HOME, not this field — a non-empty placeholder would inject a
 * garbage env var into the subprocess and risk overriding native auth).
 * OpenRouter harnesses (builtin/opencode) read their key from `OPENROUTER_API_KEY`.
 * The model/provider/baseUrl are fixed by `HARNESS_TEST_MODELS`.
 */
export function harnessTestResolvedModel(harness: SupportedHarnessName): ResolvedTestModel {
	const spec = HARNESS_TEST_MODELS[harness];
	const apiKey = spec.apiKeyEnv ? (process.env[spec.apiKeyEnv] ?? "") : "";
	return { provider: spec.provider, model: spec.model, apiKey, baseUrl: spec.baseUrl };
}
