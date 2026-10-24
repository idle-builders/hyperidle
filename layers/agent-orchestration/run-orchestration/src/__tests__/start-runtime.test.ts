import type { AgentSessionRequest, HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeDeps, RuntimeHandle, RuntimePorts } from "../contracts.js";
import { ConcurrencyLimitError } from "../errors.js";

const state = vi.hoisted(() => ({
	failSandboxReaperStart: false,
	writebackDispose: vi.fn(),
	sandboxDispose: vi.fn(),
	workerDispose: vi.fn(),
	registerWorker: vi.fn(),
	runSessionThrows: null as (() => Error) | null,
}));

vi.mock("../context.js", () => ({ createContextAssembler: vi.fn(() => ({})) }));
vi.mock("../runtime.js", () => ({
	runSession: vi.fn(async () => {
		if (state.runSessionThrows) throw state.runSessionThrows();
		return { mode: "admitted", sessionId: "session-mock" };
	}),
}));
vi.mock("../provisioner.js", () => ({
	createProvisioner: vi.fn(() => ({ admit: vi.fn(), run: vi.fn() })),
}));
vi.mock("../writeback-processor.js", () => ({
	createWritebackProcessor: vi.fn(() => ({
		subscribe: vi.fn(() => state.writebackDispose),
	})),
}));
vi.mock("../runtime-reapers.js", () => ({
	createRuntimeReapers: vi.fn(() => ({
		startSandboxes: vi.fn(() => {
			if (state.failSandboxReaperStart) throw new Error("reaper failed");
			return state.sandboxDispose;
		}),
	})),
}));
vi.mock("../worker-ingress.js", () => ({
	createWorkerIngress: vi.fn(() => ({
		register: state.registerWorker.mockImplementation(() => state.workerDispose),
	})),
}));

import { startRuntime } from "../start-runtime.js";

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function deps(): RuntimeDeps {
	const ports = {
		sessionRequests: {
			listSessionRequests: vi.fn(async () => []),
			reapExpired: vi.fn(async () => ({
				intents: 0,
			})),
			drainIntents: vi.fn(async () => undefined),
		},
		sessionLifecycle: {
			recoverRequestedTerminations: vi.fn(async () => 0),
		},
	} as unknown as RuntimePorts;
	return {
		db: {} as HyperIdleDb,
		eventBus: new EventBus(),
		ports,
		durableQueue: {} as NonNullable<RuntimeDeps["durableQueue"]>,
		composition: {
			context: {} as RuntimeDeps["composition"]["context"],
			provisioner: {} as NonNullable<RuntimeDeps["composition"]["provisioner"]>,
			writeback: {} as NonNullable<RuntimeDeps["composition"]["writeback"]>,
			worker: {} as NonNullable<RuntimeDeps["composition"]["worker"]>,
			reapers: {
				sandboxes: {} as NonNullable<
					NonNullable<RuntimeDeps["composition"]["reapers"]>["sandboxes"]
				>,
			},
		},
	};
}

const workerArgs = [
	{} as Parameters<RuntimeHandle["registerWorkerWebSocket"]>[0],
	{} as Parameters<RuntimeHandle["registerWorkerWebSocket"]>[1],
] as const;

