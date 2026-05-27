/**
 * L14 — Bet state machine: actor field in RevisionLogEntry (AC-5, T1).
 *
 * Extends bet-state-machine.test.ts with new assertions. Protected tests in
 * that file must NOT be changed — these are additive.
 */

import { bets, createTestDb, type HyperIdleDb, products, teams ,
	type TestDbHandle
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	type RevisionLogEntry,
	transitionBet,
	updateBetField,
} from "../services/bet-state-machine.js";

function makeProduct() {
	return { id: "prod-1", name: "Test", phase: "build", createdAt: new Date().toISOString() };
}
function makeTeam() {
	return {
		id: "team-1",
		productId: "prod-1",
		capacity: 3,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	};
}
function makeBet(status = "shaped") {
	return {
		id: "bet-1",
		productId: "prod-1",
		teamId: "team-1",
		pitch: "# Feature\nBody",
		appetite: "2 weeks",
		status,
		createdAt: new Date().toISOString(),
	};
}

function getLog(db: HyperIdleDb, betId: string): RevisionLogEntry[] {
	const [bet] = await db.select().from(bets).where(eq(bets.id, betId));
	if (!bet?.revisionLog) return [];
	return JSON.parse(bet.revisionLog) as RevisionLogEntry[];
}

describe("L14 — RevisionLogEntry actor field (T1)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		await db.insert(products).values(makeProduct());
		await db.insert(teams).values(makeTeam());
	});

	describe("transitionBet with actor option", () => {
		it("writes actor to the revision log when actor is provided", async () => {
			await db.insert(bets).values(makeBet("shaped"));

			await transitionBet(db, eventBus, "bet-1", "committed", { actor: "u-founder" });

			const log = getLog(db, "bet-1");
			expect(log).toHaveLength(1);
			expect(log[0].actor).toBe("u-founder");
		});

		it("actor is undefined in log when no actor is provided (backward compat)", async () => {
			await db.insert(bets).values(makeBet("shaped"));

			await transitionBet(db, eventBus, "bet-1", "committed");

			const log = getLog(db, "bet-1");
			expect(log).toHaveLength(1);
			// actor field is optional — absence is acceptable
			expect(log[0].actor).toBeUndefined();
		});

		it("passes actor through kill transition", async () => {
			await db.insert(bets).values(makeBet("shaped"));

			await transitionBet(db, eventBus, "bet-1", "killed", {
				reason: "Not viable",
				actor: "u-founder",
			});

			const log = getLog(db, "bet-1");
			expect(log[0].actor).toBe("u-founder");
		});

		it("passes actor through pause transition (in_progress → paused)", async () => {
			await db.insert(bets).values(makeBet("committed"));
			await transitionBet(db, eventBus, "bet-1", "in_progress");
			const logBefore = getLog(db, "bet-1");

			await transitionBet(db, eventBus, "bet-1", "paused", {
				reason: "Team overloaded",
				actor: "u-founder",
			});

			const log = getLog(db, "bet-1");
			const pauseEntry = log.find((e) => e.new_value === "paused");
			expect(pauseEntry).toBeDefined();
			expect(pauseEntry?.actor).toBe("u-founder");
			// Prior entries without actor remain valid (backward compat)
			expect(logBefore.length).toBeGreaterThan(0);
		});

		it("passes actor through resume transition (paused → in_progress)", async () => {
			await db.insert(bets).values(makeBet("committed"));
			await transitionBet(db, eventBus, "bet-1", "in_progress");
			await transitionBet(db, eventBus, "bet-1", "paused", { reason: "pause" });

			await transitionBet(db, eventBus, "bet-1", "in_progress", {
				reason: "Capacity freed",
				actor: "u-founder",
			});

			const log = getLog(db, "bet-1");
			const resumeEntry = log.find((e) => e.new_value === "in_progress" && e.actor === "u-founder");
			expect(resumeEntry).toBeDefined();
		});
	});

	describe("updateBetField with actor option", () => {
		it("writes actor to revision log when actor is provided", async () => {
			await db.insert(bets).values(makeBet("in_progress"));

			await updateBetField(
				db,
				eventBus,
				"bet-1",
				"hypothesis",
				"New hypothesis",
				"Updated learning",
				"u-founder",
			);

			const log = getLog(db, "bet-1");
			expect(log).toHaveLength(1);
			expect(log[0].actor).toBe("u-founder");
		});

		it("actor is undefined when not provided (backward compat)", async () => {
			await db.insert(bets).values(makeBet("in_progress"));

			await updateBetField(db, eventBus, "bet-1", "hypothesis", "New", "reason");

			const log = getLog(db, "bet-1");
			expect(log[0].actor).toBeUndefined();
		});
	});
});
