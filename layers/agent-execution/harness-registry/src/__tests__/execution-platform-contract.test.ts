import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { AdapterPool } from "../adapter-pool.js";
import { RemoteHarnessAdapter } from "../remote-harness-adapter.js";
import type { WorkerRegisterMessage } from "@hyperidle/harness-protocol";

function adapter(label: string): HarnessAdapter {
	return {
		async startSession(): Promise<SessionHandle> {
			return { sessionId: label };
		},
		async *streamEvents(): AsyncGenerator<HarnessEvent> {},
		async stopSession(): Promise<SessionResult> {
			return {
				outcome: "completed",
				tokenUsage: { byTier: {} },
			};
		},
		getCapabilities(): HarnessCapabilities {
			return {
				preCompactionTrigger: false,
				subAgents: false,
				modelProviders: ["anthropic"],
				mcpSupport: false,
				returnEnforcement: "none",
			};
		},
	};
}

describe("execution platform completeness contract", () => {
	it("atomically replaces a registered adapter while preserving load and pause custody", () => {
		const pool = new AdapterPool();
		const meta = {
			name: "worker",
			kind: "remote" as const,
			modelProviders: ["anthropic"],
			maxConcurrent: 1,
		};
		pool.register("worker-1", adapter("old"), meta);
		expect(pool.select()?.adapter).toBeDefined();
		pool.pause("worker-1");

		const replacement = adapter("replacement");
		pool.register("worker-1", replacement, meta);

		expect(pool.size).toBe(1);
		// paused=true and currentLoad=1 together mean select() returns null
		expect(pool.select()).toBeNull();
		pool.release("worker-1");
		pool.resume("worker-1");
		expect(pool.select()?.adapter).toBe(replacement);
	});

	it("keeps registration presence and session-slot custody coherent across release and removal", () => {
		const pool = new AdapterPool();
		pool.register("worker-1", adapter("worker"), {
			name: "worker",
			kind: "remote",
			modelProviders: ["anthropic"],
			maxConcurrent: 1,
		});
		expect(pool.has("worker-1")).toBe(true);
		expect(pool.select()?.id).toBe("worker-1");
		expect(pool.select()).toBeNull();
		pool.release("worker-1");
		expect(pool.select()?.id).toBe("worker-1");
		pool.unregister("worker-1");
		expect(pool.has("worker-1")).toBe(false);
		expect(pool.size).toBe(0);
	});

	it("routes worker messages through the remote factory into the matching session stream", async () => {
		const sent: string[] = [];
		const ws = {
			send: (data: string) => sent.push(data),
			close: () => undefined,
			onmessage: null,
			onclose: null,
			onerror: null,
		};
		const registration: WorkerRegisterMessage = {
			type: "register",
			id: "worker-1",
			name: "Worker",
			modelProviders: ["anthropic"],
			maxConcurrent: 1,
		};
		const remote = new RemoteHarnessAdapter(ws, registration);
		const config: SessionConfig = {
			sessionId: "requested-session",
			sandboxPath: "/tmp/au20-harness-contract",
			assembledPrompt: "work",
			modelTier: "fast",
			tools: [],
		};
		const handle = await remote.startSession(config);
		const dispatched = JSON.parse(sent[0] ?? "{}") as { sessionId: string };
		const collecting = (async () => {
			const events: HarnessEvent[] = [];
			for await (const event of remote.streamEvents(handle)) events.push(event);
			return events;
		})();

		remote.dispatchMessage(
			JSON.stringify({
				type: "event",
				sessionId: dispatched.sessionId,
				event: { type: "completion", text: "done" },
			}),
		);
		remote.dispatchMessage(
			JSON.stringify({
				type: "session_result",
				sessionId: dispatched.sessionId,
				result: {
					outcome: "completed",
					tokenUsage: { byTier: {} },
				},
			}),
		);

		await expect(collecting).resolves.toMatchObject([{ type: "completion", text: "done" }]);
	});
});
