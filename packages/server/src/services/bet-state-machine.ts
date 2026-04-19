import { type HyperIdleDb, bets, teams } from "@hyperidle/db";
import {
	type BetStatus,
	CapacityExceededError,
	type EventBus,
	InvalidTransitionError,
} from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";

/**
 * Shape of a single entry in the revision log JSON array.
 */
export interface RevisionLogEntry {
	timestamp: string;
	field: string;
	// biome-ignore lint/style/useNamingConvention: serialized JSON format uses snake_case
	old_value: unknown;
	// biome-ignore lint/style/useNamingConvention: serialized JSON format uses snake_case
	new_value: unknown;
	reason: string;
}

/**
 * Valid state transitions for bets.
 * Key = fromState, Value = set of allowed toStates.
 */
const VALID_TRANSITIONS: Record<BetStatus, ReadonlySet<BetStatus>> = {
	shaped: new Set(["committed", "killed"]),
	committed: new Set(["in_progress", "shaped", "killed"]),
	in_progress: new Set(["behind", "blocked", "paused", "review", "shipped", "killed"]),
	behind: new Set(["in_progress", "blocked", "paused", "killed"]),
	blocked: new Set(["in_progress", "killed"]),
	paused: new Set(["in_progress", "killed"]),
	review: new Set(["shipped", "in_progress", "killed"]),
	shipped: new Set(),
	killed: new Set(),
};

interface TransitionOptions {
	reason?: string;
}

/** Fields that can be updated on an in_progress bet. */
const MUTABLE_FIELDS = new Set(["done_condition", "hypothesis", "appetite"]);

function parseRevisionLog(raw: string | null): RevisionLogEntry[] {
	if (!raw) return [];
	return JSON.parse(raw) as RevisionLogEntry[];
}

function addRevisionEntry(
	existing: RevisionLogEntry[],
	field: string,
	oldValue: unknown,
	newValue: unknown,
	reason: string,
): string {
	const entry: RevisionLogEntry = {
		timestamp: new Date().toISOString(),
		field,
		old_value: oldValue,
		new_value: newValue,
		reason,
	};
	return JSON.stringify([...existing, entry]);
}

/**
 * Transition a bet to a new state, enforcing valid transitions and business rules.
 *
 * @lore I1 B1-B3: the two mutating writes — `teams.activeBets` delta and
 * `bets` status/log — live inside `db.transaction((tx) => {...})` so they
 * commit atomically. The capacity re-check is ALSO inside the tx (re-reading
 * the team via `tx`) so two concurrent commits serialize via SQLite's
 * write-locking rather than racing on a stale `activeBets` snapshot. Events
 * are emitted AFTER commit; the transaction callback is synchronous because
 * better-sqlite3's Drizzle driver requires it (see plan §R3).
 */
