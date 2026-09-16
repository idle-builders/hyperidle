import { randomUUID } from "node:crypto";
import {
	type HyperIdleDb,
	type KnowledgeItem,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import type { EventBus, KnowledgeUpdatedEvent } from "@hyperidle/event-bus";
import { and, eq, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";

// --- Constants ---

/**
 * Threshold for auto-promotion.
 *
 * TRACK-G §G3 AC2: "same finding in 5+ sessions → VALIDATED" (now: proposed
 * -> active).
 *
 * @lore nested-knowledge-items §4: the old `(layer, topic, kind)` signature
 * is GONE with those three vocabularies — the sibling set (same
 * `parentKind`/`parentId`) replaces it. Removing the three fields without a
 * replacement would degenerate the signature to empty, matching every row —
 * a scheduled sweep would then mass-promote the entire store. We match on
 * distinct `scope_id` values (cross-scope repetition) among items that share
 * one parent.
 */
const AUTO_PROMOTION_REPETITION_THRESHOLD = 5;

/**
 * Stale threshold — items older than this are candidates for marking stale.
 *
 * TRACK-G §G3 AC4: "Stale detection: ACTIVE unused >90 days → STALE".
 */
const STALE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Marker editor string for auto-promotion edit-log entries so provenance
 * of a status change is unambiguously machine-originated.
 *
 * @lore G3 system:* prefix: the `system:*` prefix is reserved for
 * machine-initiated edits (auto-promotion, sweeps, migrations) and must
 * NOT be used as a real agent id. Real agent-authored edits use the
 * `agent:<role>` shape. Distinguishing the two lets provenance queries
 * separate human-or-agent decisions from system-driven ones without a
 * separate column.
 */
const AUTO_PROMOTION_EDITOR = "system:auto-promotion";

/**
 * Default upper bound on how many candidates a single sweep pass will
 * consider. Sweeps are expected to run on a schedule, so a backlog
 * simply drains across successive runs rather than blowing the event
 * loop on one pass.
 *
 * @lore G3 sweep cap: bounding the initial SELECT prevents a
 * self-inflicted outage when the proposed or active pool grows
 * unexpectedly (for example after a bulk import). 1000 is well above
 * steady-state sweep volume and still cheap to iterate synchronously.
 * Callers that need different behavior can pass `maxBatchSize`.
 */
const DEFAULT_SWEEP_MAX_BATCH_SIZE = 1000;

// --- Types ---

/** Auto-promotion recommendation for a single knowledge item. */
type AutoPromotionResult =
	| { readonly shouldPromote: true; readonly reason: string; readonly distinctScopes: number }
	| { readonly shouldPromote: false; readonly reason: string; readonly distinctScopes: number };

/** Summary of an auto-promotion sweep. */
interface AutoPromotionSweepResult {
	readonly scanned: number;
	readonly promotedIds: readonly string[];
	readonly flaggedForReviewIds: readonly string[];
	readonly skippedIds: readonly string[];
}

/** Summary of a stale sweep. */
interface StaleSweepResult {
	readonly markedIds: readonly string[];
}

async function hasOpenConflict(db: HyperIdleDb, itemId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: knowledgeConflicts.id })
		.from(knowledgeConflicts)
		.where(and(eq(knowledgeConflicts.itemId, itemId), eq(knowledgeConflicts.status, "open")))
		.limit(1);
	return Boolean(row);
}

// --- Public API ---

/**
 * Decide whether a knowledge item should be auto-promoted to `active`
 * based on cross-scope repetition among its siblings.
 *
 * @lore nested-knowledge-items §4: the sibling set — same `parentKind` +
 * `parentId` — replaces the old `(layer, topic, kind)` signature. `scope_id`
 * itself is deliberately excluded from the grouping key — the rule is about
 * the *same finding* recurring across different scopes under one parent.
 */
