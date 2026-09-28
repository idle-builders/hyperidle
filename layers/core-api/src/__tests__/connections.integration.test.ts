/**
 * Connections, behind `open_user`/`edit_user`.
 *
 * There is no `/api/connections` route family (`createConnectionRoutes`,
 * its `/:id/validate` SSRF re-check) is DELETED — connections are a user
 * attribute now, read through `open_user({}).connections` and written
 * through `edit_user({ connections: { add | remove } })`. Every failure
 * mode collapses to one problem code at this door: `connection_invalid` for
 * an add the seam refused (SSRF block, duplicate, missing root secret,
 * malformed pair) and `unknown_connection` for a remove that found nothing
 * to remove — the seam itself still enforces every one of the underlying
 * checks (`agent-orchestration-intake.ts`'s `connectionCreateInputSchema`
 * mirrors the SSRF-checked `createConnectionSchema`), `edit_user` just
 * never re-exposes which one fired. `validate` (a live health re-probe) has
 * no successor — nothing in `edit_user`'s schema carries it, and
 * `SettingsConnections.tsx` doesn't call for one.
 */

import { CORE_API_ACTOR_OVERRIDE_HEADER } from "@hyperidle/api-contract";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-connections";
const CREDENTIAL_KEY = "test-credential-encryption-key";

const USER_A_ID = "u-conn-user-a";
const USER_B_ID = "u-conn-user-b";

