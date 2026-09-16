import { type HyperIdleDb, sessions } from "@hyperidle/db";
import type { ModelTier } from "@hyperidle/domain-model";
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
		// @lore: the hold, mechanically: a held agent's pending rows
		// are never even candidates for this claim. Built fresh on every
		// iteration (not once per `drainAgentSessionRequests` call) so a
		// filesystem fixed mid-drain is picked up within the same pass, and a
		// filesystem that JUST broke stops being claimed from the very next
		// iteration on. Nothing here releases a hold — leaving `needs_attention`
		// (Check passing, the injection removed, the filesystem deleted) is what
		// shrinks this list; the exclusion just reads it fresh each time (§4.3).
		const excludeAgentIds = (await deps.runtime.injectedFilesystems?.listHeldAgentIds?.()) ?? [];
		const request = await deps.ports.sessionRequests.claimSessionRequest(
			deps.db,
			{ next: true },
			{
				workerId: "agent-layer",
				now: new Date(),
				leaseMs: 30_000,
				...(excludeAgentIds.length > 0 ? { excludeAgentIds } : {}),
			},
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
			// The assistant falls through the SAME drain path as every other
			// kind — `requiredReturnActions` and the calling-thread bake make
			// its session-scoped output generic like any other agent's.
			let tier: ModelTier = "workhorse";
			if (explicitStartId) {
				const start = await deps.ports.sessionRequests.findSessionRequest(deps.db, {
					by: "explicitStart",
					startId: explicitStartId,
				});
				tier = (start?.requestedModelTier as ModelTier | null) ?? tier;
			}
			// AU27 Increment 6 (Decision 4, C11): the target agent's per-agent
			// model override applies uniformly for all six kinds, not just the
			// @lore A model was resolved here, through the model gateway, so the
			// built-in adapter could make its own provider API call. It came with a
			// live read of `agent_run_config` for the per-agent override, and a
			// tolerance for MissingCredentialError so a subscription-CLI harness
			// would not be killed before adapter selection by a key it never uses.
			//
			// No harness makes that call now. Each authenticates itself and runs the
			// model the agent named, which reaches it as `SessionConfig.selectedModel`
			// — read where the session is admitted, not here. The resolution, the
			// read, the error tolerance and the gateway behind them are all gone.

			const result = await runSession(deps, {
				mode: "durable",
				request,
				sandboxBasePath: deps.sandboxBasePath ?? "/tmp/hyperidle-workspaces",
				modelTier: tier,
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
			consumed += 1;
		} catch (error) {
			const failure = classifyAdmissionFailure(error);
			// @lore AU9 R1: executeAgentRunRequest (via runClaimedRequest) already
			// terminalizes the request itself before rethrowing — for
			// ConcurrencyLimitError (AU21 Increment 14a: CostCapExceededError no
			// longer exists — cost is hard-deleted) it releases the claim back
			// to pending (retryable), for every other error it terminalizes to
			// failed through the single terminal writer. Calling
			// transitionAgentRunLifecycle again here would either double-terminalize
			// (CAS finds zero rows — a thrown "Unknown agent request", the exact
			// silent-no-op-turned-crash class R1 exists to kill) or incorrectly
			// terminalize a legitimately-retryable released claim. This catch's only
			// remaining job is the family-specific explicit-session-start projection.
			// A pre-admission throw for an `assistant_turn` request behaves exactly
			// like every other kind's: the claim sits released/claimed until its
			// lease expires and is re-claimed, not terminalized here — a known,
			// pre-existing gap for every kind, not special-cased for the assistant.
			// @lore BA5 §4.2/§13 (L5): `FILESYSTEM_UNAVAILABLE` skips this
			// projection too — the request is not terminal, it is held and released
			// back to `pending` by `runtime.ts`'s own catch branch, the same as
			// `CONCURRENCY_LIMIT` already does below.
			if (explicitStartId && failure.code !== "FILESYSTEM_UNAVAILABLE") {
				await deps.ports.sessionRequests.transitionSessionRequest(deps.db, {
					target: "explicitStart",
					to: "failed",
					startId: explicitStartId,
					failureCode: failure.code,
				});
			}
			// @lore ship-blocker fix: a `ConcurrencyLimitError` release puts the
			// request back to `pending` with NO delay — `claimSessionRequest`'s
			// `{next:true}` candidate query has no "not before" gate, so it is
			// reclaimable in the SAME instant it was released. When the blocking
			// slot never frees on its own (e.g. a permanently-`active` session
			// with no live runtime behind it — the demo world seeds exactly one),
			// looping straight back to `claimSessionRequest` turned this `for (;;)`
			// into an unbounded synchronous claim→fail→release cycle: 100%+ CPU,
			// no macrotask boundary for the event loop to hand back to (not even
			// health checks got served), verified against the packaged desktop
			// app. `wake()` (this function's caller) already reruns every 1s via
			// `setInterval` — returning here instead of looping defers the retry
			// to that natural cadence instead of busy-spinning within one call.
			// Every OTHER failure kind still terminalizes the request to `failed`
			// (see the lore above), so it will not be reclaimed again at all —
			// only `CONCURRENCY_LIMIT` needs this.
			// @lore: the same fail-safe `return` as
			// `CONCURRENCY_LIMIT` (see the lore just above) — never a busy retry
			// within this call. The next wake (≤1s) reads the exclusion list fresh,
			// so the held agent's request is simply skipped from then on.
			if (failure.code === "CONCURRENCY_LIMIT" || failure.code === "FILESYSTEM_UNAVAILABLE")
				return consumed;
		}
	}
}

