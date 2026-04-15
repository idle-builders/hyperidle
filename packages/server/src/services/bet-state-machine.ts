import { type HyperIdleDb, bets, teams } from "@hyperidle/db";
import {
	type BetStatus,
	CapacityExceededError,
	type EventBus,
	InvalidTransitionError,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";

/**
 * Shape of a single entry in the revision log JSON array.
 */
export interface RevisionLogEntry {
	timestamp: string;
	field: string;
	old_value: unknown;
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
	in_progress: new Set(["shipped", "killed"]),
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

	// Capacity check at commit time
	if (toState === "committed") {
		if (team.activeBets >= team.capacity) {
			throw new CapacityExceededError(team.id, team.capacity);
		}
	}

	const revisionLog = parseRevisionLog(bet.revisionLog);
	const reason = options?.reason ?? `Transitioned to ${toState}`;
	const updatedLog = addRevisionEntry(revisionLog, "status", fromState, toState, reason);

	const updates: Record<string, unknown> = {
		status: toState,
		revisionLog: updatedLog,
	};

	// Increment/decrement activeBets
	if (toState === "committed") {
		db.update(teams)
			.set({ activeBets: team.activeBets + 1 })
			.where(eq(teams.id, team.id))
			.run();
	}

	if (toState === "shipped") {
		updates.shippedAt = new Date().toISOString();
		db.update(teams)
			.set({ activeBets: Math.max(0, team.activeBets - 1) })
			.where(eq(teams.id, team.id))
			.run();
	}

	if (toState === "killed" && (fromState === "committed" || fromState === "in_progress")) {
		db.update(teams)
			.set({ activeBets: Math.max(0, team.activeBets - 1) })
			.where(eq(teams.id, team.id))
			.run();
	}

	db.update(bets)
		.set(updates as Record<string, string>)
		.where(eq(bets.id, betId))
		.run();

	// Emit state changed event
	eventBus.emit({
		type: "bet_state_changed",
		streamId: bet.productId,
		betId,
		fromState,
		toState,
		timestamp: Date.now(),
	});

	// Emit shipped event
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
