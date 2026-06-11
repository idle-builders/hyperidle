import * as crypto from "node:crypto";
import {
	bets,
	type HyperIdleDb,
	items,
	knowledgeItems,
	knowledgeStrategyFabric,
	type Routine,
	routineRuns,
	routines,
	threads,
} from "@hyperidle/db";
import {
	type BetStateChangedEvent,
	createLogger,
	type EventBus,
	type ItemCreatedEvent,
} from "@hyperidle/shared";
import { and, eq, gte, inArray, like } from "drizzle-orm";
// @lore AF6: import runStaleSweep from its source module, NOT from the package
// index (@hyperidle/fabric). routine-scheduler.ts now imports this module, so an
// index round-trip would form a circular import (scheduler→builtin→index→scheduler).
// @lore AF9: same reasoning applies to runAutoPromotionSweep — import from the
// source module, not the index, to avoid the circular import chain.
import { runAutoPromotionSweep, runStaleSweep } from "../promotion-pipeline.js";
import { buildAttentionService } from "./attention-service.js";
import { createPracticeMeeting } from "./practice-meeting.js";
// @lore AF6: cron helpers used only at runtime inside seedBuiltinRoutines. The
// scheduler↔builtin-routines import cycle is init-safe because neither module
// calls the other at top level (only runBuiltinRoutine / parseCron at call time).
import { nextCronMatch, parseCron } from "./routine-scheduler.js";

// --- Stable IDs ---

/**
 * Stable, non-UUID identifiers for the four built-in routines seeded at
 * factory initialisation. Prefix `builtin:` — reserved — distinguishes
 * system-seeded routines from operator-authored ones so the manual-trigger
 * API can route to the correct handler.
 *
 * @lore G4 builtin id prefix: the `builtin:` prefix is load-bearing for the
 * manual-trigger API, which decides whether to call `runBuiltinRoutine`
 * (builtin) vs. the legacy session-creation path (non-builtin). Changing
 * this prefix requires updating `routes/routines-routes.ts` and the seed.
 *
 * @lore AD8c: `builtin:cost-sentinel` removed. Cost sentinel is now application
 * code registered in bootstrapFabric via `startCostSentinel` in
 * packages/fabric/src/services/cost-sentinel.ts. There are now 4 builtin IDs.
 */
export const BUILTIN_ROUTINE_IDS = [
	"builtin:practice-meeting",
	"builtin:post-bet-retro",
	"builtin:portfolio-retro",
	"builtin:knowledge-decay",
	"builtin:knowledge-promotion", // AF9: auto-promote provisional items meeting threshold
] as const;

export type BuiltinRoutineId = (typeof BUILTIN_ROUTINE_IDS)[number];

export function isBuiltinRoutineId(id: string): id is BuiltinRoutineId {
	return (BUILTIN_ROUTINE_IDS as readonly string[]).includes(id);
}

// --- Trigger config constants ---

// @lore AD8c: COST_SENTINEL_INTERVAL_SECONDS removed — cost sentinel timing is
// now COST_SENTINEL_INTERVAL_MS (milliseconds) in cost-sentinel.ts.
const PRACTICE_MEETING_CRON = "0 10 * * MON"; // weekly Monday 10:00 UTC
/**
 * Cron expression for the monthly portfolio retro — fires on the first
 * Monday of every month at 10:00 UTC.
 *
 * @lore G4 portfolio-retro first-Monday cron: the combination
 * `dayOfMonth=1-7` AND `dayOfWeek=MON` relies on the AND semantics of our
 * in-house cron matcher (`parseCron` + `fieldMatches` in
 * `services/routine-scheduler.ts`): a candidate minute is a match only
 * when every field matches. Standard POSIX cron uses OR semantics when
 * BOTH dayOfMonth AND dayOfWeek are restricted (it fires if either
 * matches), which would fire this routine far too often. We deliberately
 * diverge from POSIX here — do NOT swap the matcher to OR without first
 * reworking this constant. Pinned by
 * `packages/server/src/__tests__/routine-scheduler.test.ts` (12-month
 * window assertion).
 */
