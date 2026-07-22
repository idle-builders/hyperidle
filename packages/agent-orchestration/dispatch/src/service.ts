import * as crypto from "node:crypto";
import { type AgentSessionRequest, type HyperIdleDb, type Routine, sessions } from "@hyperidle/db";
import {
	type BetStateChangedEvent,
	BUILT_IN_GATEWAY_CONFIG,
	CassetteMissError,
	ConcurrencyLimitError,
	type ConversationMessage,
	CostCapExceededError,
	computeNextRunAt,
	createLogger,
	type EventBus,
	type EventType,
	HttpError,
	type ItemCreatedEvent,
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

const BUILTIN_ROUTINE_IDS = [
	"builtin:practice-meeting",
	"builtin:post-bet-retro",
	"builtin:portfolio-retro",
	"builtin:knowledge-decay",
	"builtin:knowledge-promotion", // AF9: auto-promote provisional items meeting threshold
] as const;

type BuiltinRoutineId = (typeof BUILTIN_ROUTINE_IDS)[number];

function isBuiltinRoutineId(id: string): boolean {
	const kind = extractBuiltinKind(id);
	return kind !== null;
}

function extractBuiltinKind(id: string): BuiltinRoutineId | null {
	if ((BUILTIN_ROUTINE_IDS as readonly string[]).includes(id)) {
		return id as BuiltinRoutineId;
	}
	if (id.startsWith("builtin:")) {
		const parts = id.split(":");
		if (parts.length >= 3) {
			const kindCandidate = `builtin:${parts[1]}` as BuiltinRoutineId;
			if ((BUILTIN_ROUTINE_IDS as readonly string[]).includes(kindCandidate)) {
				return kindCandidate;
			}
		}
	}
	return null;
}
const PRACTICE_MEETING_CRON = "0 10 * * MON"; // weekly Monday 10:00 UTC
const PORTFOLIO_RETRO_CRON = "0 10 1-7 * MON"; // first Monday of the month
const KNOWLEDGE_DECAY_CRON = "0 2 * * *"; // daily 02:00 UTC
const KNOWLEDGE_PROMOTION_CRON = "0 3 * * *"; // daily 03:00 UTC

interface BuiltinSpec {
	readonly id: BuiltinRoutineId;
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
		id: "builtin:practice-meeting",
		name: "Practice meeting",
		ownerRole: "facilitator",
		triggerType: "calendar",
		triggerConfig: { cron: PRACTICE_MEETING_CRON },
		skillId: "practice_meeting",
		doneCondition: "3-turn practice meeting anchor created",
		humanReview: false,
		silent: false,
	},
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
	eventBus: EventBus,
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

	await ports.conversation.insertMessage(db, {
		id: messageId,
		senderId: assistantAgentId,
		threadId,
		type: "plain",
		payload: JSON.stringify(payload),
		clientKey: `ast-notice-${messageId}`,
		createdAt: now,
	});

	const appendedEvent: ThreadMessageAppendedEvent = {
		type: "thread_message_appended",
		streamId: threadId,
		threadId,
		messageId,
		messageType: "plain",
		senderId: assistantAgentId,
		timestamp: Date.now(),
	};
	eventBus.emit(appendedEvent);
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
				await persistTurnFailureInternal(ports, db, eventBus, userId, threadId, err);
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
				eventBus,
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
	const scaffoldSpecs = await ports.agentSelection.resolveScaffoldSpecs({
		db,
		trigger: "user_assistant",
		teamId: null,
		teamMembersId: null,
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
			await ports.conversation.insertMessage(db, {
				id: messageId,
				senderId: assistantAgentId,
				threadId,
				type: "plain",
				payload: JSON.stringify(replyPayload),
				clientKey: `ast-reply-${messageId}`,
				createdAt: now,
			});
			const appendedEvent: ThreadMessageAppendedEvent = {
				type: "thread_message_appended",
				streamId: threadId,
				threadId,
				messageId,
				messageType: "plain",
				senderId: assistantAgentId,
				timestamp: Date.now(),
			};
			eventBus.emit(appendedEvent);
		} else if (result.outcome === "completed" && !result.conversationalReply) {
			await persistTurnFailureInternal(
				ports,
				db,
				eventBus,
				userId,
				threadId,
				new ProviderTimeoutError(), // best-fit notice class for empty/missing reply
			);
		} else {
			await persistTurnFailureInternal(
				ports,
				db,
				eventBus,
				userId,
				threadId,
				new Error(`Conversational turn ended with outcome: ${result.outcome}`),
			);
		}
	} catch (err) {
		await persistTurnFailureInternal(ports, db, eventBus, userId, threadId, err);
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
						await ports.conversation.updateThread(db, event.threadId, { pinned: true });

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
const PORTFOLIO_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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

type RunBuiltinResult =
	| {
			readonly fired: true;
			readonly emitted?: readonly string[];
			readonly extra?: Record<string, unknown>;
	  }
	| { readonly fired: false; readonly reason: string };

interface PostBetRetroArgs {
	readonly betId: string;
}

async function fireBuiltinRoutineInternal(
	ports: DispatchPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
	routineId: string,
	args?: PostBetRetroArgs,
): Promise<RunBuiltinResult> {
	const routine = await ports.routine.getRoutineById(db, routineId);
	if (!routine) {
		return { fired: false, reason: `routine ${routineId} not found` };
	}
	if (!routine.active) {
		return { fired: false, reason: `routine ${routineId} is disabled (active=false)` };
	}
	const kind = extractBuiltinKind(routineId);
	if (!kind) {
		return { fired: false, reason: `${routineId} is not a builtin routine` };
	}
	const startedAt = new Date();

	let result: RunBuiltinResult;
	switch (kind) {
		case "builtin:practice-meeting":
			result = await runPracticeMeetingRoutine(ports, db, routine);
			break;
		case "builtin:post-bet-retro":
			if (!args) {
				return { fired: false, reason: "post-bet-retro requires { betId } args" };
			}
			result = await runPostBetRetro(ports, db, eventBus, routine, args);
			break;
		case "builtin:portfolio-retro":
			result = await runPortfolioRetro(ports, db, eventBus, routine);
			break;
		case "builtin:knowledge-decay":
			result = await runKnowledgeDecay(ports, db, eventBus, routine);
			break;
		case "builtin:knowledge-promotion":
			result = await runKnowledgePromotion(ports, db, eventBus, routine);
			break;
		default: {
			const exhaustive: never = kind;
			throw new Error(`Unknown builtin routine kind: ${exhaustive as string}`);
		}
	}

	const endedAt = new Date();
	await ports.routine.insertRoutineRun(db, {
		id: crypto.randomUUID(),
		routineId,
		startedAt: startedAt.toISOString(),
		endedAt: endedAt.toISOString(),
		outcome: result.fired ? "success" : "skipped",
		costMinor: 0,
	});

	if (result.fired) {
		await ports.routine.updateRoutineById(db, routineId, { lastRunAt: endedAt.toISOString() });
	}

	return result;
}

function registerBuiltinRoutineHandlersInternal(
	ports: DispatchPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
): () => void {
	const unsubs: Array<() => void> = [];

	const betCompletedHandler = (event: BetStateChangedEvent): void => {
		if (event.toState !== "completed") return;
		void (async () => {
			const betId = event.betId;
			const betRow = await ports.work.getBetById(db, betId);
			const betTeamId = betRow?.teamId;
			let routineRow: Routine | undefined;
			if (betTeamId) {
				const perTeamId = `builtin:post-bet-retro:${betTeamId}`;
				routineRow = await ports.routine.getRoutineById(db, perTeamId);
			}
			if (!routineRow) {
				routineRow = await ports.routine.getRoutineById(db, "builtin:post-bet-retro");
			}
			if (!(routineRow && routineRow.active)) return;
			await fireBuiltinRoutineInternal(ports, db, eventBus, routineRow.id, { betId });
		})();
	};
	unsubs.push(eventBus.on("bet_state_changed", betCompletedHandler));

	return () => {
		for (const u of unsubs) u();
	};
}

async function runPracticeMeetingRoutine(
	ports: DispatchPorts,
	db: HyperIdleDb,
	routine: Routine,
): Promise<RunBuiltinResult> {
	const isoNow = new Date().toISOString();
	const result = await ports.review.createPracticeMeeting(db, {
		scopeId: "facilitation",
		title: `Weekly practice meeting — ${isoNow.slice(0, 10)}`,
		nowMs: Date.now(),
	});

	return {
		fired: true,
		extra: { meetingId: result.meetingId, ownerAgentId: routine.ownerAgentId },
	};
}

function postBetRetroBetIdMarker(betId: string): string {
	return `betId=${betId}`;
}

async function runPostBetRetro(
	ports: DispatchPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	args: PostBetRetroArgs,
): Promise<RunBuiltinResult> {
	const bet = await ports.work.getBetById(db, args.betId);
	if (!bet) {
		return { fired: false, reason: `bet ${args.betId} not found` };
	}
	const marker = postBetRetroBetIdMarker(args.betId);
	const betThreadIds = await ports.conversation.getThreadIdsByHost(db, "bet", args.betId);
	const existing = await ports.work.findRetroItemByThreadIds(db, betThreadIds, marker);
	if (existing) {
		return { fired: false, reason: "already-retroed" };
	}
	const hypothesis = bet.hypothesis ?? "(no hypothesis recorded)";
	const realityLines: string[] = [];
	if (bet.completedAt) {
		realityLines.push(`Completed at: ${bet.completedAt}`);
	}
	if (bet.revisionLog) {
		realityLines.push(`Revision log: ${bet.revisionLog}`);
	}
	if (realityLines.length === 0) {
		realityLines.push("No post-ship reality signal recorded.");
	}

	const threadId = crypto.randomUUID();
	const itemId = crypto.randomUUID();
	const isoNow = new Date().toISOString();

	await db.transaction(async (tx) => {
		await ports.conversation.insertThread(tx as HyperIdleDb, {
			id: threadId,
			hostKind: "bet",
			hostId: args.betId,
			initiatorId: routine.ownerAgentId,
			participants: JSON.stringify([routine.ownerAgentId]),
			lastActiveAt: isoNow,
			createdAt: isoNow,
		});

		await ports.work.createItem(tx, {
			id: itemId,
			sourceAgentId: routine.ownerAgentId,
			layer: "meta",
			kind: "review",
			title: `Post-bet retro: ${bet.description}`,
			body: [marker, `Hypothesis: ${hypothesis}`, "", "Reality:", ...realityLines].join("\n"),
			threadId,
			riskTier: "medium",
			createdAt: isoNow,
		});
	});
	if (!routine.silent) {
		const evt: ItemCreatedEvent = {
			type: "item_created",
			streamId: crypto.randomUUID(),
			itemId,
			conversationId: threadId,
			kind: "review",
			timestamp: Date.now(),
		};
		eventBus.emit(evt);
	}

	return { fired: true, extra: { itemId, threadId } };
}

async function runPortfolioRetro(
	ports: DispatchPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
): Promise<RunBuiltinResult> {
	const nowMs = Date.now();
	const cutoffIso = new Date(nowMs - PORTFOLIO_WINDOW_MS).toISOString();
	const recentRows = await ports.knowledge.listRecentByLayers(db, ["L3", "L4"], cutoffIso);

	const bodyLines = [
		`Portfolio retro — window: last 30 days (since ${cutoffIso})`,
		`Recent L3/L4 items: ${recentRows.length}`,
		"",
	];
	for (const row of recentRows) {
		bodyLines.push(`- [${row.layer ?? "?"}] ${row.title} (updated ${row.updatedAt})`);
	}
	if (recentRows.length === 0) {
		bodyLines.push("(no cross-product patterns updated in the window)");
	}

	const threadId = crypto.randomUUID();
	const itemId = crypto.randomUUID();
	const isoNow = new Date(nowMs).toISOString();

	await db.transaction(async (tx) => {
		await ports.conversation.insertThread(tx as HyperIdleDb, {
			id: threadId,
			hostKind: "factory",
			hostId: "portfolio",
			initiatorId: routine.ownerAgentId,
			participants: JSON.stringify([routine.ownerAgentId]),
			lastActiveAt: isoNow,
			createdAt: isoNow,
		});

		await ports.work.createItem(tx, {
			id: itemId,
			sourceAgentId: routine.ownerAgentId,
			layer: "meta",
			kind: "review",
			title: `Monthly portfolio retro — ${isoNow.slice(0, 10)}`,
			body: bodyLines.join("\n"),
			threadId,
			riskTier: "low",
			createdAt: isoNow,
		});
	});

	if (!routine.silent) {
		const evt: ItemCreatedEvent = {
			type: "item_created",
			streamId: crypto.randomUUID(),
			itemId,
			conversationId: threadId,
			kind: "review",
			timestamp: nowMs,
		};
		eventBus.emit(evt);
	}

	return { fired: true, extra: { itemId, threadId, count: recentRows.length } };
}

const promotionLog = createLogger({ pkg: "server.knowledge-promotion" });

async function runKnowledgePromotion(
	ports: DispatchPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
	_routine: Routine,
): Promise<RunBuiltinResult> {
	const sweep = await ports.knowledge.runAutoPromotionSweep(db, eventBus);
	if (sweep.scanned > 0) {
		const candidateIds: readonly string[] = [
			...sweep.promotedIds,
			...sweep.flaggedForReviewIds,
			...sweep.skippedIds,
		];

		if (candidateIds.length > 0) {
			const attentionResult = await ports.knowledge.recomputeAttentionForCandidates(
				db,
				eventBus,
				candidateIds,
			);
			if (!attentionResult.ok) {
				promotionLog.error("attention recompute failed on promotion sweep", {
					code: attentionResult.error.code,
					message: attentionResult.error.message,
				});
			}
		}
	}

	return {
		fired: true,
		extra: {
			promotedCount: sweep.promotedIds.length,
			flaggedCount: sweep.flaggedForReviewIds.length,
			skippedCount: sweep.skippedIds.length,
			scanned: sweep.scanned,
		},
	};
}

async function runKnowledgeDecay(
	ports: DispatchPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
): Promise<RunBuiltinResult> {
	const nowMs = Date.now();
	const silent = !!routine.silent;
	const sweep = await ports.knowledge.runStaleSweep(db, eventBus, nowMs, undefined, { silent });
	return { fired: true, extra: { markedCount: sweep.markedIds.length } };
}
const schedulerLog = createLogger({ pkg: "server.routine-scheduler" });

export interface FireResult {
	fired: boolean;
	reason?: string;
	runId?: string;
	sessionId?: string;
	emitted?: readonly string[];
	extra?: Record<string, unknown>;
}

type ReapStaleSessions = () => Promise<number>;

interface RoutineSchedulerConfig {
	pollIntervalMs: number;
	canProvision?: boolean;
	readonly runtimeDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
	reap?: ReapStaleSessions;
	reaperCadenceMs?: number;
}

interface RoutineScheduler {
	stop: () => void;
}

interface TriggerConfig {
	intervalSeconds?: number;
	cron?: string;
	eventType?: string;
	taskId?: string;
}

async function isFactoryCostCapReached(ports: DispatchPorts, db: HyperIdleDb): Promise<boolean> {
	const { cost } = await ports.settings.readServerConfig(db);
	const cap = cost.capMinor;
	if (!Number.isFinite(cap) || cap <= 0) return false;
	const actual = await ports.cost.getFactoryCostActual(db);
	return actual >= cap;
}

async function getRoutineMonthlySpendInternal(
	ports: DispatchPorts,
	db: HyperIdleDb,
	routineId: string,
): Promise<number> {
	const now = new Date();
	const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
	return ports.routine.sumRoutineRunCostSince(db, routineId, firstOfMonth);
}

function safeNextRunAt(routine: Routine, now: Date): string | null {
	try {
		return computeNextRunAt(routine, now);
	} catch {
		return routine.nextRunAt ?? null;
	}
}

async function fireGenericRoutineInternal(
	ports: DispatchPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	_runtimeDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">,
	recordSkippedRun = false,
): Promise<FireResult> {
	const now = new Date();
	if (await isFactoryCostCapReached(ports, db)) {
		const nextRunAt = safeNextRunAt(routine, now);
		await ports.routine.updateRoutineById(db, routine.id, { nextRunAt });
		return { fired: false, reason: "factory cost cap reached" };
	}
	if (routine.costCapMonthlyMinor != null) {
		const monthlySpend = await getRoutineMonthlySpendInternal(ports, db, routine.id);
		if (monthlySpend >= routine.costCapMonthlyMinor) {
			const runId = crypto.randomUUID();
			await ports.routine.insertRoutineRun(db, {
				id: runId,
				routineId: routine.id,
				startedAt: now.toISOString(),
				outcome: "monthly_budget_exhausted",
			});
			const nextRunAt = safeNextRunAt(routine, now);
			await ports.routine.updateRoutineById(db, routine.id, { nextRunAt });
			return { fired: false, reason: "monthly cost cap reached" };
		}
	}
	if (await ports.routine.findRunningRoutineRun(db, routine.id)) {
		if (recordSkippedRun) {
			await ports.routine.insertRoutineRun(db, {
				id: crypto.randomUUID(),
				routineId: routine.id,
				startedAt: now.toISOString(),
				outcome: "skipped",
				errorMessage: "Coalesced: previous run still in progress",
			});
		}
		const nextRunAt = safeNextRunAt(routine, now);
		await ports.routine.updateRoutineById(db, routine.id, { nextRunAt });
		return { fired: false, reason: "previous run still in progress" };
	}
	const targetAgentId = routine.ownerAgentId;

	const runId = crypto.randomUUID();
	let intent:
		| Awaited<ReturnType<DispatchPorts["sessionRequests"]["recordAgentWorkIntent"]>>
		| undefined;
	await db.transaction(async (tx) => {
		await ports.routine.insertRoutineRun(tx, {
			id: runId,
			routineId: routine.id,
			startedAt: now.toISOString(),
			outcome: "running",
		});
		intent = await ports.sessionRequests.recordAgentWorkIntent(tx as HyperIdleDb, {
			kind: "routine_run",
			sourceKind: "routine_run",
			sourceId: runId,
			requestedBy: targetAgentId,
			idempotencyKey: `routine:${runId}`,
		});
	});
	if (!intent) throw new Error("Routine work intent was not persisted");
	eventBus.emit({
		type: "agent_work_intent_recorded",
		streamId: `routine:${routine.id}`,
		intentId: intent.id,
		intentKind: "routine_run",
		sourceKind: "routine",
		sourceId: runId,
		idempotencyKey: intent.idempotencyKey,
		timestamp: Date.now(),
	});
	const lastRunAt = now.toISOString();
	const nextRunAt = safeNextRunAt(routine, now);

	await ports.routine.updateRoutineById(db, routine.id, {
		lastRunAt,
		nextRunAt: nextRunAt || null,
	});
	eventBus.emit({
		type: "routine_fired",
		streamId: `routine:${routine.id}`,
		routineId: routine.id,
		agentId: targetAgentId,
		timestamp: Date.now(),
	});

	return { fired: true, runId };
}

async function registerEventTriggersInternal(
	ports: DispatchPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
	runtimeDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">,
): Promise<() => void> {
	const eventRoutines = await ports.routine.listActiveRoutines(db, { triggerType: "event" });

	const unsubscribers: Array<() => void> = [];
	const unwind = (): void => {
		for (const unsubscribe of unsubscribers.reverse()) {
			try {
				unsubscribe();
			} catch {
				// Continue removing every subscription after a faulty disposer.
			}
		}
	};

	try {
		for (const routine of eventRoutines) {
			const config = JSON.parse(routine.triggerConfig ?? "{}") as TriggerConfig;
			if (!config.eventType) continue;

			const eventType = config.eventType as EventType;
			const unsub = eventBus.on(eventType, () => {
				void (async () => {
					const current = await ports.routine.getRoutineById(db, routine.id);
					if (current?.active) {
						fireGenericRoutineInternal(ports, db, eventBus, current, runtimeDeps).catch(() => {
							/* fire-and-forget: generic firing is resilient internally */
						});
					}
				})();
			});
			unsubscribers.push(unsub);
		}
	} catch (error) {
		unwind();
		throw error;
	}

	return unwind;
}

async function backfillMissingNextRunAtInternal(
	ports: DispatchPorts,
	db: HyperIdleDb,
): Promise<number> {
	const now = new Date();
	const candidates = await ports.routine.listScheduledRoutinesMissingNextRunAt(db);

	let count = 0;
	for (const routine of candidates) {
		const nextRunAt = computeNextRunAt(routine, now);
		if (!nextRunAt) continue;
		await ports.routine.updateRoutineById(db, routine.id, { nextRunAt });
		count += 1;
	}
	return count;
}

const ROUTINE_REAPER_CADENCE_MS = 5 * 60 * 1000;

async function startRoutineTriggerInternal(
	ports: DispatchPorts,
	db: HyperIdleDb,
	eventBus: EventBus,
	config: RoutineSchedulerConfig,
): Promise<RoutineScheduler> {
	const canProvision = config.canProvision ?? false;
	const reaperCadenceMs = config.reaperCadenceMs ?? ROUTINE_REAPER_CADENCE_MS;
	let lastReapedAt = 0;
	let tickRunning = false;
	await backfillMissingNextRunAtInternal(ports, db);
	const unsubEvents = await registerEventTriggersInternal(ports, db, eventBus, config.runtimeDeps);

	let intervalId: ReturnType<typeof setInterval>;
	try {
		intervalId = setInterval(() => {
			if (tickRunning) return;
			tickRunning = true;
			const now = new Date().toISOString();
			void (async () => {
				try {
					if (config.reap && Date.now() - lastReapedAt >= reaperCadenceMs) {
						lastReapedAt = Date.now();
						config.reap().catch(() => {
							/* fire-and-forget: reaper errors must not block routine dispatch */
						});
					}

					const allRoutines = await ports.routine.listActiveRoutines(db);
					const dueRoutines = allRoutines.filter((r) => {
						if (r.triggerType === "event") return false;
						if (!r.nextRunAt) return false;
						return r.nextRunAt <= now;
					});

					for (const routine of dueRoutines) {
						if (isBuiltinRoutineId(routine.id)) {
							const kind = extractBuiltinKind(routine.id);
							if (kind === "builtin:post-bet-retro") continue;
							const nextRunAt = computeNextRunAt(routine, new Date());
							await ports.routine.updateRoutineById(db, routine.id, { nextRunAt });
							void fireBuiltinRoutineInternal(ports, db, eventBus, routine.id).catch(() => {
								/* builtin firing writes its own terminal run row (§3a) */
							});
						} else {
							if (!canProvision) continue;
							fireGenericRoutineInternal(ports, db, eventBus, routine, config.runtimeDeps).catch(
								() => {
									/* fire-and-forget: errors do not block subsequent routines */
								},
							);
						}
					}
				} finally {
					tickRunning = false;
				}
			})();
		}, config.pollIntervalMs);
	} catch (error) {
		unsubEvents();
		throw error;
	}

	schedulerLog.info("routine scheduler started", {
		pollIntervalMs: config.pollIntervalMs,
		canProvision,
		reaperEnabled: !!config.reap,
	});

	return {
		stop: () => {
			clearInterval(intervalId);
			unsubEvents();
		},
	};
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
	readonly scheduler?: RoutineSchedulerConfig;
	readonly task?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
}

export interface DispatchOps {
	start(config: DispatchConfig): Promise<Disposer>;

	runAssistantTurn(deps: AssistantTurnDeps, request: AgentSessionRequest): Promise<void>;

	fireRoutine(
		db: HyperIdleDb,
		eventBus: EventBus,
		routine: Routine,
		opts?: {
			readonly args?: PostBetRetroArgs;
			readonly runtimeDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
			readonly recordSkippedRun?: boolean;
		},
	): Promise<FireResult>;

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
				disposers.push(registerBuiltinRoutineHandlersInternal(ports, config.db, config.eventBus));
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
				if (config.scheduler) {
					const scheduler = await startRoutineTriggerInternal(
						ports,
						config.db,
						config.eventBus,
						config.scheduler,
					);
					disposers.push(() => scheduler.stop());
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

		fireRoutine: (db, eventBus, routine, opts): Promise<FireResult> => {
			if (isBuiltinRoutineId(routine.id)) {
				return fireBuiltinRoutineInternal(
					ports,
					db,
					eventBus,
					routine.id,
					opts?.args,
				) as Promise<FireResult>;
			}
			return fireGenericRoutineInternal(
				ports,
				db,
				eventBus,
				routine,
				opts?.runtimeDeps,
				opts?.recordSkippedRun,
			);
		},

		provisionTeamRoutines: (db, opts) => provisionTeamRoutinesInternal(ports, db, opts),

		getQueueSnapshot: () => snapshotQueue(state),
	};
}
