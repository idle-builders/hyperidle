import { type HyperIdleDb, bets, tasks, teams } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { transitionBet, updateBetField } from "../services/bet-state-machine.js";

/**
 * Zod schemas for request validation.
 */
const createBetSchema = z.object({
	productId: z.string(),
	teamId: z.string(),
	pitch: z.string(),
	appetite: z.string(),
	doneCondition: z.string().optional(),
	hypothesis: z.string().optional(),
});

const updateBetSchema = z.object({
	field: z.string(),
	value: z.string(),
	reason: z.string(),
});

const killBetSchema = z.object({
	reason: z.string().min(1),
});

/**
 * Create Hono routes for bet endpoints.
 * Requires db and eventBus to be set in context via middleware.
 */
export function createBetRoutes(db: HyperIdleDb, eventBus: EventBus): Hono {
	const router = new Hono();

	// GET /bets — list all bets grouped by status
	router.get("/", (c) => {
		const allBets = db.select().from(bets).all();

		const grouped = {
			shaped: allBets.filter((b) => b.status === "shaped"),
			committed: allBets.filter((b) => b.status === "committed"),
			in_progress: allBets.filter((b) => b.status === "in_progress"),
			shipped: allBets.filter((b) => b.status === "shipped"),
			killed: allBets.filter((b) => b.status === "killed"),
		};

		return c.json(grouped);
	});

	// GET /bets/canvas — canvas data: shaped, committed, capacity info
	router.get("/canvas", (c) => {
		const allBets = db.select().from(bets).all();
		const allTeams = db.select().from(teams).all();

		const totalCapacity = allTeams.reduce((sum, t) => sum + t.capacity, 0);
		const totalUsed = allTeams.reduce((sum, t) => sum + t.activeBets, 0);

		const canvas = {
			shaped: allBets.filter((b) => b.status === "shaped"),
			committed: allBets.filter((b) => b.status === "committed"),
			capacity: {
				used: totalUsed,
				max: totalCapacity,
			},
		};

		return c.json(canvas);
	});

	// GET /bets/:id — bet detail with tasks
	router.get("/:id", (c) => {
		const betId = c.req.param("id");
		const bet = db.select().from(bets).where(eq(bets.id, betId)).get();

		if (!bet) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}

		const betTasks = db.select().from(tasks).where(eq(tasks.betId, betId)).all();

		return c.json({ ...bet, tasks: betTasks });
	});

	// POST /bets — create shaped bet
	router.post("/", validateBody(createBetSchema), (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createBetSchema>;
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		db.insert(bets)
			.values({
				id,
				productId: body.productId,
				teamId: body.teamId,
				pitch: body.pitch,
				appetite: body.appetite,
				doneCondition: body.doneCondition ?? null,
				hypothesis: body.hypothesis ?? null,
				status: "shaped",
				createdAt: now,
			})
			.run();

		const created = db.select().from(bets).where(eq(bets.id, id)).get();
		return c.json(created, 201);
	});

	// PATCH /bets/:id — update mutable fields (in_progress only)
	router.patch("/:id", validateBody(updateBetSchema), async (c) => {
		const betId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof updateBetSchema>;

		await updateBetField(db, eventBus, betId, body.field, body.value, body.reason);

		const updated = db.select().from(bets).where(eq(bets.id, betId)).get();
		return c.json(updated);
	});

	// POST /bets/:id/commit — transition shaped→committed
	router.post("/:id/commit", async (c) => {
		const betId = c.req.param("id");
		await transitionBet(db, eventBus, betId, "committed");
		const updated = db.select().from(bets).where(eq(bets.id, betId)).get();
		return c.json(updated);
	});

	// POST /bets/:id/ship — transition in_progress→shipped
	router.post("/:id/ship", async (c) => {
		const betId = c.req.param("id");
		await transitionBet(db, eventBus, betId, "shipped");
		const updated = db.select().from(bets).where(eq(bets.id, betId)).get();
		return c.json(updated);
	});

	// POST /bets/:id/kill — kill with reason (required)
	router.post("/:id/kill", validateBody(killBetSchema), async (c) => {
		const betId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof killBetSchema>;
		await transitionBet(db, eventBus, betId, "killed", { reason: body.reason });
		const updated = db.select().from(bets).where(eq(bets.id, betId)).get();
		return c.json(updated);
	});

	return router;
}
