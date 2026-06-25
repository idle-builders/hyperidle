/**
 * AN2 RED — Second service by configuration (AC4: stdio transport)
 *
 * Tests FAIL until:
 *   - packages/server/src/mcp/outbound/outbound-mcp-client.ts supports StdioClientTransport
 *   - ConnectorSpec.transport="stdio" + auth="env" is wired in connectOutbound
 *   - wrapBrokeredTool works the same for stdio-backed tools as http-backed
 *
 * AC4: The mechanism works for more than one service — proven end-to-end against
 *      at least one real external service, with a SECOND reachable by configuration
 *      rather than new bespoke code. The only delta between Acme (http) and Beta
 *      (stdio) is the ConnectorSpec — the broker/wrapper code is unchanged.
 *
 * This test spawns the fixture stdio server (_fixture-stdio-server.mjs) as a
 * child process via StdioClientTransport. The credential is injected as env var
 * BETA_API_TOKEN (ConnectorSpec.auth="env", envVar="BETA_API_TOKEN").
 *
 * @lore AN2: stdio attach is at child-process spawn (connection lifetime), not
 * per-request. The get_token tool echoes process.env.BETA_API_TOKEN to prove
 * the credential reached the server process. This is the AC3a proof for stdio.
 */

import * as path from "node:path";
import {
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	proposedCalls,
	serviceConnections,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ConnectorSpec, EventBus } from "@hyperidle/shared";
import { CONNECTOR_TOOL_PREFIX } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { encryptCredentialValue } from "../../../services/credential-encryption.js";
import { ServiceConnectionResolver } from "../../../services/service-connection-resolver.js";
import { test } from "../../../test-fixtures.js";
import type { ToolContext } from "../../../tools/tool-registry.js";
import { buildToolRegistry } from "../../../tools/tool-registry.js";
import { wrapBrokeredTool } from "../brokered-tool.js";
import { connectOutbound } from "../outbound-mcp-client.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TEST_SERVER_SECRET = "a-test-secret-for-an2-second-svc-32x";
const BETA_TOKEN = "beta-api-token-for-ac4-test-xyz789";
const NOW = new Date().toISOString();

// Path to the stdio fixture script
const STDIO_FIXTURE_PATH = path.resolve(import.meta.dirname, "_fixture-stdio-server.mjs");