export async function transitionBet(
	db: HyperIdleDb,
	eventBus: EventBus,
	betId: string,
	toState: BetStatus,
	options?: TransitionOptions,
): Promise<void> {
	const bet = db.select().from(bets).where(eq(bets.id, betId)).get();
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

	// Reshape requires reason
	if (fromState === "committed" && toState === "shaped" && !options?.reason) {
		throw new Error("Reshaping a bet requires a reason");
	}

	const team = db.select().from(teams).where(eq(teams.id, bet.teamId)).get();
	if (!team) {
		throw new Error(`Team '${bet.teamId}' not found`);
	}

	const revisionLog = parseRevisionLog(bet.revisionLog);
	const reason = options?.reason ?? `Transitioned to ${toState}`;
	const updatedLog = addRevisionEntry(revisionLog, "status", fromState, toState, reason);

	const updates: Record<string, unknown> = {
		status: toState,
		revisionLog: updatedLog,
	};
	if (toState === "shipped") {
		updates.shippedAt = new Date().toISOString();
	}

	// @lore I1 B3: inside the tx callback we intentionally use `db.update`
	// (not the `tx` handle) for the `bets` and `teams` writes. Better-sqlite3
	// serializes all writes on the single underlying connection during the
	// transaction, so atomicity is preserved; routing through `db.update`
	// keeps the call site observable to callers that spy on the db handle
	// (see test B3). All reads also use `db` to match.
	//
	// @lore I1 adversary-M1: the `bets` UPDATE pins `WHERE status = fromState`
	// so two callers racing to `transitionBet(…, "shipped")` cannot both
	// observe the same starting state. The loser sees `changes === 0` and
	// throws `InvalidTransitionError`; only the winner post-emits
	// `bet_state_changed` + `bet_shipped`. Without the compare-and-set,
	// concurrent commits double-emit `bet_shipped` and trip any downstream
	// handler that treats the event as a signal to fire an action exactly
	// once (e.g. release announcements).
	const transitioned = db.transaction((): boolean => {
		// Capacity check: re-read the team inside the tx so two concurrent
		// commits cannot both observe `activeBets < capacity` against a stale
		// snapshot.
		const freshTeam = db.select().from(teams).where(eq(teams.id, bet.teamId)).get();
		if (!freshTeam) {
			throw new Error(`Team '${bet.teamId}' not found`);
		}

		if (toState === "committed") {
			if (freshTeam.activeBets >= freshTeam.capacity) {
				throw new CapacityExceededError(freshTeam.id, freshTeam.capacity);
			}
		}

		const updateResult = db
			.update(bets)
			.set(updates as Record<string, string>)
			.where(and(eq(bets.id, betId), eq(bets.status, fromState)))
			.run();

		// Lost the race: another concurrent transitionBet already moved the
		// bet out of `fromState`. Roll back (throwing exits the tx callback
		// and rolls the transaction) and surface as an invalid transition.
		if (updateResult.changes === 0) {
			throw new InvalidTransitionError(fromState, toState);
		}

		if (toState === "committed") {
			db.update(teams)
				.set({ activeBets: freshTeam.activeBets + 1 })
				.where(eq(teams.id, freshTeam.id))
				.run();
		}

		if (toState === "shipped") {
			db.update(teams)
				.set({ activeBets: Math.max(0, freshTeam.activeBets - 1) })
				.where(eq(teams.id, freshTeam.id))
				.run();
		}

		if (
			toState === "killed" &&
			fromState !== "shaped" &&
			fromState !== "shipped" &&
			fromState !== "killed"
		) {
			db.update(teams)
				.set({ activeBets: Math.max(0, freshTeam.activeBets - 1) })
				.where(eq(teams.id, freshTeam.id))
				.run();
		}

		return true;
	});

	// Events emit AFTER commit — at-least-once delivery after durability.
	// Only the winner reaches this point (losers threw InvalidTransitionError
	// above), so `bet_state_changed` + `bet_shipped` fire exactly once.
	if (!transitioned) return;

	eventBus.emit({
		type: "bet_state_changed",
		streamId: bet.productId,
		betId,
		fromState,
		toState,
		timestamp: Date.now(),
	});

	if (toState === "shipped") {
		eventBus.emit({
			type: "bet_shipped",
			streamId: bet.productId,
			betId,
			timestamp: Date.now(),
		});
	}
}

/**
 * Update a mutable field on an in_progress bet with revision logging.
 */
// biome-ignore lint/suspicious/useAwait: callers expect Promise return for consistency with async service layer
export async function updateBetField(
	db: HyperIdleDb,
	eventBus: EventBus,
	betId: string,
	field: string,
	newValue: string,
	reason: string,
): Promise<void> {
	if (!MUTABLE_FIELDS.has(field)) {
		throw new Error(`Field '${field}' is not mutable on an in_progress bet`);
	}

	const bet = db.select().from(bets).where(eq(bets.id, betId)).get();
	if (!bet) {
		throw new Error(`Bet '${betId}' not found`);
	}

	if (bet.status !== "in_progress") {
		throw new Error(`Can only update fields on in_progress bets, current status: '${bet.status}'`);
	}

	// Map field name to the DB column key
	const columnMap: Record<string, keyof typeof bet> = {
		done_condition: "doneCondition",
		hypothesis: "hypothesis",
		appetite: "appetite",
	};
	const columnKey = columnMap[field];
	if (!columnKey) {
		throw new Error(`Unknown field mapping for '${field}'`);
	}

	const oldValue = bet[columnKey];
	const revisionLog = parseRevisionLog(bet.revisionLog);
	const updatedLog = addRevisionEntry(revisionLog, field, oldValue, newValue, reason);

	db.update(bets)
		.set({ [columnKey]: newValue, revisionLog: updatedLog } as Record<string, string>)
		.where(eq(bets.id, betId))
		.run();

	// If done_condition changed, emit item_created for human review
	if (field === "done_condition") {
		eventBus.emit({
			type: "item_created",
			streamId: bet.productId,
			itemId: `review-${betId}-${Date.now()}`,
			conversationId: betId,
			kind: "done_condition_change",
			timestamp: Date.now(),
		});
	}
}
