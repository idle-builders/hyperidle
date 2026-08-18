/**
 * AU26 F2 — the ONE `/api/filesystems` registration that stays core-hosted.
 *
 * The founder's 2026-08-04 ruling moved the whole filesystems domain into
 * `agent-orchestration`: the record, the injection wiring and the reachability
 * probe all followed F1's mount engine, and with them every `/api/filesystems`
 * route whose table set is `filesystems` + `filesystem_injections` alone
 * (`layers/agent-orchestration/src/routes/filesystems.ts`).
 *
 * `POST /api/filesystems/:id/injections` could not follow them. Its
 * team-consistency gate reads `users` (`findUser`) and `team_members`
 * (`getTeamMembers`) — core-api Services over core-api tables — so its table
 * set is two-sided and §D-A rule 3 gives it exactly one legal host: this one.
 * Hosting it on the other app would make `agent-orchestration` read core-api
 * state, which AU21 Decision L forbids with no carve-out, and dropping the gate
 * would be a behaviour change nobody asked for. §D-I item 2 designs precisely
 * this shape: the gate stays here, the persist is delegated DOWN to
 * `@hyperidle/filesystems`' `saveInjection` (a core → orchestration downward
 * call, never a Port method, never a read of orchestration state this Layer
 * consumes for its own purpose).
 *
 * The path does not change. Both apps mount on the Application's one `/api`
 * router (§D-A rule 7), so `POST /api/filesystems/:id/injections` is
 * byte-identical to before and `SettingsAgents.tsx` needs no edit. There is no
 * `method + path` collision with the orchestration-hosted router — AC10's
 * route-table assertion covers it.
 *
 * @lore AO1 §3: the team gate is route-level. There is no DB-level cross-table
 * CHECK constraint, and the bot's `teamId` points at `team_members.id`
 * (`schema.ts:47`), so reaching the real `teams.id` needs the extra hop.
 *
 * @lore AU31 §2.6: the existence check + the persist are now
 * `AgentOrchestrationPort.filesystems.persistInjection` — a downward
 * DOWNWARD CALL was still a `@hyperidle/filesystems` import (a cross-layer
 * import regardless of direction), so it converts to the seam like every
 * other conversation site. The gate stays exactly where it is, route-level,
 * reading only core-api's own `users`/`team_members`.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	type HyperIdleEnv,
	validateBody,
} from "@hyperidle/http-middleware";
import { getTeamMembers } from "@hyperidle/org";
import { findUser } from "@hyperidle/users";
import { Hono } from "hono";
import { z } from "zod";

const injectFilesystemSchema = z.object({
	agentUserId: z.string().min(1),
});


export function createFilesystemInjectionRoutes(
	db: HyperIdleDb,
	agentOrchestration: AgentOrchestrationPort,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// ── POST /api/filesystems/:id/injections — Inject filesystem into a bot ───
	router.post(
		"/:id/injections",
		validateBody(injectFilesystemSchema),
		async (c) => {
			const fsId = c.req.param("id");
			const body = c.req.valid("json");

			// Check filesystem exists + get its team (the pre-write half of the
			// gate — see the port's own doc for why this reads separately from
			// `persistInjection`'s own existence recheck).
			const filesystemTeamId = await agentOrchestration.filesystems.getTeamId(fsId);
			if (filesystemTeamId == null) {
				return c.json({ error: "Filesystem not found", code: "NOT_FOUND" }, 404);
			}

			// Check agent exists
			const agent = await findUser(db, { id: body.agentUserId });
			if (agent == null) {
				return c.json({ error: "Agent user not found", code: "NOT_FOUND" }, 404);
			}

			// Team-consistency check: the bot's team must match the filesystem's teamId.
			// The bot's teamId points at team_members.id (schema.ts:47); we need the teams.id.
			// @lore AO1 §3: Route-level guard — no DB-level cross-table CHECK constraint.
			if (agent.teamId == null) {
				return c.json({ error: "Agent user has no team assignment", code: "TEAM_MISMATCH" }, 400);
			}
			const tmRow = await getTeamMembers(db, { id: agent.teamId });
			const agentActualTeamId = tmRow?.teamId ?? null;
			if (agentActualTeamId !== filesystemTeamId) {
				return c.json(
					{ error: "Agent team does not match filesystem team", code: "TEAM_MISMATCH" },
					400,
				);
			}

			const injectionAttempt = await agentOrchestration.filesystems.persistInjection(
				fsId,
				body.agentUserId,
			);
			if (!injectionAttempt.ok) {
				if (injectionAttempt.code === "NOT_FOUND") {
					return c.json({ error: "Filesystem not found", code: "NOT_FOUND" }, 404);
				}
				return c.json({ error: "Already injected", code: "CONFLICT" }, 409);
			}

			return c.json(injectionAttempt.injection, 201);
		},
	);

	return router;
}
