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
import type { HyperIdleDb } from "@hyperidle/db";
import {
	createTeam,
	deleteOrgEdge,
	getTeam,
	getTeamMembers,
	listOrgEdges,
	listTeamMembers,
	persistScaffoldedAgents,
	resolveReviewRecipients,
	upsertOrgEdge,
} from "@hyperidle/org";
import { API_ERROR_CODES, ORG_EDGE_MECHANISMS } from "@hyperidle/shared";
import { findUser, insertUser, listUsers } from "@hyperidle/users";
import { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

const putOrgEdgeSchema = z.object({
	fromUserId: z.string().min(1),
	mechanism: z.enum(ORG_EDGE_MECHANISMS),
	target: z.string().min(1),
});

/**
 * AU21 §9 Increment 2 (org/routine/handoff wave) — the `CoreApiPort.org`
 * seam methods' backing routes (`edge-disposition.md`'s `org.{getTeam,
 * getTeamMembers, createTeam, updateTeam}` row plus the two collapsed
 * `tool-handlers`-only helpers). None of these have a 1:1 existing UI route
 * to reuse (the only existing team-detail route, `GET /teams/:teamId` in
 * `teams-routes.ts`, builds a heavy enriched `TeamDetail` and 500s if the
 * `teamMembers` companion is missing — wrong shape/behavior for these narrow
 * reads) — see `core-api-port-increment2-org-routine-handoff.integration.test.ts`'s
 * top-of-file plan comment for the full reuse-vs-new rationale per method.
 */
const createOrgTeamSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	phase: z.string().min(1),
	functions: z.string().nullable(),
	factoryDbPath: z.string().nullable(),
	createdAt: z.string().min(1),
	teamMembersId: z.string().min(1),
	capacity: z.number().int().optional(),
	activeBets: z.number().int().optional(),
	formedAt: z.string().optional(),
});

const scaffoldSpecSchema = z.object({
	role: z.string().min(1),
	name: z.string().min(1),
	agentCategory: z.enum(["team", "strategy", "individual"]),
	systemPrompt: z.string().nullable(),
	idHint: z.string().optional(),
});

