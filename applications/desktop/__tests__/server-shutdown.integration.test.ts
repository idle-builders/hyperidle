/** Quitting closes the server even while the app's live connection is still open. */
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { vi } from "vitest";
import { createServer } from "../src/create-server.js";

describe("server shutdown", () => {
	test("finishes while a live connection is open", async ({ db }) => {
		const apiKey = `shutdown-key-${Math.random().toString(36).slice(2)}`;
		vi.stubEnv("HYPERIDLE_API_KEY", apiKey);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "server-shutdown-test-secret-32-chars!");
		const server = await createServer(0, {
			db,
			topology: "disabled",
			sandboxBasePath: path.join(os.tmpdir(), `server-shutdown-${Date.now()}`),
		});
		const addr = server.httpServer.address();
		const port = typeof addr === "object" && addr !== null ? addr.port : 0;
		const res = await fetch(`http://127.0.0.1:${port}/api/auth/ws-token`, {
			method: "POST",
			headers: { "X-API-Key": apiKey },
		});
		const { token } = (await res.json()) as { token: string };
		const live = new WebSocket(`ws://127.0.0.1:${port}/api/ws?token=${encodeURIComponent(token)}`);
		await new Promise((resolve) => live.addEventListener("open", resolve, { once: true }));

		const outcome = await Promise.race([
			server.dispose().then(() => "closed"),
			new Promise((resolve) => setTimeout(() => resolve("still open after 5s"), 5000)),
		]);

		expect(outcome).toBe("closed");
		vi.unstubAllEnvs();
	});
});
