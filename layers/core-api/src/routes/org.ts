/**
 * /api/org routes: seam routes for CoreApiPort (teams, scaffold, routines).
 *
 * @lore AU43 bundle-11: org-chart routes (GET /, PUT /edges, DELETE /edges/:id,
 * GET /review-recipients) removed with the org-edges feature. Remaining routes
 * are seam-only helpers for the CoreApiPort (create_team tool flow).
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import { type HyperIdleEnv, requireBoundary, validateBody } from "@hyperidle/http-middleware";
import { createTeam, getTeam, getTeamMembers, persistScaffoldedAgents } from "@hyperidle/org";
import { provisionTeamRoutines } from "@hyperidle/routine";
import { findUser, insertUser } from "@hyperidle/users";
import { Hono } from "hono";
import z from "zod";
import { buildSeamBackedAgentRunConfigWriter } from "../services/agent-orchestration-port-composition.js";

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
 * @lore AU21 §9 Increment 9 (forensic-triage wave, second pass): backs
 * `CoreApiOrgPort.provisionTeamRoutines` — `create_team`'s tool handler's
 * last remaining non-seam step (see `core-api-port.ts`'s own doc comment on
 * `CoreApiOrgPort` for the full reasoning). No 1:1 UI route (same shape as
 * `scaffoldedAgentsSchema` above) — `provisionTeamRoutines` is a step INSIDE
 * `POST /teams`'s heavier UI flow (`teams-routes.ts`), not itself a route;
 * this is a new, narrowly-scoped route built specifically for the seam.
 */
const provisionTeamRoutinesSchema = z.object({
	teamId: z.string().min(1),
	ownerByRole: z.record(z.string(), z.string().optional()),
	leadAgentId: z.string().min(1),
});

/**
 * Create Hono routes for the OrgChart API.
 */
export function createOrgRoutes(
	db: HyperIdleDb,
	agentOrchestration: AgentOrchestrationPort,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

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
				{
					getUserById: (db2, id) => findUser(db2, { id }),
					insertUser,
					// AU31 §2.2/§3 clause 2: the injected writer used to be a direct
					// @hyperidle/agent-run-config import (crossing-di) — now the
					// seam-backed adapter.
					...buildSeamBackedAgentRunConfigWriter(agentOrchestration),
				},
				body.teamMembersId,
				body.specs,
			);
			return c.json(result, 201);
		},
	);

	// POST /team-routines — seeds the four builtin-routine definitions for a
	// team (`@hyperidle/routine`'s `provisionTeamRoutines`). `teams-routes.ts`'s
	// `POST /teams` calls the underlying function directly in-process (same
	// convention as `scaffolded-agents` above) — this route exists so
	// `create_team`'s tool handler (already routing every other step through
	// this seam) can reach it too, per Decision C.
	router.post(
		"/team-routines",
		requireBoundary({ kind: "public-data" }),
		validateBody(provisionTeamRoutinesSchema),
		async (c) => {
			const body = c.req.valid("json" as never) as z.infer<typeof provisionTeamRoutinesSchema>;
			await provisionTeamRoutines(db, {
				teamId: body.teamId,
				ownerByRole: body.ownerByRole,
				leadAgentId: body.leadAgentId,
			});
			return c.json({}, 201);
		},
	);

	return router;
}
