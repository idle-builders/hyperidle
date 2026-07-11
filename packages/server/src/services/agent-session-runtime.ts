import { randomUUID } from "node:crypto";
import {
	type AgentSessionRequest,
	agentSessionRequests,
	type HyperIdleDb,
	sessions,
} from "@hyperidle/db";
import {
	type AgentSessionSourceCorrelation,
	type AgentSessionSourceKind,
	agentSessionRequestInputSchema,
	ConcurrencyLimitError,
	CostCapExceededError,
	type EventBus,
} from "@hyperidle/shared";
import { and, eq, gt } from "drizzle-orm";
import {
	type ClaimRequestOptions,
	claimAgentSessionRequestById,
	markRequestRunning,
	releaseRequestClaim,
	renewAgentSessionRequestLease as renewRequestLease,
} from "./agent-session-requests.js";
import { crashSession, transitionAgentRunLifecycle } from "./session-lifecycle.js";
import {
	type AdmittedSession,
	admitSession,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	type ProvisionSessionResult,
	runSession,
} from "./session-provisioning.js";

export const renewAgentSessionRequestLease = renewRequestLease;

export async function admitOnlyWithRequestLease(
	db: HyperIdleDb,
	input: { requestId: string; claimToken: string; now?: Date },
): Promise<boolean> {
	const [owned] = await db
		.select({ id: agentSessionRequests.id })
		.from(agentSessionRequests)
		.where(
			and(
				eq(agentSessionRequests.id, input.requestId),
				eq(agentSessionRequests.status, "claimed"),
				eq(agentSessionRequests.claimToken, input.claimToken),
				gt(agentSessionRequests.claimExpiresAt, (input.now ?? new Date()).toISOString()),
			),
		)
		.limit(1);
	return Boolean(owned);
}

export async function reserveOrAdoptSession(
	db: HyperIdleDb,
	input: { requestId: string; claimToken: string },
): Promise<{ adopted: boolean; sessionId: string }> {
	if (!(await admitOnlyWithRequestLease(db, input))) {
		throw new Error(`Request ${input.requestId} is not owned by this claim`);
	}
	const [existing] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.requestId, input.requestId))
		.limit(1);
	if (existing) return { adopted: true, sessionId: existing.id };
	const [request] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.id, input.requestId))
		.limit(1);
	if (!request) throw new Error(`Unknown agent session request ${input.requestId}`);
	const agentId = request.agentId;
	const now = new Date().toISOString();
	const sessionId = randomUUID();
	await db.insert(sessions).values({
		id: sessionId,
		requestId: input.requestId,
		taskId: request.taskId ?? null,
		agentId,
		modelTier: "fast",
		startedAt: now,
		state: "active",
		sourceKind: request.sourceKind,
		sourceId: request.sourceId,
		sourceCorrelationJson: request.sourceCorrelationJson,
	});
	const [winner] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.requestId, input.requestId))
		.limit(1);
	if (!winner) throw new Error(`Failed to reserve session for ${input.requestId}`);
	return { adopted: true, sessionId: winner.id };
}

/**
 * @lore AU9 R1/R3: boot-time reconciliation for requests durably stuck `running`.
 * No live registry can possibly exist yet at this call site (it runs before any
 * worker starts), so an `active` correlated session is unconditionally orphaned —
 * mapped to `failed/RUNTIME_LOST`. A session that already reached a terminal DB
 * state (crash landed the session teardown but died before the request
 * terminalized) is "adopted": the request is projected to match the session's
 * already-known outcome. Never returns a constant and never throws on a lost
 * session — every row is reconciled through the single terminal writer.
 */
export async function recoverRunningAgentSessionRequests(
	db: HyperIdleDb,
	eventBus: EventBus,
): Promise<{ adopted: number; runtimeLost: number; running: number }> {
	const running = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.status, "running"));
	let adopted = 0;
	let runtimeLost = 0;
	for (const request of running) {
		if (!request.sessionId) {
			await transitionAgentRunLifecycle(db, eventBus, {
				requestId: request.id,
				state: "failed",
				claimToken: request.claimToken ?? undefined,
				failureCode: "RUNTIME_LOST",
			});
			runtimeLost += 1;
			continue;
		}
		const [session] = await db
			.select()
			.from(sessions)
			.where(and(eq(sessions.id, request.sessionId), eq(sessions.requestId, request.id)))
			.limit(1);
		if (!session || session.state === "active") {
			if (session) {
				await db
					.update(sessions)
					.set({ state: "crashed", outcome: "crashed", endedAt: new Date().toISOString() })
					.where(and(eq(sessions.id, session.id), eq(sessions.state, "active")));
			}
			await transitionAgentRunLifecycle(db, eventBus, {
				requestId: request.id,
				state: "failed",
				sessionId: request.sessionId,
				failureCode: "RUNTIME_LOST",
			});
			runtimeLost += 1;
			continue;
		}
		await transitionAgentRunLifecycle(db, eventBus, {
			requestId: request.id,
			state: session.state === "done" ? "completed" : "failed",
			sessionId: session.id,
			...(session.state === "done" ? {} : { failureCode: "RUNTIME_LOST" }),
		});
		adopted += 1;
	}
	return { adopted, runtimeLost, running: running.length };
}

