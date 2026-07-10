import { Hono } from "hono";
import { failClosedAssertion } from "../../middleware/access-boundary-middleware.js";
import { authMiddleware } from "../../middleware/auth.js";
import {
	loadBuiltInConfigurationDefaults,
	loadPluginConfigurationDefaults,
	setConfigurationOverride,
	setPluginConfigurationState,
} from "../../services/plugin-configuration.js";
import { describe, expect, test, vi } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-au5-agent-behavior";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

async function seedAgentBehaviorConfig(db: Parameters<typeof loadBuiltInConfigurationDefaults>[0]) {
	await loadBuiltInConfigurationDefaults(db, {
		defaults: [
			{
				kind: "agent",
				key: "agent.ast-founder",
				value: {
					id: "ast-founder",
					name: "Assistant",
					role: "assistant",
					systemPrompt: "Help the founder.",
					harnessType: "builtin",
				},
			},
			{
				kind: "skill",
				key: "skill.ast-founder.create-bet",
				value: {
					userId: "ast-founder",
					skillId: "create-bet",
					autonomyLevel: 3,
				},
			},
			{
				kind: "routine",
				key: "routine.daily-product-scan",
				value: {
					id: "daily-product-scan",
					name: "Daily product scan",
					ownerAgentId: "agent-product-manager",
					triggerType: "calendar",
					triggerConfig: { cron: "0 8 * * 1-5" },
					active: true,
				},
			},
			{
				kind: "tool",
				key: "tool.create_task",
				value: {
					name: "create_task",
					description: "Create a task from agent output.",
					enabled: true,
				},
			},
			{
				kind: "mcp_server",
				key: "mcp_server.figma",
				value: {
					id: "mcp-figma",
					service: "Figma",
					serverUrl: "https://mcp.figma.example/sse",
					health: "working",
				},
			},
			{
				kind: "trigger",
				key: "trigger.task-accepted",
				value: {
					eventType: "task.accepted",
					sourceKind: "task",
					agentId: "ast-founder",
				},
			},
		],
		now: "2026-07-09T12:00:00Z",
	});

	await loadPluginConfigurationDefaults(db, {
		plugin: { id: "plugin.product-os", name: "Product OS", version: "1.0.0" },
		defaults: [
			{
				kind: "trigger",
				key: "trigger.daily-product-scan",
				value: {
					eventType: "routine.fire",
					sourceKind: "routine",
					scope: { sourceId: "daily-product-scan", teamId: "team-product" },
					agentId: "agent-product-manager",
					prompt: "Summarize customer signals and propose tasks.",
				},
			},
		],
		now: "2026-07-09T12:01:00Z",
	});

	await loadPluginConfigurationDefaults(db, {
		plugin: { id: "plugin.growth", name: "Growth", version: "1.0.0" },
		defaults: [
			{
				kind: "trigger",
				key: "trigger.growth-digest",
				value: {
					eventType: "routine.fire",
					sourceKind: "routine",
					scope: { sourceId: "growth-digest" },
					agentId: "agent-growth",
					prompt: "Inspect growth metrics.",
				},
			},
		],
		now: "2026-07-09T12:02:00Z",
	});
	await setPluginConfigurationState(db, "plugin.growth", "disabled", {
		now: "2026-07-09T12:03:00Z",
	});

	await loadPluginConfigurationDefaults(db, {
		plugin: { id: "plugin.legacy", name: "Legacy Ops", version: "0.9.0" },
		defaults: [
			{
				kind: "tool",
				key: "tool.legacy_report",
				value: {
					name: "legacy_report",
					description: "Old report generator.",
					enabled: true,
				},
			},
		],
		now: "2026-07-09T12:04:00Z",
	});
	await setPluginConfigurationState(db, "plugin.legacy", "removed", {
		now: "2026-07-09T12:05:00Z",
	});

	await setConfigurationOverride(db, {
		kind: "trigger",
		key: "trigger.daily-product-scan",
		value: {
			eventType: "routine.fire",
			sourceKind: "routine",
			scope: { sourceId: "daily-product-scan", teamId: "team-product" },
			agentId: "agent-product-lead",
			prompt: "Summarize customer signals, then propose the next task.",
		},
		now: "2026-07-09T12:06:00Z",
	});
}

