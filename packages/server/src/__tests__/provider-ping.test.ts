/**
 * L10 — provider-ping unit tests.
 *
 * Covers timeout (S1), error-type dictionary (S6), and structural
 * variants of the upstream response body (T1).
 */
import { describe, expect, it } from "vitest";
import { type FetchLike, pingAnthropic } from "../services/provider-ping.js";

function fetcherFor(opts: {
	status: number;
	body?: unknown;
	delayMs?: number;
	throwError?: Error;
}): FetchLike {
	return async (_url, init) => {
		if (opts.throwError) throw opts.throwError;
		if (opts.delayMs && opts.delayMs > 0) {
			await new Promise<void>((resolve, reject) => {
				const t = setTimeout(resolve, opts.delayMs);
				init?.signal?.addEventListener("abort", () => {
					clearTimeout(t);
					const e = new Error("aborted");
					e.name = "AbortError";
					reject(e);
				});
			});
		}
		const bodyStr = opts.body === undefined ? null : JSON.stringify(opts.body);
		return new Response(bodyStr, {
			status: opts.status,
			headers: { "Content-Type": "application/json" },
		});
	};
}

describe("pingAnthropic", () => {
	describe("S1 — timeout", () => {
		it("aborts and returns ok:false when fetcher exceeds the deadline", async () => {
			const fetcher = fetcherFor({ status: 200, delayMs: 1_000 });
			const result = await pingAnthropic({
				key: "sk-ant-x",
				fetcher,
				timeoutMs: 25,
			});
			expect(result.ok).toBe(false);
			expect(result.status).toBe(0);
			expect(result.message).toMatch(/timed out/i);
		});
	});

	describe("S6 — error-type dictionary", () => {
		it("maps authentication_error to a fixed string and discards upstream message", async () => {
			const fetcher = fetcherFor({
				status: 401,
				body: {
					error: { type: "authentication_error", message: "your secret was sk-ant-leaked" },
				},
			});
			const result = await pingAnthropic({ key: "sk-ant-x", fetcher });
			expect(result.ok).toBe(false);
			expect(result.status).toBe(401);
			expect(result.message).toBe("Authentication failed. Check the API key.");
			expect(result.message).not.toContain("sk-ant-leaked");
		});

		it("maps rate_limit_error to its fixed string", async () => {
			const fetcher = fetcherFor({
				status: 429,
				body: { error: { type: "rate_limit_error" } },
			});
			const result = await pingAnthropic({ key: "sk-ant-x", fetcher });
			expect(result.message).toBe("Rate limit exceeded. Try again shortly.");
		});

		it("falls back for unknown error types without echoing them", async () => {
			const fetcher = fetcherFor({
				status: 500,
				body: { error: { type: "weird_new_error" } },
			});
			const result = await pingAnthropic({ key: "sk-ant-x", fetcher });
			expect(result.message).toBe("Provider returned an unknown error.");
			expect(result.message).not.toContain("weird");
		});
	});

	describe("T1 — error-body branches", () => {
		it("handles a 5xx with a non-JSON body", async () => {
			const fetcher: FetchLike = async () =>
				new Response("upstream toast", { status: 502 });
			const result = await pingAnthropic({ key: "sk-ant-x", fetcher });
			expect(result.ok).toBe(false);
			expect(result.status).toBe(502);
			expect(result.message).toBe("HTTP 502");
		});

		it("handles a network throw", async () => {
			const fetcher = fetcherFor({ status: 0, throwError: new Error("ECONNREFUSED") });
			const result = await pingAnthropic({ key: "sk-ant-x", fetcher });
			expect(result.ok).toBe(false);
			expect(result.status).toBe(0);
			expect(result.message).toBe("Network error.");
		});

		it("handles a 4xx with missing error envelope", async () => {
			const fetcher = fetcherFor({ status: 400, body: { random: "shape" } });
			const result = await pingAnthropic({ key: "sk-ant-x", fetcher });
			expect(result.ok).toBe(false);
			expect(result.status).toBe(400);
			expect(result.message).toBe("HTTP 400");
		});

		it("handles a 4xx with a non-object JSON body", async () => {
			const fetcher = fetcherFor({ status: 400, body: "not an object" });
			const result = await pingAnthropic({ key: "sk-ant-x", fetcher });
			expect(result.ok).toBe(false);
			expect(result.status).toBe(400);
			expect(result.message).toBe("HTTP 400");
		});

		it("returns ok:true on a 200", async () => {
			const fetcher = fetcherFor({ status: 200, body: { id: "msg" } });
			const result = await pingAnthropic({ key: "sk-ant-x", fetcher });
			expect(result.ok).toBe(true);
			expect(result.status).toBe(200);
		});
	});

	// E2E real-provider test placeholder. Spec contract: the production
	// flow MUST hit a real endpoint with `max_tokens: 1` and never store
	// the response body. We keep this skipped so the contract is
	// documented in source.
	it.skip("hits a real endpoint with max_tokens 1 (requires live ANTHROPIC_API_KEY env)", async () => {
		const key = process.env.HYPERIDLE_TEST_ANTHROPIC_KEY;
		if (!key) return;
		const result = await pingAnthropic({ key });
		expect(result.ok).toBe(true);
	});
});
