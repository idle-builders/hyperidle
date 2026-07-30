/**
 * AU21 §9 Increment 8, Wave F2 (credentials/filesystems provisioning split) — RED phase.
 *
 * Decision F2 (architecture.md §6): the session-launch-time PROVISIONING
 * OPERATION (`connections.{buildProvisioningPlan, applyProvisioningPlan}`,
 * `filesystems.{listFilesystems, startWatcher}`) relocates into
 * `agent-orchestration`; the human-configured RECORD (+ its `/api/connections`,
 * `/api/filesystems` routes and `SettingsConnections`/`SettingsFilesystems` UI)
 * stays exactly where it is in core-api. This closes `edge-disposition.md`'s
 * §6 "session-launch infrastructure" category by giving `CoreApiPort` a
 * narrow record-read door for both — the SAME seam shape every other
 * Increment-2 capability family uses (§11: every `CoreApiPort` method is a
 * TESTED obligation, reaching a real backing route).
 *
 * Neither `connections` nor `filesystems` exists on `CoreApiPort` /
 * `buildCoreApiPort` today — every test below fails at RUNTIME
 * (`TypeError: Cannot read properties of undefined ...`) reaching for
 * `port.connections` / `port.filesystems`, not at import-resolution time —
 * same RED shape as the Increment 2 org/routine/handoff wave. RED for the
 * right reason: missing implementation, not a typo.
 *
 * Backing-route plan (documented here for the GREEN-phase builder):
 *  - `filesystems.listFilesystemsByAgent(agentUserId)` → REUSE the existing
 *    `GET /api/filesystems?agentUserId=` route (`routes/filesystems.ts:266`)
 *    verbatim — it already does the single innerJoin
 *    `filesystem_injections → filesystems` query (`@lore AU20 R-filesystems`)
 *    and returns `resourceRef` already `JSON.parse`d
 *    (`rowToFilesystem`) — exactly the shape
 *    `mountFilesystemsForAgent` needs, collapsing what is *today* a two-port-
 *    call dance (`listFilesystemIdsByAgent` + `listFilesystemsByIds`,
 *    `provisioner.ts:775-779`) into the ONE seam call the route already
 *    supports.
 *  - `connections.listHeldConnectionsForProvisioning()` → NEW
 *    `GET /api/connections/provisioning` (no existing route resolves the
 *    owning-human's held-connection record set — `GET /api/connections`
 *    scopes to the AUTHENTICATED CALLER's own connections and deliberately
 *    strips `serverUrl` from its view, `rowToView`, `routes/connections.ts:127`).
 *    Mirrors `connection-provisioning.ts`'s own current preamble
 *    (`buildProvisioningPlan`'s `users.getFirstUserByKind(db,"human")` +
 *    held-row query, `HELD_AUTH_SOURCES`-filtered) — moved into a route
 *    handler, returning the RECORD only: `{id, service, authSource,
 *    serverUrl}` for the resolved human owner, plus that owner's `userId`
 *    (needed by the caller to scope its own subsequent
 *    `resolver.resolve(userId, connectionId)` call — the decrypt step stays
 *    an Application-composed direct dependency, never routed through this
 *    seam; §12/AN1 hard-rule 1: "the resolver is the ONLY plaintext path...
 *    wired to sandbox injection, not to routes"). NEVER includes
 *    `encryptedToken` (same hard-rule as `GET /api/connections`).
 */

import {
	filesystemInjections,
	filesystems,
	type HyperIdleDb,
	serviceConnections,
	teams,
	users,
} from "@hyperidle/db";
import type { Hono } from "hono";
import { describe, expect, test, vi } from "../../test-fixtures.js";
import {
	buildCoreApiPort,
	createInProcessCoreApiTransport,
	withActorTransport,
} from "../core-api-port-composition.js";

const NOW = "2026-07-30T00:00:00.000Z";

interface SeamHeldConnectionRecord {
	readonly id: string;
	readonly service: string;
	readonly authSource: "token" | "mcp";
	readonly serverUrl: string | null;
}

interface SeamFilesystemProvisioningRecord {
	readonly id: string;
	readonly teamId: string;
	readonly source: string;
	readonly kind: string;
	readonly connectionId: string | null;
	readonly resourceRef: unknown;
	readonly writeback: string;
	readonly state: string;
	readonly createdAt: string;
}

interface SeamCoreApiPortIncrement8ConnectionsFilesystems {
	readonly connections: {
		listHeldConnectionsForProvisioning(): Promise<{
			readonly userId: string;
			readonly connections: ReadonlyArray<SeamHeldConnectionRecord>;
		}>;
	};
	readonly filesystems: {
		listFilesystemsByAgent(
			agentUserId: string,
		): Promise<ReadonlyArray<SeamFilesystemProvisioningRecord>>;
	};
}

function buildSeamPort(
	actorId: string,
	app: Hono,
): SeamCoreApiPortIncrement8ConnectionsFilesystems {
	const transport = withActorTransport(createInProcessCoreApiTransport(app), { userId: actorId });
	return buildCoreApiPort(transport) as unknown as SeamCoreApiPortIncrement8ConnectionsFilesystems;
}

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: `Agent ${id}`,
		role: "engineer",
		status: "active",
		maxConcurrentSessions: 1,
		createdAt: NOW,
	});
}

async function seedHumanOwner(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "human",
		name: "Inc8 Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
}

