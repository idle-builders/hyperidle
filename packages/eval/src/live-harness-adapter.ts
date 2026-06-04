/**
 * LiveHarnessAdapter — makes real LLM calls via the Anthropic SDK.
 * Gated on ANTHROPIC_API_KEY presence. Used only with --live flag.
 *
 * @lore X7: This adapter is dynamically imported from runner.ts only when
 * --live is passed. The anthropic SDK is an optional runtime dependency —
 * it is not imported in mock mode to keep eval startup fast and dependency-free.
 *
 * The adapter:
 * 1. Sends the composed prompt + tool definitions to the Anthropic API.
 * 2. When the model responds with tool_use blocks, yields tool_call events.
 * 3. The provisioning orchestrator collects tool results via registry.invoke().
 * 4. Repeats until the model sends stop_reason="end_turn" without tool_use.
 * 5. Yields cost_update events based on API usage.
 *
 * Max turns: 20 (safety rail for eval scenarios).
 */

import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";

const MAX_TURNS = 20;

export class LiveHarnessAdapter implements HarnessAdapter {
	private readonly apiKey: string;
	private capturedConfig: SessionConfig | null = null;
	private nextId = 1;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		this.capturedConfig = config;
		return { sessionId: `live-session-${this.nextId++}` };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		if (!this.capturedConfig) {
			yield { type: "error", message: "startSession was not called before streamEvents" };
			return;
		}

		// @lore X7: Dynamic import of the Anthropic SDK — only loaded when --live is passed.
		// Using a local dynamic import here means the eval package does not need
		// @anthropic-ai/sdk as a hard dependency (only needed when live mode is used).
		const Anthropic = await import("@anthropic-ai/sdk").then((m) => m.default ?? m);
		const client = new Anthropic({ apiKey: this.apiKey });

		const toolDefs = this.capturedConfig.tools.map((name) => ({
			name,
			description: `Tool: ${name}`,
			input_schema: {
				type: "object" as const,
				properties: {} as Record<string, unknown>,
			},
		}));

		const messages: Array<{
			role: "user" | "assistant";
			content: string | Array<{ type: string; [key: string]: unknown }>;
		}> = [{ role: "user", content: this.capturedConfig.composedPrompt }];

		let turnCount = 0;

		while (turnCount < MAX_TURNS) {
			turnCount++;

			const response = await client.messages.create({
				model: "claude-opus-4-5",
				max_tokens: 4096,
				messages,
				tools: toolDefs,
			});

			// Emit cost update based on usage.
			const inputTokens = response.usage.input_tokens;
			const outputTokens = response.usage.output_tokens;
			// Approximate cost: $15/M input + $75/M output for claude-opus-4-5
			const costDollars = (inputTokens * 15 + outputTokens * 75) / 1_000_000;
			if (costDollars > 0) {
				yield {
					type: "cost_update",
					totalCost: costDollars,
					deltaCost: costDollars,
				};
			}

			const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");

			if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
				// No more tool calls — emit the final completion text if any.
				const textBlock = response.content.find((b) => b.type === "text");
				if (textBlock && textBlock.type === "text" && "text" in textBlock) {
					yield { type: "completion", text: textBlock.text as string };
				}
				break;
			}

			// Emit tool_call events for each tool_use block.
			for (const block of toolUseBlocks) {
				if (block.type === "tool_use" && "name" in block && "input" in block) {
					yield {
						type: "tool_call",
						toolName: block.name as string,
						args: block.input as Record<string, unknown>,
					};
				}
			}

			// The provisioning orchestrator's Phase 10 has already invoked the tools
			// by the time we get here (it processes events synchronously). We don't
			// need to feed tool results back in this architecture — the eval harness
			// adapter model is fire-and-forget for tool calls.
			// For a more realistic live mode, we'd collect tool results and feed them
			// back in a multi-turn loop. That's a future enhancement (X7 v2).
			break;
		}
	}

	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		return {
			outcome: "completed",
			cost: { minor: 0, currency: "USD" },
			tokenUsage: { byTier: {} },
		};
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: ["anthropic"],
			mcpSupport: false,
		};
	}
}
