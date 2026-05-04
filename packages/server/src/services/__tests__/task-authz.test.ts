/**
 * L15 — assertTaskParticipantAuthz pure unit tests.
 *
 * Source: docs/work-packages/L15-plan.md §2.6 + §12 row.
 *
 * Pure function over (db, senderId, task). Resolution order:
 *   1. senderId === "u-founder" → ok (founder bypass)
 *   2. agents row whose role === "founder" → ok
 *   3. agents row whose team_id === task.team_id → ok
 *   4. else 404 (no information leak)
 */

import { agents, createTestDb, type HyperIdleDb, products, teams } from "@hyperidle/db";
import { beforeEach, describe, expect, it } from "vitest";
import { assertTaskParticipantAuthz } from "../task-authz.js";

interface Ctx {
	db: HyperIdleDb;
}

interface FakeTask {
	id: string;
	teamId: string;
}

function setup(): Ctx {
	const db = createTestDb();
	const now = new Date().toISOString();
	db.insert(products).values({ id: "p1", name: "P", phase: "build", createdAt: now }).run();
	db.insert(teams)
		.values({ id: "team-A", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(teams)
		.values({ id: "team-B", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(agents)
		.values({ id: "u-founder", name: "F", role: "founder", status: "active", createdAt: now })
		.run();
	db.insert(agents)
		.values({
			id: "a-team-A",
			name: "AA",
			role: "builder",
			status: "active",
			teamId: "team-A",
			createdAt: now,
		})
		.run();
	db.insert(agents)
		.values({
			id: "a-team-B",
			name: "BB",
			role: "builder",
			status: "active",
			teamId: "team-B",
			createdAt: now,
		})
		.run();
	db.insert(agents)
		.values({
			id: "secondary-founder",
			name: "F2",
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.run();
	return { db };
}

describe("assertTaskParticipantAuthz", () => {
	let ctx: Ctx;
	beforeEach(() => {
		ctx = setup();
	});

	const taskA: FakeTask = { id: "task-A", teamId: "team-A" };

	it("founder bypass: senderId 'u-founder' is always ok", () => {
		// biome-ignore lint/suspicious/noExplicitAny: pure-fn boundary, db typed via @hyperidle/db
		const r = assertTaskParticipantAuthz(ctx.db, "u-founder", taskA as any);
		expect(r.ok).toBe(true);
	});

	it("team member match: agent whose team_id === task.team_id is ok", () => {
		// biome-ignore lint/suspicious/noExplicitAny: pure-fn boundary
		const r = assertTaskParticipantAuthz(ctx.db, "a-team-A", taskA as any);
		expect(r.ok).toBe(true);
	});

	it("role=founder agent (not the constant) is also ok", () => {
		// biome-ignore lint/suspicious/noExplicitAny: pure-fn boundary
		const r = assertTaskParticipantAuthz(ctx.db, "secondary-founder", taskA as any);
		expect(r.ok).toBe(true);
	});

	it("phantom identity (no agents row, not 'u-founder') → 404", () => {
		// biome-ignore lint/suspicious/noExplicitAny: pure-fn boundary
		const r = assertTaskParticipantAuthz(ctx.db, "ghost-xyz", taskA as any);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.status).toBe(404);
	});

	it("cross-team agent → 404 (no information leak)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: pure-fn boundary
		const r = assertTaskParticipantAuthz(ctx.db, "a-team-B", taskA as any);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.status).toBe(404);
	});
});