// ConnectorSpec for the Beta service (stdio transport)
const BETA_SPEC: ConnectorSpec = {
	service: "Beta",
	transport: "stdio",
	command: "node",
	args: [STDIO_FIXTURE_PATH],
	auth: "env",
	envVar: "BETA_API_TOKEN",
};

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
	const teamId = `team-an2-beta-${crypto.randomUUID()}`;
	const agentId = `agent-an2-beta-${crypto.randomUUID()}`;
	const betId = `bet-an2-beta-${crypto.randomUUID()}`;
	const taskId = `task-an2-beta-${crypto.randomUUID()}`;
	const artifactId = `art-an2-beta-${crypto.randomUUID()}`;

	await db.insert(teams).values({ id: teamId, name: "Beta Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: `tm-${teamId}`, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Beta Builder",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db
		.insert(bets)
		.values({ id: betId, teamId, description: "Beta bet", status: "active", createdAt: NOW });
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "Beta task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db
		.insert(artifacts)
		.values({ id: artifactId, producingTaskId: taskId, kind: "action_operation", createdAt: NOW });

	const threadId = `thread-an2-beta-${crypto.randomUUID()}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	const reviewMessageId = `msg-an2-beta-${crypto.randomUUID()}`;
	await db.insert(messages).values({
		id: reviewMessageId,
		senderId: agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "Beta Review",
			reasoning: ["reason"],
			artifactRef: { id: artifactId, kind: "action_operation" },
		}),
		clientKey: reviewMessageId,
		createdAt: NOW,
	});

	return { agentId, taskId, threadId, reviewMessageId, artifactId };
}

async function seedBetaConnection(db: HyperIdleDb, userId: string): Promise<string> {
	const connId = `sc-beta-${crypto.randomUUID()}`;
	const encryptedToken = encryptCredentialValue(BETA_TOKEN, TEST_SERVER_SECRET);
	await db.insert(serviceConnections).values({
		id: connId,
		userId,
		service: "Beta",
		authSource: "token",
		encryptedToken,
		serverUrl: null,
		trustTier: "vetted",
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
		teamId: "team-an2-beta",
		sandboxPath: "/tmp/an2-beta-test",
		ingestion: { dispose: (): void => {} },
		...(opts.ownerUserId !== undefined ? { ownerUserId: opts.ownerUserId } : {}),
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// AC4 — Second service (Beta, stdio) reachable by configuration, not bespoke code
// ─────────────────────────────────────────────────────────────────────────────

describe("AC4 — second service (Beta/stdio) reachable by ConnectorSpec alone", () => {
	test("AC4: connectOutbound with stdio spec lists Beta tools (same broker code as http)", async () => {
		// Connect to the stdio fixture using the same connectOutbound function
		const outbound = await connectOutbound(BETA_SPEC, BETA_TOKEN);

		try {
			const tools = await outbound.listTools();
			const names = tools.map((t) => t.name);

			// Must list the tools the fixture exposes
			expect(names).toContain("list_items");
			expect(names).toContain("create_item");
			expect(names).toContain("get_token");
		} finally {
			await outbound.close();
		}
	}, 30_000);

	test("AC4: list_items (idempotentHint:true, vetted) runs direct via wrapBrokeredTool — no gate", async ({
		db,
		eventBus,
	}) => {
		const ownerId = `u-an2-ac4-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: ownerId,
			kind: "human",
			name: "Beta Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		const connId = await seedBetaConnection(db, ownerId);
		const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);

		const listDescriptor = {
			name: "list_items",
			description: "List items (idempotent)",
			inputSchema: { type: "object", properties: { filter: { type: "string" } } },
			annotations: { idempotentHint: true },
		};

		const wrapped = wrapBrokeredTool({
			spec: BETA_SPEC,
			connectionId: connId,
			ownerUserId: ownerId,
			descriptor: listDescriptor,
			resolver,
			trustTier: "vetted",
		});

		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sessionId = `sess-ac4-${crypto.randomUUID()}`;
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

		const toolName = `${CONNECTOR_TOOL_PREFIX}Beta__list_items`;
		const result = await registry.invoke(toolName, {});

		// AC4: runs direct, no gate
		expect(result.success).toBe(true);

		// No proposed_calls
		const pcs = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, sessionId));
		expect(pcs).toHaveLength(0);
	}, 30_000);

	test("AC4 credential attach (stdio): get_token echoes BETA_API_TOKEN in env", async ({
		db,
		eventBus,
	}) => {
		const ownerId = `u-an2-ac4-cred-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: ownerId,
			kind: "human",
			name: "Beta Owner 2",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		const connId = await seedBetaConnection(db, ownerId);
		const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);

		const getTokenDescriptor = {
			name: "get_token",
			description: "Return injected token",
			inputSchema: { type: "object", properties: {} },
			annotations: { idempotentHint: true },
		};

		const wrapped = wrapBrokeredTool({
			spec: BETA_SPEC,
			connectionId: connId,
			ownerUserId: ownerId,
			descriptor: getTokenDescriptor,
			resolver,
			trustTier: "vetted",
		});

		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sessionId = `sess-ac4-cred-${crypto.randomUUID()}`;
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

		const toolName = `${CONNECTOR_TOOL_PREFIX}Beta__get_token`;
		const result = await registry.invoke(toolName, {});

		expect(result.success).toBe(true);
		if (result.success) {
			// The fixture returns "token:<value>" — must contain the real token
			const content = typeof result.data === "string" ? result.data : JSON.stringify(result.data);
			expect(content).toContain(BETA_TOKEN);
		}
	}, 30_000);

	test("AC4: same wrapBrokeredTool function used for both Acme (http) and Beta (stdio) — only ConnectorSpec differs", async ({
		db,
	}) => {
		// This is a structural test: prove wrapBrokeredTool is the same function for both.
		// Both produce a RegisteredTool with the same shape; only spec.transport differs.
		const ownerId = `u-an2-ac4-same-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: ownerId,
			kind: "human",
			name: "Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		const connIdBeta = await seedBetaConnection(db, ownerId);
		const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);

		const descriptor = {
			name: "list_items",
			description: "List items",
			inputSchema: { type: "object", properties: {} },
			annotations: { idempotentHint: true },
		};

		// Beta (stdio)
		const betaTool = wrapBrokeredTool({
			spec: BETA_SPEC,
			connectionId: connIdBeta,
			ownerUserId: ownerId,
			descriptor,
			resolver,
			trustTier: "vetted",
		});

		// Acme (http) — same function, different spec
		const acmeSpec: ConnectorSpec = {
			service: "Acme",
			transport: "http",
			url: "http://127.0.0.1:19999/mcp",
			auth: "bearer-header",
		};

		// Seed Acme connection
		const encryptedToken = encryptCredentialValue("acme-tok", TEST_SERVER_SECRET);
		const acmeConnId = `sc-acme-same-${crypto.randomUUID()}`;
		await db.insert(serviceConnections).values({
			id: acmeConnId,
			userId: ownerId,
			service: "Acme",
			authSource: "token",
			encryptedToken,
			serverUrl: null,
			trustTier: "vetted",
			health: "usable",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		const acmeTool = wrapBrokeredTool({
			spec: acmeSpec,
			connectionId: acmeConnId,
			ownerUserId: ownerId,
			descriptor: { ...descriptor, name: "list_items" }, // same tool name
			resolver,
			trustTier: "vetted",
		});

		// Both tools have the same structure — namespaced differently
		expect(betaTool.name).toBe(`${CONNECTOR_TOOL_PREFIX}Beta__list_items`);
		expect(acmeTool.name).toBe(`${CONNECTOR_TOOL_PREFIX}Acme__list_items`);

		// Both are reversible (vetted + idempotentHint:true)
		const { classifyReversibility } = await import("../../../tools/tool-registry.js");
		expect(classifyReversibility(betaTool.name, betaTool)).toBe("reversible");
		expect(classifyReversibility(acmeTool.name, acmeTool)).toBe("reversible");
	}, 10_000);
});
