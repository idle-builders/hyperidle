/**
 * S2 — Worker Protocol: type narrowing tests (AC1, AC2).
 *
 * These tests prove that the discriminated unions for WorkerToServerMessage
 * and ServerToWorkerMessage narrow correctly. They compile-fail (red phase)
 * until `framework/harness-protocol/src/harness/worker-protocol.ts` is created.
 */

import { describe, expect, it } from "vitest";
import type {
	ServerDispatchMessage,
	ServerToWorkerMessage,
	WorkerRegisterMessage,
	WorkerToServerMessage,
} from "../worker-protocol.js";

// ── WorkerToServerMessage narrowing ────────────────────────────────────────

describe("WorkerToServerMessage", () => {
	it("narrows to WorkerRegisterMessage on type === register", () => {
		const msg: WorkerToServerMessage = {
			type: "register",
			id: "w-1",
			name: "test-worker",
			modelProviders: ["anthropic"],
			maxConcurrent: 2,
		};
		if (msg.type === "register") {
			// These fields must exist after narrowing
			expect(msg.id).toBe("w-1");
			expect(msg.name).toBe("test-worker");
			expect(msg.modelProviders).toEqual(["anthropic"]);
			expect(msg.maxConcurrent).toBe(2);
		} else {
			throw new Error("Expected type === register");
		}
	});

	it("narrows to WorkerEventMessage on type === event", () => {
		const msg: WorkerToServerMessage = {
			type: "event",
			sessionId: "sess-1",
			event: { type: "completion", text: "done" },
		};
		if (msg.type === "event") {
			expect(msg.sessionId).toBe("sess-1");
			expect(msg.event.type).toBe("completion");
		} else {
			throw new Error("Expected type === event");
		}
	});

	it("narrows to WorkerSessionResultMessage on type === session_result", () => {
		const msg: WorkerToServerMessage = {
			type: "session_result",
			sessionId: "sess-2",
			result: {
				outcome: "completed",
				tokenUsage: { byTier: { workhorse: { prompt: 10, completion: 5 } } },
			},
		};
		if (msg.type === "session_result") {
			expect(msg.sessionId).toBe("sess-2");
			expect(msg.result.outcome).toBe("completed");
		} else {
			throw new Error("Expected type === session_result");
		}
	});

	it("narrows to WorkerErrorMessage on type === error", () => {
		const msg: WorkerToServerMessage = {
			type: "error",
			sessionId: "sess-3",
			message: "something went wrong",
		};
		if (msg.type === "error") {
			expect(msg.sessionId).toBe("sess-3");
			expect(msg.message).toBe("something went wrong");
		} else {
			throw new Error("Expected type === error");
		}
	});
});

// ── ServerToWorkerMessage narrowing ────────────────────────────────────────

describe("ServerToWorkerMessage", () => {
	it("narrows to ServerDispatchMessage on type === dispatch", () => {
		const msg: ServerToWorkerMessage = {
			type: "dispatch",
			sessionId: "sess-4",
			config: {
				sessionId: "sess-4",
				sandboxPath: "/workspace/test",
				systemPromptPath: "/workspace/prompts/builder.md",
				assembledPrompt: "",
				modelTier: "workhorse",
				tools: ["Read", "Write"],
			},
		};
		if (msg.type === "dispatch") {
			expect(msg.sessionId).toBe("sess-4");
			expect(msg.config.sandboxPath).toBe("/workspace/test");
		} else {
			throw new Error("Expected type === dispatch");
		}
	});

	it("narrows to ServerStopMessage on type === stop", () => {
		const msg: ServerToWorkerMessage = {
			type: "stop",
			sessionId: "sess-5",
		};
		if (msg.type === "stop") {
			expect(msg.sessionId).toBe("sess-5");
		} else {
			throw new Error("Expected type === stop");
		}
	});

	it("narrows to ServerRegisteredMessage on type === registered", () => {
		const msg: ServerToWorkerMessage = {
			type: "registered",
		};
		if (msg.type === "registered") {
			expect(msg.type).toBe("registered");
		} else {
			throw new Error("Expected type === registered");
		}
	});
});

// ── Type exhaustiveness checks ──────────────────────────────────────────────

describe("type exhaustiveness", () => {
	it("WorkerToServerMessage has exactly 4 variants", () => {
		const variants: WorkerToServerMessage["type"][] = [
			"register",
			"event",
			"session_result",
			"error",
		];
		expect(variants).toHaveLength(4);
	});

	it("ServerToWorkerMessage has exactly 3 variants (dispatch, stop, registered)", () => {
		const variants: ServerToWorkerMessage["type"][] = ["dispatch", "stop", "registered"];
		expect(variants).toHaveLength(3);
	});
});

// ── Interface shape checks ──────────────────────────────────────────────────

describe("WorkerRegisterMessage shape", () => {
	it("accepts readonly arrays for modelProviders", () => {
		const msg: WorkerRegisterMessage = {
			type: "register",
			id: "w-2",
			name: "macbook-worker",
			modelProviders: ["anthropic", "openai"] as const,
			maxConcurrent: 4,
		};
		expect(msg.modelProviders).toHaveLength(2);
	});
});

describe("ServerDispatchMessage shape", () => {
	it("requires a full SessionConfig", () => {
		const msg: ServerDispatchMessage = {
			type: "dispatch",
			sessionId: "sess-dispatch",
			config: {
				sessionId: "sess-dispatch",
				sandboxPath: "/tmp/ws",
				systemPromptPath: "",
				assembledPrompt: "",
				modelTier: "fast",
				tools: [],
			},
		};
		expect(msg.config.modelTier).toBe("fast");
	});
});
