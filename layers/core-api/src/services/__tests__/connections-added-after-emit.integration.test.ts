/**
 * The owning human's held-connection list is read live, in-layer, at spawn —
 * not baked onto the emitted intent as a snapshot. A connection the user
 * adds after an intent is emitted but before it drains must still be
 * provisioned.
 *
 * The order below is the whole test:
 *   1. emit a real intent through the real recorder and drain it into a real
 *      `agent_session_requests` row (the emit is genuinely over)
 *   2. THEN add the held connection
 *   3. run the spawn-time connections step the provisioner runs
 *   4. the connection is provisioned
 *
 * A request-carried (baked) list would fail step 4: the request was frozen at
 * step 1, before the row existed.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	decryptCredentialValue,
	encryptCredentialValue,
	listConnections,
	resolveHeldToken,
} from "@hyperidle/connections";
import { agentSessionRequests, type HyperIdleDb, serviceConnections, users } from "@hyperidle/db";
import { HELD_AUTH_SOURCES, type HeldAuthSource } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
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
const SERVER_SECRET = "add-after-emit-secret";
const HUMAN_ID = "u-owner";
const AGENT_ID = "agent-target";
const OTHER_HUMAN_ID = "u-other";

let sandboxPath: string;
beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "add-after-emit-"));
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
			name: "Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		},
		{
			id: OTHER_HUMAN_ID,
			kind: "human",
			name: "Other",
			role: "member",
			status: "active",
			createdAt: NOW,
		},
		{
			id: AGENT_ID,
			kind: "ai",
			name: "Target Agent",
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
	eventBus: EventBus,
	idempotencyKey: string,
): Promise<{ readonly payloadJson: string | null }> {
	await enqueueWorkIntent(db, {
		kind: "thread_turn",
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
				agentId: AGENT_ID,
			},
		},
	});
	await drainIntents({ ...queueDeps(db), eventBus });

	const [request] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.sourceId, `${idempotencyKey}-message`));
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
		agentId: "agent",
		connections: {
			listHeldForProvisioning: () =>
				listConnections(db, { userId: ownerUserId }).then((rows) =>
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
		const { payloadJson } = await emitAndDrain(db, eventBus, "add-after-emit");
		expect(await db.select().from(serviceConnections)).toEqual([]);

		// The request carries NOTHING about connections — nothing is baked, so
		// there is no snapshot for the spawn to go stale against.
		expect(payloadJson ?? "").not.toContain("injectedConnections");

		// 2. NOW the user adds the connection.
		await db.insert(serviceConnections).values({
			id: "sc-added-late",
			userId: HUMAN_ID,
			service: "stripe",
			authSource: "token",
			encryptedToken: encryptCredentialValue("sk_added_late"),
			serverUrl: "https://mcp.stripe.com",
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		// 3. The session spawns.
		const plan = await provisionConnections(db, HUMAN_ID);

		// 4. The late-added connection is provisioned, token and all.
		expect(plan.mcpServers).toEqual([
			{ name: "stripe", url: "https://mcp.stripe.com", bearerToken: "sk_added_late" },
		]);
		expect(plan.envInjections).toEqual({ STRIPE_MCP_TOKEN: "sk_added_late" });

		const written = JSON.parse(fs.readFileSync(path.join(sandboxPath, ".mcp.json"), "utf-8")) as {
			mcpServers: Record<string, { url: string; headers?: Record<string, string> }>;
		};
		expect(written.mcpServers.stripe?.url).toBe("https://mcp.stripe.com");
		expect(written.mcpServers.stripe?.headers?.Authorization).toBe("Bearer sk_added_late");
	});

	test("a connection REMOVED after the intent is emitted and drained is not provisioned at spawn", async ({
		db,
		eventBus,
	}) => {
		await seedPrincipals(db);
		await db.insert(serviceConnections).values({
			id: "sc-removed-late",
			userId: HUMAN_ID,
			service: "stripe",
			authSource: "token",
			encryptedToken: encryptCredentialValue("sk_removed_late"),
			serverUrl: "https://mcp.stripe.com",
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await emitAndDrain(db, eventBus, "remove-after-emit");

		await db.delete(serviceConnections).where(eq(serviceConnections.id, "sc-removed-late"));

		const plan = await provisionConnections(db, HUMAN_ID);

		expect(plan.mcpServers).toEqual([]);
		expect(plan.envInjections).toEqual({});
		expect(fs.existsSync(path.join(sandboxPath, ".mcp.json"))).toBe(false);
	});

	test("a plan carries ONLY the owning human's held connections — another human's token never enters the sandbox", async ({
		db,
	}) => {
		await seedPrincipals(db);
		await db.insert(serviceConnections).values([
			{
				id: "sc-owner-github",
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
				id: "sc-other-stripe",
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

		const ownerPlan = await provisionConnections(db, HUMAN_ID);

		// The owner's own connection is provisioned…
		expect(ownerPlan.envInjections).toEqual({
			GH_TOKEN: "gh_owner_token",
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
		const otherPlan = await provisionConnections(db, OTHER_HUMAN_ID);
		expect(otherPlan.mcpServers).toEqual([
			{ name: "stripe", url: "https://mcp.stripe.com", bearerToken: "sk_other_token" },
		]);
		expect(otherPlan.envInjections).toEqual({
			STRIPE_MCP_TOKEN: "sk_other_token",
		});
		expect(JSON.stringify(otherPlan)).not.toContain("gh_owner_token");
	});

	test("a cross-owner resolve still returns null — per-user isolation is unchanged", async ({
		db,
	}) => {
		await seedPrincipals(db);
		await db.insert(serviceConnections).values({
			id: "sc-isolation",
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

		expect(await resolveHeldToken(db, HUMAN_ID, "sc-isolation", decryptCredentialValue)).toBe(
			"gh_isolation_token",
		);
		expect(
			await resolveHeldToken(db, OTHER_HUMAN_ID, "sc-isolation", decryptCredentialValue),
		).toBeNull();
	});
});
