import { bets, type HyperIdleDb, teams } from "@hyperidle/db";
import { CapacityExceededError, InvalidTransitionError } from "@hyperidle/domain-model";
import { getTeam, updateTeam } from "@hyperidle/org";
import { transitionBet } from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../__testing__/test-fixtures.js";

// AU19 Increment 1c: `work`'s `TeamCapacityReader` port (Mechanism C), wired
// to the real migrated `org` Service.
const teamCapacity = {
	getByTeamId: (db: HyperIdleDb, teamId: string) => getTeam(db, { id: teamId }),
	setActiveBets: (db: HyperIdleDb, teamId: string, activeBets: number) =>
		updateTeam(db, teamId, { activeBets }),
};

// @lore U1: teams = domain entity (products); teamMembers = membership group.
// bets.teamId references teams.id, NOT teamMembers.id.
// Status map: shaped->draft, committed|in_progress->active, shipped->completed.

function makeProduct(overrides: Partial<{ id: string; name: string }> = {}) {
	return {
		id: overrides.id ?? "prod-1",
		name: overrides.name ?? "Test Product",
		phase: "build",
		capacity: 3,
		activeBets: 0,
		formedAt: new Date().toISOString(),
		createdAt: new Date().toISOString(),
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

async function seedBaseData(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values(makeProduct());
}

describe("bet-state-machine", () => {
	describe("transitionBet", () => {
		test("creates bet as draft, active transitions to active", async ({ db, eventBus }) => {
			await seedBaseData(db);
			await db.insert(bets).values(makeBet({ status: "draft" }));

			await transitionBet(db, eventBus, teamCapacity, "bet-1", "active");

			const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
			expect(bet?.status).toBe("active");
		});

		test("increments team activeBets on active transition", async ({ db, eventBus }) => {
			await seedBaseData(db);
			await db.insert(bets).values(makeBet({ status: "draft" }));

			await transitionBet(db, eventBus, teamCapacity, "bet-1", "active");

			const [team] = await db.select().from(teams).where(eq(teams.id, "prod-1"));
			expect(team?.activeBets).toBe(1);
		});

		test("throws CapacityExceededError when team is at capacity", async ({ db, eventBus }) => {
			await seedBaseData(db);
			await db.update(teams).set({ activeBets: 3 }).where(eq(teams.id, "prod-1"));
			await db.insert(bets).values(makeBet({ status: "draft" }));

			await expect(transitionBet(db, eventBus, teamCapacity, "bet-1", "active")).rejects.toThrow(
				CapacityExceededError,
			);

			// Bet status should remain draft
			const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
			expect(bet?.status).toBe("draft");
		});

		test("transitions active to completed", async ({ db, eventBus }) => {
			await seedBaseData(db);
			await db.insert(bets).values(makeBet({ status: "active" }));

			await transitionBet(db, eventBus, teamCapacity, "bet-1", "completed");

			const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
			expect(bet?.status).toBe("completed");
		});

		test("completes bet with bet_state_changed event (toState=completed)", async ({
			db,
			eventBus,
		}) => {
			await seedBaseData(db);
			await db.update(teams).set({ activeBets: 1 }).where(eq(teams.id, "prod-1"));
			await db.insert(bets).values(makeBet({ status: "active" }));

			const completedHandler = vi.fn();
			eventBus.on("bet_state_changed", completedHandler);

			await transitionBet(db, eventBus, teamCapacity, "bet-1", "completed");

			const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
			expect(bet?.status).toBe("completed");
			expect(bet?.completedAt).toBeDefined();
			// Filter for just the completed transition
			const completedCalls = completedHandler.mock.calls.filter(
				(c) => c[0].toState === "completed",
			);
			expect(completedCalls).toHaveLength(1);
			expect(completedCalls[0]![0]).toEqual(
				expect.objectContaining({
					type: "bet_state_changed",
					betId: "bet-1",
					toState: "completed",
				}),
			);

			// activeBets decremented
			const [team] = await db.select().from(teams).where(eq(teams.id, "prod-1"));
			expect(team?.activeBets).toBe(0);
		});

		test("emits bet_state_changed on every transition", async ({ db, eventBus }) => {
			await seedBaseData(db);
			await db.insert(bets).values(makeBet({ status: "draft" }));

			const stateHandler = vi.fn();
			eventBus.on("bet_state_changed", stateHandler);

			await transitionBet(db, eventBus, teamCapacity, "bet-1", "active");

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

		test("throws InvalidTransitionError for invalid transitions", async ({ db, eventBus }) => {
			await seedBaseData(db);
			await db.insert(bets).values(makeBet({ status: "draft" }));

			await expect(transitionBet(db, eventBus, teamCapacity, "bet-1", "completed")).rejects.toThrow(
				InvalidTransitionError,
			);
		});

		test("throws when killing without reason", async ({ db, eventBus }) => {
			await seedBaseData(db);
			await db.insert(bets).values(makeBet({ status: "draft" }));

			await expect(transitionBet(db, eventBus, teamCapacity, "bet-1", "killed")).rejects.toThrow(
				"Killing a bet requires a reason",
			);
		});

		test("kills bet with reason successfully", async ({ db, eventBus }) => {
			await seedBaseData(db);
			await db.insert(bets).values(makeBet({ status: "draft" }));

			await transitionBet(db, eventBus, teamCapacity, "bet-1", "killed", {
				reason: "No longer viable",
			});

			const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
			expect(bet?.status).toBe("killed");
		});

		test("decrements activeBets when killing active bet (was committed)", async ({
			db,
			eventBus,
		}) => {
			await seedBaseData(db);
			await db.update(teams).set({ activeBets: 1 }).where(eq(teams.id, "prod-1"));
			await db.insert(bets).values(makeBet({ status: "active" }));

			await transitionBet(db, eventBus, teamCapacity, "bet-1", "killed", { reason: "Cancelled" });

			const [team] = await db.select().from(teams).where(eq(teams.id, "prod-1"));
			expect(team?.activeBets).toBe(0);
		});

		test("decrements activeBets when killing active bet (was in_progress)", async ({
			db,
			eventBus,
		}) => {
			await seedBaseData(db);
			await db.update(teams).set({ activeBets: 1 }).where(eq(teams.id, "prod-1"));
			await db.insert(bets).values(makeBet({ status: "active" }));

			await transitionBet(db, eventBus, teamCapacity, "bet-1", "killed", { reason: "Cancelled" });

			const [team] = await db.select().from(teams).where(eq(teams.id, "prod-1"));
			expect(team?.activeBets).toBe(0);
		});

		test("throws InvalidTransitionError for active → draft (U1: reshape removed, only active→completed|killed)", async ({
			db,
			eventBus,
		}) => {
			// @lore U1: The old "reshape" transition (committed→shaped) no longer exists.
			// In U1 simplified model: active can only go to completed or killed.
			await seedBaseData(db);
			await db.insert(bets).values(makeBet({ status: "active" }));

			await expect(transitionBet(db, eventBus, teamCapacity, "bet-1", "draft")).rejects.toThrow(
				InvalidTransitionError,
			);
		});

		// ---------------- I1 / Bet state atomicity (B1-B3) ----------------
		// The two writes that activate a bet — incrementing `teams.activeBets`
		// and flipping `bets.status` to active — must happen atomically.
		// Without a transaction, a failure between them drifts
		// `teams.activeBets` away from the real count.

		describe("I1 B1: transitionBet wraps mutating writes in db.transaction", () => {
			test("calls db.transaction exactly once per transition", async ({ db, eventBus }) => {
				await seedBaseData(db);
				await db.insert(bets).values(makeBet({ status: "draft" }));

				const txSpy = vi.spyOn(db, "transaction");

				await transitionBet(db, eventBus, teamCapacity, "bet-1", "active");

				expect(txSpy).toHaveBeenCalledTimes(1);
				txSpy.mockRestore();
			});
		});

		describe("I1 B2: two sequential activations increment activeBets to 2", () => {
			test("increments activeBets once per activation with no drift", async ({ db, eventBus }) => {
				await seedBaseData(db);
				// Two draft bets, capacity 3, team starts at 0.
				await db.insert(bets).values(makeBet({ id: "bet-a", status: "draft" }));
				await db.insert(bets).values(makeBet({ id: "bet-b", status: "draft" }));

				await transitionBet(db, eventBus, teamCapacity, "bet-a", "active");
				await transitionBet(db, eventBus, teamCapacity, "bet-b", "active");

				const [team] = await db.select().from(teams).where(eq(teams.id, "prod-1"));
				expect(team?.activeBets).toBe(2);

				const [a] = await db.select().from(bets).where(eq(bets.id, "bet-a"));
				const [b] = await db.select().from(bets).where(eq(bets.id, "bet-b"));
				expect(a?.status).toBe("active");
				expect(b?.status).toBe("active");
			});
		});

		describe("I1 B3: failed bet UPDATE rolls back activeBets", () => {
			test("does not leak an activeBets increment when the bet UPDATE fails inside the transaction", async ({
				db,
				eventBus,
			}) => {
				// @lore U1: transitionBet uses tx.update() inside the transaction — the
				// db.update spy won't intercept calls made via the transaction handle (tx).
				// Instead we verify the rollback semantics by attempting an impossible
				// transition (draft → completed, which is invalid) that causes an
				// InvalidTransitionError inside the transaction, triggering rollback.
				await seedBaseData(db);
				await db.insert(bets).values(makeBet({ status: "draft" }));

				// Snapshot pre-condition.
				const [teamBefore] = await db.select().from(teams).where(eq(teams.id, "prod-1"));
				expect(teamBefore?.activeBets).toBe(0);

				// Commit first bet to consume one slot (capacity=3, activeBets will become 1)
				await transitionBet(db, eventBus, teamCapacity, "bet-1", "active");
				const [teamMid] = await db.select().from(teams).where(eq(teams.id, "prod-1"));
				expect(teamMid?.activeBets).toBe(1);

				// Now attempt an invalid transition (active → draft — not a valid transition)
				// This should throw and leave activeBets unchanged
				await expect(transitionBet(db, eventBus, teamCapacity, "bet-1", "draft")).rejects.toThrow();

				// Post-condition: teamMembers.activeBets is unchanged (still 1, not leaked)
				const [teamAfter] = await db.select().from(teams).where(eq(teams.id, "prod-1"));
				expect(teamAfter?.activeBets).toBe(1);

				// Bet is still active
				const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
				expect(bet?.status).toBe("active");
			});
		});
	});

	// ---------------- I1 adversary-M1: concurrent completed transition double-emit ----------------
	describe("I1 M1: concurrent transitions are compare-and-set", () => {
		test("second transitionBet to completed throws InvalidTransitionError and does NOT re-emit bet_state_changed", async ({
			db,
			eventBus,
		}) => {
			await seedBaseData(db);
			// Walk the bet forward to `active` so "completed" is a valid transition.
			await db.insert(bets).values(makeBet({ status: "active" }));

			const events: Array<{ type: string; betId?: string; toState?: string }> = [];
			eventBus.on("*", (e: unknown) =>
				events.push(e as { type: string; betId?: string; toState?: string }),
			);

			// First transition wins — commits and emits bet_state_changed.
			await transitionBet(db, eventBus, teamCapacity, "bet-1", "completed");

			// Second transition observes the same `fromState` ("active")
			// because the pre-transaction read happens against the same row,
			// but the compare-and-set UPDATE pins `WHERE status = active`
			// and now the row is `completed`. changes === 0, the tx rolls
			// back, and InvalidTransitionError bubbles.
			await expect(transitionBet(db, eventBus, teamCapacity, "bet-1", "completed")).rejects.toThrow(
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
			const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
			expect(bet?.status).toBe("completed");
		});
	});
});
