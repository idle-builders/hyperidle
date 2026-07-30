import type { HyperIdleDb } from "@hyperidle/db";
import { AdapterPool, createSandboxAdapter } from "@hyperidle/harness-registry";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { createServer, type ServerHandle } from "../server-factory.js";
import { test as fixtureTest } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-au3-boot";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

async function boot(db: HyperIdleDb): Promise<{ handle: ServerHandle; baseUrl: string }> {
	const handle = await createServer(0, {
		db,
		adapterPool: new AdapterPool(),
		workspaceAdapter: createSandboxAdapter("disabled"),
		sandboxBasePath: "/tmp/au3-boot-workspaces",
	});
	const address = handle.httpServer.address();
	if (!address || typeof address === "string") {
		throw new Error("createServer did not bind a TCP address");
	}
	return { handle, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe("app runtime route boot", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	fixtureTest(
		"createServer boots app-owned routes without runtime package setup",
		async ({ db }) => {
			const { handle, baseUrl } = await boot(db);
			try {
				const routeChecks = [
					["/api/health", false],
					["/api/knowledge", true],
					["/api/routines", true],
					["/api/notifications", true],
					["/api/harnesses", true],
				] as const;

				for (const [path, authed] of routeChecks) {
					const res = await fetch(`${baseUrl}${path}`, {
						headers: authed ? authHeaders() : undefined,
					});
					expect(res.status, path).toBe(200);
				}
			} finally {
				handle.dispose();
			}
		},
	);
});
