/**
 * /api/org routes: OrgChart API (UI) + seam routes for CoreApiPort (teams,
 * scaffold, routines, review-recipients).
 *
 * GET  /api/org/               — full org chart (edges + users + teams)
 * PUT  /api/org/edges          — upsert an edge (idempotent)
 * DELETE /api/org/edges/:id    — delete an edge
 *
 * @lore AU43 bundle-11: org-chart routes were removed by mistake — the door
 * audit marked rows 96/97/98 as KEEP because SettingsOrgChart calls them.
 * Restored here. GET /review-recipients uses the new team-scoped mechanism
 * per AU20 ruling 1 (not org edges).
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import { API_ERROR_CODES, ORG_EDGE_MECHANISMS } from "@hyperidle/domain-model";
import { type HyperIdleEnv, validateBody } from "@hyperidle/domain-model/http";
import {
	createTeam,
	deleteOrgEdge,
	getTeam,
	listOrgEdges,
	listTeams,
	persistScaffoldedAgents,
	resolveAgentScaffoldSpecs,
	resolveReviewRecipients,
	upsertOrgEdge,
} from "@hyperidle/org";
import { findUser, insertUser, listUsers } from "@hyperidle/users";
import { Hono } from "hono";
import z from "zod";
import { buildSeamBackedAgentRunConfigWriter } from "../services/agent-orchestration-port-composition.js";

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
	agentCategory: z.enum(["team", "individual"]),
	systemPrompt: z.string().nullable(),
	idHint: z.string().optional(),
});

const persistScaffoldedAgentsSchema = z.object({
	teamMembersId: z.string().nullable(),
	specs: z.array(scaffoldSpecSchema).min(1),
});

/**
 * @lore AU44 AU20-fd: backs `CoreApiOrgPort.scaffoldFromRequest` — widens the
 * scaffold seam so agent-orchestration passes the request instead of pre-resolved
 * specs. Core-api resolves via `resolveAgentScaffoldSpecs` then persists.
 */
const scaffoldFromRequestSchema = z.object({
	teamMembersId: z.string().nullable(),
	trigger: z.enum(["team_scaffold", "agent_added", "user_assistant"]),
	teamName: z.string().nullable(),
	functions: z.array(z.string()).nullable(),
	role: z.string().nullable(),
	name: z.string().nullable(),
	ownerUserId: z.string().nullable(),
	ownerUserName: z.string().nullable(),
	systemPromptOverride: z.string().optional(),
});

/**
 * Create Hono routes for the OrgChart API.
 */
