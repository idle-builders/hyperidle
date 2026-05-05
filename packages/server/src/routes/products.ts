/**
 * L13 — /api/products routes: composite product+team detail endpoint.
 *
 * GET /products         — list of all products with portfolio counters
 * GET /products/:id     — full ProductDetail for a single product
 *
 * @lore L13: No /api/teams resource. The team facet is reached through the
 * product, never as a standalone collection. The product id is the public
 * identifier; team_id is an internal join key only.
 *
 * @lore L13: The 500 on missing team (loadProductTeam) is intentional. A
 * product without a team is a programming bug. It surfaces loudly via the
 * standard ApiErrorResponse envelope. The Product page renders an ErrorState
 * for it. See services/product-team.ts.
 */

import { agents, bets, type HyperIdleDb, products, tasks, teams } from "@hyperidle/db";
import type {
	BetCardSummary,
	EventBus,
	ProductDetail,
	ProductListItem,
	RosterMember,
} from "@hyperidle/shared";
import { and, count, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { ApiError, loadProductTeam } from "../services/product-team.js";

/**
 * Derive the pitch title from the first non-empty line of the markdown pitch.
 * Strips leading `#` characters (headings). Falls back to the bet id.
 */
function derivePitchTitle(pitch: string, betId: string): string {
	const lines = pitch.split("\n");
	for (const line of lines) {
		const trimmed = line.replace(/^#+\s*/, "").trim();
		if (trimmed.length > 0) return trimmed;
	}
	return betId;
}

/**
 * Derive product status from team and active bet states.
 *
 * - "blocked" if any active bet has any task in state = 'blocked'
 * - "behind" if active_bets > capacity OR cost_actual >= cost_cap (when cap is set)
 * - "healthy" otherwise
 */
function deriveProductStatus(
	team: { activeBets: number; capacity: number; costActual: number | null; costCap: number | null },
	hasBlockedTask: boolean,
): "healthy" | "behind" | "blocked" {
	if (hasBlockedTask) return "blocked";
	const costActual = team.costActual ?? 0;
	const overCapacity = team.activeBets > team.capacity;
	const overBudget = team.costCap !== null && costActual >= team.costCap;
	if (overCapacity || overBudget) return "behind";
	return "healthy";
}

export function createProductRoutes(db: HyperIdleDb, _eventBus: EventBus): Hono {
	const router = new Hono();

	// GET / — list all products with portfolio counters
	router.get("/", (c) => {
		const allProducts = db.select().from(products).all();

		const result: ProductListItem[] = allProducts.map((product) => {
			// Fetch the team for this product (may be missing — tolerate gracefully here)
			const team = db.select().from(teams).where(eq(teams.productId, product.id)).get();

			// Count active and shipped bets
			const activeBetCount =
				db
					.select({ count: count() })
					.from(bets)
					.where(
						and(eq(bets.productId, product.id), inArray(bets.status, ["committed", "in_progress"])),
					)
					.get()?.count ?? 0;

			const shippedCount =
				db
					.select({ count: count() })
					.from(bets)
					.where(and(eq(bets.productId, product.id), eq(bets.status, "shipped")))
					.get()?.count ?? 0;

			// Ship rate = shipped / (shipped + active), expressed as percentage
			const total = shippedCount + activeBetCount;
			const shipRate = total === 0 ? "—" : `${Math.round((shippedCount / total) * 100)}%`;

			// Progress: sum done/total tasks across active bets
			const activeBetRows = db
				.select({ id: bets.id })
				.from(bets)
				.where(
					and(eq(bets.productId, product.id), inArray(bets.status, ["committed", "in_progress"])),
				)
				.all();

			let progressDone = 0;
			let progressTotal = 0;
			for (const bet of activeBetRows) {
				const taskRows = db
					.select({ state: tasks.state })
					.from(tasks)
					.where(eq(tasks.betId, bet.id))
					.all();
				progressTotal += taskRows.length;
				progressDone += taskRows.filter((t) => t.state === "done").length;
			}

			const leadAgentId = team?.leadAgentId ?? null;
			const status = team
				? deriveProductStatus(
						{
							activeBets: team.activeBets,
							capacity: team.capacity,
							costActual: team.costActual ?? null,
							costCap: team.costCap ?? null,
						},
						false,
					)
				: ("healthy" as const);

			return {
				id: product.id,
				name: product.name,
				phase: product.phase,
				status,
				leadAgentId,
				activeBets: activeBetCount,
				shipped: shippedCount,
				shipRate,
				progress: { done: progressDone, total: progressTotal },
			};
		});

		return c.json({ products: result });
	});

	// GET /:productId — full ProductDetail
	router.get("/:productId", (c) => {
		const productId = c.req.param("productId");

		// 1. Look up the product
		const product = db.select().from(products).where(eq(products.id, productId)).get();
		if (!product) {
			return c.json({ error: "Product not found", code: "not_found" }, 404);
		}

		// 2. Load the team (enforces 1:1 invariant — throws ApiError(500) if broken)
		try {
			const teamRow = loadProductTeam(db, productId);
			// 3. Load roster
			const agentRows = db.select().from(agents).where(eq(agents.teamId, teamRow.id)).all();

			const roster: RosterMember[] = agentRows.map((agent) => ({
				agentId: agent.id,
				name: agent.name,
				role: agent.role,
				isLead: agent.id === teamRow.leadAgentId,
			}));

			// Lead first, then by name asc
			roster.sort((a, b) => {
				if (a.isLead && !b.isLead) return -1;
				if (b.isLead && !a.isLead) return 1;
				return a.name.localeCompare(b.name);
			});

			// 4. Load active bets
			const activeBetRows = db
				.select()
				.from(bets)
				.where(
					and(eq(bets.productId, productId), inArray(bets.status, ["committed", "in_progress"])),
				)
				.all();

			// 5. Per active bet, count tasks done/total
			let hasBlockedTask = false;
			const activeBets: BetCardSummary[] = activeBetRows.map((bet) => {
				const taskRows = db
					.select({ state: tasks.state })
					.from(tasks)
					.where(eq(tasks.betId, bet.id))
					.all();

				const progressTotal = taskRows.length;
				const progressDone = taskRows.filter((t) => t.state === "done").length;
				if (taskRows.some((t) => t.state === "blocked")) hasBlockedTask = true;

				return {
					id: bet.id,
					pitchTitle: derivePitchTitle(bet.pitch, bet.id),
					appetite: bet.appetite,
					status: bet.status as "committed" | "in_progress",
					progressDone,
					progressTotal,
				};
			});

			// Sort bets by createdAt desc
			activeBets.sort((a, b) => {
				const aRow = activeBetRows.find((r) => r.id === a.id);
				const bRow = activeBetRows.find((r) => r.id === b.id);
				if (!(aRow && bRow)) return 0;
				return bRow.createdAt.localeCompare(aRow.createdAt);
			});

			// 6. Derive product status
			const productStatus = deriveProductStatus(
				{
					activeBets: teamRow.activeBets,
					capacity: teamRow.capacity,
					costActual: teamRow.costActual ?? null,
					costCap: teamRow.costCap ?? null,
				},
				hasBlockedTask,
			);

			const detail: ProductDetail = {
				product: {
					id: product.id,
					name: product.name,
					phase: product.phase,
					status: productStatus,
					leadAgentId: teamRow.leadAgentId ?? null,
				},
				team: {
					id: teamRow.id,
					formedAt: teamRow.formedAt,
					dissolvedAt: teamRow.dissolvedAt ?? null,
				},
				roster,
				burn: {
					costActual: teamRow.costActual ?? 0,
					costCap: teamRow.costCap ?? null,
					capacity: teamRow.capacity,
					activeBets: teamRow.activeBets,
				},
				activeBets,
			};

			return c.json(detail);
		} catch (err) {
			if (err instanceof ApiError) {
				return c.json({ error: err.message, code: err.code }, err.status as 500);
			}
			throw err;
		}
	});

	return router;
}
