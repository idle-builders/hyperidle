/**
 * L15 § 12 protected — `task-pending.ts` derivation.
 *
 * Covers branch table from L15-plan §2.2 + adversary CR-3 edge cases:
 *   - empty stream → null
 *   - request → pending
 *   - request, cancel → null
 *   - cancel only → null
 *   - cancel, cancel → null
 *   - request_stop, cancel, request_hold → request_hold
 *   - redacted-payload entries are skipped
 *   - request-less plain messages are skipped
 */

import { describe, expect, it } from "vitest";
import { derivePendingRequest } from "../task-pending.js";
import type { Message } from "../thread.js";

let counter = 0;
function plain(verb?: string, opts: { redacted?: boolean } = {}): Message {
	counter++;
	const id = `msg-${counter}`;
	const createdAt = new Date(2025, 0, 1, 12, counter).toISOString();
	if (opts.redacted) {
		return {
			id,
			threadId: "thr-1",
			senderId: "u-founder",
			clientKey: `ck-${counter}`,
			deletedAt: null,
			redactedAt: createdAt,
			resolvedAt: null,
			createdAt,
			type: "plain",
			payload: {
				redacted: true,
				redactedBy: "u-founder",
				redactedAt: createdAt,
				reason: "test",
			},
		};
	}
	return {
		id,
		threadId: "thr-1",
		senderId: "u-founder",
		clientKey: `ck-${counter}`,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt,
		type: "plain",
		payload: verb
			? {
					text: "ignored",
					// biome-ignore lint/suspicious/noExplicitAny: test fixture
					request: { verb: verb as any },
				}
			: { text: "no request" },
	};
}

describe("derivePendingRequest", () => {
	it("returns null for an empty stream", () => {
		expect(derivePendingRequest([])).toBeNull();
	});

	it("returns null when the only message is a plain text without a request", () => {
		expect(derivePendingRequest([plain()])).toBeNull();
	});

	it("returns the request when a single request_stop is present", () => {
		const m = plain("request_stop");
		const result = derivePendingRequest([m]);
		expect(result).not.toBeNull();
		expect(result?.verb).toBe("request_stop");
		expect(result?.messageId).toBe(m.id);
	});

	it("returns null when the latest is a cancel_request following a request", () => {
		const messages = [plain("request_stop"), plain("cancel_request")];
		expect(derivePendingRequest(messages)).toBeNull();
	});

	it("returns null when only a cancel_request exists (no prior request)", () => {
		expect(derivePendingRequest([plain("cancel_request")])).toBeNull();
	});

	it("returns null on two consecutive cancels", () => {
		const messages = [plain("request_stop"), plain("cancel_request"), plain("cancel_request")];
		expect(derivePendingRequest(messages)).toBeNull();
	});

	it("returns the latest request when cancel is followed by a new request", () => {
		const messages = [plain("request_stop"), plain("cancel_request"), plain("request_hold")];
		const result = derivePendingRequest(messages);
		expect(result).not.toBeNull();
		expect(result?.verb).toBe("request_hold");
	});

	it("skips redacted plain messages and returns the most recent non-redacted request", () => {
		const messages = [plain("request_stop"), plain(undefined, { redacted: true })];
		const result = derivePendingRequest(messages);
		expect(result).not.toBeNull();
		expect(result?.verb).toBe("request_stop");
	});

	it("returns null if the most recent request is itself redacted (no non-redacted pending)", () => {
		const messages = [plain(undefined, { redacted: true })];
		expect(derivePendingRequest(messages)).toBeNull();
	});

	it("skips request-less plain messages between request and now", () => {
		const messages = [plain("request_stop"), plain(), plain()];
		const result = derivePendingRequest(messages);
		expect(result?.verb).toBe("request_stop");
	});

	it("captures reason on the pending summary when present", () => {
		const m: Message = {
			id: "m-x",
			threadId: "thr-1",
			senderId: "u-founder",
			clientKey: "ck-x",
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: "2025-01-01T00:00:00.000Z",
			type: "plain",
			payload: {
				text: "ignored",
				request: { verb: "request_changes", reason: "more tests please" },
			},
		};
		const result = derivePendingRequest([m]);
		expect(result?.reason).toBe("more tests please");
	});
});
