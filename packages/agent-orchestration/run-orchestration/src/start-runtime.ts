import { type HyperIdleDb, sessions } from "@hyperidle/db";
import { EventBus, type ModelTier } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { createContextAssembler } from "./context.js";
import type { RuntimeDeps, RuntimeHandle, RuntimePorts } from "./contracts.js";
import { createProvisioner } from "./provisioner.js";
import { runSession } from "./runtime.js";
import { createRuntimeReapers } from "./runtime-reapers.js";
import { createWorkerIngress } from "./worker-ingress.js";
import { createWritebackProcessor } from "./writeback-processor.js";

async function recoverRunningRequests(
	db: HyperIdleDb,
	eventBus: EventBus,
	ports: RuntimePorts,
): Promise<void> {
	const running = await ports.sessionRequests.listSessionRequests(db, { status: "running" });
	for (const request of running) {
		const [session] = request.sessionId
			? await db
					.select()
					.from(sessions)
					.where(and(eq(sessions.id, request.sessionId), eq(sessions.requestId, request.id)))
					.limit(1)
			: [];
		if (session?.state === "done" || session?.state === "crashed") {
			await ports.sessionLifecycle.transitionAgentRunLifecycle(db, eventBus, {
				requestId: request.id,
				state: session.state === "done" ? "completed" : "failed",
				sessionId: session.id,
				...(session.state === "crashed" ? { failureCode: "RUNTIME_LOST" } : {}),
			});
			continue;
		}
		if (session) {
			await db
				.update(sessions)
				.set({ state: "crashed", outcome: "crashed", endedAt: new Date().toISOString() })
				.where(and(eq(sessions.id, session.id), eq(sessions.state, "active")));
		}
		await ports.sessionLifecycle.transitionAgentRunLifecycle(db, eventBus, {
			requestId: request.id,
			state: "failed",
			...(request.sessionId
				? { sessionId: request.sessionId }
				: { claimToken: request.claimToken ?? undefined }),
			failureCode: "RUNTIME_LOST",
		});
	}
}

/** @lore AU9: every recovery/reap primitive needs a bus; boot always constructs one when absent. */
function resolveEventBus(deps: RuntimeDeps): EventBus {
	return deps.eventBus ?? new EventBus();
}

/** 6h cadence for the terminal-intent/explicit-start/task-attempt reaper. */
const AGENT_LAYER_REAP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function assertStartable(deps: RuntimeDeps): asserts deps is RuntimeDeps & {
	ports: RuntimePorts;
	durableQueue: NonNullable<RuntimeDeps["durableQueue"]>;
	composition: RuntimeDeps["composition"] & {
		provisioner: NonNullable<RuntimeDeps["composition"]["provisioner"]>;
		writeback: NonNullable<RuntimeDeps["composition"]["writeback"]>;
		worker: NonNullable<RuntimeDeps["composition"]["worker"]>;
	};
} {
	if (
		!(
			deps.ports &&
			deps.durableQueue &&
			deps.composition.provisioner &&
			deps.composition.writeback &&
			deps.composition.worker
		)
	) {
		throw new Error(
			"startRuntime requires ports, durable queue, provisioner, writeback, and worker composition",
		);
	}
}

