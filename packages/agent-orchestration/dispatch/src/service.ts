import * as crypto from "node:crypto";
import {
	type AgentSessionRequest,
	type HyperIdleDb,
	resolveAgentScaffoldSpecs,
} from "@hyperidle/db";
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

/** Per-agent model override baked onto `request.payloadJson` — see `loadBakedModelOverride`. */
interface BakedModelOverride {
	readonly modelId: string | null;
	readonly modelProvider: string | null;
}

/**
 * @lore AU21 §9 Increment 11 (Decision H2): "the assistant turn is NOT
 * special" — model resolution is TIER-based by default (`resolveModelTier`),
 * the exact same shape run-orchestration's own poller already uses for every
 * other intent kind (`start-runtime.ts`'s `deps.resolveModel?.(tier)`),
 * EXCEPT the target agent's per-agent model override
 * (`users.modelId`/`modelProvider`, Settings → Agents) still applies —
 * `ports.modelGateway.resolveAgentModel` falls through to the tier when
 * `bakedModel.modelId` is null, so this is one call, not a branch.
 *
 * @lore Wave A (this Increment) deleted the former live
 * `ports.users.getOrCreateUser` + `ports.settings.readServerConfig` reads
 * entirely and, with them, silently dropped the override — a real
 * regression (`users.modelId`/`modelProvider` are real, founder-configurable
 * columns with a real Settings UI), not an acceptable trade-off. The fix
 * follows Decision H2's own principle exactly: core bakes everything a run
 * needs at emit time, so `dispatch` never reads core again.
 * `resolveAssistantTurnRequest` (`@hyperidle/conversation`) now bakes
 * `modelId`/`modelProvider` from the SAME `requireRunnableAgent` row it
 * already reads to validate runnability, riding through
 * `AgentSessionRequest.payloadJson` alongside `transcript` (same pipe,
 * `loadBakedModelOverride` below mirrors `loadBakedTranscript`). The
 * `ModelGatewayConfig` input is still the static `BUILT_IN_GATEWAY_CONFIG`
 * (the same default `readServerConfig` itself falls back to when no custom
 * config is stored, `server-config.ts`'s `applyDefaults`) — a founder's
 * custom model-gateway settings applying to assistant turns specifically
 * remains deferred to the "normal provisioning path" wiring
 * (`deps.resolveModel`), unrelated to the per-agent override this fixes.
 */
async function resolveTurnModelInternal(
	ports: DispatchPorts,
	db: HyperIdleDb,
	userId: string,
	threadId: string,
	deps: AssistantTurnDeps,
	bakedModel: BakedModelOverride | undefined,
): Promise<{ resolvedModel: ResolvedModel; resolvedFastModel?: ResolvedModel } | undefined> {
	if (deps.resolvedModel) {
		let resolvedFastModel: ResolvedModel | undefined;
		if (deps.credentialResolver) {
			try {
				resolvedFastModel = await ports.modelGateway.resolveModelTier(
					"fast",
					BUILT_IN_GATEWAY_CONFIG,
					deps.credentialResolver,
				);
			} catch {}
		}
		return { resolvedModel: deps.resolvedModel, resolvedFastModel };
	}
	if (deps.credentialResolver) {
		try {
			const resolvedModel = await ports.modelGateway.resolveAgentModel(
				{ modelId: bakedModel?.modelId ?? null, modelProvider: bakedModel?.modelProvider ?? null },
				"workhorse",
				BUILT_IN_GATEWAY_CONFIG,
				deps.credentialResolver,
			);
			let resolvedFastModel: ResolvedModel | undefined;
			try {
				resolvedFastModel = await ports.modelGateway.resolveModelTier(
					"fast",
					BUILT_IN_GATEWAY_CONFIG,
					deps.credentialResolver,
				);
			} catch {}
			return { resolvedModel, resolvedFastModel };
		} catch (err) {
			if (err instanceof MissingCredentialError) {
				await persistTurnFailureInternal(ports, db, userId, threadId, err);
				return undefined;
			}
			throw err;
		}
	}
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		await persistTurnFailureInternal(
			ports,
			db,
			userId,
			threadId,
			new MissingCredentialError("anthropic_api_key (required; not in env)"),
		);
		return undefined;
	}
	return {
		resolvedModel: {
			provider: "anthropic",
			model: bakedModel?.modelId ?? BUILT_IN_GATEWAY_CONFIG.workhorse.model,
			apiKey,
			baseUrl: "https://api.anthropic.com",
		},
	};
}

