/**
 * X6: BuiltinHarnessAdapter — a HarnessAdapter implementation that runs a
 * structured agent loop (plan → execute → reflect → stop) using direct LLM API
 * calls via callLlm(). Supports Anthropic, OpenRouter, and OpenAI-compatible
 * model providers.
 *
 * @lore X6: We inject the registry rather than taking it in the constructor
 * because the registry is session-scoped (bound to a specific ToolContext
 * with sessionId, agentId, taskId, sandboxPath, watcher). The adapter
 * is registered in the pool once; registries are created per-session by
 * the provisioning orchestrator.
 */

import type { ModelTier, TierTokenCount, TokenUsage } from "@hyperidle/domain-model";
import type {
	ConversationMessage,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";
import { isRequiredReturnAction, shouldForceReturn } from "@hyperidle/harness-protocol";
import type { ToolRegistry } from "@hyperidle/tool-protocol";
// @lore X6: ModelTier is exported twice from @hyperidle/domain-model — once as ModelTier from types.ts
// and once as MoneyModelTier from types/money.ts (same type, different alias). We import
// ModelTier (not MoneyModelTier) for consistency with the rest of the codebase.
import { isAboveThreshold, modelContextWindow } from "./context-window.js";
import { callLlm } from "./llm-client.js";
import type {
	LlmMessage,
	LlmTextBlock,
	LlmToolDef,
	LlmToolResultBlock,
	LlmToolUseBlock,
} from "./llm-types.js";

/** Configuration options for the built-in harness. */
interface BuiltinHarnessOptions {
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
	tokensByTier: Partial<Record<ModelTier, TierTokenCount>>;
	toolCallCount: number;
	iterationCount: number;
	done: boolean;
	aborted: boolean;
	readonly abortController: AbortController;
	/** True when the loop exited normally (without abort). Used to disambiguate stopSession outcome. */
	completedNormally: boolean;
	events: HarnessEvent[];
	notifyStream: (() => void) | null;
	loopPromise: Promise<void> | null;
	/**
	 * True once any tool_call event named a member of RETURN_ACTION_NAMES
	 * is emitted during executeToolCalls. Used by the forcing layer at stop attempts.
	 */
	returnSeen: boolean;
	/**
	 * Number of force-continue re-injections applied this session.
	 * The forcing layer uses this to bound force at MAX_FORCE_RETURNS.
	 * Exposed on stopSession for the eval harness (forceReturnCount).
	 */
	forceCount: number;
}

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
				tokensByTier: {},
				toolCallCount: 0,
				iterationCount: 0,
				done: false,
				aborted: false,
				abortController: new AbortController(),
				completedNormally: false,
				events: [],
				notifyStream: null,
				loopPromise: null,
				returnSeen: false,
				forceCount: 0,
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
				tokensByTier: {},
				toolCallCount: 0,
				iterationCount: 0,
				done: false,
				aborted: false,
				abortController: new AbortController(),
				completedNormally: false,
				events: [],
				notifyStream: null,
				loopPromise: null,
				returnSeen: false,
				forceCount: 0,
			};
		}

		this.sessions.set(sessionId, session);

		// Start background loop — do NOT await
		session.loopPromise = this.runLoop(session).catch((err) => {
			if (session.aborted) {
				session.done = true;
				session.notifyStream?.();
				return;
			}
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
			session.abortController.abort();
		}

		// Wait for the loop to finish (it checks aborted flag)
		if (session.loopPromise) {
			await session.loopPromise;
		}

		const outcome: "completed" | "stopped" | "crashed" = alreadyDone ? "completed" : "stopped";

		const tokenUsage: TokenUsage = {
			byTier: session.tokensByTier,
		};

		return {
			outcome,
			tokenUsage,
		};
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: true,
			subAgents: false,
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			mcpSupport: false,
			// Builtin owns the in-process loop — forces return inside the
			// turn boundary without any external hook. Channel = "builtin-loop".
			returnEnforcement: "builtin-loop",
		};
	}

	/**
	 * Implements the optional HarnessAdapter.getForceReturnCount interface.
	 * Returns the number of in-turn force-continue re-injections (Layer-A) applied by the
	 * builtin loop during a session. Used by the provisioning loop to unify the
	 * turn-level forceReturnCount: loopForceCount + (harness.getForceReturnCount?.() ?? 0).
	 */
	getForceReturnCount(sessionId: string): number {
		return this.sessions.get(sessionId)?.forceCount ?? 0;
	}

	// ── Internal loop ─────────────────────────────────────────────────────────

	private async runLoop(session: BuiltinSession): Promise<void> {
		// runLoop is only called from startSession(), which always sets config before
		// spawning the loop. The null guard here is a defensive type-system check.
		if (!session.config) {
			throw new Error("BuiltinHarnessAdapter: runLoop called with null config");
		}

		try {
			// @lore AH3 H3: Branch on config.messages to distinguish a chat-completion
			// turn from a task-planning session — a GENERIC input keyed on
			// `params.transcript`'s presence for ANY kind, not an assistant-only
			// special case. When messages are present, run a single chat
			// completion (the caller's message → the agent's reply).
			// When absent, run the full task-planning loop (existing task session path).
			// This is the fix that stops the adapter from answering PLANNING_PROMPT
			// instead of the caller's actual question.
			if (session.config.messages && session.config.messages.length > 0) {
				await this.runChatTurn(session);
			} else {
				// Task session path — planning loop unchanged
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
			}

			// Loop completed normally (not via abort or error)
			if (!session.aborted) {
				session.completedNormally = true;
			}
		} catch (err) {
			if (!session.aborted) {
				const message = err instanceof Error ? err.message : String(err);
				this.emitEvent(session, {
					type: "error",
					message,
					code: "LOOP_ERROR",
				});
			}
		} finally {
			session.done = true;
			session.notifyStream?.();
		}
	}

	/**
	 * Run a chat-completion turn with a bounded tool-use loop.
	 *
	 * @lore AH3 H3: This is the assistant turn's execution path (and, since
	 * AU27 Increment 6, any other kind that bakes a transcript). Unlike the
	 * task-planning loop (runPlanningTurn → execute loop → reflect), a chat turn
	 * uses the thread transcript as seed messages and runs AT MOST MAX_TOOL_ITERATIONS
	 * tool-use rounds before emitting a completion (never silent).
	 *
	 * @lore AK4: Bounded loop added (MAX_TOOL_ITERATIONS=3). If registry is
	 * present (injected via setSessionToolRegistry), tool_use blocks are executed
	 * via executeToolCalls. No planning prompt, no reflection, no sandbox — task-free.
	 * `hadToolCalls` (a plain boolean) is the signal that decides whether
	 * CAP_FALLBACK fires (see below).
	 *
	 * Never-silent: if the cap is hit without a text end_turn, the fallback copy
	 * is emitted so the client always receives a response.
	 */
	private async runChatTurn(session: BuiltinSession): Promise<void> {
		const config = session.config;
		if (!config) throw new Error("BuiltinHarnessAdapter: session config is null in chat turn");
		const resolvedModel = config.resolvedModel;
		if (!resolvedModel) throw new Error("resolvedModel is required");

		// @lore AK4: MAX_TOOL_ITERATIONS caps the chat-turn tool-use loop.
		// 3 iterations: matches the accepted v1 tradeoff (one bet, one refinement,
		// one recovery). ASSISTANT_TURN_TIMEOUT_MS still wraps the whole turn.
		const MAX_TOOL_ITERATIONS = 3;
		const CAP_FALLBACK =
			"I started shaping that but ran out of steps — say 'continue' and I'll keep going.";

		// Seed session messages from thread transcript
		const conversationMessages = config.messages as readonly ConversationMessage[];
		for (const msg of conversationMessages) {
			session.messages.push({
				role: msg.role,
				content: msg.content,
			});
		}

		let hadToolCalls = false;
		let lastText = "";
		let toolIterations = 0;

		// @lore AK1: composedPrompt → assembledPrompt per AK1 harness-vocab rename.
		while (true) {
			const response = await callLlm({
				model: resolvedModel,
				messages: session.messages,
				// When registry is injected, expose its tool surface; otherwise no tools.
				tools: session.registry ? session.toolDefs : [],
				system: config.assembledPrompt,
				maxTokens: this.options.maxOutputTokens,
				signal: session.abortController.signal,
			});

			this.trackUsage(session, response.usage, config.modelTier);

			const text = extractTextFromContent(response.content);
			if (text) {
				lastText = text;
			}

			const toolUseBlocks = response.content.filter(
				(b): b is LlmToolUseBlock => b.type === "tool_use",
			);

			if (toolUseBlocks.length > 0 && session.registry && toolIterations < MAX_TOOL_ITERATIONS) {
				// Append assistant message with tool calls
				session.messages.push({
					role: "assistant",
					content: response.content,
				});

				// Execute tool calls (real handlers via registry)
				const results = await this.executeToolCalls(session, toolUseBlocks);
				hadToolCalls = true;

				// Append tool results as a user message
				session.messages.push({
					role: "user",
					content: results,
				});

				toolIterations++;
				continue;
			}

			// End of loop: emit completion with accumulated tool calls.
			// CAP_FALLBACK fires ONLY when there were tool calls and the model returned
			// no final text — it signals iteration-cap overflow, not a blank response.
			// A genuinely empty response (no text, no tool calls) emits "" so the
			// assistant-turn layer can detect and handle it correctly (AH6 B2).
			//
			// @lore AH6: Previously CAP_FALLBACK was used as the ultimate fallback for
			// ANY empty response (including no-tool-call turns). This caused the AH6
			// Term 2b gate to mis-fire: a degenerate empty-content cassette response
			// persisted CAP_FALLBACK text instead of "", so the S1 predicate was true
			// instead of false. CAP_FALLBACK now only fires on tool-call overflow.
			// Tier-1 force at the chat-turn end-of-loop break point.
			// Before emitting completion and breaking, check whether the agent has
			// returned. If not, and budget remains, re-inject the forcing message
			// and continue the loop instead of breaking.
			//
			// @lore shouldForceReturn is pure — it does NOT mutate session.
			// We increment forceCount BEFORE the continue so the next check sees the
			// updated budget. The forcing message is injected as a user message so
			// the model sees it as a direct instruction.
			//
			// @lore AK4: Force-return is EXEMPT for a chat turn whose tool
			// registry contains no return action at all. Forcing an agent to call a
			// tool it doesn't have would cause a hard tool-not-found error. The
			// exemption is: if none of the session's toolDefs are return actions,
			// skip the force check entirely.
			// The assistant's registry is the ordinary role-scoped registry,
			// which always includes `reply`, so this exemption does not fire for
			// the assistant in practice. It stays as a structural guard for any
			// other chat-style session. The exemption + the forcing message both
			// narrow to the session's specific required subset when one is baked.
			const requiredReturnActionsChat = session.config?.requiredReturnActions;
			const hasReturnActionInRegistry = session.toolDefs.some((td) =>
				isRequiredReturnAction(td.name, requiredReturnActionsChat),
			);
			const forceMsg = hasReturnActionInRegistry
				? shouldForceReturn(
						{ returned: session.returnSeen },
						session.forceCount,
						requiredReturnActionsChat,
					)
				: null;
			if (forceMsg !== null) {
				session.forceCount++;
				session.messages.push({
					role: "user",
					content: forceMsg,
				});
				// Emit the forcing message text as a completion so stream observers
				// can surface it (e.g. the eval judge reads the stream).
				this.emitEvent(session, {
					type: "completion",
					text: forceMsg,
				});
				// Re-seed the loop iteration state
				lastText = "";
				toolIterations = Math.min(toolIterations, MAX_TOOL_ITERATIONS - 1);
				continue;
			}

			const finalText = lastText || (hadToolCalls ? CAP_FALLBACK : "");
			const emitText = finalText;

			this.emitEvent(session, {
				type: "completion",
				text: emitText,
			});
			break;
		}

		session.done = true;
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
			system: config.assembledPrompt,
			maxTokens: this.options.maxOutputTokens,
			signal: session.abortController.signal,
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
			system: config.assembledPrompt,
			maxTokens: this.options.maxOutputTokens,
			signal: session.abortController.signal,
		});

		// Track usage
		this.trackUsage(session, response.usage, config.modelTier);

		// Check context window pressure using LATEST call's inputTokens (CRITICAL-1)
		const contextWindow = modelContextWindow(resolvedModel.model);
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
			// Text-only response — agent wants to stop.
			// Intercept the stop attempt. If no return was seen and
			// budget remains, re-inject the forcing message and do NOT set done=true
			// (the run loop will call runExecuteTurn again). If budget spent or a
			// return was already seen, allow the stop.
			// AU27 Increment 3 (Decision 3): reconciled with runChatTurn's site — both
			// exempt a session whose registry carries none of its required return
			// actions (previously this site force-looped such a session forever;
			// runChatTurn's site already guarded this, this one did not).
			const requiredReturnActionsExec = session.config?.requiredReturnActions;
			const hasReturnActionInRegistryExec = session.toolDefs.some((td) =>
				isRequiredReturnAction(td.name, requiredReturnActionsExec),
			);
			const forceMsg = hasReturnActionInRegistryExec
				? shouldForceReturn(
						{ returned: session.returnSeen },
						session.forceCount,
						requiredReturnActionsExec,
					)
				: null;
			if (forceMsg !== null) {
				session.forceCount++;
				// Re-inject: a user message with the forcing text, so the model
				// sees it as a direct instruction on the next execute turn.
				session.messages.push({
					role: "user",
					content: forceMsg,
				});
				// Emit the forcing message as a completion event so stream observers
				// (e.g. the provisioning drain, eval judges) can see it fired.
				this.emitEvent(session, { type: "completion", text: forceMsg });
				// Do NOT set session.done = true — loop continues.
			} else {
				// Budget spent or return seen — allow the stop.
				const text = extractTextFromContent(response.content);
				if (text) {
					this.emitEvent(session, { type: "completion", text });
				}
				session.done = true;
			}
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
			system: config.assembledPrompt,
			maxTokens: this.options.maxOutputTokens,
			signal: session.abortController.signal,
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

			// Track whether a return action was seen this turn.
			// isRequiredReturnAction uses the same closed set as the provisioning
			// drain's ReturnGate — single source of truth, no per-adapter copy.
			// AU27 Increment 3 (Decision 3): narrows to the session's specific
			// required subset when one is baked (`session.config.requiredReturnActions`)
			// — a synthetic gate, so this narrowing must happen HERE, the closure
			// held by `createGate` never reaches this path.
			if (isRequiredReturnAction(toolCall.name, session.config?.requiredReturnActions)) {
				session.returnSeen = true;
			}

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
			system: config.assembledPrompt,
			maxTokens: this.options.maxOutputTokens,
			signal: session.abortController.signal,
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
		const summarizeModel = config.resolvedModel;
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
			signal: session.abortController.signal,
		});

		this.trackUsage(session, response.usage, config.modelTier);

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

export type { BuiltinHarnessOptions };
