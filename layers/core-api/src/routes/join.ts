import type { HyperIdleDb } from "@hyperidle/db";
import {
	API_ERROR_CODES,
	type ApiErrorResponse,
	type EditUserInput,
	type UserView,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { findPersonByEmail, getGlobalTeam, giveUserKey, newUserKey } from "@hyperidle/user";
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

/** What any OpenID Connect provider publishes about itself at its well-known address. */
const PROVIDER_SCHEMA = z.object({
	issuer: z.string(),
	authorization_endpoint: z.url(),
	token_endpoint: z.url(),
	jwks_uri: z.url(),
});
type Provider = z.infer<typeof PROVIDER_SCHEMA>;

const JOIN_SCHEMA = z.object({ company: z.string().trim().min(1).max(80).optional() });

/** No person exists yet when someone joins. */
const NOBODY = "";

/**
 * Joining a shared backend: a person signs in with the sign-in service, and the ID token it hands
 * them proves their email. They get their own key back — signing in again from another computer
 * hands that person a new key. The first joiner names the company (the global team); later joiners land in the global team automatically.
 */
export function createJoinRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	actions: readonly Action[],
	signIn: SignIn,
): Hono {
	const editUser = runnerFor<EditUserInput, UserView>(actions, "edit_user");
	// Read once; a failed read is tried again on the next join.
	let found: Promise<Provider> | undefined;
	const provider = (): Promise<Provider | null> => {
		found ??= fetch(`${signIn.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`).then(
			async (r) => {
				if (!r.ok) throw new Error(String(r.status));
				return PROVIDER_SCHEMA.parse(await r.json());
			},
		);
		return found.catch(() => {
			found = undefined;
			return null;
		});
	};
	let keys: ReturnType<typeof createRemoteJWKSet> | undefined;
	const router = new Hono();
	const unreachable = {
		error: "The sign-in service did not answer.",
		code: API_ERROR_CODES.INTERNAL_ERROR,
	} satisfies ApiErrorResponse;

	// The app signs people in where the provider says; it learns those addresses only from here.
	router.get("/", async (c) => {
		const p = await provider();
		if (!p) return c.json(unreachable, 502);
		return c.json({
			clientId: signIn.clientId,
			authorizationEndpoint: p.authorization_endpoint,
			tokenEndpoint: p.token_endpoint,
		});
	});

	router.post("/", async (c) => {
		const p = await provider();
		if (!p) return c.json(unreachable, 502);
		keys ??= createRemoteJWKSet(new URL(p.jwks_uri));
		const no = (
			status: 400 | 401 | 409,
			error: string,
			code: ApiErrorResponse["code"],
			details?: ApiErrorResponse["details"],
		) =>
			c.json({ error, code, ...(details ? { details } : {}) } satisfies ApiErrorResponse, status);
		const idToken = c.req.header("Authorization")?.replace(/^Bearer /, "") ?? "";
		const signedIn = await jwtVerify(idToken, keys, {
			// The provider's own spelling: a configured address may differ by a trailing slash.
			issuer: p.issuer,
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
		if (!parsed.success) return no(400, "Name your company.", API_ERROR_CODES.VALIDATION_ERROR);

		const known = await findPersonByEmail(db, email.toLowerCase());
		if (known) {
			const key = newUserKey();
			await giveUserKey(db, known, key);
			return c.json({ key });
		}
		// A global team exists means the company has already been named.
		// First joiner: must name the company (creates the global team).
		// Later joiners: land in the global team only.
		const globalTeam = await getGlobalTeam(db);
		const teamName = globalTeam?.name ?? parsed.data.company;
		if (!teamName)
			return no(409, "This server is new: name your company.", API_ERROR_CODES.CONFLICT, {
				needsTeam: true,
			});
		const teams: string[] = [teamName];

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
		const key = newUserKey();
		await giveUserKey(db, you, key, email.toLowerCase());
		return c.json({ key });
	});

	return router;
}
