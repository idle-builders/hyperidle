/**
 * openrouter-credit-guard — shared utility for skipping tests when the OpenRouter
 * account has insufficient credits.
 *
 * The opencode binary and the builtin harness adapter BOTH use OPENROUTER_API_KEY
 * to call OpenRouter. When the account is overdrawn (total_usage > total_credits),
 * every LLM call fails with HTTP 402 "Insufficient credits" — even though the API
 * key is valid and authenticated. This is an environment condition that must cause
 * tests to SKIP cleanly, not FAIL with misleading LLM errors.
 *
 * @lore openrouter-credit-guard: A credential listed in `opencode providers list`
 * or `OPENROUTER_API_KEY` present is necessary but not sufficient. The
 * `/api/v1/credits` endpoint is a lightweight REST probe (no LLM call, ~200ms).
 * Require ≥$0.01 remaining to avoid flapping at the exact zero boundary.
 *
 * @lore openrouter-credit-guard-scope: This guard affects ALL tests that make a
 * real LLM call via OpenRouter — whether through the opencode binary or directly
 * through the BuiltinHarnessAdapter (which uses the openai-compatible endpoint).
 * Both paths hit the same account balance.
 */

/**
 * Check whether the OpenRouter account has sufficient credits to run a test.
 *
 * Returns false if:
 *   - OPENROUTER_API_KEY is not set
 *   - The /api/v1/credits request fails (network error, invalid key, etc.)
 *   - Remaining credits (total_credits - total_usage) < $0.01
 */
export async function openrouterHasCredits(): Promise<boolean> {
	const key = process.env.OPENROUTER_API_KEY;
	if (!key) return false;

	try {
		const res = await fetch("https://openrouter.ai/api/v1/credits", {
			// biome-ignore lint/style/useNamingConvention: HTTP header name (external API contract)
			headers: { Authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return false;
		const json = (await res.json()) as {
			// biome-ignore lint/style/useNamingConvention: OpenRouter API response uses snake_case field names
			data?: { total_credits?: number; total_usage?: number };
		};
		const credits = json.data?.total_credits ?? 0;
		const usage = json.data?.total_usage ?? 0;
		return credits - usage >= 0.01;
	} catch {
		return false;
	}
}

/**
 * Call inside a vitest test body to skip when OpenRouter has no credits.
 * The skip message is logged to stdout so it appears in verbose output.
 *
 * Usage:
 *   test("my test", async ({ skip }) => {
 *     await requireOpenRouterCredits(skip, "[MyFile]");
 *     // ... rest of test
 *   });
 */
export async function requireOpenRouterCredits(skip: () => void, logPrefix = ""): Promise<boolean> {
	const hasCredits = await openrouterHasCredits();
	if (!hasCredits) {
		const msg = `${logPrefix ? `${logPrefix} ` : ""}SKIP: OpenRouter account has insufficient credits — test requires a funded OpenRouter account (OPENROUTER_API_KEY credits > $0.01).\n`;
		process.stdout.write(msg);
		skip();
		return false;
	}
	return true;
}
