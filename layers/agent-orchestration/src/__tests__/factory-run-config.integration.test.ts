/**
 * AU29 §2.5.3 — the agent-orchestration first-boot face.
 *
 * RED PHASE: fails until `applyFactoryRunConfigDefaults` exists at
 * `layers/agent-orchestration/src/factory-run-config.ts` (architecture.md §2.5.3). Covers the real
 * `agent_run_config` patch shapes the AU29 feasibility probe proved the owning-service writer
 * reproduces (`.pipeline/work/AU29/probes/run-config-equivalence.ts`, `feasibility.md` §2): a fresh
 * roster agent, and an upgrade over a pre-existing operator-configured row (AH2 fields overwritten,
 * `modelTierPreference` left alone). It also covers a behavioural contract the probe does not touch
 * and today's `factory-bootstrap.ts` has no test for: the `content !== null` skip
 * (architecture.md §2.5.3 step 2) — a missing template read must preserve the agent's existing
 * `systemPrompt` rather than nulling it.
 *
 * @lore AU44 AU20-fd: `framework/factory-defaults` dissolved; template reader inlined into
 * factory-run-config.ts (can't cross layer boundary to @hyperidle/org). The "null read" test
 * uses the optional `readTemplate` parameter instead of a module mock — cleaner, no hoisting.
 */

import { agentRunConfig, users } from "@hyperidle/db";
import { afterEach, describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import {
	applyFactoryRunConfigDefaults,
	readSystemPromptTemplateForRole,
} from "../factory-run-config.js";

const AH2 = {
	harnessType: "builtin",
	modelId: "claude-sonnet-4-6",
	modelProvider: "anthropic",
	maxConcurrentSessions: 1,
} as const;

/**
 * Role that forces `readTemplate` to return null in the "missing template" test.
 * Reset after every test.
 */
let nullTemplateRole: string | null = null;

afterEach(() => {
	nullTemplateRole = null;
});

function controlledReader(role: string): string | null {
	if (role === nullTemplateRole) return null;
	return readSystemPromptTemplateForRole(role);
}

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
	test("fresh roster agent gets AH2 runnable defaults and its role's template as systemPrompt", async ({
		db,
	}) => {
		await seedUser(db, "agent-fresh-facilitator", "facilitator");

		await applyFactoryRunConfigDefaults(db, [
			{ id: "agent-fresh-facilitator", role: "facilitator" },
		]);

		const [row] = await db
			.select()
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, "agent-fresh-facilitator"));
		expect(row?.harnessType).toBe(AH2.harnessType);
		expect(row?.modelId).toBe(AH2.modelId);
		expect(row?.modelProvider).toBe(AH2.modelProvider);
		expect(row?.maxConcurrentSessions).toBe(AH2.maxConcurrentSessions);
		expect(row?.systemPrompt).toContain("You are a Facilitator");
	});

	test("existing operator-configured row is left completely untouched (first-boot-only, D5)", async ({
		db,
	}) => {
		await seedUser(db, "agent-upgrade", "facilitator");
		await db.insert(agentRunConfig).values({
			agentUserId: "agent-upgrade",
			systemPrompt: "operator-set prompt",
			harnessType: "claude",
			modelTierPreference: "workhorse",
			modelId: "some-model",
			modelProvider: "openrouter",
			maxConcurrentSessions: 3,
		});

		await applyFactoryRunConfigDefaults(db, [{ id: "agent-upgrade", role: "facilitator" }]);

		const [row] = await db
			.select()
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, "agent-upgrade"));
		// writeAgentRunConfigIfAbsent sees the existing row → skips entirely.
		expect(row?.harnessType).toBe("claude");
		expect(row?.modelId).toBe("some-model");
		expect(row?.modelProvider).toBe("openrouter");
		expect(row?.maxConcurrentSessions).toBe(3);
		expect(row?.modelTierPreference).toBe("workhorse");
		expect(row?.systemPrompt).toBe("operator-set prompt");
	});

	test("a missing template read preserves the agent's existing systemPrompt instead of nulling it", async ({
		db,
	}) => {
		nullTemplateRole = "facilitator";
		await seedUser(db, "agent-missing-template", "facilitator");
		await db.insert(agentRunConfig).values({
			agentUserId: "agent-missing-template",
			systemPrompt: "pre-existing prompt that must survive",
		});

		await applyFactoryRunConfigDefaults(
			db,
			[{ id: "agent-missing-template", role: "facilitator" }],
			controlledReader,
		);

		const [row] = await db
			.select()
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, "agent-missing-template"));
		// writeAgentRunConfigIfAbsent sees the existing row → skips entirely.
		// The null template means the merged payload still isn't written — row unchanged.
		expect(row?.systemPrompt).toBe("pre-existing prompt that must survive");
	});
});
