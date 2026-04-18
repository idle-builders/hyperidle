import { type HyperIdleDb, agents, factorySettings, sessions } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { getDailyDigest } from "../services/daily-digest.js";

const updateSettingSchema = z.object({
	key: z.string().min(1),
	value: z.string(),
});

const SERVER_START_TIME = new Date().toISOString();

/**
 * Create Hono routes for status and settings endpoints (E6).
 */
export function createStatusRoutes(db: HyperIdleDb): Hono {
	const router = new Hono();

	// GET /health — Authenticated status probe. Distinct from the public
	// `/api/health` (liveness) — this route sits behind the auth middleware
	// and is the canonical "status/health" endpoint referenced by I1 S1.
	router.get("/health", (c) => {
		return c.json({ status: "ok", timestamp: new Date().toISOString() });
	});

	// GET / — Factory-wide status
	router.get("/", (c) => {
		const activeSessions = db.select().from(sessions).where(eq(sessions.state, "active")).all();

		const allAgents = db.select().from(agents).all();

		const agentStates: Record<string, number> = {};
		for (const agent of allAgents) {
			agentStates[agent.status] = (agentStates[agent.status] ?? 0) + 1;
		}

		const totalCost = allAgents.reduce((sum, a) => sum + (a.costActual ?? 0), 0);

		// Get uptime from factory settings, fallback to server start time
		const uptimeSetting = db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, "factory_start_time"))
			.get();

		const uptime = uptimeSetting?.value ?? SERVER_START_TIME;

		return c.json({
			activeSessions: activeSessions.length,
			agentStates,
			totalCost,
			uptime,
		});
	});

	// GET /settings — List all factory settings
	router.get("/settings", (c) => {
		const allSettings = db.select().from(factorySettings).all();
		return c.json(allSettings);
	});

	// PATCH /settings — Update a factory setting
	router.patch("/settings", validateBody(updateSettingSchema), (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof updateSettingSchema>;
		const now = new Date().toISOString();

		db.insert(factorySettings)
			.values({
				key: body.key,
				value: body.value,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: factorySettings.key,
				set: { value: body.value, updatedAt: now },
			})
			.run();

		const updated = db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, body.key))
			.get();

		return c.json(updated);
	});

	// GET /digest — Daily digest of queued items from past 24h
	router.get("/digest", (c) => {
		const digest = getDailyDigest(db);
		return c.json(digest);
	});

	return router;
}