async function checkAutoPromotion(
	db: HyperIdleDb,
	knowledgeItemId: string,
): Promise<AutoPromotionResult> {
	const [subject] = await db
		.select()
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, knowledgeItemId))
		.limit(1);
	if (!subject) {
		return { shouldPromote: false, reason: "NOT_FOUND", distinctScopes: 0 };
	}

	const parentKind = subject.parentKind ?? null;
	const parentId = subject.parentId ?? null;

	// Count distinct scope_id values among siblings (same parent) that are
	// not archived. Items with NULL scope_id are excluded — they cannot
	// demonstrate cross-scope repetition (which is the whole point of AC2).
	const [row] = await db
		.select({ count: sql<number>`COUNT(DISTINCT ${knowledgeItems.scopeId})` })
		.from(knowledgeItems)
		.where(
			and(
				parentKind === null
					? isNull(knowledgeItems.parentKind)
					: eq(knowledgeItems.parentKind, parentKind),
				parentId === null ? isNull(knowledgeItems.parentId) : eq(knowledgeItems.parentId, parentId),
				ne(knowledgeItems.status, "archived"),
				isNotNull(knowledgeItems.scopeId),
			),
		)
		.limit(1);

	const distinctScopes = Number(row?.count ?? 0);

	if (distinctScopes < AUTO_PROMOTION_REPETITION_THRESHOLD) {
		return {
			shouldPromote: false,
			reason: `distinct scopes ${distinctScopes} below threshold ${AUTO_PROMOTION_REPETITION_THRESHOLD}`,
			distinctScopes,
		};
	}

	return {
		shouldPromote: true,
		reason: `distinct scopes ${distinctScopes} meets threshold ${AUTO_PROMOTION_REPETITION_THRESHOLD}`,
		distinctScopes,
	};
}

/**
 * Return `active` knowledge items whose `updated_at` is older than
 * `thresholdMs` before `nowMs`. Result is capped at `maxBatchSize` so
 * the caller can bound the working set per pass — additional stale
 * items will be returned by the next scheduled run.
 */
async function findStaleItems(
	db: HyperIdleDb,
	nowMs: number,
	thresholdMs: number = STALE_THRESHOLD_MS,
	maxBatchSize: number = DEFAULT_SWEEP_MAX_BATCH_SIZE,
): Promise<readonly KnowledgeItem[]> {
	const cutoff = new Date(nowMs - thresholdMs).toISOString();
	return db
		.select()
		.from(knowledgeItems)
		.where(and(eq(knowledgeItems.status, "active"), lt(knowledgeItems.updatedAt, cutoff)))
		.limit(maxBatchSize);
}

/**
 * Transition a single `active` item to `stale`. Uses the same
 * conditional-UPDATE pattern as `promote_knowledge` (G1) so concurrent
 * callers cannot both succeed.
 *
 * Writes `knowledge_edit_log.editor = 'system:auto-promotion'` to mark
 * provenance. Returns true when the transition succeeded, false when the
 * row was no longer `active` (concurrent modification or not found).
 */
async function markStale(db: HyperIdleDb, itemId: string): Promise<boolean> {
	const isoNow = new Date().toISOString();
	return db.transaction(async (tx): Promise<boolean> => {
		const [row] = await tx
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, itemId))
			.limit(1);
		if (!row) return false;
		if (row.status !== "active") return false;

		const updateRows = await tx
			.update(knowledgeItems)
			.set({ status: "stale", updatedAt: isoNow, updatedBy: AUTO_PROMOTION_EDITOR })
			.where(and(eq(knowledgeItems.id, itemId), eq(knowledgeItems.status, "active")))
			.returning({ id: knowledgeItems.id });

		if (updateRows.length === 0) return false;

		await tx.insert(knowledgeEditLog).values({
			id: randomUUID(),
			itemId,
			editor: AUTO_PROMOTION_EDITOR,
			field: "status",
			oldValue: "active",
			newValue: "stale | reason: no activity in 90+ days",
			editType: "refinement",
			createdAt: isoNow,
		});

		return true;
	});
}

