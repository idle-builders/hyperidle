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
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { FilesystemInjection } from "@hyperidle/filesystem-contract";
import { getFilesystem, saveInjection } from "@hyperidle/filesystems";
import {
	createBodyLimit,
	type HyperIdleEnv,
	requireBoundary,
	validateBody,
} from "@hyperidle/http-middleware";
import { getTeamMembers } from "@hyperidle/org";
import { findUser } from "@hyperidle/users";
import { Hono } from "hono";
import { z } from "zod";

const injectFilesystemSchema = z.object({
	agentUserId: z.string().min(1),
});

const FILESYSTEM_BODY_LIMIT = { maxSize: 8 * 1024 }; // 8 KB (the body is one id)

function rowToInjection(row: FilesystemInjection): FilesystemInjection {
	return {
		agentUserId: row.agentUserId,
		filesystemId: row.filesystemId,
		createdAt: row.createdAt,
	};
}

export function createFilesystemInjectionRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// ── POST /api/filesystems/:id/injections — Inject filesystem into a bot ───
	router.post(
		"/:id/injections",
		requireBoundary({ kind: "public-data" }),
		createBodyLimit(FILESYSTEM_BODY_LIMIT),
		validateBody(injectFilesystemSchema),
		async (c) => {
			const fsId = c.req.param("id");
			const body = c.req.valid("json");

			// Check filesystem exists (downward call into the orchestration Service).
			const fs = await getFilesystem(db, fsId);
			if (fs == null) {
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
			if (agent.teamId != null) {
				const tmRow = await getTeamMembers(db, { id: agent.teamId });
				const agentActualTeamId = tmRow?.teamId ?? null;
				if (agentActualTeamId !== fs.teamId) {
					return c.json(
						{ error: "Agent team does not match filesystem team", code: "TEAM_MISMATCH" },
						400,
					);
				}
			} else {
				// Bot has no team assignment — can't inject into a team-scoped filesystem.
				return c.json({ error: "Agent user has no team assignment", code: "TEAM_MISMATCH" }, 400);
			}

			const now = new Date().toISOString();

			try {
				await saveInjection(db, {
					agentUserId: body.agentUserId,
					filesystemId: fsId,
					createdAt: now,
				});
			} catch (err) {
				// UNIQUE constraint violation (composite PK already exists) → 409
				// @lore drizzle-orm 0.45.2: wraps PGlite errors — walk cause chain to find constraint message.
				const constraintMsg = (e: unknown): string => {
					if (!(e instanceof Error)) return String(e);
					const own = e.message.toLowerCase();
					if (
						e.message.includes("filesystem_injections_agent_user_id_filesystem_id_pk") ||
						own.includes("duplicate key") ||
						own.includes("unique constraint")
					)
						return e.message;
					return e.cause !== undefined ? constraintMsg(e.cause) : e.message;
				};
				const msg = constraintMsg(err);
				if (
					msg.includes("filesystem_injections_agent_user_id_filesystem_id_pk") ||
					msg.toLowerCase().includes("duplicate key") ||
					msg.toLowerCase().includes("unique constraint")
				) {
					return c.json({ error: "Already injected", code: "CONFLICT" }, 409);
				}
				throw err;
			}

			// injected is defined — we just inserted it.
			return c.json(
				rowToInjection({ agentUserId: body.agentUserId, filesystemId: fsId, createdAt: now }),
				201,
			);
		},
	);

	return router;
}
