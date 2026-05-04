/**
 * L15 — Pure unit tests for `assertTaskParticipantAuthz`.
 *
 * Source: L15-plan.md § 2.6 + § 12 protected row `task-authz.test.ts`.
 *
 * Red phase: the service module does not exist yet — the import fails until
 * `/write-code` creates `packages/server/src/services/task-authz.ts`.
 */

import {
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	products,
	tasks,
	teams,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error — module does not exist in red phase; green phase creates it.
import { assertTaskParticipantAuthz } from "../task-authz.js";

interface Setup {
	db: HyperIdleDb;
	taskA: typeof tasks.$inferSelect;
}

function setup(): Setup {
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
		.values({ id: "u-founder", name: "Founder", role: "founder", status: "active", createdAt: now })
		.run();
	db.insert(agents)
		.values({
			id: "agent-A1",
			name: "A",
			role: "builder",
			status: "active",
			teamId: "team-A",
			createdAt: now,
		})
		.run();
	db.insert(agents)
		.values({
			id: "agent-B1",
			name: "B",
			role: "builder",
			status: "active",
			teamId: "team-B",
			createdAt: now,
		})
		.run();
	db.insert(agents)
		.values({
			id: "agent-secondary-founder",
			name: "F2",
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.run();
	db.insert(bets)
		.values({
			id: "bet-A",
			productId: "p1",
			teamId: "team-A",
			pitch: "x",
			appetite: "small",
			status: "in_progress",
			createdAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-A",
			betId: "bet-A",
			productId: "p1",
			teamId: "team-A",
			title: "T",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	const taskA = db.select().from(tasks).where(eq(tasks.id, "task-A")).get();
	if (!taskA) throw new Error("task-A not found");
	return { db, taskA };
}

describe("assertTaskParticipantAuthz", () => {
	let s: Setup;

	beforeEach(() => {
		s = setup();
	});

	it("returns ok=true when senderId is the default founder constant `u-founder`", () => {
		const result = assertTaskParticipantAuthz(s.db, "u-founder", s.taskA);
		expect(result).toEqual({ ok: true });
	});

	it("returns ok=true when senderId resolves to an agents.id whose team_id matches the task", () => {
		const result = assertTaskParticipantAuthz(s.db, "agent-A1", s.taskA);
		expect(result).toEqual({ ok: true });
	});

	it("returns ok=true when senderId resolves to an agents.id with role='founder' (regardless of team)", () => {
		const result = assertTaskParticipantAuthz(s.db, "agent-secondary-founder", s.taskA);
		expect(result).toEqual({ ok: true });
	});

	it("returns 404 when senderId resolves to an agents.id from a different team", () => {
		const result = assertTaskParticipantAuthz(s.db, "agent-B1", s.taskA);
		expect(result).toMatchObject({ ok: false, status: 404 });
	});

	it("returns 404 when senderId matches no agents.id row and is not the founder constant", () => {
		const result = assertTaskParticipantAuthz(s.db, "phantom-id-12345", s.taskA);
		expect(result).toMatchObject({ ok: false, status: 404 });
	});
});