describe("startRuntime resource ownership", () => {
	afterEach(() => {
		state.failSandboxReaperStart = false;
		state.runSessionThrows = null;
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	it("owns late worker registration and disposes every resource exactly once", async () => {
		vi.useFakeTimers();
		const runtime = await startRuntime(deps());
		runtime.registerWorkerWebSocket(...workerArgs);
		await runtime.dispose();
		await runtime.dispose();

		expect(state.registerWorker).toHaveBeenCalledOnce();
		expect(state.workerDispose).toHaveBeenCalledOnce();
		expect(state.sandboxDispose).toHaveBeenCalledOnce();
		expect(state.writebackDispose).toHaveBeenCalledOnce();
		expect(() => runtime.registerWorkerWebSocket(...workerArgs)).toThrow("Runtime is disposed");
	});

	it("stops new intent wakes and waits for an active wake before disposal completes", async () => {
		vi.useFakeTimers();
		const runtimeDeps = deps();
		const entered = deferred();
		const release = deferred();
		const disposalReachedShutdown = deferred();
		let drainCalls = 0;
		let listCalls = 0;
		if (!runtimeDeps.ports) throw new Error("test runtime ports missing");
		runtimeDeps.ports.sessionRequests.listSessionRequests = vi.fn(async () => {
			listCalls += 1;
			if (listCalls > 1) disposalReachedShutdown.resolve();
			return [];
		});
		runtimeDeps.ports.sessionRequests.drainIntents = vi.fn(async () => {
			drainCalls += 1;
			if (drainCalls > 1) {
				entered.resolve();
				await release.promise;
			}
		});
		const runtime = await startRuntime(runtimeDeps);
		vi.advanceTimersByTime(1_000);
		await entered.promise;

		const disposal = runtime.dispose();
		let disposed = false;
		void disposal.then(() => {
			disposed = true;
		});
		await disposalReachedShutdown.promise;
		await Promise.resolve();
		await Promise.resolve();
		expect(disposed).toBe(false);

		release.resolve();
		await disposal;
		await vi.advanceTimersByTimeAsync(2_000);
		expect(drainCalls).toBe(2);
	});

	it("rolls back resources when a later startup stage fails", async () => {
		vi.useFakeTimers();
		state.failSandboxReaperStart = true;
		await expect(startRuntime(deps())).rejects.toThrow("reaper failed");
		expect(state.writebackDispose).toHaveBeenCalledOnce();
		expect(state.sandboxDispose).not.toHaveBeenCalled();
	});

	it("continues disposal after a disposer throws and retains the first error", async () => {
		vi.useFakeTimers();
		const runtime = await startRuntime(deps());
		runtime.registerWorkerWebSocket(...workerArgs);
		state.workerDispose.mockImplementationOnce(() => {
			throw new Error("worker dispose failed");
		});

		await expect(runtime.dispose()).rejects.toThrow("worker dispose failed");
		expect(state.sandboxDispose).toHaveBeenCalledOnce();
		expect(state.writebackDispose).toHaveBeenCalledOnce();
	});

	it("preserves the startup failure when rollback disposal also throws", async () => {
		vi.useFakeTimers();
		state.failSandboxReaperStart = true;
		state.writebackDispose.mockImplementationOnce(() => {
			throw new Error("rollback dispose failed");
		});

		await expect(startRuntime(deps())).rejects.toThrow("reaper failed");
		expect(state.writebackDispose).toHaveBeenCalledOnce();
	});

	/**
	 * @lore: `MAX_SAFE_CLAIMS` bounds the claim mock so a `for (;;)` reclaim loop on a never-freeing slot fails fast instead of hanging.
	 */
	it("does not busy-loop reclaiming a request released with ConcurrencyLimitError", async () => {
		vi.useFakeTimers();
		const MAX_SAFE_CLAIMS = 25;
		const runtimeDeps: RuntimeDeps = {
			...deps(),
			runtime: {} as NonNullable<RuntimeDeps["runtime"]>,
		};
		state.runSessionThrows = () => new ConcurrencyLimitError("agent-concurrency-test", 1);
		const stuckRequest = {
			id: "request-concurrency-stuck",
			agentId: "agent-concurrency-test",
		} as unknown as AgentSessionRequest;
		let claimCalls = 0;
		if (!runtimeDeps.ports) throw new Error("test runtime ports missing");
		runtimeDeps.ports.sessionRequests.claimSessionRequest = vi.fn(async (_db, selector) => {
			claimCalls += 1;
			if (claimCalls > MAX_SAFE_CLAIMS) {
				throw new Error(
					`drainAgentSessionRequests reclaimed a ConcurrencyLimitError-released request ${claimCalls} times in one drain call — busy-loop regression`,
				);
			}
			const skipped = "next" in selector ? (selector.skipAgentIds ?? []) : [];
			return skipped.includes(stuckRequest.agentId) ? null : stuckRequest;
		});
		runtimeDeps.ports.sessionRequests.findSessionRequest = vi.fn(
			async () => undefined,
		) as unknown as RuntimePorts["sessionRequests"]["findSessionRequest"];

		await startRuntime(runtimeDeps);

		// The boot wake claims the stuck request once, then asks for work from
		// any other agent (none here) and stops — it never reclaims the stuck one.
		expect(claimCalls).toBe(2);

		// The retry belongs to the NEXT natural wake() cadence (1s), not the
		// same drain call — one more attempt per tick, never a burst.
		await vi.advanceTimersByTimeAsync(1_000);
		expect(claimCalls).toBe(4);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(claimCalls).toBe(6);
	});
});