describe("CoreApiPort.connections — Increment 8 F2 provisioning-record wave (RED)", () => {
	test("listHeldConnectionsForProvisioning reaches the real held-connection provisioning route", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc8-connections-key-1");
		await seedHumanOwner(db, "u-inc8-human-1");
		await seedAgent(db, "agent-inc8-conn-caller-1");
		await db.insert(serviceConnections).values([
			{
				id: "sc-inc8-github",
				userId: "u-inc8-human-1",
				service: "github",
				authSource: "token",
				encryptedToken: "enc-blob-should-never-cross-seam",
				serverUrl: null,
				health: "needs-attention",
				lastValidatedAt: null,
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: "sc-inc8-figma",
				userId: "u-inc8-human-1",
				service: "figma",
				authSource: "mcp",
				encryptedToken: null,
				serverUrl: "https://mcp.figma.com",
				health: "needs-attention",
				lastValidatedAt: null,
				createdAt: NOW,
				updatedAt: NOW,
			},
		]);

		const port = buildSeamPort("agent-inc8-conn-caller-1", app);
		const result = await port.connections.listHeldConnectionsForProvisioning();

		expect(result.userId).toBe("u-inc8-human-1");
		const byId = new Map(result.connections.map((c) => [c.id, c]));
		expect(byId.get("sc-inc8-github")).toMatchObject({
			service: "github",
			authSource: "token",
			serverUrl: null,
		});
		expect(byId.get("sc-inc8-figma")).toMatchObject({
			service: "figma",
			authSource: "mcp",
			serverUrl: "https://mcp.figma.com",
		});
	});

	test("listHeldConnectionsForProvisioning NEVER exposes the encrypted token (AN1 hard-rule 1)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc8-connections-key-2");
		await seedHumanOwner(db, "u-inc8-human-2");
		await seedAgent(db, "agent-inc8-conn-caller-2");
		await db.insert(serviceConnections).values({
			id: "sc-inc8-secret",
			userId: "u-inc8-human-2",
			service: "stripe",
			authSource: "token",
			encryptedToken: "super-secret-encrypted-blob",
			serverUrl: null,
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		const port = buildSeamPort("agent-inc8-conn-caller-2", app);
		const result = await port.connections.listHeldConnectionsForProvisioning();

		const row = result.connections.find((c) => c.id === "sc-inc8-secret") as
			| (SeamHeldConnectionRecord & Record<string, unknown>)
			| undefined;
		expect(row).toBeDefined();
		expect(row && "encryptedToken" in row).toBe(false);
		expect(row && "token" in row).toBe(false);
	});

	test("no held connections for the resolved owner resolves an empty list, not a throw", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc8-connections-key-3");
		await seedHumanOwner(db, "u-inc8-human-3");
		await seedAgent(db, "agent-inc8-conn-caller-3");

		const port = buildSeamPort("agent-inc8-conn-caller-3", app);
		const result = await port.connections.listHeldConnectionsForProvisioning();

		expect(result.userId).toBe("u-inc8-human-3");
		expect(result.connections).toHaveLength(0);
	});

	test("a read with no credentials is rejected, not silently bypassed (auth middleware ran)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc8-connections-key-noauth");
		await seedHumanOwner(db, "u-inc8-human-noauth");

		const port = buildCoreApiPort(
			createInProcessCoreApiTransport(app),
		) as unknown as SeamCoreApiPortIncrement8ConnectionsFilesystems;

		await expect(port.connections.listHeldConnectionsForProvisioning()).rejects.toThrow();
	});
});

describe("CoreApiPort.filesystems — Increment 8 F2 provisioning-record wave (RED)", () => {
	test("listFilesystemsByAgent reaches the real GET /api/filesystems?agentUserId= route (parsed resourceRef, one seam call)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc8-fs-key-1");
		await db
			.insert(teams)
			.values({ id: "team-inc8-fs-1", name: "Inc8 FS Team", phase: "build", createdAt: NOW });
		await seedAgent(db, "agent-inc8-fs-caller-1");
		await db.insert(filesystems).values({
			id: "fs-inc8-1",
			teamId: "team-inc8-fs-1",
			source: "local",
			kind: "code",
			connectionId: null,
			resourceRef: JSON.stringify({ kind: "code", path: "/repo" }),
			writeback: "git",
			state: "attached",
			createdAt: NOW,
		});
		await db.insert(filesystemInjections).values({
			agentUserId: "agent-inc8-fs-caller-1",
			filesystemId: "fs-inc8-1",
			createdAt: NOW,
		});

		const port = buildSeamPort("agent-inc8-fs-caller-1", app);
		const rows = await port.filesystems.listFilesystemsByAgent("agent-inc8-fs-caller-1");

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: "fs-inc8-1",
			teamId: "team-inc8-fs-1",
			source: "local",
			kind: "code",
			writeback: "git",
			state: "attached",
		});
		// The route already returns `resourceRef` PARSED (`rowToFilesystem`) —
		// the relocated mount operation must not re-`JSON.parse` a JSON string.
		expect(rows[0]?.resourceRef).toEqual({ kind: "code", path: "/repo" });
	});

	test("an agent with no injected filesystems resolves an empty list", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc8-fs-key-2");
		await seedAgent(db, "agent-inc8-fs-caller-2");

		const port = buildSeamPort("agent-inc8-fs-caller-2", app);
		const rows = await port.filesystems.listFilesystemsByAgent("agent-inc8-fs-caller-2");

		expect(rows).toHaveLength(0);
	});

	test("a read with no credentials is rejected, not silently bypassed (auth middleware ran)", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc8-fs-key-noauth");

		const port = buildCoreApiPort(
			createInProcessCoreApiTransport(app),
		) as unknown as SeamCoreApiPortIncrement8ConnectionsFilesystems;

		await expect(port.filesystems.listFilesystemsByAgent("agent-inc8-fs-noauth")).rejects.toThrow();
	});
});
