/**
 * L14 — Bet state machine: actor field in RevisionLogEntry (AC-5, T1).
 *
 * Extends bet-state-machine.test.ts with new assertions. Protected tests in
 * that file must NOT be changed — these are additive.
 *
 * @lore U1: Status map: shaped->draft, committed|in_progress->active, shipped->completed.
 * teamMembers.id = "team-1", teamMembers.teamId = "prod-1" (teams domain entity).
 * bets.teamId references teams.id = "prod-1", NOT teamMembers.id = "team-1".
 */

import { bets, type HyperIdleDb, teamMembers, teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import {
	type RevisionLogEntry,
	transitionBet,
	updateBetField,
} from "@hyperidle/core-app";
import { test } from "../test-fixtures.js";

function makeProduct() {
	return { id: "prod-1", name: "Test", phase: "build", createdAt: new Date().toISOString() };
}
function makeTeamMembers() {
	return {
		id: "team-1",
		teamId: "prod-1",
		capacity: 3,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	};
}
function makeBet(status = "draft") {
	return {
		id: "bet-1",
		// @lore U1: bets.teamId references teams.id (domain entity), NOT teamMembers.id.
		teamId: "prod-1",
		description: "# Feature\nBody",
		appetite: "2 weeks",
		status,
		createdAt: new Date().toISOString(),
	};
}

async function getLog(db: HyperIdleDb, betId: string): Promise<RevisionLogEntry[]> {
	const [bet] = await db.select().from(bets).where(eq(bets.id, betId));
	if (!bet?.revisionLog) return [];
	return JSON.parse(bet.revisionLog) as RevisionLogEntry[];
}

describe("L14 — RevisionLogEntry actor field (T1)", () => {
	describe("transitionBet with actor option", () => {
		test("writes actor to the revision log when actor is provided", async ({ db, eventBus }) => {
			await db.insert(teams).values(makeProduct());
			await db.insert(teamMembers).values(makeTeamMembers());
			await db.insert(bets).values(makeBet("draft"));

			await transitionBet(db, eventBus, "bet-1", "active", { actor: "u-founder" });

			const log = await getLog(db, "bet-1");
			expect(log).toHaveLength(1);
			expect(log[0]?.actor).toBe("u-founder");
		});

		test("actor is undefined in log when no actor is provided (backward compat)", async ({
			db,
			eventBus,
		}) => {
			await db.insert(teams).values(makeProduct());
			await db.insert(teamMembers).values(makeTeamMembers());
			await db.insert(bets).values(makeBet("draft"));

			await transitionBet(db, eventBus, "bet-1", "active");

			const log = await getLog(db, "bet-1");
			expect(log).toHaveLength(1);
			// actor field is optional — absence is acceptable
			expect(log[0]?.actor).toBeUndefined();
		});

		test("passes actor through kill transition (draft → killed)", async ({ db, eventBus }) => {
			await db.insert(teams).values(makeProduct());
			await db.insert(teamMembers).values(makeTeamMembers());
			await db.insert(bets).values(makeBet("draft"));

			await transitionBet(db, eventBus, "bet-1", "killed", {
				reason: "Not viable",
				actor: "u-founder",
			});

			const log = await getLog(db, "bet-1");
			expect(log[0]?.actor).toBe("u-founder");
		});

		test("passes actor through completed transition (active → completed)", async ({
			db,
			eventBus,
		}) => {
			await db.insert(teams).values(makeProduct());
			await db.insert(teamMembers).values(makeTeamMembers());
			await db.insert(bets).values(makeBet("active"));
			await transitionBet(db, eventBus, "bet-1", "completed", {
				actor: "u-founder",
			});

			const log = await getLog(db, "bet-1");
			const completedEntry = log.find((e) => e.new_value === "completed");
			expect(completedEntry).toBeDefined();
			expect(completedEntry?.actor).toBe("u-founder");
		});

		test("passes actor through active transition (draft → active)", async ({ db, eventBus }) => {
			await db.insert(teams).values(makeProduct());
			await db.insert(teamMembers).values(makeTeamMembers());
			await db.insert(bets).values(makeBet("draft"));

			await transitionBet(db, eventBus, "bet-1", "active", {
				actor: "u-founder",
			});

			const log = await getLog(db, "bet-1");
			const activeEntry = log.find((e) => e.new_value === "active" && e.actor === "u-founder");
			expect(activeEntry).toBeDefined();
		});
	});

	describe("updateBetField with actor option", () => {
		test("writes actor to revision log when actor is provided", async ({ db, eventBus }) => {
			await db.insert(teams).values(makeProduct());
			await db.insert(teamMembers).values(makeTeamMembers());
			await db.insert(bets).values(makeBet("active"));

			await updateBetField(
				db,
				eventBus,
				"bet-1",
				"hypothesis",
				"New hypothesis",
				"Updated learning",
				"u-founder",
			);

			const log = await getLog(db, "bet-1");
			expect(log).toHaveLength(1);
			expect(log[0]?.actor).toBe("u-founder");
		});

		test("actor is undefined when not provided (backward compat)", async ({ db, eventBus }) => {
			await db.insert(teams).values(makeProduct());
			await db.insert(teamMembers).values(makeTeamMembers());
			await db.insert(bets).values(makeBet("active"));

			await updateBetField(db, eventBus, "bet-1", "hypothesis", "New", "reason");

			const log = await getLog(db, "bet-1");
			expect(log[0]?.actor).toBeUndefined();
		});
	});
});
