import * as crypto from "node:crypto";
import {
	type AgentSessionRequest,
	type HyperIdleDb,
	resolveAgentScaffoldSpecs,
	sessions,
} from "@hyperidle/db";
import {
	BUILT_IN_GATEWAY_CONFIG,
	CassetteMissError,
	ConcurrencyLimitError,
	type ConversationMessage,
	CostCapExceededError,
	createLogger,
	type EventBus,
	HttpError,
	MissingCredentialError,
	NoEligibleHarnessError,
	nextCronMatch,
	type PlainPayload,
	ProviderTimeoutError,
	parseCron,
	type ResolvedModel,
	type SessionEndedEvent,
	type TaskStateChangedEvent,
	type ThreadMessageAppendedEvent,
} from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import type { DispatchPorts } from "./ports.js";

type DispatchCredentialResolver = Parameters<DispatchPorts["modelGateway"]["resolveAgentModel"]>[3];
type DispatchToolContext = Parameters<
	DispatchPorts["toolHandlers"]["buildAssistantDraftRegistry"]
>[0];
type DispatchProvisionDeps = Parameters<
	DispatchPorts["runOrchestration"]["executeAgentRunRequest"]
>[0];

const PORTFOLIO_RETRO_CRON = "0 10 1-7 * MON"; // first Monday of the month
const KNOWLEDGE_DECAY_CRON = "0 2 * * *"; // daily 02:00 UTC
const KNOWLEDGE_PROMOTION_CRON = "0 3 * * *"; // daily 03:00 UTC

interface BuiltinSpec {
	/**
	 * @lore AU21 §9 Increment 4: was `BuiltinRoutineId` (the literal union) —
	 * that type + its backing `BUILTIN_ROUTINE_IDS` array relocated to
	 * `@hyperidle/routine`'s `routine-scheduler.ts` along with the scheduler
	 * itself. `provisionTeamRoutinesInternal` (this spec table's only
	 * consumer) only ever builds `${spec.id}:${teamId}` — a plain string is
	 * sufficient; it never dispatches on `spec.id`'s kind.
	 */
	readonly id: string;
	readonly name: string;
	readonly ownerRole: string;
	readonly triggerType: "heartbeat" | "calendar" | "event";
	readonly triggerConfig: Record<string, unknown>;
	readonly skillId: string;
	readonly doneCondition: string;
	readonly humanReview: boolean;
	readonly silent: boolean;
}

const BUILTIN_SPECS: readonly BuiltinSpec[] = [
	{
		id: "builtin:post-bet-retro",
		name: "Post-bet retro",
		ownerRole: "product_manager",
		triggerType: "event",
		triggerConfig: { eventType: "bet_state_changed" },
		skillId: "bet_retro",
		doneCondition: "Review item comparing hypothesis vs reality written",
		humanReview: true,
		silent: false,
	},
	{
		id: "builtin:portfolio-retro",
		name: "Portfolio retro",
		ownerRole: "assistant",
		triggerType: "calendar",
		triggerConfig: { cron: PORTFOLIO_RETRO_CRON },
		skillId: "portfolio_retro",
		doneCondition: "Cross-product portfolio review item written",
		humanReview: true,
		silent: false,
	},
	{
		id: "builtin:knowledge-decay",
		name: "Knowledge decay",
		ownerRole: "facilitator",
		triggerType: "calendar",
		triggerConfig: { cron: KNOWLEDGE_DECAY_CRON },
		skillId: "knowledge_decay",
		doneCondition: "Stale knowledge items transitioned",
		humanReview: false,
		silent: true,
	},
	{
		id: "builtin:knowledge-promotion",
		name: "Knowledge promotion",
		ownerRole: "facilitator",
		triggerType: "calendar",
		triggerConfig: { cron: KNOWLEDGE_PROMOTION_CRON },
		skillId: "knowledge_promotion",
		doneCondition: "Provisional items meeting repetition threshold promoted",
		humanReview: false,
		silent: false,
	},
];
const assistantLog = createLogger({ pkg: "server.assistant-turn" });

const BUILTIN_SYSTEM_PROMPT =
	"You are a helpful AI assistant. Be concise, direct, and thoughtful in your responses.";

interface AssistantTurnDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly adapterPool: unknown;
	readonly credentialResolver?: DispatchCredentialResolver;
	readonly turnTimeoutMs?: number;
	readonly mcpBridgeRegistry?: unknown;
	readonly mcpBaseUrl?: string;
	readonly sandboxBasePath?: string;
	readonly resolvedModel?: ResolvedModel;
}

