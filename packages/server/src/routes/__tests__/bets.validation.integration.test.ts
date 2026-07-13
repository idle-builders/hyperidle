/**
 * I2 — V2: `updateBetSchema.field` must be a Zod enum of MUTABLE_BET_FIELDS,
 * not a free-form string. An invalid field ("evil") must surface as a 400
 * from Zod, not a 500 from the bet-state-machine.
 *
 * Red phase: today's schema is `z.string()`; bad fields fall through to
 * `updateBetField(...)` which throws a generic Error and the global error
 * handler maps to 500.
 */

import { bets, type HyperIdleDb, teamMembers, teams } from "@hyperidle/db";
import { API_ERROR_CODES, type EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { transitionBet } from "@hyperidle/core-app";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-bets-validation";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBet(db: HyperIdleDb, eventBus: EventBus): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1", name: "P", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(bets).values({
		id: "bet1",
		teamId: "p1",
		description: "x",
		appetite: "small",
		status: "draft",
		createdAt: now,
	});

	// @lore U1: Move into active (formerly in_progress) so updateBetField doesn't reject on state.
	await transitionBet(db, eventBus, "bet1", "active");
}

describe("I2 V2 — PATCH /api/bets/:id field enum", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 400 (Zod) when field is not in MUTABLE_BET_FIELDS", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedBet(db, eventBus);
		const res = await app.request("/api/bets/bet1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "evil", value: "x", reason: "y" }),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
	});

	test("accepts each legal field value (done_condition / hypothesis / cost_appetite)", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedBet(db, eventBus);
		// @lore L17: cost_appetite uses WireMoney (not a string), so each field has
		// a distinct value shape in the test fixture.
		const fieldValues: Record<string, unknown> = {
			done_condition: "v",
			hypothesis: "v",
			cost_appetite: { minor: 10000, currency: "USD" },
		};
		for (const field of ["done_condition", "hypothesis", "cost_appetite"]) {
			const res = await app.request("/api/bets/bet1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ field, value: fieldValues[field], reason: "r" }),
			});
			expect(res.status, `${field} should not 400`).not.toBe(400);
		}
	});
});
