import {
	type AgentRunConfigRow,
	agentRunConfig,
	configurationOverrides,
	type HyperIdleDb,
	pluginConfigurationDefaults,
	type Routine,
	routines,
	type ServiceConnectionRow,
	serviceConnections,
	teamMembers,
	teams,
	type User,
	users,
} from "@hyperidle/db";
import { createTestDb, type TestDbHandle } from "@hyperidle/db/testing";
import {
	BUILTIN_PLUGIN_ID,
	CONFIGURATION_KINDS,
	type ConfigurationKind,
} from "@hyperidle/domain-model";
import { eq, inArray, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	type BackfillLegacyConfigurationDeps,
	backfillConfigurationDefaults,
	listConfiguration,
	type PluginConfigurationSeed,
	seedConfigurationDefaults,
	setPluginState,
	writeConfigurationOverride,
} from "../index.js";

const NOW = "2026-07-08T10:00:00.000Z";

/**
 * @lore AU19 Increment 1f: test stand-ins for `settings`' `RoutineReader`/
 * `SettingsUserDirectory`/`ServiceConnectionsReader` ports (Mechanism C) — a
 * plain drizzle query against `routines`/`users`/`serviceConnections`, the
 * exact query the real ports wire to in production (`@hyperidle/users`'
 * `listUsersByKind` / `routine-service.ts`'s `listRoutines` / a raw
 * `serviceConnections` query — `connections` hasn't migrated yet), same
 * precedent as `@hyperidle/org`'s `org-routing.integration.test.ts` stand-in.
 */
const settingsDeps: BackfillLegacyConfigurationDeps = {
	users: {
		async listUsersByKind(db: HyperIdleDb, kind: string): Promise<User[]> {
			return db.select().from(users).where(eq(users.kind, kind));
		},
	},
	routines: {
		async listRoutines(db: HyperIdleDb, opts?: { includeDeleted?: boolean }): Promise<Routine[]> {
			if (opts?.includeDeleted) {
				return db.select().from(routines);
			}
			return db.select().from(routines).where(isNull(routines.deletedAt));
		},
	},
	serviceConnections: {
		async listByAuthSource(db: HyperIdleDb, authSource: string): Promise<ServiceConnectionRow[]> {
			return db
				.select()
				.from(serviceConnections)
				.where(eq(serviceConnections.authSource, authSource));
		},
	},
	// AU26 G1: the run-config half of the projected agent, read from its own table.
	agentRunConfig: {
		async readAgentRunConfigs(db: HyperIdleDb, agentUserIds: readonly string[]) {
			const result = new Map<string, AgentRunConfigRow>();
			if (agentUserIds.length === 0) return result;
			const rows = await db
				.select()
				.from(agentRunConfig)
				.where(inArray(agentRunConfig.agentUserId, [...agentUserIds]));
			for (const row of rows) result.set(row.agentUserId, row);
			return result;
		},
	},
};

const PLUGIN_SOURCE = {
	id: "plugin.alpha",
	name: "Alpha Plugin",
	version: "1.0.0",
} as const;

