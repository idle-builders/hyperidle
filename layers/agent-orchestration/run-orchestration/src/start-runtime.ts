import { type HyperIdleDb, sessions } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
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

function resolveEventBus(deps: RuntimeDeps): EventBus {
	return deps.eventBus ?? new EventBus();
}

/** 6h cadence for the terminal-intent/task-attempt reaper. */
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
	const atLimit = new Set<string>();
	for (;;) {
		const request = await deps.ports.sessionRequests.claimSessionRequest(
			deps.db,
			{ next: true, skipAgentIds: [...atLimit] },
			{ workerId: "agent-layer", now: new Date(), leaseMs: 30_000 },
		);
		if (!request) return consumed;
		try {
			await runSession(deps, {
				mode: "durable",
				request,
				sandboxBasePath: deps.sandboxBasePath ?? "/tmp/hyperidle-workspaces",
				modelTier: "workhorse",
				completion: "admit",
			});
			consumed += 1;
		} catch (error) {
			const failure = classifyAdmissionFailure(error);
			// @lore: catch block — runClaimedRequest terminalizes before rethrowing; ConcurrencyLimitError → pending, others → failed; retrying would double-terminalize
			// @lore: ConcurrencyLimitError — skip that agent for this pass so it never blocks others; reclaiming it here busy-spins at 100% CPU; next wake() retries
			if (failure.code === "CONCURRENCY_LIMIT") atLimit.add(request.agentId);
		}
	}
}

type AgentAdmissionFailureCode =
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
 * @lore: boot wiring — awaited first sweep before readiness: recover running-request custody, stored termination causes, reap terminal rows; drain starts after
 */
interface AgentLayerHandle {
	readonly stop: () => void;
	readonly join: () => Promise<void>;
}

async function bootAgentLayer(deps: RuntimeDeps): Promise<AgentLayerHandle> {
	assertStartable(deps);
	const runtime = deps.runtime;
	const eventBus = resolveEventBus(deps);
	await recoverRunningRequests(deps.db, eventBus, deps.ports);
	await deps.ports.sessionLifecycle.recoverRequestedTerminations(deps.db, eventBus);
	await deps.ports.sessionRequests.reapExpired(deps.db);
	// @lore: dispose — service lane reuses fixture DB after dispose(); stop triggers synchronously first, then join the async wake path before DB is truncated
	let stopping = false;
	let active: Promise<void> | null = null;
	const failures: unknown[] = [];
	let joinPromise: Promise<void> | null = null;
	const wake = (): Promise<void> => {
		if (stopping) return Promise.resolve();
		if (active) return active;
		const observed = (async () => {
			await deps.ports.sessionRequests.drainIntents(deps.durableQueue);
			if (runtime) await drainAgentSessionRequests(deps);
		})();
		active = observed;
		void observed.then(
			() => {
				if (active === observed) active = null;
			},
			(error: unknown) => {
				failures.push(error);
				if (active === observed) active = null;
			},
		);
		return observed;
	};
	await wake();
	// The 1-second polling interval is the sole drain trigger and covers
	// process-death recovery. Work intents enqueued via threads, bets, and
	// session-start reactions (buildSeamBackedWorkIntentRecorder →
	// intents.submit HTTP seam → enqueueWorkIntent) rely on this poll
	// (≤1s latency) — the intake route has no EventBus access.
	const timer = setInterval(() => void wake(), 1_000);
	const reapTimer = setInterval(
		() => void deps.ports.sessionRequests.reapExpired(deps.db),
		AGENT_LAYER_REAP_INTERVAL_MS,
	);
	reapTimer.unref();
	timer.unref();
	const stop = (): void => {
		if (stopping) return;
		stopping = true;
		clearInterval(timer);
		clearInterval(reapTimer);
	};
	const join = (): Promise<void> => {
		stop();
		if (!joinPromise) {
			joinPromise = (async () => {
				if (active) await active.catch(() => undefined);
				const retained = failures.splice(0);
				if (retained.length === 1) throw retained[0];
				if (retained.length > 1) {
					throw new AggregateError(retained, "Agent runtime drains failed");
				}
			})();
		}
		return joinPromise;
	};
	return { stop, join };
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
			admitSession: (runtimeDeps, bundle) =>
				provisioner.admit(
					runtimeDeps as Parameters<typeof provisioner.admit>[0],
					bundle as AdmitInput,
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
	let joinAgentLayer: (() => Promise<void>) | undefined;
	const workerIngress = createWorkerIngress(
		deps.composition.worker.pool,
		deps.composition.worker.adapterFactory,
	);
	try {
		const agentLayer = await bootAgentLayer(ownedDeps);
		disposers.push(agentLayer.stop);
		joinAgentLayer = agentLayer.join;
		disposers.push(
			createWritebackProcessor().subscribe({ ...deps.composition.writeback, eventBus }),
		);
		const reapers = createRuntimeReapers(deps.db);
		if (deps.composition.reapers?.sandboxes) {
			disposers.push(reapers.startSandboxes(deps.composition.reapers.sandboxes));
		}
	} catch (error) {
		disposeAll(disposers);
		await joinAgentLayer?.().catch(() => undefined);
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
			let drainError: unknown;
			try {
				await markRunningAgentSessionRequestsForShutdown(deps.db, ports);
			} catch (error) {
				shutdownError = error;
			}
			try {
				await joinAgentLayer?.();
			} catch (error) {
				drainError = error;
			}
			if (firstError) throw firstError;
			if (shutdownError) throw shutdownError;
			if (drainError) throw drainError;
		},
	};
}
