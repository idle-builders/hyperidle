/**
 * AH5 Fix 1 regression test: fetchModelEndpoints URL encoding.
 *
 * Regression for the bug where `encodeURIComponent(modelId)` encoded the slash
 * in `author/slug` as `%2F`, causing every /endpoints lookup to 404.
 *
 * The correct encoding encodes per path-segment so the slash is preserved:
 *   deepseek/deepseek-v4-flash → .../deepseek/deepseek-v4-flash/endpoints  ✓
 *   (not)                      → .../deepseek%2Fdeepseek-v4-flash/endpoints  ✗
 *
 * This test mocks fetch and asserts the URL that fetchModelEndpoints constructs,
 * catching the %2F regression at the unit-test level.
 *
 * @lore AH5: encodeURIComponent("/") → "%2F". The OpenRouter API treats the
 * author/slug separator as a real path separator, not a query parameter. Using
 * encodeURIComponent on the whole modelId breaks every endpoint lookup silently
 * (OpenRouter returns 404, not an error message). Split by "/" and encode each
 * segment independently.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchModelEndpoints } from "../openrouter-catalog.js";

describe("fetchModelEndpoints — URL encoding (Fix 1 regression)", () => {
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
