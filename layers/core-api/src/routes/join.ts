import type { HyperIdleDb } from "@hyperidle/db";
import {
	API_ERROR_CODES,
	type ApiErrorResponse,
	type EditUserInput,
	type UserView,
} from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import { givePersonKey, isEmailTaken, listTeams, newPersonKey } from "@hyperidle/user";
import { Hono } from "hono";
import z from "zod";
import type { Action } from "../actions/action.js";
import { runnerFor } from "../actions/compose.js";

/**
 * Joining a shared backend: anyone with the team key becomes a new person, named by their email,
 * and gets their own key back — once. Their computer keeps that key instead of the team key.
 * A joiner is in every team the server has; the first one on a new server names the team.
 */
const JOIN_SCHEMA = z.object({
	email: z.email().trim().toLowerCase().max(200),
	name: z.string().trim().min(1).max(80),
	team: z.string().trim().min(1).max(80).optional(),
});

export function createJoinRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	actions: readonly Action[],
): Hono<HyperIdleEnv> {
	const editUser = runnerFor<EditUserInput, UserView>(actions, "edit_user");
	const router = new Hono<HyperIdleEnv>();

	router.post("/", async (c) => {
		const no = (
			status: 400 | 409,
			error: string,
			code: ApiErrorResponse["code"],
			details?: ApiErrorResponse["details"],
		) => c.json({ error, code, ...(details ? { details } : {}) } satisfies ApiErrorResponse, status);
		const parsed = JOIN_SCHEMA.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success)
			return no(400, "Give your email and your name.", API_ERROR_CODES.VALIDATION_ERROR);
		const { email, name, team } = parsed.data;
		if (await isEmailTaken(db, email))
			return no(409, "Someone with that email has already joined.", API_ERROR_CODES.CONFLICT);
		const existing = (await listTeams(db)).map((t) => t.name);
		const teams = existing.length > 0 ? existing : team ? [team] : null;
		if (!teams)
			return no(409, "This server is new: name your team.", API_ERROR_CODES.CONFLICT, {
				needsTeam: true,
			});

		const made = await editUser(
			{ actor: c.get("userId"), db, eventBus, now: new Date().toISOString() },
			{ kind: "human", name, teams },
		);
		const you = made.ok ? made.data.user?.id : undefined;
		if (!you)
			return no(
				400,
				made.ok ? "You were not made." : (made.problems[0]?.message ?? "You were not made."),
				API_ERROR_CODES.VALIDATION_ERROR,
			);
		const key = newPersonKey();
		await givePersonKey(db, you, key, email);
		return c.json({ key });
	});

	return router;
}
