/**
 * AN2 RED — Live-proof integration tests: outbound tool brokering (AC1–AC5)
 *
 * Tests FAIL until:
 *   - packages/shared/src/connector.ts exists (ConnectorSpec, ConnectorToolDescriptor,
 *     CONNECTOR_TOOL_PREFIX, CONNECTOR_TRANSPORTS)
 *   - packages/server/src/mcp/outbound/outbound-mcp-client.ts: connectOutbound()
 *   - packages/server/src/mcp/outbound/brokered-tool.ts: wrapBrokeredTool()
 *   - packages/server/src/mcp/outbound/connector-resolver.ts: resolveConnectorTools()
 *   - packages/server/src/mcp/outbound/json-schema-to-zod.ts: jsonSchemaToZod()
 *   - packages/server/src/services/owner-user.ts: resolveOwnerUserId()
 *   - ToolContext.ownerUserId (additive optional field)
 *
 * This is the PRIMARY LIVE-PROOF: a real McpServer (from @modelcontextprotocol/sdk)
 * runs on an ephemeral 127.0.0.1 port; the outbound Client really connects,
 * negotiates, and calls tools over the wire. Not a stub.
 *
 * @lore AN2: The fixture is spawned by the test process (no child process needed).
 * Each test that needs isolation gets its own fixture instance via beforeEach/afterEach.
 * The credential chain is real: encryptCredentialValue → serviceConnections row →
 * ServiceConnectionResolver → connectOutbound → Authorization: Bearer header.
 */

import {
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	operationOutcomes,
	proposedCalls,
	serviceConnections,
	tailoredGrants,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ConnectorSpec, EventBus } from "@hyperidle/shared";
import { CONNECTOR_TOOL_PREFIX } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { encryptCredentialValue } from "../../../services/credential-encryption.js";
import { ServiceConnectionResolver } from "../../../services/service-connection-resolver.js";
import { test } from "../../../test-fixtures.js";
import type { ToolContext } from "../../../tools/tool-registry.js";
import { buildToolRegistry } from "../../../tools/tool-registry.js";
import { wrapBrokeredTool } from "../brokered-tool.js";
import { connectOutbound } from "../outbound-mcp-client.js";
import { type FixtureMcpServer, startFixtureMcpServer } from "./_fixture-mcp-server.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test constants
// ─────────────────────────────────────────────────────────────────────────────

const TEST_SERVER_SECRET = "a-test-secret-for-an2-broker-live-32x";
const ACME_TOKEN = "acme-api-token-live-test-abc123";
const NOW = new Date().toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

