/**
 * Increment 7, Wave B (Decision E) — RED phase.
 *
 * architecture.md §9 Increment 7: "After this wave,
 * `packages/core-api/realtime/` should no longer carry ANY session-forwarding
 * logic — only Wave A's minimal invalidation signal remains there." This
 * pins the negative half of the relocation: a bare `WsBroadcaster` (this
 * package's OWN `start()`, with no external gateway registered) must NOT
 * forward `session_started`/`session_ended`/`tool_call_recorded` to
 * `session:<id>` subscribers on its own — that forwarding now lives in
 * core-api's `session-activity-gateway.ts` (see
 * `session-activity-gateway.integration.test.ts`, the positive half of this
 * same relocation).
 *
 * RED reason: `WsBroadcaster.start()` still wires `RAW_BROADCAST_ROUTES`
 * internally today, so a client subscribed to `session:<id>` DOES receive
 * these three event types right now — the assertions below (expecting ZERO
 * messages) fail against the current source. They pass once
 * `RAW_BROADCAST_ROUTES` + its `start()` wiring are deleted from
 * `ws-broadcaster.ts` in the green phase.
 */

import { EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WsBroadcaster, type WsClient } from "../ws-broadcaster.js";

function createMockClient(): WsClient & { messages: string[] } {
	const messages: string[] = [];
	return {
		messages,
		send(data: string) {
			messages.push(data);
		},
	};
}

describe("WsBroadcaster — no session-forwarding logic of its own", () => {
	let eventBus: EventBus;
	let broadcaster: WsBroadcaster;

	beforeEach(() => {
		eventBus = new EventBus();
		broadcaster = new WsBroadcaster(eventBus);
		broadcaster.start();
	});

	afterEach(() => {
		broadcaster.stop();
	});

	it("does not forward tool_call_recorded to a session:<id> subscriber on its own", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "session:sess-no-fwd-1");

		eventBus.emit({
			type: "tool_call_recorded",
			streamId: "sess-no-fwd-1",
			sessionId: "sess-no-fwd-1",
			toolName: "bash",
			argsSummary: "",
			timestamp: Date.now(),
		});

		expect(client.messages).toHaveLength(0);
	});

	it("does not forward session_started to a session:<id> subscriber on its own", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "session:sess-no-fwd-2");

		eventBus.emit({
			type: "session_started",
			streamId: "sess-no-fwd-2",
			sessionId: "sess-no-fwd-2",
			agentId: "agent-no-fwd-2",
			taskId: "task-no-fwd-2",
			timestamp: Date.now(),
		});

		expect(client.messages).toHaveLength(0);
	});

	it("does not forward session_ended to a session:<id> subscriber on its own", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "session:sess-no-fwd-3");

		eventBus.emit({
			type: "session_ended",
			streamId: "sess-no-fwd-3",
			sessionId: "sess-no-fwd-3",
			agentId: "agent-no-fwd-3",
			taskId: "task-no-fwd-3",
			outcome: "completed",
			timestamp: Date.now(),
		});

		expect(client.messages).toHaveLength(0);
	});
});
