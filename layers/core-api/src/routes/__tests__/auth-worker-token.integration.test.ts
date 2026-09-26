/**
 * POST /api/auth/worker-token: returns 200 with { token } when authenticated
 * and HYPERIDLE_WORKER_TOKEN is set, 404 (code NOT_FOUND) when it is not
 * configured, and 401 when not authenticated.
 */

import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

const TEST_API_KEY = "test-worker-token-key";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callWorkerToken(
	options: { apiKey?: string; workerToken?: string | undefined } = {},
): Promise<{ status: number; body: unknown }> {
	const originalApiKey = process.env.HYPERIDLE_API_KEY;
	const originalWorkerToken = process.env.HYPERIDLE_WORKER_TOKEN;

	process.env.HYPERIDLE_API_KEY = TEST_API_KEY;
	if (options.workerToken !== undefined) {
		process.env.HYPERIDLE_WORKER_TOKEN = options.workerToken;
	} else {
		delete process.env.HYPERIDLE_WORKER_TOKEN;
	}

	try {
		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (options.apiKey !== undefined) {
			headers["X-API-Key"] = options.apiKey;
		}

		const app = await createTestApp({ sharedMode: true });

		const res = await app.request("/api/auth/worker-token", {
			method: "POST",
			headers,
		});
		const body = await res.json();
		return { status: res.status, body };
	} finally {
		if (originalApiKey === undefined) {
			delete process.env.HYPERIDLE_API_KEY;
		} else {
			process.env.HYPERIDLE_API_KEY = originalApiKey;
		}
		if (originalWorkerToken === undefined) {
			delete process.env.HYPERIDLE_WORKER_TOKEN;
		} else {
			process.env.HYPERIDLE_WORKER_TOKEN = originalWorkerToken;
		}
	}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/auth/worker-token", () => {
	test("returns 401 without authentication", async ({}) => {
		const result = await callWorkerToken({ workerToken: "test-secret-token" });
		expect(result.status).toBe(401);
	});

	test("returns 404 with error code NOT_FOUND when HYPERIDLE_WORKER_TOKEN is not set", async ({}) => {
		// workerToken undefined → env var deleted
		const result = await callWorkerToken({
			apiKey: TEST_API_KEY,
			workerToken: undefined,
		});
		expect(result.status).toBe(404);
		const body = result.body as { code: string };
		expect(body.code).toBe("NOT_FOUND");
	});

	test("returns 200 with { token } when authenticated and HYPERIDLE_WORKER_TOKEN is set", async ({}) => {
		const result = await callWorkerToken({
			apiKey: TEST_API_KEY,
			workerToken: "my-worker-secret",
		});
		expect(result.status).toBe(200);
		const body = result.body as { token: string };
		expect(body.token).toBe("my-worker-secret");
	});
});
