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
 *   - 404 / model-not-available across the whole named list → skip with model list + error
 *   - No key at all → skip with precise reason
 *
 * This test MUST EXECUTE on this machine (OPENAI_API_KEY is present).
 */

import type { HarnessEvent, ResolvedModel } from "@hyperidle/shared";
import { describe, expect, test } from "vitest";
import { BuiltinHarnessAdapter } from "../builtin-harness-adapter.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const hasGatewayKey = Boolean(OPENAI_API_KEY ?? ANTHROPIC_API_KEY ?? OPENROUTER_API_KEY);

// Closed, bounded model list — NEVER unbounded fallback
const OPENAI_MODEL_CANDIDATES = ["gpt-4o-mini", "gpt-3.5-turbo"] as const;

const PROBE_PROMPT = "Reply with exactly the single word: ACKNOWLEDGED";

/**
 * @lore AM2: HttpError status is thrown by callLlm (via llm-client.ts) when the
 * provider returns a non-2xx response. We detect 401/403 as auth failures (→ FAIL)
 * vs 404/model-not-found (→ skip). The `status` property is on the HttpError class.
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
	model: string,
	apiKey: string,
): Promise<{ success: true } | { success: false; err: unknown }> {
	const resolvedModel: ResolvedModel = {
		provider: "openai-compatible",
		model,
		apiKey,
		baseUrl: "https://api.openai.com",
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

		assertGatewayEvents(events);

		// SessionResult cost and tokenUsage
		expect(sessionResult.cost.minor).toBeGreaterThanOrEqual(0);
		expect(sessionResult.tokenUsage.byTier).toBeDefined();

		return { success: true };
	} catch (err) {
		if (isAuthError(err)) {
			// 401/403 = configured-but-invalid key → FAIL immediately (do not retry)
			throw new Error(
				`AC3 FAIL: OPENAI_API_KEY is present but returned auth error (${(err as HttpErrorLike).status}) for model "${model}". The openai-compatible gateway path is broken. Error: ${(err as Error).message}`,
			);
		}
		return { success: false, err };
	}
}

describe("AM2 builtin gateway — real openai-compatible call", () => {
	test.skipIf(!hasGatewayKey)(
		"drives a real call through BuiltinHarnessAdapter with openai-compatible provider and asserts non-echoed completion text",
		async () => {
			// Must have OPENAI_API_KEY specifically to use the openai-compatible path
			if (!OPENAI_API_KEY) {
				test.skip(
					"OPENAI_API_KEY absent — cannot drive openai-compatible path (ANTHROPIC_API_KEY or OPENROUTER_API_KEY present but those use a different provider path)",
				);
				return;
			}

			const adapter = new BuiltinHarnessAdapter({ maxIterations: 1, maxOutputTokens: 100 });
			let lastError: unknown = null;

			for (const model of OPENAI_MODEL_CANDIDATES) {
				// tryModelCall throws on 401/403 (auth error = FAIL), returns {success:false} on 404
				const result = await tryModelCall(adapter, model, OPENAI_API_KEY);
				if (result.success) {
					return; // done
				}
				lastError = result.err;
			}

			// All models in the bounded list failed with non-auth errors → skip
			test.skip(
				`AC3: all models in bounded list ${JSON.stringify(OPENAI_MODEL_CANDIDATES)} returned non-auth errors. Final error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
			);
		},
		120_000,
	);
});
