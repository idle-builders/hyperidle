import { randomUUID } from "node:crypto";
import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import type { EventBus, KnowledgeUpdatedEvent } from "@hyperidle/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { KnowledgeKind } from "../types.js";

/**
 * Practice meeting (TRACK-G §G3 AC6): a 3-turn workflow that produces
 * `provisional` knowledge items from proposals + reactions. The meeting
 * itself is anchored by a row in `knowledge_items` carrying a
 * `meta.role = "practice_meeting_anchor"` so G3 introduces no new schema.
 *
 * Turn 1 — proposals  → creates `captured` items with `meta.meetingPhase='proposal'`.
 * Turn 2 — reactions  → creates `captured` items with `meta.meetingPhase='reaction'`
 *                       linked via `meta.proposalId`.
 * Turn 3 — synthesis  → creates `provisional` items and archives all
 *                       proposal + reaction intermediates.
 *
 * @lore G3 meeting storage: the meeting lives in `meta.role` on a single
 * `knowledge_items` row. The rationale — documented in
 * plans/work-packages/G3-plan.md §3.7 — is that introducing a new
 * table for a feature that already fits a JSON meta blob would pay a
 * migration cost we don't yet need. When meetings grow complex enough to
 * need indexed queries, a `practice_meetings` table becomes the refactor.
 */

// --- Types ---

export const PRACTICE_MEETING_ANCHOR_ROLE = "practice_meeting_anchor";

export interface CreatePracticeMeetingInput {
	readonly scopeId: string;
	readonly title: string;
	readonly nowMs: number;
}

export interface CreatePracticeMeetingResult {
	readonly meetingId: string;
}

export interface ProposalInput {
	readonly title: string;
	readonly body: string;
	readonly layer: string;
	readonly topic?: string | null;
	readonly kind?: KnowledgeKind;
}

export interface ReactionInput {
	readonly proposalId: string;
	readonly body: string;
	readonly author: string;
}

export interface SynthesisInput {
	readonly title: string;
	readonly body: string;
	readonly layer: string;
	readonly topic?: string | null;
	readonly kind?: KnowledgeKind;
}

export type PracticeMeetingTurnInput =
	| { readonly proposals: readonly ProposalInput[] }
	| { readonly reactions: readonly ReactionInput[] }
	| { readonly synthesis: readonly SynthesisInput[] };

export interface RunPracticeMeetingTurnInput {
	readonly meetingId: string;
	readonly turnNumber: 1 | 2 | 3;
	readonly input: PracticeMeetingTurnInput;
	readonly nowMs: number;
}

export type PracticeMeetingTurnResult =
	| {
			readonly success: true;
			readonly turnNumber: 1 | 2 | 3;
			readonly createdIds: readonly string[];
			readonly archivedIds: readonly string[];
	  }
	| {
			readonly success: false;
			readonly code:
				| "NOT_FOUND"
				| "INVALID_TURN"
				| "INVALID_INPUT"
				| "INVALID_STATE"
				| "CONCURRENT_MODIFICATION";
			readonly message: string;
	  };

interface AnchorMeta {
	readonly role: string;
	readonly scopeId?: string;
	readonly title?: string;
	readonly turnsCompleted?: readonly number[];
}

// --- Helpers ---

/**
 * Parse result for an anchor row's `meta` blob:
 *   - `{ kind: "ok", meta }`      — valid practice meeting anchor.
 *   - `{ kind: "not-anchor" }`    — row is NOT a practice meeting anchor
 *     (meta missing or `role` mismatch). Callers treat this as NOT_FOUND.
 *   - `{ kind: "malformed" }`     — the row IS tagged as an anchor but its
 *     `meta` JSON is unparseable. Callers treat this as INVALID_STATE —
 *     a distinct failure mode from "not an anchor" so ops can triage data
 *     drift vs. lookup typos.
 */
