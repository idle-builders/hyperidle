import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { serviceConnections, teamMembers, teams, userSkills, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../harness/builtin-harness-adapter.js";
import { DisabledSandboxAdapter } from "../harness/disabled-sandbox-adapter.js";
import { createServer, type ServerHandle } from "../server-factory.js";
import {
	getResolvedConfiguration,
	listResolvedConfiguration,
} from "../services/plugin-configuration.js";
import { test } from "../test-fixtures.js";

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
			const entries = await listResolvedConfiguration(db);

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
					kind: "skill",
					key: "skill.au2-agent-1.review",
					activeValue: expect.objectContaining({ userId: "au2-agent-1", skillId: "review" }),
					origin: expect.objectContaining({ type: "builtin" }),
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
				await getResolvedConfiguration(db, "harness_descriptor", "harness_descriptor.builtin"),
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
	return createServer(0, {
		db,
		adapterPool: makeBuiltinPool(),
		workspaceAdapter: new DisabledSandboxAdapter(),
		sandboxBasePath: path.join(os.tmpdir(), label),
	});
}

function makeBuiltinPool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-builtin", new BuiltinHarnessAdapter(), {
		name: "Built-in Harness",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
	});
	return pool;
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
			systemPrompt: "Build AU2.",
			harnessType: "builtin",
			modelTierPreference: "workhorse",
			modelId: "claude-sonnet-4-6",
			modelProvider: "anthropic",
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
	await db.insert(userSkills).values({
		userId: "au2-agent-1",
		skillId: "review",
		autonomyLevel: 3,
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
