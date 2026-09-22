/**
 * The session/harness streaming gateway: forwards `session_started`/
 * `session_ended`/`tool_call_recorded` off the EventBus as a `session:<id>`
 * NUDGE on the injected `wsPush` — never the raw event.
 *
 * @lore this Layer's live-run stream used to be served on its own second
 * websocket (`SessionStreamHub`, deleted), which teed the raw event JSON
 * straight onto the wire. The browser now holds ONE socket, owned by
 * core-api; this gateway pushes the same content-free envelope
 * `document-actions.ts`'s `pushChanges` already uses —
 * `{type:"update", topic, kind:"session.activity", data:{sessionId}}` — so
 * this Layer never hands core-api anything but a topic string and a JSON
 * value it does not interpret. `kind` here is a websocket word only; it is
 * never added to `EVENT_TYPES` (that vocabulary is the nine object events).
 *
 * @lore AU26 B1a: relocated from `layers/core-api/src/services/__tests__/`
 * with the gateway itself, and reclassified from `.integration.test.ts` to a
 * unit test — it touches no DB and no app, only the EventBus, so it never met
 * the integration bar.
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

	test("session_started and session_ended each produce the same nudge shape on the same topic", async ({
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

		expect(calls).toHaveLength(2);
		for (const call of calls) {
			expect(call.topic).toBe("session:sess-gw-2");
			expect(call.envelope).toEqual({
				type: "update",
				topic: "session:sess-gw-2",
				kind: "session.activity",
				data: { sessionId: "sess-gw-2" },
			});
		}
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