export interface ConsumeAgentSessionRequestOptions {
	readonly sandboxBasePath: string;
	readonly workerId?: string;
	readonly claim?: ClaimRequestOptions;
	readonly resolvedModel?: ProvisionSessionParams["resolvedModel"];
	readonly resolvedFastModel?: ProvisionSessionParams["resolvedFastModel"];
	readonly modelTier?: ProvisionSessionParams["modelTier"];
	readonly sessionWorkflow?: ProvisionSessionParams["sessionWorkflow"];
	readonly conversational?: ProvisionSessionParams["conversational"];
	readonly detachAfterAdmission?: boolean;
	readonly enforceResolvedModelGuard?: boolean;
}

function parseCorrelation(request: AgentSessionRequest): AgentSessionSourceCorrelation {
	const parsed = JSON.parse(request.sourceCorrelationJson) as AgentSessionSourceCorrelation;
	agentSessionRequestInputSchema.parse({
		sourceKind: request.sourceKind,
		sourceId: request.sourceId,
		streamId: request.streamId,
		taskId: request.taskId,
		agentId: request.agentId,
		teamId: request.teamId ?? undefined,
		userId: request.userId ?? undefined,
		promptMode: request.promptMode,
		idempotencyKey: request.idempotencyKey,
		payloadJson: request.payloadJson ?? undefined,
		sourceCorrelation: parsed,
	});
	return parsed;
}

function parseTriggerPrompt(request: AgentSessionRequest): string | null {
	if (!request.payloadJson) return null;
	const payload = JSON.parse(request.payloadJson) as unknown;
	if (!payload || typeof payload !== "object" || !("trigger" in payload)) return null;
	const trigger = (payload as { trigger?: unknown }).trigger;
	if (!trigger || typeof trigger !== "object") return null;
	const prompt = (trigger as { prompt?: unknown }).prompt;
	return typeof prompt === "string" && prompt.length > 0 ? prompt : null;
}

async function ensureClaimedRequest(
	db: HyperIdleDb,
	request: AgentSessionRequest,
	options: ConsumeAgentSessionRequestOptions,
): Promise<AgentSessionRequest> {
	if (request.status === "claimed") return request;
	if (request.status !== "pending") {
		throw new Error(`Agent session request ${request.id} is not claimable (${request.status})`);
	}
	const claimed = await claimAgentSessionRequestById(
		db,
		request.id,
		options.workerId ?? "local-runtime",
		options.claim ?? { now: new Date(), leaseMs: 30_000 },
	);
	if (!claimed) {
		throw new Error(`Agent session request ${request.id} was already claimed`);
	}
	return claimed;
}

