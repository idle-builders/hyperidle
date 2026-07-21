import { randomUUID } from "node:crypto";
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus, KnowledgeKind, KnowledgeUpdatedEvent } from "@hyperidle/shared";
import type { KnowledgeItemWithProjection } from "./knowledge-repository.js";
import { create, get, list, remove, update } from "./knowledge-repository.js";
import type { KnowledgeLayer } from "./types.js";

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
 * the workflow composes through knowledge's general create/get/update/remove
 * operations. The former nine raw accessors and the matching review DI port
 * are physically gone.
 *
 * @lore G3 meeting storage: the meeting lives in `meta.role` on a single
 * `knowledge_items` row. When meetings grow complex enough to need indexed
 * queries, a `practice_meetings` table becomes the refactor.
 *
 * @lore AU20 revision: practice meetings are a workflow, not a second storage
 * API. Canonical repository operations own edit history and accept the workflow
 * timestamp through their shared write options.
 */

// --- Types ---

const PRACTICE_MEETING_ANCHOR_ROLE = "practice_meeting_anchor";

interface CreatePracticeMeetingInput {
	readonly scopeId: string;
	readonly title: string;
	readonly nowMs: number;
}

interface CreatePracticeMeetingResult {
	readonly meetingId: string;
}

interface ProposalInput {
	readonly title: string;
	readonly body: string;
	readonly layer: KnowledgeLayer;
	readonly topic?: string | null;
	readonly kind?: KnowledgeKind;
}

interface ReactionInput {
	readonly proposalId: string;
	readonly body: string;
	readonly author: string;
}

interface SynthesisInput {
	readonly title: string;
	readonly body: string;
	readonly layer: KnowledgeLayer;
	readonly topic?: string | null;
	readonly kind?: KnowledgeKind;
}

type PracticeMeetingTurnInput =
	| { readonly proposals: readonly ProposalInput[] }
	| { readonly reactions: readonly ReactionInput[] }
	| { readonly synthesis: readonly SynthesisInput[] };

interface RunPracticeMeetingTurnInput {
	readonly meetingId: string;
	readonly turnNumber: 1 | 2 | 3;
	readonly input: PracticeMeetingTurnInput;
	readonly nowMs: number;
}

type PracticeMeetingTurnResult =
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
async function createPracticeMeeting(
	db: HyperIdleDb,
	input: CreatePracticeMeetingInput,
): Promise<CreatePracticeMeetingResult> {
	const meta: AnchorMeta = {
		role: PRACTICE_MEETING_ANCHOR_ROLE,
		scopeId: input.scopeId,
		title: input.title,
		turnsCompleted: [],
	};
	const anchor = await create(
		db,
		{
			topic: "practice_meeting",
			title: input.title,
			body: "Practice meeting anchor — created by practice-meeting service",
			format: "markdown",
			status: "captured",
			updatedBy: "agent:practice-meeting",
			layer: "L2",
			kind: "reflection",
			scopeId: input.scopeId,
			meta: JSON.stringify(meta),
		},
		{ timestamp: new Date(input.nowMs).toISOString() },
	);
	return { meetingId: anchor.id };
}

// --- runPracticeMeetingTurn ---

/**
 * @lore G3 per-turn atomicity: entire turn runs in one `db.transaction`.
 * @lore G3 race-safe: conditional UPDATE pins the old `turnsCompleted`
 * serialization; losing concurrent caller sees CONCURRENT_MODIFICATION.
 */
