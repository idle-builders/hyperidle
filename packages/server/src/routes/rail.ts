import { bets, factorySettings, type HyperIdleDb, items, tasks } from "@hyperidle/db";
import type { CurrencyCode, EventBus, WireMoney } from "@hyperidle/shared";
import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";

interface RailBet {
	id: string;
	title: string;
	status: string;
	progress: { done: number; total: number };
}

interface RailBlocker {
	taskId: string;
	title: string;
	owner: string | null;
	durationBlockedMs: number;
}

/**
 * L17: CostBurnRate replaced with structured WireMoney fields.
 *
 * @lore L17: The old CostBurnRate used flat number fields (cap, actual, percentage).
 * L17 replaces these with WireMoney objects so consumers can format money with the
 * correct currency scale — they no longer assume "cents" and can handle JPY (scale 0).
 * weekTokens is added to surface aggregate token usage without requiring a separate call.
 */
interface CostBurnRate {
	todaySpend: WireMoney | null;
	todayCap: WireMoney | null;
	weekSpend: WireMoney | null;
	weekCap: WireMoney | null;
	/** Total tokens consumed in the current rolling 7-day window. */
	weekTokens: number | null;
}

interface RailResponse {
	bets: RailBet[];
	blockers: RailBlocker[];
	awaitingOrdering: Array<{ id: string; title: string; createdAt: string }>;
	costBurnRate: CostBurnRate;
}

/** Read a factory setting string value, or null if not found. */
async function getFactorySetting(db: HyperIdleDb, key: string): Promise<string | null> {
	const [row] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, key))
		.limit(1);
	return row?.value ?? null;
}

/** Parse a factory setting as a minor-unit integer, or null if missing/invalid. */
async function getFactorySettingMinor(db: HyperIdleDb, key: string): Promise<number | null> {
	const val = await getFactorySetting(db, key);
	if (val === null) return null;
	const parsed = Number.parseInt(val, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

// @lore O2: sumSessionSpendSince and countWeekTokens removed. Session cost
// and token columns (cost, costMinor, costCurrency, tokensJson) were stripped
// from the sessions kernel table as part of kernel/strategy separation. Cost
// burn rates are now computed at the strategy/fabric layer. The rail endpoint
// returns null for spend values until the fabric layer provides them.

/**
 * Create Hono routes for the Rail endpoint.
 * Rail provides an ambient awareness dashboard: active bets, blockers, ordering queue, cost.
 */
export function createRailRoutes(db: HyperIdleDb, _eventBus: EventBus): Hono {
	const router = new Hono();

	// GET / — current rail state
	router.get("/", async (c) => {
		const now = Date.now();

		// @lore I6: query active bets with WHERE status IN instead of loading all.
		const activeBets = await db
			.select()
			.from(bets)
			.where(inArray(bets.status, ["committed", "in_progress"]));

		const allTasks = await db.select().from(tasks);

		const railBets: RailBet[] = activeBets.map((b) => {
			const betTasks = allTasks.filter((t) => t.betId === b.id);
			const doneTasks = betTasks.filter((t) => t.state === "done");
			return {
				id: b.id,
				title: b.pitch,
				status: b.status,
				progress: { done: doneTasks.length, total: betTasks.length },
			};
		});

		// Blocked tasks
		const blockedTasks = allTasks.filter((t) => t.state === "blocked");
		const railBlockers: RailBlocker[] = blockedTasks.map((t) => {
			const updatedAtMs = new Date(t.updatedAt).getTime();
			return {
				taskId: t.id,
				title: t.title,
				owner: t.ownerAgentId,
				durationBlockedMs: now - updatedAtMs,
			};
		});

		// Items awaiting ordering (kind = 'ordering')
		const orderingItems = await db.select().from(items).where(eq(items.kind, "ordering"));
		const awaitingOrdering = orderingItems.map((i) => ({
			id: i.id,
			title: i.title,
			createdAt: i.createdAt,
		}));

		// @lore O2: cost burn rate computed from factory settings only; session-level
		// spend aggregation removed (cost columns stripped from sessions table).
		// todaySpend/weekSpend return null until the strategy/fabric layer provides them.
		const factoryCurrency = ((await getFactorySetting(db, "cost_currency")) ??
			"USD") as CurrencyCode;

		const dailyCapMinor = await getFactorySettingMinor(db, "cost_cap_daily_minor");
		const weeklyCapMinor = await getFactorySettingMinor(db, "cost_cap_weekly_minor");

		// @lore O2: session cost columns stripped; spend values return 0 until fabric provides aggregation.
		const costBurnRate: CostBurnRate = {
			todaySpend: { minor: 0, currency: factoryCurrency },
			todayCap: dailyCapMinor != null ? { minor: dailyCapMinor, currency: factoryCurrency } : null,
			weekSpend: { minor: 0, currency: factoryCurrency },
			weekCap: weeklyCapMinor != null ? { minor: weeklyCapMinor, currency: factoryCurrency } : null,
			weekTokens: null,
		};

		const response: RailResponse = {
			bets: railBets,
			blockers: railBlockers,
			awaitingOrdering,
			costBurnRate,
		};

		return c.json(response);
	});

	return router;
}
