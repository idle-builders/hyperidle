import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { AdapterPool } from "../adapter-pool.js";

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
	it("atomically replaces a registered adapter while preserving its load", () => {
		const pool = new AdapterPool();
		const meta = {
			name: "local",
			modelProviders: ["anthropic"],
			maxConcurrent: 1,
		};
		pool.register("local-1", adapter("old"), meta);
		expect(pool.select()?.adapter).toBeDefined();

		const replacement = adapter("replacement");
		pool.register("local-1", replacement, meta);

		expect(pool.size).toBe(1);
		// currentLoad=1 carried over means select() returns null at maxConcurrent 1
		expect(pool.select()).toBeNull();
		pool.release("local-1");
		expect(pool.select()?.adapter).toBe(replacement);
	});

	it("keeps registration presence and session-slot custody coherent across release", () => {
		const pool = new AdapterPool();
		pool.register("local-1", adapter("local"), {
			name: "local",
			modelProviders: ["anthropic"],
			maxConcurrent: 1,
		});
		expect(pool.has("local-1")).toBe(true);
		expect(pool.select()?.id).toBe("local-1");
		expect(pool.select()).toBeNull();
		pool.release("local-1");
		expect(pool.select()?.id).toBe("local-1");
	});
});
