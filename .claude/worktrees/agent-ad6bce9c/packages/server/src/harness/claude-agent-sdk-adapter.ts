/** Claude Agent SDK adapter — concrete HarnessAdapter implementation (D2). */

import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { MissingCredentialError } from "@hyperidle/shared";
import { resolveModel } from "./model-tier-map.js";

interface ActiveSession {
	query: Query;
	abortController: AbortController;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCost: number;
}

interface AdapterOptions {
	readonly apiKeyEnvVar?: string;
	/** Injected query function for testing. */
	readonly queryFn?: typeof sdkQuery;
}

export class ClaudeAgentSdkAdapter implements HarnessAdapter {
	private readonly apiKeyEnvVar: string;
	private readonly sessions = new Map<string, ActiveSession>();
	private readonly queryFn: typeof sdkQuery;
	private nextId = 1;

	constructor(options?: AdapterOptions) {
		this.apiKeyEnvVar = options?.apiKeyEnvVar ?? "ANTHROPIC_API_KEY";
		this.queryFn = options?.queryFn ?? sdkQuery;
	}

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		const apiKey = process.env[this.apiKeyEnvVar];
		if (!apiKey) {
			throw new MissingCredentialError(`Environment variable ${this.apiKeyEnvVar} is not set`);
		}

		const abortController = new AbortController();
		const model = resolveModel(config.modelTier);

		const q = this.queryFn({
			prompt: `Session workspace: ${config.workspacePath}`,
			options: {
				model,
				cwd: config.workspacePath,
				tools: config.tools as string[],
				abortController,
				permissionMode: "bypassPermissions" as const,
				allowDangerouslySkipPermissions: true,
				persistSession: false,
				env: {
					...process.env,
					[this.apiKeyEnvVar]: apiKey,
				},
			},
		});

		const sessionId = `claude-session-${this.nextId++}`;
		this.sessions.set(sessionId, {
			query: q,
			abortController,
			totalInputTokens: 0,
			totalOutputTokens: 0,
			totalCost: 0,
		});

		return { sessionId };
	}

	async *streamEvents(handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		const session = this.sessions.get(handle.sessionId);
		if (!session) {
			throw new Error(`Unknown session: ${handle.sessionId}`);
		}

		try {
			for await (const msg of session.query) {
				yield* this.translateMessage(msg, session);
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			const code = err instanceof Error ? err.constructor.name : "UnknownError";
			yield { type: "error", message, code };
		}
	}

	async stopSession(handle: SessionHandle): Promise<SessionResult> {
		const session = this.sessions.get(handle.sessionId);
		if (!session) {
			throw new Error(`Unknown session: ${handle.sessionId}`);
		}

		session.abortController.abort();
		this.sessions.delete(handle.sessionId);

		return {
			outcome: "completed",
			totalTokens: session.totalInputTokens + session.totalOutputTokens,
			totalCost: session.totalCost,
		};
	}

	getCapabilities(): HarnessCapabilities {
		return { preCompactionTrigger: true, subAgents: true };
	}

	private *translateMessage(msg: SDKMessage, session: ActiveSession): Generator<HarnessEvent> {
		switch (msg.type) {
			case "assistant": {
				const usage = msg.message?.usage;
				if (usage) {
					const inputTokens = usage.input_tokens ?? 0;
					const outputTokens = usage.output_tokens ?? 0;
					session.totalInputTokens += inputTokens;
					session.totalOutputTokens += outputTokens;
					yield { type: "token_usage", inputTokens, outputTokens };
				}

				// Extract tool_use and text content blocks
				const content = msg.message?.content;
				if (Array.isArray(content)) {
					for (const block of content) {
						if (block.type === "tool_use") {
							yield {
								type: "tool_call",
								toolName: block.name,
								args: (block.input ?? {}) as Record<string, unknown>,
							};
						} else if (block.type === "text" && block.text) {
							yield { type: "completion", text: block.text };
						}
					}
				}
				break;
			}

			case "result": {
				const totalCost = msg.total_cost_usd ?? 0;
				const deltaCost = totalCost - session.totalCost;
				session.totalCost = totalCost;
				yield { type: "cost_update", totalCost, deltaCost };

				if (msg.usage) {
					const inputTokens = msg.usage.input_tokens ?? 0;
					const outputTokens = msg.usage.output_tokens ?? 0;
					yield { type: "token_usage", inputTokens, outputTokens };
				}

				if (msg.subtype === "success" && msg.result) {
					yield { type: "completion", text: msg.result };
				}
				break;
			}

			case "system": {
				if ("subtype" in msg && msg.subtype === "compact_boundary") {
					const meta = (msg as { compact_metadata: { pre_tokens: number } }).compact_metadata;
					yield {
						type: "pre_compaction",
						contextTokens: meta.pre_tokens,
						maxTokens: 200000,
					};
				}
				break;
			}
		}
	}
}
