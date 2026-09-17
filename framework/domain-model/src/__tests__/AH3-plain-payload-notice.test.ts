/**
 * AH3 — PlainPayload.notice optional field round-trip test.
 *
 * @lore BC3 Reconciliation R9: `notice` has NO production writer — `rg
 * AssistantNotice` finds only this file's own schemas, the two domain-model
 * declarations, `AssistantOverlay.tsx`'s renderer and one e2e fixture. It
 * therefore drops off `send_message`'s WRITE-side `PlainPayload` (moved to
 * `actions/thread.ts`'s `plainPayloadSchema`) and stays only on the READ
 * side (`plainReadPayloadSchema`/`PlainReadPayload`), so historical rows
 * still render. This test moved from asserting the write shape to asserting
 * the read shape it now actually describes.
 */

import { describe, expect, test } from "vitest";
import type { PlainReadPayload } from "../actions/thread.js";

describe("AH3: PlainReadPayload.notice optional field", () => {
	test("PlainReadPayload with notice.kind=missing_key round-trips through JSON", () => {
		const payload: PlainReadPayload = {
			text: "I can't think yet — no API key is configured.",
			notice: { kind: "missing_key" },
		};

		const json = JSON.stringify(payload);
		const parsed = JSON.parse(json) as PlainReadPayload;

		expect(parsed.text).toBe(payload.text);
		expect(parsed.notice?.kind).toBe("missing_key");
	});

	test("PlainReadPayload with notice.kind=missing_harness round-trips", () => {
		const payload: PlainReadPayload = {
			text: "My runtime isn't set up.",
			notice: { kind: "missing_harness" },
		};

		const parsed = JSON.parse(JSON.stringify(payload)) as PlainReadPayload;
		expect(parsed.notice?.kind).toBe("missing_harness");
	});

	test("PlainReadPayload with notice.kind=provider_error and code round-trips", () => {
		const payload: PlainReadPayload = {
			text: "The model provider returned an error.",
			notice: { kind: "provider_error", code: "rate_limited" },
		};

		const parsed = JSON.parse(JSON.stringify(payload)) as PlainReadPayload;
		expect(parsed.notice?.kind).toBe("provider_error");
		expect(parsed.notice?.code).toBe("rate_limited");
	});

	test("PlainReadPayload without notice is still valid (backward compat)", () => {
		const payload: PlainReadPayload = {
			text: "Hello from the assistant.",
		};

		const parsed = JSON.parse(JSON.stringify(payload)) as PlainReadPayload;
		expect(parsed.text).toBe("Hello from the assistant.");
		expect(parsed.notice).toBeUndefined();
	});

	test("notice kind is one of the three valid values", () => {
		const kinds = ["missing_key", "missing_harness", "provider_error"] as const;

		for (const kind of kinds) {
			const payload: PlainReadPayload = {
				text: `Notice for ${kind}`,
				notice: { kind },
			};
			const parsed = JSON.parse(JSON.stringify(payload)) as PlainReadPayload;
			expect(parsed.notice?.kind).toBe(kind);
		}
	});
});