type NoticeKind = "missing_key" | "missing_harness" | "provider_error";

function mapErrorToNotice(err: unknown): {
	kind: NoticeKind;
	text: string;
	code?: string;
} {
	if (err instanceof MissingCredentialError) {
		return {
			kind: "missing_key",
			text: "I can't think yet — no API key is configured. Add your Anthropic key in Settings → Credentials.",
		};
	}
	if (err instanceof NoEligibleHarnessError) {
		return {
			kind: "missing_harness",
			text: "My runtime isn't set up. Choose a harness for this assistant in Settings → Agents.",
		};
	}
	if (err instanceof ProviderTimeoutError) {
		return {
			kind: "provider_error",
			text: "The model provider returned an error and I couldn't complete that. Try again in a moment.",
		};
	}

	if (err instanceof CassetteMissError) {
		return {
			kind: "provider_error",
			text: "The model provider returned an error and I couldn't complete that. Try again in a moment.",
		};
	}
	if (err instanceof HttpError) {
		if (err.status === 401 || err.status === 403) {
			return {
				kind: "missing_key",
				text: "The model provider rejected my credentials. Check your API key in Settings → Credentials.",
			};
		}
		if (err.status === 400) {
			return {
				kind: "provider_error",
				text: "The model provider rejected the request — check the model or config in Settings → Agents.",
			};
		}
		return {
			kind: "provider_error",
			text: "The model provider returned an error and I couldn't complete that. Try again in a moment.",
		};
	}
	assistantLog.error("[assistant-turn] unmapped error class — defaulting to provider_error", {
		errorName: err instanceof Error ? err.name : typeof err,
		errorMessage: err instanceof Error ? err.message : String(err),
	});

	return {
		kind: "provider_error",
		text: "The model provider returned an error and I couldn't complete that. Try again in a moment.",
	};
}

async function persistTurnFailureInternal(
	ports: DispatchPorts,
	db: HyperIdleDb,
	userId: string,
	threadId: string,
	err: unknown,
): Promise<void> {
	const { kind, text, code } = mapErrorToNotice(err);
	const assistantAgentId = `ast-${userId}`;
	const messageId = crypto.randomUUID();
	const now = new Date().toISOString();

	const notice: PlainPayload["notice"] = code ? { kind, code } : { kind };
	const payload: PlainPayload = { text, notice };

	// @lore AU21 §9 Increment 2: `insertMessage` now routes through the
	// CoreApiPort seam (`POST /threads/:id/messages`), which is the canonical
	// `thread_message_appended` emitter (real, route-generated message id).
	// Do NOT also emit here — that would double-fire the event with a stale
	// local `messageId` that matches no persisted row (the seam intentionally
	// drops the locally-generated id in favor of the route's own).
	await ports.conversation.insertMessage(db, {
		id: messageId,
		senderId: assistantAgentId,
		threadId,
		type: "plain",
		payload: JSON.stringify(payload),
		clientKey: `ast-notice-${messageId}`,
		createdAt: now,
	});
}

