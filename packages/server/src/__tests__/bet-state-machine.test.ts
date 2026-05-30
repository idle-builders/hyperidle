import { bets, createTestDb, type HyperIdleDb, teamMembers, teams } from "@hyperidle/db";
import { CapacityExceededError, EventBus, InvalidTransitionError } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type RevisionLogEntry,
	transitionBet,
	updateBetField,
} from "../services/bet-state-machine.js";

// @lore U1: teams = domain entity (products); teamMembers = membership group.
// bets.teamId references teams.id, NOT teamMembers.id.
// Status map: shaped->draft, committed|in_progress->active, shipped->completed.

function makeProduct(overrides: Partial<{ id: string; name: string }> = {}) {
	return {
		id: overrides.id ?? "prod-1",
		name: overrides.name ?? "Test Product",
		phase: "build",
		createdAt: new Date().toISOString(),
	};
}

function makeTeamMembers(
	overrides: Partial<{ id: string; teamId: string; capacity: number; activeBets: number }> = {},
) {
	return {
		id: overrides.id ?? "team-1",
		teamId: overrides.teamId ?? "prod-1",
		capacity: overrides.capacity ?? 3,
		activeBets: overrides.activeBets ?? 0,
		formedAt: new Date().toISOString(),
	};
}

function makeBet(
	overrides: Partial<{
		id: string;
		teamId: string;
		status: string;
		doneCondition: string;
		revisionLog: string | null;
	}> = {},
) {
	return {
		id: overrides.id ?? "bet-1",
		// @lore U1: bets.teamId references teams.id (domain entity), NOT teamMembers.id.
		teamId: overrides.teamId ?? "prod-1",
		description: "Test description",
		appetite: "2 weeks",
		doneCondition: overrides.doneCondition ?? "Ship the feature",
		hypothesis: "Users will love it",
		// @lore U1: statuses simplified: shaped->draft, committed|in_progress->active, shipped->completed.
		status: overrides.status ?? "draft",
		revisionLog: overrides.revisionLog ?? null,
		createdAt: new Date().toISOString(),
	};
}

async function getRevisionLog(db: HyperIdleDb, betId: string): Promise<RevisionLogEntry[]> {
	const [bet] = await db.select().from(bets).where(eq(bets.id, betId));
	if (!bet?.revisionLog) return [];
	return JSON.parse(bet.revisionLog) as RevisionLogEntry[];
}

