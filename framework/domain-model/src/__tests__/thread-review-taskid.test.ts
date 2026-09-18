/**
 * BC3 Confusion 9 — a review message records the task its session ran on,
 * stamped by the server. `reviewPayloadSchema` (the stored/read shape)
 * carries `taskId`; `SendMessageInputSchema.review` must not accept it from
 * the caller.
 */

import { describe, expect, it } from "vitest";
import { SendMessageInputSchema, reviewPayloadSchema } from "../actions/thread.js";

describe("reviewPayloadSchema — stored/read shape", () => {
	it("accepts an optional taskId", () => {
		const parsed = reviewPayloadSchema.parse({
			title: "Review",
			reasoning: ["looks good"],
			taskId: "task-1",
		});
		expect(parsed.taskId).toBe("task-1");
	});

	it("is valid without taskId", () => {
		const parsed = reviewPayloadSchema.parse({
			title: "Review",
			reasoning: ["looks good"],
		});
		expect(parsed.taskId).toBeUndefined();
	});
});

describe("SendMessageInputSchema.review — caller input shape", () => {
	it("strips a taskId smuggled in by the caller rather than storing it", () => {
		const parsed = SendMessageInputSchema.parse({
			threadId: "thread-1",
			review: { title: "Review", reasoning: ["looks good"], taskId: "smuggled-task" },
		});
		expect(parsed.review).toBeDefined();
		expect((parsed.review as { taskId?: string }).taskId).toBeUndefined();
	});

	it("accepts a review with no taskId", () => {
		const parsed = SendMessageInputSchema.parse({
			threadId: "thread-1",
			review: { title: "Review", reasoning: ["looks good"] },
		});
		expect(parsed.review).toEqual({ title: "Review", reasoning: ["looks good"] });
	});
});
