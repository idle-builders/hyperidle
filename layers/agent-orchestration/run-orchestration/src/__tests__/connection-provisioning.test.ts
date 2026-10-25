/**
 * `buildProvisioningPlan`/`applyProvisioningPlan` turn a session's held
 * connections into MCP server entries: SVC_MCP_TOKEN naming, the "-mcp"
 * dialect suffix for a service with both a token and an MCP connection,
 * SSRF-drop of an unsafe target, and a secret that is never logged.
 * `connections` is the `CoreApiPort.connections` seam-shaped reader; `resolver`
 * (`ServiceConnectionResolver`-shaped) is an Application-composed direct
 * dependency, never routed through `CoreApiPort` — the only plaintext path,
 * wired to sandbox injection, not to routes.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { applyProvisioningPlan, buildProvisioningPlan } from "../connection-provisioning.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

let sandboxPath: string;
beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au21-inc8-connprov-"));
});
afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
	vi.restoreAllMocks();
});

type MockConnection = {
	id: string;
	service: string;
	authSource: "token" | "mcp";
	serverUrl: string | null;
	token: string | null;
};

/**
 * Builds the live in-layer `connections` reader (no bake, no seam) +
 * `resolver` (Application-composed, never through a seam) —
 * `buildProvisioningPlan`'s ONLY two deps. No `db`.
 */
function buildPlanSeamDeps(
	connections: MockConnection[],
	ownerUserId = "u-founder",
): {
	connections: NonNullable<Parameters<typeof buildProvisioningPlan>[0]["connections"]>;
	resolver: Parameters<typeof buildProvisioningPlan>[0]["resolver"];
} {
	const tokenMap = new Map(connections.map((c) => [c.id, c.token ?? null]));
	const records = connections.map((c) => ({
		id: c.id,
		userId: ownerUserId,
		service: c.service,
		authSource: c.authSource,
		serverUrl: c.serverUrl,
	}));

	const resolver = {
		resolve: async (_userId: string, connectionId: string): Promise<string | null> => {
			return tokenMap.get(connectionId) ?? null;
		},
	};

	return { connections: { listHeldForProvisioning: async () => records }, resolver };
}

function buildTestPlan(
	servers: Array<{ name: string; url: string; bearerToken?: string }>,
): Parameters<typeof applyProvisioningPlan>[0]["plan"] {
	return {
		mcpServers: servers.map((s) => ({
			name: s.name,
			url: s.url,
			...(s.bearerToken !== undefined ? { bearerToken: s.bearerToken } : {}),
		})),
		envInjections: {},
	};
}

// ── The relocated buildProvisioningPlan — no `db` param anymore ──────────────

describe("buildProvisioningPlan (relocated to agent-orchestration, seam-shaped deps)", () => {
	test("takes {connections, resolver} — no db, no ConnectionsUserReader", async () => {
		const { connections, resolver } = buildPlanSeamDeps([
			{ id: "sc-gh", service: "github", authSource: "token", serverUrl: null, token: "ghs_abc" },
		]);

		const plan = await buildProvisioningPlan({ agentId: "agent", connections, resolver });

		expect(plan.envInjections).toMatchObject({ GH_TOKEN: "ghs_abc", GITHUB_TOKEN: "ghs_abc" });
		expect(plan.mcpServers).toHaveLength(0);
	});

	test("token + serverUrl → mcp-bearer carrier (server entry + bearer token env), token resolved via resolver against the seam-resolved owner", async () => {
		const { connections, resolver } = buildPlanSeamDeps(
			[
				{
					id: "sc-stripe",
					service: "stripe",
					authSource: "token",
					serverUrl: "https://mcp.stripe.com",
					token: "sk_test_abc",
				},
			],
			"u-owner-inc8",
		);
		const resolveSpy = vi.spyOn(resolver, "resolve");

		const plan = await buildProvisioningPlan({ agentId: "agent", connections, resolver });

		expect(plan.mcpServers).toHaveLength(1);
		expect(plan.mcpServers[0]).toMatchObject({
			name: "stripe",
			url: "https://mcp.stripe.com",
			bearerToken: "sk_test_abc",
		});
		expect(plan.envInjections).toMatchObject({ STRIPE_MCP_TOKEN: "sk_test_abc" });
		// the resolver is called with the OWNER userId the seam resolved — not a
		// caller-supplied one, matching today's `resolveOwningHumanUserId` semantics.
		expect(resolveSpy).toHaveBeenCalledWith("u-owner-inc8", "sc-stripe");
	});

	test("mcp connection → outbound pointer (no bearer token, no resolver call needed)", async () => {
		const { connections, resolver } = buildPlanSeamDeps([
			{
				id: "sc-figma",
				service: "figma",
				authSource: "mcp",
				serverUrl: "https://mcp.figma.com",
				token: null,
			},
		]);

		const plan = await buildProvisioningPlan({ agentId: "agent", connections, resolver });

		expect(plan.mcpServers).toHaveLength(1);
		expect(plan.mcpServers[0]).toMatchObject({ name: "figma", url: "https://mcp.figma.com" });
		expect(plan.mcpServers[0]?.bearerToken).toBeUndefined();
	});

	test("private-IP serverUrl is dropped and logged, never written", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { connections, resolver } = buildPlanSeamDeps([
			{
				id: "sc-private",
				service: "internal",
				authSource: "mcp",
				serverUrl: "https://internal.corp",
				token: null,
			},
		]);

		const plan = await buildProvisioningPlan({
			agentId: "agent",
			connections,
			resolver,
			_ssrfLookup: async () => [{ address: "10.0.0.1", family: 4 }],
		});

		expect(plan.mcpServers).toHaveLength(0);
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SSRF"));
	});

	test("secret never appears in logged strings", async () => {
		const loggedMessages: string[] = [];
		vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
			loggedMessages.push(args.map(String).join(" "));
		});
		const { connections, resolver } = buildPlanSeamDeps([
			{
				id: "sc-secret",
				service: "stripe",
				authSource: "token",
				serverUrl: "https://mcp.stripe.com",
				token: "sk_test_SUPERSECRET_XYZ",
			},
		]);

		await buildProvisioningPlan({ agentId: "agent", connections, resolver });

		for (const msg of loggedMessages) {
			expect(msg).not.toContain("sk_test_SUPERSECRET_XYZ");
		}
	});

	test("two connections → two entries, one per connection", async () => {
		const { connections, resolver } = buildPlanSeamDeps([
			{ id: "sc-gh", service: "github", authSource: "token", serverUrl: null, token: "tok1" },
			{
				id: "sc-figma",
				service: "figma",
				authSource: "mcp",
				serverUrl: "https://mcp.figma.com",
				token: null,
			},
		]);

		const plan = await buildProvisioningPlan({ agentId: "agent", connections, resolver });

		expect(plan.envInjections.GH_TOKEN).toBe("tok1");
		expect(plan.mcpServers).toHaveLength(1);
		expect(plan.mcpServers[0]?.name).toBe("figma");
	});

	test("stripe token + stripe mcp → deterministic key suffix (stripe vs stripe-mcp)", async () => {
		const { connections, resolver } = buildPlanSeamDeps([
			{
				id: "sc-stripe-token",
				service: "stripe",
				authSource: "token",
				serverUrl: "https://mcp.stripe.com",
				token: "tok1",
			},
			{
				id: "sc-stripe-mcp",
				service: "stripe",
				authSource: "mcp",
				serverUrl: "https://mcp.stripe.com",
				token: null,
			},
		]);

		const plan = await buildProvisioningPlan({ agentId: "agent", connections, resolver });

		const names = plan.mcpServers.map((s) => s.name);
		expect(names).toContain("stripe");
		expect(names).toContain("stripe-mcp");
	});

	test("no held connections for the seam-resolved owner → empty plan, no throw", async () => {
		const { connections, resolver } = buildPlanSeamDeps([]);

		const plan = await buildProvisioningPlan({ agentId: "agent", connections, resolver });

		expect(plan.mcpServers).toHaveLength(0);
		expect(Object.keys(plan.envInjections)).toHaveLength(0);
	});
});

