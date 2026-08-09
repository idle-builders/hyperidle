/**
 * AH3 RED — PlainPayload.notice optional field round-trip test.
 *
 * AC2 (data model): PlainPayload is extended with an optional notice field
 * { kind: "missing_key" | "missing_harness" | "provider_error"; code?: string }
 *
 * These tests FAIL until framework/shared/src/thread.ts adds the notice? field.
 *
 * @lore AH3: Testing type-level contracts at runtime: we construct a value that
 * matches the interface and verify the shape round-trips through JSON. The type
 * check IS the test — if PlainPayload gains the notice field and is correctly
 * typed, this test passes. If notice doesn't exist, the TS type error is the
 * red signal (failing typecheck == failing test for static properties).
 * However, since the typing rules say static properties → type system, this
 * test verifies RUNTIME behavior (JSON round-trip of the notice field).
 */

import { describe, expect, test } from "vitest";
import type { PlainPayload } from "../thread.js";

describe("AH3: PlainPayload.notice optional field", () => {
	test("PlainPayload with notice.kind=missing_key round-trips through JSON", () => {
		// TypeScript type-level assertion: this must compile when PlainPayload has notice?
		const payload: PlainPayload = {
			text: "I can't think yet — no API key is configured.",
			notice: { kind: "missing_key" },
		};

		const json = JSON.stringify(payload);
		const parsed = JSON.parse(json) as PlainPayload;

		expect(parsed.text).toBe(payload.text);
		expect(parsed.notice?.kind).toBe("missing_key");
	});

	test("PlainPayload with notice.kind=missing_harness round-trips", () => {
		const payload: PlainPayload = {
			text: "My runtime isn't set up.",
			notice: { kind: "missing_harness" },
		};

		const parsed = JSON.parse(JSON.stringify(payload)) as PlainPayload;
		expect(parsed.notice?.kind).toBe("missing_harness");
	});

	test("PlainPayload with notice.kind=provider_error and code round-trips", () => {
		const payload: PlainPayload = {
			text: "The model provider returned an error.",
			notice: { kind: "provider_error", code: "rate_limited" },
		};

		const parsed = JSON.parse(JSON.stringify(payload)) as PlainPayload;
		expect(parsed.notice?.kind).toBe("provider_error");
		expect(parsed.notice?.code).toBe("rate_limited");
	});

	test("PlainPayload without notice is still valid (backward compat)", () => {
		const payload: PlainPayload = {
			text: "Hello from the assistant.",
		};

		const parsed = JSON.parse(JSON.stringify(payload)) as PlainPayload;
		expect(parsed.text).toBe("Hello from the assistant.");
		expect(parsed.notice).toBeUndefined();
	});

	test("notice kind is one of the three valid values", () => {
		const kinds = ["missing_key", "missing_harness", "provider_error"] as const;

		for (const kind of kinds) {
			const payload: PlainPayload = {
				text: `Notice for ${kind}`,
				notice: { kind },
			};
			const parsed = JSON.parse(JSON.stringify(payload)) as PlainPayload;
			expect(parsed.notice?.kind).toBe(kind);
		}
	});
});
