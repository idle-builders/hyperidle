import * as crypto from "node:crypto";
import {
	type HyperIdleDb,
	type Routine,
	bets,
	factorySettings,
	items,
	knowledgeItems,
	routines,
	threads,
} from "@hyperidle/db";
import type {
	BetShippedEvent,
	CostCapBreachedEvent,
	CostCapWarningEvent,
	DomainEvent,
	EventBus,
	ItemCreatedEvent,
} from "@hyperidle/shared";
import { runStaleSweep } from "@hyperidle/fabric";
import { and, eq, gte, inArray, like } from "drizzle-orm";
import { createPracticeMeeting } from "./practice-meeting.js";

// --- Stable IDs ---

/**
 * Stable, non-UUID identifiers for the five built-in routines seeded at
 * factory initialisation. Prefix `builtin:` — reserved — distinguishes
 * system-seeded routines from operator-authored ones so the manual-trigger
 * API can route to the correct handler.
 *
 * @lore G4 builtin id prefix: the `builtin:` prefix is load-bearing for the
 * manual-trigger API, which decides whether to call `runBuiltinRoutine`
 * (builtin) vs. the legacy session-creation path (non-builtin). Changing
 * this prefix requires updating `routes/routines-routes.ts` and the seed.
 */
export const BUILTIN_ROUTINE_IDS = [
	"builtin:cost-sentinel",
	"builtin:practice-meeting",
	"builtin:post-bet-retro",
	"builtin:portfolio-retro",
	"builtin:knowledge-decay",
] as const;

export type BuiltinRoutineId = (typeof BUILTIN_ROUTINE_IDS)[number];

export function isBuiltinRoutineId(id: string): id is BuiltinRoutineId {
	return (BUILTIN_ROUTINE_IDS as readonly string[]).includes(id);
}

// --- Trigger config constants ---

const COST_SENTINEL_INTERVAL_SECONDS = 900; // 15 minutes
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

const COST_WARNING_RATIO = 0.8;
const PORTFOLIO_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// --- Seed helper ---

interface BuiltinSpec {
	readonly id: BuiltinRoutineId;
	readonly ownerAgentId: string;
	readonly triggerType: "heartbeat" | "calendar" | "event";
	readonly triggerConfig: Record<string, unknown>;
	readonly skillId: string;
	readonly doneCondition: string;
	readonly humanReview: 0 | 1;
	readonly silent: 0 | 1;
}

/**
 * Concrete specs for the five built-in routines. Owner agent ids match G1
 * seed ids in `packages/db/src/seed.ts`; keep them in sync.
 */
const BUILTIN_SPECS: readonly BuiltinSpec[] = [
	{
		id: "builtin:cost-sentinel",
		ownerAgentId: "seed-agent-cos",
		triggerType: "heartbeat",
		triggerConfig: { intervalSeconds: COST_SENTINEL_INTERVAL_SECONDS },
		skillId: "cost_watchdog",
		doneCondition: "Factory cost spend is below warning threshold",
		humanReview: 0,
		silent: 1,
	},
	{
		id: "builtin:practice-meeting",
		ownerAgentId: "seed-agent-pf-facilitation",
		triggerType: "calendar",
		triggerConfig: { cron: PRACTICE_MEETING_CRON },
		skillId: "practice_meeting",
		doneCondition: "3-turn practice meeting anchor created",
		humanReview: 0,
		silent: 0,
	},
	{
		id: "builtin:post-bet-retro",
		ownerAgentId: "seed-agent-pm-nimmly",
		triggerType: "event",
		triggerConfig: { eventType: "bet_shipped" },
		skillId: "bet_retro",
		doneCondition: "Review item comparing hypothesis vs reality written",
		humanReview: 1,
		silent: 0,
	},
	{
		id: "builtin:portfolio-retro",
		ownerAgentId: "seed-agent-cos",
		triggerType: "calendar",
		triggerConfig: { cron: PORTFOLIO_RETRO_CRON },
		skillId: "portfolio_retro",
		doneCondition: "Cross-product portfolio review item written",
		humanReview: 1,
		silent: 0,
	},
	{
		id: "builtin:knowledge-decay",
		ownerAgentId: "seed-agent-cos",
		triggerType: "calendar",
		triggerConfig: { cron: KNOWLEDGE_DECAY_CRON },
		skillId: "knowledge_decay",
		doneCondition: "Stale knowledge items transitioned",
		humanReview: 0,
		silent: 1,
	},
];