export function createOrgRoutes(
	db: HyperIdleDb,
	agentOrchestration: AgentOrchestrationPort,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET / — full org chart
	// AF15 AC-6: includes teams: {id, name, teamActualId}[] so the UI can populate
	// the team-edge target select without a separate fetch.
	router.get("/", async (c) => {
		const edges = await listOrgEdges(db);
		const allUsers = await listUsers(db);
		// @lore AU44 B1: listTeamMembers folded into listTeams; id = teamActualId after fold.
		// Org chart shows only active teams (not archived/dissolved).
		const allTeams = await listTeams(db);
		const teamRows = allTeams
			.filter((t) => t.phase !== "archived")
			.map((t) => ({ id: t.id, name: t.name, teamActualId: t.id }));

		// @lore AU20/Am11: project only {id,kind,name,role} — must not leak email/
		// systemPrompt/model columns on a public-data endpoint.
		const userSummaries = allUsers.map((u) => ({
			id: u.id,
			kind: u.kind,
			name: u.name,
			role: u.role,
		}));
		return c.json({ edges, users: userSummaries, teams: teamRows });
	});

	// PUT /edges — upsert an edge (idempotent on fromUserId+mechanism+target)
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

		const fromUser = await findUser(db, { id: fromUserId });
		if (!fromUser) {
			return c.json(
				{ error: `fromUserId not found: ${fromUserId}`, code: "VALIDATION_ERROR" },
				400,
			);
		}

		if (mechanism === "direct") {
			const targetUser = await findUser(db, { id: target });
			if (!targetUser) {
				return c.json(
					{ error: `target userId not found: ${target}`, code: "VALIDATION_ERROR" },
					400,
				);
			}
		} else if (mechanism === "function") {
			if (!target || target.trim().length === 0) {
				return c.json(
					{ error: "target role must be a non-empty string", code: "VALIDATION_ERROR" },
					400,
				);
			}
		} else if (mechanism === "team") {
			const targetTeam = await getTeam(db, { id: target });
			if (!targetTeam) {
				return c.json(
					{ error: `target teamId not found: ${target}`, code: "VALIDATION_ERROR" },
					400,
				);
			}
		}

		const { edge, created } = await upsertOrgEdge(db, { fromUserId, mechanism, target });
		return c.json(edge, created ? 201 : 200);
	});

	// DELETE /edges/:id — delete an edge
	router.delete("/edges/:id", async (c) => {
		const id = c.req.param("id");
		const [existing] = await listOrgEdges(db, { id });
		if (!existing) {
			return c.json({ error: "Edge not found", code: "NOT_FOUND" }, 404);
		}
		await deleteOrgEdge(db, id);
		return c.body(null, 204);
	});

	// GET /review-recipients — team-scoped recipient resolution for review/escalation
	// items (AU20 ruling 1 + seam repair). Query params: teamId (optional),
	// userId and agentRole are accepted for backward-compat but no longer drive
	// the result (the edge matrix that used them is gone).
	//
	// New algorithm: humans on the agent's team (via teamId); fallback = all humans
	// so every review still reaches someone on a single-team or cross-team org.
	router.get("/review-recipients", async (c) => {
		const teamId = c.req.query("teamId") ?? undefined;
		// userId and agentRole accepted for backward-compat but not used (AU44 B1 simplification).

		const recipients = await resolveReviewRecipients(
			db,
			{ teamId },
			{
				listHumans: (db2, tid) =>
					listUsers(db2, { kind: "human", ...(tid !== undefined ? { teamIds: [tid] } : {}) }),
			},
		);
		return c.json({ recipients });
	});

	// GET /teams/:teamId — narrow team view {id, name} for the CoreApiPort seam
	// (AU21 §9 Increment 2). Distinct from `GET /teams/:teamId` (top-level
	// `teams-routes.ts`), which builds a heavy enriched TeamDetail.
	router.get("/teams/:teamId", async (c) => {
		const teamId = c.req.param("teamId");
		const team = await getTeam(db, { id: teamId });
		if (!team) {
			return c.json({ error: "Team not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.json({ id: team.id, name: team.name });
	});

	// GET /teams/:teamId/membership — after AU44 B1 fold, teamId IS the membership id.
	router.get("/teams/:teamId/membership", async (c) => {
		const teamId = c.req.param("teamId");
		const team = await getTeam(db, { id: teamId });
		if (!team) {
			return c.json(
				{ error: "Team membership group not found", code: API_ERROR_CODES.NOT_FOUND },
				404,
			);
		}
		return c.json({ id: team.id });
	});

	// GET /team-members/:teamMembersId — AU44 B1: teamMembersId IS teams.id after fold.
	router.get("/team-members/:teamMembersId", async (c) => {
		const teamMembersId = c.req.param("teamMembersId");
		const team = await getTeam(db, { id: teamMembersId });
		if (!team) {
			return c.json(
				{ error: "Team membership group not found", code: API_ERROR_CODES.NOT_FOUND },
				404,
			);
		}
		// After fold, teamMembersId = teams.id — return the same id as teamId for backward compat.
		return c.json({ teamId: team.id });
	});

	// POST /teams — the atomic `teams`+`teamMembers` insert ONLY (never the
	// heavier `POST /teams` UI flow, which also scaffolds the default agent
	// roster + provisions routines + writes an org edge + drafts a welcome
	// message — reusing that here would DOUBLE the scaffold/provision work
	// `create_team`'s tool handler already performs itself immediately after).
	router.post("/teams", validateBody(createOrgTeamSchema), async (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createOrgTeamSchema>;
		await createTeam(db, body);
		return c.json({ id: body.id, teamMembersId: body.teamMembersId }, 201);
	});

	// POST /scaffolded-agents — the collapsed Kernel-persist helper
	// (`persistScaffoldedAgents`). Even `POST /teams` calls the underlying
	// function directly in-process, never via HTTP — no UI route exists to
	// reuse.
	router.post("/scaffolded-agents", validateBody(persistScaffoldedAgentsSchema), async (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof persistScaffoldedAgentsSchema>;
		const result = await persistScaffoldedAgents(
			db,
			{
				getUserById: (db2, id) => findUser(db2, { id }),
				insertUser,
				// AU31 §2.2/§3 clause 2: the injected writer used to be a direct
				// @hyperidle/run-orchestration import (crossing-di) — now the
				// seam-backed adapter.
				...buildSeamBackedAgentRunConfigWriter(agentOrchestration),
			},
			body.teamMembersId,
			body.specs,
		);
		return c.json(result, 201);
	});

	// POST /scaffold-request — resolve-then-persist seam for agent-orchestration.
	// Accepts a scaffold request (trigger + params), resolves specs via
	// `resolveAgentScaffoldSpecs`, and persists via `persistScaffoldedAgents`.
	// Replaces the old two-step (orchestration resolves specs, then calls
	// /scaffolded-agents) so resolution stays in the owning service.
	// @lore AU44 AU20-fd: `framework/factory-defaults` dissolution — the seam
	// is widened here instead of exposing resolve to orchestration.
	router.post("/scaffold-request", validateBody(scaffoldFromRequestSchema), async (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof scaffoldFromRequestSchema>;
		const resolved = resolveAgentScaffoldSpecs({
			trigger: body.trigger,
			teamName: body.teamName,
			functions: body.functions,
			role: body.role,
			name: body.name,
			ownerUserId: body.ownerUserId,
			ownerUserName: body.ownerUserName,
		});
		const specs =
			body.systemPromptOverride !== undefined
				? resolved.map((s) => ({ ...s, systemPrompt: body.systemPromptOverride ?? null }))
				: resolved;
		const result = await persistScaffoldedAgents(
			db,
			{
				getUserById: (db2, id) => findUser(db2, { id }),
				insertUser,
				...buildSeamBackedAgentRunConfigWriter(agentOrchestration),
			},
			body.teamMembersId,
			specs,
		);
		return c.json(result, 201);
	});

	return router;
}