/** Baked `{senderId, payload, type}` rows carried on `request.payloadJson` — see `resolveAssistantTurnRequest` (H2). */
function loadBakedTranscript(
	payloadJson: string | null,
): Array<{ senderId: string; payload: string; type: string }> {
	if (!payloadJson) return [];
	try {
		const parsed = JSON.parse(payloadJson) as { transcript?: unknown };
		if (!Array.isArray(parsed.transcript)) return [];
		const rows: Array<{ senderId: string; payload: string; type: string }> = [];
		for (const row of parsed.transcript) {
			if (
				typeof row === "object" &&
				row !== null &&
				typeof (row as Record<string, unknown>).senderId === "string" &&
				typeof (row as Record<string, unknown>).payload === "string" &&
				typeof (row as Record<string, unknown>).type === "string"
			) {
				const r = row as { senderId: string; payload: string; type: string };
				rows.push({ senderId: r.senderId, payload: r.payload, type: r.type });
			}
		}
		return rows;
	} catch {
		return [];
	}
}

/** Baked `{modelId, modelProvider}` override carried on `request.payloadJson` — see `resolveTurnModelInternal`'s `@lore` (H2). */
function loadBakedModelOverride(payloadJson: string | null): BakedModelOverride | undefined {
	if (!payloadJson) return undefined;
	try {
		const parsed = JSON.parse(payloadJson) as { modelId?: unknown; modelProvider?: unknown };
		if (!("modelId" in parsed)) return undefined;
		return {
			modelId: typeof parsed.modelId === "string" ? parsed.modelId : null,
			modelProvider: typeof parsed.modelProvider === "string" ? parsed.modelProvider : null,
		};
	} catch {
		return undefined;
	}
}

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
	const bakedModel = loadBakedModelOverride(existingRequest.payloadJson);
	const resolved = await resolveTurnModelInternal(ports, db, userId, threadId, deps, bakedModel);
	if (!resolved) return;
	const { resolvedModel, resolvedFastModel } = resolved;
	const transcriptRows = loadBakedTranscript(existingRequest.payloadJson);
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

/**
 * @lore AU21 §9 Increment 11 (Decision H2/F4, Wave B): the assistant-thread
 * pin trigger (`registerAssistantTriggerInternal`, this file's LAST remaining
 * `eventBus.on` registration — an `agent-orchestration -> core-api` READ via
 * `ports.conversation.getThreadById` + `ports.users.getUserById`) is DELETED
 * entirely, not migrated. The pin decision moved ENTIRELY into a core-api
 * `thread_message_appended` subscriber, a `@hyperidle/conversation`-owned
 * reaction obtaining the sender's `kind` via ordinary same-layer DI to
 * `@hyperidle/users` (`assistant-thread-pin-reaction.ts`, composed in at
 * `test-fixtures.ts`/`server-factory.ts`). `dispatch`'s `start()` no longer
 * subscribes to any event at all — `dispatch/src/service.ts` now holds ZERO
 * `-> core-api` edge of any kind, the concrete boundary close named in
 * architecture.md §9's Increment 11 paragraph.
 */

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
		async start(_config): Promise<Disposer> {
			if (activeDispose || starting) throw new Error("dispatch already started");
			starting = true;
			// AU21 §9 Increment 11 (Wave B): `registerAssistantTriggerInternal` —
			// this list's last remaining entry — is deleted (see the `@lore`
			// above `type Disposer`). `disposers` is intentionally always empty
			// now; the unwind-on-partial-failure / idempotent-multi-dispose shape
			// stays as-is for whatever trigger this package needs next.
			const disposers: Disposer[] = [];
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
