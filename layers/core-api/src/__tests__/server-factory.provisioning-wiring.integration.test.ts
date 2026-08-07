/**
 * AU26 review C1 — the composition root actually wires session provisioning.
 *
 * This work package's headline discovery: `serviceConnectionResolver` was wired
 * to a `CredentialResolver` (`resolve(name)`) where a `ServiceConnectionResolver`
 * (`resolve(userId, connectionId)`) was expected. AN2 provisioning therefore
 * provisioned NOTHING in production, for months, silently — a blanket `as`
 * cast on the deps literal hid the arity mismatch from `tsc`, and every
 * provisioning test hand-built its own port and called the read function
 * directly, so none of them went through `createServer`. Delete
 * `heldConnections:` from the composition root and all of them stayed green.
 *
 * This test is the missing half. It boots the REAL `createServer` and asserts,
 * functionally against a real DB, that all three provisioning ports are the
 * real implementations:
 *   - the resolver decrypts a held connection for its owner — the two-argument
 *     call the provisioner makes. A `CredentialResolver` in that slot returns
 *     null here (it would look `server_credentials` up by NAME = a user id).
 *   - the held-connection reader reads `service_connections` live, scoped to
 *     the owning human, never a second human's tokens (review C2).
 *   - the injected-filesystem reader reads `filesystem_injections` live.
 *
 * Same shape and same purpose as `server-factory.resolver.test.ts`'s
 * `handle.credentialResolver instanceof DbCredentialResolver` invariant: the
 * ports are on `ServerHandle` precisely so the production wiring is assertable
 * without an indirect observable effect. Remove any of them from
 * `create-server.ts` and this file fails (and `tsc` fails first — the wiring is
 * typed now, not cast).
 */

import * as os from "node:os";
import * as path from "node:path";
import { ServiceConnectionResolver } from "@hyperidle/connections";
import {
	filesystemInjections,
	filesystems,
	type HyperIdleDb,
	serviceConnections,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { AdapterPool, createSandboxAdapter } from "@hyperidle/harness-registry";
import { createServer } from "@hyperidle/remote-server/create-server";
import { encryptCredentialValue } from "@hyperidle/shared/crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";

const SERVER_SECRET = "au26-c1-provisioning-wiring-secret";
const OWNER_ID = "u-au26-c1-owner";
const OTHER_HUMAN_ID = "u-au26-c1-other";
const AGENT_ID = "agent-au26-c1-target";
const TEAM_ID = "team-au26-c1";
const TEAM_MEMBERS_ID = "tm-au26-c1";
const OWNER_CREATED_AT = "2026-08-01T00:00:00.000Z";
const OTHER_CREATED_AT = "2026-08-02T00:00:00.000Z";

beforeEach(() => {
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
});
afterEach(() => {
	vi.unstubAllEnvs();
});

async function seed(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: TEAM_ID, name: "AU26 C1", phase: "build", createdAt: OWNER_CREATED_AT });
	await db.insert(teamMembers).values({
		id: TEAM_MEMBERS_ID,
		teamId: TEAM_ID,
		capacity: 3,
		activeBets: 0,
		formedAt: OWNER_CREATED_AT,
	});
	await db.insert(users).values([
		{
			id: OWNER_ID,
			kind: "human",
			name: "AU26 Owner",
			role: "founder",
			status: "active",
			teamId: TEAM_MEMBERS_ID,
			createdAt: OWNER_CREATED_AT,
		},
		{
			id: OTHER_HUMAN_ID,
			kind: "human",
			name: "AU26 Other Human",
			role: "member",
			status: "active",
			teamId: TEAM_MEMBERS_ID,
			createdAt: OTHER_CREATED_AT,
		},
		{
			id: AGENT_ID,
			kind: "ai",
			name: "AU26 Target Agent",
			role: "builder",
			status: "active",
			teamId: TEAM_MEMBERS_ID,
			createdAt: OWNER_CREATED_AT,
		},
	]);
	await db.insert(serviceConnections).values([
		{
			id: "sc-au26-c1-owner",
			userId: OWNER_ID,
			service: "github",
			authSource: "token",
			encryptedToken: encryptCredentialValue("gh_owner_wired_token"),
			serverUrl: null,
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: OWNER_CREATED_AT,
			updatedAt: OWNER_CREATED_AT,
		},
		{
			id: "sc-au26-c1-other",
			userId: OTHER_HUMAN_ID,
			service: "stripe",
			authSource: "token",
			encryptedToken: encryptCredentialValue("sk_other_wired_token"),
			serverUrl: "https://mcp.stripe.com",
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: OTHER_CREATED_AT,
			updatedAt: OTHER_CREATED_AT,
		},
	]);
	await db.insert(filesystems).values({
		id: "fs-au26-c1",
		teamId: TEAM_ID,
		source: "local",
		kind: "doc_set",
		connectionId: null,
		resourceRef: JSON.stringify({ kind: "doc_set", folder: "/tmp/au26-c1-vault" }),
		writeback: "file",
		state: "attached",
		createdAt: OWNER_CREATED_AT,
	});
	await db.insert(filesystemInjections).values({
		agentUserId: AGENT_ID,
		filesystemId: "fs-au26-c1",
		createdAt: OWNER_CREATED_AT,
	});
}

