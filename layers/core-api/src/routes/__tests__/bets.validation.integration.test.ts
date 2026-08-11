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
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { getTeamMembers, updateTeam } from "@hyperidle/org";
import { transitionBet, type WorkDeps } from "@hyperidle/work";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

// AU19 Increment 1c: `work`'s `TeamCapacityReader` port (Mechanism C), wired
// to the real migrated `org` Service.
const teamCapacity: WorkDeps["teamCapacity"] = {
	getByTeamId: (db, teamId) => getTeamMembers(db, { teamId }),
	setActiveBets: (db, teamId, activeBets) => updateTeam(db, teamId, { activeBets }),
};

const TEST_API_KEY = "test-key-bets-validation";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBet(db: HyperIdleDb, eventBus: EventBus, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: ids("p1"), name: "P", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: ids("t1"), teamId: ids("p1"), capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(bets).values({
		id: ids("bet1"),
		teamId: ids("p1"),
		description: "x",
		appetite: "small",
		status: "draft",
		createdAt: now,
	});

	// @lore U1: Move into active (formerly in_progress) so updateBetField doesn't reject on state.
	await transitionBet(db, eventBus, teamCapacity, ids("bet1"), "active");
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
		ids,
	}) => {
		await seedBet(db, eventBus, ids);
		const res = await app.request(`/api/bets/${ids("bet1")}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "evil", value: "x", reason: "y" }),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
	});

	// @lore AU21 Increment 14a: "cost_appetite" removed from the legal-field
	// set — `bets.costAppetiteMinor/costAppetiteCurrency` are dropped columns
	// and `updateBetCostAppetiteSchema` is HARD-DELETED, no replacement.
	test("accepts each legal field value (done_condition / hypothesis)", async ({
		db,
		app,
		eventBus,
		ids,
	}) => {
		await seedBet(db, eventBus, ids);
		const fieldValues: Record<string, unknown> = {
			done_condition: "v",
			hypothesis: "v",
		};
		for (const field of ["done_condition", "hypothesis"]) {
			const res = await app.request(`/api/bets/${ids("bet1")}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ field, value: fieldValues[field], reason: "r" }),
			});
			expect(res.status, `${field} should not 400`).not.toBe(400);
		}
	});
});