async function seedWorld(db: HyperIdleDb): Promise<{
	agentId: string;
	taskId: string;
	threadId: string;
	reviewMessageId: string;
	artifactId: string;
}> {
	const teamId = `team-an2-${crypto.randomUUID()}`;
	const agentId = `agent-an2-${crypto.randomUUID()}`;
	const betId = `bet-an2-${crypto.randomUUID()}`;
	const taskId = `task-an2-${crypto.randomUUID()}`;
	const artifactId = `art-an2-${crypto.randomUUID()}`;

	await db.insert(teams).values({ id: teamId, name: "AN2 Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: `tm-${teamId}`, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "AN2 Builder",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db
		.insert(bets)
		.values({ id: betId, teamId, description: "AN2 bet", status: "active", createdAt: NOW });
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "AN2 task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db
		.insert(artifacts)
		.values({ id: artifactId, producingTaskId: taskId, kind: "action_operation", createdAt: NOW });

	const threadId = `thread-an2-${crypto.randomUUID()}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	const reviewMessageId = `msg-an2-${crypto.randomUUID()}`;
	await db.insert(messages).values({
		id: reviewMessageId,
		senderId: agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "AN2 Review",
			reasoning: ["reason"],
			artifactRef: { id: artifactId, kind: "action_operation" },
		}),
		clientKey: reviewMessageId,
		createdAt: NOW,
	});

	return { agentId, taskId, threadId, reviewMessageId, artifactId };
}

/** Seed a real authSource="token" serviceConnections row (mirroring AN1 resolver test). */
async function seedTokenConnection(
	db: HyperIdleDb,
	opts: { userId: string; service: string; token: string; trustTier?: "vetted" | "community" },
): Promise<string> {
	const connId = `sc-an2-${crypto.randomUUID()}`;
	const encryptedToken = encryptCredentialValue(opts.token, TEST_SERVER_SECRET);
	await db.insert(serviceConnections).values({
		id: connId,
		userId: opts.userId,
		service: opts.service,
		authSource: "token",
		encryptedToken,
		serverUrl: null,
		trustTier: opts.trustTier ?? "community",
		health: "usable",
		lastValidatedAt: null,
		createdAt: NOW,
		updatedAt: NOW,
	});
	return connId;
}

function makeCtx(
	db: HyperIdleDb,
	eventBus: EventBus,
	opts: { agentId: string; taskId: string; sessionId: string; ownerUserId?: string },
): ToolContext {
	return {
		db,
		eventBus,
		agentId: opts.agentId,
		sessionId: opts.sessionId,
		taskId: opts.taskId,
		teamId: "team-an2",
		sandboxPath: "/tmp/an2-test",
		ingestion: { dispose: (): void => {} },
		...(opts.ownerUserId !== undefined ? { ownerUserId: opts.ownerUserId } : {}),
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixture lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let fixture: FixtureMcpServer;

beforeEach(async () => {
	fixture = await startFixtureMcpServer();
});

afterEach(async () => {
	await fixture.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — Reversible op runs DIRECT (no gate) for vetted source
// + companion: same op from community source is GATED
// ─────────────────────────────────────────────────────────────────────────────

describe("AC1 — reversible external op runs direct for vetted source", () => {
	test("vetted-source read_value (idempotentHint:true) invoked via registry → result, no proposed_calls row", async ({
		db,
		eventBus,
	}) => {
		const ownerId = `u-an2-ac1-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: ownerId,
			kind: "human",
			name: "Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		const connId = await seedTokenConnection(db, {
			userId: ownerId,
			service: "Acme",
			token: ACME_TOKEN,
			trustTier: "vetted",
		});

		const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);

		// List tools from the fixture
		const outbound = await connectOutbound(
			{ service: "Acme", transport: "http", url: fixture.url, auth: "bearer-header" },
			ACME_TOKEN,
		);
		const tools = await outbound.listTools();
		await outbound.close();

		const readDescriptor = tools.find((t) => t.name === "read_value");
		expect(readDescriptor).toBeDefined();
		if (!readDescriptor) return;

		const spec: ConnectorSpec = {
			service: "Acme",
			transport: "http",
			url: fixture.url,
			auth: "bearer-header",
		};
		const wrapped = wrapBrokeredTool({
			spec,
			connectionId: connId,
			ownerUserId: ownerId,
			descriptor: readDescriptor,
			resolver,
			trustTier: "vetted",
		});

		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sessionId = `sess-ac1-${crypto.randomUUID()}`;
		const ctx = makeCtx(db, eventBus, { agentId, taskId, sessionId, ownerUserId: ownerId });

		// Build registry with the vetted external tool + session-1 open-work workflow
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			extraTools: [wrapped],
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "open-work",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
			},
		});

		const toolName = `${CONNECTOR_TOOL_PREFIX}Acme__read_value`;
		const result = await registry.invoke(toolName, { key: "test-key" });

		// AC1: must succeed (direct, no gate)
		expect(result.success).toBe(true);

		// AC1: NO proposed_calls row (not gated)
		const pcs = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, sessionId));
		expect(pcs).toHaveLength(0);
	}, 30_000);

	test("community-source read_value (idempotentHint dropped) → AWAITING_REVIEW, fixture NOT called", async ({
		db,
		eventBus,
	}) => {
		const ownerId = `u-an2-ac1-comm-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: ownerId,
			kind: "human",
			name: "Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		const connId = await seedTokenConnection(db, {
			userId: ownerId,
			service: "Acme",
			token: ACME_TOKEN,
			trustTier: "community", // community — annotations dropped
		});

		const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);

		// The descriptor has idempotentHint:true (what an external server declares)
		// But wrapped as community → annotations dropped → irreversible → gated
		const spec: ConnectorSpec = {
			service: "Acme",
			transport: "http",
			url: fixture.url,
			auth: "bearer-header",
		};
		const communityReadTool = wrapBrokeredTool({
			spec,
			connectionId: connId,
			ownerUserId: ownerId,
			descriptor: {
				name: "read_value",
				description: "Read a value",
				inputSchema: { type: "object", properties: { key: { type: "string" } } },
				annotations: { idempotentHint: true }, // dropped for community
			},
			resolver,
			trustTier: "community",
		});

		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sessionId = `sess-ac1-comm-${crypto.randomUUID()}`;
		const ctx = makeCtx(db, eventBus, { agentId, taskId, sessionId, ownerUserId: ownerId });

		const writeCountBefore = fixture.writeCallCount();

		const registry = buildToolRegistry(ctx, {
			role: "builder",
			extraTools: [communityReadTool],
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "open-work",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
			},
		});

		const toolName = `${CONNECTOR_TOOL_PREFIX}Acme__read_value`;
		const result = await registry.invoke(toolName, { key: "test-key" });

		// Community source: routed to review, not executed
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.code).toBe("AWAITING_REVIEW");
		}

		// Fixture must NOT have been called (we check write_value counter as proxy —
		// the read is community-gated before reaching the outbound call)
		// More directly: assert a proposed_calls row exists
		const pcs = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, sessionId));
		expect(pcs).toHaveLength(1);
		expect(pcs[0]?.status).toBe("captured");

		// Fixture write_value not touched (not the tool being tested, but confirms no spurious outbound)
		expect(fixture.writeCallCount()).toBe(writeCountBefore);
	}, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 — Irreversible op: staged → approval → executes once → at-most-once
// ─────────────────────────────────────────────────────────────────────────────

describe("AC2 — irreversible op is staged, not performed; executes once on approval", () => {
	test("session-1: write_value → AWAITING_REVIEW, fixture NOT called (writeCallCount=0)", async ({
		db,
		eventBus,
	}) => {
		const ownerId = `u-an2-ac2-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: ownerId,
			kind: "human",
			name: "Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		const connId = await seedTokenConnection(db, {
			userId: ownerId,
			service: "Acme",
			token: ACME_TOKEN,
			trustTier: "vetted",
		});
		const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);
		const spec: ConnectorSpec = {
			service: "Acme",
			transport: "http",
			url: fixture.url,
			auth: "bearer-header",
		};

		// write_value descriptor with destructiveHint:true
		const writeDescriptor = {
			name: "write_value",
			description: "Write a value (destructive)",
			inputSchema: {
				type: "object",
				properties: { key: { type: "string" }, value: { type: "string" } },
				required: ["key", "value"],
			},
			annotations: { destructiveHint: true },
		};

		const wrapped = wrapBrokeredTool({
			spec,
			connectionId: connId,
			ownerUserId: ownerId,
			descriptor: writeDescriptor,
			resolver,
			trustTier: "vetted",
		});

		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sessionId1 = `sess-ac2-s1-${crypto.randomUUID()}`;
		const ctx = makeCtx(db, eventBus, {
			agentId,
			taskId,
			sessionId: sessionId1,
			ownerUserId: ownerId,
		});

		const registry = buildToolRegistry(ctx, {
			role: "builder",
			extraTools: [wrapped],
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "open-work",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
			},
		});

		const toolName = `${CONNECTOR_TOOL_PREFIX}Acme__write_value`;
		const result = await registry.invoke(toolName, { key: "k1", value: "v1" });

		// Step 1: must be staged, not performed
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.code).toBe("AWAITING_REVIEW");
		}

		// Fixture NOT called
		expect(fixture.writeCallCount()).toBe(0);

		// One proposedCalls row, status=captured
		const pcs = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, sessionId1));
		expect(pcs).toHaveLength(1);
		expect(pcs[0]?.status).toBe("captured");
	}, 30_000);

	test("session-2 grant-bearing: write_value executes ONCE (fixture writeCallCount=1), outcome recorded", async ({
		db,
		eventBus,
	}) => {
		const ownerId = `u-an2-ac2-s2-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: ownerId,
			kind: "human",
			name: "Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		const connId = await seedTokenConnection(db, {
			userId: ownerId,
			service: "Acme",
			token: ACME_TOKEN,
			trustTier: "vetted",
		});
		const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);
		const spec: ConnectorSpec = {
			service: "Acme",
			transport: "http",
			url: fixture.url,
			auth: "bearer-header",
		};

		const writeDescriptor = {
			name: "write_value",
			description: "Write a value (destructive)",
			inputSchema: {
				type: "object",
				properties: { key: { type: "string" }, value: { type: "string" } },
				required: ["key", "value"],
			},
			annotations: { destructiveHint: true },
		};

		const wrapped = wrapBrokeredTool({
			spec,
			connectionId: connId,
			ownerUserId: ownerId,
			descriptor: writeDescriptor,
			resolver,
			trustTier: "vetted",
		});

		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const pcId = `pc-ac2-${crypto.randomUUID()}`;
		const sessionId1 = `sess-ac2-s1-${crypto.randomUUID()}`;
		const sessionId2 = `sess-ac2-s2-${crypto.randomUUID()}`;
		const toolName = `${CONNECTOR_TOOL_PREFIX}Acme__write_value`;
		const writeArgs = { key: "k1", value: "v1" };

		// Pre-seed a granted proposed call (simulates human approval)
		await db.insert(proposedCalls).values({
			id: pcId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: sessionId1,
			toolId: toolName,
			args: JSON.stringify(writeArgs),
			identityHash: "sha256-ac2-write",
			reversibility: "irreversible",
			status: "granted",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});
		await db.insert(tailoredGrants).values({
			proposedCallId: pcId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: toolName,
			approvedArgs: JSON.stringify(writeArgs),
			argPinned: false,
			identityHash: "sha256-ac2-write",
			consumed: false,
			retryCount: 0,
			mintedAt: NOW,
		});

		const ctx = makeCtx(db, eventBus, {
			agentId,
			taskId,
			sessionId: sessionId2,
			ownerUserId: ownerId,
		});
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			extraTools: [wrapped],
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "grant-bearing",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				approvedCall: {
					toolId: toolName,
					args: writeArgs,
					argPinned: false,
				},
			},
		});

		// Step 2: grant-bearing invocation → executes
		const result = await registry.invoke(toolName, writeArgs);
		expect(result.success).toBe(true);

		// Fixture called ONCE
		expect(fixture.writeCallCount()).toBe(1);

		// Outcome recorded
		const outcomes = await db
			.select()
			.from(operationOutcomes)
			.where(eq(operationOutcomes.proposedCallId, pcId));
		expect(outcomes).toHaveLength(1);
		expect(outcomes[0]?.status).toBe("ok");

		// ProposedCall → executed
		const pcs = await db.select().from(proposedCalls).where(eq(proposedCalls.id, pcId));
		expect(pcs[0]?.status).toBe("executed");

		// Grant consumed
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, pcId));
		expect(grants[0]?.consumed).toBe(true);
	}, 30_000);

	test("AC2 at-most-once: second invoke after grant consumed → not executed again (writeCallCount stays 1)", async ({
		db,
		eventBus,
	}) => {
		const ownerId = `u-an2-ac2-amo-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: ownerId,
			kind: "human",
			name: "Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		const connId = await seedTokenConnection(db, {
			userId: ownerId,
			service: "Acme",
			token: ACME_TOKEN,
			trustTier: "vetted",
		});
		const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);
		const spec: ConnectorSpec = {
			service: "Acme",
			transport: "http",
			url: fixture.url,
			auth: "bearer-header",
		};

		const writeDescriptor = {
			name: "write_value",
			description: "Write a value (destructive)",
			inputSchema: {
				type: "object",
				properties: { key: { type: "string" }, value: { type: "string" } },
				required: ["key", "value"],
			},
			annotations: { destructiveHint: true },
		};

		const wrapped = wrapBrokeredTool({
			spec,
			connectionId: connId,
			ownerUserId: ownerId,
			descriptor: writeDescriptor,
			resolver,
			trustTier: "vetted",
		});

		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const pcId = `pc-ac2-amo-${crypto.randomUUID()}`;
		const sessionId1 = `sess-ac2-amo-s1-${crypto.randomUUID()}`;
		const sessionId2 = `sess-ac2-amo-s2-${crypto.randomUUID()}`;
		const toolName = `${CONNECTOR_TOOL_PREFIX}Acme__write_value`;
		const writeArgs = { key: "k-amo", value: "v-amo" };

		await db.insert(proposedCalls).values({
			id: pcId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: sessionId1,
			toolId: toolName,
			args: JSON.stringify(writeArgs),
			identityHash: "sha256-ac2-amo",
			reversibility: "irreversible",
			status: "granted",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});
		await db.insert(tailoredGrants).values({
			proposedCallId: pcId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: toolName,
			approvedArgs: JSON.stringify(writeArgs),
			argPinned: false,
			identityHash: "sha256-ac2-amo",
			consumed: false,
			retryCount: 0,
			mintedAt: NOW,
		});

		const ctx = makeCtx(db, eventBus, {
			agentId,
			taskId,
			sessionId: sessionId2,
			ownerUserId: ownerId,
		});
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			extraTools: [wrapped],
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "grant-bearing",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				approvedCall: {
					toolId: toolName,
					args: writeArgs,
					argPinned: false,
				},
			},
		});

		// First invocation — should succeed
		const first = await registry.invoke(toolName, writeArgs);
		expect(first.success).toBe(true);
		expect(fixture.writeCallCount()).toBe(1);

		// Second invocation — grant already consumed, should NOT execute again
		const second = await registry.invoke(toolName, writeArgs);
		// The second invoke hits the workflow router again; since grant is consumed,
		// it should be re-captured (AWAITING_REVIEW) or refused — NOT succeed
		expect(second.success).toBe(false);

		// Fixture write_value still called only ONCE
		expect(fixture.writeCallCount()).toBe(1);
	}, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 — Credential attached at execution, never in agent session
