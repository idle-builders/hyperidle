import { randomUUID } from "node:crypto";
import { type AgentSessionRequest, type HyperIdleDb, sessions } from "@hyperidle/db";
import {
	type AdmittedRun,
	type AgentSessionSourceCorrelation,
	type AgentSessionSourceKind,
	agentSessionRequestInputSchema,
	ConcurrencyLimitError,
	CostCapExceededError,
	type HarnessPortDeps,
	isAgentWorkIntentKind,
	isAgentWorkIntentSourceKind,
	type RunContextBundle,
	reportAdmissionFailure,
	TargetAgentNotRunnableError,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { createContextAssembler } from "./context.js";
import type { RunOptions, RunResult, RuntimeDeps, RuntimePorts } from "./contracts.js";
import { createProvisioner } from "./provisioner.js";

type RuntimeProvisionDeps = HarnessPortDeps<HyperIdleDb>;
type ExecutionPorts = Omit<RuntimePorts, "sessionProvisioner"> & {
	readonly sessionProvisioner: NonNullable<RuntimePorts["sessionProvisioner"]>;
};

function admitOnlyWithRequestLease(
	db: HyperIdleDb,
	input: { requestId: string; claimToken: string; now?: Date },
	ports: ExecutionPorts,
): Promise<boolean> {
	return ports.sessionRequests.findSessionRequest(db, {
		by: "claimActive",
		requestId: input.requestId,
		claimToken: input.claimToken,
		now: input.now ?? new Date(),
	}) as Promise<boolean>;
}

async function reserveOrAdoptSession(
	db: HyperIdleDb,
	input: { requestId: string; claimToken: string },
	ports: ExecutionPorts,
): Promise<{ adopted: boolean; sessionId: string }> {
	if (!(await admitOnlyWithRequestLease(db, input, ports))) {
		throw new Error(`Request ${input.requestId} is not owned by this claim`);
	}
	const [existing] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.requestId, input.requestId))
		.limit(1);
	if (existing) return { adopted: true, sessionId: existing.id };
	const request = await ports.sessionRequests.findSessionRequest(db, {
		by: "id",
		requestId: input.requestId,
	});
	if (!request) {
		throw new Error(`Unknown agent session request ${input.requestId}`);
	}
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
	options: Extract<RunOptions, { mode: "durable" }>,
	ports: ExecutionPorts,
): Promise<AgentSessionRequest> {
	void ports;
	if (request.status === "claimed") return request;
	if (request.status !== "pending") {
		throw new Error(`Agent session request ${request.id} is not claimable (${request.status})`);
	}
	const claimed = await ports.sessionRequests.claimSessionRequest(
		db,
		{ id: request.id },
		{
			workerId: options.workerId ?? "local-runtime",
			...(options.claim ?? { now: new Date(), leaseMs: 30_000 }),
		},
	);
	if (!claimed) {
		throw new Error(`Agent session request ${request.id} was already claimed`);
	}
	return claimed;
}

/**
 * AU21 §12 (traced, not guessed): a PRE-admission failure in
 * `runClaimedRequest` is the real "provisioning failed" gap — a deactivated
 * agent (`TargetAgentNotRunnableError`, `provisioner.ts`'s Phase 1 status
 * check) or any other hard infra failure building the session, before it
 * ever started running. Reported back via the SAME pre-handoff
 * `agent_run_admission_failed` channel `failOrRelease` uses (§6 B4) — no
 * bespoke race mechanism. Extracted to keep `runClaimedRequest`'s catch
 * block under the complexity ceiling.
 */