type AnchorMetaParse =
	| { readonly kind: "ok"; readonly meta: AnchorMeta }
	| { readonly kind: "not-anchor" }
	| { readonly kind: "malformed" };

function parseAnchorMeta(raw: string | null): AnchorMetaParse {
	if (!raw) return { kind: "not-anchor" };
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		// The row has non-JSON in its meta. We cannot tell whether it was
		// meant to be an anchor, so this is not a malformed-anchor signal —
		// report "not-anchor" (the row is simply not a practice meeting).
		return { kind: "not-anchor" };
	}
	if (typeof parsed !== "object" || parsed === null) return { kind: "not-anchor" };
	const obj = parsed as Record<string, unknown>;
	if (obj.role !== PRACTICE_MEETING_ANCHOR_ROLE) return { kind: "not-anchor" };
	const turnsCompletedRaw = obj.turnsCompleted;
	if (turnsCompletedRaw !== undefined && !Array.isArray(turnsCompletedRaw)) {
		return { kind: "malformed" };
	}
	const turnsCompleted = Array.isArray(turnsCompletedRaw)
		? turnsCompletedRaw.filter((n): n is number => typeof n === "number")
		: [];
	return {
		kind: "ok",
		meta: {
			role: PRACTICE_MEETING_ANCHOR_ROLE,
			scopeId: typeof obj.scopeId === "string" ? obj.scopeId : undefined,
			title: typeof obj.title === "string" ? obj.title : undefined,
			turnsCompleted,
		},
	};
}

/**
 * Serialize `turnsCompleted` deterministically so the conditional-UPDATE
 * race guard in `runPracticeMeetingTurn` can compare against a known-good
 * byte sequence. JSON.stringify on a plain number-array is deterministic —
 * but pinning this in a helper makes the intent (and the coupling) explicit.
 */
function serializeTurnsCompleted(turnsCompleted: readonly number[]): string {
	return JSON.stringify(turnsCompleted);
}

// --- createPracticeMeeting ---

/**
 * Create the anchor knowledge item for a new practice meeting. Returns
 * the anchor's id which callers pass as `meetingId` to
 * `runPracticeMeetingTurn`.
 */
export async function createPracticeMeeting(
	db: HyperIdleDb,
	input: CreatePracticeMeetingInput,
): Promise<CreatePracticeMeetingResult> {
	const id = randomUUID();
	const isoNow = new Date(input.nowMs).toISOString();
	const meta: AnchorMeta = {
		role: PRACTICE_MEETING_ANCHOR_ROLE,
		scopeId: input.scopeId,
		title: input.title,
		turnsCompleted: [],
	};
	// @lore O2: kernel/strategy separation. Insert identity+content into
	// knowledgeItems; strategy fields (layer, kind, scopeId, meta) go to
	// knowledgeAppProjection. The anchor meta includes the meeting state
	// so the practice-meeting service can track turn progress.
	await db.insert(knowledgeItems).values({
		id,
		topic: "practice_meeting",
		title: input.title,
		body: "Practice meeting anchor — created by practice-meeting service",
		format: "markdown",
		status: "captured",
		version: 1,
		updatedBy: "agent:practice-meeting",
		createdAt: isoNow,
		updatedAt: isoNow,
	});
	await db.insert(knowledgeAppProjection).values({
		id: `ksf-${id}`,
		knowledgeItemId: id,
		layer: "L2",
		kind: "reflection",
		scopeId: input.scopeId,
		meta: JSON.stringify(meta),
	});

	await db.insert(knowledgeEditLog).values({
		id: randomUUID(),
		itemId: id,
		editor: "agent:practice-meeting",
		field: "*",
		oldValue: null,
		newValue: null,
		editType: "create",
		createdAt: isoNow,
	});

	return { meetingId: id };
}

// --- runPracticeMeetingTurn ---

