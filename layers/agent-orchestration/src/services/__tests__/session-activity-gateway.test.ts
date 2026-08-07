/**
 * Increment 7, Wave B (Decision E) — RED phase.
 *
 * architecture.md §6 Decision E / §9 Increment 7: session/harness streaming
 * is "owned/served by `agent-execution`... with `agent-orchestration` as the
 * gateway/router when executions are distributed." Today's
 * `RAW_BROADCAST_ROUTES` table (`layers/core-api/realtime/src/ws-connection-hub.ts`,
 * pre-AU21-Decision-L4 shape — deleted entirely by Increment 14d, not just relocated)
 * forwards `session_started`/`session_ended`/`tool_call_recorded` straight
 * off the EventBus onto the `session:<id>` WS topic — that is the (c)
 * session-forwarding concern this wave relocates OUT of `realtime` (a
 * generic, domain-agnostic WS transport) into a core-api Application
 * composition root representing agent-orchestration's own gateway, mirroring
 * `agent-orchestration-port-composition.ts` / `durable-agent-queue.ts`'s
 * existing precedent for where this kind of wiring lives.
 *
 * CONFUSION (flagged for reviewer sign-off): the forward stays EventBus-driven
 * (the SAME `session_started`/`session_ended`/`tool_call_recorded` events that
 * also feed the relocated `SessionActivityBuffer`), not literally re-read
 * through the buffer's stored entries — the buffer's job is serving a
 * point-in-time REST snapshot for a late-joining client
 * (`AgentOrchestrationPort.sessions.getRecentActivity`), while the WS forward
 * is a live tee of the same underlying events. Piping the live forward
 * through `buffer.getActivity()` would add indirection (a per-event full
 * buffer re-read) for no behavioral gain and would couple two independently
 * useful reads. "Sourced from the relocated buffer via the gateway" is
 * satisfied at the level of "the same event stream that populates the
 * buffer also feeds the gateway," not literal data-plane reuse.
 *
 * @lore AU26 B1a: relocated from `layers/core-api/src/services/__tests__/`
 * with the gateway itself, and reclassified from `.integration.test.ts` to a
 * unit test — it touches no DB and no app, only the EventBus, so it never met
 * the integration bar. Its `db` fixture was unused (`_db`) at every call site.
 */

import { describe, expect, test } from "../../__testing__/test-fixtures.js";
import { registerSessionActivityGateway } from "../session-activity-gateway.js";

interface RecordedBroadcast {
	readonly topic: string;
	readonly data: string;
}

function createRecordingBroadcastTarget(): {
	broadcast(topic: string, data: string): void;
	calls: RecordedBroadcast[];
} {
	const calls: RecordedBroadcast[] = [];
	return {
		calls,
		broadcast(topic: string, data: string): void {
			calls.push({ topic, data });
		},
	};
}

describe("registerSessionActivityGateway — session/harness streaming gateway", () => {
	test("forwards tool_call_recorded to the session:<id> topic on the broadcast target", async ({
		eventBus,
	}) => {
		const target = createRecordingBroadcastTarget();
		registerSessionActivityGateway(eventBus, target);

		eventBus.emit({
			type: "tool_call_recorded",
			streamId: "sess-gw-1",
			sessionId: "sess-gw-1",
			toolName: "bash",
			argsSummary: 'cmd="ls"',
			timestamp: Date.now(),
		});

		expect(target.calls).toHaveLength(1);
		expect(target.calls[0]?.topic).toBe("session:sess-gw-1");
		const parsed = JSON.parse(target.calls[0]?.data ?? "{}") as { type: string; sessionId: string };
		expect(parsed.type).toBe("tool_call_recorded");
		expect(parsed.sessionId).toBe("sess-gw-1");
	});

	test("forwards session_started and session_ended to the same session:<id> topic", async ({
		eventBus,
	}) => {
		const target = createRecordingBroadcastTarget();
		registerSessionActivityGateway(eventBus, target);

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

		expect(target.calls).toHaveLength(2);
		expect(target.calls.every((c) => c.topic === "session:sess-gw-2")).toBe(true);
	});

	test("the returned unregister function stops forwarding", async ({ eventBus }) => {
		const target = createRecordingBroadcastTarget();
		const unregister = registerSessionActivityGateway(eventBus, target);
		unregister();

		eventBus.emit({
			type: "tool_call_recorded",
			streamId: "sess-gw-3",
			sessionId: "sess-gw-3",
			toolName: "read_file",
			argsSummary: "",
			timestamp: Date.now(),
		});

		expect(target.calls).toHaveLength(0);
	});
});
