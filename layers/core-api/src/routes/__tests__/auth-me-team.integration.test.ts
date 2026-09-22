/**
 * GET /api/auth/me — teamId in the response (AF13 §6 gate-walk fix).
 *
 * `useCurrentUser` and `ScopeChangeDialog` read `teamId` off this response to
 * decide whether "Team" scope can be chosen. Before this fix the route never
 * projected the column, so no person could ever pick Team scope.
 */

import { CORE_API_ACTOR_OVERRIDE_HEADER } from "@hyperidle/api-contract";
import { teams, users } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

function actorHeaders(actorId: string): Record<string, string> {
	return {
		"Content-Type": "application/json",
		[CORE_API_ACTOR_OVERRIDE_HEADER]: actorId,
	};
}

describe("GET /api/auth/me — teamId", () => {
	const NOW = new Date().toISOString();

	test("returns the seeded user's teamId when the user belongs to a team", async ({ app, db }) => {
		await db
			.insert(teams)
			.values({ id: "t-auth-me", name: "Acme", phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: "u-auth-me-team",
			kind: "human",
			name: "Teamed Human",
			role: "founder",
			status: "active",
			email: "teamed@test.com",
			teamId: "t-auth-me",
			createdAt: NOW,
		});

		const res = await app.request("/api/auth/me", {
			headers: actorHeaders("u-auth-me-team"),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as { id: string; teamId: string | null };
		expect(body.id).toBe("u-auth-me-team");
		expect(body.teamId).toBe("t-auth-me");
	});

	test("returns null teamId for a team-less user", async ({ app, db }) => {
		await db.insert(users).values({
			id: "u-auth-me-no-team",
			kind: "human",
			name: "Teamless Human",
			role: "founder",
			status: "active",
			email: "teamless@test.com",
			createdAt: NOW,
		});

		const res = await app.request("/api/auth/me", {
			headers: actorHeaders("u-auth-me-no-team"),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as { id: string; teamId: string | null };
		expect(body.id).toBe("u-auth-me-no-team");
		expect(body.teamId).toBeNull();
	});
});