function authHeadersA(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

/** User B as the caller: the actor-override header names the route actor. */
function authHeadersB(): Record<string, string> {
	return authHeadersA({ [CORE_API_ACTOR_OVERRIDE_HEADER]: USER_B_ID });
}

interface ConnectionView {
	readonly id: string;
	readonly service: string;
	readonly authSource: string;
	readonly health: string;
}

interface ConnectionsField {
	readonly connections: readonly ConnectionView[];
	readonly inherited: readonly ConnectionView[];
}

interface EditUserEnvelope {
	readonly ok: boolean;
	readonly data?: { readonly connections: ConnectionsField | null };
	readonly problems?: ReadonlyArray<{ readonly code: string; readonly message: string }>;
}

interface OpenUserEnvelope {
	readonly ok: boolean;
	readonly data?: { readonly connections: ConnectionsField | null };
}

/** `id` is always the caller's OWN id — `edit_user` with no `id` CREATES a new user; `own_profile_only` refuses editing anyone else. */
async function addConnection(
	app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
	headers: Record<string, string>,
	selfId: string,
	body: Record<string, unknown>,
): Promise<{ status: number; envelope: EditUserEnvelope }> {
	const res = await app.request("/api/actions/edit_user", {
		method: "POST",
		headers,
		body: JSON.stringify({ id: selfId, connections: { add: [body] } }),
	});
	return { status: res.status, envelope: (await res.json()) as EditUserEnvelope };
}

async function removeConnection(
	app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
	headers: Record<string, string>,
	selfId: string,
	id: string,
): Promise<{ status: number; envelope: EditUserEnvelope }> {
	const res = await app.request("/api/actions/edit_user", {
		method: "POST",
		headers,
		body: JSON.stringify({ id: selfId, connections: { remove: [id] } }),
	});
	return { status: res.status, envelope: (await res.json()) as EditUserEnvelope };
}

async function openConnections(
	app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
	headers: Record<string, string>,
): Promise<ConnectionsField> {
	const res = await app.request("/api/actions/open_user", {
		method: "POST",
		headers,
		body: JSON.stringify({}),
	});
	const body = (await res.json()) as OpenUserEnvelope;
	const connections = body.data?.connections;
	if (!connections) throw new Error("open_user returned no connections field for the self view");
	return connections;
}

describe("connections behind open_user/edit_user", () => {
	const NOW = new Date().toISOString();

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", CREDENTIAL_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function seedUserA(db: HyperIdleDb): Promise<void> {
		await db.insert(users).values({
			id: USER_A_ID,
			kind: "human",
			name: "User A",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
	}

	async function seedUserB(db: HyperIdleDb): Promise<void> {
		await db.insert(users).values({
			id: USER_B_ID,
			kind: "human",
			name: "User B",
			role: "member",
			status: "active",
			createdAt: NOW,
		});
	}

	// ─── Auth guard ─────────────────────────────────────────────────────────

	describe("auth guard — the actions door requires authentication", () => {
		test("open_user returns 401 without API key", async ({ requestWithoutAuth }) => {
			const res = await requestWithoutAuth("/api/actions/open_user", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(401);
		});

		test("edit_user (connections.add) returns 401 without API key", async ({
			requestWithoutAuth,
		}) => {
			const res = await requestWithoutAuth("/api/actions/edit_user", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					connections: { add: [{ service: "Stripe", authSource: "token", token: "tok123" }] },
				}),
			});
			expect(res.status).toBe(401);
		});
	});

	describe("adding a connection records it with its auth source", () => {
		test("add token → recorded with authSource:'token'", async ({ app, db }) => {
			await seedUserA(db);
			const { status, envelope } = await addConnection(app, authHeadersA(), USER_A_ID, {
				service: "Stripe",
				authSource: "token",
				token: "sk-stripe-test-001",
			});
			expect(status).toBe(200);
			expect(envelope.ok).toBe(true);
			const found = envelope.data?.connections?.connections.find((c) => c.service === "Stripe");
			expect(found?.authSource).toBe("token");
		});

		test("open_user lists the added token connection", async ({ app, db }) => {
			await seedUserA(db);
			await addConnection(app, authHeadersA(), USER_A_ID, {
				service: "Stripe",
				authSource: "token",
				token: "sk-stripe-test-002",
			});
			const connections = await openConnections(app, authHeadersA());
			const found = connections.connections.find((c) => c.service === "Stripe");
			expect(found?.authSource).toBe("token");
		});

		test("add mcp → recorded with authSource:'mcp'", async ({ app, db }) => {
			await seedUserA(db);
			const { envelope } = await addConnection(app, authHeadersA(), USER_A_ID, {
				authSource: "mcp",
				serverUrl: "https://mcp.figma.com",
			});
			expect(envelope.ok).toBe(true);
			const [connection] = envelope.data?.connections?.connections ?? [];
			expect(connection?.authSource).toBe("mcp");
		});

		test("add mcp derives service from serverUrl when omitted", async ({ app, db }) => {
			await seedUserA(db);
			const { envelope } = await addConnection(app, authHeadersA(), USER_A_ID, {
				authSource: "mcp",
				serverUrl: "https://mcp.figma.com",
			});
			const [connection] = envelope.data?.connections?.connections ?? [];
			expect(typeof connection?.service).toBe("string");
			expect((connection?.service ?? "").length).toBeGreaterThan(0);
		});
	});

	describe("removing a held connection", () => {
		test("remove own connection succeeds", async ({ app, db }) => {
			await seedUserA(db);
			const created = await addConnection(app, authHeadersA(), USER_A_ID, {
				service: "SendGrid",
				authSource: "token",
				token: "sg-test-delete-001",
			});
			const id = created.envelope.data?.connections?.connections[0]?.id as string;

			const { status, envelope } = await removeConnection(app, authHeadersA(), USER_A_ID, id);
			expect(status).toBe(200);
			expect(envelope.ok).toBe(true);
		});

		test("open_user no longer lists the removed connection", async ({ app, db }) => {
			await seedUserA(db);
			const created = await addConnection(app, authHeadersA(), USER_A_ID, {
				service: "Mailchimp",
				authSource: "token",
				token: "mc-test-delete-002",
			});
			const id = created.envelope.data?.connections?.connections[0]?.id as string;

			await removeConnection(app, authHeadersA(), USER_A_ID, id);

			const connections = await openConnections(app, authHeadersA());
			expect(connections.connections.find((c) => c.id === id)).toBeUndefined();
		});
	});

	describe("a freshly-added token connection starts with health:'needs-attention'", () => {
		test("freshly-added token connection starts with health:'needs-attention'", async ({
			app,
			db,
		}) => {
			await seedUserA(db);
			const { envelope } = await addConnection(app, authHeadersA(), USER_A_ID, {
				service: "GitHub",
				authSource: "token",
				token: "gh-test-conn-001",
			});
			// Architecture §Phase-0 decision 2: health on create = needs-attention
			const [connection] = envelope.data?.connections?.connections ?? [];
			expect(connection?.health).toBe("needs-attention");
		});
	});

	describe("pasted secret stored encrypted, NEVER in any response", () => {
		test("add response body does not contain the raw token", async ({ app, db }) => {
			await seedUserA(db);
			const SECRET_TOKEN = "super-secret-sk-stripe-conn-001";
			const res = await app.request("/api/actions/edit_user", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					id: USER_A_ID,
					connections: { add: [{ service: "Stripe", authSource: "token", token: SECRET_TOKEN }] },
				}),
			});
			const bodyText = await res.text();
			expect(bodyText).not.toContain(SECRET_TOKEN);
		});

		test("open_user response does not contain any raw token value", async ({ app, db }) => {
			await seedUserA(db);
			const SECRET_TOKEN = "super-secret-sk-stripe-conn-002";
			await addConnection(app, authHeadersA(), USER_A_ID, {
				service: "Stripe",
				authSource: "token",
				token: SECRET_TOKEN,
			});

			const res = await app.request("/api/actions/open_user", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({}),
			});
			const bodyText = await res.text();
			expect(bodyText).not.toContain(SECRET_TOKEN);
		});

		test("open_user response never carries encryptedToken or encrypted_token", async ({
			app,
			db,
		}) => {
			await seedUserA(db);
			await addConnection(app, authHeadersA(), USER_A_ID, {
				service: "Stripe",
				authSource: "token",
				token: "sk-test-enc-check-001",
			});

			const connections = await openConnections(app, authHeadersA());
			for (const row of connections.connections) {
				expect(row).not.toHaveProperty("encryptedToken");
				expect(row).not.toHaveProperty("encrypted_token");
			}
		});

		test("add response never carries encryptedToken", async ({ app, db }) => {
			await seedUserA(db);
			const { envelope } = await addConnection(app, authHeadersA(), USER_A_ID, {
				service: "GitHub",
				authSource: "token",
				token: "gh-enc-check-001",
			});
			const [connection] = envelope.data?.connections?.connections ?? [];
			expect(connection).not.toHaveProperty("encryptedToken");
			expect(connection).not.toHaveProperty("encrypted_token");
		});
	});

	// `connections` on `UserView` is self-only (`isSelf` in
	// `buildUserView`) — a caller never reaches another user's connections
	// field at all, and `removeConnection`'s own DB read is scoped to the
	// caller's own id. Isolation is a structural property of the door now,
	// not a per-row guard a route could regress.

	describe("per-user isolation (two callers)", () => {
		test("user B's own read never carries user A's connection", async ({ app, db }) => {
			await seedUserA(db);
			await seedUserB(db);

			const created = await addConnection(app, authHeadersA(), USER_A_ID, {
				service: "Stripe",
				authSource: "token",
				token: "sk-a-iso-real-001",
			});
			const aConnectionId = created.envelope.data?.connections?.connections[0]?.id as string;
			expect(typeof aConnectionId).toBe("string");

			const bConnections = await openConnections(app, authHeadersB());
			expect(bConnections.connections.find((c) => c.id === aConnectionId)).toBeUndefined();
		});

		test("user B's own remove of user A's real id finds nothing, and A's connection survives", async ({
			app,
			db,
		}) => {
			await seedUserA(db);
			await seedUserB(db);

			const created = await addConnection(app, authHeadersA(), USER_A_ID, {
				service: "GitHub",
				authSource: "token",
				token: "gh-a-iso-real-delete-001",
			});
			const aConnectionId = created.envelope.data?.connections?.connections[0]?.id as string;

			const { envelope } = await removeConnection(app, authHeadersB(), USER_B_ID, aConnectionId);
			expect(envelope.ok).toBe(false);
			expect(envelope.problems?.[0]?.code).toBe("unknown_connection");

			const aConnections = await openConnections(app, authHeadersA());
			expect(aConnections.connections.find((c) => c.id === aConnectionId)).toBeDefined();
		});

		test("remove of a non-existent id finds nothing", async ({ app, db }) => {
			await seedUserA(db);
			const { status, envelope } = await removeConnection(
				app,
				authHeadersA(),
				USER_A_ID,
				"sc-definitely-does-not-exist-xyz",
			);
			expect(status).toBe(422);
			expect(envelope.ok).toBe(false);
			expect(envelope.problems?.[0]?.code).toBe("unknown_connection");
		});
	});

	describe("removing an inherited: id finds nothing (never persisted)", () => {
		test("remove inherited:claude-code:github finds nothing", async ({ app, db }) => {
			await seedUserA(db);
			const { status, envelope } = await removeConnection(
				app,
				authHeadersA(),
				USER_A_ID,
				"inherited:claude-code:github",
			);
			expect(status).toBe(422);
			expect(envelope.problems?.[0]?.code).toBe("unknown_connection");
		});
	});

	// ─── Duplicate and invalid input → connection_invalid ──────────────────

	describe("duplicate (user, service, authSource) and invalid input are refused", () => {
		test("adding the same service+authSource twice is refused", async ({ app, db }) => {
			await seedUserA(db);
			await addConnection(app, authHeadersA(), USER_A_ID, {
				service: "Stripe",
				authSource: "token",
				token: "sk-dup-001",
			});
			const { status, envelope } = await addConnection(app, authHeadersA(), USER_A_ID, {
				service: "Stripe",
				authSource: "token",
				token: "sk-dup-002",
			});
			expect(status).toBe(422);
			expect(envelope.problems?.[0]?.code).toBe("connection_invalid");
		});

		test("adding a token connection with no token is refused", async ({ app, db }) => {
			await seedUserA(db);
			const { status, envelope } = await addConnection(app, authHeadersA(), USER_A_ID, {
				service: "Stripe",
				authSource: "token",
			});
			expect(status).toBe(422);
			expect(envelope.problems?.[0]?.code).toBe("connection_invalid");
		});

		test("adding an mcp connection with a non-https serverUrl is refused", async ({ app, db }) => {
			await seedUserA(db);
			const { status, envelope } = await addConnection(app, authHeadersA(), USER_A_ID, {
				authSource: "mcp",
				serverUrl: "http://mcp.example.com",
			});
			expect(status).toBe(422);
			expect(envelope.problems?.[0]?.code).toBe("connection_invalid");
		});

		test("adding a connection with an unknown authSource is refused at the schema boundary", async ({
			app,
			db,
		}) => {
			await seedUserA(db);
			const res = await app.request("/api/actions/edit_user", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					connections: { add: [{ service: "Stripe", authSource: "oauth", token: "tok123" }] },
				}),
			});
			// `EditUserConnectionsSchema`'s `authSource` is `z.enum(HELD_AUTH_SOURCES)` —
			// an unknown value never reaches the handler, so this is `validateBody`'s
			// own rejection, not the seam's `connection_invalid`.
			expect(res.status).toBe(400);
		});

		test("adding an mcp connection with a link-local serverUrl is refused", async ({ app, db }) => {
			await seedUserA(db);
			const { status, envelope } = await addConnection(app, authHeadersA(), USER_A_ID, {
				authSource: "mcp",
				serverUrl: "https://169.254.169.254",
			});
			expect(status).toBe(422);
			expect(envelope.problems?.[0]?.code).toBe("connection_invalid");
		});

		test("adding an mcp connection with a private-range serverUrl (10.x) is refused", async ({
			app,
			db,
		}) => {
			await seedUserA(db);
			const { status, envelope } = await addConnection(app, authHeadersA(), USER_A_ID, {
				authSource: "mcp",
				serverUrl: "https://10.0.0.1",
			});
			expect(status).toBe(422);
			expect(envelope.problems?.[0]?.code).toBe("connection_invalid");
		});

		test("adding an mcp connection with a private-range serverUrl (192.168.x) is refused", async ({
			app,
			db,
		}) => {
			await seedUserA(db);
			const { status, envelope } = await addConnection(app, authHeadersA(), USER_A_ID, {
				authSource: "mcp",
				serverUrl: "https://192.168.1.1",
			});
			expect(status).toBe(422);
			expect(envelope.problems?.[0]?.code).toBe("connection_invalid");
		});

		test("adding an mcp connection with a loopback serverUrl is refused", async ({ app, db }) => {
			await seedUserA(db);
			const { status, envelope } = await addConnection(app, authHeadersA(), USER_A_ID, {
				authSource: "mcp",
				serverUrl: "https://127.0.0.1/mcp",
			});
			expect(status).toBe(422);
			expect(envelope.problems?.[0]?.code).toBe("connection_invalid");
		});
	});
});