/**
 * @lore G3 per-turn atomicity: the entire turn — anchor read, turn writes,
 * anchor `turnsCompleted` update — runs in one `db.transaction`. Any
 * failure rolls back the turn's inserts AND the anchor bump together, so
 * the invariant "turnsCompleted reflects persisted turn work" holds.
 *
 * @lore G3 race-safe turn ordering: after re-reading the anchor inside the
 * transaction we compute the expected next turn, then apply the anchor
 * UPDATE with a WHERE clause pinning the OLD `turnsCompleted` serialization.
 * If two callers race on turn 1 the loser's UPDATE changes = 0 and we
 * return CONCURRENT_MODIFICATION — the per-turn inserts are rolled back by
 * returning an error from the transaction callback (we throw a sentinel
 * and catch it at the boundary).
 */
export async function runPracticeMeetingTurn(
	db: HyperIdleDb,
	eventBus: EventBus,
	input: RunPracticeMeetingTurnInput,
): Promise<PracticeMeetingTurnResult> {
	const { meetingId, turnNumber, nowMs } = input;
	const isoNow = new Date(nowMs).toISOString();

	const turnInput = input.input;

	// Validate turn-input shape before we open a transaction. The shape
	// check is input-layer, not state-dependent, so there's no reason to
	// take a tx for it.
	if (turnNumber === 1 && !("proposals" in turnInput)) {
		return {
			success: false,
			code: "INVALID_INPUT",
			message: "turn 1 requires a 'proposals' array",
		};
	}
	if (turnNumber === 2 && !("reactions" in turnInput)) {
		return {
			success: false,
			code: "INVALID_INPUT",
			message: "turn 2 requires a 'reactions' array",
		};
	}
	if (turnNumber === 3 && !("synthesis" in turnInput)) {
		return {
			success: false,
			code: "INVALID_INPUT",
			message: "turn 3 requires a 'synthesis' array",
		};
	}

	/**
	 * @lore G3 rollback via throw: the async transaction commits on normal
	 * return and rolls back only on a thrown error. For the
	 * CONCURRENT_MODIFICATION branch we need to roll back the per-turn
	 * inserts that already ran, so we throw a sentinel error and unwrap it
	 * outside the tx. For early gate failures (NOT_FOUND, INVALID_TURN,
	 * INVALID_STATE) we also throw — nothing was written, but keeping
	 * rollback uniform simplifies reasoning.
	 */
	class PracticeMeetingTxError extends Error {
		public readonly result: Extract<PracticeMeetingTurnResult, { success: false }>;
		public constructor(result: Extract<PracticeMeetingTurnResult, { success: false }>) {
			super(result.message);
			this.name = "PracticeMeetingTxError";
			this.result = result;
		}
	}

	let txOutcome: PracticeMeetingTurnResult;
	try {
		txOutcome = await db.transaction(async (tx): Promise<PracticeMeetingTurnResult> => {
			const [anchor] = await tx
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, meetingId))
				.limit(1);
			if (!anchor) {
				throw new PracticeMeetingTxError({
					success: false,
					code: "NOT_FOUND",
					message: `meeting ${meetingId} not found`,
				});
			}
			// @lore O2: anchor meta and scopeId are in knowledgeAppProjection.
			// Read the fabric row inside the same transaction for atomic meta
			// pinning on the conditional UPDATE.
			const [anchorFabric] = await tx
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, meetingId))
				.limit(1);
			const parsed = parseAnchorMeta(anchorFabric?.meta ?? null);
			if (parsed.kind === "not-anchor") {
				throw new PracticeMeetingTxError({
					success: false,
					code: "NOT_FOUND",
					message: `meeting ${meetingId} is not a practice_meeting anchor`,
				});
			}
			if (parsed.kind === "malformed") {
				throw new PracticeMeetingTxError({
					success: false,
					code: "INVALID_STATE",
					message: "malformed practice meeting anchor meta",
				});
			}
			const anchorMeta = parsed.meta;
			const anchorScopeId = anchorFabric?.scopeId ?? null;

			const turnsCompleted = anchorMeta.turnsCompleted ?? [];
			const lastCompleted =
				turnsCompleted.length > 0 ? turnsCompleted[turnsCompleted.length - 1] : 0;
			const expectedNext = (lastCompleted ?? 0) + 1;
			if (turnNumber !== expectedNext) {
				throw new PracticeMeetingTxError({
					success: false,
					code: "INVALID_TURN",
					message: `expected turn ${expectedNext}, got ${turnNumber}`,
				});
			}

			let turnResult: PracticeMeetingTurnResult;
			if (turnNumber === 1 && "proposals" in turnInput) {
				turnResult = await runTurn1(tx, meetingId, anchorScopeId, turnInput.proposals, isoNow);
			} else if (turnNumber === 2 && "reactions" in turnInput) {
				turnResult = await runTurn2(tx, meetingId, anchorScopeId, turnInput.reactions, isoNow);
			} else if (turnNumber === 3 && "synthesis" in turnInput) {
				turnResult = await runTurn3(tx, meetingId, anchorScopeId, turnInput.synthesis, isoNow);
			} else {
				// Unreachable — the shape checks above cover all three turns.
				throw new PracticeMeetingTxError({
					success: false,
					code: "INVALID_INPUT",
					message: `unexpected turn/input combination for turn ${turnNumber}`,
				});
			}

			if (!turnResult.success) {
				throw new PracticeMeetingTxError(turnResult);
			}

			// Conditional anchor UPDATE: pin the OLD full `meta` blob so a
			// concurrent turn-N caller cannot also pass the expected-turn
			// gate. If two callers race on turn 1 the loser's UPDATE
			// returns 0 rows and we throw CONCURRENT_MODIFICATION — the tx
			// rollback undoes the per-turn inserts the loser wrote.
			// @lore O2: meta lives in knowledgeAppProjection now. The conditional
			// UPDATE targets that table, pinning via knowledgeItemId + old meta value.
			const nextTurns: number[] = [...turnsCompleted, turnNumber];
			const nextMeta: AnchorMeta = {
				...anchorMeta,
				turnsCompleted: nextTurns,
			};
			const oldSerialized = serializeTurnsCompleted(turnsCompleted);
			// @lore G3 meta not-null invariant: `createPracticeMeeting`
			// writes a JSON object into `meta` in knowledgeAppProjection so
			// the fabric row always has a non-null meta we can pin here. If
			// that invariant is ever broken the `eq` below will no-op and
			// the caller will see CONCURRENT_MODIFICATION — safe default.
			const pinMeta = anchorFabric?.meta ?? "";
			const updateRows = await tx
				.update(knowledgeAppProjection)
				.set({ meta: JSON.stringify(nextMeta) })
				.where(
					and(
						eq(knowledgeAppProjection.knowledgeItemId, meetingId),
						eq(knowledgeAppProjection.meta, pinMeta),
					),
				)
				.returning({ id: knowledgeAppProjection.id });
			// Also update kernel updatedAt for recency tracking
			await tx
				.update(knowledgeItems)
				.set({ updatedAt: isoNow })
				.where(eq(knowledgeItems.id, meetingId));
			if (updateRows.length === 0) {
				throw new PracticeMeetingTxError({
					success: false,
					code: "CONCURRENT_MODIFICATION",
					message: `anchor ${meetingId} was modified concurrently (stale turnsCompleted=${oldSerialized})`,
				});
			}

			return turnResult;
		});
	} catch (err) {
		if (err instanceof PracticeMeetingTxError) {
			return err.result;
		}
		throw err;
	}

	if (!txOutcome.success) {
		return txOutcome;
	}

	// Emit knowledge_updated per created/archived item.
	const action = `practice_meeting_turn_${turnNumber}`;
	for (const id of txOutcome.createdIds) {
		const event: KnowledgeUpdatedEvent = {
			type: "knowledge_updated",
			streamId: randomUUID(),
			itemId: id,
			action,
			timestamp: nowMs,
		};
		eventBus.emit(event);
	}
	for (const id of txOutcome.archivedIds) {
		const event: KnowledgeUpdatedEvent = {
			type: "knowledge_updated",
			streamId: randomUUID(),
			itemId: id,
			action,
			timestamp: nowMs,
		};
		eventBus.emit(event);
	}

	return txOutcome;
}