async function executeAssistantRequestInternal(
	ports: DispatchPorts,
	deps: AssistantTurnDeps,
	request: AgentSessionRequest,
): Promise<void> {
	const correlation = JSON.parse(request.sourceCorrelationJson) as {
		userId: string;
		threadId: string;
		messageId: string;
	};
	await runTurnInternal(
		ports,
		deps.db,
		deps.eventBus,
		correlation.userId,
		correlation.threadId,
		deps,
		request,
	);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: model-resolution branching (pre-resolved / credential-resolver / env-fallback) + result-outcome mapping is one sequential turn — decomposing further would obscure the control flow
async function runTurnInternal(
	ports: DispatchPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
	userId: string,
	threadId: string,
	deps: AssistantTurnDeps,
	existingRequest: AgentSessionRequest,
): Promise<void> {
	const assistantAgentId = `ast-${userId}`;
	const agentRow = await ports.users.getOrCreateUser(db, assistantAgentId, {
		id: assistantAgentId,
		kind: "ai",
		name: "Assistant",
		role: "assistant",
		agentCategory: "individual",
		status: "active",
		harnessType: "builtin",
		modelId: "claude-sonnet-4-6",
		modelProvider: "anthropic",
		systemPrompt: BUILTIN_SYSTEM_PROMPT,
		maxConcurrentSessions: 1,
		createdAt: new Date().toISOString(),
	});
	let resolvedModel: ResolvedModel | undefined;
	let resolvedFastModel: ResolvedModel | undefined;

	if (deps.resolvedModel) {
		resolvedModel = deps.resolvedModel;
		if (deps.credentialResolver) {
			try {
				const serverCfg = await ports.settings.readServerConfig(db);
				resolvedFastModel = await ports.modelGateway.resolveModelTier(
					"fast",
					serverCfg.modelGateway,
					deps.credentialResolver,
				);
			} catch {}
		}
	} else if (deps.credentialResolver) {
		try {
			const serverCfg = await ports.settings.readServerConfig(db);
			resolvedModel = await ports.modelGateway.resolveAgentModel(
				{ modelId: agentRow.modelId ?? null, modelProvider: agentRow.modelProvider ?? null },
				"workhorse",
				serverCfg.modelGateway,
				deps.credentialResolver,
			);
			try {
				resolvedFastModel = await ports.modelGateway.resolveModelTier(
					"fast",
					serverCfg.modelGateway,
					deps.credentialResolver,
				);
			} catch {}
		} catch (err) {
			if (err instanceof MissingCredentialError) {
				await persistTurnFailureInternal(ports, db, userId, threadId, err);
				return;
			}
			throw err;
		}
	} else {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if (!apiKey) {
			await persistTurnFailureInternal(
				ports,
				db,
				userId,
				threadId,
				new MissingCredentialError("anthropic_api_key (required; not in env)"),
			);
			return;
		}
		resolvedModel = {
			provider: "anthropic",
			model: agentRow.modelId ?? BUILT_IN_GATEWAY_CONFIG.workhorse.model,
			apiKey,
			baseUrl: "https://api.anthropic.com",
		};
	}
	const transcriptRows = await loadRawTranscript(ports, db, threadId);
	const conversationMessages = mapTranscriptToMessages(transcriptRows, assistantAgentId);
	const scaffoldSpecs = resolveAgentScaffoldSpecs({
		trigger: "user_assistant",
		teamName: null,
		functions: null,
		role: null,
		name: null,
		ownerUserId: userId,
		ownerUserName: null,
	});
	const syntheticSessionId = crypto.randomUUID();
	const toolCtx: DispatchToolContext = {
		db,
		eventBus,
		agentId: assistantAgentId,
		sessionId: syntheticSessionId,
		taskId: "", // placeholder — assistant draft tools do not need a task
		sandboxPath: "", // placeholder — shared path creates real sandbox
		ingestion: {
			dispose: () => {
				/* no-op — bet tools don't use ingestion */
			},
		}, // no-op placeholder
	};
	const draftRegistry = await ports.toolHandlers.buildAssistantDraftRegistry(toolCtx, {
		userId,
		transcriptRows,
		assistantAgentId,
	});

	const sandboxBasePath = deps.sandboxBasePath ?? (await import("node:os")).default.tmpdir();
	const request = existingRequest;
	const sessionDeps: DispatchProvisionDeps = {
		db,
		eventBus,
		adapterPool: deps.adapterPool,
		workspace: ports.workspaceFactory.create(),
		...(deps.mcpBridgeRegistry ? { mcpBridgeRegistry: deps.mcpBridgeRegistry } : {}),
		...(deps.mcpBaseUrl ? { mcpBaseUrl: deps.mcpBaseUrl } : {}),
	};

	try {
		const result = await ports.runOrchestration.executeAgentRunRequest(sessionDeps, request, {
			sandboxBasePath,
			resolvedModel,
			resolvedFastModel,
			conversational: {
				threadId,
				assistantAgentId,
				draftRegistry,
				messages: conversationMessages,
				systemPromptOverride: scaffoldSpecs[0]?.systemPrompt ?? null,
			},
		});
		if (result.outcome === "completed" && result.conversationalReply !== undefined) {
			const replyText = result.conversationalReply;
			const messageId = crypto.randomUUID();
			const now = new Date().toISOString();
			const replyPayload: PlainPayload = {
				text: replyText,
				...(result.conversationalToolCalls && result.conversationalToolCalls.length > 0
					? {
							toolCalls: result.conversationalToolCalls.map((tc) => ({
								name: tc.name,
								input: tc.input,
								output: tc.output,
								status: tc.status,
							})),
						}
					: {}),
			};
			// @lore AU21 §9 Increment 2: `insertMessage` now routes through the
			// CoreApiPort seam (`POST /threads/:id/messages`), which is the
			// canonical `thread_message_appended` emitter (real, route-generated
			// message id). Do NOT also emit here — see `persistTurnFailureInternal`'s
			// note above for the double-emission this used to cause.
			await ports.conversation.insertMessage(db, {
				id: messageId,
				senderId: assistantAgentId,
				threadId,
				type: "plain",
				payload: JSON.stringify(replyPayload),
				clientKey: `ast-reply-${messageId}`,
				createdAt: now,
			});
		} else if (result.outcome === "completed" && !result.conversationalReply) {
			await persistTurnFailureInternal(
				ports,
				db,
				userId,
				threadId,
				new ProviderTimeoutError(), // best-fit notice class for empty/missing reply
			);
		} else {
			await persistTurnFailureInternal(
				ports,
				db,
				userId,
				threadId,
				new Error(`Conversational turn ended with outcome: ${result.outcome}`),
			);
		}
	} catch (err) {
		await persistTurnFailureInternal(ports, db, userId, threadId, err);
	}
}

async function loadRawTranscript(
	ports: DispatchPorts,
	db: HyperIdleDb,
	threadId: string,
): Promise<Array<{ senderId: string; payload: string; type: string }>> {
	try {
		const rows = await ports.conversation.listMessagesByThread(db, threadId, {
			order: "createdAt",
			dir: "asc",
		});
		return rows.map((m) => ({ senderId: m.senderId, payload: m.payload, type: m.type }));
	} catch (err) {
		assistantLog.error(
			"[assistant-turn] loadRawTranscript failed — proceeding with empty history",
			{
				threadId,
				error: err instanceof Error ? err.message : String(err),
			},
		);
		return [];
	}
}

function mapTranscriptToMessages(
	rows: ReadonlyArray<{ senderId: string; payload: string; type: string }>,
	assistantAgentId: string,
): ConversationMessage[] {
	const result: ConversationMessage[] = [];
	for (const row of rows) {
		if (row.type !== "plain") continue;

		let parsed: { text?: string; notice?: unknown };
		try {
			parsed = JSON.parse(row.payload) as { text?: string; notice?: unknown };
		} catch {
			continue;
		}
		if (parsed.notice !== undefined) continue;
		if (typeof parsed.text !== "string" || parsed.text.trim() === "") continue;

		const role: "user" | "assistant" = row.senderId === assistantAgentId ? "assistant" : "user";
		result.push({ role, content: parsed.text });
	}
	return result;
}

interface ThreadLike {
	readonly hostKind: string;
	readonly hostId: string;
	readonly pinned: boolean;
}

function isAssistantThread(thread: ThreadLike): boolean {
	return thread.hostKind === "user";
}

const assistantDispatcherLog = {
	info: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: app-runtime dispatcher
		console.info(`[assistant-dispatcher] ${msg}`, ctx ?? "");
	},
	error: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: app-runtime dispatcher
		console.error(`[assistant-dispatcher] ${msg}`, ctx ?? "");
	},
};

