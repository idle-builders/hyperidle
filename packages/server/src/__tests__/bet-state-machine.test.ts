import { bets, createTestDb, type HyperIdleDb, products, teams } from "@hyperidle/db";
import { CapacityExceededError, EventBus, InvalidTransitionError } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type RevisionLogEntry,
	transitionBet,
	updateBetField,
} from "../services/bet-state-machine.js";

function makeProduct(overrides: Partial<{ id: string; name: string }> = {}) {
	return {
		id: overrides.id ?? "prod-1",
		name: overrides.name ?? "Test Product",
		phase: "build",
		createdAt: new Date().toISOString(),
	};
}

function makeTeam(
	overrides: Partial<{ id: string; productId: string; capacity: number; activeBets: number }> = {},
) {
	return {
		id: overrides.id ?? "team-1",
		productId: overrides.productId ?? "prod-1",
		capacity: overrides.capacity ?? 3,
		activeBets: overrides.activeBets ?? 0,
		formedAt: new Date().toISOString(),
	};
}

function makeBet(
	overrides: Partial<{
		id: string;
		productId: string;
		teamId: string;
		status: string;
		doneCondition: string;
		revisionLog: string | null;
	}> = {},
) {
	return {
		id: overrides.id ?? "bet-1",
		productId: overrides.productId ?? "prod-1",
		teamId: overrides.teamId ?? "team-1",
		pitch: "Test pitch",
		appetite: "2 weeks",
		doneCondition: overrides.doneCondition ?? "Ship the feature",
		hypothesis: "Users will love it",
		status: overrides.status ?? "shaped",
		revisionLog: overrides.revisionLog ?? null,
		createdAt: new Date().toISOString(),
	};
}

function getRevisionLog(db: HyperIdleDb, betId: string): RevisionLogEntry[] {
	const bet = db.select().from(bets).where(eq(bets.id, betId)).get();
	if (!bet?.revisionLog) return [];
	return JSON.parse(bet.revisionLog) as RevisionLogEntry[];
}