// --- Turn implementations ---

/**
 * Per-turn writes accept the transaction handle so the outer caller can
 * wrap {read anchor, write turn items, update anchor} in one atomic unit.
 * Passing `HyperIdleDb` as the `tx` parameter type is safe — the drizzle
 * transaction object is structurally compatible (same `insert`/`update`/
 * `select` methods) and this avoids depending on drizzle's internal
 * transaction type.
 */
async function runTurn1(
	tx: HyperIdleDb,
	meetingId: string,
	anchorScopeId: string | null,
	proposals: readonly ProposalInput[],
	isoNow: string,
): Promise<PracticeMeetingTurnResult> {
	const createdIds: string[] = [];
	for (const p of proposals) {
		const id = randomUUID();
		// @lore O2: kernel/strategy separation. Kernel row: identity + content.
		// Strategy row: layer, kind, scopeId, meta (meeting state).
		await tx.insert(knowledgeItems).values({
			id,
			topic: p.topic ?? null,
			title: p.title,
			body: p.body,
			format: "markdown",
			status: "captured",
			version: 1,
			updatedBy: "agent:practice-meeting",
			createdAt: isoNow,
			updatedAt: isoNow,
		});
		await tx.insert(knowledgeAppProjection).values({
			id: `ksf-${id}`,
			knowledgeItemId: id,
			layer: p.layer,
			kind: p.kind ?? "reflection",
			scopeId: anchorScopeId,
			meta: JSON.stringify({ meetingId, meetingPhase: "proposal" }),
		});
		await tx.insert(knowledgeEditLog).values({
			id: randomUUID(),
			itemId: id,
			editor: "agent:practice-meeting",
			field: "*",
			oldValue: null,
			newValue: null,
			editType: "create",
			createdAt: isoNow,
		});
		createdIds.push(id);
	}
	return {
		success: true,
		turnNumber: 1,
		createdIds,
		archivedIds: [],
	};
}