/**
 * Idempotent seed for the G4 built-in routines. Must be called after G1
 * agents (`seed-agent-cos`, `seed-agent-pf-facilitation`,
 * `seed-agent-pm-nimmly`) have been seeded so the FK to `agents.id` resolves.
 *
 * Uses `onConflictDoNothing` so re-running against an existing DB is a no-op.
 */
export function seedBuiltinRoutines(db: HyperIdleDb): void {
	for (const spec of BUILTIN_SPECS) {
		db.insert(routines)
			.values({
				id: spec.id,
				ownerAgentId: spec.ownerAgentId,
				triggerType: spec.triggerType,
				triggerConfig: JSON.stringify(spec.triggerConfig),
				skillId: spec.skillId,
				doneCondition: spec.doneCondition,
				delegationAllowed: 0,
				humanReview: spec.humanReview,
				silent: spec.silent,
				active: 1,
			})
			.onConflictDoNothing()
			.run();
	}
}

// --- Dispatcher ---

export type RunBuiltinResult =
	| { readonly fired: true; readonly emitted?: readonly string[]; readonly extra?: Record<string, unknown> }
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
	const routine = db.select().from(routines).where(eq(routines.id, routineId)).get();
	if (!routine) {
		return { fired: false, reason: `routine ${routineId} not found` };
	}
	if (routine.active === 0) {
		return { fired: false, reason: `routine ${routineId} is disabled (active=0)` };
	}

	let result: RunBuiltinResult;
	switch (routineId) {
		case "builtin:cost-sentinel":
			result = runCostSentinel(db, eventBus);
			break;
		case "builtin:practice-meeting":
			result = runPracticeMeetingRoutine(db, routine);
			break;
		case "builtin:post-bet-retro":
			if (!args) {
				return { fired: false, reason: "post-bet-retro requires { betId } args" };
			}
			result = runPostBetRetro(db, eventBus, routine, args);
			break;
		case "builtin:portfolio-retro":
			result = runPortfolioRetro(db, eventBus, routine);
			break;
		case "builtin:knowledge-decay":
			result = runKnowledgeDecay(db, eventBus, routine);
			break;
		default: {
			const exhaustive: never = routineId;
			throw new Error(`Unknown builtin routine: ${exhaustive as string}`);
		}
	}

	if (result.fired) {
		db.update(routines)
			.set({ lastRunAt: new Date().toISOString() })
			.where(eq(routines.id, routineId))
			.run();
	}

	return result;
}

// --- Event trigger registration ---

/**
 * Register direct event subscriptions for builtin event-triggered routines
 * (currently just `builtin:post-bet-retro` on `bet_shipped`). Returns an
 * unsubscribe function for test/teardown use.
 *
 * We do NOT go through the generic scheduler's event path because the
 * builtin handlers don't create sessions — they write review items
 * directly. The scheduler still ignores event-trigger routines lacking a
 * `taskId` in their trigger config, so the two paths don't collide.
 */
export function registerBuiltinRoutineHandlers(db: HyperIdleDb, eventBus: EventBus): () => void {
	const unsubs: Array<() => void> = [];

	const betShippedHandler = (event: BetShippedEvent): void => {
		const routine = db
			.select()
			.from(routines)
			.where(eq(routines.id, "builtin:post-bet-retro"))
			.get();
		if (!routine || routine.active === 0) return;
		// Synchronous-like best-effort: ignore the async promise to keep the
		// EventBus emit contract (synchronous). The DB writes inside the
		// handler all run synchronously because drizzle-sqlite is synchronous.
		void runBuiltinRoutine(db, eventBus, "builtin:post-bet-retro", { betId: event.betId });
	};
	unsubs.push(eventBus.on("bet_shipped", betShippedHandler));

	return () => {
		for (const u of unsubs) u();
	};
}

// --- Cost Sentinel ---

/**
 * Cost sentinel level states. Stored in `factory_settings` under
 * `cost_sentinel_last_level` and checked on every tick to dedupe
 * warning/breach emissions.
 *
 * @lore G4 cost sentinel level-based dedupe: we track the current cost
 * level as persistent state (ok | warning | breach) and only emit when
 * the level CHANGES. Earlier implementations deduped by (cap, actual)
 * pairs in an in-memory Set, but that leaked unbounded strings (every
 * distinct actual value lived forever) and conflated "cap raised" with
 * "we already warned about this spend". Level transitions map cleanly
 * to what operators care about: a single event per change of state. The
 * cache-clear helper remains in-memory only (clears the module-level
 * test sentinel flag); real state lives in `factory_settings`.
 */
type CostSentinelLevel = "ok" | "warning" | "breach";

