/**
 * P2 — /api/org routes: OrgChart API.
 *
 * GET  /api/org               — full org chart (all edges + denormalized users)
 * PUT  /api/org/edges         — upsert an edge (create or return existing)
 * DELETE /api/org/edges/:id   — delete an edge
 *
 * @lore P2: The org routes manage the OrgChart primitive. PUT is an upsert:
 * if the (fromUserId, mechanism, target) tuple already exists, returns 200
 * with the existing edge; otherwise creates and returns 201.
 *
 * @lore P2: The GET response includes a `users` array (id/kind/name/role only)
 * as a denormalized convenience so the UI doesn't need a second request to
 * resolve names.
 */

// @lore U1: `teams` renamed to `teamMembers` (membership group); `products` renamed to `teams` (domain entity).
// `mechanism: "team"` targets the agent membership group → check `teamMembers`.
import { type HyperIdleDb, orgEdges, teamMembers, users } from "@hyperidle/db";
import { ORG_EDGE_MECHANISMS, USER_ROLES } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import type { HyperIdleEnv } from "../middleware/auth.js";

const putOrgEdgeSchema = z.object({
	fromUserId: z.string().min(1),
	mechanism: z.enum(ORG_EDGE_MECHANISMS),
	target: z.string().min(1),
});

/**
 * Create Hono routes for the OrgChart API.
 */
export function createOrgRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET / — full org chart
	router.get("/", (c) => {
		const edges = db.select().from(orgEdges).all();
		const allUsers = db
			.select({
				id: users.id,
				kind: users.kind,
				name: users.name,
				role: users.role,
			})
			.from(users)
			.all();

		return c.json({ edges, users: allUsers });
	});

	// PUT /edges — upsert an edge
	router.put("/edges", async (c) => {
		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, 400);
		}

		const parsed = putOrgEdgeSchema.safeParse(rawBody);
		if (!parsed.success) {
			return c.json(
				{ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues },
				400,
			);
		}

		const { fromUserId, mechanism, target } = parsed.data;

		// Check if fromUserId exists in users table
		const fromUser = db.select().from(users).where(eq(users.id, fromUserId)).get();
		if (!fromUser) {
			return c.json(
				{ error: `fromUserId not found: ${fromUserId}`, code: "VALIDATION_ERROR" },
				400,
			);
		}

		// Validate target based on mechanism (plan section 2.3).
		// @lore P2: mechanism-dependent target validation — "direct" targets a userId,
		// "function" targets a UserRole string, "team" targets a teamId. Each has a
		// distinct existence check so stale/garbage targets are rejected at write time.
		if (mechanism === "direct") {
			const targetUser = db.select().from(users).where(eq(users.id, target)).get();
			if (!targetUser) {
				return c.json(
					{ error: `target userId not found: ${target}`, code: "VALIDATION_ERROR" },
					400,
				);
			}
		} else if (mechanism === "function") {
			if (!(USER_ROLES as readonly string[]).includes(target)) {
				return c.json(
					{
						error: `target role not valid: ${target}. Must be one of: ${USER_ROLES.join(", ")}`,
						code: "VALIDATION_ERROR",
					},
					400,
				);
			}
		} else if (mechanism === "team") {
			// @lore U1: `mechanism: "team"` targets a teamMembers row (agent membership group).
			const targetTeam = db.select().from(teamMembers).where(eq(teamMembers.id, target)).get();
			if (!targetTeam) {
				return c.json(
					{ error: `target teamId not found: ${target}`, code: "VALIDATION_ERROR" },
					400,
				);
			}
		}

		// Check if the exact tuple already exists using the composite unique index
		// (from_user_id, mechanism, target) — avoids a full-table scan + JS filter.
		// @lore P2 WARNING-ADV1: replaced the previous .all().find() JS-filter with a
		// 3-column WHERE clause that hits the org_edges_unique composite index directly.
		const existing = db
			.select()
			.from(orgEdges)
			.where(
				and(
					eq(orgEdges.fromUserId, fromUserId),
					eq(orgEdges.mechanism, mechanism),
					eq(orgEdges.target, target),
				),
			)
			.get();

		if (existing) {
			// Upsert: return existing edge with 200
			return c.json(existing, 200);
		}

		// Create new edge
		const id = crypto.randomUUID();
		const createdAt = new Date().toISOString();

		db.insert(orgEdges).values({ id, fromUserId, mechanism, target, createdAt }).run();

		const created = db.select().from(orgEdges).where(eq(orgEdges.id, id)).get();
		return c.json(created, 201);
	});

	// DELETE /edges/:id — delete an edge
	router.delete("/edges/:id", (c) => {
		const id = c.req.param("id");

		const existing = db.select().from(orgEdges).where(eq(orgEdges.id, id)).get();
		if (!existing) {
			return c.json({ error: "Edge not found", code: "NOT_FOUND" }, 404);
		}

		db.delete(orgEdges).where(eq(orgEdges.id, id)).run();
		return c.body(null, 204);
	});

	return router;
}
