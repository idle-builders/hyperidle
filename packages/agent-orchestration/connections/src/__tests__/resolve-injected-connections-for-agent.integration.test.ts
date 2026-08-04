/**
 * AU21 Decision K1 (§6 K1, "finish it in AU21" verdict) — RED-then-GREEN scoped
 * unit-style test for `resolveInjectedConnectionsForAgent`.
 *
 * This replaces `core-api-port-increment8-connections.integration.test.ts`
 * (DELETED — its entire premise was `port.connections
 * .listHeldConnectionsForProvisioning()`, a seam method that no longer
 * exists by design once the held-connection list is baked at emit time
 * instead of read live through `CoreApiPort`). The three assertions that
 * seam-level test proved and are STILL real — (1) the exact response shape
 * a caller gets, (2) the encrypted token/secret NEVER crosses into the baked
 * output, (3) an owner with no held connections resolves an empty list, not
 * a throw — are re-proven here directly against the function itself, with
 * no HTTP/seam involved at all (mirrors
 * `resolve-injected-filesystems-for-agent.integration.test.ts`, the sibling
 * fix's own regression-pin shape).
 */

import { type HyperIdleDb, serviceConnections, type User, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { resolveInjectedConnectionsForAgent } from "../resolve-injected-connections-for-agent.js";

const NOW = "2026-08-02T00:00:00.000Z";

async function seedHumanOwner(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "human",
		name: "K1 Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
}

/** A real `findUser`-shaped injected dependency (Mechanism C — no static `@hyperidle/users` import here), scoped to a fixed test owner. */
function findUserFixture(
	ownerId: string,
): (db: HyperIdleDb, query: { kind: "human" }) => Promise<User | undefined> {
	return async (db, query) => {
		const rows = await db.select().from(users).where(eq(users.id, ownerId));
		return query.kind === "human" ? (rows[0] as User | undefined) : undefined;
	};
}

describe("resolveInjectedConnectionsForAgent bakes the owning human's held connections at emit time", () => {
	test("matches EXACTLY the shape the OLD `GET /connections/provisioning` seam route returned for a fixed fixture", async ({
		db,
	}) => {
		await seedHumanOwner(db, "u-k1-human-1");
		await db.insert(serviceConnections).values([
			{
				id: "sc-k1-github",
				userId: "u-k1-human-1",
				service: "github",
				authSource: "token",
				encryptedToken: "enc-blob-should-never-cross-the-bake",
				serverUrl: null,
				health: "needs-attention",
				lastValidatedAt: null,
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: "sc-k1-figma",
				userId: "u-k1-human-1",
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

		const result = await resolveInjectedConnectionsForAgent(
			db,
			"agent-k1-caller-1",
			findUserFixture("u-k1-human-1"),
		);

		expect(result).toEqual({
			userId: "u-k1-human-1",
			connections: [
				{ id: "sc-k1-github", service: "github", authSource: "token", serverUrl: null },
				{
					id: "sc-k1-figma",
					service: "figma",
					authSource: "mcp",
					serverUrl: "https://mcp.figma.com",
				},
			],
		});
	});

	test("NEVER exposes the encrypted token/secret in the baked output", async ({ db }) => {
		await seedHumanOwner(db, "u-k1-human-2");
		await db.insert(serviceConnections).values({
			id: "sc-k1-secret",
			userId: "u-k1-human-2",
			service: "stripe",
			authSource: "token",
			encryptedToken: "super-secret-encrypted-blob",
			serverUrl: null,
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		const result = await resolveInjectedConnectionsForAgent(
			db,
			"agent-k1-caller-2",
			findUserFixture("u-k1-human-2"),
		);

		const row = result.connections.find((c) => c.id === "sc-k1-secret") as
			| (Record<string, unknown> & { id: string })
			| undefined;
		expect(row).toBeDefined();
		expect(row && "encryptedToken" in row).toBe(false);
		expect(row && "token" in row).toBe(false);
	});

	test("an owner with no held connections resolves an empty list, not a throw", async ({ db }) => {
		await seedHumanOwner(db, "u-k1-human-3");

		const result = await resolveInjectedConnectionsForAgent(
			db,
			"agent-k1-caller-3",
			findUserFixture("u-k1-human-3"),
		);

		expect(result.userId).toBe("u-k1-human-3");
		expect(result.connections).toHaveLength(0);
	});

	test("no resolvable human owner falls back to the pre-existing 'u-founder' sentinel, never throws", async ({
		db,
	}) => {
		const result = await resolveInjectedConnectionsForAgent(
			db,
			"agent-k1-caller-4",
			async () => undefined,
		);

		expect(result.userId).toBe("u-founder");
		expect(result.connections).toHaveLength(0);
	});
});
