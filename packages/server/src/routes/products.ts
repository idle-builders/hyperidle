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

import { bets, type HyperIdleDb, products, tasks, teams, users } from "@hyperidle/db";
import type {
	BetCardSummary,
	CreateProductRequest,
	CreateProductResponse,
	CurrencyCode,
	EventBus,
	ProductDetail,
	ProductListItem,
	RosterMember,
	WireMoney,
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
 *
 * L17: compares minor-unit values (costCapMinor prefers over legacy costCap).
 */
function deriveProductStatus(
	team: {
		activeBets: number;
		capacity: number;
		costActualMinor: number | null;
		costCapMinor: number | null;
	},
	hasBlockedTask: boolean,
): "healthy" | "behind" | "blocked" {
	if (hasBlockedTask) return "blocked";
	const costActual = team.costActualMinor ?? 0;
	const overCapacity = team.activeBets > team.capacity;
	const overBudget = team.costCapMinor !== null && costActual >= team.costCapMinor;
	if (overCapacity || overBudget) return "behind";
	return "healthy";
}

/**
 * Build a WireMoney from minor units + currency, or null if minor is null/undefined.
 */
function toWireMoney(
	minor: number | null | undefined,
	currency: string | null | undefined,
): WireMoney | null {
	if (minor == null) return null;
	return { minor, currency: (currency ?? "USD") as CurrencyCode };
}

export function createProductRoutes(db: HyperIdleDb, _eventBus: EventBus): Hono {
	const router = new Hono();

	// GET / — list all products with portfolio counters
	router.get("/", async (c) => {
		const allProducts = await db.select().from(products);

		const result: ProductListItem[] = await Promise.all(
			allProducts.map(async (product) => {
				// Fetch the team for this product (may be missing — tolerate gracefully here)
				const [team] = await db
					.select()
					.from(teams)
					.where(eq(teams.productId, product.id))
					.limit(1);

				// Count active and shipped bets
				const [activeBetCountRow] = await db
					.select({ count: count() })
					.from(bets)
					.where(
						and(
							eq(bets.productId, product.id),
							inArray(bets.status, ["committed", "in_progress"]),
						),
					)
					.limit(1);
				const activeBetCount = activeBetCountRow?.count ?? 0;

				const [shippedCountRow] = await db
					.select({ count: count() })
					.from(bets)
					.where(and(eq(bets.productId, product.id), eq(bets.status, "shipped")))
					.limit(1);
				const shippedCount = shippedCountRow?.count ?? 0;

				// Ship rate = shipped / (shipped + active), expressed as percentage
				const total = shippedCount + activeBetCount;
				const shipRate = total === 0 ? "—" : `${Math.round((shippedCount / total) * 100)}%`;

				// Progress: sum done/total tasks across active bets
				const activeBetRows = await db
					.select({ id: bets.id })
					.from(bets)
					.where(
						and(
							eq(bets.productId, product.id),
							inArray(bets.status, ["committed", "in_progress"]),
						),
					);

				let progressDone = 0;
				let progressTotal = 0;
				for (const bet of activeBetRows) {
					const taskRows = await db
						.select({ state: tasks.state })
						.from(tasks)
						.where(eq(tasks.betId, bet.id));
					progressTotal += taskRows.length;
					progressDone += taskRows.filter((t) => t.state === "done").length;
				}

				const leadAgentId = team?.leadAgentId ?? null;
				const status = team
					? deriveProductStatus(
							{
								activeBets: team.activeBets,
								capacity: team.capacity,
								// L17: prefer costCapMinor over legacy costCap
								costActualMinor: null, // list route doesn't compute actual spend
								costCapMinor: team.costCapMinor ?? team.costCap ?? null,
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
			}),
		);

		return c.json({ products: result });
	});

	// POST / — create a new product with a team and default agents
	router.post("/", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "validation_error" }, 400);
		}

		const { name, repoPath } = body as CreateProductRequest;
		if (!name || typeof name !== "string" || name.trim().length === 0) {
			return c.json({ error: "name is required", code: "validation_error" }, 400);
		}

		const now = new Date().toISOString();
		const productId = `product-${crypto.randomUUID()}`;
		const teamId = `team-${crypto.randomUUID()}`;
		const builderId = `agent-builder-${crypto.randomUUID()}`;
		const pmId = `agent-pm-${crypto.randomUUID()}`;

		await db.insert(products).values({
			id: productId,
			name: name.trim(),
			phase: "build",
			factoryDbPath: typeof repoPath === "string" ? repoPath.trim() || null : null,
			createdAt: now,
		});

		await db.insert(teams).values({
			id: teamId,
			productId,
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		});

		await db.insert(users).values({
			id: builderId,
			kind: "ai",
			name: `${name.trim()} Builder`,
			role: "builder",
			status: "active",
			maxConcurrentSessions: 3,
			teamId,
			createdAt: now,
		});

		await db.insert(users).values({
			id: pmId,
			kind: "ai",
			name: `${name.trim()} Product Manager`,
			role: "product_manager",
			status: "active",
			maxConcurrentSessions: 1,
			teamId,
			createdAt: now,
		});

		await db.update(teams).set({ leadAgentId: builderId }).where(eq(teams.id, teamId));

		const result: CreateProductResponse = {
			product: { id: productId, name: name.trim(), phase: "build" },
			team: { id: teamId },
		};

		return c.json(result, 201);
	});

	// PATCH /:productId — update product phase (active ↔ archived)
	// P4 AC-18: SettingsProducts needs to toggle product active/archived state.
	router.patch("/:productId", async (c) => {
		const productId = c.req.param("productId");

		const [product] = await db
			.select()
			.from(products)
			.where(eq(products.id, productId))
			.limit(1);
		if (!product) {
			return c.json({ error: "Product not found", code: "not_found" }, 404);
		}

		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "validation_error" }, 400);
		}

		const { phase } = body as { phase?: string };
		const VALID_PHASES = ["build", "live", "archived"] as const;
		type ProductPhase = (typeof VALID_PHASES)[number];
		if (!(phase && (VALID_PHASES as readonly string[]).includes(phase))) {
			return c.json(
				{ error: `phase must be one of: ${VALID_PHASES.join(", ")}`, code: "validation_error" },
				400,
			);
		}

		await db
			.update(products)
			.set({ phase: phase as ProductPhase })
			.where(eq(products.id, productId));

		const [updated] = await db
			.select()
			.from(products)
			.where(eq(products.id, productId))
			.limit(1);
		if (!updated) {
			return c.json({ error: "Product not found after update", code: "internal_error" }, 500);
		}
		return c.json({ id: updated.id, name: updated.name, phase: updated.phase });
	});

	// GET /:productId — full ProductDetail
	router.get("/:productId", async (c) => {
		const productId = c.req.param("productId");

		// 1. Look up the product
		const [product] = await db
			.select()
			.from(products)
			.where(eq(products.id, productId))
			.limit(1);
		if (!product) {
			return c.json({ error: "Product not found", code: "not_found" }, 404);
		}

		// 2. Load the team (enforces 1:1 invariant — throws ApiError(500) if broken)
		try {
			const teamRow = await loadProductTeam(db, productId);
			// 3. Load roster
			const agentRows = await db.select().from(users).where(eq(users.teamId, teamRow.id));

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
			const activeBetRows = await db
				.select()
				.from(bets)
				.where(
					and(eq(bets.productId, productId), inArray(bets.status, ["committed", "in_progress"])),
				);

			// 5. Per active bet, count tasks done/total
			let hasBlockedTask = false;
			const activeBets: BetCardSummary[] = await Promise.all(
				activeBetRows.map(async (bet) => {
					const taskRows = await db
						.select({ state: tasks.state })
						.from(tasks)
						.where(eq(tasks.betId, bet.id));

					const progressTotal = taskRows.length;
					const progressDone = taskRows.filter((t) => t.state === "done").length;
					if (taskRows.some((t) => t.state === "blocked")) hasBlockedTask = true;

					return {
						id: bet.id,
						pitchTitle: derivePitchTitle(bet.pitch, bet.id),
						// L17: costAppetite as WireMoney (replaces appetite duration string)
						costAppetite: toWireMoney(bet.costAppetiteMinor, bet.costAppetiteCurrency),
						status: bet.status as "committed" | "in_progress",
						progressDone,
						progressTotal,
					};
				}),
			);

			// Sort bets by createdAt desc
			activeBets.sort((a, b) => {
				const aRow = activeBetRows.find((r) => r.id === a.id);
				const bRow = activeBetRows.find((r) => r.id === b.id);
				if (!(aRow && bRow)) return 0;
				return bRow.createdAt.localeCompare(aRow.createdAt);
			});

			// 6. Derive product status
			// L17: prefer costCapMinor over legacy costCap
			const teamCostCapMinor = teamRow.costCapMinor ?? teamRow.costCap ?? null;
			// Compute team actual spend from sessions (via legacy costActual for now)
			const teamCostActualMinor = teamRow.costActual ?? null;
			const productStatus = deriveProductStatus(
				{
					activeBets: teamRow.activeBets,
					capacity: teamRow.capacity,
					costActualMinor: teamCostActualMinor,
					costCapMinor: teamCostCapMinor,
				},
				hasBlockedTask,
			);

			// L17: currency for the team defaults to costCapCurrency or "USD"
			const teamCurrency = teamRow.costCapCurrency ?? "USD";

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
					// L17: return WireMoney|null instead of raw numbers
					costActual:
						teamCostActualMinor != null
							? { minor: teamCostActualMinor, currency: teamCurrency as CurrencyCode }
							: null,
					costCap: toWireMoney(teamCostCapMinor, teamCurrency),
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