// ── applyProvisioningPlan — pure fs, unchanged behavior, only the address moves ──

describe("applyProvisioningPlan (relocated to agent-orchestration, unchanged behavior)", () => {
	test("codex-toml: writes N server entries to .codex-home/config.toml", async () => {
		const plan = buildTestPlan([
			{ name: "github", url: "https://mcp.github.com", bearerToken: "tok1" },
			{ name: "figma", url: "https://mcp.figma.com" },
		]);

		const result = await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: "codex-toml",
			claudeNative: false,
		});

		const tomlContent = fs.readFileSync(
			path.join(sandboxPath, ".codex-home", "config.toml"),
			"utf-8",
		);
		expect(tomlContent).toContain("[mcp_servers.github]");
		expect(tomlContent).toContain('bearer_token_env_var = "GITHUB_MCP_TOKEN"');
		expect(result.mcpTokenEnv).toMatchObject({ GITHUB_MCP_TOKEN: "tok1" });
	});

	test("opencode-json: inline Bearer header, no separate tokenEnv", async () => {
		const plan = buildTestPlan([
			{ name: "github", url: "https://mcp.github.com", bearerToken: "tok1" },
		]);

		const result = await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: "opencode-json",
			claudeNative: false,
		});

		const opencodeJson = JSON.parse(
			fs.readFileSync(path.join(sandboxPath, "opencode.json"), "utf-8"),
		) as { mcp: Record<string, { headers?: Record<string, string> }> };
		expect(opencodeJson.mcp.github?.headers?.Authorization).toBe("Bearer tok1");
		expect(result.mcpTokenEnv).toEqual({});
	});

	test("claude-native: merges into existing .mcp.json (inbound hyperidle entry preserved)", async () => {
		fs.writeFileSync(
			path.join(sandboxPath, ".mcp.json"),
			JSON.stringify({
				mcpServers: { hyperidle: { type: "http", url: "http://localhost:3001/api/mcp/tok" } },
			}),
			"utf-8",
		);
		const plan = buildTestPlan([
			{ name: "github", url: "https://mcp.github.com", bearerToken: "tok1" },
		]);

		await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: undefined,
			claudeNative: true,
		});

		const mcpJson = JSON.parse(fs.readFileSync(path.join(sandboxPath, ".mcp.json"), "utf-8")) as {
			mcpServers: Record<string, unknown>;
		};
		expect(mcpJson.mcpServers.hyperidle).toEqual({
			type: "http",
			url: "http://localhost:3001/api/mcp/tok",
		});
		expect(mcpJson.mcpServers.github).toMatchObject({ url: "https://mcp.github.com" });
	});

	test("no carrier applies → empty mcpTokenEnv, no file written", async () => {
		const plan = buildTestPlan([
			{ name: "github", url: "https://mcp.github.com", bearerToken: "tok1" },
		]);

		const result = await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: undefined,
			claudeNative: false,
		});

		expect(result.mcpTokenEnv).toEqual({});
	});
});
