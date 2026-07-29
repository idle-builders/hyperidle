/**
 * AU21 Increment 7, Wave A (Decision E) — RED phase.
 *
 * Retires the generic realtime broadcaster's full-payload forwarding for the
 * (b) discrete-state-change concern (conversations/work/thread:<id>) in favor
 * of a minimal invalidation signal, and removes the redundant `cost_cap_warning`
 * WS re-forward entirely (Increment 6 already built the real cost read door,
 * `AgentOrchestrationPort` — nothing consumes the forwarded copy as a cost
 * signal; see architecture.md §6 Decision E / §13 Migrations).
 *
 * Two things this file proves:
 *  1. `cost_cap_warning` is no longer broadcast to the "work" topic at all
 *     (trivial deletion — notifications already own this event on its own
 *     domain-specific channel, untouched).
 *  2. The minimal-invalidation-signal mechanism is a general BROADCAST_ROUTES
 *     behavior, not a hardcoded special case for one or two event types —
 *     spot-checked here via `task_state_changed` and `bet_state_changed`,
 *     which had no prior WsBroadcaster-level test coverage.
 *
 * Red until the green phase collapses these routes onto
 * `{ type: "invalidate", topic, kind, id? }`.
 */

import type {
	BetStateChangedEvent,
	CostCapWarningEvent,
	TaskStateChangedEvent,
} from "@hyperidle/shared";
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

describe("AU21 Increment 7 — cost_cap_warning WS forward removed", () => {
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

	it("does NOT forward cost_cap_warning to 'work' topic subscribers (notifications already own this event)", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "work");

		const event: CostCapWarningEvent = {
			type: "cost_cap_warning",
			streamId: "team-1",
			level: "warning",
			capLevel: "team",
			entityId: "team-1",
			spend: 160,
			cap: 200,
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		expect(client.messages).toHaveLength(0);
	});
});

describe("AU21 Increment 7 — minimal invalidation signal is a general 'work' topic behavior", () => {
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

	it("forwards task_state_changed to 'work' subscribers as a minimal invalidation signal", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "work");

		const event: TaskStateChangedEvent = {
			type: "task_state_changed",
			streamId: "task-1",
			taskId: "task-1",
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		expect(client.messages).toHaveLength(1);
		const received = JSON.parse(client.messages[0]!) as {
			type: string;
			topic: string;
			kind: string;
			id?: string;
			taskId?: string;
			fromState?: string;
			toState?: string;
		};
		expect(received.type).toBe("invalidate");
		expect(received.topic).toBe("work");
		expect(received.kind).toBe("task_state_changed");
		// Minimal signal: no domain fields, no fabricated `id` for a global topic.
		expect(received.taskId).toBeUndefined();
		expect(received.fromState).toBeUndefined();
		expect(received.toState).toBeUndefined();
		expect("id" in received).toBe(false);
	});

	it("forwards bet_state_changed to 'work' subscribers as a minimal invalidation signal", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "work");

		const event: BetStateChangedEvent = {
			type: "bet_state_changed",
			streamId: "bet-1",
			betId: "bet-1",
			fromState: "active",
			toState: "completed",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		expect(client.messages).toHaveLength(1);
		const received = JSON.parse(client.messages[0]!) as {
			type: string;
			topic: string;
			kind: string;
			betId?: string;
		};
		expect(received.type).toBe("invalidate");
		expect(received.topic).toBe("work");
		expect(received.kind).toBe("bet_state_changed");
		expect(received.betId).toBeUndefined();
	});
});
