/**
 * AC3 — real built-in / API-gateway proven against a real configured gateway path.
 *
 * Builds a ResolvedModel with provider: "openai-compatible", baseUrl: "https://api.openai.com",
 * apiKey: OPENAI_API_KEY, model: "gpt-4o-mini" (fallback to "gpt-3.5-turbo"), drives one
 * harmless turn through BuiltinHarnessAdapter, collects streamEvents, and asserts:
 *   - real normalized token_usage (inputTokens/outputTokens > 0)
 *   - real cost_update (totalCost/deltaCost)
 *   - completion event with non-empty text ≠ the prompt (REQUIRED real-output discriminator)
 *
 * @lore AM2: The REQUIRED real-output discriminator is `completion.text` non-empty AND ≠ prompt.
 * A stub echoing input fails this. A canned usage block with empty/echoed text fails this.
 * That forces a real round-trip to https://api.openai.com.
 *
 * Skip logic:
 *   - 401/403 (auth error) → FAIL (configured-but-invalid key = real bug)
 *   - 404 / model-not-available across the whole named list → test throws with model list + error
 *   - OPENAI_API_KEY absent (other keys present) → skip (cannot prove openai-compatible path)
 *   - No gateway key at all → skip (top-level skipIf)
 *
 * This test MUST EXECUTE on this machine (OPENAI_API_KEY is present).
 */

import type { HarnessEvent, ResolvedModel } from "@hyperidle/shared";
import { describe, expect, test } from "vitest";
import { BuiltinHarnessAdapter } from "../builtin-harness-adapter.js";
import { requireHarness } from "./require-harness.js";

// requireHarness("openai-key") guarantees OPENAI_API_KEY is present at test time.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * @lore AM2: OPENAI_API_KEY may hold an OpenRouter key (sk-or-v1-...) rather than a
 * direct OpenAI key. OpenRouter is OpenAI-compatible; it uses the same chat/completions
 * endpoint shape but at https://openrouter.ai/api. We detect this and use the correct baseUrl.
 * This does NOT change the provider path being tested — it's still "openai-compatible" /
 * callOpenAi() / Bearer auth — just the correct baseUrl for the key.
 */
function resolveOpenAiCompatibleEndpoint(apiKey: string): { baseUrl: string; model: string } {
	if (apiKey.startsWith("sk-or-")) {
		// OpenRouter key — use OpenRouter's openai-compatible endpoint
		// Closed, bounded model list for OpenRouter: gpt-4o-mini is available via OpenRouter
		return { baseUrl: "https://openrouter.ai/api", model: "openai/gpt-4o-mini" };
	}
	// Standard OpenAI key
	return { baseUrl: "https://api.openai.com", model: "gpt-4o-mini" };
}

// Closed, bounded model list — NEVER unbounded fallback
// (resolved per key type in resolveOpenAiCompatibleEndpoint)
const OPENAI_MODEL_CANDIDATES = ["gpt-4o-mini", "gpt-3.5-turbo"] as const;

const PROBE_PROMPT = "Reply with exactly the single word: ACKNOWLEDGED";

/**
 * @lore AM2: HttpError status is thrown by callLlm (via llm-client.ts) when the
 * provider returns a non-2xx response. We detect 401/403 as auth failures (→ FAIL)
 * vs 404/model-not-found (→ continue to next model). The `status` property is on
 * the HttpError class.
 */
interface HttpErrorLike {
	readonly status?: number;
	readonly message: string;
}

function isAuthError(err: unknown): boolean {
	if (typeof err === "object" && err !== null) {
		const e = err as HttpErrorLike;
		return e.status === 401 || e.status === 403;
	}
	return false;
}

function assertGatewayEvents(events: HarnessEvent[]): void {
	const tokenUsageEvents = events.filter((e) => e.type === "token_usage");
	const costUpdateEvents = events.filter((e) => e.type === "cost_update");
	const completionEvents = events.filter((e) => e.type === "completion");
	const errorEvents = events.filter((e) => e.type === "error");

	// No loop errors
	expect(errorEvents).toHaveLength(0);

	// token_usage: must have inputTokens/outputTokens > 0
	expect(tokenUsageEvents.length).toBeGreaterThan(0);
	for (const e of tokenUsageEvents) {
		if (e.type === "token_usage") {
			expect(e.inputTokens).toBeGreaterThan(0);
			expect(e.outputTokens).toBeGreaterThan(0);
		}
	}

	// cost_update: must emit totalCost/deltaCost
	expect(costUpdateEvents.length).toBeGreaterThan(0);
	for (const e of costUpdateEvents) {
		if (e.type === "cost_update") {
			expect(typeof e.totalCost).toBe("number");
			expect(typeof e.deltaCost).toBe("number");
		}
	}

	// completion: REQUIRED real-output discriminator
	// completion.text must be non-empty AND ≠ the prompt string
	expect(completionEvents.length).toBeGreaterThan(0);
	const completion = completionEvents[0];
	expect(completion).toBeDefined();
	if (completion?.type === "completion") {
		expect(completion.text.length).toBeGreaterThan(0);
		expect(completion.text).not.toBe(PROBE_PROMPT);
	}

	// Three-way AC6: the builtin token_usage event has the same field shape
	// as the per-family pre-normalizer output (inputTokens/outputTokens keys)
	const tu = tokenUsageEvents[0];
	if (tu?.type === "token_usage") {
		expect(typeof tu.inputTokens).toBe("number");
		expect(typeof tu.outputTokens).toBe("number");
	}
}