const PORTFOLIO_RETRO_CRON = "0 10 1-7 * MON"; // first Monday of the month
const KNOWLEDGE_DECAY_CRON = "0 2 * * *"; // daily 02:00 UTC
/**
 * Cron for the knowledge-promotion sweep — daily 03:00 UTC.
 * Deliberately one hour after knowledge-decay (02:00) so the two heavy
 * sweeps don't collide on the same scheduler tick.
 * @lore AF9 R2: offset from decay to avoid concurrent sweep load.
 */
const KNOWLEDGE_PROMOTION_CRON = "0 3 * * *"; // daily 03:00 UTC

// @lore AD8c: COST_WARNING_RATIO removed (moved to cost-sentinel.ts)
const PORTFOLIO_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// --- Seed helper ---

interface BuiltinSpec {
	readonly id: BuiltinRoutineId;
	readonly name: string;
	readonly ownerAgentId: string;
	readonly triggerType: "heartbeat" | "calendar" | "event";
	readonly triggerConfig: Record<string, unknown>;
	readonly skillId: string;
	readonly doneCondition: string;
	readonly humanReview: boolean;
	readonly silent: boolean;
}

/**
 * Concrete specs for the four built-in routines. Owner agent ids match G1
 * seed ids in `packages/db/src/seed.ts`; keep them in sync.
 *
 * @lore AD8c: builtin:cost-sentinel removed — it is now application code.
 * builtin:knowledge-decay ownership transferred to seed-agent-pf-facilitation.
 */
const BUILTIN_SPECS: readonly BuiltinSpec[] = [
	{
		id: "builtin:practice-meeting",
		name: "Practice meeting",
		ownerAgentId: "seed-agent-pf-facilitation",
		triggerType: "calendar",
		triggerConfig: { cron: PRACTICE_MEETING_CRON },
		skillId: "practice_meeting",
		doneCondition: "3-turn practice meeting anchor created",
		humanReview: false,
		silent: false,
	},
	{
		id: "builtin:post-bet-retro",
		name: "Post-bet retro",
		ownerAgentId: "seed-agent-pm-nimmly",
		triggerType: "event",
		triggerConfig: { eventType: "bet_state_changed" },
		skillId: "bet_retro",
		doneCondition: "Review item comparing hypothesis vs reality written",
		humanReview: true,
		silent: false,
	},
	{
		id: "builtin:portfolio-retro",
		name: "Portfolio retro",
		ownerAgentId: "seed-agent-cos",
		triggerType: "calendar",
		triggerConfig: { cron: PORTFOLIO_RETRO_CRON },
		skillId: "portfolio_retro",
		doneCondition: "Cross-product portfolio review item written",
		humanReview: true,
		silent: false,
	},
	{
		id: "builtin:knowledge-decay",
		name: "Knowledge decay",
		// @lore AD8c: ownership transferred from seed-agent-cos to seed-agent-pf-facilitation.
		// Knowledge decay is a practice-layer concern — the facilitation facilitator
		// is the natural owner of cross-community knowledge lifecycle.
		ownerAgentId: "seed-agent-pf-facilitation",
		triggerType: "calendar",
		triggerConfig: { cron: KNOWLEDGE_DECAY_CRON },
		skillId: "knowledge_decay",
		doneCondition: "Stale knowledge items transitioned",
		humanReview: false,
		silent: true,
	},
	{
		id: "builtin:knowledge-promotion",
		name: "Knowledge promotion",
		// @lore AF9: same owner as knowledge-decay — both are practice-layer lifecycle concerns.
		ownerAgentId: "seed-agent-pf-facilitation",
		triggerType: "calendar",
		triggerConfig: { cron: KNOWLEDGE_PROMOTION_CRON },
		skillId: "knowledge_promotion",
		doneCondition: "Provisional items meeting repetition threshold promoted",
		humanReview: false,
		// silent: false — promotions emit knowledge_updated events so triage/git-export
		// consumers receive them. Decay is silent to avoid daily floods; promotion
		// touches far fewer items and the events are editorially significant.
		// @lore AF9 R5: the sweep already emits per-promotion events; the builtin
		// handler must NOT additionally emit — only call runAutoPromotionSweep.
		silent: false,
	},
];