function registerAssistantTriggerInternal(
	ports: DispatchPorts,
	eventBus: EventBus,
	db: HyperIdleDb,
): () => void {
	const unsubscribe = eventBus.on(
		"thread_message_appended",
		(event: ThreadMessageAppendedEvent) => {
			void (async () => {
				try {
					const threadRow = await ports.conversation.getThreadById(db, event.threadId);

					if (!threadRow) {
						return; // Thread not found — skip
					}
					const senderRow = await ports.users.getUserById(db, event.senderId);

					if (!senderRow) {
						return; // Unknown sender — skip
					}

					const threadLike: ThreadLike = {
						hostKind: threadRow.hostKind,
						hostId: threadRow.hostId,
						pinned: threadRow.pinned === true,
					};
					if (senderRow.kind === "ai" && isAssistantThread(threadLike) && !threadLike.pinned) {
						// AU21 §9 Increment 2: threads the assistant agent's own identity
						// (`event.senderId`, verified `kind === "ai"` above) as the seam's
						// route actor — never the human sender (architecture.md §12).
						await ports.conversation.updateThread(
							db,
							event.threadId,
							{ pinned: true },
							event.senderId,
						);

						assistantDispatcherLog.info("assistant thread pinned after first response", {
							threadId: event.threadId,
							senderId: event.senderId,
							hostId: threadRow.hostId,
						});
					}
				} catch (err) {
					assistantDispatcherLog.error("assistant dispatcher failed", {
						error: err instanceof Error ? err.message : String(err),
					});
				}
			})();
		},
	);

	return unsubscribe;
}