/**
 * Sweep all `proposed` knowledge items and auto-promote those that
 * meet AC2 (5+ cross-scope repetitions), AC3 (no L4 contradiction), and
 * AC5 (no open conflicts).
 *
 * Emits one `knowledge_updated` event per promotion (`action=auto_promoted`)
 * and one per contradiction flag (`action=contradiction_flagged`).
 *
 * @param maxBatchSize Upper bound on candidates loaded in this pass.
 *   Defaults to {@link DEFAULT_SWEEP_MAX_BATCH_SIZE}. Sweeps run on a
 *   schedule so any backlog drains across successive runs.
 */
async function runAutoPromotionSweep(
	db: HyperIdleDb,
	eventBus: EventBus,
	maxBatchSize: number = DEFAULT_SWEEP_MAX_BATCH_SIZE,
): Promise<AutoPromotionSweepResult> {
	const candidates = await db
		.select()
		.from(knowledgeItems)
		.where(eq(knowledgeItems.status, "proposed"))
		.limit(maxBatchSize);

	const promotedIds: string[] = [];
	const flaggedForReviewIds: string[] = [];
	const skippedIds: string[] = [];

	for (const item of candidates) {
		// AC5 — open conflict blocks auto-promotion
		if (await hasOpenConflict(db, item.id)) {
			skippedIds.push(item.id);
			continue;
		}

		// AC2 — cross-scope repetition threshold
		const rec = await checkAutoPromotion(db, item.id);
		if (!rec.shouldPromote) {
			skippedIds.push(item.id);
			continue;
		}

		// Promote — proposed -> active with AUTO_PROMOTION_EDITOR provenance.
		const promoted = await promoteToActiveAuto(db, item.id);
		if (!promoted) {
			skippedIds.push(item.id);
			continue;
		}

		promotedIds.push(item.id);
		const promoteEvent: KnowledgeUpdatedEvent = {
			type: "knowledge_updated",
			streamId: randomUUID(),
			itemId: item.id,
			action: "auto_promoted",
			timestamp: Date.now(),
		};
		eventBus.emit(promoteEvent);
	}

	return {
		scanned: candidates.length,
		promotedIds,
		flaggedForReviewIds,
		skippedIds,
	};
}

/** Options for {@link runStaleSweep}. */
interface StaleSweepOptions {
	/** Upper bound on candidates loaded in this pass. */
	readonly maxBatchSize?: number;
	/**
	 * When true, skip emitting `knowledge_updated` events for each
	 * transition. DB writes still happen — the silent flag is purely
	 * about whether the event bus is notified.
	 *
	 * @lore G4 silent knowledge-decay: the built-in `knowledge-decay`
	 * routine is seeded with `silent=1` so its scheduled sweep does not
	 * flood subscribers (e.g. session-review-creator) with
	 * decay events every day. When silent is set, the sweep still writes
	 * the `stale` transitions and the edit log — only the event emission
	 * is suppressed.
	 */
	readonly silent?: boolean;
}

/**
 * Sweep all stale candidates and transition them to `stale`, emitting a
 * `knowledge_updated` event per transition (unless `silent` is true).
 *
 * @param thresholdMs Stale cutoff in milliseconds. Defaults to
 *   {@link STALE_THRESHOLD_MS}.
 * @param options.maxBatchSize Upper bound on candidates loaded in this
 *   pass. Defaults to {@link DEFAULT_SWEEP_MAX_BATCH_SIZE}.
 * @param options.silent When true, skip emitting events. DB writes still
 *   occur.
 */
