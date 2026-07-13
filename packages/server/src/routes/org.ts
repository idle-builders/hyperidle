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
import { type HyperIdleDb, orgEdges, teamMembers, teams } from "@hyperidle/db";
import { ORG_EDGE_MECHANISMS } from "@hyperidle/shared";
import { eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { upsertOrgEdge } from "@hyperidle/core-app";
import { getUserById, listUserDirectory } from "@hyperidle/core-app";

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
		const allUsers = await listUserDirectory(db);

		// AF15: Include non-dissolved teamMembers rows joined to teams.name.
		// @lore AF15: teamMembers.id is the correct target for mechanism:"team" edges
		// (org.ts line 106 validates target against teamMembers.id, not teams.id).
		// The UI shows teams.name as the label but submits teamMembers.id as value.
		const teamRows = await db
			// AO1: include teams.id (teamActualId) alongside teamMembers.id so the
			// UI can fetch team-scoped resources (filesystems) that key on teams.id.
			.select({ id: teamMembers.id, name: teams.name, teamActualId: teams.id })
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
		const fromUser = await getUserById(db, fromUserId);
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
			const targetUser = await getUserById(db, target);
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

		// Upsert via shared helper — idempotent on (from_user_id, mechanism, target).
		// @lore AH4: Refactored from SELECT-then-INSERT to upsertOrgEdge (INSERT …
		// ON CONFLICT DO NOTHING + re-select) for TOCTOU safety under concurrent pg Pool.
		// The mechanism-specific target validation above is preserved; upsertOrgEdge
		// trusts that the target has already been validated by the caller.
		const { edge, created } = await upsertOrgEdge(db, { fromUserId, mechanism, target });
		return c.json(edge, created ? 201 : 200);
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
