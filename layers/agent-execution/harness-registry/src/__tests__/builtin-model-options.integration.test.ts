/**
 * A configured agent's model options actually reach the model it runs on.
 *
 * Real binary/API only — no stub. The green direction alone would pass with the
 * carrier deleted, so the load-bearing half is the tamper: one invalid value,
 * through the same production path, rejected by the provider naming the very
 * parameter we claim to be sending. That rejection is the proof the value
 * arrives as that parameter and not as an ignored extra field.
 *
 * @lore This is why builtin's options are only real on OpenRouter's native
 * endpoint. Its Anthropic-compatible endpoint answers HTTP 200 to a body
 * carrying `totally_made_up_param`, so a reasoning parameter sent there was
 * accepted and silently discarded — verified live, 2026-08-25.
 */

import { describe, expect, test } from "vitest";
import { callLlm } from "../llm-client.js";
import { modelOptionRequestFields } from "../model-options.js";
import { harnessTestResolvedModel, requireHarness } from "./require-harness.js";

requireHarness("builtin");

const MESSAGES = [{ role: "user" as const, content: "Say OK." }];

/**
 * The locked model is a reasoning model, so a small budget is spent entirely on
 * thinking tokens and the reply comes back empty. That is the model working, not
 * failing — the budget just has to leave room for an answer.
 */
const MAX_TOKENS = 600;

/** The reply text the model produced, across its content blocks. */
function replyText(response: { content: readonly { type: string; text?: string }[] }): string {
	return response.content
		.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("");
}

/**
 * Production resolves builtin to the `openrouter` provider
 * (`resolve-model.ts`), while the locked test matrix pins
 * `openai-compatible`. Both now reach the same OpenRouter endpoint, so this
 * pins the provider production actually uses while keeping the locked model,
 * key and base URL.
 */
function productionShapedModel(): Parameters<typeof callLlm>[0]["model"] {
	const locked = harnessTestResolvedModel("builtin");
	return { ...locked, provider: "openrouter" as const };
}

describe("an agent's configured options reach its model", () => {
	test("a stored option is carried, and one stored for another harness is not", () => {
		const fields = modelOptionRequestFields("builtin", {
			reasoning_effort: "high",
			variant: "belongs-to-opencode",
		});

		expect(fields).toEqual({ reasoning_effort: "high" });
	});

	test("the carried option is accepted by the real provider", async () => {
		const fields = modelOptionRequestFields("builtin", { reasoning_effort: "high" });

		const response = await callLlm({
			model: productionShapedModel(),
			messages: MESSAGES,
			maxTokens: MAX_TOKENS,
			modelOptions: fields,
		});

		expect(replyText(response).length).toBeGreaterThan(0);
	}, 60_000);

	test("an invalid value is rejected by the provider, naming the parameter", async () => {
		// The tamper twin. It travels the same production path as the test above —
		// only the value differs — so what it proves is that the value genuinely
		// arrives as `reasoning_effort`.
		await expect(
			callLlm({
				model: productionShapedModel(),
				messages: MESSAGES,
				maxTokens: MAX_TOKENS,
				modelOptions: { reasoning_effort: "ludicrous" },
			}),
		).rejects.toThrow(/reasoning_effort/);
	}, 60_000);

	test("an agent with no options still runs", async () => {
		const response = await callLlm({
			model: productionShapedModel(),
			messages: MESSAGES,
			maxTokens: MAX_TOKENS,
		});

		expect(replyText(response).length).toBeGreaterThan(0);
	}, 60_000);
});
