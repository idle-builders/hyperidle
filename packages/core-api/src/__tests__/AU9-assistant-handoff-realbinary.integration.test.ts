import { agentSessionRequests, messages, sessions, threads, users } from "@hyperidle/db";
import {
	AdapterPool,
	createHarnessAdapter,
	LocalSandboxAdapter,
} from "@hyperidle/harness-registry";
import { harnessTestResolvedModel, requireHarness } from "@hyperidle/harness-registry/test-utils";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { createServer } from "../server-factory.js";
import { describe, expect, test } from "../test-fixtures.js";

describe("[harness:builtin] assistant durable handoff", () => {
	requireHarness("builtin");

	test("real production message reaches one request, session, and assistant reply", async ({
		db,
	}) => {
		process.env.HYPERIDLE_API_KEY = "au9-real-key";
		const now = new Date().toISOString();
		await db.insert(users).values([
			{
				id: "au9-real-human",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "ast-au9-real-human",
				kind: "ai",
				name: "Assistant",
				role: "assistant",
				status: "active",
				harnessType: "builtin",
				// @lore AR7: modelId/modelProvider here are cosmetic — assistantTurnDeps.resolvedModel
				// (built from the locked HARNESS_TEST_MODELS via harnessTestResolvedModel) is what the
				// turn actually uses, bypassing resolveAgentModel/DbCredentialResolver entirely.
				modelId: "deepseek/deepseek-v4-flash",
				modelProvider: "openrouter",
				createdAt: now,
			},
		]);
		await db.insert(threads).values({
			id: "au9-real-thread",
			hostKind: "user",
			hostId: "au9-real-human",
			initiatorId: "au9-real-human",
			participants: JSON.stringify(["au9-real-human", "ast-au9-real-human"]),
			lastActiveAt: now,
			createdAt: now,
		});
		const pool = new AdapterPool();
		pool.register(
			"local-builtin",
			createHarnessAdapter({
				kind: "builtin",
				options: { maxIterations: 1, maxOutputTokens: 120 },
			}),
			{
				name: "Builtin",
				kind: "local",
				type: "builtin",
				modelProviders: ["openrouter"],
				maxConcurrent: 1,
			},
		);
		// @lore AR7: DbCredentialResolver has no seeded openrouter_api_key credential
		// row in this fixture DB, so the real per-agent resolveAgentModel path would
		// throw MissingCredentialError before ever reaching admission. The sanctioned
		// test seam (harnessTestResolvedModel) supplies the locked builtin model +
		// OPENROUTER_API_KEY directly, bypassing the DB-credential path entirely —
		// this is the same seam every other real-harness test uses, not a stub of
		// the harness itself (the adapter/model call is still 100% real).
		const assistantEventBus = new EventBus();
		const server = await createServer(0, {
			db,
			adapterPool: pool,
			workspaceAdapter: new LocalSandboxAdapter(),
			assistantTurnDeps: {
				db,
				eventBus: assistantEventBus,
				adapterPool: pool,
				resolvedModel: harnessTestResolvedModel("builtin"),
			},
		});
		try {
			const address = server.httpServer.address();
			if (!address || typeof address === "string")
				throw new Error("Test server has no TCP address");
			const response = await fetch(
				`http://127.0.0.1:${address.port}/api/threads/au9-real-thread/messages`,
				{
					method: "POST",
					headers: { "X-API-Key": "au9-real-key", "Content-Type": "application/json" },
					body: JSON.stringify({
						type: "plain",
						payload: { text: "Reply with exactly: durable handoff works" },
						clientKey: "au9-real-message",
					}),
				},
			);
			expect(response.status).toBe(201);
			await expect
				.poll(
					async () =>
						(await db.select().from(messages).where(eq(messages.senderId, "ast-au9-real-human")))
							.length,
					{ timeout: 120_000 },
				)
				.toBe(1);
			expect(await db.select().from(agentSessionRequests)).toHaveLength(1);
			expect(await db.select().from(sessions)).toHaveLength(1);
		} finally {
			await server.dispose();
			delete process.env.HYPERIDLE_API_KEY;
		}
	}, 130_000);
});
