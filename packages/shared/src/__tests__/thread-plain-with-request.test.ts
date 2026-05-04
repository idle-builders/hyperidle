/**
 * L15 — PlainPayload extension: a plain message can carry an optional
 * `request: { verb, reason? }` field per plan §2.1 + §3.2.
 *
 * @plan-contradiction: the plan §12 row also says "validates through
 *   messageInputSchema" and "verb invalid → rejected." messageInputSchema
 *   lives in @hyperidle/server, which @hyperidle/shared cannot import
 *   (would create a workspace cycle). We assert the SHARED-level shape
 *   here; the server-side Zod validation is asserted in
 *   `packages/server/src/routes/__tests__/tasks.request.test.ts` row (b)
 *   which exercises the same boundary.
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import type { Message, PlainPayload, RequestPayload } from "../thread.js";
import { REQUEST_VERBS, type RequestVerb } from "../task-request-verbs.js";

describe("PlainPayload — request field", () => {
	it("PlainPayload accepts an optional `request` extension", () => {
		const payload: PlainPayload = {
			text: "Request stop",
			request: { verb: "request_stop" },
		};
		expect(payload.request?.verb).toBe("request_stop");
	});

	it("PlainPayload accepts a request with a reason", () => {
		const payload: PlainPayload = {
			text: "Request stop: no progress",
			request: { verb: "request_stop", reason: "no progress" },
		};
		expect(payload.request?.reason).toBe("no progress");
	});

	it("PlainPayload still accepts a message WITHOUT a request (backward compat)", () => {
		const payload: PlainPayload = { text: "hello" };
		expect(payload.request).toBeUndefined();
	});

	it("RequestPayload.verb is constrained to REQUEST_VERBS", () => {
		expectTypeOf<RequestPayload["verb"]>().toEqualTypeOf<RequestVerb>();
		// Runtime: every legal verb is a valid RequestPayload
		for (const verb of REQUEST_VERBS) {
			const r: RequestPayload = { verb };
			expect(r.verb).toBe(verb);
		}
	});

	it("a plain Message can carry the new request payload (discriminated union still narrows)", () => {
		const m: Message = {
			id: "m1",
			threadId: "t1",
			senderId: "u-founder",
			clientKey: "uuid-12345678",
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: new Date().toISOString(),
			type: "plain",
			payload: { text: "Request stop", request: { verb: "request_stop" } },
		};
		// Discriminated narrow on `type` exposes plain-payload shape.
		if (m.type === "plain" && !("redacted" in m.payload)) {
			expect(m.payload.request?.verb).toBe("request_stop");
		} else {
			throw new Error("expected plain non-redacted message");
		}
	});
});
