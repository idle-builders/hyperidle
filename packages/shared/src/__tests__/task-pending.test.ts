/**
 * L15 — derivePendingRequest unit tests.
 *
 * Source of truth: docs/work-packages/L15-plan.md §2.2 + §3.3 + §12 locks.
 *
 * Pure derivation: caller provides messages sorted by (createdAt, id) ASC.
 * Latest plain-with-request wins; cancel_request resolves; subsequent
 * non-cancel request becomes the new pending.
 */

import { describe, expect, it } from "vitest";
import type { Message } from "../thread.js";
import type { RequestVerb } from "../task-request-verbs.js";
import { derivePendingRequest } from "../task-pending.js";

const NOW = Date.parse("2026-04-19T12:00:00Z");

function isoAt(offsetMin: number): string {
	return new Date(NOW + offsetMin * 60_000).toISOString();
}

function plain(id: string, offsetMin: number, text = "hello"): Message {
	return {
		id,
		threadId: "t1",
		senderId: "u-founder",
		clientKey: id,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: isoAt(offsetMin),
		type: "plain",
		payload: { text },
	};
}

function request(id: string, offsetMin: number, verb: RequestVerb, reason?: string): Message {
	return {
		id,
		threadId: "t1",
		senderId: "u-founder",
		clientKey: id,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: isoAt(offsetMin),
		type: "plain",
		payload: { text: verb, request: { verb, ...(reason ? { reason } : {}) } },
	};
}

describe("derivePendingRequest", () => {
	it("returns null for an empty stream", () => {
		expect(derivePendingRequest([])).toBeNull();
	});

	it("returns null when no message carries a request", () => {
		expect(derivePendingRequest([plain("m1", 0), plain("m2", 1)])).toBeNull();
	});

	it("returns the single pending request when present", () => {
		const result = derivePendingRequest([plain("m1", 0), request("r1", 1, "request_stop", "why")]);
		expect(result).not.toBeNull();
		expect(result?.messageId).toBe("r1");
		expect(result?.verb).toBe("request_stop");
		expect(result?.reason).toBe("why");
	});

	it("returns null when the latest request is a cancel_request", () => {
		const result = derivePendingRequest([
			request("r1", 0, "request_stop"),
			request("r2", 1, "cancel_request"),
		]);
		expect(result).toBeNull();
	});

	it("returns the new request when a cancel is followed by a fresh request", () => {
		const result = derivePendingRequest([
			request("r1", 0, "request_stop"),
			request("r2", 1, "cancel_request"),
			request("r3", 2, "request_hold"),
		]);
		expect(result?.messageId).toBe("r3");
		expect(result?.verb).toBe("request_hold");
	});

	it("respects (createdAt, id) ASC ordering — last in wins", () => {
		// Both at same offset; id ordering breaks the tie at the caller level.
		const result = derivePendingRequest([
			request("a", 0, "request_stop"),
			request("b", 0, "request_hold"),
		]);
		// The caller passes ASC; "b" is later → it wins.
		expect(result?.messageId).toBe("b");
	});

	it("ignores non-plain messages", () => {
		const verdictMsg: Message = {
			id: "v1",
			threadId: "t1",
			senderId: "u-founder",
			clientKey: "v1",
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: isoAt(2),
			type: "verdict",
			payload: { decision: "approve", resolvesMessageId: "x" },
		};
		const result = derivePendingRequest([request("r1", 1, "request_stop"), verdictMsg]);
		expect(result?.messageId).toBe("r1");
	});

	it("returns createdAt and reason on the summary", () => {
		const r = request("r1", 5, "request_stop", "context");
		const result = derivePendingRequest([r]);
		expect(result?.createdAt).toBe(r.createdAt);
		expect(result?.reason).toBe("context");
	});
});