async function runTurn2(
	tx: HyperIdleDb,
	meetingId: string,
	anchorScopeId: string | null,
	reactions: readonly ReactionInput[],
	isoNow: string,
): Promise<PracticeMeetingTurnResult> {
	const createdIds: string[] = [];
	for (const r of reactions) {
		const id = randomUUID();
		// @lore O2: kernel/strategy separation.
		await tx.insert(knowledgeItems).values({
			id,
			topic: "practice_meeting_reaction",
			title: `Reaction to ${r.proposalId}`,
			body: r.body,
			format: "markdown",
			status: "captured",
			version: 1,
			updatedBy: "agent:practice-meeting",
			createdAt: isoNow,
			updatedAt: isoNow,
		});
		await tx.insert(knowledgeAppProjection).values({
			id: `ksf-${id}`,
			knowledgeItemId: id,
			layer: "L2",
			kind: "reflection",
			scopeId: anchorScopeId,
			meta: JSON.stringify({
				meetingId,
				meetingPhase: "reaction",
				proposalId: r.proposalId,
				author: r.author,
			}),
		});
		await tx.insert(knowledgeEditLog).values({
			id: randomUUID(),
			itemId: id,
			editor: "agent:practice-meeting",
			field: "*",
			oldValue: null,
			newValue: null,
			editType: "create",
			createdAt: isoNow,
		});
		createdIds.push(id);
	}
	return {
		success: true,
		turnNumber: 2,
		createdIds,
		archivedIds: [],
	};
}

