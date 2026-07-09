import type { AgentSessionRequest, HyperIdleDb } from "@hyperidle/db";
import {
	type AgentSessionSourceCorrelation,
	type AgentSessionSourceKind,
	agentSessionRequestInputSchema,
	ConcurrencyLimitError,
	CostCapExceededError,
} from "@hyperidle/shared";
import {
	type ClaimRequestOptions,
	claimAgentSessionRequestById,
	markRequestRunning,
	markRequestTerminal,
	releaseRequestClaim,
} from "./agent-session-requests.js";
import { crashSession } from "./session-lifecycle.js";
import {
	type AdmittedSession,
	admitSession,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	type ProvisionSessionResult,
	runSession,
} from "./session-provisioning.js";

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
		admitted = options.enforceResolvedModelGuard
			? await admitSession(deps, provisionParams, true)
			: await admitSession(deps, provisionParams);
		await markRequestRunning(deps.db, request.id, admitted.sessionId);
		if (options.detachAfterAdmission) {
			let signalStarted!: () => void;
			const started = new Promise<void>((resolve) => {
				signalStarted = resolve;
			});
			void runSession(deps, provisionParams, admitted, signalStarted)
				.then(async () => {
					await markRequestTerminal(deps.db, request.id, "completed");
				})
				.catch(async (err) => {
					try {
						if (admitted) {
							await crashSession(deps.db, deps.eventBus, admitted.sessionContext, 0, 0);
						}
					} catch {
						// best-effort last-resort teardown
					}
					await markRequestTerminal(deps.db, request.id, "failed", {
						code: err instanceof Error ? err.name : "Error",
						message: err instanceof Error ? err.message : String(err),
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
		await markRequestTerminal(deps.db, request.id, "completed");
		return result;
	} catch (err) {
		if (err instanceof ConcurrencyLimitError || err instanceof CostCapExceededError) {
			await releaseRequestClaim(deps.db, request.id);
			throw err;
		}
		await markRequestTerminal(deps.db, request.id, "failed", {
			code: err instanceof Error ? err.name : "Error",
			message: err instanceof Error ? err.message : String(err),
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
