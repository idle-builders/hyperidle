import { randomUUID } from "node:crypto";
import {
	type HyperIdleDb,
	type KnowledgeItem,
	knowledgeAppProjection,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import type { EventBus, KnowledgeUpdatedEvent } from "@hyperidle/shared";
import { and, eq, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import type { KnowledgeItemWithProjection } from "./knowledge-repository.js";

// --- Constants ---

/**
 * Threshold for auto-promotion.
 *
 * TRACK-G §G3 AC2: "same finding in 5+ sessions → VALIDATED".
 * KNOWLEDGE_ARCHITECTURE.md §6.5: "If the same pattern shows up in 5
 * products and never gets contradicted, the facilitator can auto-promote
 * it from PROVISIONAL straight to VALIDATED via repetition."
 *
 * We match on distinct `scope_id` values (cross-product repetition) with
 * the same `(layer, topic, kind)` signature.
 */
export const AUTO_PROMOTION_REPETITION_THRESHOLD = 5;

/**
 * Stale threshold — items older than this are candidates for marking stale.
 *
 * TRACK-G §G3 AC4: "Stale detection: ACTIVE unused >90 days → STALE".
 */
export const STALE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

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
export const AUTO_PROMOTION_EDITOR = "system:auto-promotion";

/**
 * Default upper bound on how many candidates a single sweep pass will
 * consider. Sweeps are expected to run on a schedule, so a backlog
 * simply drains across successive runs rather than blowing the event
 * loop on one pass.
 *
 * @lore G3 sweep cap: bounding the initial SELECT prevents a
 * self-inflicted outage when the provisional or active pool grows
 * unexpectedly (for example after a bulk import). 1000 is well above
 * steady-state sweep volume and still cheap to iterate synchronously.
 * Callers that need different behavior can pass `maxBatchSize`.
 */
export const DEFAULT_SWEEP_MAX_BATCH_SIZE = 1000;

// --- Types ---

/** Auto-promotion recommendation for a single knowledge item. */
export type AutoPromotionResult =
	| { readonly shouldPromote: true; readonly reason: string; readonly distinctScopes: number }
	| { readonly shouldPromote: false; readonly reason: string; readonly distinctScopes: number };

/** Contradiction detection result. */
export type ContradictionResult =
	| { readonly contradicts: true; readonly withItemId: string; readonly reason: string }
	| { readonly contradicts: false };

/** Summary of an auto-promotion sweep. */
export interface AutoPromotionSweepResult {
	readonly scanned: number;
	readonly promotedIds: readonly string[];
	readonly flaggedForReviewIds: readonly string[];
	readonly skippedIds: readonly string[];
}

/** Summary of a stale sweep. */
export interface StaleSweepResult {
	readonly markedIds: readonly string[];
}

// --- Helpers ---

interface ParsedMeta {
	readonly claims?: readonly string[];
	readonly forbids?: readonly string[];
}

function parseMeta(raw: string | null): ParsedMeta {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return {};
		const obj = parsed as Record<string, unknown>;
		const claims = Array.isArray(obj.claims)
			? obj.claims.filter((c): c is string => typeof c === "string")
			: undefined;
		const forbids = Array.isArray(obj.forbids)
			? obj.forbids.filter((c): c is string => typeof c === "string")
			: undefined;
		return { claims, forbids };
	} catch {
		// @lore G3: malformed meta JSON is treated as empty, not a crash.
		// Meta may come from agent-authored tool calls — a single bad row
		// must not break a sweep over thousands of items.
		return {};
	}
}

/**
 * Signature used for cross-scope repetition matching.
 *
 * @lore G3 topic null vs empty: `topic = NULL` and `topic = ''` are
 * treated as DISTINCT signatures. Collapsing them would silently merge
 * two editorially different groups ("no topic" vs. "explicitly blank
 * topic"). A signature where topic is `null` only matches rows where
 * `topic IS NULL`; a signature where topic is `''` only matches rows
 * where `topic = ''`. If a future use-case genuinely wants the merged
 * behavior, add it as an explicit option rather than flipping the
 * default back.
 *
 * @lore O2: layer and kind are now in the projection table; the
 * function accepts KnowledgeItemWithProjection (optional projection fields).
 * Items missing a projection row have layer=null and kind=null, meaning
 * they form their own degenerate signature group.
 */
function signatureFor(item: Pick<KnowledgeItemWithProjection, "layer" | "topic" | "kind">): {
	layer: string | null;
	topic: string | null;
	kind: string | null;
} {
	return {
		layer: item.layer ?? null,
		topic: item.topic,
		kind: item.kind ?? null,
	};
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
 * Decide whether a knowledge item should be auto-promoted to `validated`
 * based on cross-scope repetition of its signature.
 *
 * The signature is `(layer, topic, kind)` with `scope_id` deliberately
 * excluded — the rule is about the *same finding* recurring across
 * different products/communities.
 *
 * @lore G3 signature: `scope_id` is excluded from the signature on
 * purpose. Including it would make every item trivially unique and
 * defeat AC2 ("same finding in 5 products → VALIDATED").
 */
export async function checkAutoPromotion(
	db: HyperIdleDb,
	knowledgeItemId: string,
): Promise<AutoPromotionResult> {
	// @lore O2: projection fields (layer, kind, scopeId) are in knowledgeAppProjection.
	// We LEFT JOIN to get both kernel and projection columns together.
	const [subjectRow] = await db
		.select({
			item: knowledgeItems,
			fabric: knowledgeAppProjection,
		})
		.from(knowledgeItems)
		.leftJoin(knowledgeAppProjection, eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id))
		.where(eq(knowledgeItems.id, knowledgeItemId))
		.limit(1);
	if (!subjectRow) {
		return { shouldPromote: false, reason: "NOT_FOUND", distinctScopes: 0 };
	}

	const subject: KnowledgeItemWithProjection = {
		...subjectRow.item,
		layer: subjectRow.fabric?.layer ?? null,
		scopeId: subjectRow.fabric?.scopeId ?? null,
		kind: subjectRow.fabric?.kind ?? null,
		attentionScore: subjectRow.fabric?.attentionScore ?? null,
		confidence: subjectRow.fabric?.confidence ?? null,
		meta: subjectRow.fabric?.meta ?? null,
	};

	const sig = signatureFor(subject);

	// Count distinct scope_id values for non-archived items with matching signature.
	// Items with NULL scope_id are excluded — they cannot demonstrate
	// cross-product repetition (which is the whole point of AC2).
	// @lore O2: JOIN with knowledgeAppProjection to filter on layer/kind/scopeId.
	const [row] = await db
		.select({ count: sql<number>`COUNT(DISTINCT ${knowledgeAppProjection.scopeId})` })
		.from(knowledgeItems)
		.innerJoin(
			knowledgeAppProjection,
			eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
		)
		.where(
			and(
				sig.layer != null
					? eq(knowledgeAppProjection.layer, sig.layer)
					: isNull(knowledgeAppProjection.layer),
				sig.kind != null
					? eq(knowledgeAppProjection.kind, sig.kind)
					: isNull(knowledgeAppProjection.kind),
				// Topic matching: NULL and '' are distinct signatures — see
				// `signatureFor` lore. `eq` with a NULL RHS would yield a SQL
				// `topic = NULL` which is always false in SQL three-valued
				// logic, so we branch on `isNull` explicitly.
				sig.topic === null ? isNull(knowledgeItems.topic) : eq(knowledgeItems.topic, sig.topic),
				ne(knowledgeItems.status, "archived"),
				isNotNull(knowledgeAppProjection.scopeId),
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
 * Structural contradiction heuristic between an L3 proposed practice and
 * any existing L4 principle on the same topic.
 *
 * Heuristic (two matching clauses):
 *   1. L4 principle shares the L3 item's `topic` AND L4.meta.forbids
 *      contains the L3 item's `topic` OR any string in L3.meta.claims.
 *   2. L4 principle shares the L3 item's `topic` AND L3.meta.claims
 *      contains any string in L4.meta.forbids.
 *
 * Returns the first L4 item that matches (deterministic ordering by id).
 *
 * @lore G3 contradiction heuristic: structural only. Prose-level
 * contradictions are not caught — they require the attention engine's
 * conflict signal + human review. False positives are possible when two
 * items share a topic string but semantically don't conflict. Documented
 * limitation — see plans/work-packages/G3-plan.md §3.3.
 */
export async function detectLayerContradiction(
	db: HyperIdleDb,
	knowledgeItemId: string,
): Promise<ContradictionResult> {
	// @lore O2: layer, kind, meta are in knowledgeAppProjection. LEFT JOIN to get them.
	const [subjectRow] = await db
		.select({
			item: knowledgeItems,
			fabric: knowledgeAppProjection,
		})
		.from(knowledgeItems)
		.leftJoin(knowledgeAppProjection, eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id))
		.where(eq(knowledgeItems.id, knowledgeItemId))
		.limit(1);
	if (!subjectRow) {
		return { contradicts: false };
	}

	const subjectLayer = subjectRow.fabric?.layer ?? null;
	const subjectMeta = subjectRow.fabric?.meta ?? null;

	// The rule applies only to L3 proposals being checked against L4 principles.
	if (subjectLayer !== "L3") {
		return { contradicts: false };
	}
	if (!subjectRow.item.topic) {
		return { contradicts: false };
	}

	const subjectMetaParsed = parseMeta(subjectMeta);
	const subjectClaims = subjectMetaParsed.claims ?? [];
	const subjectTopic = subjectRow.item.topic;

	// Find L4 principles on the same topic.
	// @lore O2: JOIN with app projection to filter by layer and kind from the extension table.
	const principleRows = await db
		.select({
			item: knowledgeItems,
			fabric: knowledgeAppProjection,
		})
		.from(knowledgeItems)
		.innerJoin(
			knowledgeAppProjection,
			eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
		)
		.where(
			and(
				eq(knowledgeAppProjection.layer, "L4"),
				eq(knowledgeAppProjection.kind, "principle"),
				eq(knowledgeItems.topic, subjectTopic),
				ne(knowledgeItems.status, "archived"),
			),
		);

	for (const principleRow of principleRows) {
		const pMeta = parseMeta(principleRow.fabric?.meta ?? null);
		const forbids = pMeta.forbids ?? [];
		if (forbids.length === 0) continue;

		// Clause 1a: forbids contains the L3 item's topic
		if (forbids.includes(subjectTopic)) {
			return {
				contradicts: true,
				withItemId: principleRow.item.id,
				reason: `L4 principle ${principleRow.item.id}.meta.forbids includes topic '${subjectTopic}'`,
			};
		}

		// Clause 1b / 2: overlap between L4.forbids and L3.claims
		for (const claim of subjectClaims) {
			if (forbids.includes(claim)) {
				return {
					contradicts: true,
					withItemId: principleRow.item.id,
					reason: `L4 principle ${principleRow.item.id}.meta.forbids overlaps L3 claim '${claim}'`,
				};
			}
		}
	}

	return { contradicts: false };
}

/**
 * Return `active` knowledge items whose `updated_at` is older than
 * `thresholdMs` before `nowMs`. Result is capped at `maxBatchSize` so
 * the caller can bound the working set per pass — additional stale
 * items will be returned by the next scheduled run.
 */
export async function findStaleItems(
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
export async function markStale(db: HyperIdleDb, itemId: string): Promise<boolean> {
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
 * Sweep all `provisional` knowledge items and auto-promote those that
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
export async function runAutoPromotionSweep(
	db: HyperIdleDb,
	eventBus: EventBus,
	maxBatchSize: number = DEFAULT_SWEEP_MAX_BATCH_SIZE,
): Promise<AutoPromotionSweepResult> {
	const candidates = await db
		.select()
		.from(knowledgeItems)
		.where(eq(knowledgeItems.status, "provisional"))
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

		// AC3 — structural contradiction with L4 principle
		const contradiction = await detectLayerContradiction(db, item.id);
		if (contradiction.contradicts) {
			flaggedForReviewIds.push(item.id);
			const flagEvent: KnowledgeUpdatedEvent = {
				type: "knowledge_updated",
				streamId: randomUUID(),
				itemId: item.id,
				action: "contradiction_flagged",
				timestamp: Date.now(),
			};
			eventBus.emit(flagEvent);
			continue;
		}

		// Promote — provisional → validated with AUTO_PROMOTION_EDITOR provenance.
		const promoted = await promoteToValidatedAuto(db, item.id);
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
export interface StaleSweepOptions {
	/** Upper bound on candidates loaded in this pass. */
	readonly maxBatchSize?: number;
	/**
	 * When true, skip emitting `knowledge_updated` events for each
	 * transition. DB writes still happen — the silent flag is purely
	 * about whether the event bus is notified.
	 *
	 * @lore G4 silent knowledge-decay: the built-in `knowledge-decay`
	 * routine is seeded with `silent=1` so its scheduled sweep does not
	 * flood subscribers (e.g. git-export, session-review-creator) with
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
export async function runStaleSweep(
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

// ---------------------------------------------------------------------------
// Absorbed from promotion-transition.ts (AU20 Ag7a — per-consumer barrel retired)
// findKnowledgeItemStatusById is retired; its only consumer (tool-handlers-bindings.ts)
// now uses findById from knowledge-repository.ts.
// ---------------------------------------------------------------------------

export type PromoteKnowledgeItemResult =
	| { readonly ok: true; readonly fromStatus: string }
	| {
			readonly ok: false;
			readonly code: "CONFLICT_OPEN" | "CONCURRENT_MODIFICATION";
			readonly message: string;
	  };

export interface PromoteKnowledgeItemInput {
	readonly knowledgeItemId: string;
	readonly fromStatus: string;
	readonly toStatus: string;
	readonly reason: string | undefined;
	readonly editor: string;
}

/**
 * Atomic status-transition for the `promote_knowledge` tool.
 * The whole gate-check + conditional-UPDATE + edit-log-INSERT transaction is one
 * knowledge-owned function — behaviour byte-identical to the pre-migration inline block.
 */
export async function promoteKnowledgeItem(
	db: HyperIdleDb,
	input: PromoteKnowledgeItemInput,
): Promise<PromoteKnowledgeItemResult> {
	const { knowledgeItemId, fromStatus, toStatus, reason, editor } = input;
	const isoNow = new Date().toISOString();

	return db.transaction(async (tx): Promise<PromoteKnowledgeItemResult> => {
		if (toStatus === "validated") {
			const [openConflict] = await tx
				.select()
				.from(knowledgeConflicts)
				.where(
					and(
						eq(knowledgeConflicts.itemId, knowledgeItemId),
						eq(knowledgeConflicts.status, "open"),
					),
				)
				.limit(1);
			if (openConflict) {
				return {
					ok: false,
					code: "CONFLICT_OPEN",
					message: "open conflict blocks promotion to validated",
				};
			}
		}

		const updated = await tx
			.update(knowledgeItems)
			.set({ status: toStatus, updatedAt: isoNow, updatedBy: editor })
			.where(and(eq(knowledgeItems.id, knowledgeItemId), eq(knowledgeItems.status, fromStatus)))
			.returning({ id: knowledgeItems.id });

		if (updated.length === 0) {
			return {
				ok: false,
				code: "CONCURRENT_MODIFICATION",
				message: `knowledge item ${knowledgeItemId} no longer in status ${fromStatus}`,
			};
		}

		const newValue = reason ? `${toStatus} | reason: ${reason}` : toStatus;
		await tx.insert(knowledgeEditLog).values({
			id: randomUUID(),
			itemId: knowledgeItemId,
			editor,
			field: "status",
			oldValue: fromStatus,
			newValue,
			editType: "refinement",
			createdAt: isoNow,
		});

		return { ok: true, fromStatus };
	});
}

// --- Internal ---

/**
 * Transition a provisional item to validated within the same
 * transactional gate + conditional UPDATE + edit-log pattern as the G1
 * `promote_knowledge` tool. Uses the AUTO_PROMOTION_EDITOR marker.
 *
 * Returns true on success, false if the item was no longer provisional
 * (concurrent modification) or a last-second open-conflict check fired.
 *
 * @lore G3 gate parity: this function duplicates the gate logic from
 * `packages/server/src/tools/promote-knowledge.ts` intentionally —
 * promote-knowledge is a server-layer tool and the app-runtime layer must not
 * import from server. The transaction shape and CONFLICT_OPEN gate must
 * stay in lockstep; any change to one requires the corresponding change
 * here.
 */
async function promoteToValidatedAuto(db: HyperIdleDb, itemId: string): Promise<boolean> {
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
			.set({ status: "validated", updatedAt: isoNow, updatedBy: AUTO_PROMOTION_EDITOR })
			.where(and(eq(knowledgeItems.id, itemId), eq(knowledgeItems.status, "provisional")))
			.returning({ id: knowledgeItems.id });

		if (updateRows.length === 0) return false;

		await tx.insert(knowledgeEditLog).values({
			id: randomUUID(),
			itemId,
			editor: AUTO_PROMOTION_EDITOR,
			field: "status",
			oldValue: "provisional",
			newValue: `validated | reason: auto-promotion at ${AUTO_PROMOTION_REPETITION_THRESHOLD}+ cross-scope repetitions`,
			editType: "refinement",
			createdAt: isoNow,
		});

		return true;
	});
}
