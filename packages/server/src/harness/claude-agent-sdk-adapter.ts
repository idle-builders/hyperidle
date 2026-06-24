/** Claude Agent SDK adapter — concrete HarnessAdapter implementation (D2). */

import type { Query, SDKMessage, SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
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
import {
	AL6_MAX_FORCE_RETURNS,
	createLogger,
	isReturnAction,
	MissingCredentialError,
	shouldForceReturn,
} from "@hyperidle/shared";
import type { CredentialResolver } from "../services/credential-resolver.js";
import { BUILT_IN_GATEWAY_CONFIG } from "../services/model-gateway.js";
import { enforcementRegistry } from "./return-enforcement-registry.js";

/**
 * S4: Re-export CredentialResolver so the @hyperidle/server/harness sub-path
 * export exposes both ClaudeAgentSdkAdapter and the interface it depends on.
 * Desktop uses: import type { CredentialResolver } from "@hyperidle/server/harness"
 *
 * @lore S4 Decision 2: The sub-path export points directly at this adapter file
 * (not a barrel) per architecture-critique warning. CredentialResolver is re-exported
 * here so desktop consumers get both symbols from a single import.
 */
export type { CredentialResolver } from "../services/credential-resolver.js";

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

/**
 * AL6 v2 (T5): Mutable state for force-return tracking in the SDK adapter.
 * Shared between the Stop hook closure and translateMessage so they both
 * read/write the same live object.
 *
 * @lore AL6 T5: ActiveSession.al6 is the shared mutable ref because
 * `returnSeen` and `stopHookCount` are primitive booleans/numbers — JS doesn't
 * allow field aliasing. The hook closure and translateMessage both receive the
 * same ActiveSession reference, so mutating session.al6.returnSeen is visible
 * to the hook even though the hook was created before this.sessions.set().
 */
interface AL6ForceState {
	returnSeen: boolean;
	stopHookCount: number;
}

interface ActiveSession {
	query: Query;
	abortController: AbortController;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCost: number;
	/** L17: the model tier from SessionConfig — used to tag token_usage events. */
	modelTier: string;
	/**
	 * AL6 v2 (T5): Shared mutable state for force-return tracking.
	 * Read/written by both the Stop hook closure and translateMessage.
	 */
	al6: AL6ForceState;
}

interface AdapterOptions {
	readonly apiKeyEnvVar?: string;
	/** Injected query function for testing. */
	readonly queryFn?: typeof sdkQuery;
	/**
	 * Optional credential resolver. When present, used instead of reading
	 * process.env[apiKeyEnvVar] for the Anthropic API key. Supports shared-mode
	 * deployments where credentials live in the encrypted server_credentials table.
	 *
	 * @lore P3 AC-15 / Decision 4: inject resolver rather than mutating process.env.
	 * In local mode no resolver is injected and the env var path is unchanged.
	 * In shared mode the resolver reads from the encrypted DB.
	 */
	readonly credentialResolver?: CredentialResolver;
}

export class ClaudeAgentSdkAdapter implements HarnessAdapter {
	private readonly apiKeyEnvVar: string;
	private readonly sessions = new Map<string, ActiveSession>();
	private readonly queryFn: typeof sdkQuery;
	private readonly credentialResolver: CredentialResolver | undefined;
	private nextId = 1;

	constructor(options?: AdapterOptions) {
		this.apiKeyEnvVar = options?.apiKeyEnvVar ?? "ANTHROPIC_API_KEY";
		this.queryFn = options?.queryFn ?? sdkQuery;
		this.credentialResolver = options?.credentialResolver;
	}

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		// X4: Use resolved model from gateway if available, fall back to legacy resolution.
		// @lore X4 A-IMP-1: resolvedModel is computed in sessions-routes.ts (where
		// credentialResolver is available) and passed via SessionConfig. The adapter
		// itself does not call resolveModelTier — it only consumes the result.
		let apiKey: string | null | undefined;
		let model: string;

		if (config.resolvedModel) {
			// X4: Gateway-resolved path — uses whatever provider was configured.
			apiKey = config.resolvedModel.apiKey;
			model = config.resolvedModel.model;
		} else {
			// Legacy path: resolve from env var (local mode) or credentialResolver (shared mode).
			// This path is used when resolvedModel is not set (e.g. tests that don't go through
			// the full provisioning flow). Falls back to Anthropic direct only.
			if (this.credentialResolver) {
				apiKey = await this.credentialResolver.resolve("anthropic_api_key");
			} else {
				apiKey = process.env[this.apiKeyEnvVar];
			}
			// Tier-to-model resolution for the adapter-direct path (no gateway).
			// Derived from BUILT_IN_GATEWAY_CONFIG — single source of truth for model IDs.
			// This path is only taken when resolvedModel is absent (e.g. direct adapter
			// tests that bypass the full session provisioning flow).
			model =
				BUILT_IN_GATEWAY_CONFIG[config.modelTier as keyof typeof BUILT_IN_GATEWAY_CONFIG]?.model ??
				BUILT_IN_GATEWAY_CONFIG.workhorse.model;
		}

		if (!apiKey) {
			throw new MissingCredentialError(
				config.resolvedModel
					? `API key for provider '${config.resolvedModel.provider}' (tier: ${config.modelTier}) is not set`
					: this.credentialResolver
						? "anthropic_api_key not found in credential resolver"
						: `Environment variable ${this.apiKeyEnvVar} is not set`,
			);
		}

		const abortController = new AbortController();

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

		// AL6 v2 (T5): Shared mutable state for force-return tracking.
		// Created before the query so the Stop hook closure captures a live reference.
		// @lore AL6 T5: al6 is shared between the hook closure and translateMessage
		// via the ActiveSession object. Both receive the same al6 reference, so
		// translateMessage can set al6.returnSeen=true and the hook sees it immediately.
		const al6: AL6ForceState = { returnSeen: false, stopHookCount: 0 };

		// AL6 v2 (T5): Wire the Stop hook for Tier-1 force-return.
		// When Claude tries to stop without calling a return action, block it and
		// re-inject AL6_FORCE_RETURN_MESSAGE. Budget: AL6_MAX_FORCE_RETURNS attempts.
		// After budget exhausted, let the stop proceed (Tier-2 drain handles rejection).
		//
		// @lore AL6 T5: The Stop hook fires when Claude emits stop_reason: "end_turn"
		// or similar. Returning { decision: "block", reason: "..." } injects the reason
		// as a user message and continues the turn. The hook is async per SDK contract
		// but we do no async work here.
		//
		// AL6 CRIT-2: The Stop hook ADJUDICATES from the shared enforcement registry
		// (single source of truth). It reads the registry entry for this session and
		// calls shouldForceReturn against the registry's gate + forceCount. On block
		// it increments the registry so the CLI/tool paths see the same counter.
		// The local al6 object is retained ONLY for translateMessage's returnSeen flag
		// (the SDK path must mark returnSeen to suppress false-positive re-injection
		// when the LLM emits a return tool call). stopHookCount is no longer the
		// adjudication counter — registry.forceCount is.
		//
		// @lore AL6 CRIT-2: Using the registry as the single adjudicator means the
		// hyperidle_return_status tool (file-hook path) and the SDK in-process hook
		// both read/write the SAME counter. Previously the SDK adjudicated from
		// al6.stopHookCount (local, invisible to the registry), making the two paths
		// diverge. Now: any fire from either path is counted once in the registry.
		const hookSessionId = config.sessionId;

		// biome-ignore lint/suspicious/useAwait: SDK hook interface requires Promise return; no async work needed
		const stopHook = async (
			_input: unknown,
			_toolUseId: string | undefined,
		): Promise<SyncHookJSONOutput> => {
			// AL6 CRIT-2: read from the shared registry — single adjudication source.
			// Falls back to allow-stop if the session was never registered (exempt/internal).
			const entry = enforcementRegistry.get(hookSessionId);
			const forceMsg =
				entry && !entry.exempt ? shouldForceReturn(entry.gate, entry.forceCount) : null;
			if (forceMsg !== null) {
				// Increment in the registry (not al6.stopHookCount — that is now a secondary
				// counter maintained only for getForceReturnCount compatibility).
				enforcementRegistry.incrementForce(hookSessionId);
				al6.stopHookCount++;
				sdkLogger.debug(
					`AL6: Stop hook blocking stop (attempt ${al6.stopHookCount}/${AL6_MAX_FORCE_RETURNS}) — ` +
						"return not yet seen, re-injecting force message (registry-adjudicated)",
				);
				return { decision: "block", reason: forceMsg };
			}
			// Budget exhausted, return already seen, or session exempt — allow stop.
			return { decision: "approve" };
		};

		const queryOptions: Record<string, unknown> = {
			model,
			cwd: config.sandboxPath,
			tools: config.tools as string[],
			abortController,
			permissionMode: unsafeMode ? "bypassPermissions" : "default",
			persistSession: false,
			env: sandboxedEnv,
			hooks: {
				Stop: [{ hooks: [stopHook] }],
			},
		};
		if (unsafeMode) {
			queryOptions.allowDangerouslySkipPermissions = true;
		}

		// X1: Full instructions are in CLAUDE.md which Claude Agent SDK auto-discovers
		// from `cwd` (the workspace). The prompt is now just a kickoff message.
		// @lore X1: CLAUDE.md as primary delivery — claude code reads CLAUDE.md from
		// cwd and injects it as a system-reminder automatically. No systemPrompt
		// override needed; the default system prompt is preserved.
		const q = this.queryFn({
			prompt: "Begin working on your assigned task.",
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
			al6,
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
		// X5: mcpSupport: true — Claude Code reads .mcp.json from cwd and routes
		// HyperIdle tool calls through MCP. The tool_call events in the event stream
		// are informational; actual invocations already happened via MCP.
		return {
			preCompactionTrigger: true,
			subAgents: true,
			modelProviders: ["anthropic"],
			mcpSupport: true,
			// AL6 v3: SDK Stop hook (decision:block + reason) catches the stop in-turn
			// and re-injects — the Layer-A fast-path. hasNativeReturnHook=true (optimization only).
			returnEnforcement: "sdk-inprocess",
			// AL6 v3: SDK can re-engage via Mode-1 sandbox rewrite + new startSession backstop.
		};
	}

	/**
	 * AL6 v3 (T4): Implements HarnessAdapter.getForceReturnCount (optional interface method).
	 * Returns the count of in-turn Stop-hook re-injections (Layer-A) for a session.
	 * Used by the provisioning loop to unify forceReturnCount across layers.
	 */
	getForceReturnCount(sessionId: string): number {
		return this.sessions.get(sessionId)?.al6.stopHookCount ?? 0;
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
							// AL6 v2 (T5): track return-action tool calls so the Stop hook
							// knows not to block a stop after a return has been called.
							if (isReturnAction(block.name)) {
								session.al6.returnSeen = true;
							}
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
