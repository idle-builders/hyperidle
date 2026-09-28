/**
 * A fresh remote-server boot writes the hidden system actor.
 *
 * Proves that `createServer` calls `applyFactoryCoreState` so a cloud/VPS
 * deploy gets the required `system:propagation` row without an out-of-band
 * bootstrap step.
 */
import * as os from "node:os";
import * as path from "node:path";
import { users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { afterEach, vi } from "vitest";
import { createServer } from "../create-server.js";

describe("createServer factory bootstrap", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("writes system:propagation actor on a fresh boot without an explicit bootstrap call", async ({
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "factory-bootstrap-test-key");
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "factory-bootstrap-secret-32-chars!!!!");
		const server = await createServer(0, {
			db,
			topology: "disabled",
			sandboxBasePath: path.join(os.tmpdir(), "factory-bootstrap-test"),
		});
		try {
			const rows = await db.select({ id: users.id, role: users.role }).from(users);
			const systemActor = rows.find((r) => r.id === "system:propagation");
			expect(systemActor).toBeDefined();
			expect(systemActor?.role).toBe("system");
		} finally {
			await server.dispose();
		}
	}, 30_000);
});
