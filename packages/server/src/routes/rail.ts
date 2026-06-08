import { bets, factorySettings, type HyperIdleDb, items, tasks, teamMembers } from "@hyperidle/db";
import type { CurrencyCode, EventBus, WireMoney } from "@hyperidle/shared";
import { eq, inArray, sql } from "drizzle-orm";
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
			// @lore U1: status simplified: "active" replaces committed/in_progress.
			.where(inArray(bets.status, ["active"]));

		const allTasks = await db.select().from(tasks);

		const railBets: RailBet[] = activeBets.map((b) => {
			const betTasks = allTasks.filter((t) => t.betId === b.id);
			const doneTasks = betTasks.filter((t) => t.state === "done");
			return {
				id: b.id,
				// @lore U1: `description` replaces `pitch`.
				title: b.description,
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
		const factoryCurrency = ((await getFactorySetting(db, "cost_currency")) ??
			"USD") as CurrencyCode;

		const dailyCapMinor = await getFactorySettingMinor(db, "cost_cap_daily_minor");
		const weeklyCapMinor = await getFactorySettingMinor(db, "cost_cap_weekly_minor");

		// AD5 AC-6: read actual cumulative spend from teamMembers.costActual.
		// @lore AD5: teamMembers.costActual is cumulative (not day-windowed) because
		// session cost columns were stripped in O2. "todaySpend" naming is misleading
		// but changing the API shape is out of scope. Cumulative data is better than
		// zeros — it matches what the team detail page shows.
		const [spendRow] = await db
			.select({ total: sql<number>`coalesce(sum(${teamMembers.costActual}), 0)` })
			.from(teamMembers);
		const totalSpendMinor = spendRow?.total ?? 0;

		const costBurnRate: CostBurnRate = {
			todaySpend: { minor: totalSpendMinor, currency: factoryCurrency },
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