async function provisionTeamRoutinesInternal(
	ports: DispatchPorts,
	db: HyperIdleDb,
	opts: {
		teamId: string;
		ownerByRole: Partial<Record<string, string>>;
		leadAgentId: string;
	},
): Promise<void> {
	const { teamId, ownerByRole, leadAgentId } = opts;
	const now = new Date();
	for (const spec of BUILTIN_SPECS) {
		const routineId = `${spec.id}:${teamId}`;
		let nextRunAt: string | null = null;
		const cron = (spec.triggerConfig as { cron?: string }).cron;
		if (spec.triggerType === "calendar" && cron) {
			nextRunAt = nextCronMatch(parseCron(cron), now).toISOString();
		}
		const ownerAgentId = ownerByRole[spec.ownerRole] ?? leadAgentId;

		await ports.routine.insertRoutine(
			db,
			{
				id: routineId,
				name: spec.name,
				teamId,
				state: "active",
				ownerAgentId,
				triggerType: spec.triggerType,
				triggerConfig: JSON.stringify(spec.triggerConfig),
				skillId: spec.skillId,
				doneCondition: spec.doneCondition,
				delegationAllowed: false,
				humanReview: spec.humanReview,
				silent: spec.silent,
				active: true,
				nextRunAt,
			},
			{ onConflictDoNothing: true },
		);
	}
}

const taskDispatcherLog = {
	info: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: app-runtime dispatcher, observability adapter not yet stood up
		console.info(`[task-dispatcher] ${msg}`, ctx ?? "");
	},
	error: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: app-runtime dispatcher, observability adapter not yet stood up
		console.error(`[task-dispatcher] ${msg}`, ctx ?? "");
	},
	warn: (msg: string, ctx?: Record<string, unknown>): void => {
		// biome-ignore lint/suspicious/noConsole: app-runtime dispatcher, observability adapter not yet stood up
		console.warn(`[task-dispatcher] ${msg}`, ctx ?? "");
	},
};

interface TaskDispatcherDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	// biome-ignore lint/suspicious/noExplicitAny: structural typing keeps dispatcher decoupled from server harness types
	readonly adapterPool: any;
	// biome-ignore lint/suspicious/noExplicitAny: structural typing keeps dispatcher decoupled from server harness types
	readonly workspace: any;
	readonly sandboxBasePath: string;
	readonly resolveModel?: (
		modelTier: string,
	) => Promise<import("@hyperidle/shared").ResolvedModel | undefined>;
	// biome-ignore lint/suspicious/noExplicitAny: structural typing across package boundary
	readonly mcpBridgeRegistry?: any;
	readonly mcpBaseUrl?: string;
	readonly mounter?: import("@hyperidle/shared").FilesystemMounter;
	// biome-ignore lint/suspicious/noExplicitAny: BeforeTeardownContext type lives in server; dispatcher passes opaquely
	readonly onBeforeTeardown?: (ctx: any) => Promise<void>;
}

interface DispatchQueueEntry {
	readonly taskId: string;
	readonly agentId: string;
	readonly teamId: string;
	readonly enqueuedAt: number; // Date.now()
	readonly proposedCallId?: string;
}

export interface DispatchQueueSnapshot {
	readonly entries: readonly DispatchQueueEntry[];
	readonly draining: boolean;
}

interface TaskQueueState {
	queue: DispatchQueueEntry[];
	draining: boolean;
	generation: number;
}

async function hasActiveSession(db: HyperIdleDb, taskId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: sessions.id })
		.from(sessions)
		.where(and(eq(sessions.taskId, taskId), eq(sessions.state, "active")))
		.limit(1);
	return row !== undefined;
}

