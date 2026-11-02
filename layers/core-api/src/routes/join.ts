import type { HyperIdleDb } from "@hyperidle/db";
import {
	API_ERROR_CODES,
	type ApiErrorResponse,
	type EditUserInput,
	type UserView,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { findPersonByEmail, givePersonKey, listTeams, newPersonKey } from "@hyperidle/user";
import { Hono } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import z from "zod";
import type { Action } from "../actions/action.js";
import { runnerFor } from "../actions/compose.js";

/** The sign-in service that says who may join: its address and this app's id there. */
export interface SignIn {
	readonly issuer: string;
	readonly clientId: string;
}

const JOIN_SCHEMA = z.object({ team: z.string().trim().min(1).max(80).optional() });

/** No person exists yet when someone joins. */
const NOBODY = "";

/**
 * Joining a shared backend: a person signs in with the sign-in service, and the ID token it hands
 * them proves their email. They get their own key back — signing in again from another computer
 * hands that person a new key. A joiner is in every team; the first one on a new server names it.
 */
export function createJoinRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	actions: readonly Action[],
	signIn: SignIn,
): Hono {
	const editUser = runnerFor<EditUserInput, UserView>(actions, "edit_user");
	const keys = createRemoteJWKSet(new URL(`${signIn.issuer}/oauth/v2/keys`));
	const router = new Hono();

	router.get("/", (c) => c.json(signIn));

	router.post("/", async (c) => {
		const no = (
			status: 400 | 401 | 409,
			error: string,
			code: ApiErrorResponse["code"],
			details?: ApiErrorResponse["details"],
		) =>
			c.json({ error, code, ...(details ? { details } : {}) } satisfies ApiErrorResponse, status);
		const idToken = c.req.header("Authorization")?.replace(/^Bearer /, "") ?? "";
		const signedIn = await jwtVerify(idToken, keys, {
			issuer: signIn.issuer,
			audience: signIn.clientId,
		}).catch(() => null);
		const { email, email_verified: verified, name } = signedIn?.payload ?? {};
		if (!(typeof email === "string" && verified === true))
			return no(
				401,
				"Sign in again: the sign-in did not prove your email.",
				API_ERROR_CODES.UNAUTHORIZED,
			);
		const parsed = JOIN_SCHEMA.safeParse(await c.req.json().catch(() => ({})));
		if (!parsed.success) return no(400, "Name your team.", API_ERROR_CODES.VALIDATION_ERROR);

		const known = await findPersonByEmail(db, email.toLowerCase());
		if (known) {
			const key = newPersonKey();
			await givePersonKey(db, known, key);
			return c.json({ key });
		}
		const existing = (await listTeams(db)).map((t) => t.name);
		const teams = existing.length > 0 ? existing : parsed.data.team ? [parsed.data.team] : null;
		if (!teams)
			return no(409, "This server is new: name your team.", API_ERROR_CODES.CONFLICT, {
				needsTeam: true,
			});

		const made = await editUser(
			{ actor: NOBODY, db, eventBus, now: new Date().toISOString() },
			{ kind: "human", name: typeof name === "string" && name ? name : email, teams },
		);
		const you = made.ok ? made.data.user?.id : undefined;
		if (!you)
			return no(
				400,
				made.ok ? "You were not made." : (made.problems[0]?.message ?? "You were not made."),
				API_ERROR_CODES.VALIDATION_ERROR,
			);
		const key = newPersonKey();
		await givePersonKey(db, you, key, email.toLowerCase());
		return c.json({ key });
	});

	return router;
}
