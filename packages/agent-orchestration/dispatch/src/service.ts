import * as crypto from "node:crypto";
import { type AgentSessionRequest, type HyperIdleDb, resolveAgentScaffoldSpecs } from "@hyperidle/db";
import {
	BUILT_IN_GATEWAY_CONFIG,
	CassetteMissError,
	type ConversationMessage,
	createLogger,
	type EventBus,
	HttpError,
	MissingCredentialError,
	NoEligibleHarnessError,
	type PlainPayload,
	ProviderTimeoutError,
	type ResolvedModel,
	type ThreadMessageAppendedEvent,
} from "@hyperidle/shared";
import type { DispatchPorts } from "./ports.js";

type DispatchCredentialResolver = Parameters<DispatchPorts["modelGateway"]["resolveAgentModel"]>[3];
type DispatchToolContext = Parameters<
	DispatchPorts["toolHandlers"]["buildAssistantDraftRegistry"]
>[0];
type DispatchProvisionDeps = Parameters<
	DispatchPorts["runOrchestration"]["executeAgentRunRequest"]
>[0];

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

/**
 * @lore AU21 §9 Increment 9 (forensic-triage wave, closing the `dispatch::routine`
 * finding for real, not allowlisted): `provisionTeamRoutinesInternal` +
 * `BUILTIN_SPECS` relocated to `@hyperidle/routine`'s `routine-scheduler.ts`
 * (`provisionTeamRoutines`) — team-creation-time routine-definition seeding
 * is a pure core-api concern (a plain `routines` row insert), not something
 * `dispatch` needs to reach into `routine` for anymore. Both real call sites
 * (`teams-routes.ts`, `tool-handlers`'s `create_team` via the core-api
 * composition root) now import `@hyperidle/routine`'s `provisionTeamRoutines`
 * directly. `DispatchOps.provisionTeamRoutines` + `DispatchPorts.routine` are
 * both deleted — `dispatch` now has zero `agent-orchestration -> routine`
 * edge of any kind.
 */

/**
 * @lore AU21 §9 Increment 9 (forensic-triage wave, closing the `dispatch::work`
 * finding for real — not allowlisted, not deferred): the task-queue trigger
 * (`enqueue`/`drainQueue`/`startupSweep`/`registerTaskTriggerInternal`/
 * `TaskQueueState`/`DispatchQueueSnapshot`/`getQueueSnapshot`) that used to
 * live here is DELETED, confirmed genuinely dead — not merely redundant.
 * Source-verified two ways: (a) `drainQueue`'s own body never called a
 * session-launch function on the success path — it resolved a model via
 * `deps.resolveModel` then immediately discarded it (`void resolvedModel`)
 * and removed the entry from the queue; this shape predates AU21 entirely
 * (identical in the pre-AU20 `task-dispatcher.ts`, `git show 32fa2649^`). (b)
 * The REAL task-dispatch path today is `@hyperidle/work`'s
 * `task-state-machine.ts`: a task's "accepted" transition already bakes +
 * records a `task_run` `AgentWorkIntentRecorder` intent in the SAME
 * transaction (AU21 Decision B, resolve-at-emit), which flows through
 * `session-requests`'s durable queue into an `agentSessionRequests` row,
 * consumed by `run-orchestration`'s OWN independent 1s poll loop
 * (`start-runtime.ts`'s `setInterval(() => void wake(), 1_000)` →
 * `drainIntents`) — entirely bypassing `dispatch`. `startupSweep`/
 * `handleTaskStateChanged`/`handleSessionEnded`'s `ports.work.listTasks`/
 * `getTaskById` reads existed only to populate a queue `drainQueue` then
 * silently discarded — a real `agent-orchestration -> core-api` read with NO
 * live product effect. The `/api/dispatch-queue` observer route
 * (`dispatch-queue-routes.ts`) had no frontend consumer (grepped) and always
 * reported an empty, permanently-draining snapshot; deleted alongside it.
 * `DispatchPorts.work` (the only capability this mechanism needed) is
 * removed entirely — `dispatch` now has zero `agent-orchestration -> work`
 * edge of any kind.
 */

type Disposer = () => void;

export interface DispatchConfig {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
}

/**
 * @lore AU21 §9 Increment 4: `DispatchOps` sheds routine awareness entirely —
 * no `scheduler` config branch, no `fireRoutine` method. The routine
 * scheduler + `routineRuns` lifecycle relocated to `@hyperidle/routine`'s
 * `routine-scheduler.ts`; the composition-root wiring (start/stop, the
 * manual-fire dispatch) now lives in
 * `packages/core-api/src/services/routine-scheduler-bindings.ts`.
 *
 * @lore AU21 §9 Increment 9 (forensic-triage wave, second pass): the
 * task-queue responsibility is gone too (genuinely dead, see this file's
 * `dispatch::work` `@lore` above) — `DispatchConfig` no longer has a `task`
 * branch and `getQueueSnapshot`/`DispatchQueueSnapshot` are deleted.
 * `provisionTeamRoutines` relocated to `@hyperidle/routine` (see this file's
 * `dispatch::routine` `@lore` above) — `DispatchOps` no longer exposes it
 * either. Dispatch now does exactly one live thing: the assistant-turn
 * runner.
 */
export interface DispatchOps {
	start(config: DispatchConfig): Promise<Disposer>;

	runAssistantTurn(deps: AssistantTurnDeps, request: AgentSessionRequest): Promise<void>;
}

export function createDispatchOps(ports: DispatchPorts): DispatchOps {
	let activeDispose: (() => void) | null = null;
	let starting = false;
	return {
		async start(config): Promise<Disposer> {
			if (activeDispose || starting) throw new Error("dispatch already started");
			starting = true;
			const disposers: Disposer[] = [];
			try {
				disposers.push(registerAssistantTriggerInternal(ports, config.eventBus, config.db));
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
				activeDispose = null;
			};
			activeDispose = dispose;
			starting = false;
			return dispose;
		},

		runAssistantTurn: (deps, request) => executeAssistantRequestInternal(ports, deps, request),
	};
}
