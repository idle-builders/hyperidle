/** A user made or changed nudges every list of people and that user's own page. */
import { EventBus, objectEvent } from "@hyperidle/event-bus";
import { describe, expect, it } from "vitest";
import { registerUserLiveUpdates } from "../user-live-updates.js";

describe("live updates for people", () => {
	it.each(["created", "changed"] as const)("a user %s nudges users and user:<id>", (kind) => {
		const eventBus = new EventBus();
		const topics: string[] = [];
		const stop = registerUserLiveUpdates(eventBus, (topic) => topics.push(topic));
		eventBus.emit(
			objectEvent({
				id: "c1",
				object: "user",
				objectId: "builder",
				kind,
				actor: "finn",
				before: null,
				after: "{}",
				at: "2026-01-01T00:00:00.000Z",
			}),
		);
		stop();
		expect(topics).toEqual(["users", "user:builder"]);
	});
});
