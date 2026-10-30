/**
 * A review message carries an optional taskId: stamped by the server from
 * ctx.caller.taskId (task run) or supplied by the agent from a conversation
 * turn. `SendMessageInputSchema.review` accepts it from the caller.
 */

import { describe, expect, it } from "vitest";
import { reviewPayloadSchema, SendMessageInputSchema } from "../actions/thread.js";

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
	it("accepts a taskId provided by the caller (conversation-turn agent names its task)", () => {
		const parsed = SendMessageInputSchema.parse({
			threadId: "thread-1",
			review: { title: "Review", reasoning: ["looks good"], taskId: "task-xyz" },
		});
		expect(parsed.review).toBeDefined();
		expect((parsed.review as { taskId?: string }).taskId).toBe("task-xyz");
	});

	it("accepts a review with no taskId", () => {
		const parsed = SendMessageInputSchema.parse({
			threadId: "thread-1",
			review: { title: "Review", reasoning: ["looks good"] },
		});
		expect(parsed.review?.title).toBe("Review");
		expect((parsed.review as { taskId?: string } | undefined)?.taskId).toBeUndefined();
	});
});
