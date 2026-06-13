/**
 * X6: BuiltinHarnessAdapter — a HarnessAdapter implementation that runs a
 * structured agent loop (plan → execute → reflect → stop) using direct LLM API
 * calls via callLlm(). Supports Anthropic, OpenRouter, and OpenAI-compatible
 * model providers.
 *
 * @lore X6: We inject the registry rather than taking it in the constructor
 * because the registry is session-scoped (bound to a specific ToolContext
 * with sessionId, agentId, taskId, workspacePath, watcher). The adapter
 * is registered in the pool once; registries are created per-session by
 * the provisioning orchestrator.
 */

import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	ModelTier,
	SessionConfig,
	SessionHandle,
	SessionResult,
	TierTokenCount,
	TokenUsage,
	WireMoney,
} from "@hyperidle/shared";
// @lore X6: ModelTier is exported twice from @hyperidle/shared — once as ModelTier from types.ts
// and once as MoneyModelTier from types/money.ts (same type, different alias). We import
// ModelTier (not MoneyModelTier) for consistency with the rest of the codebase.
import type { ToolRegistry } from "../skill-tools/tool-registry.js";
import { contextWindowForModel, isAboveThreshold } from "./context-window.js";
import { callLlm } from "./llm-client.js";
import type {
	LlmMessage,
	LlmTextBlock,
	LlmToolDef,
	LlmToolResultBlock,
	LlmToolUseBlock,
} from "./llm-types.js";

/** Configuration options for the built-in harness. */
export interface BuiltinHarnessOptions {
	/** Maximum loop iterations before forced stop. Default: 50. */
	readonly maxIterations?: number;
	/** Tool calls between reflection checkpoints. Default: 5. */
	readonly reflectionInterval?: number;
	/** Context window usage fraction that triggers pre-compaction. Default: 0.8. */
	readonly preCompactionThreshold?: number;
	/** Max output tokens per LLM call. Default: 16384. */
	readonly maxOutputTokens?: number;
}

/**
 * Per-session state held in memory.
 *
 * @lore X6: `config` is nullable because setSessionToolRegistry() pre-registers
 * a session before startSession() is called (so config is not yet known at
 * pre-registration time). startSession() fills in the real config. All methods
 * that read config must guard against null — runLoop() only starts after
 * startSession() sets the real config, so in practice config is always set
 * before runLoop() or any other internal method reads it.
 */
interface BuiltinSession {
	readonly sessionId: string;
	config: SessionConfig | null;
	readonly messages: LlmMessage[];
	toolDefs: LlmToolDef[];
	registry: ToolRegistry | null;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCostUsd: number;
	tokensByTier: Partial<Record<ModelTier, TierTokenCount>>;
	toolCallCount: number;
	iterationCount: number;
	done: boolean;
	aborted: boolean;
	/** True when the loop exited normally (without abort). Used to disambiguate stopSession outcome. */
	completedNormally: boolean;
	events: HarnessEvent[];
	notifyStream: (() => void) | null;
	loopPromise: Promise<void> | null;
}

const COST_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
	// AH2 catalog — must stay in sync with MODEL_CATALOG in @hyperidle/shared
	// @lore AH2: See also MODEL_CONTEXT_WINDOWS in context-window.ts.
	"claude-opus-4-8": { input: 5, output: 25 },
	"claude-sonnet-4-6": { input: 3, output: 15 },
	"claude-haiku-4-5": { input: 1, output: 5 },
	"claude-fable-5": { input: 10, output: 50 },
};

const DEFAULT_COST = { input: 3, output: 15 };

const PLANNING_PROMPT =
	"Begin working on your assigned task. Before executing any actions, read the task context and propose a plan of subtasks.";

const REFLECTION_PROMPT = `Review your progress on the current task.
What have you accomplished so far?
What remains to be done?
Are you still on track for the task's done condition?
If you are stuck or going in circles, consider a different approach.`;

const MAX_ITERATIONS_PROMPT =
	"You have reached the iteration limit. Summarize your progress and wrap up.";

