/**
 * I2 — V2: `updateBetSchema.field` must be a Zod enum of MUTABLE_BET_FIELDS,
 * not a free-form string. An invalid field ("evil") must surface as a 400
 * from Zod, not a 500 from the bet-state-machine.
 *
 * Red phase: today's schema is `z.string()`; bad fields fall through to
 * `updateBetField(...)` which throws a generic Error and the global error
 * handler maps to 500.
 */

import { bets, createTestDb, type HyperIdleDb, products, teams } from "@hyperidle/db";
import { API_ERROR_CODES, EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transitionBet } from "../../services/bet-state-machine.js";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-bets-validation";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("I2 V2 — PATCH /api/bets/:id field enum", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		const now = new Date().toISOString();
		db.insert(products).values({ id: "p1", name: "P", phase: "build", createdAt: now }).run();
		db.insert(teams)
			.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
			.run();
		db.insert(bets)
			.values({
				id: "bet1",
				productId: "p1",
				teamId: "t1",
				pitch: "x",
				appetite: "small",
				status: "shaped",
				createdAt: now,
			})
			.run();
		// Move into in_progress so updateBetField doesn't reject on state.
		await transitionBet(db, eventBus, "bet1", "committed");
		await transitionBet(db, eventBus, "bet1", "in_progress");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 400 (Zod) when field is not in MUTABLE_BET_FIELDS", async () => {
		const res = await app.request("/api/bets/bet1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "evil", value: "x", reason: "y" }),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
	});

	it("accepts each legal field value (done_condition / hypothesis / cost_appetite)", async () => {
		const fieldValues: Record<string, string> = {
			done_condition: "v",
			hypothesis: "v",
			cost_appetite: "v",
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
