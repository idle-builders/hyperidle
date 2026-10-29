/** An agent starting or stopping work in a conversation nudges that conversation, so its page can say so. */
import { EventBus } from "@hyperidle/event-bus";
import { describe, expect, it } from "vitest";
import { registerThreadSessionLiveUpdates } from "../thread-session-live-updates.js";

describe("live updates for an agent working in a conversation", () => {
	it.each([
		{
			type: "session_started" as const,
			correlation: { threadId: "th-1" },
			topics: ["thread:th-1"],
		},
		{ type: "session_ended" as const, correlation: { threadId: "th-1" }, topics: ["thread:th-1"] },
		{ type: "session_started" as const, correlation: {}, topics: [] },
	])("$type with $correlation nudges $topics", ({ type, correlation, topics }) => {
		const eventBus = new EventBus();
		const pushed: string[] = [];
		const stop = registerThreadSessionLiveUpdates(eventBus, (topic) => pushed.push(topic));
		const base = {
			streamId: "s",
			sessionId: "sess-1",
			agentId: "builder",
			taskId: null,
			sourceCorrelation: correlation as never,
			timestamp: 0,
		};
		eventBus.emit(
			type === "session_started" ? { type, ...base } : { type, ...base, outcome: "completed" },
		);
		stop();
		expect(pushed).toEqual(topics);
	});
});