async function runClaimedRequest(
	deps: ProvisionSessionDeps,
	request: AgentSessionRequest,
	provisionParams: ProvisionSessionParams,
	options: Pick<
		ConsumeAgentSessionRequestOptions,
		"detachAfterAdmission" | "enforceResolvedModelGuard"
	> = {},
): Promise<ProvisionSessionResult> {
	let admitted: AdmittedSession | null = null;
	try {
		if (
			!(
				request.claimToken &&
				(await renewRequestLease(deps.db, {
					requestId: request.id,
					claimToken: request.claimToken,
					now: new Date(),
					leaseMs: 30_000,
				}))
			)
		) {
			throw new Error(`Lost request custody before admission: ${request.id}`);
		}
		await reserveOrAdoptSession(deps.db, { requestId: request.id, claimToken: request.claimToken });
		admitted = options.enforceResolvedModelGuard
			? await admitSession(deps, provisionParams, true)
			: await admitSession(deps, provisionParams);
		await markRequestRunning(deps.db, request.id, admitted.sessionId, request.claimToken);
		if (options.detachAfterAdmission) {
			let signalStarted!: () => void;
			const started = new Promise<void>((resolve) => {
				signalStarted = resolve;
			});
			void runSession(deps, provisionParams, admitted, signalStarted)
				.then(async () => {
					await transitionAgentRunLifecycle(deps.db, deps.eventBus, {
						requestId: request.id,
						state: "completed",
						sessionId: admitted?.sessionId,
					});
				})
				.catch(async (err) => {
					try {
						if (admitted) {
							await crashSession(deps.db, deps.eventBus, admitted.sessionContext, 0, 0);
						}
					} catch {
						// best-effort last-resort teardown
					}
					// @lore AU9 R1/W1: detached-runtime failure is post-admission — the
					// single terminal writer handles it in ONE transition (CAS + inbox
					// insert). A prior markRequestTerminal-then-transitionAgentRunLifecycle
					// double-write left the second CAS matching zero rows (status already
					// "failed"), losing the inbox row and the lifecycle publish entirely.
					await transitionAgentRunLifecycle(deps.db, deps.eventBus, {
						requestId: request.id,
						state: "failed",
						sessionId: admitted?.sessionId,
						failureCode: err instanceof Error ? err.name : "Error",
						errorMessage: err instanceof Error ? err.message : String(err),
					});
				})
				.finally(() => {
					signalStarted();
				});
			await started;
			return {
				sessionId: admitted.sessionId,
				outcome: "completed",
				totalCostCents: 0,
				taskId: admitted.sessionContext.taskId,
				forceReturnCount: 0,
			};
		}
		const result = await runSession(deps, provisionParams, admitted, deps.onHarnessStarted);
		await transitionAgentRunLifecycle(deps.db, deps.eventBus, {
			requestId: request.id,
			state: "completed",
			sessionId: admitted.sessionId,
		});
		return result;
	} catch (err) {
		if (err instanceof ConcurrencyLimitError || err instanceof CostCapExceededError) {
			await releaseRequestClaim(deps.db, request.id, request.claimToken ?? undefined);
			throw err;
		}
		// @lore AU9 R1: this catch spans both preconditions of the single terminal
		// writer. When `admitted` is set, `markRequestRunning` already succeeded —
		// post-admission (running+sessionId). When it is still null, the failure
		// happened before admission — pre-admission (claimed+claimToken); the
		// `running`-only CAS would silently match zero rows for this branch.
		await transitionAgentRunLifecycle(deps.db, deps.eventBus, {
			requestId: request.id,
			state: "failed",
			sessionId: admitted?.sessionId,
			claimToken: admitted ? undefined : (request.claimToken ?? undefined),
			failureCode: err instanceof Error ? err.name : "Error",
			errorMessage: err instanceof Error ? err.message : String(err),
		});
		throw err;
	}
}

export async function consumeAgentSessionRequest(
	deps: ProvisionSessionDeps,
	request: AgentSessionRequest,
	options: ConsumeAgentSessionRequestOptions,
): Promise<ProvisionSessionResult> {
	const claimedRequest = await ensureClaimedRequest(deps.db, request, options);
	const sourceCorrelation = parseCorrelation(claimedRequest);
	const triggerPromptOverride = parseTriggerPrompt(claimedRequest);
	const provisionParams: ProvisionSessionParams = {
		taskId: claimedRequest.taskId,
		agentId: claimedRequest.agentId,
		productId: claimedRequest.teamId ?? "task-free",
		sandboxBasePath: options.sandboxBasePath,
		...(options.modelTier ? { modelTier: options.modelTier } : {}),
		...(options.resolvedModel ? { resolvedModel: options.resolvedModel } : {}),
		...(options.resolvedFastModel ? { resolvedFastModel: options.resolvedFastModel } : {}),
		...(options.sessionWorkflow ? { sessionWorkflow: options.sessionWorkflow } : {}),
		...(options.conversational ? { conversational: options.conversational } : {}),
		...(claimedRequest.sourceKind === "routine" && "routineId" in sourceCorrelation
			? { routineId: sourceCorrelation.routineId }
			: {}),
		requestContext: {
			requestId: claimedRequest.id,
			sourceKind: claimedRequest.sourceKind as AgentSessionSourceKind,
			sourceId: claimedRequest.sourceId,
			sourceCorrelation,
			...(triggerPromptOverride ? { triggerPromptOverride } : {}),
		},
	};
	return runClaimedRequest(deps, claimedRequest, provisionParams, options);
}