describe("bet-state-machine", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		db.insert(teams).values(makeProduct()).run();
		db.insert(teamMembers).values(makeTeamMembers()).run();
	});

	describe("transitionBet", () => {
		it("creates bet as draft, active transitions to active with revision log entry", async () => {
			db.insert(bets)
				.values(makeBet({ status: "draft" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "active");

			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.status).toBe("active");

			const log = await getRevisionLog(db, "bet-1");
			expect(log).toHaveLength(1);
			expect(log[0].field).toBe("status");
			expect(log[0].old_value).toBe("draft");
			expect(log[0].new_value).toBe("active");
			expect(log[0].timestamp).toBeDefined();
			expect(log[0].reason).toBeDefined();
		});

		it("increments team activeBets on active transition", async () => {
			db.insert(bets)
				.values(makeBet({ status: "draft" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "active");

			const member = db.select().from(teamMembers).where(eq(teamMembers.id, "team-1")).get();
			expect(member?.activeBets).toBe(1);
		});

		it("throws CapacityExceededError when team is at capacity", async () => {
			db.update(teamMembers).set({ activeBets: 3 }).where(eq(teamMembers.id, "team-1")).run();
			db.insert(bets)
				.values(makeBet({ status: "draft" }))
				.run();

			await expect(transitionBet(db, eventBus, "bet-1", "active")).rejects.toThrow(
				CapacityExceededError,
			);

			// Bet status should remain draft
			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.status).toBe("draft");
		});

		it("transitions active to completed", async () => {
			db.insert(bets)
				.values(makeBet({ status: "active" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "completed");

			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.status).toBe("completed");
		});

		it("completes bet with bet_state_changed event (toState=completed)", async () => {
			db.update(teamMembers).set({ activeBets: 1 }).where(eq(teamMembers.id, "team-1")).run();
			db.insert(bets)
				.values(makeBet({ status: "active" }))
				.run();

			const completedHandler = vi.fn();
			eventBus.on("bet_state_changed", completedHandler);

			await transitionBet(db, eventBus, "bet-1", "completed");

			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.status).toBe("completed");
			expect(bet?.completedAt).toBeDefined();
			// Filter for just the completed transition
			const completedCalls = completedHandler.mock.calls.filter(
				(c) => c[0].toState === "completed",
			);
			expect(completedCalls).toHaveLength(1);
			expect(completedCalls[0][0]).toEqual(
				expect.objectContaining({
					type: "bet_state_changed",
					betId: "bet-1",
					toState: "completed",
				}),
			);

			// activeBets decremented
			const member = db.select().from(teamMembers).where(eq(teamMembers.id, "team-1")).get();
			expect(member?.activeBets).toBe(0);
		});

		it("emits bet_state_changed on every transition", async () => {
			db.insert(bets)
				.values(makeBet({ status: "draft" }))
				.run();

			const stateHandler = vi.fn();
			eventBus.on("bet_state_changed", stateHandler);

			await transitionBet(db, eventBus, "bet-1", "active");

			expect(stateHandler).toHaveBeenCalledTimes(1);
			expect(stateHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "bet_state_changed",
					betId: "bet-1",
					fromState: "draft",
					toState: "active",
				}),
			);
		});

		it("throws InvalidTransitionError for invalid transitions", async () => {
			db.insert(bets)
				.values(makeBet({ status: "draft" }))
				.run();

			await expect(transitionBet(db, eventBus, "bet-1", "completed")).rejects.toThrow(
				InvalidTransitionError,
			);
		});

		it("throws when killing without reason", async () => {
			db.insert(bets)
				.values(makeBet({ status: "draft" }))
				.run();

			await expect(transitionBet(db, eventBus, "bet-1", "killed")).rejects.toThrow(
				"Killing a bet requires a reason",
			);
		});

		it("kills bet with reason successfully", async () => {
			db.insert(bets)
				.values(makeBet({ status: "draft" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "killed", { reason: "No longer viable" });

			const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
			expect(bet?.status).toBe("killed");

			const log = await getRevisionLog(db, "bet-1");
			expect(log[0]?.reason).toBe("No longer viable");
		});

		it("decrements activeBets when killing active bet (was committed)", async () => {
			db.update(teamMembers).set({ activeBets: 1 }).where(eq(teamMembers.id, "team-1")).run();
			db.insert(bets)
				.values(makeBet({ status: "active" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "killed", { reason: "Cancelled" });

			const member = db.select().from(teamMembers).where(eq(teamMembers.id, "team-1")).get();
			expect(member?.activeBets).toBe(0);
		});

		it("decrements activeBets when killing active bet (was in_progress)", async () => {
			db.update(teamMembers).set({ activeBets: 1 }).where(eq(teamMembers.id, "team-1")).run();
			db.insert(bets)
				.values(makeBet({ status: "active" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "killed", { reason: "Cancelled" });

			const member = db.select().from(teamMembers).where(eq(teamMembers.id, "team-1")).get();
			expect(member?.activeBets).toBe(0);
		});

		it("throws InvalidTransitionError for active → draft (U1: reshape removed, only active→completed|killed)", async () => {
			// @lore U1: The old "reshape" transition (committed→shaped) no longer exists.
			// In U1 simplified model: active can only go to completed or killed.
			db.insert(bets)
				.values(makeBet({ status: "active" }))
				.run();

			await expect(transitionBet(db, eventBus, "bet-1", "draft")).rejects.toThrow(
				InvalidTransitionError,
			);
		});

		// ---------------- I1 / Bet state atomicity (B1-B3) ----------------
		// The two writes that activate a bet — incrementing `teamMembers.activeBets`
		// and flipping `bets.status` to active — must happen atomically.
		// Without a transaction, a failure between them drifts
		// `teamMembers.activeBets` away from the real count.

		describe("I1 B1: transitionBet wraps mutating writes in db.transaction", () => {
			it("calls db.transaction exactly once per transition", async () => {
				db.insert(bets)
					.values(makeBet({ status: "draft" }))
					.run();

				const txSpy = vi.spyOn(db, "transaction");

				await transitionBet(db, eventBus, "bet-1", "active");

				expect(txSpy).toHaveBeenCalledTimes(1);
				txSpy.mockRestore();
			});
		});

		describe("I1 B2: two sequential activations increment activeBets to 2", () => {
			it("increments activeBets once per activation with no drift", async () => {
				// Two draft bets, capacity 3, team starts at 0.
				db.insert(bets)
					.values(makeBet({ id: "bet-a", status: "draft" }))
					.run();
				db.insert(bets)
					.values(makeBet({ id: "bet-b", status: "draft" }))
					.run();

				await transitionBet(db, eventBus, "bet-a", "active");
				await transitionBet(db, eventBus, "bet-b", "active");

				const member = db.select().from(teamMembers).where(eq(teamMembers.id, "team-1")).get();
				expect(member?.activeBets).toBe(2);

				const a = db.select().from(bets).where(eq(bets.id, "bet-a")).get();
				const b = db.select().from(bets).where(eq(bets.id, "bet-b")).get();
				expect(a?.status).toBe("active");
				expect(b?.status).toBe("active");
			});
		});

		describe("I1 B3: failed bet UPDATE rolls back activeBets", () => {
			it("does not leak an activeBets increment when the bet UPDATE fails inside the transaction", async () => {
				db.insert(bets)
					.values(makeBet({ status: "draft" }))
					.run();

				// Snapshot pre-condition.
				const memberBefore = db
					.select()
					.from(teamMembers)
					.where(eq(teamMembers.id, "team-1"))
					.get();
				expect(memberBefore?.activeBets).toBe(0);

				// Force the bet UPDATE to throw so the transaction rolls back.
				const originalUpdate = db.update.bind(db);
				const updateSpy = vi
					.spyOn(db, "update")
					.mockImplementation((table: Parameters<typeof originalUpdate>[0]) => {
						if (table === bets) {
							throw new Error("simulated bets UPDATE failure");
						}
						return originalUpdate(table);
					});

				await expect(transitionBet(db, eventBus, "bet-1", "active")).rejects.toThrow(
					/simulated bets UPDATE failure/,
				);

				txSpy.mockRestore();

				// Post-condition: teamMembers.activeBets is back to 0 (transaction
				// rolled back) and bet.status is unchanged.
				const memberAfter = db.select().from(teamMembers).where(eq(teamMembers.id, "team-1")).get();
				expect(memberAfter?.activeBets).toBe(0);

				const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
				expect(bet?.status).toBe("draft");
			});
		});
	});

	describe("updateBetField", () => {
		it("updates done_condition on active bet with revision log and item_created event", async () => {
			db.insert(bets)
				.values(makeBet({ status: "active", doneCondition: "Old condition" }))
				.run();

			const itemHandler = vi.fn();
			eventBus.on("item_created", itemHandler);

			await updateBetField(
				db,
				eventBus,
				"bet-1",
				"done_condition",
				"New condition",
				"Scope refined",
			);

			const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
			expect(bet?.doneCondition).toBe("New condition");

			const log = await getRevisionLog(db, "bet-1");
			expect(log).toHaveLength(1);
			expect(log[0]?.field).toBe("done_condition");
			expect(log[0]?.old_value).toBe("Old condition");
			expect(log[0]?.new_value).toBe("New condition");
			expect(log[0]?.reason).toBe("Scope refined");

			expect(itemHandler).toHaveBeenCalledTimes(1);
			expect(itemHandler).toHaveBeenCalledWith(
				expect.objectContaining({ type: "item_created", kind: "done_condition_change" }),
			);
		});

		it("rejects field update on non-active bet", async () => {
			db.insert(bets)
				.values(makeBet({ status: "draft" }))
				.run();

			await expect(
				updateBetField(db, eventBus, "bet-1", "done_condition", "New", "reason"),
			).rejects.toThrow("Can only update fields on active bets");
		});

		it("rejects unknown field", async () => {
			db.insert(bets)
				.values(makeBet({ status: "active" }))
				.run();

			await expect(
				updateBetField(db, eventBus, "bet-1", "pitch", "New pitch", "reason"),
			).rejects.toThrow("Field 'pitch' is not mutable");
		});

		it("allows updating hypothesis on active bet", async () => {
			db.insert(bets)
				.values(makeBet({ status: "active" }))
				.run();

			await updateBetField(db, eventBus, "bet-1", "hypothesis", "New hypothesis", "Learnings");

			const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
			expect(bet?.hypothesis).toBe("New hypothesis");
		});

		it("allows updating appetite on active bet", async () => {
			db.insert(bets)
				.values(makeBet({ status: "active" }))
				.run();

			await updateBetField(db, eventBus, "bet-1", "appetite", "4 weeks", "Extended");

			const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
			expect(bet?.appetite).toBe("4 weeks");
		});

		it("does not emit item_created for hypothesis changes", async () => {
			db.insert(bets)
				.values(makeBet({ status: "active" }))
				.run();

			const itemHandler = vi.fn();
			eventBus.on("item_created", itemHandler);

			await updateBetField(db, eventBus, "bet-1", "hypothesis", "New", "reason");

			expect(itemHandler).not.toHaveBeenCalled();
		});
	});

	describe("revision log shape", () => {
		it("has correct shape with timestamp, field, old_value, new_value, reason", async () => {
			db.insert(bets)
				.values(makeBet({ status: "draft" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "active");

			const log = await getRevisionLog(db, "bet-1");
			expect(log).toHaveLength(1);

			const entry = log[0];
			expect(entry).toHaveProperty("timestamp");
			expect(entry).toHaveProperty("field");
			expect(entry).toHaveProperty("old_value");
			expect(entry).toHaveProperty("new_value");
			expect(entry).toHaveProperty("reason");
			expect(typeof entry?.timestamp).toBe("string");
			// Validate ISO timestamp format
			expect(entry?.timestamp ? new Date(entry.timestamp).toISOString() : null).toBe(
				entry?.timestamp ?? null,
			);
		});

		it("accumulates entries across multiple transitions", async () => {
			db.insert(bets)
				.values(makeBet({ status: "draft" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "active");
			await transitionBet(db, eventBus, "bet-1", "completed");

			const log = await getRevisionLog(db, "bet-1");
			expect(log).toHaveLength(2);
			expect(log[0].old_value).toBe("draft");
			expect(log[0].new_value).toBe("active");
			expect(log[1].old_value).toBe("active");
			expect(log[1].new_value).toBe("completed");
		});
	});

	// ---------------- I1 adversary-M1: concurrent completed transition double-emit ----------------
	describe("I1 M1: concurrent transitions are compare-and-set", () => {
		it("second transitionBet to completed throws InvalidTransitionError and does NOT re-emit bet_state_changed", async () => {
			// Walk the bet forward to `active` so "completed" is a valid transition.
			db.insert(bets)
				.values(makeBet({ status: "active" }))
				.run();

			const events: Array<{ type: string; betId?: string; toState?: string }> = [];
			eventBus.on("*", (e: unknown) =>
				events.push(e as { type: string; betId?: string; toState?: string }),
			);

			// First transition wins — commits and emits bet_state_changed.
			await transitionBet(db, eventBus, "bet-1", "completed");

			// Second transition observes the same `fromState` ("active")
			// because the pre-transaction read happens against the same row,
			// but the compare-and-set UPDATE pins `WHERE status = active`
			// and now the row is `completed`. changes === 0, the tx rolls
			// back, and InvalidTransitionError bubbles.
			await expect(transitionBet(db, eventBus, "bet-1", "completed")).rejects.toThrow(
				InvalidTransitionError,
			);

			const completedStateEvents = events.filter(
				(e) => e.type === "bet_state_changed" && e.toState === "completed",
			);
			const stateEvents = events.filter((e) => e.type === "bet_state_changed");
			// Exactly one bet_state_changed(toState=completed) despite the second transition attempt.
			expect(completedStateEvents).toHaveLength(1);
			// Exactly one bet_state_changed fires (from the winning active->completed transition).
			expect(stateEvents).toHaveLength(1);

			// The bet row is terminal — still exactly one `completed` row.
			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.status).toBe("completed");
			// Revision log has exactly one completed entry.
			const log = getRevisionLog(db, "bet-1");
			const completedLogs = log.filter((e) => e.field === "status" && e.new_value === "completed");
			expect(completedLogs).toHaveLength(1);
		});
	});
});