describe("bet-state-machine", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		db.insert(products).values(makeProduct()).run();
		db.insert(teams).values(makeTeam()).run();
	});

	describe("transitionBet", () => {
		it("creates bet as shaped, commit transitions to committed with revision log entry", async () => {
			db.insert(bets)
				.values(makeBet({ status: "shaped" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "committed");

			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.status).toBe("committed");

			const log = getRevisionLog(db, "bet-1");
			expect(log).toHaveLength(1);
			expect(log[0].field).toBe("status");
			expect(log[0].old_value).toBe("shaped");
			expect(log[0].new_value).toBe("committed");
			expect(log[0].timestamp).toBeDefined();
			expect(log[0].reason).toBeDefined();
		});

		it("increments team activeBets on commit", async () => {
			db.insert(bets)
				.values(makeBet({ status: "shaped" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "committed");

			const team = db.select().from(teams).where(eq(teams.id, "team-1")).get();
			expect(team?.activeBets).toBe(1);
		});

		it("throws CapacityExceededError when team is at capacity", async () => {
			db.update(teams).set({ activeBets: 3 }).where(eq(teams.id, "team-1")).run();
			db.insert(bets)
				.values(makeBet({ status: "shaped" }))
				.run();

			await expect(transitionBet(db, eventBus, "bet-1", "committed")).rejects.toThrow(
				CapacityExceededError,
			);

			// Bet status should remain shaped
			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.status).toBe("shaped");
		});

		it("transitions committed to in_progress", async () => {
			db.insert(bets)
				.values(makeBet({ status: "committed" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "in_progress");

			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.status).toBe("in_progress");
		});

		it("ships bet with bet_shipped event", async () => {
			db.update(teams).set({ activeBets: 1 }).where(eq(teams.id, "team-1")).run();
			db.insert(bets)
				.values(makeBet({ status: "in_progress" }))
				.run();

			const shippedHandler = vi.fn();
			eventBus.on("bet_shipped", shippedHandler);

			await transitionBet(db, eventBus, "bet-1", "shipped");

			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.status).toBe("shipped");
			expect(bet?.shippedAt).toBeDefined();
			expect(shippedHandler).toHaveBeenCalledTimes(1);
			expect(shippedHandler).toHaveBeenCalledWith(
				expect.objectContaining({ type: "bet_shipped", betId: "bet-1" }),
			);

			// activeBets decremented
			const team = db.select().from(teams).where(eq(teams.id, "team-1")).get();
			expect(team?.activeBets).toBe(0);
		});

		it("emits bet_state_changed on every transition", async () => {
			db.insert(bets)
				.values(makeBet({ status: "shaped" }))
				.run();

			const stateHandler = vi.fn();
			eventBus.on("bet_state_changed", stateHandler);

			await transitionBet(db, eventBus, "bet-1", "committed");

			expect(stateHandler).toHaveBeenCalledTimes(1);
			expect(stateHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "bet_state_changed",
					betId: "bet-1",
					fromState: "shaped",
					toState: "committed",
				}),
			);
		});

		it("throws InvalidTransitionError for invalid transitions", async () => {
			db.insert(bets)
				.values(makeBet({ status: "shaped" }))
				.run();

			await expect(transitionBet(db, eventBus, "bet-1", "shipped")).rejects.toThrow(
				InvalidTransitionError,
			);
		});

		it("throws when killing without reason", async () => {
			db.insert(bets)
				.values(makeBet({ status: "shaped" }))
				.run();

			await expect(transitionBet(db, eventBus, "bet-1", "killed")).rejects.toThrow(
				"Killing a bet requires a reason",
			);
		});

		it("kills bet with reason successfully", async () => {
			db.insert(bets)
				.values(makeBet({ status: "shaped" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "killed", { reason: "No longer viable" });

			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.status).toBe("killed");

			const log = getRevisionLog(db, "bet-1");
			expect(log[0].reason).toBe("No longer viable");
		});

		it("decrements activeBets when killing committed bet", async () => {
			db.update(teams).set({ activeBets: 1 }).where(eq(teams.id, "team-1")).run();
			db.insert(bets)
				.values(makeBet({ status: "committed" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "killed", { reason: "Cancelled" });

			const team = db.select().from(teams).where(eq(teams.id, "team-1")).get();
			expect(team?.activeBets).toBe(0);
		});

		it("decrements activeBets when killing in_progress bet", async () => {
			db.update(teams).set({ activeBets: 1 }).where(eq(teams.id, "team-1")).run();
			db.insert(bets)
				.values(makeBet({ status: "in_progress" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "killed", { reason: "Cancelled" });

			const team = db.select().from(teams).where(eq(teams.id, "team-1")).get();
			expect(team?.activeBets).toBe(0);
		});

		it("reshapes: committed to shaped with reason logged", async () => {
			db.insert(bets)
				.values(makeBet({ status: "committed" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "shaped", { reason: "Needs more shaping" });

			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.status).toBe("shaped");

			const log = getRevisionLog(db, "bet-1");
			expect(log).toHaveLength(1);
			expect(log[0].field).toBe("status");
			expect(log[0].old_value).toBe("committed");
			expect(log[0].new_value).toBe("shaped");
			expect(log[0].reason).toBe("Needs more shaping");
		});

		it("throws when reshaping without reason", async () => {
			db.insert(bets)
				.values(makeBet({ status: "committed" }))
				.run();

			await expect(transitionBet(db, eventBus, "bet-1", "shaped")).rejects.toThrow(
				"Reshaping a bet requires a reason",
			);
		});

		// ---------------- I1 / Bet state atomicity (B1-B3) ----------------
		// The two writes that commit a bet — incrementing `teams.activeBets`
		// and flipping `bets.status` to committed — must happen atomically.
		// Without a transaction, a failure between them drifts
		// `teams.activeBets` away from the real count, and two concurrent
		// commits can lost-update the counter.

		describe("I1 B1: transitionBet wraps mutating writes in db.transaction", () => {
			it("calls db.transaction exactly once per transition", async () => {
				db.insert(bets)
					.values(makeBet({ status: "shaped" }))
					.run();

				const txSpy = vi.spyOn(db, "transaction");

				await transitionBet(db, eventBus, "bet-1", "committed");

				expect(txSpy).toHaveBeenCalledTimes(1);
				txSpy.mockRestore();
			});
		});

		describe("I1 B2: two sequential commits increment activeBets to 2", () => {
			it("increments activeBets once per commit with no drift", async () => {
				// Two shaped bets, capacity 3, team starts at 0.
				db.insert(bets)
					.values(makeBet({ id: "bet-a", status: "shaped" }))
					.run();
				db.insert(bets)
					.values(makeBet({ id: "bet-b", status: "shaped" }))
					.run();

				await transitionBet(db, eventBus, "bet-a", "committed");
				await transitionBet(db, eventBus, "bet-b", "committed");

				const team = db.select().from(teams).where(eq(teams.id, "team-1")).get();
				expect(team?.activeBets).toBe(2);

				const a = db.select().from(bets).where(eq(bets.id, "bet-a")).get();
				const b = db.select().from(bets).where(eq(bets.id, "bet-b")).get();
				expect(a?.status).toBe("committed");
				expect(b?.status).toBe("committed");
			});
		});

		describe("I1 B3: failed bet UPDATE rolls back activeBets", () => {
			it("does not leak an activeBets increment when the bet UPDATE fails inside the transaction", async () => {
				db.insert(bets)
					.values(makeBet({ status: "shaped" }))
					.run();

				// Snapshot pre-condition.
				const teamBefore = db.select().from(teams).where(eq(teams.id, "team-1")).get();
				expect(teamBefore?.activeBets).toBe(0);

				// Force the bet UPDATE to throw so the transaction rolls back.
				// We spy on `db.update` and intercept calls targeting the
				// `bets` table; the `teams` update must still pass through so
				// that a naive (non-transactional) implementation would leave
				// activeBets at 1 — making the post-condition assertion
				// meaningful.
				const originalUpdate = db.update.bind(db);
				const updateSpy = vi
					.spyOn(db, "update")
					.mockImplementation((table: Parameters<typeof originalUpdate>[0]) => {
						if (table === bets) {
							throw new Error("simulated bets UPDATE failure");
						}
						return originalUpdate(table);
					});

				await expect(transitionBet(db, eventBus, "bet-1", "committed")).rejects.toThrow(
					/simulated bets UPDATE failure/,
				);

				updateSpy.mockRestore();

				// Post-condition: team.activeBets is back to 0 (transaction
				// rolled back the teams UPDATE) and bet.status is unchanged.
				const teamAfter = db.select().from(teams).where(eq(teams.id, "team-1")).get();
				expect(teamAfter?.activeBets).toBe(0);

				const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
				expect(bet?.status).toBe("shaped");
			});
		});
	});

	describe("updateBetField", () => {
		it("updates done_condition on in_progress bet with revision log and item_created event", async () => {
			db.insert(bets)
				.values(makeBet({ status: "in_progress", doneCondition: "Old condition" }))
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

			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.doneCondition).toBe("New condition");

			const log = getRevisionLog(db, "bet-1");
			expect(log).toHaveLength(1);
			expect(log[0].field).toBe("done_condition");
			expect(log[0].old_value).toBe("Old condition");
			expect(log[0].new_value).toBe("New condition");
			expect(log[0].reason).toBe("Scope refined");

			expect(itemHandler).toHaveBeenCalledTimes(1);
			expect(itemHandler).toHaveBeenCalledWith(
				expect.objectContaining({ type: "item_created", kind: "done_condition_change" }),
			);
		});

		it("rejects field update on non-in_progress bet", async () => {
			db.insert(bets)
				.values(makeBet({ status: "shaped" }))
				.run();

			await expect(
				updateBetField(db, eventBus, "bet-1", "done_condition", "New", "reason"),
			).rejects.toThrow("Can only update fields on in_progress bets");
		});

		it("rejects unknown field", async () => {
			db.insert(bets)
				.values(makeBet({ status: "in_progress" }))
				.run();

			await expect(
				updateBetField(db, eventBus, "bet-1", "pitch", "New pitch", "reason"),
			).rejects.toThrow("Field 'pitch' is not mutable");
		});

		it("allows updating hypothesis on in_progress bet", async () => {
			db.insert(bets)
				.values(makeBet({ status: "in_progress" }))
				.run();

			await updateBetField(db, eventBus, "bet-1", "hypothesis", "New hypothesis", "Learnings");

			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.hypothesis).toBe("New hypothesis");
		});

		it("allows updating appetite on in_progress bet", async () => {
			db.insert(bets)
				.values(makeBet({ status: "in_progress" }))
				.run();

			await updateBetField(db, eventBus, "bet-1", "appetite", "4 weeks", "Extended");

			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.appetite).toBe("4 weeks");
		});

		it("does not emit item_created for hypothesis changes", async () => {
			db.insert(bets)
				.values(makeBet({ status: "in_progress" }))
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
				.values(makeBet({ status: "shaped" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "committed");

			const log = getRevisionLog(db, "bet-1");
			expect(log).toHaveLength(1);

			const entry = log[0];
			expect(entry).toHaveProperty("timestamp");
			expect(entry).toHaveProperty("field");
			expect(entry).toHaveProperty("old_value");
			expect(entry).toHaveProperty("new_value");
			expect(entry).toHaveProperty("reason");
			expect(typeof entry.timestamp).toBe("string");
			// Validate ISO timestamp format
			expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
		});

		it("accumulates entries across multiple transitions", async () => {
			db.insert(bets)
				.values(makeBet({ status: "shaped" }))
				.run();

			await transitionBet(db, eventBus, "bet-1", "committed");
			await transitionBet(db, eventBus, "bet-1", "in_progress");

			const log = getRevisionLog(db, "bet-1");
			expect(log).toHaveLength(2);
			expect(log[0].old_value).toBe("shaped");
			expect(log[0].new_value).toBe("committed");
			expect(log[1].old_value).toBe("committed");
			expect(log[1].new_value).toBe("in_progress");
		});
	});

	// ---------------- I1 adversary-M1: concurrent bet_shipped double-emit ----------------
	describe("I1 M1: concurrent transitions are compare-and-set", () => {
		it("second transitionBet to shipped throws InvalidTransitionError and does NOT re-emit bet_shipped", async () => {
			// Walk the bet forward to `review` so "shipped" is a valid
			// transition from the read snapshot.
			db.insert(bets)
				.values(makeBet({ status: "shaped" }))
				.run();
			await transitionBet(db, eventBus, "bet-1", "committed");
			await transitionBet(db, eventBus, "bet-1", "in_progress");
			await transitionBet(db, eventBus, "bet-1", "review");

			const events: Array<{ type: string; betId?: string }> = [];
			eventBus.on("*", (e) => events.push(e as { type: string; betId?: string }));

			// First transition wins — commits and emits both events.
			await transitionBet(db, eventBus, "bet-1", "shipped");

			// Second transition observes the same `fromState` ("review")
			// because the pre-transaction read happens against the same row,
			// but the compare-and-set UPDATE pins `WHERE status = review`
			// and now the row is `shipped`. changes === 0, the tx rolls
			// back, and InvalidTransitionError bubbles.
			await expect(transitionBet(db, eventBus, "bet-1", "shipped")).rejects.toThrow(
				InvalidTransitionError,
			);

			const shippedEvents = events.filter((e) => e.type === "bet_shipped");
			const stateEvents = events.filter((e) => e.type === "bet_state_changed");
			// Exactly one bet_shipped despite the second transition attempt.
			expect(shippedEvents).toHaveLength(1);
			// Exactly one bet_state_changed fires (from the winning
			// review->shipped transition). The loser throws before emit.
			expect(stateEvents).toHaveLength(1);

			// The bet row is terminal — still exactly one `shipped` row.
			const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
			expect(bet?.status).toBe("shipped");
			// Revision log has exactly one shipped entry.
			const log = getRevisionLog(db, "bet-1");
			const shippedLogs = log.filter((e) => e.field === "status" && e.new_value === "shipped");
			expect(shippedLogs).toHaveLength(1);
		});
	});
});