const SUMMARIZE_SYSTEM = "You are a conversation summarizer. Produce a concise summary.";

function estimateCostUsd(inputTokens: number, outputTokens: number, model: string): number {
	const rates = COST_PER_MILLION_TOKENS[model] ?? DEFAULT_COST;
	return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

function extractTextFromContent(content: readonly (LlmTextBlock | LlmToolUseBlock)[]): string {
	return content
		.filter((b): b is LlmTextBlock => b.type === "text")
		.map((b) => b.text)
		.join("\n");
}

function formatMessagesForSummary(messages: LlmMessage[]): string {
	return messages
		.map((m) => {
			const role = m.role.toUpperCase();
			if (typeof m.content === "string") {
				return `${role}: ${m.content}`;
			}
			const text = m.content
				.map((b) => {
					if (b.type === "text") return b.text;
					if (b.type === "tool_use") return `[Tool: ${b.name}(${JSON.stringify(b.input)})]`;
					if (b.type === "tool_result")
						return `[Result: ${b.isError ? "ERROR" : "OK"} ${b.content}]`;
					return "";
				})
				.join(" ");
			return `${role}: ${text}`;
		})
		.join("\n");
}

export class BuiltinHarnessAdapter implements HarnessAdapter {
	private readonly options: Required<BuiltinHarnessOptions>;
	private readonly sessions: Map<string, BuiltinSession>;

	constructor(options?: BuiltinHarnessOptions) {
		this.options = {
			maxIterations: options?.maxIterations ?? 50,
			reflectionInterval: options?.reflectionInterval ?? 5,
			preCompactionThreshold: options?.preCompactionThreshold ?? 0.8,
			maxOutputTokens: options?.maxOutputTokens ?? 16_384,
		};
		// AF7 §3: no more internal id-minting — sessions are keyed by config.sessionId.
		this.sessions = new Map();
	}

	/**
	 * X6: Inject a tool registry for a session. Must be called before startSession.
	 * The provisioning orchestrator calls this after building the registry (Phase 8).
	 *
	 * This method is on the concrete class, NOT on the HarnessAdapter interface.
	 * The provisioning orchestrator casts to BuiltinHarnessAdapter when
	 * meta.type === "builtin".
	 */
	setSessionToolRegistry(sessionId: string, registry: ToolRegistry): void {
		// Store in a pending map; startSession will pick it up
		const pending = this.sessions.get(sessionId);
		if (pending) {
			pending.registry = registry;
			pending.toolDefs = this.toolDefsFromRegistry(registry);
		} else {
			// Pre-register for the upcoming startSession call.
			// config is null here; startSession() fills it in before runLoop() executes.
			this.sessions.set(sessionId, {
				sessionId,
				config: null,
				messages: [],
				toolDefs: this.toolDefsFromRegistry(registry),
				registry,
				totalInputTokens: 0,
				totalOutputTokens: 0,
				totalCostUsd: 0,
				tokensByTier: {},
				toolCallCount: 0,
				iterationCount: 0,
				done: false,
				aborted: false,
				completedNormally: false,
				events: [],
				notifyStream: null,
				loopPromise: null,
			});
		}
	}

	// biome-ignore lint/suspicious/useAwait: interface requires Promise return; async keyword ensures rejection is a rejected Promise, not a thrown Error
	async startSession(config: SessionConfig): Promise<SessionHandle> {
		if (!config.resolvedModel) {
			throw new Error("BuiltinHarnessAdapter: resolvedModel is required in SessionConfig");
		}

		// AF7 §3 (Z8-092/093): the sessionId is the isolation contract. We key the
		// session map on the EXACT id supplied in config (the same id the
		// provisioning orchestrator used in setSessionToolRegistry), never on a
		// freshly-minted `builtin-N`. The old code minted a new id and *scanned* the
		// map for "the first un-started pre-registered session" to reconcile the
		// registry — under two concurrent provisions that scan could bind session
		// B's registry to session A. Keying by config.sessionId removes the scan and
		// the ambiguity entirely.
		//
		// @lore AF7 Z8-092/093: do NOT reintroduce id-minting + map-scan reconcile —
		// it is the exact cross-session registry-swap bug AF7 closes. The registry
		// is pre-registered under config.sessionId by setSessionToolRegistry.
		const { sessionId } = config;

		const preRegistered = this.sessions.get(sessionId);

		let session: BuiltinSession;
		if (preRegistered && preRegistered.loopPromise === null && !preRegistered.done) {
			// Reuse the pre-registered session (its registry/toolDefs were injected
			// under this exact id) and fill in the now-known config.
			session = {
				...preRegistered,
				config,
				messages: [],
			};
		} else {
			session = {
				sessionId,
				config,
				messages: [],
				toolDefs: [],
				registry: null,
				totalInputTokens: 0,
				totalOutputTokens: 0,
				totalCostUsd: 0,
				tokensByTier: {},
				toolCallCount: 0,
				iterationCount: 0,
				done: false,
				aborted: false,
				completedNormally: false,
				events: [],
				notifyStream: null,
				loopPromise: null,
			};
		}

		this.sessions.set(sessionId, session);

		// Start background loop — do NOT await
		session.loopPromise = this.runLoop(session).catch((err) => {
			const message = err instanceof Error ? err.message : String(err);
			this.emitEvent(session, {
				type: "error",
				message,
				code: "LOOP_ERROR",
			});
			session.done = true;
			session.notifyStream?.();
		});

		return { sessionId };
	}

	async *streamEvents(handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		const session = this.sessions.get(handle.sessionId);
		if (!session) {
			throw new Error(`BuiltinHarnessAdapter: unknown session ${handle.sessionId}`);
		}

		let cursor = 0;

		while (true) {
			// Drain all buffered events
			while (cursor < session.events.length) {
				const event = session.events[cursor];
				if (event) {
					yield event;
				}
				cursor++;
			}

			// If session is done, we're finished
			if (session.done) {
				break;
			}

			// Wait for new events via notify
			await new Promise<void>((resolve) => {
				session.notifyStream = resolve;
			});
			session.notifyStream = null;
		}

		// Drain any remaining events added after done=true
		while (cursor < session.events.length) {
			const event = session.events[cursor];
			if (event) {
				yield event;
			}
			cursor++;
		}
	}

	async stopSession(handle: SessionHandle): Promise<SessionResult> {
		const session = this.sessions.get(handle.sessionId);
		if (!session) {
			throw new Error(`BuiltinHarnessAdapter: unknown session ${handle.sessionId}`);
		}

		// If loop already completed normally, we report "completed" regardless.
		// If loop is still running when stopSession is called, mark aborted and report "stopped".
		const alreadyDone = session.completedNormally;
		if (!alreadyDone) {
			session.aborted = true;
		}

		// Wait for the loop to finish (it checks aborted flag)
		if (session.loopPromise) {
			await session.loopPromise;
		}

		const outcome: "completed" | "stopped" | "crashed" = alreadyDone ? "completed" : "stopped";

		const cost: WireMoney = {
			minor: Math.round(session.totalCostUsd * 100),
			currency: "USD",
		};

		const tokenUsage: TokenUsage = {
			byTier: session.tokensByTier,
		};

		return {
			outcome,
			cost,
			tokenUsage,
		};
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: true,
			subAgents: false,
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			mcpSupport: false,
		};
	}

	// ── Internal loop ─────────────────────────────────────────────────────────

	private async runLoop(session: BuiltinSession): Promise<void> {
		// runLoop is only called from startSession(), which always sets config before
		// spawning the loop. The null guard here is a defensive type-system check.
		if (!session.config) {
			throw new Error("BuiltinHarnessAdapter: runLoop called with null config");
		}

		try {
			// PLANNING TURN
			await this.runPlanningTurn(session);

			if (session.aborted) {
				session.done = true;
				session.notifyStream?.();
				return;
			}

			// EXECUTE LOOP
			while (!session.done && session.iterationCount < this.options.maxIterations) {
				if (session.aborted) {
					break;
				}

				// Check reflection checkpoint
				if (
					session.toolCallCount > 0 &&
					session.toolCallCount % this.options.reflectionInterval === 0
				) {
					await this.injectReflection(session);
					if (session.aborted || session.done) break;
				}

				await this.runExecuteTurn(session);
				session.iterationCount++;
			}

			// MAX ITERATIONS REACHED
			if (!(session.done || session.aborted)) {
				await this.runMaxIterationsTurn(session);
			}

			// Loop completed normally (not via abort or error)
			if (!session.aborted) {
				session.completedNormally = true;
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.emitEvent(session, {
				type: "error",
				message,
				code: "LOOP_ERROR",
			});
		} finally {
			session.done = true;
			session.notifyStream?.();
		}
	}

	private async runPlanningTurn(session: BuiltinSession): Promise<void> {
		// Append planning user message
		session.messages.push({
			role: "user",
			content: PLANNING_PROMPT,
		});

		const config = session.config;
		if (!config) throw new Error("BuiltinHarnessAdapter: session config is null in planning turn");
		const resolvedModel = config.resolvedModel;
		if (!resolvedModel) throw new Error("resolvedModel is required");

		const response = await callLlm({
			model: resolvedModel,
			messages: session.messages,
			tools: session.toolDefs,
			system: config.composedPrompt,
			maxTokens: this.options.maxOutputTokens,
		});

		// Track usage
		this.trackUsage(session, response.usage, config.modelTier);

		// Append assistant response
		session.messages.push({
			role: "assistant",
			content: response.content,
		});

		// Execute tool calls if any (context gathering during planning)
		const toolCalls = response.content.filter((b): b is LlmToolUseBlock => b.type === "tool_use");
		if (toolCalls.length > 0 && session.registry) {
			const results = await this.executeToolCalls(session, toolCalls);
			session.messages.push({
				role: "user",
				content: results,
			});
		}

		// Capture plan text
		const planText = extractTextFromContent(response.content);

		// Emit completion with plan
		if (planText) {
			this.emitEvent(session, { type: "completion", text: planText });
		}

		// Write plan to session notes
		if (planText && session.registry) {
			try {
				await session.registry.invoke("write_session_notes", { notes: planText });
			} catch {
				// Non-fatal: write_session_notes failure doesn't abort planning
			}
		}
	}

	private async runExecuteTurn(session: BuiltinSession): Promise<void> {
		const config = session.config;
		if (!config) throw new Error("BuiltinHarnessAdapter: session config is null in execute turn");
		const resolvedModel = config.resolvedModel;
		if (!resolvedModel) throw new Error("resolvedModel is required");

		const response = await callLlm({
			model: resolvedModel,
			messages: session.messages,
			tools: session.toolDefs,
			system: config.composedPrompt,
			maxTokens: this.options.maxOutputTokens,
		});

		// Track usage
		this.trackUsage(session, response.usage, config.modelTier);

		// Check context window pressure using LATEST call's inputTokens (CRITICAL-1)
		const contextWindow = contextWindowForModel(resolvedModel.model);
		const latestInputTokens = response.usage.inputTokens;

		if (isAboveThreshold(latestInputTokens, contextWindow, this.options.preCompactionThreshold)) {
			// Emit pre_compaction
			this.emitEvent(session, {
				type: "pre_compaction",
				contextTokens: latestInputTokens,
				maxTokens: contextWindow,
			});

			// Write session notes as crash safety
			if (session.registry) {
				try {
					const summary = formatMessagesForSummary(
						session.messages
							.slice(-6)
							.filter(
								(m) =>
									m.role !== "user" ||
									typeof m.content !== "string" ||
									!m.content.startsWith("Begin working"),
							),
					);
					await session.registry.invoke("write_session_notes", {
						notes: `[Pre-compaction snapshot]\n${summary}`,
						append: true,
					});
				} catch {
					// Non-fatal
				}
			}

			// Summarize history
			await this.summarizeHistory(session);
		}

		// Append assistant response
		session.messages.push({
			role: "assistant",
			content: response.content,
		});

		// Process response
		const toolCalls = response.content.filter((b): b is LlmToolUseBlock => b.type === "tool_use");

		if (toolCalls.length > 0 && session.registry) {
			// Execute tool calls
			const results = await this.executeToolCalls(session, toolCalls);
			session.messages.push({
				role: "user",
				content: results,
			});
		} else if (response.stopReason === "end_turn" || response.stopReason === "stop") {
			// Text-only response — loop done
			const text = extractTextFromContent(response.content);
			if (text) {
				this.emitEvent(session, { type: "completion", text });
			}
			session.done = true;
		}
		// max_tokens hit: continue loop (LLM ran out of output space, not done)
	}

	private async runMaxIterationsTurn(session: BuiltinSession): Promise<void> {
		const config = session.config;
		if (!config)
			throw new Error("BuiltinHarnessAdapter: session config is null in max iterations turn");
		const resolvedModel = config.resolvedModel;
		if (!resolvedModel) throw new Error("resolvedModel is required");

		session.messages.push({
			role: "user",
			content: MAX_ITERATIONS_PROMPT,
		});

		const response = await callLlm({
			model: resolvedModel,
			messages: session.messages,
			// No tools during wrap-up
			system: config.composedPrompt,
			maxTokens: this.options.maxOutputTokens,
		});

		this.trackUsage(session, response.usage, config.modelTier);

		const text = extractTextFromContent(response.content);
		if (text) {
			this.emitEvent(session, { type: "completion", text });
		}

		session.done = true;
	}

	private async executeToolCalls(
		session: BuiltinSession,
		toolCalls: LlmToolUseBlock[],
	): Promise<LlmToolResultBlock[]> {
		const results: LlmToolResultBlock[] = [];

		for (const toolCall of toolCalls) {
			// AF7 §5.3 (AC5, Z8-048): per-invoke abort guard. A handoff aborts the
			// session via stopSession() which sets `aborted`; the run loop only
			// observes that flag BETWEEN iterations, so a batch of tool calls already
			// inside executeToolCalls would otherwise all run after the handoff
			// landed. Check `aborted` before STARTING each invoke so no new tool call
			// begins once the handoff completes. An invoke already in flight at the
			// instant of abort may finish (cooperative abort), but the next one does
			// not start — this is the "no new tool call starts after handoff" contract.
			if (session.aborted) {
				break;
			}

			// Emit tool_call event before execution
			this.emitEvent(session, {
				type: "tool_call",
				toolName: toolCall.name,
				args: toolCall.input,
			});

			session.toolCallCount++;

			if (!session.registry) {
				results.push({
					type: "tool_result",
					toolUseId: toolCall.id,
					content: "Error [NO_REGISTRY]: Tool registry not available",
					isError: true,
				});
				continue;
			}

			try {
				const result = await session.registry.invoke(toolCall.name, toolCall.input);

				if (result.success) {
					results.push({
						type: "tool_result",
						toolUseId: toolCall.id,
						content: JSON.stringify(result.data),
						isError: false,
					});
				} else {
					results.push({
						type: "tool_result",
						toolUseId: toolCall.id,
						content: `Error [${result.code}]: ${result.error}`,
						isError: true,
					});
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				results.push({
					type: "tool_result",
					toolUseId: toolCall.id,
					content: `Error [INVOKE_ERROR]: ${message}`,
					isError: true,
				});
			}
		}

		return results;
	}

	private async injectReflection(session: BuiltinSession): Promise<void> {
		const config = session.config;
		if (!config) return;
		const resolvedModel = config.resolvedModel;
		if (!resolvedModel) return;

		session.messages.push({
			role: "user",
			content: REFLECTION_PROMPT,
		});

		const response = await callLlm({
			model: resolvedModel,
			messages: session.messages,
			tools: session.toolDefs,
			system: config.composedPrompt,
			maxTokens: this.options.maxOutputTokens,
		});

		this.trackUsage(session, response.usage, config.modelTier);

		session.messages.push({
			role: "assistant",
			content: response.content,
		});

		const text = extractTextFromContent(response.content);
		if (text) {
			this.emitEvent(session, { type: "completion", text });
		}

		// Execute any tool calls made during reflection
		const toolCalls = response.content.filter((b): b is LlmToolUseBlock => b.type === "tool_use");
		if (toolCalls.length > 0 && session.registry) {
			const results = await this.executeToolCalls(session, toolCalls);
			session.messages.push({
				role: "user",
				content: results,
			});
		}
	}

	private async summarizeHistory(session: BuiltinSession): Promise<void> {
		const config = session.config;
		if (!config) return;
		const summarizeModel = config.resolvedFastModel ?? config.resolvedModel;
		if (!summarizeModel) return;

		const preserveCount = 6;
		const toSummarize = session.messages.slice(0, -preserveCount);

		if (toSummarize.length < 4) {
			return; // Not enough to summarize
		}

		const summaryRequest: LlmMessage[] = [
			{
				role: "user",
				content: `Summarize the following conversation concisely, preserving:
- Key decisions made
- Tool calls and their outcomes
- Current progress toward the task
- Any blockers or issues encountered

Conversation to summarize:
${formatMessagesForSummary(toSummarize)}`,
			},
		];

		const response = await callLlm({
			model: summarizeModel,
			messages: summaryRequest,
			maxTokens: 4096,
			system: SUMMARIZE_SYSTEM,
		});

		// Track tokens for appropriate tier
		const tier =
			config.resolvedFastModel !== undefined && summarizeModel === config.resolvedFastModel
				? "fast"
				: config.modelTier;
		this.trackUsage(session, response.usage, tier);

		const summaryText = extractTextFromContent(response.content);
		if (!summaryText) return;

		// Replace old messages with summary + preserved recent messages
		const recentMessages = session.messages.slice(-preserveCount);
		session.messages.splice(
			0,
			session.messages.length,
			{ role: "user", content: `[Previous conversation summary]\n${summaryText}` },
			{ role: "assistant", content: "Understood. Continuing from the summary." },
			...recentMessages,
		);
	}

	private emitEvent(session: BuiltinSession, event: HarnessEvent): void {
		session.events.push(event);
		session.notifyStream?.();
	}

	private trackUsage(
		session: BuiltinSession,
		usage: { inputTokens: number; outputTokens: number },
		tier: ModelTier,
	): void {
		session.totalInputTokens += usage.inputTokens;
		session.totalOutputTokens += usage.outputTokens;

		const resolvedModel = session.config?.resolvedModel;
		const model = resolvedModel?.model ?? "unknown";
		const deltaCost = estimateCostUsd(usage.inputTokens, usage.outputTokens, model);
		session.totalCostUsd += deltaCost;

		// Update per-tier token counts
		const existing = session.tokensByTier[tier];
		session.tokensByTier[tier] = {
			prompt: (existing?.prompt ?? 0) + usage.inputTokens,
			completion: (existing?.completion ?? 0) + usage.outputTokens,
		};

		// Emit token_usage event
		this.emitEvent(session, {
			type: "token_usage",
			inputTokens: usage.inputTokens,
			outputTokens: usage.outputTokens,
			tier,
		});

		// Emit cost_update event
		this.emitEvent(session, {
			type: "cost_update",
			totalCost: session.totalCostUsd,
			deltaCost,
			currency: "USD",
		});
	}

	private toolDefsFromRegistry(registry: ToolRegistry): LlmToolDef[] {
		const specs = registry.toClaudeToolSpecs();
		return specs.map((spec) => ({
			name: spec.name,
			description: spec.description,
			inputSchema: {
				type: "object" as const,
				properties: spec.input_schema.properties,
				...(spec.input_schema.required ? { required: spec.input_schema.required } : {}),
			},
		}));
	}
}
