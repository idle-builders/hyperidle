/**
 * AU21 §6 Decision L4 / §9 Increment 14d.
 *
 * `registerWorkStatePushGateway` subscribes to `task_state_changed` /
 * `bet_state_changed` and pushes the CHANGED DATA (not an invalidate ping)
 * to the "work" topic — the founder's "there is no refetch … core submits
 * the changed version" bar for the work-state seam.
 */

import { describe, expect, test } from "../../__testing__/test-fixtures.js";
import { registerWorkStatePushGateway } from "../work-state-push-gateway.js";

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

describe("registerWorkStatePushGateway — work-state push forwarder", () => {
	test("pushes the changed taskId/toState on task_state_changed, not an invalidate ping", async ({
		db: _db,
		eventBus,
	}) => {
		const target = createRecordingBroadcastTarget();
		registerWorkStatePushGateway(eventBus, target);

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-1",
			taskId: "task-1",
			fromState: "proposed",
			toState: "accepted",
			timestamp: Date.now(),
		});

		expect(target.calls).toHaveLength(1);
		expect(target.calls[0]?.topic).toBe("work");
		const payload = JSON.parse(target.calls[0]?.data ?? "{}");
		expect(payload.type).toBe("update");
		expect(payload.topic).toBe("work");
		expect(payload.kind).toBe("task_state_changed");
		expect(payload.data).toEqual({ taskId: "task-1", toState: "accepted" });
	});

	// BB1: bet_state_changed deleted — root tasks fire task_state_changed.
	test("pushes the changed taskId/toState on task_state_changed for root tasks too", async ({
		db: _db,
		eventBus,
	}) => {
		const target = createRecordingBroadcastTarget();
		registerWorkStatePushGateway(eventBus, target);

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-root-1",
			taskId: "task-root-1",
			fromState: "proposed",
			toState: "in_progress",
			timestamp: Date.now(),
		});

		expect(target.calls).toHaveLength(1);
		expect(target.calls[0]?.topic).toBe("work");
		const payload = JSON.parse(target.calls[0]?.data ?? "{}");
		expect(payload.type).toBe("update");
		expect(payload.kind).toBe("task_state_changed");
		expect(payload.data).toEqual({ taskId: "task-root-1", toState: "in_progress" });
	});

	test("the unregister function stops all forwarding", async ({ db: _db, eventBus }) => {
		const target = createRecordingBroadcastTarget();
		const unregister = registerWorkStatePushGateway(eventBus, target);
		unregister();

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-2",
			taskId: "task-2",
			fromState: "proposed",
			toState: "accepted",
			timestamp: Date.now(),
		});
		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-root-2",
			taskId: "task-root-2",
			fromState: "proposed",
			toState: "in_progress",
			timestamp: Date.now(),
		});

		expect(target.calls).toHaveLength(0);
	});
});
