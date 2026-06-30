/**
 * R6 — Artifacts Pipeline: RED phase tests for ArtifactCreatedEvent and WsBroadcaster.
 *
 * These tests prove:
 *   AC6 — artifact_created is a valid KernelEvent (type system constraint)
 *   AC7 — WsBroadcaster forwards artifact_created to the "work" topic
 *
 * These tests WILL fail until:
 *   - ArtifactCreatedEvent is added to events.ts (Task 2)
 *   - KernelEvent union includes ArtifactCreatedEvent (Task 2)
 *   - WsBroadcaster subscribes to artifact_created and broadcasts to "work" (Task 4)
 */

import type { ArtifactCreatedEvent, KernelEvent } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WsBroadcaster, type WsClient } from "../services/ws-broadcaster.js";

// --- Mock WS client -----------------------------------------------------------

function createMockClient(): WsClient & { messages: string[] } {
	const messages: string[] = [];
	return {
		messages,
		send(data: string) {
			messages.push(data);
		},
	};
}

// --- Event type system tests --------------------------------------------------

describe("R6 AC6: ArtifactCreatedEvent is a valid KernelEvent", () => {
	it("ArtifactCreatedEvent can be assigned to KernelEvent without type error", () => {
		// This test is primarily a type-level assertion. The cast below will
		// produce a TypeScript compile error until ArtifactCreatedEvent is added
		// to the KernelEvent union in events.ts.
		//
		// @lore R6: ArtifactCreatedEvent does not exist yet in @hyperidle/shared.
		// Once it's added, this runtime test confirms the discriminant is correct.
		const event: ArtifactCreatedEvent = {
			type: "artifact_created",
			streamId: "artifact-1",
			artifactId: "artifact-1",
			taskId: "task-1",
			kind: "decision",
			timestamp: Date.now(),
		};

		// The KernelEvent type must be able to hold this event.
		const kernelEvent: KernelEvent = event;
		expect(kernelEvent.type).toBe("artifact_created");
	});

	it("ArtifactCreatedEvent has the correct discriminant type literal 'artifact_created'", () => {
		// AM5 B2: code_diff → code (pre-alpha purge)
		const event: ArtifactCreatedEvent = {
			type: "artifact_created",
			streamId: "s-1",
			artifactId: "a-1",
			taskId: "t-1",
			kind: "code",
			timestamp: 1748000000000,
		};

		expect(event.type).toBe("artifact_created");
		expect(event.artifactId).toBe("a-1");
		expect(event.taskId).toBe("t-1");
		expect(event.kind).toBe("code");
		expect(typeof event.streamId).toBe("string");
		expect(typeof event.timestamp).toBe("number");
	});
});

// --- WsBroadcaster forwarding tests -------------------------------------------

describe("R6 AC7: WsBroadcaster forwards artifact_created to 'work' topic", () => {
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

	it("forwards artifact_created event to clients subscribed to 'work' topic", async () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		await broadcaster.subscribe(client, "work");

		const event: ArtifactCreatedEvent = {
			type: "artifact_created",
			streamId: "artifact-ws-1",
			artifactId: "artifact-ws-1",
			taskId: "task-ws-1",
			kind: "verification",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		expect(client.messages).toHaveLength(1);
		const received = JSON.parse(client.messages[0] ?? "null") as {
			type: string;
			artifactId: string;
		};
		expect(received.type).toBe("artifact_created");
		expect(received.artifactId).toBe("artifact-ws-1");
	});

	it("does NOT forward artifact_created to clients subscribed only to 'conversations'", async () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		await broadcaster.subscribe(client, "conversations");

		eventBus.emit({
			type: "artifact_created",
			streamId: "artifact-conv-1",
			artifactId: "artifact-conv-1",
			taskId: "task-conv-1",
			kind: "decision",
			timestamp: Date.now(),
		} satisfies ArtifactCreatedEvent);

		// artifact_created goes to "work", not "conversations".
		expect(client.messages).toHaveLength(0);
	});

	it("broadcasts to all clients subscribed to 'work'", async () => {
		const client1 = createMockClient();
		const client2 = createMockClient();
		broadcaster.addClient(client1);
		broadcaster.addClient(client2);
		await broadcaster.subscribe(client1, "work");
		await broadcaster.subscribe(client2, "work");

		eventBus.emit({
			type: "artifact_created",
			streamId: "artifact-multi-1",
			artifactId: "artifact-multi-1",
			taskId: "task-multi-1",
			kind: "data_analysis",
			timestamp: Date.now(),
		} satisfies ArtifactCreatedEvent);

		expect(client1.messages).toHaveLength(1);
		expect(client2.messages).toHaveLength(1);
	});

	it("only work-subscribed client receives artifact_created when both work and non-work clients exist", async () => {
		const workClient = createMockClient();
		const convClient = createMockClient();
		broadcaster.addClient(workClient);
		broadcaster.addClient(convClient);
		await broadcaster.subscribe(workClient, "work");
		await broadcaster.subscribe(convClient, "conversations");

		eventBus.emit({
			type: "artifact_created",
			streamId: "artifact-selective-1",
			artifactId: "artifact-selective-1",
			taskId: "task-selective-1",
			kind: "decision",
			timestamp: Date.now(),
		} satisfies ArtifactCreatedEvent);

		expect(workClient.messages).toHaveLength(1);
		expect(convClient.messages).toHaveLength(0);
	});
});

// --- Dispatcher drop-list coverage -------------------------------------------

describe("R6: dispatcher exhaustive switch includes artifact_created", () => {
	it("artifact_created event type string matches the KernelEvent discriminant", () => {
		// Type-level test: if ArtifactCreatedEvent is in KernelEvent, then
		// the dispatcher's exhaustive switch MUST handle "artifact_created"
		// or the TypeScript compiler will error on the `never` branch.
		//
		// This is a runtime guard confirming the discriminant string matches.
		// The actual exhaustive check happens at compile time.
		const event: ArtifactCreatedEvent = {
			type: "artifact_created",
			streamId: "s",
			artifactId: "a",
			taskId: "t",
			kind: "decision",
			timestamp: 0,
		};
		// Verify the type discriminant is the expected string literal.
		const type: "artifact_created" = event.type;
		expect(type).toBe("artifact_created");
	});
});
