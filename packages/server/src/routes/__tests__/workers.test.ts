/**
 * S2 — Workers admin endpoint: integration tests (AC5).
 *
 * Tests that GET /api/workers:
 * - returns 401 without auth
 * - returns 200 with AdapterInfo[] when authenticated
 * - reflects pool contents accurately
 *
 * These fail (red phase) until `routes/workers.ts` is created and wired.
 */

import { AdapterPool } from "@hyperidle/agent-layer";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import { createWorkersRoutes } from "../../routes/workers.js";

const TEST_API_KEY = "test-workers-key";

// ── Minimal stub adapter ─────────────────────────────────────────────────────

function makeAdapter(): HarnessAdapter {
	return {
		async startSession(_config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: "stub" };
		},
		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {},
		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return {
				outcome: "completed",
				cost: { minor: 0, currency: "USD" },
				tokenUsage: { byTier: {} },
			};
		},
		getCapabilities(): HarnessCapabilities {
			return {
				preCompactionTrigger: true,
				subAgents: true,
				modelProviders: ["anthropic"],
				mcpSupport: false,
				returnEnforcement: "none",
			};
		},
	};
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

function makeRouterAndPool() {
	const pool = new AdapterPool();
	const router = createWorkersRoutes(pool);
	return { pool, router };
}

async function callRoute(
	router: ReturnType<typeof createWorkersRoutes>,
	apiKey: string | null,
): Promise<{ status: number; body: unknown }> {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (apiKey) {
		headers["X-API-Key"] = apiKey;
	}

	const req = new Request("http://localhost/", {
		method: "GET",
		headers,
	});

	// Inject the env variable for auth check
	const originalKey = process.env.HYPERIDLE_API_KEY;
	process.env.HYPERIDLE_API_KEY = TEST_API_KEY;

	try {
		const res = await router.fetch(req);
		const body = await res.json();
		return { status: res.status, body };
	} finally {
		if (originalKey === undefined) {
			delete process.env.HYPERIDLE_API_KEY;
		} else {
			process.env.HYPERIDLE_API_KEY = originalKey;
		}
	}
}

// ── Auth checks ───────────────────────────────────────────────────────────────

describe("GET /api/workers — auth", () => {
	it("returns 401 without API key", async () => {
		const { router } = makeRouterAndPool();
		const result = await callRoute(router, null);
		expect(result.status).toBe(401);
	});

	it("returns 401 with wrong API key", async () => {
		const { router } = makeRouterAndPool();
		const result = await callRoute(router, "wrong-key");
		expect(result.status).toBe(401);
	});

	it("returns 200 with correct API key", async () => {
		const { router } = makeRouterAndPool();
		const result = await callRoute(router, TEST_API_KEY);
		expect(result.status).toBe(200);
	});
});

// ── Response shape ────────────────────────────────────────────────────────────

describe("GET /api/workers — response shape", () => {
	it("returns empty array when pool is empty", async () => {
		const { router } = makeRouterAndPool();
		const result = await callRoute(router, TEST_API_KEY);
		expect(result.status).toBe(200);
		expect(Array.isArray(result.body)).toBe(true);
		expect((result.body as unknown[]).length).toBe(0);
	});

	it("returns AdapterInfo[] matching pool contents", async () => {
		const { pool, router } = makeRouterAndPool();
		pool.register("local", makeAdapter(), {
			name: "server",
			kind: "local",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const result = await callRoute(router, TEST_API_KEY);
		expect(result.status).toBe(200);

		const body = result.body as Array<{
			id: string;
			name: string;
			kind: string;
			modelProviders: string[];
			currentLoad: number;
			maxConcurrent: number;
			connectedSince: string;
		}>;
		expect(body).toHaveLength(1);
		expect(body[0]?.id).toBe("local");
		expect(body[0]?.name).toBe("server");
		expect(body[0]?.kind).toBe("local");
		expect(body[0]?.modelProviders).toEqual(["anthropic"]);
		expect(body[0]?.currentLoad).toBe(0);
		expect(body[0]?.maxConcurrent).toBe(4);
		expect(body[0]?.connectedSince).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("returns both local and remote adapters", async () => {
		const { pool, router } = makeRouterAndPool();
		pool.register("local", makeAdapter(), {
			name: "server",
			kind: "local",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});
		pool.register("worker-abc", makeAdapter(), {
			name: "macbook",
			kind: "remote",
			modelProviders: ["anthropic"],
			maxConcurrent: 2,
		});

		const result = await callRoute(router, TEST_API_KEY);
		const body = result.body as Array<{ id: string; kind: string }>;
		expect(body).toHaveLength(2);
		const kinds = body.map((e) => e.kind);
		expect(kinds).toContain("local");
		expect(kinds).toContain("remote");
	});

	it("reflects current load accurately", async () => {
		const { pool, router } = makeRouterAndPool();
		pool.register("local", makeAdapter(), {
			name: "server",
			kind: "local",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		// Select one slot (increments load)
		pool.select();

		const result = await callRoute(router, TEST_API_KEY);
		const body = result.body as Array<{ currentLoad: number }>;
		expect(body[0]?.currentLoad).toBe(1);
	});
});
