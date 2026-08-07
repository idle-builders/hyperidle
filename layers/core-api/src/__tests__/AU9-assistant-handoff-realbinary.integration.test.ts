import { SESSION_NOT_RETURNED_NOTICE_TEXT } from "@hyperidle/conversation";
import {
	agentRunConfig,
	agentSessionRequests,
	messages,
	serverCredentials,
	sessions,
	threads,
	users,
} from "@hyperidle/db";
import {
	AdapterPool,
	createHarnessAdapter,
	createSandboxAdapter,
} from "@hyperidle/harness-registry";
import { requireHarness } from "@hyperidle/harness-registry/test-utils";
import { createServer } from "@hyperidle/remote-server/create-server";
import { encryptCredentialValue } from "@hyperidle/shared/crypto";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

/**
 * AU27 Increment 6 rewrite. Pre-AU27 this test bypassed model resolution
 * entirely via `assistantTurnDeps.resolvedModel` (the `dispatch` package's
 * own bespoke execution entry, now deleted). The assistant flows through the
 * SAME durable poller as every other kind (Decision 4) — model resolution
 * goes through the real `DbCredentialResolver`/`resolveModel({kind:"agent"})`
 * path, so this test seeds a real `openrouter_api_key` credential (the
 * production path, same shape `credential-resolver.integration.test.ts`
 * uses) instead of injecting a bypass.
 */
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
				createdAt: now,
			},
		]);
		// @lore AU26 G1: the run config lives in `agent_run_config` now — an
		// agent-orchestration-owned table the drain reads LIVE, not a `users`
		// column core baked at emit.
		// @lore AR7 x AU27 Increment 6: modelId/modelProvider are LOAD-BEARING
		// here, not cosmetic. AU27 deleted the `assistantTurnDeps.resolvedModel`
		// bypass, so the locked builtin test model is resolved for real through
		// the per-agent `resolveModel({kind:"agent"})` +
		// `DbCredentialResolver` path (see the seeded `openrouter_api_key`
		// below).
		await db.insert(agentRunConfig).values({
			agentUserId: "ast-au9-real-human",
			harnessType: "builtin",
			modelId: "deepseek/deepseek-v4-flash",
			modelProvider: "openrouter",
		});
		await db.insert(threads).values({
			id: "au9-real-thread",
			hostKind: "user",
			hostId: "au9-real-human",
			initiatorId: "au9-real-human",
			participants: JSON.stringify(["au9-real-human", "ast-au9-real-human"]),
			lastActiveAt: now,
			createdAt: now,
		});
		// AU27 Increment 6: seed the REAL openrouter_api_key credential
		// (encrypted with HYPERIDLE_API_KEY, the same root secret
		// DbCredentialResolver reads) so `makeResolveModel`'s
		// `resolveModel({kind:"agent", modelProvider:"openrouter", ...})` call
		// resolves through the production DbCredentialResolver path — no
		// per-test model-resolution bypass anymore.
		await db.insert(serverCredentials).values({
			name: "openrouter_api_key",
			encryptedValue: encryptCredentialValue(process.env.OPENROUTER_API_KEY as string),
			validationState: "present_untested",
			updatedAt: now,
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
		const server = await createServer(0, {
			db,
			adapterPool: pool,
			workspaceAdapter: createSandboxAdapter("local"),
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
			// AU27 Increment 6: the assistant now flows through the SAME durable
			// poller as every other kind — no second execution entry (AC-5).
			expect(await db.select().from(agentSessionRequests)).toHaveLength(1);
			expect(await db.select().from(sessions)).toHaveLength(1);

			// W2 fix (review): a message merely EXISTING from the assistant is not
			// proof of a real reply — Increment 5's never-silent notice ("I
			// couldn't finish that turn...") is ALSO authored as `event.agentId`
			// (the assistant), so a turn that never called `reply`, exhausted the
			// force budget, and got caught by the never-silent net would satisfy
			// the row-count assertion above. Assert the actual reply TEXT the
			// prompt asked for, and explicitly rule out the notice — same fix
			// `assistant-reply-live-harness.integration.test.ts` already applies.
			const [assistantReply] = await db
				.select()
				.from(messages)
				.where(eq(messages.senderId, "ast-au9-real-human"));
			const payload = JSON.parse(assistantReply?.payload ?? "{}") as { text?: string };
			expect(
				payload.text,
				`assistant reply had no text payload: ${JSON.stringify(assistantReply)}`,
			).toBeDefined();
			expect(
				payload.text,
				"assistant reply was the never-silent notice, not a real reply — the agent never called reply()",
			).not.toBe(SESSION_NOT_RETURNED_NOTICE_TEXT);
			expect(
				payload.text,
				`assistant reply did not contain the required text: ${payload.text}`,
			).toContain("durable handoff works");
		} finally {
			await server.dispose();
			delete process.env.HYPERIDLE_API_KEY;
		}
	}, 130_000);
});