/** Request custody is separate from intent handoff: only this drain executes rows. */
async function drainAgentSessionRequests(deps: RuntimeDeps): Promise<number> {
	assertStartable(deps);
	if (!deps.runtime) return 0;
	let consumed = 0;
	for (;;) {
		const request = await deps.ports.sessionRequests.claimSessionRequest(
			deps.db,
			{ next: true },
			{ workerId: "agent-layer", now: new Date(), leaseMs: 30_000 },
		);
		if (!request) return consumed;
		// @lore AU9: explicitSessionStarts.requestId is only populated by THIS
		// function's own success write below — before admission it is still null,
		// so looking the row up `WHERE requestId = request.id` silently matches
		// zero rows both for the pre-admission tier read and (worse) the failure
		// projection, which then never surfaces a terminal code to the poller.
		// The correlated intent's sourceId is the durable link the whole way
		// through — resolve the explicit-session-start row through it instead.
		const correlatedIntent = await deps.ports.sessionRequests.findSessionRequest(deps.db, {
			by: "intentSource",
			requestId: request.id,
		});
		const explicitStartId =
			correlatedIntent?.sourceKind === "explicit_session_start" ? correlatedIntent.sourceId : null;
		try {
			if (request.sourceKind === "assistant") {
				if (!deps.assistantTurn) {
					if (request.claimToken) {
						await deps.ports.sessionRequests.releaseClaim(deps.db, request.id, request.claimToken);
					}
					return consumed;
				}
				await deps.ports.dispatch.runAssistantTurn(deps.assistantTurn, request);
			} else {
				let tier: ModelTier = "workhorse";
				if (explicitStartId) {
					const start = await deps.ports.sessionRequests.findSessionRequest(deps.db, {
						by: "explicitStart",
						startId: explicitStartId,
					});
					tier = (start?.requestedModelTier as ModelTier | null) ?? tier;
				}
				const resolvedModel = await deps.resolveModel?.(tier);
				const result = await runSession(deps, {
					mode: "durable",
					request,
					sandboxBasePath: deps.sandboxBasePath ?? "/tmp/hyperidle-workspaces",
					modelTier: tier,
					resolvedModel,
					completion: "admit",
				});
				if (explicitStartId) {
					if (result.mode === "assembled") {
						throw new Error("Durable execution returned assembly-only result");
					}
					await deps.ports.sessionRequests.transitionSessionRequest(deps.db, {
						target: "explicitStart",
						to: "admitted",
						startId: explicitStartId,
						requestId: request.id,
						sessionId: result.sessionId,
					});
				}
			}
			consumed += 1;
		} catch (error) {
			const failure = classifyAdmissionFailure(error);
			// @lore AU9 R1: executeAgentRunRequest (via runClaimedRequest) already
			// terminalizes the request itself before rethrowing — for
			// ConcurrencyLimitError/CostCapExceededError it releases the claim back
			// to pending (retryable), for every other error it terminalizes to
			// failed through the single terminal writer. Calling
			// transitionAgentRunLifecycle again here would either double-terminalize
			// (CAS finds zero rows — a thrown "Unknown agent request", the exact
			// silent-no-op-turned-crash class R1 exists to kill) or incorrectly
			// terminalize a legitimately-retryable released claim. This catch's only
			// remaining job is the family-specific explicit-session-start projection.
			// (runAssistantTurn never throws here — it maps failures to
			// persisted notices internally.)
			if (explicitStartId) {
				await deps.ports.sessionRequests.transitionSessionRequest(deps.db, {
					target: "explicitStart",
					to: "failed",
					startId: explicitStartId,
					failureCode: failure.code,
				});
			}
		}
	}
}

type AgentAdmissionFailureCode =
	| "COST_CAP_EXCEEDED"
	| "CONCURRENCY_LIMIT"
	| "MISSING_CREDENTIAL"
	| "NO_ELIGIBLE_HARNESS"
	| "INTERNAL_ERROR";

/** Stable public projection; private runtime messages never cross the API boundary. */
function classifyAdmissionFailure(error: unknown): {
	readonly code: AgentAdmissionFailureCode;
	readonly status: 422 | 429 | 500;
} {
	const name = error instanceof Error ? error.name : "Error";
	switch (name) {
		case "CostCapExceededError":
			return { code: "COST_CAP_EXCEEDED", status: 422 };
		case "ConcurrencyLimitError":
			return { code: "CONCURRENCY_LIMIT", status: 429 };
		case "MissingCredentialError":
			return { code: "MISSING_CREDENTIAL", status: 500 };
		case "NoEligibleHarnessError":
			return { code: "NO_ELIGIBLE_HARNESS", status: 422 };
		default:
			return { code: "INTERNAL_ERROR", status: 500 };
	}
}

/**
 * @lore AU9 Shutdown/cost-cap callers: the process disposer stores `shutdown` on
 * every still-running correlated request before it aborts them — through
 * `requestAgentTermination` then the single terminal writer, never a bare abort.
 * A recovering boot (or this same process's own recovery sweep next start) then
 * disposes each to `failed/RUNTIME_LOST` via the durable reason, not a generic
 * guess. Best-effort: process teardown does not block on this.
 */
async function markRunningAgentSessionRequestsForShutdown(
	db: HyperIdleDb,
	ports: RuntimePorts,
): Promise<number> {
	const running = await ports.sessionRequests.listSessionRequests(db, { status: "running" });
	let marked = 0;
	for (const request of running) {
		const result = await ports.sessionLifecycle.requestAgentTermination(db, {
			requestId: request.id,
			reason: "shutdown",
		});
		if (result === "accepted") marked += 1;
	}
	return marked;
}

function disposeAll(disposers: Array<() => void>): unknown {
	let firstError: unknown;
	for (const dispose of disposers.reverse()) {
		try {
			dispose();
		} catch (error) {
			firstError ??= error;
		}
	}
	return firstError;
}

/**
 * Opaque composition-root seam. Domain code gets no create/execute callback.
 *
 * @lore AU9 Boot wiring: an awaited first sweep runs before anything else observes
 * readiness — recover running-request custody (adopt-or-RUNTIME_LOST), recover
 * durably-stored termination causes that never reached teardown (crash after
 * HTTP 202: shutdown/cost-cap/user causes), then reap eligible terminal rows.
 * Only after that sweep does the intent/request drain start, scheduled every 1s,
 * with the reaper additionally scheduled every 6h.
 */