const persistScaffoldedAgentsSchema = z.object({
	teamMembersId: z.string().nullable(),
	specs: z.array(scaffoldSpecSchema).min(1),
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
		const edges = await listOrgEdges(db);
		const allUsers = await listUsers(db);

		// AF15: Include non-dissolved teamMembers rows joined to teams.name.
		// @lore AF15: teamMembers.id is the correct target for mechanism:"team" edges
		// (org.ts line 106 validates target against teamMembers.id, not teams.id).
		// The UI shows teams.name as the label but submits teamMembers.id as value.
		// AO1: teamActualId (teams.id) lets the UI fetch team-scoped resources
		// (filesystems) that key on teams.id.
		const teamRows = await listTeamMembers(db, { active: true, withTeamName: true });

		// @lore AU20/Am11: project only {id,kind,name,role} — listUsers returns full rows
		// but this public-data endpoint must not leak email/systemPrompt/cost/model columns.
		// Matches the pre-collapse listUserDirectory projection exactly.
		const userSummaries = allUsers.map((u) => ({
			id: u.id,
			kind: u.kind,
			name: u.name,
			role: u.role,
		}));
		return c.json({ edges, users: userSummaries, teams: teamRows });
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
		const fromUser = await findUser(db, { id: fromUserId });
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
			const targetUser = await findUser(db, { id: target });
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
			const targetTeam = await getTeamMembers(db, { id: target });
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

		const [existing] = await listOrgEdges(db, { id });
		if (!existing) {
			return c.json({ error: "Edge not found", code: "NOT_FOUND" }, 404);
		}

		await deleteOrgEdge(db, id);
		return c.body(null, 204);
	});

	// GET /teams/:teamId — narrow team view {id, name} for the CoreApiPort seam
	// (AU21 §9 Increment 2). Distinct from `GET /teams/:teamId` (top-level
	// `teams-routes.ts`), which builds a heavy enriched TeamDetail.
	router.get("/teams/:teamId", requireBoundary({ kind: "public-data" }), async (c) => {
		const teamId = c.req.param("teamId");
		const team = await getTeam(db, { id: teamId });
		if (!team) {
			return c.json({ error: "Team not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.json({ id: team.id, name: team.name });
	});

	// GET /teams/:teamId/membership — the `teamMembers` row keyed by `teams.id`.
	router.get("/teams/:teamId/membership", requireBoundary({ kind: "public-data" }), async (c) => {
		const teamId = c.req.param("teamId");
		const memberGroup = await getTeamMembers(db, { teamId });
		if (!memberGroup) {
			return c.json(
				{ error: "Team membership group not found", code: API_ERROR_CODES.NOT_FOUND },
				404,
			);
		}
		return c.json({ id: memberGroup.id });
	});

	// GET /team-members/:teamMembersId — the AK4 two-hop resolution's second hop
	// (`teamMembers.id` -> `teamId`, i.e. `teams.id`).
	router.get(
		"/team-members/:teamMembersId",
		requireBoundary({ kind: "public-data" }),
		async (c) => {
			const teamMembersId = c.req.param("teamMembersId");
			const memberGroup = await getTeamMembers(db, { id: teamMembersId });
			if (!memberGroup) {
				return c.json(
					{ error: "Team membership group not found", code: API_ERROR_CODES.NOT_FOUND },
					404,
				);
			}
			return c.json({ teamId: memberGroup.teamId });
		},
	);

	// POST /teams — the atomic `teams`+`teamMembers` insert ONLY (never the
	// heavier `POST /teams` UI flow, which also scaffolds the default agent
	// roster + provisions routines + writes an org edge + drafts a welcome
	// message — reusing that here would DOUBLE the scaffold/provision work
	// `create_team`'s tool handler already performs itself immediately after).
	router.post(
		"/teams",
		requireBoundary({ kind: "public-data" }),
		validateBody(createOrgTeamSchema),
		async (c) => {
			const body = c.req.valid("json" as never) as z.infer<typeof createOrgTeamSchema>;
			await createTeam(db, body);
			return c.json({ id: body.id, teamMembersId: body.teamMembersId }, 201);
		},
	);

	// GET /review-recipients — the pure org-edge routing query
	// (`resolveReviewRecipients`). No UI action reaches this directly today.
	router.get("/review-recipients", requireBoundary({ kind: "public-data" }), async (c) => {
		const userId = c.req.query("userId");
		const agentRole = c.req.query("agentRole");
		const teamId = c.req.query("teamId");
		if (!userId) {
			return c.json({ error: "userId is required", code: API_ERROR_CODES.VALIDATION_ERROR }, 400);
		}
		const recipients = await resolveReviewRecipients(
			db,
			{ userId, agentRole, teamId },
			{ listUsersByKind: (db2, kind) => listUsers(db2, { kind }) },
		);
		return c.json({ recipients });
	});

	// POST /scaffolded-agents — the collapsed Kernel-persist helper
	// (`persistScaffoldedAgents`). Even `POST /teams` calls the underlying
	// function directly in-process, never via HTTP — no UI route exists to
	// reuse.
	router.post(
		"/scaffolded-agents",
		requireBoundary({ kind: "public-data" }),
		validateBody(persistScaffoldedAgentsSchema),
		async (c) => {
			const body = c.req.valid("json" as never) as z.infer<typeof persistScaffoldedAgentsSchema>;
			const result = await persistScaffoldedAgents(
				db,
				{ getUserById: (db2, id) => findUser(db2, { id }), insertUser },
				body.teamMembersId,
				body.specs,
			);
			return c.json(result, 201);
		},
	);

	return router;
}