/**
 * Idempotent seed for the G4 built-in routines. Must be called after G1
 * agents (`seed-agent-cos` — now "System Agent", `seed-agent-pf-facilitation`,
 * `seed-agent-pm-nimmly`) have been seeded so the FK to `agents.id` resolves.
 * @lore AD8a: seed-agent-cos renamed from "Chief of Staff" to "System Agent".
 *
 * Uses `onConflictDoNothing` so re-running against an existing DB is a no-op.
 *
 * @param teamId - The teams.id to assign as team_id on every builtin routine.
 *   Defaults to `"prod-1"` which matches the test seed fixture. Production
 *   callers should pass the canonical team id (e.g. `"seed-product-1"`).
 *
 * @lore AA1: team_id is NOT NULL on routines; seedBuiltinRoutines must receive
 * the team id from the caller because the fabric package has no knowledge of
 * which team id the production seed uses.
 */
export async function seedBuiltinRoutines(db: HyperIdleDb, teamId = "prod-1"): Promise<void> {
	const now = new Date();
	for (const spec of BUILTIN_SPECS) {
		// AF6 §2a: calendar built-ins need a nextRunAt at seed time so the poll
		// loop's built-in dispatch fork selects them. Event built-ins (post-bet-retro)
		// have no schedule. Backfill (§2b) self-heals any gap on existing DBs.
		let nextRunAt: string | null = null;
		const cron = (spec.triggerConfig as { cron?: string }).cron;
		if (spec.triggerType === "calendar" && cron) {
			nextRunAt = nextCronMatch(parseCron(cron), now).toISOString();
		}

		await db
			.insert(routines)
			.values({
				id: spec.id,
				name: spec.name,
				teamId,
				state: "active",
				ownerAgentId: spec.ownerAgentId,
				triggerType: spec.triggerType,
				triggerConfig: JSON.stringify(spec.triggerConfig),
				skillId: spec.skillId,
				doneCondition: spec.doneCondition,
				delegationAllowed: false,
				humanReview: spec.humanReview,
				silent: spec.silent,
				active: true,
				nextRunAt,
			})
			.onConflictDoNothing();
	}
}

// --- Dispatcher ---

export type RunBuiltinResult =
	| {
			readonly fired: true;
			readonly emitted?: readonly string[];
			readonly extra?: Record<string, unknown>;
	  }
	| { readonly fired: false; readonly reason: string };

export interface PostBetRetroArgs {
	readonly betId: string;
}

/**
 * Entry point for all built-in routine handlers. Callers (manual trigger
 * API, event-registered handler) pass the routine id; the dispatcher
 * short-circuits with `{ fired: false, reason: "disabled" }` when
 * `active=0` and delegates to the per-routine implementation otherwise.
 */
export async function runBuiltinRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	routineId: BuiltinRoutineId,
	args?: PostBetRetroArgs,
): Promise<RunBuiltinResult> {
	const [routine] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
	if (!routine) {
		return { fired: false, reason: `routine ${routineId} not found` };
	}
	if (!routine.active) {
		// @lore AF6 CRITICAL 1: the disabled short-circuit returns BEFORE inserting
		// any routine_runs row. A disabled routine produces no run record — this
		// preserves AC2's negative assertion (disabled → no fire, no row).
		return { fired: false, reason: `routine ${routineId} is disabled (active=false)` };
	}

	// @lore AF6 CRITICAL 1: built-in fires must write a terminal routine_runs row
	// so GET /api/routines/:id (which builds runs[] from routineRuns) surfaces the
	// self-run (AC5) and "last run reflects real execution" holds (AC1). This is the
	// single source of truth across manual trigger AND scheduled auto-fire — the §3
	// scheduler fork only advances nextRunAt, it writes no row. costMinor:0 because
	// built-ins do bounded DB work with no provisioned session / harness cost.
	const startedAt = new Date();

	let result: RunBuiltinResult;
	switch (routineId) {
		case "builtin:practice-meeting":
			result = await runPracticeMeetingRoutine(db, routine);
			break;
		case "builtin:post-bet-retro":
			if (!args) {
				return { fired: false, reason: "post-bet-retro requires { betId } args" };
			}
			result = await runPostBetRetro(db, eventBus, routine, args);
			break;
		case "builtin:portfolio-retro":
			result = await runPortfolioRetro(db, eventBus, routine);
			break;
		case "builtin:knowledge-decay":
			result = await runKnowledgeDecay(db, eventBus, routine);
			break;
		case "builtin:knowledge-promotion":
			result = await runKnowledgePromotion(db, eventBus, routine);
			break;
		default: {
			const exhaustive: never = routineId;
			throw new Error(`Unknown builtin routine: ${exhaustive as string}`);
		}
	}

	const endedAt = new Date();
	// Terminal on insert (no "running" intermediate) — built-in execution is
	// synchronous and cannot leave a zombie. `skipped` rows are still recorded so
	// runs[] stays honest about scheduler activity (observability, Hard rule 1).
	await db.insert(routineRuns).values({
		id: crypto.randomUUID(),
		routineId,
		startedAt: startedAt.toISOString(),
		endedAt: endedAt.toISOString(),
		outcome: result.fired ? "success" : "skipped",
		costMinor: 0,
	});

	if (result.fired) {
		await db
			.update(routines)
			.set({ lastRunAt: endedAt.toISOString() })
			.where(eq(routines.id, routineId));
	}

	return result;
}

