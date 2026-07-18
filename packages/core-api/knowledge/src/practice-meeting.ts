import { randomUUID } from "node:crypto";
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus, KnowledgeKind, KnowledgeUpdatedEvent } from "@hyperidle/shared";
import {
	archiveKnowledgeItemWithLogRaw,
	findKnowledgeAppProjectionByItemIdRaw,
	findKnowledgeItemByIdRaw,
	insertKnowledgeAppProjectionRaw,
	insertKnowledgeEditLogRaw,
	insertKnowledgeItemRaw,
	listCapturedItemsByProjectionScopeRaw,
	touchKnowledgeItemUpdatedAtRaw,
	updateKnowledgeAppProjectionMetaIfUnchangedRaw,
} from "./practice-meeting-store.js";

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
 * @lore AU20 Am9: relocated from `@hyperidle/review` to `@hyperidle/knowledge`
 * (its actual data owner). Every write this workflow makes is against
 * `knowledge`-owned tables (`knowledgeItems`/`knowledgeAppProjection`/
 * `knowledgeEditLog`), so `review` had no logical ownership over it — only an
 * accidental name association ("review meeting"). Sitting inside `knowledge`,
 * the workflow calls the `*Raw` accessors from `practice-meeting-store.ts`
 * directly (Mechanism A — legal, same package) and the 9-accessor
 * `PracticeMeetingKnowledgeStore` DI port that `review` maintained evaporates
 * entirely. See `@hyperidle/review`'s barrel `@lore` for the before/after
 * export count.
 *
 * @lore G3 meeting storage: the meeting lives in `meta.role` on a single
 * `knowledge_items` row. When meetings grow complex enough to need indexed
 * queries, a `practice_meetings` table becomes the refactor.
 *
 * @lore AU19 Increment 1j (original): the general `create()`/`update()`
 * repository functions were NOT reused because they use a fresh internal
 * clock and write `scopeId` onto the kernel row — both real behavior changes.
 * These primitives are 1:1 with the pre-migration raw Drizzle calls.
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

function serializeTurnsCompleted(turnsCompleted: readonly number[]): string {
	return JSON.stringify(turnsCompleted);
}

// --- createPracticeMeeting ---

/**
 * Create the anchor knowledge item for a new practice meeting.
 * No DI port required — calls raw accessors directly (Mechanism A, same package).
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
	// @lore O2: canonical/projection split.
	await insertKnowledgeItemRaw(db, {
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
	await insertKnowledgeAppProjectionRaw(db, {
		id: `ksf-${id}`,
		knowledgeItemId: id,
		layer: "L2",
		kind: "reflection",
		scopeId: input.scopeId,
		meta: JSON.stringify(meta),
	});
	await insertKnowledgeEditLogRaw(db, {
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
 * @lore G3 per-turn atomicity: entire turn runs in one `db.transaction`.
 * @lore G3 race-safe: conditional UPDATE pins the old `turnsCompleted`
 * serialization; losing concurrent caller sees CONCURRENT_MODIFICATION.
 */
export async function runPracticeMeetingTurn(
	db: HyperIdleDb,
	eventBus: EventBus,
	input: RunPracticeMeetingTurnInput,
): Promise<PracticeMeetingTurnResult> {
	const { meetingId, turnNumber, nowMs } = input;
	const isoNow = new Date(nowMs).toISOString();
	const turnInput = input.input;

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
	 * return and rolls back only on a thrown error.
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
			const anchor = await findKnowledgeItemByIdRaw(tx, meetingId);
			if (!anchor) {
				throw new PracticeMeetingTxError({
					success: false,
					code: "NOT_FOUND",
					message: `meeting ${meetingId} not found`,
				});
			}
			// @lore O2: anchor meta and scopeId are in knowledgeAppProjection.
			const anchorFabric = await findKnowledgeAppProjectionByItemIdRaw(tx, meetingId);
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
				throw new PracticeMeetingTxError({
					success: false,
					code: "INVALID_INPUT",
					message: `unexpected turn/input combination for turn ${turnNumber}`,
				});
			}

			if (!turnResult.success) {
				throw new PracticeMeetingTxError(turnResult);
			}

			// Conditional anchor UPDATE with old-meta pin for race safety.
			// @lore O2: meta lives in knowledgeAppProjection.
			const nextTurns: number[] = [...turnsCompleted, turnNumber];
			const nextMeta: AnchorMeta = { ...anchorMeta, turnsCompleted: nextTurns };
			const oldSerialized = serializeTurnsCompleted(turnsCompleted);
			const pinMeta = anchorFabric?.meta ?? "";
			const updatedRows = await updateKnowledgeAppProjectionMetaIfUnchangedRaw(
				tx,
				meetingId,
				JSON.stringify(nextMeta),
				pinMeta,
			);
			await touchKnowledgeItemUpdatedAtRaw(tx, meetingId, isoNow);
			if (updatedRows === 0) {
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
		await insertKnowledgeItemRaw(tx, {
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
		await insertKnowledgeAppProjectionRaw(tx, {
			id: `ksf-${id}`,
			knowledgeItemId: id,
			layer: p.layer,
			kind: p.kind ?? "reflection",
			scopeId: anchorScopeId,
			meta: JSON.stringify({ meetingId, meetingPhase: "proposal" }),
		});
		await insertKnowledgeEditLogRaw(tx, {
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
	return { success: true, turnNumber: 1, createdIds, archivedIds: [] };
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
		await insertKnowledgeItemRaw(tx, {
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
		await insertKnowledgeAppProjectionRaw(tx, {
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
		await insertKnowledgeEditLogRaw(tx, {
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
	return { success: true, turnNumber: 2, createdIds, archivedIds: [] };
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

	const candidateRows = await listCapturedItemsByProjectionScopeRaw(tx, anchorScopeId);
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

	for (const s of synthesis) {
		const id = randomUUID();
		await insertKnowledgeItemRaw(tx, {
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
		await insertKnowledgeAppProjectionRaw(tx, {
			id: `ksf-${id}`,
			knowledgeItemId: id,
			layer: s.layer,
			kind: s.kind ?? "pattern",
			scopeId: anchorScopeId,
			meta: JSON.stringify({ meetingId, meetingPhase: "synthesis" }),
		});
		await insertKnowledgeEditLogRaw(tx, {
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

	for (const { item: inter } of intermediates) {
		await archiveKnowledgeItemWithLogRaw(tx, {
			id: inter.id,
			oldStatus: inter.status,
			updatedAt: isoNow,
			updatedBy: "agent:practice-meeting",
			editLogId: randomUUID(),
		});
		archivedIds.push(inter.id);
	}

	return { success: true, turnNumber: 3, createdIds, archivedIds };
}
