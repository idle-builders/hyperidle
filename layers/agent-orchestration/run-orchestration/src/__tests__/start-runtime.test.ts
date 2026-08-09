import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeDeps, RuntimeHandle, RuntimePorts } from "../contracts.js";

const state = vi.hoisted(() => ({
	failRoutineReaper: false,
	writebackDispose: vi.fn(),
	sandboxDispose: vi.fn(),
	workerDispose: vi.fn(),
	registerWorker: vi.fn(),
}));

vi.mock("../context.js", () => ({ createContextAssembler: vi.fn(() => ({})) }));
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
		reapRoutineSessions: vi.fn(async () => {
			if (state.failRoutineReaper) throw new Error("reaper failed");
			return 0;
		}),
		startSandboxes: vi.fn(() => state.sandboxDispose),
	})),
}));
vi.mock("../worker-ingress.js", () => ({
	createWorkerIngress: vi.fn(() => ({
		register: state.registerWorker.mockImplementation(() => state.workerDispose),
	})),
}));

import { startRuntime } from "../start-runtime.js";

function deps(): RuntimeDeps {
	const ports = {
		sessionRequests: {
			listSessionRequests: vi.fn(async () => []),
			reapExpired: vi.fn(async () => ({
				inbox: 0,
				intents: 0,
				explicitStarts: 0,
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
				routines: {} as NonNullable<NonNullable<RuntimeDeps["composition"]["reapers"]>["routines"]>,
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
		state.failRoutineReaper = false;
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

	it("rolls back resources when a later startup stage fails", async () => {
		vi.useFakeTimers();
		state.failRoutineReaper = true;
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
		state.failRoutineReaper = true;
		state.writebackDispose.mockImplementationOnce(() => {
			throw new Error("rollback dispose failed");
		});

		await expect(startRuntime(deps())).rejects.toThrow("reaper failed");
		expect(state.writebackDispose).toHaveBeenCalledOnce();
	});
});
