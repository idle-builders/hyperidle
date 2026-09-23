/**
 * The nine object events — one member per name, one event per `changes`
 * row. `objectEvent` builds the wire event from a raw `changes` row (the
 * shape `@hyperidle/db`'s `appendChange` returns: `before`/`after` still
 * JSON text); the DomainEvent union resolves each of the nine names to its
 * own member via the distributive mapped type.
 */
import type { DomainEvent } from "@hyperidle/event-bus";
import { describe, expect, it } from "vitest";
import { EventBus } from "../event-bus.js";
import { objectEvent } from "../events.js";

describe("objectEvent — builds an object-change event from a changes row", () => {
	it("decodes before/after from JSON text and derives the dotted type from object+kind", () => {
		const event = objectEvent({
			id: "chg-1",
			object: "task",
			objectId: "task-1",
			kind: "changed",
			actor: "u-1",
			before: JSON.stringify({ state: "hold" }),
			after: JSON.stringify({ state: "done" }),
			at: "2026-01-01T00:00:00.000Z",
		});

		expect(event.type).toBe("task.changed");
		expect(event.streamId).toBe("task-1");
		expect(event.change).toEqual({
			id: "chg-1",
			object: "task",
			objectId: "task-1",
			kind: "changed",
			actor: "u-1",
			before: { state: "hold" },
			after: { state: "done" },
			at: "2026-01-01T00:00:00.000Z",
		});
		expect(event.cascade).toBeUndefined();
	});

	it("a null before decodes to null, never an empty object", () => {
		const event = objectEvent({
			id: "chg-2",
			object: "document",
			objectId: "doc-1",
			kind: "created",
			actor: "u-1",
			before: null,
			after: JSON.stringify({ id: "doc-1", title: "New" }),
			at: "2026-01-01T00:00:00.000Z",
		});

		expect(event.type).toBe("document.created");
		expect(event.change.before).toBeNull();
	});

	it("cascade:true rides only when asked", () => {
		const event = objectEvent(
			{
				id: "chg-3",
				object: "task",
				objectId: "task-2",
				kind: "changed",
				actor: "system:propagation",
				before: JSON.stringify({ state: "in_progress" }),
				after: JSON.stringify({ state: "killed" }),
				at: "2026-01-01T00:00:00.000Z",
			},
			{ cascade: true },
		);

		expect(event.cascade).toBe(true);
	});

	it("every one of the nine object events round-trips through a real EventBus subscription", () => {
		const bus = new EventBus();
		const objectsAndKinds: ReadonlyArray<{
			readonly object: "task" | "thread" | "document" | "user";
			readonly kind: "created" | "changed" | "message";
		}> = [
			{ object: "task", kind: "created" },
			{ object: "task", kind: "changed" },
			{ object: "thread", kind: "created" },
			{ object: "thread", kind: "message" },
			{ object: "thread", kind: "changed" },
			{ object: "document", kind: "created" },
			{ object: "document", kind: "changed" },
			{ object: "user", kind: "created" },
			{ object: "user", kind: "changed" },
		];

		const seen: string[] = [];
		for (const { object, kind } of objectsAndKinds) {
			const type = `${object}.${kind}` as DomainEvent["type"];
			const unsubscribe = bus.on(type, (e) => seen.push(e.type));
			bus.emit(
				objectEvent({
					id: `chg-${object}-${kind}`,
					object,
					objectId: `${object}-1`,
					kind,
					actor: "u-1",
					before: null,
					after: JSON.stringify({}),
					at: "2026-01-01T00:00:00.000Z",
				}),
			);
			unsubscribe();
		}

		expect(seen).toEqual([
			"task.created",
			"task.changed",
			"thread.created",
			"thread.message",
			"thread.changed",
			"document.created",
			"document.changed",
			"user.created",
			"user.changed",
		]);
	});
});
