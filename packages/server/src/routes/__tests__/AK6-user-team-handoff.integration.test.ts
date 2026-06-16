/**
 * AK6 Phase 4 fix — CRITICAL-1: SetupFlow→users→teams userId handoff.
 *
 * The reviewer caught that POST /api/users 201 response changed to { user: ... }
 * but SetupFlow.tsx read userBody?.id (flat shape), so createdUserId became
 * undefined → POST /api/teams received userId: undefined → welcome-message seeding
 * was silently skipped.
 *
 * This test asserts the cross-service contract that the reviewer's integration
 * tests missed: the userId from POST /api/users must flow correctly into
 * POST /api/teams and trigger welcome-thread seeding.
 *
 * RED before fix: either userId extraction is wrong (if 201 returns flat but test
 * reads wrapped) or seeding is skipped (if userId is undefined in teams call).
 * GREEN after fix: both 201 and 200 paths return the same shape; userId flows;
 * thread exists.
 */

import { threads } from "@hyperidle/db";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-handoff";

function headers(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("AK6 CRITICAL-1: POST /api/users → POST /api/teams userId handoff", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		setActiveStrategy(minimalStrategy);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		clearActiveStrategy();
	});

	/**
	 * The core contract: whatever shape POST /api/users returns on 201,
	 * the response must contain an extractable id (not undefined) so
	 * SetupFlow can pass userId to POST /api/teams.
	 *
	 * Before fix: 201 returned { user: { id } } but SetupFlow read body.id → undefined.
	 * After fix: both 201 and 200 return { user: { id } }; SetupFlow reads body.user.id.
	 * OR: both return flat { id }; SetupFlow reads body.id.
	 * Either way, the shape must be CONSISTENT and the id must be defined.
	 */
	test("POST /api/users 201 response contains an extractable id at a consistent path", async ({
		app,
	}) => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" }, // unauthenticated — setup mode
			body: JSON.stringify({ name: "Setup Founder" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;

		// Both the wrapped shape { user: { id } } and flat shape { id } are acceptable,
		// but the shape MUST be consistent across 201 and 200 paths.
		// After the fix we assert the specific shape chosen (wrapped { user: { id } }).
		const wrappedUser = body.user as Record<string, unknown> | undefined;
		expect(wrappedUser).toBeDefined();
		expect(typeof wrappedUser?.id).toBe("string");
		expect((wrappedUser?.id as string).length).toBeGreaterThan(0);
	});

	test("POST /api/users 200 (idempotent) returns same shape as 201", async ({ app }) => {
		// First call — creates user
		const first = await app.request("/api/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Setup Founder" }),
		});
		expect(first.status).toBe(201);
		const firstBody = (await first.json()) as { user: { id: string } };
		const createdId = firstBody.user.id;
		expect(typeof createdId).toBe("string");

		// Second call — idempotent 200 must return the same wrapped shape
		const second = await app.request("/api/users", {
			method: "POST",
			headers: headers(), // auth required since human exists
			body: JSON.stringify({ name: "Setup Founder Again" }),
		});
		expect(second.status).toBe(200);
		const secondBody = (await second.json()) as { user: { id: string } };

		// Critical: same shape — { user: { id } } — not flat
		expect(typeof secondBody.user).toBe("object");
		expect(secondBody.user.id).toBe(createdId);
	});

	test("userId from POST /api/users flows into POST /api/teams and seeds welcome thread", async ({
		db,
		app,
	}) => {
		// Step 1: Create human user (SetupFlow step 1)
		const userRes = await app.request("/api/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Onboarding Founder" }),
		});
		expect(userRes.status).toBe(201);
		const userBody = (await userRes.json()) as { user: { id: string } };

		// This is the exact read SetupFlow performs after the fix:
		const createdUserId = userBody.user?.id;
		expect(typeof createdUserId).toBe("string"); // must not be undefined

		// Step 2: Create team with userId (SetupFlow step 2)
		const teamRes = await app.request("/api/teams", {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({
				name: "Onboarding Team",
				functions: ["development"],
				userId: createdUserId,
			}),
		});
		expect(teamRes.status).toBe(201);

		// Assert: welcome thread exists (userId was not undefined → seeding ran)
		const expectedThreadId = `thr-ast-${createdUserId}`;
		const threadRows = await db
			.select()
			.from(threads)
			.where(eq(threads.id, expectedThreadId));
		expect(threadRows).toHaveLength(1);
		expect(threadRows[0]?.id).toBe(expectedThreadId);
	});
});