// --- Event trigger registration ---

/**
 * Register direct event subscriptions for builtin event-triggered routines
 * (currently just `builtin:post-bet-retro` on `bet_state_changed` with
 * `toState === "completed"` filter). Returns an unsubscribe function for
 * test/teardown use.
 *
 * We do NOT go through the generic scheduler's event path because the
 * builtin handlers don't create sessions — they write review items
 * directly. The scheduler still ignores event-trigger routines lacking a
 * `taskId` in their trigger config, so the two paths don't collide.
 *
 * @lore O1: migrated from `bet_shipped` (deleted) to `bet_state_changed`
 * with a `toState === "completed"` filter. The guard must be FIRST to ensure
 * non-completed transitions are ignored before any work is done.
 */
export function registerBuiltinRoutineHandlers(db: HyperIdleDb, eventBus: EventBus): () => void {
	const unsubs: Array<() => void> = [];

	const betCompletedHandler = (event: BetStateChangedEvent): void => {
		if (event.toState !== "completed") return;
		void (async () => {
			const [routine] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, "builtin:post-bet-retro"))
				.limit(1);
			if (!(routine && routine.active)) return;
			// Best-effort fire-and-forget: the EventBus emit contract is synchronous.
			// runBuiltinRoutine is async; we await it inside the void wrapper.
			await runBuiltinRoutine(db, eventBus, "builtin:post-bet-retro", { betId: event.betId });
		})();
	};
	unsubs.push(eventBus.on("bet_state_changed", betCompletedHandler));

	return () => {
		for (const u of unsubs) u();
	};
}

// @lore AD8c: Cost Sentinel code removed from this file. See
// packages/fabric/src/services/cost-sentinel.ts for the extracted module.
// The cost sentinel is now registered as an application-level scheduled job
// via startCostSentinel in bootstrapFabric.

// --- Practice Meeting routine ---

async function runPracticeMeetingRoutine(
	db: HyperIdleDb,
	routine: Routine,
): Promise<RunBuiltinResult> {
	// Anchor scope: derive from the owner's facilitator community. The owner
	// is the facilitation practice facilitator by default, but if an operator
	// re-points it we still want a valid anchor. Fall back to "facilitation"
	// when no scope can be derived — keeps anchor creation total.
	const isoNow = new Date().toISOString();
	const result = await createPracticeMeeting(db, {
		scopeId: "facilitation",
		title: `Weekly practice meeting — ${isoNow.slice(0, 10)}`,
		nowMs: Date.now(),
	});

	return {
		fired: true,
		extra: { meetingId: result.meetingId, ownerAgentId: routine.ownerAgentId },
	};
}

// --- Post-Bet Retro ---

/**
 * Stable marker embedded in Post-Bet Retro review item bodies so we can
 * dedupe across repeated `bet_state_changed` (toState="completed") emissions
 * for the same bet.
 *
 * @lore G4 review WARN-3 post-bet-retro dedupe: `bet_state_changed` with
 * `toState="completed"` can fire more than once for the same bet (e.g. during
 * an outage replay or when an operator manually triggers the routine).
 * Without a dedupe check, each emission produces a new review item. We embed
 * `betId=<id>` on its own line in the item body and a `LIKE '%betId=<id>%'`
 * probe joined against `threads.kind = 'post-bet-retro'` tells us whether
 * we already wrote a retro for that bet. We use body-text over a dedicated
 * column because `items` has no `source_ref_id`/`foreign_id` field and
 * adding one purely for this case is out of scope for a fix-pack review.
 */