const COST_SENTINEL_STATE_KEY = "cost_sentinel_last_level";

/**
 * In-memory flag used by tests to force a reset of the persisted level
 * state between test cases. Tests call `clearBuiltinCostSentinelCache`
 * before asserting — the next sentinel tick treats the stored level as
 * if it were missing, ensuring deterministic test ordering.
 */
let testResetRequested = false;

export function clearBuiltinCostSentinelCache(): void {
	testResetRequested = true;
}

function readStoredLevel(db: HyperIdleDb): CostSentinelLevel | null {
	if (testResetRequested) return null;
	const row = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, COST_SENTINEL_STATE_KEY))
		.get();
	const value = row?.value;
	if (value === "ok" || value === "warning" || value === "breach") return value;
	return null;
}

function writeStoredLevel(db: HyperIdleDb, level: CostSentinelLevel): void {
	const isoNow = new Date().toISOString();
	const existing = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, COST_SENTINEL_STATE_KEY))
		.get();
	if (existing) {
		db.update(factorySettings)
			.set({ value: level, updatedAt: isoNow })
			.where(eq(factorySettings.key, COST_SENTINEL_STATE_KEY))
			.run();
	} else {
		db.insert(factorySettings)
			.values({ key: COST_SENTINEL_STATE_KEY, value: level, updatedAt: isoNow })
			.run();
	}
	// After any real write, the test-reset flag is consumed.
	testResetRequested = false;
}

function classifyLevel(ratio: number): CostSentinelLevel {
	if (ratio >= 1) return "breach";
	if (ratio >= COST_WARNING_RATIO) return "warning";
	return "ok";
}

function runCostSentinel(db: HyperIdleDb, eventBus: EventBus): RunBuiltinResult {
	const capRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "cost_cap"))
		.get();
	const actualRow = db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "cost_actual"))
		.get();

	if (!capRow) {
		return { fired: true, emitted: [] };
	}
	const cap = Number.parseInt(capRow.value, 10);
	const actual = Number.parseInt(actualRow?.value ?? "0", 10);
	if (!Number.isFinite(cap) || cap <= 0) {
		return { fired: true, emitted: [] };
	}

	const ratio = actual / cap;
	const currentLevel = classifyLevel(ratio);
	const previousLevel = readStoredLevel(db) ?? "ok";
	const emitted: string[] = [];
	const timestamp = Date.now();

	// Only emit when the level transitions.
	if (currentLevel !== previousLevel) {
		if (currentLevel === "breach") {
			const evt: CostCapBreachedEvent = {
				type: "cost_cap_breached",
				streamId: crypto.randomUUID(),
				level: "hard",
				capLevel: "factory",
				entityId: "factory",
				spend: actual,
				cap,
				timestamp,
			};
			eventBus.emit(evt);
			emitted.push("cost_cap_breached");
		} else if (currentLevel === "warning") {
			const evt: CostCapWarningEvent = {
				type: "cost_cap_warning",
				streamId: crypto.randomUUID(),
				level: "warning",
				capLevel: "factory",
				entityId: "factory",
				spend: actual,
				cap,
				timestamp,
			};
			eventBus.emit(evt);
			emitted.push("cost_cap_warning");
		}
		// Transitioning back to "ok" resets state silently — no event
		// type currently exists for "cost recovered".
	}

	// Always persist the latest level so a reset back to ok is observable
	// on the next transition.
	if (currentLevel !== previousLevel || testResetRequested) {
		writeStoredLevel(db, currentLevel);
	}

	return { fired: true, emitted };
}

// --- Practice Meeting routine ---

