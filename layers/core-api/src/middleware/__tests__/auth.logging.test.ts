/**
 * `authMiddleware` WARN-logs every rejected request with timestamp, request
 * path, method, and source IP. The supplied API key must never appear in the
 * log line — only the failure metadata an incident responder needs to
 * correlate against access logs.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authMiddleware } from "../auth.js";

const TEST_API_KEY = "test-key-auth-logging";

function buildApp(): Hono {
	const app = new Hono();
	app.use("*", authMiddleware);
	app.get("/probe", (c) => c.json({ ok: true }));
	return app;
}

describe("authMiddleware WARN-logs rejected requests", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		// Logger writes to console.* — silence + capture.
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it("emits a WARN line on a wrong-key request", async () => {
		const app = buildApp();
		const res = await app.request("/probe", {
			headers: { "X-API-Key": "wrong-key" },
		});
		expect(res.status).toBe(401);
		expect(warnSpy).toHaveBeenCalled();

		// The combined log payload should mention the path + method but
		// NEVER the supplied key.
		const output = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
		expect(output).toContain("/probe");
		expect(output).toContain("GET");
		expect(output).not.toContain("wrong-key");
		expect(output).not.toContain(TEST_API_KEY);
	});

	it("emits a WARN line on a missing-header request", async () => {
		const app = buildApp();
		const res = await app.request("/probe");
		expect(res.status).toBe(401);
		expect(warnSpy).toHaveBeenCalled();
	});

	it("does NOT emit a WARN line on a valid-key request", async () => {
		const app = buildApp();
		const res = await app.request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(res.status).toBe(200);
		expect(warnSpy).not.toHaveBeenCalled();
	});
});
