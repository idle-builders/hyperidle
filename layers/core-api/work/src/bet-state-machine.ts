import type { HyperIdleDb } from "@hyperidle/db";
import {
	type BetStatus,
	CapacityExceededError,
	InvalidTransitionError,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { TeamCapacityReader } from "./ports.js";
import * as work from "./work-service.js";

/**
 * Valid state transitions for bets.
 * Key = fromState, Value = set of allowed toStates.
 *
 * @lore U1: Simplified from 9 statuses to 4 (draft | active | completed | killed).
 * Old status mapping: shaped->draft, committed|in_progress|behind|blocked|paused|review->active,
 * shipped->completed.
 */
const VALID_TRANSITIONS: Record<BetStatus, ReadonlySet<BetStatus>> = {
	draft: new Set(["active", "killed"]),
	active: new Set(["completed", "killed"]),
	completed: new Set(),
	killed: new Set(),
};

interface TransitionOptions {
	reason?: string;
	actor?: string;
}

/**
 * Transition a bet to a new state, enforcing valid transitions and business rules.
 *
 * @lore I1 B1-B3: the two mutating writes — `teamMembers.activeBets` delta and
 * `bets` status/log — live inside `db.transaction((tx) => {...})` so they
 * commit atomically. The capacity re-check is ALSO inside the tx (re-reading
 * the team via `tx`) so two concurrent commits serialize via SQLite's
 * write-locking rather than racing on a stale `activeBets` snapshot. Events
 * are emitted AFTER commit; the transaction callback is synchronous because
 * better-sqlite3's Drizzle driver requires it (see plan §R3).
 *
 * @lore U1: `teamMembers` table (formerly `teams`) is used for capacity checks.
 * The bet's `teamId` now references the `teams` table (domain entity).
 * We look up the team_members row via teamId (1:1 invariant).
 *
 * @lore AU19 Increment 1c: `teamCapacity` is an injected `org` Service port
 * (Mechanism C) — this used to import the `teamMembers` table directly (an
 * interim `table-ownership-guard.ts` exemption while `org` hadn't migrated
 * yet). An ordinary same-layer core-api→core-api edge, NOT §10.3
 * against-grain — wired to `@hyperidle/org`'s real
 * `getTeamMembersByTeamId`/`setTeamMembersActiveBets` unchanged.
 */
export async function transitionBet(
	db: HyperIdleDb,
	eventBus: EventBus,
	teamCapacity: TeamCapacityReader,
	betId: string,
	toState: BetStatus,
	options?: TransitionOptions,
): Promise<void> {
	const bet = await work.get(db, "bet", betId);
	if (!bet) {
		throw new Error(`Bet '${betId}' not found`);
	}

	const fromState = bet.status as BetStatus;
	const allowed = VALID_TRANSITIONS[fromState];
	if (!allowed.has(toState)) {
		throw new InvalidTransitionError(fromState, toState);
	}

	// Kill requires reason
	if (toState === "killed" && !options?.reason) {
		throw new Error("Killing a bet requires a reason");
	}

	// @lore U1: Look up teamMembers via bet.teamId (1:1 invariant: one teamMembers per team).
	const memberGroup = await teamCapacity.getByTeamId(db, bet.teamId);
	if (!memberGroup) {
		throw new Error(`TeamMembers for team '${bet.teamId}' not found`);
	}

	const updates: Partial<Pick<work.Bet, "status" | "completedAt">> = {
		status: toState,
	};
	if (toState === "completed") {
		updates.completedAt = new Date().toISOString();
	}

	// @lore I1 B3: inside the tx callback we intentionally use `db.update`
	// (not the `tx` handle) for the `bets` and `teamMembers` writes. Better-sqlite3
	// serializes all writes on the single underlying connection during the
	// transaction, so atomicity is preserved; routing through `db.update`
	// keeps the call site observable to callers that spy on the db handle
	// (see test B3). All reads also use `db` to match.
	//
	// @lore I1 adversary-M1: the `bets` UPDATE pins `WHERE status = fromState`
	// so two callers racing to `transitionBet(…, "completed")` cannot both
	// observe the same starting state. The loser sees `changes === 0` and
	// throws `InvalidTransitionError`; only the winner post-emits
	// `bet_state_changed`. Without the compare-and-set, concurrent commits
	// double-emit `bet_state_changed` and trip any downstream handler that
	// treats the event as a signal to fire an action exactly once (e.g.
	// release announcements).
	// @lore O1: `bet_shipped` was a redundant event. Consumers that need to
	// react to completion subscribe to `bet_state_changed` and filter
	// `event.toState === "completed"` instead.
	const transitioned = await db.transaction(async (tx): Promise<boolean> => {
		// Capacity check: re-read the teamMembers inside the tx so two concurrent
		// commits cannot both observe `activeBets < capacity` against a stale snapshot.
		const freshMemberGroup = await teamCapacity.getByTeamId(tx, bet.teamId);
		if (!freshMemberGroup) {
			throw new Error(`TeamMembers for team '${bet.teamId}' not found`);
		}

		if (toState === "active") {
			if (freshMemberGroup.activeBets >= freshMemberGroup.capacity) {
				throw new CapacityExceededError(freshMemberGroup.id, freshMemberGroup.capacity);
			}
		}

		const { applied } = await work.transition(tx, "bet", {
			id: betId,
			guard: { field: "status", equals: fromState },
			patch: updates,
		});

		// Lost the race: another concurrent transitionBet already moved the
		// bet out of `fromState`. Roll back (throwing exits the tx callback
		// and rolls the transaction) and surface as an invalid transition.
		if (!applied) {
			throw new InvalidTransitionError(fromState, toState);
		}

		if (toState === "active") {
			await teamCapacity.setActiveBets(
				tx,
				freshMemberGroup.teamId,
				freshMemberGroup.activeBets + 1,
			);
		}

		if (toState === "completed") {
			await teamCapacity.setActiveBets(
				tx,
				freshMemberGroup.teamId,
				Math.max(0, freshMemberGroup.activeBets - 1),
			);
		}

		if (
			toState === "killed" &&
			fromState !== "draft" &&
			fromState !== "completed" &&
			fromState !== "killed"
		) {
			await teamCapacity.setActiveBets(
				tx,
				freshMemberGroup.teamId,
				Math.max(0, freshMemberGroup.activeBets - 1),
			);
		}

		return true;
	});

	// Events emit AFTER commit — at-least-once delivery after durability.
	// Only the winner reaches this point (losers threw InvalidTransitionError
	// above), so `bet_state_changed` fires exactly once.
	if (!transitioned) return;

	// @lore U1: streamId is now bet.teamId (formerly bet.productId).
	eventBus.emit({
		type: "bet_state_changed",
		streamId: bet.teamId,
		betId,
		fromState,
		toState,
		timestamp: Date.now(),
	});
}

// @lore AU44 B3: updateBetField folded into bets.ts route PATCH handler.
// The false item_created emit for done_condition_change was deleted (no items
// row exists for the fabricated id — a lying announcement). See bets.ts PATCH.