async function createAgentBehaviorTestApp(
	db: Parameters<typeof loadBuiltInConfigurationDefaults>[0],
): Promise<Hono> {
	const routeModule = (await import(`${"../settings-agent-behavior.js"}`)) as {
		createAgentBehaviorSettingsRoutes: (routeDb: typeof db) => Hono;
	};
	const app = new Hono();
	app.use("/api/*", authMiddleware);
	app.use("/api/*", failClosedAssertion());
	app.route("/api/settings/agent-behavior", routeModule.createAgentBehaviorSettingsRoutes(db));
	return app;
}

describe("agent behavior settings API", () => {
	test("GET projects all six user-facing kinds with provenance and no Fabric/Strategy vocabulary", async ({
		db,
		eventBus,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAgentBehaviorConfig(db);
		void eventBus;
		const app = await createAgentBehaviorTestApp(db);

		const res = await app.request("/api/settings/agent-behavior/config", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<Record<string, unknown>> };
		const kinds = new Set(body.items.map((item) => item.kind));
		expect(kinds).toEqual(new Set(["agent", "skill", "routine", "trigger", "tool", "mcp"]));
		expect(JSON.stringify(body)).not.toMatch(/Fabric|Strategy/i);

		const productTrigger = body.items.find(
			(item) => item.id === "trigger:trigger.daily-product-scan",
		);
		expect(productTrigger).toMatchObject({
			kind: "trigger",
			name: "Daily product scan",
			valueSource: "user_override",
			activeSummary: expect.stringContaining("agent-product-lead"),
			trigger: {
				occasionKind: "routine.fire",
				sourceId: "daily-product-scan",
				selectedAgentLabel: "agent-product-lead",
				promptSource: "trigger",
				ownershipLabel: "User override active",
			},
		});
		expect(productTrigger?.origin).toMatchObject({
			type: "plugin",
			label: "Product OS plugin",
			state: "enabled",
		});

		const builtinTrigger = body.items.find((item) => item.id === "trigger:trigger.task-accepted");
		expect(builtinTrigger).toMatchObject({
			kind: "trigger",
			valueSource: "default",
			activeSummary: "ast-founder · no event-specific prompt",
			trigger: {
				occasionKind: "task.accepted",
				selectedAgentLabel: "ast-founder",
				promptSource: "none",
				ownershipLabel: "Built-in default",
			},
		});

		const fallbackTrigger = body.items.find((item) => item.id === "trigger:fallback.default");
		expect(fallbackTrigger).toMatchObject({
			kind: "trigger",
			name: "No matching trigger",
			valueSource: "fallback",
			active: true,
			activeSummary: "Default eligible agent · no event-specific prompt",
			statusLabel: "Fallback",
			trigger: {
				occasionKind: "fallback.no_match",
				selectedAgentLabel: "Default eligible agent",
				promptSource: "none",
				ownershipLabel: "Fallback",
			},
		});

		const disabledTrigger = body.items.find((item) => item.id === "trigger:trigger.growth-digest");
		expect(disabledTrigger).toMatchObject({
			kind: "trigger",
			valueSource: "default",
			active: false,
			statusLabel: "Inactive: plugin disabled",
			origin: { label: "Growth plugin", state: "disabled" },
		});

		const removedTool = body.items.find((item) => item.id === "tool:tool.legacy_report");
		expect(removedTool).toMatchObject({
			kind: "tool",
			active: false,
			statusLabel: "Needs attention: origin removed",
			origin: { label: "Legacy Ops plugin", state: "removed" },
		});

		const mcp = body.items.find((item) => item.id === "mcp:mcp_server.figma");
		expect(mcp).toMatchObject({
			kind: "mcp",
			name: "Figma",
			activeSummary: expect.stringContaining("https://mcp.figma.example/sse"),
			editableFields: [],
		});
	});

	test("PATCH saves supported agent, trigger, and tool edits as active user overrides", async ({
		db,
		eventBus,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAgentBehaviorConfig(db);
		void eventBus;
		const app = await createAgentBehaviorTestApp(db);

		for (const [id, fields] of [
			["agent:agent.ast-founder", { name: "Founder Assistant" }],
			[
				"trigger:trigger.daily-product-scan",
				{ agentId: "agent-ops-lead", prompt: "Escalate blockers and propose one task." },
			],
			["tool:tool.create_task", { enabled: false }],
		] as const) {
			const res = await app.request(
				`/api/settings/agent-behavior/config/${encodeURIComponent(id)}`,
				{
					method: "PATCH",
					headers: { ...authHeaders(), "Content-Type": "application/json" },
					body: JSON.stringify({ fields }),
				},
			);
			expect(res.status).toBe(200);
			const body = (await res.json()) as { item: Record<string, unknown> };
			expect(body.item).toMatchObject({ id, valueSource: "user_override" });
		}

		const reload = await app.request("/api/settings/agent-behavior/config", {
			headers: authHeaders(),
		});
		const body = (await reload.json()) as { items: Array<Record<string, unknown>> };
		expect(body.items.find((item) => item.id === "agent:agent.ast-founder")).toMatchObject({
			activeSummary: expect.stringContaining("Founder Assistant"),
			valueSource: "user_override",
		});
		expect(
			body.items.find((item) => item.id === "trigger:trigger.daily-product-scan"),
		).toMatchObject({
			activeSummary: expect.stringContaining("agent-ops-lead"),
			valueSource: "user_override",
		});
		expect(body.items.find((item) => item.id === "tool:tool.create_task")).toMatchObject({
			activeSummary: "Create a task from agent output.",
			valueSource: "user_override",
		});
	});

	test("PATCH rejects unknown fields, invalid values, secret-bearing values, and MCP URL edits", async ({
		db,
		eventBus,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAgentBehaviorConfig(db);
		void eventBus;
		const app = await createAgentBehaviorTestApp(db);

		for (const [id, fields, status, code] of [
			["agent:agent.ast-founder", { role: "owner" }, 400, "UNEDITABLE_FIELD"],
			["trigger:trigger.daily-product-scan", { agentId: null }, 422, "INVALID_VALUE"],
			[
				"trigger:trigger.daily-product-scan",
				{ prompt: { token: "secret-token" } },
				422,
				"SECRET_VALUE_REJECTED",
			],
			[
				"mcp:mcp_server.figma",
				{ serverUrl: "https://mcp.figma.example/realtime" },
				400,
				"UNEDITABLE_FIELD",
			],
		] as const) {
			const res = await app.request(
				`/api/settings/agent-behavior/config/${encodeURIComponent(id)}`,
				{
					method: "PATCH",
					headers: { ...authHeaders(), "Content-Type": "application/json" },
					body: JSON.stringify({ fields }),
				},
			);
			expect(res.status).toBe(status);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe(code);
		}
	});

	test("PATCH is route-limited with RATE_LIMITED responses", async ({ db, eventBus }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedAgentBehaviorConfig(db);
		void eventBus;
		const app = await createAgentBehaviorTestApp(db);

		let last: Response | null = null;
		for (let index = 0; index < 21; index += 1) {
			last = await app.request(
				`/api/settings/agent-behavior/config/${encodeURIComponent("agent:agent.ast-founder")}`,
				{
					method: "PATCH",
					headers: { ...authHeaders(), "Content-Type": "application/json" },
					body: JSON.stringify({ fields: { name: `Founder Assistant ${index}` } }),
				},
			);
		}

		expect(last?.status).toBe(429);
		const body = (await last?.json()) as { code: string };
		expect(body.code).toBe("RATE_LIMITED");
		expect(last?.headers.get("Retry-After")).toBeTruthy();
	});
});
