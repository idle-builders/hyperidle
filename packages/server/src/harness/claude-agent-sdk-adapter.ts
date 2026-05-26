/** Claude Agent SDK adapter — concrete HarnessAdapter implementation (D2). */

import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import type {
	CurrencyCode,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	ModelTier,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { createLogger, MissingCredentialError } from "@hyperidle/shared";
import { resolveModel } from "./model-tier-map.js";

/**
 * Environment variables explicitly forwarded into the agent subprocess.
 * Anything not in this list (DATABASE_URL, HYPERIDLE_API_KEY, SMTP_PASSWORD,
 * observability keys, etc) MUST NOT be visible to the agent.
 *
 * @lore I2 S1: the previous adapter spread `...process.env` into the SDK
 * `env` option. That gave a hostile agent the master Meta-Layer key, the
 * raw DB URL (bypassing Drizzle), and every notification/observability
 * credential. The fix is an explicit allow-list — never inverted to a
 * deny-list because new secrets land in env without code changes.
 */
const ALLOWED_ENV_KEYS = ["PATH", "HOME", "LANG"] as const;

const sdkLogger = createLogger({ pkg: "harness.claude-sdk" });

let unsafeModeWarningEmitted = false;

interface ActiveSession {
	query: Query;
	abortController: AbortController;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCost: number;
	/** L17: the model tier from SessionConfig — used to tag token_usage events. */
	modelTier: string;
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

	// biome-ignore lint/suspicious/useAwait: interface HarnessAdapter requires async signature
	async startSession(config: SessionConfig): Promise<SessionHandle> {
		const apiKey = process.env[this.apiKeyEnvVar];
		if (!apiKey) {
			throw new MissingCredentialError(`Environment variable ${this.apiKeyEnvVar} is not set`);
		}

		const abortController = new AbortController();
		const model = resolveModel(config.modelTier);

		// I2 S1: build env from the explicit allow-list. Only forward the
		// agent's own ANTHROPIC_API_KEY plus the OS-level vars that the
		// SDK / `cwd` resolution actually need.
		const sandboxedEnv: Record<string, string> = {};
		for (const key of ALLOWED_ENV_KEYS) {
			const value = process.env[key];
			if (value !== undefined) {
				sandboxedEnv[key] = value;
			}
		}
		sandboxedEnv[this.apiKeyEnvVar] = apiKey;

		// I2 S2/S3: gate the SDK's permission-bypass behind an explicit env
		// flag. Default behavior (flag unset) uses `permissionMode: "default"`
		// and omits `allowDangerouslySkipPermissions` entirely. The flag is
		// strictly compared to the literal "true" so typos like "1" or "yes"
		// don't accidentally enable bypass.
		const unsafeMode = process.env.HYPERIDLE_UNSAFE_AGENT_MODE === "true";

		if (unsafeMode && !unsafeModeWarningEmitted) {
			sdkLogger.warn(
				"HYPERIDLE_UNSAFE_AGENT_MODE=true — Claude Agent SDK permission prompts are bypassed for this process. UNSAFE for production.",
			);
			unsafeModeWarningEmitted = true;
		}

		const queryOptions: Record<string, unknown> = {
			model,
			cwd: config.workspacePath,
			tools: config.tools as string[],
			abortController,
			permissionMode: unsafeMode ? "bypassPermissions" : "default",
			persistSession: false,
			env: sandboxedEnv,
		};
		if (unsafeMode) {
			queryOptions.allowDangerouslySkipPermissions = true;
		}

		const q = this.queryFn({
			prompt: `Session workspace: ${config.workspacePath}`,
			options: queryOptions as Parameters<typeof sdkQuery>[0]["options"],
		});

		const sessionId = `claude-session-${this.nextId++}`;
		this.sessions.set(sessionId, {
			query: q,
			abortController,
			totalInputTokens: 0,
			totalOutputTokens: 0,
			totalCost: 0,
			modelTier: config.modelTier,
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

	// biome-ignore lint/suspicious/useAwait: interface HarnessAdapter requires async signature
	async stopSession(handle: SessionHandle): Promise<SessionResult> {
		const session = this.sessions.get(handle.sessionId);
		if (!session) {
			throw new Error(`Unknown session: ${handle.sessionId}`);
		}

		session.abortController.abort();
		this.sessions.delete(handle.sessionId);

		// L17: return structured cost (WireMoney) and token usage (TokenUsage).
		// Claude SDK reports cost in USD, so currency is always 'USD' here.
		// Tokens are attributed to the session's configured model tier.
		return {
			outcome: "completed",
			cost: {
				minor: Math.round(session.totalCost * 100),
				currency: "USD" as CurrencyCode,
			},
			tokenUsage: {
				byTier: {
					[session.modelTier]: {
						prompt: session.totalInputTokens,
						completion: session.totalOutputTokens,
					},
				},
			},
		};
	}

	getCapabilities(): HarnessCapabilities {
		return { preCompactionTrigger: true, subAgents: true };
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: SDK message translation requires branching on message type/subtype
	private *translateMessage(msg: SDKMessage, session: ActiveSession): Generator<HarnessEvent> {
		switch (msg.type) {
			case "assistant": {
				const usage = msg.message?.usage;
				if (usage) {
					const inputTokens = usage.input_tokens ?? 0;
					const outputTokens = usage.output_tokens ?? 0;
					session.totalInputTokens += inputTokens;
					session.totalOutputTokens += outputTokens;
					// L17: include tier so provisioning can accumulate tokens by tier.
					yield {
						type: "token_usage",
						inputTokens,
						outputTokens,
						tier: session.modelTier as ModelTier,
					};
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
				// L17: Claude SDK reports cost in USD — include currency for structured accumulation.
				yield { type: "cost_update", totalCost, deltaCost, currency: "USD" as CurrencyCode };

				if (msg.usage) {
					const inputTokens = msg.usage.input_tokens ?? 0;
					const outputTokens = msg.usage.output_tokens ?? 0;
					// L17: include tier for token accumulation by tier.
					yield {
						type: "token_usage",
						inputTokens,
						outputTokens,
						tier: session.modelTier as ModelTier,
					};
				}

				if (msg.subtype === "success" && msg.result) {
					yield { type: "completion", text: msg.result };
				}
				break;
			}

			case "system": {
				if ("subtype" in msg && msg.subtype === "compact_boundary") {
					// biome-ignore lint/style/useNamingConvention: Claude SDK wire format uses snake_case
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
