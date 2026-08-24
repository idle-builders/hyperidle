/**
 * AU29 §2.5.3 — the agent-orchestration first-boot face.
 *
 * Covers the real `agent_run_config` patch shapes the AU29 feasibility probe proved
 * the owning-service writer reproduces: AH2 fields written for a fresh roster agent,
 * and an upgrade over a pre-existing operator-configured row (AH2 fields overwritten,
 * `modelTierPreference` left alone).
 *
 * @lore AU44 AU20-fd: `framework/factory-defaults` dissolved. The `readSystemPromptTemplateForRole`
 * mock is removed — the template backfill loop in `applyFactoryRunConfigDefaults` was dead
 * code (the only core roster agent has role "assistant" which is not in the template map by
 * design, so the loop always skipped). The "content !== null skip" test is removed for the
 * same reason: it tested a code path that no longer exists.
 */

import { agentRunConfig, users } from "@hyperidle/db";
import { afterAll, describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { applyFactoryRunConfigDefaults } from "../factory-run-config.js";

afterAll(() => {
	// nothing to clean up
});

const AH2 = {
	harnessType: "builtin",
	modelId: "claude-sonnet-4-6",
	modelProvider: "anthropic",
	maxConcurrentSessions: 1,
} as const;

async function seedUser(
	db: Parameters<typeof applyFactoryRunConfigDefaults>[0],
	id: string,
	role: string,
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: id,
		role,
		status: "active",
		createdAt: "2026-01-01T00:00:00.000Z",
	});
}

describe("applyFactoryRunConfigDefaults — first-boot run-config state (AU29 AC 7)", () => {
	test("fresh roster agent gets AH2 runnable defaults", async ({ db }) => {
		await seedUser(db, "agent-fresh", "assistant");

		await applyFactoryRunConfigDefaults(db, [{ id: "agent-fresh", role: "assistant" }]);

		const [row] = await db
			.select()
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, "agent-fresh"));
		expect(row?.harnessType).toBe(AH2.harnessType);
		expect(row?.modelId).toBe(AH2.modelId);
		expect(row?.modelProvider).toBe(AH2.modelProvider);
		expect(row?.maxConcurrentSessions).toBe(AH2.maxConcurrentSessions);
		// @lore AU44 AU20-fd: assistant has no template; systemPrompt not written by bootstrap.
		expect(row?.systemPrompt).toBeNull();
	});

	test("upgrade over an operator-configured row: AH2 fields overwritten, modelTierPreference untouched", async ({
		db,
	}) => {
		await seedUser(db, "agent-upgrade", "assistant");
		await db.insert(agentRunConfig).values({
			agentUserId: "agent-upgrade",
			systemPrompt: "operator-set prompt",
			harnessType: "claude",
			modelTierPreference: "workhorse",
			modelId: "some-model",
			modelProvider: "openrouter",
			maxConcurrentSessions: 3,
		});

		await applyFactoryRunConfigDefaults(db, [{ id: "agent-upgrade", role: "assistant" }]);

		const [row] = await db
			.select()
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, "agent-upgrade"));
		expect(row?.harnessType).toBe(AH2.harnessType);
		expect(row?.modelId).toBe(AH2.modelId);
		expect(row?.modelProvider).toBe(AH2.modelProvider);
		expect(row?.maxConcurrentSessions).toBe(AH2.maxConcurrentSessions);
		expect(row?.modelTierPreference).toBe("workhorse");
		// @lore AU44 AU20-fd: no template backfill for assistant — pre-existing prompt preserved.
		expect(row?.systemPrompt).toBe("operator-set prompt");
	});
});