// @lore AU21 Increment 14a: "COST_CAP_EXCEEDED" is HARD-DELETED — the
// cost-cap gate that used to throw CostCapExceededError no longer exists,
// no replacement admission-failure code.
type AgentAdmissionFailureCode =
	| "CONCURRENCY_LIMIT"
	| "MISSING_CREDENTIAL"
	| "NO_ELIGIBLE_HARNESS"
	// @lore: a placement failure that already ran the full hold
	// (unmount, release, mark needs_attention) in `provisioner.ts`.
	| "FILESYSTEM_UNAVAILABLE"
	| "INTERNAL_ERROR";

/** Stable public projection; private runtime messages never cross the API boundary. */
function classifyAdmissionFailure(error: unknown): {
	readonly code: AgentAdmissionFailureCode;
	readonly status: 422 | 429 | 500 | 503;
} {
	const name = error instanceof Error ? error.name : "Error";
	switch (name) {
		case "ConcurrencyLimitError":
			return { code: "CONCURRENCY_LIMIT", status: 429 };
		case "MissingCredentialError":
			return { code: "MISSING_CREDENTIAL", status: 500 };
		case "NoEligibleHarnessError":
			return { code: "NO_ELIGIBLE_HARNESS", status: 422 };
		// @lore: the full hold already ran (unmount, release, mark
		// needs_attention) before this was thrown — see `errors.ts`'s
		// `FilesystemUnavailableError`.
		case "FilesystemUnavailableError":
			return { code: "FILESYSTEM_UNAVAILABLE", status: 503 };
		default:
			return { code: "INTERNAL_ERROR", status: 500 };
	}
}

/**
 * @lore AU9 Shutdown callers: the process disposer stores `shutdown` on
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
 * HTTP 202: shutdown/user causes), then reap eligible terminal rows.
 * Only after that sweep does the intent/request drain start, scheduled every 1s,
 * with the reaper additionally scheduled every 6h.
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
	// @lore The service lane reuses a fixture DB after RuntimeHandle.dispose().
	// Stop timer/event triggers synchronously, then let the already-async dispose
	// path join the observed wake before that DB can be checked in and truncated.
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
	// EventBus is a latency hint only; the 1-second polling interval is the
	// authoritative drain path and covers process-death recovery.
	// @lore BA9d: "*" replaced with the specific event. Coverage:
	//   - agent_work_intent_recorded is emitted by routine-scheduler.ts only.
	//     Work intents enqueued via threads, bets, and session-start reactions
	//     (buildSeamBackedWorkIntentRecorder → intents.submit HTTP seam →
	//     enqueueWorkIntent) do NOT emit this event — the intake route has no
	//     EventBus access. Those paths rely on the 1-second poll (≤1s latency).
	//   - Routine-fired work gets a sub-second wake; all other paths get ≤1s.
	//   The old "*" subscription fired on every domain event (messages, reviews,
	//   knowledge, etc.) and caused redundant wakes with no latency benefit since
	//   those events are not correlated with new work intents.
	const unsubscribe = deps.eventBus?.on("agent_work_intent_recorded", () => void wake());
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
		unsubscribe?.();
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
		const agentLayer = await bootAgentLayer(ownedDeps);
		disposers.push(agentLayer.stop);
		joinAgentLayer = agentLayer.join;
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
