/**
 * L15 § 12 protected — `messageInputSchema` round-trip with the new
 * `payload.request` field. Pins L15-plan §2.1 (additive extension to
 * PlainPayload) at the boundary so a future Zod refactor cannot drop the
 * `request` field silently.
 */

import { describe, expect, it } from "vitest";
import { messageInputSchema } from "../threads-schema.js";

const validClientKey = "thrcheck-12345678";

describe("messageInputSchema — plain message with request payload", () => {
	it("accepts a plain message carrying a verb-only request", () => {
		const parsed = messageInputSchema.safeParse({
			type: "plain",
			payload: { text: "Request stop", request: { verb: "request_stop" } },
			clientKey: validClientKey,
		});
		expect(parsed.success).toBe(true);
		if (parsed.success && parsed.data.type === "plain") {
			expect(parsed.data.payload.request?.verb).toBe("request_stop");
		}
	});

	it("accepts a plain message with verb + reason", () => {
		const parsed = messageInputSchema.safeParse({
			type: "plain",
			payload: {
				text: "Request stop: blocking the team",
				request: { verb: "request_stop", reason: "blocking the team" },
			},
			clientKey: validClientKey,
		});
		expect(parsed.success).toBe(true);
		if (parsed.success && parsed.data.type === "plain") {
			expect(parsed.data.payload.request?.reason).toBe("blocking the team");
		}
	});

	it("accepts a plain message with no request (additive — back-compat)", () => {
		const parsed = messageInputSchema.safeParse({
			type: "plain",
			payload: { text: "regular message" },
			clientKey: validClientKey,
		});
		expect(parsed.success).toBe(true);
	});

	it("rejects a plain message whose request.verb is not in REQUEST_VERBS", () => {
		const parsed = messageInputSchema.safeParse({
			type: "plain",
			payload: { text: "x", request: { verb: "totally_made_up" } },
			clientKey: validClientKey,
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects a plain message whose request.reason exceeds 2048 chars", () => {
		const long = "a".repeat(2049);
		const parsed = messageInputSchema.safeParse({
			type: "plain",
			payload: { text: "x", request: { verb: "request_stop", reason: long } },
			clientKey: validClientKey,
		});
		expect(parsed.success).toBe(false);
	});

	it("preserves request shape across encode/decode (round-trip via JSON)", () => {
		const input = {
			type: "plain",
			payload: {
				text: "Request hold: pause please",
				request: { verb: "request_hold", reason: "pause please" },
			},
			clientKey: validClientKey,
		};
		const encoded = JSON.stringify(input);
		const decoded = JSON.parse(encoded) as unknown;
		const parsed = messageInputSchema.safeParse(decoded);
		expect(parsed.success).toBe(true);
		if (parsed.success && parsed.data.type === "plain") {
			expect(parsed.data.payload.request).toEqual({
				verb: "request_hold",
				reason: "pause please",
			});
		}
	});
});