async function tryModelCall(
	adapter: BuiltinHarnessAdapter,
	candidateModel: string,
	apiKey: string,
): Promise<{ success: true } | { success: false; err: unknown }> {
	// Resolve the correct baseUrl and model for the given key type.
	// For OpenRouter keys (sk-or-*), use OpenRouter's openai-compatible endpoint.
	// For direct OpenAI keys, use the candidate model against api.openai.com.
	const endpoint = resolveOpenAiCompatibleEndpoint(apiKey);
	// When using direct OpenAI, candidateModel overrides the default from resolveOpenAiCompatibleEndpoint
	const model = apiKey.startsWith("sk-or-") ? endpoint.model : candidateModel;
	const resolvedModel: ResolvedModel = {
		provider: "openai-compatible",
		model,
		apiKey,
		baseUrl: endpoint.baseUrl,
	};
	const sessionId = `am2-gateway-probe-${Date.now()}-${model}`;

	try {
		const handle = await adapter.startSession({
			sessionId,
			sandboxPath: "/tmp/am2-probe",
			systemPromptPath: "/tmp/am2-probe/AGENTS.md",
			assembledPrompt: "You are a test assistant. Answer with one word only.",
			modelTier: "workhorse",
			tools: [],
			resolvedModel,
			messages: [{ role: "user", content: PROBE_PROMPT }],
		});

		const events: HarnessEvent[] = [];
		for await (const event of adapter.streamEvents(handle)) {
			events.push(event);
		}

		const sessionResult = await adapter.stopSession(handle);

		// Check for error events BEFORE asserting — error events mean the adapter caught
		// an HTTP error from the provider. Check if it was an auth error (→ FAIL) or
		// model-not-available (→ try next model).
		const errorEvents = events.filter((e) => e.type === "error");
		if (errorEvents.length > 0) {
			const firstError = errorEvents[0];
			const errorMessage =
				firstError?.type === "error" ? firstError.message : "unknown session error";

			// 401/403 in the error message = auth error → FAIL
			if (/401|403|Unauthorized|Forbidden/i.test(errorMessage)) {
				throw new Error(
					`AC3 FAIL: OPENAI_API_KEY is present but returned auth error for model "${model}". Session error: ${errorMessage}`,
				);
			}

			// Other error (model not found, rate limit, etc.) → try next model
			return { success: false, err: new Error(errorMessage) };
		}

		assertGatewayEvents(events);

		// SessionResult cost and tokenUsage
		expect(sessionResult.cost.minor).toBeGreaterThanOrEqual(0);
		expect(sessionResult.tokenUsage.byTier).toBeDefined();

		return { success: true };
	} catch (err) {
		if (isAuthError(err)) {
			// 401/403 thrown directly (before session event) → FAIL immediately
			throw new Error(
				`AC3 FAIL: OPENAI_API_KEY is present but returned auth error (${(err as HttpErrorLike).status}) for model "${model}". The openai-compatible gateway path is broken. Error: ${(err as Error).message}`,
			);
		}
		return { success: false, err };
	}
}

describe("AM2 builtin gateway — real openai-compatible call", () => {
	// AR1: requireHarness("openai-key") replaces the outer hasGatewayKey skipIf.
	// OPENAI_API_KEY is required specifically — other keys use different provider paths.
	requireHarness("openai-key");
	test("drives a real call through BuiltinHarnessAdapter with openai-compatible provider and asserts non-echoed completion text", async () => {
		// Guaranteed at this point: OPENAI_API_KEY is present
		const apiKey = OPENAI_API_KEY as string;

		const adapter = new BuiltinHarnessAdapter({ maxIterations: 1, maxOutputTokens: 100 });

		// For OpenRouter keys (sk-or-*): single model attempt via OpenRouter endpoint.
		// For direct OpenAI keys: try models in bounded list order.
		const isOpenRouterKey = apiKey.startsWith("sk-or-");
		const candidatesToTry = isOpenRouterKey ? ["openai/gpt-4o-mini"] : OPENAI_MODEL_CANDIDATES;

		let lastError: unknown = null;

		for (const candidate of candidatesToTry) {
			// tryModelCall throws on auth errors (→ FAIL), returns {success:false} on other errors
			const result = await tryModelCall(adapter, candidate, apiKey);
			if (result.success) {
				return; // done — real call succeeded
			}
			lastError = result.err;
		}

		// All candidates failed with non-auth errors — throw with details
		// (per plan: on model-not-available, the test throws with model list + final error;
		// it does NOT silently pass)
		throw new Error(
			`AC3: all candidates in bounded list ${JSON.stringify(candidatesToTry)} returned non-auth errors. Final error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
		);
	}, 120_000);
});