async function runStaleSweep(
	db: HyperIdleDb,
	eventBus: EventBus,
	nowMs: number,
	thresholdMs: number = STALE_THRESHOLD_MS,
	options: StaleSweepOptions = {},
): Promise<StaleSweepResult> {
	const maxBatchSize = options.maxBatchSize ?? DEFAULT_SWEEP_MAX_BATCH_SIZE;
	const silent = options.silent ?? false;
	const candidates = await findStaleItems(db, nowMs, thresholdMs, maxBatchSize);
	const markedIds: string[] = [];
	for (const item of candidates) {
		if (await markStale(db, item.id)) {
			markedIds.push(item.id);
			if (!silent) {
				const event: KnowledgeUpdatedEvent = {
					type: "knowledge_updated",
					streamId: randomUUID(),
					itemId: item.id,
					action: "marked_stale",
					timestamp: nowMs,
				};
				eventBus.emit(event);
			}
		}
	}
	return { markedIds };
}

export function sweep(
	db: HyperIdleDb,
	eventBus: EventBus,
	kind: "autoPromotion",
	options?: { readonly maxBatchSize?: number },
): Promise<AutoPromotionSweepResult>;
export function sweep(
	db: HyperIdleDb,
	eventBus: EventBus,
	kind: "stale",
	options: {
		readonly nowMs: number;
		readonly thresholdMs?: number;
		readonly maxBatchSize?: number;
		readonly silent?: boolean;
	},
): Promise<StaleSweepResult>;
export function sweep(
	db: HyperIdleDb,
	eventBus: EventBus,
	kind: "autoPromotion" | "stale",
	options: {
		readonly nowMs?: number;
		readonly thresholdMs?: number;
		readonly maxBatchSize?: number;
		readonly silent?: boolean;
	} = {},
): Promise<AutoPromotionSweepResult | StaleSweepResult> {
	if (kind === "autoPromotion") return runAutoPromotionSweep(db, eventBus, options.maxBatchSize);
	return runStaleSweep(db, eventBus, options.nowMs ?? Date.now(), options.thresholdMs, options);
}

// --- Internal ---

/**
 * Transition a proposed item to active within the same
 * transactional gate + conditional UPDATE + edit-log pattern as the G1
 * `promote_knowledge` tool. Uses the AUTO_PROMOTION_EDITOR marker.
 *
 * Returns true on success, false if the item was no longer proposed
 * (concurrent modification) or a last-second open-conflict check fired.
 *
 * @lore G3 gate parity: this function duplicates the gate logic from
 * `packages/server/src/tools/promote-knowledge.ts` intentionally —
 * promote-knowledge is a server-layer tool and the app-runtime layer must not
 * import from server. The transaction shape and CONFLICT_OPEN gate must
 * stay in lockstep; any change to one requires the corresponding change
 * here.
 */
async function promoteToActiveAuto(db: HyperIdleDb, itemId: string): Promise<boolean> {
	const isoNow = new Date().toISOString();
	return db.transaction(async (tx): Promise<boolean> => {
		// Re-check the open-conflict gate inside the transaction so a
		// racing conflict insert cannot sneak a promotion through.
		const [openConflict] = await tx
			.select({ id: knowledgeConflicts.id })
			.from(knowledgeConflicts)
			.where(and(eq(knowledgeConflicts.itemId, itemId), eq(knowledgeConflicts.status, "open")))
			.limit(1);
		if (openConflict) return false;

		const updateRows = await tx
			.update(knowledgeItems)
			.set({ status: "active", updatedAt: isoNow, updatedBy: AUTO_PROMOTION_EDITOR })
			.where(and(eq(knowledgeItems.id, itemId), eq(knowledgeItems.status, "proposed")))
			.returning({ id: knowledgeItems.id });

		if (updateRows.length === 0) return false;

		await tx.insert(knowledgeEditLog).values({
			id: randomUUID(),
			itemId,
			editor: AUTO_PROMOTION_EDITOR,
			field: "status",
			oldValue: "proposed",
			newValue: `active | reason: auto-promotion at ${AUTO_PROMOTION_REPETITION_THRESHOLD}+ cross-scope repetitions`,
			editType: "refinement",
			createdAt: isoNow,
		});

		return true;
	});
}
