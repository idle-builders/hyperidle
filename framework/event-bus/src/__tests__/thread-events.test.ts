/**
 * L1a — Event Bus events for the Thread primitive (plan §6.3).
 *
 * Five new events: thread_created, thread_message_appended,
 * thread_resolved, thread_reopened, thread_archived. `streamId`
 * = `threadId` so per-thread events arrive in order.
 */

import type {
	DomainEvent,
	ThreadArchivedEvent,
	ThreadCreatedEvent,
	ThreadMessageAppendedEvent,
	ThreadReopenedEvent,
	ThreadResolvedEvent,
} from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import { EventBus } from "../event-bus.js";

describe("L1a — Thread primitive events on EventBus", () => {
	it("thread_created event roundtrips with hostKind, hostId, initiatorId", () => {
		const bus = new EventBus();
		let received: ThreadCreatedEvent | null = null;
		bus.on("thread_created", (e) => {
			received = e;
		});

		const event: ThreadCreatedEvent = {
			type: "thread_created",
			streamId: "thr-1",
			threadId: "thr-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "u-founder",
			timestamp: 1,
		};
		bus.emit(event);

		expect(received).not.toBeNull();
		expect(received!.threadId).toBe("thr-1");
		expect(received!.hostKind).toBe("task");
	});

	it("thread_message_appended carries messageType discriminant", () => {
		const bus = new EventBus();
		const received: ThreadMessageAppendedEvent[] = [];
		bus.on("thread_message_appended", (e) => {
			received.push(e);
		});

		const event: ThreadMessageAppendedEvent = {
			type: "thread_message_appended",
			streamId: "thr-1",
			threadId: "thr-1",
			messageId: "m-1",
			messageType: "verdict",
			senderId: "u-founder",
			timestamp: 2,
		};
		bus.emit(event);

		expect(received).toHaveLength(1);
		expect(received[0]!.messageType).toBe("verdict");
	});

	it("thread_resolved carries resolvedByMessageId (the verdict that triggered it)", () => {
		const bus = new EventBus();
		let received: ThreadResolvedEvent | null = null;
		bus.on("thread_resolved", (e) => {
			received = e;
		});

		const event: ThreadResolvedEvent = {
			type: "thread_resolved",
			streamId: "thr-1",
			threadId: "thr-1",
			resolvedByMessageId: "verdict-m-1",
			timestamp: 3,
		};
		bus.emit(event);

		expect(received).not.toBeNull();
		expect(received!.resolvedByMessageId).toBe("verdict-m-1");
	});

	it("thread_reopened carries reopenedByMessageId (the new review that re-opened it)", () => {
		const bus = new EventBus();
		let received: ThreadReopenedEvent | null = null;
		bus.on("thread_reopened", (e) => {
			received = e;
		});

		const event: ThreadReopenedEvent = {
			type: "thread_reopened",
			streamId: "thr-1",
			threadId: "thr-1",
			reopenedByMessageId: "rev-m-2",
			timestamp: 4,
		};
		bus.emit(event);

		expect(received).not.toBeNull();
		expect(received!.reopenedByMessageId).toBe("rev-m-2");
	});

	it("thread_archived event delivers", () => {
		const bus = new EventBus();
		let received: ThreadArchivedEvent | null = null;
		bus.on("thread_archived", (e) => {
			received = e;
		});

		const event: ThreadArchivedEvent = {
			type: "thread_archived",
			streamId: "thr-1",
			threadId: "thr-1",
			timestamp: 5,
		};
		bus.emit(event);

		expect(received).not.toBeNull();
		expect(received!.threadId).toBe("thr-1");
	});

	it("DomainEvent union covers the 5 new event types (compile-time)", () => {
		const events: DomainEvent[] = [
			{
				type: "thread_created",
				streamId: "s",
				threadId: "t",
				hostKind: "task",
				hostId: "h",
				initiatorId: "i",
				timestamp: 1,
			},
			{
				type: "thread_message_appended",
				streamId: "s",
				threadId: "t",
				messageId: "m",
				messageType: "plain",
				senderId: "i",
				timestamp: 2,
			},
			{
				type: "thread_resolved",
				streamId: "s",
				threadId: "t",
				resolvedByMessageId: "v",
				timestamp: 3,
			},
			{
				type: "thread_reopened",
				streamId: "s",
				threadId: "t",
				reopenedByMessageId: "r",
				timestamp: 4,
			},
			{
				type: "thread_archived",
				streamId: "s",
				threadId: "t",
				timestamp: 5,
			},
		];
		expect(events.length).toBe(5);
	});
});
