/**
 * AC3 — real built-in gateway proven against the real configured builtin path.
 *
 * Builds a ResolvedModel with provider: "openai-compatible" against OpenRouter
 * (baseUrl: "https://openrouter.ai/api", model: "openai/gpt-4o-mini") using the
 * builtin key (OPENROUTER_API_KEY — the ONLY key the builtin harness uses), drives
 * one harmless turn through BuiltinHarnessAdapter, collects streamEvents, and asserts:
 *   - real normalized token_usage (inputTokens/outputTokens > 0)
 *   - completion event with non-empty text ≠ the prompt (REQUIRED real-output discriminator)
 *
 * @lore AM2: The REQUIRED real-output discriminator is `completion.text` non-empty AND ≠ prompt.
 * A stub echoing input fails this. A canned usage block with empty/echoed text fails this.
 * That forces a real round-trip to https://openrouter.ai/api.
 *
 * @lore AU21 (harness-telemetry narrowing): this file used to also assert a
 * real `cost_update` event. Founder ruling narrowed harness telemetry to
 * token usage only — "very few harness can actually report cost" (the
 * builtin adapter's cost was never a harness self-report, only an ESTIMATE
 * from a hardcoded rate table). No cost_update event is emitted anymore.
 *
 * @lore AR1: gated by requireHarness("builtin") — OPENROUTER_API_KEY presence is the
 * ONLY builtin gate. There is NO ANTHROPIC_API_KEY / OPENAI_API_KEY path in this system;
 * the strict harness model forbids those tokens entirely. requireHarness HARD-FAILS
 * (never skips) when the key is absent. Auth errors (401/403) from the gateway are a
 * real bug → FAIL, not skip.
 */

import type { HarnessEvent, ResolvedModel } from "@hyperidle/shared";
import { describe, expect, test } from "vitest";
import { BuiltinHarnessAdapter } from "../builtin-harness-adapter.js";
import { requireHarness } from "./require-harness.js";

// OpenRouter is OpenAI-compatible: same chat/completions endpoint shape at
// https://openrouter.ai/api. The provider path under test is "openai-compatible" /
// Bearer auth — driven by the builtin key (OPENROUTER_API_KEY).
const OPENROUTER_BASE_URL = "https://openrouter.ai/api";
// Closed, bounded model list — NEVER an unbounded fallback. These are valid OpenRouter
// model ids reachable via the openai-compatible endpoint.
const BUILTIN_MODEL_CANDIDATES = ["openai/gpt-4o-mini", "openai/gpt-3.5-turbo"] as const;

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

	// AU21 (harness-telemetry narrowing): no cost_update event is ever emitted —
	// $-cost estimation is removed, token usage is the only signal reported.
	expect(events.some((e) => (e.type as string) === "cost_update")).toBe(false);

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
		baseUrl: OPENROUTER_BASE_URL,
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
					`AC3 FAIL: the builtin key is present but returned auth error for model "${model}". Session error: ${errorMessage}`,
				);
			}

			// Other error (model not found, rate limit, etc.) → try next model
			return { success: false, err: new Error(errorMessage) };
		}

		assertGatewayEvents(events);

		// SessionResult tokenUsage — no cost field exists on SessionResult anymore.
		expect(sessionResult).not.toHaveProperty("cost");
		expect(sessionResult.tokenUsage.byTier).toBeDefined();

		return { success: true };
	} catch (err) {
		if (isAuthError(err)) {
			// 401/403 thrown directly (before session event) → FAIL immediately
			throw new Error(
				`AC3 FAIL: the builtin key is present but returned auth error (${(err as HttpErrorLike).status}) for model "${model}". The openai-compatible gateway path is broken. Error: ${(err as Error).message}`,
			);
		}
		return { success: false, err };
	}
}

describe("AM2 builtin gateway — real openai-compatible call", () => {
	requireHarness("builtin");

	test("drives a real call through BuiltinHarnessAdapter with openai-compatible provider and asserts non-echoed completion text", async () => {
		// Guaranteed by requireHarness("builtin"): OPENROUTER_API_KEY is present.
		const apiKey = process.env.OPENROUTER_API_KEY as string;

		const adapter = new BuiltinHarnessAdapter({ maxIterations: 1, maxOutputTokens: 100 });

		let lastError: unknown = null;

		for (const candidate of BUILTIN_MODEL_CANDIDATES) {
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
			`AC3: all candidates in bounded list ${JSON.stringify(BUILTIN_MODEL_CANDIDATES)} returned non-auth errors. Final error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
		);
	}, 120_000);
});
