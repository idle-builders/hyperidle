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
import { encryptCredentialValue } from "@hyperidle/credential-access";
import { agentSessionRequests, type HyperIdleDb, serviceConnections, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { applyProvisioningPlan, buildProvisioningPlan } from "@hyperidle/run-orchestration";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "../../__testing__/test-fixtures.js";

const NOW = "2026-08-04T00:00:00.000Z";
const SERVER_SECRET = "au26-e3-add-after-emit-secret";

let sandboxPath: string;
beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au26-e3-add-after-emit-"));
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
});
afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
	vi.unstubAllEnvs();
});

async function seedPrincipals(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{ humanId: string; agentId: string; otherHumanId: string }> {
	const humanId = ids("u-au26-e3-owner");
	const otherHumanId = ids("u-au26-e3-other");
	const agentId = ids("agent-au26-e3-target");
	await db.insert(users).values([
		{
			id: humanId,
			kind: "human",
			name: "AU26 Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		},
		{
			id: otherHumanId,
			kind: "human",
			name: "AU26 Other",
			role: "member",
			status: "active",
			createdAt: NOW,
		},
		{
			id: agentId,
			kind: "ai",
			name: "AU26 Target Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		},
	]);
	return { humanId, agentId, otherHumanId };
}

/**
 * Emit + drain a real intent, exactly as a per-kind resolver's baked emit does.
 * Returns the real `agent_session_requests` row the drain handed off — the
 * request a spawn would later claim.
 */
async function emitAndDrain(
	db: HyperIdleDb,
	eventBus: Parameters<typeof queueDeps>[0] extends never ? never : { emit: unknown },
	ids: ScopedIds,
	agentId: string,
	humanId: string,
): Promise<{ readonly payloadJson: string | null }> {
	const messageId = ids("e2e-message");
	const threadId = ids("e2e-thread");
	await enqueueWorkIntent(db, {
		kind: "assistant_turn",
		sourceKind: "thread_message",
		sourceId: messageId,
		idempotencyKey: ids("e2e-intent"),
		bakedRequest: {
			defaultAgentId: agentId,
			sourceKind: "assistant",
			sourceId: messageId,
			streamId: `thread:${threadId}`,
			userId: humanId,
			sourceCorrelation: {
				threadId,
				messageId,
				userId: humanId,
				assistantAgentId: agentId,
			},
		},
	});
	await drainIntents({ ...queueDeps(db), eventBus } as ReturnType<typeof queueDeps> & {
		eventBus: unknown;
	});

	const [request] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.sourceId, messageId));
	if (!request) throw new Error("the drain did not hand off a request row");
	return { payloadJson: request.payloadJson };
}

/**
 * The spawn-time connections step for ONE owning human.
 *
 * This is a hand-built mirror of the port `create-server.ts` composes, not the
 * composition root itself — it exists to exercise the READ against a real DB.
 * That the production wiring is these same implementations is proved
 * separately, through the real `createServer`, by
 * `server-factory.provisioning-wiring.integration.test.ts`.
 */
async function provisionConnections(
	db: HyperIdleDb,
	ownerUserId: string,
): Promise<Awaited<ReturnType<typeof buildProvisioningPlan>>> {
	const plan = await buildProvisioningPlan({
		connections: {
			listHeldForProvisioning: () => listHeldConnectionsForProvisioning(db, ownerUserId),
		},
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
		ids,
	}) => {
		const { humanId, agentId } = await seedPrincipals(db, ids);

		// 1. The emit is genuinely over before the connection exists.
		const { payloadJson } = await emitAndDrain(db, eventBus, ids, agentId, humanId);
		expect(await db.select().from(serviceConnections)).toEqual([]);

		// The request carries NOTHING about connections — K1's bake is gone, so
		// there is no snapshot for the spawn to go stale against.
		expect(payloadJson ?? "").not.toContain("injectedConnections");

		// 2. NOW the user adds the connection.
		await db.insert(serviceConnections).values({
			id: ids("sc-au26-e3-added-late"),
			userId: humanId,
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
		const plan = await provisionConnections(db, humanId);

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
		ids,
	}) => {
		const { humanId, agentId } = await seedPrincipals(db, ids);
		await db.insert(serviceConnections).values({
			id: ids("sc-au26-e3-removed-late"),
			userId: humanId,
			service: "stripe",
			authSource: "token",
			encryptedToken: encryptCredentialValue("sk_au26_e3_removed_late"),
			serverUrl: "https://mcp.stripe.com",
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await emitAndDrain(db, eventBus, ids, agentId, humanId);

		await db.delete(serviceConnections).where(eq(serviceConnections.id, ids("sc-au26-e3-removed-late")));

		const plan = await provisionConnections(db, humanId);

		expect(plan.mcpServers).toEqual([]);
		expect(plan.envInjections).toEqual({});
		expect(fs.existsSync(path.join(sandboxPath, ".mcp.json"))).toBe(false);
	});

	test("a plan carries ONLY the owning human's held connections — another human's token never enters the sandbox", async ({
		db,
		ids,
	}) => {
		const { humanId, otherHumanId } = await seedPrincipals(db, ids);
		await db.insert(serviceConnections).values([
			{
				id: ids("sc-au26-e3-owner-github"),
				userId: humanId,
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
				id: ids("sc-au26-e3-other-stripe"),
				userId: otherHumanId,
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

		const ownerPlan = await provisionConnections(db, humanId);

		// The owner's own connection is provisioned…
		expect(ownerPlan.envInjections).toEqual({
			// biome-ignore lint/style/useNamingConvention: env var names are SCREAMING_SNAKE by definition
			GH_TOKEN: "gh_owner_token",
			// biome-ignore lint/style/useNamingConvention: env var names are SCREAMING_SNAKE by definition
			GITHUB_TOKEN: "gh_owner_token",
		});
		// …and the OTHER human's is nowhere in the plan: not as a server entry,
		// not as an env var, not as a plaintext token anywhere in the payload.
		expect(ownerPlan.mcpServers).toEqual([]);
		expect(JSON.stringify(ownerPlan)).not.toContain("sk_other_token");
		expect(JSON.stringify(ownerPlan)).not.toContain("mcp.stripe.com");

		// Symmetrically for the other human: their own row, resolved against
		// THEIR id (a plan keyed to one shared owner would decrypt to null and
		// drop this row entirely), and none of the owner's.
		const otherPlan = await provisionConnections(db, otherHumanId);
		expect(otherPlan.mcpServers).toEqual([
			{ name: "stripe", url: "https://mcp.stripe.com", bearerToken: "sk_other_token" },
		]);
		expect(otherPlan.envInjections).toEqual({
			// biome-ignore lint/style/useNamingConvention: env var names are SCREAMING_SNAKE by definition
			STRIPE_MCP_TOKEN: "sk_other_token",
		});
		expect(JSON.stringify(otherPlan)).not.toContain("gh_owner_token");
	});

	test("a cross-owner resolve still returns null — per-user isolation is unchanged", async ({
		db,
		ids,
	}) => {
		const { humanId, otherHumanId } = await seedPrincipals(db, ids);
		const scId = ids("sc-au26-e3-isolation");
		await db.insert(serviceConnections).values({
			id: scId,
			userId: humanId,
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
		expect(await resolver.resolve(humanId, scId)).toBe("gh_isolation_token");
		expect(await resolver.resolve(otherHumanId, scId)).toBeNull();
	});
});
