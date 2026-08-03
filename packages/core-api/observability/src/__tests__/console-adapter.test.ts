/**
 * H3 AC1 — Console observability adapter emits structured JSON logs.
 */

import type { Logger, ObservabilityEvent } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import { createConsoleObservabilityAdapter } from "../console-adapter.js";

interface LogCall {
	level: "debug" | "info" | "warn" | "error";
	msg: string;
	extra: Record<string, unknown> | undefined;
}

function capturingLogger(): { logger: Logger; calls: LogCall[] } {
	const calls: LogCall[] = [];
	const logger: Logger = {
		debug: (msg, extra) => calls.push({ level: "debug", msg, extra }),
		info: (msg, extra) => calls.push({ level: "info", msg, extra }),
		warn: (msg, extra) => calls.push({ level: "warn", msg, extra }),
		error: (msg, extra) => calls.push({ level: "error", msg, extra }),
	};
	return { logger, calls };
}

describe("ConsoleObservabilityAdapter (H3 AC1)", () => {
	it("exposes name=console", () => {
		const { logger } = capturingLogger();
		const adapter = createConsoleObservabilityAdapter(logger);
		expect(adapter.name).toBe("console");
	});

	it("emits one info log per event with kind as msg", async () => {
		const { logger, calls } = capturingLogger();
		const adapter = createConsoleObservabilityAdapter(logger);
		const events: ObservabilityEvent[] = [
			{
				kind: "session_started",
				traceId: "t1",
				sessionId: "s1",
				ts: "2026-04-18T00:00:00.000Z",
				agentId: "a1",
				taskId: "task1",
			},
			{
				kind: "tool_call",
				traceId: "t1",
				sessionId: "s1",
				ts: "2026-04-18T00:00:01.000Z",
				toolName: "Read",
				argsSummary: "{file: /tmp/x}",
			},
		];
		await adapter.record(events);
		expect(calls).toHaveLength(2);
		expect(calls[0]!.level).toBe("info");
		expect(calls[0]!.msg).toBe("session_started");
		expect(calls[0]!.extra?.traceId).toBe("t1");
		expect(calls[0]!.extra?.agentId).toBe("a1");
		expect(calls[1]!.msg).toBe("tool_call");
		expect(calls[1]!.extra?.toolName).toBe("Read");
	});

	it("flush is a no-op and resolves", async () => {
		const { logger } = capturingLogger();
		const adapter = createConsoleObservabilityAdapter(logger);
		await expect(adapter.flush()).resolves.toBeUndefined();
	});

	it("serialises all six event kinds without losing discriminant data", async () => {
		const { logger, calls } = capturingLogger();
		const adapter = createConsoleObservabilityAdapter(logger);
		const ts = "2026-04-18T00:00:00.000Z";
		const events: ObservabilityEvent[] = [
			{ kind: "session_started", traceId: "t", sessionId: "s", ts, agentId: "a", taskId: "tk" },
			{
				kind: "session_ended",
				traceId: "t",
				sessionId: "s",
				ts,
				agentId: "a",
				taskId: "tk",
				outcome: "completed",
			},
			{ kind: "tool_call", traceId: "t", sessionId: "s", ts, toolName: "Read", argsSummary: "{}" },
			{
				kind: "task_state_changed",
				traceId: "task:1",
				sessionId: null,
				ts,
				taskId: "1",
				fromState: "proposed",
				toState: "accepted",
			},
			{
				kind: "bet_state_changed",
				traceId: "bet:1",
				sessionId: null,
				ts,
				betId: "1",
				fromState: "active",
				toState: "shipped",
			},
			{
				kind: "knowledge_write",
				traceId: "knowledge:1",
				sessionId: null,
				ts,
				itemId: "1",
				action: "created",
			},
		];
		await adapter.record(events);
		expect(calls).toHaveLength(6);
		expect(calls.map((c) => c.msg)).toEqual([
			"session_started",
			"session_ended",
			"tool_call",
			"task_state_changed",
			"bet_state_changed",
			"knowledge_write",
		]);
	});
});