describe("plugin configuration service", () => {
	let handle: TestDbHandle;

	beforeEach(async () => {
		handle = await createTestDb();
	});

	afterEach(async () => {
		await handle.close();
	});

	test("loads fixture plugin defaults for every kind with plugin provenance", async () => {
		await seedConfigurationDefaults(handle.db, {
			source: PLUGIN_SOURCE,
			defaults: CONFIGURATION_KINDS.map((kind) => seed(kind, `${kind}.alpha`)),
			now: NOW,
		});

		const entries = await listConfiguration(handle.db);

		expect(entries).toHaveLength(CONFIGURATION_KINDS.length);
		for (const kind of CONFIGURATION_KINDS) {
			expect(entries).toContainEqual(
				expect.objectContaining({
					kind,
					key: `${kind}.alpha`,
					activeValue: expectedValue(kind, `${kind} alpha`),
					defaultValue: expectedValue(kind, `${kind} alpha`),
					userValue: null,
					valueSource: "default",
					active: true,
					origin: {
						type: "plugin",
						pluginId: "plugin.alpha",
						pluginName: "Alpha Plugin",
						pluginState: "enabled",
						defaultVersionHash: expect.any(String),
					},
				}),
			);
		}
	});

	test("user overrides win for every kind, survive default changes, and can reset to default", async () => {
		await seedConfigurationDefaults(handle.db, {
			source: PLUGIN_SOURCE,
			defaults: CONFIGURATION_KINDS.map((kind) => seed(kind, `${kind}.alpha`, "v1")),
			now: NOW,
		});

		for (const kind of CONFIGURATION_KINDS) {
			await writeConfigurationOverride(handle.db, {
				kind,
				key: `${kind}.alpha`,
				value: expectedValue(kind, `${kind} user`),
				now: "2026-07-08T10:01:00.000Z",
			});
		}

		await seedConfigurationDefaults(handle.db, {
			source: { ...PLUGIN_SOURCE, version: "1.1.0" },
			defaults: CONFIGURATION_KINDS.map((kind) => seed(kind, `${kind}.alpha`, "v2")),
			now: "2026-07-08T10:02:00.000Z",
		});

		for (const kind of CONFIGURATION_KINDS) {
			const entry = await findConfiguration(kind, `${kind}.alpha`);
			expect(entry).toEqual(
				expect.objectContaining({
					kind,
					key: `${kind}.alpha`,
					activeValue: expectedValue(kind, `${kind} user`),
					defaultValue: expectedValue(kind, `${kind} v2`),
					userValue: expectedValue(kind, `${kind} user`),
					valueSource: "user_override",
					active: true,
					origin: expect.objectContaining({
						type: "plugin",
						pluginId: "plugin.alpha",
						pluginState: "enabled",
					}),
				}),
			);
		}

		await writeConfigurationOverride(handle.db, {
			kind: "agent",
			key: "agent.alpha",
			value: null,
			now: "2026-07-08T10:03:00.000Z",
		});

		expect(await findConfiguration("agent", "agent.alpha")).toEqual(
			expect.objectContaining({
				activeValue: { label: "agent v2" },
				userValue: null,
				valueSource: "default",
			}),
		);
	});

	test("disabled and removed plugin states are explicit without deleting overrides", async () => {
		await seedConfigurationDefaults(handle.db, {
			source: PLUGIN_SOURCE,
			defaults: [seed("agent", "agent.alpha"), seed("tool", "tool.alpha")],
			now: NOW,
		});
		await writeConfigurationOverride(handle.db, {
			kind: "agent",
			key: "agent.alpha",
			value: { label: "agent user" },
			now: "2026-07-08T10:01:00.000Z",
		});

		await setPluginState(handle.db, "plugin.alpha", "disabled", "2026-07-08T10:02:00.000Z");

		expect(await findConfiguration("agent", "agent.alpha")).toEqual(
			expect.objectContaining({
				activeValue: { label: "agent user" },
				valueSource: "user_override",
				active: true,
				origin: expect.objectContaining({ pluginState: "disabled" }),
			}),
		);
		expect(await findConfiguration("tool", "tool.alpha")).toEqual(
			expect.objectContaining({
				activeValue: { label: "tool alpha" },
				valueSource: "default",
				active: false,
				origin: expect.objectContaining({ pluginState: "disabled" }),
			}),
		);

		await setPluginState(handle.db, "plugin.alpha", "removed", "2026-07-08T10:03:00.000Z");

		expect(await findConfiguration("agent", "agent.alpha")).toEqual(
			expect.objectContaining({
				activeValue: { label: "agent user" },
				valueSource: "user_override",
				active: true,
				origin: expect.objectContaining({ pluginState: "removed" }),
			}),
		);
		expect(await findConfiguration("tool", "tool.alpha")).toEqual(
			expect.objectContaining({
				active: false,
				origin: expect.objectContaining({ pluginState: "removed" }),
			}),
		);
	});

	test("built-in defaults load through the same resolver and override path", async () => {
		await seedConfigurationDefaults(handle.db, {
			defaults: CONFIGURATION_KINDS.map((kind) => seed(kind, `${kind}.builtin`)),
			now: NOW,
		});
		await writeConfigurationOverride(handle.db, {
			kind: "mcp_server",
			key: "mcp_server.builtin",
			value: { label: "edited MCP default" },
			now: "2026-07-08T10:01:00.000Z",
		});

		const entries = await listConfiguration(handle.db);

		expect(entries.map((entry) => entry.kind).sort()).toEqual([...CONFIGURATION_KINDS].sort());
		expect(entries.every((entry) => entry.origin.type === "builtin")).toBe(true);
		expect(entries.every((entry) => entry.origin.pluginId === BUILTIN_PLUGIN_ID)).toBe(true);
		expect(await findConfiguration("mcp_server", "mcp_server.builtin")).toEqual(
			expect.objectContaining({
				activeValue: { label: "edited MCP default" },
				defaultValue: { label: "mcp_server alpha" },
				valueSource: "user_override",
				active: true,
				origin: expect.objectContaining({
					type: "builtin",
					pluginId: "builtin",
					pluginState: "enabled",
				}),
			}),
		);
	});

	test("legacy users, routines, tools, MCP, and harness data are visible after backfill", async () => {
		await seedLegacyData(handle);

		await backfillConfigurationDefaults(handle.db, settingsDeps, NOW);

		const entries = await listConfiguration(handle.db);
		expect(entries).toContainEqual(
			expect.objectContaining({
				kind: "agent",
				key: "agent.agent-1",
				activeValue: expect.objectContaining({
					id: "agent-1",
					name: "Builder Agent",
					harnessType: "builtin",
				}),
				origin: expect.objectContaining({ type: "builtin" }),
			}),
		);
		expect(entries).toContainEqual(
			expect.objectContaining({
				kind: "routine",
				key: "routine.routine-1",
				activeValue: expect.objectContaining({ id: "routine-1", name: "Daily digest" }),
			}),
		);
		expect(entries).toContainEqual(
			expect.objectContaining({
				kind: "mcp_server",
				key: "mcp_server.user-1.github",
				activeValue: expect.objectContaining({ service: "github", authSource: "mcp" }),
			}),
		);
		expect(entries).toContainEqual(
			expect.objectContaining({
				kind: "harness_descriptor",
				key: "harness_descriptor.builtin",
				activeValue: expect.objectContaining({ type: "builtin" }),
			}),
		);
		expect(entries).toContainEqual(
			expect.objectContaining({
				kind: "tool",
				key: "tool.submit_review",
				activeValue: expect.objectContaining({ name: "submit_review" }),
			}),
		);
	});

	test("rejects secret-bearing plugin defaults recursively without persisting", async () => {
		await expect(
			seedConfigurationDefaults(handle.db, {
				source: PLUGIN_SOURCE,
				defaults: [
					{
						kind: "tool",
						key: "tool.secretive",
						value: { label: "bad", nested: { apiKey: "sk-test" } },
					},
				],
				now: NOW,
			}),
		).rejects.toThrow(/secret-bearing field/i);

		expect(await defaultRows()).toHaveLength(0);
		expect(await overrideRows()).toHaveLength(0);
	});

	test("rejects secret-bearing user overrides recursively without persisting", async () => {
		await seedConfigurationDefaults(handle.db, {
			source: PLUGIN_SOURCE,
			defaults: [seed("agent", "agent.alpha")],
			now: NOW,
		});

		await expect(
			writeConfigurationOverride(handle.db, {
				kind: "agent",
				key: "agent.alpha",
				value: { label: "bad", credentials: { token: "hidden" } },
				now: "2026-07-08T10:01:00.000Z",
			}),
		).rejects.toThrow(/secret-bearing field/i);

		expect(await overrideRows()).toHaveLength(0);
		expect(await findConfiguration("agent", "agent.alpha")).toEqual(
			expect.objectContaining({
				activeValue: { label: "agent alpha" },
				userValue: null,
				valueSource: "default",
			}),
		);
	});

	test("rejects invalid MCP server URLs in defaults and overrides without persisting", async () => {
		await expect(
			seedConfigurationDefaults(handle.db, {
				source: PLUGIN_SOURCE,
				defaults: [
					{
						kind: "mcp_server",
						key: "mcp_server.bad",
						value: { label: "bad mcp", serverUrl: "file:///tmp/socket" },
					},
				],
				now: NOW,
			}),
		).rejects.toThrow(/http\/https URL/i);
		expect(await defaultRows()).toHaveLength(0);

		await seedConfigurationDefaults(handle.db, {
			source: PLUGIN_SOURCE,
			defaults: [
				{
					kind: "mcp_server",
					key: "mcp_server.good",
					value: { label: "good mcp", serverUrl: "https://mcp.example.test" },
				},
			],
			now: "2026-07-08T10:01:00.000Z",
		});

		await expect(
			writeConfigurationOverride(handle.db, {
				kind: "mcp_server",
				key: "mcp_server.good",
				value: { label: "bad override", serverUrl: "ftp://mcp.example.test" },
				now: "2026-07-08T10:02:00.000Z",
			}),
		).rejects.toThrow(/http\/https URL/i);

		expect(await overrideRows()).toHaveLength(0);
		expect(await findConfiguration("mcp_server", "mcp_server.good")).toEqual(
			expect.objectContaining({
				activeValue: { label: "good mcp", serverUrl: "https://mcp.example.test" },
				userValue: null,
				valueSource: "default",
			}),
		);
	});

	async function defaultRows() {
		return handle.db
			.select()
			.from(pluginConfigurationDefaults)
			.where(eq(pluginConfigurationDefaults.pluginId, PLUGIN_SOURCE.id));
	}

	async function overrideRows() {
		return handle.db.select().from(configurationOverrides);
	}

	async function findConfiguration(kind: ConfigurationKind, key: string) {
		const [entry] = await listConfiguration(handle.db, { kind, key });
		return entry ?? null;
	}
});

