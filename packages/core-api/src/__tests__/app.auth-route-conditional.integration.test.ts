/**
 * I2 review arch H-3 — `/api/auth/ws-token` is only exposed when the
 * caller wires `registerWebSocket`. An app built without WS support must
 * not advertise (or accept requests on) the upgrade-token mint route —
 * the issued tokens would never be consumable.
 */

import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import { createTestApp } from "../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-app-auth-conditional";

describe("I2 review arch H-3 — `/api/auth/ws-token` is conditional on WS registration", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("a createTestApp() WITHOUT registerWebSocket does not mount /api/auth/ws-token", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus });

		const res = await app.request("/api/auth/ws-token", {
			method: "POST",
			headers: { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" },
		});
		expect(res.status).toBe(404);
	});

	test("a createTestApp() WITH registerWebSocket DOES mount /api/auth/ws-token", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({
			db,
			eventBus,
			// Stub: the test cares that mount-vs-no-mount toggles on the
			// hook's presence; the hook body is irrelevant here.
			registerWebSocket: () => {},
		});

		const res = await app.request("/api/auth/ws-token", {
			method: "POST",
			headers: { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { token?: string };
		expect(typeof body.token).toBe("string");
	});
});
