/**
 * AU21 §9 Increment 8, Wave F2 (credentials/filesystems provisioning split).
 *
 * Decision F2 (architecture.md §6): the session-launch-time PROVISIONING
 * OPERATION (`connections.{buildProvisioningPlan, applyProvisioningPlan}`,
 * `filesystems.{listFilesystems, startWatcher}`) relocates into
 * `agent-orchestration`; the human-configured RECORD (+ its `/api/connections`,
 * `/api/filesystems` routes and `SettingsConnections`/`SettingsFilesystems` UI)
 * stays exactly where it is in core-api. This closes `edge-disposition.md`'s
 * §6 "session-launch infrastructure" category by giving `CoreApiPort` a
 * narrow record-read door for `connections` — the SAME seam shape every other
 * Increment-2 capability family uses (§11: every `CoreApiPort` method is a
 * TESTED obligation, reaching a real backing route).
 *
 * AU21 §9 Increment 12 follow-up (F2 gap closure): this file's ORIGINAL
 * sibling `CoreApiPort.filesystems — provisioning-record reads` describe block
 * (`listFilesystemsByAgent`) is DELETED — that seam method's only real
 * production caller (`run-orchestration-composition.ts`'s former
 * `filesystemsReader`) is gone; the agent's injected filesystem list is now
 * baked at emit time by every per-kind resolver
 * (`@hyperidle/filesystems`'s `resolveInjectedFilesystemsForAgent`) instead of
 * read back through this seam (see `provisioner.ts`'s own `filesystems`
 * `@lore` for the full trace). The plain `GET /api/filesystems?agentUserId=`
 * ROUTE this seam method used to reuse stays exactly as-is — the Settings UI
 * calls it directly (`apiFetch`), never through `CoreApiPort` — only the
 * now-dead PORT method + its seam wiring are removed. `connections` is
 * unaffected and stays fully tested below.
 */

import { type HyperIdleDb, serviceConnections, users } from "@hyperidle/db";
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

interface SeamCoreApiPortIncrement8Connections {
	readonly connections: {
		listHeldConnectionsForProvisioning(): Promise<{
			readonly userId: string;
			readonly connections: ReadonlyArray<SeamHeldConnectionRecord>;
		}>;
	};
}

function buildSeamPort(actorId: string, app: Hono): SeamCoreApiPortIncrement8Connections {
	const transport = withActorTransport(createInProcessCoreApiTransport(app), { userId: actorId });
	return buildCoreApiPort(transport) as unknown as SeamCoreApiPortIncrement8Connections;
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

describe("CoreApiPort.connections — provisioning-record reads", () => {
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

	test("listHeldConnectionsForProvisioning NEVER exposes the encrypted token", async ({
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
		) as unknown as SeamCoreApiPortIncrement8Connections;

		await expect(port.connections.listHeldConnectionsForProvisioning()).rejects.toThrow();
	});
});
