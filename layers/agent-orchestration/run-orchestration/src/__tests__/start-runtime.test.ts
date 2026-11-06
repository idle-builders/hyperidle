import type { AgentSessionRequest, HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeDeps, RuntimePorts } from "../contracts.js";
import { ConcurrencyLimitError } from "../errors.js";

const state = vi.hoisted(() => ({
	failWritebackStart: false,
	writebackDispose: vi.fn(),
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
		subscribe: vi.fn(() => {
			if (state.failWritebackStart) throw new Error("writeback failed");
			return state.writebackDispose;
		}),
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
			claimSessionRequest: vi.fn(async () => null),
		},
		sessionLifecycle: {
			recoverRequestedTerminations: vi.fn(async () => 0),
		},
	} as unknown as RuntimePorts;
	return {
		db: {} as HyperIdleDb,
		eventBus: new EventBus(),
		ports,
		composition: {
			context: {} as RuntimeDeps["composition"]["context"],
			provisioner: {} as NonNullable<RuntimeDeps["composition"]["provisioner"]>,
			writeback: {} as NonNullable<RuntimeDeps["composition"]["writeback"]>,
		},
	};
}

describe("startRuntime resource ownership", () => {
	afterEach(() => {
		state.failWritebackStart = false;
		state.runSessionThrows = null;
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	it("disposes every resource exactly once", async () => {
		vi.useFakeTimers();
		const runtime = await startRuntime(deps());
		await runtime.dispose();
		await runtime.dispose();

		expect(state.writebackDispose).toHaveBeenCalledOnce();
	});

	it("stops new claim drains and waits for an active drain before disposal completes", async () => {
		vi.useFakeTimers();
		const runtimeDeps: RuntimeDeps = {
			...deps(),
			runtime: {} as NonNullable<RuntimeDeps["runtime"]>,
		};
		const entered = deferred();
		const release = deferred();
		const disposalReachedShutdown = deferred();
		let claimCalls = 0;
		let listCalls = 0;
		if (!runtimeDeps.ports) throw new Error("test runtime ports missing");
		runtimeDeps.ports.sessionRequests.listSessionRequests = vi.fn(async () => {
			listCalls += 1;
			if (listCalls > 1) disposalReachedShutdown.resolve();
			return [];
		});
		runtimeDeps.ports.sessionRequests.claimSessionRequest = vi.fn(async () => {
			claimCalls += 1;
			if (claimCalls > 1) {
				entered.resolve();
				await release.promise;
			}
			return null;
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
		expect(claimCalls).toBe(2);
	});

	it("stops every live agent on disposal instead of waiting for it to finish", async () => {
		vi.useFakeTimers();
		const runtimeDeps = deps();
		if (!runtimeDeps.ports) throw new Error("test runtime ports missing");
		const runtime = await startRuntime(runtimeDeps);
		runtimeDeps.ports.sessionRequests.listSessionRequests = vi.fn(async () => [
			{ id: "request-1", sessionId: "session-1" } as AgentSessionRequest,
		]);
		const abortSessionRun = vi.fn(async () => true);
		runtimeDeps.ports.sessionRequests.abortSessionRun = abortSessionRun;
		runtimeDeps.ports.sessionLifecycle.requestAgentTermination = vi.fn(
			async () => "accepted" as const,
		);

		await runtime.dispose();

		expect(abortSessionRun).toHaveBeenCalledWith("session-1", "stop");
	});

	it("stops the claim loop when a later startup stage fails", async () => {
		vi.useFakeTimers();
		state.failWritebackStart = true;
		const runtimeDeps: RuntimeDeps = {
			...deps(),
			runtime: {} as NonNullable<RuntimeDeps["runtime"]>,
		};
		let claimCalls = 0;
		if (!runtimeDeps.ports) throw new Error("test runtime ports missing");
		runtimeDeps.ports.sessionRequests.claimSessionRequest = vi.fn(async () => {
			claimCalls += 1;
			return null;
		});
		await expect(startRuntime(runtimeDeps)).rejects.toThrow("writeback failed");
		const callsAtFailure = claimCalls;
		await vi.advanceTimersByTimeAsync(5_000);
		expect(claimCalls).toBe(callsAtFailure);
	});

	it("continues disposal after a disposer throws and retains the first error", async () => {
		vi.useFakeTimers();
		const runtime = await startRuntime(deps());
		state.writebackDispose.mockImplementationOnce(() => {
			throw new Error("writeback dispose failed");
		});

		await expect(runtime.dispose()).rejects.toThrow("writeback dispose failed");
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
