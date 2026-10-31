/**
 * The session/harness streaming gateway: forwards `session_started`/
 * `session_ended`/`tool_call_recorded` off the EventBus as a `session:<id>`
 * NUDGE on the injected `wsPush` — never the raw event.
 *
 *
 */

import { describe, expect, test } from "../../__testing__/test-fixtures.js";
import { registerSessionActivityGateway } from "../session-activity-gateway.js";

interface RecordedPush {
	readonly topic: string;
	readonly envelope: unknown;
}

function createRecordingPush(): {
	push(topic: string, envelope: unknown): void;
	calls: RecordedPush[];
} {
	const calls: RecordedPush[] = [];
	return {
		calls,
		push(topic: string, envelope: unknown): void {
			calls.push({ topic, envelope });
		},
	};
}

describe("registerSessionActivityGateway — session/harness streaming gateway", () => {
	test("tool_call_recorded produces one session:<id> nudge on the injected wsPush", async ({
		eventBus,
	}) => {
		const { push, calls } = createRecordingPush();
		registerSessionActivityGateway(eventBus, push);

		eventBus.emit({
			type: "tool_call_recorded",
			streamId: "sess-gw-1",
			sessionId: "sess-gw-1",
			toolName: "bash",
			argsSummary: 'cmd="ls"',
			timestamp: Date.now(),
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.topic).toBe("session:sess-gw-1");
		expect(calls[0]?.envelope).toEqual({
			type: "update",
			topic: "session:sess-gw-1",
			kind: "session.activity",
			data: { sessionId: "sess-gw-1" },
		});
	});

	test("session_started and session_ended nudge the session, and the task it works on, so a page showing the task sees it start and stop", async ({
		eventBus,
	}) => {
		const { push, calls } = createRecordingPush();
		registerSessionActivityGateway(eventBus, push);

		eventBus.emit({
			type: "session_started",
			streamId: "sess-gw-2",
			sessionId: "sess-gw-2",
			agentId: "agent-gw-2",
			taskId: "task-gw-2",
			timestamp: Date.now(),
		});
		eventBus.emit({
			type: "session_ended",
			streamId: "sess-gw-2",
			sessionId: "sess-gw-2",
			agentId: "agent-gw-2",
			taskId: "task-gw-2",
			outcome: "completed",
			timestamp: Date.now(),
		});
		eventBus.emit({
			type: "session_started",
			streamId: "sess-gw-4",
			sessionId: "sess-gw-4",
			agentId: "agent-gw-2",
			taskId: null,
			timestamp: Date.now(),
		});

		expect(calls.map((c) => c.topic)).toEqual([
			"session:sess-gw-2",
			"task:task-gw-2",
			"session:sess-gw-2",
			"task:task-gw-2",
			"session:sess-gw-4",
		]);
		expect(calls[1]?.envelope).toEqual({
			type: "update",
			topic: "task:task-gw-2",
			kind: "session.activity",
			data: { sessionId: "sess-gw-2" },
		});
	});

	test("session_request_queued for a thread stream nudges thread:<id>", async ({ eventBus }) => {
		const { push, calls } = createRecordingPush();
		registerSessionActivityGateway(eventBus, push);

		eventBus.emit({
			type: "session_request_queued",
			streamId: "thread:thr-nudge-1",
			timestamp: Date.now(),
		});

		expect(calls.map((c) => c.topic)).toEqual(["thread:thr-nudge-1"]);
	});

	test("session_request_queued for a non-thread stream produces no nudge", async ({ eventBus }) => {
		const { push, calls } = createRecordingPush();
		registerSessionActivityGateway(eventBus, push);

		eventBus.emit({
			type: "session_request_queued",
			streamId: "task:task-nudge-1",
			timestamp: Date.now(),
		});

		expect(calls).toHaveLength(0);
	});

	test("the returned unregister function stops forwarding", async ({ eventBus }) => {
		const { push, calls } = createRecordingPush();
		const unregister = registerSessionActivityGateway(eventBus, push);
		unregister();

		eventBus.emit({
			type: "tool_call_recorded",
			streamId: "sess-gw-3",
			sessionId: "sess-gw-3",
			toolName: "read_file",
			argsSummary: "",
			timestamp: Date.now(),
		});

		expect(calls).toHaveLength(0);
	});
});
