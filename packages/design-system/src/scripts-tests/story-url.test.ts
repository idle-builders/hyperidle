/**
 * AJ4 — RED phase: storyViewerUrl() unit tests.
 *
 * Import path the green builder must implement:
 *   packages/design-system/scripts/design-evidence/story-url.ts
 */

import { describe, expect, test } from "vitest";
import { storyViewerUrl } from "../../scripts/design-evidence/story-url.js";

describe("storyViewerUrl", () => {
	test("produces the default localhost:8098 hash route", () => {
		expect(storyViewerUrl("AG6/RowDot")).toBe("http://localhost:8098/#AG6%2FRowDot");
	});

	test("URL-encodes the slash in a namespaced title", () => {
		const url = storyViewerUrl("AG6/RowDot");
		// Slash must be encoded as %2F
		expect(url).toContain("%2F");
		expect(url).not.toMatch(/#[^%]*\//); // no literal / after the #
	});

	test("URL-encodes spaces in the title", () => {
		const url = storyViewerUrl("My Component");
		expect(url).toContain("%20");
	});

	test("uses the hash (#) router convention", () => {
		const url = storyViewerUrl("AG6/RowDot");
		expect(url).toContain("/#");
	});

	test("accepts a custom base URL", () => {
		const url = storyViewerUrl("AG6/RowDot", "http://localhost:9000");
		expect(url).toBe("http://localhost:9000/#AG6%2FRowDot");
	});

	test("URL-encodes special characters in the title", () => {
		const url = storyViewerUrl("A&B > C");
		// & and > must be percent-encoded
		expect(url).not.toContain("&");
		expect(url).not.toContain(">");
	});

	test("handles a simple single-word title", () => {
		expect(storyViewerUrl("Avatar")).toBe("http://localhost:8098/#Avatar");
	});
});
