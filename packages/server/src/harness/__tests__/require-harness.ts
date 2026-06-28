/**
 * requireHarness — hard-fail helper for harness integration tests.
 *
 * AR1: Replaces every `test.skipIf(!installed)` pattern in harness-facing
 * integration tests. When a required binary or key is absent, this throws
 * (never skips) so the suite goes RED and the agent stops with a
 * "cannot complete" message naming the missing harness.
 *
 * @lore AR1: Throwing in a `describe` callback (collection phase) is the
 * vitest idiom for "this whole block cannot run." Throwing in module scope
 * fails the file. Never skipIf to green — absence means the work is not done.
 *
 * @lore AR1: The throw message names only the harness/key-class (e.g.
 * "openai-key"), NEVER the raw key value — so no secret leaks into test output.
 */
import { execFileSync } from "node:child_process";

/** The harnesses/keys a test can require.
 * Each name maps to the EXACT gate the corresponding test body checks
 * (verified per-file in architecture.md §Route checklist). */
export type HarnessName =
	| "claude"
	| "codex"
	| "opencode"
	| "gh"
	/** OPENAI_API_KEY specifically — AM2-builtin-gateway's openai-compatible path */
	| "openai-key"
	/** ANTHROPIC_API_KEY — session-provisioning's claude-config proxy */
	| "anthropic-key"
	/** any of the three gateway keys — AM2-discovery's provider-agnostic gate */
	| "any-gateway-key";

const BINARY: Partial<Record<HarnessName, string>> = {
	claude: "claude",
	codex: "codex",
	opencode: "opencode",
	gh: "gh",
};

const ENV_KEY: Partial<Record<HarnessName, readonly string[]>> = {
	"openai-key": ["OPENAI_API_KEY"],
	"anthropic-key": ["ANTHROPIC_API_KEY"],
	"any-gateway-key": ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"],
};

function present(name: HarnessName): boolean {
	const bin = BINARY[name];
	if (bin) {
		try {
			execFileSync("which", [bin], { stdio: "ignore" });
			return true;
		} catch {
			return false;
		}
	}
	const keys = ENV_KEY[name];
	if (keys) return keys.some((k) => !!process.env[k]);
	return false;
}

/**
 * Hard-fail when any of the named harnesses/keys are absent.
 *
 * Throws (does NOT skip) so the suite goes RED and the agent stops with a
 * "cannot complete" message. Call at the top of the file or describe block —
 * never inside skipIf.
 *
 * The throw message names the harness class, never the raw key value.
 */
export function requireHarness(...names: HarnessName[]): void {
	const missing = names.filter((n) => !present(n));
	if (missing.length > 0) {
		throw new Error(
			`requireHarness: ${missing.join(", ")} not installed/configured — harness integration ` +
				`test cannot complete. Install the binary / set the key, or demote this to a *.test.ts unit. ` +
				`(AR1: never skipIf to green.)`,
		);
	}
}