function seed(
	kind: ConfigurationKind,
	key: string,
	labelSuffix = "alpha",
): PluginConfigurationSeed {
	return {
		kind,
		key,
		value: expectedValue(kind, `${kind} ${labelSuffix}`),
	};
}

function expectedValue(kind: ConfigurationKind, label: string): Record<string, unknown> {
	if (kind === "trigger") {
		return {
			eventType: "routine.fire",
			sourceKind: "routine",
			scope: { sourceId: label, teamId: "team-1" },
			agentId: "agent-1",
			prompt: label,
			label,
		};
	}
	return { label };
}

async function seedLegacyData(handle: TestDbHandle): Promise<void> {
	await handle.db.insert(teams).values({
		id: "team-1",
		name: "Team",
		phase: "build",
		createdAt: NOW,
	});
	await handle.db.insert(teamMembers).values({
		id: "members-1",
		teamId: "team-1",
		capacity: 3,
		activeBets: 0,
		formedAt: NOW,
	});
	await handle.db.insert(users).values([
		{
			id: "agent-1",
			kind: "ai",
			name: "Builder Agent",
			role: "builder",
			status: "active",
			teamId: "members-1",
			createdAt: NOW,
		},
		{
			id: "user-1",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		},
	]);
	await handle.db.insert(agentRunConfig).values({
		agentUserId: "agent-1",
		systemPrompt: "Build carefully.",
		harnessType: "builtin",
		modelTierPreference: "workhorse",
		modelId: "claude-sonnet-4-6",
		modelProvider: "anthropic",
	});
	await handle.db.insert(routines).values({
		id: "routine-1",
		name: "Daily digest",
		description: "Summarize",
		ownerAgentId: "agent-1",
		teamId: "team-1",
		triggerType: "schedule",
		triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
		state: "active",
		active: true,
		createdAt: NOW,
	});
	await handle.db.insert(serviceConnections).values({
		id: "connection-1",
		userId: "user-1",
		service: "github",
		authSource: "mcp",
		serverUrl: "https://mcp.example.test",
		health: "working",
		createdAt: NOW,
		updatedAt: NOW,
	});
}