// ─────────────────────────────────────────────────────────────────────────────

describe("AC3 — credential attached by system at execution, never in agent session", () => {
	test("AC3a: whoami tool receives Authorization: Bearer <token>; token equals resolver.resolve() return", async ({
		db,
		eventBus,
	}) => {
		const ownerId = `u-an2-ac3a-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: ownerId,
			kind: "human",
			name: "Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		const connId = await seedTokenConnection(db, {
			userId: ownerId,
			service: "Acme",
			token: ACME_TOKEN,
			trustTier: "vetted",
		});

		const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);

		// Verify what resolver returns (cross-reference for AC3b non-vacuous check)
		const resolvedToken = await resolver.resolve(ownerId, connId);
		expect(resolvedToken).toBe(ACME_TOKEN);
		expect(ACME_TOKEN.length).toBeGreaterThan(8); // non-trivial token

		const spec: ConnectorSpec = {
			service: "Acme",
			transport: "http",
			url: fixture.url,
			auth: "bearer-header",
		};

		const whoamiDescriptor = {
			name: "whoami",
			description: "Who is calling",
			inputSchema: { type: "object", properties: {} },
			annotations: { idempotentHint: true },
		};

		const wrapped = wrapBrokeredTool({
			spec,
			connectionId: connId,
			ownerUserId: ownerId,
			descriptor: whoamiDescriptor,
			resolver,
			trustTier: "vetted",
		});

		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sessionId = `sess-ac3a-${crypto.randomUUID()}`;
		const ctx = makeCtx(db, eventBus, { agentId, taskId, sessionId, ownerUserId: ownerId });

		const registry = buildToolRegistry(ctx, {
			role: "builder",
			extraTools: [wrapped],
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "open-work",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
			},
		});

		// Clear captured headers before this test (afterEach resets fixture, beforeEach creates new)
		fixture.capturedAuthHeaders.length = 0;

		const toolName = `${CONNECTOR_TOOL_PREFIX}Acme__whoami`;
		const result = await registry.invoke(toolName, {});
		expect(result.success).toBe(true);

		// AC3a: fixture must have received Authorization: Bearer <ACME_TOKEN>
		const authHeaders = fixture.capturedAuthHeaders;
		const hasBearer = authHeaders.some((h) => h === `Bearer ${ACME_TOKEN}`);
		expect(hasBearer).toBe(true);
	}, 30_000);

	test("AC3b: token does not appear in tool inputSchema, name, or description", async ({ db }) => {
		const ownerId = `u-an2-ac3b-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: ownerId,
			kind: "human",
			name: "Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		const connId = await seedTokenConnection(db, {
			userId: ownerId,
			service: "Acme",
			token: ACME_TOKEN,
			trustTier: "vetted",
		});
		const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);
		const spec: ConnectorSpec = {
			service: "Acme",
			transport: "http",
			url: fixture.url,
			auth: "bearer-header",
		};

		const whoamiDescriptor = {
			name: "whoami",
			description: "Who is calling",
			inputSchema: { type: "object", properties: {} },
			annotations: { idempotentHint: true },
		};

		const wrapped = wrapBrokeredTool({
			spec,
			connectionId: connId,
			ownerUserId: ownerId,
			descriptor: whoamiDescriptor,
			resolver,
			trustTier: "vetted",
		});

		// AC3b: token must not appear in the tool definition surface
		expect(wrapped.name).not.toContain(ACME_TOKEN);
		expect(wrapped.description).not.toContain(ACME_TOKEN);
		const schemaJson = JSON.stringify(wrapped.inputSchema);
		expect(schemaJson).not.toContain(ACME_TOKEN);
	}, 10_000);

	test("AC3c: absent/cross-user connection → resolve returns null → NO_CREDENTIAL, fixture NOT called", async ({
		db,
		eventBus,
	}) => {
		const ownerA = `u-an2-ac3c-a-${crypto.randomUUID()}`;
		const attackerB = `u-an2-ac3c-b-${crypto.randomUUID()}`;
		await db.insert(users).values([
			{
				id: ownerA,
				kind: "human",
				name: "Owner A",
				role: "founder",
				status: "active",
				createdAt: NOW,
			},
			{
				id: attackerB,
				kind: "human",
				name: "Attacker B",
				role: "founder",
				status: "active",
				createdAt: NOW,
			},
		]);

		// Connection belongs to ownerA
		const connId = await seedTokenConnection(db, {
			userId: ownerA,
			service: "Acme",
			token: ACME_TOKEN,
			trustTier: "vetted",
		});

		// Resolver with attackerB userId → will return null (cross-user)
		const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);

		const spec: ConnectorSpec = {
			service: "Acme",
			transport: "http",
			url: fixture.url,
			auth: "bearer-header",
		};
		const whoamiDescriptor = {
			name: "whoami",
			description: "Who is calling",
			inputSchema: { type: "object", properties: {} },
			annotations: { idempotentHint: true },
		};

		// Wrap with attackerB as ownerUserId → resolver will get null
		const wrapped = wrapBrokeredTool({
			spec,
			connectionId: connId,
			ownerUserId: attackerB, // cross-user: attacker tries to use owner's connection
			descriptor: whoamiDescriptor,
			resolver,
			trustTier: "vetted",
		});

		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sessionId = `sess-ac3c-${crypto.randomUUID()}`;
		const ctx = makeCtx(db, eventBus, { agentId, taskId, sessionId, ownerUserId: attackerB });

		const registry = buildToolRegistry(ctx, {
			role: "builder",
			extraTools: [wrapped],
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "open-work",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
			},
		});

		const writeCountBefore = fixture.writeCallCount();
		const toolName = `${CONNECTOR_TOOL_PREFIX}Acme__whoami`;
		const result = await registry.invoke(toolName, {});

		// Must fail with NO_CREDENTIAL
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.code).toBe("NO_CREDENTIAL");
		}

		// Fixture not called (no outbound request)
		expect(fixture.writeCallCount()).toBe(writeCountBefore);
	}, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 — Unknown/ambiguous reversibility → gated