function postBetRetroBetIdMarker(betId: string): string {
	return `betId=${betId}`;
}

async function runPostBetRetro(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	args: PostBetRetroArgs,
): Promise<RunBuiltinResult> {
	const [bet] = await db.select().from(bets).where(eq(bets.id, args.betId)).limit(1);
	if (!bet) {
		return { fired: false, reason: `bet ${args.betId} not found` };
	}

	// L1a: legacy `kind='post-bet-retro'` threads now project as
	// host_kind='bet' + host_id=betId. Dedupe via the host pair + the body
	// marker; the marker probe alone is selective enough at HyperIdle's scale.
	const marker = postBetRetroBetIdMarker(args.betId);
	const [existing] = await db
		.select({ id: items.id })
		.from(items)
		.innerJoin(threads, eq(items.threadId, threads.id))
		.where(
			and(
				eq(threads.hostKind, "bet"),
				eq(threads.hostId, args.betId),
				like(items.body, `%${marker}%`),
			),
		)
		.limit(1);
	if (existing) {
		return { fired: false, reason: "already-retroed" };
	}

	// Reality: derive from revisionLog when present; otherwise note the
	// shipped timestamp. @lore G4: bets don't carry a free-form `notes`
	// column (schema exposes `revisionLog` only). When a richer reality
	// source arrives (B-track), expand this to include it.
	const hypothesis = bet.hypothesis ?? "(no hypothesis recorded)";
	const realityLines: string[] = [];
	// @lore U1: `completedAt` replaces `shippedAt`.
	if (bet.completedAt) {
		realityLines.push(`Completed at: ${bet.completedAt}`);
	}
	if (bet.revisionLog) {
		realityLines.push(`Revision log: ${bet.revisionLog}`);
	}
	if (realityLines.length === 0) {
		realityLines.push("No post-ship reality signal recorded.");
	}

	const threadId = crypto.randomUUID();
	const itemId = crypto.randomUUID();
	const isoNow = new Date().toISOString();

	await db.transaction(async (tx) => {
		await tx.insert(threads).values({
			id: threadId,
			hostKind: "bet",
			hostId: args.betId,
			initiatorId: routine.ownerAgentId,
			participants: JSON.stringify([routine.ownerAgentId]),
			lastActiveAt: isoNow,
			createdAt: isoNow,
		});

		await tx.insert(items).values({
			id: itemId,
			sourceAgentId: routine.ownerAgentId,
			layer: "meta",
			kind: "review",
			// @lore U1: `description` replaces `pitch`.
			title: `Post-bet retro: ${bet.description}`,
			body: [marker, `Hypothesis: ${hypothesis}`, "", "Reality:", ...realityLines].join("\n"),
			threadId,
			riskTier: "medium",
			createdAt: isoNow,
		});
	});

	// Respect the `silent` flag on the routine row (E7 hook).
	if (!routine.silent) {
		const evt: ItemCreatedEvent = {
			type: "item_created",
			streamId: crypto.randomUUID(),
			itemId,
			conversationId: threadId,
			kind: "review",
			timestamp: Date.now(),
		};
		eventBus.emit(evt);
	}

	return { fired: true, extra: { itemId, threadId } };
}

// --- Portfolio Retro ---