async function bootAgentLayer(deps: RuntimeDeps): Promise<() => void> {
	assertStartable(deps);
	const runtime = deps.runtime;
	const eventBus = resolveEventBus(deps);
	await recoverRunningRequests(deps.db, eventBus, deps.ports);
	await deps.ports.sessionLifecycle.recoverRequestedTerminations(deps.db, eventBus);
	await deps.ports.sessionRequests.reapExpired(deps.durableQueue);
	let draining = false;
	const wake = async () => {
		if (draining) return;
		draining = true;
		try {
			await deps.ports.sessionRequests.drainIntents(deps.durableQueue);
			if (runtime) await drainAgentSessionRequests(deps);
		} finally {
			draining = false;
		}
	};
	await wake();
	// EventBus is a latency hint only; polling remains the process-death recovery path.
	const unsubscribe = deps.eventBus?.on("*", () => void wake());
	const timer = setInterval(() => void wake(), 1_000);
	const reapTimer = setInterval(
		() => void deps.ports.sessionRequests.reapExpired(deps.durableQueue),
		AGENT_LAYER_REAP_INTERVAL_MS,
	);
	reapTimer.unref();
	timer.unref();
	return () => {
		clearInterval(timer);
		clearInterval(reapTimer);
		unsubscribe?.();
	};
}

/** Start recovery, durable drains, and reapers as one owned runtime resource. */
export async function startRuntime(deps: RuntimeDeps): Promise<RuntimeHandle> {
	assertStartable(deps);
	const eventBus = resolveEventBus(deps);
	const contextAssembly = createContextAssembler(deps.composition.context);
	const provisionerPorts = { ...deps.composition.provisioner, contextAssembly };
	const provisioner = createProvisioner(provisionerPorts);
	type AdmitInput = Parameters<typeof provisioner.admit>[1];
	type RunInput = Parameters<typeof provisioner.run>[1];
	type Admitted = Parameters<typeof provisioner.run>[2];
	const ports: RuntimePorts = {
		...deps.ports,
		sessionProvisioner: deps.ports.sessionProvisioner ?? {
			admitSession: (runtimeDeps, bundle, enforceGuard) =>
				provisioner.admit(
					runtimeDeps as Parameters<typeof provisioner.admit>[0],
					bundle as AdmitInput,
					enforceGuard,
				),
			runSession: (runtimeDeps, bundle, admitted, onStarted) =>
				provisioner.run(
					runtimeDeps as Parameters<typeof provisioner.run>[0],
					bundle as RunInput,
					admitted as Admitted,
					onStarted,
				),
		},
	};
	const ownedDeps = { ...deps, eventBus, ports };
	const disposers: Array<() => void> = [];
	const workerIngress = createWorkerIngress(
		deps.composition.worker.pool,
		deps.composition.worker.adapterFactory,
	);
	try {
		disposers.push(
			eventBus.on("session_handoff_completed", (event) => {
				void ports.sessionRequests
					.findSessionRequest(deps.db, { by: "sessionId", sessionId: event.sessionId })
					.then((request) =>
						request
							? ports.sessionLifecycle.requestAgentTermination(deps.db, {
									requestId: request.id,
									reason: "handoff",
									requestedBy: event.requestedBy,
								})
							: undefined,
					)
					.catch((error: unknown) => {
						throw error;
					});
			}),
		);
		disposers.push(await bootAgentLayer(ownedDeps));
		disposers.push(
			createWritebackProcessor().subscribe({ ...deps.composition.writeback, eventBus }),
		);
		const reapers = createRuntimeReapers(deps.db, eventBus, provisionerPorts);
		if (deps.composition.reapers?.routines) {
			await reapers.reapRoutineSessions(deps.composition.reapers.routines);
		}
		if (deps.composition.reapers?.sandboxes) {
			disposers.push(reapers.startSandboxes(deps.composition.reapers.sandboxes));
		}
	} catch (error) {
		disposeAll(disposers);
		throw error;
	}
	let disposed = false;
	return {
		registerWorkerWebSocket(...args) {
			if (disposed) throw new Error("Runtime is disposed");
			const unregister = workerIngress.register(...args);
			disposers.push(unregister);
			return unregister;
		},
		async dispose() {
			if (disposed) return;
			disposed = true;
			const firstError = disposeAll(disposers);
			let shutdownError: unknown;
			try {
				await markRunningAgentSessionRequestsForShutdown(deps.db, ports);
			} catch (error) {
				shutdownError = error;
			}
			if (firstError) throw firstError;
			if (shutdownError) throw shutdownError;
		},
	};
}
