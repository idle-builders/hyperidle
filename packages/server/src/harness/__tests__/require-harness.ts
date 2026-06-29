/**
 * AR1 — requireHarness: hard-fail (never skip) gate for harness-facing
 * integration tests. Replaces every `skipIf`-on-absent availability gate.
 *
 * STRICT harness model (plans/AR/concept.md):
 *   - claude | codex | opencode | gh  → real binary on PATH (keychain / inherited
 *     login — NO API key of any kind).
 *   - builtin                          → OPENROUTER_API_KEY present in the env.
 *     This is the ONLY key that gates any harness. NEVER ANTHROPIC_API_KEY,
 *     NEVER OPENAI_API_KEY — those tokens do not gate anything in this system.
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

import { execFileSync } from "node:child_process";

export type HarnessName = "claude" | "codex" | "opencode" | "gh" | "builtin";

/** Binary name on PATH for each binary-backed harness. */
const BINARY: Record<Exclude<HarnessName, "builtin">, string> = {
	claude: "claude",
	codex: "codex",
	opencode: "opencode",
	gh: "gh",
};

/** True iff the harness is available (binary on PATH, or OPENROUTER_API_KEY set). */
function isHarnessAvailable(name: HarnessName): boolean {
	if (name === "builtin") {
		// The ONLY key gate. Read process.env at call time (tests stub it).
		return Boolean(process.env.OPENROUTER_API_KEY);
	}
	try {
		execFileSync("which", [BINARY[name]], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
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
			`(claude/codex/opencode/gh) or set OPENROUTER_API_KEY for builtin; or demote ` +
			`to a *.test.ts unit. (AR1: never skipIf to green.)`,
	);
}
