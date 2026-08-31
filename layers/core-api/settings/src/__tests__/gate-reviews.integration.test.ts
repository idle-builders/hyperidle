/**
 * Gate reviews — integration tests.
 *
 * AC coverage:
 *  - recordGateReview persists a row with all fields
 *  - findGateReviewByMessageId returns the recorded review
 *  - findGateReviewByMessageId returns undefined for unknown reviewMessageId
 *  - reviewMessageId uniqueness is enforced (duplicate insert rejected)
 */

import { test } from "@hyperidle/db/test-fixtures";
import { describe, expect } from "vitest";
import { findGateReviewByMessageId, recordGateReview } from "../gate-reviews.js";

describe("gate reviews", () => {
	test("recordGateReview persists all fields", async ({ db }) => {
		const review = await recordGateReview(db, {
			sessionId: "session-1",
			reviewMessageId: "msg-1",
			blockedTool: "bash",
			rulePattern: "git push",
			ruleId: "rule-abc",
			now: "2026-08-31T00:00:00.000Z",
		});

		expect(review.id).toBeTruthy();
		expect(review.sessionId).toBe("session-1");
		expect(review.reviewMessageId).toBe("msg-1");
		expect(review.blockedTool).toBe("bash");
		expect(review.rulePattern).toBe("git push");
		expect(review.ruleId).toBe("rule-abc");
		expect(review.createdAt).toBe("2026-08-31T00:00:00.000Z");
	});

	test("findGateReviewByMessageId returns the recorded review", async ({ db }) => {
		await recordGateReview(db, {
			sessionId: "session-2",
			reviewMessageId: "msg-2",
			blockedTool: "write_file",
			rulePattern: "/etc",
			ruleId: "rule-xyz",
		});

		const found = await findGateReviewByMessageId(db, "msg-2");
		expect(found).toBeDefined();
		expect(found?.sessionId).toBe("session-2");
		expect(found?.blockedTool).toBe("write_file");
		expect(found?.ruleId).toBe("rule-xyz");
	});

	test("findGateReviewByMessageId returns undefined for unknown message", async ({ db }) => {
		const found = await findGateReviewByMessageId(db, "no-such-msg");
		expect(found).toBeUndefined();
	});

	test("reviewMessageId uniqueness: duplicate insert throws", async ({ db }) => {
		await recordGateReview(db, {
			sessionId: "session-3",
			reviewMessageId: "msg-unique",
			blockedTool: "bash",
			rulePattern: "ssh",
			ruleId: "rule-1",
		});

		await expect(
			recordGateReview(db, {
				sessionId: "session-3",
				reviewMessageId: "msg-unique", // same message ID
				blockedTool: "bash",
				rulePattern: "ssh",
				ruleId: "rule-1",
			}),
		).rejects.toThrow();
	});
});
