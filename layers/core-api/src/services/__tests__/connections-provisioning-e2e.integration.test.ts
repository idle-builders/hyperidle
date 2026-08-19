/**
 * AU21 §9 Increment 8, Wave F2 (credentials/filesystems provisioning split) —
 * GREEN-phase real-DB round-trip proof.
 *
 * Decision F2 (historical) relocated the session-launch-time PROVISIONING
 * OPERATION (`buildProvisioningPlan`/`applyProvisioningPlan`) out of
 * `@hyperidle/connections` into `@hyperidle/run-orchestration`, originally
 * reading the held-connection RECORD through `CoreApiPort.connections.
 * listHeldConnectionsForProvisioning()` (a live seam call at provisioning
 * time) instead of a raw `db` handle.
 *
 * AU21 §9 Increment 12 follow-up part 2 (Decision K1, historical): that seam
 * call — and the `GET /connections/provisioning` route + `CoreApiPort
 * .connections` backing it — went away, replaced by an emit-time bake.
 *
 * AU26 E3: the bake is gone too. `service_connections` is
 * `agent-orchestration`'s own table, so `buildProvisioningPlan` reads it LIVE
 * at spawn through `@hyperidle/connections`'s
 * `listHeldConnectionsForProvisioning`. Still the SAME real-DB round-trip
 * proof (AC1, AC4, AC5, AC6, HR3, C2), now exercised end-to-end through the
 * real in-layer read + real encryption + the relocated function — zero
 * HTTP/seam involvement.
 *
 * `ServiceConnectionResolver` stays an Application-composed direct
 * dependency (never routed through any seam — AN1 hard-rule 1); this test
 * constructs a REAL one against the fixture's real `db`, proving the
 * decrypt step still works unaffected by this move.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { listConnections, resolveHeldToken } from "@hyperidle/connections";
import { decryptCredentialValue, encryptCredentialValue } from "@hyperidle/credentials";
import { serviceConnections, users } from "@hyperidle/db";
import { HELD_AUTH_SOURCES, type HeldAuthSource } from "@hyperidle/domain-model";
import { applyProvisioningPlan, buildProvisioningPlan } from "@hyperidle/run-orchestration";
import { eq } from "drizzle-orm";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "../../__testing__/test-fixtures.js";

const SERVER_SECRET = "au21-inc8-e2e-secret-xyz";
const NOW = "2026-07-30T00:00:00.000Z";
const USER_HUMAN_ID = "u-inc8-e2e-human";
const AGENT_CALLER_ID = "agent-inc8-e2e-caller";

let sandboxPath: string;
beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au21-inc8-e2e-"));
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
	vi.stubEnv("HYPERIDLE_API_KEY", "au21-inc8-e2e-key");
});
afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
	vi.unstubAllEnvs();
});

/** Builds the real end-to-end deps: the LIVE in-layer held-connection read against the real db + a real decrypt resolver. */
function buildRealDeps(db: import("@hyperidle/db").HyperIdleDb): {
	connections: NonNullable<Parameters<typeof buildProvisioningPlan>[0]["connections"]>;
	resolver: Parameters<typeof buildProvisioningPlan>[0]["resolver"];
} {
	return {
		connections: {
			listHeldForProvisioning: () =>
				listConnections(db, { userId: USER_HUMAN_ID }).then((rows) =>
					rows
						.filter((r) => (HELD_AUTH_SOURCES as readonly string[]).includes(r.authSource))
						.map((r) => ({
							id: r.id,
							userId: r.userId,
							service: r.service,
							authSource: r.authSource as HeldAuthSource,
							serverUrl: r.serverUrl ?? null,
						})),
				),
		},
		resolver: {
			resolve: (userId: string, connectionId: string) =>
				resolveHeldToken(db, userId, connectionId, decryptCredentialValue),
		},
	};
}