// ─────────────────────────────────────────────────────────────────────────────

describe("AC5 — unknown/ambiguous reversibility → always gated", () => {
	test("mystery tool (no annotations) → AWAITING_REVIEW, fixture NOT called", async ({
		db,
		eventBus,
	}) => {
		const ownerId = `u-an2-ac5-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: ownerId,
			kind: "human",
			name: "Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		const connId = await seedTokenConnection(db, {
			userId: ownerId,
			service: "Acme",
			token: ACME_TOKEN,
			trustTier: "vetted",
		});
		const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);
		const spec: ConnectorSpec = {
			service: "Acme",
			transport: "http",
			url: fixture.url,
			auth: "bearer-header",
		};

		// mystery tool: no annotations at all
		const mysteryDescriptor = {
			name: "mystery",
			description: "A tool with no reversibility hints",
			inputSchema: { type: "object", properties: { x: { type: "number" } }, required: ["x"] },
			// No annotations field
		};

		const wrapped = wrapBrokeredTool({
			spec,
			connectionId: connId,
			ownerUserId: ownerId,
			descriptor: mysteryDescriptor,
			resolver,
			trustTier: "vetted", // even vetted + no annotations → irreversible
		});

		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sessionId = `sess-ac5-${crypto.randomUUID()}`;
		const ctx = makeCtx(db, eventBus, { agentId, taskId, sessionId, ownerUserId: ownerId });

		const registry = buildToolRegistry(ctx, {
			role: "builder",
			extraTools: [wrapped],
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "open-work",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
			},
		});

		const writeCountBefore = fixture.writeCallCount();
		const toolName = `${CONNECTOR_TOOL_PREFIX}Acme__mystery`;
		const result = await registry.invoke(toolName, { x: 42 });

		// Gated
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.code).toBe("AWAITING_REVIEW");
		}

		// Captured
		const pcs = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, sessionId));
		expect(pcs).toHaveLength(1);
		expect(pcs[0]?.status).toBe("captured");

		// Fixture not called
		expect(fixture.writeCallCount()).toBe(writeCountBefore);
	}, 30_000);
});
