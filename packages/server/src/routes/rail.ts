import { bets, factorySettings, type HyperIdleDb, items, tasks } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
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

interface CostBurnRate {
	cap: number;
	actual: number;
	percentage: number;
}

interface RailResponse {
	bets: RailBet[];
	blockers: RailBlocker[];
	awaitingOrdering: Array<{ id: string; title: string; createdAt: string }>;
	costBurnRate: CostBurnRate;
}

function getFactorySettingNumber(db: HyperIdleDb, key: string): number {
	const row = db.select().from(factorySettings).where(eq(factorySettings.key, key)).get();
	if (!row) return 0;
	const parsed = Number.parseInt(row.value, 10);
	return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Create Hono routes for the Rail endpoint.
 * Rail provides an ambient awareness dashboard: active bets, blockers, ordering queue, cost.
 */
export function createRailRoutes(db: HyperIdleDb, _eventBus: EventBus): Hono {
	const router = new Hono();

	// GET / — current rail state
	router.get("/", (c) => {
		const now = Date.now();

		// @lore I6: query active bets with WHERE status IN instead of loading all.
		const activeBets = db
			.select()
			.from(bets)
			.where(inArray(bets.status, ["committed", "in_progress"]))
			.all();

		const allTasks = db.select().from(tasks).all();

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
		const orderingItems = db.select().from(items).where(eq(items.kind, "ordering")).all();
		const awaitingOrdering = orderingItems.map((i) => ({
			id: i.id,
			title: i.title,
			createdAt: i.createdAt,
		}));

		// Cost burn rate from factory settings
		const costCap = getFactorySettingNumber(db, "cost_cap");
		const costActual = getFactorySettingNumber(db, "cost_actual");
		const percentage = costCap > 0 ? Math.round((costActual / costCap) * 100) : 0;

		const response: RailResponse = {
			bets: railBets,
			blockers: railBlockers,
			awaitingOrdering,
			costBurnRate: {
				cap: costCap,
				actual: costActual,
				percentage,
			},
		};

		return c.json(response);
	});

	return router;
}