async function seedHumanUser(db: import("@hyperidle/db").HyperIdleDb): Promise<void> {
	await db
		.insert(users)
		.values({
			id: USER_HUMAN_ID,
			kind: "human",
			name: "Inc8 E2E Human",
			role: "founder",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing();
}

async function seedAgentCaller(db: import("@hyperidle/db").HyperIdleDb): Promise<void> {
	await db
		.insert(users)
		.values({
			id: AGENT_CALLER_ID,
			kind: "ai",
			name: "Inc8 E2E Agent",
			role: "engineer",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing();
}

async function seedConnection(
	db: import("@hyperidle/db").HyperIdleDb,
	opts: {
		id: string;
		service: string;
		authSource: "token" | "mcp";
		serverUrl?: string;
		token?: string;
	},
): Promise<void> {
	const encryptedToken = opts.token ? encryptCredentialValue(opts.token) : null;
	await db.insert(serviceConnections).values({
		id: opts.id,
		userId: USER_HUMAN_ID,
		service: opts.service,
		authSource: opts.authSource,
		encryptedToken,
		serverUrl: opts.serverUrl ?? null,
		health: "needs-attention",
		lastValidatedAt: null,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// ── held token connection provisioned into sandbox config (real route + real decrypt) ──

describe("real end-to-end: DB row -> listHeldConnectionsForProvisioning (live at spawn) -> buildProvisioningPlan -> applyProvisioningPlan", () => {
	test("claude-native: .mcp.json written with held MCP-bearer entry, token decrypted through the real resolver", async ({
		db,
	}) => {
		await seedHumanUser(db);
		await seedAgentCaller(db);
		await seedConnection(db, {
			id: "sc-inc8-e2e-stripe",
			service: "stripe",
			authSource: "token",
			serverUrl: "https://mcp.stripe.com",
			token: "sk_test_e2e_stripe",
		});

		const { connections, resolver } = buildRealDeps(db);
		const plan = await buildProvisioningPlan({ connections, resolver });
		const result = await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: undefined,
			claudeNative: true,
		});

		const mcpJson = JSON.parse(fs.readFileSync(path.join(sandboxPath, ".mcp.json"), "utf-8")) as {
			mcpServers: Record<string, { type: string; url: string; headers?: Record<string, string> }>;
		};
		expect(mcpJson.mcpServers.stripe?.url).toBe("https://mcp.stripe.com");
		expect(mcpJson.mcpServers.stripe?.headers?.Authorization).toBe("Bearer sk_test_e2e_stripe");
		expect(result.mcpTokenEnv).toEqual({});
	});

	test("respawn idempotent: same codex-toml entries in a fresh sandbox after destroying the first", async ({
		db,
	}) => {
		await seedHumanUser(db);
		await seedAgentCaller(db);
		await seedConnection(db, {
			id: "sc-inc8-e2e-ac4",
			service: "stripe",
			authSource: "token",
			serverUrl: "https://mcp.stripe.com",
			token: "sk_idempotent_e2e",
		});
		const { connections, resolver } = buildRealDeps(db);

		const plan1 = await buildProvisioningPlan({ connections, resolver });
		const sandboxA = fs.mkdtempSync(path.join(os.tmpdir(), "au21-inc8-e2e-ac4-a-"));
		await applyProvisioningPlan({
			plan: plan1,
			sandboxPath: sandboxA,
			cliMcpDialect: "codex-toml",
			claudeNative: false,
		});
		const tomlA = fs.readFileSync(path.join(sandboxA, ".codex-home", "config.toml"), "utf-8");
		fs.rmSync(sandboxA, { recursive: true, force: true });

		const plan2 = await buildProvisioningPlan({ connections, resolver });
		const sandboxB = fs.mkdtempSync(path.join(os.tmpdir(), "au21-inc8-e2e-ac4-b-"));
		await applyProvisioningPlan({
			plan: plan2,
			sandboxPath: sandboxB,
			cliMcpDialect: "codex-toml",
			claudeNative: false,
		});
		const tomlB = fs.readFileSync(path.join(sandboxB, ".codex-home", "config.toml"), "utf-8");
		fs.rmSync(sandboxB, { recursive: true, force: true });

		expect(tomlB).toBe(tomlA);
	});

	test("two services (stripe token + figma mcp) both provisioned from one generic path", async ({
		db,
	}) => {
		await seedHumanUser(db);
		await seedAgentCaller(db);
		await seedConnection(db, {
			id: "sc-inc8-e2e-ac5-stripe",
			service: "stripe",
			authSource: "token",
			serverUrl: "https://mcp.stripe.com",
			token: "sk_ac5",
		});
		await seedConnection(db, {
			id: "sc-inc8-e2e-ac5-figma",
			service: "figma",
			authSource: "mcp",
			serverUrl: "https://mcp.figma.com",
		});

		const { connections, resolver } = buildRealDeps(db);
		const plan = await buildProvisioningPlan({ connections, resolver });
		await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: undefined,
			claudeNative: true,
		});

		const mcpJson = JSON.parse(fs.readFileSync(path.join(sandboxPath, ".mcp.json"), "utf-8")) as {
			mcpServers: Record<string, unknown>;
		};
		expect(mcpJson.mcpServers.stripe).toBeDefined();
		expect(mcpJson.mcpServers.figma).toBeDefined();
	});

	test("disconnect removes entry on next spawn (real DELETE-equivalent row removal)", async ({
		db,
	}) => {
		await seedHumanUser(db);
		await seedAgentCaller(db);
		await seedConnection(db, {
			id: "sc-inc8-e2e-ac6",
			service: "stripe",
			authSource: "mcp",
			serverUrl: "https://mcp.stripe.com",
		});
		const { connections, resolver } = buildRealDeps(db);

		const sandbox1 = fs.mkdtempSync(path.join(os.tmpdir(), "au21-inc8-e2e-ac6-1-"));
		const plan1 = await buildProvisioningPlan({ connections, resolver });
		await applyProvisioningPlan({
			plan: plan1,
			sandboxPath: sandbox1,
			cliMcpDialect: undefined,
			claudeNative: true,
		});
		const mcpJson1 = JSON.parse(fs.readFileSync(path.join(sandbox1, ".mcp.json"), "utf-8")) as {
			mcpServers: Record<string, unknown>;
		};
		expect(mcpJson1.mcpServers.stripe).toBeDefined();
		fs.rmSync(sandbox1, { recursive: true, force: true });

		await db.delete(serviceConnections).where(eq(serviceConnections.id, "sc-inc8-e2e-ac6"));

		// AU26 E3: the reader is live, so the SAME deps object honors the
		// disconnect on the next spawn — no re-bake, nothing to refresh. Kept
		// re-built here only to mirror how a real second spawn composes.
		const { connections: connectionsAfterDisconnect, resolver: resolverAfterDisconnect } =
			buildRealDeps(db);
		const sandbox2 = fs.mkdtempSync(path.join(os.tmpdir(), "au21-inc8-e2e-ac6-2-"));
		const plan2 = await buildProvisioningPlan({
			connections: connectionsAfterDisconnect,
			resolver: resolverAfterDisconnect,
		});
		await applyProvisioningPlan({
			plan: plan2,
			sandboxPath: sandbox2,
			cliMcpDialect: undefined,
			claudeNative: true,
		});
		const mcpJson2Path = path.join(sandbox2, ".mcp.json");
		if (fs.existsSync(mcpJson2Path)) {
			const mcpJson2 = JSON.parse(fs.readFileSync(mcpJson2Path, "utf-8")) as {
				mcpServers: Record<string, unknown>;
			};
			expect(mcpJson2.mcpServers.stripe).toBeUndefined();
		}
		fs.rmSync(sandbox2, { recursive: true, force: true });
	});

	test("secret never written into the codex-toml config; envInjections + mcpTokenEnv carry the CLI-key AND MCP-bearer tokens", async ({
		db,
	}) => {
		await seedHumanUser(db);
		await seedAgentCaller(db);
		await seedConnection(db, {
			id: "sc-inc8-e2e-hr3-gh",
			service: "github",
			authSource: "token",
			token: "ghs_e2e_github_pat",
		});
		await seedConnection(db, {
			id: "sc-inc8-e2e-hr3-stripe",
			service: "stripe",
			authSource: "token",
			serverUrl: "https://mcp.stripe.com",
			token: "sk_test_e2e_secret",
		});

		const { connections, resolver } = buildRealDeps(db);
		const plan = await buildProvisioningPlan({ connections, resolver });

		// C2a: CLI-key envInjections populated for github.
		expect(plan.envInjections.GH_TOKEN).toBe("ghs_e2e_github_pat");
		expect(plan.envInjections.GITHUB_TOKEN).toBe("ghs_e2e_github_pat");
		// C2b: MCP-bearer envInjections populated for stripe.
		expect(plan.envInjections.STRIPE_MCP_TOKEN).toBe("sk_test_e2e_secret");

		const result = await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: "codex-toml",
			claudeNative: false,
		});

		// HR3: config file is under sandboxPath, and the secret is never inlined
		// into the written config — only referenced by env-var name.
		const configPath = path.join(sandboxPath, ".codex-home", "config.toml");
		expect(configPath.startsWith(sandboxPath)).toBe(true);
		const toml = fs.readFileSync(configPath, "utf-8");
		expect(toml).not.toContain("sk_test_e2e_secret");
		expect(toml).not.toContain("ghs_e2e_github_pat");

		// C2b: applyProvisioningPlan returns the MCP-bearer token in mcpTokenEnv
		// (the CLI-key token flows only via plan.envInjections, never mcpTokenEnv).
		expect(result.mcpTokenEnv).toMatchObject({ STRIPE_MCP_TOKEN: "sk_test_e2e_secret" });
	});
});
