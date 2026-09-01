/**
 * AU21 §6 Decision L4 / §9 Increment 14d — the "work" topic push forwarder.
 *
 * Relocated OUT of `layers/core-api/realtime/src/ws-connection-hub.ts`'s
 * deleted generic `BROADCAST_ROUTES` forwarder. `task_state_changed` /
 * `bet_state_changed` already carry every field a client needs (`toState`
 * plus `taskId`/`rootTaskId` — see `task-state-machine.ts` / `bet-state-machine.ts`
 * emit sites) so, unlike the per-thread/conversations-list pushes (which need
 * the caller's in-hand DB row and are pushed directly from
 * `routes/threads.ts`), this one stays a thin EventBus-driven forwarder —
 * same shape as `session-activity-gateway.ts`'s (c) concern. The founder's
 * "no refetch, core submits the changed version" bar is met because the
 * pushed `data` IS the changed state, not an invalidate ping.
 */

import type { EventBus } from "@hyperidle/event-bus";

/**
 * The minimal shape this gateway needs from a broadcast sink — satisfied by
 * `WsConnectionHub.broadcast(topic, data)` (`../ws-connection-hub.js`) without
 * this module depending on that package's full class.
 */
export interface WorkStatePushTarget {
	broadcast(topic: string, data: string): void;
}

const WORK_TOPIC = "work";

/**
 * Subscribes to task/bet state-change events and pushes the changed state
 * (not an invalidation ping) to the `work` topic. Returns an unregister
 * function that stops all forwarding.
 */
export function registerWorkStatePushGateway(
	eventBus: EventBus,
	target: WorkStatePushTarget,
): () => void {
	// BB1: bet_state_changed deleted — root tasks fire task_state_changed.
	const unsubscribers = [
		eventBus.on("task_state_changed", (event) => {
			target.broadcast(
				WORK_TOPIC,
				JSON.stringify({
					type: "update",
					topic: WORK_TOPIC,
					kind: "task_state_changed",
					data: { taskId: event.taskId, toState: event.toState },
				}),
			);
		}),
	];

	return (): void => {
		for (const unsub of unsubscribers) {
			unsub();
		}
	};
}
