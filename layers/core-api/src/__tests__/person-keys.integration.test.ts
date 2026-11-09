/**
 * Each person is themselves on a shared backend: signing in with the sign-in service makes a
 * person and hands back their own key, and every request carrying that key is that person.
 * A small local sign-in service stands in for the real one: it publishes its settings and keys the
 * standard OpenID Connect way, at addresses of its own choosing.
 */
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { changes, users } from "@hyperidle/db";
import type { Hono } from "hono";
import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { createTestApp } from "../__testing__/test-utils.js";

const TEAM_KEY = "person-keys-team-key";
const CLIENT_ID = "hyperidle-desktop";
let issuer = "";
let signer: CryptoKey;
let stranger: CryptoKey;
let signInService: http.Server;

beforeAll(async () => {
	const pair = await generateKeyPair("RS256");
	signer = pair.privateKey;
	stranger = (await generateKeyPair("RS256")).privateKey;
	const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
	signInService = http.createServer((req, res) => {
		const json = (body: unknown) =>
			void res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
		if (req.url === "/.well-known/openid-configuration")
			return json({
				issuer,
				authorization_endpoint: `${issuer}/sign-in`,
				token_endpoint: `${issuer}/token`,
				jwks_uri: `${issuer}/certs`,
			});
		if (req.url === "/certs") return json({ keys: [jwk] });
		res.writeHead(404).end();
	});
	await new Promise<void>((resolve) => signInService.listen(0, "127.0.0.1", resolve));
	issuer = `http://127.0.0.1:${(signInService.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => signInService.close(() => resolve())));

/** An ID token as the sign-in service hands it out after someone signs in. */
function idToken(
	claims: JWTPayload,
	more?: { key?: CryptoKey; audience?: string },
): Promise<string> {
	return new SignJWT({ email_verified: true, ...claims })
		.setProtectedHeader({ alg: "RS256", kid: "k1" })
		.setIssuer(issuer)
		.setAudience(more?.audience ?? CLIENT_ID)
		.setSubject(String(claims.email))
		.setIssuedAt()
		.setExpirationTime("5m")
		.sign(more?.key ?? signer);
}

async function join(app: Hono, token: string, company?: string): Promise<Response> {
	return app.request("/api/join", {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify(company ? { company } : {}),
	});
}

async function joined(app: Hono, email: string, name: string): Promise<string> {
	const res = await join(app, await idToken({ email, name }), "Product");
	expect(res.status).toBe(200);
	return ((await res.json()) as { key: string }).key;
}

/** As whoever holds this key. */
async function act<T>(app: Hono, key: string, name: string, input: unknown): Promise<T> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-API-Key": key },
		body: JSON.stringify(input),
	});
	return (await res.json()) as T;
}

type Me = { ok: true; data: { user: { id: string; name: string; role: string } | null } };

describe("joining a shared backend", () => {
	test("each person who signs in gets their own key that speaks as them; the first is the founder", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({
			db,
			eventBus,
			authApiKey: TEAM_KEY,
			signIn: { issuer, clientId: CLIENT_ID },
		});
		const where = (await (await app.request("/api/join")).json()) as Record<string, string>;
		const alex = await joined(app, "Alex@Example.com", "Alex");
		const sam = await joined(app, "sam@example.com", "Sam");

		const asAlex = await act<Me>(app, alex, "open_user", {});
		const asSam = await act<Me>(app, sam, "open_user", {});
		const asTeamKey = await act<Me>(app, TEAM_KEY, "open_user", {});

		expect(where).toEqual({
			clientId: CLIENT_ID,
			authorizationEndpoint: `${issuer}/sign-in`,
			tokenEndpoint: `${issuer}/token`,
		});
		expect(asAlex.data.user).toMatchObject({ name: "Alex", role: "founder" });
		expect(asSam.data.user).toMatchObject({ name: "Sam", role: "member" });
		expect(asTeamKey.data.user).toBeNull();
	});

	test("a server given the provider's address with a trailing slash still lets people join", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({
			db,
			eventBus,
			authApiKey: TEAM_KEY,
			signIn: { issuer: `${issuer}/`, clientId: CLIENT_ID },
		});
		const res = await join(
			app,
			await idToken({ email: "alex@example.com", name: "Alex" }),
			"Product",
		);
		expect(res.status).toBe(200);
	});

	test("signing in again from another computer hands the same person a new key", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({
			db,
			eventBus,
			authApiKey: TEAM_KEY,
			signIn: { issuer, clientId: CLIENT_ID },
		});
		const first = await joined(app, "alex@example.com", "Alex");
		const second = await joined(app, "ALEX@example.com", "Alex");

		const now = await act<Me>(app, second, "open_user", {});
		const before = await app.request("/api/actions/open_user", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-API-Key": first },
			body: "{}",
		});

		expect(now.data.user).toMatchObject({ name: "Alex", role: "founder" });
		expect(before.status).toBe(401);
	});

	test("refused: a new server's first person without a team, an unproven email, another app's or a forged sign-in", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({
			db,
			eventBus,
			authApiKey: TEAM_KEY,
			signIn: { issuer, clientId: CLIENT_ID },
		});
		const alex = { email: "alex@example.com", name: "Alex" };

		const noTeam = await join(app, await idToken(alex));
		const unproven = await join(app, await idToken({ ...alex, email_verified: false }), "Product");
		const otherApp = await join(app, await idToken(alex, { audience: "another-app" }), "Product");
		const forged = await join(app, await idToken(alex, { key: stranger }), "Product");
		const teamKeyOnly = await app.request("/api/join", {
			method: "POST",
			headers: { "X-API-Key": TEAM_KEY, "Content-Type": "application/json" },
			body: JSON.stringify({ company: "Product" }),
		});

		expect(noTeam.status).toBe(409);
		expect(((await noTeam.json()) as { details: unknown }).details).toEqual({ needsTeam: true });
		expect([unproven.status, otherApp.status, forged.status, teamKeyOnly.status]).toEqual([
			401, 401, 401, 401,
		]);
	});

	test("the team key alone is nobody: it can ask who it is, and any other action is refused, not crashed", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({
			db,
			eventBus,
			authApiKey: TEAM_KEY,
			signIn: { issuer, clientId: CLIENT_ID },
		});
		const alex = await act<Me>(app, await joined(app, "alex@example.com", "Alex"), "open_user", {});
		const changesBefore = (await db.select().from(changes)).length;

		const who = await act<Me>(app, TEAM_KEY, "open_user", {});
		const send = await app.request("/api/actions/send_message", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-API-Key": TEAM_KEY },
			body: JSON.stringify({ recipients: [alex.data.user?.id], text: "hello from nobody" }),
		});

		expect(who.data.user).toBeNull();
		expect(send.status).toBe(403);
		expect(await send.json()).toMatchObject({ ok: false, problems: [{ code: "no_person" }] });
		expect((await db.select().from(changes)).length).toBe(changesBefore);
	});

	test("a server without a sign-in has no join, and a key nobody holds is refused", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, authApiKey: TEAM_KEY });
		const where = await app.request("/api/join", { headers: { "X-API-Key": TEAM_KEY } });
		const res = await app.request("/api/actions/open_user", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-API-Key": "not-anyones-key" },
			body: "{}",
		});
		expect(where.status).toBe(404);
		expect(res.status).toBe(401);
	});

	test("a direct chat with an agent opens for its member and not for another person", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({
			db,
			eventBus,
			authApiKey: TEAM_KEY,
			signIn: { issuer, clientId: CLIENT_ID },
		});
		const alex = await joined(app, "alex@example.com", "Alex");
		const sam = await joined(app, "sam@example.com", "Sam");
		await db.insert(users).values({
			id: "agent-builder",
			kind: "ai",
			name: "Builder",
			role: "agent",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		const made = await act<{ ok: true; data: { thread: { id: string } } }>(
			app,
			alex,
			"adjust_thread",
			{ title: "Alex and Builder", members: ["agent-builder"] },
		);
		const id = made.data.thread.id;

		const alexOpens = await act<{ ok: boolean }>(app, alex, "open_thread", { id });
		const samOpens = await act<{ ok: boolean }>(app, sam, "open_thread", { id });
		const samList = await act<{ data: { thread: { id: string } }[] }>(
			app,
			sam,
			"search_threads",
			{},
		);

		expect(alexOpens.ok).toBe(true);
		expect(samOpens.ok).toBe(false);
		expect(samList.data.map((r) => r.thread.id)).not.toContain(id);
	});
});