function runPracticeMeetingRoutine(db: HyperIdleDb, routine: Routine): RunBuiltinResult {
	// Anchor scope: derive from the owner's facilitator community. The owner
	// is the facilitation practice facilitator by default, but if an operator
	// re-points it we still want a valid anchor. Fall back to "facilitation"
	// when no scope can be derived — keeps anchor creation total.
	const isoNow = new Date().toISOString();
	const result = createPracticeMeeting(db, {
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
 * dedupe across repeated `bet_shipped` emissions for the same bet.
 *
 * @lore G4 review WARN-3 post-bet-retro dedupe: `bet_shipped` can fire
 * more than once for the same bet (e.g. during an outage replay or when
 * an operator manually triggers the routine). Without a dedupe check,
 * each emission produces a new review item. We embed `betId=<id>` on its
 * own line in the item body and a `LIKE '%betId=<id>%'` probe joined
 * against `threads.kind = 'post-bet-retro'` tells us whether we already
 * wrote a retro for that bet. We use body-text over a dedicated column
 * because `items` has no `source_ref_id`/`foreign_id` field and adding
 * one purely for this case is out of scope for a fix-pack review.
 */
function postBetRetroBetIdMarker(betId: string): string {
	return `betId=${betId}`;
}

function runPostBetRetro(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	args: PostBetRetroArgs,
): RunBuiltinResult {
	const bet = db.select().from(bets).where(eq(bets.id, args.betId)).get();
	if (!bet) {
		return { fired: false, reason: `bet ${args.betId} not found` };
	}

	// Dedupe: look for an existing review item in a post-bet-retro thread
	// whose body carries the same betId marker. If found, skip creation.
	const marker = postBetRetroBetIdMarker(args.betId);
	const existing = db
		.select({ id: items.id })
		.from(items)
		.innerJoin(threads, eq(items.threadId, threads.id))
		.where(and(eq(threads.kind, "post-bet-retro"), like(items.body, `%${marker}%`)))
		.get();
	if (existing) {
		return { fired: false, reason: "already-retroed" };
	}

	// Reality: derive from revisionLog when present; otherwise note the
	// shipped timestamp. @lore G4: bets don't carry a free-form `notes`
	// column (schema exposes `revisionLog` only). When a richer reality
	// source arrives (B-track), expand this to include it.
	const hypothesis = bet.hypothesis ?? "(no hypothesis recorded)";
	const realityLines: string[] = [];
	if (bet.shippedAt) {
		realityLines.push(`Shipped at: ${bet.shippedAt}`);
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

	db.transaction((tx) => {
		tx.insert(threads)
			.values({
				id: threadId,
				kind: "post-bet-retro",
				createdAt: isoNow,
			})
			.run();

		tx.insert(items)
			.values({
				id: itemId,
				sourceAgentId: routine.ownerAgentId,
				layer: "meta",
				kind: "review",
				title: `Post-bet retro: ${bet.pitch}`,
				body: [
					marker,
					`Hypothesis: ${hypothesis}`,
					"",
					"Reality:",
					...realityLines,
				].join("\n"),
				threadId,
				riskTier: "medium",
				createdAt: isoNow,
			})
			.run();
	});

	// Respect the `silent` flag on the routine row (E7 hook).
	if (routine.silent !== 1) {
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

function runPortfolioRetro(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
): RunBuiltinResult {
	const nowMs = Date.now();
	const cutoffIso = new Date(nowMs - PORTFOLIO_WINDOW_MS).toISOString();

	const recent = db
		.select()
		.from(knowledgeItems)
		.where(
			and(
				inArray(knowledgeItems.layer, ["L3", "L4"]),
				gte(knowledgeItems.updatedAt, cutoffIso),
			),
		)
		.all();

	const bodyLines = [
		`Portfolio retro — window: last 30 days (since ${cutoffIso})`,
		`Recent L3/L4 items: ${recent.length}`,
		"",
	];
	for (const ki of recent) {
		bodyLines.push(`- [${ki.layer}] ${ki.title} (updated ${ki.updatedAt})`);
	}
	if (recent.length === 0) {
		bodyLines.push("(no cross-product patterns updated in the window)");
	}

	const threadId = crypto.randomUUID();
	const itemId = crypto.randomUUID();
	const isoNow = new Date(nowMs).toISOString();

	db.transaction((tx) => {
		tx.insert(threads)
			.values({
				id: threadId,
				kind: "portfolio-retro",
				createdAt: isoNow,
			})
			.run();

		tx.insert(items)
			.values({
				id: itemId,
				sourceAgentId: routine.ownerAgentId,
				layer: "meta",
				kind: "review",
				title: `Monthly portfolio retro — ${isoNow.slice(0, 10)}`,
				body: bodyLines.join("\n"),
				threadId,
				riskTier: "low",
				createdAt: isoNow,
			})
			.run();
	});

	if (routine.silent !== 1) {
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

	return { fired: true, extra: { itemId, threadId, count: recent.length } };
}

// --- Knowledge Decay ---

function runKnowledgeDecay(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
): RunBuiltinResult {
	const nowMs = Date.now();
	// Honor the `silent` column so the seeded built-in decay sweep does
	// not flood the bus with `knowledge_updated` events on every tick.
	const silent = routine.silent === 1;
	const sweep = runStaleSweep(db, eventBus, nowMs, undefined, { silent });
	return { fired: true, extra: { markedCount: sweep.markedIds.length } };
}

// --- Type guard export for tests ---

export type BuiltinEventSignature = DomainEvent["type"];
