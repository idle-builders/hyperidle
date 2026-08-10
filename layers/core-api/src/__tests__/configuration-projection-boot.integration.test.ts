import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { agentRunConfig, serviceConnections, teamMembers, teams, users } from "@hyperidle/db";
import { createServer, type ServerHandle } from "@hyperidle/remote-server/create-server";
import { listConfiguration } from "@hyperidle/settings";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const NOW = "2026-07-08T12:00:00.000Z";
const TEST_API_KEY = "au2-boot-test-key";

describe("configuration projection boot wiring", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "au2-boot-secret-32-byte-test-key!");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("createServer projects built-in defaults and legacy rows without a manual backfill call", async ({
		db,
	}) => {
		await seedLegacyRows(db);

		const handle = await bootTestServer(db, "au2-config-boot");
		try {
			const entries = await listConfiguration(db);

			expect(entries).toContainEqual(
				expect.objectContaining({
					kind: "agent",
					key: "agent.au2-agent-1",
					activeValue: expect.objectContaining({
						id: "au2-agent-1",
						name: "AU2 Builder",
						harnessType: "builtin",
					}),
					origin: expect.objectContaining({
						type: "builtin",
						pluginId: "builtin",
						pluginState: "enabled",
					}),
				}),
			);
			expect(entries).toContainEqual(
				expect.objectContaining({
					kind: "mcp_server",
					key: "mcp_server.au2-human-1.github",
					activeValue: expect.objectContaining({ service: "github", authSource: "mcp" }),
					origin: expect.objectContaining({ type: "builtin" }),
				}),
			);
			expect(entries).toContainEqual(
				expect.objectContaining({
					kind: "tool",
					key: "tool.submit_review",
					activeValue: expect.objectContaining({ name: "submit_review" }),
					origin: expect.objectContaining({ type: "builtin" }),
				}),
			);
			expect(
				(
					await listConfiguration(db, {
						kind: "harness_descriptor",
						key: "harness_descriptor.builtin",
					})
				)[0],
			).toEqual(
				expect.objectContaining({
					activeValue: expect.objectContaining({ type: "builtin" }),
					origin: expect.objectContaining({ type: "builtin" }),
				}),
			);

			const harnessesResponse = await fetch(`${serverBaseUrl(handle)}/api/harnesses`, {
				headers: { "X-API-Key": TEST_API_KEY },
			});
			expect(harnessesResponse.status).toBe(200);
			const harnesses = (await harnessesResponse.json()) as Array<{ type?: string }>;
			expect(harnesses).toContainEqual(expect.objectContaining({ type: "builtin" }));
		} finally {
			handle.dispose();
		}
	});
});

async function bootTestServer(db: HyperIdleDb, label: string): Promise<ServerHandle> {
	// AU31 §6: `topology: "local"` gives `bootAgentExecution`'s own
	// `createLocalAdapterPool()`, which unconditionally registers a
	// "local-builtin"/`type: "builtin"` adapter (`adapter-pool.ts:628-636`) —
	// exactly the harness this test asserts on. The hand-built pool this test
	// used to inject duplicated that same registration.
	return createServer(0, {
		db,
		topology: "local",
		sandboxBasePath: path.join(os.tmpdir(), label),
	});
}

function serverBaseUrl(handle: ServerHandle): string {
	const address = handle.httpServer.address() as AddressInfo;
	return `http://127.0.0.1:${address.port}`;
}

async function seedLegacyRows(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({
		id: "au2-team-1",
		name: "AU2 Team",
		phase: "build",
		createdAt: NOW,
	});
	await db.insert(teamMembers).values({
		id: "au2-members-1",
		teamId: "au2-team-1",
		capacity: 2,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values([
		{
			id: "au2-agent-1",
			kind: "ai",
			name: "AU2 Builder",
			role: "builder",
			status: "active",
			teamId: "au2-members-1",
			createdAt: NOW,
		},
		{
			id: "au2-human-1",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		},
	]);
	// AU26 G1: the run config lives in `agent_run_config` now.
	await db.insert(agentRunConfig).values({
		agentUserId: "au2-agent-1",
		systemPrompt: "Build AU2.",
		harnessType: "builtin",
		modelTierPreference: "workhorse",
		modelId: "claude-sonnet-4-6",
		modelProvider: "anthropic",
	});
	await db.insert(serviceConnections).values({
		id: "au2-connection-1",
		userId: "au2-human-1",
		service: "github",
		authSource: "mcp",
		serverUrl: "https://mcp.example.test",
		health: "working",
		createdAt: NOW,
		updatedAt: NOW,
	});
}