async function runPracticeMeetingTurn(
	db: HyperIdleDb,
	eventBus: EventBus,
	input: RunPracticeMeetingTurnInput,
): Promise<PracticeMeetingTurnResult> {
	const { meetingId, turnNumber, nowMs } = input;
	const timestamp = new Date(nowMs).toISOString();
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
			const anchor = await get(tx, meetingId, { view: "full" });
			if (!anchor) {
				throw new PracticeMeetingTxError({
					success: false,
					code: "NOT_FOUND",
					message: `meeting ${meetingId} not found`,
				});
			}
			const parsed = parseAnchorMeta(anchor.meta ?? null);
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
			const anchorScopeId = anchor.scopeId ?? null;

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
				turnResult = await runTurn1(tx, meetingId, anchorScopeId, turnInput.proposals, timestamp);
			} else if (turnNumber === 2 && "reactions" in turnInput) {
				turnResult = await runTurn2(tx, meetingId, anchorScopeId, turnInput.reactions, timestamp);
			} else if (turnNumber === 3 && "synthesis" in turnInput) {
				turnResult = await runTurn3(tx, meetingId, anchorScopeId, turnInput.synthesis, timestamp);
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
			try {
				await update(tx, meetingId, { meta: JSON.stringify(nextMeta) }, anchor.version, {
					timestamp,
				});
			} catch {
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

export { createPracticeMeeting, runPracticeMeetingTurn };

// --- Turn implementations ---

async function runTurn1(
	tx: HyperIdleDb,
	meetingId: string,
	anchorScopeId: string | null,
	proposals: readonly ProposalInput[],
	timestamp: string,
): Promise<PracticeMeetingTurnResult> {
	const createdIds: string[] = [];
	for (const p of proposals) {
		const created = await create(
			tx,
			{
				topic: p.topic ?? null,
				title: p.title,
				body: p.body,
				format: "markdown",
				status: "captured",
				updatedBy: "agent:practice-meeting",
				layer: p.layer,
				kind: p.kind ?? "reflection",
				scopeId: anchorScopeId,
				meta: JSON.stringify({ meetingId, meetingPhase: "proposal" }),
			},
			{ timestamp },
		);
		createdIds.push(created.id);
	}
	return { success: true, turnNumber: 1, createdIds, archivedIds: [] };
}

async function runTurn2(
	tx: HyperIdleDb,
	meetingId: string,
	anchorScopeId: string | null,
	reactions: readonly ReactionInput[],
	timestamp: string,
): Promise<PracticeMeetingTurnResult> {
	const createdIds: string[] = [];
	for (const r of reactions) {
		const created = await create(
			tx,
			{
				topic: "practice_meeting_reaction",
				title: `Reaction to ${r.proposalId}`,
				body: r.body,
				format: "markdown",
				status: "captured",
				updatedBy: "agent:practice-meeting",
				layer: "L2",
				kind: "reflection",
				scopeId: anchorScopeId,
				meta: JSON.stringify({
					meetingId,
					meetingPhase: "reaction",
					proposalId: r.proposalId,
					author: r.author,
				}),
			},
			{ timestamp },
		);
		createdIds.push(created.id);
	}
	return { success: true, turnNumber: 2, createdIds, archivedIds: [] };
}

async function runTurn3(
	tx: HyperIdleDb,
	meetingId: string,
	anchorScopeId: string | null,
	synthesis: readonly SynthesisInput[],
	timestamp: string,
): Promise<PracticeMeetingTurnResult> {
	const createdIds: string[] = [];
	const archivedIds: string[] = [];

	const candidateRows: KnowledgeItemWithProjection[] = [];
	const pageSize = 500;
	for (let offset = 0; ; offset += pageSize) {
		const page = await list(tx, { scopeId: anchorScopeId, limit: pageSize, offset });
		candidateRows.push(...page);
		if (page.length < pageSize) break;
	}
	const intermediates = candidateRows.filter((item) => {
		if (!item.meta) return false;
		try {
			const parsed: unknown = JSON.parse(item.meta);
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
		const created = await create(
			tx,
			{
				topic: s.topic ?? null,
				title: s.title,
				body: s.body,
				format: "markdown",
				status: "provisional",
				updatedBy: "agent:practice-meeting",
				layer: s.layer,
				kind: s.kind ?? "pattern",
				scopeId: anchorScopeId,
				meta: JSON.stringify({ meetingId, meetingPhase: "synthesis" }),
			},
			{ timestamp },
		);
		createdIds.push(created.id);
	}

	for (const inter of intermediates) {
		await remove(tx, inter, { timestamp });
		archivedIds.push(inter.id);
	}

	return { success: true, turnNumber: 3, createdIds, archivedIds };
}