async function bootServer(db: HyperIdleDb): Promise<Awaited<ReturnType<typeof createServer>>> {
	return createServer(0, {
		db,
		adapterPool: new AdapterPool(),
		workspaceAdapter: createSandboxAdapter("disabled"),
		sandboxBasePath: path.join(os.tmpdir(), "au26-c1-provisioning-wiring"),
	});
}

describe("createServer wires the real session-provisioning ports", () => {
	test("the wired serviceConnectionResolver decrypts a held connection for its owner (a CredentialResolver here returns null)", async ({
		db,
	}) => {
		await seed(db);
		const handle = await bootServer(db);
		try {
			expect(handle.provisioning.serviceConnectionResolver).toBeInstanceOf(
				ServiceConnectionResolver,
			);
			// The two-argument call the provisioner makes. This is the exact
			// call that silently returned null in production.
			expect(
				await handle.provisioning.serviceConnectionResolver.resolve(OWNER_ID, "sc-au26-c1-owner"),
			).toBe("gh_owner_wired_token");
			// Per-user isolation is unchanged at the resolver (AN1).
			expect(
				await handle.provisioning.serviceConnectionResolver.resolve(
					OTHER_HUMAN_ID,
					"sc-au26-c1-owner",
				),
			).toBeNull();
		} finally {
			await handle.dispose();
		}
	}, 20_000);

	test("the wired held-connection reader reads live and carries ONLY the owning human's connections", async ({
		db,
	}) => {
		await seed(db);
		const handle = await bootServer(db);
		try {
			const rows = await handle.provisioning.heldConnections.listHeldForProvisioning();
			expect(rows.map((row) => row.id)).toEqual(["sc-au26-c1-owner"]);
			expect(rows[0]?.userId).toBe(OWNER_ID);

			// Live, not a boot-time snapshot: a connection added after the
			// server booted is in the very next read.
			await db.insert(serviceConnections).values({
				id: "sc-au26-c1-added-after-boot",
				userId: OWNER_ID,
				service: "linear",
				authSource: "mcp",
				encryptedToken: null,
				serverUrl: "https://mcp.linear.app",
				health: "needs-attention",
				lastValidatedAt: null,
				createdAt: OWNER_CREATED_AT,
				updatedAt: OWNER_CREATED_AT,
			});
			const afterAdd = await handle.provisioning.heldConnections.listHeldForProvisioning();
			expect(afterAdd.map((row) => row.id).sort()).toEqual([
				"sc-au26-c1-added-after-boot",
				"sc-au26-c1-owner",
			]);
			// The second human's row is in neither read.
			expect(afterAdd.some((row) => row.userId === OTHER_HUMAN_ID)).toBe(false);
		} finally {
			await handle.dispose();
		}
	}, 20_000);

	test("the wired injected-filesystem reader reads filesystem_injections live", async ({ db }) => {
		await seed(db);
		const handle = await bootServer(db);
		try {
			const injected =
				await handle.provisioning.injectedFilesystems.listInjectedForProvisioning(AGENT_ID);
			expect(injected.map((row) => row.id)).toEqual(["fs-au26-c1"]);

			// A different agent has none — the reader really filters on the id.
			expect(
				await handle.provisioning.injectedFilesystems.listInjectedForProvisioning(OWNER_ID),
			).toEqual([]);
		} finally {
			await handle.dispose();
		}
	}, 20_000);
});