async function enqueue(
	state: TaskQueueState,
	db: HyperIdleDb,
	entry: DispatchQueueEntry,
): Promise<void> {
	if (state.queue.some((e) => e.taskId === entry.taskId)) {
		return;
	}
	if (await hasActiveSession(db, entry.taskId)) {
		return;
	}
	if (state.queue.some((e) => e.taskId === entry.taskId)) {
		return;
	}
	state.queue.push(entry);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: drain logic must handle concurrency errors, cost cap errors, idempotency guards, and generation staleness in a single sequential pass — decomposing further would obscure the control flow
async function drainQueue(
	state: TaskQueueState,
	deps: TaskDispatcherDeps,
	generation: number,
): Promise<void> {
	if (state.draining) return;
	if (generation !== state.generation) return;

	state.draining = true;

	try {
		const concurrencyBlockedAgents = new Set<string>();

		let i = 0;
		while (i < state.queue.length) {
			if (generation !== state.generation) break;

			const entry = state.queue[i];
			if (!entry) {
				i++;
				continue;
			}
			if (concurrencyBlockedAgents.has(entry.agentId)) {
				i++;
				continue;
			}
			if (await hasActiveSession(deps.db, entry.taskId)) {
				if (generation !== state.generation) break;
				state.queue.splice(i, 1);
				continue;
			}

			if (generation !== state.generation) break;

			try {
				// biome-ignore lint/suspicious/noExplicitAny: resolvedModel type from server not importable here
				let resolvedModel: any;
				if (deps.resolveModel) {
					try {
						resolvedModel = await deps.resolveModel("workhorse");
					} catch (credErr) {
						if (generation !== state.generation) break;
						taskDispatcherLog.error(
							"credential resolution failed; removing task from state.queue",
							{
								taskId: entry.taskId,
								error: credErr instanceof Error ? credErr.message : String(credErr),
							},
						);
						state.queue.splice(i, 1);
						continue;
					}
				}

				void resolvedModel;

				if (generation !== state.generation) break;
				state.queue.splice(i, 1);
			} catch (err) {
				if (generation !== state.generation) break;

				if (err instanceof ConcurrencyLimitError) {
					concurrencyBlockedAgents.add(entry.agentId);
					i++;
					continue;
				}

				if (err instanceof CostCapExceededError) {
					const costErr: CostCapExceededError = err;
					taskDispatcherLog.warn("cost cap exceeded; pausing state.queue drain", {
						taskId: entry.taskId,
						entityId: costErr.entityId,
					});
					break;
				}
				taskDispatcherLog.error("dispatch failed (unrecoverable); removing task from state.queue", {
					taskId: entry.taskId,
					error: err instanceof Error ? err.message : String(err),
				});
				state.queue.splice(i, 1);
			}
		}
	} finally {
		state.draining = false;
	}
}

async function startupSweep(
	state: TaskQueueState,
	ports: DispatchPorts,
	db: HyperIdleDb,
	generation: number,
): Promise<void> {
	const activeSessions = await db
		.select({ taskId: sessions.taskId })
		.from(sessions)
		.where(eq(sessions.state, "active"));
	if (generation !== state.generation) return;

	const activeTaskIds = new Set(activeSessions.map((s) => s.taskId));
	const dispatchableTasks = (await ports.work.listTasks(db, { state: "accepted" })).filter(
		(t) => t.ownerAgentId !== null,
	);
	if (generation !== state.generation) return;

	for (const task of dispatchableTasks) {
		if (!task.ownerAgentId) continue;
		if (activeTaskIds.has(task.id)) continue;
		if (state.queue.some((e) => e.taskId === task.id)) continue;

		state.queue.push({
			taskId: task.id,
			agentId: task.ownerAgentId,
			teamId: task.teamId ?? task.id,
			enqueuedAt: Date.now(),
		});
	}
}

function registerTaskTriggerInternal(
	state: TaskQueueState,
	ports: DispatchPorts,
	deps: TaskDispatcherDeps,
): () => void {
	state.generation++;
	const myGeneration = state.generation;
	state.queue = [];
	state.draining = false;

	const { db, eventBus } = deps;

	function scheduleDrain(): void {
		void drainQueue(state, deps, myGeneration).catch((err) => {
			taskDispatcherLog.error("drainQueue threw unexpectedly", {
				error: err instanceof Error ? err.message : String(err),
			});
		});
	}
	const handleTaskStateChanged = (event: TaskStateChangedEvent): void => {
		if (event.toState !== "accepted") return;

		void (async () => {
			const task = await ports.work.getTaskById(db, event.taskId);

			if (!task?.ownerAgentId) return; // No agent assigned — skip

			await enqueue(state, db, {
				taskId: event.taskId,
				agentId: task.ownerAgentId,
				teamId: task.teamId ?? event.taskId,
				enqueuedAt: Date.now(),
			});

			scheduleDrain();
		})();
	};
	const handleSessionEnded = (event: SessionEndedEvent): void => {
		void (async () => {
			if (event.taskId) {
				const task = await ports.work.getTaskById(db, event.taskId);

				if (
					task?.state === "in_progress" &&
					task.ownerAgentId &&
					task.ownerAgentId !== event.agentId
				) {
					if (!(await hasActiveSession(db, event.taskId))) {
						await enqueue(state, db, {
							taskId: event.taskId,
							agentId: task.ownerAgentId,
							teamId: task.teamId ?? event.taskId,
							enqueuedAt: Date.now(),
						});
					}
				}
			}
			scheduleDrain();
		})();
	};
	const unsubTaskStateChanged = eventBus.on("task_state_changed", handleTaskStateChanged);
	const unsubSessionEnded = eventBus.on("session_ended", handleSessionEnded);
	void startupSweep(state, ports, db, myGeneration)
		.then(() => {
			if (myGeneration === state.generation && state.queue.length > 0) {
				scheduleDrain();
			}
		})
		.catch((err) => {
			taskDispatcherLog.error("startup sweep failed", {
				error: err instanceof Error ? err.message : String(err),
			});
		});
	return (): void => {
		unsubTaskStateChanged();
		unsubSessionEnded();
		state.generation++;
		state.queue = [];
		state.draining = false;
	};
}

function snapshotQueue(state: TaskQueueState): DispatchQueueSnapshot {
	return {
		entries: [...state.queue],
		draining: state.draining,
	};
}

type Disposer = () => void;

export interface DispatchConfig {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly task?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
}

/**
 * @lore AU21 §9 Increment 4: `DispatchOps` sheds routine awareness entirely —
 * no `scheduler` config branch, no `fireRoutine` method. The routine
 * scheduler + `routineRuns` lifecycle relocated to `@hyperidle/routine`'s
 * `routine-scheduler.ts`; the composition-root wiring (start/stop, the
 * manual-fire dispatch) now lives in
 * `packages/core-api/src/services/routine-scheduler-bindings.ts`. Dispatch
 * keeps only assistant-turn + task-queue responsibilities.
 */
export interface DispatchOps {
	start(config: DispatchConfig): Promise<Disposer>;

	runAssistantTurn(deps: AssistantTurnDeps, request: AgentSessionRequest): Promise<void>;

	provisionTeamRoutines(
		db: HyperIdleDb,
		opts: {
			teamId: string;
			ownerByRole: Partial<Record<string, string>>;
			leadAgentId: string;
		},
	): Promise<void>;

	getQueueSnapshot(): DispatchQueueSnapshot;
}

export function createDispatchOps(ports: DispatchPorts): DispatchOps {
	const state: TaskQueueState = { queue: [], draining: false, generation: 0 };
	let activeDispose: (() => void) | null = null;
	let starting = false;
	return {
		async start(config): Promise<Disposer> {
			if (activeDispose || starting) throw new Error("dispatch already started");
			starting = true;
			const disposers: Disposer[] = [];
			try {
				disposers.push(registerAssistantTriggerInternal(ports, config.eventBus, config.db));
				if (config.task) {
					disposers.push(
						registerTaskTriggerInternal(state, ports, {
							db: config.db,
							eventBus: config.eventBus,
							...config.task,
						}),
					);
				}
			} catch (error) {
				starting = false;
				for (const dispose of disposers.reverse()) {
					try {
						dispose();
					} catch {
						// Continue unwinding every successfully installed trigger.
					}
				}
				throw error;
			}
			let disposed = false;
			const dispose = (): void => {
				if (disposed) return;
				disposed = true;
				for (const cleanup of disposers.reverse()) {
					try {
						cleanup();
					} catch {
						// One faulty disposer must not strand the remaining triggers.
					}
				}
				state.queue = [];
				state.draining = false;
				activeDispose = null;
			};
			activeDispose = dispose;
			starting = false;
			return dispose;
		},

		runAssistantTurn: (deps, request) => executeAssistantRequestInternal(ports, deps, request),

		provisionTeamRoutines: (db, opts) => provisionTeamRoutinesInternal(ports, db, opts),

		getQueueSnapshot: () => snapshotQueue(state),
	};
}
