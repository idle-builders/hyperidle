/**
 * AU11: agent-owned handler half of the former
 * `app-runtime/services/builtin-routines.ts`. Executes the 5 built-in
 * routines (provisioning + dispatch + per-routine implementations). The
 * *default records* (stable IDs, cron, owner roles) are editable config —
 * see `config/builtin-routines.ts`.
 */
import * as crypto from "node:crypto";
import { getThreadIdsByHost, insertThread } from "@hyperidle/conversation";
import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	type Routine,
} from "@hyperidle/db";
import { buildAttentionService, runAutoPromotionSweep, runStaleSweep } from "@hyperidle/knowledge";
import * as routineService from "@hyperidle/routine";
import {
	type BetStateChangedEvent,
	createLogger,
	type EventBus,
	type ItemCreatedEvent,
} from "@hyperidle/shared";
import * as work from "@hyperidle/work";
import { and, eq, gte, inArray } from "drizzle-orm";
import { BUILTIN_SPECS, extractBuiltinKind } from "../config/builtin-routines.js";
import { createPracticeMeeting } from "./practice-meeting.js";
import {
	attentionReviewReasoningMarker,
	createReviewItemForKnowledge,
} from "./review-item-factory.js";
// @lore AF6: cron helpers used only at runtime inside provisionTeamRoutines. The
// scheduler↔builtin-routine-handlers import cycle is init-safe because neither module
// calls the other at top level (only runBuiltinRoutine / parseCron at call time).
import { nextCronMatch, parseCron } from "./routine-scheduler.js";

const PORTFOLIO_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// --- Provision helper ---

/**
 * Per-team provisioning of the 5 built-in routines.
 *
 * Each routine id is scoped to the team: `builtin:<kind>:<teamId>` so a
 * second team does not collide with the first team's routines.
 * `onConflictDoNothing` gives per-team idempotency: re-provisioning the same
 * team is a no-op; each new team gets its own 5 rows.
 *
 * @param teamId - `teams.id` (NOT `team_members.id`). FK on routines.team_id.
 * @param ownerByRole - map of role → users.id (roster agent id). Used to resolve
 *   the ownerAgentId for each spec's ownerRole.
 * @param leadAgentId - Fallback `users.id` when a role is absent from ownerByRole.
 *
 * @lore AF17: Replaces `seedBuiltinRoutines(db, teamId)`. Key changes:
 *   - per-team id scheme prevents collision across multiple teams
 *   - owners resolved from the team's own roster (not hardcoded factory agents)
 *   - ownerByRole[spec.ownerRole] ?? leadAgentId for honest attribution with total fallback
 *
 * @lore AF17 dispatch ripple: `runBuiltinRoutine` and `isBuiltinRoutineId` now
 * key on the kind prefix (`builtin:<kind>`) not the full stored id. This keeps
 * the dispatch contract on the 5 stable kinds while storage is per-team.
 */
