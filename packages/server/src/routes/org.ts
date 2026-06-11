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
import { type HyperIdleDb, orgEdges, teamMembers, teams, users } from "@hyperidle/db";
import { ORG_EDGE_MECHANISMS } from "@hyperidle/shared";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
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
	// AF15 AC-6: Extends response with teams: {id, name}[] (teamMembers.id, teams.name)
	// so the UI can populate the team-edge target select without a separate fetch.
	// id = teamMembers.id (what PUT /edges validates for mechanism:"team").
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const edges = await db.select().from(orgEdges);
		const allUsers = await db
			.select({
				id: users.id,
				kind: users.kind,
				name: users.name,
				role: users.role,
			})
			.from(users);

		// AF15: Include non-dissolved teamMembers rows joined to teams.name.
		// @lore AF15: teamMembers.id is the correct target for mechanism:"team" edges
		// (org.ts line 106 validates target against teamMembers.id, not teams.id).
		// The UI shows teams.name as the label but submits teamMembers.id as value.
		const teamRows = await db
			.select({ id: teamMembers.id, name: teams.name })
			.from(teamMembers)
			.innerJoin(teams, eq(teams.id, teamMembers.teamId))
			.where(isNull(teamMembers.dissolvedAt));

		return c.json({ edges, users: allUsers, teams: teamRows });
	});

	// PUT /edges — upsert an edge
	router.put("/edges", requireBoundary({ kind: "public-data" }), async (c) => {
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
		const [fromUser] = await db.select().from(users).where(eq(users.id, fromUserId)).limit(1);
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
			const [targetUser] = await db.select().from(users).where(eq(users.id, target)).limit(1);
			if (!targetUser) {
				return c.json(
					{ error: `target userId not found: ${target}`, code: "VALIDATION_ERROR" },
					400,
				);
			}
		} else if (mechanism === "function") {
			// AB0: roles are open strings — any non-empty string is valid.
			// Validated by putOrgEdgeSchema (z.string().min(1)) at the route level.
			if (!target || target.trim().length === 0) {
				return c.json(
					{
						error: "target role must be a non-empty string",
						code: "VALIDATION_ERROR",
					},
					400,
				);
			}
		} else if (mechanism === "team") {
			// @lore U1: `mechanism: "team"` targets a teamMembers row (agent membership group).
			const [targetTeam] = await db
				.select()
				.from(teamMembers)
				.where(eq(teamMembers.id, target))
				.limit(1);
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
		const [existing] = await db
			.select()
			.from(orgEdges)
			.where(
				and(
					eq(orgEdges.fromUserId, fromUserId),
					eq(orgEdges.mechanism, mechanism),
					eq(orgEdges.target, target),
				),
			)
			.limit(1);

		if (existing) {
			// Upsert: return existing edge with 200
			return c.json(existing, 200);
		}

		// Create new edge
		const id = crypto.randomUUID();
		const createdAt = new Date().toISOString();

		await db.insert(orgEdges).values({ id, fromUserId, mechanism, target, createdAt });

		const [created] = await db.select().from(orgEdges).where(eq(orgEdges.id, id)).limit(1);
		return c.json(created, 201);
	});

	// DELETE /edges/:id — delete an edge
	router.delete("/edges/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const id = c.req.param("id");

		const [existing] = await db.select().from(orgEdges).where(eq(orgEdges.id, id)).limit(1);
		if (!existing) {
			return c.json({ error: "Edge not found", code: "NOT_FOUND" }, 404);
		}

		await db.delete(orgEdges).where(eq(orgEdges.id, id));
		return c.body(null, 204);
	});

	return router;
}
