/**
 * `fetchModelEndpoints` must encode a model id's author/slug separator as a literal slash, not
 * `%2F` — the OpenRouter API treats it as a real path separator, not a query parameter, and
 * `encodeURIComponent` on the whole id breaks every endpoint lookup silently (404, no error
 * message). Split by "/" and encode each segment independently.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchModelEndpoints } from "../openrouter-catalog.js";

describe("fetchModelEndpoints — URL encoding", () => {
	let capturedUrl: string | undefined;

	beforeEach(() => {
		capturedUrl = undefined;
		// Mock global fetch to capture the URL and return a valid minimal response.
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string | URL | Request) => {
				capturedUrl = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
				return new Response(
					JSON.stringify({ data: { id: "deepseek/deepseek-v4-flash", endpoints: [] } }),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("constructs a URL with a literal slash, not %2F, for author/slug model ids", async () => {
		await fetchModelEndpoints("test-api-key", "deepseek/deepseek-v4-flash");

		expect(capturedUrl).toBeDefined();
		// Must contain the literal slash between segments — NOT %2F.
		expect(capturedUrl).toContain("deepseek/deepseek-v4-flash/endpoints");
		// Confirm the %2F encoding bug is NOT present.
		expect(capturedUrl).not.toContain("deepseek%2Fdeepseek-v4-flash");
	});

	it("constructs a URL with a literal slash for nested author/model-slug paths", async () => {
		await fetchModelEndpoints("test-api-key", "google/gemini-2.5-flash-preview-05-20");

		expect(capturedUrl).toBeDefined();
		expect(capturedUrl).toContain("google/gemini-2.5-flash-preview-05-20/endpoints");
		expect(capturedUrl).not.toContain("%2F");
	});
});