async function runTurn3(
	tx: HyperIdleDb,
	meetingId: string,
	anchorScopeId: string | null,
	synthesis: readonly SynthesisInput[],
	isoNow: string,
): Promise<PracticeMeetingTurnResult> {
	const createdIds: string[] = [];
	const archivedIds: string[] = [];

	// Find all proposal + reaction intermediates for this meeting.
	// @lore G3 meeting intermediates: the meeting linkage lives inside
	// `meta` JSON on knowledgeAppProjection (O2: meta moved from kernel table).
	// To keep the candidate set small we JOIN with fabric and filter on
	// `status = 'captured'` AND `scope_id = <anchor scope>` from the fabric row;
	// the final filter on `meta.meetingId` + `meta.meetingPhase` is done in JS.
	// `anchorScopeId` is nullable; `eq(col, null)` renders `col = NULL` which
	// never matches in SQL three-valued logic, so we branch on `isNull`.
	const scopeFilter =
		anchorScopeId === null
			? isNull(knowledgeAppProjection.scopeId)
			: eq(knowledgeAppProjection.scopeId, anchorScopeId);
	const candidateRows = await tx
		.select({ item: knowledgeItems, fabric: knowledgeAppProjection })
		.from(knowledgeItems)
		.innerJoin(
			knowledgeAppProjection,
			eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
		)
		.where(and(eq(knowledgeItems.status, "captured"), scopeFilter));
	const intermediates = candidateRows.filter(({ fabric }) => {
		if (!fabric.meta) return false;
		try {
			const parsed: unknown = JSON.parse(fabric.meta);
			if (typeof parsed !== "object" || parsed === null) return false;
			const m = parsed as Record<string, unknown>;
			return (
				m.meetingId === meetingId &&
				(m.meetingPhase === "proposal" || m.meetingPhase === "reaction")
			);
		} catch {
			return false;
		}
	});

	// Insert synthesis items as provisional.
	// @lore O2: kernel/strategy separation.
	for (const s of synthesis) {
		const id = randomUUID();
		await tx.insert(knowledgeItems).values({
			id,
			topic: s.topic ?? null,
			title: s.title,
			body: s.body,
			format: "markdown",
			status: "provisional",
			version: 1,
			updatedBy: "agent:practice-meeting",
			createdAt: isoNow,
			updatedAt: isoNow,
		});
		await tx.insert(knowledgeAppProjection).values({
			id: `ksf-${id}`,
			knowledgeItemId: id,
			layer: s.layer,
			kind: s.kind ?? "pattern",
			scopeId: anchorScopeId,
			meta: JSON.stringify({ meetingId, meetingPhase: "synthesis" }),
		});
		await tx.insert(knowledgeEditLog).values({
			id: randomUUID(),
			itemId: id,
			editor: "agent:practice-meeting",
			field: "*",
			oldValue: null,
			newValue: null,
			editType: "create",
			createdAt: isoNow,
		});
		createdIds.push(id);
	}

	// Archive all intermediates. Use the standard captured→archived
	// path (it is a legal transition per the G1 table).
	for (const { item: inter } of intermediates) {
		await tx
			.update(knowledgeItems)
			.set({
				status: "archived",
				updatedAt: isoNow,
				updatedBy: "agent:practice-meeting",
			})
			.where(eq(knowledgeItems.id, inter.id));
		await tx.insert(knowledgeEditLog).values({
			id: randomUUID(),
			itemId: inter.id,
			editor: "agent:practice-meeting",
			field: "status",
			oldValue: inter.status,
			newValue: "archived | reason: synthesized into practice meeting output",
			editType: "refinement",
			createdAt: isoNow,
		});
		archivedIds.push(inter.id);
	}

	return {
		success: true,
		turnNumber: 3,
		createdIds,
		archivedIds,
	};
}