export async function provisionTeamRoutines(
	db: HyperIdleDb,
	opts: {
		teamId: string;
		ownerByRole: Partial<Record<string, string>>;
		leadAgentId: string;
	},
): Promise<void> {
	const { teamId, ownerByRole, leadAgentId } = opts;
	const now = new Date();
	for (const spec of BUILTIN_SPECS) {
		// Per-team id: builtin:<kind>:<teamId>
		const routineId = `${spec.id}:${teamId}`;

		// AF6 §2a: calendar built-ins need a nextRunAt so the poll loop selects them.
		let nextRunAt: string | null = null;
		const cron = (spec.triggerConfig as { cron?: string }).cron;
		if (spec.triggerType === "calendar" && cron) {
			nextRunAt = nextCronMatch(parseCron(cron), now).toISOString();
		}

		// Resolve owner: role → roster agent; fall back to lead.
		const ownerAgentId = ownerByRole[spec.ownerRole] ?? leadAgentId;

		await routineService.insertRoutine(
			db,
			{
				id: routineId,
				name: spec.name,
				teamId,
				state: "active",
				ownerAgentId,
				triggerType: spec.triggerType,
				triggerConfig: JSON.stringify(spec.triggerConfig),
				skillId: spec.skillId,
				doneCondition: spec.doneCondition,
				delegationAllowed: false,
				humanReview: spec.humanReview,
				silent: spec.silent,
				active: true,
				nextRunAt,
			},
			{ onConflictDoNothing: true },
		);
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
	routineId: string,
	args?: PostBetRetroArgs,
): Promise<RunBuiltinResult> {
	const routine = await routineService.getRoutineById(db, routineId);
	if (!routine) {
		return { fired: false, reason: `routine ${routineId} not found` };
	}
	if (!routine.active) {
		// @lore AF6 CRITICAL 1: the disabled short-circuit returns BEFORE inserting
		// any routine_runs row. A disabled routine produces no run record — this
		// preserves AC2's negative assertion (disabled → no fire, no row).
		return { fired: false, reason: `routine ${routineId} is disabled (active=false)` };
	}

	// @lore AF17: dispatch on the kind prefix extracted from the stored id so that
	// per-team ids (`builtin:post-bet-retro:<teamId>`) route correctly.
	// The DB lookup above stays on the full id; only the switch uses the kind.
	const kind = extractBuiltinKind(routineId);
	if (!kind) {
		return { fired: false, reason: `${routineId} is not a builtin routine` };
	}

	// @lore AF6 CRITICAL 1: built-in fires must write a terminal routine_runs row
	// so GET /api/routines/:id (which builds runs[] from routineRuns) surfaces the
	// self-run (AC5) and "last run reflects real execution" holds (AC1). This is the
	// single source of truth across manual trigger AND scheduled auto-fire — the §3
	// scheduler fork only advances nextRunAt, it writes no row. costMinor:0 because
	// built-ins do bounded DB work with no provisioned session / harness cost.
	const startedAt = new Date();

	let result: RunBuiltinResult;
	switch (kind) {
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
			const exhaustive: never = kind;
			throw new Error(`Unknown builtin routine kind: ${exhaustive as string}`);
		}
	}

	const endedAt = new Date();
	// Terminal on insert (no "running" intermediate) — built-in execution is
	// synchronous and cannot leave a zombie. `skipped` rows are still recorded so
	// runs[] stays honest about scheduler activity (observability, Hard rule 1).
	await routineService.insertRoutineRun(db, {
		id: crypto.randomUUID(),
		routineId,
		startedAt: startedAt.toISOString(),
		endedAt: endedAt.toISOString(),
		outcome: result.fired ? "success" : "skipped",
		costMinor: 0,
	});

	if (result.fired) {
		await routineService.updateRoutineById(db, routineId, { lastRunAt: endedAt.toISOString() });
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
			// @lore AF17 NIT: look up the post-bet-retro routine by kind + teamId.
			// After AF17, each team has its own builtin routine with id
			// `builtin:post-bet-retro:<teamId>`. The teamId comes from the bet row.
			// Fall back to the legacy global id for DBs seeded before AF17.
			const betId = event.betId;

			// Look up the bet's teamId
			const betRow = await work.getBetById(db, betId);
			const betTeamId = betRow?.teamId;

			// Try per-team id first
			let routineRow: Routine | undefined;
			if (betTeamId) {
				const perTeamId = `builtin:post-bet-retro:${betTeamId}`;
				routineRow = await routineService.getRoutineById(db, perTeamId);
			}
			// Fall back to legacy global id (backward compat)
			if (!routineRow) {
				routineRow = await routineService.getRoutineById(db, "builtin:post-bet-retro");
			}
			if (!(routineRow && routineRow.active)) return;

			// Best-effort fire-and-forget
			await runBuiltinRoutine(db, eventBus, routineRow.id, { betId });
		})();
	};
	unsubs.push(eventBus.on("bet_state_changed", betCompletedHandler));

	return () => {
		for (const u of unsubs) u();
	};
}

// @lore AD8c: Cost Sentinel code lives in packages/server/src/services/cost-sentinel.ts.
// The cost sentinel is registered as an application-level scheduled job via
// startCostSentinel in server-factory.ts's registerAgentLayerServices.

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
	const bet = await work.getBetById(db, args.betId);
	if (!bet) {
		return { fired: false, reason: `bet ${args.betId} not found` };
	}

	// L1a: legacy `kind='post-bet-retro'` threads now project as
	// host_kind='bet' + host_id=betId. Dedupe via the host pair + the body
	// marker; the marker probe alone is selective enough at HyperIdle's scale.
	const marker = postBetRetroBetIdMarker(args.betId);
	// Decomposed per founder ruling (2026-07-12) — zero cross-owned-table
	// exceptions: Conversation owns `threads`, so resolve the bet's thread ids
	// via conversation-store, then let Work own the `items` read through
	// `findRetroItemByThreadIds` (no `items ⋈ threads` join in work-service).
	const betThreadIds = await getThreadIdsByHost(db, "bet", args.betId);
	const existing = await work.findRetroItemByThreadIds(db, betThreadIds, marker);
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
		await insertThread(tx as HyperIdleDb, {
			id: threadId,
			hostKind: "bet",
			hostId: args.betId,
			initiatorId: routine.ownerAgentId,
			participants: JSON.stringify([routine.ownerAgentId]),
			lastActiveAt: isoNow,
			createdAt: isoNow,
		});

		await work.createItem(tx, {
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

	// @lore O2: layer is in knowledgeAppProjection. JOIN to filter by layer.
	const recentRows = await db
		.select({ item: knowledgeItems, fabric: knowledgeAppProjection })
		.from(knowledgeItems)
		.innerJoin(
			knowledgeAppProjection,
			eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
		)
		.where(
			and(
				inArray(knowledgeAppProjection.layer, ["L3", "L4"]),
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
		await insertThread(tx as HyperIdleDb, {
			id: threadId,
			hostKind: "factory",
			hostId: "portfolio",
			initiatorId: routine.ownerAgentId,
			participants: JSON.stringify([routine.ownerAgentId]),
			lastActiveAt: isoNow,
			createdAt: isoNow,
		});

		await work.createItem(tx, {
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

const promotionLog = createLogger({ pkg: "server.knowledge-promotion" });

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
			const attentionResult = await buildAttentionService({
				db,
				eventBus,
				work: { findItemByReasoningMarker: work.findItemByReasoningMarker },
				review: { createReviewItemForKnowledge, attentionReviewReasoningMarker },
			}).recomputeScope({
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