async function runPortfolioRetro(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
): Promise<RunBuiltinResult> {
	const nowMs = Date.now();
	const cutoffIso = new Date(nowMs - PORTFOLIO_WINDOW_MS).toISOString();

	// @lore O2: layer is in knowledgeStrategyFabric. JOIN to filter by layer.
	const recentRows = await db
		.select({ item: knowledgeItems, fabric: knowledgeStrategyFabric })
		.from(knowledgeItems)
		.innerJoin(
			knowledgeStrategyFabric,
			eq(knowledgeStrategyFabric.knowledgeItemId, knowledgeItems.id),
		)
		.where(
			and(
				inArray(knowledgeStrategyFabric.layer, ["L3", "L4"]),
				gte(knowledgeItems.updatedAt, cutoffIso),
			),
		);

	const bodyLines = [
		`Portfolio retro — window: last 30 days (since ${cutoffIso})`,
		`Recent L3/L4 items: ${recentRows.length}`,
		"",
	];
	for (const { item: ki, fabric } of recentRows) {
		bodyLines.push(`- [${fabric.layer ?? "?"}] ${ki.title} (updated ${ki.updatedAt})`);
	}
	if (recentRows.length === 0) {
		bodyLines.push("(no cross-product patterns updated in the window)");
	}

	const threadId = crypto.randomUUID();
	const itemId = crypto.randomUUID();
	const isoNow = new Date(nowMs).toISOString();

	await db.transaction(async (tx) => {
		await tx.insert(threads).values({
			id: threadId,
			hostKind: "factory",
			hostId: "portfolio",
			initiatorId: routine.ownerAgentId,
			participants: JSON.stringify([routine.ownerAgentId]),
			lastActiveAt: isoNow,
			createdAt: isoNow,
		});

		await tx.insert(items).values({
			id: itemId,
			sourceAgentId: routine.ownerAgentId,
			layer: "meta",
			kind: "review",
			title: `Monthly portfolio retro — ${isoNow.slice(0, 10)}`,
			body: bodyLines.join("\n"),
			threadId,
			riskTier: "low",
			createdAt: isoNow,
		});
	});

	if (!routine.silent) {
		const evt: ItemCreatedEvent = {
			type: "item_created",
			streamId: crypto.randomUUID(),
			itemId,
			conversationId: threadId,
			kind: "review",
			timestamp: nowMs,
		};
		eventBus.emit(evt);
	}

	return { fired: true, extra: { itemId, threadId, count: recentRows.length } };
}

// --- Knowledge Promotion ---

const promotionLog = createLogger({ pkg: "fabric" });

/**
 * Sweep provisional items for auto-promotion, then recompute attention scores
 * for the bounded candidate set.
 *
 * @lore AF9 Task 2+4: this handler calls runAutoPromotionSweep (which emits
 * one `knowledge_updated action=auto_promoted` per promoted item) and then
 * piggybacks a bounded attention recompute over the sweep's candidate set.
 * The handler must NOT double-emit — do not emit any additional events.
 *
 * @lore AF9 CRITIQUE WARNING 2 (R3): `recomputeScope` requires a filter and
 * rejects oversize batches. We drive the narrow `{ ids: candidateIds }` form —
 * the sweep's scanned candidate set is already bounded by DEFAULT_SWEEP_MAX_BATCH_SIZE.
 * This is the primary design, not a fallback.
 */
async function runKnowledgePromotion(
	db: HyperIdleDb,
	eventBus: EventBus,
	_routine: Routine,
): Promise<RunBuiltinResult> {
	// Step 1: run the promotion sweep. The sweep emits per-promotion events itself.
	const sweep = await runAutoPromotionSweep(db, eventBus);

	// Step 2 (Task 4): recompute attention scores for the candidates the sweep
	// touched. Use the narrow { ids } form to satisfy FILTER_REQUIRED and stay
	// within BATCH_TOO_LARGE. The sweep already bounded the candidate set.
	if (sweep.scanned > 0) {
		// Collect all scanned candidate ids by querying current provisional items
		// plus what was just promoted — use the promotedIds + flaggedForReviewIds
		// + skippedIds that the sweep returned (they are the full scanned set).
		const candidateIds: readonly string[] = [
			...sweep.promotedIds,
			...sweep.flaggedForReviewIds,
			...sweep.skippedIds,
		];

		if (candidateIds.length > 0) {
			const attentionResult = await buildAttentionService({ db, eventBus }).recomputeScope({
				ids: candidateIds,
			});
			if (!attentionResult.ok) {
				promotionLog.error("attention recompute failed on promotion sweep", {
					code: attentionResult.error.code,
					message: attentionResult.error.message,
				});
			}
		}
	}

	return {
		fired: true,
		extra: {
			promotedCount: sweep.promotedIds.length,
			flaggedCount: sweep.flaggedForReviewIds.length,
			skippedCount: sweep.skippedIds.length,
			scanned: sweep.scanned,
		},
	};
}

// --- Knowledge Decay ---

async function runKnowledgeDecay(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
): Promise<RunBuiltinResult> {
	const nowMs = Date.now();
	// Honor the `silent` column so the seeded built-in decay sweep does
	// not flood the bus with `knowledge_updated` events on every tick.
	const silent = !!routine.silent;
	const sweep = await runStaleSweep(db, eventBus, nowMs, undefined, { silent });
	return { fired: true, extra: { markedCount: sweep.markedIds.length } };
}
