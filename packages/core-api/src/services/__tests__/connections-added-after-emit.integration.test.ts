/**
 * AU26 E3 — AC1(c): the staleness defect this work package exists to prove gone.
 *
 * AU21's Decision K1 baked the owning human's held-connection list onto every
 * emitted intent, because `service_connections` still lived in core-api and
 * `run-orchestration` was forbidden to read it. That bake is a SNAPSHOT: a
 * connection the user adds after an intent is emitted but before it drains was
 * simply absent from the sandbox, silently. K1 was known-throwaway when it
 * shipped; AU26 E3 deletes it and reads the record live, in-layer, at spawn.
 *
 * The order below is the whole test:
 *   1. emit a real intent through the real recorder and drain it into a real
 *      `agent_session_requests` row (the emit is genuinely over)
 *   2. THEN add the held connection
 *   3. run the spawn-time connections step the provisioner runs
 *   4. the connection is provisioned
 *
 * Against K1's bake step 4 fails: the request was frozen at step 1, before the
 * row existed. Sanity-checked exactly that way — reverting
 * `buildProvisioningPlan` to a request-carried list reds this test.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	listHeldConnectionsForProvisioning,
	ServiceConnectionResolver,
} from "@hyperidle/connections";
import { agentSessionRequests, type HyperIdleDb, serviceConnections, users } from "@hyperidle/db";
import { applyProvisioningPlan, buildProvisioningPlan } from "@hyperidle/run-orchestration";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { encryptCredentialValue } from "@hyperidle/shared/crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "../../test-fixtures.js";
import { queueDeps } from "../durable-agent-queue.js";

const NOW = "2026-08-04T00:00:00.000Z";
const SERVER_SECRET = "au26-e3-add-after-emit-secret";
const HUMAN_ID = "u-au26-e3-owner";
const AGENT_ID = "agent-au26-e3-target";
const OTHER_HUMAN_ID = "u-au26-e3-other";

let sandboxPath: string;
beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au26-e3-add-after-emit-"));
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
});
afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
	vi.unstubAllEnvs();
});

async function seedPrincipals(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values([
		{
			id: HUMAN_ID,
			kind: "human",
			name: "AU26 Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		},
		{
			id: OTHER_HUMAN_ID,
			kind: "human",
			name: "AU26 Other",
			role: "member",
			status: "active",
			createdAt: NOW,
		},
		{
			id: AGENT_ID,
			kind: "ai",
			name: "AU26 Target Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		},
	]);
}

/**
 * Emit + drain a real intent, exactly as a per-kind resolver's baked emit does.
 * Returns the real `agent_session_requests` row the drain handed off — the
 * request a spawn would later claim.
 */
async function emitAndDrain(
	db: HyperIdleDb,
	eventBus: Parameters<typeof queueDeps>[0] extends never ? never : { emit: unknown },
	idempotencyKey: string,
): Promise<{ readonly payloadJson: string | null }> {
	await enqueueWorkIntent(db, {
		kind: "assistant_turn",
		sourceKind: "thread_message",
		sourceId: `${idempotencyKey}-message`,
		idempotencyKey,
		bakedRequest: {
			defaultAgentId: AGENT_ID,
			sourceKind: "assistant",
			sourceId: `${idempotencyKey}-message`,
			streamId: `thread:${idempotencyKey}-thread`,
			userId: HUMAN_ID,
			sourceCorrelation: {
				threadId: `${idempotencyKey}-thread`,
				messageId: `${idempotencyKey}-message`,
				userId: HUMAN_ID,
				assistantAgentId: AGENT_ID,
			},
		},
	});
	await drainIntents({ ...queueDeps(db), eventBus } as ReturnType<typeof queueDeps> & {
		eventBus: unknown;
	});

	const [request] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.sourceId, `${idempotencyKey}-message`));
	if (!request) throw new Error("the drain did not hand off a request row");
	return { payloadJson: request.payloadJson };
}

/** The spawn-time connections step, wired exactly as `provisioner.ts` wires it. */
async function provisionConnections(
	db: HyperIdleDb,
): Promise<Awaited<ReturnType<typeof buildProvisioningPlan>>> {
	const plan = await buildProvisioningPlan({
		connections: { listHeldForProvisioning: () => listHeldConnectionsForProvisioning(db) },
		resolver: new ServiceConnectionResolver(db),
	});
	await applyProvisioningPlan({
		plan,
		sandboxPath,
		cliMcpDialect: undefined,
		claudeNative: true,
	});
	return plan;
}

