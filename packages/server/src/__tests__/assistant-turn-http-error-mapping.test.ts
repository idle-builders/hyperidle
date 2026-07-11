/**
 * POLISH-060 — mapErrorToNotice: HttpError explicit mapping.
 *
 * Root cause: mapErrorToNotice catches HttpError (401/400 from LLM calls) in the
 * unmapped-else branch, surfacing "usually temporary" copy for permanent failures
 * (bad key = 401, bad model = 400). Sends users into a futile retry loop.
 *
 * Fix: map HttpError explicitly in mapErrorToNotice:
 *   401/403 → auth notice (missing_key kind + "check your key" copy)
 *   400     → model/config notice (not "temporary")
 *   other   → keep provider_error (genuinely transient)
 */

import { describe, expect, it } from "vitest";
import { HttpError } from "../harness/llm-client.js";
import { mapErrorToNotice } from "../services/agent-work-assistant.js";

describe("mapErrorToNotice — HttpError mapping", () => {
	it("HttpError 401 returns auth notice with key guidance, not temporary-error copy", () => {
		const err = new HttpError(401, "Unauthorized");
		const notice = mapErrorToNotice(err);
		// Must NOT say "usually temporary" — 401 is a permanent auth failure
		expect(notice.text).not.toMatch(/usually temporary|try again in a moment/i);
		// Should surface auth/key guidance
		expect(notice.text.toLowerCase()).toMatch(/key|credential|auth/);
	});

	it("HttpError 403 returns auth notice with key guidance, not temporary-error copy", () => {
		const err = new HttpError(403, "Forbidden");
		const notice = mapErrorToNotice(err);
		expect(notice.text).not.toMatch(/usually temporary|try again in a moment/i);
		expect(notice.text.toLowerCase()).toMatch(/key|credential|auth/);
	});

	it("HttpError 400 returns model/config notice, not temporary-error copy", () => {
		const err = new HttpError(400, "Bad Request");
		const notice = mapErrorToNotice(err);
		// 400 is deterministic (wrong model id, bad config) — NOT transient
		expect(notice.text).not.toMatch(/usually temporary|try again in a moment/i);
	});

	it("HttpError 500 returns provider_error (transient server error)", () => {
		const err = new HttpError(500, "Internal Server Error");
		const notice = mapErrorToNotice(err);
		expect(notice.kind).toBe("provider_error");
	});

	it("HttpError 429 returns provider_error (rate limit — transient)", () => {
		const err = new HttpError(429, "Too Many Requests");
		const notice = mapErrorToNotice(err);
		expect(notice.kind).toBe("provider_error");
	});
});
