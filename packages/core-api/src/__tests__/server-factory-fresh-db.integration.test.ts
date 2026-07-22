import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AdapterPool, DisabledSandboxAdapter } from "@hyperidle/harness-registry";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type ServerHandle } from "../server-factory.js";

describe("server factory fresh database boot", () => {
	let handle: ServerHandle | undefined;
	let dataDir: string | undefined;

	afterEach(async () => {
		await handle?.dispose();
		vi.unstubAllEnvs();
	});

	it("migrates a fresh PGlite database before services query it", async () => {
		dataDir = await mkdtemp(join(tmpdir(), "hyperidle-server-boot-"));
		vi.stubEnv("HYPERIDLE_PROFILE", "laptop");
		vi.stubEnv("DATABASE_URL", dataDir);
		vi.stubEnv("HYPERIDLE_API_KEY", "fresh-db-test-key");

		handle = await createServer(0, {
			adapterPool: new AdapterPool(),
			workspaceAdapter: new DisabledSandboxAdapter(),
		});

		const address = handle.httpServer.address();
		expect(address && typeof address !== "string").toBe(true);
		if (!address || typeof address === "string") return;
		const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
		expect(response.status).toBe(200);
	});
});