describe("held connections are read live at spawn, never carried on the request", () => {
	test("a connection added AFTER the intent is emitted and drained is still provisioned at spawn", async ({
		db,
		eventBus,
	}) => {
		await seedPrincipals(db);

		// 1. The emit is genuinely over before the connection exists.
		const { payloadJson } = await emitAndDrain(db, eventBus, "au26-e3-add-after-emit");
		expect(await db.select().from(serviceConnections)).toEqual([]);

		// The request carries NOTHING about connections — K1's bake is gone, so
		// there is no snapshot for the spawn to go stale against.
		expect(payloadJson ?? "").not.toContain("injectedConnections");

		// 2. NOW the user adds the connection.
		await db.insert(serviceConnections).values({
			id: "sc-au26-e3-added-late",
			userId: HUMAN_ID,
			service: "stripe",
			authSource: "token",
			encryptedToken: encryptCredentialValue("sk_au26_e3_added_late"),
			serverUrl: "https://mcp.stripe.com",
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		// 3. The session spawns.
		const plan = await provisionConnections(db);

		// 4. The late-added connection is provisioned, token and all.
		expect(plan.mcpServers).toEqual([
			{ name: "stripe", url: "https://mcp.stripe.com", bearerToken: "sk_au26_e3_added_late" },
		]);
		expect(plan.envInjections).toEqual({ STRIPE_MCP_TOKEN: "sk_au26_e3_added_late" });

		const written = JSON.parse(fs.readFileSync(path.join(sandboxPath, ".mcp.json"), "utf-8")) as {
			mcpServers: Record<string, { url: string; headers?: Record<string, string> }>;
		};
		expect(written.mcpServers.stripe?.url).toBe("https://mcp.stripe.com");
		expect(written.mcpServers.stripe?.headers?.Authorization).toBe("Bearer sk_au26_e3_added_late");
	});

	test("a connection REMOVED after the intent is emitted and drained is not provisioned at spawn", async ({
		db,
		eventBus,
	}) => {
		await seedPrincipals(db);
		await db.insert(serviceConnections).values({
			id: "sc-au26-e3-removed-late",
			userId: HUMAN_ID,
			service: "stripe",
			authSource: "token",
			encryptedToken: encryptCredentialValue("sk_au26_e3_removed_late"),
			serverUrl: "https://mcp.stripe.com",
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await emitAndDrain(db, eventBus, "au26-e3-remove-after-emit");

		await db.delete(serviceConnections).where(eq(serviceConnections.id, "sc-au26-e3-removed-late"));

		const plan = await provisionConnections(db);

		expect(plan.mcpServers).toEqual([]);
		expect(plan.envInjections).toEqual({});
		expect(fs.existsSync(path.join(sandboxPath, ".mcp.json"))).toBe(false);
	});

	test("each held connection's token is resolved against its OWN owner, never a shared one", async ({
		db,
	}) => {
		await seedPrincipals(db);
		await db.insert(serviceConnections).values([
			{
				id: "sc-au26-e3-owner-github",
				userId: HUMAN_ID,
				service: "github",
				authSource: "token",
				encryptedToken: encryptCredentialValue("gh_owner_token"),
				serverUrl: null,
				health: "needs-attention",
				lastValidatedAt: null,
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: "sc-au26-e3-other-stripe",
				userId: OTHER_HUMAN_ID,
				service: "stripe",
				authSource: "token",
				encryptedToken: encryptCredentialValue("sk_other_token"),
				serverUrl: "https://mcp.stripe.com",
				health: "needs-attention",
				lastValidatedAt: null,
				createdAt: NOW,
				updatedAt: NOW,
			},
		]);

		const plan = await provisionConnections(db);

		// Each row resolved under its own userId — a resolver keyed to one
		// shared owner would have dropped the other user's row entirely.
		expect(plan.envInjections).toEqual({
			// biome-ignore lint/style/useNamingConvention: env var names are SCREAMING_SNAKE by definition
			GH_TOKEN: "gh_owner_token",
			// biome-ignore lint/style/useNamingConvention: env var names are SCREAMING_SNAKE by definition
			GITHUB_TOKEN: "gh_owner_token",
			// biome-ignore lint/style/useNamingConvention: env var names are SCREAMING_SNAKE by definition
			STRIPE_MCP_TOKEN: "sk_other_token",
		});
		expect(plan.mcpServers).toEqual([
			{ name: "stripe", url: "https://mcp.stripe.com", bearerToken: "sk_other_token" },
		]);
	});

	test("a cross-owner resolve still returns null — per-user isolation is unchanged", async ({
		db,
	}) => {
		await seedPrincipals(db);
		await db.insert(serviceConnections).values({
			id: "sc-au26-e3-isolation",
			userId: HUMAN_ID,
			service: "github",
			authSource: "token",
			encryptedToken: encryptCredentialValue("gh_isolation_token"),
			serverUrl: null,
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		const resolver = new ServiceConnectionResolver(db);
		expect(await resolver.resolve(HUMAN_ID, "sc-au26-e3-isolation")).toBe("gh_isolation_token");
		expect(await resolver.resolve(OTHER_HUMAN_ID, "sc-au26-e3-isolation")).toBeNull();
	});
});