async function reportPreAdmissionProvisioningFailure(
	deps: RuntimeProvisionDeps,
	ports: ExecutionPorts,
	requestId: string,
	err: unknown,
): Promise<void> {
	const correlatedIntent = await ports.sessionRequests.findSessionRequest(deps.db, {
		by: "intentSource",
		requestId,
	});
	if (
		!(
			correlatedIntent &&
			isAgentWorkIntentKind(correlatedIntent.kind) &&
			isAgentWorkIntentSourceKind(correlatedIntent.sourceKind)
		)
	) {
		return;
	}
	reportAdmissionFailure(deps.eventBus, {
		intentId: correlatedIntent.id,
		kind: correlatedIntent.kind,
		sourceKind: correlatedIntent.sourceKind,
		sourceId: correlatedIntent.sourceId,
		failureCode:
			err instanceof TargetAgentNotRunnableError
				? "TARGET_AGENT_NOT_RUNNABLE"
				: "PROVISIONING_FAILED",
		terminal: true,
	});
}

async function runClaimedRequest(
	deps: RuntimeProvisionDeps,
	request: AgentSessionRequest,
	provisionParams: RunContextBundle,
	ports: ExecutionPorts,
	options: Pick<
		Extract<RunOptions, { mode: "durable" }>,
		"completion" | "enforceResolvedModelGuard"
	>,
): Promise<RunResult> {
	let admitted: AdmittedRun | null = null;
	try {
		if (
			!(
				request.claimToken &&
				(await ports.sessionRequests.renewClaim(deps.db, request.id, request.claimToken, {
					now: new Date(),
					leaseMs: 30_000,
				}))
			)
		) {
			throw new Error(`Lost request custody before admission: ${request.id}`);
		}
		await reserveOrAdoptSession(
			deps.db,
			{ requestId: request.id, claimToken: request.claimToken },
			ports,
		);
		admitted = options.enforceResolvedModelGuard
			? await ports.sessionProvisioner.admitSession(deps, provisionParams, true)
			: await ports.sessionProvisioner.admitSession(deps, provisionParams);
		await ports.sessionRequests.transitionSessionRequest(deps.db, {
			to: "running",
			requestId: request.id,
			sessionId: admitted.sessionId,
			claimToken: request.claimToken,
		});
		if (options.completion === "admit") {
			let signalStarted!: () => void;
			const started = new Promise<void>((resolve) => {
				signalStarted = resolve;
			});
			void ports.sessionProvisioner
				.runSession(deps, provisionParams, admitted, signalStarted)
				.then(async () => {
					await ports.sessionLifecycle.transitionAgentRunLifecycle(deps.db, deps.eventBus, {
						requestId: request.id,
						state: "completed",
						sessionId: admitted?.sessionId,
					});
				})
				.catch(async (err) => {
					try {
						if (admitted) {
							await ports.sessionLifecycle.crashSession(
								deps.db,
								deps.eventBus,
								admitted.sessionContext,
								0,
								0,
							);
						}
					} catch {
						// best-effort last-resort teardown
					}
					// @lore AU9 R1/W1: detached-runtime failure is post-admission — the
					// single terminal writer handles it in ONE transition (CAS + inbox
					// insert). A prior markRequestTerminal-then-transitionAgentRunLifecycle
					// double-write left the second CAS matching zero rows (status already
					// "failed"), losing the inbox row and the lifecycle publish entirely.
					await ports.sessionLifecycle.transitionAgentRunLifecycle(deps.db, deps.eventBus, {
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
			return { mode: "admitted", sessionId: admitted.sessionId };
		}
		const result = await ports.sessionProvisioner.runSession(
			deps,
			provisionParams,
			admitted,
			deps.onHarnessStarted,
		);
		await ports.sessionLifecycle.transitionAgentRunLifecycle(deps.db, deps.eventBus, {
			requestId: request.id,
			state: "completed",
			sessionId: admitted.sessionId,
		});
		return { mode: "completed", ...result };
	} catch (err) {
		if (err instanceof ConcurrencyLimitError || err instanceof CostCapExceededError) {
			if (request.claimToken) {
				await ports.sessionRequests.releaseClaim(deps.db, request.id, request.claimToken);
			}
			throw err;
		}
		// @lore AU9 R1: this catch spans both preconditions of the single terminal
		// writer. When `admitted` is set, `markRequestRunning` already succeeded —
		// post-admission (running+sessionId). When it is still null, the failure
		// happened before admission — pre-admission (claimed+claimToken); the
		// `running`-only CAS would silently match zero rows for this branch.
		await ports.sessionLifecycle.transitionAgentRunLifecycle(deps.db, deps.eventBus, {
			requestId: request.id,
			state: "failed",
			sessionId: admitted?.sessionId,
			claimToken: admitted ? undefined : (request.claimToken ?? undefined),
			failureCode: err instanceof Error ? err.name : "Error",
			errorMessage: err instanceof Error ? err.message : String(err),
		});
		// A POST-admission failure (a session actually started, then crashed)
		// is NOT a provisioning failure — the `transitionAgentRunLifecycle`
		// call above already covers that via the existing post-session
		// channel, so only a PRE-admission failure reports here.
		if (!admitted) {
			await reportPreAdmissionProvisioningFailure(deps, ports, request.id, err);
		}
		throw err;
	}
}

async function consumeAgentSessionRequest(
	deps: RuntimeProvisionDeps,
	request: AgentSessionRequest,
	options: Extract<RunOptions, { mode: "durable" }>,
	ports: ExecutionPorts,
): Promise<RunResult> {
	const claimedRequest = await ensureClaimedRequest(deps.db, request, options, ports);
	const sourceCorrelation = parseCorrelation(claimedRequest);
	const triggerPromptOverride = parseTriggerPrompt(claimedRequest);
	const provisionParams: RunContextBundle = {
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
	return runClaimedRequest(deps, claimedRequest, provisionParams, ports, options);
}

/** Drive a durable, one-shot, or assembly-only run through one coherent boundary. */
export function runSession(deps: RuntimeDeps, options: RunOptions): Promise<RunResult> {
	if (options.mode === "assemble") {
		if ("assemble" in deps && typeof deps.assemble === "function") {
			return Promise.resolve(deps.assemble(options.input)).then((assembled) => ({
				mode: "assembled",
				context: assembled as Extract<RunResult, { mode: "assembled" }>["context"],
			}));
		}
		const context = createContextAssembler(deps.composition.context);
		return context
			.assembleAgentContext(options.input)
			.then((assembled) => ({ mode: "assembled", context: assembled }));
	}
	if (!(deps.runtime || deps.ports?.sessionProvisioner)) {
		throw new Error("Executable run mode requires harness runtime dependencies");
	}
	const runtime = (deps.runtime ?? deps) as RuntimeProvisionDeps;
	const provisionerComposition = deps.composition?.provisioner;
	if (!(provisionerComposition || deps.ports?.sessionProvisioner)) {
		throw new Error("Executable run mode requires provisioner composition");
	}
	if (options.mode === "durable" && !deps.ports) {
		throw new Error("Durable run mode requires orchestration ports");
	}
	const basePorts = deps.ports;
	let executionProvisioner = basePorts?.sessionProvisioner;
	if (!executionProvisioner) {
		if (!provisionerComposition) throw new Error("Missing provisioner composition");
		const provisioner = createProvisioner({
			...provisionerComposition,
			contextAssembly: createContextAssembler(deps.composition.context),
		});
		executionProvisioner = { admitSession: provisioner.admit, runSession: provisioner.run };
	}
	const ports: ExecutionPorts = {
		...(basePorts ?? ({} as RuntimePorts)),
		sessionProvisioner: executionProvisioner,
	};
	if (options.mode === "durable") {
		return consumeAgentSessionRequest(runtime, options.request, options, ports);
	}
	return (async () => {
		const admitted = options.enforceResolvedModelGuard
			? await ports.sessionProvisioner.admitSession(runtime, options.input, true)
			: await ports.sessionProvisioner.admitSession(runtime, options.input);
		if (options.completion === "admit") {
			void ports.sessionProvisioner
				.runSession(runtime, options.input, admitted, runtime.onHarnessStarted)
				.catch(() => undefined);
			return { mode: "admitted", sessionId: admitted.sessionId };
		}
		const result = await ports.sessionProvisioner.runSession(
			runtime,
			options.input,
			admitted,
			runtime.onHarnessStarted,
		);
		return { mode: "completed", ...result };
	})();
}
