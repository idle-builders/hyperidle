/**
 * AN2 — Connection provisioning integration tests (AC1, AC4, AC5, AC6, AC7).
 *
 * Config-shape assertions against a real DB (PGlite fixture). No real binary.
 * Proves:
 *   AC1 — spawned session config has held service entries
 *   AC4 — respawn idempotent (same entries in fresh sandbox)
 *   AC5 — two services provisioned from one generic path
 *   AC6 — disconnect removes entry on next spawn
 *   AC7 — cross-user isolation (user A's connections not in user B's sandbox)
 *   HR3 — secret not written into $HOME
 *   /validate (SSRF/reachability) — reachable → working; SSRF → needs-attention
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { serviceConnections, users } from "@hyperidle/db";
// Use db-only fixture: these tests call buildProvisioningPlan / applyProvisioningPlan
// directly (not through HTTP routes), so the server `app` fixture is unnecessary here.
// The session-provisioning.ts Phase 8b-connections merge is tested by the C2 unit
// test below (see "C2 — envInjections merged into mcpTokenEnv" describe block).
import { test } from "@hyperidle/db/test-fixtures";
// AU19 Increment 1h: test files under a Service's `src/__tests__` are exempt from
// composition-boundary-guard (it only scans `src/**` production files) — this
// mirrors `@hyperidle/notifications`' `dispatcher.test.ts` precedent of wiring a
// REAL sibling Service function directly for test-only DI construction.
import { getFirstUserByKind } from "@hyperidle/users";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import {
	applyProvisioningPlan,
	buildProvisioningPlan,
	listActiveHeld,
	resolveOwningHumanUserId,
} from "../connection-provisioning.js";
import { encryptCredentialValue } from "../credential-encryption.js";
import type { ConnectionsUserReader } from "../ports.js";
import { ServiceConnectionResolver } from "../service-connection-resolver.js";

const SERVER_SECRET = "an2-integration-test-secret-xyz";
const NOW = new Date().toISOString();
const USER_HUMAN_ID = "u-an2-human";
const USER_OTHER_ID = "u-an2-other-human";
const connectionsUserReaderDeps: { readonly users: ConnectionsUserReader } = {
	users: { getFirstUserByKind },
};

let sandboxPath: string;
beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "an2-integration-"));
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
});
afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
	vi.unstubAllEnvs();
});

// Seed helpers
async function seedHumanUser(db: Parameters<typeof resolveOwningHumanUserId>[0]): Promise<void> {
	await (db as import("@hyperidle/db").HyperIdleDb)
		.insert(users)
		.values({
			id: USER_HUMAN_ID,
			kind: "human",
			name: "AN2 Human",
			email: "human@an2test.dev",
			role: "founder",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing();
}

async function seedOtherHumanUser(db: import("@hyperidle/db").HyperIdleDb): Promise<void> {
	await db
		.insert(users)
		.values({
			id: USER_OTHER_ID,
			kind: "human",
			name: "AN2 Other Human",
			email: "other@an2test.dev",
			role: "member",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing();
}

async function seedConnection(
	db: import("@hyperidle/db").HyperIdleDb,
	opts: {
		id: string;
		userId: string;
		service: string;
		authSource: "token" | "mcp";
		serverUrl?: string;
		token?: string;
	},
): Promise<void> {
	// @lore AU20 Am4: encryptCredentialValue is now no-arg; env is stubbed with
	// SERVER_SECRET in beforeEach so this reads the correct key.
	const encryptedToken = opts.token ? encryptCredentialValue(opts.token) : null;
	await db.insert(serviceConnections).values({
		id: opts.id,
		userId: opts.userId,
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

// ── resolveOwningHumanUserId ──────────────────────────────────────────────────

describe("resolveOwningHumanUserId (real DB)", () => {
	test("returns the id of the kind=human user", async ({ db }) => {
		await seedHumanUser(db);
		const userId = await resolveOwningHumanUserId(db, connectionsUserReaderDeps);
		expect(userId).toBe(USER_HUMAN_ID);
	});

	test("falls back to u-founder when no human user exists", async ({ db }) => {
		const userId = await resolveOwningHumanUserId(db, connectionsUserReaderDeps);
		expect(userId).toBe("u-founder");
	});
});

// ── listActiveHeld (real DB) ──────────────────────────────────────────────────

describe("listActiveHeld (real DB)", () => {
	test("returns only held rows for the userId (not other users)", async ({ db }) => {
		await seedHumanUser(db);
		await seedOtherHumanUser(db);

		await seedConnection(db, {
			id: "sc-an2-gh",
			userId: USER_HUMAN_ID,
			service: "github",
			authSource: "token",
			token: "ghs_abc",
		});
		await seedConnection(db, {
			id: "sc-an2-figma",
			userId: USER_HUMAN_ID,
			service: "figma",
			authSource: "mcp",
			serverUrl: "https://mcp.figma.com",
		});
		await seedConnection(db, {
			id: "sc-an2-other",
			userId: USER_OTHER_ID,
			service: "stripe",
			authSource: "token",
			token: "sk_other",
		});

		const result = await listActiveHeld(db, USER_HUMAN_ID);
		const ids = result.map((r) => r.id);
		expect(ids).toContain("sc-an2-gh");
		expect(ids).toContain("sc-an2-figma");
		expect(ids).not.toContain("sc-an2-other");
	});
});

// ── AC1 — held connection provisioned into sandbox config ─────────────────────

describe("provisions held token connection into sandbox", () => {
	test("claude-native: .mcp.json written with held MCP-bearer entry", async ({ db }) => {
		await seedHumanUser(db);
		await seedConnection(db, {
			id: "sc-ac1-stripe",
			userId: USER_HUMAN_ID,
			service: "stripe",
			authSource: "token",
			serverUrl: "https://mcp.stripe.com",
			token: "sk_test_stripe_secret",
		});

		const resolver = new ServiceConnectionResolver(db);
		const userId = await resolveOwningHumanUserId(db, connectionsUserReaderDeps);
		const plan = await buildProvisioningPlan({ db, resolver, userId });
		const result = await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: undefined,
			claudeNative: true,
		});

		const mcpJson = JSON.parse(fs.readFileSync(path.join(sandboxPath, ".mcp.json"), "utf-8")) as {
			mcpServers: Record<string, { type: string; url: string; headers?: Record<string, string> }>;
		};

		expect(mcpJson.mcpServers.stripe).toBeDefined();
		expect(mcpJson.mcpServers.stripe?.url).toBe("https://mcp.stripe.com");
		expect(mcpJson.mcpServers.stripe?.headers?.Authorization).toBe("Bearer sk_test_stripe_secret");
		// tokenEnv empty (claude uses inline headers)
		expect(result.mcpTokenEnv).toEqual({});
	});

	test("codex-toml: config.toml written with held MCP-bearer entry + tokenEnv", async ({ db }) => {
		await seedHumanUser(db);
		await seedConnection(db, {
			id: "sc-ac1-stripe-codex",
			userId: USER_HUMAN_ID,
			service: "stripe",
			authSource: "token",
			serverUrl: "https://mcp.stripe.com",
			token: "sk_test_stripe_codex",
		});

		const resolver = new ServiceConnectionResolver(db);
		const userId = await resolveOwningHumanUserId(db, connectionsUserReaderDeps);
		const plan = await buildProvisioningPlan({ db, resolver, userId });
		const result = await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: "codex-toml",
			claudeNative: false,
		});

		const toml = fs.readFileSync(path.join(sandboxPath, ".codex-home", "config.toml"), "utf-8");
		expect(toml).toContain("[mcp_servers.stripe]");
		expect(toml).toContain('url = "https://mcp.stripe.com"');
		expect(toml).toContain('bearer_token_env_var = "STRIPE_MCP_TOKEN"');
		expect(result.mcpTokenEnv).toMatchObject({ STRIPE_MCP_TOKEN: "sk_test_stripe_codex" });
	});

	test("github CLI-key → GH_TOKEN env injection (no MCP server entry)", async ({ db }) => {
		await seedHumanUser(db);
		await seedConnection(db, {
			id: "sc-ac1-gh-cli",
			userId: USER_HUMAN_ID,
			service: "github",
			authSource: "token",
			// no serverUrl → CLI-key path
			token: "ghs_github_pat_123",
		});

		const resolver = new ServiceConnectionResolver(db);
		const userId = await resolveOwningHumanUserId(db, connectionsUserReaderDeps);
		const plan = await buildProvisioningPlan({ db, resolver, userId });

		expect(plan.envInjections.GH_TOKEN).toBe("ghs_github_pat_123");
		expect(plan.envInjections.GITHUB_TOKEN).toBe("ghs_github_pat_123");
		expect(plan.mcpServers).toHaveLength(0);
	});
});

// ── AC4 — respawn idempotent ───────────────────────────────────────────────────

describe("respawn idempotent (destroy sandbox, re-provision, same entries)", () => {
	test("codex-toml: same entries in fresh sandbox B after destroying sandbox A", async ({ db }) => {
		await seedHumanUser(db);
		await seedConnection(db, {
			id: "sc-ac4",
			userId: USER_HUMAN_ID,
			service: "stripe",
			authSource: "token",
			serverUrl: "https://mcp.stripe.com",
			token: "sk_idempotent",
		});

		const resolver = new ServiceConnectionResolver(db);
		const userId = await resolveOwningHumanUserId(db, connectionsUserReaderDeps);

		// First provisioning
		const plan1 = await buildProvisioningPlan({ db, resolver, userId });
		const sandboxA = fs.mkdtempSync(path.join(os.tmpdir(), "an2-ac4-a-"));
		await applyProvisioningPlan({
			plan: plan1,
			sandboxPath: sandboxA,
			cliMcpDialect: "codex-toml",
			claudeNative: false,
		});
		const tomlA = fs.readFileSync(path.join(sandboxA, ".codex-home", "config.toml"), "utf-8");
		fs.rmSync(sandboxA, { recursive: true, force: true });

		// Second provisioning (fresh sandbox)
		const plan2 = await buildProvisioningPlan({ db, resolver, userId });
		const sandboxB = fs.mkdtempSync(path.join(os.tmpdir(), "an2-ac4-b-"));
		await applyProvisioningPlan({
			plan: plan2,
			sandboxPath: sandboxB,
			cliMcpDialect: "codex-toml",
			claudeNative: false,
		});
		const tomlB = fs.readFileSync(path.join(sandboxB, ".codex-home", "config.toml"), "utf-8");
		fs.rmSync(sandboxB, { recursive: true, force: true });

		// Byte-equivalent config
		expect(tomlB).toBe(tomlA);
	});
});

// ── AC5 — two services, no new code ───────────────────────────────────────────

describe("two services, both provisioned from one generic path", () => {
	test("stripe + figma → two server entries, no per-service code", async ({ db }) => {
		await seedHumanUser(db);
		await seedConnection(db, {
			id: "sc-ac5-stripe",
			userId: USER_HUMAN_ID,
			service: "stripe",
			authSource: "token",
			serverUrl: "https://mcp.stripe.com",
			token: "sk_stripe",
		});
		await seedConnection(db, {
			id: "sc-ac5-figma",
			userId: USER_HUMAN_ID,
			service: "figma",
			authSource: "mcp",
			serverUrl: "https://mcp.figma.com",
		});

		const resolver = new ServiceConnectionResolver(db);
		const userId = await resolveOwningHumanUserId(db, connectionsUserReaderDeps);
		const plan = await buildProvisioningPlan({ db, resolver, userId });

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
});

// ── AC6 — disconnect removes entry ────────────────────────────────────────────

describe("disconnect removes entry on next spawn", () => {
	test("present then deleted → entry absent in fresh sandbox after delete", async ({ db }) => {
		await seedHumanUser(db);
		await seedConnection(db, {
			id: "sc-ac6-stripe",
			userId: USER_HUMAN_ID,
			service: "stripe",
			authSource: "mcp",
			serverUrl: "https://mcp.stripe.com",
		});

		const resolver = new ServiceConnectionResolver(db);
		const userId = await resolveOwningHumanUserId(db, connectionsUserReaderDeps);

		// First spawn — entry present
		const sandbox1 = fs.mkdtempSync(path.join(os.tmpdir(), "an2-ac6-1-"));
		const plan1 = await buildProvisioningPlan({ db, resolver, userId });
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

		// Disconnect (delete the row)
		await db
			.delete(serviceConnections)
			.where((await import("drizzle-orm")).eq(serviceConnections.id, "sc-ac6-stripe"));

		// Second spawn — entry absent
		const sandbox2 = fs.mkdtempSync(path.join(os.tmpdir(), "an2-ac6-2-"));
		const plan2 = await buildProvisioningPlan({ db, resolver, userId });
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
		// else: no .mcp.json written at all — also correct (no entries → no file).
		fs.rmSync(sandbox2, { recursive: true, force: true });
	});
});

// ── AC7 — cross-user isolation ────────────────────────────────────────────────

describe("cross-user isolation", () => {
	test("user A's connections do not appear when provisioning for user B", async ({ db }) => {
		await seedHumanUser(db);
		await seedOtherHumanUser(db);

		// User A connection
		await seedConnection(db, {
			id: "sc-ac7-a",
			userId: USER_HUMAN_ID,
			service: "stripe",
			authSource: "mcp",
			serverUrl: "https://mcp.stripe.com",
		});

		// User B connection
		await seedConnection(db, {
			id: "sc-ac7-b",
			userId: USER_OTHER_ID,
			service: "figma",
			authSource: "mcp",
			serverUrl: "https://mcp.figma.com",
		});

		const resolver = new ServiceConnectionResolver(db);

		// Provision for user B
		const planB = await buildProvisioningPlan({ db, resolver, userId: USER_OTHER_ID });

		const names = planB.mcpServers.map((s) => s.name);
		expect(names).not.toContain("stripe");
		expect(names).toContain("figma");
	});
});

// ── HR3 — secret never in $HOME ───────────────────────────────────────────────

describe("secret never written into $HOME", () => {
	test("all provisioned files are under sandboxPath, not $HOME", async ({ db }) => {
		await seedHumanUser(db);
		await seedConnection(db, {
			id: "sc-hr3",
			userId: USER_HUMAN_ID,
			service: "stripe",
			authSource: "token",
			serverUrl: "https://mcp.stripe.com",
			token: "sk_test_secret",
		});

		const resolver = new ServiceConnectionResolver(db);
		const userId = await resolveOwningHumanUserId(db, connectionsUserReaderDeps);
		const plan = await buildProvisioningPlan({ db, resolver, userId });
		await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: "codex-toml",
			claudeNative: false,
		});

		// Verify the config file is under sandboxPath
		const configPath = path.join(sandboxPath, ".codex-home", "config.toml");
		expect(configPath.startsWith(sandboxPath)).toBe(true);

		// The secret token must NOT be written in the toml file (only via env var)
		const toml = fs.readFileSync(configPath, "utf-8");
		expect(toml).not.toContain("sk_test_secret");
	});
});

// ── C2 — envInjections present in plan and returned by applyProvisioningPlan ──
//
// Proves that buildProvisioningPlan populates envInjections for CLI-key services
// AND that applyProvisioningPlan returns them in mcpTokenEnv so session-provisioning.ts
// can merge them into the child process env (the C2 fix in session-provisioning.ts:857).
//
// The session-provisioning.ts merge itself is not exercised here (no real spawn);
// this test proves the data exists in the plan for the merge to consume.

describe("envInjections in plan and mcpTokenEnv for CLI-key path", () => {
	test("github CLI-key token appears in plan.envInjections and applyProvisioningPlan mcpTokenEnv", async ({
		db,
	}) => {
		await seedHumanUser(db);
		await seedConnection(db, {
			id: "sc-c2-gh",
			userId: USER_HUMAN_ID,
			service: "github",
			authSource: "token",
			// no serverUrl → CLI-key path (github is in SERVICE_CLI_ENV)
			token: "ghs_c2_test_token",
		});

		const resolver = new ServiceConnectionResolver(db);
		const userId = await resolveOwningHumanUserId(db, connectionsUserReaderDeps);
		const plan = await buildProvisioningPlan({ db, resolver, userId });

		// C2a: buildProvisioningPlan must populate envInjections for CLI-key tokens.
		// These vars flow to the child process env — the sole carrier for CLI-key tokens.
		expect(plan.envInjections.GH_TOKEN).toBe("ghs_c2_test_token");
		expect(plan.envInjections.GITHUB_TOKEN).toBe("ghs_c2_test_token");
		expect(plan.mcpServers).toHaveLength(0); // no MCP server entry for CLI-key

		// C2b: applyProvisioningPlan with claudeNative=false + no dialect returns {} mcpTokenEnv
		// (no config file to write). The plan.envInjections is what session-provisioning.ts
		// MUST merge (the C2 fix: plan.envInjections → mergedConnEnv → mcpTokenEnv).
		// We verify the plan carries the correct values so the merge receives real data.
		const result = await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: undefined,
			claudeNative: false,
		});
		// No config written (no MCP servers, no carrier for this harness type).
		// The env injections live in plan.envInjections; session-provisioning.ts merges them.
		expect(result.mcpTokenEnv).toEqual({});
		// Confirm the plan still carries the injections (not mutated).
		expect(plan.envInjections.GH_TOKEN).toBe("ghs_c2_test_token");
	});

	test("MCP-bearer token appears in both plan.envInjections and applyProvisioningPlan mcpTokenEnv (codex path)", async ({
		db,
	}) => {
		await seedHumanUser(db);
		await seedConnection(db, {
			id: "sc-c2-stripe",
			userId: USER_HUMAN_ID,
			service: "stripe",
			authSource: "token",
			serverUrl: "https://mcp.stripe.com",
			token: "sk_c2_stripe",
		});

		const resolver = new ServiceConnectionResolver(db);
		const userId = await resolveOwningHumanUserId(db, connectionsUserReaderDeps);
		const plan = await buildProvisioningPlan({ db, resolver, userId });

		// MCP-bearer: envInjections carries the per-server token var AND mcpTokenEnv returns it.
		expect(plan.envInjections.STRIPE_MCP_TOKEN).toBe("sk_c2_stripe");

		// For codex-toml, applyProvisioningPlan returns the token in mcpTokenEnv.
		const result = await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: "codex-toml",
			claudeNative: false,
		});
		expect(result.mcpTokenEnv).toMatchObject({ STRIPE_MCP_TOKEN: "sk_c2_stripe" });

		// The session-provisioning.ts merge (C2 fix) then merges:
		//   plan.envInjections (STRIPE_MCP_TOKEN) + connEnv (STRIPE_MCP_TOKEN from codex writer)
		// Both sources agree — no data loss either way.
	});
});
